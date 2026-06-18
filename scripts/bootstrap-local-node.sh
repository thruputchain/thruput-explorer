#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXPLORER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK_DIR="$(cd "$EXPLORER_DIR/.." && pwd)"
ERC20_PROJECT_DIR="${ERC20_PROJECT_DIR:-$WORK_DIR/groundhog-test/erc20-current}"
LOCAL_NODE_STATE="${LOCAL_NODE_STATE:-$HOME/.local/share/groundhog/hog-devnode/.groundhog/local-node.json}"
RPC_URL="${GROUNDHOG_RPC_URL:-http://localhost:9545}"
HOG_ADDRESS="0x0000000000000000000000000000000000000000000000000000000000000001"
ERC20_METADATA_INITIALIZE="0x17ea0e631f7c989f"
ERC20_TRANSFER="0x3799fd1c3d9b098f"

if [[ -z "${GROUNDHOG_RUNTIME_MANIFEST:-}" ]]; then
  if [[ -f "$LOCAL_NODE_STATE" ]]; then
    GROUNDHOG_RUNTIME_MANIFEST="$(GROUNDHOG_RUNTIME_MANIFEST="$LOCAL_NODE_STATE" node --input-type=module <<'NODE'
const fs = await import("node:fs");
const state = JSON.parse(fs.readFileSync(process.env.GROUNDHOG_RUNTIME_MANIFEST, "utf8"));
process.stdout.write(state.runtimeManifest ?? "");
NODE
)"
  else
    shopt -s nullglob
    manifests=(/tmp/ramdb_*/runtime-manifest.json)
    shopt -u nullglob
    if [[ ${#manifests[@]} -eq 1 ]]; then
      GROUNDHOG_RUNTIME_MANIFEST="${manifests[0]}"
    else
      printf 'Missing GROUNDHOG_RUNTIME_MANIFEST. Start a local node or export the manifest path printed by `groundhog node`.\n' >&2
      printf 'Checked local node state: %s\n' "$LOCAL_NODE_STATE" >&2
      printf 'Found %s /tmp/ramdb_*/runtime-manifest.json candidates.\n' "${#manifests[@]}" >&2
      exit 1
    fi
  fi
fi

export GROUNDHOG_RUNTIME_MANIFEST

if [[ ! -f "$GROUNDHOG_RUNTIME_MANIFEST" ]]; then
  printf 'Runtime manifest does not exist: %s\n' "$GROUNDHOG_RUNTIME_MANIFEST" >&2
  exit 1
fi

if [[ ! -d "$ERC20_PROJECT_DIR" ]]; then
  printf 'Missing ERC20 fixture project: %s\n' "$ERC20_PROJECT_DIR" >&2
  exit 1
fi

json_field() {
  local json="$1"
  local path="$2"
  JSON_INPUT="$json" FIELD_PATH="$path" node --input-type=module <<'NODE'
const value = JSON.parse(process.env.JSON_INPUT);
let current = value;
for (const segment of process.env.FIELD_PATH.split(".")) {
  current = current?.[segment];
}
if (current == null) process.exit(1);
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

metadata_calldata() {
  local contract="$1"
  local admin="$2"
  local name="$3"
  local symbol="$4"
  local decimals="$5"
  CONTRACT_ADDRESS="$contract" ADMIN_ADDRESS="$admin" TOKEN_NAME="$name" TOKEN_SYMBOL="$symbol" TOKEN_DECIMALS="$decimals" \
    node --input-type=module <<'NODE'
import { addressFromHex, toHex0x } from "@groundhogchain/client";
import { ERC20Metadata } from "@groundhogchain/client/contracts";
import { gasAmount } from "@groundhogchain/protocol";

const invocation = ERC20Metadata.initialize(
  addressFromHex(process.env.CONTRACT_ADDRESS),
  gasAmount(BigInt(500_000)),
  {
    administrator: addressFromHex(process.env.ADMIN_ADDRESS),
    name: process.env.TOKEN_NAME,
    symbol: process.env.TOKEN_SYMBOL,
    decimals: BigInt(process.env.TOKEN_DECIMALS),
  },
);

process.stdout.write(toHex0x(invocation.calldata));
NODE
}

transfer_calldata() {
  local contract="$1"
  local receiver="$2"
  local amount="$3"
  CONTRACT_ADDRESS="$contract" RECEIVER_ADDRESS="$receiver" RAW_AMOUNT="$amount" \
    node --input-type=module <<'NODE'
import { addressFromHex, toHex0x } from "@groundhogchain/client";
import { ERC20 } from "@groundhogchain/client/contracts";
import { gasAmount } from "@groundhogchain/protocol";

const invocation = ERC20.transfer(
  addressFromHex(process.env.CONTRACT_ADDRESS),
  gasAmount(BigInt(500_000)),
  {
    receiver: addressFromHex(process.env.RECEIVER_ADDRESS),
    amount: BigInt(process.env.RAW_AMOUNT),
  },
);

process.stdout.write(toHex0x(invocation.calldata));
NODE
}

write_registry() {
  ALULA_ADDRESS="$1" USDC_ADDRESS="$2" node --input-type=module <<'NODE'
import { writeFileSync } from "node:fs";

const registry = `const registry = {
  "${process.env.ALULA_ADDRESS}": {
    name: "ALULA",
    token: true,
  },
  "${process.env.USDC_ADDRESS}": {
    name: "USDC",
    token: true,
  },
};

export default registry;
`;

writeFileSync("contract-registry.local.mjs", registry);
NODE
}

run_groundhog() {
  (cd "$ERC20_PROJECT_DIR" && "$@")
}

deploy_token() {
  local symbol="$1"
  local name="$2"
  local decimals="$3"
  local deploy_json address init_calldata init_json

  deploy_json="$(run_groundhog groundhog deploy --target wasm --json)"
  address="$(json_field "$deploy_json" data.address)"
  init_calldata="$(metadata_calldata "$address" "$DEV0" "$name" "$symbol" "$decimals")"
  init_json="$(run_groundhog groundhog call "$address" "$ERC20_METADATA_INITIALIZE" "$init_calldata" --json)"

  printf '%s\t%s\t%s\t%s\n' "$symbol" "$address" "$(json_field "$deploy_json" data.tx_hash)" "$(json_field "$init_json" data.tx_hash)"
}

mint_token() {
  local address="$1"
  local receiver="$2"
  local amount="$3"
  local json
  json="$(run_groundhog groundhog call "$address" mint "$receiver" "$amount" --json)"
  json_field "$json" data.tx_hash
}

transfer_token() {
  local address="$1"
  local receiver="$2"
  local amount="$3"
  local json
  json="$(run_groundhog groundhog call "$address" transfer "$receiver" "$amount" --json)"
  json_field "$json" data.tx_hash
}

transfer_hog() {
  local receiver="$1"
  local amount="$2"
  local calldata json
  calldata="$(transfer_calldata "$HOG_ADDRESS" "$receiver" "$amount")"
  json="$(run_groundhog groundhog call "$HOG_ADDRESS" "$ERC20_TRANSFER" "$calldata" --json)"
  json_field "$json" data.tx_hash
}

DEV0="$(manifest_wallet 0)"
DEV1="$(manifest_wallet 1)"
DEV2="$(manifest_wallet 2)"

printf 'Bootstrapping local Groundhog explorer fixtures\n'
printf 'Runtime manifest: %s\n' "$GROUNDHOG_RUNTIME_MANIFEST"
printf 'RPC URL: %s\n' "$RPC_URL"
printf 'ERC20 project: %s\n\n' "$ERC20_PROJECT_DIR"

printf 'Building ERC20 fixture...\n'
run_groundhog groundhog build --target wasm --bindings ts --json >/dev/null

printf 'Deploying and initializing tokens...\n'
ALULA_DEPLOY="$(deploy_token ALULA ALULA 6)"
USDC_DEPLOY="$(deploy_token USDC USDC 6)"

ALULA_ADDRESS="$(printf '%s' "$ALULA_DEPLOY" | cut -f2)"
ALULA_DEPLOY_TX="$(printf '%s' "$ALULA_DEPLOY" | cut -f3)"
ALULA_INIT_TX="$(printf '%s' "$ALULA_DEPLOY" | cut -f4)"
USDC_ADDRESS="$(printf '%s' "$USDC_DEPLOY" | cut -f2)"
USDC_DEPLOY_TX="$(printf '%s' "$USDC_DEPLOY" | cut -f3)"
USDC_INIT_TX="$(printf '%s' "$USDC_DEPLOY" | cut -f4)"

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

printf 'Updating local explorer registry...\n'
(cd "$EXPLORER_DIR" && write_registry "$ALULA_ADDRESS" "$USDC_ADDRESS")

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

Transfers:
  HOG   dev-0 -> dev-1  1 HOG          $HOG_TRANSFER_1_TX
  HOG   dev-0 -> dev-2  2.5 HOG        $HOG_TRANSFER_2_TX
  ALULA dev-0 -> dev-1  12,345.67      $ALULA_TRANSFER_1_TX
  ALULA dev-0 -> dev-2  250            $ALULA_TRANSFER_2_TX
  USDC  dev-0 -> dev-1  500.25         $USDC_TRANSFER_1_TX
  USDC  dev-0 -> dev-2  42             $USDC_TRANSFER_2_TX

Explorer URLs:
  http://localhost:3000/tx/$HOG_TRANSFER_1_TX
  http://localhost:3000/tx/$HOG_TRANSFER_2_TX
  http://localhost:3000/tx/$ALULA_TRANSFER_1_TX
  http://localhost:3000/tx/$ALULA_TRANSFER_2_TX
  http://localhost:3000/tx/$USDC_TRANSFER_1_TX
  http://localhost:3000/tx/$USDC_TRANSFER_2_TX

Updated:
  $EXPLORER_DIR/contract-registry.local.mjs
EOF
