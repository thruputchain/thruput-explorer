import { expect, test } from "@playwright/test";
import { identifier } from "../../src/lib/thruput/test-fixtures";

const txHash = identifier(0xab);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("the branded home link works from a transaction behind Basic Auth", async ({ page }) => {
  await expect(page.getByText("Search blocks, transactions, contracts, and addresses on Thruput.")).toBeVisible();
  await page.goto(`/tx/${txHash}`);
  const home = page.getByRole("link", { name: "Thruput Explorer homepage" });
  await expect(home).toBeVisible();
  await home.click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("textbox", { name: "Block height, transaction hash or address" })).toBeVisible();
});

test("search uses the API and RPC, then renders the decoded transfer", async ({ page }) => {
  await page.getByRole("tab", { name: "Recent HOG transfers" }).click();
  await expect(page.getByText("1.5 HOG", { exact: true })).toBeVisible();
  await page.getByRole("textbox").fill(txHash);
  const response = page.waitForResponse("**/api/search");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(`/tx/${txHash}`);
  await expect(page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Events", exact: true }) }).getByText("1.5 HOG", { exact: true })).toBeVisible();
  await expect(page.getByText("15000000", { exact: true })).toBeVisible();
  await expect(page.getByText("Transfer", { exact: true })).toBeVisible();
});

test("search follows an address result and renders its balance", async ({ page }) => {
  const address = identifier(0x22);
  await page.getByRole("textbox").fill(address);
  const response = page.waitForResponse("**/api/search");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(`/address/${address}`);
  await expect(page.getByText("2.5 HOG", { exact: true })).toBeVisible();
  const transaction = page.getByRole("tabpanel", { name: "Transactions", exact: true }).locator(`a[href="/tx/${txHash}"]`);
  await expect(transaction).toBeVisible();
  await transaction.click();
  await expect(page).toHaveURL(`/tx/${txHash}`);
  await expect(page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Events", exact: true }) }).getByText("1.5 HOG", { exact: true })).toBeVisible();
});

test("malformed input shows validation without a search request", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/search") requests.push(request.url());
  });
  await page.getByRole("textbox").fill("not-a-hash");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Enter a block height or a base58 transaction hash or address (32 bytes).", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  expect(requests).toEqual([]);
});

test("search stays disabled until the deferred request is released", async ({ page }) => {
  let release!: () => void;
  const deferred = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/search", async (route) => {
    await deferred;
    await route.continue();
  });
  try {
    await page.getByRole("textbox").fill(txHash);
    const requested = page.waitForRequest("**/api/search");
    const button = page.getByRole("button", { name: "Search", exact: true });
    await button.click();
    await requested;
    await expect(button).toBeDisabled();
    await expect(page).toHaveURL("/");
    release();
    await expect(page).toHaveURL(`/tx/${txHash}`);
    await expect(page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Events", exact: true }) }).getByText("1.5 HOG", { exact: true })).toBeVisible();
  } finally {
    release();
  }
});

for (const failure of ["503", "network", "non-JSON"] as const) {
  test(`${failure} feedback clears on a successful retry`, async ({ page }) => {
    const message = failure === "503" ? "Fixture search temporarily unavailable." : "Search is unavailable. Please try again.";
    await page.route("**/api/search", async (route) => {
      if (failure === "network") await route.abort("failed");
      else if (failure === "503") await route.fulfill({ status: 503, json: { status: "unavailable", message } });
      else await route.fulfill({ status: 200, contentType: "text/html", body: "<html>Not JSON</html>" });
    }, { times: 1 });
    await page.getByRole("textbox").fill(txHash);
    const button = page.getByRole("button", { name: "Search", exact: true });
    await button.click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(page).toHaveURL("/");
    await button.click();
    await expect(page.getByText(message, { exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(`/tx/${txHash}`);
    await expect(page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name: "Events", exact: true }) }).getByText("1.5 HOG", { exact: true })).toBeVisible();
  });
}
