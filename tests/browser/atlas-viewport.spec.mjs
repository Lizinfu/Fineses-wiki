import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { createSpace, project } from "../../assets/scripts/atlas/space.mjs";
import { createBlockBoard } from "../../assets/scripts/atlas/blocks.mjs";
import { constrainCameraY } from "../../assets/scripts/atlas/viewport.mjs";

const MIN_ZOOM = 0.37;
const root = page => page.locator("[data-atlas]");
const camera = async page => JSON.parse(await root(page).getAttribute("data-atlas-camera"));
const wrappedDelta = (delta, period) => delta - Math.round(delta / period) * period;
const navigationBounds = new WeakMap();

async function nextPaint(page) {
  // Let event-driven camera telemetry settle even when an input should be a no-op at the limit.
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
}

async function ready(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/portals/atlas/");
  await expect(root(page)).toHaveAttribute("data-atlas-renderer", "webgl");
  await expect(root(page)).toHaveAttribute("data-atlas-draws", /\d+/);
}

async function model(page) {
  const data = await page.locator("#atlas-map-data").evaluate(node => {
    const parsed = JSON.parse(node.textContent);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  });
  const space = createSpace(data);
  const board = createBlockBoard(data, space);
  navigationBounds.set(page, board.bounds());
  return { data, space, board };
}

async function zoomTo(page, zoom) {
  const host = page.locator("[data-atlas-canvas]");
  await host.scrollIntoViewIfNeeded();
  const box = await host.boundingBox(), before = await camera(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, Math.log(before.zoom / zoom) / 0.0015);
  await expect.poll(async () => Math.abs((await camera(page)).zoom - zoom)).toBeLessThan(0.001);
}

async function dragBy(page, dx, dy, period) {
  const host = page.locator("[data-atlas-canvas]");
  await host.scrollIntoViewIfNeeded();
  const box = await host.boundingBox(), before = await camera(page);
  const start = {
    x: box.x + box.width * (dx >= 0 ? 0.2 : 0.8),
    y: box.y + box.height * (dy >= 0 ? 0.2 : 0.8),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  if (Math.hypot(dx, dy) <= 4.5) await page.mouse.move(start.x + 8, start.y + 8);
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 2 });
  await page.mouse.up();
  await expect.poll(async () => {
    const after = await camera(page);
    const expected = constrainCameraY({ ...before, y: before.y - dy / (before.zoom * before.tilt) }, box.height, navigationBounds.get(page));
    return Math.hypot(
      wrappedDelta(after.x - before.x + dx / before.zoom, period) * before.zoom,
      (after.y - expected.y) * before.zoom * before.tilt,
    );
  }).toBeLessThan(0.25);
}

// Pan horizontally in overview; vertical movement only becomes available after zooming in.
async function centerAt(page, point, zoom, period) {
  await zoomTo(page, MIN_ZOOM);
  const box = await page.locator("[data-atlas-canvas]").boundingBox();
  for (let step = 0; step < 20; step++) {
    const view = await camera(page);
    const dx = wrappedDelta(view.x - point.x, period) * view.zoom;
    const dy = 0;
    if (Math.hypot(dx, dy) < 0.25) break;
    await dragBy(page,
      Math.max(-box.width * 0.5, Math.min(box.width * 0.5, dx)),
      Math.max(-box.height * 0.5, Math.min(box.height * 0.5, dy)), period);
  }
  await zoomTo(page, zoom);
  const view = await camera(page);
  const target = constrainCameraY({ ...view, y: point.y }, box.height, navigationBounds.get(page));
  for (let step = 0; step < 20; step++) {
    const current = await camera(page);
    const dy = (current.y - target.y) * current.zoom * current.tilt;
    if (Math.abs(dy) < 0.25) break;
    await dragBy(page, 0, Math.max(-box.height * 0.5, Math.min(box.height * 0.5, dy)), period);
  }
}

function nearestCopy(point, view, period) {
  return { ...point, x: view.x + wrappedDelta(point.x - view.x, period) };
}

async function expectLandPixels(page, points, period) {
  const canvas = page.locator(".atlas-pixi-canvas"), box = await canvas.boundingBox();
  const view = await camera(page);
  const shot = await sharp(await canvas.screenshot()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const point of points) {
    const p = project(view, nearestCopy(point, view, period), box.width, box.height);
    expect(p.x).toBeGreaterThan(8);
    expect(p.x).toBeLessThan(box.width - 8);
    expect(p.y).toBeGreaterThan(8);
    expect(p.y).toBeLessThan(box.height - 8);
    const x = Math.round(p.x * shot.info.width / box.width), y = Math.round(p.y * shot.info.height / box.height);
    const index = (y * shot.info.width + x) * 4;
    const [r, g, b] = shot.data.subarray(index, index + 3);
    // Neutral/stone land is bright; a missing copy leaves the dark blue sea here.
    expect((r + g + b) / 3).toBeGreaterThan(140);
  }
}

