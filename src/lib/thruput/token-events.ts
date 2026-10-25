import { formatUnits, toBase58, type EmittedEvent } from "@thruputchain/client";
import { decodeERC20Event } from "@thruputchain/client/contracts";

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

  if (decoded?.name !== "TransferEvent" && decoded?.name !== "MintEvent") return undefined;

  const from = decoded.name === "MintEvent" ? ZERO_CONTRACT_ADDRESS : toBase58(decoded.topics.from);
  const to = toBase58(decoded.topics.to);
  const rawAmount = decoded.fields.amount.toString();
  const decimals = metadata?.decimals ?? 0;
  const amount = formatUnits(decoded.fields.amount, decimals >= 0 && decimals <= MAX_DISPLAY_DECIMALS ? decimals : 0);
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

const ZERO_CONTRACT_ADDRESS = "11111111111111111111111111111111";
const MAX_DISPLAY_DECIMALS = 30;
