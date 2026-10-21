import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

const rpcOrigin = `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_PORT ?? 3100) + 1}`;
const txHash = identifier(0xdd);

test("transaction details render while optional metadata is still pending", async ({ page, request }) => {
  await request.post(`${rpcOrigin}/metadata/reset`);
  try {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Recent transactions", exact: true }).getByRole("listitem")).toHaveCount(2);
    const initialState = await (await request.get(`${rpcOrigin}/metadata/state`)).json();
    // Exercise client navigation, the path used when selecting a transaction.
    await page.getByRole("textbox").fill(txHash);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect.poll(async () => (await (await request.get(`${rpcOrigin}/metadata/state`)).json()).pending).toBe(1);
    await expect(page).toHaveURL(`/tx/${txHash}`);
    await expect(page.getByText("Available", { exact: true })).toBeVisible({ timeout: 2_000 });
    await expect(page.getByText("Raw transaction receipt", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Toggle JSON" }).click();
    await expect(page.locator('pre[aria-label="Raw transaction receipt JSON"]')).toContainText(txHash);
    const receiptCode = page.locator('pre[aria-label="Raw transaction receipt JSON"]');
    expect(JSON.parse(await receiptCode.innerText()).txHash).toBe(txHash);
    const colors = await receiptCode.locator(".json-token").evaluateAll((tokens) =>
      [...new Set(tokens.filter((token) => token.textContent?.trim()).map((token) => getComputedStyle(token).color))],
    );
    expect(colors.length).toBeGreaterThan(1);
    await expect(page.getByText("Amount", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Topics", { exact: true })).toBeVisible();
    const state = await (await request.get(`${rpcOrigin}/metadata/state`)).json();
    // The home activity feed also reads receipts; navigation adds exactly one.
    expect(state).toEqual({ pending: 1, receiptRequests: initialState.receiptRequests + 1, released: false });

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
