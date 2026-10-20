#!/usr/bin/env bash
set -Eeuo pipefail
shopt -s inherit_errexit
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPLORER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
THRUPUT_CLI="${THRUPUT_CLI:-thruput}"
RPC_URL="${GROUNDHOG_RPC_URL:-http://127.0.0.1:9545}"
EXPLORER_URL="${EXPLORER_URL:-http://localhost:3000}"

if [[ "${1:-}" == --help ]]; then
  cat <<'EOF'
Create local explorer activity with fresh CLI keys and faucet funding.

Usage: pnpm bootstrap:local

Environment:
  THRUPUT_CLI               CLI executable or path (default: thruput)
  GROUNDHOG_RPC_URL         Loopback RPC URL (default: http://127.0.0.1:9545)
  THRUPUT_RUNTIME_MANIFEST  Optional manifest printed by thruput node
  BOOTSTRAP_OUTPUT_DIR     Parent for private run directories
  EXPLORER_URL             URL used in printed links (default: http://localhost:3000)
  ERC20_PROJECT_DIR        Optional current ERC20Metadata/ERC20 fixture project
  TICKETMASTER_PROJECT_DIR Optional current Ticketmaster fixture project

Start a wire-13 local node with thruput 0.32.2 / hog-devnode 0.1.31-rc.10.
By default, create HOG transfers only. Each supplied contract project is built
with --locked and deployed with 10 HOG for storage and execution headroom.
Each run creates new keys and transactions. Keys, command responses and explorer
links stay in the run folder.
EOF
  exit 0
fi
if (( $# > 0 )); then
  printf 'Unknown argument: %s. Use --help.\n' "$1" >&2
  exit 1
fi

THRUPUT_CLI="$(command -v "$THRUPUT_CLI")" || {
  printf 'Thruput CLI not found. Set THRUPUT_CLI to its executable path.\n' >&2
  exit 1
}
# Commands run outside the explorer and any supplied contract project.
THRUPUT_CLI="$(realpath "$THRUPUT_CLI")"
cd "$EXPLORER_DIR"

RPC_URL="$RPC_URL" EXPLORER_URL="$EXPLORER_URL" node --input-type=module <<'NODE'
const rpc = new URL(process.env.RPC_URL);
if (!['http:', 'https:'].includes(rpc.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(rpc.hostname) || rpc.username || rpc.password) {
  throw new Error('Local bootstrap requires a loopback RPC URL without credentials');
}
const explorer = new URL(process.env.EXPLORER_URL);
if (!['http:', 'https:'].includes(explorer.protocol) || explorer.username || explorer.password) {
  throw new Error('EXPLORER_URL must be an HTTP(S) URL without credentials');
}
NODE

for variable in ERC20_PROJECT_DIR TICKETMASTER_PROJECT_DIR; do
  if [[ -n "${!variable:-}" ]]; then
    directory="$(cd "${!variable}" && pwd)"
    [[ -f "$directory/Cargo.toml" ]] || {
      printf '%s needs a current Cargo project: %s\n' "$variable" "$directory" >&2
      exit 1
    }
    printf -v "$variable" '%s' "$directory"
  fi
done
if [[ -n "${THRUPUT_RUNTIME_MANIFEST:-}" ]]; then
  THRUPUT_RUNTIME_MANIFEST="$(realpath -e "$THRUPUT_RUNTIME_MANIFEST")"
fi

# Copy configuration, not keys. This retains the CLI's local-node discovery
# without parsing TOML or changing the user's profiles, wallets or default key.
SOURCE_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/thruput/config.toml"
OUTPUT_DIR="${BOOTSTRAP_OUTPUT_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/thruput-explorer/bootstrap}"
mkdir -p "$OUTPUT_DIR"
RUN_DIR="$(mktemp -d "$OUTPUT_DIR/run.XXXXXXXX")"
RUN_DIR="$(cd "$RUN_DIR" && pwd)"
mkdir -p "$RUN_DIR/config/thruput" "$RUN_DIR/work" "$RUN_DIR/responses"
: > "$RUN_DIR/journal.txt"
if [[ -f "$SOURCE_CONFIG" ]]; then
  cp "$SOURCE_CONFIG" "$RUN_DIR/config/thruput/config.toml"
fi
export XDG_CONFIG_HOME="$RUN_DIR/config"
PROFILE="explorer-bootstrap-$(basename "$RUN_DIR" | tr . -)"
NETWORK_ARGS=(--profile "$PROFILE" --rpc-url "$RPC_URL")
if [[ -n "${THRUPUT_RUNTIME_MANIFEST:-}" ]]; then
  NETWORK_ARGS+=(--runtime-manifest "$THRUPUT_RUNTIME_MANIFEST")
fi
trap 'printf "Bootstrap stopped at line %s. Inspect %s/journal.txt before retrying; submitted transactions are not rolled back.\n" "$LINENO" "$RUN_DIR" >&2' ERR
printf 'Bootstrap run: %s\nRPC: %s\n' "$RUN_DIR" "$RPC_URL"
"$THRUPUT_CLI" --version

# Save stdout before checking exit/status, including uncertain submissions.
# Never retry a transaction automatically or discard evidence on failure.
run_cli() {
  local label="$1" directory="$2" response diagnostics
  shift 2
  response="$(mktemp "$RUN_DIR/responses/command.XXXXXXXX.json")"
  diagnostics="${response%.json}.stderr"
  printf '%s\t%s\t%s\n' "$label" "$response" "$diagnostics" >> "$RUN_DIR/journal.txt"
  if ! (cd "$directory" && "$THRUPUT_CLI" --json --non-interactive "$@") > "$response" 2> "$diagnostics"; then
    cat "$diagnostics" >&2
    printf '%s failed. Response: %s; diagnostics: %s\n' "$label" "$response" "$diagnostics" >&2
    return 1
  fi
  cat "$diagnostics" >&2
  node --input-type=module - "$response" <<'NODE' || return 1
import fs from 'node:fs';
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (result.ok !== true) throw new Error(`CLI command failed; inspect ${process.argv[2]}`);
NODE
  cat "$response"
}

field() {
  JSON_INPUT="$1" FIELD_PATH="$2" node --input-type=module <<'NODE'
let value = JSON.parse(process.env.JSON_INPUT);
for (const key of process.env.FIELD_PATH.split('.')) value = value?.[key];
if (value == null || value === '') throw new Error(`Missing CLI field: ${process.env.FIELD_PATH}`);
process.stdout.write(String(value));
NODE
}

transaction() {
  local label="$1" directory="$2" json hash
  shift 2
  json="$(run_cli "$label" "$directory" "$@" "${NETWORK_ARGS[@]}" --force)" || return 1
  JSON_INPUT="$json" node --input-type=module <<'NODE' || return 1
const result = JSON.parse(process.env.JSON_INPUT);
if (result.data?.status?.result !== 'ok' || !result.data?.txHash || result.data?.height == null) {
  throw new Error('Transaction success is not confirmed. Inspect the saved response before retrying.');
}
NODE
  hash="$(field "$json" data.txHash)" || return 1
  printf '%s\t%s/tx/%s\n' "$label" "${EXPLORER_URL%/}" "$hash" >> "$RUN_DIR/links.txt"
  printf '%s\n' "$json"
}

# Validate wire compatibility before generating keys or submitting transactions.
RPC_URL="$RPC_URL" node --input-type=module <<'NODE'
import { createThruputClient, HttpTransport } from '@thruputchain/client';
const client = await createThruputClient({ transport: new HttpTransport(process.env.RPC_URL, { timeoutMs: 10000 }) });
const tip = await client.getChainTip();
console.log(`Connected at block ${tip.height}`);
NODE

# Build optional fixtures before any funding or deployment. --locked exposes
# stale external dependencies instead of silently upgrading a user's project.
if [[ -n "${ERC20_PROJECT_DIR:-}" ]]; then
  json="$(run_cli 'Build ERC20' "$ERC20_PROJECT_DIR" build -- --locked)"
  ERC20_ARTIFACT="$(field "$json" data.rv32)"
fi
if [[ -n "${TICKETMASTER_PROJECT_DIR:-}" ]]; then
  json="$(run_cli 'Build Ticketmaster' "$TICKETMASTER_PROJECT_DIR" build -- --locked)"
  TICKETMASTER_ARTIFACT="$(field "$json" data.rv32)"
fi

json="$(run_cli 'Generate Alice' "$RUN_DIR/work" keys generate alice)"
ALICE="$(field "$json" data.key.address)"
json="$(run_cli 'Generate Bob' "$RUN_DIR/work" keys generate bob)"
BOB="$(field "$json" data.key.address)"
json="$(run_cli 'Generate Carol' "$RUN_DIR/work" keys generate carol)"
CAROL="$(field "$json" data.key.address)"
run_cli 'Create local profile' "$RUN_DIR/work" config new "$PROFILE" --network local --rpc-url "$RPC_URL" --default-key alice --global > /dev/null

transaction 'Fund Alice' "$RUN_DIR/work" airdrop "$ALICE" --amount 100 > /dev/null
transaction 'Fund Bob' "$RUN_DIR/work" airdrop "$BOB" --amount 1 > /dev/null
transaction 'Fund Carol' "$RUN_DIR/work" airdrop "$CAROL" --amount 1 > /dev/null
transaction 'HOG Alice -> Bob: 1' "$RUN_DIR/work" transfer "$BOB" 1 > /dev/null
transaction 'HOG Alice -> Carol: 2.5' "$RUN_DIR/work" transfer "$CAROL" 2.5 > /dev/null
transaction 'HOG Alice -> Bob: 0.25' "$RUN_DIR/work" transfer "$BOB" 0.25 > /dev/null

erc20_metadata_initialize_call() {
  CONTRACT_ADDRESS="$1" ADMIN_ADDRESS="$ALICE" TOKEN_NAME="$2" TOKEN_SYMBOL="$2" TOKEN_DECIMALS=6 \
    node --input-type=module <<'NODE'
import { addressFromBase58, toHex0x } from '@thruputchain/client';
import { gasAmount } from '@thruputchain/protocol';
import { ERC20Metadata } from '@thruputchain/client/contracts';
const invocation = ERC20Metadata.v0_1.initialize.invocation(
  addressFromBase58(process.env.CONTRACT_ADDRESS), gasAmount(500_000n), {
    administrator: addressFromBase58(process.env.ADMIN_ADDRESS),
    name: process.env.TOKEN_NAME, symbol: process.env.TOKEN_SYMBOL,
    decimals: BigInt(process.env.TOKEN_DECIMALS),
  },
);
process.stdout.write(`${toHex0x(invocation.entrypoint)}\t${toHex0x(invocation.calldata)}`);
NODE
}

erc20_mint_call() {
  CONTRACT_ADDRESS="$1" RECEIVER_ADDRESS="$2" RAW_AMOUNT="$3" node --input-type=module <<'NODE'
import { addressFromBase58, toHex0x } from '@thruputchain/client';
import { gasAmount } from '@thruputchain/protocol';
import { ERC20 } from '@thruputchain/client/contracts';
const invocation = ERC20.v0_1.mint.invocation(
  addressFromBase58(process.env.CONTRACT_ADDRESS), gasAmount(500_000n), {
    receiver: addressFromBase58(process.env.RECEIVER_ADDRESS), amount: BigInt(process.env.RAW_AMOUNT),
  },
);
process.stdout.write(`${toHex0x(invocation.entrypoint)}\t${toHex0x(invocation.calldata)}`);
NODE
}

erc20_transfer_call() {
  CONTRACT_ADDRESS="$1" RECEIVER_ADDRESS="$2" RAW_AMOUNT="$3" node --input-type=module <<'NODE'
import { addressFromBase58, toHex0x } from '@thruputchain/client';
import { gasAmount } from '@thruputchain/protocol';
import { ERC20 } from '@thruputchain/client/contracts';
const invocation = ERC20.v0_1.transfer.invocation(
  addressFromBase58(process.env.CONTRACT_ADDRESS), gasAmount(500_000n), {
    receiver: addressFromBase58(process.env.RECEIVER_ADDRESS), amount: BigInt(process.env.RAW_AMOUNT),
  },
);
process.stdout.write(`${toHex0x(invocation.entrypoint)}\t${toHex0x(invocation.calldata)}`);
NODE
}

token_call() {
  local label="$1" address="$2" encoded="$3" entrypoint calldata
  IFS=$'\t' read -r entrypoint calldata <<< "$encoded"
  transaction "$label" "$RUN_DIR/work" call "$address" "$entrypoint" "$calldata" > /dev/null
}

if [[ -n "${ERC20_PROJECT_DIR:-}" ]]; then
  for symbol in ALULA USDC; do
    json="$(transaction "Deploy $symbol" "$RUN_DIR/work" deploy --artifact "$ERC20_ARTIFACT" --fund 10)"
    address="$(field "$json" data.address)"
    encoded="$(erc20_metadata_initialize_call "$address" "$symbol")"
    token_call "Initialize $symbol" "$address" "$encoded"
    encoded="$(erc20_mint_call "$address" "$ALICE" 1000000000000)"
    token_call "Mint $symbol" "$address" "$encoded"
    if [[ "$symbol" == ALULA ]]; then amounts=(12345670000 250000000); else amounts=(500250000 42000000); fi
    encoded="$(erc20_transfer_call "$address" "$BOB" "${amounts[0]}")"
    token_call "$symbol Alice -> Bob" "$address" "$encoded"
    encoded="$(erc20_transfer_call "$address" "$CAROL" "${amounts[1]}")"
    token_call "$symbol Alice -> Carol" "$address" "$encoded"
    printf '%s\t%s/address/%s\n' "$symbol" "${EXPLORER_URL%/}" "$address" >> "$RUN_DIR/links.txt"
  done
fi

if [[ -n "${TICKETMASTER_PROJECT_DIR:-}" ]]; then
  json="$(transaction 'Deploy Ticketmaster' "$RUN_DIR/work" deploy --artifact "$TICKETMASTER_ARTIFACT" --fund 10)"
  address="$(field "$json" data.address)"
  transaction 'Create ticket event' "$TICKETMASTER_PROJECT_DIR" call "$address" create_event 1 3 1000000 1000100 > /dev/null
  transaction 'Mint ticket 1' "$TICKETMASTER_PROJECT_DIR" call "$address" mint 1 "$ALICE" 1 > /dev/null
  transaction 'Mint ticket 2' "$TICKETMASTER_PROJECT_DIR" call "$address" mint 1 "$BOB" 2 > /dev/null
  transaction 'Transfer ticket 1' "$TICKETMASTER_PROJECT_DIR" call "$address" transfer 1 1 "$CAROL" > /dev/null
  printf 'Ticketmaster\t%s/address/%s\n' "${EXPLORER_URL%/}" "$address" >> "$RUN_DIR/links.txt"
fi

for address in "$ALICE" "$BOB" "$CAROL"; do
  printf 'Wallet\t%s/address/%s\n' "${EXPLORER_URL%/}" "$address" >> "$RUN_DIR/links.txt"
done
printf '\nLocal bootstrap complete.\nProfile: %s\nKeys and responses: %s\n\n' "$PROFILE" "$RUN_DIR"
cat "$RUN_DIR/links.txt"
