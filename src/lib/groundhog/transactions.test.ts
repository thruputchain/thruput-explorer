import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test, type TestContext } from "node:test";

import { HttpTransport, toBase58, toHex0x } from "@thruputchain/client";
import { ERC20Metadata } from "@thruputchain/client/contracts";
import { ExecResult } from "@thruputchain/protocol";

import { NATIVE_HOG_ADDRESS } from "./client";
import { identifier, transferEvent } from "./test-fixtures";
import { loadTransactionPageData } from "./transactions";

const sdk: typeof import("@thruputchain/client") = createRequire(import.meta.url)("@thruputchain/client");
const hash = identifier(0xab);
const height = "9007199254740993";
const chainTipHeight = "9007199254740994";
const rawReceipt = {
  txHash: hash,
  height,
  gasUsed: "1000",
  status: { result: "ok" },
  events: [],
  returnData: null,
  abortData: null,
};

function mockRpc(t: TestContext, overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    groundhog_getTransactionStatus: { status: "committed", height },
    groundhog_getTransactionReceipt: rawReceipt,
    groundhog_chainTip: { height: chainTipHeight, blockHash: hash },
    ...overrides,
  };
  return t.mock.method(HttpTransport.prototype, "request", async (method: string) => {
    assert.ok(Object.hasOwn(responses, method), `Unexpected RPC method: ${method}`);
    const response = responses[method];
    if (response instanceof Error) throw response;
    return typeof response === "function" ? response() : response;
  });
}

for (const status of ["pending", "unknown"]) {
  test(`${status} transactions without a receipt retain their status and chain tip`, async (t) => {
    const request = mockRpc(t, {
      groundhog_getTransactionStatus: { status },
      groundhog_getTransactionReceipt: null,
    });
    const metadata = t.mock.method(ERC20Metadata.v0_1.name, "view", async () => {
      throw new Error("Unexpected metadata lookup without a receipt");
    });

    const result = await loadTransactionPageData(hash);
    assert.equal(result.hash, hash);
    assert.deepEqual(result.status, { status });
    assert.equal(result.receipt, null);
    assert.equal(result.chainTipHeight, chainTipHeight);
    assert.equal(metadata.mock.callCount(), 0);
    assert.deepEqual(
      request.mock.calls.filter(({ arguments: [method] }) => method !== "groundhog_chainTip")
        .map(({ arguments: [, params] }) => params),
      [[hash], [hash]],
    );
  });
}

test("recentFailure converts the conflict bytes and attempt height without losing its code", async (t) => {
  const address = identifier(0xcd);
  const key = "0x00deadbeef";
  mockRpc(t, {
    groundhog_getTransactionStatus: {
      status: "recentFailure",
      attemptHeight: height,
      cause: { kind: "dbConflict", conflict: { address, key, code: "valueMismatch" } },
    },
    groundhog_getTransactionReceipt: null,
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

for (const execResult of ["reverted", "deterministicError", "nonDeterministicError", "failedGasSponsorship"]) {
  test(`committed ${execResult} receipts retain return and abort data`, async (t) => {
    const receipt = {
      ...rawReceipt,
      status: execResult === "deterministicError" ? { result: execResult, kind: "fixtureFailure" } : { result: execResult },
      returnData: "0x00abcd",
      abortData: "0x00deadbeef",
    };
    mockRpc(t, { groundhog_getTransactionReceipt: receipt });

    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status: "committed", height });
    assert.equal(result.chainTipHeight, chainTipHeight);
    assert.ok(result.receipt);
    assert.deepEqual(result.receipt, {
      txHash: hash,
      height,
      execResult,
      returnData: receipt.returnData,
      abortData: receipt.abortData,
      events: [],
      rawJson: JSON.stringify(receipt, null, 2),
    });
  });
}

for (const [code, label] of [
  [ExecResult.ExecResultTxValidationFailure, "validationFailure"],
  [ExecResult.ExecResultSystemError, "systemError"],
  [ExecResult.ExecResultUnrecoverable, "unrecoverable"],
  [999, "unknown (999)"],
] as const) {
  test(`typed receipt execution code ${code} is displayed as ${label}`, async (t) => {
    mockRpc(t);
    // These numeric codes cannot be represented by the SDK's wire status parser.
    t.mock.method(sdk, "getTransactionReceipt", async () => ({
      txHash: new Uint8Array(32).fill(0xab),
      height: BigInt(height),
      execResult: code,
      events: [],
      returnData: null,
      abortData: null,
    }));

    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status: "committed", height });
    assert.ok(result.receipt);
    assert.equal(result.receipt.execResult, label);
    assert.equal(result.receipt.returnData, null);
    assert.equal(result.receipt.abortData, null);
  });
}

test("one receipt response supplies both validated fields and exact raw JSON", async (t) => {
  const receipt = { ...rawReceipt, futureField: { extra: "preserved" } };
  const request = mockRpc(t, { groundhog_getTransactionReceipt: receipt });
  const result = await loadTransactionPageData(hash);
  assert.equal(request.mock.calls.filter(({ arguments: [method] }) => method === "groundhog_getTransactionReceipt").length, 1);
  assert.deepEqual(JSON.parse(result.receipt!.rawJson!), receipt);
});

test("malformed receipt data is rejected by the SDK validator", async (t) => {
  mockRpc(t, { groundhog_getTransactionReceipt: { ...rawReceipt, events: "invalid" } });
  const result = await loadTransactionPageData(hash);
  assert.equal(result.status.status, "unavailable");
  assert.equal(result.receipt, null);
});

