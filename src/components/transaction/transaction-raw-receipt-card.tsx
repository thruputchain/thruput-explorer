import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JsonCode } from "@/components/json-code";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { TransactionPageData } from "@/lib/thruput/types";

export function TransactionRawReceiptCard({ data }: { data: TransactionPageData }) {
  if (!data.receipt?.rawJson) return null;

  return (
    <Card>
      <Collapsible>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Raw transaction receipt</CardTitle>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">Toggle JSON</Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-4">
            <pre tabIndex={0} aria-label="Raw transaction receipt JSON" className="max-h-[520px] overflow-auto rounded-md border bg-muted p-4 font-mono text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-ring">
              <JsonCode value={data.receipt.rawJson} />
            </pre>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
