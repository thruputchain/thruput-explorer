import { toHex0x, type EmittedEvent } from "@groundhogchain/client";
import { createHash } from "node:crypto";
import { CxsReader, Uint128Codec, contractAddress, majorVersionFromSemver, toHex } from "@groundhogchain/protocol";

import type { ContractRegistryEntry } from "./contract-registry";
import type { DecodedEventView } from "./types";

export function decodeTokenEvent(event: EmittedEvent, contract?: ContractRegistryEntry): DecodedEventView | undefined {
  if (!contract?.standard) return undefined;

  const transfer = decodeTransfer(event, contract.standard);
  if (!transfer) return undefined;

  return {
    kind: "token-transfer",
    name: "Transfer",
    from: toHex0x(transfer.from),
    to: toHex0x(transfer.to),
    rawAmount: transfer.amount.toString(),
    amount: formatTokenAmount(transfer.amount, contract.decimals),
    symbol: contract.symbol,
  };
}

function decodeTransfer(event: EmittedEvent, standard: ContractRegistryEntry["standard"]) {
  switch (standard) {
    case "groundhog-token-v1":
      return decodeErc20TransferEvent(event);
    case "groundhog-native-hog":
      return decodeNativeHogTransferEvent(event);
  }
}

type TransferEvent = {
  from: Uint8Array;
  to: Uint8Array;
  amount: bigint;
};

const ERC20_TRANSFER_EVENT_TOPIC = eventSignatureTopic("0.1.0", "groundhog-erc20-if", "TransferEvent");
const NATIVE_HOG_TRANSFER_EVENT_TOPIC = namedEventTopic("TransferEvent");

function decodeErc20TransferEvent(event: EmittedEvent): TransferEvent | undefined {
  if (!matchesTopic(event, ERC20_TRANSFER_EVENT_TOPIC)) return undefined;

  const from = event.topics[1];
  const to = event.topics[2];
  if (!from || !to) return undefined;

  try {
    const reader = new CxsReader(event.data);
    const amount = Uint128Codec.decode(reader);
    if (reader.remaining !== 0) return undefined;

    return { from: contractAddress(from), to: contractAddress(to), amount };
  } catch {
    return undefined;
  }
}

function decodeNativeHogTransferEvent(event: EmittedEvent): TransferEvent | undefined {
  if (!matchesTopic(event, NATIVE_HOG_TRANSFER_EVENT_TOPIC)) return undefined;

  const from = event.topics[1];
  const to = event.topics[2];
  if (!from || !to) return undefined;

  try {
    return {
      from: contractAddress(from),
      to: contractAddress(to),
      amount: decodeFixedUint128(event.data),
    };
  } catch {
    return undefined;
  }
}

function matchesTopic(event: EmittedEvent, topic: Uint8Array) {
  return event.topics[0] != null && toHex(event.topics[0]) === toHex(topic);
}

function decodeFixedUint128(data: Uint8Array) {
  if (data.length !== 16) throw new Error("invalid uint128 length");

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return (view.getBigUint64(0) << BigInt(64)) + view.getBigUint64(8);
}

function eventSignatureTopic(version: string, crateName: string, typeName: string) {
  const signature = `${majorVersionFromSemver(version)}::${crateName}::${typeName}`;
  return createHash("sha256").update(signature).digest();
}

function namedEventTopic(name: string) {
  const topic = new Uint8Array(32);
  topic.set(new TextEncoder().encode(name));
  return topic;
}

function formatTokenAmount(rawAmount: bigint, decimals = 0) {
  if (decimals <= 0) return rawAmount.toString();

  const raw = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
