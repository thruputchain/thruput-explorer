import { addressFromHex, toHex0x } from "@groundhogchain/client";

import { isContractAddress, normalizeContractAddress } from "@/lib/validation";

import { createExplorerGroundhogClient } from "./client";
import { getContractInfo, loadContractRegistry, type ContractRegistryEntry } from "./contract-registry";
import { decodeGeneratedEvent } from "./contract-events";
import { getNativeBalance, type NativeBalanceView } from "./native-balance";
import { decodeTokenEvent } from "./token-events";
import { getTokenMetadata, type TokenMetadata } from "./token-metadata";
import type { DecodedEventView } from "./types";

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
      status: "ok";
      address: string;
      rpcUrl: string;
      label?: string;
      badges: string[];
      registryEntry?: ContractRegistryEntry;
      metadata?: TokenMetadata;
      nativeBalance?: NativeBalanceView;
      rootTransactions: AddressTransactionRefView[];
      rootTransactionsUnavailable: boolean;
      contractEvents: AddressEventView[];
      contractEventsUnavailable: boolean;
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
  const { rpcUrl, client } = createExplorerGroundhogClient();

  if (!isContractAddress(address)) {
    return { status: "malformed", address, rpcUrl, reason: "Malformed address" };
  }

  const registry = await loadContractRegistry();
  const registryEntry = getContractInfo(registry, address);
  const contractAddress = addressFromHex(address);

  const [nativeBalance, metadata, rootTransactionsResult, contractEventsResult] = await Promise.all([
    getNativeBalance(client, address),
    getTokenMetadata(client, address).catch(() => undefined),
    client
      .getTransactionsByAddress({ address: contractAddress, order: "descending", anchor: "end", limit: ADDRESS_TX_LIMIT })
      .then((page) => ({ available: true as const, refs: page.refs }))
      .catch(() => ({ available: false as const, refs: [] })),
    client
      .getEvents({ filters: [{ contractAddresses: [contractAddress] }], order: "descending", anchor: "end", limit: ADDRESS_EVENT_LIMIT })
      .then((page) => ({ available: true as const, events: page.events }))
      .catch(() => ({ available: false as const, events: [] })),
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
    rootTransactionsUnavailable: !rootTransactionsResult.available,
    contractEvents: contractEventsResult.events.map((entry) => {
      const eventContractAddress = toHex0x(entry.event.contractAddress);
      const eventContract = getContractInfo(registry, eventContractAddress);
      const eventMetadata = eventContractAddress === address ? metadata : undefined;

      return {
        txHash: toHex0x(entry.txHash),
        blockHeight: entry.blockHeight.toString(),
        sequenceNumber: entry.sequenceNumber,
        contractAddress: eventContractAddress,
        contractName: eventMetadata?.name ?? eventContract?.name,
        decoded: decodeTokenEvent(entry.event, eventMetadata) ?? decodeGeneratedEvent(entry.event, eventContract),
        topics: entry.event.topics.map(toHex0x),
        data: toHex0x(entry.event.data),
      };
    }),
    contractEventsUnavailable: !contractEventsResult.available,
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
