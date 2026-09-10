import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAge, formatInteger, formatRate, formatSeconds } from "./format";
import { computeLiveStats, mergeLiveBlocks } from "./stats";
import type { LiveBlock } from "./types";

function block(height: number | string, txCount: number, observedAt: number | null): LiveBlock {
  return { height: String(height), txCount, eventCount: txCount, hogMoved: "0", observedAt, sampleTxHash: null };
}

test("merge dedupes by height, keeps ascending order, and preserves a known observation time", () => {
  const merged = mergeLiveBlocks(
    [block(5, 1, 1_000), block(7, 2, 3_000)],
    [block(6, 9, 2_000), block(7, 3, null), block("9007199254740993", 1, null)],
    3,
  );
  assert.deepEqual(merged.map((entry) => [entry.height, entry.txCount, entry.observedAt]), [
    ["6", 9, 2_000],
    ["7", 3, 3_000],
    ["9007199254740993", 1, null],
  ]);
});

test("the rate uses only timed blocks and the interval method", () => {
  const blocks = [
    block(1, 500, null), // backfilled history never enters the rate
    block(2, 100, 10_000),
    block(3, 200, 12_000),
    block(4, 300, 14_000),
  ];
  const stats = computeLiveStats(blocks);
  // 500 transactions across the 4 seconds between the first and last timed block.
  assert.equal(stats.ratePerSecond, 125);
  assert.deepEqual([stats.rateBlocks, stats.rateSeconds, stats.blockIntervalMs], [2, 4, 2_000]);
  assert.equal(stats.averagePerBlock, 275);
  assert.equal(stats.averageBlocks, 4);
  assert.equal(stats.newest?.height, "4");
  assert.equal(stats.maxTxCount, 500);
});

test("the rate needs two timed blocks at least a second apart and honours the window", () => {
  assert.equal(computeLiveStats([block(1, 5, 1_000)]).ratePerSecond, null);
  assert.equal(computeLiveStats([block(1, 5, 1_000), block(2, 5, 1_500)]).ratePerSecond, null);
  const windowed = computeLiveStats([block(1, 1_000, 0), block(2, 10, 40_000), block(3, 20, 50_000)], 30_000);
  assert.equal(windowed.ratePerSecond, 2);
  assert.equal(windowed.rateBlocks, 1);
});

test("formatting keeps large heights exact and rates readable", () => {
  assert.equal(formatInteger("9007199254740993"), "9,007,199,254,740,993");
  assert.equal(formatRate(1_234.56), "1,235");
  assert.equal(formatRate(0.5), "0.5");
  assert.equal(formatSeconds(4_400), "4 s");
  assert.equal(formatSeconds(125_000), "2 min");
  assert.equal(formatAge(null, 10_000), "before the stream started");
  assert.equal(formatAge(7_000, 10_000), "3 s ago");
});
