// Wire types shared by the live stream route and the browser. Keep this module
// free of server-only imports.

export type LiveBlock = {
  /** Block height as a decimal string so heights survive JSON without precision loss. */
  height: string;
  /** Distinct transactions in the block that emitted at least one event on a watched contract. */
  txCount: number;
  /** Events on watched contracts in the block. */
  eventCount: number;
  /** HOG moved by native transfers in the block, formatted with 7 decimals. */
  hogMoved: string;
  /** When the indexer first reported this height, or null when the block predates the stream. */
  observedAt: number | null;
  /** One transaction from the block, for linking. */
  sampleTxHash: string | null;
};

export type LiveStatus = {
  state: "starting" | "live" | "degraded";
  /** Highest block the indexer has processed. */
  indexerHeight: string | null;
  /** Newest block the stream has settled and published. */
  settledHeight: string | null;
  error?: string;
  at: number;
};

export type LiveHello = {
  type: "hello";
  rpcUrl: string;
  contracts: string[];
  lagBlocks: number;
  blocks: LiveBlock[];
  status: LiveStatus;
};

export type LiveBlockMessage = { type: "block"; block: LiveBlock };
export type LiveStatusMessage = { type: "status"; status: LiveStatus };
export type LiveMessage = LiveHello | LiveBlockMessage | LiveStatusMessage;
