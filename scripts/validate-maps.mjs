import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { walkMarkdown } from "./lib/files.mjs";

const root = process.cwd();
const errors = [];
const stableIdPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const locationKinds = new Set(["capital", "city", "region", "ruin", "landmark"]);
const areaLayers = new Set(["continent", "country", "special", "city"]);
const areaStyles = new Set([
  "country-crushmora",
  "country-tarusar",
  "country-esael",
  "country-inibholc",
  "country-muocils",
  "country-dunossai",
  "country-havfrentyr",
  "country-khaos",
  "country-sivlanzio",
  "country-sirena",
  "country-amaterasu",
  "country-yin",
  "country-yuraqqasa",
  "unexplored",
  "urban-cathair",
]);
const politicalStatuses = new Set(["active", "unruled"]);
const detailStatuses = new Set(["available", "awaiting-source"]);
const areaTargets = new Set(["land", "ocean", "any"]);
const tileSources = new Set(["generated"]);
const palettes = new Set(["monochrome", "political-pastel"]);
const reliefModes = new Set(["none", "subtle"]);
const materials = new Set(["none", "paper"]);
const mapLevels = new Set([0, 1, 2]);
const readYaml = async (relativePath) => parseYaml(await readFile(path.join(root, relativePath), "utf8")) ?? {};

function expandLandRows(mask, maskId) {
  const tiles = new Set();
  const { columns, rows } = mask?.grid ?? {};
  if (!Array.isArray(mask?.land_rows)) {
    errors.push(`masks.${maskId}: land_rows must be an array.`);
    return tiles;
  }
  for (const entry of mask.land_rows) {
    if (!Number.isInteger(entry.row) || entry.row < 0 || entry.row >= rows || !Array.isArray(entry.ranges)) {
      errors.push(`masks.${maskId}: every land row must identify a valid row and ranges array.`);
      continue;
    }
    for (const range of entry.ranges) {
      if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isInteger) || range[0] < 0 || range[1] < range[0] || range[1] >= columns) {
        errors.push(`masks.${maskId}: row ${entry.row} contains an invalid column range.`);
        continue;
      }
      for (let col = range[0]; col <= range[1]; col += 1) {
        const key = `${col}:${entry.row}`;
        if (tiles.has(key)) errors.push(`masks.${maskId}: tile ${key} is declared more than once.`);
        tiles.add(key);
      }
    }
  }
  return tiles;
}

function pointInPolygon(col, row, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [currentCol, currentRow] = points[index];
    const [previousCol, previousRow] = points[previous];
    const crossesRow = (currentRow > row) !== (previousRow > row);
    const edgeCol = ((previousCol - currentCol) * (row - currentRow)) /
      (previousRow - currentRow || Number.EPSILON) + currentCol;
    if (crossesRow && col < edgeCol) inside = !inside;
  }
  return inside;
}

function areaContains(area, col, row) {
  return (area.polygons ?? []).some((polygon) => pointInPolygon(col, row, polygon));
}

function neighborCoordinates(col, row) {
  const verticalOffset = col % 2 === 0 ? -1 : 1;
  return [
    [col - 1, row + Math.min(verticalOffset, 0)],
    [col - 1, row + Math.max(verticalOffset, 0)],
    [col + 1, row + Math.min(verticalOffset, 0)],
    [col + 1, row + Math.max(verticalOffset, 0)],
    [col, row - 1],
    [col, row + 1],
  ];
}

