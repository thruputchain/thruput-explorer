import { FieldRow } from "./field-row";

import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFreshness } from "@/lib/groundhog/format";
import type { TransactionPageData } from "@/lib/groundhog/types";

export function TransactionSummaryCard({ data }: { data: TransactionPageData }) {
  const freshness = formatFreshness(data.status.status === "committed" ? data.status.height : undefined, data.chainTipHeight);
  const executionDetails = getExecutionDetails(data);

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
          {data.receipt ? <FieldRow label="Execution">{data.receipt.execResult}</FieldRow> : null}
          <FieldRow label="Block height">
            {data.status.status === "committed" ? data.status.height : statusLabel(data.status.status)}
          </FieldRow>
          {executionDetails.map((detail) => (
            <FieldRow label={detail.label} key={detail.label}>
              <span className="break-all font-mono">{detail.value}</span>
            </FieldRow>
          ))}
          <FieldRow label="Chain tip">{data.chainTipHeight ?? "Unavailable"}</FieldRow>
          <FieldRow label="Freshness">{freshness ?? "-"}</FieldRow>
          <FieldRow label="Receipt">{data.receipt ? "Available" : "Not available"}</FieldRow>
          <FieldRow label="RPC URL"><span className="font-mono">{data.rpcUrl}</span></FieldRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function getExecutionDetails(data: TransactionPageData) {
  const details: Array<{ label: string; value: string }> = [];

  if (data.status.status === "invalid") {
    details.push({ label: "Invalid reason", value: data.status.reason });
  }

  if (data.status.status === "recentFailure") {
    details.push({ label: "Attempt height", value: data.status.attemptHeight });
    details.push({ label: "Conflict address", value: data.status.conflict.address });
    details.push({ label: "Conflict key", value: data.status.conflict.key });
    details.push({ label: "Conflict code", value: data.status.conflict.code });
  }

  const receipt = data.receipt;
  if (!receipt) return details;

  if (receipt.returnData && receipt.returnData !== "0x") {
    details.push({ label: "Return data", value: receipt.returnData });
  }

  if (receipt.abortData) {
    details.push({ label: "Abort data", value: receipt.abortData });
  }

  return details;
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
    case "recentFailure":
      return "Recent failure";
    case "other":
      return "Other";
    case "unknown":
      return "Unknown";
    case "committed":
      return "Committed";
  }
}
