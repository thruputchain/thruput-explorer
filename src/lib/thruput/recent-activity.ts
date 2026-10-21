import { cache } from "react";
import { toBase58 } from "@thruputchain/client";

import { loadBlock, loadBlockTransactions } from "./blocks";
import { checkBlockContinuation } from "./block-pagination";
import { createExplorerThruputClient } from "./client";
import { loadTransactionActivity } from "./transaction-activity";

const readBlock = cache(loadBlock);

export async function readActivityBlock(height: string) {
  const [metadata, first] = await Promise.all([readBlock(height), loadBlockTransactions(height)]);
  if (first.status !== "ok") throw new Error("Block index unavailable");
  let page = first.data;
  const hashes = [...page.hashes];
  const seenHashes = new Set(hashes);
  const cursors = new Set<string>();
  while (page.cursor !== "0x") {
    cursors.add(page.cursor);
    const next = await loadBlockTransactions(height, page.cursor);
    if (next.status !== "ok" || !checkBlockContinuation(page, next.data, cursors) || next.data.hashes.some((hash) => seenHashes.has(hash))) {
      throw new Error("Block pagination unavailable");
    }
    for (const hash of next.data.hashes) seenHashes.add(hash);
    hashes.push(...next.data.hashes);
    page = next.data;
  }
  return {
    height,
    proposer: metadata.status === "ok" ? toBase58(metadata.data.proposer) : null,
    timestamp: metadata.status === "ok" ? Number(metadata.data.blockTimepoint / 1_000_000n) : null,
    hashes,
    oldest: BigInt(page.oldest),
  };
}

const readIndexedBlock = cache(readActivityBlock);
const readTip = cache(async () => {
  const { client } = await createExplorerThruputClient();
  const { height } = await client.getChainTip();
  if (height < 1n) return height;
  const coverage = await client.getTransactionsByBlock({ height, cursor: new Uint8Array(), limit: 50, order: "ascending" });
  return coverage.latestBlock < height ? coverage.latestBlock : height;
});

export async function loadRecentActivityBlocks() {
  try {
    const tip = await readTip();
    if (tip < 1n) return { blocks: [], unavailable: false };
    const first = await readIndexedBlock(tip.toString());
    const heights: bigint[] = [];
    for (let height = tip - 1n; height >= first.oldest && height >= 1n && heights.length < 9; height--) heights.push(height);
    const rest = await Promise.allSettled(heights.map((height) => readIndexedBlock(height.toString())));
    return { blocks: [first, ...rest.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])], unavailable: rest.some((result) => result.status === "rejected") };
  } catch {
    return { blocks: [], unavailable: true };
  }
}

export async function loadRecentActivityTransactions() {
  const refs: { hash: string; height: string; timestamp: number | null }[] = [];
  let unavailable = false;
  try {
    const tip = await readTip();
    let oldest = 1n;
    const seen = new Set<string>();
    for (let height = tip; height >= oldest && height >= 1n && refs.length < 10; height--) {
      const block = await readIndexedBlock(height.toString());
      oldest = block.oldest;
      for (const hash of block.hashes) {
        if (seen.has(hash)) continue;
        seen.add(hash);
        refs.push({ hash, height: block.height, timestamp: block.timestamp });
        if (refs.length === 10) break;
      }
    }
  } catch {
    unavailable = true;
  }
  const transactions = await loadTransactionActivity(refs);
  return { transactions, unavailable };
}
