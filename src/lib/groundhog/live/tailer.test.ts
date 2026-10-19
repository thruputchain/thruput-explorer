import assert from "node:assert/strict";
import { test } from "node:test";

import { addressFromHex, hashFromHex, type EventPage, type EventQuery, type IdentifiedEvent } from "@thruputchain/client";

import { NATIVE_HOG_ADDRESS } from "../client";
import { transferEvent } from "../test-fixtures";
import { collectSettledBlocks } from "./tailer";

const filters: EventQuery["filters"] = [{ contractAddresses: [addressFromHex(NATIVE_HOG_ADDRESS)] }];

function event(height: bigint, tx: number, sequenceNumber = 0, amount = 1_000_000n): IdentifiedEvent {
  return {
    txHash: hashFromHex(`0x${tx.toString(16).padStart(64, "0")}`),
    blockHeight: height,
    sequenceNumber,
    event: transferEvent({ contractAddress: NATIVE_HOG_ADDRESS, amount }),
  };
}

/** Serve `events` (already in height order) in pages of `limit`, like the indexer. */
function fixturePages(events: IdentifiedEvent[], latestBlock: bigint, oldestBlock = 0n) {
  const queries: EventQuery[] = [];
  const fetchPage = async (query: EventQuery): Promise<EventPage> => {
    queries.push(query);
    assert.equal(query.order, "ascending");
    assert.deepEqual(query.filters, filters);
    const anchor = query.anchor;
    assert.ok(anchor && typeof anchor === "object", "live walks anchor at a height");
    const offset = query.cursor ? Number(new TextDecoder().decode(query.cursor)) : 0;
    const matching = events.filter((entry) => entry.blockHeight >= anchor.height);
    const page = matching.slice(offset, offset + (query.limit ?? 50));
    const next = offset + page.length;
    return {
      events: page,
      cursor: next < matching.length ? new TextEncoder().encode(String(next)) : new Uint8Array(),
      latestBlock,
      oldestBlock,
    };
  };
  return { fetchPage, queries };
}

test("groups events by height, counts a transaction once, and includes empty blocks up to the lag boundary", async () => {
  const events = [
    event(10n, 1), event(10n, 1, 1), event(10n, 2),
    event(12n, 3, 0, 5n), event(12n, 4, 0, 7n),
    event(13n, 5), // latestBlock 14, lag 2: block 13 is not settled yet
  ];
  const { fetchPage, queries } = fixturePages(events, 14n);

  const result = await collectSettledBlocks({ fetchPage, filters, fromHeight: 10n, lagBlocks: 2, hogMoved: () => 1n });

  assert.deepEqual(result.blocks.map((block) => [block.height, block.txCount, block.eventCount, block.hogMovedRaw]), [
    [10n, 2, 3, 3n],
    [11n, 0, 0, 0n],
    [12n, 2, 2, 2n],
  ]);
  assert.equal(result.blocks[0].sampleTxHash, `0x${"1".padStart(64, "0")}`);
  assert.equal(result.blocks[1].sampleTxHash, null);
  assert.deepEqual([result.nextHeight, result.latestBlock, result.pages, result.capped], [13n, 14n, 1, false]);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].limit, 200);
});

test("nothing settles while the indexer tip is inside the lag window", async () => {
  const { fetchPage } = fixturePages([event(20n, 1)], 21n);
  const result = await collectSettledBlocks({ fetchPage, filters, fromHeight: 20n, lagBlocks: 3 });
  assert.deepEqual(result.blocks, []);
  assert.equal(result.nextHeight, 20n);
});

test("follows cursors across pages and settles every covered block", async () => {
  const events = Array.from({ length: 450 }, (_, index) => event(30n + BigInt(index % 3), index + 1));
  events.sort((a, b) => Number(a.blockHeight - b.blockHeight));
  const { fetchPage, queries } = fixturePages(events, 40n);

  const result = await collectSettledBlocks({ fetchPage, filters, fromHeight: 30n, lagBlocks: 3, pageLimit: 200 });

  assert.equal(queries.length, 3);
  assert.deepEqual(result.blocks.map((block) => block.txCount), [150, 150, 150, 0, 0, 0, 0, 0]);
  assert.equal(result.nextHeight, 38n);
});

