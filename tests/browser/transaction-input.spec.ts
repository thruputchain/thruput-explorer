import { expect, test } from "@playwright/test";
import calls from "../fixtures/counter-calls.json";

for (const call of calls) {
  test(`shows hash-checked ${call.execution} input without claiming child execution`, async ({
    page,
  }) => {
    await page.goto(`/tx/${call.hash}`);
    const requested = page.getByRole("region", {
      name: "Requested call",
      exact: true,
    });
    await expect(
      requested.getByRole("heading", {
        name: `Counter.${call.method}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      requested.getByText("No arguments.", { exact: true }),
    ).toBeVisible();
    await expect(
      requested.getByText("Root outcome", { exact: true }),
    ).toHaveCount(0);
    await page.getByText("Technical details", { exact: true }).click();
    await expect(
      page.getByText(/Requested calls are not an execution trace/),
    ).toBeVisible();
    await expect(
      page.getByText(/DefaultWallet@.*\.execute/, { exact: true }),
    ).toBeVisible();
    await expect(requested.getByText(/historical code identity is not established/)).toBeVisible();
    await expect(page.getByLabel("Canonical Transaction XDR")).toHaveText(
      call.inputXdr,
    );
    await expect(page.getByText("Root outcome", { exact: true })).toHaveCount(
      1,
    );
  });
}
