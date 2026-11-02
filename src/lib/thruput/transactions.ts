import {
  hashFromBase58,
  toBase58,
  toHex0x,
  NativeRpcError,
  type EmittedEvent,
  type ThruputClient,
  type TransactionReceipt,
  type TransactionFailureCause,
  type TransactionStatus as SdkTransactionStatus,
} from "@thruputchain/client";

import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

import { createExplorerThruputClient, getExplorerRpcConfig } from "./client";
import { stringifyJson } from "./format";
import {
  loadTransactionInput,
  type TransactionInputView,
} from "./transaction-input";
import { loadContractSpec, type SpecEventPreview } from "./contract-spec";
import { toRpcFailure } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import {
  getBuiltInTokenMetadata,
  getTokenMetadata,
  type TokenMetadata,
} from "./token-metadata";
import type {
  EventView,
  TransactionFailureCauseView,
  TransactionPageData,
  TransactionStatusView,
} from "./types";

export type LoadedTransactionPage = TransactionPageData & {
  loadInput?: () => Promise<TransactionInputView>;
  loadEnrichedEvents?: () => Promise<EventView[]>;
};

export async function loadTransactionPageData(
  hashInput: string,
): Promise<LoadedTransactionPage> {
  const hash = normalizeTransactionHash(hashInput);
  const { rpcUrl } = getExplorerRpcConfig();

  if (!isTransactionHash(hash)) {
    return {
      hash,
      rpcUrl,
      status: { status: "malformed", reason: "Malformed transaction hash" },
      receipt: null,
    };
  }

  try {
    let rawReceipt: unknown;
    // Capture the same response the native client validates, including future fields.
    const { client } = await createExplorerThruputClient((method, response) => {
      if (method === "getTransactionReceipt") rawReceipt = response;
    });
    const request = { transactionHash: hashFromBase58(hash) };
    const [statusResult, receiptResult, tipResult] = await Promise.allSettled([
      client.getTransactionStatus(request),
      client.getTransactionReceipt(request),
      client.getChainTip(),
    ]);
    const receipt =
      receiptResult.status === "fulfilled" ? receiptResult.value : null;
    let status: TransactionStatusView =
      statusResult.status === "fulfilled"
        ? formatTransactionStatus(statusResult.value)
        : { status: "unavailable", error: toRpcFailure(statusResult.reason) };

    // A receipt is commitment evidence even if the parallel status read failed or lagged.
    if (receipt)
      status = { status: "committed", height: receipt.blockHeight.toString() };
    if (
      receiptResult.status === "rejected" &&
      receiptResult.reason instanceof NativeRpcError
    ) {
      const decoded = receiptResult.reason.decoded;
      if (
        decoded.classification === "known" &&
        decoded.data.kind === "backendDataInvalid" &&
        decoded.data.observation
      ) {
        status = {
          status: "committed",
          height: decoded.data.observation.blockHeight.toString(),
        };
      }
    }

    const execution = receipt?.execution;
    let inputPromise: Promise<TransactionInputView> | undefined;
    return {
      hash,
      rpcUrl,
      status,
      loadInput: () =>
        (inputPromise ??= loadTransactionInput(client, hash, receipt)),
      chainTipHeight:
        tipResult.status === "fulfilled"
          ? tipResult.value.blockHeight.toString()
          : undefined,
      receiptError:
        receiptResult.status === "rejected"
          ? toRpcFailure(receiptResult.reason)
          : undefined,
      loadEnrichedEvents: receipt?.events.length
        ? () => enrichTransactionEvents(client, receipt)
        : undefined,
      receipt:
        receipt && execution
          ? {
              txHash: toBase58(receipt.transactionHash),
              height: receipt.blockHeight.toString(),
              execution:
                "result" in execution ? execution.result : "unsupported",
              gasUsed: receipt.gasUsed.toString(),
              returnData:
                "returnData" in execution
                  ? toHex0x(execution.returnData)
                  : null,
              abortData:
                "abortData" in execution ? toHex0x(execution.abortData) : null,
              events: receipt.events.map((event) =>
                formatEvent(
                  event,
                  getBuiltInTokenMetadata(toBase58(event.address)),
                ),
              ),
              rawJson:
                rawReceipt == null ? undefined : stringifyJson(rawReceipt),
            }
          : null,
    };
  } catch (error) {
    return {
      hash,
      rpcUrl,
      status: { status: "unavailable", error: toRpcFailure(error) },
      receipt: null,
    };
  }
}

