import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test, type TestContext } from "node:test";

import { MockTransport, addressFromBase58, createThruputClient, hashFromBase58, toBase58, type EventQuery, type IdentifiedEvent } from "@thruputchain/client";
import { groundhog_erc20_if as ERC20 } from "@thruputchain/client/contracts";

import { loadAddressPageData } from "./addresses";
import { NATIVE_HOG_ADDRESS } from "./client";
import { identifier, transferEvent } from "./test-fixtures";

// Match the CommonJS SDK factory mock used by loaders.test.ts.
const sdk: typeof import("@thruputchain/client") = createRequire(import.meta.url)("@thruputchain/client");
const address = identifier(0xab);
const peer = identifier(0xcd);
const balance = { rawBalance: "15000000", amount: "1.5", symbol: "HOG", height: "42" };
const hash = (id: number) => toBase58(new Uint8Array([...new Uint8Array(31), id]));

function event(id: number, blockHeight: bigint, options: Parameters<typeof transferEvent>[0] = {}): IdentifiedEvent {
  return {
    txHash: hashFromBase58(hash(id)), blockHeight, sequenceNumber: id,
    event: transferEvent({ contractAddress: NATIVE_HOG_ADDRESS, from: peer, to: address, amount: 15_000_000n, ...options }),
  };
}

async function mockClient(t: TestContext) {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getBalance", async () => ({ rawBalance: 15_000_000n, height: 42n }));
  t.mock.method(client, "readViews", async () => { throw new Error("Metadata unavailable"); });
  return client;
}

test("address merges incoming and outgoing HOG history with roots and deduplicates hashes, not events", async (t) => {
  const client = await mockClient(t);
  const incoming = event(2, 42n);
  const outgoing = event(3, 43n, { from: address, to: peer });
  const repeated = { ...incoming, txHash: hashFromBase58(hash(2)), sequenceNumber: 4 };
  const emitted = event(4, 44n, { contractAddress: address });
  const roots = t.mock.method(client, "getTransactionsByAddress", async () => ({ refs: [
    { txHash: hashFromBase58(hash(1)), height: 41n },
    { txHash: hashFromBase58(hash(2)), height: 42n },
  ] }));
  const events = t.mock.method(client, "getEvents", async (query: EventQuery) => ({
    events: query.filters.length === 2 ? [outgoing, incoming, repeated] : [emitted],
  }));

  const result = await loadAddressPageData(address);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") assert.fail("Expected address data");
  assert.deepEqual(result.transactions, [
    { txHash: hash(3), height: "43" }, { txHash: hash(2), height: "42" }, { txHash: hash(1), height: "41" },
  ]);
  assert.deepEqual(result.hogTransfers.map(({ txHash, sequenceNumber }) => ({ txHash, sequenceNumber })), [
    { txHash: hash(3), sequenceNumber: 3 }, { txHash: hash(2), sequenceNumber: 2 }, { txHash: hash(2), sequenceNumber: 4 },
  ]);
  assert.deepEqual(result.hogTransfers.map(({ decoded }) => decoded), [
    { kind: "token-transfer", name: "Transfer", from: address, to: peer, rawAmount: "15000000", amount: "1.5", symbol: "HOG" },
    { kind: "token-transfer", name: "Transfer", from: peer, to: address, rawAmount: "15000000", amount: "1.5", symbol: "HOG" },
    { kind: "token-transfer", name: "Transfer", from: peer, to: address, rawAmount: "15000000", amount: "1.5", symbol: "HOG" },
  ]);
  assert.deepEqual(result.contractEvents.map(({ txHash }) => txHash), [hash(4)]);
  assert.deepEqual(result.nativeBalance, balance);
  assert.equal(result.metadata, undefined);
  assert.equal(result.transactionHistoryPartial, false);
  assert.equal(result.transactionsError, undefined);
  assert.equal(result.hogTransfersError, undefined);
  assert.equal(result.contractEventsError, undefined);
  assert.deepEqual(roots.mock.calls.map(({ arguments: args }) => args), [[{
    address: addressFromBase58(address), order: "descending", anchor: "end", limit: 25,
  }]]);
  assert.deepEqual(events.mock.calls.map(({ arguments: args }) => args[0]), [
    {
      filters: [
        ERC20.v0_1.events.TransferEvent.filter({ contractAddresses: [addressFromBase58(NATIVE_HOG_ADDRESS)], topics: { from: addressFromBase58(address) } }),
        ERC20.v0_1.events.TransferEvent.filter({ contractAddresses: [addressFromBase58(NATIVE_HOG_ADDRESS)], topics: { to: addressFromBase58(address) } }),
      ],
      order: "descending", anchor: "end", limit: 25,
    },
    { filters: [{ contractAddresses: [addressFromBase58(address)] }], order: "descending", anchor: "end", limit: 25 },
  ]);
});

