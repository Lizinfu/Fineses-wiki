import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);
const targetPath = "/nations/nat-inibholc/";
const catalogSelector = `a.catalog-card[href$="${targetPath}"]`;
const preview = entry => entry.locator(":scope > .entry-preview");

async function focusWithKeyboard(page, target) {
  await page.keyboard.press("Tab");
  await target.focus();
}

async function expectHidden(entry) {
  await expect.poll(() => preview(entry).evaluate(node => Number(getComputedStyle(node).opacity))).toBe(0);
}

async function expectShown(entry) {
  await expect.poll(() => preview(entry).evaluate(node => Number(getComputedStyle(node).opacity))).toBeGreaterThan(0);
  const opacity = await preview(entry).evaluate(node => Number(getComputedStyle(node).opacity));
  expect(opacity).toBeLessThanOrEqual(0.3);
  expect(await preview(entry).evaluate(node => getComputedStyle(node).backgroundImage)).not.toBe("none");
  await expect(preview(entry)).toHaveAttribute("aria-hidden", "true");
}

async function expectInsideRightSide(entry) {
  const boxes = await entry.evaluate(node => {
    const outer = node.getBoundingClientRect();
    const image = node.querySelector(":scope > .entry-preview").getBoundingClientRect();
    return {
      outer: { left: outer.left, right: outer.right, top: outer.top, bottom: outer.bottom, width: outer.width },
      image: { left: image.left, right: image.right, top: image.top, bottom: image.bottom, width: image.width },
    };
  });
  // The gradient can begin at 40%, but the picture stays inside the entry and
  // never becomes a page-wide or adjacent-row backdrop.
  expect(boxes.image.left).toBeGreaterThanOrEqual(boxes.outer.left + boxes.outer.width * 0.39);
  expect(boxes.image.right).toBeLessThanOrEqual(boxes.outer.right + 1);
  expect(boxes.image.top).toBeGreaterThanOrEqual(boxes.outer.top - 1);
  expect(boxes.image.bottom).toBeLessThanOrEqual(boxes.outer.bottom + 1);
}

test("configured catalog entries reveal a decorative right-side image without changing navigation", async ({ page }, testInfo) => {
  const requests = [];
  page.on("request", request => requests.push(request.url()));
  await page.goto("/nations/");
  const entry = page.locator(catalogSelector);
  const other = page.locator('a.catalog-card[href$="/nations/nat-dunossai/"]');
  await expect(entry).toHaveAttribute("data-entry-preview", "");
  await expect(preview(entry)).toHaveCount(1);
  await expect(preview(other)).toHaveCount(0);
  await expect(other).not.toHaveClass(/has-entry-preview/);
  await expectHidden(entry);
  const href = await entry.getAttribute("href");
  const before = await entry.boundingBox();

  if (testInfo.project.name === "desktop") {
    const imageURL = await entry.evaluate(node => {
      const value = getComputedStyle(node).getPropertyValue("--entry-preview-image").trim();
      const match = value.match(/^url\((["']?)(.*?)\1\)$/);
      return match ? new URL(match[2], location.href).href : null;
    });
    expect(imageURL).not.toBeNull();
    expect(requests.filter(url => url === imageURL)).toHaveLength(0);
    expect(await preview(entry).evaluate(node => getComputedStyle(node).backgroundImage)).toBe("none");
    await entry.hover();
    await expectShown(entry);
    await expect.poll(() => requests.filter(url => url === imageURL).length).toBe(1);
    await expect(entry).toHaveAttribute("data-entry-preview-loaded", "true");
    const activeOpacity = await entry.evaluate(node => Number(getComputedStyle(node).getPropertyValue("--entry-preview-opacity")));
    await expect.poll(() => preview(entry).evaluate(node => Number(getComputedStyle(node).opacity))).toBeCloseTo(activeOpacity, 3);
    await expectInsideRightSide(entry);
    const after = await entry.boundingBox();
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height).toBeCloseTo(before.height, 1);
    await page.mouse.move(0, 0);
    const fade = await preview(entry).evaluate(node => ({
      opacity: Number(getComputedStyle(node).opacity),
      background: getComputedStyle(node).backgroundImage,
      running: node.getAnimations().some(animation => animation.playState === "running"),
    }));
    expect(fade.background).not.toBe("none");
    expect(fade.opacity).toBeGreaterThan(0);
    expect(fade.opacity).toBeLessThanOrEqual(activeOpacity);
    expect(fade.running).toBe(true);
    await expectHidden(entry);
  } else {
    await entry.tap();
    await expect(page).toHaveURL(new RegExp(`${targetPath}$`));
    return;
  }

  await focusWithKeyboard(page, entry);
  await expectShown(entry);
  await expect(entry).toHaveAttribute("href", href);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${targetPath}$`));
  await expect(page.locator("h1")).toHaveText("伊琳沃克");
});

test("taxonomy and relationship entries consume the target document preview", async ({ page }) => {
  await page.goto("/eras/现代/");
  const termEntry = page.locator(catalogSelector);
  await expect(preview(termEntry)).toHaveCount(1);
  await focusWithKeyboard(page, termEntry);
  await expectShown(termEntry);
  await expectInsideRightSide(termEntry);

  await page.goto("/characters/inibholc/per-flamel/");
  const relation = page.locator("li.relation-item").filter({ has: page.locator(`a.relation-item__target[href$="${targetPath}"]`) }).first();
  const link = relation.locator(`a.relation-item__target[href$="${targetPath}"]`);
  await expect(preview(relation)).toHaveCount(1);
  await focusWithKeyboard(page, link);
  await expectShown(relation);
  await expectInsideRightSide(relation);
});

test("body search results use the same optional target preview", async ({ page }, testInfo) => {
  await page.goto("/search/?q=卡夏");
  const result = page.locator(".search-result").filter({ has: page.locator(`.search-result__title a[href$="${targetPath}"]`) });
  await expect(result).toHaveCount(1);
  await expect(preview(result)).toHaveCount(1);
  const link = result.locator(".search-result__title a");
  if (testInfo.project.name === "desktop") await result.hover();
  else await focusWithKeyboard(page, link);
  await expectShown(result);
  await expectInsideRightSide(result);
  await expect(result.locator("mark", { hasText: "卡夏" }).first()).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${targetPath}$`));
});

test("light and dark modes retain a restrained preview with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/nations/");
  const entry = page.locator(catalogSelector);
  for (const theme of ["dark", "light"]) {
    if (await page.locator("html").getAttribute("data-theme") !== theme) {
      await page.locator("[data-theme-toggle]").click();
    }
    await focusWithKeyboard(page, entry);
    await expectShown(entry);
    await expectInsideRightSide(entry);
    const duration = await preview(entry).evaluate(node => getComputedStyle(node).transitionDuration);
    expect(duration.split(",").every(value => Number.parseFloat(value) === 0)).toBe(true);
    await page.locator("[data-theme-toggle]").focus();
    await expectHidden(entry);
  }
});

