import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";

import { HttpTransport, MockTransport, JsonRpcError, toBase58, toHex0x } from "@thruputchain/client";

import { NATIVE_TOKEN_ADDRESS } from "./client";
import { identifier, metadataBatchResponse, transferEvent } from "./test-fixtures";
import { loadTransactionPageData } from "./transactions";

const hash = identifier(0xab);
const height = "9007199254740993";
const chainTipHeight = "9007199254740994";
const rawReceipt = {
  transactionHash: hash,
  blockHeight: height,
  gasUsed: "1000",
  execution: { result: "return", returnData: "0x" },
  events: [],
};

function mockRpc(t: TestContext, overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    getTransactionStatus: { status: "committed", blockHeight: height },
    getTransactionReceipt: rawReceipt,
    getChainTip: { blockHeight: chainTipHeight, blockHash: hash },
    ...overrides,
  };
  const discovery = new MockTransport();
  return t.mock.method(HttpTransport.prototype, "request", async (method: string, params?: Record<string, unknown>) => {
    assert.ok(!Array.isArray(params), "Native requests must use named parameters");
    if (["getVersionInfo", "getNetworkInfo", "getServerLimits"].includes(method)) return discovery.request(method);
    assert.ok(Object.hasOwn(responses, method), `Unexpected RPC method: ${method}`);
    const response = responses[method];
    if (response instanceof Error) throw response;
    return typeof response === "function" ? response(params) : response;
  });
}

for (const status of ["pending", "unknown"]) {
  test(`${status} transactions without a receipt retain their status and chain tip`, async (t) => {
    const request = mockRpc(t, {
      getTransactionStatus: { status },
      getTransactionReceipt: null,
    });

    const result = await loadTransactionPageData(hash);
    assert.equal(result.hash, hash);
    assert.deepEqual(result.status, { status });
    assert.equal(result.receipt, null);
    assert.equal(result.chainTipHeight, chainTipHeight);
    assert.equal(request.mock.calls.filter(({ arguments: [method] }) => method === "simulateInvocations").length, 0);
    assert.deepEqual(
      request.mock.calls.filter(({ arguments: [method] }) => ["getTransactionStatus", "getTransactionReceipt"].includes(method))
        .map(({ arguments: [, params] }) => params),
      [{ transactionHash: hash }, { transactionHash: hash }],
    );
  });
}

test("recentFailure converts the conflict bytes and attempt height without losing its code", async (t) => {
  const address = identifier(0xcd);
  const key = "0x00deadbeef";
  mockRpc(t, {
    getTransactionStatus: {
      status: "recentFailure",
      attemptBlockHeight: height,
      cause: { kind: "dbConflict", conflict: { address, key, code: "valueMismatch" } },
    },
    getTransactionReceipt: null,
  });

  const result = await loadTransactionPageData(hash);
  assert.deepEqual(result.status, {
    status: "recentFailure",
    attemptHeight: height,
    cause: { kind: "dbConflict", conflict: { address, key, code: "valueMismatch" } },
  });
  assert.equal(result.receipt, null);
  assert.equal(result.chainTipHeight, chainTipHeight);
});

for (const outcome of ["return", "abort", "fault", "nonDeterministicError", "failedGasSponsorship", "other"]) {
  test(`committed ${outcome} receipts retain execution and its payload`, async (t) => {
    const receipt = {
      ...rawReceipt,
      execution: { result: outcome, ...(outcome === "return" ? { returnData: "0x00abcd" } : outcome === "abort" ? { abortData: "0x00deadbeef" } : {}) },
    };
    mockRpc(t, { getTransactionReceipt: receipt });

    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status: "committed", height });
    assert.equal(result.chainTipHeight, chainTipHeight);
    assert.ok(result.receipt);
    assert.deepEqual(result.receipt, {
      txHash: hash,
      height,
      execution: outcome,
      gasUsed: "1000",
      returnData: outcome === "return" ? "0x00abcd" : null,
      abortData: outcome === "abort" ? "0x00deadbeef" : null,
      events: [],
      rawJson: JSON.stringify(receipt, null, 2),
    });
  });
}

test("future execution variants retain commitment and exact raw evidence", async (t) => {
  const receipt = { ...rawReceipt, execution: { result: "future", detail: 7 } };
  mockRpc(t, { getTransactionReceipt: receipt });
  const result = await loadTransactionPageData(hash);
  assert.deepEqual(result.status, { status: "committed", height });
  assert.equal(result.receipt?.execution, "unsupported");
  assert.deepEqual(JSON.parse(result.receipt!.rawJson!), receipt);
});

test("one receipt response supplies both validated fields and exact raw JSON", async (t) => {
  const receipt = { ...rawReceipt, futureField: { extra: "preserved" } };
  const request = mockRpc(t, { getTransactionReceipt: receipt });
  const result = await loadTransactionPageData(hash);
  assert.equal(request.mock.calls.filter(({ arguments: [method] }) => method === "getTransactionReceipt").length, 1);
  assert.deepEqual(JSON.parse(result.receipt!.rawJson!), receipt);
});

