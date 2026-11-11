import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

async function dismissAnnouncement(page) {
  const notice = page.locator("#library-announcement");
  if (await notice.isVisible()) await notice.locator("[data-announcement-close]").click();
}

test("the country archive exposes contents, facts and clean editorial dates", async ({ page }, testInfo) => {
  await page.goto("/nations/nat-inibholc/");
  await expect(page.locator(".entity-content")).toContainText("伊琳沃克第三帝国");
  if (testInfo.project.name === "mobile") {
    const tools = page.locator(".entity-mobile-tools");
    await tools.locator("summary").filter({ hasText: "本页目录" }).first().click();
    await expect(tools.locator("[data-page-toc] a").first()).toBeVisible();
    await tools.locator("summary").filter({ hasText: "档案摘要" }).click();
    await expect(tools.locator(".entity-infobox")).toContainText("炼金之国");
  } else {
    await expect(page.locator(".page-aside [data-page-toc]")).toBeVisible();
    await expect(page.locator(".page-aside .entity-infobox")).toContainText("炼金之国");
  }
  await page.locator(".archive-meta-details > summary").click();
  await expect(page.locator(".archive-meta-strip")).toContainText("未记录");
  await expect(page.locator(".archive-meta-strip")).not.toContainText("0001-01-01");
  await expect(page.locator("body")).not.toContainText("map[Key:");
});

test("light and dark archive reading satisfy automated accessibility checks", async ({ page }) => {
  await page.goto("/nations/nat-inibholc/");
  for (const theme of ["light", "dark"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) {
      await page.locator("[data-theme-toggle]").click();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(audit.violations.map(v => ({ id: v.id, theme, nodes: v.nodes.map(n => ({ target: n.target, detail: n.failureSummary })) }))).toEqual([]);
  }
});

test("core reading and exploration pages fit a 320px viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "The narrowest supported mobile layout.");
  await page.setViewportSize({ width: 320, height: 844 });
  for (const route of ["/", "/nations/nat-inibholc/", "/portals/geography/", "/search/", "/timeline/", "/library/", "/portals/atlas/"]) {
    await page.goto(route);
    await dismissAnnouncement(page);
    await expect(page.locator("h1")).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(1);
  }
});

test("country contents and fact disclosures remain usable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(new URL("/nations/nat-inibholc/", baseURL).href);
    await expect(page.locator(".entity-content")).toContainText("伊琳沃克第三帝国");
    await page.locator(".entity-mobile-tools summary").filter({ hasText: "本页目录" }).click();
    await expect(page.locator(".entity-mobile-tools [data-page-toc] a").first()).toBeVisible();
    await page.locator(".entity-mobile-tools summary").filter({ hasText: "档案摘要" }).click();
    await expect(page.locator(".entity-mobile-tools .entity-infobox")).toContainText("炼金之国");
    await expect(page.locator("[data-motion-toggle]:visible")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
