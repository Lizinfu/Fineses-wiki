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
  await dismissAnnouncement(page);
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

test("atlas supports country focus, search, location focus, and keyboard zoom", async ({
  page,
}) => {
  await page.goto("/portals/atlas/?entity=nat.muo");
  const country = page.locator("[data-atlas-area-focus='country.muocils']").first();
  const location = page.locator("[data-atlas-focus='loc.muocils']");
  const stage = page.locator("[data-atlas-stage]");

  await expect(country).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/entity=nat\.muo/);
  await expect(page.locator("[data-atlas-selection-title]")).toHaveText("莫尔索斯");
  await expect(page.locator(".atlas-area-label--country")).toHaveCount(13);
  expect(await page.locator(".atlas-hex[data-selected='true']").count()).toBeGreaterThan(0);
  expect(await page.locator(".atlas-hex[data-country='country.tarusar'][data-political-status='unruled']").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-atlas-marker]")).toHaveAttribute(
    "href",
    /\/nations\/nat-muocils\/?$/,
  );
  await expect(page.locator(".atlas-hex")).toHaveCount(1792);
  await expect(page.locator(".atlas-hex-repeat")).toHaveCount(2);
  expect(await page.locator(".atlas-hex--land").count()).toBeGreaterThan(600);
  expect(await page.locator(".atlas-hex[data-special='special.uninhabited']").count()).toBeGreaterThan(100);
  await expect(page.locator(".atlas-ocean-gradient")).toHaveCount(1);
  const countryStyleCount = await page.locator(".atlas-hex[data-country]").evaluateAll((tiles) => (
    new Set(tiles.map((tile) => tile.getAttribute("data-area-style"))).size
  ));
  expect(countryStyleCount).toBe(13);
  const oceanFill = await page.locator(".atlas-hex--ocean").first().evaluate((tile) => getComputedStyle(tile).fill);
  const uninhabitedFill = await page.locator(".atlas-hex[data-special='special.uninhabited']").first().evaluate((tile) => getComputedStyle(tile).fill);
  expect(oceanFill).not.toBe(uninhabitedFill);
  await expect(page.locator(".atlas-map-image")).toHaveCount(0);

  await page.locator("[data-atlas-search]").fill("不存在的地点");
  await expect(page.locator("[data-atlas-count]")).toHaveText("0 个地图条目");
  await expect(page.locator("[data-atlas-location-item]")).toBeHidden();
  await expect(page.locator("[data-atlas-area-item]").first()).toBeHidden();

  await page.locator("[data-atlas-search]").fill("");
  await expect(page.locator("[data-atlas-count]")).toHaveText("14 个地图条目");

  await location.click();
  await expect(location).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/loc=loc\.muocils/);

  const zoomReadout = page.locator("[data-atlas-zoom-readout]");
  const initialZoom = Number((await zoomReadout.textContent()).replace("%", ""));
  await stage.focus();
  await page.keyboard.press("+");
  await expect.poll(async () => Number((await zoomReadout.textContent()).replace("%", "")))
    .toBeGreaterThan(initialZoom);

  await page.locator("[data-atlas-reset]").click();
  await expect.poll(async () => Number((await zoomReadout.textContent()).replace("%", "")))
    .toBeLessThan(initialZoom);
  await expect(page.locator("[data-atlas-selection]")).toBeHidden();
  await expect(page).not.toHaveURL(/loc=/);
});

test("atlas assets are only loaded by the atlas page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("script[src*='/js/atlas.']")).toHaveCount(0);
  await expect(page.locator("link[href*='/atlas.min.']")).toHaveCount(0);

  await page.goto("/portals/atlas/");
  await expect(page.locator("script[src*='/js/atlas.']")).toHaveCount(1);
  await expect(page.locator("link[href*='/atlas.min.']")).toHaveCount(1);
});

test("atlas has no serious automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/portals/atlas/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(accessibilityViolationSummary(results.violations)).toEqual([]);
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
