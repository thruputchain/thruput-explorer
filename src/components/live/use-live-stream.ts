"use client";

import { useEffect, useState } from "react";

import { mergeLiveBlocks } from "@/lib/groundhog/live/stats";
import type { LiveBlock, LiveBlockMessage, LiveHello, LiveStatus, LiveStatusMessage } from "@/lib/groundhog/live/types";

export type LiveConnection = "connecting" | "open" | "reconnecting" | "closed";

export type LiveStreamState = {
  connection: LiveConnection;
  hello: Pick<LiveHello, "rpcUrl" | "contracts" | "lagBlocks"> | null;
  status: LiveStatus | null;
  /** Settled blocks, ascending by height. */
  blocks: LiveBlock[];
  /** Blocks and transactions that settled after this page connected. */
  session: { txCount: number; blockCount: number };
};

const SEEN_LIMIT = 5_000;

const initialState: LiveStreamState = {
  connection: "connecting",
  hello: null,
  status: null,
  blocks: [],
  session: { txCount: 0, blockCount: 0 },
};

export function useLiveStream(url = "/api/live/stream"): LiveStreamState {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    const source = new EventSource(url);
    const seen = new Set<string>();
    let initialised = false;

    const remember = (height: string) => {
      seen.add(height);
      if (seen.size > SEEN_LIMIT) {
        for (const stale of [...seen].slice(0, SEEN_LIMIT / 5)) seen.delete(stale);
      }
    };

    // Blocks without an observation time were backfilled from before the stream
    // started, so they predate this page and never count toward the session.
    const count = (blocks: LiveBlock[], session: LiveStreamState["session"]) => {
      let { txCount, blockCount } = session;
      for (const block of blocks) {
        if (seen.has(block.height)) continue;
        remember(block.height);
        if (block.observedAt === null) continue;
        txCount += block.txCount;
        blockCount += 1;
      }
      return { txCount, blockCount };
    };

    source.addEventListener("hello", (event: MessageEvent<string>) => {
      const hello = JSON.parse(event.data) as LiveHello;
      // The first snapshot is history; later ones cover a reconnect gap.
      const history = !initialised;
      initialised = true;
      if (history) for (const block of hello.blocks) remember(block.height);
      setState((previous) => ({
        connection: "open",
        hello: { rpcUrl: hello.rpcUrl, contracts: hello.contracts, lagBlocks: hello.lagBlocks },
        status: hello.status,
        blocks: mergeLiveBlocks(previous.blocks, hello.blocks),
        session: history ? previous.session : count(hello.blocks, previous.session),
      }));
    });

    source.addEventListener("block", (event: MessageEvent<string>) => {
      const { block } = JSON.parse(event.data) as LiveBlockMessage;
      setState((previous) => ({
        ...previous,
        blocks: mergeLiveBlocks(previous.blocks, [block]),
        session: count([block], previous.session),
      }));
    });

    source.addEventListener("status", (event: MessageEvent<string>) => {
      const { status } = JSON.parse(event.data) as LiveStatusMessage;
      setState((previous) => ({ ...previous, connection: "open", status }));
    });

    source.onerror = () => {
      // The browser stops retrying after an HTTP error such as 401 or 503.
      const closed = source.readyState === EventSource.CLOSED;
      setState((previous) => ({ ...previous, connection: closed ? "closed" : "reconnecting" }));
    };

    return () => source.close();
  }, [url]);

  return state;
}
