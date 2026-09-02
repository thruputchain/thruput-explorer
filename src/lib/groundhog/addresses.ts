import { addressFromHex, toHex0x, type IdentifiedEvent } from "@groundhogchain/client";
import { ERC20TransferEvent } from "@groundhogchain/client/contracts";

import { isContractAddress, normalizeContractAddress } from "@/lib/validation";

import { createExplorerGroundhogClient, getExplorerRpcConfig } from "./client";
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
      metadata?: TokenMetadata;
      nativeBalance?: NativeBalanceView;
      transactions: AddressTransactionRefView[];
      transactionsError?: RpcFailure;
      transactionHistoryPartial: boolean;
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
  const { rpcUrl, nativeToken } = getExplorerRpcConfig();

  if (!isContractAddress(address)) {
    return { status: "malformed", address, rpcUrl, reason: "Malformed address" };
  }

  try {
    const { client } = createExplorerGroundhogClient();
    const contractAddress = addressFromHex(address);
    const nativeTokenAddress = addressFromHex(nativeToken.address);
    const nativeTokenMetadata = { name: nativeToken.symbol, symbol: nativeToken.symbol, decimals: nativeToken.decimals } satisfies TokenMetadata;
    const hogTransfersRequest =
      address === nativeToken.address
        ? Promise.resolve({ events: [] as IdentifiedEvent[], error: undefined })
        : client
            .getEvents({
              filters: [
                ERC20TransferEvent.filter({
                  contractAddresses: [nativeTokenAddress],
                  topics: { from: contractAddress },
                }),
                ERC20TransferEvent.filter({
                  contractAddresses: [nativeTokenAddress],
                  topics: { to: contractAddress },
                }),
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

    const badges = buildBadges({ metadata, emittedEventCount: contractEventsResult.events.length });

    return {
      status: "ok",
      address,
      rpcUrl,
      label: metadata?.name,
      badges,
      metadata,
      nativeBalance,
      transactions: mergeTransactionHistory(rootTransactionsResult.refs, hogTransfersResult.events),
      transactionsError:
        rootTransactionsResult.error && hogTransfersResult.error
          ? rootTransactionsResult.error
          : undefined,
      transactionHistoryPartial: Boolean(rootTransactionsResult.error || hogTransfersResult.error),
      hogTransfers: hogTransfersResult.events.map((entry) => formatAddressEvent(entry, nativeTokenMetadata)),
      hogTransfersError: hogTransfersResult.error,
      contractEvents: contractEventsResult.events.map((entry) =>
        formatAddressEvent(entry, toHex0x(entry.event.contractAddress) === address ? metadata : undefined),
      ),
      contractEventsError: contractEventsResult.error,
    };
  } catch (error) {
    return { status: "unavailable", address, rpcUrl, error: toRpcFailure(error) };
  }
}

function mergeTransactionHistory(
  rootTransactions: Array<{ txHash: Uint8Array; height: bigint }>,
  hogTransfers: IdentifiedEvent[],
): AddressTransactionRefView[] {
  const transactions = new Map<string, AddressTransactionRefView>();

  for (const transaction of rootTransactions) {
    const txHash = toHex0x(transaction.txHash);
    transactions.set(txHash, { txHash, height: transaction.height.toString() });
  }

  for (const transfer of hogTransfers) {
    const txHash = toHex0x(transfer.txHash);
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
  const eventContractAddress = toHex0x(entry.event.contractAddress);

  return {
    txHash: toHex0x(entry.txHash),
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
