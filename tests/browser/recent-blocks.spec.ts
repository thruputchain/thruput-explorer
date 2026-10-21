import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

for (const width of [320, 1280]) {
  test(`home shows both activity cards without overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const blocks = page.getByRole("region", {
      name: "Recent blocks",
      exact: true,
    });
    await expect(blocks.getByRole("listitem")).toHaveCount(3);
    await expect(
      blocks.getByRole("link", { name: "42", exact: true }),
    ).toHaveAttribute("href", "/block/42");
    await expect(
      blocks.getByRole("link", { name: "40", exact: true }),
    ).toHaveAttribute("href", "/block/40");
    await expect(blocks.getByRole("link", { name: "2 transactions →", exact: true })).toHaveAttribute("href", "/block/42/transactions");
    const transactions = page.getByRole("region", { name: "Recent transactions", exact: true });
    await expect(transactions.getByRole("listitem")).toHaveCount(2);
    await expect(transactions.getByText("1.5 HOG", { exact: true })).toBeVisible();
    const blocksBox = await blocks.boundingBox();
    const transactionsBox = await transactions.boundingBox();
    if (width === 1280) expect(blocksBox?.y).toBe(transactionsBox?.y);
    else expect(transactionsBox!.y).toBeGreaterThan(blocksBox!.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await blocks.getByRole("link", { name: "42", exact: true }).click();
    await expect(page).toHaveURL("/block/42");
  });
}

test("address activity and transaction heights link to their blocks", async ({
  page,
}) => {
  await page.goto(`/address/${identifier(0x22)}`);
  await expect(
    page.getByRole("tabpanel").getByRole("link", { name: "42", exact: true }),
  ).toHaveAttribute("href", "/block/42");
  await page.getByRole("tab", { name: "HOG Transfers", exact: true }).click();
  await expect(
    page.getByRole("tabpanel").getByRole("link", { name: "42", exact: true }),
  ).toHaveAttribute("href", "/block/42");
  await page.goto(`/tx/${identifier(0xa3)}`);
  await expect(
    page.getByRole("link", { name: "41", exact: true }),
  ).toHaveAttribute("href", "/block/41");
  await expect(
    page.getByRole("link", { name: "42", exact: true }),
  ).toHaveAttribute("href", "/block/42");
});
