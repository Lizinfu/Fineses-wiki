/** Art-directed world relief. Pure, deterministic, with no noise or invented metre elevations. */
export const MATERIALS = {
  temperate: 0xc3d3d6,
  stone: 0xb2c6d1,
  desert: 0xd6d0b9,
  rainforest: 0xb5ccc3,
  tundra: 0xc4d3de,
  snow: 0xe5eceb,
  ice: 0xd5e6ed,
  abyss: 0x21152f,
};

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1,
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function sampleRelief(profile, uv) {
  const result = { level: 0, material: 'temperate', ...profile?.base };
  for (const zone of profile?.zones ?? []) {
    const inside = zone.shape === 'ellipse'
      ? ((uv[0] - zone.center[0]) / zone.radius[0]) ** 2 +
        ((uv[1] - zone.center[1]) / zone.radius[1]) ** 2 <= 1
      : zone.points.slice(1).some((p, i) => segmentDistance(uv, zone.points[i], p) <= zone.width);
    if (inside) {
      result.level = zone.level;
      if (zone.material) result.material = zone.material;
    }
  }
  return result;
}

/** Country-relative coordinates use the source footprint; national detail grids can change independently. */
export function createWorldRelief(config, cells, columns, rows) {
  const frames = new Map();
  const overlays = new Map();
  for (const region of config?.regions ?? [])
    for (const [owner, coords] of Object.entries(region.cells_by_country))
      for (const [col, row] of coords) overlays.set(`${col}:${row}`, { owner, region });
  for (const cell of cells) {
    const id = cell.owner?.id;
    if (!id) continue;
    const f = frames.get(id) ?? { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    f.minX = Math.min(f.minX, cell.col); f.maxX = Math.max(f.maxX, cell.col);
    f.minY = Math.min(f.minY, cell.row); f.maxY = Math.max(f.maxY, cell.row);
    frames.set(id, f);
  }
  return (cell) => {
    const overlay = overlays.get(`${cell.col}:${cell.row}`);
    if (overlay && overlay.owner === cell.owner?.id)
      return { level: overlay.region.level, material: overlay.region.material, region: overlay.region };
    const profile = config?.countries?.[cell.owner?.id];
    const f = frames.get(cell.owner?.id);
    const uv = profile && f
      ? [(cell.col - f.minX) / Math.max(1, f.maxX - f.minX),
         (cell.row - f.minY) / Math.max(1, f.maxY - f.minY)]
      : [cell.col / (columns - 1), cell.row / (rows - 1)];
    return sampleRelief(profile ?? config?.wilderness, uv);
  };
}

/** Shared by the CLI gate and unit tests; malformed art data must fail before publication. */
export function validateWorldRelief(config, countryIds, grid, owners, entityIds) {
  const errors = [];
  const point = (p) => Array.isArray(p) && p.length === 2 && p.every(n => Number.isFinite(n) && n >= 0 && n <= 1);
  if (config?.version !== 1 || config?.geometry_status !== 'provisional' || !config?.source)
    errors.push('world-relief: version 1, source and provisional geometry status are required.');
  const profiles = config?.countries ?? {};
  for (const id of countryIds) if (!profiles[id]) errors.push(`world-relief: missing country ${id}.`);
  for (const id of Object.keys(profiles)) if (!countryIds.has(id)) errors.push(`world-relief: unknown country ${id}.`);
  for (const [id, profile] of [...Object.entries(profiles), ['wilderness', config?.wilderness]]) {
    if (!profile?.base || !Array.isArray(profile.zones)) {
      errors.push(`world-relief.${id}: base and zones are required.`); continue;
    }
    if (id !== 'wilderness' && (!profile.summary || !/^#[0-9a-f]{6}$/i.test(profile.border ?? '')))
      errors.push(`world-relief.${id}: summary and hex border colour are required.`);
    if (!Object.hasOwn(MATERIALS, profile.base.material)) errors.push(`world-relief.${id}: unknown base material.`);
    for (const entry of [profile.base, ...profile.zones]) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`world-relief.${id}: terrain entries must be mappings.`);
        continue;
      }
      if (!Number.isInteger(entry.level) || entry.level < 0 || entry.level > 6)
        errors.push(`world-relief.${id}: level must be an integer from 0 to 6.`);
      if (entry.material !== undefined && !Object.hasOwn(MATERIALS, entry.material)) errors.push(`world-relief.${id}: unknown material.`);
    }
    for (const z of profile.zones) {
      if (!z || typeof z !== 'object' || Array.isArray(z)) continue;
      if (z.shape === 'ellipse') {
        if (!point(z.center) || !point(z.radius) || z.radius.some(v => v === 0)) errors.push(`world-relief.${id}: invalid ellipse.`);
      } else if (z.shape === 'ridge') {
        if (!Array.isArray(z.points) || z.points.length < 2 || !z.points.every(point) || !(z.width > 0 && z.width <= 1)) errors.push(`world-relief.${id}: invalid ridge.`);
      } else errors.push(`world-relief.${id}: unsupported zone shape.`);
    }
  }
  if (!Array.isArray(config?.ice) || config.ice.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isInteger) || p[0] < 0 || p[0] >= grid.columns || p[1] < 0 || p[1] >= grid.rows))
    errors.push('world-relief: ice must use valid world cells.');
  const validCell = p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && p[0] >= 0 && p[0] < grid.columns && p[1] >= 0 && p[1] < grid.rows;
  const occupied = new Set(), ids = new Set();
  if (config?.regions !== undefined && !Array.isArray(config.regions)) errors.push('world-relief: regions must be an array.');
  for (const region of Array.isArray(config?.regions) ? config.regions : []) {
    const prefix = `world-relief.${region?.id ?? 'region'}`;
    if (!region || !/^terrain\.[a-z0-9.-]+$/.test(region.id) || ids.has(region.id)) {
      errors.push(`${prefix}: missing or duplicate region id.`); continue;
    }
    ids.add(region.id);
    if (region.entity_id !== undefined && (!entityIds || !entityIds.has(region.entity_id)))
      errors.push(`${prefix}: entity_id must reference an existing public entity.`);
    if (!region.label || !region.foreign_label || !region.description || !region.source || !['provisional', 'verified'].includes(region.geometry_status))
      errors.push(`${prefix}: names, description, source and geometry status are required.`);
    if (!Number.isInteger(region.level) || region.level < -6 || region.level > 6)
      errors.push(`${prefix}: level must be an integer from -6 to 6.`);
    if (!Object.hasOwn(MATERIALS, region.material)) errors.push(`${prefix}: unknown material.`);
    const cells = new Set();
    if (!region.cells_by_country || typeof region.cells_by_country !== 'object' || Array.isArray(region.cells_by_country))
      errors.push(`${prefix}: cells_by_country must be a mapping.`);
    for (const [owner, coords] of Object.entries(region.cells_by_country ?? {})) {
      if (!countryIds.has(owner)) errors.push(`${prefix}: unknown country ${owner}.`);
      if (!Array.isArray(coords) || !coords.length) { errors.push(`${prefix}: cells must be a nonempty array.`); continue; }
      for (const p of coords) {
        if (!validCell(p)) { errors.push(`${prefix}: invalid world cell.`); continue; }
        const key = p.join(':');
        if (occupied.has(key)) errors.push(`${prefix}: overlapping region cell ${key}.`);
        occupied.add(key); cells.add(key);
        if (owners && owners.get(key) !== owner) errors.push(`${prefix}: owner mismatch at ${key}; review geometry after source changes.`);
      }
    }
    if (!cells.size || !validCell(region.label_cell) || !cells.has(region.label_cell.join(':')))
      errors.push(`${prefix}: label_cell must lie inside the region.`);
  }
  return errors;
}
