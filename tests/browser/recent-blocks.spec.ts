import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

for (const width of [320, 1280]) {
  test(`home defaults to 11 recent blocks with accessible activity tabs at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const blocksTab = page.getByRole("tab", {
      name: "Recent blocks",
      exact: true,
    });
    const transfersTab = page.getByRole("tab", {
      name: "Recent HOG transfers",
      exact: true,
    });
    const blocks = page.getByRole("tabpanel", {
      name: "Recent blocks",
      exact: true,
    });
    await expect(blocksTab).toHaveAttribute("aria-selected", "true");
    await expect(blocks.getByRole("link")).toHaveText(
      Array.from({ length: 11 }, (_, i) => String(42 - i)),
    );
    await expect(
      blocks.getByRole("link", { name: "42", exact: true }),
    ).toHaveAttribute("href", "/block/42");
    await expect(
      blocks.getByRole("link", { name: "32", exact: true }),
    ).toHaveAttribute("href", "/block/32");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await blocksTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(transfersTab).toBeFocused();
    await expect(transfersTab).toHaveAttribute("aria-selected", "true");
    const transfers = page.getByRole("tabpanel", {
      name: "Recent HOG transfers",
      exact: true,
    });
    await expect(transfers.getByText("1.5 HOG", { exact: true })).toBeVisible();
    await transfers.getByRole("link", { name: "42", exact: true }).click();
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
