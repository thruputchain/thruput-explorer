import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { addressFromHex, createGroundhogClient, hashFromHex, MockTransport } from "@groundhogchain/client";
import { ERC20Metadata } from "@groundhogchain/client/contracts";

import { POST } from "../../app/api/search/route";
import { displayAddress } from "../address";

const sdk: typeof import("@groundhogchain/client") = createRequire(import.meta.url)("@groundhogchain/client");
const hash = `0x${"ab".repeat(32)}`;
const request = (query: string) => new Request("http://localhost/api/search", {
  method: "POST", body: JSON.stringify({ query }),
});

test("search rejects malformed input before connecting and reports factory rejection as 503", async (t) => {
  const connect = t.mock.method(sdk, "createGroundhogClient", async () => {
    throw new Error("Connection failed");
  });
  assert.equal((await POST(request("bad hash"))).status, 400);
  assert.equal(connect.mock.callCount(), 0);
  const result = await POST(request(hash));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { status: "unavailable", message: "Connection failed" });
});

test("search prefers known transactions and routes unknown hashes to addresses despite failed context RPCs", async (t) => {
  const client = await createGroundhogClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createGroundhogClient", async () => client);
  const status = t.mock.method(client, "getTransactionStatus", async () => ({ status: "pending" as const }));
  const balance = t.mock.method(client, "getBalance", async () => { throw new Error("Unavailable"); });
  t.mock.method(client, "getTransactionsByAddress", async () => { throw new Error("Unavailable"); });
  t.mock.method(client, "view", async () => { throw new Error("Unavailable"); });

  const transaction = await POST(request(`  ${hash.toUpperCase().replace("0X", "0x")}  `));
  assert.equal(transaction.status, 200);
  assert.deepEqual(await transaction.json(), { status: "ok", href: `/tx/${hash}` });
  assert.equal(balance.mock.callCount(), 0);

  status.mock.restore();
  t.mock.method(client, "getTransactionStatus", async () => ({ status: "unknown" as const }));
  const address = await POST(request(hash));
  assert.equal(address.status, 200);
  assert.deepEqual(await address.json(), {
    status: "ok", href: `/address/${displayAddress(hash)}`,
    context: { hasNativeBalance: false, hasRootTransactions: false, token: false },
  });
});

test("search reports successful address context even when the available balance is zero", async (t) => {
  const client = await createGroundhogClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createGroundhogClient", async () => client);
  t.mock.method(client, "getTransactionStatus", async () => ({ status: "unknown" as const }));
  const balance = t.mock.method(client, "getBalance", async () => ({ rawBalance: 0n, height: 42n }));
  const transactions = t.mock.method(client, "getTransactionsByAddress", async () => ({ refs: [{ txHash: hashFromHex(hash), height: 42n }] }));
  t.mock.method(ERC20Metadata.name, "view", async () => ({ value: "ALULA" }));
  t.mock.method(ERC20Metadata.symbol, "view", async () => ({ value: "ALULA" }));
  t.mock.method(ERC20Metadata.decimals, "view", async () => ({ value: 6n }));

  const response = await POST(request(hash));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok", href: `/address/${displayAddress(hash)}`,
    context: { hasNativeBalance: true, hasRootTransactions: true, token: true },
  });
  assert.deepEqual(balance.mock.calls[0].arguments, [addressFromHex(hash)]);
  assert.deepEqual(transactions.mock.calls[0].arguments, [{ address: addressFromHex(hash), order: "descending", anchor: "end", limit: 1 }]);
});

test("search accepts a StrKey address without a transaction lookup", async (t) => {
  const client = await createGroundhogClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createGroundhogClient", async () => client);
  const status = t.mock.method(client, "getTransactionStatus", async () => { throw new Error("Unexpected status lookup"); });
  const balance = t.mock.method(client, "getBalance", async () => ({ rawBalance: 5n, height: 42n }));
  t.mock.method(client, "getTransactionsByAddress", async () => ({ refs: [] }));
  t.mock.method(client, "view", async () => { throw new Error("Unavailable"); });

  const strkey = displayAddress(hash);
  const response = await POST(request(strkey));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok", href: `/address/${strkey}`,
    context: { hasNativeBalance: true, hasRootTransactions: false, token: false },
  });
  assert.equal(status.mock.callCount(), 0);
  assert.deepEqual(balance.mock.calls[0].arguments, [addressFromHex(hash)]);
});

test("a failed transaction-status lookup returns 503 without guessing an address", async (t) => {
  const client = await createGroundhogClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createGroundhogClient", async () => client);
  t.mock.method(client, "getTransactionStatus", async () => { throw new Error("Status RPC unavailable"); });
  const balance = t.mock.method(client, "getBalance", async () => { throw new Error("Unexpected address lookup"); });
  const history = t.mock.method(client, "getTransactionsByAddress", async () => { throw new Error("Unexpected history lookup"); });
  const view = t.mock.method(client, "view", async () => { throw new Error("Unexpected metadata lookup"); });

  const response = await POST(request(hash));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable", message: "Status RPC unavailable" });
  assert.equal(balance.mock.callCount(), 0);
  assert.equal(history.mock.callCount(), 0);
  assert.equal(view.mock.callCount(), 0);
});

for (const status of [
  { status: "committed" as const, height: 42n },
  { status: "recentFailure" as const, attemptHeight: 42n, conflict: { address: addressFromHex(hash), key: hashFromHex(hash), code: "test-conflict" } },
]) {
  test(`search routes ${status.status} transactions without address probes`, async (t) => {
    const client = await createGroundhogClient({ transport: new MockTransport() });
    t.mock.method(sdk, "createGroundhogClient", async () => client);
    t.mock.method(client, "getTransactionStatus", async () => status);
    const balance = t.mock.method(client, "getBalance", async () => { throw new Error("Unexpected address lookup"); });
    const history = t.mock.method(client, "getTransactionsByAddress", async () => { throw new Error("Unexpected history lookup"); });
    const view = t.mock.method(client, "view", async () => { throw new Error("Unexpected metadata lookup"); });
    const response = await POST(request(hash));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", href: `/tx/${hash}` });
    assert.equal(balance.mock.callCount(), 0);
    assert.equal(history.mock.callCount(), 0);
    assert.equal(view.mock.callCount(), 0);
  });
}

test("missing or non-string queries are rejected without a connection", async (t) => {
  const connect = t.mock.method(sdk, "createGroundhogClient", async () => { throw new Error("Unexpected connection"); });
  for (const body of [null, {}, { query: 42 }, { query: [hash] }, { query: null }]) {
    const response = await POST(new Request("http://localhost/api/search", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).status, "malformed");
  }
  assert.equal(connect.mock.callCount(), 0);
});
