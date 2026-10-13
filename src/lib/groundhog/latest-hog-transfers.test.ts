import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { MockTransport, addressFromHex, createThruputClient, hashFromHex, type EventPage } from "@thruputchain/client";
import { groundhog_erc20_if } from "@thruputchain/client/contracts";

import { NATIVE_HOG_ADDRESS } from "./client";
import { loadLatestHogTransfers } from "./latest-hog-transfers";
import { transferEvent } from "./test-fixtures";

// Match the existing CommonJS tsx tests by mocking the published SDK factory.
const sdk: typeof import("@thruputchain/client") = createRequire(import.meta.url)("@thruputchain/client");
const from = `0x${"11".repeat(32)}`;
const to = `0x${"22".repeat(32)}`;
const zero = `0x${"00".repeat(32)}`;

for (const populated of [false, true]) {
  test(`latest HOG feed maps ${populated ? "a populated" : "an empty"} page and requests the exact newest-six filter`, async (t) => {
    const client = await createThruputClient({ transport: new MockTransport() });
    t.mock.method(sdk, "createThruputClient", async () => client);
    const page: EventPage = {
      events: populated ? [
        {
          txHash: hashFromHex(`0x${"ab".repeat(32)}`), blockHeight: 9_007_199_254_740_993n, sequenceNumber: 19,
          event: transferEvent({ contractAddress: NATIVE_HOG_ADDRESS, amount: 9_007_199_254_740_993n }),
        },
        {
          txHash: hashFromHex(`0x${"cd".repeat(32)}`), blockHeight: 42n, sequenceNumber: 18,
          event: { ...transferEvent({ contractAddress: NATIVE_HOG_ADDRESS }), data: new Uint8Array() },
        },
        {
          txHash: hashFromHex(`0x${"ef".repeat(32)}`), blockHeight: 41n, sequenceNumber: 17,
          event: transferEvent({ contractAddress: NATIVE_HOG_ADDRESS, from: zero, amount: 1n }),
        },
        {
          txHash: hashFromHex(`0x${"de".repeat(32)}`), blockHeight: 40n, sequenceNumber: 16,
          event: { ...transferEvent({ contractAddress: NATIVE_HOG_ADDRESS }), topics: [new Uint8Array(32)] },
        },
        {
          txHash: hashFromHex(`0x${"fa".repeat(32)}`), blockHeight: 0n, sequenceNumber: 0,
          event: transferEvent({ contractAddress: NATIVE_HOG_ADDRESS, to: zero, amount: 0n }),
        },
      ] : [],
      cursor: new Uint8Array([1]), latestBlock: 9_007_199_254_740_993n, oldestBlock: 0n,
    };
    const getEvents = t.mock.method(client, "getEvents", async () => page);

    assert.deepEqual(await loadLatestHogTransfers(), {
      status: "ok",
      nativeTokenAddress: NATIVE_HOG_ADDRESS,
      transfers: populated ? [
        {
          txHash: `0x${"ab".repeat(32)}`, blockHeight: "9007199254740993", sequenceNumber: 19,
          name: "Transfer", from, to, amount: "900719925.4740993", symbol: "HOG",
        },
        {
          txHash: `0x${"ef".repeat(32)}`, blockHeight: "41", sequenceNumber: 17,
          name: "Mint", from: undefined, to, amount: "0.0000001", symbol: "HOG",
        },
        {
          txHash: `0x${"fa".repeat(32)}`, blockHeight: "0", sequenceNumber: 0,
          name: "Burn", from, to: undefined, amount: "0", symbol: "HOG",
        },
      ] : [],
    });
    assert.equal(getEvents.mock.callCount(), 1);
    assert.deepEqual(getEvents.mock.calls[0].arguments, [{
      filters: [{
        contractAddresses: [addressFromHex(NATIVE_HOG_ADDRESS)],
        topics: { topic0: [groundhog_erc20_if.v0_1.events.TransferEvent.signature] },
      }],
      order: "descending",
      anchor: "end",
      limit: 6,
    }]);
  });
}
