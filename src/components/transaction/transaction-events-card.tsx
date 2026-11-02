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
import { TokenEventBadge } from "@/components/token-event-badge";
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
                    {event.decoded ? (
                      <TokenEventBadge kind={event.decoded.kind} />
                    ) : event.specEvent?.status === "decoded" ? (
                      event.specEvent.name
                    ) : event.specEvent?.status === "invalid" ? (
                      "Could not decode"
                    ) : (
                      "Unknown event"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal align-top font-mono wrap-anywhere">
                    <EventFields event={event} />
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

function EventFields({ event }: { event: EventView }) {
  if (event.decoded)
    return (
      <dl className="flex flex-col gap-2">
        {event.decoded.from ? (
          <div>
            <dt className="text-muted-foreground">From</dt>
            <dd>
              <AddressLink address={event.decoded.from} />
            </dd>
          </div>
        ) : null}
        {event.decoded.to ? (
          <div>
            <dt className="text-muted-foreground">To</dt>
            <dd>
              <AddressLink address={event.decoded.to} />
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">Amount</dt>
          <dd>
            {event.decoded.amount}
            {event.decoded.symbol ? ` ${event.decoded.symbol}` : ""}
          </dd>
        </div>
      </dl>
    );
  if (event.specEvent?.status === "decoded")
    return event.specEvent.values.length ? (
      <ul role="list" className="flex flex-col gap-1">
        {event.specEvent.values.map((field) => (
          <li key={field.name}>
            {field.name}: {field.value}
          </li>
        ))}
      </ul>
    ) : (
      "No fields"
    );
  return <span className="text-muted-foreground">—</span>;
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
