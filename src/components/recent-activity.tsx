import Link from "next/link";
import { BoxIcon, FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";
import { shortenIdentifier } from "@/lib/format";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadActivityTime, loadRecentActivityBlocks, loadRecentActivityTransactions } from "@/lib/thruput/recent-activity";

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

async function Age({ timestamp }: { timestamp: number | null }) {
  if (timestamp === null) return <span>Time unavailable</span>;
  const now = await loadActivityTime();
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const [value, unit] = seconds < 60 ? [seconds, "second"] : seconds < 3600 ? [Math.floor(seconds / 60), "minute"] : seconds < 86400 ? [Math.floor(seconds / 3600), "hour"] : [Math.floor(seconds / 86400), "day"];
  return <time dateTime={new Date(timestamp).toISOString()} title={new Date(timestamp).toUTCString()}>{value} {unit}{value === 1 ? "" : "s"} ago</time>;
}

export async function RecentActivityBlocks() {
  const { blocks, unavailable } = await loadRecentActivityBlocks();
  return (
    <ActivityCard title="Recent blocks">
      <ul className="divide-y">
        {blocks.map((block) => (
          <li key={block.height} className="relative flex min-h-18 flex-col justify-center gap-0.5 py-4 pl-10 sm:pl-14">
            <span aria-hidden="true" className="absolute left-0 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md bg-secondary text-muted-foreground sm:size-10">
              <BoxIcon className="size-4 sm:size-5" strokeWidth={1.5} />
            </span>
            <div className="flex min-w-0 items-start gap-3 text-sm leading-5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={`/block/${block.height}`} className="truncate font-mono font-medium tabular-nums hover:underline hover:underline-offset-4">{block.height}</Link>
                <span className="text-xs leading-4 text-muted-foreground"><Age timestamp={block.timestamp} /></span>
              </div>
              <dl className="grid min-w-0 max-w-3/5 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-xs leading-4">
                <dt className="text-muted-foreground">Proposer:</dt>
                <dd className="flex min-w-0">{block.proposer ? <IdentifierLink value={block.proposer} /> : <span className="text-muted-foreground">Unavailable</span>}</dd>
                <dt className="text-muted-foreground">Transactions:</dt>
                <dd className="text-right"><Link href={`/block/${block.height}/transactions`} aria-label={`${block.hashes.length} ${block.hashes.length === 1 ? "transaction" : "transactions"} →`} className="font-mono tabular-nums hover:underline hover:underline-offset-4">{block.hashes.length}</Link></dd>
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
  const { transactions, unavailable } = await loadRecentActivityTransactions();
  return (
    <ActivityCard title="Recent transactions">
      <ul className="divide-y">
        {transactions.map((transaction) => {
          const event = transaction.events.length === 1 ? transaction.events[0] : null;
          return (
            <li key={transaction.hash} className="relative flex min-h-18 flex-col justify-center gap-0.5 py-4 pl-10 sm:pl-14">
              <span aria-hidden="true" className="absolute left-0 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md bg-secondary text-muted-foreground sm:size-10">
                <FileTextIcon className="size-4 sm:size-5" strokeWidth={1.5} />
              </span>
              <div className="flex min-w-0 items-center gap-2 text-sm leading-5 sm:gap-3">
                <span className="flex min-w-0 flex-1 font-medium">
                  <IdentifierLink value={transaction.hash} kind="tx" />
                </span>
                <Link href={`/block/${transaction.height}`} className="flex min-w-0 max-w-1/4 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline hover:underline-offset-4"><span>Block</span><span className="truncate font-mono tabular-nums">{transaction.height}</span></Link>
                {event ? <>
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-xs text-muted-foreground" aria-label={event.name}>
                    {event.from ? <IdentifierLink value={event.from} /> : null}
                    {event.from && event.to ? <span>→</span> : null}
                    {event.to ? <IdentifierLink value={event.to} /> : null}
                  </span>
                  <span title={`${event.amount} ${event.symbol ?? ""}`} className="max-w-1/4 truncate whitespace-nowrap font-mono text-xs tabular-nums">{event.amount} {event.symbol}</span>
                </> : null}
              </div>
              <span className="text-xs leading-4 text-muted-foreground"><Age timestamp={transaction.timestamp} /></span>
            </li>
          );
        })}
      </ul>
      {unavailable ? <p role="status">Some recent transactions are temporarily unavailable.</p> : transactions.length === 0 ? <p role="status">No transactions in the indexed blocks yet.</p> : null}
    </ActivityCard>
  );
}

export function RecentActivityFallback({ title }: { title: string }) {
  return <ActivityCard title={title}><p role="status" aria-busy="true">Loading…</p></ActivityCard>;
}
