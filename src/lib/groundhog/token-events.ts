import { toHex0x, type EmittedEvent } from "@groundhogchain/client";
import { decodeERC20Event } from "@groundhogchain/client/contracts";

import type { TokenMetadata } from "./token-metadata";
import type { DecodedEventView } from "./types";

export function decodeTokenEvent(
  event: EmittedEvent,
  metadata?: TokenMetadata,
): DecodedEventView | undefined {
  let decoded: ReturnType<typeof decodeERC20Event>;
  try {
    decoded = decodeERC20Event(event);
  } catch {
    return undefined;
  }

  if (decoded?.name !== "TransferEvent") return undefined;

  const from = toHex0x(decoded.topics.from);
  const to = toHex0x(decoded.topics.to);
  const rawAmount = decoded.fields.amount.toString();
  const amount = formatTokenAmount(decoded.fields.amount, metadata?.decimals);
  const symbol = metadata?.symbol;

  if (from === ZERO_CONTRACT_ADDRESS) {
    return {
      kind: "token-mint",
      name: "Mint",
      to,
      rawAmount,
      amount,
      symbol,
    };
  }

  if (to === ZERO_CONTRACT_ADDRESS) {
    return {
      kind: "token-burn",
      name: "Burn",
      from,
      rawAmount,
      amount,
      symbol,
    };
  }

  return {
    kind: "token-transfer",
    name: "Transfer",
    from,
    to,
    rawAmount,
    amount,
    symbol,
  };
}

const ZERO_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000000";
const MAX_DISPLAY_DECIMALS = 30;

function formatTokenAmount(rawAmount: bigint, decimals = 0) {
  if (decimals > MAX_DISPLAY_DECIMALS) return rawAmount.toString();
  if (decimals <= 0) return rawAmount.toString();

  const raw = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
