const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export function isTransactionHash(value: string) {
  return TX_HASH_PATTERN.test(value.trim());
}

export function normalizeTransactionHash(value: string) {
  return value.trim().toLowerCase();
}
