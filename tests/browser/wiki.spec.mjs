import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function accessibilityViolationSummary(violations) {
  return violations.map(({ id, impact, help, nodes }) => ({
    id,
    impact,
    help,
    nodes: nodes.map(({ target, failureSummary }) => ({
      target,
      failureSummary,
    })),
  }));
}

const routes = [
  "/",
  "/search/",
  "/timeline/",
  "/nations/nat-ramus/",
  "/404.html",
];

for (const route of routes) {
  test(`${route} renders a usable document`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("a.skip-link")).toBeVisible();
  });
}

test("keyboard users can reach and activate the skip link", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator("a.skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("mobile navigation can be opened and closed", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only interaction.");
  await page.goto("/");
  const toggle = page.locator("[data-nav-toggle]");
  const drawer = page.locator("[data-mobile-nav]");
  const close = drawer.locator("[data-nav-close]").last();

  await expect(page.locator("html")).toHaveClass(/\bjs\b/);
  await expect(toggle).toBeVisible();
  await expect(drawer).toHaveAttribute("data-state", "closed");

  await toggle.click();
  await expect(drawer).toHaveAttribute("data-state", "open");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await close.click();
  await expect(drawer).toHaveAttribute("data-state", "closed");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("marginal notes support pointer, keyboard, and mobile reading", async ({
  page,
}) => {
  await page.goto("/concepts/con-astronomy/");
  const trigger = page.locator("[data-marginal-note-trigger]").first();
  const panel = page.locator("[data-marginal-note-panel]").first();

  await expect(trigger).toBeVisible();
  await trigger.focus();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toContainText("尚未被证实的解释框架");
});

test("home page has no serious automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(accessibilityViolationSummary(results.violations)).toEqual([]);
});
