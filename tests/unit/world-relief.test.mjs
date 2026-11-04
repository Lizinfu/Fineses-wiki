import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';
import { createSpace } from '../../assets/scripts/atlas/space.mjs';
import { createBlockBoard } from '../../assets/scripts/atlas/blocks.mjs';
import { sampleRelief, validateWorldRelief } from '../../assets/scripts/atlas/world-relief.mjs';
import { applySchematicIslands } from '../../scripts/lib/map-islands.mjs';
const yaml = name => parse(fs.readFileSync(new URL(`../../data/maps/${name}.yaml`, import.meta.url), 'utf8'));
const config = yaml('world-relief');
const entityIds = new Set(Object.keys(JSON.parse(fs.readFileSync(new URL('../../data/generated/id-index.json', import.meta.url), 'utf8'))));
const data = {
  maps: yaml('layers').maps, tile_masks: yaml('tiles').masks,
  areas: yaml('areas').areas.filter(a => a.map_id === 'world'),
  detail_locations: yaml('locations').locations, feature_maps: yaml('features').maps,
  world_relief: config,
};
const countries = new Set(data.areas.filter(a => a.layer === 'country').map(a => a.id));
const space = createSpace(data), board = createBlockBoard(data, space);

test('world study covers all countries and rejects malformed or stale identities', () => {
  assert.deepEqual(validateWorldRelief(config, countries, space.root.grid, undefined, entityIds), []);
  const bad = structuredClone(config);
  bad.countries['country.yin'].zones[0].level = 2.5;
  bad.countries['country.gkrk'].base.material = 'unknown';
  bad.countries['country.unknown'] = bad.countries['country.yin'];
  const errors = validateWorldRelief(bad, countries, space.root.grid, undefined, entityIds).join('\n');
  assert.match(errors, /level must be an integer/);
  assert.match(errors, /unknown.*material/);
  assert.match(errors, /unknown country/);
  bad.countries['country.yin'].zones = [null, {shape: 'ellipse', center: [0.5, 0.5], radius: [0, 0], level: 1, material: 'constructor'}];
  const malformed = validateWorldRelief(bad, countries, space.root.grid, undefined, entityIds).join('\n');
  assert.match(malformed, /must be mappings/);
  assert.match(malformed, /invalid ellipse/);
  assert.match(malformed, /unknown material/);
});

test('world relief expresses directional terrain, highest plateau, desert and rainforest', () => {
  const at = (id, uv) => sampleRelief(config.countries['country.' + id], uv);
  assert.ok(at('amaterasu', [0.85, 0.85]).level > at('amaterasu', [0.1, 0.1]).level);
  assert.ok(at('yin', [0.85, 0.1]).level > at('yin', [0.1, 0.85]).level);
  assert.ok(at('havfrentyr', [0.9, 0.1]).level > at('havfrentyr', [0.1, 0.9]).level);
  assert.ok(at('sirena', [0.5, 0.25]).level > at('sirena', [0.5, 0.95]).level);
  assert.equal(at('esael', [0.5, 0.05]).material, 'desert');
  assert.equal(at('esael', [0.5, 0.85]).material, 'rainforest');
  const plateau = board.cells.filter(c => c.owner?.id === 'country.gkrk');
  assert.ok(plateau.length > 0 && plateau.every(c => c.level >= 5 && c.material === 'snow'));
  assert.ok(board.cells.filter(c => c.owner?.id !== 'country.gkrk').every(c => c.level < 5));
});

test('world modelling preserves political ownership and local Inibholc survey', () => {
  const old = createBlockBoard({ ...data, world_relief: undefined }, space);
  assert.equal(board.cells.length, old.cells.length);
  for (const c of board.cells) {
    assert.equal(c.owner?.id, old.cellIndex.get(c.id).owner?.id);
    assert.ok(Number.isInteger(c.level));
    if (c.owner?.id === 'country.inibholc') assert.equal(c.level, old.cellIndex.get(c.id).level);
  }
});

test('raised plateau surface and world wrap remain pickable', () => {
  for (const c of board.cells.filter(c => c.owner?.id === 'country.gkrk')) {
    for (const offset of [-space.period, 0, space.period]) {
      const p = board.raise(c.point);
      const hit = board.pick({ x: p.x + offset, y: p.y });
      assert.equal(hit?.area?.id, c.owner.id);
    }
  }
});

