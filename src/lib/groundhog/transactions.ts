import { getTransactionReceipt, hashFromHex, toHex0x, type EmittedEvent, type GroundhogClient, type TransactionStatus as SdkTransactionStatus } from "@groundhogchain/client";
import { ExecResult } from "@groundhogchain/protocol";

import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

import { createExplorerGroundhogClient, getExplorerRpcConfig } from "./client";
import { stringifyJson } from "./format";
import { toRpcFailure } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import { getBuiltInTokenMetadata, getTokenMetadata, type TokenMetadata } from "./token-metadata";
import type { EventView, TransactionPageData } from "./types";

export type LoadedTransactionPage = TransactionPageData & {
  loadEnrichedEvents?: () => Promise<EventView[]>;
};

export async function loadTransactionPageData(hashInput: string): Promise<LoadedTransactionPage> {
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
    const { transport, client } = await createExplorerGroundhogClient();
    const txHash = hashFromHex(hash);

    let rawReceipt: unknown;
    // Capture the response consumed by the SDK validator, rather than issue a
    // second request that could observe a different receipt.
    const receiptRequest = getTransactionReceipt({
      async request<T>(method: string, params?: unknown[]) {
        const response = await transport.request<T>(method, params);
        rawReceipt = response;
        return response;
      },
    }, txHash);
    const [status, receipt, chainTip] = await Promise.all([
      client.getTransactionStatus(txHash),
      receiptRequest,
      client.getChainTip().catch(() => undefined),
    ]);

    return {
      hash,
      rpcUrl,
      status: formatTransactionStatus(status),
      chainTipHeight: chainTip?.height.toString(),
      loadEnrichedEvents: receipt?.events.length
        ? () => enrichTransactionEvents(client, receipt.events)
        : undefined,
      receipt: receipt
        ? {
            txHash: toHex(receipt.txHash),
            height: receipt.height.toString(),
            execResult: formatExecResult(receipt.execResult),
            returnData: receipt.returnData ? toHex(receipt.returnData) : null,
            abortData: receipt.abortData ? toHex(receipt.abortData) : null,
            events: receipt.events.map((event) => formatEvent(event, getBuiltInTokenMetadata(toHex(event.contractAddress)))),
            rawJson: rawReceipt == null ? undefined : stringifyJson(rawReceipt),
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

async function enrichTransactionEvents(client: GroundhogClient, events: EmittedEvent[]): Promise<EventView[]> {
  const metadataByAddress = new Map<string, TokenMetadata | undefined>();
  await Promise.all(Array.from(new Set(events.map((event) => toHex(event.contractAddress)))).map(async (address) => {
    metadataByAddress.set(address, await getTokenMetadata(client, address));
  }));
  return events.map((event) => formatEvent(event, metadataByAddress.get(toHex(event.contractAddress))));
}

function formatEvent(event: EmittedEvent, metadata?: TokenMetadata): EventView {
  return {
    contractAddress: toHex(event.contractAddress),
    contractName: metadata?.name,
    topics: event.topics.map(toHex),
    data: toHex(event.data),
    // Names and symbols alone cannot establish the token amount scale.
    decoded: metadata?.decimals !== undefined ? decodeTokenEvent(event, metadata) : undefined,
  };
}

function formatTransactionStatus(status: SdkTransactionStatus) {
  if (status.status === "committed") return { status: "committed" as const, height: status.height.toString() };
  if (status.status === "recentFailure") {
    return {
      status: "recentFailure" as const,
      attemptHeight: status.attemptHeight.toString(),
      conflict: {
        address: toHex(status.conflict.address),
        key: toHex(status.conflict.key),
        code: status.conflict.code,
      },
    };
  }

  return status;
}

function toHex(value: Uint8Array) {
  return toHex0x(value);
}

function formatExecResult(value: number) {
  switch (value) {
    case ExecResult.ExecResultOK:
      return "ok";
    case ExecResult.ExecResultTxDeterministicError:
      return "deterministicError";
    case ExecResult.ExecResultTxRootFrameReverted:
      return "reverted";
    case ExecResult.ExecResultTxNonDeterministicError:
      return "nonDeterministicError";
    case ExecResult.ExecResultFailedGasSponsorship:
      return "failedGasSponsorship";
    case ExecResult.ExecResultTxValidationFailure:
      return "validationFailure";
    case ExecResult.ExecResultSystemError:
      return "systemError";
    case ExecResult.ExecResultUnrecoverable:
      return "unrecoverable";
    default:
      return `unknown (${value})`;
  }
}
