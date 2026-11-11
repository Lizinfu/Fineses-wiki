import { expect, test } from "@playwright/test";
import sharp from "sharp";

const field = page => page.locator("[data-signal-field]");
const modes = ["orbit", "crest", "terrain"];

async function openHome(page) {
  await page.goto("/");
  const notice = page.locator("#library-announcement");
  if (await notice.isVisible()) await notice.locator("[data-announcement-close]").click();
  await field(page).scrollIntoViewIfNeeded();
  await expect(page.locator("[data-signal-controls]")).toBeVisible();
}

async function expectStaticModel(page, model) {
  await expect(page.locator(`[data-signal-static="${model}"]`)).toBeVisible();
  for (const other of modes.filter(value => value !== model)) {
    await expect(page.locator(`[data-signal-static="${other}"]`)).toBeHidden();
  }
}

test("dark is the default and an explicit light preference survives navigation", async ({ page }) => {
  await page.goto("/nations/nat-inibholc/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.locator("[data-theme-toggle]").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/search/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("the observatory renders a real point field when WebGL is available", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openHome(page);
  await expect.poll(async () => {
    const host = field(page);
    return await host.getAttribute("data-signal-ready") === "true" ||
      await host.getAttribute("data-signal-state") === "unavailable";
  }, { timeout: 15000 }).toBe(true);
  test.skip(await field(page).getAttribute("data-signal-state") === "unavailable",
    "This browser cannot create a WebGL renderer; fallback has separate coverage.");

  await expect(field(page)).toHaveAttribute("data-signal-ready", "true");
  await expect(field(page).locator("canvas")).toHaveCount(1);
  const canvas = field(page).locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(page.locator("[data-signal-static]:visible")).toHaveCount(0);
  // Inspect the actual rendered output, so an empty canvas cannot pass as a point field.
  await expect.poll(async () => {
    const stats = await sharp(await canvas.screenshot()).stats();
    return Math.max(...stats.channels.slice(0, 3).map(channel => channel.stdev));
  }, { timeout: 12000 }).toBeGreaterThan(1);

  for (const model of ["crest", "terrain", "orbit"]) {
    const button = page.locator(`button[data-signal-model="${model}"]`);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    for (const other of modes.filter(value => value !== model)) {
      await expect(page.locator(`button[data-signal-model="${other}"]`)).toHaveAttribute("aria-pressed", "false");
    }
  }
  expect(errors).toEqual([]);
});

test("motion off and reduced motion show static selectable graphics and recover", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => localStorage.setItem("world-library-motion", "off"));
  await openHome(page);
  await expect(field(page)).toHaveAttribute("data-signal-ready", "false");
  await expectStaticModel(page, "orbit");

  const terrain = page.locator('button[data-signal-model="terrain"]');
  await terrain.focus();
  await page.keyboard.press("Enter");
  await expect(terrain).toHaveAttribute("aria-pressed", "true");
  await expectStaticModel(page, "terrain");
  await expect(page.locator("[data-signal-label]")).toContainText("地形");

  const toggle = page.locator("[data-motion-toggle]:visible").first();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await field(page).scrollIntoViewIfNeeded();
  await expect.poll(async () =>
    await field(page).getAttribute("data-signal-ready") === "true" ||
    await field(page).getAttribute("data-signal-state") === "unavailable",
  { timeout: 15000 }).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(toggle).toBeDisabled();
  await expect(field(page)).toHaveAttribute("data-signal-ready", "false");
  await expectStaticModel(page, "terrain");
  await expect(field(page).locator("canvas:visible")).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () =>
    await field(page).getAttribute("data-signal-ready") === "true" ||
    await field(page).getAttribute("data-signal-state") === "unavailable",
  { timeout: 15000 }).toBe(true);
});

test("WebGL failure keeps the graphic switcher and search usable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (String(kind).includes("webgl")) return null;
      return original.call(this, kind, ...args);
    };
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await openHome(page);
  await expect(field(page)).toHaveAttribute("data-signal-state", "unavailable");
  await expect(field(page)).toHaveAttribute("data-signal-ready", "false");
  await expectStaticModel(page, "orbit");
  const crest = page.locator('button[data-signal-model="crest"]');
  await crest.focus();
  await page.keyboard.press("Space");
  await expect(crest).toHaveAttribute("aria-pressed", "true");
  await expectStaticModel(page, "crest");
  await expect(page.locator("[data-signal-label]")).toContainText(/徽记|印记/);
  await page.locator("#home-query").fill("卡夏");
  await page.locator(".home-search button[type=submit]").click();
  await expect(page.locator("[data-search-input]")).toHaveValue("卡夏");
  await expect(page.locator(".search-result__title").first()).toHaveText("伊琳沃克");
  expect(errors).toEqual([]);
});

test("the homepage retains a static dark observatory without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(new URL("/", baseURL).href);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("#home-title")).toBeVisible();
    await expect(field(page)).toHaveAttribute("data-signal-ready", "false");
    await expectStaticModel(page, "orbit");
    await expect(page.locator("[data-signal-controls]")).toBeHidden();
    await expect(field(page).locator("canvas")).toHaveCount(0);
    await expect(page.locator("#home-query")).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("point-field resources stay out of reading, search, timeline and map pages", async ({ page }) => {
  for (const route of ["/nations/nat-inibholc/", "/search/", "/timeline/", "/portals/atlas/"]) {
    await page.goto(route);
    await expect(page.locator('[data-signal-field]')).toHaveCount(0);
    await expect(page.locator('script[src*="signal."]')).toHaveCount(0);
  }
});
