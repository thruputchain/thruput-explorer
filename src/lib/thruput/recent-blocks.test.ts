import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createThruputClient, MockTransport } from "@thruputchain/client";

import { loadRecentBlocks } from "./recent-blocks";

const sdk: typeof import("@thruputchain/client") = createRequire(
  import.meta.url,
)("@thruputchain/client");

for (const height of [0n, 3n, 42n, 9_007_199_254_740_993n]) {
  test(`recent blocks use one tip query and preserve height ${height}`, async (t) => {
    const client = await createThruputClient({
      transport: new MockTransport(),
    });
    t.mock.method(sdk, "createThruputClient", async () => client);
    const tip = t.mock.method(client, "getChainTip", async () => ({ height }));
    const details = t.mock.method(client, "getBlockByNumber", async () => {
      throw new Error("Unexpected block scan");
    });
    const result = await loadRecentBlocks();
    assert.equal(result.status, "ok");
    if (result.status !== "ok") assert.fail("Expected recent blocks");
    const length = height < 11n ? Number(height) : 11;
    assert.deepEqual(
      result.heights,
      Array.from({ length }, (_, i) => (height - BigInt(i)).toString()),
    );
    assert.equal(tip.mock.callCount(), 1);
    assert.equal(details.mock.callCount(), 0);
  });
}

test("recent blocks report unavailable without leaking transport diagnostics", async (t) => {
  t.mock.method(sdk, "createThruputClient", async () => {
    throw new Error("private RPC URL");
  });
  assert.deepEqual(await loadRecentBlocks(), { status: "unavailable" });
});
