import assert from "node:assert/strict";
import { test } from "node:test";
import { toBase58 } from "@thruputchain/client";
import {
  ContractTypeKind,
  type ContractType,
} from "@thruputchain/client/contract";
import { formatArgumentValue, formatContractType } from "./spec-format";

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
