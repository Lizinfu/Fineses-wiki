import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

function accessibilityViolationSummary(violations) {
  return violations.map(({ id, impact, help, nodes }) => ({
    id,
    impact,
    help,
    nodes: nodes.map(({ target, failureSummary }) => ({
      target,
      failureSummary,
    })),
  }));
}

async function dismissAnnouncement(page) {
  const dialog = page.locator("#library-announcement");

  if (await dialog.isVisible()) {
    await dialog.locator("[data-announcement-close]").click();
    await expect(dialog).not.toBeVisible();
  }
}

const routes = [
  "/",
  "/search/",
  "/timeline/",
  "/portals/atlas/",
  "/portals/atlas/inibholc/",
  "/nations/nat-ramus/",
  "/404.html",
];

for (const route of routes) {
  test(`${route} renders a usable document`, async ({ page }) => {
    const response = await page.goto(route);
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(/\S/);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("a.skip-link")).toBeVisible();
  });
}

test("body search matches every space-separated term literally", async ({ page }) => {
  await page.goto("/search/");
  const input = page.locator("[data-search-input]");
  const results = page.locator(".search-result");
  await expect(input).toBeEnabled();

  await input.fill("卡夏");
  await expect(page.locator("[data-search-count]")).toHaveText("1 RESULTS");
  await expect(results).toHaveCount(1);
  await expect(results.first().locator(".search-result__title")).toHaveText("伊琳沃克");
  await expect(results.first().locator("mark").first()).toHaveText("卡夏");

  await input.fill("卡夏 伊琳沃克");
  await expect(page.locator("[data-search-count]")).toHaveText("1 RESULTS");
  await expect(results.first().locator("mark", { hasText: "卡夏" }).first()).toBeVisible();
  await expect(results.first().locator("mark", { hasText: "伊琳沃克" }).first()).toBeVisible();

  await input.fill("卡夏 玛夏娜");
  await expect(page.locator("[data-search-count]")).toHaveText("0 RESULTS");
  await expect(results).toHaveCount(0);

  await input.fill("国家目录保存");
  await expect(page.locator("[data-search-count]")).toHaveText("1 RESULTS");
  await expect(results.first().locator(".search-result__title")).toHaveText("国家");

  await input.fill("星");
  await expect(page.locator("[data-search-count]")).toHaveText("7 RESULTS");
  await expect(page.locator(".search-result__title")).toContainText([
    "塔罗萨尔占星泥版",
    "堑渊",
    "塔罗萨尔",
    "卡什莫兰",
    "塞壬",
    "埃萨勒",
    "天文学概述",
  ]);
});

test("body search restores URL queries and paginates the full result set", async ({ page }) => {
  await page.goto("/search/?q=%E5%9B%BD");
  await expect(page.locator("[data-search-input]")).toHaveValue("国");
  await expect(page.locator("[data-search-count]")).toHaveText("44 RESULTS");
  await expect(page.locator(".search-result")).toHaveCount(10);
  await page.locator("[data-search-more]").click();
  await expect(page.locator(".search-result")).toHaveCount(20);
  await expect(page.locator("[data-search-count]")).toHaveText("44 RESULTS");
});

test("search page has no serious automated accessibility violations", async ({ page }) => {
  await page.goto("/search/");
  await expect(page.locator("[data-search-input]")).toBeEnabled();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibilityViolationSummary(results.violations)).toEqual([]);
});

test("keyboard users can reach and activate the skip link", async ({
  page,
}) => {
  await page.goto("/");
  await dismissAnnouncement(page);
  await page.keyboard.press("Tab");
  await expect(page.locator("a.skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("mobile navigation can be opened and closed", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile-only interaction.");
  await page.goto("/");
  await dismissAnnouncement(page);
  const toggle = page.locator("[data-nav-toggle]");
  const drawer = page.locator("[data-mobile-nav]");
  const close = drawer.locator("[data-nav-close]").last();

  await expect(page.locator("html")).toHaveClass(/\bjs\b/);
  await expect(toggle).toBeVisible();
  await expect(drawer).toHaveAttribute("data-state", "closed");

  await toggle.click();
  await expect(drawer).toHaveAttribute("data-state", "open");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await close.click();
  await expect(drawer).toHaveAttribute("data-state", "closed");
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("home announcement can be dismissed and stays dismissed", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = page.locator("#library-announcement");
  const announcementId = await dialog.getAttribute("data-announcement-id");

  expect(announcementId).toBeTruthy();
  await expect(dialog).toBeVisible();
  await dialog.locator("[data-announcement-close]").click();
  await expect(dialog).not.toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.localStorage.getItem(`world-library-notice:${id}`),
        announcementId,
      ),
    )
    .toBe("1");

  await page.reload();
  await expect(dialog).not.toBeVisible();
});