const [layers, locations, tiles, areaData, topologyData, featureData] = await Promise.all([
  readYaml("data/maps/layers.yaml"),
  readYaml("data/maps/locations.yaml"),
  readYaml("data/maps/tiles.yaml"),
  readYaml("data/maps/areas.yaml"),
  readYaml("data/maps/topology.yaml"),
  readYaml("data/maps/features.yaml"),
]);
const mapList = Array.isArray(layers.maps) ? layers.maps : [];
const locationList = Array.isArray(locations.locations) ? locations.locations : [];
const masks = tiles.masks && typeof tiles.masks === "object" ? tiles.masks : {};
const areaList = Array.isArray(areaData.areas) ? areaData.areas : [];
const topologyRelations = Array.isArray(topologyData.relations) ? topologyData.relations : [];
const featureMaps = featureData.maps ?? {};
const maskTiles = new Map();
const generatedAreaTiles = new Map();
for (const [maskId, mask] of Object.entries(masks)) {
  if (!stableIdPattern.test(maskId)) errors.push(`masks.${maskId}: id must use lowercase stable-ID characters.`);
  const { columns, rows, orientation } = mask.grid ?? {};
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    errors.push(`masks.${maskId}: grid columns and rows must be positive integers.`);
  }
  if (orientation !== "flat") errors.push(`masks.${maskId}: orientation must be "flat".`);
  const expanded = expandLandRows(mask, maskId);
  if (expanded.size === 0) errors.push(`masks.${maskId}: at least one land tile is required.`);
  if (Number.isInteger(mask.land_tile_count) && mask.land_tile_count !== expanded.size) {
    errors.push(`masks.${maskId}: land_tile_count does not match generated ranges.`);
  }
  maskTiles.set(maskId, expanded);
  for (const [areaId, areaMask] of Object.entries(mask.area_masks ?? {})) {
    if (!stableIdPattern.test(areaId)) errors.push(`masks.${maskId}.area_masks.${areaId}: id must use lowercase stable-ID characters.`);
    const areaTiles = expandLandRows({ grid: mask.grid, land_rows: areaMask.tile_rows }, `${maskId}.area_masks.${areaId}`);
    if (Number.isInteger(areaMask.tile_count) && areaMask.tile_count !== areaTiles.size) {
      errors.push(`masks.${maskId}.area_masks.${areaId}: tile_count does not match generated ranges.`);
    }
    for (const key of areaTiles) {
      if (!expanded.has(key)) errors.push(`masks.${maskId}.area_masks.${areaId}: tile ${key} is outside the land mask.`);
    }
    generatedAreaTiles.set(`${maskId}:${areaId}`, areaTiles);
  }
}

