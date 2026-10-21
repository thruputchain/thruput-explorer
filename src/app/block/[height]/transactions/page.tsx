import { toBase58 } from "@thruputchain/client";

import { BlockTransactions } from "@/components/block-transactions";
import { PageHeader } from "@/components/page-header";
import { RpcAlert } from "@/components/rpc-alert";
import { loadBlock, loadBlockTransactions } from "@/lib/thruput/blocks";

export default async function BlockTransactionsPage({
  params,
}: {
  params: Promise<{ height: string }>;
}) {
  const { height } = await params;
  const [block, page] = await Promise.all([
    loadBlock(height),
    loadBlockTransactions(height),
  ]);
  const failure =
    block.status !== "ok" ? block : page.status !== "ok" ? page : undefined;
  if (failure || block.status !== "ok" || page.status !== "ok")
    return (
      <main className="app-container py-8">
        <RpcAlert
          title="Block transactions not available"
          description={failure?.message}
        />
      </main>
    );
  return (
    <main>
      <PageHeader
        title={`Transactions in block ${height}`}
        value={toBase58(block.data.blockHash)}
        copyLabel="Copy block hash"
        backHref={`/block/${height}`}
        backLabel="Block details"
      />
      <div className="app-container py-8">
        <BlockTransactions key={height} height={height} initial={page.data} />
      </div>
    </main>
  );
}
