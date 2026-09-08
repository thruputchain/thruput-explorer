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

The token needs `read:packages` and access to the Groundhog packages. Railway uses a separate install-only configuration described below; your local npm configuration is unchanged.

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

Local development does not require Basic Auth when both `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are unset. Set both to test the browser login prompt locally. Production (`pnpm start`) requires both and denies access if either is missing.

## Deploy To Railway

Create a service from `groundhogchain/explorer`, select the `main` branch, and use the repository root. Choose the **Railpack** builder. The checked-in `railpack.json` selects Node 22, installs dependencies with the pinned pnpm version, builds Next.js, and starts it on `0.0.0.0:$PORT`. Leave custom install, build, and start overrides unset.

Add these four service variables before deploying:

| Variable | Required value |
| --- | --- |
| `NODE_AUTH_TOKEN` | GitHub personal access token (classic) with `read:packages` and access to `@groundhogchain/*`. Authorize organization SSO if required. |
| `GROUNDHOG_RPC_URL` | The full RPC endpoint reachable from Railway and compatible with client `0.7.0` / protocol `0.11.0`. Do not use `localhost`. |
| `BASIC_AUTH_USER` | Your chosen nonempty login username, without a colon. |
| `BASIC_AUTH_PASSWORD` | A strong, unique password. Use the password itself, not a bcrypt hash. |

Store credentials as sealed Railway variables. Do not add `NEXT_PUBLIC_` prefixes, commit credentials, or put them in build/start commands. Unlike the Caddy-based documentation sites, Explorer uses `BASIC_AUTH_PASSWORD`, not `BASIC_AUTH_HASH`.

The install step reads `NODE_AUTH_TOKEN` through `.npmrc.railway`; that file contains only an environment-variable reference. No token is written into the repository or generated npm configuration. Do not set `NPM_CONFIG_USERCONFIG` globally. GitHub Actions continues using its own job token and npm configuration.

Railway supplies `PORT`, and Railpack sets `NODE_ENV=production`; leave those defaults in place. Under the service's deployment settings, set **Healthcheck Path** to `/health` and **Healthcheck Timeout** to `60` seconds. Use the default restart-on-failure policy. No volume, database, pre-deploy command, or bootstrap script is needed.

All application routes, search requests, and static assets require Basic Auth. Only `/health` is public. It reports process liveness without contacting the RPC, so an RPC outage does not prevent deployment. A successful health check does not validate credentials or RPC connectivity: confirm authenticated access separately. Missing authentication configuration returns `503`; missing or incorrect browser credentials return `401` with a login challenge.

Generate a Railway domain and verify it over HTTPS before changing DNS:

1. Open `/health` without credentials; expect `200` and `ok`.
2. Open `/` in a private browser window; expect a login prompt. Wrong credentials must not grant access.
3. Log in and verify CSS/JavaScript load, the HOG feed renders, and search resolves a known transaction and address on the configured network.
4. Attach the intended custom domain in Railway and apply its DNS records. Keep Netlify available until the new domain and TLS work, then disable Netlify deployments and remove its unused secrets.

Use HTTPS for hosted access: Basic Auth encodes credentials but does not encrypt them. The application forwards RPC requests server-side; its local default would point inside the Railway container, not at your development node.

Railway's legacy `railway.json`/`railway.toml` deployment files are deprecated for new services. Build and start settings live in `railpack.json`; the service connection, secrets, health check, and domains are configured in the Railway dashboard.

## Local Fixtures

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
pnpm test:production
pnpm audit
```

CI runs lint, regression tests, the production build, and HTTP authentication smoke tests without a running node. `pnpm test:production` requires a completed build and starts temporary local Next.js servers, which it stops after testing. Run `pnpm bootstrap:local` separately to verify the local CLI, fixture contracts, and node together.

## Event Decoding

The explorer uses SDK receipt/status APIs for transaction data, SDK-generated ERC20 event decoders for token transfers, and SDK contract helpers for ERC20 metadata view calls. Events from other contracts are displayed as raw topics and data until the protocol exposes a canonical contract-spec discovery mechanism.

Token metadata uses the generated SDK contract views and return decoders. HOG uses a built-in `HOG`/7-decimal fallback for missing metadata fields. RPC requests have a 10-second deadline, and displayed RPC URLs omit credentials, paths, and queries.
