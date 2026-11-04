/** Explicit author-directed additions; never edit sampled ownership or hide drift. */
export function applySchematicIslands(regions, config, columns, rows) {
  if (!config) return;
  if (!config.source || config.geometry_status !== 'provisional' || !Array.isArray(config.groups))
    throw new Error('Schematic islands require a source, provisional status and groups.');
  const occupied = new Set([...regions.values()].flatMap(set => [...set]));
  const ids = new Set();
  for (const group of config.groups) {
    if (!group.id || ids.has(group.id) || !regions.has(group.area_id) || !Array.isArray(group.cells) || !group.cells.length)
      throw new Error(`Invalid schematic island ${group.id}.`);
    ids.add(group.id);
    for (const cell of group.cells) {
      if (!Array.isArray(cell) || cell.length !== 2 || !cell.every(Number.isInteger) ||
          cell[0] < 0 || cell[0] >= columns || cell[1] < 0 || cell[1] >= rows)
        throw new Error(`Invalid cell on schematic island ${group.id}.`);
      const key = cell.join(':');
      if (occupied.has(key)) throw new Error(`Schematic island ${group.id} overlaps existing land at ${key}; review the source.`);
      occupied.add(key);
      regions.get(group.area_id).add(key);
    }
  }
}
