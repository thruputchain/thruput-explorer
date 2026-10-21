import { JsonRpcError, NativeRpcError, RpcCompatibilityError } from "@thruputchain/client";

import type { RpcFailure } from "./types";

export function toRpcFailure(error: unknown): RpcFailure {
  const kind = rpcErrorKind(error);
  const messages: Record<string, string> = {
    invalidCursor: "This continuation is no longer valid. Reload to start a fresh list.",
    historyUnavailable: "History is outside the available index coverage.",
    stateHeightUnavailable: "The requested state height is not available yet.",
    backendDataInvalid: "The RPC could not provide valid data.",
  };
  if (error instanceof JsonRpcError) {
    return {
      message: kind && messages[kind] ? messages[kind] : error.message,
      code: error.code,
      method: error.method,
    };
  }

  return { message: error instanceof Error ? error.message : "Unable to reach Thruput RPC" };
}

export function isUnsupportedRpcError(error: unknown) {
  return error instanceof RpcCompatibilityError || (error instanceof JsonRpcError && error.code === -32601);
}

export function rpcErrorKind(error: unknown) {
  return error instanceof NativeRpcError && error.decoded.classification === "known" ? error.decoded.data.kind : undefined;
}
