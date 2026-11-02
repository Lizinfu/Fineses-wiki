// Pure, deterministic geometry shared by the browser renderer and Node tests.
// Heights are relative art parameters, never meters or surveyed elevations.
export function pointOnMap([x, y], grid) {
  const size = grid.hex_size;
  return {
    x: size * 2.25 + x * (grid.columns - 1) * size * 1.5,
    y:
      size * (1.25 + Math.sqrt(3) / 2) +
      y * (grid.rows - 1) * size * Math.sqrt(3),
  };
}

// Each feature selects a small integer terrace. There is no noise or continuous relief.
export function terraceLevelAt(x, y, terrain) {
  let level = 0;
  for (const feature of terrain) {
    const { center, radius } = feature.geometry;
    const d =
      ((x - center[0]) / radius[0]) ** 2 + ((y - center[1]) / radius[1]) ** 2;
    if (d > 1) continue;
    level = feature.elevation.level;
    if (
      feature.elevation.core_level !== undefined &&
      d <= feature.elevation.core_ratio ** 2
    )
      level = feature.elevation.core_level;
  }
  return level;
}

export function cityGeometry(feature) {
  const {
    center: [cx, cy],
    radius: [rx, ry],
  } = feature.geometry;
  const { rings, spokes, seed } = feature.layout;
  const point = (radius, angle) => [
    cx + rx * radius * Math.cos(angle),
    cy + ry * radius * Math.sin(angle),
  ];
  const roads = rings.map((radius) => ({
    closed: true,
    points: Array.from({ length: 72 }, (_, i) =>
      point(radius, (i * Math.PI) / 36),
    ),
  }));
  for (let i = 0; i < spokes; i++) {
    const angle = (i * Math.PI * 2) / spokes;
    roads.push({
      closed: false,
      points: [point(0.19, angle), point(1.04, angle)],
    });
  }
  const blocks = [];
  // Opposite sectors use the same park/roof choice, preserving 180-degree symmetry.
  for (let band = 0; band < rings.length; band++) {
    const inner = (band === 0 ? 0.2 : rings[band - 1]) + 0.028;
    const outer = rings[band] - 0.028;
    for (let sector = 0; sector < spokes; sector++) {
      const start = ((sector + 0.09) * Math.PI * 2) / spokes;
      const end = ((sector + 0.91) * Math.PI * 2) / spokes;
      const pairedSector = sector % (spokes / 2);
      const park = (pairedSector + band + seed) % 7 === 0;
      const points = [
        point(inner, start),
        point(outer, start),
        point(outer, end),
        point(inner, end),
      ];
      blocks.push({ points, park, shade: (pairedSector + band + seed) % 3 });
    }
  }
  const palace = [
    [-0.055, -0.13],
    [0.055, -0.13],
    [0.055, -0.055],
    [0.13, -0.055],
    [0.13, 0.055],
    [0.055, 0.055],
    [0.055, 0.13],
    [-0.055, 0.13],
    [-0.055, 0.055],
    [-0.13, 0.055],
    [-0.13, -0.055],
    [-0.055, -0.055],
  ].map(([x, y]) => [cx + x * rx, cy + y * ry]);
  return { roads, blocks, palace, center: [cx, cy] };
}
