import Link from "next/link";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import type { TransactionPageData } from "@/lib/groundhog/types";

export function TransactionHeader({ data }: { data: TransactionPageData }) {
  return (
    <header className="flex flex-col gap-2 py-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-2">
        <p className="font-mono uppercase text-sm text-muted-foreground">
          Transaction
        </p>
        <div className="flex items-center gap-2">
          <h1 className="break-all font-mono text-lg font-semibold tracking-tight sm:text-xl">
            {data.hash}
          </h1>
          <CopyButton value={data.hash} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button render={<Link href="/" />} nativeButton={false} variant="secondary" size="sm">
          Back to search
        </Button>
      </div>
    </header>
  );
}
