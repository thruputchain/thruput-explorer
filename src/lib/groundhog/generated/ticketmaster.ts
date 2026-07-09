// Generated from ticketmaster.wasm — TicketContract interface v0.1.0
// DO NOT EDIT. Re-run codegen to update.

import type { ContractAddress, GasAmount, Invocation } from "@groundhogchain/protocol";
import { contractEntrypointID, topic } from "@groundhogchain/protocol";
import { fromHex } from "@groundhogchain/protocol/utils";
import { ContractTypeKind, ContractTypeDefKind, contractSpecString } from "@groundhogchain/contract-spec";
import type { ContractSpec, ContractType } from "@groundhogchain/client";
import { encodeCalldata } from "@groundhogchain/client";
import { buildNamedCodecs } from "@groundhogchain/client";
import { createInvocation } from "@groundhogchain/client";
import { resolveCodec } from "@groundhogchain/client";
import { CxsReader } from "@groundhogchain/xdr";

const s = contractSpecString;

const entrypoints = {
  TicketContract: {
    availableSupply: contractEntrypointID(fromHex("c08e5daea5c62139")),
    createEvent: contractEntrypointID(fromHex("a54d8b5c3bd74a72")),
    eventConfig: contractEntrypointID(fromHex("5e550038543ce5f9")),
    listEventIds: contractEntrypointID(fromHex("43f61a7f1cc11831")),
    listTicketIds: contractEntrypointID(fromHex("6645770a98de6fd2")),
    mint: contractEntrypointID(fromHex("ce409d243b4aeac6")),
    mintBatch: contractEntrypointID(fromHex("6a7d3b77ad156029")),
    ownerOf: contractEntrypointID(fromHex("b756c48e14d966e4")),
    redeem: contractEntrypointID(fromHex("77705765fdc8ff9d")),
    returnTicket: contractEntrypointID(fromHex("c580d83c54720a4f")),
    ticketInfo: contractEntrypointID(fromHex("41174c8483792713")),
    transfer: contractEntrypointID(fromHex("b80e54537ba6f3a6")),
  },
} as const;

export interface EventConfig { organizer: ContractAddress; max_supply: bigint; event_id: bigint; event_start_block: bigint; event_end_block: bigint; }

export enum TicketError { EventAlreadyExists = 1, EventNotFound = 2, NotOrganizer = 3, TicketAlreadyExists = 4, TicketNotFound = 5, NotTicketOwner = 6, TicketAlreadyRedeemed = 7, MaxSupplyReached = 8, EventAlreadyStarted = 9, EventNotStarted = 10, EventEnded = 11, InvalidEventWindow = 12, }

export interface TicketInfo { event_id: bigint; ticket_id: bigint; redeemed: boolean; }

