import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  MockTransport,
  createThruputClient,
  toBase58,
} from "@thruputchain/client";
import { hashContract } from "@thruputchain/client/contract";
import { codec, ContractType, serialize } from "@thruputchain/protocol";
import { loadContractSpec } from "./contract-spec";

const address = new Uint8Array(32).fill(7);

// Counter built by the candidate Rust v6 writer; tests consume its complete envelope.
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

test("current-spec previews preserve event identity and expose malformed matches", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(client, "getContractDeployment", async () => ({
    address,
    stateBlockHeight: 42n,
    deployment: { hash: contractHash, size: artifact.length, contractType: 3 },
  }));
  t.mock.method(client, "getContractArtifact", async () => ({
    hash: contractHash,
    contractXdr: serialize(contract, codec.Contract),
  }));
  const signature = new Uint8Array(
    Buffer.from(
      "f0c8fa264c489d9d6bc8796daa7d6ab408d76b37ef41b6d6d951e20f63d10f52",
      "hex",
    ),
  );
  const topic = new Uint8Array(32);
  topic[31] = 42;
  const entry = {
    transactionHash: address,
    blockHeight: 40n,
    sequenceNumber: 0,
    event: { address, topics: [signature, topic], data: new Uint8Array() },
  };
  const result = await loadContractSpec(
    client,
    toBase58(address),
    Promise.resolve([
      entry,
      {
        ...entry,
        sequenceNumber: 1,
        event: { ...entry.event, topics: [signature] },
      },
      {
        ...entry,
        sequenceNumber: 2,
        event: { ...entry.event, topics: [new Uint8Array(32)] },
      },
    ]),
  );
  assert.equal(result.status, "available");
  if (result.status !== "available") assert.fail("Expected metadata");
  assert.equal(result.metadata, "spec");
  assert.equal(result.name, "Counter");
  assert.ok(
    result.methods.some(
      (method) =>
        method.name === "increment" &&
        method.parameters === "amount: u64" &&
        method.returns === "void" &&
        method.effect === "",
    ),
  );
  assert.deepEqual(
    result.errors.map((error) => ({
      name: error.name,
      members: error.members,
    })),
    [{ name: "CounterError", members: ["NotAuthorized = 1"] }],
  );
  assert.deepEqual(result.events, [
    { name: "PingEvent", fields: "tag: u64 [indexed]" },
  ]);
  assert.equal(result.eventPreviews.length, 2);
  for (const preview of result.eventPreviews) {
    assert.equal(preview.hash, toBase58(contractHash));
    assert.equal(preview.stateBlockHeight, "42");
  }
  assert.equal(result.eventPreviews[0].status, "decoded");
  if (result.eventPreviews[0].status === "decoded")
    assert.equal(result.eventPreviews[0].values[0].value, "42");
  assert.equal(result.eventPreviews[1].status, "invalid");
});

test("contract spec loader preserves snapshot absence", async () => {
  const client = await createThruputClient({ transport: new MockTransport() });
  assert.deepEqual(await loadContractSpec(client, toBase58(address)), {
    status: "notDeployed",
    stateBlockHeight: "0",
  });
});

test("unavailable artifact does not become an absent deployment", async (t) => {
  const client = await createThruputClient({ transport: new MockTransport() });
  t.mock.method(client, "getContractDeployment", async () => ({
    address,
    stateBlockHeight: 42n,
    deployment: { hash: address, size: 100, contractType: 3 },
  }));
  const result = await loadContractSpec(client, toBase58(address));
  assert.equal(result.status, "unavailable");
});