test("malformed receipt data retains independently observed commitment", async (t) => {
  mockRpc(t, { getTransactionReceipt: { ...rawReceipt, events: "invalid" } });
  const result = await loadTransactionPageData(hash);
  assert.deepEqual(result.status, { status: "committed", height });
  assert.equal(result.receipt, null);
  assert.ok(result.receiptError);
});

for (const method of ["getTransactionStatus", "getTransactionReceipt"]) {
  test(`${method} rejection preserves independent commitment evidence`, async (t) => {
    const error = new Error(`${method} unavailable`);
    const request = mockRpc(t, { [method]: error });

    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status: "committed", height });
    assert.equal(result.receipt === null, method === "getTransactionReceipt");
    assert.equal(result.chainTipHeight, chainTipHeight);
    assert.equal(request.mock.calls.filter(({ arguments: [method] }) => method === "getTransactionReceipt").length, 1);
  });
}

test("core events load without metadata; enrichment queries each unique contract once", async (t) => {
  const contracts = [identifier(0x11), identifier(0x22)];
  const from = identifier(0x33);
  const to = identifier(0x44);
  const events = [contracts[0], contracts[1], contracts[0]].map((contractAddress, index) =>
    transferEvent({ contractAddress, from, to, amount: BigInt(index + 1) * 125n }),
  );
  const wireEvents = events.map((event) => ({
    address: toBase58(event.address),
    topics: event.topics.map(toHex0x),
    data: toHex0x(event.data),
  }));
  const receipt = { ...rawReceipt, events: wireEvents };
  const metadataContracts: string[] = [];
  mockRpc(t, {
    getTransactionReceipt: receipt,
    simulateInvocations: (params: { invocations: Array<{ address: string }> }) => {
      const calls = params.invocations;
      assert.equal(calls.length, 3);
      assert.ok(calls.every((call) => call.address === calls[0].address));
      metadataContracts.push(calls[0].address);
      return metadataBatchResponse(calls[0].address === contracts[0] ? ["First token", "ONE", 2n] : ["Second token", "TWO", 3n]);
    },
  });

  const result = await loadTransactionPageData(hash);
  assert.deepEqual(result.status, { status: "committed", height });
  assert.ok(result.receipt);
  assert.deepEqual(metadataContracts, []);
  assert.equal(result.receipt.events[0].decoded, undefined);
  assert.equal(result.receipt.events[0].contractName, undefined);
  const enrichedEvents = await result.loadEnrichedEvents!();
  assert.deepEqual(metadataContracts.sort(), contracts);
  assert.deepEqual(enrichedEvents, wireEvents.map((event, index) => ({
    contractAddress: event.address, topics: event.topics, data: event.data,
    contractName: index === 1 ? "Second token" : "First token",
    decoded: {
      kind: "token-transfer",
      name: "Transfer",
      from,
      to,
      rawAmount: String((index + 1) * 125),
      amount: ["1.25", "0.25", "3.75"][index],
      symbol: index === 1 ? "TWO" : "ONE",
    },
  })));
  assert.deepEqual(JSON.parse(result.receipt.rawJson!), receipt);
});


test("bounded enrichment preserves all events and labels omitted metadata", async (t) => {
  const events = Array.from({ length: 33 }, (_, index) => {
    const event = transferEvent({ contractAddress: identifier(index + 1) });
    return { address: toBase58(event.address), topics: event.topics.map(toHex0x), data: toHex0x(event.data) };
  });
  const request = mockRpc(t, {
    getTransactionReceipt: { ...rawReceipt, events },
    simulateInvocations: metadataBatchResponse(["Token", "TOK", 2n]),
  });
  const result = await loadTransactionPageData(hash);
  const enriched = await result.loadEnrichedEvents!();
  assert.equal(enriched.length, 33);
  assert.equal(enriched[32].data, events[32].data);
  assert.match(enriched[32].enrichmentNotice!, /limited to 32 contracts/);
  assert.equal(request.mock.calls.filter(({ arguments: [method] }) => method === "simulateInvocations").length, 32);
});

test("native token events have canonical metadata without any view requests", async (t) => {
  const event = transferEvent({ contractAddress: NATIVE_TOKEN_ADDRESS, from: identifier(0x11), to: identifier(0x22), amount: 10000000n });
  const request = mockRpc(t, { getTransactionReceipt: { ...rawReceipt, events: [{ address: NATIVE_TOKEN_ADDRESS, topics: event.topics.map(toHex0x), data: toHex0x(event.data) }] } });
  const result = await loadTransactionPageData(hash);
  assert.equal(result.receipt!.events[0].contractName, "Native token");
  assert.equal(result.receipt!.events[0].decoded?.amount, "1");
  assert.equal(result.receipt!.events[0].decoded?.symbol, "native tokens");
  assert.deepEqual(await result.loadEnrichedEvents!(), result.receipt!.events);
  assert.equal(request.mock.calls.filter(({ arguments: [method] }) => method === "simulateInvocation" || method === "simulateInvocations").length, 0);
});

