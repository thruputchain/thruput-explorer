import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { toHex0x } from "@groundhogchain/client";
import { HOG_ADDRESS } from "@groundhogchain/protocol";

import { transferEvent } from "../../src/lib/groundhog/test-fixtures";

async function main() {
  const txHash = `0x${"ab".repeat(32)}`;
  const transfer = transferEvent({ contractAddress: toHex0x(HOG_ADDRESS) });
  const event = {
    contractAddress: toHex0x(transfer.contractAddress),
    topics: transfer.topics.map(toHex0x),
    data: toHex0x(transfer.data),
  };
  const rpc = createServer(async (request, response) => {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      const { id, method, params } = JSON.parse(body);
      if (method === "groundhog_getTransactionStatus" && params?.[0] === `0x${"ee".repeat(32)}`) {
        response.writeHead(503).end("Fixture transaction RPC unavailable");
        return;
      }
      if (method === "groundhog_getTransactionsByAddress" && params?.[0]?.address === `0x${"44".repeat(32)}`) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Fixture address history unavailable" } }));
        return;
      }
      let result: unknown;
      switch (method) {
        case "groundhog_networkInfo":
          result = { networkHash: `0x${"00".repeat(32)}` };
          break;
        case "groundhog_chainTip":
          result = { height: 42, blockHash: `0x${"bb".repeat(32)}` };
          break;
        case "groundhog_getTransactionStatus":
          result = params?.[0] === txHash
            ? { status: "committed", height: 42 }
            : { status: params?.[0] === `0x${"cc".repeat(32)}` ? "pending" : "unknown" };
          break;
        case "groundhog_getTransactionReceipt":
          result = params?.[0] === txHash
            ? { txHash, height: 42, status: { result: "ok" }, events: [event], returnData: null, abortData: null }
            : null;
          break;
        case "groundhog_getEvents":
          result = {
            events: !JSON.stringify(params).includes("33".repeat(32)) && params?.[0]?.filters?.some((filter: { contractAddresses?: string[] }) => filter.contractAddresses?.includes(event.contractAddress))
              ? [{ txHash, blockHeight: 42, sequenceNumber: 0, event }]
              : [],
            cursor: "0x", latestBlock: 42, oldestBlock: 42,
          };
          break;
        case "groundhog_getBalance":
          result = { address: params?.[0], rawBalance: "25000000", height: 42 };
          break;
        case "groundhog_getTransactionsByAddress":
          result = { refs: [], cursor: "0x", latestBlock: 42, oldestBlock: 42 };
          break;
        default:
          // Metadata views deliberately use the application's built-in HOG fallback.
          if (method !== "groundhog_view") console.error(`Unexpected fixture RPC method: ${method}`);
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Fixture method unavailable" } }));
          return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch {
      response.writeHead(400).end();
    }
  });
  rpc.listen(0, "127.0.0.1");
  await once(rpc, "listening");
  const address = rpc.address();
  if (!address || typeof address === "string") throw new Error("Fixture RPC did not bind a TCP port");

  const child = spawn(process.execPath, [createRequire(import.meta.url).resolve("next/dist/bin/next"),
    "start", "--hostname", "127.0.0.1", "--port", process.env.PLAYWRIGHT_PORT ?? "3100"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      GROUNDHOG_RPC_URL: `http://127.0.0.1:${address.port}`,
    },
    stdio: "inherit",
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  process.once("exit", () => child.kill("SIGKILL"));
  child.once("error", (error) => { console.error(error); process.exitCode = 1; });
  child.once("close", (code) => {
    rpc.closeAllConnections();
    rpc.close();
    if (!stopping) process.exitCode = code || 1;
  });
}

main().catch((error) => { console.error(error); process.exit(1); });
