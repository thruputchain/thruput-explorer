import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { MockTransport, fromHex0x, toBase58, toHex0x } from "@thruputchain/client";
import { NATIVE_TOKEN_ADDRESS, codec, ContractType, serialize, deserialize } from "@thruputchain/protocol";
import { DefaultWallet } from "@thruputchain/client/contracts";
import calls from "../fixtures/counter-calls.json";
import { hashContract } from "@thruputchain/client/contract";

import { identifier, transferEvent } from "../../src/lib/thruput/test-fixtures";

async function main() {
  const counterArtifact = new Uint8Array(readFileSync(new URL("../fixtures/counter-v6.rv32a", import.meta.url)));
  const counterContract = { contract_type: ContractType.kRv32, rv32_contract: { data: counterArtifact } } as const;
  const counterHash = toBase58(hashContract(counterContract));
  const counterAddress = identifier(0xc1);
  const calledAddress = toBase58(DefaultWallet.v0_1.execute.decodeArgs(deserialize(fromHex0x(calls[0].inputXdr), codec.Transaction).invocation.calldata).calls[0].target);
  const txHash = identifier(0xab);
  const statusFixtures: Record<string, unknown> = {
    [identifier(0xa1)]: { status: "retry", error: { source: "scheduler", code: -7 } },
    [identifier(0xa2)]: { status: "dropped", error: { source: "auth", code: -3 } },
    [identifier(0xa3)]: { status: "recentFailure", attemptBlockHeight: "41", cause: { kind: "contractRejected", contractIndex: 1, code: "memoryTooLarge" } },
    [identifier(0xa4)]: { status: "committed", blockHeight: "42" },
    [identifier(0xa5)]: { status: "committed", blockHeight: "42" },
    [identifier(0xa6)]: { status: "committed", blockHeight: "42" },
  };
  const transfer = transferEvent({ contractAddress: toBase58(NATIVE_TOKEN_ADDRESS) });
  const event = {
    address: toBase58(transfer.address),
    topics: transfer.topics.map(toHex0x),
    data: toHex0x(transfer.data),
  };
  const paginatedTxHash = identifier(0xdd);
  const slowTxHash = identifier(0xde);
  const slowEvent = { ...event, address: identifier(0x55) };
  const addressActivityTxHash = identifier(0xdf);
  let releaseActivity = () => {};
  let activityGate = Promise.resolve();
  let pendingActivity = 0;
  let releaseMetadata = () => {};
  let metadataGate = Promise.resolve();
  let pending = 0;
  let receiptRequests = 0;
  let released = true;
  const discovery = new MockTransport();
  const rpc = createServer(async (request, response) => {
    try {
      if (request.url?.startsWith("/activity/")) {
        if (request.url === "/activity/reset" && request.method === "POST") {
          releaseActivity();
          activityGate = new Promise<void>((resolve) => { releaseActivity = resolve; });
        } else if (request.url === "/activity/release" && request.method === "POST") {
          releaseActivity();
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ pending: pendingActivity }));
        return;
      }
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
      if (!params || Array.isArray(params)) throw new Error("Expected native named parameters");
      if (["getBlockByHeight", "getTransactionsByBlock"].includes(method)) {
        const height = params.blockHeight;
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
      if (method === "getTransactionStatus" && params.transactionHash === identifier(0xee)) {
        response.writeHead(503).end("Fixture transaction RPC unavailable");
        return;
      }
      if (method === "getTransactionsByRootAddress" && params.address === identifier(0x44)) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "Fixture address history unavailable" } }));
        return;
      }
      let result: unknown;
      switch (method) {
        case "getVersionInfo": case "getNetworkInfo": case "getServerLimits":
          result = await discovery.request(method);
          break;
        case "getBlockByHeight": {
          const height = params.blockHeight;
          result = ["40", "41", "42", "9007199254740993"].includes(height) ? {
            blockHeight: height, blockHash: identifier(0xbb), prevBlockHash: identifier(0xaa),
            protocol: 1, networkHash: identifier(0), proposer: identifier(0x11),
            blockTimepoint: "1770000000000000000", txsHash: identifier(0x22),
            storageHash: identifier(0x33), eventsHash: identifier(0x44),
            configHash: identifier(0x55), proposalTxsHash: identifier(0x66), upgrades: [],
          } : null;
          break;
        }
        case "getTransactionsByBlock": {
          const { blockHeight: height, cursor, limit, start } = params;
          if (limit !== 50 || (cursor ? start !== undefined : start?.order !== "ascending")) throw new Error("Unexpected block page parameters");
          result = {
            transactions: height === "42" ? [{ transactionHash: cursor ? paginatedTxHash : txHash, blockHeight: height }] : [],
            nextCursor: height === "42" && !cursor ? "0xaa" : null,
            oldestIndexedBlockHeight: "40", latestIndexedBlockHeight: "9007199254740993",
          };
          break;
        }
        case "getChainTip":
          result = { blockHeight: "42", blockHash: identifier(0xbb) };
          break;
        case "getTransactionStatus":
          result = calls.some(call => call.hash === params.transactionHash) ? { status: "committed", blockHeight: calls.find(call => call.hash === params.transactionHash)!.receipt.blockHeight } : statusFixtures[params.transactionHash] ?? ([txHash, paginatedTxHash, slowTxHash].includes(params.transactionHash)
            ? { status: "committed", blockHeight: "42" }
            : { status: params.transactionHash === identifier(0xcc) ? "pending" : "unknown" });
          break;
        case "getTransactionReceipt":
          if (calls.some(call => call.hash === params.transactionHash)) {
            result = calls.find(call => call.hash === params.transactionHash)!.receipt;
            break;
          }
          if (params.transactionHash === addressActivityTxHash) {
            pendingActivity++;
            try { await activityGate; } finally { pendingActivity--; }
            result = { transactionHash: addressActivityTxHash, blockHeight: "42", gasUsed: "1000", execution: { result: "return", returnData: "0x" }, events: [event] };
            break;
          }
          if ([identifier(0xa5), identifier(0xa6)].includes(params.transactionHash)) {
            result = {
              transactionHash: params.transactionHash, blockHeight: "42", gasUsed: "9007199254740993", events: [],
              execution: params.transactionHash === identifier(0xa5) ? { result: "abort", abortData: "0xdeadbeef" } : { result: "fault" },
            };
            break;
          }
          if (params.transactionHash === slowTxHash) receiptRequests++;
          result = [txHash, paginatedTxHash, slowTxHash].includes(params.transactionHash)
            ? { transactionHash: params.transactionHash, blockHeight: "42", gasUsed: "1000", execution: { result: "return", returnData: "0x" }, events: [params.transactionHash === slowTxHash ? slowEvent : event] }
            : null;
          break;
        case "getEvents": {
          if (params.filters.some((filter: { addresses: string[] }) => filter.addresses.includes(counterAddress))) {
            result = { events: [{ transactionHash: txHash, blockHeight: "42", sequenceNumber: 0, event: {
              address: counterAddress,
              topics: ["0xf0c8fa264c489d9d6bc8796daa7d6ab408d76b37ef41b6d6d951e20f63d10f52", `0x${"00".repeat(31)}2a`], data: "0x",
            } }, { transactionHash: txHash, blockHeight: "42", sequenceNumber: 1, event: {
              address: counterAddress, topics: [`0x${"11".repeat(32)}`], data: "0x1234",
            } }, { transactionHash: txHash, blockHeight: "42", sequenceNumber: 2, event: {
              address: counterAddress, topics: ["0xf0c8fa264c489d9d6bc8796daa7d6ab408d76b37ef41b6d6d951e20f63d10f52"], data: "0x",
            } }].reverse(), nextCursor: null, latestIndexedBlockHeight: "42", oldestIndexedBlockHeight: "42" };
            break;
          }
          const filter = params.filters.find((filter: { addresses: string[] }) => filter.addresses.includes(event.address));
          const matchingTransfer = transferEvent({
            contractAddress: event.address,
            from: filter?.topics?.topic1?.[0] ? toBase58(fromHex0x(filter.topics.topic1[0])) : undefined,
            to: filter?.topics?.topic2?.[0] ? toBase58(fromHex0x(filter.topics.topic2[0])) : undefined,
          });
          const matchingEvent = { address: event.address, topics: matchingTransfer.topics.map(toHex0x), data: toHex0x(matchingTransfer.data) };
          result = {
            events: !JSON.stringify(params).includes(toHex0x(new Uint8Array(32).fill(0x33))) && filter
              ? [{ transactionHash: txHash, blockHeight: "42", sequenceNumber: 0, event: matchingEvent }]
              : [],
            nextCursor: null, latestIndexedBlockHeight: "42", oldestIndexedBlockHeight: "42",
          };
          break;
        }
        case "getBalance":
          result = { address: params.address, rawBalance: "25000000", stateBlockHeight: "42" };
          break;
        case "getTransactionsByRootAddress":
          result = { transactions: params.address === identifier(0x66) ? [{ transactionHash: addressActivityTxHash, blockHeight: "42" }] : [], nextCursor: null, latestIndexedBlockHeight: "42", oldestIndexedBlockHeight: "42" };
          break;
        case "getTransactionInput": {
          const call = calls.find(call => call.hash === params.transactionHash);
          result = call ? { status: "available", transactionHash: call.hash, blockHeight: call.receipt.blockHeight, transactionXdr: call.inputXdr } : { status: "unavailable" };
          break;
        }
        case "getContractDeployment":
          result = { address: params.address, stateBlockHeight: "42", deployment: [counterAddress, calledAddress].includes(params.address) ? { hash: counterHash, size: counterArtifact.length, contractType: 3 } : null };
          break;
        case "getContractArtifact":
          result = { hash: counterHash, contractXdr: toHex0x(serialize(counterContract, codec.Contract)) };
          break;
        case "simulateInvocations":
          if (JSON.stringify(params).includes(identifier(0x55))) {
            pending++;
            try { await metadataGate; } finally { pending--; }
          }
          result = { stateBlockHeight: "42", results: params.invocations.map(() => ({ output: { result: "fault" }, gasUsed: "1", events: [] })) };
          break;
        default:
          // Metadata errors exercise the application's fallback rendering.
          console.error(`Unexpected fixture RPC method: ${method}`);
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
      THRUPUT_RPC_URL: `http://127.0.0.1:${address.port}`,
    },
    stdio: "inherit",
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    releaseMetadata();
    releaseActivity();
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
