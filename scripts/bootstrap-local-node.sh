#!/usr/bin/env bash
set -euo pipefail
shopt -s inherit_errexit
trap 'printf "Bootstrap failed at line %s\n" "$LINENO" >&2' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Local filesystem configuration. Override these from the environment when your
# repositories or fixture projects live somewhere else.
EXPLORER_DIR="${GROUNDHOG_EXPLORER_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
WORK_DIR="${GROUNDHOG_WORK_DIR:-$(cd "$EXPLORER_DIR/.." && pwd)}"
GROUNDHOG_TEST_DIR="${GROUNDHOG_TEST_DIR:-$WORK_DIR/groundhog-test}"
GROUNDHOG_CLI="${GROUNDHOG_CLI:-$WORK_DIR/groundhog-rpc/target/debug/groundhog}"
ERC20_PROJECT_DIR="${ERC20_PROJECT_DIR:-$GROUNDHOG_TEST_DIR/erc20-current}"
TICKETMASTER_PROJECT_DIR="${TICKETMASTER_PROJECT_DIR:-$GROUNDHOG_TEST_DIR/ticketmaster}"
LOCAL_NODE_STATE="${LOCAL_NODE_STATE:-$HOME/.local/share/groundhog/hog-devnode/.groundhog/local-node.json}"
TMP_RUNTIME_MANIFEST_GLOB="${TMP_RUNTIME_MANIFEST_GLOB:-/tmp/ramdb_*/runtime-manifest.json}"
GROUNDHOG_GLOBAL_CONFIG="${GROUNDHOG_GLOBAL_CONFIG:-${XDG_CONFIG_HOME:-$HOME/.config}/groundhog/config.toml}"

GROUNDHOG_CLIENT_CONTRACTS_MODULE="${GROUNDHOG_CLIENT_CONTRACTS_MODULE:-@thruputchain/client/contracts}"

RPC_URL="${GROUNDHOG_RPC_URL:-http://localhost:9545}"
HOG_ADDRESS="11111111111111111111111111111112"

