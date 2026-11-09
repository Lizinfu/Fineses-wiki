import test from "node:test";
import assert from "node:assert/strict";
import { MIN_ZOOM, MAX_ZOOM, COUNTRY_LABEL_ZOOM, visibleWorldCopies, verticalCameraLimits, constrainCameraY } from "../../assets/scripts/atlas/viewport.mjs";

const period = 4896, bounds = { minX: 30, maxX: 4938 };

test("zoom limits keep the overview readable and leave a country-label transition", () => {
  assert.equal(MIN_ZOOM, 0.37);
  assert.ok(COUNTRY_LABEL_ZOOM > MIN_ZOOM);
  assert.ok(MAX_ZOOM > COUNTRY_LABEL_ZOOM);
});

test("horizontal copies remain visible across both seams above the old zoom cutoff", () => {
  for (const zoom of [0.63, 1.3, 4]) {
    assert.deepEqual(visibleWorldCopies({ x: 80, zoom }, 1400, period, bounds), [-1, 0]);
    assert.deepEqual(visibleWorldCopies({ x: period - 80, zoom }, 1400, period, bounds), [0, 1]);
    assert.deepEqual(visibleWorldCopies({ x: period / 2, zoom }, 1400, period, bounds), [0]);
  }
});

test("coverage follows the viewport width and geometry rather than a fixed three-strip limit", () => {
  const camera = { x: 80, zoom: MIN_ZOOM }, width = 10000;
  const copies = visibleWorldCopies(camera, width, period, bounds);
  assert.ok(copies.includes(-2) && copies.includes(2));
  const left = camera.x - width / (2 * camera.zoom), right = camera.x + width / (2 * camera.zoom);
  for (const index of copies) {
    assert.ok(bounds.maxX + index * period >= left);
    assert.ok(bounds.minX + index * period <= right);
  }
  assert.ok(bounds.maxX + (copies[0] - 1) * period < left);
  assert.ok(bounds.minX + (copies.at(-1) + 1) * period > right);
  // A country's detail layer can be entirely in the preceding world copy.
  assert.deepEqual(visibleWorldCopies({ x: 40, zoom: 2 }, 900, period, { minX: 4800, maxX: 4860 }), [-1]);
});

test("empty or invalid viewports do not create copies", () => {
  assert.deepEqual(visibleWorldCopies({ x: 0, zoom: 1 }, 0, period, bounds), []);
  assert.deepEqual(visibleWorldCopies({ x: 0, zoom: 0 }, 800, period, bounds), []);
  assert.deepEqual(visibleWorldCopies({ x: 0, zoom: 1 }, 800, 0, bounds), []);
});

test("the minimum zoom locks vertical motion even in a short viewport", () => {
  const bounds = { minY: 100, maxY: 2100 };
  for (const height of [300, 600, 1200])
    for (const tilt of [0.78, 1]) {
      const view = { x: -400, y: -9000, zoom: MIN_ZOOM, tilt };
      assert.deepEqual(verticalCameraLimits(view, height, bounds), { minY: 1100, maxY: 1100 });
      assert.deepEqual(constrainCameraY(view, height, bounds), { ...view, y: 1100 });
    }
});

test("zoomed navigation keeps the visible north and south inside the map", () => {
  const bounds = { minY: 100, maxY: 2100 };
  for (const zoom of [0.63, 1.3, 8])
    for (const tilt of [0.78, 1]) {
      const view = { x: 300, y: 1100, zoom, tilt };
      const limits = verticalCameraLimits(view, 600, bounds);
      const halfViewport = 600 / (2 * zoom * tilt);
      assert.ok(limits.minY - halfViewport >= bounds.minY - 1e-8);
      assert.ok(limits.maxY + halfViewport <= bounds.maxY + 1e-8);
      assert.equal(constrainCameraY({ ...view, y: -10000 }, 600, bounds).y, limits.minY);
      assert.equal(constrainCameraY({ ...view, y: 10000 }, 600, bounds).y, limits.maxY);
    }
});

test("vertical travel opens smoothly above the minimum and adapts to height and tilt", () => {
  const bounds = { minY: 100, maxY: 2100 };
  const view = { x: 10, y: 1100, zoom: MIN_ZOOM + 1e-6, tilt: 0.78 };
  const tinyRange = verticalCameraLimits(view, 300, bounds);
  assert.ok(tinyRange.maxY - tinyRange.minY < 0.01);
  const zoomed = { ...view, zoom: 1.3, y: 2000 };
  const taller = constrainCameraY(zoomed, 1200, bounds);
  const shorter = constrainCameraY(zoomed, 600, bounds);
  assert.ok(taller.y < shorter.y);
  assert.ok(constrainCameraY({ ...zoomed, tilt: 1 }, 1200, bounds).y >= taller.y);
  assert.equal(constrainCameraY({ ...zoomed, zoom: MIN_ZOOM }, 600, bounds).y, 1100);
});
