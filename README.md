# Thruput Explorer

Explore Thruput blocks, transactions, addresses, balances and token events. Built with Next.js, React and the Thruput TypeScript SDK.

The interface uses the Stellar Thruput identity and follows the system's light or dark theme. Inter Variable is used for headings, body text, and actions. Inconsolata Variable is used for technical data and system labels. Both fonts are bundled locally through Fontsource.

Theme tokens live in `src/app/globals.css` and match the docs, Counter, Swap, and Token Launchpad apps. `signal` stays yellow (`#FDDA24`) for filled actions; `primary` is the theme-aware accent for text and focus. This keeps yellow buttons dark-labelled and links readable in light mode.

The SVGs in `public/brand/` and `src/app/icon.svg` use the official Stellar Logo Press Kit 2026 vector paths. Black and bone wordmarks are selected with a media query. See [GH-533](https://linear.app/grndhg/issue/GH-533) for marketing references and the [shared brand conventions](https://github.com/thruputchain/thruput-docs/blob/main/public/brand/README.md) for asset provenance and palette values.

## Setup

Use Node.js 22.12+ and pnpm 10.34.7. The SDK packages currently require GitHub Packages read access, even though this repository is public. Add your token to your user-level npm configuration (`~/.npmrc`):

```ini
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Export `GITHUB_PACKAGES_TOKEN` with `read:packages` access to the Thruput packages. The repository's `.npmrc` selects the registry.

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Open <http://localhost:3000>. Set `THRUPUT_RPC_URL` in `.env.local` to select a node; the default is `http://localhost:9545`. Restart the server after changing it. This replaces the old `GROUNDHOG_RPC_URL` setting; update existing deployment variables when upgrading.

The tested node version set is CLI/gateway **0.32.2**, public node **0.1.31-rc.10**, client **0.21.0**, protocol **0.17.0**, and RPC wire **13.0.0**. For local use, start `thruput node --hog-devnode-version 0.1.31-rc.10` in another terminal. Use fresh base58-compatible state. Block queries require a complete `block-query-v1` index; genesis metadata is outside coverage.

## Configuration and deployment

| Variable | Purpose |
| --- | --- |
| `THRUPUT_RPC_URL` | Server-side RPC endpoint |
| `BASIC_AUTH_USER` | Basic Auth username |
| `BASIC_AUTH_HASH` | Bcrypt password hash, for example from `caddy hash-password` |

Development permits access when both auth variables are unset. Production requires both and denies access if either is missing or the hash is invalid. Enter the original password in the browser. Keep bcrypt hashes single-quoted in `.env.local` so `$` characters remain literal.

```bash
pnpm build
pnpm start
```

`railpack.json` supplies the Railway build and start commands. Set `NPM_TOKEN` for package installation and the three application variables above. `/health` is the unauthenticated health endpoint.

## Wallet Shortcut

Select **Connect** in the header and approve access in a compatible Thruput wallet extension. If several wallets are available, choose one from the menu. The connected menu offers **View wallet**, which opens `/address/<address>`, and **Disconnect**, which clears the shortcut and asks the wallet to revoke access.

The shortcut follows wallet account changes and revocation. It lasts across in-app navigation; reload the page and connect again to start a new session. It uses the first authorized account and displays that address on the explorer's configured network. Connecting does not change networks, sign transactions, or expose the server RPC configuration to the browser.

## Data behavior

- Search accepts a decimal block height or a base58 transaction hash or address. Base58 is case-sensitive. Opaque payloads and pagination cursors remain hex.
- Block heights and amounts retain integer precision. Block transaction pages fetch up to 50 references in ascending hash order, not execution order. Pagination stops on repeated cursors, overlapping hashes or lost coverage; **Start fresh** starts a new walk.
- SDK receipt APIs preserve execution results, gas usage and available fault details. ERC20 events use generated decoders. Other contract events show raw topics and data.
- Token metadata uses one shared-height SDK batch per token. HOG has built-in metadata with seven decimals; custom-token display supports up to 30 decimals.
- RPC requests have a 10-second deadline. Displayed RPC URLs omit credentials, paths and queries. Missing history and RPC errors are distinct from empty results.

The home page defaults to **Recent blocks**, listing the chain tip and up to 10 previous heights from one tip query. Genesis is omitted because its metadata is unavailable. **Recent HOG transfers** keeps the existing transfer list in a second tab. Block heights in activity tables and transaction summaries link to their block details.

## Development

Routes and server actions are in `src/app`. UI components are in `src/components`; RPC loaders, event decoding and their tests are in `src/lib/thruput`. Browser tests use the fixture RPC in `tests/browser/server.ts` and require no local contracts or live node.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:production
pnpm exec playwright install chromium
pnpm test:browser
pnpm audit
```

Production and browser tests require a completed build and stop their temporary servers afterward. Browser tests use port 3100, or `PLAYWRIGHT_PORT`, and refuse to reuse an existing server. CI runs lint, unit tests, build, authentication checks and browser tests. Fork CI needs access to the SDK packages.

Application dependencies use the latest compatible releases. ESLint stays on 9 and TypeScript on 6.0 until the Next.js lint plugins support their newer major versions. Node types match the Node 22 deployment runtime; pnpm stays on the current lockfile's major version. UI components are checked-in shadcn source; use `pnpm dlx shadcn@latest` when adding components.

## License

Apache-2.0. See [LICENSE](LICENSE).
