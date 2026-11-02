import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

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
});
