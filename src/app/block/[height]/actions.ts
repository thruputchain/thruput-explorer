"use server";

import { loadBlockActivity } from "@/lib/thruput/block-activity";

export async function nextBlockTransactions(height: string, cursor?: string) {
  return loadBlockActivity(height, cursor);
}
