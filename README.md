# Groundhog Transaction Explorer

Transaction explorer for Groundhog local nodes and Devnet. The app focuses on transaction lookup, public receipt/status data, decoded token transfer events, and useful placeholders for RPC surfaces that are still evolving.

## Prerequisites

- Node.js 22.12+
- pnpm 10.33.4+
- GitHub Packages read access for `@groundhogchain/*` packages
- For local development, a Groundhog node listening on `http://localhost:9545`

Configure GitHub Packages auth in your local npm config:

```ini
@groundhogchain:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

The token needs `read:packages`. In Netlify, add the token as `NPM_TOKEN` and create an `.npmrc` during install, or configure the equivalent GitHub Packages auth in the build environment.

## Install

```bash
pnpm install
```

## Run The Explorer

```bash
pnpm dev
```

Open `http://localhost:3000` and search for a `0x`-prefixed 32-byte transaction hash.

The app reads RPC data from server-rendered loaders. It uses `GROUNDHOG_RPC_URL` when set and otherwise defaults to `http://localhost:9545`:

```bash
GROUNDHOG_RPC_URL=http://127.0.0.1:9545 pnpm dev
```

For Netlify, set:

```bash
GROUNDHOG_RPC_URL=https://devnet.groundhog.network
```

Because RPC calls run server-side, `http://127.0.0.1:9545` on Netlify would point at the Netlify runtime, not a developer's laptop. Use the local default only when running the explorer locally.

To create repeatable local explorer fixtures after starting a fresh node, run:

```bash
pnpm bootstrap:local
```

The bootstrap script builds the local ERC20 and Ticketmaster fixture contracts, deploys ALULA, USDC, and Ticketmaster, initializes metadata, mints balances, creates sample token/Ticketmaster transactions, and prints explorer URLs. ERC20 token contracts are detected through metadata view calls and standard ERC20 event signatures. Native HOG is the only built-in token metadata hint because its address is stable.

The verified dependency set is client `0.7.0`, protocol `0.11.0`, and fixture SDK `0.32.0` (ERC20 interfaces `0.1.25`). Older SDK `0.19.6` fixtures emit raw spec format 1 and fail with the current CLI, which expects format 2.

By default, bootstrap uses sibling projects `../groundhog-test/erc20-current` and `../groundhog-test/ticketmaster`, and the CLI at `../groundhog-rpc/target/debug/groundhog`. Override these with `ERC20_PROJECT_DIR`, `TICKETMASTER_PROJECT_DIR`, and `GROUNDHOG_CLI`. Both fixtures need their updated source and lockfiles, not just a version change. Ticketmaster's updated storage layout requires a fresh deployment.

Bootstrap only accepts loopback RPC URLs and deterministic local dev-wallet manifests. It discovers the manifest from local CLI state, or accepts `GROUNDHOG_RUNTIME_MANIFEST`. Each run creates new contracts and transactions; it does not reset the node. ERC20 calls use the installed client bindings, so separate TypeScript binding generation is unnecessary.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit
```

CI runs lint, regression tests, and the production build without a running node. Run `pnpm bootstrap:local` separately to verify the local CLI, fixture contracts, and node together.

## Event Decoding

The explorer uses SDK receipt/status APIs for transaction data, SDK-generated ERC20 event decoders for token transfers, and SDK contract helpers for ERC20 metadata view calls. Events from other contracts are displayed as raw topics and data until the protocol exposes a canonical contract-spec discovery mechanism.

Token metadata uses the generated SDK contract views and return decoders. HOG uses a built-in `HOG`/7-decimal fallback for missing metadata fields. RPC requests have a 10-second deadline, and displayed RPC URLs omit credentials, paths, and queries.
