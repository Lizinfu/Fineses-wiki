import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { createSpace, hexagon, project, unproject } from "../../assets/scripts/atlas/space.mjs";
import { createBlockBoard, prismGeometry } from "../../assets/scripts/atlas/blocks.mjs";
import { cityGeometry } from "../../assets/scripts/atlas/terrain.mjs";

const root = page => page.locator("[data-atlas]");
const canvas = page => page.locator(".atlas-pixi-canvas");
const camera = async page => JSON.parse(await root(page).getAttribute("data-atlas-camera"));

async function ready(page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/portals/atlas/?loc=loc.cathair");
  await expect(root(page)).toHaveAttribute("data-atlas-renderer", "webgl");
  await expect(root(page)).toHaveAttribute("data-atlas-city", "city.cathair");
  await expect(root(page)).toHaveAttribute("data-atlas-draws", /\d+/);
  await canvas(page).evaluate(node => node.dataset.cityProbe = "persistent");
  await page.locator("[data-feature-card-close]").click();
  await expect(page.locator("[data-atlas-feature-card]")).toBeHidden();
}

async function toggle(page, name, enabled) {
  const controls = page.locator(".atlas-feature-controls");
  if (!(await controls.evaluate(node => node.open))) await controls.locator("summary").click();
  await page.locator(`[data-feature-toggle="${name}"]`).setChecked(enabled);
}

async function snapshot(page, options = {}) {
  // Use the same viewport position every time; the mobile site's sticky header
  // would otherwise cover the first capture after focusing a lower sidebar control.
  await canvas(page).evaluate(node => node.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  return sharp(await canvas(page).screenshot(options)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
}

// Hide HTML overlays only during capture so these checks measure the actual GPU
// ground, including pixels normally covered by the toolbar and corner legends.
const groundCapture = { style: ".atlas-stage__toolbar, .atlas-cartouche, .atlas-compass, .atlas-legend, .atlas-view-indicator, .atlas-screen-labels { visibility: hidden !important; }" };

function contextPixels(shot) {
  const { width, height } = shot.info;
  let pale = 0, traces = 0;
  const edges = Array.from({ length: 4 }, () => ({ ground: 0, total: 0 }));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 3;
    const [r, g, b] = shot.data.subarray(i, i + 3);
    const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 10;
    const missingGround = neutral && Math.min(r, g, b) >= 222 && Math.max(r, g, b) <= 242;
    if (missingGround) pale++;
    const inEdge = [x < width * 0.04, x >= width * 0.96, y < height * 0.04, y >= height * 0.96];
    // The perimeter lies outside the surveyed city: inspect its neutral gray
    // traces here so white roofs and the city's own ground cannot count as traces.
    const trace = neutral && Math.min(r, g, b) >= 160 && Math.max(r, g, b) < 232;
    if (trace && !missingGround && inEdge.some(Boolean)) traces++;
    inEdge.forEach((inside, edge) => {
      if (inside) {
        edges[edge].total++;
        if (missingGround || trace) edges[edge].ground++;
      }
    });
  }
  return { pale: pale / (width * height), traces, edges: edges.map(edge => edge.ground / edge.total) };
}

function expectCityContext(shot) {
  const pixels = contextPixels(shot);
  expect(pixels.pale).toBeGreaterThan(0.35);
  for (const edge of pixels.edges) expect(edge).toBeGreaterThan(0.9);
  expect(pixels.traces).toBeGreaterThan(30);
  expect(pixels.traces / (shot.info.width * shot.info.height)).toBeLessThan(0.15);
  return pixels;
}

async function zoomTo(page, zoom) {
  await canvas(page).scrollIntoViewIfNeeded();
  const box = await canvas(page).boundingBox(), before = await camera(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, Math.log(before.zoom / zoom) / 0.0015);
  await expect.poll(async () => Math.abs((await camera(page)).zoom - zoom)).toBeLessThan(0.001);
}

async function cityModel(page) {
  const data = await page.locator("#atlas-map-data").evaluate(node => {
    const value = JSON.parse(node.textContent);
    return typeof value === "string" ? JSON.parse(value) : value;
  });
  const space = createSpace(data), board = createBlockBoard(data, space);
  return { data, space, board, city: board.cities.get("city.cathair") };
}

async function missingSurveyPoint(page) {
  const { board, city } = await cityModel(page),
    box = await canvas(page).boundingBox(), view = await camera(page);
  // A fixed percentage can move onto the real city when the sidebar or canvas
  // width changes. Choose a currently unoccupied point outside all city faces.
  for (const y of [0.5, 0.3, 0.7, 0.15, 0.85])
    for (const x of [0.02, 0.98, 0.08, 0.92]) {
      const local = { x: box.width * x, y: box.height * y };
      if (board.pick(unproject(view, local, box.width, box.height), city.id)?.city === city.id) continue;
      const point = { x: box.x + local.x, y: box.y + local.y };
      const unobstructed = await page.evaluate(({ x, y }) =>
        Boolean(document.elementFromPoint(x, y)?.closest("[data-atlas-canvas]")) &&
        !document.elementFromPoint(x, y)?.closest("button, a"), point);
      if (unobstructed) return point;
    }
  throw new Error("No exposed missing-survey point was found outside the known city");
}

function pixelAt(shot, point, box) {
  const x = Math.round(point.x * shot.info.width / box.width), y = Math.round(point.y * shot.info.height / box.height);
  const i = (y * shot.info.width + x) * 3;
  return [...shot.data.subarray(i, i + 3)];
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

function distanceToPolygon(point, polygon) {
  return Math.min(...polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
  }));
}

