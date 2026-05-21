import { FieldRow } from "./field-row";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransactionPageData } from "@/lib/groundhog/types";

export function TransactionExecutionCard({ data }: { data: TransactionPageData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution</CardTitle>
        <CardDescription>Receipt outcome and return buffers.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl>
          <FieldRow label="Exec result">{data.receipt.execResult ?? "-"}</FieldRow>
          <FieldRow label="Receipt height">{data.receipt.height ?? "-"}</FieldRow>
          <FieldRow label="Return data">
            <span className="break-all font-mono">{data.receipt.returnData || "-"}</span>
          </FieldRow>
          <FieldRow label="Abort data">
            <span className="break-all font-mono">{data.receipt.abortData || "-"}</span>
          </FieldRow>
          {data.status.kind === "invalid" ? <FieldRow label="Invalid reason">{data.status.reason ?? "-"}</FieldRow> : null}
        </dl>
      </CardContent>
    </Card>
  );
}
