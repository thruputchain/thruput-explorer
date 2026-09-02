import { hashFromHex, toHex0x, type EmittedEvent, type TransactionStatus as SdkTransactionStatus } from "@groundhogchain/client";
import { ExecResult } from "@groundhogchain/protocol";

import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

import { createExplorerGroundhogClient } from "./client";
import { stringifyJson } from "./format";
import { toRpcFailure } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import { getTokenMetadata, type TokenMetadata } from "./token-metadata";
import type { TransactionPageData } from "./types";

const METADATA_LOOKUP_LIMIT = 10;

export async function loadTransactionPageData(hashInput: string): Promise<TransactionPageData> {
  const hash = normalizeTransactionHash(hashInput);
  const { rpcUrl, transport, client } = createExplorerGroundhogClient();

  if (!isTransactionHash(hash)) {
    return {
      hash,
      rpcUrl,
      status: { status: "malformed", reason: "Malformed transaction hash" },
      receipt: null,
    };
  }

  try {
    const txHash = hashFromHex(hash);

    const [status, receipt, chainTip, rawReceipt] = await Promise.all([
      client.getTransactionStatus(txHash),
      client.getTransactionReceipt(txHash),
      client.getChainTip(),
      transport.request<unknown>("groundhog_getTransactionReceipt", [hash]).catch(() => undefined),
    ]);
    const metadataByAddress = new Map<string, TokenMetadata | undefined>();
    if (receipt) {
      await Promise.all(
        collectTokenContractAddresses(receipt.events).map(async (contractAddress) => {
          metadataByAddress.set(contractAddress, await getTokenMetadata(client, contractAddress));
        }),
      );
    }

    return {
      hash,
      rpcUrl,
      status: formatTransactionStatus(status),
      chainTipHeight: chainTip.height.toString(),
      receipt: receipt
        ? {
            txHash: toHex(receipt.txHash),
            height: receipt.height.toString(),
            execResult: formatExecResult(receipt.execResult),
            returnData: receipt.returnData ? toHex(receipt.returnData) : null,
            abortData: receipt.abortData ? toHex(receipt.abortData) : null,
            events: receipt.events.map((event) => {
              const contractAddress = toHex(event.contractAddress);

              return {
                contractAddress,
                contractName: metadataByAddress.get(contractAddress)?.name,
                topics: event.topics.map(toHex),
                data: toHex(event.data),
                decoded: decodeTokenEvent(event, metadataByAddress.get(contractAddress)),
              };
            }),
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

/**
 * Each distinct contract costs three ERC20 metadata view calls, so an unbounded lookup
 * lets a single receipt fan one anonymous page view out into hundreds of RPC requests.
 * Only contracts that actually emit a decodable token event are worth looking up, and
 * even those are capped. Events whose metadata is missing still render (without a symbol
 * or scaled amount), so truncation degrades instead of breaking the page.
 */
function collectTokenContractAddresses(events: readonly EmittedEvent[]) {
  const contractAddresses = new Set<string>();

  for (const event of events) {
    if (contractAddresses.size >= METADATA_LOOKUP_LIMIT) break;
    if (!decodeTokenEvent(event)) continue;
    contractAddresses.add(toHex(event.contractAddress));
  }

  return Array.from(contractAddresses);
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
