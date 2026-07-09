import { HttpTransport, addressFromHex, createGroundhogClient, toHex0x } from "@groundhogchain/client";
import { ERC20TransferEvent } from "@groundhogchain/client/contracts";

import { isContractAddress, normalizeContractAddress } from "@/lib/validation";

import { getContractInfo, getTokenContracts, loadContractRegistry } from "./contract-registry";
import { getNativeBalance, type NativeBalanceView } from "./native-balance";
import { decodeTokenEvent } from "./token-events";
import { getTokenMetadata, type TokenMetadata } from "./token-metadata";
import type { DecodedEventView, RpcFailure } from "./types";

const DEFAULT_RPC_URL = "http://localhost:9545";
const WALLET_EVENT_LIMIT = 50;

export type WalletPageData =
  | {
      status: "malformed";
      address: string;
      rpcUrl: string;
      reason: string;
    }
  | {
      status: "unavailable";
      address: string;
      rpcUrl: string;
      error: RpcFailure;
    }
  | {
      status: "ok";
      address: string;
      rpcUrl: string;
      nativeBalance?: NativeBalanceView;
      tokenCount: number;
      transfers: WalletTransferView[];
    };

export type WalletTransferView = {
  txHash: string;
  blockHeight: string;
  sequenceNumber: number;
  direction: "in" | "out" | "self";
  tokenAddress: string;
  tokenName?: string;
  decoded?: DecodedEventView;
};

export async function loadWalletPageData(addressInput: string): Promise<WalletPageData> {
  const address = normalizeContractAddress(addressInput);
  const rpcUrl = process.env.GROUNDHOG_RPC_URL ?? DEFAULT_RPC_URL;

  if (!isContractAddress(address)) {
    return { status: "malformed", address, rpcUrl, reason: "Malformed wallet address" };
  }

  try {
    const transport = new HttpTransport(rpcUrl);
    const client = createGroundhogClient(transport);
    const registry = await loadContractRegistry();
    const tokenContracts = getTokenContracts(registry);
    const contractAddresses = tokenContracts.map((token) => addressFromHex(token.address));
    const walletAddress = addressFromHex(address);

    if (contractAddresses.length === 0) {
      return { status: "ok", address, rpcUrl, nativeBalance: await getNativeBalance(client, address), tokenCount: 0, transfers: [] };
    }

    const [nativeBalance, metadataByAddress, outgoing, incoming] = await Promise.all([
      getNativeBalance(client, address),
      loadTokenMetadata(client, tokenContracts.map((token) => token.address)),
      client.getEvents({
        filters: [{ contractAddresses, topics: { topic0: [ERC20TransferEvent.signature], topic1: [walletAddress] } }],
        order: "descending",
        anchor: "end",
        limit: WALLET_EVENT_LIMIT,
      }),
      client.getEvents({
        filters: [{ contractAddresses, topics: { topic0: [ERC20TransferEvent.signature], topic2: [walletAddress] } }],
        order: "descending",
        anchor: "end",
        limit: WALLET_EVENT_LIMIT,
      }),
    ]);

    const transfers = [...outgoing.events, ...incoming.events]
      .map((entry) => {
        const tokenAddress = toHex0x(entry.event.contractAddress);
        const contract = getContractInfo(registry, tokenAddress);
        const metadata = metadataByAddress.get(tokenAddress);
        const decoded = decodeTokenEvent(entry.event, contract, metadata);
        const direction = getDirection(decoded, address);

        return {
          txHash: toHex0x(entry.txHash),
          blockHeight: entry.blockHeight.toString(),
          sequenceNumber: entry.sequenceNumber,
          direction,
          tokenAddress,
          tokenName: metadata?.name ?? contract?.name,
          decoded,
        };
      })
      .filter((transfer) => transfer.decoded)
      .filter(uniqueTransfer)
      .sort((a, b) => Number(BigInt(b.blockHeight) - BigInt(a.blockHeight)) || b.sequenceNumber - a.sequenceNumber);

    return {
      status: "ok",
      address,
      rpcUrl,
      nativeBalance,
      tokenCount: tokenContracts.length,
      transfers,
    };
  } catch (error) {
    return {
      status: "unavailable",
      address,
      rpcUrl,
      error: toRpcFailure(error),
    };
  }
}

async function loadTokenMetadata(client: ReturnType<typeof createGroundhogClient>, tokenAddresses: string[]) {
  const metadataByAddress = new Map<string, TokenMetadata | undefined>();
  await Promise.all(
    tokenAddresses.map(async (tokenAddress) => {
      metadataByAddress.set(tokenAddress, await getTokenMetadata(client, tokenAddress));
    }),
  );
  return metadataByAddress;
}

function getDirection(decoded: DecodedEventView | undefined, walletAddress: string): WalletTransferView["direction"] {
  if (decoded?.kind === "contract-event") return "in";
  if (decoded?.from === walletAddress && decoded.to === walletAddress) return "self";
  if (decoded?.from === walletAddress) return "out";
  return "in";
}

function uniqueTransfer(value: WalletTransferView, index: number, transfers: WalletTransferView[]) {
  return transfers.findIndex((candidate) => candidate.txHash === value.txHash && candidate.sequenceNumber === value.sequenceNumber) === index;
}

function toRpcFailure(error: unknown): RpcFailure {
  if (error instanceof Error && "code" in error && typeof error.code === "number") {
    return { message: error.message, code: error.code };
  }
  return { message: error instanceof Error ? error.message : "Unable to reach Groundhog RPC" };
}
