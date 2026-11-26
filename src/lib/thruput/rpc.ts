import { isThruputError } from "@thruputchain/client";

import type { RpcFailure } from "./types";

/** A JSON-RPC error object from the endpoint, decoded or not. */
function rpcErrorFields(error: unknown) {
  return isThruputError(error, "rpcError") || isThruputError(error, "nativeRpcError")
    ? error.context
    : undefined;
}

export function toRpcFailure(error: unknown): RpcFailure {
  const kind = rpcErrorKind(error);
  const messages: Record<string, string> = {
    invalidCursor: "This continuation is no longer valid. Reload to start a fresh list.",
    historyUnavailable: "History is outside the available index coverage.",
    stateHeightUnavailable: "The requested state height is not available yet.",
    backendDataInvalid: "The RPC could not provide valid data.",
  };
  const fields = rpcErrorFields(error);
  if (fields) {
    return {
      message: kind && messages[kind] ? messages[kind] : (error as Error).message,
      code: fields.code,
      ...(fields.method === undefined ? {} : { method: fields.method }),
    };
  }

  return { message: error instanceof Error ? error.message : "Unable to reach Thruput RPC" };
}

export function isUnsupportedRpcError(error: unknown) {
  return isThruputError(error, "rpcIncompatible") || rpcErrorFields(error)?.code === -32601;
}

export function rpcErrorKind(error: unknown) {
  return isThruputError(error, "nativeRpcError") && error.context.kind !== "unrecognized"
    ? error.context.kind
    : undefined;
}
