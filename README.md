# Groundhog Transaction Explorer

Transaction explorer for Groundhog local nodes and Devnet. The app focuses on transaction lookup, public receipt/status data, decoded token transfer events, and useful placeholders for RPC surfaces that are still evolving.

## Prerequisites

- Node.js 20+
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

The bootstrap script builds the local ERC20 and Ticketmaster fixture contracts, deploys ALULA, USDC, and Ticketmaster, initializes metadata, mints balances, creates sample token/Ticketmaster transactions, updates `.env.local`, and prints transaction URLs.

Local deployed contract addresses change when you restart a dev node and redeploy. The explorer reads these optional `.env.local` values:

```bash
GROUNDHOG_ALULA_ADDRESS=0x...
GROUNDHOG_USDC_ADDRESS=0x...
GROUNDHOG_TICKETMASTER_ADDRESS=0x...
```

The file is optional. Restart the dev server after `pnpm bootstrap:local` updates it. Missing, empty, malformed, or invalid entries are ignored. ALULA and USDC are treated as standard ERC20 tokens. Ticketmaster uses the checked-in generated binding for event decoding. Native HOG is the only built-in token hint because its address is stable.

## Event Decoding

The explorer uses SDK receipt/status APIs for transaction data, SDK-generated ERC20 event decoders for token transfers, a checked-in generated Ticketmaster binding for Ticketmaster events, and SDK contract helpers for ERC20 metadata view calls.

Metadata return decoding is temporarily app-side: the explorer reads `ERC20Spec` and decodes `client.view(...).output.returnData` with SDK codec helpers because generated bindings do not yet expose method return decoders. Native HOG metadata views currently fault, so HOG uses a built-in `HOG`/7-decimal fallback after on-chain metadata fails.
