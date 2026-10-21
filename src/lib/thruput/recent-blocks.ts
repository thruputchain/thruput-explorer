import { createExplorerThruputClient } from "./client";

export async function loadRecentBlocks() {
  try {
    const { client } = await createExplorerThruputClient();
    const { blockHeight: height } = await client.getChainTip();
    const heights: string[] = [];
    // Genesis has no block-query metadata. Keep large heights exact.
    for (
      let current = height;
      current >= 1n && heights.length < 11;
      current--
    ) {
      heights.push(current.toString());
    }
    return { status: "ok" as const, heights };
  } catch {
    return { status: "unavailable" as const };
  }
}
