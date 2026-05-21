import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { EventView } from "@/lib/groundhog/types";

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
  return (
    <div className="flex flex-col gap-3">
      {index > 0 ? <Separator /> : null}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Event #{index + 1}</p>
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
          <p className="text-xs text-muted-foreground">Contract</p>
          <div className="flex flex-col gap-1">
            {event.contractName ? <p className="text-sm font-medium">{event.contractName}</p> : null}
            <code className="break-all rounded-md bg-muted px-2 py-1 text-xs">{event.contractAddress}</code>
          </div>
        </div>
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
          <p className="text-xs text-muted-foreground">Topics</p>
          <div className="flex flex-col gap-2">
            {event.topics.length > 0 ? (
              event.topics.map((topic, topicIndex) => (
                <code className="break-all rounded-md bg-muted px-2 py-1 text-xs" key={`${topic}-${topicIndex}`}>
                  [{topicIndex}] {topic}
                </code>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">[]</p>
            )}
          </div>
        </div>
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:gap-4">
          <p className="text-xs text-muted-foreground">Data</p>
          <code className="break-all rounded-md bg-muted px-2 py-1 text-xs">{event.data ?? "0x"}</code>
        </div>
      </div>
    </div>
  );
}
