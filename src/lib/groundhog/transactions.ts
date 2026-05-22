import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

import { getContractInfo, getContractName } from "./contract-registry";
import { getGroundhogRpcUrl, getRawTransactionReceipt } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import type {
  ChainTipView,
  EventView,
  RpcFailure,
  RpcResult,
  TransactionPageData,
  TransactionReceiptView,
  TransactionStatusView,
} from "./types";

type ChainTip = {
  height: bigint;
  blockHash: Uint8Array;
};

type TransactionStatus =
  | { status: "pending" }
  | { status: "committed"; height: bigint }
  | { status: "invalid"; reason: string }
  | { status: "unknown" };

type TransactionReceipt = {
  txHash: Uint8Array;
  height: bigint;
  execResult: number;
  events: Array<{
    contractAddress: Uint8Array;
    topics: Uint8Array[];
    data: Uint8Array;
  }>;
  returnData: Uint8Array | null;
  abortData: Uint8Array | null;
};

type GroundhogClientSdk = {
  HttpTransport: new (url: string) => unknown;
  createGroundhogClient: (transport: unknown) => {
    getTransactionStatus: (hash: Uint8Array) => Promise<TransactionStatus>;
    getTransactionReceipt: (hash: Uint8Array) => Promise<TransactionReceipt | null>;
    getChainTip: () => Promise<ChainTip>;
  };
};

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

  const sdk = await loadGroundhogClientSdk();
  const client = sdk.createGroundhogClient(new sdk.HttpTransport(getGroundhogRpcUrl()));
  const txHash = hashFromHex(hash);
  const [statusResult, receiptResult, chainTipResult, rawReceiptResult] = await Promise.all([
    sdkRequest(() => client.getTransactionStatus(txHash)),
    sdkRequest(() => client.getTransactionReceipt(txHash)),
    sdkRequest(() => client.getChainTip()),
    getRawTransactionReceipt(hash),
  ]);

  return {
    hash,
    rpcUrl: getGroundhogRpcUrl(),
    status: normalizeStatus(statusResult),
    chainTip: normalizeChainTip(chainTipResult),
    receipt: normalizeReceipt(receiptResult, rawReceiptResult),
  };
}

function normalizeStatus(result: RpcResult<TransactionStatus>): TransactionStatusView {
  if (!result.ok) return { kind: "unavailable", label: "Unavailable", error: result.error };

  switch (result.data.status) {
    case "pending":
      return { kind: "pending", label: "Pending" };
    case "committed":
      return { kind: "committed", label: "Committed", height: result.data.height.toString() };
    case "invalid":
      return { kind: "invalid", label: "Invalid", reason: result.data.reason };
    case "unknown":
    default:
      return { kind: "unknown", label: "Unknown" };
  }
}

function normalizeChainTip(result: RpcResult<ChainTip>): ChainTipView {
  if (!result.ok) return { available: false, error: result.error };
  return {
    available: true,
    height: result.data.height.toString(),
    blockHash: toHex(result.data.blockHash),
  };
}

function normalizeReceipt(
  result: RpcResult<TransactionReceipt | null>,
  rawReceiptResult: RpcResult<unknown>,
): TransactionReceiptView {
  if (!result.ok) return { available: false, events: [], error: result.error };
  if (result.data == null) return { available: false, events: [] };

  return {
    available: true,
    txHash: toHex(result.data.txHash),
    height: result.data.height.toString(),
    execResult: formatExecResult(result.data.execResult),
    returnData: result.data.returnData ? toHex(result.data.returnData) : null,
    abortData: result.data.abortData ? toHex(result.data.abortData) : null,
    events: readEvents(result.data.events),
    rawJson: rawReceiptResult.ok ? stringifyJson(rawReceiptResult.data) : undefined,
  };
}

function readEvents(events: TransactionReceipt["events"]): EventView[] {
  return events.map((event) => {
    const contractAddress = toHex(event.contractAddress);
    const contract = getContractInfo(contractAddress);
    const eventView = {
      contractAddress,
      contractName: getContractName(contractAddress),
      topics: event.topics.map((topic) => toHex(topic)),
      data: toHex(event.data),
    };

    return {
      ...eventView,
      decoded: decodeTokenEvent(eventView, contract),
    };
  });
}

function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return undefined;
  }
}

async function sdkRequest<T>(request: () => Promise<T>): Promise<RpcResult<T>> {
  try {
    return { ok: true, data: await request() };
  } catch (error) {
    return { ok: false, error: rpcFailure(error) };
  }
}

function rpcFailure(error: unknown): RpcFailure {
  if (error instanceof Error && "code" in error && typeof error.code === "number") {
    return { message: error.message, code: error.code };
  }
  return { message: error instanceof Error ? error.message : "Unable to reach Groundhog RPC" };
}

async function loadGroundhogClientSdk() {
  const packageName = "@groundhogchain/client";
  // The SDK is installed from local file links, matching the Groundhog test dapps.
  // Turbopack cannot statically resolve those symlinks here, so load it at runtime on the server.
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<GroundhogClientSdk>;
  return dynamicImport(packageName);
}

function hashFromHex(value: string) {
  const bytes = bytesFromHex(value);
  if (bytes.length !== 32) throw new Error(`Expected 32-byte transaction hash, got ${bytes.length} bytes`);
  return bytes;
}

function bytesFromHex(value: string) {
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0 || !/^[\da-f]*$/i.test(hex)) throw new Error(`Invalid hex value: ${value}`);
  return new Uint8Array(Buffer.from(hex, "hex"));
}

function toHex(value: Uint8Array) {
  return `0x${Buffer.from(value).toString("hex")}`;
}

function formatExecResult(value: number) {
  switch (value) {
    case 0:
      return "ok";
    case 1:
      return "deterministicError";
    case 2:
      return "reverted";
    case 3:
      return "nonDeterministicError";
    case 100:
      return "failedGasSponsorship";
    case 200:
      return "validationFailure";
    case 300:
      return "systemError";
    case 400:
      return "unrecoverable";
    default:
      return `unknown (${value})`;
  }
}
