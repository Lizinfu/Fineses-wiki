import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = ["/", "/search/", "/timeline/", "/nations/nat-ramus/", "/404.html"];

for (const route of routes) {
  test(`${route} renders a usable document`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("a.skip-link")).toBeVisible();
  });
}

test("keyboard users can reach and activate the skip link", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator("a.skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("mobile navigation can be opened and closed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only interaction.");
  await page.goto("/");
  const toggle = page.locator("[data-nav-toggle]");
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("home page has no serious automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});