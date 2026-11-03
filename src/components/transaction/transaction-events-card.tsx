import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EventDetails, EventName } from "@/components/event-details";
import { shortenIdentifier } from "@/lib/format";
import type { EventView } from "@/lib/thruput/types";

export function TransactionEventsCard({ events }: { events: EventView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Events</CardTitle>
      </CardHeader>
      <CardContent>
        {!events.length ? (
          <p className="text-muted-foreground">
            No events in the available receipt.
          </p>
        ) : (
          <Table className="min-w-xl table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead className="w-1/4">Contract</TableHead>
                <TableHead className="w-1/5">Event</TableHead>
                <TableHead>Fields</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event, index) => (
                <TableRow key={index}>
                  <TableCell className="align-top tabular-nums">
                    {index + 1}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
                    <AddressLink
                      address={event.contractAddress}
                      name={event.contractName}
                    />
                  </TableCell>
                  <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
                    <EventName event={event} />
                  </TableCell>
                  <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
                    <EventDetails event={event} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AddressLink({ address, name }: { address: string; name?: string }) {
  return (
    <Link
      href={`/address/${address}`}
      title={address}
      className="hover:underline underline-offset-4"
    >
      {name ?? shortenIdentifier(address)}
    </Link>
  );
}
