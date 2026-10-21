import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { HttpTransport, MockTransport, createThruputClient, hashFromBase58 } from "@thruputchain/client";
import { identifier } from "./test-fixtures";
import { ERC20Metadata } from "@thruputchain/client/contracts";
import { metadataBatchResponse } from "./test-fixtures";

import { loadAddressPageData } from "./addresses";
import { NATIVE_HOG_ADDRESS } from "./client";
import { loadLatestHogTransfers } from "./latest-hog-transfers";
import { getTokenMetadata } from "./token-metadata";
import { loadTransactionPageData } from "./transactions";

// tsx runs this package as CommonJS. Mock the published factory rather than
// replacing Explorer's modules or reaching into SDK implementation files.
const sdk: typeof import("@thruputchain/client") = createRequire(import.meta.url)("@thruputchain/client");
const hash = identifier(0xab);

for (const partial of [false, true]) {
  test(`address retains balance and root transactions with ${partial ? "failed" : "successful"} event RPCs`, async (t) => {
    const client = await createThruputClient({ transport: new MockTransport() });
    t.mock.method(sdk, "createThruputClient", async () => client);
    t.mock.method(client, "getBalance", async () => ({ rawBalance: 15_000_000n, stateBlockHeight: 42n }));
    t.mock.method(client, "getTransactionsByRootAddress", async () => ({ transactions: [{ transactionHash: hashFromBase58(hash), blockHeight: 42n }] }));
    t.mock.method(client, "getEvents", async () => {
      if (partial) throw new Error("Events unavailable");
      return { events: [] };
    });
    t.mock.method(client, "readViews", async () => { throw new Error("Metadata unavailable"); });

    const result = await loadAddressPageData(hash);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") assert.fail("Expected retained address data");
    assert.deepEqual(result.nativeBalance, { rawBalance: "15000000", amount: "1.5", symbol: "HOG", height: "42" });
    assert.deepEqual(result.transactions, [{ txHash: hash, height: "42" }]);
    assert.equal(result.transactionHistoryPartial, partial);
    assert.equal(result.transactionsError, undefined);
    assert.deepEqual(result.hogTransfers, []);
    assert.deepEqual(result.contractEvents, []);
    assert.equal(result.hogTransfersError?.message, partial ? "Events unavailable" : undefined);
    assert.equal(result.contractEventsError?.message, partial ? "Events unavailable" : undefined);
  });
}

test("malformed addresses and transaction hashes never create a client or access RPC", async (t) => {
  const connect = t.mock.method(sdk, "createThruputClient", async () => {
    throw new Error("Unexpected client creation");
  });
  const request = t.mock.method(HttpTransport.prototype, "request", async () => {
    throw new Error("Unexpected RPC request");
  });
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request");
  });

  for (const input of ["", "not-hex", "0x1234", `0x${"gg".repeat(32)}`, `0x${"ab".repeat(33)}`]) {
    const address = await loadAddressPageData(input);
    assert.equal(address.status, "malformed", input);
    const transaction = await loadTransactionPageData(input);
    assert.equal(transaction.status.status, "malformed", input);
    assert.equal(transaction.receipt, null);
  }

  assert.equal(connect.mock.callCount(), 0);
  assert.equal(request.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});

test("async client connection failures become unavailable for every loader", async (t) => {
  const connect = t.mock.method(sdk, "createThruputClient", async () => {
    await Promise.resolve();
    throw new Error("Network handshake failed");
  });
  const request = t.mock.method(HttpTransport.prototype, "request", async () => {
    throw new Error("Unexpected RPC request after failed connection");
  });

  const address = await loadAddressPageData(NATIVE_HOG_ADDRESS);
  assert.equal(address.status, "unavailable");
  if (address.status !== "unavailable") assert.fail("Expected unavailable address");
  assert.equal(address.error.message, "Network handshake failed");

  const transaction = await loadTransactionPageData(hash);
  assert.equal(transaction.status.status, "unavailable");
  if (transaction.status.status !== "unavailable") assert.fail("Expected unavailable transaction");
  assert.equal(transaction.status.error.message, "Network handshake failed");
  assert.equal(transaction.receipt, null);

  const latest = await loadLatestHogTransfers();
  assert.equal(latest.status, "unavailable");
  if (latest.status !== "unavailable") assert.fail("Expected unavailable feed");
  assert.equal(latest.error.message, "Network handshake failed");
  assert.equal(latest.nativeTokenAddress, NATIVE_HOG_ADDRESS);
  assert.equal(connect.mock.callCount(), 3);
  assert.equal(request.mock.callCount(), 0);
});

