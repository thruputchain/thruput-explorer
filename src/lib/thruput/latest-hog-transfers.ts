import { addressFromBase58, toBase58 } from "@thruputchain/client";
import { groundhog_erc20_if as ERC20 } from "@thruputchain/client/contracts";

import { createExplorerThruputClient, getExplorerRpcConfig, historyPageLimit } from "./client";
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
  const { nativeToken } = getExplorerRpcConfig();
  const metadata = { name: nativeToken.symbol, symbol: nativeToken.symbol, decimals: nativeToken.decimals };

  try {
    const { client } = await createExplorerThruputClient();
    const page = await client.getEvents({
      filters: [ERC20.v0_1.events.TransferEvent.filter({ addresses: [addressFromBase58(nativeToken.address)] })],
      start: { order: "descending", anchor: { kind: "atEnd" } },
      limit: historyPageLimit(client, "events", LATEST_HOG_TRANSFER_LIMIT),
    });

    return {
      status: "ok",
      nativeTokenAddress: nativeToken.address,
      transfers: page.events.flatMap((entry) => {
        const decoded = decodeTokenEvent(entry.event, metadata);
        if (!decoded) return [];

        return [{
          txHash: toBase58(entry.transactionHash),
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
