import assert from "node:assert/strict";
import { test } from "node:test";
import { toBase58 } from "@thruputchain/client";
import {
  ContractTypeKind,
  type ContractType,
} from "@thruputchain/client/contract";
import {
  formatArgumentValue,
  formatContractType,
  formatSpecValue,
  formatFields,
} from "./spec-format";
import { DisplayBudget, PAGE_BYTES, VALUE_BYTES } from "./display-budget";

test("formatting stops traversal before expanding hostile values", () => {
  const budget = new DisplayBudget();
  const values = Array(100_000).fill("🙂".repeat(100));
  Object.defineProperty(values, 1000, {
    get() {
      throw new Error("visited beyond output limit");
    },
  });
  const text = formatSpecValue(values, budget);
  assert.ok(Buffer.byteLength(text) <= VALUE_BYTES);
  assert.ok(text.endsWith("… [truncated]"));
  assert.ok(!text.includes("�"));
  assert.equal(budget.truncated, true);
});

test("one shared budget bounds total output and row count", () => {
  const budget = new DisplayBudget();
  let bytes = 0;
  for (let i = 0; i < 1000; i++)
    bytes += Buffer.byteLength(budget.text("x".repeat(10000)));
  assert.ok(bytes <= PAGE_BYTES);
  assert.ok(budget.remaining >= 0);
  assert.equal(
    new DisplayBudget().rows(Array(1000).fill(0), () => "").length,
    128,
  );
});

test("wide spec types and field names are bounded before joining", () => {
  const budget = new DisplayBudget();
  const type: ContractType = {
    v: ContractTypeKind.Tuple,
    tuple: Array(100_000).fill({ v: ContractTypeKind.U64 }),
  };
  assert.ok(
    Buffer.byteLength(formatContractType(type, 0, budget)) <= VALUE_BYTES,
  );
  const fields = Array(100_000).fill({ name: "x".repeat(1024), ty: type });
  assert.ok(Buffer.byteLength(formatFields(fields, budget)) <= VALUE_BYTES);
  assert.equal(budget.truncated, true);
});

test("nested addresses use base58 inside options and containers", () => {
  const address = new Uint8Array(32).fill(7);
  const text = formatArgumentValue([address], {
    v: ContractTypeKind.Option,
    option_inner: {
      v: ContractTypeKind.Vector,
      vector: { element: { v: ContractTypeKind.Address }, max_len: 10n },
    },
  });
  assert.equal(text, `["${toBase58(address)}"]`);
});

test("argument display preserves wide integers and formats addresses consistently", () => {
  const address = new Uint8Array(32).fill(7);
  assert.equal(
    formatArgumentValue(address, { v: ContractTypeKind.Address }),
    toBase58(address),
  );
  assert.equal(
    formatArgumentValue(18446744073709551615n, { v: ContractTypeKind.U64 }),
    "18446744073709551615",
  );
  assert.equal(formatArgumentValue("", { v: ContractTypeKind.String }), '""');
  assert.equal(
    formatArgumentValue(false, { v: ContractTypeKind.Bool }),
    "false",
  );
  assert.equal(
    formatArgumentValue(null, {
      v: ContractTypeKind.Option,
      option_inner: { v: ContractTypeKind.U64 },
    }),
    "null",
  );
});

test("nested type labels retain bounds without unbounded expansion", () => {
  let type: ContractType = {
    v: ContractTypeKind.Vector,
    vector: {
      element: { v: ContractTypeKind.U64 },
      max_len: 9007199254740993n,
    },
  };
  assert.equal(formatContractType(type), "Vector<u64, 9007199254740993>");
  for (let i = 0; i < 40; i++)
    type = { v: ContractTypeKind.Option, option_inner: type };
  assert.ok(formatContractType(type).includes("…"));
});
