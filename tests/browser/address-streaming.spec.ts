import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

const rpcOrigin = `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_PORT ?? 3100) + 1}`;

test("address summary and transaction links render before optional receipt details", async ({ page, request }) => {
  await request.post(`${rpcOrigin}/activity/reset`);
  try {
    await page.goto(`/address/${identifier(0x66)}`, { waitUntil: "commit" });
    await expect.poll(async () => (await (await request.get(`${rpcOrigin}/activity/state`)).json()).pending).toBe(1);
    await expect(page.getByRole("heading", { name: "Summary", exact: true })).toBeVisible();
    const transactions = page.getByRole("tabpanel", { name: "Transactions", exact: true });
    await expect(transactions.locator(`a[href="/tx/${identifier(0xdf)}"]`)).toBeVisible();
    await expect(transactions.getByRole("list")).toHaveAttribute("aria-busy", "true");
    await request.post(`${rpcOrigin}/activity/release`);
    await expect(transactions.getByText("Loading details…")).toHaveCount(0);
    await expect(transactions.getByText("Transfer", { exact: true }).first()).toBeVisible();
    await expect(transactions.locator(`a[href="/tx/${identifier(0xdf)}"]`)).toBeVisible();
  } finally {
    await request.post(`${rpcOrigin}/activity/release`);
  }
});
