import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { MockTransport, addressFromBase58, createThruputClient, hashFromBase58, type EventPage } from "@thruputchain/client";
import { groundhog_erc20_if as ERC20 } from "@thruputchain/client/contracts";

import { NATIVE_TOKEN_ADDRESS } from "./client";
import { loadLatestNativeTokenTransfers } from "./latest-native-token-transfers";
import { identifier, transferEvent } from "./test-fixtures";

// Match the existing CommonJS tsx tests by mocking the published SDK factory.
const sdk: typeof import("@thruputchain/client") = createRequire(import.meta.url)("@thruputchain/client");
const from = identifier(0x11);
const to = identifier(0x22);
const zero = identifier(0);

for (const populated of [false, true]) {
  test(`latest native token feed maps ${populated ? "a populated" : "an empty"} page and requests the exact newest-six filter`, async (t) => {
    const client = await createThruputClient({ transport: new MockTransport() });
    t.mock.method(sdk, "createThruputClient", async () => client);
    const page: EventPage = {
      events: populated ? [
        {
          transactionHash: hashFromBase58(identifier(0xab)), blockHeight: 9_007_199_254_740_993n, sequenceNumber: 19,
          event: transferEvent({ contractAddress: NATIVE_TOKEN_ADDRESS, amount: 9_007_199_254_740_993n }),
        },
        {
          transactionHash: hashFromBase58(identifier(0xcd)), blockHeight: 42n, sequenceNumber: 18,
          event: { ...transferEvent({ contractAddress: NATIVE_TOKEN_ADDRESS }), data: new Uint8Array() },
        },
        {
          transactionHash: hashFromBase58(identifier(0xef)), blockHeight: 41n, sequenceNumber: 17,
          event: transferEvent({ contractAddress: NATIVE_TOKEN_ADDRESS, from: zero, amount: 1n }),
        },
        {
          transactionHash: hashFromBase58(identifier(0xde)), blockHeight: 40n, sequenceNumber: 16,
          event: { ...transferEvent({ contractAddress: NATIVE_TOKEN_ADDRESS }), topics: [new Uint8Array(32)] },
        },
        {
          transactionHash: hashFromBase58(identifier(0xfa)), blockHeight: 0n, sequenceNumber: 0,
          event: transferEvent({ contractAddress: NATIVE_TOKEN_ADDRESS, to: zero, amount: 0n }),
        },
      ] : [],
      nextCursor: "0x01", latestIndexedBlockHeight: 9_007_199_254_740_993n, oldestIndexedBlockHeight: 0n,
    };
    const getEvents = t.mock.method(client, "getEvents", async () => page);

    assert.deepEqual(await loadLatestNativeTokenTransfers(), {
      status: "ok",
      nativeTokenAddress: NATIVE_TOKEN_ADDRESS,
      transfers: populated ? [
        {
          txHash: identifier(0xab), blockHeight: "9007199254740993", sequenceNumber: 19,
          name: "Transfer", from, to, amount: "900719925.4740993", symbol: "native tokens",
        },
        {
          txHash: identifier(0xef), blockHeight: "41", sequenceNumber: 17,
          name: "Mint", from: undefined, to, amount: "0.0000001", symbol: "native tokens",
        },
        {
          txHash: identifier(0xfa), blockHeight: "0", sequenceNumber: 0,
          name: "Burn", from, to: undefined, amount: "0", symbol: "native tokens",
        },
      ] : [],
    });
    assert.equal(getEvents.mock.callCount(), 1);
    assert.deepEqual(getEvents.mock.calls[0].arguments, [{
      filters: [{
        addresses: [addressFromBase58(NATIVE_TOKEN_ADDRESS)],
        topics: { topic0: [ERC20.v0_1.events.TransferEvent.signature] },
      }],
      start: { order: "descending", anchor: { kind: "atEnd" } },
      limit: 6,
    }]);
  });
}
