// The city is a deterministic architectural model, not a surveyed building inventory.
// Footprints use normalized map coordinates; heights/line widths use the city radius.
const TAU = Math.PI * 2;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const polar = (radius, angle) => [radius * Math.cos(angle), radius * Math.sin(angle)];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const subtract = (a, b) => [a[0] - b[0], a[1] - b[1]];

function distanceToSegment(point, a, b) {
  const ab = subtract(b, a), ap = subtract(point, a);
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / (ab[0] ** 2 + ab[1] ** 2)));
  return distance(point, lerp(a, b, t));
}

function rectangle(center, width, depth, angle = 0) {
  const [cx, cy] = center, c = Math.cos(angle), s = Math.sin(angle);
  return [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]]
    .map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

function intersection(a, b, c, d) {
  const ab = subtract(b, a), cd = subtract(d, c), det = cross(ab, cd);
  if (Math.abs(det) < 1e-9) return undefined;
  const ac = subtract(c, a), t = cross(ac, cd) / det, u = cross(ac, ab) / det;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? lerp(a, b, t) : undefined;
}

/** Radial street structure, asymmetric districts, and an independently editable palace. */
export function cityGeometry(feature) {
  const { center: [cx, cy], radius: [rx, ry] } = feature.geometry;
  const layout = feature.layout;
  const rings = layout.rings, spokes = layout.spokes, seed = layout.seed;
  const waterWidth = layout.river_width ?? 0.035;
  const moatRadius = layout.moat_radius ?? 0.215;
  const map = ([x, y]) => [cx + x * rx, cy + y * ry];
  const roads = rings.map((radius, i) => ({
    id: `ring.${i}`, closed: true, width: i === rings.length - 1 ? 0.022 : 0.019,
    points: Array.from({ length: 96 }, (_, j) => polar(radius, j * TAU / 96)),
  }));
  for (let i = 0; i < spokes; i++) {
    const angle = i * TAU / spokes;
    roads.push({
      id: `avenue.${i}`, closed: false, width: i % 3 === 0 ? 0.025 : 0.017,
      points: [polar(i % 2 === 0 ? 0.145 : moatRadius + 0.04, angle), polar(1.035, angle)],
    });
  }
  const junction = Math.SQRT1_2 * moatRadius;
  const waterways = [
    { id: "river.inlet", width: waterWidth, points: [[-1.65, -1.55], [-1.37, -1.29], [-1.15, -1.02], [-0.95, -0.90], [-0.79, -0.76], [-0.65, -0.59], [-0.51, -0.42], [-0.35, -0.30], [-0.25, -0.22], [-junction, -junction]] },
    { id: "palace.moat", width: waterWidth * 0.85, closed: true, points: Array.from({ length: 96 }, (_, i) => polar(moatRadius, i * TAU / 96)) },
    { id: "river.outlet", width: waterWidth, points: [[junction, junction], [0.28, 0.30], [0.41, 0.43], [0.59, 0.57], [0.78, 0.76], [0.96, 0.91], [1.20, 1.02], [1.43, 1.24], [1.65, 1.49]] },
  ];
  const segments = (line) => {
    const points = line.closed ? [...line.points, line.points[0]] : line.points;
    return points.slice(1).map((point, i) => [points[i], point]);
  };
  const waterSegments = waterways.flatMap(line => segments(line).map(points => ({ points, width: line.width })));
  const roadSegments = roads.flatMap(line => segments(line).map(points => ({ points, width: line.width })));
  const buildings = [];
  const add = (id, kind, district, points, height, extra = {}) => {
    const object = { id, kind, district, points, height, roof: "flat", ...extra };
    buildings.push(object);
    return object;
  };
  const addRect = (id, kind, district, center, width, depth, height, angle = 0, extra = {}) =>
    add(id, kind, district, rectangle(center, width, depth, angle), height, extra);
  const addRound = (id, kind, district, center, radius, height, extra = {}) =>
    add(id, kind, district, Array.from({ length: 16 }, (_, i) => {
      const p = polar(radius, i * TAU / 16);
      return [center[0] + p[0], center[1] + p[1]];
    }), height, extra);

  // Castle wards enclose a real open court. The round keep and compact chapel recall
  // Irish castle silhouettes without importing the real Dublin Castle footprint.
  addRect("palace.north-wing", "palace", "palace", [0, -0.112], 0.232, 0.048, 0.134, 0, { roof: "gable", roofHeight: 0.026 });
  addRect("palace.west-wing", "palace", "palace", [-0.112, 0], 0.185, 0.048, 0.119, Math.PI / 2, { roof: "gable", roofHeight: 0.022 });
  addRect("palace.east-wing", "palace", "palace", [0.112, 0], 0.185, 0.048, 0.119, Math.PI / 2, { roof: "gable", roofHeight: 0.022 });
  for (const side of [-1, 1])
    addRect(`palace.south-wing.${side}`, "palace", "palace", [side * 0.078, 0.106], 0.076, 0.047, 0.122, 0, { roof: "gable", roofHeight: 0.025 });
  addRect("palace.state-hall", "palace", "palace", [0, -0.079], 0.124, 0.034, 0.163, 0, { roof: "gable", roofHeight: 0.028 });
  addRound("palace.record-tower", "palace-tower", "palace", [0.113, 0.095], 0.034, 0.224);
  addRound("palace.record-tower.crown", "palace-detail", "palace", [0.113, 0.095], 0.037, 0.013, { base_height: 0.216 });
  for (const [index, point] of [[-0.113, -0.097], [0.113, -0.097], [-0.113, 0.095]].entries())
    addRound(`palace.corner.${index}`, "palace-tower", "palace", point, 0.022, 0.173);
  addRect("palace.chapel", "chapel", "palace", [-0.032, -0.161], 0.07, 0.042, 0.126, 0, { roof: "gable", roofHeight: 0.05 });
  addRect("palace.chapel.bell-tower", "chapel", "palace", [-0.077, -0.154], 0.027, 0.029, 0.205);
  for (let i = 0; i < 5; i++)
    for (const side of [-1, 1])
      addRect(`palace.chapel.buttress.${i}.${side}`, "palace-detail", "palace", [-0.06 + i * 0.014, -0.161 + side * 0.026], 0.006, 0.013, 0.07);

  const random = (index) => {
    const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const civicSites = [{ center: [0.283, -0.283], radius: 0.068 }, { center: [0.10, 0.373], radius: 0.063 }];
  const occupied = [...civicSites];
  let index = 0, factoryCount = 0;
  // Four inner rows, three middle rows and two outer rows make density visibly fall
  // towards the wall. Districts change the massing while retaining the radial plan.
  const bands = rings.slice(1).map((max, band) => ({
    min: band === 0 ? Math.max(rings[0], moatRadius + 0.045) : rings[band],
    max, rows: Math.max(2, 4 - band), spacing: [0.045, 0.060, 0.084][band] ?? 0.084 + (band - 2) * 0.018,
  }));
  for (const [band, range] of bands.entries()) {
    for (let row = 0; row < range.rows; row++) {
      const radius = range.min + (range.max - range.min) * (row + 0.5) / range.rows;
      const count = Math.floor(TAU * radius / range.spacing);
      for (let slot = 0; slot < count; slot++, index++) {
        const angle = (slot + 0.5 + (row % 2) * 0.5) * TAU / count;
        const center = polar(radius, angle), industrial = center[0] < -0.23 && band > 0;
        if (industrial && (slot + row) % 2) continue;
        if (band === 2 && random(index) < 0.16) continue;
        const width = industrial ? range.spacing * 1.28 : range.spacing * (0.62 + random(index) * 0.12);
        const depth = industrial ? 0.050 : band === 0 ? 0.032 : band === 1 ? 0.039 : 0.046;
        const footprint = rectangle(center, width, depth, angle + Math.PI / 2);
        const clearance = Math.hypot(width, depth) / 2;
        if (waterSegments.some(({ points: [a, b], width: w }) => distanceToSegment(center, a, b) < clearance + w / 2 + 0.009)) continue;
        if (roadSegments.some(({ points: [a, b], width: w }) => distanceToSegment(center, a, b) < clearance * 0.62 + w / 2 + 0.004)) continue;
        if (occupied.some(other => distance(center, other.center) < (clearance + other.radius) * 0.84)) continue;
        occupied.push({ center, radius: clearance });
        const district = industrial ? "industrial" : center[0] > 0 ? "residential" : "civic";
        const height = industrial ? 0.071 + random(index + 3) * 0.025 : (band === 0 ? 0.078 : band === 1 ? 0.059 : 0.042) + random(index + 3) * 0.026;
        add(`block.${band}.${row}.${slot}`, industrial ? "factory" : "house", district, footprint, height,
          { roof: industrial || (band !== 0 && slot % 3 !== 0) ? "gable" : "flat", roofHeight: industrial ? 0.018 : 0.014 });
        if (industrial && factoryCount++ % 3 === 0) {
          const offset = polar(depth * 0.36, angle);
          addRound(`chimney.${band}.${row}.${slot}`, "chimney", "industrial", [center[0] + offset[0], center[1] + offset[1]], 0.006, 0.173);
        }
      }
    }
  }

  // Low, repeated white masses are punctuated by a few legible civic silhouettes.
  addRect("civic.market-hall", "market", "civic", civicSites[0].center, 0.095, 0.043, 0.072, Math.PI / 4, { roof: "gable", roofHeight: 0.027 });
  addRect("civic.assembly-hall", "civic", "civic", civicSites[1].center, 0.082, 0.050, 0.116, -Math.PI / 12, { roof: "gable", roofHeight: 0.032 });

  const wallHeight = layout.wall_height ?? 0.14, towerHeight = layout.watchtower_height ?? 0.20;
  const wallRadius = 1.035, wallSteps = 120;
  for (let i = 0; i < wallSteps; i++) {
    const a = i * TAU / wallSteps, b = (i + 1) * TAU / wallSteps;
    const middle = (a + b) / 2;
    if (Math.abs(Math.sin(middle * 2)) < 0.08) continue; // Four undecorated gate openings.
    if (waterSegments.some(({ points: [p, q], width }) => distanceToSegment(polar(wallRadius, middle), p, q) < width / 2 + 0.025)) continue;
    add(`wall.${i}`, "wall", "defence", [polar(wallRadius - 0.012, a), polar(wallRadius + 0.012, a), polar(wallRadius + 0.012, b), polar(wallRadius - 0.012, b)], wallHeight);
  }
  for (let i = 0; i < 16; i++) {
    const angle = i * TAU / 16;
    if (waterSegments.some(({ points: [p, q], width }) => distanceToSegment(polar(wallRadius, angle), p, q) < width / 2 + 0.035)) {
      for (const side of [-1, 1])
        addRect(`water-gate.${i}.${side}`, "gate", "defence", polar(wallRadius, angle + side * 0.06), 0.042, 0.043, towerHeight, angle);
      continue;
    }
    if (i % 4 === 0) {
      for (const side of [-1, 1])
        addRect(`gate.${i}.${side}`, "gate", "defence", polar(wallRadius, angle + side * 0.049), 0.052, 0.043, towerHeight, angle);
    } else {
      addRect(`watchtower.${i}`, "watchtower", "defence", polar(wallRadius, angle), 0.041, 0.041, towerHeight, angle);
    }
  }

  const bridges = [];
  for (const road of roadSegments) {
    for (const water of waterSegments) {
      const point = intersection(...road.points, ...water.points);
      if (!point || bridges.some(bridge => distance(bridge.center, point) < 0.035)) continue;
      const ab = subtract(road.points[1], road.points[0]), cd = subtract(water.points[1], water.points[0]);
      const angle = Math.atan2(ab[1], ab[0]);
      const sine = Math.abs(cross(ab, cd)) / (Math.hypot(...ab) * Math.hypot(...cd));
      const length = Math.min(0.16, (water.width + 0.024) / Math.max(0.3, sine));
      bridges.push({ id: `bridge.${bridges.length}`, center: point, points: rectangle(point, length, road.width * 1.35, angle), height: 0.009, base_height: 0.006 });
    }
  }

  return {
    center: [cx, cy],
    roads: roads.map(line => ({ ...line, points: line.points.map(map) })),
    waterways: waterways.map(line => ({ ...line, points: line.points.map(map) })),
    buildings: buildings.map(object => ({ ...object, points: object.points.map(map) })),
    bridges: bridges.map(object => ({ ...object, center: map(object.center), points: object.points.map(map) })),
  };
}
