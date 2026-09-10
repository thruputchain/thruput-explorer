// Client-safe number and time formatting for the live page.

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatInteger(value: number | bigint | string) {
  return integer.format(typeof value === "string" ? BigInt(value) : value);
}

/** Rates under 100 keep one decimal so low traffic still reads as a number. */
export function formatRate(value: number) {
  return value >= 100 ? integer.format(Math.round(value)) : oneDecimal.format(value);
}

export function formatSeconds(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
}

export function formatAge(observedAt: number | null, now: number) {
  return observedAt === null ? "before the stream started" : `${formatSeconds(now - observedAt)} ago`;
}

export function shortenHex(value: string) {
  return value.length <= 18 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}
