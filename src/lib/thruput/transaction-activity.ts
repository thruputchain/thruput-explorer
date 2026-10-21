import { cache } from "react";
import { hashFromBase58, toBase58 } from "@thruputchain/client";

import { loadBlock } from "./blocks";
import { createExplorerThruputClient } from "./client";
import { decodeTokenEvent } from "./token-events";
import { getBuiltInTokenMetadata } from "./token-metadata";

const readTimestamp = cache(async (height: string) => {
  const block = await loadBlock(height);
  return block.status === "ok" ? Number(block.data.blockTimepoint / 1_000_000n) : null;
});

export async function loadTransactionActivity(refs: { hash: string; height: string; timestamp?: number | null }[]) {
  if (refs.length === 0) return [];
  const connection = await createExplorerThruputClient().catch(() => null);
  const timestamps = new Map<string, Promise<number | null>>();
  for (const ref of refs) {
    if (!timestamps.has(ref.height)) timestamps.set(ref.height, ref.timestamp === undefined ? readTimestamp(ref.height) : Promise.resolve(ref.timestamp));
  }
  return Promise.all(refs.map(async (ref) => {
    const receiptRequest = connection?.client.getTransactionReceipt({ transactionHash: hashFromBase58(ref.hash) }).catch(() => null);
    const [timestamp, receipt] = await Promise.all([timestamps.get(ref.height), receiptRequest]);
    const base = { hash: ref.hash, height: ref.height, timestamp: timestamp ?? null };
    if (!receipt || receipt.blockHeight.toString() !== ref.height) return { ...base, result: null, events: [] };
    const events = receipt.events.flatMap((event) => {
      const metadata = getBuiltInTokenMetadata(toBase58(event.address));
      const decoded = decodeTokenEvent(event, metadata);
      return decoded ? [decoded] : [];
    });
    return { ...base, result: "result" in receipt.execution ? receipt.execution.result : "unsupported", events };
  }));
}

export type TransactionActivity = Awaited<ReturnType<typeof loadTransactionActivity>>[number];
