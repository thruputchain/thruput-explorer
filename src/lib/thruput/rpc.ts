import { isThruputError } from "@thruputchain/client";

import type { RpcFailure } from "./types";

/** A JSON-RPC error object from the endpoint, decoded or not. */
function rpcErrorObject(error: unknown) {
  return isThruputError(error, "rpcError") || isThruputError(error, "nativeRpcError")
    ? error
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
  const rpc = rpcErrorObject(error);
  if (rpc) {
    return {
      message: kind && messages[kind] ? messages[kind] : rpc.message,
      code: rpc.context.code,
      ...(rpc.context.method === undefined ? {} : { method: rpc.context.method }),
    };
  }

  return { message: error instanceof Error ? error.message : "Unable to reach Thruput RPC" };
}

export function isUnsupportedRpcError(error: unknown) {
  return isThruputError(error, "rpcIncompatible") || rpcErrorObject(error)?.context.code === -32601;
}

export function rpcErrorKind(error: unknown) {
  return isThruputError(error, "nativeRpcError") && error.context.kind !== "unrecognized"
    ? error.context.kind
    : undefined;
}
