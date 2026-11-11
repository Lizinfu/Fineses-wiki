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

async function dismissAnnouncement(page) {
  const dialog = page.locator("#library-announcement");

  if (await dialog.isVisible()) {
    await dialog.locator("[data-announcement-close]").click();
    await expect(dialog).not.toBeVisible();
  }
}

const routes = [
  "/",
  "/search/",
  "/timeline/",
  "/portals/atlas/",
  "/portals/atlas/inibholc/",
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

test("body search matches every space-separated term literally", async ({ page }) => {
  await page.goto("/search/");
  const input = page.locator("[data-search-input]");
  const results = page.locator(".search-result");
  await expect(input).toBeEnabled();

  await input.fill("卡夏");
  await expect(page.locator("[data-search-count]")).toHaveText("1 RESULTS");
  await expect(results).toHaveCount(1);
  await expect(results.first().locator(".search-result__title")).toHaveText("伊琳沃克");
  await expect(results.first().locator("mark").first()).toHaveText("卡夏");

  await input.fill("卡夏 伊琳沃克");
  await expect(page.locator("[data-search-count]")).toHaveText("1 RESULTS");
  await expect(results.first().locator("mark", { hasText: "卡夏" }).first()).toBeVisible();
  await expect(results.first().locator("mark", { hasText: "伊琳沃克" }).first()).toBeVisible();

  await input.fill("卡夏 玛夏娜");
  await expect(page.locator("[data-search-count]")).toHaveText("0 RESULTS");
  await expect(results).toHaveCount(0);

  await input.fill("国家目录保存");
  await expect(page.locator("[data-search-count]")).toHaveText("1 RESULTS");
  await expect(results.first().locator(".search-result__title")).toHaveText("国家");

  await input.fill("星");
  await expect(page.locator("[data-search-count]")).toHaveText("7 RESULTS");
  await expect(page.locator(".search-result__title")).toContainText([
    "塔罗萨尔占星泥版",
    "堑渊",
    "塔罗萨尔",
    "卡什莫兰",
    "塞壬",
    "埃萨勒",
    "天文学概述",
  ]);
});

test("body search restores URL queries and paginates the full result set", async ({ page }) => {
  await page.goto("/search/?q=%E5%9B%BD");
  await expect(page.locator("[data-search-input]")).toHaveValue("国");
  await expect(page.locator("[data-search-count]")).toHaveText("44 RESULTS");
  await expect(page.locator(".search-result")).toHaveCount(10);
  await page.locator("[data-search-more]").click();
  await expect(page.locator(".search-result")).toHaveCount(20);
  await expect(page.locator("[data-search-count]")).toHaveText("44 RESULTS");
});

test("search page has no serious automated accessibility violations", async ({ page }) => {
  await page.goto("/search/");
  await expect(page.locator("[data-search-input]")).toBeEnabled();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibilityViolationSummary(results.violations)).toEqual([]);
});

test("keyboard users can reach and activate the skip link", async ({
  page,
}) => {
  await page.goto("/");
  await dismissAnnouncement(page);
  // Start from a document without a modal focus history; dialog restoration is
  // independent of the first keyboard stop in normal page navigation.
  await page.reload();
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
  await dismissAnnouncement(page);
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

test("home announcement can be dismissed and stays dismissed", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = page.locator("#library-announcement");
  const announcementId = await dialog.getAttribute("data-announcement-id");

  expect(announcementId).toBeTruthy();
  await expect(dialog).toBeVisible();
  await dialog.locator("[data-announcement-close]").click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.localStorage.getItem(`world-library-notice:${id}`),
        announcementId,
      ),
    )
    .toBe("1");

  await page.reload();
  await expect(dialog).not.toBeVisible();
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
