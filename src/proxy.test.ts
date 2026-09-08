import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { NextRequest } from "next/server";

import { GET } from "./app/health/route";
import { proxy } from "./proxy";

const environment = process.env;
beforeEach(() => {
  process.env = { ...environment, NODE_ENV: "production", BASIC_AUTH_USER: "explorer", BASIC_AUTH_PASSWORD: "test:password" };
});
afterEach(() => { process.env = environment; });

function request(path: string, authorization?: string) {
  return new NextRequest(`https://explorer.example${path}`, {
    headers: authorization ? { authorization } : undefined,
  });
}

test("health is public and independent of credentials and RPC availability", async () => {
  delete process.env.BASIC_AUTH_USER;
  delete process.env.BASIC_AUTH_PASSWORD;
  assert.equal(proxy(request("/health")).headers.get("x-middleware-next"), "1");
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "ok");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("pages, API, assets, and health-like paths require authentication", () => {
  for (const path of ["/", "/tx/test", "/address/test", "/api/search", "/_next/static/test.js", "/favicon.ico", "/health/private", "/healthz"]) {
    const response = proxy(request(path));
    assert.equal(response.status, 401, path);
    assert.match(response.headers.get("www-authenticate")!, /^Basic /);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("invalid credentials and malformed authorization never pass", () => {
  for (const authorization of ["Bearer token", "Basic %%%", "Basic", "Basic Og==", `Basic ${Buffer.from("explorer:wrong").toString("base64")}`, `Basic ${Buffer.from("other:test:password").toString("base64")}`]) {
    assert.equal(proxy(request("/", authorization)).status, 401);
  }
});

test("valid credentials allow requests without public caching", () => {
  const authorization = `basic ${Buffer.from("explorer:test:password").toString("base64")}`;
  const response = proxy(request("/api/search", authorization));
  assert.equal(response.headers.get("x-middleware-next"), "1");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("production fails closed with missing, partial, or invalid configuration", () => {
  for (const [username, password] of [["", ""], ["explorer", ""], ["", "password"], ["invalid:user", "password"]]) {
    process.env.BASIC_AUTH_USER = username;
    process.env.BASIC_AUTH_PASSWORD = password;
    assert.equal(proxy(request("/")).status, 503);
  }
});

test("only local development may omit both credentials", () => {
  process.env = { ...process.env, NODE_ENV: "development" };
  delete process.env.BASIC_AUTH_USER;
  delete process.env.BASIC_AUTH_PASSWORD;
  assert.equal(proxy(request("/")).headers.get("x-middleware-next"), "1");
  process.env.BASIC_AUTH_USER = "explorer";
  assert.equal(proxy(request("/")).status, 503);
});
