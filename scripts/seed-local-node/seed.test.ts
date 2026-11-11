import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  Ed25519Signer,
  FundingObservationError,
  TransactionExecutionError,
  TransactionObservationError,
  createPubkeyAccount,
  createThruputClient,
  localnet,
  toBase58,
  type SubmissionEvidence,
  type TransactionReceipt,
} from "@thruputchain/client";
import { MockTransport } from "@thruputchain/client/transport";
import { expectedBalances } from "./index";
import { createPersona, createRun, record, type Manifest } from "./run";

const evidence: SubmissionEvidence = {
  transactionHash: new Uint8Array(32).fill(1),
  networkHash: new Uint8Array(32),
  signedTransaction: new Uint8Array([1, 2, 3]),
};
const details = {
  label: "Alice sends tokens to Bob",
  kind: "transfer" as const,
  from: "alice",
  to: "bob",
  token: "tUSD",
  amount: "125",
};

async function fixture(t: TestContext) {
  const parent = await mkdtemp(join(tmpdir(), "seed-test-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const run = await createRun("http://127.0.0.1:9545", toBase58(evidence.networkHash), parent);
  const readManifest = async (): Promise<Manifest> =>
    JSON.parse(await readFile(join(run.directory, "manifest.json"), "utf8"));
  return { run, readManifest };
}

test("records a committed abort as failed with its hash", async (t) => {
  const { run, readManifest } = await fixture(t);
  const receipt: TransactionReceipt = {
    transactionHash: evidence.transactionHash,
    blockHeight: 7n,
    execution: { result: "abort", abortData: new Uint8Array([1]) },
    events: [],
    gasUsed: 10n,
  };
  await assert.rejects(
    record(run, details, async () => {
      throw new TransactionExecutionError(receipt, evidence);
    }),
    TransactionExecutionError,
  );
  const transaction = (await readManifest()).transactions[0];
  assert.equal(transaction.status, "failed");
  assert.equal(transaction.hash, toBase58(evidence.transactionHash));
  assert.ok(transaction.error);
});

test("preserves unknown transaction and funding outcomes without retrying", async (t) => {
  const { run, readManifest } = await fixture(t);
  const errors = [
    new TransactionObservationError(
      evidence,
      new Error("Connection lost"),
      undefined,
      undefined,
      "observation",
    ),
    new FundingObservationError(
      {
        recipient: new Uint8Array(32),
        clientNonce: new Uint8Array(16),
        networkHash: evidence.networkHash,
      },
      {
        attemptStatus: "pending",
        recipient: new Uint8Array(32),
        rawAmount: 100000000n,
        retryAfterSeconds: 1n,
        transactionHash: evidence.transactionHash,
      },
      new Error("Observation timeout"),
    ),
  ];
  let calls = 0;
  for (const error of errors) {
    await assert.rejects(
      record(run, details, async () => {
        calls++;
        throw error;
      }),
      (caught) => caught === error,
    );
  }
  assert.equal(calls, errors.length);
  for (const transaction of (await readManifest()).transactions) {
    assert.equal(transaction.status, "unknown");
    assert.equal(transaction.hash, toBase58(evidence.transactionHash));
  }
});

test("keeps recoverable persona keys private and out of the manifest", async (t) => {
  const { run, readManifest } = await fixture(t);
  const client = await createThruputClient({
    cluster: localnet(),
    transport: new MockTransport(),
  });
  const persona = await createPersona(client, run, "Alice", "user");
  const keyPath = join(run.directory, "keys", `${persona.address}.json`);
  const key = JSON.parse(await readFile(keyPath, "utf8"));
  const restored = createPubkeyAccount({
    signer: Ed25519Signer.fromSeed(Buffer.from(key.seed.slice(2), "hex")),
    nonce: BigInt(key.accountNonce),
  });
  assert.equal(toBase58(restored.address), persona.address);
  assert.equal(persona.wallet.account, persona.account);
  assert.deepEqual((await readManifest()).personas, [
    {
      name: "Alice",
      address: persona.address,
      role: "user",
    },
  ]);
  assert.equal(
    (await readFile(join(run.directory, "manifest.json"), "utf8")).includes(key.seed),
    false,
  );
  assert.deepEqual((await readdir(run.directory)).sort(), ["keys", "manifest.json"]);
  if (process.platform !== "win32") {
    assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    assert.equal((await stat(run.directory)).mode & 0o777, 0o700);
  }
});

test("calculates expected balances from the configured mint and transfer amounts", () => {
  assert.deepEqual(expectedBalances(0), { Alice: 885n, Bob: 1085n, Carol: 1030n });
  assert.deepEqual(expectedBalances(6), {
    Alice: 885000000n,
    Bob: 1085000000n,
    Carol: 1030000000n,
  });
});
