import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldRow } from "@/components/transaction/field-row";
import { BlockLink } from "@/components/block-link";
import { InspectionDetails } from "@/components/inspection-details";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ContractSpecView } from "@/lib/thruput/contract-spec";
import type { SpecDefinitionView } from "@/lib/thruput/spec-format";

const labels = {
  spec: "Embedded spec · artifact hash checked",
  native: "Built-in contract · no artifact-bound spec",
  nativeInterface: "Built-in interface · not artifact-bound",
  absent: "No embedded spec",
  unsupportedFormat: "Artifact format not supported",
  unsupportedSchema: "Spec schema not supported",
  unsupportedContract: "Contract type not supported",
};

export function ContractSpecCard({ data }: { data: ContractSpecView }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contract spec</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        {data.status === "unavailable" ? (
          <p>
            {data.reason ??
              "Contract metadata is unavailable from this endpoint."}
          </p>
        ) : data.status === "notDeployed" ? (
          <dl>
            <FieldRow label="Deployment">No contract at this snapshot</FieldRow>
            <FieldRow label="State block">
              <BlockLink height={data.stateBlockHeight} />
            </FieldRow>
          </dl>
        ) : (
          <>
            {data.truncated ? (
              <p className="text-muted-foreground">
                Spec preview shortened to the page display limit. Some
                definitions or values are omitted.
              </p>
            ) : null}
            {data.metadata === "spec" || data.metadata === "nativeInterface" ? (
              <>
                {data.interfaces.map((iface) => (
                  <section key={iface} className="flex min-w-0 flex-col gap-3">
                    <h3 className="text-balance font-medium wrap-anywhere">
                      {iface.replace("@", " ")}
                    </h3>
                    <Methods
                      methods={data.methods.filter(
                        (method) => method.interface === iface,
                      )}
                    />
                  </section>
                ))}
                {data.events.length ? (
                  <section className="flex min-w-0 flex-col gap-3">
                    <h3 className="text-balance font-medium">Events</h3>
                    <Table className="min-w-sm table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-1/3">Event</TableHead>
                          <TableHead>Fields</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.events.map((event, index) => (
                          <TableRow key={index}>
                            <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
                              {event.name}
                            </TableCell>
                            <TableCell className="whitespace-normal font-mono wrap-anywhere">
                              {event.fields || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </section>
                ) : null}
                <Definitions title="Errors" definitions={data.errors} />
                <Definitions title="Types" definitions={data.types} />
              </>
            ) : (
              <p>{labels[data.metadata]}</p>
            )}
            <InspectionDetails title="Technical details">
              <dl>
                {data.selectionSource ? (
                  <FieldRow label="Selection">
                    {data.selectionSource === "networkDefault"
                      ? "Network default · root invocation"
                      : "Explicit deployment"}
                  </FieldRow>
                ) : null}
                <FieldRow label="State block">
                  <BlockLink height={data.stateBlockHeight} />
                </FieldRow>
                <FieldRow label="Contract hash">
                  <span className="break-all">{data.hash}</span>
                </FieldRow>
                <FieldRow label="Artifact size">{data.size} bytes</FieldRow>
                <FieldRow label="Metadata">{labels[data.metadata]}</FieldRow>
              </dl>
              <p className="text-pretty text-base text-muted-foreground sm:text-sm">
                {data.metadata === "nativeInterface"
                  ? "This built-in interface describes the selected native identifier. It does not authenticate runtime code or historical behavior."
                  : "The spec describes the current contract. An embedded spec is bound to its artifact hash, but does not verify behavior or identify historical code."}
                {data.selectionSource === "networkDefault"
                  ? " The network default applies to undeployed root invocations. Selection does not prove authorization."
                  : ""}
              </p>
            </InspectionDetails>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Definitions({
  title,
  definitions,
}: {
  title: string;
  definitions: SpecDefinitionView[];
}) {
  if (!definitions.length) return null;
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <h3 className="text-balance font-medium">{title}</h3>
      <Table className="min-w-sm table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Type</TableHead>
            <TableHead>Definition</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {definitions.map((definition) => (
            <TableRow key={definition.identity}>
              <TableCell
                className="whitespace-normal align-top font-mono wrap-anywhere"
                title={definition.identity}
              >
                {definition.name}
              </TableCell>
              <TableCell className="whitespace-normal font-mono wrap-anywhere">
                <ul role="list" className="flex flex-col gap-1">
                  {definition.members.map((member, index) => (
                    <li key={index}>{member}</li>
                  ))}
                </ul>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function Methods({
  methods,
}: {
  methods: Extract<ContractSpecView, { status: "available" }>["methods"];
}) {
  if (!methods.length)
    return <p className="text-muted-foreground">No methods declared.</p>;
  const effects = methods.some((method) => method.effect);
  return (
    <Table className="min-w-md table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3">Method</TableHead>
          <TableHead>Parameters</TableHead>
          <TableHead className="w-1/4">Returns</TableHead>
          {effects ? <TableHead>Declared effect</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {methods.map((method, index) => (
          <TableRow key={index}>
            <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
              {method.name}
            </TableCell>
            <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
              {method.parameters || "—"}
            </TableCell>
            <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
              {method.returns}
            </TableCell>
            {effects ? <TableCell>{method.effect || "—"}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
