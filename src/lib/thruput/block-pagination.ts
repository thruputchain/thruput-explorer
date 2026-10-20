import type { BlockPage } from "./blocks";

export function checkBlockContinuation(
  previous: BlockPage,
  next: BlockPage,
  seen: ReadonlySet<string>,
): boolean {
  // The index tip may advance normally. Pruned history invalidates the walk.
  if (
    previous.oldest !== next.oldest ||
    BigInt(next.latest) < BigInt(previous.latest)
  )
    return false;
  if (next.cursor !== "0x" && seen.has(next.cursor)) return false;
  const last = previous.hashes.at(-1);
  return !last || next.hashes.every((hash) => hash > last);
}
