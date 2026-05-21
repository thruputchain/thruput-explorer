import type { RpcFailure, RpcResult } from "./types";

const DEFAULT_RPC_URL = "http://localhost:9545";

type JsonRpcResponse<T> = {
  result?: T;
  error?: {
    code?: number;
    message?: string;
  };
};

export function getGroundhogRpcUrl() {
  return process.env.GROUNDHOG_RPC_URL ?? DEFAULT_RPC_URL;
}

export async function rpcRequest<T>(method: string, params: unknown[] = []): Promise<RpcResult<T>> {
  try {
    const response = await fetch(getGroundhogRpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    });

    if (!response.ok) {
      return failure(`HTTP ${response.status} from Groundhog RPC`);
    }

    const payload = (await response.json()) as JsonRpcResponse<T>;

    if (payload.error) {
      return failure(payload.error.message ?? "Groundhog RPC error", payload.error.code);
    }

    return { ok: true, data: payload.result as T };
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Unable to reach Groundhog RPC");
  }
}

export function getTransactionStatus(hash: string) {
  return rpcRequest<unknown>("groundhog_getTransactionStatus", [hash]);
}

export function getTransactionReceipt(hash: string) {
  return rpcRequest<unknown>("groundhog_getTransactionReceipt", [hash]);
}

export function getChainTip() {
  return rpcRequest<unknown>("groundhog_chainTip");
}

function failure(message: string, code?: number): { ok: false; error: RpcFailure } {
  return { ok: false, error: { message, code } };
}
