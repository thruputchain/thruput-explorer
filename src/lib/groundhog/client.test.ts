import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";

import { createExplorerGroundhogClient, getExplorerRpcConfig } from "./client";

test("RPC config displays only the origin, never credentials, path, or query", (t) => {
  const previous = process.env.GROUNDHOG_RPC_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.GROUNDHOG_RPC_URL;
    else process.env.GROUNDHOG_RPC_URL = previous;
  });
  process.env.GROUNDHOG_RPC_URL = "  https://user:secret@rpc.example:8443/private/key?api_key=secret#token  ";
  assert.equal(getExplorerRpcConfig().rpcUrl, "https://rpc.example:8443");
  process.env.GROUNDHOG_RPC_URL = "not a URL containing secret";
  assert.equal(getExplorerRpcConfig().rpcUrl, "Configured RPC");
  process.env.GROUNDHOG_RPC_URL = "  ";
  assert.equal(getExplorerRpcConfig().rpcUrl, "http://localhost:9545");
});

test("the 10000ms RPC deadline remains active while reading a delayed body", { timeout: 3000 }, async (t) => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.flushHeaders();
    const timer = setTimeout(() => response.end('{"jsonrpc":"2.0","id":1,"result":null}'), 500);
    response.on("close", () => clearTimeout(timer));
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const previous = process.env.GROUNDHOG_RPC_URL;
  process.env.GROUNDHOG_RPC_URL = `http://127.0.0.1:${address.port}`;
  t.after(() => {
    if (previous === undefined) delete process.env.GROUNDHOG_RPC_URL;
    else process.env.GROUNDHOG_RPC_URL = previous;
  });

  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  const timeout = t.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
    assert.equal(milliseconds, 10_000);
    return originalTimeout(50);
  });
  const originalFetch = globalThis.fetch;
  let headersReceived = false;
  t.mock.method(globalThis, "fetch", async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    headersReceived = true;
    return response;
  });

  const { transport } = await createExplorerGroundhogClient();
  await assert.rejects(transport.request("groundhog_chainTip"), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.name, /^(AbortError|TimeoutError)$/);
    return true;
  });
  assert.equal(headersReceived, true, "the deadline must abort body reading, not just the connection");
  assert.equal(timeout.mock.callCount(), 1);
});
