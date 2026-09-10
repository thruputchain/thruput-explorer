import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { addressFromHex, hashFromHex, toHex0x, type EventPage, type EventQuery } from "@groundhogchain/client";

import { NATIVE_HOG_ADDRESS } from "../client";
import { transferEvent } from "../test-fixtures";
import { MAX_LIVE_CONTRACTS, parseLiveConfig } from "./config";
import { BACKFILL_BLOCKS, CATCH_UP_MS, IDLE_STOP_MS, LiveHub, POLL_MS, buildFilters, nativeHogAmount } from "./hub";
import { formatSseMessage } from "./sse";
import type { LiveMessage } from "./types";

test("live config defaults to native HOG and validates overrides", () => {
  assert.deepEqual(parseLiveConfig({}), { contracts: [NATIVE_HOG_ADDRESS], lagBlocks: 3 });

  const other = `0x${"AB".repeat(32)}`;
  assert.deepEqual(parseLiveConfig({ LIVE_CONTRACT_ADDRESSES: ` ${other}, ${NATIVE_HOG_ADDRESS} ${other}\n`, LIVE_LAG_BLOCKS: "5" }), {
    contracts: [other.toLowerCase(), NATIVE_HOG_ADDRESS],
    lagBlocks: 5,
  });

  assert.throws(() => parseLiveConfig({ LIVE_CONTRACT_ADDRESSES: "0x1234" }), /invalid address: 0x1234/);
  assert.throws(() => parseLiveConfig({ LIVE_LAG_BLOCKS: "0" }), /LIVE_LAG_BLOCKS/);
  assert.throws(() => parseLiveConfig({ LIVE_LAG_BLOCKS: "three" }), /LIVE_LAG_BLOCKS/);
  const tooMany = Array.from({ length: MAX_LIVE_CONTRACTS + 1 }, (_, index) => `0x${index.toString(16).padStart(64, "0")}`).join(",");
  assert.throws(() => parseLiveConfig({ LIVE_CONTRACT_ADDRESSES: tooMany }), /at most 25/);
});

test("filters chunk addresses to the gateway's per-filter limit", () => {
  const contracts = Array.from({ length: 7 }, (_, index) => `0x${(index + 1).toString(16).padStart(64, "0")}`);
  const filters = buildFilters(contracts);
  assert.deepEqual(filters.map((filter) => filter.contractAddresses.map(toHex0x)), [contracts.slice(0, 5), contracts.slice(5)]);
});

test("HOG amounts come only from decodable native transfers", () => {
  const identified = (contractAddress: string, data?: Uint8Array) => ({
    txHash: hashFromHex(`0x${"ab".repeat(32)}`),
    blockHeight: 1n,
    sequenceNumber: 0,
    event: { ...transferEvent({ contractAddress, amount: 42n }), ...(data ? { data } : {}) },
  });
  assert.equal(nativeHogAmount(identified(NATIVE_HOG_ADDRESS)), 42n);
  assert.equal(nativeHogAmount(identified(toHex0x(addressFromHex(`0x${"cc".repeat(32)}`)))), undefined);
  assert.equal(nativeHogAmount(identified(NATIVE_HOG_ADDRESS, new Uint8Array())), undefined);
});

test("SSE frames carry one JSON data line per event", () => {
  assert.equal(formatSseMessage("block", { type: "block", text: "multi\nline" }), 'event: block\ndata: {"type":"block","text":"multi\\nline"}\n\n');
});

/** A fake indexer: `txPerBlock(height)` transfers per block, tip advanced by the test. */
function fakeChain(txPerBlock: (height: bigint) => number) {
  const state = { latest: 100n, queries: [] as EventQuery[], hold: null as null | (() => void) };
  const eventsFrom = (height: bigint) => {
    const events = [];
    for (let current = height; current <= state.latest; current += 1n) {
      for (let index = 0; index < txPerBlock(current); index += 1) {
        events.push({
          txHash: hashFromHex(`0x${current.toString(16).padStart(8, "0")}${index.toString(16).padStart(56, "0")}`),
          blockHeight: current,
          sequenceNumber: 0,
          event: transferEvent({ contractAddress: NATIVE_HOG_ADDRESS, amount: 1n }),
        });
      }
    }
    return events;
  };
  const getEvents = async (query: EventQuery): Promise<EventPage> => {
    state.queries.push(query);
    if (state.hold) await new Promise<void>((resolve) => { state.hold = resolve; });
    if (query.anchor === "end") return { events: [], cursor: new Uint8Array(), latestBlock: state.latest, oldestBlock: 0n };
    assert.ok(query.anchor && typeof query.anchor === "object");
    const matching = eventsFrom(query.anchor.height);
    const offset = query.cursor ? Number(new TextDecoder().decode(query.cursor)) : 0;
    const page = matching.slice(offset, offset + (query.limit ?? 50));
    const next = offset + page.length;
    return { events: page, cursor: next < matching.length ? new TextEncoder().encode(String(next)) : new Uint8Array(), latestBlock: state.latest, oldestBlock: 0n };
  };
  return { state, getEvents };
}

function setup(t: TestContext, txPerBlock: (height: bigint) => number = () => 2) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const chain = fakeChain(txPerBlock);
  let now = 1_000_000;
  const hub = new LiveHub({
    clock: () => now,
    createClient: async () => ({ getEvents: chain.getEvents }),
    loadConfig: () => ({ contracts: [NATIVE_HOG_ADDRESS], lagBlocks: 3 }),
    rpcUrl: () => "http://rpc.test",
  });
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  /** Advance fake time and let the scheduled tick and its awaited RPC calls settle. */
  const advance = async (ms: number) => {
    now += ms;
    t.mock.timers.tick(ms);
    for (let round = 0; round < 8; round += 1) await flush();
  };
  return { hub, chain, advance, flush, clock: () => now };
}

