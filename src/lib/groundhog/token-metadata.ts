import { addressFromBase58, type ThruputClient } from "@thruputchain/client";
import { ERC20Metadata } from "@thruputchain/client/contracts";

import { NATIVE_HOG_ADDRESS } from "./client";

export type TokenMetadata = {
  name?: string;
  symbol?: string;
  decimals?: number;
};

const MAX_DISPLAY_DECIMALS = 30;
const BUILT_IN_TOKEN_METADATA: Record<string, TokenMetadata> = {
  [NATIVE_HOG_ADDRESS]: { name: "HOG", symbol: "HOG", decimals: 7 },
};

export function getBuiltInTokenMetadata(address: string): TokenMetadata | undefined {
  return BUILT_IN_TOKEN_METADATA[normalizeAddress(address)];
}

export async function getTokenMetadata(client: ThruputClient, address: string): Promise<TokenMetadata | undefined> {
  // Native HOG is a precompile without ERC20Metadata entrypoints.
  const builtIn = getBuiltInTokenMetadata(address);
  if (builtIn) return builtIn;
  const contract = addressFromBase58(address);
  const [name, symbol, decimals] = await Promise.all([
    viewMetadataValue(() => ERC20Metadata.v0_1.name.view({ client, contract })),
    viewMetadataValue(() => ERC20Metadata.v0_1.symbol.view({ client, contract })),
    viewMetadataValue(() => ERC20Metadata.v0_1.decimals.view({ client, contract })),
  ]);

  if (name == null && symbol == null && decimals == null) return undefined;

  return {
    name: name ?? undefined,
    symbol: symbol ?? undefined,
    decimals: normalizeDecimals(decimals),
  };
}

function normalizeDecimals(value: bigint | null) {
  if (value == null) return undefined;
  if (value < BigInt(0) || value > BigInt(MAX_DISPLAY_DECIMALS)) return undefined;
  return Number(value);
}

function normalizeAddress(address: string) {
  return address.trim();
}

async function viewMetadataValue<T>(view: () => Promise<{ value: T }>): Promise<T | null> {
  try {
    return (await view()).value;
  } catch {
    return null;
  }
}
