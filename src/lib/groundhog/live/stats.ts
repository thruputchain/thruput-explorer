// Client-safe derivations over settled blocks.

import type { LiveBlock } from "./types";

export const RATE_WINDOW_MS = 30_000;
export const AVERAGE_BLOCKS = 30;
export const MAX_CLIENT_BLOCKS = 240;

export type LiveStats = {
  /** Transactions per second over the trailing window, or null until two timed blocks exist. */
  ratePerSecond: number | null;
  /** Blocks whose transactions the rate counts. */
  rateBlocks: number;
  /** Seconds the rate window actually spans. */
  rateSeconds: number;
  averagePerBlock: number | null;
  averageBlocks: number;
  /** Mean spacing between timed blocks in the window, or null when unknown. */
  blockIntervalMs: number | null;
  newest: LiveBlock | null;
  maxTxCount: number;
};

export function compareHeights(a: string, b: string) {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Merge blocks by height, keeping ascending order and at most `max` newest blocks. */
export function mergeLiveBlocks(existing: LiveBlock[], incoming: LiveBlock[], max = MAX_CLIENT_BLOCKS) {
  const byHeight = new Map(existing.map((block) => [block.height, block]));
  for (const block of incoming) {
    const previous = byHeight.get(block.height);
    byHeight.set(block.height, previous && block.observedAt === null ? { ...block, observedAt: previous.observedAt } : block);
  }
  return [...byHeight.values()].sort((a, b) => compareHeights(a.height, b.height)).slice(-max);
}

/**
 * The rate uses the interval method: between the oldest and newest timed
 * blocks in the window, every block after the oldest contributes its
 * transactions to the elapsed time between the two timestamps. Blocks without
 * an observation time (backfilled history) never enter the rate.
 */
export function computeLiveStats(blocks: LiveBlock[], windowMs = RATE_WINDOW_MS): LiveStats {
  const timed = blocks.filter((block) => block.observedAt !== null);
  const newestTimed = timed.at(-1);

  let ratePerSecond: number | null = null;
  let rateBlocks = 0;
  let rateSeconds = 0;
  let blockIntervalMs: number | null = null;
  if (newestTimed) {
    const windowStart = newestTimed.observedAt! - windowMs;
    const inWindow = timed.filter((block) => block.observedAt! >= windowStart);
    if (inWindow.length >= 2) {
      const elapsedMs = newestTimed.observedAt! - inWindow[0].observedAt!;
      if (elapsedMs >= 1_000) {
        ratePerSecond = inWindow.slice(1).reduce((sum, block) => sum + block.txCount, 0) / (elapsedMs / 1_000);
        rateBlocks = inWindow.length - 1;
        rateSeconds = elapsedMs / 1_000;
        blockIntervalMs = elapsedMs / (inWindow.length - 1);
      }
    }
  }

  const recent = blocks.slice(-AVERAGE_BLOCKS);
  const averagePerBlock = recent.length > 0 ? recent.reduce((sum, block) => sum + block.txCount, 0) / recent.length : null;

  return {
    ratePerSecond,
    rateBlocks,
    rateSeconds,
    averagePerBlock,
    averageBlocks: recent.length,
    blockIntervalMs,
    newest: blocks.at(-1) ?? null,
    maxTxCount: blocks.reduce((max, block) => Math.max(max, block.txCount), 0),
  };
}
