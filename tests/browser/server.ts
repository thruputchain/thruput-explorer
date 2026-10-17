import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { toBase58, toHex0x } from "@thruputchain/client";
import { HOG_ADDRESS } from "@thruputchain/protocol";

import { identifier, transferEvent } from "../../src/lib/groundhog/test-fixtures";

async function main() {
  const txHash = identifier(0xab);
  const statusFixtures: Record<string, unknown> = {
    [identifier(0xa1)]: { status: "retry", error: { source: "scheduler", code: -7 } },
    [identifier(0xa2)]: { status: "dropped", error: { source: "auth", code: -3 } },
    [identifier(0xa3)]: { status: "recentFailure", attemptHeight: "41", cause: { kind: "contractRejected", contractIndex: 1, code: "memoryTooLarge" } },
    [identifier(0xa4)]: { status: "committed" },
    [identifier(0xa5)]: { status: "committed", height: "42" },
    [identifier(0xa6)]: { status: "committed", height: "42" },
  };
  const transfer = transferEvent({ contractAddress: toBase58(HOG_ADDRESS) });
  const event = {
    contractAddress: toBase58(transfer.contractAddress),
    topics: transfer.topics.map(toHex0x),
    data: toHex0x(transfer.data),
  };
  const slowTxHash = identifier(0xdd);
  const slowEvent = { ...event, contractAddress: identifier(0x55) };
  let releaseMetadata = () => {};
  let metadataGate = Promise.resolve();
  let pending = 0;
  let receiptRequests = 0;
  let released = true;
  const rpc = createServer(async (request, response) => {
    try {
      // Local fixture controls let the browser prove ordering without a sleep.
      if (request.url?.startsWith("/metadata/")) {
        if (request.url === "/metadata/reset" && request.method === "POST") {
          releaseMetadata();
          metadataGate = new Promise<void>((resolve) => { releaseMetadata = resolve; });
          receiptRequests = 0;
          released = false;
        } else if (request.url === "/metadata/release" && request.method === "POST") {
          released = true;
          releaseMetadata();
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ pending, receiptRequests, released }));
        return;
      }
      let body = "";
      for await (const chunk of request) body += chunk;
      const { id, method, params } = JSON.parse(body);
      if (["groundhog_getBlockByNumber", "groundhog_getTransactionsByBlock"].includes(method)) {
        const height = method === "groundhog_getBlockByNumber" ? params?.[0] : params?.[0]?.height;
        if (height === "43" || height === "45") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: height === "45" ? -32601 : -32603, message: "Private upstream diagnostics" } }));
          return;
        }
        if (height === "44") {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ jsonrpc: "2.0", id, result: { invalid: true } }));
          return;
        }
      }
      if (method === "groundhog_getTransactionStatus" && params?.[0] === identifier(0xee)) {
        response.writeHead(503).end("Fixture transaction RPC unavailable");
        return;
      }
      if (method === "groundhog_getTransactionsByAddress" && params?.[0]?.address === identifier(0x44)) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Fixture address history unavailable" } }));
        return;
      }
      let result: unknown;
      switch (method) {
        case "groundhog_getBlockByNumber": {
          const height = params[0];
          result = ["40", "41", "42", "9007199254740993"].includes(height) ? {
            blockHeight: height, blockHash: identifier(0xbb), prevBlockHash: identifier(0xaa),
            protocol: 1, networkHash: identifier(0), proposer: identifier(0x11),
            blockTimepoint: "1770000000000000000", txsHash: identifier(0x22),
            storageHash: identifier(0x33), eventsHash: identifier(0x44),
            configHash: identifier(0x55), proposalTxsHash: identifier(0x66), upgrades: [],
          } : null;
          break;
        }
        case "groundhog_getTransactionsByBlock": {
          const { height, cursor, limit, order } = params[0];
          if (limit !== 50 || order !== "ascending") throw new Error("Unexpected block page parameters");
          result = {
            refs: height === "42" && cursor !== "0xbb" ? [{ txHash: cursor === "0x" ? txHash : slowTxHash, height }] : [],
            cursor: height === "42" ? cursor === "0x" ? "0xaa" : cursor === "0xaa" ? "0xbb" : "0x" : "0x",
            oldestBlock: "40", latestBlock: "9007199254740993",
          };
          break;
        }
        case "groundhog_networkInfo":
          result = { networkHash: identifier(0) };
          break;
        case "groundhog_chainTip":
          result = { height: "42", blockHash: identifier(0xbb) };
          break;
        case "groundhog_getTransactionStatus":
          result = statusFixtures[params?.[0]] ?? ([txHash, slowTxHash].includes(params?.[0])
            ? { status: "committed", height: "42" }
            : { status: params?.[0] === identifier(0xcc) ? "pending" : "unknown" });
          break;
        case "groundhog_getTransactionReceipt":
          if ([identifier(0xa5), identifier(0xa6)].includes(params?.[0])) {
            result = {
              txHash: params[0], height: "42", gasUsed: "9007199254740993", events: [], returnData: null, abortData: null,
              status: params[0] === identifier(0xa5) ? { result: "reverted", message: "Transfer exceeds available balance" } : { result: "deterministicError", kind: "outOfGas" },
            };
            break;
          }
          if (params?.[0] === slowTxHash) receiptRequests++;
          result = [txHash, slowTxHash].includes(params?.[0])
            ? { txHash: params[0], height: "42", gasUsed: "1000", status: { result: "ok" }, events: [params[0] === slowTxHash ? slowEvent : event], returnData: null, abortData: null }
            : null;
          break;
        case "groundhog_getEvents":
          result = {
            events: !JSON.stringify(params).includes(toHex0x(new Uint8Array(32).fill(0x33))) && params?.[0]?.filters?.some((filter: { contractAddresses?: string[] }) => filter.contractAddresses?.includes(event.contractAddress))
              ? [{ txHash, blockHeight: "42", sequenceNumber: 0, event }]
              : [],
            cursor: "0x", latestBlock: "42", oldestBlock: "42",
          };
          break;
        case "groundhog_getBalance":
          result = { address: params?.[0], rawBalance: "25000000", height: "42" };
          break;
        case "groundhog_getTransactionsByAddress":
          result = { refs: [], cursor: "0x", latestBlock: "42", oldestBlock: "42" };
          break;
        case "groundhog_viewBatch":
          if (JSON.stringify(params).includes(identifier(0x55))) {
            pending++;
            try { await metadataGate; } finally { pending--; }
          }
          result = { height: "42", results: params[0].calls.map(() => ({ output: { result: "fault" }, gasUsed: "1", events: [] })) };
          break;
        default:
          // Metadata errors exercise the application's fallback rendering.
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
  rpc.listen(Number(process.env.PLAYWRIGHT_PORT ?? 3100) + 1, "127.0.0.1");
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
    releaseMetadata();
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
