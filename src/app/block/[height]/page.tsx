import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { toBase58 } from "@thruputchain/client";

import { PageHeader } from "@/components/page-header";
import { BlockLink } from "@/components/block-link";
import { RpcAlert } from "@/components/rpc-alert";
import { FieldRow } from "@/components/transaction/field-row";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockActivityCard } from "@/components/block-activity-card";
import { loadBlock, loadBlockTransactions } from "@/lib/thruput/blocks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    ["Timestamp (nanoseconds)", block.blockTimepoint.toString()],
    ["Proposer", toBase58(block.proposer)],
    ["Protocol", String(block.protocol)],
    ["Parent hash", toBase58(block.prevBlockHash)],
    ["Transaction root", toBase58(block.txsHash)],
    ["Storage root", toBase58(block.storageHash)],
    ["Events root", toBase58(block.eventsHash)],
    ["Network hash", toBase58(block.networkHash)],
  ];
  return (
    <main>
      <PageHeader
        title={`Block ${height}`}
        value={toBase58(block.blockHash)}
        copyLabel="Copy block hash"
        actions={
          <nav aria-label="Block navigation" className="flex flex-wrap gap-3">
            {transactions.status === "ok" &&
            block.blockHeight > BigInt(transactions.data.oldest) ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/block/${block.blockHeight - 1n}`}>
                  <ArrowLeftIcon aria-hidden="true" />
                  Previous block
                </Link>
              </Button>
            ) : null}
            {transactions.status === "ok" &&
            block.blockHeight < BigInt(transactions.data.latest) ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/block/${block.blockHeight + 1n}`}>
                  Next block
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </nav>
        }
      />
      <div className="app-container flex flex-col gap-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <FieldRow label="Height">
                <BlockLink height={block.blockHeight.toString()} />
              </FieldRow>
              {fields.map(([label, value]) => (
                <FieldRow key={label} label={label}>
                  <span className="break-all font-mono tabular-nums">
                    {value}
                  </span>
                </FieldRow>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Tabs defaultValue="transactions" className="min-w-0 w-full">
          <div className="max-w-full overflow-x-auto overflow-y-hidden">
            <TabsList variant="line" aria-label="Block activity">
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="transactions">
            {transactions.status === "ok" ? (
              <BlockActivityCard
                key={height}
                height={height}
                page={transactions.data}
              />
            ) : (
              <RpcAlert
                title="Transaction index not available"
                description={transactions.message}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
