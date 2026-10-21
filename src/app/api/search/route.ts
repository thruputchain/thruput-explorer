import { hashFromBase58 } from "@thruputchain/client";

import { createExplorerThruputClient } from "@/lib/thruput/client";
import { toRpcFailure } from "@/lib/thruput/rpc";
import { isBlockHeight, isTransactionHash, normalizeTransactionHash } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  const rawQuery = typeof body?.query === "string" ? body.query : "";
  const query = normalizeTransactionHash(rawQuery);

  if (isBlockHeight(query)) {
    return Response.json({ status: "ok", href: `/block/${query}` });
  }

  if (!isTransactionHash(query)) {
    return Response.json(
      { status: "malformed", message: "Enter a block height or a base58 transaction hash or address (32 bytes)." },
      { status: 400 },
    );
  }

  try {
    const { client } = await createExplorerThruputClient();
    const txStatus = await client.getTransactionStatus({ transactionHash: hashFromBase58(query) });
    if (!("status" in txStatus)) return Response.json({ status: "unavailable", message: "The RPC returned an unsupported transaction status." }, { status: 503 });
    if (txStatus.status !== "unknown") {
      return Response.json({ status: "ok", href: `/tx/${query}` });
    }

    return Response.json({ status: "ok", href: `/address/${query}` });
  } catch (error) {
    return Response.json({ status: "unavailable", message: toRpcFailure(error).message }, { status: 503 });
  }
}