for (const decimals of [undefined, null, 31n, 0n]) {
  test(`custom-token enrichment handles ${decimals === undefined ? "unavailable" : decimals} decimals without guessing the scale`, async (t) => {
    const contractAddress = identifier(0x55);
    const event = transferEvent({ contractAddress, amount: 10000000n });
    const wireEvent = { address: contractAddress, topics: event.topics.map(toHex0x), data: toHex0x(event.data) };
    const receipt = { ...rawReceipt, events: [wireEvent] };
    mockRpc(t, {
      getTransactionReceipt: receipt,
      simulateInvocations: metadataBatchResponse(["Custom token", "TOKEN", decimals]),
    });

    const result = await loadTransactionPageData(hash);
    const [enriched] = await result.loadEnrichedEvents!();
    assert.equal(enriched.contractName, "Custom token");
    assert.equal(enriched.contractAddress, wireEvent.address);
    assert.deepEqual(enriched.topics, wireEvent.topics);
    assert.equal(enriched.data, wireEvent.data);
    assert.deepEqual(JSON.parse(result.receipt!.rawJson!), receipt);
    if (decimals === 0n) {
      assert.equal(enriched.decoded?.amount, "10000000");
      assert.equal(enriched.decoded?.symbol, "TOKEN");
    } else {
      assert.equal(enriched.decoded, undefined);
    }
  });
}

for (const status of ["retry", "dropped"] as const) {
  test(`${status} preserves the scheduler diagnostic without a receipt`, async (t) => {
    const error = { source: "scheduler", code: -7 };
    mockRpc(t, { getTransactionStatus: { status, error }, getTransactionReceipt: null });
    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status, error });
    assert.equal(result.receipt, null);
  });
}

for (const cause of [{ kind: "contractRejected", contractIndex: 1, code: "memoryTooLarge" }, { kind: "other" }]) {
  test(`recent failure retains ${cause.kind} rather than inventing a storage conflict`, async (t) => {
    mockRpc(t, { getTransactionStatus: { status: "recentFailure", attemptBlockHeight: height, cause }, getTransactionReceipt: null });
    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status: "recentFailure", attemptHeight: height, cause });
  });
}

test("known commitment without a receipt retains its block height", async (t) => {
  mockRpc(t, { getTransactionStatus: { status: "committed", blockHeight: height }, getTransactionReceipt: null });
  const result = await loadTransactionPageData(hash);
  assert.equal(result.status.status, "committed");
  assert.equal(result.receipt, null);
});

for (const status of ["pending", "retry", "dropped"]) {
  test(`${status} retains recent failure without replacing scheduler state`, async (t) => {
    const cause = { kind: "contractRejected", contractIndex: 1, code: "memoryTooLarge" };
    mockRpc(t, { getTransactionStatus: { status, ...(status === "pending" ? {} : { error: { source: "scheduler", code: -7 } }), recentFailure: { attemptBlockHeight: height, cause } }, getTransactionReceipt: null });
    const result = await loadTransactionPageData(hash);
    assert.equal(result.status.status, status);
    assert.ok("recentFailure" in result.status);
    assert.deepEqual(result.status.recentFailure, { attemptHeight: height, cause });
  });
}

test("unknown transaction status remains visible with raw evidence", async (t) => {
  const status = { status: "future", diagnostic: "retained" };
  mockRpc(t, { getTransactionStatus: status, getTransactionReceipt: null });
  const result = await loadTransactionPageData(hash);
  assert.deepEqual(result.status, { status: "unsupported", rawJson: JSON.stringify(status, null, 2) });
});

test("receipt error observation preserves commitment even when status is unavailable", async (t) => {
  mockRpc(t, {
    getTransactionStatus: new Error("Status unavailable"),
    getTransactionReceipt: new JsonRpcError(-32054, "Invalid backend data", { kind: "backendDataInvalid", observation: { transactionHash: hash, blockHeight: height } }, "getTransactionReceipt"),
  });
  const result = await loadTransactionPageData(hash);
  assert.deepEqual(result.status, { status: "committed", height });
  assert.equal(result.receipt, null);
  assert.ok(result.receiptError);
});

test("receipt errors cannot establish commitment for a different transaction", async (t) => {
  mockRpc(t, {
    getTransactionStatus: { status: "unknown" },
    getTransactionReceipt: new JsonRpcError(-32054, "Invalid backend data", { kind: "backendDataInvalid", observation: { transactionHash: identifier(1), blockHeight: height } }, "getTransactionReceipt"),
  });
  const result = await loadTransactionPageData(hash);
  assert.equal(result.status.status, "unknown");
  assert.equal(result.receipt, null);
  assert.ok(result.receiptError);
});
