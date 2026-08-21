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
  return {
    rpcUrl: process.env.GROUNDHOG_RPC_URL?.trim() || DEFAULT_RPC_URL,
    nativeToken: {
      address: NATIVE_HOG_ADDRESS,
      symbol: "HOG",
      decimals: 7,
    },
  };
}

export function createExplorerGroundhogClient(): ExplorerGroundhogClient {
  const config = getExplorerRpcConfig();
  const transport = new HttpTransport(config.rpcUrl);

  return {
    ...config,
    transport,
    client: createGroundhogClient(transport),
  };
}
