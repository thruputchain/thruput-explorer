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

Local deployed contract addresses change when you restart a dev node and redeploy. Add labels and token hints in `contract-registry.local.mjs`, which is gitignored:

```js
export default {
  "0xfbbd3a47d7ff9a44e3642ce3a04a70b4bd6f9897752ac09a16a8f09e923ffb4c": {
    name: "Test Token",
    token: true,
  },
  "0xd27a4224e4efa74caf2d424e41399a2e1f809b0f1a5d2e695b17e0b6e8ff2f78": {
    name: "Ticketmaster",
  },
};
```

The file is optional. Missing, empty, malformed, or invalid entries are ignored. `token: true` tells the explorer to decode standard ERC20 events and fetch ERC20 metadata with SDK view calls. Native HOG is the only built-in token hint because its address is stable.

## Event Decoding

The explorer uses SDK receipt/status APIs for transaction data, SDK-generated ERC20 event decoders for token transfers, and SDK contract helpers for ERC20 metadata view calls.

Metadata return decoding is temporarily app-side: the explorer reads `ERC20Spec` and decodes `client.view(...).output.returnData` with SDK codec helpers because generated bindings do not yet expose method return decoders. Native HOG metadata views currently fault, so HOG uses a built-in `HOG`/7-decimal fallback after on-chain metadata fails.
