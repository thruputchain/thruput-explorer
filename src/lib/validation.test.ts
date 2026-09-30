import assert from "node:assert/strict";
import test from "node:test";

import { isContractAddress, isTransactionHash, normalizeContractAddress } from "./validation";

const STRKEY = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
const HEX = "0x363eaa3867841fbad0f4ed88c779e4fe66e56a2470dc98c0ec9c073d05c7b103";

test("accepts a C StrKey or 0x hex as an address", () => {
  assert.equal(isContractAddress(STRKEY), true);
  assert.equal(isContractAddress(HEX), true);
  assert.equal(isContractAddress(` ${HEX.toUpperCase().replace("0X", "0x")} `), true);
  assert.equal(isContractAddress(`${STRKEY.slice(0, -1)}A`), false);
  assert.equal(isContractAddress("not-an-address"), false);
});

test("normalizes both forms to lowercase 0x hex", () => {
  assert.equal(normalizeContractAddress(STRKEY), HEX);
  assert.equal(normalizeContractAddress(HEX.toUpperCase().replace("0X", "0x")), HEX);
  assert.equal(normalizeContractAddress("  Not-An-Address "), "not-an-address");
});

test("a StrKey is not a transaction hash", () => {
  assert.equal(isTransactionHash(STRKEY), false);
  assert.equal(isTransactionHash(HEX), true);
});
