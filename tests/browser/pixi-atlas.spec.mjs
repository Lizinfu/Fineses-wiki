import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { createBlockBoard } from "../../assets/scripts/atlas/blocks.mjs";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";
import { constrainCameraY } from "../../assets/scripts/atlas/viewport.mjs";
import {
  createSpace,
  hexagon,
  project,
  unproject,
} from "../../assets/scripts/atlas/space.mjs";

// Declare one test per source geography: each keeps the default 30s budget on software WebGL.
const sourceYaml = (name) => parse(readFileSync(new URL(`../../data/maps/${name}.yaml`, import.meta.url), "utf8"));
const worldAreas = sourceYaml("areas").areas.filter((area) => area.map_id === "world");
const countryCases = worldAreas.filter((area) => area.layer === "country");
const labelledTerrain = sourceYaml("features").maps["nation.inibholc"].terrain.filter((feature) => feature.label_position);

async function ready(page, query = "entity=nat.ini") {
  await page.goto("/portals/atlas/?" + query);
  await expect(page.locator("[data-atlas]")).toHaveAttribute(
    "data-atlas-renderer",
    "webgl",
  );
  await expect(page.locator("[data-atlas]")).toHaveAttribute(
    "data-atlas-draws",
    /\d+/,
  );
}
const root = (page) => page.locator("[data-atlas]");
const camera = (page) =>
  root(page).getAttribute("data-atlas-camera").then(JSON.parse);
const navigationBounds = new WeakMap();
const groundCapture = { style: ".atlas-stage__toolbar, .atlas-cartouche, .atlas-compass, .atlas-legend, .atlas-view-indicator, .atlas-screen-labels { visibility: hidden !important; }" };

async function model(page) {
  const data = await page.locator("#atlas-map-data").evaluate((node) => {
    const value = JSON.parse(node.textContent);
    return typeof value === "string" ? JSON.parse(value) : value;
  });
  navigationBounds.set(page, createBlockBoard(data, createSpace(data)).bounds());
  return data;
}

async function pointViewAt(page, point, zoom, period) {
  // Camera setup uses CSS pixels at every zoom; the actual label assertions remain < 1px.
  const positionTolerance = 0.25;
  const host = page.locator("[data-atlas-canvas]");
  await host.scrollIntoViewIfNeeded();
  const box = await host.boundingBox(),
    before = await camera(page),
    center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.wheel(0, Math.log(before.zoom / zoom) / 0.0015);
  await expect
    .poll(async () => Math.abs((await camera(page)).zoom - zoom))
    .toBeLessThan(0.001);
  // Positioning setup follows the camera policy; label projection assertions still use the original geography.
  const limits = navigationBounds.get(page);
  point = constrainCameraY({ ...(await camera(page)), ...point }, box.height, limits);
  // Keep every drag within the viewport, including on a narrow touch device.
  for (let step = 0; step < 40; step++) {
    const view = await camera(page),
      dx =
        (view.x - point.x - Math.round((view.x - point.x) / period) * period) *
        view.zoom,
      dy = (view.y - point.y) * view.zoom * view.tilt;
    if (Math.hypot(dx, dy) < positionTolerance) break;
    const sx = Math.max(-box.width * 0.55, Math.min(box.width * 0.55, dx)),
      sy = Math.max(-box.height * 0.55, Math.min(box.height * 0.55, dy)),
      start = {
        x: box.x + box.width * (sx >= 0 ? 0.2 : 0.8),
        y: box.y + box.height * (sy >= 0 ? 0.2 : 0.8),
      };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    if (Math.hypot(sx, sy) <= 4.5) {
      // Cross the drag threshold before a subpixel correction; this must not become a tap.
      await page.mouse.move(start.x + 8, start.y + 8);
    }
    await page.mouse.move(start.x + sx, start.y + sy, { steps: 2 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const after = await camera(page);
        return Math.hypot(
          (after.x -
            view.x +
            sx / view.zoom -
            Math.round((after.x - view.x + sx / view.zoom) / period) * period) * view.zoom,
          (after.y - view.y) * view.zoom * view.tilt + sy,
        );
      })
      .toBeLessThan(positionTolerance);
  }
  await expect
    .poll(async () => {
      const current = await camera(page);
      return Math.hypot(
        (current.x -
          point.x -
          Math.round((current.x - point.x) / period) * period) * current.zoom,
        (current.y - point.y) * current.zoom * current.tilt,
      );
    })
    .toBeLessThan(positionTolerance);
}

