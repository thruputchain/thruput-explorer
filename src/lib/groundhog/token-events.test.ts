import assert from "node:assert/strict";
import { test } from "node:test";

import { addressFromHex, type EmittedEvent } from "@groundhogchain/client";
import { ERC20ApprovalEvent, decodeERC20Event } from "@groundhogchain/client/contracts";
import { CxsWriter, Int128Codec } from "@groundhogchain/protocol";

import { transferEvent } from "./test-fixtures";
import { decodeTokenEvent } from "./token-events";

const from = `0x${"11".repeat(32)}`;
const to = `0x${"22".repeat(32)}`;
const zero = `0x${"00".repeat(32)}`;

test("shared fixture encodes a real ERC20 TransferEvent with deterministic defaults and overrides", () => {
  const event = transferEvent();
  assert.deepEqual(event, transferEvent());
  assert.deepEqual(event.contractAddress, addressFromHex(`0x${"cc".repeat(32)}`));
  assert.deepEqual(decodeERC20Event(event), {
    name: "TransferEvent",
    topics: { from: addressFromHex(from), to: addressFromHex(to) },
    fields: { amount: 15_000_000n },
  });

  const overridden = transferEvent({ contractAddress: to, from: to, to: from, amount: 0n });
  assert.deepEqual(overridden.contractAddress, addressFromHex(to));
  assert.deepEqual(decodeERC20Event(overridden), {
    name: "TransferEvent",
    topics: { from: addressFromHex(to), to: addressFromHex(from) },
    fields: { amount: 0n },
  });
});

for (const { name, options, participants } of [
  { name: "Transfer", options: { from, to }, participants: { from, to } },
  { name: "Mint", options: { from: zero, to }, participants: { to } },
  { name: "Burn", options: { from, to: zero }, participants: { from } },
]) {
  test(`classifies ${name} and exposes only its participants`, () => {
    assert.deepEqual(decodeTokenEvent(transferEvent(options), { symbol: "TEST", decimals: 7 }), {
      kind: `token-${name.toLowerCase()}`,
      name,
      ...participants,
      rawAmount: "15000000",
      amount: "1.5",
      symbol: "TEST",
    });
  });
}

for (const { label, amount, decimals, expected } of [
  { label: "zero", amount: 0n, decimals: 7, expected: "0" },
  { label: "one base unit", amount: 1n, decimals: 7, expected: "0.0000001" },
  { label: "whole units", amount: 20_000_000n, decimals: 7, expected: "2" },
  { label: "fractional trailing zeros", amount: 12_340_000n, decimals: 7, expected: "1.234" },
  { label: "beyond safe integer", amount: 9_007_199_254_740_993n, decimals: 7, expected: "900719925.4740993" },
  { label: "missing decimals", amount: 9_007_199_254_740_993n, decimals: undefined, expected: "9007199254740993" },
  { label: "zero decimals", amount: 123n, decimals: 0, expected: "123" },
  { label: "negative decimals", amount: 123n, decimals: -1, expected: "123" },
  { label: "maximum display decimals", amount: 1n, decimals: 30, expected: "0.000000000000000000000000000001" },
  { label: "above maximum display decimals", amount: 123n, decimals: 31, expected: "123" },
  {
    label: "maximum int128",
    amount: (1n << 127n) - 1n,
    decimals: 7,
    expected: "17014118346046923173168730371588.4105727",
  },
]) {
  test(`formats ${label} without losing raw precision`, () => {
    const decoded = decodeTokenEvent(transferEvent({ amount }), { decimals });
    assert.ok(decoded);
    assert.equal(decoded.rawAmount, amount.toString());
    assert.equal(decoded.amount, expected);
    assert.equal(decoded.symbol, undefined);
  });
}

test("missing metadata preserves raw amounts without inventing a symbol", () => {
  assert.deepEqual(decodeTokenEvent(transferEvent()), {
    kind: "token-transfer", name: "Transfer", from, to,
    rawAmount: "15000000", amount: "15000000", symbol: undefined,
  });
});

test("rejects unknown signatures, missing topics, malformed addresses, and invalid payloads", () => {
  const event = transferEvent();
  const cases: Record<string, EmittedEvent> = {
    "unknown signature": { ...event, topics: [new Uint8Array(32), ...event.topics.slice(1)] },
    "no topics": { ...event, topics: [] },
    "missing participant": { ...event, topics: event.topics.slice(0, 2) },
    "extra topic": { ...event, topics: [...event.topics, new Uint8Array(32)] },
    "short sender": { ...event, topics: [event.topics[0], new Uint8Array(31), event.topics[2]] },
    "long recipient": { ...event, topics: [event.topics[0], event.topics[1], new Uint8Array(33)] },
    "empty payload": { ...event, data: new Uint8Array() },
    "truncated payload": { ...event, data: event.data.slice(0, -1) },
    "trailing payload": { ...event, data: new Uint8Array([...event.data, 0]) },
  };

  for (const [label, malformed] of Object.entries(cases)) {
    assert.equal(decodeTokenEvent(malformed), undefined, label);
  }
});

test("ignores a valid ERC20 ApprovalEvent", () => {
  const writer = new CxsWriter();
  Int128Codec.encode(writer, -123n);
  const event = transferEvent();
  event.topics[0] = ERC20ApprovalEvent.signature;
  event.data = writer.finish();

  assert.equal(decodeERC20Event(event)?.name, "ApprovalEvent");
  assert.equal(decodeTokenEvent(event), undefined);
});
