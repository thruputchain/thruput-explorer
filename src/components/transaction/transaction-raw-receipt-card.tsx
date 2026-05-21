import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { TransactionPageData } from "@/lib/groundhog/types";

export function TransactionRawReceiptCard({ data }: { data: TransactionPageData }) {
  if (!data.receipt.rawJson) return null;

  return (
    <Card>
      <Collapsible>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Raw txn receipt</CardTitle>
            <CardDescription>Unformatted JSON returned by the transaction receipt RPC.</CardDescription>
          </div>
          <CollapsibleTrigger className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none aria-expanded:bg-muted">
            Toggle JSON
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <pre className="max-h-[520px] overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed">
              <code>{data.receipt.rawJson}</code>
            </pre>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
