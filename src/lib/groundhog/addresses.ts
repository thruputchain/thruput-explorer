import { addressFromHex, toHex0x, type IdentifiedEvent } from "@groundhogchain/client";
import { ERC20TransferEvent } from "@groundhogchain/client/contracts";

import { isContractAddress, normalizeContractAddress } from "@/lib/validation";

import { createExplorerGroundhogClient } from "./client";
import { getContractInfo, loadContractRegistry, type ContractRegistry, type ContractRegistryEntry } from "./contract-registry";
import { decodeGeneratedEvent } from "./contract-events";
import { getNativeBalance, type NativeBalanceView } from "./native-balance";
import { toRpcFailure } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import { getTokenMetadata, type TokenMetadata } from "./token-metadata";
import type { DecodedEventView, RpcFailure } from "./types";

const ADDRESS_TX_LIMIT = 25;
const ADDRESS_EVENT_LIMIT = 25;

export type AddressPageData =
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
      label?: string;
      badges: string[];
      registryEntry?: ContractRegistryEntry;
      metadata?: TokenMetadata;
      nativeBalance?: NativeBalanceView;
      rootTransactions: AddressTransactionRefView[];
      rootTransactionsError?: RpcFailure;
      hogTransfers: AddressEventView[];
      hogTransfersError?: RpcFailure;
      contractEvents: AddressEventView[];
      contractEventsError?: RpcFailure;
    };

export type AddressTransactionRefView = {
  txHash: string;
  height: string;
};

export type AddressEventView = {
  txHash: string;
  blockHeight: string;
  sequenceNumber: number;
  contractAddress: string;
  contractName?: string;
  decoded?: DecodedEventView;
  topics: string[];
  data: string;
};

export async function loadAddressPageData(addressInput: string): Promise<AddressPageData> {
  const address = normalizeContractAddress(addressInput);
  const { rpcUrl, client, nativeToken } = createExplorerGroundhogClient();

  if (!isContractAddress(address)) {
    return { status: "malformed", address, rpcUrl, reason: "Malformed address" };
  }

  try {
    const registry = await loadContractRegistry();
    const registryEntry = getContractInfo(registry, address);
    const contractAddress = addressFromHex(address);
    const nativeTokenAddress = addressFromHex(nativeToken.address);
    const nativeTokenMetadata = { name: nativeToken.symbol, symbol: nativeToken.symbol, decimals: nativeToken.decimals } satisfies TokenMetadata;
    const hogTransfersRequest =
      address === nativeToken.address
        ? Promise.resolve({ events: [] as IdentifiedEvent[], error: undefined })
        : client
            .getEvents({
              filters: [
                {
                  contractAddresses: [nativeTokenAddress],
                  topics: { topic0: [ERC20TransferEvent.signature], topic1: [contractAddress] },
                },
                {
                  contractAddresses: [nativeTokenAddress],
                  topics: { topic0: [ERC20TransferEvent.signature], topic2: [contractAddress] },
                },
              ],
              order: "descending",
              anchor: "end",
              limit: ADDRESS_EVENT_LIMIT,
            })
            .then((page) => ({ events: page.events, error: undefined }))
            .catch((error: unknown) => ({ events: [], error: toRpcFailure(error) }));

    const [nativeBalance, metadata, rootTransactionsResult, hogTransfersResult, contractEventsResult] = await Promise.all([
      getNativeBalance(client, address),
      getTokenMetadata(client, address).catch(() => undefined),
      client
        .getTransactionsByAddress({ address: contractAddress, order: "descending", anchor: "end", limit: ADDRESS_TX_LIMIT })
        .then((page) => ({ refs: page.refs, error: undefined }))
        .catch((error: unknown) => ({ refs: [], error: toRpcFailure(error) })),
      hogTransfersRequest,
      client
        .getEvents({ filters: [{ contractAddresses: [contractAddress] }], order: "descending", anchor: "end", limit: ADDRESS_EVENT_LIMIT })
        .then((page) => ({ events: page.events, error: undefined }))
        .catch((error: unknown) => ({ events: [], error: toRpcFailure(error) })),
    ]);

    const badges = buildBadges({ registryEntry, metadata, emittedEventCount: contractEventsResult.events.length });

    return {
      status: "ok",
      address,
      rpcUrl,
      label: metadata?.name ?? registryEntry?.name,
      badges,
      registryEntry,
      metadata,
      nativeBalance,
      rootTransactions: rootTransactionsResult.refs.map((ref) => ({
        txHash: toHex0x(ref.txHash),
        height: ref.height.toString(),
      })),
      rootTransactionsError: rootTransactionsResult.error,
      hogTransfers: hogTransfersResult.events.map((entry) => formatAddressEvent(entry, registry, nativeTokenMetadata)),
      hogTransfersError: hogTransfersResult.error,
      contractEvents: contractEventsResult.events.map((entry) =>
        formatAddressEvent(entry, registry, toHex0x(entry.event.contractAddress) === address ? metadata : undefined),
      ),
      contractEventsError: contractEventsResult.error,
    };
  } catch (error) {
    return { status: "unavailable", address, rpcUrl, error: toRpcFailure(error) };
  }
}

function formatAddressEvent(
  entry: IdentifiedEvent,
  registry: ContractRegistry,
  metadata?: TokenMetadata,
): AddressEventView {
  const eventContractAddress = toHex0x(entry.event.contractAddress);
  const eventContract = getContractInfo(registry, eventContractAddress);

  return {
    txHash: toHex0x(entry.txHash),
    blockHeight: entry.blockHeight.toString(),
    sequenceNumber: entry.sequenceNumber,
    contractAddress: eventContractAddress,
    contractName: metadata?.name ?? eventContract?.name,
    decoded: decodeTokenEvent(entry.event, metadata) ?? decodeGeneratedEvent(entry.event, eventContract),
    topics: entry.event.topics.map(toHex0x),
    data: toHex0x(entry.event.data),
  };
}

function buildBadges({
  registryEntry,
  metadata,
  emittedEventCount,
}: {
  registryEntry?: ContractRegistryEntry;
  metadata?: TokenMetadata;
  emittedEventCount: number;
}) {
  const badges = new Set<string>();

  if (metadata) badges.add("Token");
  else if (registryEntry || emittedEventCount > 0) badges.add("Contract");
  else badges.add("Address");

  return Array.from(badges);
}