export const spec = {
  interfaces: [
    {
      name: s("TicketContract"),
      vers: s("0.1.0"),
      throws: [
        { selector: 0xa5d0659941690169n, ty: { v: ContractTypeKind.Named, named: s("TicketError") } },
      ],
      methods: [
        {
          name: s("available_supply"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.U64 },
        },
        {
          name: s("create_event"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("max_supply"), ty: { v: ContractTypeKind.U64 } },
            { name: s("event_start_block"), ty: { v: ContractTypeKind.U64 } },
            { name: s("event_end_block"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Void },
        },
        {
          name: s("event_config"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Named, named: s("EventConfig") },
        },
        {
          name: s("list_event_ids"),
          args: [
          ],
          return_type: { v: ContractTypeKind.Vector, vector: { element: { v: ContractTypeKind.U64 }, max_len: 1000n } },
        },
        {
          name: s("list_ticket_ids"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Vector, vector: { element: { v: ContractTypeKind.U64 }, max_len: 1000n } },
        },
        {
          name: s("mint"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("to"), ty: { v: ContractTypeKind.Address } },
            { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Void },
        },
        {
          name: s("mint_batch"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("to"), ty: { v: ContractTypeKind.Address } },
            { name: s("count"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Void },
        },
        {
          name: s("owner_of"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Address },
        },
        {
          name: s("redeem"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Void },
        },
        {
          name: s("return_ticket"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Void },
        },
        {
          name: s("ticket_info"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
          ],
          return_type: { v: ContractTypeKind.Named, named: s("TicketInfo") },
        },
        {
          name: s("transfer"),
          args: [
            { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
            { name: s("to"), ty: { v: ContractTypeKind.Address } },
          ],
          return_type: { v: ContractTypeKind.Void },
        },
      ],
    },
  ],
  type_defs: [
    {
      v: ContractTypeDefKind.TypeDefStruct,
      struct_def: {
        name: s("EventConfig"),
        fields: [
          { name: s("organizer"), ty: { v: ContractTypeKind.Address } },
          { name: s("max_supply"), ty: { v: ContractTypeKind.U64 } },
          { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
          { name: s("event_start_block"), ty: { v: ContractTypeKind.U64 } },
          { name: s("event_end_block"), ty: { v: ContractTypeKind.U64 } },
        ],
      },
    },
    {
      v: ContractTypeDefKind.TypeDefEnum,
      enum_def: {
        name: s("TicketError"),
        variants: [
          { name: s("EventAlreadyExists"), value: 1n },
          { name: s("EventNotFound"), value: 2n },
          { name: s("NotOrganizer"), value: 3n },
          { name: s("TicketAlreadyExists"), value: 4n },
          { name: s("TicketNotFound"), value: 5n },
          { name: s("NotTicketOwner"), value: 6n },
          { name: s("TicketAlreadyRedeemed"), value: 7n },
          { name: s("MaxSupplyReached"), value: 8n },
          { name: s("EventAlreadyStarted"), value: 9n },
          { name: s("EventNotStarted"), value: 10n },
          { name: s("EventEnded"), value: 11n },
          { name: s("InvalidEventWindow"), value: 12n },
        ],
      },
    },
    {
      v: ContractTypeDefKind.TypeDefStruct,
      struct_def: {
        name: s("TicketInfo"),
        fields: [
          { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
          { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
          { name: s("redeemed"), ty: { v: ContractTypeKind.Bool } },
        ],
      },
    },
  ],
  events: [
    {
      name: s("EventCreated"),
      signature: topic(fromHex("b4014422cfe171d0e38162ad7fb4a6b8d6e77e1f18b499fb3f2bb7774943d900")),
      topics: [
        { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
      ],
      fields: [
        { name: s("organizer"), ty: { v: ContractTypeKind.Address } },
        { name: s("max_supply"), ty: { v: ContractTypeKind.U64 } },
        { name: s("event_start_block"), ty: { v: ContractTypeKind.U64 } },
        { name: s("event_end_block"), ty: { v: ContractTypeKind.U64 } },
      ],
    },
    {
      name: s("TicketMinted"),
      signature: topic(fromHex("8eaa6fe07b7c681bf88fd604ab0102245839ccab1453284d792ad6253751d4ea")),
      topics: [
        { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
        { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
      ],
      fields: [
        { name: s("owner"), ty: { v: ContractTypeKind.Address } },
      ],
    },
    {
      name: s("TicketRedeemed"),
      signature: topic(fromHex("e3443dbdfe26e47cb7a9ba21955ad2575d5cab9843cecab6163593450d07540b")),
      topics: [
        { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
        { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
      ],
      fields: [
        { name: s("owner"), ty: { v: ContractTypeKind.Address } },
      ],
    },
    {
      name: s("TicketReturned"),
      signature: topic(fromHex("6ca1ef328f3683d29f6ef1f37b3b4129f92ced1e8aa42a705d481c93946a356a")),
      topics: [
        { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
        { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
      ],
      fields: [
        { name: s("owner"), ty: { v: ContractTypeKind.Address } },
      ],
    },
    {
      name: s("TicketTransferred"),
      signature: topic(fromHex("6a81e566073e11efe218f99d04c36b988b0947b127506e94fddd0d2d59054517")),
      topics: [
        { name: s("event_id"), ty: { v: ContractTypeKind.U64 } },
        { name: s("ticket_id"), ty: { v: ContractTypeKind.U64 } },
      ],
      fields: [
        { name: s("from"), ty: { v: ContractTypeKind.Address } },
        { name: s("to"), ty: { v: ContractTypeKind.Address } },
      ],
    },
  ],
};

const generatedSpec = spec as unknown as ContractSpec & { events: { fields: { ty: ContractType }[] }[] };
const namedCodecs = buildNamedCodecs(generatedSpec.type_defs);

export const TicketContract = {
  availableSupply(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.availableSupply,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "available_supply", [args.eventId], namedCodecs),
    });
  },
  createEvent(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint; maxSupply: bigint; eventStartBlock: bigint; eventEndBlock: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.createEvent,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "create_event", [args.eventId, args.maxSupply, args.eventStartBlock, args.eventEndBlock], namedCodecs),
    });
  },
  eventConfig(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.eventConfig,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "event_config", [args.eventId], namedCodecs),
    });
  },
  listEventIds(
    contract: ContractAddress,
    gasLimit: GasAmount,
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.listEventIds,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "list_event_ids", [], namedCodecs),
    });
  },
  listTicketIds(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.listTicketIds,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "list_ticket_ids", [args.eventId], namedCodecs),
    });
  },
  mint(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint; to: ContractAddress; ticketId: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.mint,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "mint", [args.eventId, args.to, args.ticketId], namedCodecs),
    });
  },
  mintBatch(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint; to: ContractAddress; count: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.mintBatch,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "mint_batch", [args.eventId, args.to, args.count], namedCodecs),
    });
  },
  ownerOf(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint; ticketId: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.ownerOf,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "owner_of", [args.eventId, args.ticketId], namedCodecs),
    });
  },
  redeem(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint; ticketId: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.redeem,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "redeem", [args.eventId, args.ticketId], namedCodecs),
    });
  },
  returnTicket(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint; ticketId: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.returnTicket,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "return_ticket", [args.eventId, args.ticketId], namedCodecs),
    });
  },
  ticketInfo(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint; ticketId: bigint },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.ticketInfo,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "ticket_info", [args.eventId, args.ticketId], namedCodecs),
    });
  },
  transfer(
    contract: ContractAddress,
    gasLimit: GasAmount,
    args: { eventId: bigint; ticketId: bigint; to: ContractAddress },
  ): Invocation {
    return createInvocation({
      invoked_address: contract,
      entrypoint: entrypoints.TicketContract.transfer,
      gas_limit: gasLimit,
      calldata: encodeCalldata(generatedSpec, "TicketContract", "transfer", [args.eventId, args.ticketId, args.to], namedCodecs),
    });
  },
} as const;