function areaMatchesTile(area, map, col, row) {
  const generated = generatedAreaTiles.get(`${map.mask_id}:${area.id}`);
  return generated ? generated.has(`${col}:${row}`) : areaContains(area, col, row);
}
const mapIds = new Set();
const areaAssignments = new Map();
for (const map of mapList) {
  if (!map.id || mapIds.has(map.id)) errors.push(`maps: duplicate or missing map id "${map.id ?? ""}".`);
  if (map.id && !stableIdPattern.test(map.id)) errors.push(`maps.${map.id}: id must use lowercase stable-ID characters.`);
  mapIds.add(map.id);
  if (map.type !== "hex") errors.push(`maps.${map.id}: current renderer only supports type "hex".`);
  if (!mapLevels.has(map.level)) errors.push(`maps.${map.id}: level must be 0, 1, or 2.`);
  if (typeof map.wrap_x !== "boolean") errors.push(`maps.${map.id}: wrap_x must be explicitly true or false.`);
  if (typeof map.page_ref !== "string" || !map.page_ref.trim()) errors.push(`maps.${map.id}: page_ref is required.`);
  if (!map.mask_id || !masks[map.mask_id]) errors.push(`maps.${map.id}: mask_id must reference a generated tile mask.`);
  const { columns, rows, hex_size: hexSize, gap, orientation } = map.grid ?? {};
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    errors.push(`maps.${map.id}: grid columns and rows must be positive integers.`);
  } else if (columns * rows > 10000 && map.land_only !== true) {
    errors.push(`maps.${map.id}: grid exceeds the 10,000-tile logical budget.`);
  }
  if (map.land_only === true) {
    if (map.wrap_x) errors.push(`maps.${map.id}: land-only detail maps cannot wrap horizontally.`);
    if (!Number.isInteger(map.chunk_size) || map.chunk_size < 4 || map.chunk_size > 32) {
      errors.push(`maps.${map.id}: land-only maps need a chunk_size between 4 and 32.`);
    }
    const target = map.target_land_tiles;
    const landCount = maskTiles.get(map.mask_id)?.size ?? 0;
    if (!Array.isArray(target) || target.length !== 2 || !target.every(Number.isInteger) || target[0] < 1 || target[1] < target[0]) {
      errors.push(`maps.${map.id}: target_land_tiles must be [minimum, maximum].`);
    } else if (landCount < target[0] || landCount > target[1]) {
      errors.push(`maps.${map.id}: ${landCount} land tiles falls outside target ${target[0]}–${target[1]}.`);
    }
  }
  if (!Number.isFinite(hexSize) || hexSize < 12 || hexSize > 64) {
    errors.push(`maps.${map.id}: hex_size must be between 12 and 64.`);
  }
  if (!Number.isFinite(gap) || gap < 0 || gap >= hexSize) {
    errors.push(`maps.${map.id}: gap must be non-negative and smaller than hex_size.`);
  }
  if (orientation !== "flat") errors.push(`maps.${map.id}: orientation must currently be "flat".`);
  if (map.wrap_x === true && Number.isInteger(columns) && columns % 2 !== 0) {
    errors.push(`maps.${map.id}: odd-q horizontal wrapping requires an even column count.`);
  }
  const minZoom = Number(map.min_zoom);
  const maxZoom = Number(map.max_zoom);
  const defaultZoom = Number(map.default_zoom);
  if (!(minZoom > 0 && maxZoom >= minZoom && defaultZoom >= minZoom && defaultZoom <= maxZoom)) {
    errors.push(`maps.${map.id}: zoom values must satisfy 0 < min_zoom <= default_zoom <= max_zoom.`);
  }
  if (map.default_center) {
    const { col, row } = map.default_center;
    if (!Number.isFinite(col) || !Number.isFinite(row) || col < 0 || row < 0 || col >= columns || row >= rows) {
      errors.push(`maps.${map.id}: default_center must be inside the map bounds.`);
    }
  }
  if (!palettes.has(map.appearance?.palette)) errors.push(`maps.${map.id}: unsupported appearance palette.`);
  if (!reliefModes.has(map.appearance?.relief)) errors.push(`maps.${map.id}: unsupported relief mode.`);
  if (!materials.has(map.appearance?.material)) errors.push(`maps.${map.id}: unsupported material.`);
  const mask = masks[map.mask_id];
  if (mask && (mask.grid?.columns !== columns || mask.grid?.rows !== rows)) {
    errors.push(`maps.${map.id}: grid must match mask ${map.mask_id}.`);
  }
}

const featureCategories = ["administrative_regions", "terrain", "waterways", "routes", "settlements"];
for (const [mapId, features] of Object.entries(featureMaps)) {
  if (!mapIds.has(mapId)) errors.push(`features.${mapId}: map_id does not exist.`);
  for (const category of featureCategories) {
    if (!Array.isArray(features?.[category])) errors.push(`features.${mapId}.${category}: must be an array.`);
  }
  for (const category of Object.keys(features ?? {})) {
    if (!featureCategories.includes(category)) errors.push(`features.${mapId}.${category}: unknown feature category.`);
  }
}
for (const map of mapList.filter((item) => item.land_only)) {
  if (!featureMaps[map.id]) errors.push(`features.${map.id}: land-only map requires an explicit feature interface.`);
}


