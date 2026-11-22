import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  createPubkeyAccount,
  Ed25519Signer,
  formatUnits,
  hashFromBase58,
  localnet,
  networkHash,
  parseUnits,
  toBase58,
  type ContractAddress,
} from "@thruputchain/client";
import {
  createOutputDirectory,
  loadArtifacts,
  withScenario,
  type RunReport,
  type Scenario,
  type ScenarioArtifact,
} from "@thruputchain/testkit";
import { ERC20, ERC20Metadata } from "@thruputchain/client/contracts";
import { gasAmount, NATIVE_TOKEN_ADDRESS } from "@thruputchain/protocol";
import { mintAmount, nativeTransfers, tokens, transfers, userNames } from "./config";

const NATIVE_TOKEN_DECIMALS = 7;
const callGas = gasAmount(500_000n);
const walletGas = gasAmount(1_000_000n);
const deploymentGas = gasAmount(10_000_000n);
// Storage funding is separate from gas limits.
const storageFunding = parseUnits("2", NATIVE_TOKEN_DECIMALS);
const wait = { timeoutMs: 30_000 };
type SeedScenario = Scenario<ReturnType<typeof localnet>>;
type Token = (typeof tokens)[number] & { address: ContractAddress };

const ownerName = (symbol: string) => `${symbol} Owner`;