function outskirtsPixels(shot, view, box, { space, board, city }) {
  const indices = new Set(), sx = shot.info.width / box.width, sy = shot.info.height / box.height;
  for (const cell of city.cells.filter(cell => cell.outskirts)) {
    const top = board.geometry(cell, true, city.id).top;
    const point = { x: cell.point.x, y: top.reduce((sum, p) => sum + p.y, 0) / top.length };
    point.x += Math.round((view.x - point.x) / space.period) * space.period;
    const p = project(view, point, box.width, box.height);
    const px = Math.round(p.x * sx), py = Math.round(p.y * sy);
    const radius = Math.max(1, Math.floor(cell.radius * view.zoom * sx * 0.5));
    for (let y = py - radius; y <= py + radius; y++) for (let x = px - radius; x <= px + radius; x++)
      if (x > 1 && x < shot.info.width - 2 && y > 1 && y < shot.info.height - 2)
        indices.add((y * shot.info.width + x) * 3);
  }
  return [...indices];
}

function compareOutskirts(before, after, indices) {
  expect(before.info).toEqual(after.info);
  let changed = 0, blueRemoved = 0, blackAdded = 0;
  for (const i of indices) {
    const [r, g, b] = before.data.subarray(i, i + 3);
    const [ar, ag, ab] = after.data.subarray(i, i + 3);
    if (Math.abs(r - ar) + Math.abs(g - ag) + Math.abs(b - ab) > 30) {
      changed++;
      if (b - r > 15 && g - r > 10 && b - r > ab - ar + 12) blueRemoved++;
      if (Math.max(r, g, b) < 45 && Math.min(ar, ag, ab) > 65) blackAdded++;
    }
  }
  return { changed, blueRemoved, blackAdded };
}

function compare(before, after, predicate = () => true, minimumDelta = 30) {
  expect(before.info).toMatchObject({ width: after.info.width, height: after.info.height, channels: 3 });
  let changed = 0, matching = 0, difference = 0;
  for (let i = 0; i < before.data.length; i += 3) {
    const pixel = [...before.data.subarray(i, i + 3)];
    const delta = pixel.reduce((sum, value, channel) => sum + Math.abs(value - after.data[i + channel]), 0);
    difference += delta;
    if (delta > minimumDelta) {
      changed++;
      if (predicate(pixel)) matching++;
    }
  }
  return { changed, matching, mean: difference / before.data.length };
}

