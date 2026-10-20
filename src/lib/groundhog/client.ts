import { HttpTransport, createThruputClient, toBase58, type ThruputClient } from "@thruputchain/client";
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

export type ExplorerGroundhogClient = ExplorerRpcConfig & {
  transport: HttpTransport;
  client: ThruputClient;
};

export function getExplorerRpcConfig(): ExplorerRpcConfig {
  let rpcUrl = "Configured RPC";
  try {
    // Display only the origin; RPC paths and queries can contain API keys.
    rpcUrl = new URL(process.env.GROUNDHOG_RPC_URL?.trim() || DEFAULT_RPC_URL).origin;
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

export async function createExplorerGroundhogClient(): Promise<ExplorerGroundhogClient> {
  const config = getExplorerRpcConfig();
  const transport = new HttpTransport(process.env.GROUNDHOG_RPC_URL?.trim() || DEFAULT_RPC_URL, {
    fetch: (input, init) => {
      // Keep the deadline active through body decoding, not just response headers.
      const timeout = AbortSignal.timeout(10_000);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      return fetch(input, { ...init, signal });
    },
  });

  return {
    ...config,
    transport,
    client: await createThruputClient({ transport }),
  };
}
