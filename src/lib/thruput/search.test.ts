import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { addressFromBase58, createThruputClient, hashFromBase58, MockTransport } from "@thruputchain/client";
import { identifier } from "./test-fixtures";

import { POST } from "../../app/api/search/route";

const sdk: typeof import("@thruputchain/client") = createRequire(import.meta.url)("@thruputchain/client");
const hash = identifier(0xab);
const request = (query: string) => new Request("http://localhost/api/search", {
  method: "POST", body: JSON.stringify({ query }),
});

test("search rejects malformed input before connecting and reports factory rejection as 503", async (t) => {
  const connect = t.mock.method(sdk, "createThruputClient", async () => {
    throw new Error("Connection failed");
  });
  assert.equal((await POST(request("bad hash"))).status, 400);
  assert.equal(connect.mock.callCount(), 0);
  const result = await POST(request(hash));
  assert.equal(result.status, 503);
  assert.deepEqual(await result.json(), { status: "unavailable", message: "Connection failed" });
});

test("search prefers known transactions and routes unknown hashes to addresses", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  const status = t.mock.method(client, "getTransactionStatus", async () => ({ status: "pending" as const }));
  const balance = t.mock.method(client, "getBalance", async () => { throw new Error("Unavailable"); });
  t.mock.method(client, "getTransactionsByAddress", async () => { throw new Error("Unavailable"); });
  t.mock.method(client, "readViews", async () => { throw new Error("Unavailable"); });

  const transaction = await POST(request(`  ${hash}  `));
  assert.equal(transaction.status, 200);
  assert.deepEqual(await transaction.json(), { status: "ok", href: `/tx/${hash}` });
  assert.equal(balance.mock.callCount(), 0);

  status.mock.restore();
  t.mock.method(client, "getTransactionStatus", async () => ({ status: "unknown" as const }));
  const address = await POST(request(hash));
  assert.equal(address.status, 200);
  assert.deepEqual(await address.json(), {
    status: "ok", href: `/address/${hash}`,
  });
});

test("address search performs no unused balance, history or metadata reads", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getTransactionStatus", async () => ({ status: "unknown" as const }));
  const balance = t.mock.method(client, "getBalance", async () => ({ rawBalance: 0n, height: 42n }));
  const transactions = t.mock.method(client, "getTransactionsByAddress", async () => ({ refs: [{ txHash: hashFromBase58(hash), height: 42n }] }));
  const metadata = t.mock.method(client, "readViews", async () => { throw new Error("Unexpected metadata query"); });

  const response = await POST(request(hash));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok", href: `/address/${hash}`,
  });
  assert.equal(balance.mock.callCount(), 0);
  assert.equal(transactions.mock.callCount(), 0);
  assert.equal(metadata.mock.callCount(), 0);
});

test("a failed transaction-status lookup returns 503 without guessing an address", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getTransactionStatus", async () => { throw new Error("Status RPC unavailable"); });
  const balance = t.mock.method(client, "getBalance", async () => { throw new Error("Unexpected address lookup"); });
  const history = t.mock.method(client, "getTransactionsByAddress", async () => { throw new Error("Unexpected history lookup"); });
  const view = t.mock.method(client, "readViews", async () => { throw new Error("Unexpected metadata lookup"); });

  const response = await POST(request(hash));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable", message: "Status RPC unavailable" });
  assert.equal(balance.mock.callCount(), 0);
  assert.equal(history.mock.callCount(), 0);
  assert.equal(view.mock.callCount(), 0);
});

for (const status of [
  { status: "committed" as const, height: 42n },
  { status: "recentFailure" as const, attemptHeight: 42n, cause: { kind: "dbConflict" as const, conflict: { address: addressFromBase58(hash), key: hashFromBase58(hash), code: "other" as const } } },
]) {
  test(`search routes ${status.status} transactions without address probes`, async (t) => {
    const client = await createThruputClient({ transport: new MockTransport() });
    t.mock.method(sdk, "createThruputClient", async () => client);
    t.mock.method(client, "getTransactionStatus", async () => status);
    const balance = t.mock.method(client, "getBalance", async () => { throw new Error("Unexpected address lookup"); });
    const history = t.mock.method(client, "getTransactionsByAddress", async () => { throw new Error("Unexpected history lookup"); });
    const view = t.mock.method(client, "readViews", async () => { throw new Error("Unexpected metadata lookup"); });
    const response = await POST(request(hash));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", href: `/tx/${hash}` });
    assert.equal(balance.mock.callCount(), 0);
    assert.equal(history.mock.callCount(), 0);
    assert.equal(view.mock.callCount(), 0);
  });
}

test("missing or non-string queries are rejected without a connection", async (t) => {
  const connect = t.mock.method(sdk, "createThruputClient", async () => { throw new Error("Unexpected connection"); });
  for (const body of [null, {}, { query: 42 }, { query: [hash] }, { query: null }]) {
    const response = await POST(new Request("http://localhost/api/search", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).status, "malformed");
  }
  assert.equal(connect.mock.callCount(), 0);
});