for (const map of mapList) {
  if (map.level === 0 && map.parent_map_id) errors.push(`maps.${map.id}: a level-0 map cannot have parent_map_id.`);
  if (map.level > 0) {
    const parent = mapList.find((candidate) => candidate.id === map.parent_map_id);
    if (!parent) errors.push(`maps.${map.id}: level-${map.level} maps must reference an existing parent_map_id.`);
    else if (parent.level !== map.level - 1) errors.push(`maps.${map.id}: parent map must be exactly one level above it.`);
    if (map.level === 1 && parent) {
      const alignment = masks[map.mask_id]?.alignment;
      const parentArea = areaList.find((area) => area.detail_map_id === map.id && area.map_id === parent.id);
      const detailArea = areaList.find((area) => area.map_id === map.id && area.layer === "country");
      if (!alignment || !parentArea || !detailArea ||
        alignment.parent_mask_id !== parent.mask_id || alignment.parent_area_id !== parentArea.id ||
        alignment.parent_source_sha256 !== masks[parent.mask_id]?.source_sha256 ||
        !Array.isArray(alignment.transform) || alignment.transform.length !== 4 ||
        !alignment.transform.every(Number.isFinite) || alignment.transform[0] <= 0 || alignment.transform[1] <= 0 ||
        !masks[map.mask_id]?.area_masks?.[detailArea.id]?.tile_count) {
        errors.push(`maps.${map.id}: national mask must share the current parent political footprint.`);
      }
      if (masks[map.mask_id]?.classification?.method === "parent-political-mask" &&
        masks[map.mask_id]?.classification?.status !== "provisional") {
        errors.push(`maps.${map.id}: a parent-derived national extent must be marked provisional.`);
      }
    }
    if (map.level === 2 && parent) {
      const alignment = masks[map.mask_id]?.alignment;
      const parentLocation = locationList.find((location) => location.id === alignment?.parent_location_id);
      const parentArea = areaList.find((area) => area.id === alignment?.parent_area_id);
      if (!alignment || alignment.parent_mask_id !== parent.mask_id ||
        alignment.parent_source_sha256 !== masks[parent.mask_id]?.source_sha256 ||
        !Array.isArray(alignment.transform) || alignment.transform.length !== 4 ||
        !alignment.transform.every(Number.isFinite) || alignment.transform[0] <= 0 || alignment.transform[1] <= 0 ||
        !parentLocation || parentLocation.map_id !== parent.id || parentLocation.detail_map_id !== map.id ||
        !parentArea || parentArea.map_id !== parent.id || parentArea.layer !== "city" ||
        parentArea.entity_id !== map.parent_entity_id ||
        !masks[parent.mask_id]?.area_masks?.[parentArea.id]?.tile_count) {
        errors.push(`maps.${map.id}: city mask must align to a registered parent-map location and current parent source.`);
      }
      if (masks[map.mask_id]?.classification?.status !== "provisional") {
        errors.push(`maps.${map.id}: schematic urban extent must be explicitly provisional.`);
      }
      const center = masks[map.mask_id]?.classification?.center_parent;
      if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) ||
        !parentLocation || Math.abs(center[0] - parentLocation.col) > 1 ||
        Math.abs(center[1] - parentLocation.row) > 1) {
        errors.push(`maps.${map.id}: schematic urban center must stay within one parent tile of its location marker.`);
      }
    }
  }
}

const entityIds = new Set();
for (const filePath of await walkMarkdown(path.join(root, "content"))) {
  const source = await readFile(filePath, "utf8");
  const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/);
  const parsed = match ? parseYaml(match[1]) : null;
  if (parsed?.params?.id && parsed.draft !== true) entityIds.add(String(parsed.params.id));
}


