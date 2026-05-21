export function formatMaybeHex(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return null;
  return String(value);
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
}

export function formatFreshness(height?: string, tipHeight?: string) {
  if (!height || !tipHeight) return null;
  const txHeight = BigInt(height);
  const tip = BigInt(tipHeight);
  const confirmations = tip >= txHeight ? tip - txHeight + BigInt(1) : BigInt(0);
  return `${confirmations.toString()} confirmation${confirmations === BigInt(1) ? "" : "s"}`;
}
