import { isThruputError } from "@thruputchain/client";

export function metadataFailure(error: unknown): string {
  if (isThruputError(error, "contractVerificationFailed"))
    return "Metadata verification failed; raw data remains available.";
  if (isThruputError(error, "rpcIncompatible"))
    return "This endpoint does not support metadata discovery.";
  return "Metadata is unavailable from this endpoint.";
}
