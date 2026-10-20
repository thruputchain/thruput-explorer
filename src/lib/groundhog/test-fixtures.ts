import { addressFromBase58, toBase58, type EmittedEvent } from "@thruputchain/client";
import { groundhog_erc20_if } from "@thruputchain/client/contracts";
import { CxsWriter, Int128Codec } from "@thruputchain/protocol";

export function identifier(byte: number): string {
  return toBase58(new Uint8Array(32).fill(byte));
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
    contractAddress: addressFromBase58(options.contractAddress ?? identifier(0xcc)),
    topics: [
      groundhog_erc20_if.v0_1.events.TransferEvent.signature.slice(),
      addressFromBase58(options.from ?? identifier(0x11)),
      addressFromBase58(options.to ?? identifier(0x22)),
    ],
    data: writer.finish(),
  };
}
