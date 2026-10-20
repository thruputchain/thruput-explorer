import assert from "node:assert/strict";
import { test } from "node:test";
import { addressFromBase58 } from "@thruputchain/client";

import { isContractAddress, isTransactionHash, normalizeContractAddress, normalizeTransactionHash } from "./validation";

test("identifier validation preserves case and leading zero bytes", () => {
  const address = "CktRuQ2mttgRGkXJtyksdKHjUdc2C4TgDzyB98oEzy8";
  for (const value of [address, "11111111111111111111111111111111", "11111111111111111111111111111112"]) {
    assert.equal(isContractAddress(value), true);
    assert.equal(isTransactionHash(value), true);
    assert.equal(normalizeContractAddress(` ${value} `), value);
    assert.equal(normalizeTransactionHash(` ${value} `), value);
  }
  const otherAddress = address.replace("Ckt", "ckt");
  assert.equal(isContractAddress(otherAddress), true);
  assert.notDeepEqual(addressFromBase58(address), addressFromBase58(otherAddress));
  for (const invalid of ["", "0OIl", "1".repeat(31), "1".repeat(33), `0x${"ab".repeat(32)}`]) {
    assert.equal(isContractAddress(invalid), false);
    assert.equal(isTransactionHash(invalid), false);
  }
});
