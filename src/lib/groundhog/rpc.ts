const DEFAULT_RPC_URL = "http://localhost:9545";

type JsonRpcResponse<T> = {
  result?: T;
  error?: unknown;
};

export function getGroundhogRpcUrl() {
  return process.env.GROUNDHOG_RPC_URL ?? DEFAULT_RPC_URL;
}

export async function getRawTransactionReceipt(hash: string) {
  const response = await fetch(getGroundhogRpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "groundhog_getTransactionReceipt", params: [hash] }),
    cache: "no-store",
  });

  if (!response.ok) return undefined;

  const payload = (await response.json()) as JsonRpcResponse<unknown>;
  return payload.error ? undefined : payload.result;
}
