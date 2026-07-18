import { hashFromHex, toHex0x, type TransactionStatus as SdkTransactionStatus } from "@groundhogchain/client";

import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

import { createExplorerGroundhogClient } from "./client";
import { getContractInfo, loadContractRegistry } from "./contract-registry";
import { decodeGeneratedEvent } from "./contract-events";
import { stringifyJson } from "./format";
import { toRpcFailure } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import { getTokenMetadata, type TokenMetadata } from "./token-metadata";
import type { TransactionPageData } from "./types";

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
    const contractRegistry = await loadContractRegistry();

    const metadataByAddress = new Map<string, TokenMetadata | undefined>();
    if (receipt) {
      await Promise.all(
        Array.from(new Set(receipt.events.map((event) => toHex(event.contractAddress))))
          .filter((contractAddress) => getContractInfo(contractRegistry, contractAddress)?.token)
          .map(async (contractAddress) => {
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
              const contract = getContractInfo(contractRegistry, contractAddress);
              const eventView = {
                contractAddress,
                contractName: contract?.name,
                topics: event.topics.map(toHex),
                data: toHex(event.data),
              };

              return {
                ...eventView,
                contractName: metadataByAddress.get(contractAddress)?.name ?? eventView.contractName,
                decoded: decodeTokenEvent(event, contract, metadataByAddress.get(contractAddress)) ?? decodeGeneratedEvent(event, contract),
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