test("address orders adjacent heights beyond safe integers without rounding", async (t) => {
  const client = await mockClient(t);
  t.mock.method(client, "getTransactionsByAddress", async () => ({ refs: [
    { txHash: hashFromBase58(hash(1)), height: 9_007_199_254_740_992n },
  ] }));
  t.mock.method(client, "getEvents", async (query: EventQuery) => ({
    events: query.filters.length === 2 ? [event(2, 9_007_199_254_740_993n)] : [],
  }));

  const result = await loadAddressPageData(address);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") assert.fail("Expected address data");
  assert.deepEqual(result.transactions, [
    { txHash: hash(2), height: "9007199254740993" }, { txHash: hash(1), height: "9007199254740992" },
  ]);
});

test("address keeps the newest 25 transactions after combining and deduplicating both sources", async (t) => {
  const client = await mockClient(t);
  t.mock.method(client, "getTransactionsByAddress", async () => ({
    refs: Array.from({ length: 20 }, (_, i) => ({ txHash: hashFromBase58(hash(40 - i * 2)), height: BigInt(40 - i * 2) })),
  }));
  t.mock.method(client, "getEvents", async (query: EventQuery) => ({
    events: query.filters.length === 2 ? [
      event(40, 40n),
      ...Array.from({ length: 20 }, (_, i) => event(39 - i * 2, BigInt(39 - i * 2))),
    ] : [],
  }));

  const result = await loadAddressPageData(address);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") assert.fail("Expected address data");
  assert.equal(result.transactions.length, 25);
  assert.deepEqual(result.transactions, Array.from({ length: 25 }, (_, i) => ({ txHash: hash(40 - i), height: String(40 - i) })));
  assert.equal(result.hogTransfers.length, 21);
  assert.equal(result.transactionHistoryPartial, false);
});

for (const failure of ["roots", "hog", "both histories", "contract events", "balance"] as const) {
  test(`address retains successful sources despite ${failure} failure`, async (t) => {
    const client = await mockClient(t);
    const rootsFail = failure === "roots" || failure === "both histories";
    const hogFail = failure === "hog" || failure === "both histories";
    if (failure === "balance") {
      t.mock.method(client, "getBalance", async () => { throw new Error("Balance unavailable"); });
    }
    t.mock.method(client, "getTransactionsByAddress", async () => {
      if (rootsFail) throw new Error("Root history unavailable");
      return { refs: [{ txHash: hashFromBase58(hash(1)), height: 41n }] };
    });
    t.mock.method(client, "getEvents", async (query: EventQuery) => {
      if (query.filters.length === 2) {
        if (hogFail) throw new Error("HOG history unavailable");
        return { events: [event(2, 42n)] };
      }
      if (failure === "contract events") throw new Error("Contract events unavailable");
      return { events: [event(3, 43n, { contractAddress: address })] };
    });

    const result = await loadAddressPageData(address);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") assert.fail("Expected retained address data");
    assert.deepEqual(result.nativeBalance, failure === "balance" ? undefined : balance);
    assert.deepEqual(result.transactions, [
      ...(hogFail ? [] : [{ txHash: hash(2), height: "42" }]),
      ...(rootsFail ? [] : [{ txHash: hash(1), height: "41" }]),
    ]);
    assert.equal(result.transactionHistoryPartial, rootsFail || hogFail);
    assert.equal(result.transactionsError?.message, rootsFail && hogFail ? "Root history unavailable" : undefined);
    assert.deepEqual(result.hogTransfers.map(({ txHash }) => txHash), hogFail ? [] : [hash(2)]);
    assert.equal(result.hogTransfersError?.message, hogFail ? "HOG history unavailable" : undefined);
    assert.deepEqual(result.contractEvents.map(({ txHash }) => txHash), failure === "contract events" ? [] : [hash(3)]);
    assert.equal(result.contractEventsError?.message, failure === "contract events" ? "Contract events unavailable" : undefined);
  });
}

test("native HOG address queries only its contract events, not holder transfers", async (t) => {
  const client = await mockClient(t);
  t.mock.method(client, "getTransactionsByAddress", async () => ({ refs: [{ txHash: hashFromBase58(hash(1)), height: 41n }] }));
  const events = t.mock.method(client, "getEvents", async () => ({ events: [event(2, 42n)] }));

  const result = await loadAddressPageData(NATIVE_HOG_ADDRESS);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") assert.fail("Expected HOG address data");
  assert.deepEqual(events.mock.calls.map(({ arguments: args }) => args), [[{
    filters: [{ contractAddresses: [addressFromBase58(NATIVE_HOG_ADDRESS)] }], order: "descending", anchor: "end", limit: 25,
  }]]);
  assert.deepEqual(result.transactions, [{ txHash: hash(1), height: "41" }]);
  assert.deepEqual(result.hogTransfers, []);
  assert.deepEqual(result.contractEvents.map(({ txHash }) => txHash), [hash(2)]);
  assert.equal(result.contractEvents[0].decoded?.symbol, "HOG");
  assert.equal(result.transactionHistoryPartial, false);
  assert.equal(result.transactionsError, undefined);
  assert.equal(result.hogTransfersError, undefined);
});
