import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { cityGeometry } from "../../assets/scripts/atlas/city.mjs";
import { terraceLevelAt } from "../../assets/scripts/atlas/terrain.mjs";

const features = parse(readFileSync(new URL("../../data/maps/features.yaml", import.meta.url), "utf8")).maps["city.cathair"];
const feature = features.settlements[0], plan = cityGeometry(feature);
const [cx, cy] = feature.geometry.center, [rx, ry] = feature.geometry.radius;
const local = ([x, y]) => [(x - cx) / rx, (y - cy) / ry];
const center = object => object.points.reduce((sum, p) => [sum[0] + p[0] / object.points.length, sum[1] + p[1] / object.points.length], [0, 0]);
const radius = object => Math.hypot(...local(center(object)));
function contains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x, y] = polygon[i], [px, py] = polygon[j];
    if (y > point[1] !== py > point[1] && point[0] < (px - x) * (point[1] - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}

test("white-model architecture is deterministic, finite, and remains inside the city map", () => {
  assert.deepEqual(cityGeometry(feature), plan);
  assert.ok(plan.buildings.length > 400);
  const changed = structuredClone(feature);
  changed.layout.seed++;
  assert.notDeepEqual(cityGeometry(changed).buildings, plan.buildings);
  for (const object of [...plan.buildings, ...plan.bridges]) {
    assert.ok(object.height > 0 && Number.isFinite(object.height));
    for (const point of object.points) assert.ok(point.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  }
  assert.equal(new Set(plan.buildings.map(object => object.id)).size, plan.buildings.length);
});

test("the palace has an open court, multiple wings, a round keep and a separate chapel within its moat", () => {
  const palace = plan.buildings.filter(object => object.district === "palace");
  assert.ok(palace.filter(object => object.kind === "palace").length >= 4);
  assert.ok(palace.some(object => object.kind === "palace-tower" && object.points.length >= 12));
  assert.ok(palace.some(object => object.kind === "chapel"));
  assert.ok(!palace.some(object => contains([cx, cy], object.points)), "the court is open, not a solid palace block");
  const moat = plan.waterways.find(line => line.id === "palace.moat");
  assert.ok(moat.closed);
  for (const object of palace)
    for (const point of object.points) assert.ok(contains(point, moat.points), `${object.id} must stand on the palace island`);
});

test("both accepted ring-count extremes produce usable architecture without missing band coordinates", () => {
  for (const rings of [[0.28, 1], [0.24, 0.38, 0.52, 0.66, 0.80, 1]]) {
    const varied = structuredClone(feature);
    varied.layout.rings = rings;
    const city = cityGeometry(varied);
    assert.ok(city.buildings.some(building => building.kind === "house"));
    for (const object of [...city.buildings, ...city.bridges, ...city.roads])
      for (const point of object.points) assert.ok(point.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
    for (const line of city.waterways)
      for (const point of line.points) assert.ok(point.every(Number.isFinite));
  }
});

test("the river enters from the northwest, joins the moat and leaves to the southeast with road bridges", () => {
  const inlet = plan.waterways.find(line => line.id === "river.inlet"), outlet = plan.waterways.find(line => line.id === "river.outlet");
  const first = local(inlet.points[0]), last = local(outlet.points.at(-1));
  assert.ok(first[0] < -1.5 && first[1] < -1.4);
  assert.ok(last[0] > 1.5 && last[1] > 1.4);
  // Both open rivers continue well beyond the wall into the landscape cutout.
  assert.ok(inlet.points.filter(p => Math.hypot(...local(p)) > 1.1).length >= 4);
  assert.ok(outlet.points.filter(p => Math.hypot(...local(p)) > 1.1).length >= 4);
  const moatRadius = feature.layout.moat_radius ?? 0.215;
  assert.ok(Math.abs(Math.hypot(...local(inlet.points.at(-1))) - moatRadius) < 1e-8);
  assert.ok(Math.abs(Math.hypot(...local(outlet.points[0])) - moatRadius) < 1e-8);
  assert.ok(plan.bridges.length >= 8);
  for (const bridge of plan.bridges) {
    const p = local(bridge.center);
    assert.ok(Math.hypot(...p) <= 1.1);
  }
});

test("factories occupy the west, housing predominates in the east, and the inner city is denser", () => {
  const ordinary = plan.buildings.filter(object => ["house", "factory"].includes(object.kind));
  const factories = ordinary.filter(object => object.kind === "factory"), homes = ordinary.filter(object => object.kind === "house");
  assert.ok(factories.length >= 15);
  assert.ok(factories.every(object => center(object)[0] < cx));
  assert.ok(plan.buildings.filter(object => object.kind === "chimney").length >= 5);
  assert.ok(homes.filter(object => center(object)[0] > cx).length > homes.length / 2);
  const inner = ordinary.filter(object => radius(object) < 0.52).length / (0.52 ** 2 - 0.28 ** 2);
  const outer = ordinary.filter(object => radius(object) > 0.76).length / (1 - 0.76 ** 2);
  assert.ok(inner > outer * 2, `${inner} should be much denser than ${outer}`);
});

test("plain outer walls and taller guard towers enclose the city with usable gates", () => {
  const walls = plan.buildings.filter(object => object.kind === "wall"), towers = plan.buildings.filter(object => object.kind === "watchtower");
  assert.ok(walls.length > 90 && towers.length >= 8);
  assert.ok(walls.every(object => radius(object) > 1 && object.roof === "flat"));
  assert.ok(towers.every(object => object.height > walls[0].height));
  for (const point of [[1.035, 0], [-1.035, 0], [0, 1.035], [0, -1.035]]) {
    const mapped = [cx + point[0] * rx, cy + point[1] * ry];
    assert.ok(!walls.some(object => contains(mapped, object.points)), "cardinal avenues need open wall gates");
  }
});

test("city terraces descend from northwest towards southeast while flat mode can use their base", () => {
  const [terrain] = features.terrain;
  assert.deepEqual(terrain.elevation.slope.direction, [-1, -1]);
  const heights = [0.2, 0.35, 0.5, 0.65, 0.8].map(value => terraceLevelAt(value, value, features.terrain));
  assert.ok(heights[0] > heights.at(-1));
  for (let i = 1; i < heights.length; i++) assert.ok(heights[i] <= heights[i - 1]);
});
