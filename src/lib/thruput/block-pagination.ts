import type { BlockPage } from "./blocks";
import { hashFromBase58 } from "@thruputchain/client";

export function checkBlockContinuation(
  previous: BlockPage,
  next: BlockPage,
  seen: ReadonlySet<string | null>,
): boolean {
  // The index tip may advance normally. Pruned history invalidates the walk.
  if (
    previous.oldest !== next.oldest ||
    BigInt(next.latest) < BigInt(previous.latest)
  )
    return false;
  if (next.cursor !== null && seen.has(next.cursor)) return false;
  const last = previous.hashes.at(-1);
  if (!last) return true;
  const bytes = hashFromBase58(last);
  return next.hashes.every((hash) => {
    const nextBytes = hashFromBase58(hash);
    const index = nextBytes.findIndex((byte, i) => byte !== bytes[i]);
    return index !== -1 && nextBytes[index] > bytes[index];
  });
}
