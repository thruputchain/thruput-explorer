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

## Event Decoding

The explorer uses SDK receipt/status APIs for transaction data. Token event decoding is intentionally isolated in `src/lib/groundhog/token-events.ts`.

Temporary local decoders exist because generated SDK event decoders are not available yet. Standard ERC20 transfers decode from `groundhog-erc20-if::TransferEvent`. Native HOG has a temporary fallback decoder for the current local-node event encoding bug; once HOG emits standard ERC20 events, that fallback should be removed.
