import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function ready(page, query = "") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/portals/atlas/${query ? `?${query}` : ""}`);
  await expect(page.locator("[data-atlas]")).toHaveAttribute("data-atlas-renderer", "webgl");
  await expect(page.locator("[data-atlas]")).toHaveAttribute("data-atlas-draws", /\d+/);
}

const filter = (page, kind) => page.locator(`[data-directory-filter="${kind}"]`);
const visibleEntries = (page) => page.locator("[data-directory-kind]:visible");
const creatorLanguage = /参考图|可替换|中心对称|六边形|掩膜|程序|几何|实际测绘|布局示意|provisional|\d+\s*格/;

test("directory filters combine with search and recover from an empty result", async ({ page }) => {
  await ready(page);
  const allEntries = await visibleEntries(page).count();
  expect(allEntries).toBeGreaterThan(13);
  await expect(filter(page, "all")).toHaveAttribute("aria-pressed", "true");

  await filter(page, "country").focus();
  await page.keyboard.press("Enter");
  await expect(filter(page, "country")).toHaveAttribute("aria-pressed", "true");
  await expect(filter(page, "all")).toHaveAttribute("aria-pressed", "false");
  await expect(visibleEntries(page)).toHaveCount(13);
  expect(await visibleEntries(page).evaluateAll(items => items.every(item => item.dataset.directoryKind === "country"))).toBe(true);

  await page.locator("[data-atlas-search]").fill("ΑΟΤΕΛΑΙΣΙ");
  await expect(visibleEntries(page)).toHaveCount(0);
  await expect(page.locator("[data-atlas-empty]")).toBeVisible();
  await expect(page.locator("[data-directory-group]:visible")).toHaveCount(0);

  await filter(page, "all").click();
  await expect(page.locator("[data-atlas-empty]")).toBeHidden();
  await expect(visibleEntries(page)).toHaveCount(1);
  await expect(visibleEntries(page)).toContainText("奥特莱斯");
  await expect(page.locator("[data-directory-group]:visible")).toHaveCount(1);
  await expect(page.locator("[data-atlas-count]")).toContainText("1");

  await page.locator("[data-atlas-search]").fill("");
  await expect(visibleEntries(page)).toHaveCount(allEntries);
  await expect(page.locator("[data-atlas-empty]")).toBeHidden();
});

test("selected places show reader descriptions and Aotelaisi opens its existing archive", async ({ page }) => {
  await ready(page, "loc=loc.cathair");
  const description = page.locator("[data-feature-card-description]");
  await expect(page.locator("[data-feature-card-title]")).toHaveText("卡夏·欧尔莱特");
  await expect(description).not.toHaveText("");
  await expect(description).not.toContainText(creatorLanguage);

  await page.locator('[data-atlas-area-focus="country.khaos"]').click();
  await expect(page.locator("[data-feature-card-title]")).toHaveText("卡俄斯");
  await expect(description).not.toHaveText("");
  await expect(description).not.toContainText(creatorLanguage);

  await filter(page, "feature").click();
  await page.locator("[data-atlas-search]").fill("ΑΟΤΕΛΑΙΣΙ");
  await page.locator('[data-atlas-feature-focus="terrain.aotelaisi"]').click();
  await expect(page.locator("[data-feature-card-title]")).toHaveText("奥特莱斯");
  await expect(description).not.toContainText(creatorLanguage);
  const archive = page.locator("[data-feature-card-link]");
  await expect(archive).toBeVisible();
  await expect(archive).toHaveAttribute("href", /\/regions\/reg-aotelaisi\/?$/);
  await archive.click();
  await expect(page).toHaveURL(/\/regions\/reg-aotelaisi\/?$/);
  await expect(page.locator("h1")).toContainText("奥特莱斯");
});

test("dashboard navigation fits its viewport and exposes readable touch controls", async ({ page }) => {
  await ready(page, "loc=loc.cathair");
  await page.locator(".atlas-directory").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  for (const kind of ["all", "country", "place", "feature"]) {
    const button = filter(page, kind);
    await expect(button).toBeVisible();
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
  await filter(page, "all").click();
  const audit = await new AxeBuilder({ page }).include(".atlas-directory").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(audit.violations).toEqual([]);
});

test("the directory retains reader copy and archive access without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/portals/atlas/");
    const item = page.locator('[data-directory-kind="feature"]').filter({
      has: page.locator('[data-atlas-feature-focus="terrain.aotelaisi"]'),
    });
    const description = item.locator("[data-feature-description]");
    await expect(description).toBeVisible();
    await expect(description).not.toHaveText("");
    await expect(description).not.toContainText(creatorLanguage);
    const archive = item.locator(".atlas-feature-archive");
    await expect(archive).toBeVisible();
    await archive.click();
    await expect(page).toHaveURL(/\/regions\/reg-aotelaisi\/?$/);
    await expect(page.locator("h1")).toContainText("奥特莱斯");
  } finally {
    await context.close();
  }
});
