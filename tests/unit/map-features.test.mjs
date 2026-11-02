import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import {
  terraceLevelAt,
  cityGeometry,
  pointOnMap,
} from "../../assets/scripts/atlas/terrain.mjs";
import { validateMapFeatures } from "../../scripts/lib/map-features.mjs";

const sets = parse(
  fs.readFileSync(
    new URL("../../data/maps/features.yaml", import.meta.url),
    "utf8",
  ),
).maps;
const maps = new Set(Object.keys(sets));
const entities = new Set(["reg.ini.mg", "reg.ini.col"]);

test("thematic records have usable references and explicit schematic geometry", () => {
  assert.deepEqual(validateMapFeatures(sets, maps, entities), []);
  const bad = structuredClone(sets);
  bad["nation.inibholc"].waterways[0].geometry.points[0] = [1.1, 0.2];
  bad["city.cathair"].settlements[0].layout.spokes = 7;
  bad["nation.inibholc"].terrain[1].entity_id = "missing";
  const errors = validateMapFeatures(bad, maps, entities);
  assert.ok(errors.some((error) => error.includes("normalized path")));
  assert.ok(errors.some((error) => error.includes("symmetric city")));
  assert.ok(errors.some((error) => error.includes("unknown entity")));
});

test("city blocks and palace preserve central symmetry and regenerate identically", () => {
  const feature = sets["city.cathair"].settlements[0];
  const plan = cityGeometry(feature);
  assert.deepEqual(cityGeometry(feature), plan);
  const [cx, cy] = plan.center;
  const key = (point) => point.map((n) => n.toFixed(9)).join(",");
  const vertices = new Set(
    plan.blocks.flatMap((block) => block.points).map(key),
  );
  for (const block of plan.blocks)
    for (const [x, y] of block.points)
      assert.ok(vertices.has(key([2 * cx - x, 2 * cy - y])));
  const palace = new Set(plan.palace.map(key));
  for (const [x, y] of plan.palace)
    assert.ok(palace.has(key([2 * cx - x, 2 * cy - y])));
});

test("terrain uses discrete levels and rejects the removed continuous relief parameters", () => {
  const set = sets["nation.inibholc"];
  const capital = set.terrain.find((f) => f.kind === "hill").geometry.center;
  assert.equal(terraceLevelAt(...capital, set.terrain), 4);
  assert.equal(terraceLevelAt(0.66, 0.21, set.terrain), 0);
  const bad = structuredClone(sets);
  bad["nation.inibholc"].terrain[0].elevation.level = 1.5;
  bad["nation.inibholc"].terrain[0].relief = { height: 0.3, roughness: 0.01 };
  const errors = validateMapFeatures(bad, maps, entities);
  assert.ok(errors.some((e) => e.includes("discrete terrace")));
  assert.ok(errors.some((e) => e.includes("continuous relief")));
});

test("continuous feature coordinates stay independent from hex resolution", () => {
  const grid = { columns: 48, rows: 28, hex_size: 24 };
  const a = pointOnMap([0.501, 0.5], grid),
    b = pointOnMap([0.502, 0.5], grid);
  assert.ok(b.x > a.x);
  assert.ok(b.x - a.x < 24);
  assert.equal(a.y, b.y);
});
