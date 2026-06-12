import { toHex0x, type EmittedEvent } from "@groundhogchain/client";
import { erc20 } from "@groundhogchain/client/contracts";
import { contractAddress } from "@groundhogchain/protocol";

import type { ContractRegistryEntry } from "./contract-registry";
import type { DecodedEventView } from "./types";

export function decodeTokenEvent(event: EmittedEvent, contract?: ContractRegistryEntry): DecodedEventView | undefined {
  if (!contract?.token) return undefined;

  let decoded: ReturnType<typeof erc20.decodeEvent>;
  try {
    decoded = erc20.decodeEvent(event);
  } catch {
    return undefined;
  }

  if (decoded?.name !== "TransferEvent") return undefined;

  const from = toHex0x(contractAddress(decoded.topics.from));
  const to = toHex0x(contractAddress(decoded.topics.to));
  const rawAmount = decoded.fields.amount.toString();
  const amount = formatTokenAmount(decoded.fields.amount, contract.token.decimals);
  const symbol = contract.token.symbol;

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

function formatTokenAmount(rawAmount: bigint, decimals = 0) {
  if (decimals <= 0) return rawAmount.toString();

  const raw = rawAmount.toString().padStart(decimals + 1, "0");
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
