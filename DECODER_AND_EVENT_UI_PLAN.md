# Decoder And Event UI Plan
## Goal
Make generated contract event decoding first-class, keep local deployment addresses separate from checked-in contract capabilities, and improve event/contract UI so decoded values link to relevant explorer pages.
## Decisions
1. Check generated non-ERC20 bindings into the explorer repo.

  - Add a source-controlled generated binding for Ticketmaster, likely under `src/lib/groundhog/generated/ticketmaster.ts`.

  - Generate it from the Ticketmaster contract with `groundhog build --target wasm --bindings ts`.

  - Do not generate/compile bindings into `.bootstrap-bindings/` at bootstrap time anymore.

2. Split contract identity from deployment addresses.

  - Keep source-controlled contract definitions/capabilities in the repo, for example `src/lib/groundhog/known-contracts.ts`.

  - Keep per-node deployed addresses local, because they change on each fresh local node.

  - Store local deployment addresses in `.env.local` with `GROUNDHOG_ALULA_ADDRESS`, `GROUNDHOG_USDC_ADDRESS`, and `GROUNDHOG_TICKETMASTER_ADDRESS`.

  - Do not commit ephemeral bootstrap addresses.

3. Use generated bindings to decode events.

  - Replace dynamic decoder loading with a checked-in decoder registry.

  - Example: `kind: "ticketmaster"` maps to imported `decodeTicketmasterEvent` or generated `decodeEvent`.

  - Keep ERC20 decoding through `@groundhogchain/client/contracts`.

  - Avoid handwritten per-event CXS decoding in the explorer.

4. Link contract addresses in decoded event data.

  - Detect 32-byte `0x...` values in decoded generic event fields.

  - Render those as links to `/contract/[address]` by default.

  - For ERC20 transfer `from` and `to`, keep linking to `/wallet/[address]`, because those are token holders in that context.

  - For generic contract events, prefer contract links unless a field has wallet-specific semantics later.

5. Make contract pages type-aware.

  - For token contracts, show token metadata rows: `Name`, `Symbol`, `Decimals`.

  - For non-token contracts, omit token metadata rows entirely.

  - Keep `Address`, `Native balance`, and `Raw native balance` for all contracts.

6. Make recent-events table type-aware.

  - For token contracts, keep token-oriented columns: `Tx`, `Block`, `Event`, `From`, `To`, `Amount`.

  - For non-token contracts, use generic columns: `Tx`, `Block`, `Event`, `Fields`.

  - In generic `Fields`, show a compact summary of decoded topics/fields like `event_id=1`, `ticket_id=1`, `owner=0x...`.

  - Link decoded address-looking values to contract pages.

## Implementation Steps
1. Move Ticketmaster generated binding into source control.

  - Add `src/lib/groundhog/generated/ticketmaster.ts` from the current generated output.

  - Remove bootstrap-time `.bootstrap-bindings` generation.

2. Replace dynamic decoder loading.

  - Add a checked-in decoder registry that maps local registry `kind` values to decoder functions.

  - Update `decodeGeneratedEvent` to use imports instead of dynamic file imports.

  - Update `ContractRegistryEntry` to use `kind?: "ticketmaster"` rather than `eventDecoder?: string`.

3. Update bootstrap environment output.

  - Write local addresses to `.env.local`.

4. Improve decoded event rendering.

  - Add a reusable `DecodedValue` component for event values.

  - Link `0x` plus 64 hex values to `/contract/[address]` in generic event contexts.

  - Keep wallet links for ERC20 `from`/`to` fields.

5. Improve contract page summary and recent events.

  - Conditionally render token metadata rows only when `data.token` is true.

  - Render token event table for token contracts.

  - Render generic event table for non-token contracts.

6. Verify.

  - Run `groundhog build --target wasm --bindings ts --json` for Ticketmaster.

  - Run `pnpm exec tsc --noEmit`.

  - Run `pnpm lint`.

  - With a fresh local node, run `./scripts/bootstrap-local-node.sh`.

  - Check `/tx/[ticketmaster-tx]`, `/tx/[token-transfer-tx]`, `/contract/[ticketmaster]`, and `/contract/[token]`.

## Notes
- We still need generated bindings to decode events correctly. The binding contains event signatures, topic/field type metadata, and generated `decodeEvent(...)` logic.

- The source-controlled binding should represent contract capability, not a deployed address. Deployed addresses should remain local or environment-specific.

- This keeps the explorer generic: it uses generated decoders selected by registry metadata, not handwritten Ticketmaster decoding.
