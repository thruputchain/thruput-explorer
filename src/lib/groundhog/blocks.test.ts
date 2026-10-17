import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createThruputClient, MockTransport } from "@thruputchain/client";

import { POST } from "../../app/api/search/route";
import { isBlockHeight } from "../validation";
import { checkBlockContinuation } from "./block-pagination";
import { loadBlock, loadBlockTransactions } from "./blocks";

const sdk: typeof import("@thruputchain/client") = createRequire(
  import.meta.url,
)("@thruputchain/client");

test("height search preserves large integers and rejects malformed and out-of-range values", async () => {
  for (const height of ["0", "42", "9007199254740993", "9223372036854775807"]) {
    const response = await POST(
      new Request("http://localhost/api/search", {
        method: "POST",
        body: JSON.stringify({ query: height }),
      }),
    );
    assert.deepEqual(await response.json(), {
      status: "ok",
      href: `/block/${height}`,
    });
  }
  for (const height of [
    "-1",
    "01",
    "1.0",
    "1e3",
    "9223372036854775808",
    "9".repeat(100),
  ])
    assert.equal(isBlockHeight(height), false);
});

test("block loaders separate missing metadata, index gaps, malformed responses and unavailable RPC", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(sdk, "createThruputClient", async () => client);
  t.mock.method(client, "getBlockByNumber", async () => null);
  const transactions = t.mock.method(
    client,
    "getTransactionsByBlock",
    async () => ({
      refs: [],
      cursor: new Uint8Array(),
      oldestBlock: 1n,
      latestBlock: 42n,
    }),
  );
  assert.equal((await loadBlock("0")).status, "missing");
  assert.equal((await loadBlockTransactions("43")).status, "missing");
  assert.equal((await loadBlockTransactions("42")).status, "ok");
  assert.deepEqual(transactions.mock.calls[1].arguments, [
    { height: 42n, cursor: new Uint8Array(), limit: 50, order: "ascending" },
  ]);
  assert.equal(
    (await loadBlockTransactions("42", "not-hex")).status,
    "invalid",
  );
  transactions.mock.restore();
  t.mock.method(client, "getTransactionsByBlock", async () => {
    throw new Error("private RPC key");
  });
  const failure = await loadBlockTransactions("42");
  assert.equal(failure.status, "unavailable");
  assert.equal(JSON.stringify(failure).includes("private RPC key"), false);
});

test("pagination detects whole-walk cycles, overlapping hashes and coverage loss", () => {
  const page = { hashes: ["0x02"], cursor: "0xbb", oldest: "1", latest: "42" };
  const seen = new Set(["0xaa", "0xbb"]);
  assert.equal(
    checkBlockContinuation(
      page,
      { ...page, hashes: ["0x03"], cursor: "0xaa" },
      seen,
    ),
    false,
  );
  assert.equal(
    checkBlockContinuation(
      page,
      { ...page, hashes: ["0x02"], cursor: "0xcc" },
      seen,
    ),
    false,
  );
  assert.equal(
    checkBlockContinuation(
      page,
      { ...page, hashes: [], cursor: "0x", oldest: "2" },
      seen,
    ),
    false,
  );
  assert.equal(
    checkBlockContinuation(
      page,
      { ...page, hashes: [], cursor: "0x", latest: "41" },
      seen,
    ),
    false,
  );
  assert.equal(
    checkBlockContinuation(
      page,
      { ...page, hashes: ["0x03"], cursor: "0xcc", latest: "43" },
      seen,
    ),
    true,
  );
  assert.equal(
    checkBlockContinuation(page, { ...page, hashes: [], cursor: "0x" }, seen),
    true,
  );
});
