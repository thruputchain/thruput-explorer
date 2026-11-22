# Seed a local Thruput node

A TypeScript workflow using [`@thruputchain/testkit`](https://www.npmjs.com/package/@thruputchain/testkit)
and the SDK's typed ERC20 bindings.
Each wallet is a named scenario actor with a disposable account, such as `Alice` or
`tUSD Owner`.

## Usage

Install dependencies with `pnpm install` (Node.js 22.12+), start a local node in
another terminal, then run:

```sh
pnpm seed:local
pnpm seed:local --rpc-url http://127.0.0.1:19545
pnpm seed:local --network-hash BASE58
```

The script connects to an existing node. It does not start one. The default RPC
is `http://127.0.0.1:9545`; `THRUPUT_RPC_URL` also sets it. `--rpc-url` takes
precedence. The expected network hash defaults to the standard local identity.
For a custom local chain, set `THRUPUT_NETWORK_HASH` or `--network-hash` to its
trusted expected hash. Testkit validates it before funding or signing. Use
`--help` for a summary.

## Configuration

Edit `config.ts` to set users, tokens, mint amounts, and transfers:

```ts
{ from: "Alice", to: "Bob", amount: "125" }
```

Use unique user names and token symbols. Amounts are display-unit strings. They
must fit each token's decimals and the sender's balance. The faucet controls
native-token funding amounts.

The default scenario funds six wallets, deploys three tokens, mints to the users,
transfers native tokens, then transfers ERC20 tokens. It checks final balances and
total supplies. Terminal output includes wallet and contract addresses and all 30
transaction hashes.
Each token ends with Alice holding 885, Bob 1,085, and Carol 1,030.

## Output

Each run creates `.seed-local-node/run-<timestamp>-<suffix>/` with:

- `transactions/report.json`: public step metadata, attempts, execution outcomes, and receipts.
- `transactions/evidence/`: owner-only signed transaction evidence saved before dispatch.

The testkit report is the public record; there is no separate explorer manifest.
`actors` maps names to wallet addresses. Deployment steps contain token names,
symbols, decimals, and predicted contract addresses. Each attempt links to its actor
and step and includes its execution outcome, and its hash when known. Committed
signed attempts (deploy and call) also include their receipt. Transfer and mint
step metadata contains the recipient address, token symbol, and display
amount. The final `verify-balances` step must be `completed` for a successful run.

Copy values from the terminal, or extract them from the report with `jq`:

```sh
report=.seed-local-node/run-REPLACE-ME/transactions/report.json
jq -r '.actors | to_entries[] | "\(.key): \(.value)"' "$report"
jq -r '.steps[] | select(.name | startswith("deploy/")) | .metadata | "\(.symbol): \(.address)"' "$report"
jq -r '.attempts[] | "\(.step) (\(.outcome)): \(.transactionHash // "no hash recorded")"' "$report"
```

Check the deployment outcome before using a predicted address. Outcomes are
`succeeded`, `failed`, `notSubmitted`, or `unknown`. A failed step can contain a
successful transaction. A missing hash does not prove that nothing was sent.
Inspect a known hash on the original node with:

```sh
thruput tx show HASH --rpc-url http://127.0.0.1:9545 --json
```

Progress is saved between steps. The script does not retry or resume. Running it
again creates fresh accounts and contracts. The report saves all 30 transaction
hashes: six faucet requests and 24 wallet transactions. For wallet transactions,
testkit also saves signed evidence before dispatch. The run does not sign faucet
requests, so they have only a hash. If a send response is lost, the seed observes
the signed transaction instead of sending it again. `reconcileRun("<run>/transactions", client)`
observes all original attempts without another submission. If a faucet request has
no hash, call the faucet's `requestAirdropAttempt` with the `clientNonce` saved in
its intent, never a new nonce: a new nonce can fund twice. Each observation
includes the latest known outcome; the saved report stays unchanged.

`index.ts` contains the scenario and prints values from testkit's report. Testkit
records steps and transaction evidence, and handles outcomes and confirmed-height reads.

The script does not save private keys. Accounts exist only for one run on a
disposable local node, and a failed run is repeated with fresh accounts. The report
keeps every address and hash, and reconciliation needs no keys.

Tests run with `pnpm test`.

`pnpm test:seed:integration` requires Linux and CLI 0.48.0 or newer, with its devnode's
runtime libraries. It seeds an isolated node and verifies the report and terminal
output. It then loses every send response: the seed observes each transaction
without another submission, and reconciliation finds the same transactions. It closes the test node.

The included `contracts/erc20.rv32a` uses the Apache-2.0
[upstream ERC20 implementation](https://github.com/thruputchain/thruput-examples/tree/8e2683d32c714f9845a516aa799b5748e3d5f0df/contracts/erc20).
