# Groundhog Transaction Explorer

Local transaction explorer for a running Groundhog node. The app focuses on transaction lookup, public receipt/status data, and decoded token transfer events while the Groundhog TypeScript SDK and event-codegen story are still evolving.

## Prerequisites

- Node.js 20+
- pnpm 10.33.4+
- A local Groundhog node listening on `http://localhost:9545`
- Local Groundhog TypeScript packages checked out in the same parent directory:

```txt
parent-directory/
  gh-explorer/
  groundhog-client-ts/
  groundhog-protocol-ts/
```

The package dependencies intentionally use local `file:` links while SDK changes are being tested before publication.

## Install

```bash
pnpm install
```

## Run The Explorer

```bash
pnpm dev
```

Open `http://localhost:3000` and search for a `0x`-prefixed 32-byte transaction hash.

The app reads `GROUNDHOG_RPC_URL` and defaults to `http://localhost:9545`:

```bash
GROUNDHOG_RPC_URL=http://127.0.0.1:9545 pnpm dev
```

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
