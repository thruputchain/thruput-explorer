import { fromHex0x, toBase58, toHex0x } from "@thruputchain/client";

import { isBlockHeight } from "../validation";
import { createExplorerThruputClient } from "./client";
import { isUnsupportedRpcError } from "./rpc";

export type BlockPage = {
  hashes: string[];
  cursor: string;
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
    const block = await client.getBlockByNumber(BigInt(height));
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
  cursor = "0x",
): Promise<BlockResult<BlockPage>> {
  if (
    !isBlockHeight(height) ||
    typeof cursor !== "string" ||
    !/^0x(?:[0-9a-f]{2}){0,4096}$/.test(cursor)
  ) {
    return {
      status: "invalid",
      message: "Invalid block height or continuation. Start a fresh list.",
    };
  }
  try {
    const { client } = await createExplorerThruputClient();
    const page = await client.getTransactionsByBlock({
      height: BigInt(height),
      cursor: fromHex0x(cursor),
      limit: 50,
      order: "ascending",
    });
    if (
      BigInt(height) < page.oldestBlock ||
      BigInt(height) > page.latestBlock
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
        hashes: page.refs.map((ref) => toBase58(ref.txHash)),
        cursor: toHex0x(page.cursor),
        oldest: page.oldestBlock.toString(),
        latest: page.latestBlock.toString(),
      },
    };
  } catch (error) {
    return blockFailure(error);
  }
}

function blockFailure(error: unknown) {
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