test("marginal notes support pointer, keyboard, and mobile reading", async ({
  page,
}) => {
  await page.goto("/concepts/con-astronomy/");
  const trigger = page.locator("[data-marginal-note-trigger]").first();
  const panel = page.locator("[data-marginal-note-panel]").first();

  await expect(trigger).toBeVisible();
  await trigger.focus();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toContainText("尚未被证实的解释框架");
});

test("atlas supports country focus, search, location focus, and keyboard zoom", async ({
  page,
}) => {
  await page.goto("/portals/atlas/?entity=nat.muo");
  const country = page.locator("[data-atlas-area-focus='country.muocils']").first();
  const location = page.locator("[data-atlas-focus='loc.muocils']");
  const stage = page.locator("[data-atlas-stage]");

  await expect(country).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/entity=nat\.muo/);
  await expect(page.locator("[data-atlas-selection-title]")).toHaveText("莫尔索斯");
  await expect(page.locator(".atlas-area-label--country")).toHaveCount(13);
  expect(await page.locator(".atlas-hex[data-selected='true']").count()).toBeGreaterThan(0);
  expect(await page.locator(".atlas-hex[data-country='country.tarusar'][data-political-status='unruled']").count()).toBeGreaterThan(0);
  await expect(page.locator("[data-atlas-marker]")).toHaveAttribute(
    "href",
    /\/nations\/nat-muocils\/?$/,
  );
  const worldTileNodes = await page.locator("[data-atlas-map] > .atlas-hex-map .atlas-hex-batch").count();
  expect(worldTileNodes).toBeLessThan(80);
  expect(worldTileNodes).toBeGreaterThan(10);
  await expect(page.locator(".atlas-hex-repeat")).toHaveCount(2);
  const worldSvg = page.locator("[data-atlas-map] > .atlas-hex-map");
  await expect(worldSvg.locator(".atlas-terrain-layer")).toHaveCount(1);
  await expect(worldSvg.locator(".atlas-political-layer")).toHaveCount(1);
  await expect(worldSvg.locator(".atlas-boundary-layer")).toHaveCount(1);
  await expect(worldSvg.locator(".atlas-route-layer")).toHaveCount(1);
  await expect(page.locator("[data-atlas-label-layer]")).toHaveCount(1);
  await expect(worldSvg.locator(".atlas-coast-path")).toHaveCount(1);
  expect(await worldSvg.locator(".atlas-political-boundary-path").count()).toBeGreaterThan(1);
  expect(await page.locator(".atlas-political-boundary-path[data-selected]").count()).toBeGreaterThan(0);
  await expect(worldSvg.locator(".atlas-relief-filter")).toHaveCount(1);
  await expect(page.locator(".atlas-hex[data-political-boundary]")).toHaveCount(0);
  await expect(page.locator("[data-atlas]")).toHaveAttribute("data-atlas-logical-tiles", "8160");
  await expect(page.locator("[data-atlas]")).toHaveAttribute("data-atlas-svg-tiles", String(worldTileNodes));
  expect(await page.locator(".atlas-hex--land").count()).toBeGreaterThan(10);
  expect(await page.locator(".atlas-hex[data-special='special.uninhabited']").count()).toBeGreaterThan(0);
  await expect(worldSvg.locator(".atlas-ocean-gradient")).toHaveCount(1);
  const countryStyleCount = await page.locator(".atlas-hex[data-country]").evaluateAll((tiles) => (
    new Set(tiles.map((tile) => tile.getAttribute("data-area-style"))).size
  ));
  expect(countryStyleCount).toBe(13);
  const oceanFill = await page.locator(".atlas-hex--ocean").first().evaluate((tile) => getComputedStyle(tile).fill);
  const uninhabitedFill = await page.locator(".atlas-hex[data-special='special.uninhabited']").first().evaluate((tile) => getComputedStyle(tile).fill);
  expect(oceanFill).not.toBe(uninhabitedFill);
  await expect(page.locator(".atlas-map-image")).toHaveCount(0);

  const repeats = await page.locator(".atlas-map-repeat").evaluateAll((nodes) => nodes.map((node) => ({
    href: node.getAttribute("href"),
    transform: node.getAttribute("transform"),
  })));
  expect(repeats).toEqual([
    { href: "#atlas-map-content-world", transform: "translate(-4896 0)" },
    { href: "#atlas-map-content-world", transform: "translate(4896 0)" },
  ]);

  const mapData = await page.locator("#atlas-map-data").evaluate((node) => {
    const parsed = JSON.parse(node.textContent);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  });
  expect(mapData.maps[0].level).toBe(0);
  expect(mapData.locations[0].position).toEqual({ x: 0.634921, y: 0.148148 });

  const presetToggle = page.locator("[data-atlas-preset-toggle]");
  await presetToggle.click();
  await expect(presetToggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-atlas-map]")).toHaveAttribute("data-visual-preset", "tactical-paper");
  await expect(presetToggle).toHaveText("政治配色");

  await page.locator("[data-atlas-search]").fill("不存在的地点");
  await expect(page.locator("[data-atlas-count]")).toHaveText("0 个地图条目");
  await expect(page.locator("[data-atlas-location-item]")).toBeHidden();
  await expect(page.locator("[data-atlas-area-item]").first()).toBeHidden();

  await page.locator("[data-atlas-search]").fill("");
  await expect(page.locator("[data-atlas-count]")).toHaveText("15 个地图条目");

  await location.click();
  await expect(location).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/loc=loc\.muocils/);

  const zoomReadout = page.locator("[data-atlas-zoom-readout]");
  const initialZoom = Number((await zoomReadout.textContent()).replace("%", ""));
  // A directory click leaves focus outside the stage; map shortcuts still work.
  await page.keyboard.press("+");
  await expect.poll(async () => Number((await zoomReadout.textContent()).replace("%", "")))
    .toBeGreaterThan(initialZoom);

  await page.locator("[data-atlas-reset]").click();
  await expect.poll(async () => Number((await zoomReadout.textContent()).replace("%", "")))
    .toBeLessThan(initialZoom);
  await expect(page.locator("[data-atlas-selection]")).toBeHidden();
  await expect(page).not.toHaveURL(/loc=/);
});

