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
    const slope = feature.elevation.slope;
    if (slope) {
      const [dx, dy] = slope.direction;
      const projection = ((x - center[0]) / radius[0] * dx + (y - center[1]) / radius[1] * dy) / Math.hypot(dx, dy);
      const fraction = Math.max(0, Math.min(1, (projection + 1) / 2));
      level += Math.round(fraction * slope.levels);
      continue;
    }
    if (
      feature.elevation.core_level !== undefined &&
      d <= feature.elevation.core_ratio ** 2
    )
      level = feature.elevation.core_level;
  }
  return level;
}

export { cityGeometry } from "./city.mjs";
