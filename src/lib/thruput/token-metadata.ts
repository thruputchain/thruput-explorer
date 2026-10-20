import { addressFromBase58, type ThruputClient } from "@thruputchain/client";
import { ERC20Metadata } from "@thruputchain/client/contracts";

import { NATIVE_HOG_ADDRESS } from "./client";
import { normalizeContractAddress } from "../validation";

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
  return BUILT_IN_TOKEN_METADATA[normalizeContractAddress(address)];
}

export async function getTokenMetadata(client: ThruputClient, address: string): Promise<TokenMetadata | undefined> {
  // Native HOG is a precompile without ERC20Metadata entrypoints.
  const builtIn = getBuiltInTokenMetadata(address);
  if (builtIn) return builtIn;
  const contract = addressFromBase58(address);
  const response = await client.readViews({ calls: [
    ERC20Metadata.v0_1.name.viewRequest({ contract }),
    ERC20Metadata.v0_1.symbol.viewRequest({ contract }),
    ERC20Metadata.v0_1.decimals.viewRequest({ contract }),
  ] }).catch(() => undefined);
  if (!response) return undefined;
  const [nameResult, symbolResult, decimalsResult] = response.results;
  const name = nameResult.kind === "return" ? nameResult.value : undefined;
  const symbol = symbolResult.kind === "return" ? symbolResult.value : undefined;
  const decimals = decimalsResult.kind === "return" ? decimalsResult.value : undefined;

  if (name == null && symbol == null && decimals == null) return undefined;

  return {
    name: name ?? undefined,
    symbol: symbol ?? undefined,
    decimals: normalizeDecimals(decimals),
  };
}

function normalizeDecimals(value: bigint | null | undefined) {
  if (value == null) return undefined;
  if (value < BigInt(0) || value > BigInt(MAX_DISPLAY_DECIMALS)) return undefined;
  return Number(value);
}