async function expectCleanCountryNavigation(page, exited) {
  const exitedView = await camera(page);
  expect(new URL(page.url()).searchParams.get("entity")).toBe("nat.ini");
  // Country fitting reveals real pale land that shares the missing-survey
  // palette. Compare against the same country loaded without any city history
  // instead of treating those legitimate land pixels as a leftover overlay.
  // The caller checks canvas persistence before this deliberate reload.
  await page.reload();
  await expect(root(page)).toHaveAttribute("data-atlas-renderer", "webgl");
  await expect(root(page)).toHaveAttribute("data-atlas-city", "");
  await expect(root(page)).toHaveAttribute("data-atlas-level", "1");
  const clean = await snapshot(page, groundCapture), cleanView = await camera(page);
  for (const key of ["x", "y", "zoom", "tilt"])
    expect(cleanView[key], `country reference camera ${key}`).toBeCloseTo(exitedView[key], 7);
  const delta = compare(exited, clean, () => true, 6);
  expect(delta.changed, "exiting the city must leave no localized overlay pixels").toBeLessThan(8);
  expect(delta.mean, "exiting the city must restore the clean country render").toBeLessThan(0.01);
}

test("Cathair renders pale white-model buildings and preserves the city canvas when the massing layer is toggled", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const label = page.locator('[data-atlas-label="settlement.cathair.plan"]');
  await expect(label).toBeVisible();
  const withBuildings = await snapshot(page);
  await toggle(page, "settlements", false);
  await expect(label).toBeHidden();
  const withoutBuildings = await snapshot(page);
  const delta = compare(withBuildings, withoutBuildings, rgb => Math.min(...rgb) > 175 && Math.max(...rgb) - Math.min(...rgb) < 35);
  // Verify actual pale roof/wall pixels disappear, rather than only observing a checkbox state.
  expect(delta.matching).toBeGreaterThan(30);
  expect(delta.mean).toBeGreaterThan(0.2);
  await toggle(page, "settlements", true);
  await expect(label).toBeVisible();
  const restored = await snapshot(page);
  expect(compare(withBuildings, restored).mean).toBeLessThan(0.1);
  await expect(canvas(page)).toHaveCount(1);
  await expect(canvas(page)).toHaveAttribute("data-city-probe", "persistent");
  await expect(page).toHaveURL(/loc=loc\.cathair/);
  expect(errors).toEqual([]);
});

test("equal-height city ground has no internal cracks with the auxiliary grid off by default", async ({ page }) => {
  await ready(page);
  await expect(page.locator('[data-feature-toggle="grid"]')).not.toBeChecked();
  for (const layer of ["settlements", "waterways", "routes"]) await toggle(page, layer, false);
  await zoomTo(page, 20);
  const { city, board } = await cityModel(page), shot = await snapshot(page, groundCapture);
  const box = await canvas(page).boundingBox(), view = await camera(page);
  const key = p => `${p.x.toFixed(7)}:${p.y.toFixed(7)}`;
  const index = new Map(city.cells.map(cell => [key(cell.point), cell]));
  const onScreen = p => p.x > 12 && p.x < box.width - 12 && p.y > 12 && p.y < box.height - 12;
  let checked = 0;
  for (const cell of city.cells.filter(cell => Math.hypot((cell.point.x - city.center.x) / city.rx, (cell.point.y - city.center.y) / city.ry) < 0.24)) {
    const polygon = hexagon(cell.point, cell.radius), center = project(view, board.raise(cell.point, city.id), box.width, box.height);
    if (!onScreen(center)) continue;
    for (let edge = 0; edge < 3; edge++) {
      const a = polygon[edge], b = polygon[(edge + 1) % 6];
      const neighbour = index.get(key({ x: a.x + b.x - cell.point.x, y: a.y + b.y - cell.point.y }));
      if (!neighbour || neighbour.level !== cell.level || neighbour.outskirts !== cell.outskirts) continue;
      const other = project(view, board.raise(neighbour.point, city.id), box.width, box.height);
      if (!onScreen(other)) continue;
      const centers = [pixelAt(shot, center, box), pixelAt(shot, other, box)];
      expect(Math.min(...centers.flat())).toBeGreaterThan(100);
      const normal = { x: other.x - center.x, y: other.y - center.y }, length = Math.hypot(normal.x, normal.y);
      for (const t of [0.3, 0.5, 0.7]) {
        const point = project(view, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - board.localHeight(city, cell) }, box.width, box.height);
        for (const offset of [-1, 0, 1]) {
          const rgb = pixelAt(shot, { x: point.x + normal.x / length * offset, y: point.y + normal.y / length * offset }, box);
          for (let channel = 0; channel < 3; channel++) {
            expect(rgb[channel]).toBeGreaterThanOrEqual(Math.min(...centers.map(c => c[channel])) - 8);
            expect(rgb[channel]).toBeLessThanOrEqual(Math.max(...centers.map(c => c[channel])) + 8);
          }
        }
      }
      checked++;
      if (checked === 12) break;
    }
    if (checked === 12) break;
  }
  expect(checked).toBeGreaterThanOrEqual(6);
});

