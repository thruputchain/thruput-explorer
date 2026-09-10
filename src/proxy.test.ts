import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { hashSync } from "bcryptjs";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { GET } from "./app/health/route";
import { config, proxy } from "./proxy";

const environment = process.env;
const password = "test:password";
const passwordHash = hashSync(password, 4);
beforeEach(() => {
  process.env = { ...environment, NODE_ENV: "production", BASIC_AUTH_USER: "explorer", BASIC_AUTH_HASH: passwordHash };
  delete process.env.BASIC_AUTH_PASSWORD;
});
afterEach(() => { process.env = environment; });

function request(path: string, authorization?: string) {
  return new NextRequest(`https://explorer.example${path}`, {
    headers: authorization ? { authorization } : undefined,
  });
}

function basic(credentials: string) {
  return `basic ${Buffer.from(credentials).toString("base64")}`;
}

test("health is public and independent of credentials and RPC availability", async () => {
  delete process.env.BASIC_AUTH_USER;
  delete process.env.BASIC_AUTH_HASH;
  assert.equal((await proxy(request("/health"))).headers.get("x-middleware-next"), "1");
  process.env.BASIC_AUTH_HASH = "not-a-hash";
  assert.equal((await proxy(request("/health", "Basic %%%"))).headers.get("x-middleware-next"), "1");
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("public asset paths skip the proxy", () => {
  for (const url of ["/_next/static/chunks/test.js", "/_next/static/media/font.woff2", "/images/hog.png", "/images/hog.png?v=2", "/favicon.ico"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url }), false, url);
  }
});

test("pages, API, data, and asset-like paths require authentication", async () => {
  for (const path of ["/", "/tx/test", "/address/test", "/api/search", "/_next/data/build/tx/test.json", "/_next/image", "/images-private/test.png", "/_next/static-private/test.js", "/favicon.ico/private", "/faviconXico", "/api/export.csv", "/health/private", "/healthz"]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }), true, path);
    const response = await proxy(request(path));
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get("www-authenticate")!, /^Basic /);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("RSC and prefetch requests still run the proxy", () => {
  for (const headers of [{ rsc: "1" }, { "next-router-prefetch": "1" }, { purpose: "prefetch" }]) {
    assert.equal(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/tx/test?_rsc=test", headers }), true);
  }
});

test("invalid credentials and malformed authorization never pass", async () => {
  for (const authorization of ["Bearer token", "Basic %%%", "Basic", "Basic Og==", basic("explorer"), basic("explorer:"), basic("explorer:wrong"), basic(`other:${password}`)]) {
    const response = await proxy(request("/", authorization));
    assert.equal(response.status, 401, authorization);
    assert.match(response.headers.get("www-authenticate")!, /^Basic /);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-middleware-next"), null);
  }
});

test("valid credentials with a colon in the password allow requests without public caching", async () => {
  const response = await proxy(request("/api/search", basic(`explorer:${password}`)));
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("production fails closed with missing, partial, or invalid configuration", async () => {
  delete process.env.BASIC_AUTH_USER;
  delete process.env.BASIC_AUTH_HASH;
  assert.equal((await proxy(request("/"))).status, 503);
  for (const [username, hash] of [["", ""], ["explorer", ""], ["", passwordHash], ["invalid:user", passwordHash]]) {
    process.env.BASIC_AUTH_USER = username;
    process.env.BASIC_AUTH_HASH = hash;
    const response = await proxy(request("/"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-middleware-next"), null);
  }
});

test("malformed bcrypt hashes fail closed even with matching plaintext credentials", async () => {
  for (const hash of [
    password,
    passwordHash.replace("$04$", "$03$"),
    passwordHash.replace("$04$", "$32$"),
    passwordHash.replace("$04$", "$xx$"),
    passwordHash.replace(/^\$2b\$/, "$2x$"),
    passwordHash.slice(0, -1),
    `${passwordHash}A`,
    `${passwordHash.slice(0, -1)}!`,
    `${passwordHash}\n`,
  ]) {
    process.env.BASIC_AUTH_HASH = hash;
    const response = await proxy(request("/", basic(`explorer:${password}`)));
    assert.equal(response.status, 503, hash);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-middleware-next"), null);
  }
});

test("supported bcrypt prefixes authenticate the original password", async () => {
  for (const prefix of ["2a", "2b", "2y"]) {
    process.env.BASIC_AUTH_HASH = `$${prefix}${passwordHash.slice(3)}`;
    const response = await proxy(request("/", basic(`explorer:${password}`)));
    assert.equal(response.headers.get("x-middleware-next"), "1", prefix);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
});

test("the public Caddy bcrypt fixture accepts hiccup, not the hash string", async () => {
  // Public example from https://caddyserver.com/docs/caddyfile/directives/basic_auth
  const hash = "$2a$14$Zkx19XLiW6VYouLHR5NmfOFU0z2GTNmpkT/5qqR7hx4IjWJPDhjvG";
  process.env.BASIC_AUTH_HASH = hash;
  const response = await proxy(request("/", basic("explorer:hiccup")));
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal((await proxy(request("/", basic(`explorer:${hash}`)))).status, 401);
});

test("the legacy plaintext password is ignored and cannot replace a hash", async () => {
  process.env.BASIC_AUTH_PASSWORD = "legacy-password";
  assert.equal((await proxy(request("/", basic("explorer:legacy-password")))).status, 401);
  assert.equal((await proxy(request("/", basic(`explorer:${password}`)))).headers.get("x-middleware-next"), "1");
  delete process.env.BASIC_AUTH_HASH;
  assert.equal((await proxy(request("/", basic("explorer:legacy-password")))).status, 503);
});

test("only local development may omit both credentials", async () => {
  process.env = { ...process.env, NODE_ENV: "test" };
  delete process.env.BASIC_AUTH_USER;
  delete process.env.BASIC_AUTH_HASH;
  assert.equal((await proxy(request("/"))).status, 503);
  process.env = { ...process.env, NODE_ENV: "development" };
  assert.equal((await proxy(request("/"))).headers.get("x-middleware-next"), "1");
  process.env.BASIC_AUTH_USER = "explorer";
  assert.equal((await proxy(request("/"))).status, 503);
  delete process.env.BASIC_AUTH_USER;
  process.env.BASIC_AUTH_HASH = passwordHash;
  assert.equal((await proxy(request("/"))).status, 503);
  process.env.BASIC_AUTH_USER = "explorer";
  assert.equal((await proxy(request("/"))).status, 401);
  assert.equal((await proxy(request("/", basic(`explorer:${password}`)))).headers.get("x-middleware-next"), "1");
  process.env.BASIC_AUTH_HASH = "not-a-hash";
  assert.equal((await proxy(request("/"))).status, 503);
});
