import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  createThruputClient,
  formatUnits,
  localnet,
  parseUnits,
  prepareContractDeployment,
  toBase58,
  type ContractDeployment,
} from "@thruputchain/client";
import { ERC20, ERC20Metadata } from "@thruputchain/client/contracts";
import { gasAmount, NATIVE_TOKEN_ADDRESS } from "@thruputchain/protocol";
import { mintAmount, nativeTransfers, tokens, transfers, userNames } from "./config";
import {
  createPersona,
  createRun,
  record,
  saveRun,
  type Client,
  type Persona,
  type Run,
} from "./run";

const NATIVE_TOKEN_DECIMALS = 7;
const callGas = gasAmount(500_000n); // Limits the inner ERC20 call.
const walletGas = gasAmount(1_000_000n); // Limits the wallet root and its inner call.
const deploymentGas = gasAmount(10_000_000n); // Limits deployment, funding, and initialization.
// Storage funding moves native tokens to the contract; it is separate from gas limits.
const storageFunding = parseUnits("2", NATIVE_TOKEN_DECIMALS);
const wait = { timeoutMs: 30_000 };

interface Asset {
  name: string;
  symbol: string;
  decimals: number;
  owner: Persona;
  deployment: ContractDeployment;
}

async function main() {
  const { values } = parseArgs({
    options: {
      "rpc-url": {
        type: "string",
        default: process.env.THRUPUT_RPC_URL ?? "http://127.0.0.1:9545",
      },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: pnpm seed:local [--rpc-url URL]\n" +
        "Default: THRUPUT_RPC_URL or http://127.0.0.1:9545\n" +
        "Edit config.ts for scenario settings. Results go to .seed-local-node/.",
    );
    return;
  }
  const rpcUrl = values["rpc-url"];
  const artifact = await readFile(new URL("./contracts/erc20.rv32a", import.meta.url));
  // Connect to the existing node and discover its network identity before signing anything.
  const client = await createThruputClient({ cluster: localnet({ rpcUrl }) });
  const run = await createRun(rpcUrl, toBase58(client.network.networkHash));
  console.log(`Run: ${run.directory}`);
  try {
    // Await each step: later operations depend on earlier transactions being confirmed.
    const users = await createUsers(client, run);
    const assets = await createTokenOwners(client, run, artifact);
    await fundAll(run, [...users, ...assets.map((asset) => asset.owner)]);
    await deployTokens(run, assets);
    await mintTokens(run, assets, users);
    await sendNativeTokens(run, users);
    await sendTokens(run, assets, users);
    await checkBalances(client, run, assets, users);
    run.manifest.status = "complete";
    await saveRun(run);
    printSummary(run);
  } catch (error) {
    run.manifest.status = "failed";
    run.manifest.error = error instanceof Error ? error.message : String(error);
    await saveRun(run);
    console.error(`Stopped. Inspect ${run.directory}/manifest.json before retrying.`);
    throw error;
  }
}

async function createUsers(client: Client, run: Run) {
  const users: Persona[] = [];
  for (const name of userNames) {
    users.push(await createPersona(client, run, name, "user"));
  }
  return users;
}

async function createTokenOwners(client: Client, run: Run, artifact: Uint8Array) {
  const assets: Asset[] = [];
  for (const token of tokens) {
    const owner = await createPersona(client, run, `${token.symbol} Owner`, "owner");
    // Reuse the artifact, but prepare a distinct deployment and predicted address per token.
    // This is local preparation; deployTokens submits the actual transactions.
    const deployment = prepareContractDeployment({
      deployer: owner.account.address,
      contract: artifact,
    });
    assets.push({ ...token, owner, deployment });
  }
  return assets;
}

async function fundAll(run: Run, personas: Persona[]) {
  for (const persona of personas) {
    await record(
      run,
      {
        label: `Fund ${persona.name}`,
        kind: "fund",
        to: persona.address,
        token: "native",
      },
      async () => {
        // The faucet chooses the amount. requestAirdrop waits for successful execution.
        const result = await persona.wallet.requestAirdrop(wait);
        // Adapt the faucet response to record(), keeping the amount in display units.
        return {
          hash: result.transactionHash,
          blockHeight: result.blockHeight,
          amount: formatUnits(result.rawAmount, NATIVE_TOKEN_DECIMALS),
        };
      },
    );
  }
}

async function deployTokens(run: Run, assets: Asset[]) {
  for (const { name, symbol, decimals, owner, deployment } of assets) {
    // Save the predicted address even if confirmation fails. The transaction status
    // tells readers whether deployment was confirmed.
    run.manifest.tokens.push({
      name,
      symbol,
      decimals,
      address: toBase58(deployment.address),
      owner: owner.address,
    });
    await record(
      run,
      {
        label: `${owner.name} deploys ${symbol}`,
        kind: "deploy",
        from: owner.address,
        token: symbol,
      },
      // Deployment, native-token funding, and initialization succeed or fail together.
      () =>
        owner.wallet.deployContractAndWait(
          deployment,
          {
            gasLimit: deploymentGas,
            amount: storageFunding,
            initializer: ERC20Metadata.v0_1.initialize.invocation(deployment.address, callGas, {
              administrator: owner.account.address,
              name,
              symbol,
              decimals: BigInt(decimals),
            }),
          },
          wait,
        ),
    );
  }
}

async function mintTokens(run: Run, assets: Asset[], users: Persona[]) {
  for (const { symbol, decimals, owner, deployment } of assets) {
    for (const user of users) {
      // The owner signs minting calls because it is the token's administrator.
      // invocation() encodes the inner call; executeAndWait wraps it in a wallet transaction.
      await record(
        run,
        {
          label: `${owner.name} mints ${mintAmount} ${symbol} to ${user.name}`,
          kind: "mint",
          from: owner.address,
          to: user.address,
          token: symbol,
          amount: mintAmount,
        },
        () =>
          owner.wallet.executeAndWait(
            {
              invocation: ERC20.v0_1.mint.invocation(deployment.address, callGas, {
                receiver: user.account.address,
                // Convert display units to bigint base units without floating-point arithmetic.
                amount: parseUnits(mintAmount, decimals),
              }),
              gasLimit: walletGas,
            },
            wait,
          ),
      );
    }
  }
}

async function sendNativeTokens(run: Run, users: Persona[]) {
  // The native token exposes the same ERC20 transfer interface as the deployed tokens.
  const byName = Object.fromEntries(users.map((user) => [user.name, user]));
  for (const transfer of nativeTransfers) {
    const sender = byName[transfer.from];
    const receiver = byName[transfer.to];
    await record(
      run,
      {
        label: `${sender.name} sends ${transfer.amount} native tokens to ${receiver.name}`,
        kind: "transfer",
        from: sender.address,
        to: receiver.address,
        token: "native",
        amount: transfer.amount,
      },
      () =>
        sender.wallet.executeAndWait(
          {
            invocation: ERC20.v0_1.transfer.invocation(NATIVE_TOKEN_ADDRESS, callGas, {
              receiver: receiver.account.address,
              amount: parseUnits(transfer.amount, NATIVE_TOKEN_DECIMALS),
            }),
            gasLimit: walletGas,
          },
          wait,
        ),
    );
  }
}

async function sendTokens(run: Run, assets: Asset[], users: Persona[]) {
  const byName = Object.fromEntries(users.map((user) => [user.name, user]));
  for (const { symbol, decimals, deployment } of assets) {
    for (const transfer of transfers) {
      const sender = byName[transfer.from];
      const receiver = byName[transfer.to];
      // Use the sender's existing wallet: the contract debits the caller's balance.
      await record(
        run,
        {
          label: `${sender.name} sends ${transfer.amount} ${symbol} to ${receiver.name}`,
          kind: "transfer",
          from: sender.address,
          to: receiver.address,
          token: symbol,
          amount: transfer.amount,
        },
        () =>
          sender.wallet.executeAndWait(
            {
              invocation: ERC20.v0_1.transfer.invocation(deployment.address, callGas, {
                receiver: receiver.account.address,
                amount: parseUnits(transfer.amount, decimals),
              }),
              gasLimit: walletGas,
            },
            wait,
          ),
      );
    }
  }
}

// Calculate expectations from configuration alone, independently of transaction results.
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

async function checkBalances(client: Client, run: Run, assets: Asset[], users: Persona[]) {
  for (const { symbol, decimals, deployment } of assets) {
    const expected = expectedBalances(decimals);
    // Views do not submit transactions. Require a snapshot that includes our last write
    // so an older node snapshot cannot cause a false balance mismatch.
    const view = {
      client,
      address: deployment.address,
      minStateBlockHeight: run.latestBlockHeight,
    };
    for (const user of users) {
      const { value } = await ERC20.v0_1.getBalanceOf.view({
        ...view,
        args: { addr: user.account.address },
      });
      if (value !== expected[user.name]) {
        throw new Error(
          `${user.name} ${symbol}: expected ${expected[user.name]} base units, got ${value}`,
        );
      }
    }
    // Transfers redistribute tokens; only minting changes the expected total supply.
    const supply = await ERC20.v0_1.totalSupply.view(view);
    const expectedSupply = parseUnits(mintAmount, decimals) * BigInt(users.length);
    if (supply.value !== expectedSupply) {
      throw new Error(`${symbol} supply: expected ${expectedSupply}, got ${supply.value}`);
    }
  }
}

function printSummary(run: Run) {
  const { personas, tokens: assets, transactions } = run.manifest;
  console.log(
    `\nComplete: ${personas.length} personas, ${assets.length} tokens, ` +
      `${transactions.length} transactions.`,
  );
  console.log(`Manifest: ${run.directory}/manifest.json`);
  for (const entry of [...personas, ...assets]) {
    console.log(`${entry.name}: ${entry.address}`);
  }
  console.log("\nTransactions:");
  for (const transaction of transactions) {
    console.log(`${transaction.label}: ${transaction.hash}`);
  }
}

// Run only when invoked directly; tests import expectedBalances without contacting a node.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
