import { addressFromBase58, toBase58, toHex0x, type IdentifiedEvent } from "@thruputchain/client";
import { thruput_erc20_if as ERC20 } from "@thruputchain/client/contracts";

import { isContractAddress, normalizeContractAddress } from "@/lib/validation";

import { createExplorerThruputClient, getExplorerRpcConfig, historyPageLimit } from "./client";
import { getNativeBalance, type NativeBalanceView } from "./native-balance";
import { toRpcFailure } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import { getTokenMetadata, type TokenMetadata } from "./token-metadata";
import type { DecodedEventView, RpcFailure } from "./types";
import { loadContractSpec, type ContractSpecView } from "./contract-spec";

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
      metadata?: TokenMetadata;
      contractSpec: ContractSpecView;
      nativeBalance?: NativeBalanceView;
      transactions: AddressTransactionRefView[];
      transactionsError?: RpcFailure;
      transactionHistoryPartial: boolean;
      nativeTokenTransfers: AddressEventView[];
      nativeTokenTransfersError?: RpcFailure;
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
  const { rpcUrl, nativeToken } = getExplorerRpcConfig();

  if (!isContractAddress(address)) {
    return { status: "malformed", address, rpcUrl, reason: "Malformed address" };
  }

  try {
    const { client } = await createExplorerThruputClient();
    const contractAddress = addressFromBase58(address);
    const nativeTokenAddress = addressFromBase58(nativeToken.address);
    const nativeTokenMetadata = { name: nativeToken.name, symbol: nativeToken.symbol, decimals: nativeToken.decimals } satisfies TokenMetadata;
    const nativeTokenTransfersRequest =
      address === nativeToken.address
        ? Promise.resolve({ events: [] as IdentifiedEvent[], error: undefined })
        : client
            .getEvents({
              filters: [
                ERC20.v0_1.events.TransferEvent.filter({
                  addresses: [nativeTokenAddress],
                  topics: { from: contractAddress },
                }),
                ERC20.v0_1.events.TransferEvent.filter({
                  addresses: [nativeTokenAddress],
                  topics: { to: contractAddress },
                }),
              ],
              start: { order: "descending", anchor: { kind: "atEnd" } },
              limit: historyPageLimit(client, "events", ADDRESS_EVENT_LIMIT),
            })
            .then((page) => ({ events: page.events, error: undefined }))
            .catch((error: unknown) => ({ events: [], error: toRpcFailure(error) }));

    const contractEventsRequest = client
      .getEvents({ filters: [{ addresses: [contractAddress] }], start: { order: "descending", anchor: { kind: "atEnd" } }, limit: historyPageLimit(client, "events", ADDRESS_EVENT_LIMIT) })
      .then((page) => ({ events: page.events, error: undefined }))
      .catch((error: unknown) => ({ events: [], error: toRpcFailure(error) }));

    const [nativeBalance, metadata, rootTransactionsResult, nativeTokenTransfersResult, contractEventsResult, contractSpec] = await Promise.all([
      getNativeBalance(client, address),
      getTokenMetadata(client, address).catch(() => undefined),
      client
        .getTransactionsByRootAddress({ address: contractAddress, start: { order: "descending", anchor: { kind: "atEnd" } }, limit: historyPageLimit(client, "transactions", ADDRESS_TX_LIMIT) })
        .then((page) => ({ refs: page.transactions, error: undefined }))
        .catch((error: unknown) => ({ refs: [], error: toRpcFailure(error) })),
      nativeTokenTransfersRequest,
      contractEventsRequest,
      loadContractSpec(client, address, contractEventsRequest.then((result) => result.events)),
    ]);

    const badges = buildBadges({ metadata, emittedEventCount: contractEventsResult.events.length });

    return {
      status: "ok",
      address,
      rpcUrl,
      label: metadata?.name,
      badges,
      metadata,
      contractSpec,
      nativeBalance,
      transactions: mergeTransactionHistory(rootTransactionsResult.refs, nativeTokenTransfersResult.events),
      transactionsError:
        rootTransactionsResult.error && nativeTokenTransfersResult.error
          ? rootTransactionsResult.error
          : undefined,
      transactionHistoryPartial: Boolean(rootTransactionsResult.error || nativeTokenTransfersResult.error),
      nativeTokenTransfers: nativeTokenTransfersResult.events.map((entry) => formatAddressEvent(entry, nativeTokenMetadata)),
      nativeTokenTransfersError: nativeTokenTransfersResult.error,
      contractEvents: contractEventsResult.events.map((entry) =>
        formatAddressEvent(entry, toBase58(entry.event.address) === address ? metadata : undefined),
      ),
      contractEventsError: contractEventsResult.error,
    };
  } catch (error) {
    return { status: "unavailable", address, rpcUrl, error: toRpcFailure(error) };
  }
}

function mergeTransactionHistory(
  rootTransactions: Array<{ transactionHash: Uint8Array; blockHeight: bigint }>,
  nativeTokenTransfers: IdentifiedEvent[],
): AddressTransactionRefView[] {
  const transactions = new Map<string, AddressTransactionRefView>();

  for (const transaction of rootTransactions) {
    const txHash = toBase58(transaction.transactionHash);
    transactions.set(txHash, { txHash, height: transaction.blockHeight.toString() });
  }

  for (const transfer of nativeTokenTransfers) {
    const txHash = toBase58(transfer.transactionHash);
    transactions.set(txHash, { txHash, height: transfer.blockHeight.toString() });
  }

  return Array.from(transactions.values())
    .sort((a, b) => {
      const aHeight = BigInt(a.height);
      const bHeight = BigInt(b.height);
      return aHeight === bHeight ? 0 : aHeight > bHeight ? -1 : 1;
    })
    .slice(0, ADDRESS_TX_LIMIT);
}

function formatAddressEvent(
  entry: IdentifiedEvent,
  metadata?: TokenMetadata,
): AddressEventView {
  const eventContractAddress = toBase58(entry.event.address);

  return {
    txHash: toBase58(entry.transactionHash),
    blockHeight: entry.blockHeight.toString(),
    sequenceNumber: entry.sequenceNumber,
    contractAddress: eventContractAddress,
    contractName: metadata?.name,
    decoded: decodeTokenEvent(entry.event, metadata),
    topics: entry.event.topics.map(toHex0x),
    data: toHex0x(entry.event.data),
  };
}

function buildBadges({
  metadata,
  emittedEventCount,
}: {
  metadata?: TokenMetadata;
  emittedEventCount: number;
}) {
  const badges = new Set<string>();

  if (metadata) badges.add("Token");
  else if (emittedEventCount > 0) badges.add("Contract");
  else badges.add("Address");

  return Array.from(badges);
}
