import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createThruputClient, MockTransport, hashFromBase58 } from "@thruputchain/client";
import { loadRecentActivityBlocks, loadRecentActivityTransactions, readActivityBlock } from "./recent-activity";
import { identifier, transferEvent } from "./test-fixtures";
import { NATIVE_HOG_ADDRESS } from "./client";

const sdk: typeof import("@thruputchain/client") = createRequire(import.meta.url)("@thruputchain/client");

test("activity walks empty blocks, caps the feed at ten, and counts paginated blocks", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ height: 20n }));
  t.mock.method(client, "getBlockByNumber", async () => null);
  const pages = t.mock.method(client, "getTransactionsByBlock", async ({ height, cursor }: { height: bigint; cursor: Uint8Array }) => ({
    refs: height === 18n ? Array.from({ length: 6 }, (_, index) => ({ txHash: hashFromBase58(identifier(index + (cursor.length ? 7 : 1))), height })) : [],
    cursor: height === 18n && !cursor.length ? new Uint8Array([1]) : new Uint8Array(),
    oldestBlock: 1n,
    latestBlock: 20n,
  }));
  t.mock.method(client, "getTransactionReceipt", async () => null);
  const feed = await loadRecentActivityTransactions();
  assert.equal(feed.unavailable, false);
  assert.equal(feed.transactions.length, 10);
  assert.ok(feed.transactions.every((transaction) => transaction.height === "18"));
  assert.ok(pages.mock.calls.every((call) => call.arguments[0].height >= 18n));
  const blocks = await loadRecentActivityBlocks();
  assert.equal(blocks.blocks.length, 10);
  assert.equal(blocks.blocks.find((block) => block.height === "18")?.hashes.length, 12);
});

test("activity respects index coverage and rejects repeated cursors", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ height: 30n }));
  t.mock.method(client, "getBlockByNumber", async () => null);
  t.mock.method(client, "getTransactionReceipt", async () => null);
  const pages = t.mock.method(client, "getTransactionsByBlock", async () => ({ refs: [], cursor: new Uint8Array(), oldestBlock: 18n, latestBlock: 20n }));
  const blocks = await loadRecentActivityBlocks();
  assert.deepEqual(blocks.blocks.map((block) => block.height), ["20", "19", "18"]);
  assert.equal((await loadRecentActivityTransactions()).transactions.length, 0);
  pages.mock.restore();
  t.mock.method(client, "getTransactionsByBlock", async () => ({ refs: [], cursor: new Uint8Array([1]), oldestBlock: 1n, latestBlock: 20n }));
  await assert.rejects(readActivityBlock("20"), /pagination unavailable/);
});

test("receipt failures retain transaction links and decoded transfers retain exact amounts", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ height: 1n }));
  t.mock.method(client, "getBlockByNumber", async () => null);
  t.mock.method(client, "getTransactionsByBlock", async () => ({
    refs: [1, 2].map((byte) => ({ txHash: hashFromBase58(identifier(byte)), height: 1n })),
    cursor: new Uint8Array(), oldestBlock: 1n, latestBlock: 1n,
  }));
  t.mock.method(client, "getTransactionReceipt", async (hash: Uint8Array) => {
    if (hash[0] === 2) throw new Error("private RPC details");
    return { height: 1n, executionStatus: { result: "ok" }, events: [transferEvent({ contractAddress: NATIVE_HOG_ADDRESS })] };
  });
  const feed = await loadRecentActivityTransactions();
  assert.equal(feed.transactions.length, 2);
  assert.equal(feed.transactions[0].events[0].amount, "1.5");
  assert.equal(feed.transactions[0].result, "ok");
  assert.equal(feed.transactions[1].hash, identifier(2));
  assert.equal(feed.transactions[1].result, null);
  assert.equal(JSON.stringify(feed).includes("private"), false);
});
