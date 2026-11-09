import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import { createSpace } from "../../assets/scripts/atlas/space.mjs";
import { hexagon } from "../../assets/scripts/atlas/space.mjs";
import { cityGeometry } from "../../assets/scripts/atlas/city.mjs";
import {
  createBlockBoard,
  BASE_HEIGHT,
  TERRACE_STEP,
} from "../../assets/scripts/atlas/blocks.mjs";
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
  detail_locations: yaml("locations").locations,
  feature_maps: yaml("features").maps,
};
const space = createSpace(data),
  board = createBlockBoard(data, space);
const near = (a, b) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} differs from ${b}`);

test("every land block has a full-radius planar top and only exposed height-difference side faces", () => {
  for (const cell of board.cells) {
    assert.ok(Number.isInteger(cell.level));
    const g = board.geometry(cell),
      height = BASE_HEIGHT + cell.level * TERRACE_STEP;
    assert.equal(g.top.length, 6);
    assert.ok(g.faces.length <= 3);
    for (let i = 0; i < 6; i++) {
      near(Math.hypot(g.top[i].x - cell.point.x, g.top[i].y + height - cell.point.y), cell.radius);
      near(g.top[i].x, g.bottom[i].x);
      near(g.bottom[i].y - g.top[i].y, height);
    }
    const polygon = hexagon(cell.point, cell.radius);
    for (const face of g.faces) {
      const i = face.index, j = (i + 1) % 6,
        neighbor = board.logicalCell({
          x: polygon[i].x + polygon[j].x - cell.point.x,
          y: polygon[i].y + polygon[j].y - cell.point.y,
        }),
        neighborHeight = board.cellHeight(neighbor);
      assert.ok(height > neighborHeight);
      near(face.points[2].y, polygon[j].y - neighborHeight);
      near(face.points[3].y, polygon[i].y - neighborHeight);
    }
  }
});

test("flat terrain removes all internal equal-height sides and retains coastline cliffs", () => {
  for (const cell of board.cells) {
    const polygon = hexagon(cell.point, cell.radius), g = board.geometry(cell, false);
    for (let i = 0; i < 3; i++) {
      const j = i + 1, neighbor = board.logicalCell({
        x: polygon[i].x + polygon[j].x - cell.point.x,
        y: polygon[i].y + polygon[j].y - cell.point.y,
      });
      assert.equal(g.faces.some(face => face.index === i), !neighbor);
    }
  }
});

test("equal-height sides disappear across the horizontal world seam without changing ownership or picking", () => {
  const grid = { columns: 4, rows: 3, hex_size: 24, orientation: "flat" },
    rows = [{ row: 1, ranges: [[0, 0], [3, 3]] }],
    sample = {
      maps: [{ id: "world", level: 0, mask_id: "world", grid, wrap_x: true }],
      areas: [{ id: "country.test", map_id: "world", layer: "country" }],
      tile_masks: { world: { land_rows: rows, area_masks: { "country.test": { tile_rows: rows } } } },
      feature_maps: {}, detail_locations: [],
    },
    sampleSpace = createSpace(sample), sampleBoard = createBlockBoard(sample, sampleSpace),
    left = sampleBoard.cellIndex.get("0:1");
  assert.equal(sampleBoard.geometry(left).faces.some(face => face.index === 2), false);
  for (const cell of sampleBoard.cells)
    for (const offset of [-sampleSpace.period, 0, sampleSpace.period]) {
      const raised = sampleBoard.raise(cell.point),
        hit = sampleBoard.pick({ x: raised.x + offset, y: raised.y });
      assert.equal(hit.cell.id, cell.id);
      assert.equal(hit.area.id, "country.test");
    }
});

test("flat mode retains the physical base and removes only elevation tiers", () => {
  const highest = board.cells.reduce((best, c) =>
      c.level > best.level ? c : best,
    ),
    flat = board.geometry(highest, false);
  for (let i = 0; i < 6; i++)
    near(flat.bottom[i].y - flat.top[i].y, BASE_HEIGHT);
  assert.ok(highest.level > 0);
});

test("an exposed front wall is selectable as the same land block", () => {
  const cell = board.cells.find(
    (c) =>
      !board.logicalCell({
        x: c.point.x,
        y: c.point.y + (c.radius * Math.sqrt(3)) / 2 + 1,
      }),
  );
  assert.ok(cell);
  const face = board.geometry(cell).faces.find((f) => f.index === 1).points,
    center = {
      x: face.reduce((sum, p) => sum + p.x, 0) / 4,
      y: face.reduce((sum, p) => sum + p.y, 0) / 4,
    };
  assert.equal(board.pick(center).cell.id, cell.id);
});

test("raised top centers and side faces hit the same logical territory, including world copies", () => {
  for (const cell of board.cells.filter((_, i) => i % 19 === 0)) {
    const top = board.raise(cell.point),
      hit = board.pick(top);
    assert.equal(hit.cell.id, cell.id);
    near(hit.point.x, cell.point.x);
    near(hit.point.y, cell.point.y);
    assert.equal(
      board.pick({ x: top.x + space.period, y: top.y }).cell.id,
      cell.id,
    );
  }
});

test("capital block is above the surrounding plain and river bed levels never climb downstream", () => {
  const set = data.feature_maps["nation.inibholc"],
    capital = space.normalized(
      "nation.inibholc",
      set.terrain.find((f) => f.kind === "hill").geometry.center,
    );
  const peak = board.heightAt(capital);
  for (const uv of [
    [0.36, 0.63],
    [0.66, 0.21],
    [0.2, 0.6],
  ])
    assert.ok(peak > board.heightAt(space.normalized("nation.inibholc", uv)));
  for (const river of board.rivers) {
    assert.ok(river.cells.length > 2);
    for (let i = 1; i < river.cells.length; i++)
      assert.ok(river.cells[i].level <= river.cells[i - 1].level);
    assert.ok(river.cells.at(-1).level < river.cells[0].level);
  }
});

test("the irregular city survey stays bound to the capital and slopes northwest to southeast", () => {
  for (const city of board.cities.values()) {
    const marker = space.normalized(city.location.map_id, [
      city.location.position.x,
      city.location.position.y,
    ]);
    near(city.center.x, marker.x);
    near(city.center.y, marker.y);
    const key = (p) => `${p.x.toFixed(7)}:${p.y.toFixed(7)}`,
      cells = new Map(city.cells.map((c) => [key(c.point), c]));
    let asymmetric = 0;
    for (const c of city.cells) {
      const opposite = cells.get(
        key({
          x: 2 * city.center.x - c.point.x,
          y: 2 * city.center.y - c.point.y,
        }),
      );
      if (!opposite) asymmetric++;
      assert.equal(c.outskirts, Math.hypot((c.point.x - city.center.x) / city.rx,
        (c.point.y - city.center.y) / city.ry) > 1.10);
    }
    assert.ok(asymmetric > city.cells.length * 0.08, "the survey boundary must not be a centered ellipse or hexagon");
    assert.ok(city.foundationRadius > city.contextRadius * 1.3);
    near(city.contextRadius, Math.max(city.rx, city.ry * 2 / Math.sqrt(3)) * 1.2);
    const northwest = city.cells.filter(c => c.point.x < city.center.x && c.point.y < city.center.y),
      southeast = city.cells.filter(c => c.point.x > city.center.x && c.point.y > city.center.y),
      average = list => list.reduce((sum, c) => sum + c.level, 0) / list.length;
    assert.ok(average(northwest) > average(southeast));
    const top = board.raise(city.center, city.id);
    assert.equal(board.pick(top, city.id).city, city.id);
    near(board.groundPoint(top, city.id).y, city.center.y);
  }
});

test("the outskirts form one continuous ground fragment with land beyond every city wall direction", () => {
  for (const city of board.cities.values()) {
    const remaining = new Set(city.cells.map(cell => cell.id)),
      queue = [city.cells[0]];
    remaining.delete(queue[0].id);
    for (let index = 0; index < queue.length; index++) {
      const cell = queue[index];
      for (const [dc, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
        const id = `${cell.col + dc}:${cell.row + dr}`;
        if (remaining.delete(id)) queue.push(city.cellIndex.get(id));
      }
    }
    assert.equal(remaining.size, 0, "the cropped fragment must not contain detached ground islands");
    for (let i = 0; i < 48; i++) {
      const angle = i * Math.PI / 24;
      assert.ok(board.containsCity(city.id, {
        x: city.center.x + Math.cos(angle) * city.rx * 1.35,
        y: city.center.y + Math.sin(angle) * city.ry * 1.35,
      }), "the wall should have an apron of real ground in every direction");
      assert.equal(board.containsCity(city.id, {
        x: city.center.x + Math.cos(angle) * city.rx * 2.15,
        y: city.center.y + Math.sin(angle) * city.ry * 2.15,
      }), false, "black context must not expand the known city footprint");
    }
    assert.ok(city.cells.filter(cell => cell.outskirts).length > city.cells.length * 0.4);
  }
});

test("city terrain has substantial inner terraces, outer hills, and a flat palace and moat platform", () => {
  for (const city of board.cities.values()) {
    const inner = city.cells.filter(cell => !cell.outskirts),
      outer = city.cells.filter(cell => cell.outskirts),
      heights = inner.map(cell => board.localHeight(city, cell));
    assert.ok(Math.max(...heights) - Math.min(...heights) > Math.min(city.rx, city.ry) * 0.25);
    assert.ok(Math.max(...outer.map(cell => cell.level)) > Math.max(...inner.map(cell => cell.level)),
      "outskirts should include distinct hill tiers beyond the directional city slope");
    const plan = cityGeometry(data.feature_maps[city.id].settlements[0]),
      moat = plan.waterways.find(line => line.closed),
      platform = board.heightAt(city.center, city.id);
    for (const point of moat.points)
      near(board.heightAt(space.normalized(city.id, point), city.id), platform);
    for (const cell of inner)
      near(board.localHeight(city, cell, false), board.foundationHeight(city, false) + 0.12);
  }
});

test("known city ground and visible boundary side faces are selectable without a fictitious hex tray", () => {
  for (const city of board.cities.values()) {
    const edge = city.cells.reduce((best, cell) => cell.point.y > best.point.y ? cell : best),
      g = board.geometry(edge, true, city.id),
      face = g.faces.find(face => face.index === 1) ?? g.faces[0],
      visual = {
        x: face.points.reduce((sum, point) => sum + point.x, 0) / face.points.length,
        y: face.points.reduce((sum, point) => sum + point.y, 0) / face.points.length,
      };
    assert.ok(edge.outskirts);
    assert.equal(board.pick(visual, city.id).cell.id, edge.id);
    for (const offset of [-space.period, space.period]) {
      const hit = board.pick({ x: visual.x + offset, y: visual.y }, city.id);
      assert.equal(hit.cell.id, edge.id);
      assert.equal(hit.city, city.id);
      near(hit.point.x, edge.point.x + offset);
    }
    const black = { x: city.center.x + city.foundationRadius * 0.98, y: city.center.y };
    assert.equal(board.containsCity(city.id, black), false);
    near(board.heightAt(black, city.id), board.foundationHeight(city));
    assert.notEqual(board.pick(board.raise(black, city.id), city.id)?.city, city.id);
  }
});

test("city fit bounds include every visible ground top and cut sidewall", () => {
  for (const city of board.cities.values())
    for (const enabled of [true, false]) {
      const bounds = board.bounds(city.id, enabled);
      for (const cell of city.cells) {
        const g = board.geometry(cell, enabled, city.id);
        for (const point of [...g.top, ...g.faces.flatMap(face => face.points)]) {
          assert.ok(point.x >= bounds.minX - 1e-8 && point.x <= bounds.maxX + 1e-8);
          assert.ok(point.y >= bounds.minY - 1e-8 && point.y <= bounds.maxY + 1e-8);
        }
      }
    }
});

test("black city context inverse projection uses its base plane without making it selectable", () => {
  for (const city of board.cities.values()) {
    let checked = 0;
    for (let i = 0; i < 48; i++) {
      const angle = i * Math.PI / 24;
      let radius = 1;
      const pointAt = distance => ({
        x: city.center.x + Math.cos(angle) * city.rx * distance,
        y: city.center.y + Math.sin(angle) * city.ry * distance,
      });
      while (radius < 2.2 && board.containsCity(city.id, pointAt(radius))) radius += 0.02;
      const logical = pointAt(radius + 0.03), visual = board.raise(logical, city.id);
      if (board.pick(visual, city.id)?.city === city.id) continue; // A real cut wall can obscure the background.
      const recovered = board.groundPoint(visual, city.id);
      near(recovered.x, logical.x);
      near(recovered.y, logical.y);
      assert.equal(board.containsCity(city.id, recovered), false);
      checked++;
    }
    assert.ok(checked > 20);
  }
});

test("city rivers retain descending terrain across the known outskirts and through the outer wall", () => {
  const id = "city.cathair", plan = cityGeometry(data.feature_maps[id].settlements[0]);
  for (const waterway of plan.waterways.filter(w => !w.closed)) {
    const raw = waterway.points.map(point => space.normalized(id, point)),
      samples = [];
    for (let i = 1; i < raw.length; i++) {
      const a = raw[i - 1], b = raw[i];
      for (let step = 0; step <= 80; step++) {
        const point = { x: a.x + (b.x - a.x) * step / 80, y: a.y + (b.y - a.y) * step / 80 };
        if (board.containsCity(id, point)) samples.push(point);
      }
    }
    const heights = samples.map(point => board.heightAt(point, id));
    assert.ok(heights.length > 20);
    for (let i = 1; i < heights.length; i++)
      assert.ok(heights[i] <= heights[i - 1], `${waterway.id} climbs at point ${i}`);
  }
});
