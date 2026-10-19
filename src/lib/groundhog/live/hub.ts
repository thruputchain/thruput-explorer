import { addressFromHex, toHex0x, type EventQuery, type ThruputClient, type IdentifiedEvent } from "@thruputchain/client";

import { createExplorerGroundhogClient, getExplorerRpcConfig, NATIVE_HOG_ADDRESS } from "../client";
import { toRpcFailure } from "../rpc";
import { decodeTokenEvent, formatTokenAmount } from "../token-events";
import { ADDRESSES_PER_FILTER, chunk, parseLiveConfig, type LiveConfig } from "./config";
import { BlockTooLargeError, collectSettledBlocks, type SettledBlock } from "./tailer";
import type { LiveBlock, LiveHello, LiveMessage, LiveStatus } from "./types";

export const RING_SIZE = 240;
export const POLL_MS = 1_000;
export const CATCH_UP_MS = 50;
export const IDLE_STOP_MS = 30_000;
/** Blocks published without observation times when the stream starts, so the wall is not empty. */
export const BACKFILL_BLOCKS = 60;
const MAX_PAGES_PER_TICK = 10;
const MAX_BACKOFF_MS = 10_000;
/** A block too large to count is retried slowly; each attempt costs hundreds of gateway pages. */
const BLOCK_TOO_LARGE_RETRY_MS = 60_000;
const TIP_TIME_RETENTION = 2_000;
/** A tip jump larger than this leaves the skipped heights without observation times. */
const MAX_INTERPOLATED_HEIGHTS = 50;
const NATIVE_HOG_DECIMALS = 7;

type Listener = (message: LiveMessage) => void;

export type LiveHubOptions = {
  clock?: () => number;
  /** Creates the RPC client on first use; injectable for tests. */
  createClient?: () => Promise<Pick<ThruputClient, "getEvents">>;
  /** Parses the watched contracts and lag; injectable for tests. */
  loadConfig?: () => LiveConfig;
  rpcUrl?: () => string;
};

/**
 * One tailer per process. It polls the gateway only while at least one SSE
 * subscriber is connected, keeps a ring buffer of settled blocks for new
 * subscribers, and records when each indexer height was first seen so blocks
 * carry an approximate production time.
 */
export class LiveHub {
  private readonly listeners = new Map<Listener, () => void>();
  private readonly ring: LiveBlock[] = [];
  private readonly tipSeenAt = new Map<string, number>();
  private readonly clock: () => number;
  private readonly createClient: () => Promise<Pick<ThruputClient, "getEvents">>;
  private readonly rpcUrl: () => string;
  private status: LiveStatus;
  private config: LiveConfig | null = null;
  private client: Pick<ThruputClient, "getEvents"> | null = null;
  private nextHeight: bigint | null = null;
  private lastTip: { height: bigint; at: number } | null = null;
  private running = false;
  /** Incremented on every stop so a tick that was awaiting the gateway discards its result. */
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffMs = POLL_MS;

  constructor(options: LiveHubOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.createClient = options.createClient ?? (async () => (await createExplorerGroundhogClient()).client);
    this.rpcUrl = options.rpcUrl ?? (() => getExplorerRpcConfig().rpcUrl);
    this.status = { state: "starting", indexerHeight: null, settledHeight: null, at: this.clock() };
    try {
      this.config = (options.loadConfig ?? parseLiveConfig)();
    } catch (error) {
      this.status = { ...this.status, state: "degraded", error: error instanceof Error ? error.message : String(error) };
    }
  }

  get subscriberCount() {
    return this.listeners.size;
  }

  get isRunning() {
    return this.running;
  }

  subscribe(listener: Listener) {
    const unsubscribe = () => {
      if (!this.listeners.delete(listener)) return;
      if (this.listeners.size === 0 && !this.idleTimer) {
        this.idleTimer = setTimeout(() => {
          this.idleTimer = null;
          if (this.listeners.size === 0) this.stop();
        }, IDLE_STOP_MS);
      }
    };
    this.listeners.set(listener, unsubscribe);
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.start();
    return unsubscribe;
  }

  snapshot(): LiveHello {
    return {
      type: "hello",
      rpcUrl: this.rpcUrl(),
      contracts: this.config?.contracts ?? [],
      lagBlocks: this.config?.lagBlocks ?? 0,
      blocks: [...this.ring],
      status: this.status,
    };
  }

  private start() {
    if (this.running) return;
    this.running = true;
    this.backoffMs = POLL_MS;
    this.schedule(0);
  }

  private stop() {
    this.running = false;
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Restart from a fresh probe: blocks produced while nobody watched have no observation times.
    this.nextHeight = null;
    this.lastTip = null;
    this.tipSeenAt.clear();
  }

