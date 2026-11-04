import { boundsOf, expandRows, hexCenter, hexagon } from "./space.mjs";
import { terraceLevelAt } from "./terrain.mjs";
import { createWorldRelief } from "./world-relief.mjs";

export const BASE_HEIGHT = 9;
export const TERRACE_STEP = 5;
export const BOARD_TILT = 0.78;
export const BLOCK_INSET = 0.991;
const SQRT3 = Math.sqrt(3);
const key = (col, row) => `${col}:${row}`;
const insideHex = (point, center, radius) => {
  const dx = Math.abs(point.x - center.x),
    dy = Math.abs(point.y - center.y);
  return (
    dx <= radius + 1e-8 &&
    dy <= (SQRT3 * radius) / 2 + 1e-8 &&
    SQRT3 * dx + dy <= SQRT3 * radius + 1e-8
  );
};
function inPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}

/** Flat top and three visible side faces. No interpolated height or normal texture. */
export function prismGeometry(polygon, topHeight, bottomHeight = 0) {
  const top = polygon.map((p) => ({ x: p.x, y: p.y - topHeight })),
    bottom = polygon.map((p) => ({ x: p.x, y: p.y - bottomHeight }));
  const faces = [];
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    if (polygon[j].x < polygon[i].x - 1e-8)
      faces.push({ index: i, points: [top[i], top[j], bottom[j], bottom[i]] });
  }
  return { top, bottom, faces };
}

