import { addressFromHex, toHex0x } from "@groundhogchain/client";
import { ERC20TransferEvent } from "@groundhogchain/client/contracts";

import { createExplorerGroundhogClient } from "./client";
import { toRpcFailure } from "./rpc";
import { decodeTokenEvent } from "./token-events";
import type { RpcFailure } from "./types";

const LATEST_HOG_TRANSFER_LIMIT = 6;

export type LatestHogTransferView = {
  txHash: string;
  blockHeight: string;
  sequenceNumber: number;
  name: string;
  from?: string;
  to?: string;
  amount: string;
  symbol: string;
};

export type LatestHogTransfersData =
  | { status: "ok"; nativeTokenAddress: string; transfers: LatestHogTransferView[] }
  | { status: "unavailable"; nativeTokenAddress: string; error: RpcFailure };

export async function loadLatestHogTransfers(): Promise<LatestHogTransfersData> {
  const { client, nativeToken } = createExplorerGroundhogClient();
  const metadata = { name: nativeToken.symbol, symbol: nativeToken.symbol, decimals: nativeToken.decimals };

  try {
    const page = await client.getEvents({
      filters: [
        {
          contractAddresses: [addressFromHex(nativeToken.address)],
          topics: { topic0: [ERC20TransferEvent.signature] },
        },
      ],
      order: "descending",
      anchor: "end",
      limit: LATEST_HOG_TRANSFER_LIMIT,
    });

    return {
      status: "ok",
      nativeTokenAddress: nativeToken.address,
      transfers: page.events.flatMap((entry) => {
        const decoded = decodeTokenEvent(entry.event, metadata);
        if (!decoded) return [];

        return [{
          txHash: toHex0x(entry.txHash),
          blockHeight: entry.blockHeight.toString(),
          sequenceNumber: entry.sequenceNumber,
          name: decoded.name,
          from: decoded.from,
          to: decoded.to,
          amount: decoded.amount,
          symbol: decoded.symbol ?? nativeToken.symbol,
        }];
      }),
    };
  } catch (error) {
    return {
      status: "unavailable",
      nativeTokenAddress: nativeToken.address,
      error: toRpcFailure(error),
    };
  }
}
