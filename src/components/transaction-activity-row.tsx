import Link from "next/link";
import { FileTextIcon } from "lucide-react";

import { ActivityAge } from "@/components/activity-age";
import { TokenEventBadge } from "@/components/token-event-badge";
import { shortenIdentifier } from "@/lib/format";
import type { TransactionActivity } from "@/lib/thruput/transaction-activity";
import { cn } from "@/lib/utils";

export function TransactionActivityRow({ transaction, showIcon = true }: { transaction: TransactionActivity; showIcon?: boolean }) {
  const kinds = [...new Set(transaction.events.map((event) => event.kind))];
  return (
    <li className={cn("app-activity-row relative flex items-center gap-2 sm:gap-3", showIcon && "pl-10 sm:pl-14")}>
      {showIcon ? <span aria-hidden="true" className="absolute left-0 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md bg-secondary text-muted-foreground sm:size-10">
        <FileTextIcon className="size-4 sm:size-5" strokeWidth={1.5} />
      </span> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm leading-5">
        <Link href={`/tx/${transaction.hash}`} title={transaction.hash} className="w-fit max-w-full truncate font-mono font-medium tabular-nums hover:underline hover:underline-offset-4">{shortenIdentifier(transaction.hash)}</Link>
        <span className="text-xs leading-5 text-muted-foreground"><ActivityAge timestamp={transaction.timestamp} /></span>
      </div>
      {kinds.length ? <div className="flex max-w-1/3 flex-wrap justify-end gap-1">
        {kinds.map((kind) => <TokenEventBadge key={kind} kind={kind} />)}
      </div> : null}
      <Link href={`/block/${transaction.height}`} className="flex min-w-0 max-w-1/3 items-center gap-1 text-xs hover:underline hover:underline-offset-4"><span>Block</span><span className="truncate font-mono tabular-nums">{transaction.height}</span></Link>
    </li>
  );
}
