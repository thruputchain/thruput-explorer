import { addressFromHex, type GroundhogClient } from "@groundhogchain/client";
import { ERC20Metadata } from "@groundhogchain/client/contracts";

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

export async function getTokenMetadata(client: GroundhogClient, address: string): Promise<TokenMetadata | undefined> {
  const fallback = BUILT_IN_TOKEN_METADATA[normalizeAddress(address)];
  const contract = addressFromHex(address);
  const [name, symbol, decimals] = await Promise.all([
    viewMetadataValue(() => ERC20Metadata.name.view({ client, contract })),
    viewMetadataValue(() => ERC20Metadata.symbol.view({ client, contract })),
    viewMetadataValue(() => ERC20Metadata.decimals.view({ client, contract })),
  ]);

  if (name == null && symbol == null && decimals == null) return fallback;

  return {
    name: name ?? fallback?.name,
    symbol: symbol ?? fallback?.symbol,
    decimals: normalizeDecimals(decimals),
  };
}

function normalizeDecimals(value: bigint | null) {
  if (value == null) return undefined;
  if (value < BigInt(0) || value > BigInt(MAX_DISPLAY_DECIMALS)) return undefined;
  return Number(value);
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

async function viewMetadataValue<T>(view: () => Promise<{ value: T }>): Promise<T | null> {
  try {
    return (await view()).value;
  } catch {
    return null;
  }
}
