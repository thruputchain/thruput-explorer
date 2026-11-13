import { Suspense } from "react";

import { BlockTransactions } from "@/components/block-transactions";
import type { BlockPage } from "@/lib/thruput/blocks";
import { loadTransactionActivity } from "@/lib/thruput/transaction-activity";

export function BlockActivityCard({
  height,
  page,
}: {
  height: string;
  page: BlockPage;
}) {
  if (page.hashes.length === 0) {
    return (
      <BlockTransactions height={height} initial={{ ...page, activity: [] }} />
    );
  }
  const activity = page.hashes.map((hash) => ({
    hash,
    height,
    timestamp: null,
    result: null,
    events: [],
  }));
  return (
    <Suspense
      fallback={
        <BlockTransactions
          height={height}
          initial={{ ...page, activity }}
          loadingDetails
        />
      }
    >
      <BlockActivityDetails height={height} page={page} />
    </Suspense>
  );
}

async function BlockActivityDetails({
  height,
  page,
}: {
  height: string;
  page: BlockPage;
}) {
  const activity = await loadTransactionActivity(
    page.hashes.map((hash) => ({ hash, height })),
  );
  return (
    <BlockTransactions
      key={height}
      height={height}
      initial={{ ...page, activity }}
    />
  );
}