for (const source of countryCases) {
  test(`country emblem loads at the common zoom and stays anchored: ${source.id}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page, "");
    const data = await model(page),
      space = createSpace(data),
      board = createBlockBoard(data, space),
      country = data.areas.find((area) => area.id === source.id);
    await page.locator(`[data-atlas-area-focus="${country.id}"]`).click();
    await expect(root(page)).toHaveAttribute("data-atlas-nation", country.detail_map_id);
    const anchor = board.raise(space.areaCenter(country));
    await pointViewAt(page, anchor, 0.8, space.period);
    const label = page.locator(`[data-atlas-label="${country.id}"]`),
      icon = label.locator("img");
    await expect(label).toBeVisible();
    await expect
      .poll(() => icon.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
    const size = await icon.boundingBox();
    expect(size.width).toBeCloseTo(30, 0);
    expect(size.height).toBeCloseTo(30, 0);
    const host = await page.locator("[data-atlas-canvas]").boundingBox(),
      expected = project(await camera(page), anchor, host.width, host.height);
    expect(Math.abs(size.x + size.width / 2 - host.x - expected.x)).toBeLessThan(1);
    expect(Math.abs(size.y + size.height / 2 - host.y - expected.y)).toBeLessThan(1);
    await expect(label).toHaveAccessibleName(`查看${country.label}`);
  });
}

async function expectTitleCentered(page, label, point) {
  await expect(label).toBeVisible();
  const title = await label.locator("strong").boundingBox(),
    host = await page.locator("[data-atlas-canvas]").boundingBox(),
    expected = project(await camera(page), point, host.width, host.height);
  expect(Math.abs(title.x + title.width / 2 - host.x - expected.x)).toBeLessThan(1);
  expect(Math.abs(title.y + title.height / 2 - host.y - expected.y)).toBeLessThan(1);
}

for (const source of worldAreas.filter((area) => area.layer === "continent")) {
  test(`continent title centers on its region: ${source.id}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page, "");
    const data = await model(page), space = createSpace(data), board = createBlockBoard(data, space),
      area = data.areas.find((entry) => entry.id === source.id),
      point = board.raise(space.areaCenter(area));
    await pointViewAt(page, point, 0.37, space.period);
    await expectTitleCentered(page, page.locator(`[data-atlas-label="${area.id}"]`), point);
  });
}

