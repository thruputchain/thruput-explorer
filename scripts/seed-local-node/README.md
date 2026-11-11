# Seed a local Thruput node

A TypeScript example using the public Thruput client and typed ERC20 bindings.
Each persona has one signing key, account, and wallet client for the whole run.

## Usage

Install dependencies with `pnpm install` (Node.js 22.12+), start a local node in
another terminal, then run:

```sh
pnpm seed:local
pnpm seed:local --rpc-url http://127.0.0.1:19545
```

The script connects to an existing node. It does not start one. The default RPC
is `http://127.0.0.1:9545`; `THRUPUT_RPC_URL` also sets it. `--rpc-url` takes
precedence. The URL is passed directly to the SDK. Use `--help` for a summary.

## Configuration

Edit `config.ts` to set users, tokens, mint amounts, and transfers:

```ts
{ from: "Alice", to: "Bob", amount: "125" }
```

Use unique user names and token symbols. Amounts are display-unit strings. They
must fit each token's decimals and the sender's balance. The faucet controls
native-token funding amounts.

The default scenario funds six personas, deploys three tokens, mints to the users,
transfers native tokens, then transfers ERC20 tokens. It checks final balances and
total supplies before printing addresses and all 30 transaction hashes.
Each token ends with Alice holding 885, Bob 1,085, and Carol 1,030.

## Output

Each run creates `.seed-local-node/run-<timestamp>-<suffix>/` with:

- `manifest.json`: network, persona and token addresses, transaction records, and errors.
- `keys/<address>.json`: private signing seeds in owner-only files. Keep these private.

Transaction amounts are display-unit strings; `from` and `to` are addresses, and
`token` is a symbol or `native`. Status is `confirmed`, `failed`, or `unknown`.
An interrupted operation is also left as `unknown`. A missing hash does not prove
that nothing was sent. Inspect a known hash on the original node with:

```sh
thruput tx show HASH --rpc-url http://127.0.0.1:9545 --json
```

Progress is saved between steps. The script does not retry or resume. Running it
again creates fresh accounts and contracts. A crash can leave an unknown operation
without a hash; this example does not save pre-broadcast transaction evidence.

`index.ts` contains the scenario steps. `run.ts` handles keys, output, and recording.
Tests run with `pnpm test`. The included `contracts/erc20.rv32a` uses the Apache-2.0
[upstream ERC20 implementation](https://github.com/thruputchain/thruput-examples/tree/8e2683d32c714f9845a516aa799b5748e3d5f0df/contracts/erc20).
