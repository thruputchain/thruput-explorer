import Link from "next/link";
import { toHex0x } from "@thruputchain/client";

import { PageHeader } from "@/components/page-header";
import { RpcAlert } from "@/components/rpc-alert";
import { FieldRow } from "@/components/transaction/field-row";
import { Button } from "@/components/ui/button";
import { loadBlock, loadBlockTransactions } from "@/lib/groundhog/blocks";

export default async function BlockPage({
  params,
}: {
  params: Promise<{ height: string }>;
}) {
  const { height } = await params;
  const [result, transactions] = await Promise.all([
    loadBlock(height),
    loadBlockTransactions(height),
  ]);
  if (result.status !== "ok")
    return (
      <main className="app-container py-8">
        <RpcAlert title="Block not available" description={result.message} />
      </main>
    );
  const block = result.data;
  const fields = [
    ["Height", block.blockHeight.toString()],
    ["Timestamp (nanoseconds)", block.blockTimepoint.toString()],
    ["Proposer", toHex0x(block.proposer)],
    ["Protocol", String(block.protocol)],
    ["Parent hash", toHex0x(block.prevBlockHash)],
    ["Transaction root", toHex0x(block.txsHash)],
    ["Storage root", toHex0x(block.storageHash)],
    ["Events root", toHex0x(block.eventsHash)],
    ["Network hash", toHex0x(block.networkHash)],
  ];
  return (
    <main>
      <PageHeader
        eyebrow="Committed block"
        title={`Block ${height}`}
        value={toHex0x(block.blockHash)}
        copyLabel="Copy block hash"
      />
      <div className="app-container flex flex-col gap-6 py-8">
        <dl>
          {fields.map(([label, value]) => (
            <FieldRow key={label} label={label}>
              <span className="break-all font-mono tabular-nums">{value}</span>
            </FieldRow>
          ))}
        </dl>
        <nav aria-label="Block navigation" className="flex flex-wrap gap-4">
          <Button asChild>
            <Link href={`/block/${height}/transactions`}>
              View transactions
            </Link>
          </Button>
          {transactions.status === "ok" &&
          block.blockHeight > BigInt(transactions.data.oldest) ? (
            <Button asChild variant="outline">
              <Link href={`/block/${block.blockHeight - 1n}`}>
                Previous block
              </Link>
            </Button>
          ) : null}
          {transactions.status === "ok" &&
          block.blockHeight < BigInt(transactions.data.latest) ? (
            <Button asChild variant="outline">
              <Link href={`/block/${block.blockHeight + 1n}`}>Next block</Link>
            </Button>
          ) : null}
        </nav>
        {transactions.status !== "ok" ? (
          <RpcAlert
            title="Transaction index not available"
            description={transactions.message}
          />
        ) : null}
      </div>
    </main>
  );
}