const areaIds = new Set();
for (const area of areaList) {
  if (!area.id || areaIds.has(area.id)) errors.push(`areas: duplicate or missing area id "${area.id ?? ""}".`);
  if (area.id && !stableIdPattern.test(area.id)) errors.push(`areas.${area.id}: id must use lowercase stable-ID characters.`);
  areaIds.add(area.id);
  if (!areaLayers.has(area.layer)) errors.push(`areas.${area.id}: layer "${area.layer ?? ""}" is not registered.`);
  if (!mapIds.has(area.map_id)) errors.push(`areas.${area.id}: map_id "${area.map_id ?? ""}" does not exist.`);
  if (typeof area.label !== "string" || !area.label.trim()) errors.push(`areas.${area.id}: label is required.`);
  if (area.map_id === "world" && area.layer === "country" &&
    (typeof area.foreign_label !== "string" || !area.foreign_label.trim())) {
    errors.push(`areas.${area.id}: world country requires a foreign_label.`);
  }
  if (area.icon_ref !== undefined) {
    if (area.map_id !== "world" || area.layer !== "country" ||
      typeof area.icon_ref !== "string" || !/^[a-z0-9-]+\.svg$/.test(area.icon_ref)) {
      errors.push(`areas.${area.id}: icon_ref must be a root-level SVG filename on a world country.`);
    } else {
      try {
        const icon = await stat(path.join(root, "static", area.icon_ref));
        if (!icon.isFile() || icon.size === 0) errors.push(`areas.${area.id}: icon_ref must reference a non-empty SVG file.`);
      } catch {
        errors.push(`areas.${area.id}: icon_ref ${area.icon_ref} does not exist in static/.`);
      }
    }
  }
  if (area.entity_id && !entityIds.has(area.entity_id)) errors.push(`areas.${area.id}: entity_id "${area.entity_id}" does not exist.`);
  if ((area.layer === "continent" || area.layer === "country") && !area.entity_id) {
    errors.push(`areas.${area.id}: ${area.layer} areas must reference an entity_id.`);
  }
  if (area.style_token && !areaStyles.has(area.style_token)) errors.push(`areas.${area.id}: style_token "${area.style_token}" is not registered.`);
  if (area.political_status && !politicalStatuses.has(area.political_status)) errors.push(`areas.${area.id}: political_status is not registered.`);
  if (area.detail_status && !detailStatuses.has(area.detail_status)) errors.push(`areas.${area.id}: detail_status is not registered.`);
  if (area.detail_status === "available" && !mapIds.has(area.detail_map_id)) {
    errors.push(`areas.${area.id}: available detail maps must reference an existing detail_map_id.`);
  }
  if (area.detail_status === "available") {
    const detail = mapList.find((item) => item.id === area.detail_map_id);
    if (detail && (detail.parent_map_id !== area.map_id || detail.parent_entity_id !== area.entity_id)) {
      errors.push(`areas.${area.id}: detail map must name this area’s map and entity as its parent.`);
    }
  }
  if (area.detail_map_id && !mapIds.has(area.detail_map_id)) errors.push(`areas.${area.id}: detail_map_id does not exist.`);
  if (area.detail_status === "awaiting-source" && area.detail_map_id) {
    errors.push(`areas.${area.id}: awaiting-source areas cannot expose a detail_map_id.`);
  }
  if (area.applies_to && !areaTargets.has(area.applies_to)) errors.push(`areas.${area.id}: applies_to is not registered.`);
  if (area.tile_source && !tileSources.has(area.tile_source)) errors.push(`areas.${area.id}: tile_source is not registered.`);
  if (area.priority !== undefined && !Number.isFinite(area.priority)) errors.push(`areas.${area.id}: priority must be a number.`);
  if (area.wrap_x !== undefined && typeof area.wrap_x !== "boolean") errors.push(`areas.${area.id}: wrap_x must be a boolean.`);

  const map = mapList.find((item) => item.id === area.map_id);
  const { columns, rows } = map?.grid ?? {};
  if (!Array.isArray(area.label_anchor) || area.label_anchor.length !== 2 || !area.label_anchor.every(Number.isInteger)) {
    errors.push(`areas.${area.id}: label_anchor must contain integer col and row values.`);
  } else if (map && (area.label_anchor[0] < 0 || area.label_anchor[0] >= columns || area.label_anchor[1] < 0 || area.label_anchor[1] >= rows)) {
    errors.push(`areas.${area.id}: label_anchor must be inside map ${area.map_id}.`);
  }
  if (area.tile_source === "generated" && map && !generatedAreaTiles.has(`${map.mask_id}:${area.id}`)) {
    errors.push(`areas.${area.id}: generated tile source is missing from mask ${map.mask_id}.`);
  }
  if (area.tile_source !== "generated" && (!Array.isArray(area.polygons) || area.polygons.length === 0)) {
    errors.push(`areas.${area.id}: at least one polygon is required.`);
    continue;
  }
  for (const polygon of area.polygons ?? []) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      errors.push(`areas.${area.id}: every polygon requires at least three points.`);
      continue;
    }
    for (const point of polygon) {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
        errors.push(`areas.${area.id}: polygon points must be numeric [col, row] pairs.`);
      } else if (map && (point[0] < 0 || point[0] > columns || point[1] < 0 || point[1] > rows)) {
        errors.push(`areas.${area.id}: polygon points must remain within map edges.`);
      }
    }
  }

  if (map && Array.isArray(area.label_anchor) && area.label_anchor.length === 2) {
    const [anchorCol, anchorRow] = area.label_anchor;
    if (!areaMatchesTile(area, map, anchorCol, anchorRow)) errors.push(`areas.${area.id}: label_anchor must fall inside its generated mask or polygons.`);
    const anchorIsLand = maskTiles.get(map.mask_id)?.has(`${anchorCol}:${anchorRow}`) ?? false;
    const target = area.applies_to ?? "land";
    if (target === "land" && !anchorIsLand) errors.push(`areas.${area.id}: land label_anchor must be placed on a land tile.`);
    if (target === "ocean" && anchorIsLand) errors.push(`areas.${area.id}: ocean label_anchor must be placed on an ocean tile.`);
  }
}

