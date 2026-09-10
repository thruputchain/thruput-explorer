import { isContractAddress, normalizeContractAddress } from "@/lib/validation";

import { NATIVE_HOG_ADDRESS } from "../client";

/** `kMaxContractAddressesPerEventFilter` in `protocol/indexer.x`. */
export const ADDRESSES_PER_FILTER = 5;
/** `kMaxEventFiltersPerQuery` in `protocol/indexer.x`. */
export const FILTERS_PER_QUERY = 5;
export const MAX_LIVE_CONTRACTS = ADDRESSES_PER_FILTER * FILTERS_PER_QUERY;
export const DEFAULT_LAG_BLOCKS = 3;
const MAX_LAG_BLOCKS = 50;

export type LiveConfig = {
  /** Lowercase `0x` contract addresses whose events identify counted transactions. */
  contracts: string[];
  /** Blocks to stay behind the indexer tip before publishing a block as settled. */
  lagBlocks: number;
};

export function parseLiveConfig(env: Record<string, string | undefined> = process.env): LiveConfig {
  const rawContracts = env.LIVE_CONTRACT_ADDRESSES?.trim();
  const contracts = rawContracts
    ? [...new Set(rawContracts.split(/[\s,]+/).filter(Boolean).map(normalizeContractAddress))]
    : [NATIVE_HOG_ADDRESS];
  for (const contract of contracts) {
    if (!isContractAddress(contract)) {
      throw new Error(`LIVE_CONTRACT_ADDRESSES contains an invalid address: ${contract}`);
    }
  }
  if (contracts.length > MAX_LIVE_CONTRACTS) {
    throw new Error(`LIVE_CONTRACT_ADDRESSES lists ${contracts.length} addresses; the gateway accepts at most ${MAX_LIVE_CONTRACTS} per query`);
  }

  const rawLag = env.LIVE_LAG_BLOCKS?.trim();
  let lagBlocks = DEFAULT_LAG_BLOCKS;
  if (rawLag) {
    if (!/^\d+$/.test(rawLag) || Number(rawLag) < 1 || Number(rawLag) > MAX_LAG_BLOCKS) {
      throw new Error(`LIVE_LAG_BLOCKS must be an integer from 1 to ${MAX_LAG_BLOCKS}`);
    }
    lagBlocks = Number(rawLag);
  }

  return { contracts, lagBlocks };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}
