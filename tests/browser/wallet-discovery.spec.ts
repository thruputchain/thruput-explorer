import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

for (const width of [390, 1280]) {
  test(`native wallet discovery shows built-in methods at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("textbox", { name: "Block height, transaction hash or address" }).fill(identifier(0xc2));
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(`/address/${identifier(0xc2)}`);
    await expect(page.getByRole("heading", { name: "DefaultWallet", exact: true })).toBeVisible();
    await expect(page.getByText("Wallet", { exact: true })).toBeVisible();
    await expect(page.getByText("Network default", { exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Transactions", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Contract spec" }).click();
    await expect(page.getByRole("cell", { name: "execute", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "deploy", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Errors", exact: true })).toBeVisible();
    await page.getByText("Technical details", { exact: true }).click();
    await expect(page.getByText("Built-in interface · not artifact-bound", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("RV32 fallback uses its own interface and explicit deployment has precedence", async ({ page }) => {
  await page.goto(`/address/${identifier(0xc3)}`);
  await expect(page.getByRole("heading", { name: "Counter", exact: true })).toBeVisible();
  await expect(page.getByText("Network default", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Contract spec" }).click();
  await expect(page.getByRole("cell", { name: "increment", exact: true })).toBeVisible();
  await page.goto(`/address/${identifier(0xc1)}`);
  await expect(page.getByRole("heading", { name: "Counter", exact: true })).toBeVisible();
  await expect(page.getByText("Network default", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "DefaultWallet", exact: true })).toHaveCount(0);
});

test("unavailable fallback metadata preserves the address page", async ({ page }) => {
  await page.goto(`/address/${identifier(0xc4)}`);
  await page.getByRole("tab", { name: "Contract spec" }).click();
  await expect(page.getByText("Contract metadata is unavailable from this endpoint.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "DefaultWallet", exact: true })).toHaveCount(0);
});