test("the page cap defers the last, possibly partial, block to the next walk", async () => {
  const events = [
    ...Array.from({ length: 250 }, (_, index) => event(50n, index + 1)),
    ...Array.from({ length: 250 }, (_, index) => event(51n, 1_000 + index)),
    ...Array.from({ length: 10 }, (_, index) => event(52n, 2_000 + index)),
  ];
  const { fetchPage, queries } = fixturePages(events, 60n);

  const first = await collectSettledBlocks({ fetchPage, filters, fromHeight: 50n, lagBlocks: 1, maxPages: 2, pageLimit: 200 });
  assert.equal(queries.length, 2);
  assert.equal(first.capped, true);
  // Page 2 ended inside block 51, so only block 50 is complete.
  assert.deepEqual(first.blocks.map((block) => [block.height, block.txCount]), [[50n, 250]]);
  assert.equal(first.nextHeight, 51n);

  const second = await collectSettledBlocks({ fetchPage, filters, fromHeight: first.nextHeight, lagBlocks: 1, maxPages: 2, pageLimit: 200 });
  assert.equal(second.capped, false);
  assert.deepEqual(second.blocks.map((block) => [block.height, block.txCount]), [
    [51n, 250], [52n, 10], [53n, 0], [54n, 0], [55n, 0], [56n, 0], [57n, 0], [58n, 0], [59n, 0],
  ]);
  assert.equal(second.nextHeight, 60n);
});

test("a single block larger than the soft cap is still walked to completion", async () => {
  const events = Array.from({ length: 1_000 }, (_, index) => event(70n, index + 1));
  const { fetchPage, queries } = fixturePages(events, 72n);

  const result = await collectSettledBlocks({ fetchPage, filters, fromHeight: 70n, lagBlocks: 1, maxPages: 2, pageLimit: 200 });

  assert.equal(queries.length, 5);
  assert.deepEqual(result.blocks.map((block) => [block.height, block.txCount]), [[70n, 1_000], [71n, 0]]);
  assert.equal(result.capped, false);
});

test("the walk stops once events pass the lag boundary instead of reading unsettled blocks", async () => {
  const events = [
    ...Array.from({ length: 300 }, (_, index) => event(90n, index + 1)),
    ...Array.from({ length: 900 }, (_, index) => event(91n, 1_000 + index)), // not settled: latest 93, lag 3
    ...Array.from({ length: 900 }, (_, index) => event(92n, 5_000 + index)),
  ];
  const { fetchPage, queries } = fixturePages(events, 93n);

  const result = await collectSettledBlocks({ fetchPage, filters, fromHeight: 90n, lagBlocks: 3, maxPages: 2, pageLimit: 200 });

  // Two pages complete block 90; the page that crosses into 91 ends the walk.
  assert.equal(queries.length, 2);
  assert.deepEqual(result.blocks.map((block) => [block.height, block.txCount]), [[90n, 300]]);
  assert.deepEqual([result.nextHeight, result.capped], [91n, false]);
});

test("a block beyond the hard cap fails loudly instead of undercounting", async () => {
  const events = Array.from({ length: 600 }, (_, index) => event(80n, index + 1));
  const { fetchPage } = fixturePages(events, 82n);
  await assert.rejects(
    collectSettledBlocks({ fetchPage, filters, fromHeight: 80n, lagBlocks: 1, maxPages: 1, hardMaxPages: 2, pageLimit: 200 }),
    /block 80 has more than 400 events/,
  );
});

test("heights below the indexer's retention are skipped rather than reported empty", async () => {
  const { fetchPage } = fixturePages([event(100n, 1)], 105n, 100n);
  const result = await collectSettledBlocks({ fetchPage, filters, fromHeight: 95n, lagBlocks: 2 });
  assert.deepEqual(result.blocks.map((block) => [block.height, block.txCount]), [[100n, 1], [101n, 0], [102n, 0], [103n, 0]]);
  assert.equal(result.nextHeight, 104n);
});
