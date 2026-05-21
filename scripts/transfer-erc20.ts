import { readFile } from "node:fs/promises";

import {
  HttpTransport,
  PrivateKeySigner,
  addressFromHex,
  createGroundhogClient,
  createInvocation,
  createTransaction,
  fromHex0x,
  signTransaction,
} from "@groundhogchain/client";
import {
  AuthClaimType,
  CxsWriter,
  Uint64Codec,
  bitMap,
  blockHeight,
  calldata,
  codec,
  contractEntrypointID,
  gasAmount,
  serialize,
  weight,
} from "@groundhogchain/protocol";
import type { ContractAddress, Invocation, SHA256Hash } from "@groundhogchain/protocol";
import { deriveEntrypointID } from "@groundhogchain/protocol/utils";

const DEFAULT_RPC_URL = process.env.GROUNDHOG_RPC_URL ?? "http://localhost:9545";
const DEFAULT_SPEC_PATH =
  "/home/chambaz/Work/groundhog-test/token/target/groundhog/token.spec.json";
const DEFAULT_DECIMALS = 6;
const MAX_U64 = BigInt("18446744073709551615");
const WALLET_GAS_LIMIT = gasAmount(BigInt(10_000_000));
const CALL_GAS_LIMIT = gasAmount(BigInt(500_000));
const WALLET_DO_ACTION_ENTRYPOINT_HEX = "0x19846d750fad81d6";

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.contract) {
    throw new Error("Missing required --contract 0x... argument");
  }

  const transport = new HttpTransport(DEFAULT_RPC_URL);
  const client = createGroundhogClient(transport);
  const accounts = await client.dev.getAccounts();

  const from = resolveDevAccount(accounts, options.from);
  const to = resolveDevAccount(accounts, options.to);
  const amount = parseTokenAmount(options.amount, options.decimals);
  const spec = await loadSpec(options.specPath);
  const iface = spec.interfaces[0];
  if (!iface) throw new Error("Spec does not contain any interfaces");

  const entrypoint = await deriveEntrypointID(
    iface.name,
    iface.version,
    "transfer",
  );

  const innerInvocation = createInvocation({
    invoked_address: addressFromHex(options.contract),
    entrypoint,
    gas_limit: CALL_GAS_LIMIT,
    calldata: encodeTransferCalldata(to.address, amount),
  });

  const walletInvocation = wrapInWalletInvocation(innerInvocation, from.address);
  const tip = await client.getChainTip();
  const tx = createTransaction({
    invocation: walletInvocation,
    uniquifier: {
      block_expiry_height: blockHeight(tip.height + BigInt(50)),
      nonce:
        BigInt(Date.now()) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000)),
    },
    auth_claim: {
      claim_type: AuthClaimType.kSourceAddressAuthData,
      source_address_claim: {
        allowed_keys: bitMap(BigInt(0x01)),
        required_weight: weight(BigInt(1)),
      },
    },
  });

  const signer = new PrivateKeySigner(from.privateKey);
  const signedTx = await signTransaction(tx, [{ signer, publicKeyId: BigInt(0) }]);
  const txHash = await client.sendTransaction(signedTx);

  const txHashHex = toHex(txHash);
  process.stdout.write(`Submitted ERC20 transfer\n`);
  process.stdout.write(`RPC URL: ${DEFAULT_RPC_URL}\n`);
  process.stdout.write(`Contract: ${options.contract.toLowerCase()}\n`);
  process.stdout.write(`From: ${toHex(from.address)} (${options.from})\n`);
  process.stdout.write(`To: ${toHex(to.address)} (${options.to})\n`);
  process.stdout.write(`Amount: ${options.amount}\n`);
  process.stdout.write(`Decimals: ${options.decimals}\n`);
  process.stdout.write(`Raw amount: ${amount.toString()}\n`);
  process.stdout.write(`Tx hash: ${txHashHex}\n`);
  process.stdout.write(`Explorer: http://localhost:3000/tx/${txHashHex}\n`);

  if (options.wait) {
    const receipt = await waitForReceipt(client, txHash);
    process.stdout.write(`Receipt status: ${stringifyExecStatus(receipt?.execResult)}\n`);
    if (receipt?.height != null) {
      process.stdout.write(`Receipt height: ${receipt.height.toString()}\n`);
    }
  }
}

