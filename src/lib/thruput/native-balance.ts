import { addressFromBase58, formatUnits, type ThruputClient } from "@thruputchain/client";

export type NativeBalanceView = {
  rawBalance: string;
  amount: string;
  symbol: "HOG";
  height: string;
};

const NATIVE_HOG_DECIMALS = 7;

export async function getNativeBalance(client: ThruputClient, address: string): Promise<NativeBalanceView | undefined> {
  try {
    const balance = await client.getBalance({ address: addressFromBase58(address) });
    const rawBalance = balance.rawBalance.toString();

    return {
      rawBalance,
      amount: formatUnits(balance.rawBalance, NATIVE_HOG_DECIMALS),
      symbol: "HOG",
      height: balance.stateBlockHeight.toString(),
    };
  } catch {
    return undefined;
  }
}
