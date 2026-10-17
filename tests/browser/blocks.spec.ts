import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`block search, details and bounded transactions at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("textbox", { name: /Block height/ }).fill("42");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Block 42", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Previous block" }),
    ).toHaveAttribute("href", "/block/41");
    await page.getByRole("link", { name: "View transactions" }).click();
    await expect(
      page.getByRole("link", { name: `0x${"ab".repeat(32)}`, exact: true }),
    ).toHaveAttribute("href", `/tx/0x${"ab".repeat(32)}`);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(
      page.getByRole("link", { name: `0x${"dd".repeat(32)}`, exact: true }),
    ).toHaveAttribute("href", `/tx/0x${"dd".repeat(32)}`);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByRole("status")).toContainText(
      "completeness is not verified",
    );
    await expect(
      page.getByRole("button", { name: "Next page" }),
    ).toBeDisabled();
    await page.getByRole("link", { name: "Start fresh" }).click();
    await expect(page.getByRole("button", { name: "Next page" })).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("empty block, genesis, large heights and receipt navigation", async ({
  page,
}) => {
  await page.goto("/block/41/transactions");
  await expect(page.getByRole("status")).toHaveText(
    "No transactions in this indexed block.",
  );
  await page.goto("/block/0");
  await expect(
    page.getByText(/Genesis metadata is not available/),
  ).toBeVisible();
  await page.goto("/block/9007199254740993");
  await expect(
    page.getByRole("heading", { name: "Block 9007199254740993", exact: true }),
  ).toBeVisible();
  await page.goto(`/tx/0x${"ab".repeat(32)}`);
  await expect(
    page.getByRole("link", { name: "42", exact: true }),
  ).toHaveAttribute("href", "/block/42");
});

test("backend failures and malformed responses never render an empty block", async ({
  page,
}) => {
  for (const height of ["43", "44", "45"]) {
    await page.goto(`/block/${height}/transactions`);
    await expect(
      page.getByText("Block transactions not available", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("No transactions in this indexed block."),
    ).toHaveCount(0);
    await expect(page.getByText("Private upstream diagnostics")).toHaveCount(0);
  }
});
