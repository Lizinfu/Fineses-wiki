import test from "node:test";
import assert from "node:assert/strict";
import { cityContextTiles } from "../../assets/scripts/atlas/city-context.mjs";

const period = 4896,
  city = Object.freeze({
    id: "city.cathair",
    center: Object.freeze({ x: 2210.042669066043, y: 713.0032916627355 }),
    foundationRadius: 30.356454312927962,
  }),
  SQRT3 = Math.sqrt(3);

function inside(point, cell, inset = 1) {
  const dx = Math.abs(point.x - cell.point.x),
    dy = Math.abs(point.y - cell.point.y),
    radius = cell.radius * inset;
  return dx <= radius + 1e-8 && dy <= SQRT3 * radius / 2 + 1e-8 &&
    SQRT3 * dx + dy <= SQRT3 * radius + 1e-8;
}

function covered(context, point) {
  assert.ok(context.cells.some(cell => inside(point, cell)),
    `missing ground at ${point.x}, ${point.y}`);
}

function checkViewport(camera, width, height, context) {
  const halfWidth = width / (2 * camera.zoom),
    halfHeight = height / (2 * camera.zoom * camera.tilt),
    centerY = camera.y + context.height;
  for (let i = 0; i <= 24; i++) {
    const fraction = i / 24;
    // Check edges beyond the viewport as well: pan/resize must not reveal a gap.
    for (const padding of [0, context.radius * 2]) {
      const x = camera.x - halfWidth - padding + fraction * (halfWidth + padding) * 2,
        y = centerY - halfHeight - padding + fraction * (halfHeight + padding) * 2;
      covered(context, { x, y: centerY - halfHeight - padding });
      covered(context, { x, y: centerY + halfHeight + padding });
      covered(context, { x: camera.x - halfWidth - padding, y });
      covered(context, { x: camera.x + halfWidth + padding, y });
    }
  }
  for (let col = 0; col <= 8; col++)
    for (let row = 0; row <= 8; row++)
      covered(context, {
        x: camera.x - halfWidth + col * halfWidth / 4,
        y: centerY - halfHeight + row * halfHeight / 4,
      });
}

test("coarse city context covers the whole viewport with two-tile padding at every city zoom and tilt", () => {
  for (const zoom of [2.05, 2.4, 9, 40])
    for (const tilt of [0.78, 1])
      for (const [width, height] of [[1080, 640], [390, 710]]) {
        const camera = Object.freeze({ x: city.center.x + 11, y: city.center.y - 17, zoom, tilt }),
          context = cityContextTiles(camera, width, height, city, period, 31);
        assert.equal(context.radius, city.foundationRadius);
        assert.equal(context.height, 31);
        checkViewport(camera, width, height, context);
      }
});

test("wrapped copies retain the same city-anchored grid and deterministic traces", () => {
  const camera = { x: city.center.x + 12, y: city.center.y - 7, zoom: 6, tilt: 0.78 },
    original = cityContextTiles(camera, 1000, 600, city, period, 31);
  for (const copy of [-2, -1, 1, 2]) {
    const wrapped = cityContextTiles({ ...camera, x: camera.x + period * copy }, 1000, 600, city, period, 31);
    assert.equal(wrapped.copy, copy);
    assert.notEqual(wrapped.key, original.key);
    assert.equal(wrapped.cells.length, original.cells.length);
    for (let index = 0; index < original.cells.length; index++) {
      const a = original.cells[index], b = wrapped.cells[index];
      assert.equal(a.col, b.col);
      assert.equal(a.row, b.row);
      assert.ok(Math.abs(b.point.x - a.point.x - period * copy) < 1e-8);
      assert.equal(a.point.y, b.point.y);
      for (let i = 0; i < a.trace.length; i++) {
        assert.ok(Math.abs(b.trace[i].x - a.trace[i].x - period * copy) < 1e-8);
        assert.equal(a.trace[i].y, b.trace[i].y);
      }
    }
    checkViewport({ ...camera, x: camera.x + period * copy }, 1000, 600, wrapped);
  }
  const seamCity = { ...city, center: { x: period - 10, y: city.center.y } },
    seam = cityContextTiles({ ...camera, x: 10 }, 1000, 600, seamCity, period, 31);
  assert.equal(seam.copy, -1);
  assert.equal(seam.cells.find(cell => cell.col === 0 && cell.row === 0).point.x, -10);
});

