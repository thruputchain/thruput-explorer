import { addressFromBase58, toBase58, toHex0x, type EmittedEvent } from "@thruputchain/client";
import { thruput_erc20_if as ERC20 } from "@thruputchain/client/contracts";
import { CxsWriter, Int128Codec } from "@thruputchain/protocol";

export function identifier(byte: number): string {
  return toBase58(new Uint8Array(32).fill(byte));
}

/** Wire results for the generated optional name, symbol and u32 decimals views. */
export function metadataBatchResponse(values: [string | null | undefined, string | null | undefined, bigint | null | undefined]) {
  return {
    stateBlockHeight: "42",
    results: values.map((value) => {
      if (value === undefined) return { output: { result: "fault" }, events: [], gasUsed: "1" };
      const writer = new CxsWriter();
      writer.writeBool(value !== null);
      if (typeof value === "string") writer.writeString(value, 1024);
      else if (typeof value === "bigint") writer.writeUint32(value);
      return { output: { result: "return", returnData: toHex0x(writer.finish()) }, events: [], gasUsed: "1" };
    }),
  };
}

export function transferEvent(options: {
  contractAddress?: string;
  from?: string;
  to?: string;
  amount?: bigint;
} = {}): EmittedEvent {
  const writer = new CxsWriter();
  Int128Codec.encode(writer, options.amount ?? 15_000_000n);

  return {
    address: addressFromBase58(options.contractAddress ?? identifier(0xcc)),
    topics: [
      ERC20.v0_1.events.TransferEvent.signature.slice(),
      addressFromBase58(options.from ?? identifier(0x11)),
      addressFromBase58(options.to ?? identifier(0x22)),
    ],
    data: writer.finish(),
  };
}
