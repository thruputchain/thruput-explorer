import { addressFromHex, type EmittedEvent } from "@groundhogchain/client";
import { ERC20TransferEvent } from "@groundhogchain/client/contracts";
import { CxsWriter, Int128Codec } from "@groundhogchain/protocol";

export function transferEvent(options: {
  contractAddress?: string;
  from?: string;
  to?: string;
  amount?: bigint;
} = {}): EmittedEvent {
  const writer = new CxsWriter();
  Int128Codec.encode(writer, options.amount ?? 15_000_000n);

  return {
    contractAddress: addressFromHex(options.contractAddress ?? `0x${"cc".repeat(32)}`),
    topics: [
      ERC20TransferEvent.signature.slice(),
      addressFromHex(options.from ?? `0x${"11".repeat(32)}`),
      addressFromHex(options.to ?? `0x${"22".repeat(32)}`),
    ],
    data: writer.finish(),
  };
}