test("Inibholc detail refines the persistent world map in place", async ({ page }) => {
  await page.goto("/portals/atlas/");
  const root = page.locator("[data-atlas]");
  const world = page.locator("[data-atlas-map]");
  await world.evaluate((node) => { node.dataset.persistenceProbe = "same-scene"; });
  await page.locator("[data-atlas-area-focus='country.inibholc']").first().click();
  await expect(page).toHaveURL(/\/portals\/atlas\/\?entity=nat\.ini/);
  await expect(world).toHaveAttribute("data-persistence-probe", "same-scene");
  await expect(root).toHaveAttribute("data-atlas-map-id", "world");
  await expect(root).toHaveAttribute("data-atlas-detail-map-count", "13");
  await expect(world).toHaveAttribute("data-detail-active", "true");
  await expect(page.locator("[data-atlas-view-level]")).toHaveText("国家详图");
  await expect(page.locator("[data-atlas-view-region]")).toHaveText("伊琳沃克");
  await expect(page.locator("[data-atlas-selection-leader]")).toBeVisible();
  await expect(page.locator("[data-atlas-selection-link]")).toContainText("查看档案");
  const selectedCard = await page.locator("[data-atlas-selection]").boundingBox();
  const cityLabel = await page.locator(".atlas-city-label").boundingBox();
  const coversCityLabel = selectedCard.x < cityLabel.x + cityLabel.width &&
    selectedCard.x + selectedCard.width > cityLabel.x &&
    selectedCard.y < cityLabel.y + cityLabel.height &&
    selectedCard.y + selectedCard.height > cityLabel.y;
  expect(coversCityLabel).toBe(false);
  await expect(page.locator("[data-atlas-detail-map='nation.inibholc']")).toHaveAttribute("data-detail-visible", "true");
  await expect.poll(async () => Number(await root.getAttribute("data-atlas-detail-visible-tiles"))).toBeGreaterThan(0);
  expect(await page.locator("[data-atlas-map] > .atlas-hex-map .atlas-hex-batch").count()).toBeLessThan(80);
  await expect(page.locator("[data-atlas-map] > .atlas-hex-map .atlas-hex--ocean")).not.toHaveCount(0);
  await expect(page.locator(".atlas-context-canvas")).toHaveCount(0);
  await expect(page.locator("clipPath[id='atlas-shared-border-nation.inibholc'] path"))
    .toHaveAttribute("d", /M .* Z/);
  await expect(page.locator("[data-atlas-detail-map='nation.inibholc'] > .atlas-hex-map .atlas-political-layer"))
    .toHaveAttribute("clip-path", "url(#atlas-shared-border-nation.inibholc)");
  const borderError = await page.locator("[data-atlas]").evaluate((rootNode) => {
    const raw = JSON.parse(rootNode.querySelector("#atlas-map-data").textContent);
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const worldMap = data.maps.find((entry) => entry.id === "world");
    const nationMask = data.tile_masks["nation.inibholc"];
    const areaRows = data.tile_masks.world.area_masks["country.inibholc"].tile_rows;
    const firstRow = areaRows[0];
    const lastRow = areaRows.at(-1);
    const coordinates = [
      { col: firstRow.ranges[0][0], row: firstRow.row },
      { col: lastRow.ranges.at(-1)[1], row: lastRow.row },
    ];
    const radius = worldMap.grid.hex_size - worldMap.grid.gap / 2;
    const padding = worldMap.grid.hex_size * 1.25;
    const clip = rootNode.querySelector('clipPath[id="atlas-shared-border-nation.inibholc"] path');
    const vertices = [...clip.getAttribute("d").matchAll(/M ([\d.-]+) ([\d.-]+)/g)];
    const overlay = rootNode.querySelector('[data-atlas-detail-map="nation.inibholc"]');
    const transform = new DOMMatrix(getComputedStyle(overlay).transform);
    const errors = coordinates.map(({ col, row }, index) => {
      const vertex = vertices[index === 0 ? 0 : vertices.length - 1];
      const projected = transform.transformPoint({ x: Number(vertex[1]), y: Number(vertex[2]) });
      const expectedX = padding + worldMap.grid.hex_size + col * worldMap.grid.hex_size * 1.5 + radius;
      const expectedY = padding + worldMap.grid.hex_size * Math.sqrt(3) / 2 +
        (row + (col % 2 === 0 ? 0 : 0.5)) * worldMap.grid.hex_size * Math.sqrt(3);
      return Math.max(Math.abs(projected.x - expectedX), Math.abs(projected.y - expectedY));
    });
    return Math.max(
      Math.abs(nationMask.alignment.parent_hex_radius - radius / worldMap.grid.hex_size),
      ...errors,
    );
  });
  expect(borderError).toBeLessThan(0.01);
  await expect(page.locator("[data-atlas-detail-map='nation.inibholc'] .atlas-tile-chunk")).not.toHaveCount(0);
  await expect(page.locator(".atlas-area-label--country[data-atlas-area-focus='country.muocils']")).toBeVisible();

  for (let index = 0; index < 5; index += 1) await page.locator("[data-atlas-zoom='out']").click();
  await expect(world).toHaveAttribute("data-detail-active", "false");
  await expect(world).toHaveAttribute("data-persistence-probe", "same-scene");
  await page.goBack();
  await expect(page).toHaveURL(/\/portals\/atlas\/$/);
  await expect(world).toHaveAttribute("data-persistence-probe", "same-scene");
});

