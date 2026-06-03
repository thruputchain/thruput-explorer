import { HttpTransport, createGroundhogClient, hashFromHex, toHex0x } from "@groundhogchain/client";

import { isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

import { getContractInfo, getContractName } from "./contract-registry";
import { stringifyJson } from "./format";
import { getGroundhogRpcUrl, getRawTransactionReceipt } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import type {
  RpcFailure,
  TransactionPageData,
} from "./types";

export async function loadTransactionPageData(hashInput: string): Promise<TransactionPageData> {
  const hash = normalizeTransactionHash(hashInput);

  if (!isTransactionHash(hash)) {
    return {
      hash,
      rpcUrl: getGroundhogRpcUrl(),
      status: { status: "malformed", reason: "Malformed transaction hash" },
      receipt: null,
    };
  }

  try {
    const client = createClient();
    const txHash = hashFromHex(hash);

    const [status, receipt, chainTip, rawReceipt] = await Promise.all([
      client.getTransactionStatus(txHash),
      client.getTransactionReceipt(txHash),
      client.getChainTip(),
      getRawTransactionReceipt(hash).catch(() => undefined),
    ]);

    return {
      hash,
      rpcUrl: getGroundhogRpcUrl(),
      status: status.status === "committed" ? { status: "committed", height: status.height.toString() } : status,
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
              const contract = getContractInfo(contractAddress);
              const eventView = {
                contractAddress,
                contractName: getContractName(contractAddress),
                topics: event.topics.map(toHex),
                data: toHex(event.data),
              };

              return {
                ...eventView,
                decoded: decodeTokenEvent(event, contract),
              };
            }),
            rawJson: rawReceipt == null ? undefined : stringifyJson(rawReceipt),
          }
        : null,
    };
  } catch (error) {
    return {
      hash,
      rpcUrl: getGroundhogRpcUrl(),
      status: { status: "unavailable", error: toRpcFailure(error) },
      receipt: null,
    };
  }
}

function createClient() {
  return createGroundhogClient(new HttpTransport(getGroundhogRpcUrl()));
}

function toRpcFailure(error: unknown): RpcFailure {
  if (error instanceof Error && "code" in error && typeof error.code === "number") {
    return { message: error.message, code: error.code };
  }
  return { message: error instanceof Error ? error.message : "Unable to reach Groundhog RPC" };
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
