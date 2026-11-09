// Display-only tiles for the missing survey around a city. Never political land.
const SQRT3 = Math.sqrt(3);
const PADDING = 2;

function stringSeed(value) {
  let seed = 2166136261;
  for (const character of value)
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function dataTrace(point, radius, col, row, citySeed) {
  const seed = (citySeed ^ Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0,
    angle = (seed % 3) * Math.PI / 3,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    flip = seed & 8 ? -1 : 1,
    drift = (((seed >>> 8) % 5) - 2) * 0.025;
  // Every point stays well inside the hexagon's incircle, including after rotation.
  return [[-0.60, -0.16], [-0.30, -0.16], [-0.14, 0.12],
    [0.20, 0.12], [0.36, -0.16], [0.60, -0.16]].map(([x, rawY]) => {
    const y = rawY * flip + drift;
    return {
      x: point.x + (x * cos - y * sin) * radius,
      y: point.y + (x * sin + y * cos) * radius,
    };
  });
}

/**
 * Coarse axial hexagons anchored to the nearest wrapped copy of a city's base.
 * Points and traces are logical world coordinates; subtract `height` when drawing.
 * The key stays stable within a column/row range. Append drawing height/style to
 * renderer cache keys; this function does not retain viewport geometry or state.
 */
export function cityContextTiles(camera, width, viewportHeight, city, period, surfaceHeight = 0) {
  const radius = city?.contextRadius ?? city?.foundationRadius;
  if (![camera?.x, camera?.y, camera?.zoom, camera?.tilt, width, viewportHeight,
    city?.center?.x, city?.center?.y, radius, period, surfaceHeight].every(Number.isFinite) ||
    camera.zoom <= 0 || camera.tilt <= 0 || width <= 0 || viewportHeight <= 0 ||
    radius <= 0 || period <= 0)
    return { key: "", height: 0, radius: 0, copy: 0, cells: [] };

  const copy = Math.round((camera.x - city.center.x) / period),
    anchor = { x: city.center.x + copy * period, y: city.center.y },
    dx = radius * 1.5,
    dy = radius * SQRT3,
    halfWidth = width / (2 * camera.zoom),
    halfHeight = viewportHeight / (2 * camera.zoom * camera.tilt),
    firstCol = Math.floor((camera.x - halfWidth - anchor.x) / dx) - PADDING,
    lastCol = Math.ceil((camera.x + halfWidth - anchor.x) / dx) + PADDING,
    firstRow = Math.floor((camera.y + surfaceHeight - halfHeight - anchor.y) / dy - lastCol / 2) - PADDING,
    lastRow = Math.ceil((camera.y + surfaceHeight + halfHeight - anchor.y) / dy - firstCol / 2) + PADDING,
    citySeed = stringSeed(String(city.id ?? "city")),
    cells = [];
  // A conservative axial rectangle makes the range key sufficient for all geometry.
  for (let col = firstCol; col <= lastCol; col++)
    for (let row = firstRow; row <= lastRow; row++) {
      const point = {
        x: anchor.x + col * dx,
        y: anchor.y + (row + col / 2) * dy,
      };
      cells.push({ col, row, point, radius, trace: dataTrace(point, radius, col, row, citySeed) });
    }

  return {
    key: JSON.stringify([city.id ?? "city", city.center.x, city.center.y,
      radius, copy, firstCol, lastCol, firstRow, lastRow]),
    height: surfaceHeight,
    radius,
    copy,
    cells,
  };
}
