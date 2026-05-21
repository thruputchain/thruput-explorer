export type RpcFailure = {
  message: string;
  code?: number;
};

export type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: RpcFailure };

export type TransactionStatusView =
  | { kind: "pending"; label: "Pending" }
  | { kind: "committed"; label: "Committed"; height?: string }
  | { kind: "invalid"; label: "Invalid"; reason?: string }
  | { kind: "unknown"; label: "Unknown" }
  | { kind: "unavailable"; label: "Unavailable"; error: RpcFailure };

export type ChainTipView = {
  available: boolean;
  height?: string;
  blockHash?: string;
  error?: RpcFailure;
};

export type TransactionReceiptView = {
  available: boolean;
  txHash?: string;
  height?: string;
  execResult?: string;
  events: EventView[];
  returnData?: string | null;
  abortData?: string | null;
  error?: RpcFailure;
};

export type EventView = {
  contractAddress: string;
  topics: string[];
  data?: string;
};

export type TransactionPageData = {
  hash: string;
  rpcUrl: string;
  status: TransactionStatusView;
  chainTip: ChainTipView;
  receipt: TransactionReceiptView;
};
