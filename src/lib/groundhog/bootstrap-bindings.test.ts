import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { addressFromBase58, toHex0x } from "@thruputchain/client";
import { identifier } from "./test-fixtures";
import { ERC20, ERC20Metadata } from "@thruputchain/client/contracts";

const source = readFileSync(new URL("../../../scripts/bootstrap-local-node.sh", import.meta.url), "utf8");
const bodies = [...source.matchAll(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/g)].map((match) => match[1]);
const address = identifier(0x11);

for (const { name, method, args } of [
  { name: "ERC20Metadata.v0_1.initialize", method: ERC20Metadata.v0_1.initialize, args: { administrator: addressFromBase58(address), name: "Fixture", symbol: "FIX", decimals: 7n } },
  { name: "ERC20.v0_1.mint", method: ERC20.v0_1.mint, args: { receiver: addressFromBase58(address), amount: 123n } },
  { name: "ERC20.v0_1.transfer", method: ERC20.v0_1.transfer, args: { receiver: addressFromBase58(address), amount: 123n } },
]) {
  test(`bootstrap ${name} encodes the published binding without node or deployment access`, () => {
    const snippets = bodies.filter((body) => body.includes(`const invocation = ${name}.invocation(`));
    assert.equal(snippets.length, 1);
    const result = execFileSync(process.execPath, ["--input-type=module"], {
      cwd: new URL("../../../", import.meta.url),
      input: snippets[0], encoding: "utf8",
      env: { ...process.env, CONTRACT_ADDRESS: address, ADMIN_ADDRESS: address, RECEIVER_ADDRESS: address, TOKEN_NAME: "Fixture", TOKEN_SYMBOL: "FIX", TOKEN_DECIMALS: "7", RAW_AMOUNT: "123" },
    });
    const [entrypoint, calldata] = result.split("\t");
    assert.equal(entrypoint, toHex0x(method.entrypoint));
    assert.deepEqual(method.decodeArgs(Buffer.from(calldata.slice(2), "hex")), args);
  });
}
