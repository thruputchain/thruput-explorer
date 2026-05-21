import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import type { TransactionPageData } from "@/lib/groundhog/types";

export function TransactionHeader({ data }: { data: TransactionPageData }) {
  return (
    <header className="flex flex-col gap-5 border-b px-6 py-6 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button render={<Link href="/" />} variant="outline" size="sm">
            Search
          </Button>
          <StatusBadge status={data.status} />
        </div>
        <CopyButton value={data.hash} label="Copy hash" />
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-muted-foreground">Transaction</p>
        <h1 className="break-all font-mono text-2xl font-semibold tracking-tight sm:text-3xl">{data.hash}</h1>
      </div>
    </header>
  );
}
