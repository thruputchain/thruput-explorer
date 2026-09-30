import assert from "node:assert/strict";
import test from "node:test";

import { bytesToHex0x, displayAddress, formatContractAddress, parseContractAddress } from "./address";

// SEP-23 example contract address and its 32-byte payload.
const SEP23_STRKEY = "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";
const SEP23_HEX = "0x363eaa3867841fbad0f4ed88c779e4fe66e56a2470dc98c0ec9c073d05c7b103";

test("parses a C StrKey into its bytes", () => {
  const bytes = parseContractAddress(SEP23_STRKEY);
  assert.ok(bytes);
  assert.equal(bytesToHex0x(bytes), SEP23_HEX);
});

test("parses legacy hex with any case and surrounding whitespace", () => {
  const bytes = parseContractAddress(`  ${SEP23_HEX.toUpperCase().replace("0X", "0x")}\n`);
  assert.ok(bytes);
  assert.equal(formatContractAddress(bytes), SEP23_STRKEY);
});

test("formats bytes as a C StrKey", () => {
  const bytes = parseContractAddress(SEP23_HEX);
  assert.ok(bytes);
  assert.equal(formatContractAddress(bytes), SEP23_STRKEY);
});

test("round-trips arbitrary addresses", () => {
  for (let seed = 0; seed < 64; seed++) {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (seed * 31 + index * 7) & 0xff);
    const strkey = formatContractAddress(bytes);
    assert.match(strkey, /^C[A-Z2-7]{55}$/);
    assert.deepEqual(parseContractAddress(strkey), bytes);
  }
});

test("rejects a bad checksum, wrong version and wrong length", () => {
  const corrupted = `${SEP23_STRKEY.slice(0, -1)}${SEP23_STRKEY.endsWith("A") ? "B" : "A"}`;
  assert.equal(parseContractAddress(corrupted), null);
  assert.equal(parseContractAddress(`G${SEP23_STRKEY.slice(1)}`), null);
  assert.equal(parseContractAddress(SEP23_STRKEY.slice(1)), null);
  assert.equal(parseContractAddress(`${SEP23_HEX}00`), null);
  assert.equal(parseContractAddress(""), null);
});

test("displays hex as a StrKey and leaves other text unchanged", () => {
  assert.equal(displayAddress(SEP23_HEX), SEP23_STRKEY);
  assert.equal(displayAddress(SEP23_STRKEY), SEP23_STRKEY);
  assert.equal(displayAddress("not an address"), "not an address");
});