async function enrichTransactionEvents(
  client: ThruputClient,
  receipt: TransactionReceipt,
): Promise<EventView[]> {
  const events = receipt.events;
  const metadataByAddress = new Map<string, TokenMetadata | undefined>();
  const previews = new Map<number, SpecEventPreview>();
  const identified = events.map((event, sequenceNumber) => ({
    event,
    sequenceNumber,
    transactionHash: receipt.transactionHash,
    blockHeight: receipt.blockHeight,
  }));
  const addresses = [
    ...new Set(events.map((event) => toBase58(event.address))),
  ];
  // Bound optional enrichment; all receipt events remain visible even beyond this budget.
  for (let offset = 0; offset < Math.min(addresses.length, 32); offset += 4) {
    await Promise.all(
      addresses.slice(offset, Math.min(offset + 4, 32)).map(async (address) => {
        const [metadata, spec] = await Promise.all([
          getTokenMetadata(client, address),
          getBuiltInTokenMetadata(address)
            ? undefined
            : loadContractSpec(client, address, Promise.resolve(identified)),
        ]);
        metadataByAddress.set(address, metadata);
        if (spec?.status === "available")
          for (const preview of spec.eventPreviews)
            previews.set(preview.sequenceNumber, preview);
      }),
    );
  }
  return events.map((event, index) => {
    const view = formatEvent(
      event,
      metadataByAddress.get(toBase58(event.address)) ??
        getBuiltInTokenMetadata(toBase58(event.address)),
    );
    const preview = previews.get(index);
    return preview ? { ...view, specEvent: preview } : view;
  });
}

function formatEvent(event: EmittedEvent, metadata?: TokenMetadata): EventView {
  return {
    contractAddress: toBase58(event.address),
    contractName: metadata?.name,
    topics: event.topics.map(toHex0x),
    data: toHex0x(event.data),
    decoded:
      metadata?.decimals !== undefined
        ? decodeTokenEvent(event, metadata)
        : undefined,
  };
}

function formatTransactionStatus(
  status: SdkTransactionStatus,
): TransactionStatusView {
  if (!("status" in status))
    return { status: "unsupported", rawJson: stringifyJson(status.raw) };
  if (status.status === "committed")
    return { status: "committed", height: status.blockHeight.toString() };
  if (status.status === "recentFailure") {
    return {
      status: "recentFailure",
      attemptHeight: status.attemptBlockHeight.toString(),
      cause: formatFailureCause(status.cause),
    };
  }
  if (
    status.status === "pending" ||
    status.status === "retry" ||
    status.status === "dropped"
  ) {
    const recentFailure = status.recentFailure
      ? {
          recentFailure: {
            attemptHeight: status.recentFailure.attemptBlockHeight.toString(),
            cause: formatFailureCause(status.recentFailure.cause),
          },
        }
      : {};
    if (status.status === "pending")
      return { status: "pending", ...recentFailure };
    return {
      status: status.status,
      error: {
        code: status.error.code,
        source: formatDiagnostic(status.error.source),
      },
      ...recentFailure,
    };
  }
  return status;
}

function formatDiagnostic(value: string | { raw: unknown }) {
  return typeof value === "string"
    ? value
    : `Unsupported: ${stringifyJson(value.raw)}`;
}

function formatFailureCause(
  cause: TransactionFailureCause,
): TransactionFailureCauseView {
  if (!("kind" in cause))
    return { kind: "unsupported", rawJson: stringifyJson(cause.raw) };
  if (cause.kind === "dbConflict") {
    return {
      kind: "dbConflict",
      conflict: {
        address: toBase58(cause.conflict.address),
        key: toHex0x(cause.conflict.key),
        code: formatDiagnostic(cause.conflict.code),
      },
    };
  }
  if (cause.kind === "contractRejected") {
    return {
      kind: "contractRejected",
      contractIndex: cause.contractIndex,
      code: formatDiagnostic(cause.code),
    };
  }
  return cause;
}
