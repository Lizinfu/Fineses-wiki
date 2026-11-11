import { expect, test } from "@playwright/test";

async function openRecommendations(page, { clock = false } = {}) {
  if (clock) await page.clock.install();
  await page.goto("/");
  if (clock) {
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}" });
  }
  const notice = page.locator("#library-announcement");
  if (await notice.isVisible()) await notice.locator("[data-announcement-close]").click();
  const section = page.locator("[data-recommendations]");
  await expect(section).toHaveAttribute("data-recommendations-ready", "true");
  await section.evaluate(element => element.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.mouse.move(1, 1);
  return section;
}

test("recommended archives keep ordinary links and manual keyboard navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const section = await openRecommendations(page);
  const slides = section.locator("[data-recommendation]");
  const count = await slides.count();
  expect(count).toBeGreaterThan(1);
  await expect(slides.locator("a.recommendations__card")).toHaveCount(count);
  for (const link of await slides.locator("a.recommendations__card").all()) {
    await expect(link).toHaveAttribute("href", /^\//);
  }
  await section.locator("[data-recommendation-next]").click();
  await expect(section).toHaveAttribute("data-recommendations-index", "1");
  await expect(section.locator('[data-recommendation-goto="1"]')).toHaveAttribute("aria-current", "true");
  const track = section.locator("[data-recommendations-track]");
  await track.focus();
  await track.press("End");
  await expect(section).toHaveAttribute("data-recommendations-index", String(count - 1));
  await track.press("ArrowRight");
  await expect(section).toHaveAttribute("data-recommendations-index", "0");
  await expect(section.locator("[data-recommendation-status]")).toContainText("推荐阅读 1 /");
  expect(await section.locator(".recommendations__summary").evaluateAll(elements =>
    elements.every(element => element.scrollHeight <= element.clientHeight + 1),
  )).toBe(true);
});

test("automatic recommendations pause for hover, focus and offscreen reading", async ({ page }) => {
  const section = await openRecommendations(page, { clock: true });
  await expect(section).toHaveAttribute("data-recommendations-state", "playing");
  await page.clock.fastForward(7100);
  await expect(section).toHaveAttribute("data-recommendations-index", "1");
  await section.hover();
  await expect(section).toHaveAttribute("data-recommendations-state", "paused");
  await page.clock.fastForward(20000);
  await expect(section).toHaveAttribute("data-recommendations-index", "1");
  await page.mouse.move(1, 1);
  // The smooth scroll may still have a pending settle callback after the jump.
  await page.clock.fastForward(500);
  await expect(section).toHaveAttribute("data-recommendations-state", "playing");
  await section.locator("[data-recommendations-track]").focus();
  await expect(section.locator("[data-recommendation-toggle]")).toHaveAttribute("aria-pressed", "false");
  await page.clock.fastForward(20000);
  await expect(section).toHaveAttribute("data-recommendations-index", "1");
  // An explicit Play action is required after focus or manual navigation.
  await section.locator("[data-recommendation-toggle]").press("Space");
  await expect(section.locator("[data-recommendation-toggle]")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await expect(section).toHaveAttribute("data-recommendations-state", "paused");
  await page.clock.fastForward(20000);
  await expect(section).toHaveAttribute("data-recommendations-index", "1");
});

for (const preference of ["reduced", "off"]) {
  test(`${preference} motion prevents automatic changes while preserving controls`, async ({ page }) => {
    if (preference === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    else await page.addInitScript(() => localStorage.setItem("world-library-motion", "off"));
    const section = await openRecommendations(page, { clock: true });
    await expect(section.locator("[data-recommendation-toggle]")).toBeDisabled();
    await expect(section).toHaveAttribute("data-recommendations-state", "paused");
    await page.clock.fastForward(30000);
    await expect(section).toHaveAttribute("data-recommendations-index", "0");
    await section.locator("[data-recommendation-next]").click();
    await expect(section).toHaveAttribute("data-recommendations-index", "1");
    await expect(section.locator("[data-recommendation-toggle]")).toBeDisabled();
  });
}

test("a single recommendation has no automatic rotation or inactive controls", async ({ page }) => {
  await page.route("**/", async route => {
    if (route.request().resourceType() !== "document" || new URL(route.request().url()).pathname !== "/") return route.continue();
    const response = await route.fetch();
    let html = await response.text();
    const slides = html.match(/<article\b[^>]*\bdata-recommendation(?=[\s=>])[\s\S]*?<\/article>/g) ?? [];
    expect(slides.length).toBeGreaterThan(1);
    for (const slide of slides.slice(1)) html = html.replace(slide, "");
    await route.fulfill({ response, body: html });
  });
  const section = await openRecommendations(page, { clock: true });
  await expect(section.locator("[data-recommendation]")).toHaveCount(1);
  await expect(section).toHaveAttribute("data-recommendations-state", "static");
  await expect(section.locator("[data-recommendations-controls]")).toBeHidden();
  await page.clock.fastForward(30000);
  await expect(section).toHaveAttribute("data-recommendations-state", "static");
});

test("recommendations remain horizontally browsable without JavaScript at 320px", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(new URL("/", baseURL).href);
    const section = page.locator("[data-recommendations]");
    const track = section.locator("[data-recommendations-track]");
    const count = await section.locator("[data-recommendation]").count();
    expect(count).toBeGreaterThan(1);
    await expect(section.locator("[data-recommendations-controls]")).toBeHidden();
    await track.evaluate(element => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const end = await track.evaluate(element => ({
      remaining: element.scrollWidth - element.clientWidth - element.scrollLeft,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(end.remaining).toBeLessThanOrEqual(2);
    expect(end.overflow).toBeLessThanOrEqual(1);
  } finally {
    await context.close();
  }
});