RPC_URL="$RPC_URL" node --input-type=module <<'NODE'
const url = new URL(process.env.RPC_URL);
if (!['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username || url.password) {
  throw new Error('Local bootstrap requires a localhost RPC URL without credentials');
}
NODE

if [[ -z "${GROUNDHOG_RUNTIME_MANIFEST:-}" ]]; then
  if [[ -f "$GROUNDHOG_GLOBAL_CONFIG" ]]; then
    if ! GROUNDHOG_RUNTIME_MANIFEST="$(GROUNDHOG_GLOBAL_CONFIG="$GROUNDHOG_GLOBAL_CONFIG" node --input-type=module <<'NODE'
const fs = await import("node:fs");
const config = fs.readFileSync(process.env.GROUNDHOG_GLOBAL_CONFIG, "utf8");
let inLocalRuntimeState = false;
for (const line of config.split(/\r?\n/)) {
  const section = line.match(/^\s*\[([^\]]+)]\s*(?:#.*)?$/)?.[1];
  if (section) {
    inLocalRuntimeState = section === "local_runtime_state";
    continue;
  }
  if (!inLocalRuntimeState) continue;
  const value = line.match(/^\s*runtime_manifest\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/)?.[1];
  if (value) {
    process.stdout.write(value.startsWith('"') ? JSON.parse(value) : value.slice(1, -1));
    break;
  }
}
NODE
)"; then
      GROUNDHOG_RUNTIME_MANIFEST=""
    fi
  fi

  if [[ -n "${GROUNDHOG_RUNTIME_MANIFEST:-}" && ! -f "$GROUNDHOG_RUNTIME_MANIFEST" ]]; then
    GROUNDHOG_RUNTIME_MANIFEST=""
  fi

  if [[ -z "${GROUNDHOG_RUNTIME_MANIFEST:-}" && -f "$LOCAL_NODE_STATE" ]]; then
    GROUNDHOG_RUNTIME_MANIFEST="$(GROUNDHOG_RUNTIME_MANIFEST="$LOCAL_NODE_STATE" node --input-type=module <<'NODE'
const fs = await import("node:fs");
const state = JSON.parse(fs.readFileSync(process.env.GROUNDHOG_RUNTIME_MANIFEST, "utf8"));
process.stdout.write(state.runtimeManifest ?? "");
NODE
)"
  fi

  if [[ -n "${GROUNDHOG_RUNTIME_MANIFEST:-}" && ! -f "$GROUNDHOG_RUNTIME_MANIFEST" ]]; then
    GROUNDHOG_RUNTIME_MANIFEST=""
  fi

  if [[ -z "${GROUNDHOG_RUNTIME_MANIFEST:-}" ]]; then
    shopt -s nullglob
    manifests=($TMP_RUNTIME_MANIFEST_GLOB)
    shopt -u nullglob
    if [[ ${#manifests[@]} -eq 1 ]]; then
      GROUNDHOG_RUNTIME_MANIFEST="${manifests[0]}"
    else
      printf 'Missing GROUNDHOG_RUNTIME_MANIFEST. Start a local node or export the manifest path printed by `groundhog node`.\n' >&2
      printf 'Checked global config: %s\n' "$GROUNDHOG_GLOBAL_CONFIG" >&2
      printf 'Checked local node state: %s\n' "$LOCAL_NODE_STATE" >&2
      printf 'Found %s %s candidates.\n' "${#manifests[@]}" "$TMP_RUNTIME_MANIFEST_GLOB" >&2
      exit 1
    fi
  fi
fi

export GROUNDHOG_RUNTIME_MANIFEST

if [[ ! -f "$GROUNDHOG_RUNTIME_MANIFEST" ]]; then
  printf 'Runtime manifest does not exist: %s\n' "$GROUNDHOG_RUNTIME_MANIFEST" >&2
  exit 1
fi

node --input-type=module <<'NODE'
import fs from 'node:fs';
const manifest = JSON.parse(fs.readFileSync(process.env.GROUNDHOG_RUNTIME_MANIFEST, 'utf8'));
if (manifest.kind !== 'hogd-dev-runtime' ||
    manifest.bootstrapAccountDerivation?.scheme !== 'groundhog-bootstrap-account-v1' ||
    manifest.bootstrapAccountDerivation?.seed !== 'groundhog-dev-accounts') {
  throw new Error('Local bootstrap requires a runtime manifest with deterministic local dev wallets');
}
NODE

BOOTSTRAP_CONFIG_HOME_CREATED=0
if [[ -n "${GROUNDHOG_BOOTSTRAP_CONFIG_HOME:-}" ]]; then
  XDG_CONFIG_HOME="$GROUNDHOG_BOOTSTRAP_CONFIG_HOME"
else
  XDG_CONFIG_HOME="$(mktemp -d "${TMPDIR:-/tmp}/groundhog-explorer-bootstrap.XXXXXX")"
  BOOTSTRAP_CONFIG_HOME_CREATED=1
fi
export XDG_CONFIG_HOME

if (( BOOTSTRAP_CONFIG_HOME_CREATED == 1 )); then
  mkdir -p "$XDG_CONFIG_HOME/groundhog"
  cat >"$XDG_CONFIG_HOME/groundhog/config.toml" <<'EOF'
default_profile = "local"

[profile.local]
network = "local"
default_key = "dev-0"
EOF
fi

cleanup_bootstrap_config() {
  if (( BOOTSTRAP_CONFIG_HOME_CREATED == 1 )); then
    rm -rf -- "$XDG_CONFIG_HOME"
  fi
}
trap cleanup_bootstrap_config EXIT

GROUNDHOG_NETWORK_ARGS=(
  --force
  --profile local
  --rpc-url "$RPC_URL"
  --runtime-manifest "$GROUNDHOG_RUNTIME_MANIFEST"
)

if [[ ! -d "$ERC20_PROJECT_DIR" ]]; then
  printf 'Missing ERC20 fixture project: %s\n' "$ERC20_PROJECT_DIR" >&2
  exit 1
fi

if [[ ! -d "$TICKETMASTER_PROJECT_DIR" ]]; then
  printf 'Missing Ticketmaster fixture project: %s\n' "$TICKETMASTER_PROJECT_DIR" >&2
  exit 1
fi

if [[ ! -x "$GROUNDHOG_CLI" ]]; then
  printf 'Groundhog CLI not found or not executable: %s\n' "$GROUNDHOG_CLI" >&2
  printf 'Build it with: cd %s/groundhog-rpc && cargo build -p groundhog-cli\n' "$WORK_DIR" >&2
  exit 1
fi

require_ok_json() {
  local json="$1"
  local label="$2"

  JSON_INPUT="$json" LABEL="$label" node --input-type=module <<'NODE'
const value = JSON.parse(process.env.JSON_INPUT);
if (value.ok !== true) {
  console.error(`${process.env.LABEL} failed:`);
  console.error(JSON.stringify(value, null, 2));
  process.exit(1);
}
const status = value.data?.status?.result;
if (status && status !== "ok") {
  console.error(`${process.env.LABEL} did not commit successfully:`);
  console.error(JSON.stringify(value.data, null, 2));
  process.exit(1);
}
NODE
}

required_json_field() {
  local json="$1"
  local path="$2"
  local label="$3"

  JSON_INPUT="$json" FIELD_PATH="$path" LABEL="$label" node --input-type=module <<'NODE'
const value = JSON.parse(process.env.JSON_INPUT);
let current = value;
for (const segment of process.env.FIELD_PATH.split(".")) {
  current = current?.[segment];
}
if (current == null || current === "") {
  console.error(`${process.env.LABEL} missing required field: ${process.env.FIELD_PATH}`);
  console.error(JSON.stringify(value, null, 2));
  process.exit(1);
}
process.stdout.write(String(current));
NODE
}

manifest_wallet() {
  local index="$1"
  MANIFEST_PATH="$GROUNDHOG_RUNTIME_MANIFEST" ACCOUNT_INDEX="$index" node --input-type=module <<'NODE'
const fs = await import("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST_PATH, "utf8"));
const account = manifest.bootstrapAccounts?.find((candidate) => String(candidate.index) === process.env.ACCOUNT_INDEX);
if (!account?.walletAddress) throw new Error(`missing dev-${process.env.ACCOUNT_INDEX} wallet in runtime manifest`);
process.stdout.write(account.walletAddress);
NODE
}

erc20_metadata_initialize_call() {
  local contract="$1"
  local admin="$2"
  local name="$3"
  local symbol="$4"
  local decimals="$5"
  CONTRACT_ADDRESS="$contract" ADMIN_ADDRESS="$admin" TOKEN_NAME="$name" TOKEN_SYMBOL="$symbol" TOKEN_DECIMALS="$decimals" \
    GROUNDHOG_CLIENT_CONTRACTS_MODULE="$GROUNDHOG_CLIENT_CONTRACTS_MODULE" \
    node --input-type=module <<'NODE'
import { addressFromBase58, toHex0x } from "@thruputchain/client";
import { gasAmount } from "@thruputchain/protocol";

const { ERC20Metadata } = await import(process.env.GROUNDHOG_CLIENT_CONTRACTS_MODULE);

const invocation = ERC20Metadata.v0_1.initialize.invocation(
  addressFromBase58(process.env.CONTRACT_ADDRESS),
  gasAmount(BigInt(500_000)),
  {
    administrator: addressFromBase58(process.env.ADMIN_ADDRESS),
    name: process.env.TOKEN_NAME,
    symbol: process.env.TOKEN_SYMBOL,
    decimals: BigInt(process.env.TOKEN_DECIMALS),
  },
);

process.stdout.write(`${toHex0x(invocation.entrypoint)}\t${toHex0x(invocation.calldata)}`);
NODE
}

erc20_mint_call() {
  local contract="$1"
  local receiver="$2"
  local amount="$3"
  CONTRACT_ADDRESS="$contract" RECEIVER_ADDRESS="$receiver" RAW_AMOUNT="$amount" \
    GROUNDHOG_CLIENT_CONTRACTS_MODULE="$GROUNDHOG_CLIENT_CONTRACTS_MODULE" \
    node --input-type=module <<'NODE'
import { addressFromBase58, toHex0x } from "@thruputchain/client";
import { gasAmount } from "@thruputchain/protocol";

const { ERC20 } = await import(process.env.GROUNDHOG_CLIENT_CONTRACTS_MODULE);

const invocation = ERC20.v0_1.mint.invocation(
  addressFromBase58(process.env.CONTRACT_ADDRESS),
  gasAmount(BigInt(500_000)),
  {
    receiver: addressFromBase58(process.env.RECEIVER_ADDRESS),
    amount: BigInt(process.env.RAW_AMOUNT),
  },
);

process.stdout.write(`${toHex0x(invocation.entrypoint)}\t${toHex0x(invocation.calldata)}`);
NODE
}

erc20_transfer_call() {
  local contract="$1"
  local receiver="$2"
  local amount="$3"
  CONTRACT_ADDRESS="$contract" RECEIVER_ADDRESS="$receiver" RAW_AMOUNT="$amount" \
    GROUNDHOG_CLIENT_CONTRACTS_MODULE="$GROUNDHOG_CLIENT_CONTRACTS_MODULE" \
    node --input-type=module <<'NODE'
import { addressFromBase58, toHex0x } from "@thruputchain/client";
import { gasAmount } from "@thruputchain/protocol";

const { ERC20 } = await import(process.env.GROUNDHOG_CLIENT_CONTRACTS_MODULE);

const invocation = ERC20.v0_1.transfer.invocation(
  addressFromBase58(process.env.CONTRACT_ADDRESS),
  gasAmount(BigInt(500_000)),
  {
    receiver: addressFromBase58(process.env.RECEIVER_ADDRESS),
    amount: BigInt(process.env.RAW_AMOUNT),
  },
);

process.stdout.write(`${toHex0x(invocation.entrypoint)}\t${toHex0x(invocation.calldata)}`);
NODE
}

run_groundhog() {
  (cd "$ERC20_PROJECT_DIR" && "$@")
}

run_groundhog_in() {
  local project_dir="$1"
  shift
  (cd "$project_dir" && "$@")
}

deploy_token() {
  local symbol="$1"
  local name="$2"
  local decimals="$3"
  local deploy_json address init_call init_entrypoint init_calldata init_json deploy_tx init_tx

  deploy_json="$(run_groundhog_in "$EXPLORER_DIR" "$GROUNDHOG_CLI" deploy --artifact "$ERC20_ARTIFACT" --json "${GROUNDHOG_NETWORK_ARGS[@]}")" || return 1
  require_ok_json "$deploy_json" "deploy $symbol" || return 1
  address="$(required_json_field "$deploy_json" data.address "deploy $symbol")" || return 1
  init_call="$(erc20_metadata_initialize_call "$address" "$DEV0" "$name" "$symbol" "$decimals")" || return 1
  init_entrypoint="$(printf '%s' "$init_call" | cut -f1)"
  init_calldata="$(printf '%s' "$init_call" | cut -f2)"
  init_json="$(run_groundhog "$GROUNDHOG_CLI" call "$address" "$init_entrypoint" "$init_calldata" --json "${GROUNDHOG_NETWORK_ARGS[@]}")" || return 1
  require_ok_json "$init_json" "initialize $symbol" || return 1
  deploy_tx="$(required_json_field "$deploy_json" data.txHash "deploy $symbol")" || return 1
  init_tx="$(required_json_field "$init_json" data.txHash "initialize $symbol")" || return 1

  printf '%s\t%s\t%s\t%s\n' "$symbol" "$address" "$deploy_tx" "$init_tx"
}

mint_token() {
  local address="$1"
  local receiver="$2"
  local amount="$3"
  local call entrypoint calldata json
  call="$(erc20_mint_call "$address" "$receiver" "$amount")" || return 1
  entrypoint="$(printf '%s' "$call" | cut -f1)"
  calldata="$(printf '%s' "$call" | cut -f2)"
  json="$(run_groundhog "$GROUNDHOG_CLI" call "$address" "$entrypoint" "$calldata" --json "${GROUNDHOG_NETWORK_ARGS[@]}")" || return 1
  require_ok_json "$json" "mint $address" || return 1
  required_json_field "$json" data.txHash "mint $address" || return 1
}

transfer_token() {
  local address="$1"
  local receiver="$2"
  local amount="$3"
  local call entrypoint calldata json
  call="$(erc20_transfer_call "$address" "$receiver" "$amount")" || return 1
  entrypoint="$(printf '%s' "$call" | cut -f1)"
  calldata="$(printf '%s' "$call" | cut -f2)"
  json="$(run_groundhog "$GROUNDHOG_CLI" call "$address" "$entrypoint" "$calldata" --json "${GROUNDHOG_NETWORK_ARGS[@]}")" || return 1
  require_ok_json "$json" "transfer $address" || return 1
  required_json_field "$json" data.txHash "transfer $address" || return 1
}

transfer_hog() {
  local receiver="$1"
  local amount="$2"
  local call entrypoint calldata json
  call="$(erc20_transfer_call "$HOG_ADDRESS" "$receiver" "$amount")" || return 1
  entrypoint="$(printf '%s' "$call" | cut -f1)"
  calldata="$(printf '%s' "$call" | cut -f2)"
  json="$(run_groundhog "$GROUNDHOG_CLI" call "$HOG_ADDRESS" "$entrypoint" "$calldata" --json "${GROUNDHOG_NETWORK_ARGS[@]}")" || return 1
  require_ok_json "$json" "transfer HOG" || return 1
  required_json_field "$json" data.txHash "transfer HOG" || return 1
}

deploy_ticketmaster() {
  local deploy_json address deploy_tx

  deploy_json="$(run_groundhog_in "$EXPLORER_DIR" "$GROUNDHOG_CLI" deploy --artifact "$TICKETMASTER_ARTIFACT" --json "${GROUNDHOG_NETWORK_ARGS[@]}")" || return 1
  require_ok_json "$deploy_json" "deploy Ticketmaster" || return 1
  address="$(required_json_field "$deploy_json" data.address "deploy Ticketmaster")" || return 1
  deploy_tx="$(required_json_field "$deploy_json" data.txHash "deploy Ticketmaster")" || return 1

  printf '%s\t%s\n' "$address" "$deploy_tx"
}

call_ticketmaster() {
  local address="$1"
  local label="$2"
  shift 2
  local json
  json="$(run_groundhog_in "$TICKETMASTER_PROJECT_DIR" "$GROUNDHOG_CLI" call "$address" "$@" --json "${GROUNDHOG_NETWORK_ARGS[@]}")" || {
    printf '%s\n' "$json" >&2
    return 1
  }
  require_ok_json "$json" "$label" || return 1
  required_json_field "$json" data.txHash "$label" || return 1
}

DEV0="$(manifest_wallet 0)"
DEV1="$(manifest_wallet 1)"
DEV2="$(manifest_wallet 2)"

printf 'Bootstrapping local Groundhog explorer fixtures\n'
printf 'Runtime manifest: %s\n' "$GROUNDHOG_RUNTIME_MANIFEST"
printf 'RPC URL: %s\n' "$RPC_URL"
printf 'Groundhog CLI: %s\n' "$GROUNDHOG_CLI"
printf 'Contracts module: %s\n' "$GROUNDHOG_CLIENT_CONTRACTS_MODULE"
printf 'ERC20 project: %s\n\n' "$ERC20_PROJECT_DIR"
printf 'Ticketmaster project: %s\n\n' "$TICKETMASTER_PROJECT_DIR"

printf 'Building ERC20 fixture...\n'
build_json="$(run_groundhog "$GROUNDHOG_CLI" build --json -- --locked)"
require_ok_json "$build_json" "build ERC20 fixture"
ERC20_ARTIFACT="$(required_json_field "$build_json" data.rv32 "build ERC20 fixture")"

printf 'Building Ticketmaster fixture...\n'
ticketmaster_build_json="$(run_groundhog_in "$TICKETMASTER_PROJECT_DIR" "$GROUNDHOG_CLI" build --json -- --locked)"
require_ok_json "$ticketmaster_build_json" "build Ticketmaster fixture"
TICKETMASTER_ARTIFACT="$(required_json_field "$ticketmaster_build_json" data.rv32 "build Ticketmaster fixture")"

printf 'Deploying and initializing tokens...\n'
ALULA_DEPLOY="$(deploy_token ALULA ALULA 6)"
USDC_DEPLOY="$(deploy_token USDC USDC 6)"
TICKETMASTER_DEPLOY="$(deploy_ticketmaster)"

ALULA_ADDRESS="$(printf '%s' "$ALULA_DEPLOY" | cut -f2)"
ALULA_DEPLOY_TX="$(printf '%s' "$ALULA_DEPLOY" | cut -f3)"
ALULA_INIT_TX="$(printf '%s' "$ALULA_DEPLOY" | cut -f4)"
USDC_ADDRESS="$(printf '%s' "$USDC_DEPLOY" | cut -f2)"
USDC_DEPLOY_TX="$(printf '%s' "$USDC_DEPLOY" | cut -f3)"
USDC_INIT_TX="$(printf '%s' "$USDC_DEPLOY" | cut -f4)"
TICKETMASTER_ADDRESS="$(printf '%s' "$TICKETMASTER_DEPLOY" | cut -f1)"
TICKETMASTER_DEPLOY_TX="$(printf '%s' "$TICKETMASTER_DEPLOY" | cut -f2)"

printf 'Minting token balances...\n'
ALULA_MINT_TX="$(mint_token "$ALULA_ADDRESS" "$DEV0" 1000000000000)"
USDC_MINT_TX="$(mint_token "$USDC_ADDRESS" "$DEV0" 1000000000000)"

printf 'Creating transfer transactions...\n'
HOG_TRANSFER_1_TX="$(transfer_hog "$DEV1" 10000000)"
HOG_TRANSFER_2_TX="$(transfer_hog "$DEV2" 25000000)"
ALULA_TRANSFER_1_TX="$(transfer_token "$ALULA_ADDRESS" "$DEV1" 12345670000)"
ALULA_TRANSFER_2_TX="$(transfer_token "$ALULA_ADDRESS" "$DEV2" 250000000)"
USDC_TRANSFER_1_TX="$(transfer_token "$USDC_ADDRESS" "$DEV1" 500250000)"
USDC_TRANSFER_2_TX="$(transfer_token "$USDC_ADDRESS" "$DEV2" 42000000)"

printf 'Creating Ticketmaster transactions...\n'
TICKET_EVENT_TX="$(call_ticketmaster "$TICKETMASTER_ADDRESS" "create Ticketmaster event" create_event 1 3 1000000 1000100)"
TICKET_MINT_1_TX="$(call_ticketmaster "$TICKETMASTER_ADDRESS" "mint ticket 1" mint 1 "$DEV0" 1)"
TICKET_MINT_2_TX="$(call_ticketmaster "$TICKETMASTER_ADDRESS" "mint ticket 2" mint 1 "$DEV1" 2)"
TICKET_TRANSFER_TX="$(call_ticketmaster "$TICKETMASTER_ADDRESS" "transfer ticket 1" transfer 1 1 "$DEV2")"

cat <<EOF

Local bootstrap complete.

Dev wallets:
  dev-0: $DEV0
  dev-1: $DEV1
  dev-2: $DEV2

Contracts:
  ALULA: $ALULA_ADDRESS
    deploy tx:     $ALULA_DEPLOY_TX
    initialize tx: $ALULA_INIT_TX
    mint tx:       $ALULA_MINT_TX
  USDC:  $USDC_ADDRESS
    deploy tx:     $USDC_DEPLOY_TX
    initialize tx: $USDC_INIT_TX
    mint tx:       $USDC_MINT_TX
  Ticketmaster: $TICKETMASTER_ADDRESS
    deploy tx:     $TICKETMASTER_DEPLOY_TX

Transfers:
  HOG   dev-0 -> dev-1  1 HOG          $HOG_TRANSFER_1_TX
  HOG   dev-0 -> dev-2  2.5 HOG        $HOG_TRANSFER_2_TX
  ALULA dev-0 -> dev-1  12,345.67      $ALULA_TRANSFER_1_TX
  ALULA dev-0 -> dev-2  250            $ALULA_TRANSFER_2_TX
  USDC  dev-0 -> dev-1  500.25         $USDC_TRANSFER_1_TX
  USDC  dev-0 -> dev-2  42             $USDC_TRANSFER_2_TX

Ticketmaster:
  create event 1                    $TICKET_EVENT_TX
  mint event 1 ticket 1 to dev-0    $TICKET_MINT_1_TX
  mint event 1 ticket 2 to dev-1    $TICKET_MINT_2_TX
  transfer ticket 1 dev-0 -> dev-2  $TICKET_TRANSFER_TX

Explorer URLs:
  http://localhost:3000/tx/$HOG_TRANSFER_1_TX
  http://localhost:3000/tx/$HOG_TRANSFER_2_TX
  http://localhost:3000/tx/$ALULA_TRANSFER_1_TX
  http://localhost:3000/tx/$ALULA_TRANSFER_2_TX
  http://localhost:3000/tx/$USDC_TRANSFER_1_TX
  http://localhost:3000/tx/$USDC_TRANSFER_2_TX
  http://localhost:3000/tx/$TICKET_EVENT_TX
  http://localhost:3000/tx/$TICKET_MINT_1_TX
  http://localhost:3000/tx/$TICKET_MINT_2_TX
  http://localhost:3000/tx/$TICKET_TRANSFER_TX
  http://localhost:3000/address/$TICKETMASTER_ADDRESS
EOF
