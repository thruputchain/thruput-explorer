"use server";

import { loadBlockTransactions } from "@/lib/thruput/blocks";

export async function nextBlockTransactions(height: string, cursor: string) {
  return loadBlockTransactions(height, cursor);
}
