import { boundsOf, expandRows, hexCenter, hexagon } from "./space.mjs";
import { cityGeometry, terraceLevelAt } from "./terrain.mjs";
import { createWorldRelief } from "./world-relief.mjs";

export const BASE_HEIGHT = 9;
export const TERRACE_STEP = 5;
export const BOARD_TILT = 0.78;
export const BLOCK_INSET = 1;
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

function segmentDistance(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y,
    t = Math.max(0, Math.min(1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
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
      contextRadius = Math.max(rx, (ry * 2) / SQRT3) * 1.2,
      localCells = [],
      localIndex = new Map(),
      terrain = data.feature_maps[map.id].terrain,
      slope = terrain.find(f => f.elevation.slope),
      scale = Math.min(rx, ry),
      seed = (feature.layout.seed ?? 0) * 0.17,
      platformRadius = (feature.layout.moat_radius ?? 0.215) + 0.065,
      platformLevel = terraceLevelAt(...normalized(map.id, center), terrain),
      waterways = cityGeometry(feature).waterways.map(line => ({
        ...line,
        points: line.points.map(point => space.normalized(map.id, point)),
      })),
      streams = waterways.filter(line => !line.closed),
      streamSegments = streams.flatMap(line => line.points.slice(1).map((b, i) => ({
        a: line.points[i], b, width: line.width * scale,
      })));
    const extent = Math.ceil(Math.max(rx, ry) * 2.15 / r);
    for (let q = -extent; q <= extent; q++)
      for (let axial = -extent; axial <= extent; axial++) {
        const point = {
          x: center.x + q * 1.5 * r,
          y: center.y + (axial + q / 2) * SQRT3 * r,
        },
          u = (point.x - center.x) / rx,
          v = (point.y - center.y) / ry,
          distance = Math.hypot(u, v),
          angle = Math.atan2(v, u),
          edge = Math.max(1.45, Math.min(1.98, 1.70 +
            0.17 * Math.sin(angle * 3 + seed) +
            0.11 * Math.cos(angle * 5 - seed * 0.6) +
            0.06 * Math.sin(angle * 7 + seed * 0.3)));
        // A continuous, asymmetric survey fragment, separate from the radial city plan.
        if (distance > edge) continue;
        const uv = normalized(map.id, point),
          outskirts = distance > 1.10,
          river = streamSegments.some(segment =>
            segmentDistance(point, segment.a, segment.b) <= segment.width / 2 + r * 1.3);
        let level = terraceLevelAt(...uv, terrain);
        if (slope) {
          // Extend the same northwest-to-southeast survey slope into the new outskirts.
          const [dx, dy] = slope.elevation.slope.direction,
            projection = ((uv[0] - slope.geometry.center[0]) / slope.geometry.radius[0] * dx +
              (uv[1] - slope.geometry.center[1]) / slope.geometry.radius[1] * dy) / Math.hypot(dx, dy);
          level = slope.elevation.level + Math.round(
            Math.max(0, Math.min(1, (projection + 1) / 2)) * slope.elevation.slope.levels);
        }
        if (outskirts && !river) {
          for (const [x, y, width, height, tiers] of [
            [-1.08, -0.25, 0.43, 0.55, 3],
            [0.67, -1.18, 0.55, 0.42, 3],
            [-0.64, 1.17, 0.48, 0.47, 2],
            [1.26, 0.18, 0.38, 0.47, 2],
          ]) {
            const hill = Math.hypot((u - x) / width, (v - y) / height);
            if (hill < 1) level += Math.ceil((1 - hill) * tiers);
          }
        }
        // The closed moat and palace island share a level central platform.
        if (distance <= platformRadius + r / scale) level = platformLevel;
        const cell = {
          id: key(q, axial),
          col: q,
          row: axial,
          point,
          radius: r,
          outskirts,
          river,
          level,
        };
        localCells.push(cell);
        localIndex.set(cell.id, cell);
      }
    localCells.sort((a, b) => a.point.y - b.point.y || a.point.x - b.point.x);
    const foundationRadius = Math.max(...localCells.flatMap(cell =>
      hexagon(cell.point, r).map(point => Math.max(
        Math.abs(point.x - center.x) + Math.abs(point.y - center.y) / SQRT3,
        Math.abs(point.y - center.y) * 2 / SQRT3)))),
      city = {
        id: map.id,
        center,
        rx,
        ry,
        radius: r,
        contextRadius,
        foundationRadius,
        cells: localCells,
        cellIndex: localIndex,
        foundation: hexagon(center, foundationRadius),
        groundCell: logicalCell(center),
        location,
        palaceHeight:
          Math.min(rx, ry) * 0.245,
      };
    // Sample the rendered centerlines, including their known portions outside the wall.
    // Constraints only lower river beds; repeated passes also handle shared/revisited cells.
    const riverEdges = [];
    for (const stream of streams) {
      const route = [];
      for (let i = 1; i < stream.points.length; i++) {
        const a = stream.points[i - 1], b = stream.points[i],
          steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (r * 0.2)));
        for (let j = 0; j <= steps; j++) {
          const cell = logicalCityCell(city, {
            x: a.x + (b.x - a.x) * j / steps,
            y: a.y + (b.y - a.y) * j / steps,
          });
          if (cell && route.at(-1) !== cell) route.push(cell);
        }
      }
      for (let i = 1; i < route.length; i++) riverEdges.push([route[i - 1], route[i]]);
    }
    let adjusted = true;
    while (adjusted) {
      adjusted = false;
      for (const [upstream, downstream] of riverEdges)
        if (downstream.level > upstream.level) {
          downstream.level = upstream.level;
          adjusted = true;
        }
    }
    cities.set(map.id, city);
  }
  function logicalCityCell(city, point) {
    const x = point.x - Math.round((point.x - city.center.x) / period) * period,
      estimate = Math.round((x - city.center.x) / (city.radius * 1.5));
    for (let col = estimate - 1; col <= estimate + 1; col++) {
      const row = Math.round((point.y - city.center.y) / (city.radius * SQRT3) - col / 2);
      for (let axial = row - 1; axial <= row + 1; axial++) {
        const cell = city.cellIndex.get(key(col, axial));
        if (cell && insideHex({ x, y: point.y }, cell.point, cell.radius)) return cell;
      }
    }
  }
  const foundationHeight = (city, enabled = terrainEnabled) =>
    cellHeight(city.groundCell, enabled) + 2;
  const localHeight = (city, cell, enabled = terrainEnabled) =>
    foundationHeight(city, enabled) + 0.12 +
      (enabled ? cell.level * Math.min(city.rx, city.ry) * 0.08 : 0);
  function heightAt(point, cityId, enabled = terrainEnabled) {
    const city = cities.get(cityId);
    if (city) {
      const cell = logicalCityCell(city, point);
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
    if (city) {
      const polygon = hexagon(cell.point, cell.radius);
      g.faces = g.faces.flatMap(face => {
        const i = face.index, j = (i + 1) % 6,
          neighbour = logicalCityCell(city, {
            x: polygon[i].x + polygon[j].x - cell.point.x,
            y: polygon[i].y + polygon[j].y - cell.point.y,
          }),
          bottom = neighbour ? Math.min(height, localHeight(city, neighbour, enabled)) : foundationHeight(city, enabled);
        if (bottom >= height) return [];
        return [{ index: i, points: [g.top[i], g.top[j],
          { x: g.top[j].x, y: g.top[j].y + height - bottom },
          { x: g.top[i].x, y: g.top[i].y + height - bottom }] }];
      });
    } else {
      // Only the exposed height difference is visible, including below-sea depressions.
      const polygon = hexagon(cell.point, cell.radius);
      g.faces = g.faces.flatMap(face => {
        const i = face.index, j = (i + 1) % 6;
        const neighbour = logicalCell({
          x: polygon[i].x + polygon[j].x - cell.point.x,
          y: polygon[i].y + polygon[j].y - cell.point.y,
        });
        const bottom = cellHeight(neighbour, enabled);
        if (bottom >= height) return [];
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
      const offset = Math.round((point.x - city.center.x) / period) * period,
        visual = { x: point.x - offset, y: point.y };
      for (let i = city.cells.length - 1; i >= 0; i--) {
        const cell = city.cells[i];
        if (Math.abs(visual.x - cell.point.x) > cell.radius) continue;
        const h = localHeight(city, cell),
          logical = { x: visual.x, y: visual.y + h };
        if (insideHex(logical, cell.point, cell.radius * BLOCK_INSET))
          return {
            point: { x: logical.x + offset, y: logical.y },
            cell,
            city: cityId,
            area: city.groundCell?.owner,
          };
        if (geometry(cell, terrainEnabled, cityId).faces.some(face => inPolygon(visual, face.points)))
          return {
            point: { x: cell.point.x + offset, y: cell.point.y },
            cell,
            city: cityId,
            area: city.groundCell?.owner,
          };
      }
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
  const groundPoint = (point, cityId) => {
    const hit = pick(point, cityId), city = cities.get(cityId);
    // Unknown context is a plane at the survey base, not the hidden national terrain.
    if (city && hit?.city !== cityId)
      return { x: point.x, y: point.y + foundationHeight(city) };
    return hit?.point ?? point;
  };
  const containsCity = (cityId, point) => {
    const city = cities.get(cityId);
    return !!city && !!logicalCityCell(city, point);
  };
  function bounds(scope, enabled = terrainEnabled) {
    const cacheKey = `${typeof scope === "string" ? scope : (scope?.id ?? "world")}:${enabled}`;
    if (boundsCache.has(cacheKey)) return boundsCache.get(cacheKey);
    let points;
    if (cities.has(scope)) {
      const city = cities.get(scope);
      points = city.cells.flatMap(cell => {
        const g = geometry(cell, enabled, scope);
        return [...g.top, ...g.bottom, ...g.faces.flatMap(face => face.points)];
      });
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
