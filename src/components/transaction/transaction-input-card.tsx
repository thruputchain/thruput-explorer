import Link from "next/link";
import { SpecValues } from "@/components/spec-values";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldRow } from "./field-row";
import type { LoadedTransactionPage } from "@/lib/thruput/transactions";

export async function TransactionInputCard({
  data,
}: {
  data: LoadedTransactionPage;
}) {
  if (!data.loadInput) return null;
  const input = await data.loadInput();
  if (input.status === "unavailable")
    return (
      <Card>
        <CardHeader>
          <CardTitle>Transaction input</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{input.reason}</p>
        </CardContent>
      </Card>
    );
  const wrapped = input.requested.length > 0;
  const calls = wrapped && !input.root.deployment
    ? input.requested
    : [input.root, ...input.requested];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {input.root.deployment
            ? "Contract deployment"
            : wrapped
              ? "Requested call"
              : "Root invocation"}
          {!input.root.deployment && calls.length > 1 ? "s" : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        {calls.map((call, index) => (
          <section
            key={index}
            aria-label={
              call.deployment
                ? "Deployment summary"
                : wrapped ? "Requested call" : "Root invocation"
            }
            className="flex min-w-0 flex-col gap-4"
          >
            <h3 className="font-mono text-lg font-medium wrap-anywhere">
              {call.displayMethod ?? "Unknown method"}
            </h3>
            {!call.deployment && call.arguments ? (
              <SpecValues values={call.arguments} />
            ) : null}
            <dl>
              <FieldRow label={call.deployment ? "Wallet" : "Contract"}>
                <AddressLink address={call.target} />
              </FieldRow>
              {wrapped && !input.root.deployment ? (
                <FieldRow label="Wallet">
                  <AddressLink address={input.root.target} />
                </FieldRow>
              ) : null}
              {call.deployment ? (
                <>
                  <FieldRow label="Contract hash">
                    {call.deployment.hash}
                  </FieldRow>
                  <FieldRow label="Funding">{call.deployment.funding}</FieldRow>
                  <FieldRow label="Initializer">
                    {call.deployment.initializer}
                  </FieldRow>
                </>
              ) : null}
            </dl>
          </section>
        ))}
        {input.omitted ? (
          <p className="text-muted-foreground">
            {input.omitted} additional requests are not previewed. Full input is
            in Technical details.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AddressLink({ address }: { address: string }) {
  return (
    <Link
      className="break-all hover:underline underline-offset-4"
      href={`/address/${address}`}
    >
      {address}
    </Link>
  );
}
