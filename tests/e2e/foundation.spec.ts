import { expect, test } from "@playwright/test";

test("renders the responsive foundation shell", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByLabel("HyperThread")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    await expect(
      page.getByText(/Sign in will connect this workspace/),
    ).toBeVisible();
  } else {
    await expect(
      page.getByText("Your conversation space is ready"),
    ).toBeVisible();
  }
});
