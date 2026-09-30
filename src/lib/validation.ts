import { bytesToHex0x, parseContractAddress } from "@/lib/address";

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function isTransactionHash(value: string) {
  return TX_HASH_PATTERN.test(value.trim());
}

export function normalizeTransactionHash(value: string) {
  return value.trim().toLowerCase();
}

/** Whether the value is a C StrKey or 0x-prefixed 32-byte hex address. */
export function isContractAddress(value: string) {
  return parseContractAddress(value) !== null;
}

/**
 * Canonical 0x hex form of a C StrKey or hex address, which is what the RPC
 * client takes. Text that is not an address is returned trimmed and lowercased.
 */
export function normalizeContractAddress(value: string) {
  const bytes = parseContractAddress(value);
  return bytes ? bytesToHex0x(bytes) : value.trim().toLowerCase();
}
