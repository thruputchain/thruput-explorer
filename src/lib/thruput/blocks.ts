import { toBase58 } from "@thruputchain/client";

import { isBlockHeight } from "../validation";
import { createExplorerThruputClient, historyPageLimit } from "./client";
import { isUnsupportedRpcError, rpcErrorKind } from "./rpc";

export type BlockPage = {
  hashes: string[];
  cursor: string | null;
  oldest: string;
  latest: string;
};

export type BlockResult<T> =
  | { status: "ok"; data: T }
  | {
      status: "missing" | "unavailable" | "unsupported" | "invalid";
      message: string;
    };

export async function loadBlock(height: string) {
  if (!isBlockHeight(height))
    return {
      status: "invalid" as const,
      message: "Enter a valid non-negative block height.",
    };
  try {
    const { client } = await createExplorerThruputClient();
    const block = await client.getBlockByHeight({ blockHeight: BigInt(height) });
    if (!block)
      return {
        status: "missing" as const,
        message:
          "This height is outside indexed coverage. Genesis metadata is not available.",
      };
    return { status: "ok" as const, data: block };
  } catch (error) {
    return blockFailure(error);
  }
}

export async function loadBlockTransactions(
  height: string,
  cursor?: string,
): Promise<BlockResult<BlockPage>> {
  if (
    !isBlockHeight(height) ||
    (cursor !== undefined && (typeof cursor !== "string" || !/^0x(?:[0-9a-f]{2})+$/.test(cursor)))
  ) {
    return {
      status: "invalid",
      message: "Invalid block height or continuation. Start a fresh list.",
    };
  }
  try {
    const { client } = await createExplorerThruputClient();
    const page = await client.getTransactionsByBlock({
      blockHeight: BigInt(height),
      ...(cursor === undefined ? { start: { order: "ascending" as const } } : { cursor }),
      limit: historyPageLimit(client, "transactions", 50),
    });
    if (
      BigInt(height) < page.oldestIndexedBlockHeight ||
      BigInt(height) > page.latestIndexedBlockHeight
    ) {
      return {
        status: "missing",
        message:
          "This height is outside the current transaction index coverage.",
      };
    }
    return {
      status: "ok",
      data: {
        hashes: page.transactions.map((ref) => toBase58(ref.transactionHash)),
        cursor: page.nextCursor,
        oldest: page.oldestIndexedBlockHeight.toString(),
        latest: page.latestIndexedBlockHeight.toString(),
      },
    };
  } catch (error) {
    return blockFailure(error);
  }
}

function blockFailure(error: unknown) {
  const kind = rpcErrorKind(error);
  if (kind === "invalidCursor") {
    return { status: "invalid" as const, message: "This continuation is no longer valid. Reload transactions to start a fresh list." };
  }
  if (kind === "historyUnavailable") {
    return { status: "missing" as const, message: "This height is outside the current index coverage. Reload to check available history." };
  }
  // Do not expose transport errors: they can include private RPC paths or keys.
  return isUnsupportedRpcError(error)
    ? {
        status: "unsupported" as const,
        message: "This RPC server does not support block queries.",
      }
    : {
        status: "unavailable" as const,
        message: "Block data is temporarily unavailable. Retry shortly.",
      };
}
