import { cache } from "react";
import { HttpTransport, createThruputClient, toBase58, type ThruputClient, type Transport } from "@thruputchain/client";
import { HOG_ADDRESS } from "@thruputchain/protocol";

const DEFAULT_RPC_URL = "http://localhost:9545";
export const NATIVE_HOG_ADDRESS = toBase58(HOG_ADDRESS);

export type ExplorerRpcConfig = {
  rpcUrl: string;
  nativeToken: {
    address: string;
    symbol: "HOG";
    decimals: 7;
  };
};

export type ExplorerThruputClient = ExplorerRpcConfig & {
  transport: HttpTransport;
  client: ThruputClient;
};

export function getExplorerRpcConfig(): ExplorerRpcConfig {
  let rpcUrl = "Configured RPC";
  try {
    // Display only the origin; RPC paths and queries can contain API keys.
    rpcUrl = new URL(process.env.THRUPUT_RPC_URL?.trim() || DEFAULT_RPC_URL).origin;
  } catch {
    // Invalid configuration is reported by the loader, not during rendering.
  }
  return {
    rpcUrl,
    nativeToken: {
      address: NATIVE_HOG_ADDRESS,
      symbol: "HOG",
      decimals: 7,
    },
  };
}

export const createExplorerThruputClient = cache(async (onResponse?: (method: string, response: unknown) => void): Promise<ExplorerThruputClient> => {
  const config = getExplorerRpcConfig();
  const transport = new HttpTransport(process.env.THRUPUT_RPC_URL?.trim() || DEFAULT_RPC_URL, {
    timeoutMs: 10_000,
  });

  const observedTransport: Transport = {
    async request<T>(...args: Parameters<Transport["request"]>) {
      const [method, params, options] = args;
      const response = await transport.request<T>(method, params, options);
      onResponse?.(method, response);
      return response;
    },
  };
  return {
    ...config,
    transport,
    client: await createThruputClient({ transport: onResponse ? observedTransport : transport }),
  };
});

export function historyPageLimit(client: ThruputClient, kind: "events" | "transactions", preferred: number) {
  const limits = client.discovery.limits;
  // The SDK reports missing history capabilities at the individual read boundary.
  if (!limits) return preferred;
  return Math.min(preferred, kind === "events" ? limits.maxEventsPerPage : limits.maxTransactionsPerPage);
}
