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

Open `http://localhost:3000` and search for a decimal block height or a base58 transaction hash or address (32 decoded bytes). Base58 is case-sensitive; copy the full identifier without changing its case.

The app reads RPC data from server-rendered loaders. It uses `GROUNDHOG_RPC_URL` when set and otherwise defaults to `http://localhost:9545`:

```bash
GROUNDHOG_RPC_URL=http://127.0.0.1:9545 pnpm dev
```

Local development does not require Basic Auth when both `BASIC_AUTH_USER` and `BASIC_AUTH_HASH` are unset. Set a username and a bcrypt password hash (for example, from `caddy hash-password`) to test the browser login prompt locally. Enter the original password in the browser, not the hash. Production (`pnpm start`) requires both variables and denies access if either is missing or the hash is invalid.

## Block Queries

Block details are at `/block/<height>`; transaction references are at `/block/<height>/transactions`. Receipt heights link back to block details. Heights remain decimal strings or big integers, including values above JavaScript's safe integer limit.

The base58 version set is CLI/gateway **0.32.2**, public node **0.1.31-rc.10**, client **0.21.0**, protocol **0.17.0**, and RPC wire **13.0.0**. Start a fresh local node with `thruput node --hog-devnode-version 0.1.31-rc.10`; do not reuse pre-base58 state. Hosted packaging qualification is separate from this local-node path. The node must have a complete `block-query-v1` index. Genesis metadata is outside coverage.

Addresses, public keys and hashes use unprefixed base58 in URLs, search, links, copy actions and decoded events. Opaque event topics/data, return/abort data, storage keys and pagination cursors remain hex. Decoded token-event address topics are displayed as base58; their raw topic bytes remain hex. Historical hex identifier URLs are not supported.

Transaction pages request at most 50 references in ascending hash order, not execution order. They do not infer a total transaction count. A terminal continuation can also mean a stale cursor, so the UI does not certify completeness. Repeated cursors, overlapping hashes, or lost coverage stop pagination; **Start fresh** opens a new walk. RPC failures and missing history are distinct from an empty indexed block.

## Local Fixtures

Start a local node with the version set above. In another terminal, create sample HOG transfers:

```bash
pnpm bootstrap:local
```

The script uses `thruput` from `PATH`. To use a source build:

```bash
THRUPUT_CLI="$HOME/Work/thruput-tools/target/debug/thruput" pnpm bootstrap:local
```

Each run creates fresh Alice, Bob and Carol keys in an isolated CLI configuration. It funds them from the local faucet, then sends 1 HOG and 0.25 HOG to Bob and 2.5 HOG to Carol. It copies the existing CLI configuration for local-node discovery, but does not copy user keys or change user defaults. Current local nodes use stored signing keys; deterministic `dev-*` accounts are no longer required.

Set `GROUNDHOG_RPC_URL` for a different loopback RPC endpoint. If CLI discovery cannot find that node, set `THRUPUT_RUNTIME_MANIFEST` to the manifest path printed by `thruput node`. The script does not load `.env.local`.

Keys, CLI responses, stderr diagnostics, a command journal and explorer links stay in the printed private run directory under `${XDG_DATA_HOME:-$HOME/.local/share}/thruput-explorer/bootstrap`. Set `BOOTSTRAP_OUTPUT_DIR` to change its parent directory, or `EXPLORER_URL` to change the printed link origin. On failure, inspect the journal and any reported transaction hash before retrying. The script stops on failed or unconfirmed transactions; it does not retry them or reset the node. A new run creates new accounts and activity.

### Optional contract fixtures

Set either project path to include its fixtures. Projects must have source and lockfiles compatible with the current CLI and node. Standalone projects and package directories within Cargo workspaces are supported.

```bash
ERC20_PROJECT_DIR="$HOME/Work/thruput-examples/contracts/erc20" pnpm bootstrap:local
# Add Ticketmaster only when you have a current fixture project:
TICKETMASTER_PROJECT_DIR=/path/to/current/ticketmaster pnpm bootstrap:local
```

The script builds each supplied project with `--locked` before funding accounts. ERC20 fixtures create ALULA and USDC, initialize metadata, mint balances and transfer tokens to Bob and Carol. They must implement the published `ERC20Metadata.v0_1` and `ERC20.v0_1` bindings. Ticketmaster must expose `create_event`, `mint` and `transfer` with the argument order used in the script. Each deployment receives 10 HOG for storage and execution; the minimum code-storage amount alone is not enough for these calls.

The HOG and ERC20 flows were checked against CLI **0.32.2**, node **0.1.31-rc.10** and client **0.21.0**. The ERC20 check used `thruput-examples/contracts/erc20` with Rust SDK **0.51.0**. Ticketmaster command wiring has automated coverage, but its historical external project needs a source upgrade before live verification. Run `bash scripts/bootstrap-local-node.sh --help` for all settings.

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

CI runs lint, data-layer regression tests, the production build, HTTP authentication smoke tests, and browser search tests. Run `pnpm bootstrap:local` separately to verify the local CLI, fixture contracts, and node together.

## Event Decoding

The explorer uses SDK receipt/status APIs for transaction data, including exact gas usage and available execution fault/revert details. It uses SDK-generated ERC20 event decoders for token transfers and `readViews` with generated metadata requests for one shared-height name/symbol/decimals read per token. Contract-level failures retain successful metadata fields; a failed batch leaves metadata unavailable. Events from other contracts are displayed as raw topics and data until the protocol exposes a canonical contract-spec discovery mechanism.

HOG uses built-in `HOG`/7-decimal metadata. Amount formatting uses SDK `formatUnits`, with the explorer's 30-decimal display limit for custom tokens. RPC requests use the SDK transport's 10-second deadline, including response-body reading, and displayed RPC URLs omit credentials, paths, and queries.
