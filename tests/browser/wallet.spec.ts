import { expect, test, type Page } from "@playwright/test";
import { PrivateKeySigner, toBase58 } from "@thruputchain/client";
import { createPubkeyAccount } from "@thruputchain/client/wallet";
import { identifier } from "../../src/lib/thruput/test-fixtures";

const signer = new PrivateKeySigner(new Uint8Array(32).fill(1));
const account = { address: toBase58(createPubkeyAccount({ signer, nonce: 7n }).address), publicKey: toBase58(signer.publicKey.ed25519), nonce: "7" };

async function installWallet(page: Page, reject = false) {
  await page.addInitScript(({ account, reject, networkHash }) => {
    let listener: ((session: unknown) => void) | undefined;
    const session = { networkHash, accounts: [account] };
    const provider = {
      info: { id: "test-wallet", name: "Test Wallet", version: "2.0.0" },
      async request({ method }: { method: string }) {
        if (method === "connect") {
          if (reject) throw { code: 4001, message: "Request rejected" };
          listener?.(session);
          return session;
        }
        if (method === "disconnect") { listener?.({ ...session, accounts: [] }); return null; }
        throw new Error(`Unexpected wallet method: ${method}`);
      },
      on(_event: string, callback: (session: unknown) => void) {
        listener = callback;
        return () => { listener = undefined; };
      },
    };
    window.addEventListener("test:wallet-disconnect", () => listener?.({ ...session, accounts: [] }));
    window.addEventListener("groundhog:requestProvider", () => window.dispatchEvent(new CustomEvent("groundhog:announceProvider", { detail: provider })));
  }, { account, reject, networkHash: identifier(0xab) });
}

for (const width of [320, 1280]) {
  test(`wallet shortcut and disconnect at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installWallet(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
    await page.getByRole("button", { name: "Wallet menu" }).click();
    await page.getByRole("menuitem", { name: "View wallet" }).click();
    await expect(page).toHaveURL(`/address/${account.address}`);
    await page.getByRole("button", { name: "Wallet menu" }).click();
    await page.getByRole("menuitem", { name: "Disconnect", exact: true }).click();
    await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("wallet-side revocation clears the shortcut", async ({ page }) => {
  await installWallet(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Wallet menu" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("test:wallet-disconnect")));
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
});

test("missing wallets disable connection and rejected wallets allow retry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: "No Thruput wallet found" })).toHaveCount(0);
  await installWallet(page, true);
  await page.reload();
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Could not connect" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
});