test("neutral contact shadows darken real ground just outside building feet without changing the base material", async ({ page }) => {
  await ready(page);
  for (const layer of ["waterways", "routes", "terrain"]) await toggle(page, layer, false);
  await zoomTo(page, 12);
  const { data, space, board, city } = await cityModel(page);
  board.setTerrain(false);
  const withBuildings = await snapshot(page, groundCapture), box = await canvas(page).boundingBox(), view = await camera(page);
  const scale = Math.min(city.rx, city.ry), plan = cityGeometry(data.feature_maps[city.id].settlements[0]);
  const objects = plan.buildings.filter(object => !object.base_height).map(object => {
    const footprint = object.points.map(point => space.normalized(city.id, point));
    const center = { x: footprint.reduce((sum, p) => sum + p.x, 0) / footprint.length, y: footprint.reduce((sum, p) => sum + p.y, 0) / footprint.length };
    const base = board.heightAt(center, city.id, false);
    const geometry = prismGeometry(footprint, base + (object.height + (object.roofHeight ?? 0)) * scale, base);
    return { footprint, center, silhouette: [geometry.top, ...geometry.faces.map(face => face.points)].map(polygon => polygon.map(p => project(view, p, box.width, box.height))) };
  });
  const silhouettes = objects.flatMap(object => object.silhouette), samples = new Map();
  for (const object of objects) for (let edge = 0; edge < object.footprint.length; edge++) {
    const a = object.footprint[edge], b = object.footprint[(edge + 1) % object.footprint.length];
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = middle.x - object.center.x, dy = middle.y - object.center.y, length = Math.hypot(dx, dy);
    // Sample the west side: the southeast cast shadow cannot by itself satisfy
    // this contact test. Exclude all building silhouettes and their AA fringe.
    if (dx / length > -0.5) continue;
    for (const offset of [0.007, 0.012, 0.017]) {
      const p = project(view, board.raise({ x: middle.x + dx / length * scale * offset, y: middle.y + dy / length * scale * offset }, city.id, false), box.width, box.height);
      if (p.x < 8 || p.x > box.width - 8 || p.y < 8 || p.y > box.height - 8) continue;
      if (silhouettes.some(polygon => insidePolygon(p, polygon) || distanceToPolygon(p, polygon) < 1.2)) continue;
      samples.set(`${Math.round(p.x)}:${Math.round(p.y)}`, p);
    }
  }
  expect(samples.size).toBeGreaterThan(8);
  await toggle(page, "settlements", false);
  const bareGround = await snapshot(page, groundCapture);
  const contacts = [...samples.values()].filter(p => {
    const lit = pixelAt(bareGround, p, box), shaded = pixelAt(withBuildings, p, box);
    return lit.every((value, channel) => value - shaded[channel] > 3);
  });
  expect(contacts.length).toBeGreaterThan(5);
  await toggle(page, "settlements", true);
  expect(compare(withBuildings, await snapshot(page, groundCapture)).mean).toBeLessThan(0.1);
});