function wrapInWalletInvocation(
  invocation: Invocation,
  walletAddress: ContractAddress,
): Invocation {
  const inner = serialize(invocation, codec.Invocation);
  const writer = new CxsWriter();
  writer.writeVarOpaque(inner, 0xffffffff);

  return {
    invoked_address: walletAddress,
    entrypoint: contractEntrypointID(fromHex0x(WALLET_DO_ACTION_ENTRYPOINT_HEX)),
    gas_limit: WALLET_GAS_LIMIT,
    calldata: calldata(writer.finish()),
  };
}

async function loadSpec(specPath: string) {
  const text = await readFile(specPath, "utf8");
  return JSON.parse(text) as {
    interfaces: Array<{ name: string; version: string }>;
  };
}

function encodeTransferCalldata(to: ContractAddress, amount: bigint) {
  const writer = new CxsWriter();
  codec.ContractAddress.encode(writer, to);
  Uint64Codec.encode(writer, amount);
  return calldata(writer.finish());
}

function parseArgs(args: string[]) {
  const options = {
    contract: "",
    from: "dev-0",
    to: "dev-1",
    amount: "1",
    decimals: DEFAULT_DECIMALS,
    specPath: DEFAULT_SPEC_PATH,
    wait: true,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case "--contract":
        options.contract = value;
        index += 1;
        break;
      case "--from":
        options.from = value;
        index += 1;
        break;
      case "--to":
        options.to = value;
        index += 1;
        break;
      case "--amount":
        options.amount = value;
        index += 1;
        break;
      case "--decimals":
        options.decimals = parseDecimals(value);
        index += 1;
        break;
      case "--spec":
        options.specPath = value;
        index += 1;
        break;
      case "--no-wait":
        options.wait = false;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parseTokenAmount(value: string, decimals: number) {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
  if (!match) {
    throw new Error("Invalid --amount. Use a positive decimal value like 1, 1.23, or 0.5.");
  }

  const whole = match[1];
  const fraction = match[2] ?? "";

  if (fraction.length > decimals) {
    throw new Error(`Invalid --amount. Token supports ${decimals} decimal place${decimals === 1 ? "" : "s"}.`);
  }

  const rawText = `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
  const rawAmount = BigInt(rawText);

  if (rawAmount > MAX_U64) {
    throw new Error("Invalid --amount. Raw amount exceeds u64 max.");
  }

  return rawAmount;
}

function parseDecimals(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error("Invalid --decimals. Use a whole number from 0 to 18.");
  }

  const decimals = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error("Invalid --decimals. Use a whole number from 0 to 18.");
  }

  return decimals;
}

function resolveDevAccount(
  accounts: Array<{ address: ContractAddress; privateKey: Uint8Array }>,
  label: string,
) {
  const match = /^dev-(\d+)$/.exec(label);
  if (!match) {
    throw new Error(`Unsupported account label ${label}. Use dev-0, dev-1, etc.`);
  }

  const index = Number.parseInt(match[1], 10);
  const account = accounts[index];
  if (!account) {
    throw new Error(`No local dev account found for ${label}`);
  }

  return account;
}

async function waitForReceipt(
  client: ReturnType<typeof createGroundhogClient>,
  txHash: SHA256Hash,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const receipt = await client.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return null;
}

function stringifyExecStatus(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value);

  const result = "result" in value ? value.result : undefined;
  if (typeof result === "string") return result;

  return JSON.stringify(value);
}

function toHex(value: Uint8Array) {
  return `0x${Buffer.from(value).toString("hex")}`;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
