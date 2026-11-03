import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  MockTransport,
  createThruputClient,
  toBase58,
  hashContract,
  deriveEntrypointID,
} from "@thruputchain/client";
import { DefaultWallet } from "@thruputchain/client/contracts";
import {
  codec,
  deserialize,
  serialize,
  gasAmount,
  calldata,
  ContractType,
  HogexecPrecompiledNativeContracts,
} from "@thruputchain/protocol";
import fixture from "../../../tests/fixtures/counter-deploy-input.json";
import { loadTransactionInput } from "./transaction-input";

const transaction = () =>
  deserialize(
    new Uint8Array(Buffer.from(fixture.inputXdr.slice(2), "hex")),
    codec.Transaction,
  );
const artifact = new Uint8Array(
  readFileSync(
    new URL("../../../tests/fixtures/counter-v6.rv32a", import.meta.url),
  ),
);
const contract = {
  contract_type: ContractType.kRv32,
  rv32_contract: { data: artifact },
} as const;
const contractHash = hashContract(contract);
const walletContract = {
  contract_type: ContractType.kNative,
  native_contract_id:
    HogexecPrecompiledNativeContracts.kNativeContractDefaultWallet,
} as const;
const walletHash = hashContract(walletContract);

test("retained input uses the selected native wallet without claiming historical identity", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  const bytes = new Uint8Array(Buffer.from(fixture.inputXdr.slice(2), "hex"));
  const hash = new Uint8Array(createHash("sha256").update(bytes).digest());
  t.mock.method(client, "getTransactionInput", async () => ({
    status: "available",
    transactionHash: hash,
    blockHeight: 4n,
    transactionXdr: bytes,
  }));
  t.mock.method(
    client,
    "getEffectiveContract",
    async ({
      address,
      context,
    }: {
      address: Uint8Array;
      context: "root" | "nested";
    }) => ({
      address,
      context,
      stateBlockHeight: 5n,
      selection: {
        source: "networkDefault",
        contract: {
          hash: walletHash,
          size: 0,
          contractType: ContractType.kNative,
        },
      },
    }),
  );
  t.mock.method(client, "getContractArtifact", async () => ({
    hash: walletHash,
    contractXdr: serialize(walletContract, codec.Contract),
  }));
  const result = await loadTransactionInput(client, toBase58(hash));
  assert.equal(result.status, "available");
  if (result.status !== "available") assert.fail();
  assert.match(result.root.method!, /DefaultWallet@0.1.0.deploy/);
  assert.match(result.root.metadata, /historical behavior/);
  assert.equal(result.root.source, "native");
  assert.equal(result.root.displayMethod, "DefaultWallet.deploy");
  assert.ok(result.root.deployment?.funding.endsWith(" native tokens"));
  assert.equal(result.root.deployment?.initializer, "None");
  assert.equal(result.transactionXdr, fixture.inputXdr);
});

test("direct and wrapped Counter calls decode without inventing child outcomes", async (t) => {
  for (const wrapped of [false, true]) {
    const client = await createThruputClient({
      transport: new MockTransport(),
    });
    const tx = transaction();
    const target = tx.invocation.invoked_address;
    const call = {
      target,
      entrypoint: deriveEntrypointID("Counter", "0.1.0", "get"),
      calldata: calldata(new Uint8Array()),
      gas_limit: gasAmount(100000n),
    };
    tx.invocation = wrapped
      ? DefaultWallet.v0_1.execute.call({
          address: target,
          gasLimit: gasAmount(1000000n),
          args: { calls: [call] },
        }).invocation
      : { invoked_address: target, ...call };
    const bytes = serialize(tx, codec.Transaction);
    const hash = new Uint8Array(createHash("sha256").update(bytes).digest());
    t.mock.method(client, "getTransactionInput", async () => ({
      status: "available",
      transactionHash: hash,
      blockHeight: 4n,
      transactionXdr: bytes,
    }));
    t.mock.method(
      client,
      "getEffectiveContract",
      async ({
        address,
        context,
      }: {
        address: Uint8Array;
        context: "root" | "nested";
      }) => ({
        address,
        context,
        stateBlockHeight: 5n,
        selection:
          wrapped && context === "root"
            ? {
                source: "networkDefault",
                contract: {
                  hash: walletHash,
                  size: 0,
                  contractType: ContractType.kNative,
                },
              }
            : {
                source: "explicitDeployment",
                contract: {
                  hash: contractHash,
                  size: artifact.length,
                  contractType: 3,
                },
              },
      }),
    );
    t.mock.method(
      client,
      "getContractArtifact",
      async ({ hash }: { hash: Uint8Array }) => ({
        hash,
        contractXdr: serialize(
          toBase58(hash) === toBase58(walletHash) ? walletContract : contract,
          codec.Contract,
        ),
      }),
    );
    const result = await loadTransactionInput(client, toBase58(hash));
    assert.equal(result.status, "available");
    if (result.status !== "available") assert.fail();
    if (wrapped) {
      assert.equal(result.requested.length, 1);
      assert.equal(result.requested[0].output, undefined);
      assert.equal(result.requested[0].displayMethod, "Counter.get");
      assert.equal(
        result.requested[0].selector,
        "0x" + Buffer.from(call.entrypoint).toString("hex"),
      );
    } else {
      assert.match(result.root.method!, /Counter@0.1.0.get/);
      assert.deepEqual(result.root.arguments, []);
      assert.equal(result.root.displayMethod, "Counter.get");
      assert.match(
        result.root.metadata,
        /historical code identity is not established/,
      );
    }
  }
});

test("unavailable and hash-mismatched inputs do not become call previews", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  const hash = new Uint8Array(32);
  assert.equal(
    (await loadTransactionInput(client, toBase58(hash))).status,
    "unavailable",
  );
  t.mock.method(client, "getTransactionInput", async () => ({
    status: "available",
    transactionHash: hash,
    blockHeight: 4n,
    transactionXdr: new Uint8Array([1]),
  }));
  assert.equal(
    (await loadTransactionInput(client, toBase58(hash))).status,
    "unavailable",
  );
});

test("missing effective-discovery endpoints never guess a default wallet", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  const bytes = new Uint8Array(Buffer.from(fixture.inputXdr.slice(2), "hex"));
  const hash = new Uint8Array(createHash("sha256").update(bytes).digest());
  t.mock.method(client, "getTransactionInput", async () => ({
    status: "available",
    transactionHash: hash,
    blockHeight: 4n,
    transactionXdr: bytes,
  }));
  t.mock.method(client, "getEffectiveContract", async () => {
    throw new Error("Method not found");
  });
  const result = await loadTransactionInput(client, toBase58(hash));
  assert.equal(result.status, "available");
  if (result.status !== "available") assert.fail();
  assert.equal(result.root.method, undefined);
  assert.deepEqual(result.requested, []);
  assert.equal(result.transactionXdr, fixture.inputXdr);
});