test("the hub publishes settled blocks, times only heights it saw arrive, and answers hello from its config", async (t) => {
  const { hub, chain, advance, flush } = setup(t);
  const messages: LiveMessage[] = [];
  assert.deepEqual([hub.snapshot().contracts, hub.snapshot().lagBlocks], [[NATIVE_HOG_ADDRESS], 3]);

  const unsubscribe = hub.subscribe((message) => messages.push(message));
  assert.equal(hub.isRunning, true);
  await advance(0);

  // First tick: probe at the end, then a walk from latest - lag - backfill that settles up to 97.
  assert.equal(chain.state.queries[0].anchor, "end");
  const backfilled = messages.filter((message) => message.type === "block");
  assert.equal(backfilled.length, BACKFILL_BLOCKS + 1);
  assert.deepEqual([backfilled[0], backfilled.at(-1)].map((message) => message?.type === "block" && [message.block.height, message.block.txCount, message.block.observedAt]), [
    [(100n - 3n - BigInt(BACKFILL_BLOCKS)).toString(), 2, null],
    ["97", 2, null],
  ]);
  assert.equal(hub.snapshot().status.state, "live");
  assert.equal(hub.snapshot().status.settledHeight, "97");

  // Two blocks arrive; the settle boundary moves to 99 and both new blocks carry observation times.
  chain.state.latest = 102n;
  messages.length = 0;
  await advance(POLL_MS);
  const settled = messages.flatMap((message) => (message.type === "block" ? [message.block] : []));
  assert.deepEqual(settled.map((block) => [block.height, block.txCount, block.hogMoved, block.observedAt !== null]), [
    ["98", 2, "0.0000002", false], // produced before the stream saw the tip move
    ["99", 2, "0.0000002", false],
  ]);
  chain.state.latest = 103n;
  messages.length = 0;
  await advance(POLL_MS);
  const timed = messages.flatMap((message) => (message.type === "block" ? [message.block] : []));
  assert.deepEqual(timed.map((block) => [block.height, block.observedAt !== null]), [["100", false]]);
  chain.state.latest = 105n;
  messages.length = 0;
  await advance(POLL_MS);
  const later = messages.flatMap((message) => (message.type === "block" ? [message.block] : []));
  assert.deepEqual(later.map((block) => [block.height, block.observedAt !== null]), [["101", true], ["102", true]]);
  assert.ok(later[0].observedAt! < later[1].observedAt!, "skipped heights are spread over the interval");

  // Idle stop after the last subscriber leaves; the ring survives, the walk position does not.
  unsubscribe();
  assert.equal(hub.isRunning, true);
  await advance(IDLE_STOP_MS);
  assert.equal(hub.isRunning, false);
  assert.equal(hub.snapshot().blocks.at(-1)?.height, "102");
  chain.state.queries.length = 0;
  hub.subscribe(() => {});
  await advance(0);
  assert.equal(chain.state.queries[0]?.anchor, "end", "a restart probes again instead of resuming a stale position");
  await flush();
});

test("a tick that finishes after idle-stop is discarded", async (t) => {
  const { hub, chain, advance, flush } = setup(t);
  const messages: LiveMessage[] = [];
  const unsubscribe = hub.subscribe((message) => messages.push(message));
  await advance(0);
  messages.length = 0;

  // Hold the next RPC call open, then let the idle timer stop the hub underneath it.
  chain.state.hold = () => {};
  chain.state.latest = 104n;
  await advance(POLL_MS);
  const release = chain.state.hold;
  chain.state.hold = null;
  unsubscribe();
  await advance(IDLE_STOP_MS);
  assert.equal(hub.isRunning, false);
  release();
  for (let round = 0; round < 8; round += 1) await flush();

  assert.deepEqual(messages, [], "the stale walk must not publish");
  chain.state.queries.length = 0;
  hub.subscribe(() => {});
  await advance(0);
  assert.equal(chain.state.queries[0]?.anchor, "end");
});

test("a throwing subscriber is dropped through unsubscribe so idle-stop still follows", async (t) => {
  const { hub, advance } = setup(t);
  hub.subscribe(() => { throw new Error("socket gone"); });
  await advance(0);
  assert.equal(hub.subscriberCount, 0);
  await advance(IDLE_STOP_MS);
  assert.equal(hub.isRunning, false);
});

test("a block too large to count degrades the stream and retries slowly", async (t) => {
  const { hub, chain, advance } = setup(t, (height) => (height === 40n ? 60_000 : 0));
  const messages: LiveMessage[] = [];
  hub.subscribe((message) => messages.push(message));
  await advance(0);
  // The first walk settles the empty blocks before 40 and is capped there; the catch-up tick hits the wall.
  assert.equal(hub.snapshot().status.settledHeight, "39");
  await advance(CATCH_UP_MS);
  const status = hub.snapshot().status;
  assert.equal(status.state, "degraded");
  assert.match(status.error ?? "", /block 40 has more than 50000 events/);

  const callsAfterFailure = chain.state.queries.length;
  await advance(59_000);
  assert.equal(chain.state.queries.length, callsAfterFailure, "no retry inside the minute");
  await advance(1_000);
  assert.ok(chain.state.queries.length > callsAfterFailure, "retried after a minute");
});
