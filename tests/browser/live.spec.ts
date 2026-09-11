import { expect, test } from "@playwright/test";

// The fixture chain in server.ts gives every block after 42 exactly 3 + (height % 4) transactions.
const expectedCount = (height: number) => 3 + (height % 4);

test("the header links to the live page and settled blocks stream in with exact counts", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Live transactions" }).click();
  await expect(page).toHaveURL("/live");
  await expect(page).toHaveTitle("Live transactions - Thruput Explorer");

  await expect(page.getByText(/^Live, \d+ blocks? behind the indexer tip/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/transactions per second over the last/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: /Latest block \d[\d,]* has \d+ transactions/ })).toBeVisible();
  await expect(page.getByText(/^Each speck is one transaction/)).toBeVisible();

  const toggle = page.getByRole("button", { name: /table$/ });
  await expect(toggle).toHaveText("Show table");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveText("Hide table");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const newest = page.getByRole("table").getByRole("row").nth(1);
  await expect(newest).toBeVisible();
  // Rows shift every second, so read the whole row in one pass.
  const { cells, href } = await newest.evaluate((row) => ({
    cells: [...row.querySelectorAll("td")].map((cell) => cell.innerText),
    href: row.querySelector("a")?.getAttribute("href") ?? null,
  }));
  const height = Number(cells[0].replaceAll(",", ""));
  expect(height).toBeGreaterThan(42);
  expect(Number(cells[1].replaceAll(",", ""))).toBe(expectedCount(height));
  expect(cells[2]).toBe(`${(1.5 * expectedCount(height)).toString()}`);
  expect(href).toMatch(new RegExp(`^/tx/0x${height.toString(16).padStart(8, "0")}`));

  await toggle.click();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("the session counter grows only with blocks that settle after opening", async ({ page }) => {
  await page.goto("/live");
  const counter = page.locator("dd", { hasText: /transactions? in \d+ blocks?$/ });
  await expect(counter).toBeVisible();
  await expect(counter).not.toHaveText(/in 0 blocks$/, { timeout: 15_000 });
  const text = await counter.innerText();
  const [transactions, blocks] = text.match(/\d[\d,]*/g)!.map((value) => Number(value.replaceAll(",", "")));
  // History arrives with the hello frame and a fresh hub backfills about 60 blocks; neither may be counted.
  expect(blocks).toBeGreaterThanOrEqual(1);
  expect(blocks).toBeLessThan(30);
  expect(transactions).toBeGreaterThanOrEqual(3 * blocks);
  expect(transactions).toBeLessThanOrEqual(6 * blocks);
});

for (const width of [390, 1440]) {
  test(`the live page fits ${width}px without horizontal overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/live");
    await expect(page.getByText(/behind the indexer tip/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Show table" }).click();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`live-${width}.png`), fullPage: true });
  });
}
