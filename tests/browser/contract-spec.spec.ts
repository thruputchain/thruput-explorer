import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";
import { toBase58 } from "@thruputchain/client";
import { NATIVE_TOKEN_ADDRESS } from "@thruputchain/protocol";

test("address reports deployment absence at the named snapshot", async ({
  page,
}) => {
  await page.goto(`/address/${identifier(0xab)}`);
  await page.getByRole("tab", { name: "Contract spec", exact: true }).click();
  await expect(
    page.getByText("No contract at this snapshot", { exact: true }),
  ).toBeVisible();
});

test("activity tabs show spec definitions and one decoded events table", async ({
  page,
}) => {
  await page.goto(`/address/${identifier(0xc1)}`);
  await expect(
    page.getByRole("heading", { name: "Counter", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Transactions", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab")).toHaveText([
    "Transactions",
    "Token Transfers",
    "Events",
    "Contract spec",
  ]);
  await expect(
    page.getByRole("cell", { name: "increment", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("tab", { name: "Contract spec", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "increment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("NotAuthorized = 1", { exact: true }),
  ).toBeVisible();
  await page.getByText("Technical details", { exact: true }).click();
  await expect(
    page.getByText("Embedded spec · artifact hash checked", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Recent events", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Events", exact: true }).click();
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(
    page.getByRole("cell", { name: "PingEvent", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("tag: 42", { exact: true })).toBeVisible();
  const decoded = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "PingEvent", exact: true }),
  });
  await expect(decoded.getByRole("link").first()).toHaveAttribute(
    "href",
    `/tx/${identifier(0xab)}`,
  );
  await expect(page.getByText("Raw data", { exact: true })).toHaveCount(0);
  const unknown = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Unknown event", exact: true }),
  });
  await expect(unknown.getByRole("link").first()).toHaveAttribute(
    "href",
    `/tx/${identifier(0xab)}`,
  );
  await expect(
    page.getByRole("cell", { name: "Could not decode", exact: true }),
  ).toBeVisible();
  await expect(decoded.getByText(/Current spec at block/)).toContainText("historical spec not verified");
  const malformed = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Could not decode", exact: true }),
  });
  for (const row of [decoded, unknown, malformed]) {
    await row.getByText("Raw event", { exact: true }).click();
    await expect(row.getByLabel("Event topics")).toBeVisible();
    await expect(row.getByLabel("Event data")).toBeVisible();
  }
  await expect(unknown.getByLabel("Event data")).toHaveText("0x1234");
});

test("native token contract events use built-in decoding without a spec", async ({ page }) => {
  await page.goto(`/address/${toBase58(NATIVE_TOKEN_ADDRESS)}`);
  await page.getByRole("tab", { name: "Events", exact: true }).click();
  await expect(page.getByText("Transfer", { exact: true })).toBeVisible();
  await expect(page.getByText("Amount", { exact: true })).toBeVisible();
  await expect(page.getByText("Built-in native token decoding.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Current spec at block/)).toHaveCount(0);
  await page.getByText("Raw event", { exact: true }).click();
  await expect(page.getByLabel("Event data")).toBeVisible();
});

test("token history explains unavailable decimals instead of claiming empty history", async ({ page }) => {
  await page.goto(`/address/${identifier(0xc5)}`);
  await page.getByRole("tab", { name: "Token Transfers", exact: true }).click();
  await expect(page.getByText(/Transfer details are unavailable because token decimals/)).toBeVisible();
  await expect(page.getByText(/Transfers, mints, and burns appear here/)).toHaveCount(0);
});

test("transaction events identify current spec even when input is unavailable", async ({ page }) => {
  await page.goto(`/tx/${identifier(0xa7)}`);
  await expect(page.getByText(/Original input is not retained/).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "PingEvent", exact: true })).toBeVisible();
  const provenance = page.getByText(/Current spec at block/);
  await expect(provenance).toContainText("42");
  await expect(provenance).toContainText("historical spec not verified. Contract hash:");
  await page.getByText("Raw event", { exact: true }).click();
  await expect(page.getByLabel("Event topics")).toContainText("2a");
});