test("the city river and moat render independently of the white massing and survive projection changes", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const wet = await snapshot(page);
  await toggle(page, "waterways", false);
  const dry = await snapshot(page);
  const water = compare(wet, dry, ([r, g, b]) => b - r > 15 && g - r > 10);
  expect(water.matching).toBeGreaterThan(25);
  await toggle(page, "waterways", true);
  const restored = await snapshot(page);
  expect(compare(wet, restored).mean).toBeLessThan(0.1);

  await page.locator("[data-atlas-tilt]").click();
  await expect.poll(async () => (await camera(page)).tilt).toBe(1);
  const flatView = await snapshot(page);
  expect(compare(restored, flatView).mean).toBeGreaterThan(0.5);
  await toggle(page, "terrain", false);
  const flatGround = await snapshot(page);
  expect(compare(flatView, flatGround).mean).toBeGreaterThan(0.2);
  await expect(root(page)).toHaveAttribute("data-atlas-city", "city.cathair");
  await expect(canvas(page)).toHaveCount(1);
  await expect(canvas(page)).toHaveAttribute("data-city-probe", "persistent");
  await expect(page).toHaveURL(/loc=loc\.cathair/);
  expect(errors).toEqual([]);
});

test("irregular land outside the walls contains visible hills and an unoutlined river beyond the city", async ({ page }) => {
  await ready(page);
  const model = await cityModel(page);
  const wet = await snapshot(page, groundCapture), view = await camera(page);
  const indices = outskirtsPixels(wet, view, await canvas(page).boundingBox(), model);
  expect(indices.length).toBeGreaterThan(150);
  const earth = indices.filter(i => {
    const rgb = [...wet.data.subarray(i, i + 3)];
    return Math.min(...rgb) > 65 && Math.max(...rgb) - Math.min(...rgb) < 65;
  });
  // These sample positions come from outside the wall, not from the urban core;
  // registering cells without drawing their ground cannot satisfy this check.
  expect(earth.length / indices.length).toBeGreaterThan(0.65);

  await toggle(page, "waterways", false);
  const dry = await snapshot(page, groundCapture);
  const water = compareOutskirts(wet, dry, indices);
  expect(water.blueRemoved).toBeGreaterThan(15);
  expect(water.blackAdded).toBeLessThan(Math.max(4, water.blueRemoved * 0.08));
  await toggle(page, "waterways", true);
  expect(compare(wet, await snapshot(page, groundCapture)).mean).toBeLessThan(0.1);

  await toggle(page, "terrain", false);
  const flat = await snapshot(page, groundCapture);
  expect(compareOutskirts(wet, flat, indices).changed / indices.length).toBeGreaterThan(0.04);
  await toggle(page, "terrain", true);
  expect(compare(wet, await snapshot(page, groundCapture)).mean).toBeLessThan(0.1);
  await expect(root(page)).toHaveAttribute("data-atlas-city", "city.cathair");
  await expect(canvas(page)).toHaveAttribute("data-city-probe", "persistent");
});

