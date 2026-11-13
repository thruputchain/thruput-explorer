import {
  loadBlockTransactions,
  type BlockPage,
  type BlockResult,
} from "./blocks";
import {
  loadTransactionActivity,
  type TransactionActivity,
} from "./transaction-activity";

export type BlockActivityPage = BlockPage & { activity: TransactionActivity[] };

export async function loadBlockActivity(
  height: string,
  cursor?: string,
): Promise<BlockResult<BlockActivityPage>> {
  const result = await loadBlockTransactions(height, cursor);
  if (result.status !== "ok") return result;
  const activity = await loadTransactionActivity(
    result.data.hashes.map((hash) => ({ hash, height })),
  );
  return { status: "ok", data: { ...result.data, activity } };
}
