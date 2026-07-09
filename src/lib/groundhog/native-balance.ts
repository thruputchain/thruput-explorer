import { addressFromHex, type GroundhogClient } from "@groundhogchain/client";

export type NativeBalanceView = {
  rawBalance: string;
  amount: string;
  symbol: "HOG";
  height: string;
};

const NATIVE_HOG_DECIMALS = 7;

export async function getNativeBalance(client: GroundhogClient, address: string): Promise<NativeBalanceView | undefined> {
  try {
    const balance = await client.getBalance(addressFromHex(address));
    const rawBalance = balance.rawBalance.toString();

    return {
      rawBalance,
      amount: formatNativeHog(rawBalance),
      symbol: "HOG",
      height: balance.height.toString(),
    };
  } catch {
    return undefined;
  }
}

function formatNativeHog(rawBalance: string) {
  const raw = rawBalance.trim();
  if (!/^\d+$/.test(raw)) return rawBalance;
  if (raw === "0") return "0";

  const padded = raw.padStart(NATIVE_HOG_DECIMALS + 1, "0");
  const whole = padded.slice(0, -NATIVE_HOG_DECIMALS);
  const fraction = padded.slice(-NATIVE_HOG_DECIMALS).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}