test('Aotelaisi is a connected ten-cell depression with unchanged 8/1/1 ownership', () => {
  const cells = board.cells.filter(c => c.region?.id === 'terrain.aotelaisi');
  assert.equal(cells.length, 10);
  assert.deepEqual(Object.fromEntries([...countries].map(id => [id, cells.filter(c => c.owner.id === id).length]).filter(([, n]) => n)), {
    'country.dunossai': 1, 'country.khaos': 8, 'country.sivlanzio': 1,
  });
  const reached = new Set([cells[0]]);
  for (let pass = 0; pass < cells.length; pass++)
    for (const c of cells)
      if ([...reached].some(n => Math.hypot(c.point.x - n.point.x, c.point.y - n.point.y) < c.radius * 1.74)) reached.add(c);
  assert.equal(reached.size, 10);
  for (const c of cells) {
    assert.ok(board.cellHeight(c) < 0);
    assert.equal(c.material, 'abyss');
    for (const offset of [-space.period, 0, space.period]) {
      const p = board.raise(c.point);
      // A front rim can occlude the centre of a deep cell; its visible northern floor remains pickable.
      assert.ok([0, -5, -10, -15].some(dy => board.pick({ x: p.x + offset, y: p.y + dy })?.cell.id === c.id));
    }
    assert.equal(board.cellHeight(c, false), 9);
  }
  const adjacent = board.cells.filter(c => !c.region && cells.some(n => Math.hypot(c.point.x - n.point.x, c.point.y - n.point.y) < c.radius * 1.74));
  assert.ok(adjacent.every(c => board.cellHeight(c) > board.cellHeight(cells[0])));
  assert.ok(adjacent.some(c => board.geometry(c).faces.some(f => f.points.slice(2).some(p => p.y > c.point.y + c.radius))));
});

test('cross-border relief rejects stale owners, overlapping cells and invalid depth', () => {
  const owners = new Map(board.cells.map(c => [c.id, c.owner?.id]));
  assert.deepEqual(validateWorldRelief(config, countries, space.root.grid, owners, entityIds), []);
  const bad = structuredClone(config), r = bad.regions[0];
  r.level = -7;
  r.entity_id = 'reg.missing';
  r.cells_by_country['country.dunossai'].push([74, 20]);
  r.label_cell = [0, 0];
  const errors = validateWorldRelief(bad, countries, space.root.grid, owners, entityIds).join('\n');
  assert.match(errors, /owner mismatch/);
  assert.match(errors, /overlapping region cell/);
  assert.match(errors, /label_cell must lie inside/);
  assert.match(errors, /integer from -6 to 6/);
  assert.match(errors, /entity_id must reference an existing public entity/);
});

test('coastal island additions are traceable and cannot overwrite sampled territory', () => {
  const islands = yaml('sources').sources.world.schematic_islands;
  for (const group of islands.groups)
    for (const [col, row] of group.cells)
      assert.equal(board.cellIndex.get(`${col}:${row}`)?.owner?.id, group.area_id);
  const regions = new Map([['country.test', new Set(['1:1'])]]);
  assert.throws(() => applySchematicIslands(regions, {
    source: 'test', geometry_status: 'provisional',
    groups: [{id: 'island.test', area_id: 'country.test', cells: [[1, 1]]}],
  }, 5, 5), /overlaps existing land/);
});

test('Sivlanzio has a mainland and three separated, subordinate island silhouettes', () => {
  const cells = board.cells.filter(c => c.owner?.id === 'country.sivlanzio');
  const remaining = new Set(cells), groups = [];
  while (remaining.size) {
    const queue = [remaining.values().next().value], group = [];
    remaining.delete(queue[0]);
    while (queue.length) {
      const c = queue.pop(); group.push(c);
      for (const other of remaining)
        if (Math.hypot(c.point.x - other.point.x, c.point.y - other.point.y) < c.radius * 1.74) {
          remaining.delete(other); queue.push(other);
        }
    }
    groups.push(group);
  }
  assert.deepEqual(groups.map(g => g.length).sort((a, b) => b - a), [96, 4, 4, 3]);
});
