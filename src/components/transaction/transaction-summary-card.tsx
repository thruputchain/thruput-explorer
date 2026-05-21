import { FieldRow } from "./field-row";

import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFreshness } from "@/lib/groundhog/format";
import type { TransactionPageData } from "@/lib/groundhog/types";

export function TransactionSummaryCard({ data }: { data: TransactionPageData }) {
  const freshness = formatFreshness(data.status.kind === "committed" ? data.status.height : undefined, data.chainTip.height);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>Current public RPC view of this transaction.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl>
          <FieldRow label="Status">
            <StatusBadge status={data.status} />
          </FieldRow>
          <FieldRow label="Block height">
            {data.status.kind === "committed" ? data.status.height ?? "Committed" : data.status.label}
          </FieldRow>
          <FieldRow label="Chain tip">{data.chainTip.available ? data.chainTip.height ?? "Available" : "Unavailable"}</FieldRow>
          <FieldRow label="Freshness">{freshness ?? "-"}</FieldRow>
          <FieldRow label="Receipt">{data.receipt.available ? "Available" : "Not available"}</FieldRow>
          <FieldRow label="RPC URL"><span className="font-mono">{data.rpcUrl}</span></FieldRow>
        </dl>
      </CardContent>
    </Card>
  );
}
