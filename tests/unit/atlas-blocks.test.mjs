import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import { createSpace } from "../../assets/scripts/atlas/space.mjs";
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

test("every land block has a planar six-corner top, three side faces and discrete thickness", () => {
  for (const cell of board.cells) {
    assert.ok(Number.isInteger(cell.level));
    const g = board.geometry(cell),
      height = BASE_HEIGHT + cell.level * TERRACE_STEP;
    assert.equal(g.top.length, 6);
    assert.equal(g.faces.length, 3);
    for (let i = 0; i < 6; i++) {
      near(g.top[i].x, g.bottom[i].x);
      near(g.bottom[i].y - g.top[i].y, height);
    }
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

test("the city hex platform preserves central symmetry and its center stays bound to the capital", () => {
  for (const city of board.cities.values()) {
    const marker = space.normalized(city.location.map_id, [
      city.location.position.x,
      city.location.position.y,
    ]);
    near(city.center.x, marker.x);
    near(city.center.y, marker.y);
    const key = (p) => `${p.x.toFixed(7)}:${p.y.toFixed(7)}`,
      cells = new Map(city.cells.map((c) => [key(c.point), c]));
    for (const c of city.cells) {
      const opposite = cells.get(
        key({
          x: 2 * city.center.x - c.point.x,
          y: 2 * city.center.y - c.point.y,
        }),
      );
      assert.ok(opposite);
      assert.equal(opposite.level, c.level);
    }
    const top = board.raise(city.center, city.id);
    assert.equal(board.pick(top, city.id).city, city.id);
    near(board.groundPoint(top, city.id).y, city.center.y);
  }
});
