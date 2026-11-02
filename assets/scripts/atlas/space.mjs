import { pointOnMap } from "./terrain.mjs";

export function hexCenter(col, row, grid) {
  const s = grid.hex_size;
  // Interpolate column offset for fractional bounds; integer cells remain odd-q.
  const c = Math.floor(col),
    fraction = col - c;
  const offset =
    ((((c % 2) + 2) % 2) * (1 - fraction)) / 2 +
    (((((c + 1) % 2) + 2) % 2) * fraction) / 2;
  return {
    x: s * 2.25 + col * s * 1.5,
    y: s * (1.25 + Math.sqrt(3) / 2) + (row + offset) * s * Math.sqrt(3),
  };
}
export function hexagon(p, radius) {
  return Array.from({ length: 6 }, (_, i) => ({
    x: p.x + radius * Math.cos((i * Math.PI) / 3),
    y: p.y + radius * Math.sin((i * Math.PI) / 3),
  }));
}
export function expandRows(rows) {
  return (rows ?? []).flatMap((entry) =>
    entry.ranges.flatMap(([a, b]) =>
      Array.from({ length: b - a + 1 }, (_, i) => ({
        col: a + i,
        row: entry.row,
      })),
    ),
  );
}
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x, y] = polygon[i],
      [px, py] = polygon[j];
    if (
      y > point.row !== py > point.row &&
      point.col < ((px - x) * (point.row - y)) / (py - y) + x
    )
      inside = !inside;
  }
  return inside;
}

/** Equal-area hex cells give an exact territory centroid, independent of label dimensions. */
export function cellRegionCenter(
  cells,
  grid,
  wrap = false,
  referenceColumn = cells[0]?.col,
) {
  if (!cells.length) return undefined;
  const points = cells.map(({ col, row }) =>
    hexCenter(
      wrap
        ? col +
            Math.round((referenceColumn - col) / grid.columns) * grid.columns
        : col,
      row,
      grid,
    ),
  );
  const centroid = points.reduce(
    (p, q) => ({ x: p.x + q.x / points.length, y: p.y + q.y / points.length }),
    { x: 0, y: 0 },
  );
  const radius = grid.hex_size;
  const inside = points.some((p) => {
    const dx = Math.abs(centroid.x - p.x) / radius,
      dy = Math.abs(centroid.y - p.y) / radius;
    return (
      dx <= 1 + 1e-9 &&
      dy <= Math.sqrt(3) / 2 + 1e-9 &&
      Math.sqrt(3) * dx + dy <= Math.sqrt(3) + 1e-9
    );
  });
  if (inside) return centroid;
  // Concave coasts or islands can put the centroid in water. Keep the mark on land.
  return points.reduce((best, p) =>
    Math.hypot(p.x - centroid.x, p.y - centroid.y) <
    Math.hypot(best.x - centroid.x, best.y - centroid.y)
      ? p
      : best,
  );
}
export function boundsOf(points) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}
export function contains(box, p) {
  return (
    p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY
  );
}
export function intersects(a, b) {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  );
}
export function project(camera, point, width, height) {
  return {
    x: width / 2 + (point.x - camera.x) * camera.zoom,
    y: height / 2 + (point.y - camera.y) * camera.zoom * camera.tilt,
  };
}
export function unproject(camera, point, width, height) {
  return {
    x: camera.x + (point.x - width / 2) / camera.zoom,
    y: camera.y + (point.y - height / 2) / (camera.zoom * camera.tilt),
  };
}
export function zoomAt(camera, zoom, anchor, width, height) {
  const before = unproject(camera, anchor, width, height),
    next = { ...camera, zoom };
  const after = unproject(next, anchor, width, height);
  return {
    ...next,
    x: next.x + before.x - after.x,
    y: next.y + before.y - after.y,
  };
}
export function pinchAt(
  camera,
  zoom,
  initialCenter,
  currentCenter,
  width,
  height,
) {
  const anchor = unproject(camera, initialCenter, width, height);
  return {
    ...camera,
    zoom,
    x: anchor.x - (currentCenter.x - width / 2) / zoom,
    y: anchor.y - (currentCenter.y - height / 2) / (zoom * camera.tilt),
  };
}