test("Cathair refines a provisional urban area without replacing its country", async ({ page }) => {
  await page.goto("/portals/atlas/");
  await expect(page.locator(".site-rail .primary-nav__link", { hasText: "世界地图" }))
    .toHaveAttribute("href", /\/portals\/atlas\/$/);
  const root = page.locator("[data-atlas]");
  const world = page.locator("[data-atlas-map]");
  const mapData = await page.locator("#atlas-map-data").evaluate((node) => {
    const parsed = JSON.parse(node.textContent);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  });
  expect(mapData.tile_masks["city.cathair"].alignment.parent_area_id).toBe("city.cathair.nation");
  expect(mapData.tile_masks["nation.inibholc"].area_masks["city.cathair.nation"].tile_count).toBeGreaterThan(8);
  await world.evaluate((node) => { node.dataset.persistenceProbe = "city-same-scene"; });
  await page.locator("[data-atlas-area-focus='country.inibholc']").first().click();
  const cityLabel = page.locator(".atlas-city-label[data-atlas-city-focus='loc.cathair']");
  await expect(cityLabel).toBeVisible();
  await cityLabel.click();
  await expect(page).toHaveURL(/\/portals\/atlas\/\?loc=loc\.cathair/);
  await expect(world).toHaveAttribute("data-persistence-probe", "city-same-scene");
  await expect(root).toHaveAttribute("data-atlas-city-logical-tiles", "566");
  await expect(page.locator("[data-atlas-detail-map='nation.inibholc']")).toHaveAttribute("data-detail-visible", "true");
  await expect(page.locator("[data-atlas-city-map]")).toHaveAttribute("data-detail-visible", "true");
  await expect(page.locator("[data-atlas-view-level]")).toHaveText("城区");
  await expect(page.locator("[data-atlas-view-region]")).toHaveText("卡夏·欧尔莱特");
  await expect(page.locator("[data-atlas-selection-leader]")).toBeVisible();
  await expect.poll(async () => Number(await root.getAttribute("data-atlas-city-visible-tiles"))).toBeGreaterThan(100);
  await expect(page.locator("[data-atlas-city-map] .atlas-hex[data-city='city.cathair']"))
    .not.toHaveCount(0);
  await expect(page.locator("clipPath#atlas-shared-border-city\\.cathair path")).toHaveAttribute("d", /M .* Z/);
  await expect(page.locator("[data-atlas-city-map] > .atlas-hex-map .atlas-political-layer"))
    .toHaveAttribute("clip-path", "url(#atlas-shared-border-city.cathair)");
  await page.locator("[data-atlas-preset-toggle]").click();
  await expect(page.locator("[data-atlas-map] > .atlas-hex-map .atlas-terrain-relief"))
    .toHaveCSS("display", "none");
  await expect(page.locator("[data-atlas-detail-map='nation.inibholc'] > .atlas-hex-map .atlas-terrain-relief"))
    .toHaveCSS("display", "none");
  await expect(page.locator("[data-atlas-city-map] > .atlas-hex-map .atlas-terrain-relief"))
    .not.toHaveCSS("display", "none");
  expect(await page.locator("[data-atlas-map] > .atlas-hex-map .atlas-hex-batch").count()).toBeLessThan(80);
  await expect(page.locator("[data-atlas-selection-status]")).toContainText("暂定范围");

  for (let index = 0; index < 8 && await page.locator("[data-atlas-city-map]").getAttribute("data-detail-visible") === "true"; index += 1) {
    await page.locator("[data-atlas-zoom='out']").click();
  }
  await expect(page.locator("[data-atlas-city-map]")).toHaveAttribute("data-detail-visible", "false");
  await expect(page.locator("[data-atlas-detail-map='nation.inibholc']")).toHaveAttribute("data-detail-visible", "true");
  await expect(page.locator("[data-atlas-view-level]")).toHaveText("国家详图");
  await page.goto("/portals/atlas/?loc=loc.cathair");
  await expect(page.locator("[data-atlas-city-map]")).toHaveAttribute("data-detail-visible", "true");
});

