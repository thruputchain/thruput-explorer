// Demo traffic for the /live page: native HOG transfers between the dev
// accounts of a local `groundhog node`. Local development only; the dev
// signers are deterministic and must never touch a network with real funds.
//
//   groundhog node --json --block-driver interval --block-interval-ms 1000 --dev-account-count 50
//   GROUNDHOG_RUNTIME_MANIFEST=<runtime_manifest.path from the node's startup JSON> \
//     RATE=300 DURATION=60 node --import tsx scripts/live-load.mts
//
// RPC_URL defaults to GROUNDHOG_RPC_URL, then http://127.0.0.1:9545. ACCOUNTS
// (default 50) must not exceed the node's --dev-account-count.
import { createGroundhogClient, createSourceAddressAccount, createWalletClient, devWalletAdapter, HttpTransport, toHex0x } from "@groundhogchain/client";
import { ERC20 } from "@groundhogchain/client/contracts";
import { loadLocalDevAccount } from "@groundhogchain/client/local-dev";
import { HOG_ADDRESS, bitMap, gasAmount, weight, type ContractAddress } from "@groundhogchain/protocol";

const RPC_URL = process.env.RPC_URL ?? process.env.GROUNDHOG_RPC_URL ?? "http://127.0.0.1:9545";
const ACCOUNTS = Number(process.env.ACCOUNTS ?? 50);
const RATE = Number(process.env.RATE ?? 100); // target transactions per second
const DURATION_S = Number(process.env.DURATION ?? 30);
const MAX_INFLIGHT = Number(process.env.MAX_INFLIGHT ?? 2000);
const GAS = gasAmount(10_000_000n);

const transport = new HttpTransport(RPC_URL);
if (!process.env.GROUNDHOG_RUNTIME_MANIFEST) {
  console.error("Set GROUNDHOG_RUNTIME_MANIFEST to the runtime_manifest.path printed by `groundhog node --json`.");
  process.exit(2);
}
const env = { ...process.env };
// Read-only client for progress reports; wallet clients are created per account below.
const client = await createGroundhogClient({ transport });

const wallets: { wallet: Awaited<ReturnType<typeof makeWallet>>; address: ContractAddress }[] = [];
for (let index = 0; index < ACCOUNTS; index += 1) {
  const local = await loadLocalDevAccount({ role: "local_user", roleOffset: index, env });
  wallets.push({ wallet: await makeWallet(local), address: local.address });
}

// A client binds to one wallet account, so each wallet gets its own client over the shared transport.
async function makeWallet(local: Awaited<ReturnType<typeof loadLocalDevAccount>>) {
  const account = createSourceAddressAccount({
    address: local.address,
    signers: [{ signer: local.signer, publicKeyId: 0n }],
    allowedKeys: bitMap(0x01n),
    requiredWeight: weight(1n),
  });
  return createWalletClient({ client: await createGroundhogClient({ transport }), account, invocationAdapter: devWalletAdapter, networkHash: local.networkHash });
}
console.log(`loaded ${wallets.length} dev accounts; first ${toHex0x(wallets[0].address)}`);

let submitted = 0;
let admitted = 0;
let failed = 0;
let inflight = 0;
const errors = new Map<string, number>();
const started = Date.now();
let next = 0;

function fire() {
  const from = wallets[next % wallets.length];
  const to = wallets[(next + 1 + Math.floor(next / wallets.length)) % wallets.length];
  next += 1;
  const invocation = ERC20.transfer.invocation(HOG_ADDRESS, GAS, { receiver: to.address, amount: 10_000n });
  submitted += 1;
  inflight += 1;
  from.wallet.execute({ invocation, gasLimit: GAS }).then(
    () => { admitted += 1; inflight -= 1; },
    (error: unknown) => {
      failed += 1;
      inflight -= 1;
      const key = (error instanceof Error ? error.message : String(error)).slice(0, 120);
      errors.set(key, (errors.get(key) ?? 0) + 1);
    },
  );
}

const perTick = Math.max(1, Math.round(RATE / 20));
const ticker = setInterval(() => {
  if (Date.now() - started > DURATION_S * 1000) { clearInterval(ticker); return; }
  for (let i = 0; i < perTick && inflight < MAX_INFLIGHT; i += 1) fire();
}, 50);

const reporter = setInterval(async () => {
  const tip = await client.getChainTip().catch(() => null);
  const elapsed = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`t=${elapsed}s tip=${tip?.height ?? "?"} submitted=${submitted} admitted=${admitted} failed=${failed} inflight=${inflight}`);
  if (Date.now() - started > DURATION_S * 1000 && inflight === 0) {
    clearInterval(reporter);
    for (const [message, count] of errors) console.log(`error x${count}: ${message}`);
    console.log(`done: admitted ${admitted}/${submitted} in ${elapsed}s (${(admitted / Number(elapsed)).toFixed(1)} tx/s)`);
    process.exit(0);
  }
}, 1000);
