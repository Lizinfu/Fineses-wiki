import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import { hexCenter, createSpace } from "../../assets/scripts/atlas/space.mjs";
import { createBlockBoard } from "../../assets/scripts/atlas/blocks.mjs";
import { buildSurfacePatches } from "../../assets/scripts/atlas/surface.mjs";

const SQRT3 = Math.sqrt(3), area = 3 * SQRT3 / 2,
  near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`),
  cell = (col, row, height = 9, material = "stone") => ({
    id: `${col}:${row}`, col, row, point: { x: col * 1.5, y: (row + col / 2) * SQRT3 },
    radius: 1, height, material,
  }),
  options = { heightOf: cell => cell.height },
  totalArea = patches => patches.reduce((sum, patch) =>
    sum + patch.loops.reduce((area, loop) => area + loop.area, 0), 0);

test("equal-height connected cells have a single full-size top with no shared internal edge", () => {
  const cells = [cell(0, 0), cell(1, 0), cell(2, 0)],
    patches = buildSurfacePatches(cells, options);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].loops.length, 1);
  assert.equal(patches[0].loops[0].hole, false);
  assert.equal(patches[0].loops[0].points.length, 14);
  assert.equal(patches[0].exposedEdges.length, 14);
  near(totalArea(patches), cells.length * area);
  const points = patches[0].loops[0].points;
  assert.ok(points.some((p, i) => {
    const a = points[(i + points.length - 1) % points.length], b = points[(i + 1) % points.length];
    return (p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x) < -1e-8;
  }), "concave boundary corners must survive the union");
});

test("hexagonal holes remain open with opposite winding and correct union area", () => {
  const cells = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([q, r]) => cell(q, r)),
    patches = buildSurfacePatches(cells, options),
    loops = patches[0].loops;
  assert.equal(patches.length, 1);
  assert.equal(loops.length, 2);
  assert.equal(loops[0].hole, false);
  assert.equal(loops[1].hole, true);
  near(loops[1].area, -area);
  near(totalArea(patches), 6 * area);
});

test("different heights stay separate and expose both sides of the discontinuity", () => {
  const a = cell(0, 0, 9), b = cell(1, 0, 14),
    patches = buildSurfacePatches([a, b], options);
  assert.equal(patches.length, 2);
  for (const patch of patches) {
    assert.equal(patch.exposedEdges.length, 6);
    const shared = patch.exposedEdges.find(edge => edge.neighbor);
    assert.equal(shared.neighborHeight, patch.height === 9 ? 14 : 9);
    near(Math.hypot(shared.points[0].x - shared.cell.point.x,
      shared.points[0].y + patch.height - shared.cell.point.y), shared.cell.radius);
  }
  near(totalArea(patches), 2 * area);
});

test("material and political groups preserve cells without inventing a same-height cliff", () => {
  const cells = [cell(0, 0, 9, "stone"), cell(1, 0, 9, "snow")];
  cells[0].owner = "a";
  cells[1].owner = "b";
  const snapshot = structuredClone(cells),
    patches = buildSurfacePatches(cells, { ...options, groupOf: cell => `${cell.material}:${cell.owner}` });
  assert.equal(patches.length, 2);
  for (const patch of patches) {
    assert.equal(patch.exposedEdges.length, 5);
    assert.ok(patch.exposedEdges.every(edge => !edge.neighbor));
    assert.equal(patch.cells[0], cells.find(cell => cell.material === patch.material));
  }
  assert.deepEqual(cells, snapshot);
  assert.equal(buildSurfacePatches(cells, { ...options, groupOf: () => "uniform" }).length, 1);
});

test("disconnected land and below-zero surfaces remain independent", () => {
  const cells = [cell(0, 0, -11), cell(5, 0, -11)], patches = buildSurfacePatches(cells, options);
  assert.equal(patches.length, 2);
  near(totalArea(patches), 2 * area);
  for (const patch of patches) {
    assert.equal(patch.height, -11);
    near((patch.bounds.minY + patch.bounds.maxY) / 2, patch.cells[0].point.y + 11);
  }
});

test("wrapped neighbors form one unfolded continuous top and no false exposed seam", () => {
  const grid = { columns: 4, rows: 3, hex_size: 1 }, period = 6,
    cells = [0, 3].map(col => ({ ...cell(col, 1), point: hexCenter(col, 1, grid) })),
    patches = buildSurfacePatches(cells, { ...options, period });
  assert.equal(patches.length, 1);
  assert.equal(patches[0].loops.length, 1);
  assert.equal(patches[0].loops[0].points.length, 10);
  assert.equal(patches[0].exposedEdges.length, 10);
  near(totalArea(patches), 2 * area);
  assert.ok(patches[0].bounds.maxX - patches[0].bounds.minX < period);
  for (const loop of patches[0].loops)
    for (let i = 0; i < loop.points.length; i++) {
      const a = loop.points[i], b = loop.points[(i + 1) % loop.points.length];
      near(Math.hypot(a.x - b.x, a.y - b.y), 1);
    }
});

test("a surface winding around the whole world keeps a finite planar cut without false cliff edges", () => {
  const grid = { columns: 4, rows: 3, hex_size: 1 }, cells = [];
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 3; row++)
      cells.push({ ...cell(col, row), point: hexCenter(col, row, grid) });
  const patches = buildSurfacePatches(cells, { ...options, period: 6 });
  assert.equal(patches.length, 1);
  assert.ok(patches[0].loops.every(loop => loop.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
  assert.ok(patches[0].exposedEdges.every(edge => !edge.neighbor));
  near(totalArea(patches), cells.length * area);
});

test("real world and city surfaces preserve every logical tile and total ground area", () => {
  const yaml = name => parse(fs.readFileSync(new URL(`../../data/maps/${name}.yaml`, import.meta.url), "utf8")),
    data = {
      maps: yaml("layers").maps, tile_masks: yaml("tiles").masks,
      areas: yaml("areas").areas.filter(area => area.map_id === "world"),
      detail_locations: yaml("locations").locations, feature_maps: yaml("features").maps,
      world_relief: yaml("world-relief"),
    },
    space = createSpace(data), board = createBlockBoard(data, space);
  for (const enabled of [true, false]) {
    const patches = buildSurfacePatches(board.cells, {
      heightOf: cell => board.cellHeight(cell, enabled),
      groupOf: cell => `${cell.material}:${cell.owner?.id}`,
      period: space.period,
    });
    assert.equal(new Set(patches.flatMap(patch => patch.cells)).size, board.cells.length);
    near(totalArea(patches), board.cells.length * area * space.root.grid.hex_size ** 2);
    for (const city of board.cities.values()) {
      const patches = buildSurfacePatches(city.cells, {
        heightOf: cell => board.localHeight(city, cell, enabled),
        groupOf: cell => String(cell.outskirts),
        period: space.period,
      });
      assert.equal(new Set(patches.flatMap(patch => patch.cells)).size, city.cells.length);
      near(totalArea(patches), city.cells.length * area * city.radius ** 2);
      assert.ok(patches.every(patch => patch.cells.every(cell => cell.outskirts === patch.cells[0].outskirts)));
    }
  }
});

test("empty surface lists remain empty and invalid geometry is rejected", () => {
  assert.deepEqual(buildSurfacePatches([], options), []);
  assert.throws(() => buildSurfacePatches([cell(0, 0)]), /heightOf/);
  assert.throws(() => buildSurfacePatches([cell(0, 0, NaN)], options), /finite/);
});