test("atlas labels follow exclusive overview, region, and detail bands without white boxes", async ({ page }) => {
  const reachBand = async (band, direction) => {
    const map = page.locator("[data-atlas-map]");
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (await map.getAttribute("data-zoom-band") === band) return;
      await page.locator(`[data-atlas-zoom='${direction}']`).click();
    }
    expect(await map.getAttribute("data-zoom-band")).toBe(band);
  };

  await page.goto("/portals/atlas/");
  await reachBand("overview", "out");
  await expect(page.locator(".atlas-area-label--continent").first()).toBeVisible();
  await expect(page.locator(".atlas-context-label--ocean")).toBeVisible();
  await expect(page.locator(".atlas-area-label--country").first()).toBeHidden();
  await expect(page.locator("[data-atlas-marker]")).toBeHidden();

  await reachBand("region", "in");
  await expect(page.locator(".atlas-area-label--country").first()).toBeVisible();
  await expect(page.locator(".atlas-area-label--continent").first()).toBeHidden();
  await expect(page.locator(".atlas-context-label--ocean")).toBeHidden();
  const labelAppearance = await page.locator(".atlas-area-label--country").first().evaluate((label) => ({
    background: getComputedStyle(label).backgroundColor,
    border: getComputedStyle(label).borderTopWidth,
  }));
  expect(labelAppearance).toEqual({ background: "rgba(0, 0, 0, 0)", border: "0px" });

  await reachBand("detail", "in");
  await expect(page.locator(".atlas-area-label--country").first()).toBeVisible();
  await expect(page.locator("[data-atlas-marker]")).toBeVisible();

  await page.goto("/portals/atlas/inibholc/");
  await expect(page).toHaveURL(/\/portals\/atlas\/\?entity=nat\.ini/);
});