test("world zoom never falls below 37 percent through controls, wheel, keys or resize", async ({ page }) => {
  await ready(page);
  const out = page.locator('[data-atlas-zoom="out"]');
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(MIN_ZOOM, 6);
  await expect(out).toBeDisabled();
  await page.locator('[data-atlas-zoom="in"]').click();
  await page.locator('[data-atlas-zoom="in"]').click();
  const host = page.locator("[data-atlas-canvas]");
  await host.scrollIntoViewIfNeeded();
  const box = await host.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 5000);
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(MIN_ZOOM, 6);
  await page.locator("[data-atlas-stage]").focus();
  await page.keyboard.press("-");
  await page.keyboard.press("-");
  await nextPaint(page);
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(MIN_ZOOM, 6);
  await page.keyboard.press("+");
  await page.keyboard.press("0");
  await nextPaint(page);
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(MIN_ZOOM, 6);
  await page.locator('[data-atlas-zoom="in"]').click();
  await page.locator("[data-atlas-reset]").click();
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(MIN_ZOOM, 6);
  await page.setViewportSize({ width: 390, height: 844 });
  await nextPaint(page);
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(MIN_ZOOM, 6);
  await expect(out).toBeDisabled();
});

test("pinching out respects the same minimum world zoom", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Two-finger input on the touch profile");
  await ready(page);
  for (let i = 0; i < 3; i++) await page.locator('[data-atlas-zoom="in"]').click();
  const host = page.locator("[data-atlas-canvas]");
  await host.scrollIntoViewIfNeeded();
  const box = await host.boundingBox(), x = box.x + box.width / 2, y = box.y + box.height / 2;
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [
    { id: 1, x: x - 60, y }, { id: 2, x: x + 60, y },
  ] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [
    { id: 1, x: x - 8, y }, { id: 2, x: x + 8, y },
  ] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(MIN_ZOOM, 6);
  await expect(page.locator('[data-atlas-zoom="out"]')).toBeDisabled();
  await expect(page.locator("[data-atlas-feature-card]")).toBeHidden();
});

for (const zoom of [0.63, 1.3]) {
  test(`both sides of the world seam remain drawn when zoomed to ${zoom}`, async ({ page }) => {
    await ready(page);
    const { space, board } = await model(page);
    const west = board.raise(board.cellIndex.get("134:30").point);
    const east = board.raise(board.cellIndex.get("3:30").point);
    const center = { x: 72, y: (west.y + east.y) / 2 };
    await centerAt(page, center, zoom, space.period);
    await expectLandPixels(page, [west, east], space.period);

    // Cross the normalized x=0 boundary, then return to the same visible pair.
    await dragBy(page, (center.x + 40) * zoom, 0, space.period);
    await expect.poll(async () => (await camera(page)).x).toBeGreaterThan(space.period / 2);
    await expectLandPixels(page, [west], space.period);
    await dragBy(page, -(center.x + 40) * zoom, 0, space.period);
    await expect.poll(async () => (await camera(page)).x).toBeLessThan(space.period / 2);
    await expectLandPixels(page, [west, east], space.period);

    const draws = Number(await root(page).getAttribute("data-atlas-draws"));
    await page.locator("[data-atlas-preset-toggle]").click();
    await page.locator(".atlas-feature-controls summary").click();
    await page.locator('[data-feature-toggle="grid"]').uncheck();
    await expect.poll(async () => Number(await root(page).getAttribute("data-atlas-draws"))).toBeGreaterThan(draws);
    await page.locator(".atlas-pixi-canvas").scrollIntoViewIfNeeded();
    await expectLandPixels(page, [west, east], space.period);
  });
}

test("clicking wrapped land opens the original country archive", async ({ page }) => {
  // The neighbouring country is beyond a narrow viewport; exercise this seam in a wide view.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await ready(page);
  const { data, space, board } = await model(page);
  const west = board.raise(board.cellIndex.get("134:30").point), east = board.raise(board.cellIndex.get("3:30").point);
  await centerAt(page, { x: 72, y: (west.y + east.y) / 2 }, 0.63, space.period);
  const canvas = page.locator(".atlas-pixi-canvas"), box = await canvas.boundingBox(), view = await camera(page);
  const country = data.areas.find(area => area.id === "country.gkrk");
  const candidates = board.cells.filter(cell => cell.owner?.id === country.id).map(cell => {
    const point = nearestCopy(board.raise(cell.point), view, space.period);
    const p = project(view, point, box.width, box.height);
    return { x: p.x + box.x, y: p.y + box.y, localX: p.x, localY: p.y, worldX: point.x };
  }).filter(p => p.worldX < 0 && p.localX > 15 && p.localX < box.width - 15 && p.localY > 90 && p.localY < box.height - 60);
  const point = await page.evaluate(points => points.find(p => {
    const element = document.elementFromPoint(p.x, p.y);
    return element?.closest(".atlas-canvas") && !element.closest("button,a");
  }), candidates);
  expect(point).toBeTruthy();
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("[data-feature-card-title]")).toHaveText(country.label);
  await expect(page.locator("[data-feature-card-link]")).toHaveAttribute("href", /\/nations\/nat-gkrk\/?$/);
});
