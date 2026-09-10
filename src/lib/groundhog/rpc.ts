import { GroundhogRpcErrorCode, JsonRpcError } from "@groundhogchain/client";

import type { RpcFailure } from "./types";

export type RpcCapability<T> =
  | { status: "supported"; data: T }
  | { status: "unsupported"; error: RpcFailure }
  | { status: "unavailable"; error: RpcFailure };

export async function probeRpcCapability<T>(load: () => Promise<T>): Promise<RpcCapability<T>> {
  try {
    return { status: "supported", data: await load() };
  } catch (error) {
    const failure = toRpcFailure(error);
    return isUnsupportedRpcError(error)
      ? { status: "unsupported", error: failure }
      : { status: "unavailable", error: failure };
  }
}

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
  return error instanceof JsonRpcError && error.code === GroundhogRpcErrorCode.NotImplemented;
}
