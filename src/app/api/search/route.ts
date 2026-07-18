import { addressFromHex, hashFromHex } from "@groundhogchain/client";

import { createExplorerGroundhogClient } from "@/lib/groundhog/client";
import { getNativeBalance } from "@/lib/groundhog/native-balance";
import { toRpcFailure } from "@/lib/groundhog/rpc";
import { getTokenMetadata } from "@/lib/groundhog/token-metadata";
import { isContractAddress, isTransactionHash, normalizeContractAddress, normalizeTransactionHash } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined);
  const rawQuery = typeof body?.query === "string" ? body.query : "";
  const query = normalizeTransactionHash(rawQuery);

  if (!isTransactionHash(query)) {
    return Response.json(
      { status: "malformed", message: "Enter a 0x-prefixed 32-byte transaction hash or address." },
      { status: 400 },
    );
  }

  const { client } = createExplorerGroundhogClient();

  try {
    const txStatus = await client.getTransactionStatus(hashFromHex(query));
    if (txStatus.status !== "unknown") {
      return Response.json({ status: "ok", href: `/tx/${query}` });
    }
  } catch (error) {
    return Response.json({ status: "unavailable", message: toRpcFailure(error).message }, { status: 503 });
  }

  const address = normalizeContractAddress(query);
  if (!isContractAddress(address)) {
    return Response.json({ status: "malformed", message: "Malformed address." }, { status: 400 });
  }

  const [nativeBalance, txRefs, metadata] = await Promise.all([
    getNativeBalance(client, address),
    client
      .getTransactionsByAddress({ address: addressFromHex(address), order: "descending", anchor: "end", limit: 1 })
      .then((page) => page.refs)
      .catch(() => []),
    getTokenMetadata(client, address).catch(() => undefined),
  ]);

  return Response.json({
    status: "ok",
    href: `/address/${address}`,
    context: {
      hasNativeBalance: Boolean(nativeBalance),
      hasRootTransactions: txRefs.length > 0,
      token: Boolean(metadata),
    },
  });
}
