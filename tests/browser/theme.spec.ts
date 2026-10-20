import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/groundhog/test-fixtures";

const txHash = identifier(0xab);
const address = identifier(0x22);

test("dark-only branding and bundled fonts load despite a saved light preference", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  const response = await page.goto("/");
  expect(await response!.text()).toContain('<html lang="en" class="dark">');
  await expect(page).toHaveTitle("Thruput Explorer");
  await expect(page.locator("html")).toHaveClass("dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(16, 17, 15)");
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => ({
    sans: [...document.fonts].some((font) => font.family.includes("IBM Plex Sans") && font.status === "loaded"),
    mono: [...document.fonts].some((font) => font.family.includes("IBM Plex Mono") && font.status === "loaded"),
  }))).toEqual({ sans: true, mono: true });
  const icon = await page.locator('link[rel="icon"]').getAttribute("href");
  expect(icon).toContain("/icon.svg");
  const favicon = await page.request.get(icon!);
  expect(favicon.ok()).toBe(true);
  expect(await favicon.text()).toContain("#e9ef64");
});

test("Radix tabs and receipt disclosure support keyboard navigation", async ({ page, context }) => {
  await page.goto(`/address/${address}`);
  const transactions = page.getByRole("tab", { name: "Transactions", exact: true });
  const transfers = page.getByRole("tab", { name: "HOG Transfers", exact: true });
  await transactions.focus();
  await page.keyboard.press("ArrowRight");
  await expect(transfers).toBeFocused();
  await expect(transfers).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toContainText("1.5 HOG");
  await page.keyboard.press("ArrowLeft");
  await expect(transactions).toHaveAttribute("aria-selected", "true");
  await page.locator(`a[href="/tx/${txHash}"]`).click();
  await expect(page).toHaveURL(`/tx/${txHash}`);

  const toggle = page.getByRole("button", { name: "Toggle JSON" });
  const receipt = page.getByLabel("Raw transaction receipt JSON");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(receipt).toContainText(txHash);
  await page.keyboard.press("Space");
  await expect(receipt).toBeHidden();

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy transaction hash" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(txHash);
  await page.getByRole("link", { name: "Back to search" }).click();
  await expect(page).toHaveURL("/");
});

for (const width of [320, 390, 768, 1440]) {
  test(`explorer pages contain long data at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const [name, path] of [
      ["home", "/"],
      ["transaction", `/tx/${txHash}`],
      ["address", `/address/${address}`],
      ["invalid-address", "/address/invalid"],
      ["unknown-transaction", `/tx/${identifier(0x99)}`],
      ["not-found", "/missing-page"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Thruput Explorer homepage" })).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(name === "home" ? 0 : 1);
      if (name === "home") await expect(page.getByText("1.5 HOG", { exact: true })).toBeVisible();
      if (name === "transaction") await page.getByRole("button", { name: "Toggle JSON" }).click();
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
    }
  });
}

test("legacy wallet and contract links keep the branded address page", async ({ page }) => {
  for (const prefix of ["wallet", "contract"]) {
    await page.goto(`/${prefix}/${address}`);
    await expect(page).toHaveURL(`/address/${address}`);
    await expect(page.getByRole("link", { name: "Thruput Explorer homepage" })).toBeVisible();
  }
});

test("touch controls and 200% zoom remain usable", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    httpCredentials: { username: "browser-test-only", password: "browser-test-only-password" },
  });
  const page = await context.newPage();
  const origin = String(testInfo.project.use.baseURL);
  try {
    await page.goto(origin);
    const search = page.getByRole("button", { name: "Search", exact: true });
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await page.getByRole("textbox").fill(txHash);
    await search.tap();
    await expect(page).toHaveURL(`${origin}/tx/${txHash}`);
    await page.getByRole("button", { name: "Toggle JSON" }).tap();
    await expect(page.getByLabel("Raw transaction receipt JSON")).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { document.body.style.zoom = "2"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("transaction-200-percent.png"), fullPage: true });
    await page.getByRole("link", { name: "Back to search" }).tap();
    await expect(page.getByRole("textbox")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("empty, partial, pending, and unavailable views retain the themed shell", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path, message] of [
    ["empty", `/address/${identifier(0x33)}`, "No transactions found for this address."],
    ["partial", `/address/${identifier(0x44)}`, "Some activity sources are unavailable."],
    ["pending", `/tx/${identifier(0xcc)}`, "Pending"],
    ["unavailable", `/tx/${identifier(0xee)}`, "Thruput RPC unavailable"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("main")).toContainText(message);
    await expect(page.getByRole("link", { name: "Thruput Explorer homepage" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  }
});