for (const source of labelledTerrain) {
  test(`terrain title centers on its region at both tilts: ${source.id}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await ready(page);
    const data = await model(page), space = createSpace(data), board = createBlockBoard(data, space),
      feature = data.feature_maps["nation.inibholc"].terrain.find((entry) => entry.id === source.id),
      point = board.raise(space.normalized("nation.inibholc", feature.geometry.center)),
      label = page.locator(`[data-atlas-label="${feature.id}"]`);
    await pointViewAt(page, point, 1.3, space.period);
    await expectTitleCentered(page, label, point);
    await page.locator("[data-atlas-tilt]").click();
    await expect.poll(async () => (await camera(page)).tilt).toBe(1);
    await expectTitleCentered(page, label, point);
    await page.locator("[data-atlas-tilt]").click();
    await expect.poll(async () => (await camera(page)).tilt).toBe(0.78);
    await expectTitleCentered(page, label, point);
  });
}

test("capital marker and title stay centered on its geographical anchor", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const data = await model(page), space = createSpace(data), board = createBlockBoard(data, space),
    capital = data.detail_locations.find((loc) => loc.id === "loc.cathair"),
    point = board.raise(space.normalized(capital.map_id, [capital.position.x, capital.position.y]));
  await pointViewAt(page, point, 1.3, space.period);
  const label = page.locator('[data-atlas-label="loc.cathair"]');
  await expect(label).toBeVisible();
  const host = await page.locator("[data-atlas-canvas]").boundingBox(),
    expected = project(await camera(page), point, host.width, host.height),
    positions = await label.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        title = el.querySelector("strong").getBoundingClientRect(),
        marker = getComputedStyle(el, "::before");
      return {
        x: r.x + parseFloat(marker.left) + parseFloat(marker.width) / 2,
        y: r.y + parseFloat(marker.top),
        titleY: title.y + title.height / 2,
      };
    });
  expect(Math.abs(positions.x - host.x - expected.x)).toBeLessThan(1);
  expect(Math.abs(positions.y - host.y - expected.y)).toBeLessThan(1);
  expect(Math.abs(positions.titleY - host.y - expected.y)).toBeLessThan(1);
});

test("emblems follow the camera during animated navigation without a separate button transition", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await ready(page, "");
  const data = await model(page),
    space = createSpace(data),
    board = createBlockBoard(data, space),
    point = board.raise(
      space.areaCenter(data.areas.find((a) => a.id === "country.inibholc")),
    );
  await page.locator('[data-atlas-area-focus="country.inibholc"]').click();
  const errors = await page.evaluate(async (point) => {
    const root = document.querySelector("[data-atlas]"),
      host = document.querySelector("[data-atlas-canvas]"),
      label = document.querySelector('[data-atlas-label="country.inibholc"]'),
      errors = [];
    for (let frame = 0; frame < 25; frame++) {
      await new Promise(requestAnimationFrame);
      if (label.hidden) continue;
      const view = JSON.parse(root.dataset.atlasCamera),
        rect = host.getBoundingClientRect(),
        img = label.querySelector("img").getBoundingClientRect();
      errors.push(
        Math.hypot(
          img.x +
            img.width / 2 -
            rect.x -
            host.clientWidth / 2 -
            (point.x - view.x) * view.zoom,
          img.y +
            img.height / 2 -
            rect.y -
            host.clientHeight / 2 -
            (point.y - view.y) * view.zoom * view.tilt,
        ),
      );
    }
    return errors;
  }, point);
  expect(errors.length).toBeGreaterThan(5);
  expect(Math.max(...errors)).toBeLessThan(1);
});

test("country text can collapse near an edge while its emblem stays anchored and clickable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const data = await model(page),
    space = createSpace(data),
    board = createBlockBoard(data, space),
    country = data.areas.find((a) => a.id === "country.inibholc"),
    anchor = board.raise(space.areaCenter(country)),
    box = await page.locator("[data-atlas-canvas]").boundingBox();
  // Captions extend right of the emblem; reserve the emblem at the right edge.
  await pointViewAt(
    page,
    { x: anchor.x - (box.width / 2 - 34) / 0.8, y: anchor.y },
    0.8,
    space.period,
  );
  const label = page.locator('[data-atlas-label="country.inibholc"]'),
    icon = label.locator("img");
  await expect(label).toBeVisible();
  await expect(label).toHaveAttribute("data-label-mode", "icon");
  await expect(label.locator("strong")).toBeHidden();
  const position = await icon.boundingBox();
  expect(Math.abs(position.x + position.width / 2 - box.x - (box.width - 34))).toBeLessThan(
    1,
  );
  await label.click();
  await expect(page.locator("[data-feature-card-title]")).toHaveText(
    "伊琳沃克",
  );
});

test("dragging an emblem pans without activating it and keyboard activation remains available", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await expect(
    page.locator('[data-atlas-label="country.inibholc"]'),
  ).toBeVisible();
  const data = await model(page),
    space = createSpace(data),
    board = createBlockBoard(data, space),
    country = data.areas.find((a) => a.id === "country.inibholc");
  await pointViewAt(
    page,
    board.raise(space.areaCenter(country)),
    0.8,
    space.period,
  );
  await page.locator("[data-feature-card-close]").click();
  await page.locator("[data-atlas-canvas]").scrollIntoViewIfNeeded();
  const before = await camera(page),
    label = page.locator('[data-atlas-label="country.inibholc"]'),
    box = await label.locator("img").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2, {
    steps: 3,
  });
  await page.mouse.up();
  await expect
    .poll(async () =>
      Math.abs((await camera(page)).x - before.x + 45 / before.zoom),
    )
    .toBeLessThan(0.1);
  await expect(page.locator("[data-atlas-feature-card]")).toBeHidden();
  await label.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-feature-card-title]")).toHaveText(
    "伊琳沃克",
  );
  await expect(page.locator("[data-atlas-feature-card]")).toBeVisible();
});

test("shared country borders remain distinct over terrain at world and national zoom", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page, "");
  const data = await model(page),
    space = createSpace(data),
    board = createBlockBoard(data, space),
    country = data.areas.find((a) => a.id === "country.inibholc");
  let boundary;
  for (const poly of space.countryPolygons(country)) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        length = Math.hypot(b.x - a.x, b.y - a.y),
        normal = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
      const left = space.countryAt({
          x: middle.x + normal.x,
          y: middle.y + normal.y,
        }),
        right = space.countryAt({
          x: middle.x - normal.x,
          y: middle.y - normal.y,
        });
      if (
        left?.layer === "country" &&
        right?.layer === "country" &&
        left.id !== right.id
      ) {
        const sign = left.id === country.id ? 1 : -1,
          inside = {
            x: middle.x + normal.x * sign,
            y: middle.y + normal.y * sign,
          };
        boundary = {
          middle: { x: middle.x, y: middle.y - board.heightAt(inside) },
          normal,
        };
        break;
      }
    }
    if (boundary) break;
  }
  expect(boundary).toBeTruthy();
  for (const zoom of [0.37, 3.2]) {
    await pointViewAt(page, boundary.middle, zoom, space.period);
    const canvas = page.locator(".atlas-pixi-canvas"),
      box = await canvas.boundingBox(),
      view = await camera(page),
      p = project(view, boundary.middle, box.width, box.height),
      png = await canvas.screenshot(),
      image = await sharp(png)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const rgb = (offset) => {
      const x = Math.round(
          ((p.x + boundary.normal.x * offset) * image.info.width) / box.width,
        ),
        y = Math.round(
          ((p.y + boundary.normal.y * offset) * image.info.height) / box.height,
        ),
        i = (y * image.info.width + x) * 4;
      return [...image.data.subarray(i, i + 3)];
    };
    const brightness = offset => rgb(offset).reduce((sum, value) => sum + value, 0) / 3;
    const background = (brightness(-6) + brightness(6)) / 2;
    const contrast = background - Math.min(...[-1, 0, 1].map(brightness));
    const diagnostic = { zoom, view, point: p, samples: [-6, -1, 0, 1, 6].map(offset => ({ offset, rgb: rgb(offset) })), contrast };
    if (contrast <= 35) {
      const imagePath = testInfo.outputPath(`country-border-${zoom}.png`);
      await sharp(png).toFile(imagePath);
      await testInfo.attach(`country-border-${zoom}.png`, { path: imagePath, contentType: "image/png" });
    }
    expect(
      contrast, JSON.stringify(diagnostic),
    ).toBeGreaterThan(35);
  }
});

test("extruded land leaves the open sea clear", async ({ page }) => {
  await ready(page);
  const model = await page.locator("#atlas-map-data").evaluate((node) => {
    let data = JSON.parse(node.textContent);
    return typeof data === "string" ? JSON.parse(data) : data;
  });
  const space = createSpace(model),
    board = createBlockBoard(model, space),
    view = await camera(page),
    canvas = page.locator(".atlas-pixi-canvas"),
    box = await canvas.boundingBox();
  const image = await sharp(await canvas.screenshot(groundCapture))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let checked = 0;
  for (let y = 100; y < box.height - 65; y += 45)
    for (let x = 35; x < box.width - 35; x += 45) {
      const p = unproject(view, { x, y }, box.width, box.height);
      if (
        [
          [0, 0],
          [6, 0],
          [-6, 0],
          [0, 6],
          [0, -6],
        ].some(([dx, dy]) => board.pick({ x: p.x + dx, y: p.y + dy }))
      )
        continue;
      const i =
        (Math.floor((y * image.info.height) / box.height) * image.info.width +
          Math.floor((x * image.info.width) / box.width)) *
        4;
      const rgb = [...image.data.subarray(i, i + 3)];
      // These positions are outside all raised land and away from coastlines.
      // They must retain the approved cold-blue sea, rather than a land surface
      // or the city's neutral missing-survey overlay.
      expect(Math.max(...rgb.map((value, channel) => Math.abs(value - [169, 196, 210][channel]))),
        JSON.stringify({ x, y, rgb })).toBeLessThan(6);
      checked++;
    }
  expect(checked).toBeGreaterThan(2);
});

test("Aotelaisi can be found in Greek, keeps its dark floor in political mode and retains country picking", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page, "loc=loc.cathair");
  await page.locator('[data-atlas-search]').fill('ΑΟΤΕΛΑΙΣΙ');
  await page.locator('[data-atlas-feature-focus="terrain.aotelaisi"]').click();
  await expect(page.locator('[data-feature-card-title]')).toHaveText('奥特莱斯');
  const archiveLink = page.locator('[data-feature-card-link]');
  await expect(archiveLink).toBeVisible();
  await expect(archiveLink).toHaveAttribute('href', /\/regions\/reg-aotelaisi\/?$/);
  await expect(page.locator('[data-atlas-feature-focus="terrain.aotelaisi"]').locator('..').locator('.atlas-feature-archive'))
    .toHaveAttribute('href', /\/regions\/reg-aotelaisi\/?$/);
  const label = page.locator('[data-atlas-label="terrain.aotelaisi"]');
  await expect(label).toBeVisible();
  await expect(label).toContainText('ΑΟΤΕΛΑΙΣΙ');
  expect(new URL(page.url()).searchParams.has('loc')).toBe(false);
  const data = await model(page), space = createSpace(data), board = createBlockBoard(data, space);
  const cell = board.cellIndex.get('74:20'), top = board.raise(cell.point);
  const canvas = page.locator('.atlas-pixi-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox(), view = await camera(page);
  const p = project(view, top, box.width, box.height);
  async function floorColor() {
    const shot = await sharp(await canvas.screenshot()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const x = Math.round(p.x * shot.info.width / box.width), y = Math.round(p.y * shot.info.height / box.height);
    return [...shot.data.subarray((y * shot.info.width + x) * 4, (y * shot.info.width + x) * 4 + 3)];
  }
  const neutral = await floorColor();
  expect(neutral[0]).toBeLessThan(50);
  expect(neutral[2]).toBeGreaterThan(neutral[0]);
  await page.locator('[data-atlas-preset-toggle]').click();
  expect(await floorColor()).toEqual(neutral);
  await page.locator('.atlas-feature-controls summary').click();
  await page.locator('[data-feature-toggle="terrain"]').uncheck();
  await expect(label).toBeHidden();
  await page.locator('[data-feature-toggle="terrain"]').check();
  await expect(label).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const after = await canvas.boundingBox();
  await page.mouse.click(after.x + p.x, after.y + p.y);
  await expect(page.locator('[data-feature-card-title]')).toHaveText('卡俄斯');
});

test("planar block tops remain locally coherent while neutral lighting separates their exposed side walls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page, "");
  await expect(root(page)).toHaveAttribute("data-atlas-scene", "hex-blocks");
  const data = await model(page),
    space = createSpace(data),
    board = createBlockBoard(data, space),
    world = board.bounds(),
    centerY = (world.minY + world.maxY) / 2,
    // Keep the surface sample away from polar camera limits and the map toolbar.
    cell = board.cells.filter(
      (c) =>
        c.owner?.layer === "special" &&
        !board.logicalCell({
          x: c.point.x,
          y: c.point.y + (c.radius * Math.sqrt(3)) / 2 + 1,
        }),
    ).sort((a, b) => Math.abs(a.point.y - centerY) - Math.abs(b.point.y - centerY))[0];
  expect(cell).toBeTruthy();
  const top = board.raise(cell.point);
  await pointViewAt(page, top, 1.6, space.period);
  const canvas = page.locator(".atlas-pixi-canvas"),
    box = await canvas.boundingBox(),
    view = await camera(page),
    shot = await sharp(await canvas.screenshot(groundCapture))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }),
    pixel = (point) => {
      const p = project(view, point, box.width, box.height),
        x = Math.round((p.x * shot.info.width) / box.width),
        y = Math.round((p.y * shot.info.height) / box.height),
        i = (y * shot.info.width + x) * 4;
      return [...shot.data.subarray(i, i + 3)];
    };
  const colors = [
    top,
    { x: top.x - 3, y: top.y },
    { x: top.x + 3, y: top.y },
    { x: top.x, y: top.y - 3 },
    { x: top.x, y: top.y + 3 },
  ].map(pixel);
  for (let channel = 0; channel < 3; channel++)
    expect(
      Math.max(...colors.map((c) => c[channel])) -
        Math.min(...colors.map((c) => c[channel])),
    ).toBeLessThan(12);
  const face = board.geometry(cell).faces.find((f) => f.index === 1).points,
    wall = pixel({
      x: face.reduce((s, p) => s + p.x, 0) / 4,
      y: face.reduce((s, p) => s + p.y, 0) / 4,
    });
  expect(
    colors[0].reduce((s, v) => s + v, 0) / 3 -
      wall.reduce((s, v) => s + v, 0) / 3,
  ).toBeGreaterThan(20);
});

test("equal-height world ground is continuous by default and the optional grid only adds an overlay", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page, "");
  await expect(page.locator('[data-feature-toggle="grid"]')).not.toBeChecked();
  const data = await model(page), space = createSpace(data), board = createBlockBoard(data, space);
  const world = board.bounds(), centerY = (world.minY + world.maxY) / 2;
  const candidates = board.cells.filter(cell => !cell.region && cell.level >= 0 &&
    !data.feature_maps[cell.owner?.detail_map_id]?.waterways?.length).map(cell => {
    const polygon = hexagon(cell.point, cell.radius);
    const neighbours = polygon.map((a, i) => {
      const b = polygon[(i + 1) % 6];
      return board.logicalCell({ x: a.x + b.x - cell.point.x, y: a.y + b.y - cell.point.y });
    });
    return { cell, polygon, neighbours };
  }).filter(({ cell, neighbours }) => neighbours.every(other => other && Math.abs(other.point.x - cell.point.x) < cell.radius * 2 && other.level === cell.level &&
    other.material === cell.material && other.owner?.id === cell.owner?.id && !other.region));
  const sample = candidates.sort((a, b) => Math.abs(a.cell.point.y - centerY) - Math.abs(b.cell.point.y - centerY))[0];
  expect(sample).toBeTruthy();
  await pointViewAt(page, board.raise(sample.cell.point), 2.2, space.period);
  const canvas = page.locator(".atlas-pixi-canvas");
  const capture = async () => {
    await canvas.scrollIntoViewIfNeeded();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    return sharp(await canvas.screenshot(groundCapture)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  };
  const seamless = await capture(), box = await canvas.boundingBox(), view = await camera(page);
  const pixel = (shot, p) => {
    const x = Math.round(p.x * shot.info.width / box.width), y = Math.round(p.y * shot.info.height / box.height);
    return [...shot.data.subarray((y * shot.info.width + x) * 3, (y * shot.info.width + x) * 3 + 3)];
  };
  const edgeSamples = [];
  const center = pixel(seamless, project(view, board.raise(sample.cell.point), box.width, box.height));
  for (let edge = 0; edge < 6; edge++) {
    const neighbour = sample.neighbours[edge], a = sample.polygon[edge], b = sample.polygon[(edge + 1) % 6];
    const other = pixel(seamless, project(view, board.raise(neighbour.point), box.width, box.height));
    const normal = { x: neighbour.point.x - sample.cell.point.x, y: (neighbour.point.y - sample.cell.point.y) * view.tilt };
    const length = Math.hypot(normal.x, normal.y);
    for (const t of [0.3, 0.5, 0.7]) {
      const p = project(view, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - board.cellHeight(sample.cell) }, box.width, box.height);
      edgeSamples.push(p);
      for (const offset of [-1, 0, 1]) {
        const rgb = pixel(seamless, { x: p.x + normal.x / length * offset, y: p.y + normal.y / length * offset });
        for (let channel = 0; channel < 3; channel++) {
          expect(rgb[channel]).toBeGreaterThanOrEqual(Math.min(center[channel], other[channel]) - 8);
          expect(rgb[channel]).toBeLessThanOrEqual(Math.max(center[channel], other[channel]) + 8);
        }
      }
    }
  }
  await page.locator(".atlas-feature-controls summary").click();
  await page.locator('[data-feature-toggle="grid"]').check();
  const gridded = await capture();
  const changed = edgeSamples.filter(p => pixel(seamless, p).reduce((sum, value, channel) => sum + Math.abs(value - pixel(gridded, p)[channel]), 0) > 6);
  expect(changed.length).toBeGreaterThan(5);
  await page.locator('[data-feature-toggle="grid"]').uncheck();
  const restored = await capture();
  for (const p of edgeSamples) expect(pixel(restored, p)).toEqual(pixel(seamless, p));
});

test("two-finger zoom follows the moving midpoint without a spurious selection", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch gesture on the mobile profile");
  await ready(page);
  await page.locator("[data-atlas-canvas]").scrollIntoViewIfNeeded();
  const box = await page.locator("[data-atlas-canvas]").boundingBox(),
    before = await camera(page),
    cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: cx - 35, y: cy },
      { id: 2, x: cx + 35, y: cy },
    ],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 1, x: cx - 60, y: cy + 10 },
      { id: 2, x: cx + 60, y: cy + 10 },
    ],
  });
  await expect
    .poll(async () => (await camera(page)).zoom)
    .toBeGreaterThan(before.zoom * 1.4);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const after = await camera(page);
  expect(
    Math.abs((before.y - after.y) * after.zoom * after.tilt - 10),
  ).toBeLessThan(2);
  await expect(page).toHaveURL(/entity=nat\.ini/);
  await client.detach();
});

test("PixiJS renders a real WebGL canvas with no SVG map and keeps country deep links on resize", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(root(page)).toHaveAttribute("data-atlas-level", "1");
  await expect(
    page.locator('[data-atlas-label="country.inibholc"]'),
  ).toBeVisible();
  await expect(page.locator(".atlas-pixi-canvas")).toBeVisible();
  await expect(page.locator("[data-atlas-stage] svg")).toHaveCount(0);
  await expect(page.locator("[data-atlas-area-item]")).toHaveCount(13);
  await expect(page.locator("[data-feature-card-title]")).toHaveText(
    "伊琳沃克",
  );
  await page.setViewportSize({ width: 820, height: 940 });
  await expect(root(page)).toHaveAttribute("data-atlas-level", "1");
  const { channels } = await sharp(
    await page.locator(".atlas-pixi-canvas").screenshot(),
  ).stats();
  expect(channels[0].max - channels[0].min).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test("city, country and world use one persistent canvas, history and exclusive label levels", async ({
  page,
}) => {
  await ready(page);
  await page
    .locator(".atlas-pixi-canvas")
    .evaluate((canvas) => (canvas.dataset.probe = "persistent"));
  await expect(
    page.locator('[data-atlas-label="settlement.cathair.plan"]'),
  ).toBeHidden();
  await page.locator("[data-atlas-city-item] button").click();
  await expect(root(page)).toHaveAttribute("data-atlas-level", "2");
  await expect(page).toHaveURL(/loc=loc\.cathair/);
  await expect(
    page.locator('[data-atlas-label="settlement.cathair.plan"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-atlas-label="terrain.inibholc.highwind"]'),
  ).toBeHidden();
  await expect(page.locator(".atlas-pixi-canvas")).toHaveAttribute(
    "data-probe",
    "persistent",
  );
  await page.goBack();
  await expect(root(page)).toHaveAttribute("data-atlas-level", "1");
  await page.locator("[data-atlas-reset]").click();
  await expect(root(page)).toHaveAttribute("data-atlas-level", "0");
  await expect(page.locator('.atlas-hero h1')).toHaveText('世界地图');
  await expect(page.locator('[data-atlas-view-region]')).toHaveText('全球');
  await expect(page.locator('.atlas-cartouche > span')).toHaveText('世界地图');
  await expect(page.locator('.atlas-cartouche strong')).toHaveText('WORLDMAP');
  await expect(page.locator(".atlas-pixi-canvas")).toHaveAttribute(
    "data-probe",
    "persistent",
  );
});

// Overlap one country so every original consecutive transition is still exercised.
for (let start = 0; start < countryCases.length; start += 4) {
  const group = countryCases.slice(Math.max(0, start - 1), start + 4);
  test(`country navigation keeps one canvas: ${group[0].id} to ${group.at(-1).id}`, async ({ page }) => {
    await ready(page, "");
    const canvas = page.locator(".atlas-pixi-canvas");
    await canvas.evaluate(el => el.dataset.countryProbe = "persistent");
    for (const country of group) {
      await page.locator(`[data-atlas-area-focus="${country.id}"]`).click();
      await expect(root(page)).toHaveAttribute("data-atlas-nation", country.detail_map_id);
      await expect(page.locator("[data-atlas-runtime-status]")).toBeHidden();
      await expect(canvas).toHaveCount(1);
      await expect(canvas).toHaveAttribute("data-country-probe", "persistent");
    }
  });
}

test("tilt and wheel zoom keep screen labels aligned with the same world projection", async ({
  page,
}) => {
  await ready(page, "loc=loc.cathair");
  const label = page.locator('[data-atlas-label="settlement.cathair.plan"]');
  await page.locator("[data-atlas-tilt]").click();
  await expect.poll(async () => (await camera(page)).tilt).toBe(1);
  const error = await label.evaluate((element) => {
    const r = element.querySelector("strong").getBoundingClientRect(),
      host = element.closest("[data-atlas-canvas]").getBoundingClientRect();
    const p = JSON.parse(element.dataset.anchor);
    return Math.max(
      Math.abs(r.left + r.width / 2 - host.left - p.x),
      Math.abs(r.top + r.height / 2 - host.top - p.y),
    );
  });
  expect(error).toBeLessThan(1);
  await page.locator("[data-atlas-canvas]").scrollIntoViewIfNeeded();
  const bounds = await page.locator("[data-atlas-canvas]").boundingBox(),
    anchor = { x: bounds.width * 0.32, y: bounds.height * 0.35 };
  const before = await camera(page),
    world = {
      x: before.x + (anchor.x - bounds.width / 2) / before.zoom,
      y:
        before.y + (anchor.y - bounds.height / 2) / (before.zoom * before.tilt),
    };
  await page.mouse.move(bounds.x + anchor.x, bounds.y + anchor.y);
  await page.mouse.wheel(0, -120);
  await expect
    .poll(async () => (await camera(page)).zoom)
    .toBeGreaterThan(before.zoom);
  const after = await camera(page);
  expect(
    Math.abs(world.x - after.x - (anchor.x - bounds.width / 2) / after.zoom),
  ).toBeLessThan(0.05);
  expect(
    Math.abs(
      world.y -
        after.y -
        (anchor.y - bounds.height / 2) / (after.zoom * after.tilt),
    ),
  ).toBeLessThan(0.05);
});

test("GPU terrain, grids, waterways and city layers respond to controls", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const image = async () => {
    const canvas = page.locator(".atlas-pixi-canvas");
    await canvas.evaluate(node => node.scrollIntoView({ block: "center", behavior: "instant" }));
    await page.evaluate(() => new Promise(requestAnimationFrame));
    return canvas.screenshot(groundCapture);
  };
  const meanDifference = (a, b) => {
    expect(a.length).toBe(b.length);
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
    return sum / a.length;
  };
  const before = await sharp(await image())
    .raw()
    .toBuffer();
  await page.locator(".atlas-feature-controls summary").click();
  await page.locator('[data-feature-toggle="terrain"]').uncheck();
  const after = await sharp(await image())
    .raw()
    .toBuffer();
  expect(meanDifference(before, after)).toBeGreaterThan(1);
  await page.locator('[data-feature-toggle="terrain"]').check();
  const grid = page.locator('[data-feature-toggle="grid"]');
  await expect(grid).not.toBeChecked();
  const withoutGrid = await sharp(await image()).raw().toBuffer();
  await grid.check();
  const withGrid = await sharp(await image()).raw().toBuffer();
  expect(meanDifference(withoutGrid, withGrid)).toBeGreaterThan(0.05);
  await grid.uncheck();
  expect(meanDifference(withoutGrid, await sharp(await image()).raw().toBuffer())).toBeLessThan(0.1);
  await page.locator('[data-feature-toggle="waterways"]').uncheck();
  await expect(
    page.locator('[data-atlas-label="waterway.inibholc.central"]'),
  ).toBeHidden();
  await page.locator("[data-atlas-city-item] button").click();
  await expect(root(page)).toHaveAttribute("data-atlas-level", "2");
  await page.locator('[data-feature-toggle="settlements"]').uncheck();
  await expect(
    page.locator('[data-atlas-label="settlement.cathair.plan"]'),
  ).toBeHidden();
  await page.locator('[data-feature-toggle="settlements"]').check();
  await expect(
    page.locator('[data-atlas-label="settlement.cathair.plan"]'),
  ).toBeVisible();
});

test("search, keyboard controls and archive access work independently of rendering", async ({
  page,
  browser,
}) => {
  await ready(page, "");
  await page.locator("[data-atlas-search]").fill("高风原野");
  await expect(page.locator("[data-atlas-count]")).toHaveText("1 处匹配");
  await page
    .locator('[data-atlas-feature-focus="terrain.inibholc.highwind"]')
    .click();
  await expect(root(page)).toHaveAttribute("data-atlas-level", "1");
  await expect(page.locator("[data-feature-card-title]")).toHaveText(
    "高风原野",
  );
  await expect(page.locator("[data-feature-card-link]")).toHaveAttribute(
    "href",
    /Machaire-Gaoithe/i,
  );
  const z = (await camera(page)).zoom;
  await page.locator("[data-atlas-stage]").focus();
  await page.keyboard.press("+");
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(z);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-atlas-feature-card]")).toBeHidden();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const fallback = await context.newPage();
    await fallback.goto(new URL("/portals/atlas/", page.url()).href);
    const item = fallback.locator('[data-feature-search="高风原野"]');
    await expect(item.locator("[data-feature-description]")).toContainText(
      "丘陵与平原",
    );
    await expect(item.locator("a")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("WebGL failure is explicit and leaves the readable directory available", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      if (String(kind).includes("webgl")) return null;
      return original.call(this, kind, ...args);
    };
  });
  await page.goto("/portals/atlas/");
  await expect(root(page)).toHaveAttribute(
    "data-atlas-renderer",
    "unavailable",
  );
  await expect(page.locator("[data-atlas-runtime-status]")).toContainText(
    "WebGL",
  );
  await expect(
    page.locator("[data-atlas-area-item]").first().locator("a"),
  ).toBeVisible();
});

test("map labels and controls are accessible and avoid each other on a small screen", async ({
  page,
}) => {
  await ready(page, "loc=loc.cathair");
  await page.locator('[data-atlas-label="settlement.cathair.plan"]').click();
  await expect(page.locator("[data-feature-card-title]")).toHaveText(
    "皇宫与中央城区",
  );
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze()
  ).violations.filter((v) => ["critical", "serious"].includes(v.impact));
  expect(
    violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});

test("non-map pages do not load PixiJS", async ({ page }) => {
  await page.goto("/nations/nat-inibholc/");
  await expect(page.locator('script[src*="atlas."]')).toHaveCount(0);
  await expect(page.locator(".atlas-pixi-canvas")).toHaveCount(0);
});
