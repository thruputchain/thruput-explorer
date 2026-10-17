import { ThruputRpcErrorCode, JsonRpcError } from "@thruputchain/client";

import type { RpcFailure } from "./types";

export function toRpcFailure(error: unknown): RpcFailure {
  if (error instanceof JsonRpcError) {
    return {
      message: error.message,
      code: error.code,
      method: error.method,
    };
  }

  return { message: error instanceof Error ? error.message : "Unable to reach Thruput RPC" };
}

export function isUnsupportedRpcError(error: unknown) {
  return error instanceof JsonRpcError && error.code === ThruputRpcErrorCode.NotImplemented;
}