test("previews remain a CSS enhancement when JavaScript is disabled", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 }, isMobile: false, hasTouch: false });
  try {
    const page = await context.newPage();
    await page.goto(new URL("/nations/", baseURL).href);
    const entry = page.locator(catalogSelector);
    await expectHidden(entry);
    await entry.hover();
    await expectShown(entry);
    await expectInsideRightSide(entry);
    await page.mouse.move(0, 0);
    await expectHidden(entry);
    await focusWithKeyboard(page, entry);
    await expectShown(entry);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${targetPath}$`));
    await expect(page.locator(".entity-content")).toContainText("伊琳沃克第三帝国");
  } finally {
    await context.close();
  }
});

test("touch entries at 320px keep the preview hidden and preserve the first tap", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch-only behavior.");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/nations/");
  const entry = page.locator(catalogSelector);
  await expectHidden(entry);
  await expectInsideRightSide(entry);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await entry.tap();
  await expect(page).toHaveURL(new RegExp(`${targetPath}$`));
  await expect(page.locator("h1")).toHaveText("伊琳沃克");
});

test("missing configured images fail a minimal Hugo build without editing site content", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The isolated build check runs once.");
  const cache = path.resolve(".cache");
  await fs.mkdir(cache, { recursive: true });
  const fixture = await fs.mkdtemp(path.join(cache, "entry-preview-fixture-"));
  try {
    await fs.mkdir(path.join(fixture, "content"));
    await fs.mkdir(path.join(fixture, "layouts", "_partials", "media"), { recursive: true });
    await fs.writeFile(path.join(fixture, "hugo.toml"), 'baseURL = "https://fixture.invalid/"\ntitle = "Preview fixture"\n');
    await fs.writeFile(path.join(fixture, "content", "_index.md"), '---\ntitle: Missing image fixture\nparams:\n  hover_preview: missing.png\n---\nFixture body.\n');
    await fs.copyFile(path.resolve("layouts/_partials/media/hover-preview.html"), path.join(fixture, "layouts", "_partials", "media", "hover-preview.html"));
    await fs.writeFile(path.join(fixture, "layouts", "home.html"), '{{ $preview := partial "media/hover-preview.html" . }}{{ with $preview }}{{ .src }}{{ end }}');
    let failure;
    try {
      await runFile("hugo", ["--source", fixture, "--destination", path.join(fixture, "public")], { timeout: 15000, windowsHide: true });
    } catch (error) {
      failure = error;
    }
    expect(failure?.code).toBe(1);
    expect(`${failure?.stdout ?? ""}\n${failure?.stderr ?? ""}`).toMatch(/hover_preview[\s\S]*cannot find page or parent image resource[\s\S]*missing\.png/);
  } finally {
    // Every recursive removal is checked against this task's dedicated cache.
    if (path.dirname(fixture) !== cache || !path.basename(fixture).startsWith("entry-preview-fixture-")) throw new Error("Refusing to remove an unexpected fixture path.");
    await fs.rm(fixture, { recursive: true, force: true });
  }
});