test("world countries show icon when available, then Chinese and foreign names", async ({ page }) => {
  await page.goto("/portals/atlas/");
  const countries = [
    ["crushmora", "卡什莫兰", "Crushmora", "crushmora.svg"],
    ["tarusar", "塔罗萨尔", "𒋫𒊒𒊬", "tarusar.svg"],
    ["esael", "埃萨勒", "ऐशाल", "elsae.svg"],
    ["inibholc", "伊琳沃克", "Inibholc", "inibholc.svg"],
    ["muocils", "莫尔索斯", "Муоцилс", "muocils.svg"],
    ["dunossai", "德诺尼塞", "Dunossai", "dunossai.svg"],
    ["havfrentyr", "赫芙伦特", "Havfrentyr", "havfrentyr.svg"],
    ["khaos", "卡俄斯", "ΧΑΟΣ", "khaos.svg"],
    ["sivlanzio", "斯兰缇亚", "Sivlanzio", "sivlanzio.svg"],
    ["sirena", "塞壬", "Sírena", "sirena.svg"],
    ["amaterasu", "天照", "天照", "amaturasu.svg"],
    ["yin", "殷", "殷", "yin.svg"],
    ["yuraqqasa", "尤拉卡萨", "Yuraqq'asa", "yuraqqasa.svg"],
  ];
  await expect(page.locator(".atlas-country-label__icon img")).toHaveCount(13);
  for (const [id, chinese, foreign, icon] of countries) {
    const label = page.locator(`.atlas-country-label[data-atlas-area-focus='country.${id}']`);
    await expect(label).toHaveCSS("flex-direction", "column");
    await expect(label.locator(".atlas-country-label__chinese")).toHaveText(chinese);
    await expect(label.locator(".atlas-country-label__foreign")).toHaveText(foreign);
    await expect(label.locator(".atlas-country-label__foreign")).toHaveCSS("text-transform", "none");
    if (icon) {
      await expect(label.locator(".atlas-country-label__icon img")).toHaveAttribute("src", new RegExp(`/${icon}$`));
      await expect(label.locator(".atlas-country-label__icon img")).toHaveAttribute("loading", "lazy");
    } else {
      await expect(label.locator(".atlas-country-label__icon")).toHaveCount(0);
    }
    const order = await label.locator(":scope > span").evaluateAll((nodes) => nodes.map((node) => node.className));
    expect(order).toEqual(icon
      ? ["atlas-country-label__icon", "atlas-country-label__chinese", "atlas-country-label__foreign"]
      : ["atlas-country-label__chinese", "atlas-country-label__foreign"]);
  }
});

test("atlas detail tracks the viewed region instead of zoom alone", async ({ page }) => {
  await page.goto("/portals/atlas/");
  const stage = page.locator("[data-atlas-stage]");
  const detail = page.locator("[data-atlas-detail-map='nation.inibholc']");
  await page.locator("[data-atlas-area-item] [data-atlas-area-focus='country.inibholc']").click();
  // Let each camera flight finish before checking the region or manually zooming.
  await expect(stage).not.toHaveAttribute("data-atlas-interacting", "true");
  await expect(detail).toHaveAttribute("data-detail-visible", "true");
  await page.locator("[data-atlas-area-item] [data-atlas-area-focus='country.sirena']").click();
  await expect(stage).not.toHaveAttribute("data-atlas-interacting", "true");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const zoom = Number((await page.locator("[data-atlas-zoom-readout]").textContent()).replace("%", ""));
    if (zoom >= 75) break;
    await page.locator("[data-atlas-zoom='in']").click();
  }
  await expect(detail).toHaveAttribute("data-detail-visible", "false");
  await expect(page.locator("[data-atlas-detail-map='nation.sirena']")).toHaveAttribute("data-detail-visible", "true");
  await expect(page.locator("[data-atlas-view-region]")).toHaveText("塞壬");
});