for (const map of mapList) {
  const context = map.context;
  if (!context) continue;
  if (!map.parent_map_id || context.map_id !== map.parent_map_id) {
    errors.push(`maps.${map.id}.context: context map must be the immediate parent.`);
  }
  const focus = areaList.find((area) => area.id === context.focus_area_id);
  if (!focus || focus.map_id !== context.map_id || focus.entity_id !== map.parent_entity_id) {
    errors.push(`maps.${map.id}.context: focus_area_id must be its parent entity on the context map.`);
  }
  const parentMap = mapList.find((item) => item.id === context.map_id);
  const alignment = masks[map.mask_id]?.alignment;
  if (!parentMap || !alignment || alignment.parent_mask_id !== parentMap.mask_id ||
    alignment.parent_area_id !== context.focus_area_id ||
    alignment.parent_source_sha256 !== masks[parentMap.mask_id]?.source_sha256 ||
    !Array.isArray(alignment.transform) || alignment.transform.length !== 4 ||
    !alignment.transform.every(Number.isFinite) || alignment.transform[0] <= 0 || alignment.transform[1] <= 0) {
    errors.push(`maps.${map.id}.context: generated detail border must align with the current parent mask and focus area.`);
  }
  if (!Array.isArray(context.labels) || context.labels.length > 12) {
    errors.push(`maps.${map.id}.context: labels must be an array of at most 12 items.`);
    continue;
  }
  for (const label of context.labels) {
    const area = label.area_id ? areaList.find((item) => item.id === label.area_id) : undefined;
    if (label.area_id && (!area || area.map_id !== context.map_id)) {
      errors.push(`maps.${map.id}.context: label area_id must belong to the parent map.`);
    }
    if (!label.area_id && (typeof label.label !== "string" || !label.label.trim())) {
      errors.push(`maps.${map.id}.context: a text label needs non-empty label.`);
    }
    if (!Array.isArray(label.position) || label.position.length !== 2 ||
      !label.position.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      errors.push(`maps.${map.id}.context: label position must be normalized [x, y].`);
    }
    if (!["overview", "region", "detail"].includes(label.tier)) {
      errors.push(`maps.${map.id}.context: label tier is invalid.`);
    }
  }
}

