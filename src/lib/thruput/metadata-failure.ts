import { RpcCompatibilityError } from "@thruputchain/client";
import { ContractVerificationError } from "@thruputchain/client/contract";

export function metadataFailure(error: unknown): string {
  if (error instanceof ContractVerificationError)
    return "Metadata verification failed; raw data remains available.";
  if (error instanceof RpcCompatibilityError)
    return "This endpoint does not support metadata discovery.";
  return "Metadata is unavailable from this endpoint.";
}