/** Logical geography -> physical block surface -> shared 2D board camera. */
export function createBlockBoard(data, space) {
  const grid = space.root.grid,
    radius = grid.hex_size,
    period = space.period,
    cellIndex = new Map(),
    owners = new Map(),
    cities = new Map(),
    boundsCache = new Map();
  let terrainEnabled = true;
  const areas = data.areas.filter(
    (a) =>
      a.map_id === space.root.id && ["country", "special"].includes(a.layer),
  );
  for (const area of areas)
    for (const c of expandRows(
      data.tile_masks[space.root.mask_id].area_masks[area.id]?.tile_rows,
    ))
      owners.set(key(c.col, c.row), area);
  const normalized = (mapId, p) => {
    const a = space.normalized(mapId, [0, 0]),
      b = space.normalized(mapId, [1, 1]);
    return [(p.x - a.x) / (b.x - a.x), (p.y - a.y) / (b.y - a.y)];
  };
  const cells = expandRows(data.tile_masks[space.root.mask_id].land_rows)
    .map((c) => {
      const owner = owners.get(key(c.col, c.row)),
        point = hexCenter(c.col, c.row, grid),
        features = data.feature_maps[owner?.detail_map_id],
        uv = features ? normalized(owner.detail_map_id, point) : [0, 0];
      const cell = {
        ...c,
        id: key(c.col, c.row),
        point,
        radius,
        owner,
        level: terraceLevelAt(uv[0], uv[1], features?.terrain ?? []),
      };
      cellIndex.set(cell.id, cell);
      return cell;
    })
    .sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x);

  const worldRelief = createWorldRelief(data.world_relief, cells, grid.columns, grid.rows);
  for (const cell of cells) {
    const relief = worldRelief(cell);
    // Existing local surveys take precedence over the broad world study.
    if (relief.region || (data.world_relief && !(data.feature_maps[cell.owner?.detail_map_id]?.terrain?.length)))
      cell.level = relief.level;
    cell.material = relief.material;
    cell.region = relief.region;
  }

  function logicalCell(point) {
    const raw = (point.x - radius * 2.25) / (radius * 1.5);
    for (let col = Math.round(raw) - 1; col <= Math.round(raw) + 1; col++) {
      const wrapped = ((col % grid.columns) + grid.columns) % grid.columns,
        estimate = Math.round(
          (point.y - radius * (1.25 + SQRT3 / 2)) / (radius * SQRT3) -
            (wrapped % 2) / 2,
        );
      for (let row = estimate - 1; row <= estimate + 1; row++) {
        const cell = cellIndex.get(key(wrapped, row));
        if (cell && insideHex(point, hexCenter(col, row, grid), radius))
          return cell;
      }
    }
  }
  // River beds are discrete and non-increasing downstream. No continuous canyon shading.
  const rivers = [];
  for (const [mapId, set] of Object.entries(data.feature_maps))
    for (const feature of set.waterways ?? []) {
      if (space.maps.get(mapId)?.level !== 1) continue;
      const points = feature.geometry.points.map((p) =>
          space.normalized(mapId, p),
        ),
        samples = [];
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
          b = points[i],
          steps = Math.max(
            1,
            Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (radius * 0.22)),
          );
        for (let j = 0; j < steps; j++)
          samples.push({
            x: a.x + ((b.x - a.x) * j) / steps,
            y: a.y + ((b.y - a.y) * j) / steps,
          });
      }
      samples.push(points.at(-1));
      let downstream = 1;
      const route = [];
      samples.forEach((p, i) => {
        const cell = logicalCell(p);
        if (!cell) return;
        downstream = Math.min(
          downstream,
          cell.level,
          i / samples.length > 0.67 ? 0 : 1,
        );
        cell.level = Math.min(cell.level, downstream);
        if (route.at(-1) !== cell) route.push(cell);
      });
      let bed = Infinity;
      for (const cell of route) {
        bed = Math.min(bed, cell.level);
        cell.level = bed;
      }
      rivers.push({ mapId, feature, points, cells: route });
    }
  const cellHeight = (cell, enabled = terrainEnabled) =>
    cell ? BASE_HEIGHT + (enabled ? cell.level * TERRACE_STEP : 0) : 0;

  for (const map of data.maps.filter((m) => m.level === 2)) {
    const feature = data.feature_maps[map.id]?.settlements.find(
      (f) => f.kind === "concentric-city",
    );
    const location = data.detail_locations.find(
      (l) => l.detail_map_id === map.id,
    );
    if (!feature || !location) continue;
    const center = space.normalized(map.id, feature.geometry.center),
      east = space.normalized(map.id, [
        feature.geometry.center[0] + feature.geometry.radius[0],
        feature.geometry.center[1],
      ]),
      south = space.normalized(map.id, [
        feature.geometry.center[0],
        feature.geometry.center[1] + feature.geometry.radius[1],
      ]),
      rx = east.x - center.x,
      ry = south.y - center.y,
      r = Math.max(0.6, rx / 22),
      foundationRadius = Math.max(rx, (ry * 2) / SQRT3) * 1.2,
      localCells = [];
    const extent = Math.ceil(foundationRadius / r);
    for (let q = -extent; q <= extent; q++)
      for (let axial = -extent; axial <= extent; axial++) {
        const point = {
          x: center.x + q * 1.5 * r,
          y: center.y + (axial + q / 2) * SQRT3 * r,
        };
        if (
          ((point.x - center.x) / (rx * 1.07)) ** 2 +
            ((point.y - center.y) / (ry * 1.07)) ** 2 >
          1
        )
          continue;
        const uv = normalized(map.id, point);
        localCells.push({
          id: `${q}:${axial}`,
          point,
          radius: r,
          level: terraceLevelAt(...uv, data.feature_maps[map.id].terrain),
        });
      }
    localCells.sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x);
    cities.set(map.id, {
      id: map.id,
      center,
      rx,
      ry,
      radius: r,
      foundationRadius,
      cells: localCells,
      foundation: hexagon(center, foundationRadius),
      groundCell: logicalCell(center),
      location,
      palaceHeight:
        Math.min(space.frame(map.id).sx, space.frame(map.id).sy) * 5,
    });
  }
  const foundationHeight = (city, enabled = terrainEnabled) =>
    cellHeight(city.groundCell, enabled) + 2;
  const localHeight = (city, cell, enabled = terrainEnabled) =>
    foundationHeight(city, enabled) + 0.12 + (enabled ? cell.level * 0.12 : 0);
  function heightAt(point, cityId, enabled = terrainEnabled) {
    const city = cities.get(cityId);
    if (city && insideHex(point, city.center, city.foundationRadius)) {
      const cell = city.cells.find((c) => insideHex(point, c.point, c.radius));
      return cell
        ? localHeight(city, cell, enabled)
        : foundationHeight(city, enabled);
    }
    return cellHeight(logicalCell(point), enabled);
  }
  function raise(point, cityId, enabled = terrainEnabled) {
    return { x: point.x, y: point.y - heightAt(point, cityId, enabled) };
  }
  function geometry(cell, enabled = terrainEnabled, cityId) {
    const city = cities.get(cityId);
    const height = city ? localHeight(city, cell, enabled) : cellHeight(cell, enabled);
    const g = prismGeometry(
      hexagon(cell.point, cell.radius * BLOCK_INSET),
      height,
      city ? foundationHeight(city, enabled) : Math.min(0, height),
    );
    if (!city) {
      // Extend exposed cliffs down to a neighbouring depression floor. Never invert a prism.
      const polygon = hexagon(cell.point, cell.radius);
      g.faces = g.faces.flatMap(face => {
        const i = face.index, j = (i + 1) % 6;
        const neighbour = logicalCell({
          x: polygon[i].x + polygon[j].x - cell.point.x,
          y: polygon[i].y + polygon[j].y - cell.point.y,
        });
        const bottom = Math.min(0, height, cellHeight(neighbour, enabled));
        if (bottom === height) return [];
        return [{ index: i, points: [g.top[i], g.top[j],
          { x: g.top[j].x, y: g.top[j].y + height - bottom },
          { x: g.top[i].x, y: g.top[i].y + height - bottom }] }];
      });
    }
    return g;
  }
  function cityFoundation(cityId, enabled = terrainEnabled) {
    const city = cities.get(cityId);
    return prismGeometry(
      city.foundation,
      foundationHeight(city, enabled),
      cellHeight(city.groundCell, enabled) - 1,
    );
  }
  function pick(point, cityId) {
    const city = cities.get(cityId);
    if (city) {
      for (let i = city.cells.length - 1; i >= 0; i--) {
        const cell = city.cells[i],
          h = localHeight(city, cell),
          logical = { x: point.x, y: point.y + h };
        if (insideHex(logical, cell.point, cell.radius))
          return {
            point: logical,
            cell,
            city: cityId,
            area: city.groundCell?.owner,
          };
      }
      const foundation = cityFoundation(cityId);
      if (
        inPolygon(point, foundation.top) ||
        foundation.faces.some((f) => inPolygon(point, f.points))
      )
        return {
          point: { x: point.x, y: point.y + foundationHeight(city) },
          city: cityId,
          area: city.groundCell?.owner,
        };
    }
    const raw = (point.x - radius * 2.25) / (radius * 1.5),
      candidates = [];
    for (let col = Math.round(raw) - 1; col <= Math.round(raw) + 1; col++) {
      const wrapped = ((col % grid.columns) + grid.columns) % grid.columns,
        row0 = Math.round(
          (point.y - radius * (1.25 + SQRT3 / 2)) / (radius * SQRT3) -
            (wrapped % 2) / 2,
        );
      for (let row = row0 - 1; row <= row0 + 2; row++) {
        const cell = cellIndex.get(key(wrapped, row));
        if (!cell) continue;
        const center = hexCenter(col, row, grid),
          h = cellHeight(cell),
          logical = { x: point.x, y: point.y + h };
        if (insideHex(logical, center, radius * BLOCK_INSET))
          candidates.push({
            cell,
            point: logical,
            area: cell.owner,
            city: undefined,
          });
        else {
          const g = geometry(cell);
          const offset = center.x - cell.point.x;
          if (offset) g.faces = g.faces.map(f => ({ ...f, points: f.points.map(p => ({ x: p.x + offset, y: p.y })) }));
          if (g.faces.some((f) => inPolygon(point, f.points)))
            candidates.push({
              cell,
              point: center,
              area: cell.owner,
              city: undefined,
            });
        }
      }
    }
    return candidates.sort(
      (a, b) =>
        b.cell.point.y - a.cell.point.y || b.cell.point.x - a.cell.point.x,
    )[0];
  }
  const groundPoint = (point, cityId) => pick(point, cityId)?.point ?? point;
  const containsCity = (cityId, point) => {
    const city = cities.get(cityId);
    return !!city && insideHex(point, city.center, city.foundationRadius);
  };
  function bounds(scope, enabled = terrainEnabled) {
    const cacheKey = `${typeof scope === "string" ? scope : (scope?.id ?? "world")}:${enabled}`;
    if (boundsCache.has(cacheKey)) return boundsCache.get(cacheKey);
    let points;
    if (cities.has(scope)) {
      const city = cities.get(scope),
        g = cityFoundation(scope, enabled);
      points = [
        ...g.top,
        ...g.bottom,
        ...city.cells.flatMap((c) => geometry(c, enabled, scope).top),
      ];
    } else {
      const subset = scope?.id
        ? cells.filter((c) => c.owner?.id === scope.id)
        : cells;
      points = subset.flatMap((c) => {
        const g = geometry(c, enabled);
        return [...g.top, ...g.bottom];
      });
    }
    const result = boundsOf(points);
    boundsCache.set(cacheKey, result);
    return result;
  }
  function outline(area, enabled = terrainEnabled) {
    const edges = new Map(),
      coord = (p) => `${p.x.toFixed(3)}:${p.y.toFixed(3)}`;
    for (const cell of cells.filter((c) => c.owner?.id === area.id)) {
      const poly = hexagon(cell.point, radius);
      for (let i = 0; i < 6; i++) {
        const a = poly[i],
          b = poly[(i + 1) % 6],
          id = [coord(a), coord(b)].sort().join("|");
        if (edges.has(id)) edges.delete(id);
        else {
          const h = cellHeight(cell, enabled);
          edges.set(id, [
            { x: a.x, y: a.y - h },
            { x: b.x, y: b.y - h },
          ]);
        }
      }
    }
    return [...edges.values()];
  }
  function drape(points, cityId, enabled = terrainEnabled) {
    const output = [],
      step = cityId ? (cities.get(cityId)?.radius ?? 1) * 0.5 : radius * 0.22;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let j = 0; j < steps; j++)
        output.push(
          raise(
            {
              x: a.x + ((b.x - a.x) * j) / steps,
              y: a.y + ((b.y - a.y) * j) / steps,
            },
            cityId,
            enabled,
          ),
        );
    }
    if (points.length) output.push(raise(points.at(-1), cityId, enabled));
    return output;
  }
  return {
    cells,
    cities,
    rivers,
    cellIndex,
    logicalCell,
    cellHeight,
    foundationHeight,
    localHeight,
    heightAt,
    raise,
    geometry,
    cityFoundation,
    pick,
    groundPoint,
    containsCity,
    bounds,
    outline,
    drape,
    setTerrain: (enabled) => {
      terrainEnabled = enabled;
    },
    get terrainEnabled() {
      return terrainEnabled;
    },
  };
}
