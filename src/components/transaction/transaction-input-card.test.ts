import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TransactionInputCard } from "./transaction-input-card";
import type { CallPreview } from "@/lib/thruput/transaction-input";

test("deployment with an initializer retains hash and funding with one wallet label", async () => {
  const call: CallPreview = {
    target: "wallet-address", selector: "0x01", calldata: "0x", gasLimit: "100",
    metadata: "Current spec", displayMethod: "Counter.initialize",
    arguments: [{ name: "count", type: "u64", value: "42" }],
  };
  const markup = renderToStaticMarkup(await TransactionInputCard({ data: {
    hash: "transaction", rpcUrl: "http://localhost", status: { status: "committed", height: "4" }, receipt: null,
    loadInput: async () => ({
      status: "available", blockHeight: "4", transactionXdr: "0x", omitted: 0,
      root: { ...call, displayMethod: "DefaultWallet.deploy", deployment: {
        hash: "deployed-contract-hash", funding: "12 native tokens", initializer: "Counter.initialize",
      } },
      requested: [call],
    }),
  } }));
  assert.match(markup, /deployed-contract-hash/);
  assert.match(markup, /12 native tokens/);
  assert.match(markup, /aria-label="Requested call"/);
  assert.match(markup, /count/);
  assert.match(markup, />42</);
  assert.equal((markup.match(/>Wallet</g) ?? []).length, 1);
  assert.match(markup, />Contract deployment</);
});
