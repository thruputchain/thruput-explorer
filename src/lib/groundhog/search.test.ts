import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { createGroundhogClient, MockTransport } from "@groundhogchain/client";

import { POST } from "../../app/api/search/route";

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
    status: "ok", href: `/address/${hash}`,
    context: { hasNativeBalance: false, hasRootTransactions: false, token: false },
  });
});
