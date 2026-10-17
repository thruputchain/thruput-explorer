const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const CONTRACT_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function isBlockHeight(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const height = value.trim();
  return /^(0|[1-9][0-9]{0,18})$/.test(height) && BigInt(height) <= 9_223_372_036_854_775_807n;
}

export function isTransactionHash(value: string) {
  return TX_HASH_PATTERN.test(value.trim());
}

export function normalizeTransactionHash(value: string) {
  return value.trim().toLowerCase();
}

export function isContractAddress(value: string) {
  return CONTRACT_ADDRESS_PATTERN.test(value.trim());
}

export function normalizeContractAddress(value: string) {
  return value.trim().toLowerCase();
}
