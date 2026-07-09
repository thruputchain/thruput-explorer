import { toHex0x, type EmittedEvent } from "@groundhogchain/client";

import { decodeEvent as decodeTicketmasterEvent } from "./generated/ticketmaster";
import type { ContractRegistryEntry } from "./contract-registry";
import type { DecodedEventView } from "./types";

const GENERATED_DECODERS = {
  ticketmaster: decodeTicketmasterEvent,
} satisfies Record<NonNullable<ContractRegistryEntry["kind"]>, (event: { topics: Uint8Array[]; data: Uint8Array }) => unknown>;

export function decodeGeneratedEvent(event: EmittedEvent, contract?: ContractRegistryEntry): DecodedEventView | undefined {
  if (!contract?.kind) return undefined;

  try {
    const decoded = GENERATED_DECODERS[contract.kind]({ topics: event.topics, data: event.data });
    if (!decoded || typeof decoded !== "object") return undefined;

    const decodedRecord = decoded as unknown as Record<string, unknown>;
    return {
      kind: "contract-event",
      name: typeof decodedRecord.name === "string" ? decodedRecord.name : "Event",
      topics: formatRecord(decodedRecord.topics),
      fields: formatRecord(decodedRecord.fields),
    };
  } catch {
    return undefined;
  }
}

function formatRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([name, fieldValue]) => ({ name, value: formatValue(fieldValue) }));
}

function formatValue(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Uint8Array) return toHex0x(value);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  if (value == null) return "null";
  return JSON.stringify(value);
}
