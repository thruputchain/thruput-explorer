import type { SpecEventPreview } from "./contract-spec";

export type RpcFailure = {
  message: string;
  code?: number;
  method?: string;
};

export type TransactionStatusView =
  | TransactionStatus
  | { status: "malformed"; reason: string }
  | { status: "unavailable"; error: RpcFailure };

export type TransactionReceiptView = {
  txHash: string;
  height: string;
  execution:
    | "return"
    | "abort"
    | "fault"
    | "nonDeterministicError"
    | "failedGasSponsorship"
    | "other"
    | "unsupported";
  gasUsed: string;
  events: EventView[];
  returnData: string | null;
  abortData: string | null;
  rawJson?: string;
};

export type TransactionStatus =
  | { status: "pending"; recentFailure?: RecentFailureView }
  | { status: "committed"; height: string }
  | {
      status: "retry";
      error: { source: string; code: number };
      recentFailure?: RecentFailureView;
    }
  | {
      status: "dropped";
      error: { source: string; code: number };
      recentFailure?: RecentFailureView;
    }
  | {
      status: "recentFailure";
      attemptHeight: string;
      cause: TransactionFailureCauseView;
    }
  | { status: "other" }
  | { status: "unknown" }
  | { status: "unsupported"; rawJson: string };

export type RecentFailureView = {
  attemptHeight: string;
  cause: TransactionFailureCauseView;
};

export type EventView = {
  contractAddress: string;
  contractName?: string;
  decoded?: DecodedEventView;
  specEvent?: SpecEventPreview;
  enrichmentNotice?: string;
  topics: string[];
  data?: string;
};

export type DecodedEventView = {
  kind: "token-transfer" | "token-mint" | "token-burn";
  name: string;
  from?: string;
  to?: string;
  rawAmount: string;
  amount: string;
  symbol?: string;
};

export type TransactionPageData = {
  hash: string;
  rpcUrl: string;
  status: TransactionStatusView;
  chainTipHeight?: string;
  receipt: TransactionReceiptView | null;
  receiptError?: RpcFailure;
};

export type TransactionFailureCauseView =
  | {
      kind: "dbConflict";
      conflict: { address: string; key: string; code: string };
    }
  | { kind: "contractRejected"; contractIndex: number; code: string }
  | { kind: "other" }
  | { kind: "unsupported"; rawJson: string };