test("expanding the known landscape keeps the missing-data grid at its original coarse size", () => {
  const camera = { ...city.center, zoom: 8, tilt: 0.78 },
    original = cityContextTiles(camera, 1080, 640, city, period, 31),
    expanded = cityContextTiles(camera, 1080, 640, {
      ...city, contextRadius: city.foundationRadius, foundationRadius: city.foundationRadius * 1.8,
    }, period, 31);
  assert.equal(expanded.radius, original.radius);
  assert.deepEqual(expanded.cells, original.cells);
});

test("cache keys and geometry remain stable until the visible axial range changes", () => {
  const camera = { x: city.center.x + 5.2, y: city.center.y + 8.3, zoom: 9.3, tilt: 0.78 },
    a = cityContextTiles(camera, 913, 577, city, period, 31),
    b = cityContextTiles({ ...camera, x: camera.x + 1e-5, y: camera.y + 1e-5, zoom: camera.zoom + 1e-8 }, 913, 577, city, period, 31);
  assert.equal(a.key, b.key);
  assert.deepEqual(a.cells, b.cells);
  assert.notEqual(a.key, cityContextTiles({ ...camera, x: camera.x + city.foundationRadius * 3 }, 913, 577, city, period, 31).key);
  assert.notEqual(a.key, cityContextTiles(camera, 1913, 577, city, period, 31).key);
  assert.notEqual(a.key, cityContextTiles(camera, 913, 577, { ...city, id: "city.other" }, period, 31).key);
});

test("all data traces stay inside their coarse hexagon and agree across viewport changes", () => {
  const camera = { ...city.center, zoom: 2.05, tilt: 0.78 },
    a = cityContextTiles(camera, 1000, 600, city, period, 31),
    b = cityContextTiles({ ...camera, y: camera.y + 80 }, 1000, 600, city, period, 31),
    other = new Map(b.cells.map(cell => [`${cell.col}:${cell.row}`, cell]));
  assert.ok(a.cells.length < 500, "coarse context should need hundreds, not tens of thousands, of cells");
  let shared = 0;
  for (const cell of a.cells) {
    assert.ok(cell.trace.length >= 4 && cell.trace.length <= 8);
    for (let i = 1; i < cell.trace.length; i++) {
      const start = cell.trace[i - 1], end = cell.trace[i];
      for (const t of [0, 0.25, 0.5, 0.75, 1])
        assert.ok(inside({ x: start.x * (1 - t) + end.x * t, y: start.y * (1 - t) + end.y * t }, cell, 0.85));
    }
    const matching = other.get(`${cell.col}:${cell.row}`);
    if (matching) {
      shared++;
      assert.deepEqual(cell.trace, matching.trace);
    }
  }
  assert.ok(shared > 0);
});

test("invalid or empty viewports produce no geometry", () => {
  const camera = { ...city.center, zoom: 2.4, tilt: 0.78 };
  for (const args of [
    [camera, 0, 600, city, period],
    [camera, 1000, -1, city, period],
    [{ ...camera, zoom: 0 }, 1000, 600, city, period],
    [{ ...camera, tilt: NaN }, 1000, 600, city, period],
    [camera, 1000, 600, { ...city, foundationRadius: 0 }, period],
    [camera, 1000, 600, city, 0],
    [camera, 1000, 600, undefined, period],
  ])
    assert.deepEqual(cityContextTiles(...args).cells, []);
});
