import Link from "next/link";
import { BoxIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TransactionActivityRow } from "@/components/transaction-activity-row";
import { ActivityAge } from "@/components/activity-age";
import { shortenIdentifier } from "@/lib/format";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadRecentActivityBlocks, loadRecentActivityTransactions } from "@/lib/thruput/recent-activity";

function ActivityCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <Card className="h-full">
        <CardHeader className="border-b">
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  );
}

function IdentifierLink({ value, kind = "address" }: { value: string; kind?: "address" | "tx" }) {
  return <Link href={`/${kind}/${value}`} title={value} className="min-w-0 truncate font-mono tabular-nums hover:underline hover:underline-offset-4">{shortenIdentifier(value)}</Link>;
}

export async function RecentActivityBlocks() {
  const { blocks, unavailable } = await loadRecentActivityBlocks();
  return (
    <ActivityCard title="Recent blocks">
      <ul className="divide-y">
        {blocks.map((block) => (
          <li key={block.height} className="app-activity-row relative flex flex-col justify-center gap-0.5 pl-10 sm:pl-14">
            <span aria-hidden="true" className="absolute left-0 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md bg-secondary text-muted-foreground sm:size-10">
              <BoxIcon className="size-4 sm:size-5" strokeWidth={1.5} />
            </span>
            <div className="flex min-w-0 items-center gap-3 text-sm leading-5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={`/block/${block.height}`} className="truncate font-mono font-medium tabular-nums hover:underline hover:underline-offset-4">{block.height}</Link>
                <span className="text-xs leading-5 text-muted-foreground"><ActivityAge timestamp={block.timestamp} /></span>
              </div>
              <dl className="grid min-w-0 max-w-3/5 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-xs leading-5">
                <dt className="text-muted-foreground">Proposer:</dt>
                <dd className="flex min-w-0">{block.proposer ? <IdentifierLink value={block.proposer} /> : <span className="text-muted-foreground">Unavailable</span>}</dd>
                <dt className="text-muted-foreground">Transactions:</dt>
                <dd className="text-right"><Link href={`/block/${block.height}/transactions`} aria-label={`${block.complete ? "" : "At least "}${block.hashes.length} ${block.hashes.length === 1 ? "transaction" : "transactions"} →`} className="font-mono tabular-nums hover:underline hover:underline-offset-4">{block.hashes.length}{block.complete ? "" : "+"}</Link></dd>
              </dl>
            </div>
          </li>
        ))}
      </ul>
      {unavailable ? <p role="status">Some recent blocks are temporarily unavailable.</p> : blocks.length === 0 ? <p role="status">No indexed blocks yet.</p> : null}
    </ActivityCard>
  );
}

export async function RecentActivityTransactions() {
  const { transactions, unavailable, limited } = await loadRecentActivityTransactions();
  return (
    <ActivityCard title="Recent transactions">
      <ul className="divide-y">
        {transactions.map((transaction) => <TransactionActivityRow key={transaction.hash} transaction={transaction} />)}
      </ul>
      {unavailable ? <p role="status">Some recent transactions are temporarily unavailable.</p> : limited ? <p role="status" className="text-xs text-muted-foreground">Recent activity scan limit reached. Older transactions may be available.</p> : transactions.length === 0 ? <p role="status">No transactions in the indexed blocks yet.</p> : null}
    </ActivityCard>
  );
}

export function RecentActivityFallback({ title }: { title: string }) {
  return <ActivityCard title={title}><p role="status" aria-busy="true">Loading…</p></ActivityCard>;
}
