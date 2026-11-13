import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

test("block summary and links render before receipt details", async ({
  page,
  request,
}) => {
  const rpcOrigin = `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_PORT ?? 3100) + 1}`;
  await request.post(`${rpcOrigin}/block-activity/reset`);
  try {
    await page.goto("/block/46", { waitUntil: "commit" });
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get(`${rpcOrigin}/block-activity/state`)
            ).json()
          ).pending,
      )
      .toBe(1);
    await expect(
      page.getByRole("heading", { name: "Summary", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByTitle(identifier(0xe0), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh transactions" }),
    ).toBeDisabled();
    await request.post(`${rpcOrigin}/block-activity/release`);
    await expect(page.getByText("Transfer", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh transactions" }),
    ).toBeEnabled();
  } finally {
    await request.post(`${rpcOrigin}/block-activity/release`);
  }
});

test("failed refresh preserves cached pagination and can be retried", async ({
  page,
}) => {
  await page.goto("/block/42");
  const next = page.getByRole("button", { name: "Next page", exact: true });
  const previous = page.getByRole("button", {
    name: "Previous page",
    exact: true,
  });
  const refresh = page.getByRole("button", { name: "Refresh transactions" });
  await next.click();
  await expect(
    page.getByTitle(identifier(0xdd), { exact: true }),
  ).toBeVisible();
  await page.route("**/block/42", (route) =>
    route.request().method() === "POST" ? route.abort() : route.continue(),
  );
  await refresh.click();
  await expect(
    page.getByText(
      "The request failed. Refresh transactions or try again shortly.",
    ),
  ).toBeVisible();
  await previous.click();
  await expect(
    page.getByTitle(identifier(0xab), { exact: true }),
  ).toBeVisible();
  await expect(next).toBeEnabled();
  await next.click();
  await expect(
    page.getByTitle(identifier(0xdd), { exact: true }),
  ).toBeVisible();
  await page.unroute("**/block/42");
  await refresh.click();
  await expect(
    page.getByTitle(identifier(0xab), { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The request failed. Refresh transactions or try again shortly.",
    ),
  ).toHaveCount(0);
  await expect(previous).toBeDisabled();
});

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
    await expect(
      page.getByRole("heading", { name: "Summary", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Transactions", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Transactions in block" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    const back = await page
      .getByRole("link", { name: "Back to search" })
      .boundingBox();
    const previous = await page
      .getByRole("link", { name: "Previous block" })
      .boundingBox();
    expect(previous!.y).toBeGreaterThanOrEqual(back!.y + back!.height);
    await expect(
      page.getByTitle(identifier(0xab), { exact: true }),
    ).toHaveAttribute("href", `/tx/${identifier(0xab)}`);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(
      page.getByTitle(identifier(0xdd), { exact: true }),
    ).toHaveAttribute("href", `/tx/${identifier(0xdd)}`);
    await expect(page.getByText("No further references returned.")).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: "Next page" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Previous page" }).click();
    await expect(
      page.getByTitle(identifier(0xab), { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(
      page.getByTitle(identifier(0xdd), { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Refresh transactions" }).click();
    await expect(
      page.getByTitle(identifier(0xab), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Previous page" }),
    ).toBeDisabled();
    await expect(page).toHaveURL("/block/42");
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
  await page.goto("/block/41");
  await expect(
    page.getByText("No transactions in this indexed block."),
  ).toBeVisible();
  await page.goto("/block/0");
  await expect(
    page.getByText(/Genesis metadata is not available/),
  ).toBeVisible();
  await page.goto("/block/9007199254740993");
  await expect(
    page.getByRole("heading", { name: "Block 9007199254740993", exact: true }),
  ).toBeVisible();
  await page.goto(`/tx/${identifier(0xab)}`);
  await expect(
    page.getByRole("link", { name: "42", exact: true }).first(),
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
