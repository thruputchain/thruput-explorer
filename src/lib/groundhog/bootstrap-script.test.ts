import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, type TestContext } from "node:test";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const script = join(root, "scripts/bootstrap-local-node.sh");
const fixture = join(root, "tests/fixtures/bootstrap-cli.mjs");

async function setup(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "explorer-bootstrap-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = join(directory, "original-config");
  await mkdir(join(config, "thruput"), { recursive: true });
  const configFile = join(config, "thruput/config.toml");
  const originalConfig = 'default_key = "keep-my-key"\n';
  await writeFile(configFile, originalConfig);
  const cli = join(directory, "fake thruput");
  await writeFile(cli, await readFile(fixture));
  await chmod(cli, 0o700);
  const log = join(directory, "calls.jsonl");
  const output = join(directory, "runs");
  const rpc = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const { id } = JSON.parse(body);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id, result: { height: "1", blockHash: "11111111111111111111111111111111" } }));
  });
  rpc.listen(0, "127.0.0.1");
  await once(rpc, "listening");
  t.after(() => { rpc.closeAllConnections(); rpc.close(); });
  const address = rpc.address();
  assert.ok(address && typeof address !== "string");
  const rpcUrl = `http://127.0.0.1:${address.port}`;

  async function run(overrides: Record<string, string> = {}) {
    const child = spawn("bash", [script], {
      cwd: directory,
      env: {
        ...process.env,
        XDG_CONFIG_HOME: config,
        THRUPUT_CLI: cli,
        GROUNDHOG_RPC_URL: rpcUrl,
        BOOTSTRAP_OUTPUT_DIR: output,
        BOOTSTRAP_TEST_LOG: log,
        THRUPUT_RUNTIME_MANIFEST: "",
        ERC20_PROJECT_DIR: "",
        TICKETMASTER_PROJECT_DIR: "",
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const [code] = await once(child, "close");
    assert.equal(await readFile(configFile, "utf8"), originalConfig);
    return { code, stdout, stderr };
  }
  return {
    directory, output, run,
    calls: async () => (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { args: string[]; cwd: string; config: string }),
    runDirectory: async () => join(output, (await readdir(output))[0]),
  };
}

test("bootstrap funds fresh keys, creates HOG transfers, and retains isolated run evidence", async (t) => {
  const fixture = await setup(t);
  const result = await fixture.run();
  assert.equal(result.code, 0, result.stderr);
  const calls = await fixture.calls();
  assert.deepEqual(calls.map(({ args }) => args[2]), ["keys", "keys", "keys", "config", "airdrop", "airdrop", "airdrop", "transfer", "transfer", "transfer"]);
  assert.deepEqual(calls.filter(({ args }) => args[2] === "transfer").map(({ args }) => args[4]), ["1", "2.5", "0.25"]);
  const run = await fixture.runDirectory();
  assert.equal((await stat(run)).mode & 0o777, 0o700);
  assert.ok(calls.every((call) => call.config === join(run, "config")));
  assert.ok(calls.every((call) => call.cwd === join(run, "work")));
  assert.equal((await readFile(join(run, "links.txt"), "utf8")).trim().split("\n").length, 9);
  assert.match(result.stdout, /Local bootstrap complete/);
});

for (const failure of ["stderr", "reverted", "unconfirmed", "not-ok"]) {
  test(`bootstrap stops without retry and keeps evidence on ${failure}`, async (t) => {
    const fixture = await setup(t);
    const result = await fixture.run({ BOOTSTRAP_TEST_FAILURE: failure });
    assert.notEqual(result.code, 0);
    assert.doesNotMatch(result.stdout, /Local bootstrap complete/);
    const calls = await fixture.calls();
    assert.equal(calls.filter(({ args }) => args[2] === "transfer").length, 1);
    const run = await fixture.runDirectory();
    const journal = (await readFile(join(run, "journal.txt"), "utf8")).trim().split("\n");
    const [, response, diagnostics] = journal.at(-1)!.split("\t");
    assert.match(await readFile(failure === "stderr" ? diagnostics : response, "utf8"), failure === "stderr" ? /transaction_timeout/ : failure === "not-ok" ? /Rejected/ : /txHash/);
    assert.equal((await readFile(join(run, "links.txt"), "utf8")).trim().split("\n").length, 3);
  });
}

test("bootstrap rejects remote RPC before creating run state", async (t) => {
  const fixture = await setup(t);
  const result = await fixture.run({ GROUNDHOG_RPC_URL: "https://example.com/rpc" });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /loopback RPC/);
  await assert.rejects(stat(fixture.output), { code: "ENOENT" });
});

test("optional contracts build before funding and deploy with execution headroom", async (t) => {
  const fixture = await setup(t);
  const erc20 = join(fixture.directory, "erc20 project");
  const ticketmaster = join(fixture.directory, "ticketmaster project");
  for (const directory of [erc20, ticketmaster]) {
    await mkdir(directory);
    await writeFile(join(directory, "Cargo.toml"), "");
  }
  const result = await fixture.run({ ERC20_PROJECT_DIR: erc20, TICKETMASTER_PROJECT_DIR: ticketmaster });
  assert.equal(result.code, 0, result.stderr);
  const calls = await fixture.calls();
  assert.deepEqual(calls.slice(0, 2).map(({ args, cwd }) => ({ args, cwd })), [erc20, ticketmaster].map((cwd) => ({ args: ["--json", "--non-interactive", "build", "--", "--locked"], cwd })));
  const deploys = calls.filter(({ args }) => args[2] === "deploy");
  assert.equal(deploys.length, 3);
  assert.ok(deploys.every(({ args }) => args[args.indexOf("--fund") + 1] === "10"));
  assert.equal(calls.filter(({ args }) => args[2] === "call").length, 12);
});