  private schedule(ms: number) {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick() {
    this.timer = null;
    if (!this.running) return;
    const generation = this.generation;
    const stale = () => generation !== this.generation || !this.running;
    try {
      if (!this.config) this.config = parseLiveConfig();
      const config = this.config;
      if (!this.client) this.client = await this.createClient();
      if (stale()) return;
      const client = this.client;
      const filters = buildFilters(config.contracts);

      if (this.nextHeight === null) {
        const probe = await client.getEvents({ filters, order: "descending", anchor: "end", limit: 1 });
        if (stale()) return;
        // The probe tip's production time is unknown, so it is recorded without a timestamp.
        this.lastTip = { height: probe.latestBlock, at: this.clock() };
        const start = probe.latestBlock - BigInt(config.lagBlocks + BACKFILL_BLOCKS);
        this.nextHeight = start < probe.oldestBlock ? probe.oldestBlock : start < 0n ? 0n : start;
      }

      const result = await collectSettledBlocks({
        fetchPage: (query) => client.getEvents(query),
        filters,
        fromHeight: this.nextHeight,
        lagBlocks: config.lagBlocks,
        maxPages: MAX_PAGES_PER_TICK,
        hogMoved: nativeHogAmount,
      });
      if (stale()) return;
      this.noteTip(result.latestBlock);
      for (const block of result.blocks) this.publishBlock(block);
      this.nextHeight = result.nextHeight;
      this.setStatus({
        state: "live",
        indexerHeight: result.latestBlock.toString(),
        settledHeight: this.ring.at(-1)?.height ?? null,
        at: this.clock(),
      });
      this.backoffMs = POLL_MS;
      this.schedule(result.capped ? CATCH_UP_MS : POLL_MS);
    } catch (error) {
      if (stale()) return;
      this.setStatus({ ...this.status, state: "degraded", error: toRpcFailure(error).message, at: this.clock() });
      this.backoffMs = error instanceof BlockTooLargeError ? BLOCK_TOO_LARGE_RETRY_MS : Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      this.schedule(this.backoffMs);
    }
  }

  /**
   * Record when each indexer height first appeared. Heights skipped between two
   * observations are spread linearly over the interval, since the chain
   * produced them at some point in between.
   */
  private noteTip(height: bigint) {
    const now = this.clock();
    const previous = this.lastTip;
    if (previous === null) {
      this.lastTip = { height, at: now };
      this.tipSeenAt.set(height.toString(), now);
      return;
    }
    if (height <= previous.height) return;
    const advanced = Number(height - previous.height);
    const earliest = height - BigInt(MAX_INTERPOLATED_HEIGHTS - 1);
    for (let current = previous.height + 1n; current <= height; current += 1n) {
      if (current < earliest) continue;
      const fraction = Number(current - previous.height) / advanced;
      this.tipSeenAt.set(current.toString(), Math.round(previous.at + (now - previous.at) * fraction));
    }
    this.lastTip = { height, at: now };
    if (this.tipSeenAt.size > TIP_TIME_RETENTION * 2) {
      const cutoff = height - BigInt(TIP_TIME_RETENTION);
      for (const key of this.tipSeenAt.keys()) {
        if (BigInt(key) < cutoff) this.tipSeenAt.delete(key);
      }
    }
  }

  private publishBlock(block: SettledBlock) {
    const height = block.height.toString();
    const live: LiveBlock = {
      height,
      txCount: block.txCount,
      eventCount: block.eventCount,
      hogMoved: formatTokenAmount(block.hogMovedRaw, NATIVE_HOG_DECIMALS),
      observedAt: this.tipSeenAt.get(height) ?? null,
      sampleTxHash: block.sampleTxHash,
    };
    const index = this.ring.findIndex((entry) => entry.height === height);
    if (index >= 0) {
      live.observedAt ??= this.ring[index].observedAt;
      this.ring[index] = live;
    } else {
      this.ring.push(live);
      if (this.ring.length > RING_SIZE) this.ring.splice(0, this.ring.length - RING_SIZE);
    }
    this.emit({ type: "block", block: live });
  }

  private setStatus(status: LiveStatus) {
    this.status = status;
    this.emit({ type: "status", status });
  }

  private emit(message: LiveMessage) {
    for (const [listener, unsubscribe] of [...this.listeners]) {
      try {
        listener(message);
      } catch {
        // A subscriber whose response is gone must not stop the others.
        unsubscribe();
      }
    }
  }
}

export function buildFilters(contracts: string[]): EventQuery["filters"] {
  return chunk(contracts, ADDRESSES_PER_FILTER).map((addresses) => ({
    contractAddresses: addresses.map(addressFromHex),
  }));
}

export function nativeHogAmount(entry: IdentifiedEvent) {
  if (toHex0x(entry.event.contractAddress) !== NATIVE_HOG_ADDRESS) return undefined;
  const decoded = decodeTokenEvent(entry.event);
  return decoded ? BigInt(decoded.rawAmount) : undefined;
}

const HUB_KEY = Symbol.for("thruput-explorer.live-hub");

/** The process-wide hub. Stored on `globalThis` so development reloads reuse one poller. */
export function getLiveHub(): LiveHub {
  const holder = globalThis as typeof globalThis & { [HUB_KEY]?: LiveHub };
  return (holder[HUB_KEY] ??= new LiveHub());
}
