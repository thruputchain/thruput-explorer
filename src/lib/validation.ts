import { fixedFromBase58 } from "@thruputchain/client";

export function isBlockHeight(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const height = value.trim();
  return /^(0|[1-9][0-9]{0,18})$/.test(height) && BigInt(height) <= 9_223_372_036_854_775_807n;
}

export function isTransactionHash(value: string) {
  try {
    fixedFromBase58(value.trim(), 32);
    return true;
  } catch {
    return false;
  }
}

export function normalizeTransactionHash(value: string) {
  return value.trim();
}

export function isContractAddress(value: string) {
  return isTransactionHash(value);
}

export function normalizeContractAddress(value: string) {
  return value.trim();
}
