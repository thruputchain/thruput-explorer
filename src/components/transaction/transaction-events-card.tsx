import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { EventView } from "@/lib/thruput/types";

export function TransactionEventsCard({ events }: { events: EventView[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Events</CardTitle>
        <CardDescription>{events.length === 0 ? "No events found in the receipt." : `${events.length} emitted event${events.length === 1 ? "" : "s"}.`}</CardDescription>
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
  if (event.decoded) {
    return (
      <div className="flex flex-col gap-3">
        {index > 0 ? <Separator /> : null}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Event #{index + 1}</p>
          <DecodedEvent event={event.decoded} contractAddress={event.contractAddress} contractName={event.contractName} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {index > 0 ? <Separator /> : null}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Event #{index + 1}</p>
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
          <EventLabel>Contract</EventLabel>
          <div className="flex flex-col gap-1">
            <ContractAddressLink address={event.contractAddress} name={event.contractName} />
          </div>
        </div>
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
          <EventLabel>Topics</EventLabel>
          <div className="flex flex-col gap-2">
            {event.topics.length > 0 ? (
              event.topics.map((topic, topicIndex) => (
                <code className="break-all text-xs" key={`${topic}-${topicIndex}`}>
                  [{topicIndex}] {topic}
                </code>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">[]</p>
            )}
          </div>
        </div>
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
          <EventLabel>Data</EventLabel>
          <code className="break-all text-xs">{event.data ?? "0x"}</code>
        </div>
      </div>
    </div>
  );
}

function DecodedEvent({
  event,
  contractAddress,
  contractName,
}: {
  event: NonNullable<EventView["decoded"]>;
  contractAddress: string;
  contractName?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="mb-3 text-sm font-medium">{event.name}</p>
      <div className="grid gap-3 text-sm sm:grid-cols-[140px_1fr] sm:gap-4">
        <EventLabel>Contract</EventLabel>
        <div className="flex flex-col gap-1">
          <ContractAddressLink address={contractAddress} name={contractName} />
        </div>
        {event.from ? (
          <>
            <EventLabel>From</EventLabel>
            <WalletAddressLink address={event.from} />
          </>
        ) : null}
        {event.to ? (
          <>
            <EventLabel>To</EventLabel>
            <WalletAddressLink address={event.to} />
          </>
        ) : null}
        <EventLabel>Amount</EventLabel>
        <p className="font-mono tabular-nums wrap-anywhere">
          {event.amount}
          {event.symbol ? ` ${event.symbol}` : ""}
        </p>
        <EventLabel>Raw amount</EventLabel>
        <code className="break-all text-xs">{event.rawAmount}</code>
      </div>
    </div>
  );
}

function ContractAddressLink({ address, name }: { address: string; name?: string }) {
  return (
    <Link className="break-all underline-offset-4 hover:underline" href={`/address/${address}`}>
      {name ? <p className="text-sm font-medium">{name}</p> : null}
      <code className="break-all text-xs">{address}</code>
    </Link>
  );
}

function WalletAddressLink({ address }: { address: string }) {
  return (
    <Link className="break-all font-mono text-xs underline-offset-4 hover:underline" href={`/address/${address}`}>
      {address}
    </Link>
  );
}

function EventLabel({ children }: { children: string }) {
  return <p className="font-mono text-xs uppercase text-muted-foreground">{children}</p>;
}
