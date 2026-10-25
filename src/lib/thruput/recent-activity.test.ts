import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createThruputClient, MockTransport, hashFromBase58, NativeRpcError, JsonRpcError } from "@thruputchain/client";
import { ACTIVITY_BLOCK_PAGE_LIMIT, ACTIVITY_SCAN_BLOCK_LIMIT, loadRecentActivityBlocks, loadRecentActivityTransactions, readActivityBlock } from "./recent-activity";
import { identifier, transferEvent } from "./test-fixtures";
import { NATIVE_TOKEN_ADDRESS } from "./client";

const sdk: typeof import("@thruputchain/client") = createRequire(import.meta.url)("@thruputchain/client");

test("activity walks empty blocks, caps the feed at ten, and counts paginated blocks", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ blockHeight: 20n }));
  t.mock.method(client, "getBlockByHeight", async () => null);
  const pages = t.mock.method(client, "getTransactionsByBlock", async ({ blockHeight, cursor }: { blockHeight: bigint; cursor?: string }) => ({
    transactions: blockHeight === 18n ? Array.from({ length: 6 }, (_, index) => ({ transactionHash: hashFromBase58(identifier(index + (cursor ? 7 : 1))), blockHeight })) : [],
    nextCursor: blockHeight === 18n && !cursor ? "0x01" : null,
    oldestIndexedBlockHeight: 1n,
    latestIndexedBlockHeight: 20n,
  }));
  t.mock.method(client, "getTransactionReceipt", async () => null);
  const feed = await loadRecentActivityTransactions();
  assert.equal(feed.unavailable, false);
  assert.equal(feed.transactions.length, 10);
  assert.ok(feed.transactions.every((transaction) => transaction.height === "18"));
  assert.ok(pages.mock.calls.every((call) => call.arguments[0].blockHeight >= 18n));
  const blocks = await loadRecentActivityBlocks();
  assert.equal(blocks.blocks.length, 10);
  assert.equal(blocks.blocks.find((block) => block.height === "18")?.hashes.length, 12);
});

test("activity respects index coverage and rejects repeated cursors", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ blockHeight: 30n }));
  t.mock.method(client, "getBlockByHeight", async () => null);
  t.mock.method(client, "getTransactionReceipt", async () => null);
  const pages = t.mock.method(client, "getTransactionsByBlock", async () => ({ transactions: [], nextCursor: null, oldestIndexedBlockHeight: 18n, latestIndexedBlockHeight: 20n }));
  const blocks = await loadRecentActivityBlocks();
  assert.deepEqual(blocks.blocks.map((block) => block.height), ["20", "19", "18"]);
  assert.equal((await loadRecentActivityTransactions()).transactions.length, 0);
  pages.mock.restore();
  t.mock.method(client, "getTransactionsByBlock", async () => ({ transactions: [], nextCursor: "0x01", oldestIndexedBlockHeight: 1n, latestIndexedBlockHeight: 20n }));
  await assert.rejects(readActivityBlock("20"), /pagination unavailable/);
});

test("receipt failures retain transaction links and decoded transfers retain exact amounts", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ blockHeight: 1n }));
  t.mock.method(client, "getBlockByHeight", async () => null);
  t.mock.method(client, "getTransactionsByBlock", async () => ({
    transactions: [1, 2].map((byte) => ({ transactionHash: hashFromBase58(identifier(byte)), blockHeight: 1n })),
    nextCursor: null, oldestIndexedBlockHeight: 1n, latestIndexedBlockHeight: 1n,
  }));
  t.mock.method(client, "getTransactionReceipt", async ({ transactionHash: hash }: { transactionHash: Uint8Array }) => {
    if (hash[0] === 2) throw new Error("private RPC details");
    return { blockHeight: 1n, execution: { result: "return", returnData: new Uint8Array() }, events: [transferEvent({ contractAddress: NATIVE_TOKEN_ADDRESS })] };
  });
  const feed = await loadRecentActivityTransactions();
  assert.equal(feed.transactions.length, 2);
  assert.equal(feed.transactions[0].events[0].amount, "1.5");
  assert.equal(feed.transactions[0].result, "return");
  assert.equal(feed.transactions[1].hash, identifier(2));
  assert.equal(feed.transactions[1].result, null);
  assert.equal(JSON.stringify(feed).includes("private"), false);
});

test("quiet chains stop at the scan window without fetching empty-block metadata", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ blockHeight: 10000n }));
  const metadata = t.mock.method(client, "getBlockByHeight", async () => null);
  const pages = t.mock.method(client, "getTransactionsByBlock", async () => ({ transactions: [], nextCursor: null, oldestIndexedBlockHeight: 1n, latestIndexedBlockHeight: 10000n }));
  const feed = await loadRecentActivityTransactions();
  assert.equal(feed.limited, true);
  assert.equal(feed.unavailable, false);
  assert.equal(feed.transactions.length, 0);
  assert.equal(pages.mock.callCount(), ACTIVITY_SCAN_BLOCK_LIMIT + 1);
  assert.equal(metadata.mock.callCount(), 0);
});

test("busy-block preview reads one page and block counts stop at their page budget", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ blockHeight: 1n }));
  t.mock.method(client, "getBlockByHeight", async () => null);
  t.mock.method(client, "getTransactionReceipt", async () => null);
  const pages = t.mock.method(client, "getTransactionsByBlock", async ({ cursor }: { cursor?: string }) => {
    const page = cursor ? Number(cursor) : 0;
    return {
      transactions: Array.from({ length: 50 }, (_, index) => ({ transactionHash: hashFromBase58(identifier(page * 50 + index + 1)), blockHeight: 1n })),
      nextCursor: `0x${(page + 1).toString(16).padStart(2, "0")}`, oldestIndexedBlockHeight: 1n, latestIndexedBlockHeight: 1n,
    };
  });
  const feed = await loadRecentActivityTransactions();
  assert.equal(feed.transactions.length, 10);
  assert.equal(feed.limited, false);
  assert.equal(pages.mock.callCount(), 2); // Coverage probe plus preview page.
  const beforeCount = pages.mock.callCount();
  const block = await readActivityBlock("1");
  assert.equal(pages.mock.callCount() - beforeCount, ACTIVITY_BLOCK_PAGE_LIMIT);
  assert.equal(block.hashes.length, 200);
  assert.equal(block.complete, false);
});

test("activity uses typed index coverage when the committed tip is ahead", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getChainTip", async () => ({ blockHeight: 30n }));
  t.mock.method(client, "getBlockByHeight", async () => null);
  t.mock.method(client, "getTransactionsByBlock", async ({ blockHeight }: { blockHeight: bigint }) => {
    if (blockHeight > 20n) throw new NativeRpcError(new JsonRpcError(-32013, "Index lag", { kind: "historyUnavailable", oldestIndexedBlockHeight: "18", latestIndexedBlockHeight: "20" }), "getTransactionsByBlock");
    return { transactions: [], nextCursor: null, oldestIndexedBlockHeight: 18n, latestIndexedBlockHeight: 20n };
  });
  const result = await loadRecentActivityBlocks();
  assert.equal(result.unavailable, false);
  assert.deepEqual(result.blocks.map((block) => block.height), ["20", "19", "18"]);
});
