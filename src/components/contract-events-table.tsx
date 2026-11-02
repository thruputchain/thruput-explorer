import Link from "next/link";
import { BlockLink } from "@/components/block-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RpcAlert } from "@/components/rpc-alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { shortenIdentifier } from "@/lib/format";
import type { AddressEventView } from "@/lib/thruput/addresses";
import type { SpecEventPreview } from "@/lib/thruput/contract-spec";
import type { RpcFailure } from "@/lib/thruput/types";

export function ContractEventsTable({
  events,
  previews,
  error,
}: {
  events: AddressEventView[];
  previews: SpecEventPreview[];
  error?: RpcFailure;
}) {
  const decoded = new Map(
    previews.map((event) => [`${event.txHash}:${event.sequenceNumber}`, event]),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contract Events</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <RpcAlert
            title="Event history unavailable"
            description="Events could not be loaded from this endpoint."
            error={error}
          />
        ) : !events.length ? (
          <p className="text-muted-foreground">
            No events found for this contract.
          </p>
        ) : (
          <>
            <Table className="min-w-xl table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/5">Transaction</TableHead>
                  <TableHead className="w-16">Block</TableHead>
                  <TableHead className="w-1/5">Event</TableHead>
                  <TableHead>Fields</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const key = `${event.txHash}:${event.sequenceNumber}`;
                  const preview = decoded.get(key);
                  return (
                    <TableRow key={key}>
                      <TableCell className="align-top">
                        <Link
                          className="font-mono hover:underline underline-offset-4"
                          href={`/tx/${event.txHash}`}
                          title={event.txHash}
                        >
                          {shortenIdentifier(event.txHash)}
                        </Link>
                      </TableCell>
                      <TableCell className="align-top">
                        <BlockLink height={event.blockHeight} />
                      </TableCell>
                      <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
                        {preview?.status === "decoded"
                          ? preview.name
                          : preview?.status === "invalid"
                            ? "Could not decode"
                            : "Unknown event"}
                      </TableCell>
                      <TableCell className="min-w-48 whitespace-normal align-top">
                        {preview?.status === "decoded" ? (
                          <p className="font-mono wrap-anywhere">
                            {preview.values.length
                              ? preview.values
                                  .map(
                                    (field) => `${field.name}: ${field.value}`,
                                  )
                                  .join(", ")
                              : "No fields"}
                          </p>
                        ) : (
                          <p className="text-muted-foreground">—</p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
