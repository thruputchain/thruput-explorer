import Link from "next/link";
import { toBase58 } from "@thruputchain/client";
import { NATIVE_TOKEN_ADDRESS } from "@thruputchain/protocol";
import { InspectionDetails, RawInput } from "@/components/inspection-details";
import { TokenEventBadge } from "@/components/token-event-badge";
import { BlockLink } from "@/components/block-link";
import { shortenIdentifier } from "@/lib/format";
import type { EventView } from "@/lib/thruput/types";

export function EventName({ event }: { event: EventView }) {
  if (event.decoded) return <TokenEventBadge kind={event.decoded.kind} />;
  if (event.specEvent?.status === "decoded") return event.specEvent.name;
  return event.specEvent?.status === "invalid" ? "Could not decode" : "Unknown event";
}

export function EventDetails({ event }: { event: EventView }) {
  const preview = event.specEvent;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <EventFields event={event} />
      {event.decoded ? (
        <p className="text-muted-foreground font-sans">
          {event.contractAddress === toBase58(NATIVE_TOKEN_ADDRESS)
            ? "Built-in native token decoding."
            : "Built-in token interface decoding."}
        </p>
      ) : preview ? (
        <p className="text-muted-foreground font-sans">
          Current spec at block <BlockLink height={preview.stateBlockHeight} />;
          historical spec not verified. Contract hash:{" "}
          <span className="font-mono wrap-anywhere">{preview.hash}</span>
        </p>
      ) : null}
      <InspectionDetails title="Raw event">
        <RawInput
          label="Event topics"
          value={event.topics.length ? event.topics.join("\n") : "No topics"}
        />
        <RawInput label="Event data" value={event.data ?? "Unavailable"} />
      </InspectionDetails>
    </div>
  );
}

function EventFields({ event }: { event: EventView }) {
  if (event.decoded)
    return (
      <dl className="flex flex-col gap-2">
        {event.decoded.from ? (
          <div>
            <dt className="text-muted-foreground">From</dt>
            <dd><AddressLink address={event.decoded.from} /></dd>
          </div>
        ) : null}
        {event.decoded.to ? (
          <div>
            <dt className="text-muted-foreground">To</dt>
            <dd><AddressLink address={event.decoded.to} /></dd>
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
          <li key={field.name}>{field.name}: {field.value}</li>
        ))}
      </ul>
    ) : "No fields";
  return null;
}

function AddressLink({ address }: { address: string }) {
  return (
    <Link
      href={`/address/${address}`}
      title={address}
      className="hover:underline underline-offset-4"
    >
      {shortenIdentifier(address)}
    </Link>
  );
}