test("the city has a pale missing-data ground with subtle gray traces across grid, projection and viewport changes", async ({ page }) => {
  await ready(page);
  await expect(page.locator('[data-feature-toggle="grid"]')).not.toBeChecked();
  const withoutGrid = await snapshot(page, groundCapture);
  expectCityContext(withoutGrid);

  const blank = await missingSurveyPoint(page), beforeClick = await camera(page);
  await page.mouse.click(blank.x, blank.y);
  await expect(page.locator("[data-atlas-feature-card]")).toBeHidden();
  await expect(root(page)).toHaveAttribute("data-atlas-city", "city.cathair");
  expect(await camera(page)).toEqual(beforeClick);
  expect(compare(withoutGrid, await snapshot(page, groundCapture)).mean).toBeLessThan(0.1);

  await toggle(page, "grid", true);
  const withGrid = await snapshot(page, groundCapture);
  expectCityContext(withGrid);
  expect(compare(withGrid, withoutGrid).mean).toBeGreaterThan(0.01);
  await toggle(page, "grid", false);
  const restoredGround = await snapshot(page, groundCapture);
  expectCityContext(restoredGround);
  expect(compare(withoutGrid, restoredGround).mean).toBeLessThan(0.1);

  // A moderate city zoom leaves visible context on both narrow and wide screens.
  await zoomTo(page, 2.6);
  await page.locator("[data-atlas-tilt]").click();
  await expect.poll(async () => (await camera(page)).tilt).toBe(1);
  expectCityContext(await snapshot(page, groundCapture));
  for (const viewport of [{ width: 1600, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(root(page)).toHaveAttribute("data-atlas-city", "city.cathair");
    expectCityContext(await snapshot(page, groundCapture));
  }
  await expect(canvas(page)).toHaveCount(1);
  await expect(canvas(page)).toHaveAttribute("data-city-probe", "persistent");
});

test("gray data flows move only while city motion is enabled and stop with reduced motion or city exit", async ({ page }) => {
  await ready(page);
  await zoomTo(page, 2.6);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const moving = await snapshot(page, groundCapture);
  const gray = rgb => Math.min(...rgb) >= 160 && Math.max(...rgb) < 232 && Math.max(...rgb) - Math.min(...rgb) < 10;
  await expect.poll(async () => compare(moving, await snapshot(page, groundCapture), gray).matching, {
    message: "moving gray GPU pixels should advance without a camera interaction",
    timeout: 8000,
  }).toBeGreaterThan(15);

  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await snapshot(page, groundCapture);
  expectCityContext(still);
  let stableCaptures = 0;
  await expect.poll(async () => {
    const next = await snapshot(page, groundCapture);
    stableCaptures = compare(still, next).mean < 0.001 ? stableCaptures + 1 : 0;
    return stableCaptures;
  }, { message: "reduced motion should keep the real rendered traces still", intervals: [100], timeout: 8000 }).toBeGreaterThanOrEqual(3);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await zoomTo(page, 2);
  await expect(root(page)).toHaveAttribute("data-atlas-level", "1");
  const exited = await snapshot(page, groundCapture);
  const exitedPixels = contextPixels(exited);
  expect(exitedPixels.pale).toBeLessThan(0.05);
  stableCaptures = 0;
  await expect.poll(async () => {
    const next = await snapshot(page, groundCapture);
    stableCaptures = compare(exited, next).mean < 0.001 ? stableCaptures + 1 : 0;
    return stableCaptures;
  }, { message: "leaving the city should remove the moving GPU overlay", intervals: [100], timeout: 8000 }).toBeGreaterThanOrEqual(3);
});

for (const exit of ["zoom", "pan", "country navigation"]) {
  test(`the missing-data ground disappears when leaving the city by ${exit}`, async ({ page }) => {
    await ready(page);
    await zoomTo(page, 2.6);
    const cityPixels = expectCityContext(await snapshot(page, groundCapture));

    if (exit === "zoom") {
      await zoomTo(page, 2);
    } else if (exit === "pan") {
      const { city } = await cityModel(page);
      await canvas(page).scrollIntoViewIfNeeded();
      const box = await canvas(page).boundingBox(), view = await camera(page);
      const x = box.x + box.width * 0.8, y = box.y + box.height * 0.62;
      // Leave the real city footprint while keeping the gesture in the canvas;
      // a drawn missing-data tile must not extend the logical city boundary.
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - (city.foundationRadius + 8) * view.zoom, y, { steps: 4 });
      await page.mouse.up();
    } else {
      await page.locator('[data-atlas-area-focus="country.inibholc"]').click();
    }

    await expect(root(page)).toHaveAttribute("data-atlas-city", "");
    await expect(root(page)).toHaveAttribute("data-atlas-level", "1");
    const countryShot = await snapshot(page, groundCapture);
    await expect(canvas(page)).toHaveCount(1);
    await expect(canvas(page)).toHaveAttribute("data-city-probe", "persistent");
    if (exit === "country navigation") {
      // A newly fitted country includes genuinely pale terrain; a clean render
      // at the identical camera is the strict reference for all residual pixels.
      await expectCleanCountryNavigation(page, countryShot);
    } else {
      const countryPixels = contextPixels(countryShot);
      expect(countryPixels.pale).toBeLessThan(0.05);
      expect(cityPixels.pale - countryPixels.pale).toBeGreaterThan(0.3);
    }
  });
}
