import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import {
  createSpace,
  hexCenter,
  hexagon,
  project,
  unproject,
  zoomAt,
  pinchAt,
  expandRows,
  cellRegionCenter,
} from "../../assets/scripts/atlas/space.mjs";
const yaml = (name) =>
  parse(
    fs.readFileSync(
      new URL("../../data/maps/" + name + ".yaml", import.meta.url),
      "utf8",
    ),
  );
const data = {
  maps: yaml("layers").maps,
  tile_masks: yaml("tiles").masks,
  areas: yaml("areas").areas.filter((a) => a.map_id === "world"),
  detail_locations: yaml("locations").locations.filter(
    (l) => l.map_id !== "world",
  ),
};
const space = createSpace(data);
const near = (a, b) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} differs from ${b}`);

test("country label centers match the visible territory centroid and remain on their own land", () => {
  for (const area of data.areas.filter((a) => a.layer === "country")) {
    const polygons = space.countryPolygons(area),
      vertices = polygons.flat(),
      center = space.areaCenter(area);
    const centroid = {
      x: vertices.reduce((sum, p) => sum + p.x, 0) / vertices.length,
      y: vertices.reduce((sum, p) => sum + p.y, 0) / vertices.length,
    };
    if (space.countryAt(centroid)?.id === area.id) {
      near(center.x, centroid.x);
      near(center.y, centroid.y);
    }
    assert.equal(space.countryAt(center)?.id, area.id);
  }
});

test("concave region centers stay on land and wrapped regions center across the seam", () => {
  const grid = { columns: 10, rows: 10, hex_size: 24 },
    ring = [
      { col: 3, row: 3 },
      { col: 3, row: 4 },
      { col: 5, row: 3 },
      { col: 5, row: 4 },
      { col: 4, row: 3 },
      { col: 4, row: 5 },
    ],
    center = cellRegionCenter(ring, grid);
  assert.ok(
    ring.some((cell) => {
      const p = hexCenter(cell.col, cell.row, grid);
      return Math.hypot(p.x - center.x, p.y - center.y) < 1e-7;
    }),
  );
  const seam = cellRegionCenter(
    [
      { col: 0, row: 3 },
      { col: 9, row: 3 },
    ],
    grid,
    true,
    0,
  );
  near(seam.x, 36);
});

test("an explicit manual label anchor is still honored when an author needs one", () => {
  const area = {
    ...data.areas.find((a) => a.id === "country.inibholc"),
    id: "manual.test",
    label_anchor: [58, 16],
  };
  assert.deepEqual(space.areaCenter(area), hexCenter(58, 16, space.root.grid));
});

test("the source image's white frame does not become a southern land strip", () => {
  // The supplied world source has open sea along its southern edge.
  const southern = expandRows(data.tile_masks.world.land_rows).filter(
    (cell) => cell.row === space.root.grid.rows - 1,
  );
  assert.equal(southern.length, 0);
});

test("pinch preserves the initial world anchor while the finger midpoint moves", () => {
  const camera = { x: 2232, y: 641, zoom: 0.8, tilt: 0.9 },
    initial = { x: 180, y: 210 },
    current = { x: 200, y: 225 };
  const world = unproject(camera, initial, 400, 600),
    next = pinchAt(camera, 1.3, initial, current, 400, 600),
    screen = project(next, world, 400, 600);
  near(screen.x, current.x);
  near(screen.y, current.y);
});

test("city center and its national marker are the exact same world coordinate", () => {
  for (const loc of data.detail_locations.filter((loc) => loc.detail_map_id)) {
    const city = space.normalized(loc.detail_map_id, [0.5, 0.5]),
      marker = space.normalized(loc.map_id, [loc.position.x, loc.position.y]);
    near(city.x, marker.x);
    near(city.y, marker.y);
  }
});
test("camera inverse and pointer-anchored zoom remain exact at both tilts", () => {
  for (const tilt of [1, 0.9])
    for (const zoom of [0.15, 0.8, 12]) {
      const camera = { x: 2232, y: 641, zoom, tilt },
        point = { x: 2240.23, y: 710.8 };
      const screen = project(camera, point, 800, 600),
        world = unproject(camera, screen, 800, 600);
      near(world.x, point.x);
      near(world.y, point.y);
      const next = zoomAt(camera, zoom * 1.3, screen, 800, 600),
        fixed = project(next, point, 800, 600);
      near(screen.x, fixed.x);
      near(screen.y, fixed.y);
    }
});
test("logical hex centers hit their own political owner and the world seam wraps", () => {
  for (const area of data.areas.filter((a) => a.layer === "country")) {
    const cells = expandRows(
      data.tile_masks.world.area_masks[area.id].tile_rows,
    );
    for (const cell of cells.filter((_, i) => i % 37 === 0)) {
      const p = hexCenter(cell.col, cell.row, space.root.grid);
      assert.equal(space.countryAt(p)?.id, area.id);
      assert.equal(
        space.countryAt({ ...p, x: p.x + space.period })?.id,
        area.id,
      );
    }
  }
});
test("national clipping equals the world country footprint; display hexes remain regular", () => {
  for (const area of data.areas.filter((a) => a.detail_map_id))
    assert.deepEqual(
      space.footprint(area.detail_map_id),
      space.countryPolygons(area),
    );
  const corners = hexagon({ x: 20, y: 30 }, 8);
  for (let i = 0; i < 6; i++)
    near(
      Math.hypot(
        corners[i].x - corners[(i + 1) % 6].x,
        corners[i].y - corners[(i + 1) % 6].y,
      ),
      8,
    );
});
