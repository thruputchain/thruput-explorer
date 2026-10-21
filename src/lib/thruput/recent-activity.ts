import { cache } from "react";
import { toBase58 } from "@thruputchain/client";

import { loadBlock, loadBlockTransactions } from "./blocks";
import { checkBlockContinuation } from "./block-pagination";
import { createExplorerThruputClient } from "./client";
import { loadTransactionActivity } from "./transaction-activity";

const readBlock = cache(loadBlock);
const readPage = cache(loadBlockTransactions);
export const ACTIVITY_SCAN_BLOCK_LIMIT = 50;
export const ACTIVITY_BLOCK_PAGE_LIMIT = 4;

async function readTransactionPages(height: string, maxHashes = Infinity) {
  const first = await readPage(height);
  if (first.status !== "ok") throw new Error("Block index unavailable");
  let page = first.data;
  const hashes = [...page.hashes];
  const seenHashes = new Set(hashes);
  const cursors = new Set<string>();
  let pages = 1;
  while (page.cursor !== "0x" && hashes.length < maxHashes && pages < ACTIVITY_BLOCK_PAGE_LIMIT) {
    cursors.add(page.cursor);
    const next = await readPage(height, page.cursor);
    if (next.status !== "ok" || !checkBlockContinuation(page, next.data, cursors) || next.data.hashes.some((hash) => seenHashes.has(hash))) {
      throw new Error("Block pagination unavailable");
    }
    for (const hash of next.data.hashes) seenHashes.add(hash);
    hashes.push(...next.data.hashes);
    page = next.data;
    pages++;
  }
  return { hashes: hashes.slice(0, maxHashes), oldest: BigInt(page.oldest), complete: page.cursor === "0x" };
}

export async function readActivityBlock(height: string) {
  const [metadata, transactions] = await Promise.all([readBlock(height), readTransactionPages(height)]);
  return {
    height,
    proposer: metadata.status === "ok" ? toBase58(metadata.data.proposer) : null,
    timestamp: metadata.status === "ok" ? Number(metadata.data.blockTimepoint / 1_000_000n) : null,
    ...transactions,
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
  let limited = false;
  try {
    const tip = await readTip();
    let oldest = 1n;
    const seen = new Set<string>();
    let height = tip;
    let scanned = 0;
    for (; height >= oldest && height >= 1n && refs.length < 10 && scanned < ACTIVITY_SCAN_BLOCK_LIMIT; height--, scanned++) {
      const page = await readTransactionPages(height.toString(), 10 - refs.length);
      oldest = page.oldest;
      const metadata = page.hashes.length > 0 ? await readBlock(height.toString()) : null;
      const timestamp = metadata?.status === "ok" ? Number(metadata.data.blockTimepoint / 1_000_000n) : null;
      for (const hash of page.hashes) {
        if (seen.has(hash)) continue;
        seen.add(hash);
        refs.push({ hash, height: height.toString(), timestamp });
        if (refs.length === 10) break;
      }
      if (!page.complete && refs.length < 10) {
        limited = true;
        break;
      }
    }
    limited ||= refs.length < 10 && height >= oldest && height >= 1n;
  } catch {
    unavailable = true;
  }
  const transactions = await loadTransactionActivity(refs);
  return { transactions, unavailable, limited };
}
