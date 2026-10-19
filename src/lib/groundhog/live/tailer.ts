import { toHex0x, type EventPage, type EventQuery, type IdentifiedEvent } from "@thruputchain/client";

export type PageFetcher = (query: EventQuery) => Promise<EventPage>;

export type SettledBlock = {
  height: bigint;
  txCount: number;
  eventCount: number;
  hogMovedRaw: bigint;
  sampleTxHash: string | null;
};

export type TailResult = {
  /** Complete blocks from `fromHeight` upwards, oldest first, empty blocks included. */
  blocks: SettledBlock[];
  /** Height to anchor the next walk at. */
  nextHeight: bigint;
  latestBlock: bigint;
  oldestBlock: bigint;
  pages: number;
  /** The page cap stopped the walk with settled blocks still unread; call again soon. */
  capped: boolean;
};

export type TailOptions = {
  fetchPage: PageFetcher;
  filters: EventQuery["filters"];
  fromHeight: bigint;
  lagBlocks: number;
  /** Soft page cap per walk. The walk continues past it only while still inside its first block. */
  maxPages?: number;
  /** Hard page cap; exceeding it means one block alone has more events than the walk can hold. */
  hardMaxPages?: number;
  pageLimit?: number;
  /** Returns the raw HOG amount an event moved, or undefined when it is not a native transfer. */
  hogMoved?: (event: IdentifiedEvent) => bigint | undefined;
};

/** One block holds more events on the watched contracts than a walk may read. */
export class BlockTooLargeError extends Error {
  constructor(readonly height: bigint, maxEvents: number) {
    super(`block ${height} has more than ${maxEvents} events on the watched contracts; counting cannot complete`);
    this.name = "BlockTooLargeError";
  }
}

/** Gateway maximum for `getEvents` `limit`. */
export const DEFAULT_PAGE_LIMIT = 200;
export const DEFAULT_MAX_PAGES = 10;
export const DEFAULT_HARD_MAX_PAGES = 250;

/**
 * Walk `getEvents` ascending from `fromHeight` and return every block that is
 * complete: at or below `latestBlock - lagBlocks` as reported by the first
 * page, and fully covered by the pages fetched. Events are grouped by height
 * and transactions are counted once per block however many events they emit.
 *
 * The indexer returns events in height order, so when the page cap stops the
 * walk, every height below the last one seen is complete and the last one is
 * deferred to the next walk.
 */
export async function collectSettledBlocks(options: TailOptions): Promise<TailResult> {
  const {
    fetchPage,
    filters,
    fromHeight,
    lagBlocks,
    maxPages = DEFAULT_MAX_PAGES,
    hardMaxPages = DEFAULT_HARD_MAX_PAGES,
    pageLimit = DEFAULT_PAGE_LIMIT,
    hogMoved,
  } = options;

  const events: IdentifiedEvent[] = [];
  let cursor: Uint8Array | undefined;
  let pages = 0;
  let latestBlock: bigint | undefined;
  let oldestBlock = 0n;
  let capped = false;

  do {
    const page = await fetchPage({ filters, order: "ascending", anchor: { height: fromHeight }, cursor, limit: pageLimit });
    pages += 1;
    latestBlock ??= page.latestBlock;
    oldestBlock = page.oldestBlock;
    events.push(...page.events);
    cursor = page.cursor.length > 0 ? page.cursor : undefined;
    if (!cursor) break;
    const lastHeight = events.length > 0 ? events[events.length - 1].blockHeight : fromHeight;
    // Events past the lag boundary cannot be published yet; fetching more of them
    // now would only repeat next tick.
    if (lastHeight > latestBlock - BigInt(lagBlocks)) break;
    if (pages >= hardMaxPages) throw new BlockTooLargeError(fromHeight, hardMaxPages * pageLimit);
    if (pages >= maxPages && lastHeight > fromHeight) {
      capped = true;
      break;
    }
  } while (cursor);

  if (latestBlock === undefined) throw new Error("getEvents returned no page");

  // Heights below the indexer's retention are unknown, not empty.
  const start = fromHeight < oldestBlock ? oldestBlock : fromHeight;
  let upper = latestBlock - BigInt(lagBlocks);
  if (capped) {
    const lastSeen = events[events.length - 1].blockHeight;
    if (lastSeen - 1n < upper) upper = lastSeen - 1n;
  }

  const groups = new Map<string, { txs: Set<string>; events: number; hog: bigint; sample: string | null }>();
  for (const entry of events) {
    if (entry.blockHeight < start || entry.blockHeight > upper) continue;
    const key = entry.blockHeight.toString();
    let group = groups.get(key);
    if (!group) {
      group = { txs: new Set(), events: 0, hog: 0n, sample: null };
      groups.set(key, group);
    }
    const txHash = toHex0x(entry.txHash);
    group.txs.add(txHash);
    group.events += 1;
    group.sample ??= txHash;
    const moved = hogMoved?.(entry);
    if (moved !== undefined) group.hog += moved;
  }

  const blocks: SettledBlock[] = [];
  for (let height = start; height <= upper; height += 1n) {
    const group = groups.get(height.toString());
    blocks.push({
      height,
      txCount: group?.txs.size ?? 0,
      eventCount: group?.events ?? 0,
      hogMovedRaw: group?.hog ?? 0n,
      sampleTxHash: group?.sample ?? null,
    });
  }

  return {
    blocks,
    nextHeight: upper >= start ? upper + 1n : start,
    latestBlock,
    oldestBlock,
    pages,
    capped,
  };
}