for (const map of mapList) {
  const landTiles = maskTiles.get(map.mask_id) ?? new Set();
  const mapAreas = areaList.filter((area) => area.map_id === map.id);
  if (map.level > 0 && (!map.parent_entity_id || !entityIds.has(map.parent_entity_id))) {
    errors.push(`maps.${map.id}: parent_entity_id must reference an existing entity.`);
  }
  if (map.land_only) {
    const expectedLayer = map.level === 2 ? "city" : "country";
    const footprintAreas = mapAreas.filter((area) => area.layer === expectedLayer);
    if (footprintAreas.length !== 1 || footprintAreas[0]?.entity_id !== map.parent_entity_id) {
      errors.push(`maps.${map.id}: land-only map must contain exactly one parent ${expectedLayer} area.`);
    }
    const covered = generatedAreaTiles.get(`${map.mask_id}:${footprintAreas[0]?.id}`) ?? new Set();
    if (covered.size !== landTiles.size || [...landTiles].some((key) => !covered.has(key))) {
      errors.push(`maps.${map.id}: every land tile must belong to its parent ${expectedLayer} area.`);
    }
  }
  for (const area of mapAreas) {
    const target = area.applies_to ?? "land";
    let matchingTiles = 0;
    for (let col = 0; col < map.grid.columns; col += 1) {
      for (let row = 0; row < map.grid.rows; row += 1) {
        const isLand = landTiles.has(`${col}:${row}`);
        if ((target === "land" && !isLand) || (target === "ocean" && isLand)) continue;
        if (areaMatchesTile(area, map, col, row)) matchingTiles += 1;
      }
    }
    if (matchingTiles === 0) errors.push(`areas.${area.id}: polygon does not cover any ${target} tiles.`);
  }

  const countries = mapAreas.filter((area) => area.layer === "country");
  const assignedCounts = new Map(countries.map((area) => [area.id, 0]));
  const assignments = new Map();
  for (const key of landTiles) {
    const [col, row] = key.split(":").map(Number);
    const winner = countries
      .filter((area) => areaMatchesTile(area, map, col, row))
      .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0))[0];
    if (winner) {
      assignments.set(key, winner.id);
      assignedCounts.set(winner.id, (assignedCounts.get(winner.id) ?? 0) + 1);
    }
  }
  areaAssignments.set(map.id, assignments);
  for (const [areaId, count] of assignedCounts) {
    if (count === 0) errors.push(`areas.${areaId}: country loses every tile after priority resolution.`);
  }
}

const topologyIds = new Set();
for (const relation of topologyRelations) {
  if (!relation.id || topologyIds.has(relation.id)) errors.push(`topology: duplicate or missing relation id "${relation.id ?? ""}".`);
  if (relation.id && !stableIdPattern.test(relation.id)) errors.push(`topology.${relation.id}: id must use lowercase stable-ID characters.`);
  topologyIds.add(relation.id);
  const map = mapList.find((item) => item.id === relation.map_id);
  if (!map) {
    errors.push(`topology.${relation.id}: map_id "${relation.map_id ?? ""}" does not exist.`);
    continue;
  }
  if (!Array.isArray(relation.areas) || relation.areas.length !== 2 || relation.areas.some((areaId) => !areaIds.has(areaId))) {
    errors.push(`topology.${relation.id}: areas must reference exactly two existing areas.`);
    continue;
  }
  const [leftArea, rightArea] = relation.areas;
  const assignments = areaAssignments.get(map.id) ?? new Map();
  const landTiles = maskTiles.get(map.mask_id) ?? new Set();
  let landBorderEdges = 0;
  let sharedWaterTiles = 0;
  for (const [key, areaId] of assignments) {
    if (areaId !== leftArea) continue;
    const [col, row] = key.split(":").map(Number);
    for (const [neighborCol, neighborRow] of neighborCoordinates(col, row)) {
      if (assignments.get(`${neighborCol}:${neighborRow}`) === rightArea) landBorderEdges += 1;
    }
  }
  for (let col = 0; col < map.grid.columns; col += 1) {
    for (let row = 0; row < map.grid.rows; row += 1) {
      if (landTiles.has(`${col}:${row}`)) continue;
      const touchingAreas = new Set(neighborCoordinates(col, row).map(([neighborCol, neighborRow]) => (
        assignments.get(`${neighborCol}:${neighborRow}`)
      )));
      if (touchingAreas.has(leftArea) && touchingAreas.has(rightArea)) sharedWaterTiles += 1;
    }
  }
  if (relation.constraints?.land_border === true && landBorderEdges === 0) {
    errors.push(`topology.${relation.id}: required land border is missing after priority resolution.`);
  }
  if (relation.constraints?.shared_water_boundary === "bay" && sharedWaterTiles === 0) {
    errors.push(`topology.${relation.id}: required shared bay contact is missing after priority resolution.`);
  }
}