test("partial custom-token metadata preserves successful fields", async (t) => {
  const transport = new MockTransport();
  const client = await createThruputClient({ transport });
  const request = t.mock.method(transport, "request", async () => metadataBatchResponse(["Thruput", undefined, undefined]));

  assert.deepEqual(await getTokenMetadata(client, hash), {
    name: "Thruput", symbol: undefined, decimals: undefined,
  });
  assert.equal(request.mock.callCount(), 1);
  const calls = [ERC20Metadata.v0_1.name, ERC20Metadata.v0_1.symbol, ERC20Metadata.v0_1.decimals];
  const [method, params] = request.mock.calls[0].arguments;
  assert.equal(method, "simulateInvocations");
  assert.equal((params as { invocations: unknown[] }).invocations.length, calls.length);
});

test("latest feed reports RPC failure instead of an empty successful feed", async (t) => {
  const request = t.mock.method(HttpTransport.prototype, "request", async () => {
    throw new Error("Events RPC unavailable");
  });

  const result = await loadLatestHogTransfers();
  assert.equal(result.status, "unavailable");
  if (result.status !== "unavailable") assert.fail("Expected unavailable feed");
  assert.equal(result.error.message, "Events RPC unavailable");
  assert.equal(result.nativeTokenAddress, NATIVE_HOG_ADDRESS);
  assert.equal(request.mock.callCount(), 1);
});

test("unavailable metadata falls back for HOG but does not label other contracts HOG", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  const read = t.mock.method(client, "readViews", async () => { throw new Error("Metadata unavailable"); });

  assert.deepEqual(await getTokenMetadata(client, NATIVE_HOG_ADDRESS), {
    name: "HOG", symbol: "HOG", decimals: 7,
  });
  assert.equal(read.mock.callCount(), 0);
  assert.equal(await getTokenMetadata(client, hash), undefined);
});

test("invalid custom-token decimals are omitted without replacing a successful symbol", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  for (const decimals of [-1n, 31n]) {
    const view = t.mock.method(client, "readViews", async () => ({ stateBlockHeight: 42n, results: [
      { kind: "fault" }, { kind: "return", value: "LIVE" }, { kind: "return", value: decimals },
    ] }));
    assert.deepEqual(await getTokenMetadata(client, hash), {
      name: undefined, symbol: "LIVE", decimals: undefined,
    });
    view.mock.restore();
  }
});

test("chain tip failure does not erase a committed transaction receipt", async (t) => {
  const rawReceipt = { transactionHash: hash, blockHeight: "42", gasUsed: "1000", execution: { result: "return", returnData: "0x1234" }, events: [] };
  const methods: string[] = [];
  const discovery = new MockTransport();
  t.mock.method(HttpTransport.prototype, "request", async (method: string) => {
    methods.push(method);
    switch (method) {
      case "getVersionInfo": case "getNetworkInfo": case "getServerLimits": return discovery.request(method);
      case "getTransactionStatus": return { status: "committed", blockHeight: "42" };
      case "getTransactionReceipt": return rawReceipt;
      case "getChainTip": throw new Error("Chain tip unavailable");
      default: throw new Error(`Unexpected RPC method: ${method}`);
    }
  });

  const result = await loadTransactionPageData(hash);
  assert.deepEqual(result.status, { status: "committed", height: "42" });
  assert.equal(result.chainTipHeight, undefined);
  assert.ok(result.receipt);
  assert.equal(result.receipt.txHash, hash);
  assert.equal(result.receipt.height, "42");
  assert.equal(result.receipt.execution, "return");
  assert.equal(result.receipt.returnData, "0x1234");
  assert.deepEqual(result.receipt.events, []);
  assert.deepEqual(JSON.parse(result.receipt.rawJson!), rawReceipt);
  assert.ok(methods.includes("getChainTip"));
});
