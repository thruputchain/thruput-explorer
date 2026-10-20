import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

const rpcOrigin = `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_PORT ?? 3100) + 1}`;
const txHash = identifier(0xdd);

test("transaction details render while optional metadata is still pending", async ({ page, request }) => {
  await request.post(`${rpcOrigin}/metadata/reset`);
  try {
    await page.goto("/");
    // Exercise client navigation, the path used when selecting a transaction.
    await page.getByRole("textbox").fill(txHash);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect.poll(async () => (await (await request.get(`${rpcOrigin}/metadata/state`)).json()).pending).toBe(1);
    await expect(page).toHaveURL(`/tx/${txHash}`);
    await expect(page.getByText("Available", { exact: true })).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText("Raw transaction receipt", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Toggle JSON" }).click();
    await expect(page.locator('pre[aria-label="Raw transaction receipt JSON"]')).toContainText(txHash);
    await expect(page.getByText("Amount", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Topics", { exact: true })).toBeVisible();
    const state = await (await request.get(`${rpcOrigin}/metadata/state`)).json();
    expect(state).toEqual({ pending: 1, receiptRequests: 1, released: false });

    // Metadata failures leave the receipt and raw events available.
    await request.post(`${rpcOrigin}/metadata/release`);
    await expect.poll(async () => (await (await request.get(`${rpcOrigin}/metadata/state`)).json()).pending).toBe(0);
    await expect(page.getByText("Topics", { exact: true })).toBeVisible();
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await expect(page.locator('pre[aria-label="Raw transaction receipt JSON"]')).toContainText(txHash);
  } finally {
    await request.post(`${rpcOrigin}/metadata/release`);
  }
});