async function main() {
  const { values } = parseArgs({
    options: {
      "rpc-url": {
        type: "string",
        default: process.env.THRUPUT_RPC_URL ?? "http://127.0.0.1:9545",
      },
      "network-hash": {
        type: "string",
        default: process.env.THRUPUT_NETWORK_HASH ?? toBase58(localnet().networkHash!),
      },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: pnpm seed:local [--rpc-url URL] [--network-hash BASE58]\n" +
        "Default: THRUPUT_RPC_URL or http://127.0.0.1:9545\n" +
        "Network: THRUPUT_NETWORK_HASH or the default local network identity\n" +
        "Edit config.ts for scenario settings. Results go to .seed-local-node/.",
    );
    return;
  }
  await seedLocalNode(values["rpc-url"], values["network-hash"]);
}

export async function seedLocalNode(rpcUrl: string, expectedNetworkHash: string, parent?: string) {
  const cluster = localnet({
    rpcUrl,
    networkHash: networkHash(hashFromBase58(expectedNetworkHash)),
  });
  const { token } = await loadArtifacts({
    token: new URL("./contracts/erc20.rv32a", import.meta.url),
  });
  const directory = await createOutputDirectory(parent ?? resolve(".seed-local-node"));
  const runDirectory = join(directory, "transactions");
  console.log(`Run: ${directory}`);
  // Disposable local accounts. Keys are not saved: a failed run starts again with fresh accounts.
  const names = [...userNames, ...tokens.map((token) => ownerName(token.symbol))];
  const accounts = Object.fromEntries(
    names.map((name) => [
      name,
      createPubkeyAccount({ signer: Ed25519Signer.fromSeed(randomBytes(32)) }),
    ]),
  );
  try {
    const report = await withScenario(
      { network: { cluster }, accounts, runDirectory },
      async (scenario) => {
        console.log("\nWallets:");
        for (const [name, address] of Object.entries(scenario.run.report().actors))
          console.log(`${name}: ${address}`);
        try {
          // Dependent operations await confirmation. The report records every hash, including funding.
          await fundAll(scenario, names);
          const deployed = await deployTokens(scenario, token);
          await mintTokens(scenario, deployed);
          await sendTransfers(
            scenario,
            NATIVE_TOKEN_ADDRESS,
            "native",
            NATIVE_TOKEN_DECIMALS,
            nativeTransfers,
          );
          for (const token of deployed) {
            await sendTransfers(scenario, token.address, token.symbol, token.decimals, transfers);
          }
          await scenario.run.step("verify-balances", () => checkBalances(scenario, deployed));
          console.log(
            `\nComplete: ${names.length} wallets, ${deployed.length} tokens. Balances and supplies verified.`,
          );
          return scenario.run.report();
        } finally {
          printSummary(scenario.run.report(), runDirectory);
        }
      },
    );
    return { directory, report };
  } catch (error) {
    // A run that stopped before its first step has no report to inspect.
    if (existsSync(join(directory, "transactions", "report.json")))
      console.error(
        `Stopped. Run files: ${directory}. Inspect original transactions before retrying.`,
      );
    throw error;
  }
}

async function fundAll(scenario: SeedScenario, names: readonly string[]) {
  console.log("\nFaucet transactions:");
  for (const name of names) {
    const actor = scenario.actor(name);
    await scenario.run.step(
      `fund/${name}`,
      async () => {
        // The faucet chooses the amount. fund waits for successful execution.
        const result = await actor.fund({ timeoutMs: wait.timeoutMs });
        console.log(
          `${name}: ${toBase58(result.transactionHash)} (${formatUnits(result.rawAmount, NATIVE_TOKEN_DECIMALS)} native)`,
        );
      },
      { metadata: { recipient: toBase58(actor.account.address), token: "native" } },
    );
  }
}

async function deployTokens(scenario: SeedScenario, artifact: ScenarioArtifact) {
  const deployed: Token[] = [];
  for (const token of tokens) {
    const owner = scenario.actor(ownerName(token.symbol));
    const deployment = artifact.prepare(owner.account.address);
    const { name, symbol, decimals } = token;
    await scenario.run.step(
      `deploy/${symbol}`,
      () =>
        owner.deploy(deployment, {
          gasLimit: deploymentGas,
          amount: storageFunding,
          wait,
          // Deployment, storage funding, and initialization succeed or fail together.
          initializer: ERC20Metadata.v0_1.initialize.call({
            address: deployment.address,
            gasLimit: callGas,
            args: {
              administrator: owner.account.address,
              name,
              symbol,
              decimals: BigInt(decimals),
            },
          }),
        }),
      // The predicted address is saved before deployment, so a failed run still shows it.
      { metadata: { name, symbol, decimals, address: toBase58(deployment.address) } },
    );
    deployed.push({ ...token, address: deployment.address });
  }
  return deployed;
}

async function mintTokens(scenario: SeedScenario, deployed: Token[]) {
  for (const { symbol, decimals, address } of deployed) {
    for (const name of userNames) {
      const receiver = scenario.actor(name).account.address;
      await scenario.run.step(
        `mint/${symbol}/${name}`,
        // The owner signs minting calls because it is the token's administrator.
        () =>
          scenario.actor(ownerName(symbol)).call(
            [
              ERC20.v0_1.mint.call({
                address,
                gasLimit: callGas,
                // Convert display units to bigint base units without floating-point arithmetic.
                args: { receiver, amount: parseUnits(mintAmount, decimals) },
              }),
            ],
            { gasLimit: walletGas, wait },
          ),
        { metadata: { recipient: toBase58(receiver), token: symbol, amount: mintAmount } },
      );
    }
  }
}

async function sendTransfers(
  scenario: SeedScenario,
  address: ContractAddress,
  symbol: string,
  decimals: number,
  transfers: readonly { from: string; to: string; amount: string }[],
) {
  for (const [index, transfer] of transfers.entries()) {
    const receiver = scenario.actor(transfer.to).account.address;
    // Sequence numbers keep repeated transfers distinct in the report.
    await scenario.run.step(
      `transfer/${symbol}/${index + 1}`,
      () =>
        scenario.actor(transfer.from).call(
          [
            ERC20.v0_1.transfer.call({
              address,
              gasLimit: callGas,
              args: { receiver, amount: parseUnits(transfer.amount, decimals) },
            }),
          ],
          { gasLimit: walletGas, wait },
        ),
      {
        metadata: { recipient: toBase58(receiver), token: symbol, amount: transfer.amount },
      },
    );
  }
}

// Expectations come from configuration, independently of transaction results.
export function expectedBalances(decimals: number) {
  const balances = Object.fromEntries(
    userNames.map((name) => [name, parseUnits(mintAmount, decimals)]),
  );
  for (const transfer of transfers) {
    const amount = parseUnits(transfer.amount, decimals);
    balances[transfer.from] -= amount;
    balances[transfer.to] += amount;
  }
  return balances;
}

async function checkBalances(scenario: SeedScenario, deployed: Token[]) {
  for (const { symbol, decimals, address } of deployed) {
    const expected = expectedBalances(decimals);
    // Testkit carries confirmed heights from all actors into these reads.
    for (const name of userNames) {
      const { value } = await scenario.view(
        ERC20.v0_1.getBalanceOf.viewRequest({
          address,
          args: { addr: scenario.actor(name).account.address },
        }),
      );
      if (value !== expected[name]) {
        throw new Error(`${name} ${symbol}: expected ${expected[name]} base units, got ${value}`);
      }
    }
    const supply = await scenario.view(ERC20.v0_1.totalSupply.viewRequest({ address }));
    const expectedSupply = parseUnits(mintAmount, decimals) * BigInt(userNames.length);
    if (supply.value !== expectedSupply)
      throw new Error(`${symbol} supply: expected ${expectedSupply}, got ${supply.value}`);
  }
}

function printSummary(report: RunReport, directory: string) {
  console.log(`\nReport: ${join(directory, "report.json")}`);
  console.log("\nContracts (predicted addresses; check deployment outcomes):");
  for (const step of report.steps.filter((step) => step.name.startsWith("deploy/"))) {
    console.log(`${step.metadata?.symbol}: ${step.metadata?.address}`);
  }
  console.log("\nTransactions:");
  for (const attempt of report.attempts) {
    console.log(
      `${attempt.step} (${attempt.actor}, ${attempt.outcome}): ${attempt.transactionHash ?? "no hash recorded"}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