function topicEquals(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (a === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface EventCreated {
  name: "EventCreated";
  topics: { event_id: Uint8Array; };
  fields: { organizer: ContractAddress; max_supply: bigint; event_start_block: bigint; event_end_block: bigint; };
}
export const EventCreated = {
  /** Topic-0 signature hash from the contract spec. */
  signature: fromHex("b4014422cfe171d0e38162ad7fb4a6b8d6e77e1f18b499fb3f2bb7774943d900"),
  /** Returns null if topic 0 does not identify this event. */
  decode(event: { topics: Uint8Array[]; data: Uint8Array }): EventCreated | null {
    if (!topicEquals(event.topics[0], EventCreated.signature)) return null;
    if (event.topics.length !== 2) {
      throw new Error(`EventCreated: expected 2 topics, got ${event.topics.length}`);
    }
    const r = new CxsReader(event.data);
    const f0 = resolveCodec(generatedSpec.events[0].fields[0].ty, namedCodecs).decode(r) as ContractAddress;
    const f1 = resolveCodec(generatedSpec.events[0].fields[1].ty, namedCodecs).decode(r) as bigint;
    const f2 = resolveCodec(generatedSpec.events[0].fields[2].ty, namedCodecs).decode(r) as bigint;
    const f3 = resolveCodec(generatedSpec.events[0].fields[3].ty, namedCodecs).decode(r) as bigint;
    if (r.remaining !== 0) {
      throw new Error(`EventCreated: ${r.remaining} trailing bytes after payload`);
    }
    return { name: "EventCreated", topics: { event_id: event.topics[1] }, fields: { organizer: f0, max_supply: f1, event_start_block: f2, event_end_block: f3 } };
  },
} as const;

export interface TicketMinted {
  name: "TicketMinted";
  topics: { event_id: Uint8Array; ticket_id: Uint8Array; };
  fields: { owner: ContractAddress; };
}
export const TicketMinted = {
  /** Topic-0 signature hash from the contract spec. */
  signature: fromHex("8eaa6fe07b7c681bf88fd604ab0102245839ccab1453284d792ad6253751d4ea"),
  /** Returns null if topic 0 does not identify this event. */
  decode(event: { topics: Uint8Array[]; data: Uint8Array }): TicketMinted | null {
    if (!topicEquals(event.topics[0], TicketMinted.signature)) return null;
    if (event.topics.length !== 3) {
      throw new Error(`TicketMinted: expected 3 topics, got ${event.topics.length}`);
    }
    const r = new CxsReader(event.data);
    const f0 = resolveCodec(generatedSpec.events[1].fields[0].ty, namedCodecs).decode(r) as ContractAddress;
    if (r.remaining !== 0) {
      throw new Error(`TicketMinted: ${r.remaining} trailing bytes after payload`);
    }
    return { name: "TicketMinted", topics: { event_id: event.topics[1], ticket_id: event.topics[2] }, fields: { owner: f0 } };
  },
} as const;

export interface TicketRedeemed {
  name: "TicketRedeemed";
  topics: { event_id: Uint8Array; ticket_id: Uint8Array; };
  fields: { owner: ContractAddress; };
}
export const TicketRedeemed = {
  /** Topic-0 signature hash from the contract spec. */
  signature: fromHex("e3443dbdfe26e47cb7a9ba21955ad2575d5cab9843cecab6163593450d07540b"),
  /** Returns null if topic 0 does not identify this event. */
  decode(event: { topics: Uint8Array[]; data: Uint8Array }): TicketRedeemed | null {
    if (!topicEquals(event.topics[0], TicketRedeemed.signature)) return null;
    if (event.topics.length !== 3) {
      throw new Error(`TicketRedeemed: expected 3 topics, got ${event.topics.length}`);
    }
    const r = new CxsReader(event.data);
    const f0 = resolveCodec(generatedSpec.events[2].fields[0].ty, namedCodecs).decode(r) as ContractAddress;
    if (r.remaining !== 0) {
      throw new Error(`TicketRedeemed: ${r.remaining} trailing bytes after payload`);
    }
    return { name: "TicketRedeemed", topics: { event_id: event.topics[1], ticket_id: event.topics[2] }, fields: { owner: f0 } };
  },
} as const;

export interface TicketReturned {
  name: "TicketReturned";
  topics: { event_id: Uint8Array; ticket_id: Uint8Array; };
  fields: { owner: ContractAddress; };
}
export const TicketReturned = {
  /** Topic-0 signature hash from the contract spec. */
  signature: fromHex("6ca1ef328f3683d29f6ef1f37b3b4129f92ced1e8aa42a705d481c93946a356a"),
  /** Returns null if topic 0 does not identify this event. */
  decode(event: { topics: Uint8Array[]; data: Uint8Array }): TicketReturned | null {
    if (!topicEquals(event.topics[0], TicketReturned.signature)) return null;
    if (event.topics.length !== 3) {
      throw new Error(`TicketReturned: expected 3 topics, got ${event.topics.length}`);
    }
    const r = new CxsReader(event.data);
    const f0 = resolveCodec(generatedSpec.events[3].fields[0].ty, namedCodecs).decode(r) as ContractAddress;
    if (r.remaining !== 0) {
      throw new Error(`TicketReturned: ${r.remaining} trailing bytes after payload`);
    }
    return { name: "TicketReturned", topics: { event_id: event.topics[1], ticket_id: event.topics[2] }, fields: { owner: f0 } };
  },
} as const;

export interface TicketTransferred {
  name: "TicketTransferred";
  topics: { event_id: Uint8Array; ticket_id: Uint8Array; };
  fields: { from: ContractAddress; to: ContractAddress; };
}
export const TicketTransferred = {
  /** Topic-0 signature hash from the contract spec. */
  signature: fromHex("6a81e566073e11efe218f99d04c36b988b0947b127506e94fddd0d2d59054517"),
  /** Returns null if topic 0 does not identify this event. */
  decode(event: { topics: Uint8Array[]; data: Uint8Array }): TicketTransferred | null {
    if (!topicEquals(event.topics[0], TicketTransferred.signature)) return null;
    if (event.topics.length !== 3) {
      throw new Error(`TicketTransferred: expected 3 topics, got ${event.topics.length}`);
    }
    const r = new CxsReader(event.data);
    const f0 = resolveCodec(generatedSpec.events[4].fields[0].ty, namedCodecs).decode(r) as ContractAddress;
    const f1 = resolveCodec(generatedSpec.events[4].fields[1].ty, namedCodecs).decode(r) as ContractAddress;
    if (r.remaining !== 0) {
      throw new Error(`TicketTransferred: ${r.remaining} trailing bytes after payload`);
    }
    return { name: "TicketTransferred", topics: { event_id: event.topics[1], ticket_id: event.topics[2] }, fields: { from: f0, to: f1 } };
  },
} as const;

export type TicketContractEvent = EventCreated | TicketMinted | TicketRedeemed | TicketReturned | TicketTransferred;

export function decodeEvent(event: { topics: Uint8Array[]; data: Uint8Array }): TicketContractEvent | null {
  return EventCreated.decode(event) ?? TicketMinted.decode(event) ?? TicketRedeemed.decode(event) ?? TicketReturned.decode(event) ?? TicketTransferred.decode(event);
}