for (const method of ["groundhog_getTransactionStatus", "groundhog_getTransactionReceipt"]) {
  test(`required ${method} rejection makes the transaction unavailable`, async (t) => {
    let receiptRequests = 0;
    const error = new Error(`${method} unavailable`);
    mockRpc(t, {
      [method]: method === "groundhog_getTransactionReceipt"
        ? () => {
            // The one receipt request is required.
            receiptRequests++;
            throw error;
          }
        : error,
    });

    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status: "unavailable", error: { message: error.message } });
    assert.equal(result.receipt, null);
    assert.equal(result.chainTipHeight, undefined);
    if (method === "groundhog_getTransactionReceipt") assert.equal(receiptRequests, 1);
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
    contractAddress: toBase58(event.contractAddress),
    topics: event.topics.map(toHex0x),
    data: toHex0x(event.data),
  }));
  const receipt = { ...rawReceipt, events: wireEvents };
  mockRpc(t, { groundhog_getTransactionReceipt: receipt });
  const name = t.mock.method(ERC20Metadata.v0_1.name, "view", async ({ contract }: Parameters<typeof ERC20Metadata.v0_1.name.view>[0]) => ({
    value: toBase58(contract) === contracts[0] ? "First token" : "Second token",
  }));
  const symbol = t.mock.method(ERC20Metadata.v0_1.symbol, "view", async ({ contract }: Parameters<typeof ERC20Metadata.v0_1.symbol.view>[0]) => ({
    value: toBase58(contract) === contracts[0] ? "ONE" : "TWO",
  }));
  const decimals = t.mock.method(ERC20Metadata.v0_1.decimals, "view", async ({ contract }: Parameters<typeof ERC20Metadata.v0_1.decimals.view>[0]) => ({
    value: toBase58(contract) === contracts[0] ? 2n : 3n,
  }));

  const result = await loadTransactionPageData(hash);
  assert.deepEqual(result.status, { status: "committed", height });
  assert.ok(result.receipt);
  for (const view of [name, symbol, decimals]) assert.equal(view.mock.callCount(), 0);
  assert.equal(result.receipt.events[0].decoded, undefined);
  assert.equal(result.receipt.events[0].contractName, undefined);
  const enrichedEvents = await result.loadEnrichedEvents!();
  for (const view of [name, symbol, decimals]) {
    assert.equal(view.mock.callCount(), contracts.length);
    assert.deepEqual(
      view.mock.calls.map(({ arguments: [args] }) => toBase58(args.contract)).sort(),
      contracts,
    );
  }
  assert.deepEqual(enrichedEvents, wireEvents.map((event, index) => ({
    ...event,
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


test("native HOG events have canonical metadata without any view requests", async (t) => {
  const event = transferEvent({ contractAddress: NATIVE_HOG_ADDRESS, from: identifier(0x11), to: identifier(0x22), amount: 10000000n });
  const request = mockRpc(t, { groundhog_getTransactionReceipt: { ...rawReceipt, events: [{ contractAddress: NATIVE_HOG_ADDRESS, topics: event.topics.map(toHex0x), data: toHex0x(event.data) }] } });
  const result = await loadTransactionPageData(hash);
  assert.equal(result.receipt!.events[0].contractName, "HOG");
  assert.equal(result.receipt!.events[0].decoded?.amount, "1");
  assert.equal(result.receipt!.events[0].decoded?.symbol, "HOG");
  assert.deepEqual(await result.loadEnrichedEvents!(), result.receipt!.events);
  assert.equal(request.mock.calls.filter(({ arguments: [method] }) => method === "groundhog_view").length, 0);
});

for (const decimals of [undefined, -1n, 31n, 0n]) {
  test(`custom-token enrichment handles ${decimals === undefined ? "unavailable" : decimals} decimals without guessing the scale`, async (t) => {
    const contractAddress = identifier(0x55);
    const event = transferEvent({ contractAddress, amount: 10000000n });
    const wireEvent = { contractAddress, topics: event.topics.map(toHex0x), data: toHex0x(event.data) };
    const receipt = { ...rawReceipt, events: [wireEvent] };
    mockRpc(t, { groundhog_getTransactionReceipt: receipt });
    t.mock.method(ERC20Metadata.v0_1.name, "view", async () => ({ value: "Custom token" }));
    t.mock.method(ERC20Metadata.v0_1.symbol, "view", async () => ({ value: "TOKEN" }));
    t.mock.method(ERC20Metadata.v0_1.decimals, "view", async () => {
      if (decimals === undefined) throw new Error("Decimals unavailable");
      return { value: decimals };
    });

    const result = await loadTransactionPageData(hash);
    const [enriched] = await result.loadEnrichedEvents!();
    assert.equal(enriched.contractName, "Custom token");
    assert.equal(enriched.contractAddress, wireEvent.contractAddress);
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
    mockRpc(t, { groundhog_getTransactionStatus: { status, error }, groundhog_getTransactionReceipt: null });
    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status, error });
    assert.equal(result.receipt, null);
  });
}

for (const cause of [{ kind: "contractRejected", contractIndex: 1, code: "memoryTooLarge" }, { kind: "other" }]) {
  test(`recent failure retains ${cause.kind} rather than inventing a storage conflict`, async (t) => {
    mockRpc(t, { groundhog_getTransactionStatus: { status: "recentFailure", attemptHeight: height, cause }, groundhog_getTransactionReceipt: null });
    const result = await loadTransactionPageData(hash);
    assert.deepEqual(result.status, { status: "recentFailure", attemptHeight: height, cause });
  });
}

test("known commitment without indexed height remains committed", async (t) => {
  mockRpc(t, { groundhog_getTransactionStatus: { status: "committed" }, groundhog_getTransactionReceipt: null });
  const result = await loadTransactionPageData(hash);
  assert.equal(result.status.status, "committed");
  assert.equal(result.receipt, null);
});
