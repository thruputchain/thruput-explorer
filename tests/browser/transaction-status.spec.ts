import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

for (const [id, label, detail] of [["a5", "Abort data", "0xdeadbeef"], ["a6", "Execution", "fault"]]) {
  test(`receipt shows exact gas and ${label}`, async ({ page }) => {
    await page.goto(`/tx/${identifier(Number.parseInt(id, 16))}`);
    const field = (name: string) => page.locator("dl > div").filter({ has: page.getByRole("term").filter({ hasText: new RegExp(`^${name}$`) }) }).getByRole("definition");
    await expect(field("Gas used")).toHaveText("9007199254740993");
    await expect(field(label)).toHaveText(detail);
    await expect(field("Status")).toContainText("Committed");
  });
}

for (const { id, label, details } of [
  { id: "a1", label: "Retry", details: { "Error source": "scheduler", "Error code": "-7" } },
  { id: "a2", label: "Dropped", details: { "Error source": "auth", "Error code": "-3" } },
  { id: "a3", label: "Recent failure", details: { "Attempt height": "41", "Rejected contract index": "1", "Rejection code": "memoryTooLarge" } },
  { id: "a4", label: "Committed", details: { "Block height": "42" } },
]) {
  test(`${label} displays the current gateway outcome without requiring a receipt`, async ({ page }) => {
    await page.goto(`/tx/${identifier(Number.parseInt(id, 16))}`);
    const field = (name: string) => page.locator("dl > div").filter({ has: page.getByRole("term").filter({ hasText: new RegExp(`^${name}$`) }) }).getByRole("definition");
    await expect(field("Status")).toHaveText(label);
    await expect(field("Receipt")).toHaveText("Not available");
    for (const [name, value] of Object.entries(details)) await expect(field(name)).toHaveText(value);
    await expect(page.getByRole("term").filter({ hasText: "Conflict address" })).toHaveCount(0);
  });
}
