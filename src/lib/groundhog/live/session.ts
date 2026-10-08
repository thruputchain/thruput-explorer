import type { LiveBlock, LiveHello, LiveStatus } from "./types";

export type LiveSession = { txCount: number; blockCount: number };

const SEEN_LIMIT = 5_000;

/** One tracker per EventSource; its baseline survives that source's reconnects. */
export function createSessionTracker() {
  const seen = new Set<string>();
  let initialised = false;
  let baseline: bigint | null = null;

  const remember = (height: string) => {
    seen.add(height);
    if (seen.size > SEEN_LIMIT) {
      for (const stale of [...seen].slice(0, SEEN_LIMIT / 5)) seen.delete(stale);
    }
  };

  const count = (blocks: LiveBlock[], session: LiveSession): LiveSession => {
    let { txCount, blockCount } = session;
    for (const block of blocks) {
      if (seen.has(block.height)) continue;
      remember(block.height);
      // Count timed blocks, plus untimed blocks above the indexer height first
      // reported live after the page connected, including reconnect re-walks.
      if (block.observedAt !== null || (baseline !== null && BigInt(block.height) > baseline)) {
        txCount += block.txCount;
        blockCount += 1;
      }
    }
    return { txCount, blockCount };
  };

  return {
    onHello(hello: LiveHello, session: LiveSession): LiveSession {
      if (!initialised) {
        initialised = true;
        for (const block of hello.blocks) remember(block.height);
        return session;
      }
      return count(hello.blocks, session);
    },
    onBlock(block: LiveBlock, session: LiveSession): LiveSession {
      return count([block], session);
    },
    onStatus(status: LiveStatus): void {
      if (baseline === null && status.state === "live" && status.indexerHeight !== null) {
        baseline = BigInt(status.indexerHeight);
      }
    },
  };
}
