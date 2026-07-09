export type RpcFailure = {
  message: string;
  code?: number;
};

export type TransactionStatusView = TransactionStatus | { status: "malformed"; reason: string } | { status: "unavailable"; error: RpcFailure };

export type TransactionReceiptView = {
  txHash: string;
  height: string;
  execResult: string;
  events: EventView[];
  returnData: string | null;
  abortData: string | null;
  rawJson?: string;
};

export type TransactionStatus =
  | { status: "pending" }
  | { status: "committed"; height: string }
  | { status: "invalid"; reason: string }
  | { status: "unknown" };

export type EventView = {
  contractAddress: string;
  contractName?: string;
  decoded?: DecodedEventView;
  topics: string[];
  data?: string;
};

export type DecodedEventView =
  | {
      kind: "token-transfer" | "token-mint" | "token-burn";
      name: string;
      from?: string;
      to?: string;
      rawAmount: string;
      amount: string;
      symbol?: string;
    }
  | {
      kind: "contract-event";
      name: string;
      topics: { name: string; value: string }[];
      fields: { name: string; value: string }[];
    };

export type TransactionPageData = {
  hash: string;
  rpcUrl: string;
  status: TransactionStatusView;
  chainTipHeight?: string;
  receipt: TransactionReceiptView | null;
};
