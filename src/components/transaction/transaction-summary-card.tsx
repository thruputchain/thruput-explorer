import { BlockLink } from "@/components/block-link";
import { FieldRow } from "./field-row";

import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatFreshness } from "@/lib/thruput/format";
import type { TransactionPageData } from "@/lib/thruput/types";

export function TransactionSummaryCard({ data }: { data: TransactionPageData }) {
  const freshness = formatFreshness(data.status.status === "committed" ? data.status.height : undefined, data.chainTipHeight);
  const executionDetails = getExecutionDetails(data);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <dl>
          <FieldRow label="Status">
            <StatusBadge status={data.status} />
          </FieldRow>
          {data.receipt ? <>
            <FieldRow label="Execution">{data.receipt.execution}</FieldRow>
            <FieldRow label="Gas used">{data.receipt.gasUsed}</FieldRow>
          </> : null}
          <FieldRow label="Block height">
            {data.status.status === "committed" ? <BlockLink height={data.status.height} /> : statusLabel(data.status.status)}
          </FieldRow>
          {data.status.status === "recentFailure" ? <FieldRow label="Attempt height"><BlockLink height={data.status.attemptHeight} /></FieldRow> : null}
          {executionDetails.map((detail) => (
            <FieldRow label={detail.label} key={detail.label}>
              <span className="break-all font-mono">{detail.value}</span>
            </FieldRow>
          ))}
          <FieldRow label="Freshness">{freshness ?? "-"}</FieldRow>
          <FieldRow label="Receipt">{data.receipt ? "Available" : "Not available"}</FieldRow>
          {data.receiptError ? <FieldRow label="Receipt error">{data.receiptError.message}</FieldRow> : null}
          <FieldRow label="RPC URL"><span className="font-mono">{data.rpcUrl}</span></FieldRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function getExecutionDetails(data: TransactionPageData) {
  const details: Array<{ label: string; value: string }> = [];

  if (data.status.status === "unsupported") details.push({ label: "Unsupported status", value: data.status.rawJson });
  const failure = data.status.status === "recentFailure" ? data.status : "recentFailure" in data.status ? data.status.recentFailure : undefined;
  if (failure) {
    if (data.status.status !== "recentFailure") details.push({ label: "Recent attempt height", value: failure.attemptHeight });
    const cause = failure.cause;
    if (cause.kind === "dbConflict") {
      details.push({ label: "Conflict address", value: cause.conflict.address });
      details.push({ label: "Conflict key", value: cause.conflict.key });
      details.push({ label: "Conflict code", value: cause.conflict.code });
    } else if (cause.kind === "contractRejected") {
      details.push({ label: "Rejected contract index", value: String(cause.contractIndex) });
      details.push({ label: "Rejection code", value: cause.code });
    } else {
      details.push({ label: "Failure cause", value: cause.kind === "unsupported" ? cause.rawJson : "Other" });
    }
  }

  if (data.status.status === "retry" || data.status.status === "dropped") {
    details.push({ label: "Error source", value: data.status.error.source });
    details.push({ label: "Error code", value: String(data.status.error.code) });
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
    case "retry":
      return "Retry";
    case "dropped":
      return "Dropped";
    case "unsupported":
      return "Unsupported status";
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
