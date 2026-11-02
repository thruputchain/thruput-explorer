import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { InspectionDetails, RawInput } from "@/components/inspection-details";
import { JsonCode } from "@/components/json-code";
import { FieldRow } from "./field-row";
import type { LoadedTransactionPage } from "@/lib/thruput/transactions";
import type { CallPreview } from "@/lib/thruput/transaction-input";

export function TransactionTechnicalCard({
  data,
}: {
  data: LoadedTransactionPage;
}) {
  return (
    <Card>
      <CardContent>
        <InspectionDetails title="Technical details">
          <dl>
            <FieldRow label="RPC URL">{data.rpcUrl}</FieldRow>
            {data.receipt?.returnData ? (
              <FieldRow label="Root return data">
                {data.receipt.returnData}
              </FieldRow>
            ) : null}
            {data.receipt?.abortData ? (
              <FieldRow label="Root abort data">
                {data.receipt.abortData}
              </FieldRow>
            ) : null}
          </dl>
          <Suspense
            fallback={
              <p className="text-muted-foreground">Loading input details…</p>
            }
          >
            <InputEvidence data={data} />
          </Suspense>
          {data.receipt?.events.length ? (
            <section className="flex min-w-0 flex-col gap-3">
              <h3 className="font-medium">Raw events</h3>
              {data.receipt.events.map((event, index) => (
                <div key={index} className="flex min-w-0 flex-col gap-2">
                  <p className="font-mono wrap-anywhere">
                    Event #{index + 1} · {event.contractAddress}
                  </p>
                  <RawInput
                    value={JSON.stringify(
                      { topics: event.topics, data: event.data },
                      null,
                      2,
                    )}
                    label={`Raw event ${index + 1}`}
                  />
                </div>
              ))}
            </section>
          ) : null}
          {data.receipt?.rawJson ? (
            <section className="flex min-w-0 flex-col gap-3">
              <h3 className="font-medium">Raw transaction receipt</h3>
              <pre
                tabIndex={0}
                aria-label="Raw transaction receipt JSON"
                className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-sm"
              >
                <JsonCode value={data.receipt.rawJson} />
              </pre>
            </section>
          ) : null}
        </InspectionDetails>
      </CardContent>
    </Card>
  );
}

async function InputEvidence({ data }: { data: LoadedTransactionPage }) {
  if (!data.loadInput) return null;
  const input = await data.loadInput();
  if (input.status === "unavailable")
    return <p className="text-muted-foreground">{input.reason}</p>;
  return (
    <>
      <p className="text-pretty text-muted-foreground">
        Input bytes were hash-checked at block {input.blockHeight}. Decoding
        uses current specs or built-in interface candidates, not historical code
        identity. Requested calls are not an execution trace; root output is not
        a child-call result.
      </p>
      <CallEvidence call={input.root} title="Root invocation" />
      {input.requested.map((call, index) => (
        <CallEvidence
          key={index}
          call={call}
          title={`Requested call ${index + 1}`}
        />
      ))}
      <h3 className="font-medium">Canonical transaction XDR</h3>
      <RawInput
        value={input.transactionXdr}
        label="Canonical Transaction XDR"
      />
    </>
  );
}

function CallEvidence({ call, title }: { call: CallPreview; title: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="font-medium">{title}</h3>
      <dl>
        <FieldRow label="Interface">{call.method ?? "Unknown"}</FieldRow>
        <FieldRow label="Target">{call.target}</FieldRow>
        <FieldRow label="Selector">{call.selector}</FieldRow>
        <FieldRow label="Requested gas">{call.gasLimit}</FieldRow>
        <FieldRow label="Calldata">{call.calldata}</FieldRow>
      </dl>
      <p className="text-muted-foreground wrap-anywhere">{call.metadata}</p>
      {call.args ? (
        <RawInput value={call.args} label={`${title} arguments JSON`} />
      ) : null}
      {call.output ? (
        <>
          <h4 className="font-medium">Root outcome</h4>
          <RawInput value={call.output} label="Root outcome preview" />
        </>
      ) : null}
    </section>
  );
}
