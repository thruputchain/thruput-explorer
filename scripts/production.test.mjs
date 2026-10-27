import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");

async function startProduction(t) {
  // Obtain an unused RPC port without starting a Thruput node.
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const rpcPort = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));

  let logs = "";
  let spawnError;
  let exited = false;
  const child = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", "0"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      THRUPUT_RPC_URL: `http://127.0.0.1:${rpcPort}`,
      // Empty values also prevent Next from loading credentials from .env files.
      BASIC_AUTH_USER: "",
      BASIC_AUTH_HASH: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => { logs = (logs + chunk).slice(-32_000); });
  }
  child.on("error", (error) => { spawnError = error; });
  const closed = new Promise((resolve) => child.once("close", () => { exited = true; resolve(); }));
  let stopping;
  function stop() {
    return stopping ??= (async () => {
      if (exited) return;
      child.kill("SIGTERM");
      const fallback = setTimeout(() => child.kill("SIGKILL"), 5_000);
      try {
        await closed;
        assert.notEqual(child.signalCode, "SIGKILL", `Next did not stop after SIGTERM\n${logs}`);
      } finally {
        clearTimeout(fallback);
      }
    })();
  }
  const onExit = () => child.kill("SIGKILL");
  const onTerm = () => { void stop().finally(() => process.exit(143)); };
  const onInterrupt = () => { void stop().finally(() => process.exit(130)); };
  process.once("exit", onExit);
  process.once("SIGTERM", onTerm);
  process.once("SIGINT", onInterrupt);
  t.after(async () => {
    try {
      await stop();
    } finally {
      process.removeListener("exit", onExit);
      process.removeListener("SIGTERM", onTerm);
      process.removeListener("SIGINT", onInterrupt);
      if (!t.passed) t.diagnostic(`Next production logs:\n${logs}`);
    }
  });

  let origin;
  let lastError;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    assert.ok(!spawnError && !exited, `Next exited before readiness: ${spawnError ?? child.exitCode}\n${logs}`);
    // Let Next bind port 0 itself, avoiding a free-port selection race.
    origin = logs.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
    if (origin) {
      try {
        const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1_000), redirect: "manual" });
        await response.text();
        if (response.status === 200) break;
        lastError = `GET /health returned ${response.status}`;
      } catch (error) {
        lastError = error;
      }
    }
    await delay(100);
  }
  assert.ok(Date.now() < deadline, `Next was not ready within 30s: ${lastError}\n${logs}`);

  return async function request(path, status, options = {}) {
    try {
      const response = await fetch(new URL(path, origin), {
        ...options,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.text();
      assert.equal(response.status, status, `${options.method ?? "GET"} ${path}: ${body.slice(0, 500)}`);
      assert.equal(response.headers.get("www-authenticate"), null);
      return { response, body };
    } catch (error) {
      throw new Error(`${options.method ?? "GET"} ${path} failed: ${error.message}\nNext production logs:\n${logs}`, { cause: error });
    }
  };
}

test("production is publicly accessible without credentials", { timeout: 120_000 }, async (t) => {
  const request = await startProduction(t);
  const home = await request("/", 200);
  assert.match(home.body, /Some recent blocks are temporarily unavailable\./);
  assert.match(home.body, /Some recent transactions are temporarily unavailable\./);
  const asset = home.body.match(/<script\b[^>]*\bsrc="(\/_next\/static\/[^"?]+\.js(?:\?[^" ]*)?)"/)?.[1];
  assert.ok(asset, "Homepage must reference a built JavaScript asset");
  const assetPath = asset.replaceAll("&amp;", "&");
  const routes = ["/", "/tx/not-a-hash", "/address/not-an-address"];

  for (const path of routes) {
    await t.test(`allows public access to ${path}`, async () => {
      await request(path, 200);
      await request(path, 200, { method: "HEAD" });
      await request(path, 200, { headers: { authorization: "Basic %%%" } });
    });
  }

  await t.test("assets are public", async () => {
    for (const path of ["/icon.svg", "/images/hog.png", assetPath]) {
      const { response } = await request(path, 200);
      assert.equal(response.headers.get("www-authenticate"), null);
      await request(path, 200, { method: "HEAD" });
      await request(path, 200, { headers: { authorization: "Basic %%%" } });
    }
  });

  await t.test("RSC navigation and prefetch requests are public", async () => {
    await request("/tx/not-a-hash?_rsc=", 200, { headers: { rsc: "1" } });
    await request("/tx/not-a-hash", 200, { headers: { "next-router-prefetch": "1", purpose: "prefetch" } });
  });

  await t.test("API validates requests without credentials", async () => {
    const options = { method: "POST", body: "{", headers: { "content-type": "application/json" } };
    const result = await request("/api/search", 400, options);
    assert.equal(JSON.parse(result.body).status, "malformed");
  });

  await t.test("health is public", async () => {
    await request("/health", 200);
  });
});
