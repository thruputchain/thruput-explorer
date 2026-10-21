import Link from "next/link";

import { TokenEventBadge } from "@/components/token-event-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { EventView } from "@/lib/thruput/types";
import { FieldRow } from "./field-row";

export function TransactionEventsCard({ events }: { events: EventView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Events</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Events will appear here when the receipt includes them.</p>
        ) : (
          events.map((event, index) => <EventItem key={`${event.contractAddress}-${index}`} event={event} index={index} />)
        )}
      </CardContent>
    </Card>
  );
}

function EventItem({ event, index }: { event: EventView; index: number }) {
  const decoded = event.decoded;
  return (
    <div className="flex flex-col gap-3">
      {index > 0 ? <Separator /> : null}
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium">Event #{index + 1}</h3>
        {decoded ? <TokenEventBadge kind={decoded.kind} /> : null}
      </div>
      <dl>
        <FieldRow label="Contract">
          <div className="flex max-w-full items-baseline gap-2">
            {event.contractName ? <span className="shrink-0">{event.contractName}</span> : null}
            <Link className="min-w-0 break-all underline-offset-4 hover:underline" href={`/address/${event.contractAddress}`}>{event.contractAddress}</Link>
          </div>
        </FieldRow>
        {decoded ? <>
          {decoded.from ? <FieldRow label="From"><AddressLink address={decoded.from} /></FieldRow> : null}
          {decoded.to ? <FieldRow label="To"><AddressLink address={decoded.to} /></FieldRow> : null}
          <FieldRow label="Amount">{decoded.amount}{decoded.symbol ? ` ${decoded.symbol}` : ""}</FieldRow>
          <FieldRow label="Raw amount">{decoded.rawAmount}</FieldRow>
        </> : <>
          <FieldRow label="Topics">
            <div className="flex flex-col gap-2">
              {event.topics.length > 0 ? event.topics.map((topic, topicIndex) => (
                <code className="break-all" key={`${topic}-${topicIndex}`}>[{topicIndex}] {topic}</code>
              )) : <span className="text-muted-foreground">[]</span>}
            </div>
          </FieldRow>
          <FieldRow label="Data"><code className="break-all">{event.data ?? "0x"}</code></FieldRow>
        </>}
      </dl>
    </div>
  );
}

function AddressLink({ address }: { address: string }) {
  return <Link className="break-all underline-offset-4 hover:underline" href={`/address/${address}`}>{address}</Link>;
}