/** All render geometry, hit testing and HTML anchors use these same frames. */
export function createSpace(data) {
  const maps = new Map(data.maps.map((map) => [map.id, map])),
    frames = new Map();
  const root = data.maps.find((map) => map.level === 0);
  const footprints = new Map(),
    countries = new Map(),
    boundCache = new Map(),
    centerCache = new Map();
  const local = (id, p) => {
    const f = frame(id);
    return { x: p.x * f.sx + f.tx, y: p.y * f.sy + f.ty };
  };
  const normalized = (id, p) => local(id, pointOnMap(p, maps.get(id).grid));
  function frame(id) {
    if (frames.has(id)) return frames.get(id);
    const map = maps.get(id),
      alignment = data.tile_masks[map.mask_id].alignment;
    if (!alignment) {
      const f = { sx: 1, sy: 1, tx: 0, ty: 0 };
      frames.set(id, f);
      return f;
    }
    const parent = maps.get(map.parent_map_id),
      pf = frame(parent.id);
    const [ax, ay, ox, oy] = alignment.transform,
      s = map.grid.hex_size;
    const zero = hexCenter(0, 0, map.grid),
      parentZero = hexCenter(0, 0, parent.grid);
    const sx = parent.grid.hex_size / (s * ax),
      sy = parent.grid.hex_size / (s * ay);
    const f = {
      sx: sx * pf.sx,
      sy: sy * pf.sy,
      tx: (parentZero.x - (zero.x + ox * s) * sx) * pf.sx + pf.tx,
      ty: (parentZero.y - (zero.y + oy * s) * sy) * pf.sy + pf.ty,
    };
    frames.set(id, f);
    if (map.level === 2) {
      const loc = data.detail_locations.find((loc) => loc.detail_map_id === id);
      if (loc?.position) {
        const anchor = normalized(parent.id, [loc.position.x, loc.position.y]);
        const center = normalized(id, [0.5, 0.5]);
        f.tx += anchor.x - center.x;
        f.ty += anchor.y - center.y;
      }
    }
    return f;
  }
  const footprint = (id) => {
    if (footprints.has(id)) return footprints.get(id);
    const map = maps.get(id),
      mask = data.tile_masks[map.mask_id],
      alignment = mask.alignment;
    const parent = alignment ? maps.get(map.parent_map_id) : map;
    const parentMask = data.tile_masks[parent.mask_id];
    const rows = alignment
      ? parentMask.area_masks[alignment.parent_area_id].tile_rows
      : mask.land_rows;
    let polygons = expandRows(rows).map(({ col, row }) =>
      hexagon(hexCenter(col, row, parent.grid), parent.grid.hex_size).map((p) =>
        local(parent.id, p),
      ),
    );
    if (map.level === 2) {
      const b = boundsOf(polygons.flat()),
        c = normalized(id, [0.5, 0.5]);
      const dx = c.x - (b.minX + b.maxX) / 2,
        dy = c.y - (b.minY + b.maxY) / 2;
      polygons = polygons.map((poly) =>
        poly.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      );
    }
    footprints.set(id, polygons);
    return polygons;
  };
  const countryPolygons = (area) => {
    if (countries.has(area.id)) return countries.get(area.id);
    const polygons = expandRows(
      data.tile_masks[root.mask_id].area_masks[area.id]?.tile_rows,
    ).map(({ col, row }) =>
      hexagon(hexCenter(col, row, root.grid), root.grid.hex_size),
    );
    countries.set(area.id, polygons);
    return polygons;
  };
  const areaCenter = (area) => {
    if (centerCache.has(area.id)) return centerCache.get(area.id);
    const map = maps.get(area.map_id),
      mask = data.tile_masks[map.mask_id];
    let center;
    if (area.label_anchor) center = hexCenter(...area.label_anchor, map.grid);
    else {
      const rows = mask.area_masks?.[area.id]?.tile_rows;
      const cells = rows
        ? expandRows(rows)
        : expandRows(mask.land_rows).filter((cell) =>
            (area.polygons ?? []).some((polygon) =>
              pointInPolygon(cell, polygon),
            ),
          );
      const reference =
        area.polygons?.[0]?.reduce((sum, p) => sum + p[0], 0) /
        area.polygons?.[0]?.length;
      center = cellRegionCenter(
        cells,
        map.grid,
        area.wrap_x === true,
        Number.isFinite(reference) ? reference : cells[0]?.col,
      );
      if (!center) {
        const box = boundsOf(
          (area.polygons ?? [])
            .flat()
            .map(([col, row]) => hexCenter(col, row, map.grid)),
        );
        center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
      }
    }
    center = local(map.id, center);
    centerCache.set(area.id, center);
    return center;
  };
  const cachedBounds = (key, polygons) => {
    if (!boundCache.has(key)) boundCache.set(key, boundsOf(polygons.flat()));
    return boundCache.get(key);
  };
  const owner = new Map();
  for (const area of data.areas.filter(
    (area) => area.layer === "country" || area.layer === "special",
  ))
    for (const p of expandRows(
      data.tile_masks[root.mask_id].area_masks[area.id]?.tile_rows,
    ))
      owner.set(`${p.col}:${p.row}`, area);
  const period = root.grid.columns * root.grid.hex_size * 1.5;
  function countryAt(p) {
    const raw = (p.x - root.grid.hex_size * 2.25) / (root.grid.hex_size * 1.5),
      s = root.grid.hex_size;
    for (let c = Math.round(raw) - 1; c <= Math.round(raw) + 1; c++) {
      const col =
        ((c % root.grid.columns) + root.grid.columns) % root.grid.columns;
      const row = Math.round(
        (p.y - s * (1.25 + Math.sqrt(3) / 2)) / (s * Math.sqrt(3)) -
          (col % 2) / 2,
      );
      const center = hexCenter(c, row, root.grid),
        dx = Math.abs(p.x - center.x) / s,
        dy = Math.abs(p.y - center.y) / s;
      if (
        dx <= 1 &&
        dy <= Math.sqrt(3) / 2 &&
        Math.sqrt(3) * dx + dy <= Math.sqrt(3)
      )
        return owner.get(`${col}:${row}`);
    }
  }
  return {
    maps,
    root,
    frame,
    local,
    normalized,
    footprint,
    countryPolygons,
    areaCenter,
    countryAt,
    bounds: (id) => cachedBounds(id, footprint(id)),
    countryBounds: (area) => cachedBounds(area.id, countryPolygons(area)),
    period,
  };
}
