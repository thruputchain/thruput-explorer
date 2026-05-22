import { FieldRow } from "./field-row";

import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFreshness } from "@/lib/groundhog/format";
import type { TransactionPageData } from "@/lib/groundhog/types";

export function TransactionSummaryCard({ data }: { data: TransactionPageData }) {
  const freshness = formatFreshness(data.status.status === "committed" ? data.status.height : undefined, data.chainTipHeight);

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
            {data.status.status === "committed" ? data.status.height : statusLabel(data.status.status)}
          </FieldRow>
          <FieldRow label="Chain tip">{data.chainTipHeight ?? "Unavailable"}</FieldRow>
          <FieldRow label="Freshness">{freshness ?? "-"}</FieldRow>
          <FieldRow label="Receipt">{data.receipt ? "Available" : "Not available"}</FieldRow>
          <FieldRow label="RPC URL"><span className="font-mono">{data.rpcUrl}</span></FieldRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function statusLabel(status: TransactionPageData["status"]["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "invalid":
      return "Invalid";
    case "malformed":
      return "Malformed";
    case "unavailable":
      return "Unavailable";
    case "unknown":
      return "Unknown";
    case "committed":
      return "Committed";
  }
}
