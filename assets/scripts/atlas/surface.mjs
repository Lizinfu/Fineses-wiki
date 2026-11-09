import { hexagon } from "./space.mjs";

const PRECISION = 1e-7;
const coordinate = value => Math.round(value / PRECISION);
const pointKey = point => `${coordinate(point.x)}:${coordinate(point.y)}`;
const sameHeight = (a, b) => coordinate(a) === coordinate(b);

function areaOf(points) {
  // Work relative to one vertex to avoid cancellation at large wrapped coordinates.
  const origin = points[0];
  let area = 0;
  for (let i = 1; i < points.length - 1; i++)
    area += (points[i].x - origin.x) * (points[i + 1].y - origin.y) -
      (points[i + 1].x - origin.x) * (points[i].y - origin.y);
  return area / 2;
}

function contains(points, point) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

function boundaryLoops(edges, height) {
  const outgoing = new Map();
  for (const edge of edges) {
    const key = pointKey(edge.a), list = outgoing.get(key) ?? [];
    list.push(edge);
    outgoing.set(key, list);
  }
  const visited = new Set(), loops = [];
  for (const first of edges) {
    if (visited.has(first)) continue;
    const points = [], start = pointKey(first.a);
    let edge = first;
    while (edge && !visited.has(edge)) {
      visited.add(edge);
      points.push({ x: edge.a.x, y: edge.a.y - height });
      const end = pointKey(edge.b);
      if (end === start) break;
      edge = outgoing.get(end)?.find(candidate => !visited.has(candidate));
    }
    if (!edge || pointKey(edge.b) !== start)
      throw new Error("Surface boundary is not a closed hexagon union");
    const area = areaOf(points);
    if (Math.abs(area) > PRECISION) loops.push({ points, hole: area < 0, area });
  }
  const result = [], holes = new Set(loops.filter(loop => loop.hole));
  for (const outer of loops.filter(loop => !loop.hole).sort((a, b) => b.area - a.area)) {
    result.push(outer);
    for (const hole of holes)
      if (contains(outer.points, hole.points[0])) {
        result.push(hole);
        holes.delete(hole);
      }
  }
  result.push(...holes);
  return result;
}

/**
 * Union adjacent hex tops with the same displayed height and rendering group.
 * `groupOf` can preserve material/owner or urban/outskirts shading independently.
 * Geometry points are already raised (y - height); logical cells are unchanged.
 * Wrapped components are unfolded to one continuous copy; include patch.bounds
 * in the renderer's repeated-world bounds. A component winding all the way around
 * the world retains a planar cut, without treating that cut as an exposed edge.
 *
 * @param {any[]} cells
 * @param {{heightOf: (cell: any) => number, groupOf?: (cell: any) => string | number | boolean,
 *   materialOf?: (cell: any) => any, period?: number}} options
 */
export function buildSurfacePatches(cells, {
  heightOf,
  groupOf = cell => cell.material ?? "",
  materialOf = cell => cell.material,
  period = 0,
} = {}) {
  if (typeof heightOf !== "function") throw new TypeError("Surface heightOf is required");
  const wrapping = Number.isFinite(period) && period > 0,
    wrappedPointKey = point => {
      if (!wrapping) return pointKey(point);
      let x = ((point.x % period) + period) % period;
      if (x < PRECISION || period - x < PRECISION) x = 0;
      return `${coordinate(x)}:${coordinate(point.y)}`;
    },
    edgeIndex = new Map(),
    items = cells.map((cell, index) => {
      const height = heightOf(cell);
      if (!Number.isFinite(height) || !Number.isFinite(cell.point?.x) ||
        !Number.isFinite(cell.point?.y) || !Number.isFinite(cell.radius) || cell.radius <= 0)
        throw new TypeError("Surface cells require finite points, heights and positive radii");
      return { cell, index, height, group: String(groupOf(cell)), material: materialOf(cell),
        polygon: hexagon(cell.point, cell.radius), edges: [] };
    });
  for (const item of items)
    for (let i = 0; i < 6; i++) {
      const a = item.polygon[i], b = item.polygon[(i + 1) % 6],
        first = wrappedPointKey(a), second = wrappedPointKey(b),
        id = first < second ? `${first}|${second}` : `${second}|${first}`,
        edge = { item, a, b, neighbour: undefined },
        other = edgeIndex.get(id);
      if (other) {
        if (other.neighbour) throw new Error("Overlapping surface cells share more than two edges");
        edge.neighbour = other;
        other.neighbour = edge;
      } else edgeIndex.set(id, edge);
      item.edges.push(edge);
    }

  const visited = new Set(), patches = [];
  for (const root of items) {
    if (visited.has(root)) continue;
    const component = [root], offsets = new Map([[root, 0]]);
    let winding = false;
    visited.add(root);
    for (let i = 0; i < component.length; i++)
      for (const edge of component[i].edges) {
        const neighbour = edge.neighbour?.item;
        if (!neighbour || !sameHeight(root.height, neighbour.height) || neighbour.group !== root.group) continue;
        const offset = offsets.get(component[i]) + (wrapping
          ? Math.round((edge.a.x - edge.neighbour.b.x) / period) * period : 0);
        if (offsets.has(neighbour)) {
          if (Math.abs(offsets.get(neighbour) - offset) > PRECISION) winding = true;
        } else {
          offsets.set(neighbour, offset);
          visited.add(neighbour);
          component.push(neighbour);
        }
      }
    if (winding) for (const item of component) offsets.set(item, 0);

    const boundary = [], exposedEdges = [];
    for (const item of component)
      for (const edge of item.edges) {
        const neighbour = edge.neighbour?.item,
          offset = offsets.get(item),
          a = { x: edge.a.x + offset, y: edge.a.y },
          b = { x: edge.b.x + offset, y: edge.b.y },
          joined = neighbour && offsets.has(neighbour) &&
            pointKey(a) === pointKey({ x: edge.neighbour.b.x + offsets.get(neighbour), y: edge.neighbour.b.y }) &&
            pointKey(b) === pointKey({ x: edge.neighbour.a.x + offsets.get(neighbour), y: edge.neighbour.a.y });
        if (!joined) boundary.push({ a, b });
        if (!neighbour || !sameHeight(item.height, neighbour.height))
          exposedEdges.push({
            points: [{ x: a.x, y: a.y - root.height }, { x: b.x, y: b.y - root.height }],
            cell: item.cell,
            neighbor: neighbour?.cell,
            neighborHeight: neighbour?.height,
          });
      }
    const loops = boundaryLoops(boundary, root.height),
      bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const loop of loops)
      for (const point of loop.points) {
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.minY = Math.min(bounds.minY, point.y);
        bounds.maxY = Math.max(bounds.maxY, point.y);
      }
    patches.push({
      key: `${coordinate(root.height)}:${root.group}:${root.index}`,
      height: root.height,
      material: root.material,
      cells: component.map(item => item.cell),
      loops,
      exposedEdges,
      bounds,
    });
  }
  return patches;
}
