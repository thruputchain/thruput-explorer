# Thruput Explorer

Transaction explorer for Thruput local nodes and Devnet. The app focuses on transaction lookup, public receipt/status data, decoded token transfer events, and useful placeholders for RPC surfaces that are still evolving.

The interface uses the dark-only Thruput app theme, locally bundled IBM Plex Sans/Mono fonts, and Radix-based shadcn components. Theme tokens live in `src/app/globals.css` and match the Swap and Token Launchpad apps.

## Prerequisites

- Node.js 22.12+
- pnpm 10.33.4+
- GitHub Packages read access for `@thruputchain/*` packages
- For local development, a Groundhog node listening on `http://localhost:9545`

Configure GitHub Packages auth in your local npm config:

```ini
@thruputchain:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

The token needs `read:packages` and access to the private Thruput packages.

## Install

```bash
pnpm install
```

## Run The Explorer

```bash
pnpm dev
```

Open `http://localhost:3000` and search for a decimal block height or a `0x`-prefixed 32-byte transaction hash or address.

The app reads RPC data from server-rendered loaders. It uses `GROUNDHOG_RPC_URL` when set and otherwise defaults to `http://localhost:9545`:

```bash
GROUNDHOG_RPC_URL=http://127.0.0.1:9545 pnpm dev
```

Local development does not require Basic Auth when both `BASIC_AUTH_USER` and `BASIC_AUTH_HASH` are unset. Set a username and a bcrypt password hash (for example, from `caddy hash-password`) to test the browser login prompt locally. Enter the original password in the browser, not the hash. Production (`pnpm start`) requires both variables and denies access if either is missing or the hash is invalid.

## Block Queries

Block details are at `/block/<height>`; transaction references are at `/block/<height>/transactions`. Receipt heights link back to block details. Heights remain decimal strings or big integers, including values above JavaScript's safe integer limit.

The verified block-query version set is CLI/gateway **0.31.0**, public node **0.1.31-rc.8**, client **0.20.0**, protocol **0.16.0**, and hex RPC wire **12.1.0**. The node must have a complete `block-query-v1` index. Older indexes need a separate full-history rebuild from height 1 before these pages are available. Genesis metadata is outside coverage.

Transaction pages request at most 50 references in ascending hash order, not execution order. They do not infer a total transaction count. A terminal continuation can also mean a stale cursor, so the UI does not certify completeness. Repeated cursors, overlapping hashes, or lost coverage stop pagination; **Start fresh** opens a new walk. RPC failures and missing history are distinct from an empty indexed block.

## Live Transactions

`/live` shows transactions as dust flowing through space: each settled block
releases one speck per transaction, spread over the block interval, alongside a
transactions-per-second figure and a table view. Above 6,000 transactions in a
block one speck stands for several and the caption says so; the figures are
always exact. The page consumes
`GET /api/live/stream`, a Server-Sent Events route behind the same Basic Auth as
the rest of the app. The auth proxy sends `Cache-Control: no-transform` for that
path so compression and intermediaries do not buffer the stream.

The server tails `groundhog_getEvents` for the watched contracts, anchored at a
height and walked ascending with cursors, and publishes a block only once the
indexer tip is `LIVE_LAG_BLOCKS` past it (default `3`; keep at least `2` so a
block is never read while the indexer is still writing it). The display therefore
runs a few blocks behind the chain, and every published count is complete: a
transaction is counted once per block when it emits at least one event on a
watched contract. Transactions that touch none of the watched contracts are
not visible to this route; the gateway has no block-scoped transaction listing
yet, and `getBlockByNumber` carries no count.

`LIVE_CONTRACT_ADDRESSES` is a comma-separated list of `0x` contract addresses
to watch and defaults to the native HOG contract. The gateway accepts at most 25
addresses per query. Polling runs only while a browser is connected and stops 30
seconds after the last one leaves.

To demo the page against a local node, start `groundhog node --json
--block-driver interval --block-interval-ms 1000 --dev-account-count 50`, then
generate HOG transfers between its dev accounts:

```bash
GROUNDHOG_RUNTIME_MANIFEST=<runtime_manifest.path from the node's startup JSON> \
  RATE=300 DURATION=60 node --import tsx scripts/live-load.mts
```

The script uses the deterministic local dev signers and refuses to run without
a manifest path, so it cannot be pointed at a shared network by accident.

## Local Fixtures

To create repeatable local explorer fixtures after starting a fresh node, run:

```bash
pnpm bootstrap:local
```

The bootstrap script builds the local ERC20 and Ticketmaster fixture contracts, deploys ALULA, USDC, and Ticketmaster, initializes metadata, mints balances, creates sample token/Ticketmaster transactions, and prints explorer URLs. ERC20 token contracts are detected through metadata view calls and standard ERC20 event signatures. Native HOG is the only built-in token metadata hint because its address is stable.

The historical fixture qualification used client `0.7.0`, protocol `0.11.0`, and fixture SDK `0.32.0` (ERC20 interfaces `0.1.25`). This is separate from the released block-query version set above. Older SDK `0.19.6` fixtures emit raw spec format 1 and fail with the current CLI, which expects format 2.

By default, bootstrap uses sibling projects `../groundhog-test/erc20-current` and `../groundhog-test/ticketmaster`, and the CLI at `../groundhog-rpc/target/debug/groundhog`. Override these with `ERC20_PROJECT_DIR`, `TICKETMASTER_PROJECT_DIR`, and `GROUNDHOG_CLI`. Both fixtures need their updated source and lockfiles, not just a version change. Ticketmaster's updated storage layout requires a fresh deployment.

Bootstrap only accepts loopback RPC URLs and deterministic local dev-wallet manifests. It discovers the manifest from local CLI state, or accepts `GROUNDHOG_RUNTIME_MANIFEST`. Each run creates new contracts and transactions; it does not reset the node. ERC20 calls use the installed client bindings, so separate TypeScript binding generation is unnecessary.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:production
pnpm test:browser
pnpm audit
```

Install the browser once with `pnpm exec playwright install chromium`. Both `pnpm test:production` and `pnpm test:browser` require a completed build and stop their temporary servers after testing. Browser tests use Chromium, Basic Auth, and a local fixture RPC; they do not contact a live Groundhog node. The browser server uses port 3100, or `PLAYWRIGHT_PORT` when set, and refuses to reuse an existing server.

CI runs lint, data-layer regression tests, the production build, HTTP authentication smoke tests, and browser search and live-stream tests. Run `pnpm bootstrap:local` separately to verify the local CLI, fixture contracts, and node together.

## Event Decoding

The explorer uses SDK receipt/status APIs for transaction data, SDK-generated ERC20 event decoders for token transfers, and SDK contract helpers for ERC20 metadata view calls. Events from other contracts are displayed as raw topics and data until the protocol exposes a canonical contract-spec discovery mechanism.

Token metadata uses the generated SDK contract views and return decoders. HOG uses a built-in `HOG`/7-decimal fallback for missing metadata fields. RPC requests have a 10-second deadline, and displayed RPC URLs omit credentials, paths, and queries.
