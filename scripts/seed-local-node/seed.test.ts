import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedBalances } from "./index";

test("calculates expected balances from the configured mint and transfer amounts", () => {
  assert.deepEqual(expectedBalances(0), { Alice: 885n, Bob: 1085n, Carol: 1030n });
  assert.deepEqual(expectedBalances(6), {
    Alice: 885000000n,
    Bob: 1085000000n,
    Carol: 1030000000n,
  });
});
