import assert from "node:assert/strict";
import { test } from "node:test";

import { createSessionTracker, type LiveSession } from "./session";
import type { LiveBlock, LiveHello, LiveStatus } from "./types";

function block(height: number | string, txCount: number, observedAt: number | null): LiveBlock {
  return { height: String(height), txCount, eventCount: txCount, hogMoved: "0", observedAt, sampleTxHash: null };
}

function status(indexerHeight: string | null, state: LiveStatus["state"] = "live"): LiveStatus {
  return { state, indexerHeight, settledHeight: null, at: 1_000 };
}

function hello(blocks: LiveBlock[], liveStatus = status("100")): LiveHello {
  return { type: "hello", rpcUrl: "http://localhost:9545", contracts: [], lagBlocks: 3, blocks, status: liveStatus };
}

function empty(): LiveSession {
  return { txCount: 0, blockCount: 0 };
}

test("running hub history is skipped and subsequent timed heights count once", () => {
  const tracker = createSessionTracker();
  const initial = empty();
  let session = tracker.onHello(hello([block(98, 90, null), block(99, 80, 500)]), initial);
  assert.equal(session, initial);
  tracker.onStatus(status("100"));
  session = tracker.onBlock(block(99, 80, 500), session);
  session = tracker.onBlock(block(100, 7, 1_000), session);
  session = tracker.onBlock(block(100, 7, 1_000), session);
  session = tracker.onBlock(block(101, 11, 2_000), session);
  assert.deepEqual(session, { txCount: 18, blockCount: 2 });
  assert.deepEqual(initial, empty());
});

test("reconnect snapshots and events count new untimed heights above the original baseline", () => {
  const tracker = createSessionTracker();
  let session = tracker.onHello(hello([block(98, 90, null)]), empty());
  tracker.onStatus(status("100"));
  session = tracker.onBlock(block(100, 2, 1_000), session);
  session = tracker.onBlock(block(101, 3, 2_000), session);
  session = tracker.onHello(hello([
    block(98, 90, null), block(100, 2, null), block(101, 3, null),
    block(102, 5, null), block(103, 7, null), block(103, 7, null),
  ], status("110")), session);
  session = tracker.onBlock(block(103, 7, null), session);
  session = tracker.onBlock(block(104, 11, null), session);
  tracker.onStatus(status("110")); // Reconnect must not advance the baseline.
  session = tracker.onBlock(block(105, 13, null), session);
  session = tracker.onBlock(block(106, 17, 3_000), session);
  session = tracker.onBlock(block(104, 11, 3_000), session);
  assert.deepEqual(session, { txCount: 58, blockCount: 7 });
});

test("idle hub backfill before status and catch-up at or below the baseline remain history", () => {
  const tracker = createSessionTracker();
  let session = tracker.onHello(hello([block(10, 100, null)], status("12")), empty());
  session = tracker.onBlock(block(50, 200, null), session);
  session = tracker.onBlock(block(90, 300, null), session);
  tracker.onStatus(status("100"));
  session = tracker.onBlock(block(99, 400, null), session);
  session = tracker.onBlock(block(100, 500, null), session);
  session = tracker.onBlock(block(50, 200, 1_000), session);
  assert.deepEqual(session, empty());
  session = tracker.onBlock(block(101, 9, 2_000), session);
  assert.deepEqual(session, { txCount: 9, blockCount: 1 });
});

test("hello status, degraded status and live status without a height do not establish a baseline", () => {
  const tracker = createSessionTracker();
  let session = tracker.onHello(hello([], status("1")), empty());
  session = tracker.onBlock(block(2, 100, null), session);
  tracker.onStatus(status("3", "degraded"));
  session = tracker.onBlock(block(4, 200, null), session);
  tracker.onStatus(status(null));
  session = tracker.onBlock(block(5, 300, null), session);
  assert.deepEqual(session, empty());
  tracker.onStatus(status("6"));
  session = tracker.onBlock(block(7, 8, null), session);
  assert.deepEqual(session, { txCount: 8, blockCount: 1 });
});

test("height comparisons retain precision above Number.MAX_SAFE_INTEGER", () => {
  const tracker = createSessionTracker();
  tracker.onHello(hello([]), empty());
  tracker.onStatus(status("9007199254740992"));
  let session = tracker.onBlock(block("9007199254740991", 100, null), empty());
  session = tracker.onBlock(block("9007199254740992", 200, null), session);
  session = tracker.onBlock(block("9007199254740993", 3, null), session);
  assert.deepEqual(session, { txCount: 3, blockCount: 1 });
});

test("seen heights retain the existing bounded trimming behaviour", () => {
  const tracker = createSessionTracker();
  let session = tracker.onHello(hello([]), empty());
  for (let height = 0; height <= 5_000; height += 1) {
    session = tracker.onBlock(block(height, 1, 1_000), session);
  }
  session = tracker.onBlock(block(1_000, 10, 1_000), session);
  assert.deepEqual(session, { txCount: 5_001, blockCount: 5_001 });
  session = tracker.onBlock(block(0, 2, 1_000), session);
  assert.deepEqual(session, { txCount: 5_003, blockCount: 5_002 });
});
