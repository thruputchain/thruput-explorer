import { createHash } from "node:crypto";

import { readCompactUint128FromHex } from "./compact-xdr";
import type { ContractRegistryEntry } from "./contract-registry";
import type { DecodedEventView, EventView } from "./types";

const TRANSFER_EVENT_TOPIC = eventSignature("0.1.0", "groundhog-erc20-if", "TransferEvent");

export function decodeTokenEvent(event: EventView, contract?: ContractRegistryEntry): DecodedEventView | undefined {
  if (contract?.standard !== "groundhog-token-v1") return undefined;
  if (event.topics[0]?.toLowerCase() !== TRANSFER_EVENT_TOPIC) return undefined;

  const from = event.topics[1];
  const to = event.topics[2];
  const rawAmount = readCompactUint128FromHex(event.data);
  if (!from || !to || rawAmount == null) return undefined;

  return {
    kind: "token-transfer",
    name: "Transfer",
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

function formatTokenAmount(rawAmount: bigint, decimals = 0) {
  if (decimals <= 0) return rawAmount.toString();

  const raw = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