test("all current countries have an aligned same-scene national layer", async ({ page }) => {
  await page.goto("/portals/atlas/");
  const ids = ["crushmora", "tarusar", "esael", "inibholc", "muocils", "dunossai",
    "havfrentyr", "khaos", "sivlanzio", "sirena", "amaterasu", "yin", "yuraqqasa"];
  const root = page.locator("[data-atlas]");
  const data = await page.locator("#atlas-map-data").evaluate((node) => {
    const parsed = JSON.parse(node.textContent);
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  });
  expect(data.areas.some((area) => area.id === "special.ring-void")).toBe(false);
  await expect(page.getByText("环形空洞")).toHaveCount(0);
  for (const id of ids) {
    const mapId = `nation.${id}`;
    const areaId = `country.${id}`;
    const nation = page.locator(`[data-atlas-detail-map='${mapId}']`);
    expect(data.tile_masks[mapId].alignment.parent_area_id).toBe(areaId);
    await expect(page.locator(`clipPath[id='atlas-shared-border-${mapId}'] path`)).toHaveAttribute("d", /M .* Z/);
    await page.locator(`[data-atlas-area-item] [data-atlas-area-focus='${areaId}']`).click();
    await expect(nation).toHaveAttribute("data-detail-visible", "true");
    await expect(root).toHaveAttribute("data-atlas-map-id", "world");
  }
});

test("atlas wheel zoom keeps the map point under the pointer", async ({ page }) => {
  await page.goto("/portals/atlas/");
  await page.locator("[data-atlas-stage]").scrollIntoViewIfNeeded();
  const stage = await page.locator("[data-atlas-stage]").boundingBox();
  const pointer = { x: stage.x + stage.width * 0.6, y: stage.y + stage.height * 0.55 };
  const pointUnderPointer = () => page.locator("[data-atlas-map]").evaluate((map, { x, y }) => {
    const bounds = map.getBoundingClientRect();
    return { x: (x - bounds.left) / bounds.width, y: (y - bounds.top) / bounds.height };
  }, pointer);
  const before = await pointUnderPointer();
  const readout = page.locator("[data-atlas-zoom-readout]");
  const initialZoom = Number((await readout.textContent()).replace("%", ""));
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => Number((await readout.textContent()).replace("%", "")))
    .toBeGreaterThan(initialZoom);
  const after = await pointUnderPointer();
  expect(Math.abs(after.x - before.x)).toBeLessThan(0.0005);
  expect(Math.abs(after.y - before.y)).toBeLessThan(0.0005);
});

test("atlas refits untouched views on resize but preserves a manually chosen zoom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/portals/atlas/");
  await expect(page.locator("[data-atlas]")).toHaveAttribute("data-atlas-logical-tiles", "8160");
  const zoom = page.locator("[data-atlas-zoom-readout]");
  const narrow = Number((await zoom.textContent()).replace("%", ""));
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(async () => Number((await zoom.textContent()).replace("%", ""))).toBeGreaterThan(narrow);
  await page.locator("[data-atlas-zoom='in']").click();
  const manuallyChosen = await zoom.textContent();
  await page.setViewportSize({ width: 1080, height: 900 });
  await expect(zoom).toHaveText(manuallyChosen);
});

test("atlas disables decorative transitions for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/portals/atlas/");
  const transitionDuration = await page.locator(".atlas-hex").first().evaluate((tile) => (
    getComputedStyle(tile).transitionDuration
  ));
  expect(parseFloat(transitionDuration)).toBeLessThan(0.001);
});

test("atlas assets are only loaded by the atlas page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("script[src*='/js/atlas.']")).toHaveCount(0);
  await expect(page.locator("link[href*='/atlas.min.']")).toHaveCount(0);

  await page.goto("/portals/atlas/");
  await expect(page.locator("script[src*='/js/atlas.']")).toHaveCount(1);
  await expect(page.locator("link[href*='/atlas.min.']")).toHaveCount(1);
});

test("atlas has no serious automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/portals/atlas/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(accessibilityViolationSummary(results.violations)).toEqual([]);
});

test("home page has no serious automated accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  expect(accessibilityViolationSummary(results.violations)).toEqual([]);
});
