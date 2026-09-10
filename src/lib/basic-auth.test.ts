import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, hashSync } from "bcryptjs";

import { createPasswordVerifier } from "./basic-auth";

test("reuses successful checks and shares concurrent bcrypt work", async (t) => {
  const hash = hashSync("test-password", 4);
  const compareSpy = t.mock.fn((password: string, hash: string) => compare(password, hash));
  const verify = createPasswordVerifier(compareSpy);
  assert.deepEqual(await Promise.all(Array.from({ length: 10 }, () => verify("test-password", "user", hash))), Array(10).fill(true));
  assert.equal(await verify("test-password", "user", hash), true);
  assert.equal(compareSpy.mock.callCount(), 1);
  assert.equal(await verify("wrong-password", "user", hash), false);
  assert.equal(await verify("wrong-password", "user", hash), false);
  assert.equal(compareSpy.mock.callCount(), 3);
});

test("expires five minutes after verification without extending on cache hits", async (t) => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const compareSpy = t.mock.fn(async () => true);
  const verify = createPasswordVerifier(compareSpy);
  await verify("password", "user", "hash");
  now += 299_999;
  await verify("password", "user", "hash");
  assert.equal(compareSpy.mock.callCount(), 1);
  now += 1;
  await verify("password", "user", "hash");
  assert.equal(compareSpy.mock.callCount(), 2);
});

test("configured username and hash changes require fresh verification", async (t) => {
  const originalHash = hashSync("original", 4);
  const rotatedHash = hashSync("rotated", 4);
  const compareSpy = t.mock.fn((password: string, hash: string) => compare(password, hash));
  const verify = createPasswordVerifier(compareSpy);
  assert.equal(await verify("original", "user", originalHash), true);
  assert.equal(await verify("original", "new-user", originalHash), true);
  assert.equal(await verify("original", "new-user", rotatedHash), false);
  assert.equal(await verify("rotated", "new-user", rotatedHash), true);
  assert.equal(compareSpy.mock.callCount(), 4);
});

test("evicts the oldest entry when the bounded cache fills", async (t) => {
  const compareSpy = t.mock.fn(async () => true);
  const verify = createPasswordVerifier(compareSpy);
  for (let index = 0; index < 33; index++) await verify(`password-${index}`, "user", "hash");
  await verify("password-32", "user", "hash");
  assert.equal(compareSpy.mock.callCount(), 33);
  await verify("password-0", "user", "hash");
  assert.equal(compareSpy.mock.callCount(), 34);
});

test("verification errors are not cached", async (t) => {
  const compareSpy = t.mock.fn((): Promise<boolean> => { throw new Error("verification failed"); });
  const verify = createPasswordVerifier(compareSpy);
  await assert.rejects(verify("password", "user", "hash"), /verification failed/);
  await assert.rejects(verify("password", "user", "hash"), /verification failed/);
  assert.equal(compareSpy.mock.callCount(), 2);
});
