import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  Ed25519Signer,
  ExecutionDecodeError,
  ExecutionReturnUnavailableError,
  FundingObservationError,
  TransactionExecutionError,
  TransactionObservationError,
  UnsupportedRpcValue,
  assertTransactionSuccess,
  createPubkeyAccount,
  createWalletClient,
  toBase58,
  toHex0x,
  type ConnectedThruputClient,
  type ExecutionResult,
  type localnet,
} from "@thruputchain/client";

export type Client = ConnectedThruputClient<ReturnType<typeof localnet>>;
type Status = "confirmed" | "failed" | "unknown";
type Role = "user" | "owner";

interface TransactionDetails {
  label: string;
  kind: "fund" | "deploy" | "mint" | "transfer";
  from?: string;
  to?: string;
  token: string;
  amount?: string;
}

interface TransactionRecord extends TransactionDetails {
  status: Status;
  hash?: string;
  error?: string;
}

export interface Manifest {
  rpcUrl: string;
  networkHash: string;
  status: "running" | "complete" | "failed";
  error?: string;
  personas: { name: string; role: Role; address: string }[];
  tokens: {
    name: string;
    symbol: string;
    decimals: number;
    address: string;
    owner: string;
  }[];
  transactions: TransactionRecord[];
}

async function writeJson(path: string, value: unknown) {
  // Replace the file atomically so readers never see a partially written manifest.
  // Mode 0600 allows only the file owner to read and write it, including private keys.
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temporary, path);
}

export async function createRun(
  rpcUrl: string,
  networkHash: string,
  parent = resolve(".seed-local-node"),
) {
  await mkdir(parent, { recursive: true, mode: 0o700 });
  // Timestamps sort chronologically; mkdtemp adds a suffix to avoid collisions.
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const directory = await mkdtemp(join(parent, `run-${timestamp}-`));
  await mkdir(join(directory, "keys"), { mode: 0o700 });
  const manifest: Manifest = {
    rpcUrl,
    networkHash,
    status: "running",
    personas: [],
    tokens: [],
    transactions: [],
  };
  // Keep the last confirmed height in memory for balance reads, not in the public manifest.
  const run = { directory, manifest, latestBlockHeight: 0n };
  await saveRun(run);
  return run;
}

export type Run = Awaited<ReturnType<typeof createRun>>;

export function saveRun(run: Run) {
  return writeJson(join(run.directory, "manifest.json"), run.manifest);
}

export async function createPersona(client: Client, run: Run, name: string, role: Role) {
  const seed = randomBytes(32);
  // Derive the account locally from its signer. Funding happens later through the faucet.
  const account = createPubkeyAccount({ signer: Ed25519Signer.fromSeed(seed) });
  const address = toBase58(account.address);
  // Persist signing material separately; only public identity goes in the manifest.
  await writeJson(join(run.directory, "keys", `${address}.json`), {
    seed: toHex0x(seed),
    accountNonce: account.nonce.toString(),
    address,
  });
  run.manifest.personas.push({ name, role, address });
  await saveRun(run);
  // Bind the signer once and reuse this wallet client for all of the persona's calls.
  const wallet = createWalletClient({ client, account });
  return { name, address, account, wallet };
}

export type Persona = Awaited<ReturnType<typeof createPersona>>;

function receiptFor(error: unknown) {
  if (
    error instanceof TransactionExecutionError ||
    error instanceof ExecutionDecodeError ||
    error instanceof ExecutionReturnUnavailableError
  ) {
    return error.receipt;
  }
}

function statusFor(error: unknown): Status {
  if (error instanceof FundingObservationError) return statusFor(error.cause);
  // An SDK decoding error can follow successful execution. Prefer the receipt's outcome.
  const execution = receiptFor(error)?.execution;
  if (execution && !(execution instanceof UnsupportedRpcValue)) {
    return execution.result === "return" ? "confirmed" : "failed";
  }
  if (error instanceof TransactionObservationError && error.phase === "beforeSubmission") {
    return "failed";
  }
  // A missing hash does not prove that nothing was sent.
  return "unknown";
}

function hashFor(error: unknown) {
  // An observation failure can still identify a submitted transaction for later inspection.
  if (error instanceof TransactionObservationError) return error.transactionHash;
  if (error instanceof FundingObservationError) {
    const response = error.lastResponse;
    return (
      error.knownCommitment?.transactionHash ??
      (response && !(response instanceof UnsupportedRpcValue)
        ? response.transactionHash
        : undefined)
    );
  }
  return receiptFor(error)?.transactionHash;
}

interface FundingResult {
  hash: Uint8Array;
  blockHeight: bigint;
  amount: string;
}

/** Record a single operation; the SDK handles submission and confirmation. */
export async function record(
  run: Run,
  details: TransactionDetails,
  submit: () => Promise<ExecutionResult | FundingResult>,
) {
  // Persist intent before the call. If the process stops, leave the outcome as unknown.
  const transaction: TransactionRecord = { ...details, status: "unknown" };
  run.manifest.transactions.push(transaction);
  await saveRun(run);
  console.log(`${String(run.manifest.transactions.length).padStart(3, "0")} ${details.label}`);
  try {
    // Invoke once. A timeout is not permission to repeat an operation that may have executed.
    const result = await submit();
    if ("receipt" in result) {
      transaction.hash = toBase58(result.transactionHash);
      // Inclusion in a block alone is not success: execution must have returned normally.
      assertTransactionSuccess(result.receipt);
      run.latestBlockHeight = result.receipt.blockHeight;
    } else {
      transaction.hash = toBase58(result.hash);
      transaction.amount = result.amount;
      run.latestBlockHeight = result.blockHeight;
    }
    transaction.status = "confirmed";
  } catch (error) {
    transaction.status = statusFor(error);
    transaction.error = error instanceof Error ? error.message : String(error);
    const hash = hashFor(error);
    if (hash) transaction.hash = toBase58(hash);
    throw error;
  } finally {
    await saveRun(run);
  }
}
