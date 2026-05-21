import { createHash } from "node:crypto";

import type { ContractRegistryEntry } from "./contract-registry";
import type { DecodedEventView, EventView } from "./types";

const OFFICIAL_TRANSFER_TOPIC = eventSignature("0.1.0", "groundhog-erc20-if", "TransferEvent");
const TEST_TOKEN_TRANSFER_TOPIC = eventSignature("0.1.0", "token", "TokensTransferred");
const TEST_TOKEN_MINT_TOPIC = eventSignature("0.1.0", "token", "TokensMinted");

export function decodeTokenEvent(event: EventView, contract?: ContractRegistryEntry): DecodedEventView | undefined {
  if (contract?.standard !== "groundhog-token-v1") return undefined;

  const signatureTopic = event.topics[0]?.toLowerCase();
  if (!signatureTopic) return undefined;

  if (signatureTopic === OFFICIAL_TRANSFER_TOPIC && event.topics.length >= 3) {
    return decodeOfficialTransfer(event, contract);
  }

  if (signatureTopic === TEST_TOKEN_TRANSFER_TOPIC) {
    return decodeTestTokenTransfer(event, contract);
  }

  if (signatureTopic === TEST_TOKEN_MINT_TOPIC) {
    return decodeTestTokenMint(event, contract);
  }

  return undefined;
}

function decodeOfficialTransfer(event: EventView, contract: ContractRegistryEntry): DecodedEventView | undefined {
  const from = event.topics[1];
  const to = event.topics[2];
  const reader = readerFromHex(event.data);
  if (!reader || !from || !to) return undefined;

  try {
    const rawAmount = reader.readUint128();
    if (reader.remaining !== 0) return undefined;

    return buildTransferEvent("Transfer", from, to, rawAmount, contract);
  } catch {
    return undefined;
  }
}

function decodeTestTokenTransfer(event: EventView, contract: ContractRegistryEntry): DecodedEventView | undefined {
  const reader = readerFromHex(event.data);
  if (!reader) return undefined;

  try {
    const from = toHex(reader.readFixedOpaque(32));
    const to = toHex(reader.readFixedOpaque(32));
    const rawAmount = reader.readUint64();
    if (reader.remaining !== 0) return undefined;

    return buildTransferEvent("TokensTransferred", from, to, rawAmount, contract);
  } catch {
    return undefined;
  }
}

function decodeTestTokenMint(event: EventView, contract: ContractRegistryEntry): DecodedEventView | undefined {
  const reader = readerFromHex(event.data);
  if (!reader) return undefined;

  try {
    const to = toHex(reader.readFixedOpaque(32));
    const rawAmount = reader.readUint64();
    if (reader.remaining !== 0) return undefined;

    return {
      kind: "token-mint",
      name: "TokensMinted",
      to,
      rawAmount: rawAmount.toString(),
      amount: formatTokenAmount(rawAmount, contract.decimals),
      symbol: contract.symbol,
    };
  } catch {
    return undefined;
  }
}

function buildTransferEvent(
  name: string,
  from: string,
  to: string,
  rawAmount: bigint,
  contract: ContractRegistryEntry,
): DecodedEventView {
  return {
    kind: "token-transfer",
    name,
    from,
    to,
    rawAmount: rawAmount.toString(),
    amount: formatTokenAmount(rawAmount, contract.decimals),
    symbol: contract.symbol,
  };
}

function eventSignature(version: string, crateName: string, typeName: string) {
  const majorVersion = majorVersionFromSemver(version);
  return `0x${createHash("sha256").update(`${majorVersion}::${crateName}::${typeName}`).digest("hex")}`;
}

function majorVersionFromSemver(version: string) {
  const [major = "0", minor = "0", patch = "0"] = version.split(".");
  if (major !== "0") return major;
  if (minor !== "0") return `${major}.${minor}`;
  return `${major}.${minor}.${patch}`;
}

function readerFromHex(value?: string) {
  if (!value) return undefined;
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length % 2 !== 0 || !/^[\da-f]*$/i.test(hex)) return undefined;
  return new CompactXdrReader(Buffer.from(hex, "hex"));
}

function formatTokenAmount(rawAmount: bigint, decimals = 0) {
  if (decimals <= 0) return rawAmount.toString();

  const raw = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function toHex(value: Uint8Array) {
  return `0x${Buffer.from(value).toString("hex")}`;
}

class CompactXdrReader {
  #position = 0;

  constructor(private readonly data: Uint8Array) {}

  get remaining() {
    return this.data.length - this.#position;
  }

  readFixedOpaque(length: number) {
    this.ensure(length);
    const value = this.data.subarray(this.#position, this.#position + length);
    this.#position += length;
    return value;
  }

  readUint64() {
    return this.readUnsigned();
  }

  readUint128() {
    return (this.readUint64() << BigInt(64)) | this.readUint64();
  }

  private readUnsigned() {
    const header = this.readByte();
    const size = (header & 0xc0) >> 6;
    const value = header & 0x3f;

    if (value !== 63) {
      if (size !== 0) throw new Error(`Invalid CXS unsigned header: 0x${header.toString(16)}`);
      return BigInt(value);
    }

    const byteLength = [1, 2, 4, 8][size];
    this.ensure(byteLength);

    let result = BigInt(0);
    for (let index = byteLength - 1; index >= 0; index -= 1) {
      result = (result << BigInt(8)) | BigInt(this.data[this.#position + index]);
    }
    this.#position += byteLength;

    const minimum = [BigInt(63), BigInt(256), BigInt(65536), BigInt(4294967296)][size];
    if (result < minimum) throw new Error("Non-minimal CXS unsigned encoding");

    return result;
  }

  private readByte() {
    this.ensure(1);
    const value = this.data[this.#position];
    this.#position += 1;
    return value;
  }

  private ensure(length: number) {
    if (this.#position + length > this.data.length) {
      throw new Error(`CXS read past end: need ${length} bytes, have ${this.remaining}`);
    }
  }
}
