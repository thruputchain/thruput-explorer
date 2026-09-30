import { HttpTransport, createGroundhogClient, toHex0x, type GroundhogClient, type Transport } from "@groundhogchain/client";
import { HOG_ADDRESS } from "@groundhogchain/protocol";

import { hexifyAddresses } from "@/lib/address";

const DEFAULT_RPC_URL = "http://localhost:9545";
export const NATIVE_HOG_ADDRESS = toHex0x(HOG_ADDRESS);

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
  client: GroundhogClient;
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

/**
 * Wrap a transport so results reach the SDK with addresses as 0x hex, which is
 * all the SDK parses. The RPC returns addresses as StrKeys.
 */
export function withHexAddresses(transport: Transport): Transport {
  return {
    async request<T>(...args: Parameters<Transport["request"]>) {
      return hexifyAddresses(await transport.request<T>(...args)) as T;
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
    client: await createGroundhogClient({ transport: withHexAddresses(transport) }),
  };
}
