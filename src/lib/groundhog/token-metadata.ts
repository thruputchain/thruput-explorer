import { addressFromHex, type GroundhogClient } from "@groundhogchain/client";
import { buildNamedCodecs, resolveCodec, type ContractType } from "@groundhogchain/client/contract";
import { ERC20Metadata, ERC20Spec } from "@groundhogchain/client/contracts";
import { gasAmount, type Invocation } from "@groundhogchain/protocol";
import { CxsReader } from "@groundhogchain/xdr";

export type TokenMetadata = {
  name?: string;
  symbol?: string;
  decimals?: number;
};

const VIEW_GAS_LIMIT = gasAmount(BigInt(500_000));
const MAX_DISPLAY_DECIMALS = 30;
const namedCodecs = buildNamedCodecs(ERC20Spec.type_defs);
const NATIVE_HOG_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000001";
const BUILT_IN_TOKEN_METADATA: Record<string, TokenMetadata> = {
  [NATIVE_HOG_ADDRESS]: { name: "HOG", symbol: "HOG", decimals: 7 },
};

export async function getTokenMetadata(client: GroundhogClient, address: string): Promise<TokenMetadata | undefined> {
  const fallback = BUILT_IN_TOKEN_METADATA[normalizeAddress(address)];
  const contract = addressFromHex(address);
  const [name, symbol, decimals] = await Promise.all([
    viewMetadataValue<string>(client, ERC20Metadata.name(contract, VIEW_GAS_LIMIT), "name"),
    viewMetadataValue<string>(client, ERC20Metadata.symbol(contract, VIEW_GAS_LIMIT), "symbol"),
    viewMetadataValue<bigint>(client, ERC20Metadata.decimals(contract, VIEW_GAS_LIMIT), "decimals"),
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

async function viewMetadataValue<T>(
  client: GroundhogClient,
  invocation: Invocation,
  method: "name" | "symbol" | "decimals",
) {
  try {
    const response = await client.view({
      contract: invocation.invoked_address,
      entrypoint: invocation.entrypoint,
      calldata: invocation.calldata,
    });

    if (response.output.result !== "return") return null;
    return decodeMetadataReturn(response.output.returnData, method) as T | null;
  } catch {
    return null;
  }
}

function decodeMetadataReturn(data: Uint8Array, method: "name" | "symbol" | "decimals") {
  const returnType = getMetadataReturnType(method);
  const reader = new CxsReader(data);
  const value = resolveCodec(returnType, namedCodecs).decode(reader);
  if (reader.remaining !== 0) throw new Error(`${method}: trailing bytes after return value`);
  return value;
}

function getMetadataReturnType(methodName: "name" | "symbol" | "decimals"): ContractType {
  const metadataInterface = ERC20Spec.interfaces.find((iface) => iface.name === "ERC20Metadata");
  const method = metadataInterface?.methods.find((candidate) => candidate.name === methodName);
  if (!method) throw new Error(`Missing ERC20Metadata.${methodName} in generated spec`);
  return method.return_type;
}
