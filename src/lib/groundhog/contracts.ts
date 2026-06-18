import { HttpTransport, addressFromHex, createGroundhogClient, toHex0x } from "@groundhogchain/client";

import { isContractAddress, normalizeContractAddress } from "@/lib/validation";

import { getContractInfo, loadContractRegistry } from "./contract-registry";
import { decodeTokenEvent } from "./token-events";
import { getTokenMetadata, type TokenMetadata } from "./token-metadata";
import type { DecodedEventView, RpcFailure } from "./types";

const DEFAULT_RPC_URL = "http://localhost:9545";
const CONTRACT_EVENT_LIMIT = 25;

export type ContractPageData =
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
      token: boolean;
      metadata?: TokenMetadata;
      latestBlock: string;
      oldestBlock: string;
      events: ContractEventView[];
    };

export type ContractEventView = {
  txHash: string;
  blockHeight: string;
  sequenceNumber: number;
  contractAddress: string;
  contractName?: string;
  decoded?: DecodedEventView;
  topics: string[];
  data: string;
};

export async function loadContractPageData(addressInput: string): Promise<ContractPageData> {
  const address = normalizeContractAddress(addressInput);
  const rpcUrl = process.env.GROUNDHOG_RPC_URL ?? DEFAULT_RPC_URL;

  if (!isContractAddress(address)) {
    return { status: "malformed", address, rpcUrl, reason: "Malformed contract address" };
  }

  try {
    const transport = new HttpTransport(rpcUrl);
    const client = createGroundhogClient(transport);
    const contractAddress = addressFromHex(address);
    const registry = await loadContractRegistry();
    const contract = getContractInfo(registry, address);
    const metadata = contract?.token ? await getTokenMetadata(client, address) : undefined;
    const page = await client.getEvents({
      filters: [{ contractAddresses: [contractAddress] }],
      order: "descending",
      anchor: "end",
      limit: CONTRACT_EVENT_LIMIT,
    });

    return {
      status: "ok",
      address,
      rpcUrl,
      label: metadata?.name ?? contract?.name,
      token: Boolean(contract?.token),
      metadata,
      latestBlock: page.latestBlock.toString(),
      oldestBlock: page.oldestBlock.toString(),
      events: page.events.map((entry) => {
        const eventContractAddress = toHex0x(entry.event.contractAddress);
        const eventContract = getContractInfo(registry, eventContractAddress);
        const eventMetadata = eventContractAddress === address ? metadata : undefined;

        return {
          txHash: toHex0x(entry.txHash),
          blockHeight: entry.blockHeight.toString(),
          sequenceNumber: entry.sequenceNumber,
          contractAddress: eventContractAddress,
          contractName: eventMetadata?.name ?? eventContract?.name,
          decoded: decodeTokenEvent(entry.event, eventContract, eventMetadata),
          topics: entry.event.topics.map(toHex0x),
          data: toHex0x(entry.event.data),
        };
      }),
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

function toRpcFailure(error: unknown): RpcFailure {
  if (error instanceof Error && "code" in error && typeof error.code === "number") {
    return { message: error.message, code: error.code };
  }
  return { message: error instanceof Error ? error.message : "Unable to reach Groundhog RPC" };
}
