import type { ExecutionStatus, SchedulerTransactionError } from "@thruputchain/client";

export type RpcFailure = {
  message: string;
  code?: number;
  method?: string;
};

export type TransactionStatusView = TransactionStatus | { status: "malformed"; reason: string } | { status: "unavailable"; error: RpcFailure };

export type TransactionReceiptView = {
  txHash: string;
  height: string;
  execResult: string;
  executionStatus?: ExecutionStatus;
  gasUsed: string;
  events: EventView[];
  returnData: string | null;
  abortData: string | null;
  rawJson?: string;
};

export type TransactionStatus =
  | { status: "pending" }
  | { status: "committed"; height?: string }
  | { status: "retry"; error: SchedulerTransactionError }
  | { status: "dropped"; error: SchedulerTransactionError }
  | { status: "invalid"; reason: string }
  | { status: "recentFailure"; attemptHeight: string; cause: TransactionFailureCauseView }
  | { status: "other" }
  | { status: "unknown" };

export type EventView = {
  contractAddress: string;
  contractName?: string;
  decoded?: DecodedEventView;
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
};

export type TransactionFailureCauseView =
  | { kind: "dbConflict"; conflict: { address: string; key: string; code: string } }
  | { kind: "contractRejected"; contractIndex: number; code: string }
  | { kind: "other" };
