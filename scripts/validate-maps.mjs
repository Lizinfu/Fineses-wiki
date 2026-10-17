import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { walkMarkdown } from "./lib/files.mjs";

const root = process.cwd();
const errors = [];
const stableIdPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const locationKinds = new Set(["capital", "city", "region", "ruin", "landmark"]);
const areaLayers = new Set(["continent", "country", "special"]);
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
  "anomaly",
]);
const politicalStatuses = new Set(["active", "unruled"]);
const detailStatuses = new Set(["available", "awaiting-source"]);
const areaTargets = new Set(["land", "ocean", "any"]);
const tileSources = new Set(["generated"]);
const palettes = new Set(["monochrome", "political-pastel"]);
const reliefModes = new Set(["none", "subtle"]);
const materials = new Set(["none", "paper"]);
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

const [layers, locations, tiles, areaData, topologyData] = await Promise.all([
  readYaml("data/maps/layers.yaml"),
  readYaml("data/maps/locations.yaml"),
  readYaml("data/maps/tiles.yaml"),
  readYaml("data/maps/areas.yaml"),
  readYaml("data/maps/topology.yaml"),
]);
const mapList = Array.isArray(layers.maps) ? layers.maps : [];
const locationList = Array.isArray(locations.locations) ? locations.locations : [];
const masks = tiles.masks && typeof tiles.masks === "object" ? tiles.masks : {};
const areaList = Array.isArray(areaData.areas) ? areaData.areas : [];
const topologyRelations = Array.isArray(topologyData.relations) ? topologyData.relations : [];
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
  if (typeof map.wrap_x !== "boolean") errors.push(`maps.${map.id}: wrap_x must be explicitly true or false.`);
  if (!map.mask_id || !masks[map.mask_id]) errors.push(`maps.${map.id}: mask_id must reference a generated tile mask.`);
  const { columns, rows, hex_size: hexSize, gap, orientation } = map.grid ?? {};
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    errors.push(`maps.${map.id}: grid columns and rows must be positive integers.`);
  } else if (columns * rows > 2000) {
    errors.push(`maps.${map.id}: grid exceeds the 2,000-tile DOM budget.`);
  }
  if (!Number.isFinite(hexSize) || hexSize < 12 || hexSize > 64) {
    errors.push(`maps.${map.id}: hex_size must be between 12 and 64.`);
  }
  if (!Number.isFinite(gap) || gap < 0 || gap >= hexSize) {
    errors.push(`maps.${map.id}: gap must be non-negative and smaller than hex_size.`);
  }
  if (orientation !== "flat") errors.push(`maps.${map.id}: orientation must currently be "flat".`);
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
  if (area.entity_id && !entityIds.has(area.entity_id)) errors.push(`areas.${area.id}: entity_id "${area.entity_id}" does not exist.`);
  if ((area.layer === "continent" || area.layer === "country") && !area.entity_id) {
    errors.push(`areas.${area.id}: ${area.layer} areas must reference an entity_id.`);
  }
  if (area.style_token && !areaStyles.has(area.style_token)) errors.push(`areas.${area.id}: style_token "${area.style_token}" is not registered.`);
  if (area.political_status && !politicalStatuses.has(area.political_status)) errors.push(`areas.${area.id}: political_status is not registered.`);
  if (area.detail_status && !detailStatuses.has(area.detail_status)) errors.push(`areas.${area.id}: detail_status is not registered.`);
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
  const landTiles = maskTiles.get(map.mask_id) ?? new Set();
  const mapAreas = areaList.filter((area) => area.map_id === map.id);
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
  const map = mapList.find((item) => item.id === location.map_id);
  if (map) {
    const { columns, rows } = map.grid ?? {};
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
