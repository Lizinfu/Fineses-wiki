import { test, expect } from "@playwright/test";
import { createSpace } from "../../assets/scripts/atlas/space.mjs";
import { createBlockBoard } from "../../assets/scripts/atlas/blocks.mjs";

const MIN_ZOOM = 0.37;
const root = page => page.locator("[data-atlas]");
const camera = async page => JSON.parse(await root(page).getAttribute("data-atlas-camera"));
const wrappedDelta = (delta, period) => delta - Math.round(delta / period) * period;

async function nextPaint(page) {
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
  const data = await page.locator("#atlas-map-data").evaluate(node => {
    const parsed = JSON.parse(node.textContent);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  });
  const space = createSpace(data), board = createBlockBoard(data, space);
  return { bounds: board.bounds(), period: space.period };
}

async function canvasBox(page) {
  const canvas = page.locator("[data-atlas-canvas]");
  await canvas.scrollIntoViewIfNeeded();
  return canvas.boundingBox();
}

async function drag(page, dx, dy) {
  const box = await canvasBox(page);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 2 });
  await page.mouse.up();
  await nextPaint(page);
}

async function zoomTo(page, zoom) {
  const box = await canvasBox(page), before = await camera(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, Math.log(before.zoom / zoom) / 0.0015);
  await expect.poll(async () => Math.abs((await camera(page)).zoom - zoom)).toBeLessThan(0.001);
}

async function expectCentered(page, center) {
  await expect.poll(async () => Math.abs((await camera(page)).y - center)).toBeLessThan(0.01);
}

test("37 percent overview fixes its vertical centre while horizontal navigation remains available", async ({ page, isMobile }) => {
  const { bounds, period } = await ready(page), center = (bounds.minY + bounds.maxY) / 2;
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(MIN_ZOOM, 6);
  await expectCentered(page, center);
  const box = await canvasBox(page);
  for (const dy of [box.height / 4, -box.height / 4]) {
    await drag(page, 0, dy);
    await expectCentered(page, center);
  }
  const before = await camera(page);
  await drag(page, box.width / 4, box.height / 5);
  const after = await camera(page);
  expect(Math.abs(wrappedDelta(after.x - before.x, period))).toBeGreaterThan(5);
  await expectCentered(page, center);

  await page.locator("[data-atlas-stage]").focus();
  for (const key of ["ArrowUp", "ArrowDown"]) {
    await page.keyboard.press(key);
    await nextPaint(page);
    await expectCentered(page, center);
  }

  if (isMobile) {
    const touchBox = await canvasBox(page);
    const x = touchBox.x + touchBox.width / 2, y = touchBox.y + touchBox.height / 2;
    const client = await page.context().newCDPSession(page);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ id: 1, x, y: y - 60 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ id: 1, x, y: y + 60 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await nextPaint(page);
    await expectCentered(page, center);
  }

  await page.locator("[data-atlas-tilt]").click();
  await expect.poll(async () => (await camera(page)).tilt).toBe(1);
  await drag(page, 0, box.height / 5);
  await expectCentered(page, center);
  await page.setViewportSize({ width: 390, height: 700 });
  await nextPaint(page);
  await expectCentered(page, center);
  await page.locator("[data-atlas-stage]").focus();
  await page.keyboard.press("ArrowUp");
  await nextPaint(page);
  await expectCentered(page, center);
  await expect(page.locator("[data-atlas-feature-card]")).toBeHidden();
});

for (const side of ["north", "south"]) {
  test(`zoomed navigation stops at the known ${side} edge and reverses immediately`, async ({ page }) => {
    const { bounds } = await ready(page), center = (bounds.minY + bounds.maxY) / 2;
    await zoomTo(page, 1.3);
    const before = await camera(page), sign = side === "north" ? -1 : 1;
    await page.locator("[data-atlas-stage]").focus();
    // Cover at least half the whole map, enough to reach either edge from the overview centre.
    const steps = Math.ceil((bounds.maxY - bounds.minY) * before.zoom * before.tilt / 96) + 2;
    for (let step = 0; step < steps; step++) await page.keyboard.press(side === "north" ? "ArrowUp" : "ArrowDown");
    await nextPaint(page);
    const edge = await camera(page), box = await canvasBox(page);
    expect((edge.y - before.y) * sign).toBeGreaterThan(10);
    const halfView = box.height / (2 * edge.zoom * edge.tilt);
    expect(edge.y - halfView).toBeGreaterThanOrEqual(bounds.minY - 0.1);
    expect(edge.y + halfView).toBeLessThanOrEqual(bounds.maxY + 0.1);
    await page.locator("[data-atlas-stage]").focus();
    await page.keyboard.press(side === "north" ? "ArrowUp" : "ArrowDown");
    await nextPaint(page);
    await expectCentered(page, edge.y);

    // Keep one pointer held: pushing beyond the edge must not create an invisible drag debt.
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }, outward = -sign;
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    try {
      await page.mouse.move(start.x, start.y + outward * 60, { steps: 2 });
      await nextPaint(page);
      await expectCentered(page, edge.y);
      await page.mouse.move(start.x, start.y + outward * 30, { steps: 2 });
      await nextPaint(page);
      const reversed = await camera(page);
      expect((reversed.y - edge.y) * -sign).toBeGreaterThan(10 / (edge.zoom * edge.tilt));
    } finally {
      await page.mouse.up();
    }

    await zoomTo(page, MIN_ZOOM);
    await expectCentered(page, center);
    await expect(page.locator('[data-atlas-zoom="out"]')).toBeDisabled();
  });
}
