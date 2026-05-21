import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

import {
  getChainTip,
  getGroundhogRpcUrl,
  getTransactionReceipt,
  getTransactionStatus,
} from "./rpc";
import type {
  ChainTipView,
  EventView,
  RpcResult,
  TransactionPageData,
  TransactionReceiptView,
  TransactionStatusView,
} from "./types";

export async function loadTransactionPageData(hashInput: string): Promise<TransactionPageData> {
  const hash = normalizeTransactionHash(hashInput);

  if (!isTransactionHash(hash)) {
    return {
      hash,
      rpcUrl: getGroundhogRpcUrl(),
      status: { kind: "invalid", label: "Invalid", reason: "Malformed transaction hash" },
      chainTip: { available: false },
      receipt: { available: false, events: [] },
    };
  }

  const [statusResult, receiptResult, chainTipResult] = await Promise.all([
    getTransactionStatus(hash),
    getTransactionReceipt(hash),
    getChainTip(),
  ]);

  return {
    hash,
    rpcUrl: getGroundhogRpcUrl(),
    status: normalizeStatus(statusResult),
    chainTip: normalizeChainTip(chainTipResult),
    receipt: normalizeReceipt(receiptResult),
  };
}

function normalizeStatus(result: RpcResult<unknown>): TransactionStatusView {
  if (!result.ok) return { kind: "unavailable", label: "Unavailable", error: result.error };

  const value = result.data;
  const status = readString(value, "status")?.toLowerCase();

  if (typeof value === "string") return statusFromString(value);
  if (status) return statusFromString(status, value);
  if (isRecord(value)) {
    if ("Pending" in value) return { kind: "pending", label: "Pending" };
    if ("Unknown" in value) return { kind: "unknown", label: "Unknown" };
    if ("Committed" in value) {
      return { kind: "committed", label: "Committed", height: readNestedString(value, "Committed", "height") };
    }
    if ("Invalid" in value) {
      return { kind: "invalid", label: "Invalid", reason: readNestedString(value, "Invalid", "reason") };
    }
  }

  return { kind: "unknown", label: "Unknown" };
}

function statusFromString(value: string, source?: unknown): TransactionStatusView {
  switch (value.toLowerCase()) {
    case "pending":
      return { kind: "pending", label: "Pending" };
    case "committed":
      return { kind: "committed", label: "Committed", height: readString(source, "height") };
    case "invalid":
      return { kind: "invalid", label: "Invalid", reason: readString(source, "reason") };
    case "unknown":
    default:
      return { kind: "unknown", label: "Unknown" };
  }
}

function normalizeChainTip(result: RpcResult<unknown>): ChainTipView {
  if (!result.ok) return { available: false, error: result.error };
  return {
    available: true,
    height: readString(result.data, "height"),
    blockHash: readString(result.data, "blockHash") ?? readString(result.data, "block_hash"),
  };
}

function normalizeReceipt(result: RpcResult<unknown>): TransactionReceiptView {
  if (!result.ok) return { available: false, events: [], error: result.error };
  if (result.data == null) return { available: false, events: [] };

  const receipt = unwrapOutput(result.data);
  return {
    available: true,
    txHash: readString(receipt, "txHash") ?? readString(receipt, "tx_hash"),
    height: readString(receipt, "height"),
    execResult: readExecResult(receipt),
    returnData: readNullableString(receipt, "returnData") ?? readNullableString(receipt, "return_data"),
    abortData: readNullableString(receipt, "abortData") ?? readNullableString(receipt, "abort_data"),
    events: readEvents(receipt),
  };
}

function readEvents(value: unknown): EventView[] {
  const events = readArray(value, "events") ?? [];

  return events.map((event) => ({
    contractAddress:
      readString(event, "contractAddress") ?? readString(event, "contract_address") ?? readString(event, "contract") ?? "-",
    topics: readArray(event, "topics")?.map((topic) => String(topic)) ?? [],
    data: readString(event, "data") ?? readString(event, "raw") ?? undefined,
  }));
}

function unwrapOutput(value: unknown) {
  if (isRecord(value) && "output" in value) return value.output;
  return value;
}

function readString(value: unknown, key: string) {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  if (item == null) return undefined;
  return String(item);
}

function readNullableString(value: unknown, key: string) {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  return item == null ? null : String(item);
}

function readExecResult(value: unknown) {
  const execResult = readValue(value, "execResult") ?? readValue(value, "exec_result") ?? readValue(value, "status");

  if (typeof execResult === "string") return execResult;
  if (!isRecord(execResult)) return execResult == null ? undefined : String(execResult);

  const result = readString(execResult, "result") ?? readString(execResult, "status") ?? readString(execResult, "type");
  if (!result) return JSON.stringify(execResult);

  const reason = readString(execResult, "reason") ?? readString(execResult, "message");
  return reason ? `${result}: ${reason}` : result;
}

function readValue(value: unknown, key: string) {
  if (!isRecord(value)) return undefined;
  return value[key];
}

function readNestedString(value: unknown, parent: string, key: string) {
  if (!isRecord(value)) return undefined;
  return readString(value[parent], key);
}

function readArray(value: unknown, key: string) {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  return Array.isArray(item) ? item : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