const locationIds = new Set();
for (const location of locationList) {
  if (!location.id || locationIds.has(location.id)) errors.push(`locations: duplicate or missing location id "${location.id ?? ""}".`);
  if (location.id && !stableIdPattern.test(location.id)) errors.push(`locations.${location.id}: id must use lowercase stable-ID characters.`);
  locationIds.add(location.id);
  if (typeof location.label !== "string" || !location.label.trim()) errors.push(`locations.${location.id}: label is required.`);
  if (!locationKinds.has(location.kind)) errors.push(`locations.${location.id}: kind "${location.kind ?? ""}" is not registered.`);
  if (!mapIds.has(location.map_id)) errors.push(`locations.${location.id}: map_id "${location.map_id ?? ""}" does not exist.`);
  if (!entityIds.has(location.entity_id)) errors.push(`locations.${location.id}: entity_id "${location.entity_id ?? ""}" does not exist.`);
  if (location.detail_status && !detailStatuses.has(location.detail_status)) {
    errors.push(`locations.${location.id}: detail_status is not registered.`);
  }
  if (location.detail_status === "available") {
    const detail = mapList.find((map) => map.id === location.detail_map_id);
    if (!detail || detail.parent_map_id !== location.map_id || detail.parent_entity_id !== location.entity_id) {
      errors.push(`locations.${location.id}: available city detail must reference its child map and entity.`);
    }
  }
  if (location.detail_status === "awaiting-source" && location.detail_map_id) {
    errors.push(`locations.${location.id}: awaiting-source location cannot expose a detail map.`);
  }
  if (location.footprint_status && location.footprint_status !== "provisional" && location.footprint_status !== "verified") {
    errors.push(`locations.${location.id}: footprint_status must be provisional or verified.`);
  }
  const map = mapList.find((item) => item.id === location.map_id);
  if (map) {
    const { columns, rows } = map.grid ?? {};
    const position = location.position;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1) {
      errors.push(`locations.${location.id}: position must contain normalized x and y values between 0 and 1.`);
    } else {
      const normalizedX = map.wrap_x ? ((position.x % 1) + 1) % 1 : position.x;
      const expectedCol = Math.round(normalizedX * (columns - 1));
      const expectedRow = Math.round(position.y * (rows - 1));
      if (location.col !== expectedCol || location.row !== expectedRow) {
        errors.push(`locations.${location.id}: col and row must match the normalized position for map ${location.map_id}.`);
      }
    }
    if (!Number.isInteger(location.col) || !Number.isInteger(location.row) || location.col < 0 || location.row < 0 || location.col >= columns || location.row >= rows) {
      errors.push(`locations.${location.id}: col and row must identify a tile inside map ${location.map_id}.`);
    } else if (!maskTiles.get(map.mask_id)?.has(`${location.col}:${location.row}`)) {
      errors.push(`locations.${location.id}: location must be placed on a land tile.`);
    }
  }
}

console.log(`Map validation: ${mapList.length} maps, ${Object.keys(masks).length} masks, ${areaList.length} areas, ${topologyRelations.length} topology relations, ${locationList.length} locations checked.`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Map validation passed.");
}
