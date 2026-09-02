import { HttpTransport, createGroundhogClient, toHex0x, type GroundhogClient } from "@groundhogchain/client";
import { HOG_ADDRESS } from "@groundhogchain/protocol";

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
  return buildRpcConfig(process.env.GROUNDHOG_RPC_URL?.trim() || DEFAULT_RPC_URL);
}

export function createExplorerGroundhogClient(): ExplorerGroundhogClient {
  const config = buildRpcConfig(requireRpcUrl());
  const transport = new HttpTransport(config.rpcUrl);

  return {
    ...config,
    transport,
    client: createGroundhogClient(transport),
  };
}

function buildRpcConfig(rpcUrl: string): ExplorerRpcConfig {
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
 * The localhost default is a development convenience only: a production deploy that
 * silently falls back to it renders a working-looking site where every page fails to
 * load data. Fail loudly instead, and only at client-construction time so that
 * `next build` never trips over a missing environment variable.
 */
function requireRpcUrl(): string {
  const configured = process.env.GROUNDHOG_RPC_URL?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "GROUNDHOG_RPC_URL is not set. Set it to the Groundhog RPC endpoint this explorer should read from " +
        `(the ${DEFAULT_RPC_URL} default applies in development only).`,
    );
  }

  return DEFAULT_RPC_URL;
}
