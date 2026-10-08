"use client";

import { useEffect, useState } from "react";

import { createSessionTracker } from "@/lib/groundhog/live/session";
import { mergeLiveBlocks } from "@/lib/groundhog/live/stats";
import type { LiveBlock, LiveBlockMessage, LiveHello, LiveStatus, LiveStatusMessage } from "@/lib/groundhog/live/types";

export type LiveConnection = "connecting" | "open" | "reconnecting" | "closed";

export type LiveStreamState = {
  connection: LiveConnection;
  hello: Pick<LiveHello, "rpcUrl" | "contracts" | "lagBlocks"> | null;
  status: LiveStatus | null;
  /** Settled blocks, ascending by height. */
  blocks: LiveBlock[];
  /** Timed blocks and untimed blocks above the indexer height first reported live
   * after this page connected, including blocks re-walked after a reconnect. */
  session: { txCount: number; blockCount: number };
};

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
    const tracker = createSessionTracker();

    source.addEventListener("hello", (event: MessageEvent<string>) => {
      const hello = JSON.parse(event.data) as LiveHello;
      // Mutate the tracker outside React's replayable state updaters.
      const delta = tracker.onHello(hello, { txCount: 0, blockCount: 0 });
      setState((previous) => ({
        connection: "open",
        hello: { rpcUrl: hello.rpcUrl, contracts: hello.contracts, lagBlocks: hello.lagBlocks },
        status: hello.status,
        blocks: mergeLiveBlocks(previous.blocks, hello.blocks),
        session: {
          txCount: previous.session.txCount + delta.txCount,
          blockCount: previous.session.blockCount + delta.blockCount,
        },
      }));
    });

    source.addEventListener("block", (event: MessageEvent<string>) => {
      const { block } = JSON.parse(event.data) as LiveBlockMessage;
      const delta = tracker.onBlock(block, { txCount: 0, blockCount: 0 });
      setState((previous) => ({
        ...previous,
        blocks: mergeLiveBlocks(previous.blocks, [block]),
        session: {
          txCount: previous.session.txCount + delta.txCount,
          blockCount: previous.session.blockCount + delta.blockCount,
        },
      }));
    });

    source.addEventListener("status", (event: MessageEvent<string>) => {
      const { status } = JSON.parse(event.data) as LiveStatusMessage;
      tracker.onStatus(status);
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
