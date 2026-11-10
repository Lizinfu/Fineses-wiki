import { Application, Container, Graphics } from "pixi.js";
import { cityGeometry } from "./terrain.mjs";
import { hexCenter, hexagon } from "./space.mjs";
import { prismGeometry } from "./blocks.mjs";
import { MATERIALS } from "./world-relief.mjs";
import { visibleWorldCopies } from "./viewport.mjs";
import { cityContextTiles } from "./city-context.mjs";
import { buildSurfacePatches } from "./surface.mjs";
import { LIGHT_DIRECTION, litColor, sideNormal, faceNormal } from "./lighting.mjs";

export type Point = { x: number; y: number };
type Polygon = Point[];
const palette = [
  0xb3c4cf, 0xc9c6b3, 0x9fbdb1, 0xa8b6d0, 0xc3adbf, 0xcbb39c, 0x9cbbb9,
  0x95b5c3, 0xb4abc7, 0x9aaecb, 0xc8c395, 0xc6a6a8, 0xb0bf9b,
];
function mix(a: number, b: number, t: number) {
  const c = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
function polygon(g: Graphics, points: Polygon, color: number, alpha = 1) {
  g.poly(points.flatMap((p) => [p.x, p.y])).fill({ color, alpha });
}
function path(
  g: Graphics,
  points: Point[],
  color: number,
  width: number,
  alpha = 1,
  closed = false,
) {
  if (!points.length) return;
  g.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) g.lineTo(p.x, p.y);
  if (closed) g.closePath();
  g.stroke({ color, width, alpha, join: "round", cap: "round" });
}
function outline(
  g: Graphics,
  segments: [Point, Point][],
  color: number,
  width: number,
  scale: number,
) {
  g.clear();
  for (const style of [
    { color: 0xdcecf0, width: (width + 1) / scale, alpha: 0.6 },
    { color, width: width / scale, alpha: 1 },
  ]) {
    for (const [a, b] of segments) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    g.stroke(style);
  }
}
function prism(
  g: Graphics,
  geometry: ReturnType<typeof prismGeometry>,
  topColor: number,
) {
  for (const face of geometry.faces) {
    const [a, b] = face.points;
    polygon(g, face.points, litColor(topColor, sideNormal(a, b)));
  }
  polygon(g, geometry.top, litColor(topColor, [0, 0, 1]));
}

function containsPoint(point: Point, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Opaque connected underlays close anti-alias fringes without expanding the land. */
function surfaceFill(g: Graphics, patch: any, color: number) {
  for (const loop of patch.loops.filter((loop: any) => !loop.hole)) {
    polygon(g, loop.points, color);
    for (const hole of patch.loops.filter((hole: any) => hole.hole))
      if (containsPoint(hole.points[0], loop.points))
        g.poly(hole.points.flatMap((p: Point) => [p.x, p.y])).cut();
  }
}

/** Light only real ledges; flat shared edges have neither AO nor a bright rim. */
function surfaceEdges(g: Graphics, patches: any[], width: number, period = 0) {
  for (const patch of patches) for (const edge of patch.exposedEdges) {
    const [a, b] = edge.points as [Point, Point];
    if (edge.neighbor && edge.neighborHeight > patch.height + 1e-7) {
      const center = { x: edge.cell.point.x, y: edge.cell.point.y - patch.height },
        middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (period > 0) center.x += Math.round((middle.x - center.x) / period) * period;
      const length = Math.hypot(center.x - middle.x, center.y - middle.y),
        dx = (center.x - middle.x) / length, dy = (center.y - middle.y) / length;
      for (let layer = 3; layer >= 1; layer--) {
        const spread = width * layer;
        polygon(g, [a, b, { x: b.x + dx * spread, y: b.y + dy * spread },
          { x: a.x + dx * spread, y: a.y + dy * spread }], 0x000000, 0.045);
      }
    } else {
      const normal = sideNormal(a, b),
        facing = Math.max(0, normal[0] * LIGHT_DIRECTION[0] + normal[1] * LIGHT_DIRECTION[1]);
      if (facing > 0) path(g, [a, b], 0xffffff, width * 0.6, facing * 0.22);
    }
  }
}

function softContact(g: Graphics, footprint: Polygon, width: number) {
  const center = footprint.reduce((p, q) => ({ x: p.x + q.x / footprint.length,
    y: p.y + q.y / footprint.length }), { x: 0, y: 0 });
  for (let layer = 4; layer >= 1; layer--) {
    const spread = width * layer / 4;
    polygon(g, footprint.map(p => {
      const length = Math.hypot(p.x - center.x, p.y - center.y) || 1;
      return { x: p.x + (p.x - center.x) / length * spread,
        y: p.y + (p.y - center.y) / length * spread };
    }), 0x000000, 0.065);
  }
}

/** End rivers at the sampled landscape boundary, including between control points. */
function clipCityWater(points: Point[], board: any, id: string, radius: number): Point[][] {
  const runs: Point[][] = [];
  let previous = points[0],
    inside = previous && board.containsCity(id, previous),
    run: Point[] = inside ? [previous] : [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i],
      steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (radius * 0.25)));
    for (let step = 1; step <= steps; step++) {
      const p = { x: a.x + (b.x - a.x) * step / steps, y: a.y + (b.y - a.y) * step / steps },
        nextInside = board.containsCity(id, p);
      if (nextInside !== inside) {
        let known = inside ? previous : p, unknown = inside ? p : previous;
        for (let split = 0; split < 10; split++) {
          const middle = { x: (known.x + unknown.x) / 2, y: (known.y + unknown.y) / 2 };
          if (board.containsCity(id, middle)) known = middle;
          else unknown = middle;
        }
        if (inside) {
          run.push(known);
          if (run.length > 1) runs.push(run);
          run = [];
        } else run = [known];
      }
      if (nextInside) run.push(p);
      previous = p;
      inside = nextInside;
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

/** Two planar roof slopes keep even the small houses readable as white physical models. */
function gableRoof(g: Graphics, footprint: Polygon, eave: number, rise: number, color: number) {
  if (footprint.length !== 4) return;
  const p = footprint.map(v => ({ x: v.x, y: v.y - eave }));
  const ridge = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - rise });
  const a = ridge(p[0], p[3]), b = ridge(p[1], p[2]);
  const ridge3 = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: eave + rise }),
    raw = footprint.map(p => ({ ...p, z: eave })),
    ra = ridge3(footprint[0], footprint[3]), rb = ridge3(footprint[1], footprint[2]);
  const faces = [
    { points: [p[0], p[1], b, a], normal: faceNormal([raw[0], raw[1], rb, ra]) },
    { points: [p[2], p[3], a, b], normal: faceNormal([raw[2], raw[3], ra, rb]) },
    { points: [p[0], a, p[3]], normal: faceNormal([raw[0], ra, raw[3]]) },
    { points: [p[1], p[2], b], normal: faceNormal([raw[1], raw[2], rb]) },
  ].sort((a, b) => a.points.reduce((s, p) => s + p.y, 0) / a.points.length -
                      b.points.reduce((s, p) => s + p.y, 0) / b.points.length);
  for (const face of faces) polygon(g, face.points, litColor(color, face.normal));
}

/** Recesses belong to the landmark alone; ordinary buildings remain abstract masses. */
function palaceRecesses(g: Graphics, geometry: ReturnType<typeof prismGeometry>, scale: number) {
  for (const face of geometry.faces) {
    const [a, b, c, d] = face.points,
      length = Math.hypot(b.x - a.x, b.y - a.y),
      count = Math.min(12, Math.floor(length / (scale * 0.023)));
    if (count < 2) continue;
    const at = (u: number, v: number) => ({
      x: (a.x + (b.x - a.x) * u) * (1 - v) + (d.x + (c.x - d.x) * u) * v,
      y: (a.y + (b.y - a.y) * u) * (1 - v) + (d.y + (c.y - d.y) * u) * v,
    });
    for (let i = 0; i < count; i++)
      for (const row of [0.28, 0.62]) {
        const u = (i + 0.5) / count, half = 0.16 / count;
        polygon(g, [at(u - half, row), at(u + half, row),
          at(u + half, row + 0.16), at(u - half, row + 0.16)], 0x9caeb4, 0.8);
      }
  }
}

/** Every copy shares draw instructions; only strips intersecting the viewport are shown. */
function repeatedGraphics(
  parent: Container,
  original: Container,
  period: number,
  bounds: { minX: number; maxX: number },
) {
  const sources = original.children as Graphics[],
    copies = new Map<number, Container>([[0, original]]);
  parent.addChild(original);
  return {
    update(camera: { x: number; zoom: number }, width: number, enabled = true) {
      for (const group of copies.values()) group.visible = false;
      if (!enabled) return;
      for (const index of visibleWorldCopies(camera, width, period, bounds, 8 / camera.zoom)) {
        let group = copies.get(index);
        if (!group) {
          group = new Container();
          group.addChild(...sources.map(source => new Graphics(source.context)));
          group.x = index * period;
          copies.set(index, group);
          parent.addChild(group);
        }
        group.visible = true;
        for (let i = 0; i < sources.length; i++) {
          const copy = group.children[i] as Graphics;
          copy.visible = sources[i].visible;
          copy.tint = sources[i].tint;
        }
      }
    },
  };
}

export async function createRenderer(
  host: HTMLElement,
  data: any,
  space: any,
  board: any,
) {
  const app = new Application(),
    canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    premultipliedAlpha: true,
    stencil: true,
  });
  if (!context) throw new Error("WebGL2 is unavailable");
  await app.init({
    canvas,
    context,
    width: host.clientWidth,
    height: host.clientHeight,
    preference: "webgl",
    antialias: true,
    resolution: Math.min(devicePixelRatio || 1, 2),
    autoDensity: true,
    autoStart: false,
    backgroundColor: 0xa9c4d2,
  });
  host.prepend(app.canvas);
  app.canvas.className = "atlas-pixi-canvas";
  app.canvas.setAttribute("aria-hidden", "true");
  const root = new Container();
  app.stage.addChild(root);
  const seaLayer = new Container(),
    worldLayer = new Container(),
    contextLayer = new Container(),
    detailLayer = new Container(),
    borderLayer = new Container(),
    selectionLayer = new Container();
  root.addChild(seaLayer, worldLayer, contextLayer, detailLayer, borderLayer, selectionLayer);
  // The missing survey is a display surface, never additional political territory.
  const contextGround = new Graphics(),
    contextSeams = new Graphics(),
    contextTraces = new Graphics(),
    contextFlow = new Graphics();
  contextLayer.addChild(contextGround, contextSeams, contextTraces, contextFlow);
  contextLayer.visible = false;
  let contextKey = "",
    flowPaths: { points: Point[]; lengths: number[]; total: number; phase: number }[] = [],
    flowFrame = 0,
    lastFlowFrame = 0;
  const motion = matchMedia("(prefers-reduced-motion: reduce)"),
    motionAbort = new AbortController();
  function drawFlow(now: number) {
    contextFlow.clear();
    for (const trace of flowPaths) {
      const start = ((now / 14000 + trace.phase) % 1) * trace.total,
        end = Math.min(trace.total, start + trace.total * 0.16);
      let distance = 0;
      for (let i = 1; i < trace.points.length; i++) {
        const a = trace.points[i - 1], b = trace.points[i],
          length = trace.lengths[i - 1],
          from = Math.max(0, (start - distance) / length),
          to = Math.min(1, (end - distance) / length);
        if (from < to) {
          contextFlow.moveTo(a.x + (b.x - a.x) * from, a.y + (b.y - a.y) * from)
            .lineTo(a.x + (b.x - a.x) * to, a.y + (b.y - a.y) * to);
        }
        distance += length;
      }
    }
    contextFlow.stroke({ color: 0x657572, width: 0.22, alpha: 0.4, cap: "round" });
  }
  const canAnimate = () => contextLayer.visible && !motion.matches && !document.hidden;
  function animateFlow(now: number) {
    flowFrame = 0;
    if (!canAnimate()) return;
    // Animate only the small flow overlay; camera, labels and cached ground stay put.
    if (now - lastFlowFrame >= 1000 / 24) {
      drawFlow(now);
      app.render();
      lastFlowFrame = now;
    }
    flowFrame = requestAnimationFrame(animateFlow);
  }
  function syncMotion() {
    if (canAnimate()) {
      if (!flowFrame) flowFrame = requestAnimationFrame(animateFlow);
    } else {
      cancelAnimationFrame(flowFrame);
      flowFrame = 0;
    }
  }
  const refreshMotion = () => {
    if (contextLayer.visible && !document.hidden) {
      drawFlow(motion.matches ? 0 : performance.now());
      app.render();
    }
    syncMotion();
  };
  motion.addEventListener("change", refreshMotion, { signal: motionAbort.signal });
  document.addEventListener("visibilitychange", refreshMotion, { signal: motionAbort.signal });
  function drawContext(cityId: string, camera: any, elevated: boolean, grid: boolean) {
    const city = board.cities.get(cityId),
      height = board.foundationHeight(city, elevated),
      context = cityContextTiles(camera, host.clientWidth, host.clientHeight, city, space.period, height);
    contextLayer.y = -height;
    contextSeams.visible = grid;
    if (context.cells.length && contextKey === context.key) return;
    contextKey = context.key;
    contextGround.clear();
    contextSeams.clear();
    contextTraces.clear();
    flowPaths = [];
    if (!context.cells.length) {
      contextFlow.clear();
      contextLayer.visible = false;
      return;
    }
    const radius = context.radius,
      points = context.cells.map(cell => cell.point),
      minX = Math.min(...points.map(p => p.x)) - radius,
      minY = Math.min(...points.map(p => p.y)) - radius,
      maxX = Math.max(...points.map(p => p.x)) + radius,
      maxY = Math.max(...points.map(p => p.y)) + radius;
    // An opaque underlay closes the seams even where the parent map was ocean.
    contextGround.rect(minX, minY, maxX - minX, maxY - minY).fill(0xe8ebea);
    for (const cell of context.cells) {
      path(contextSeams, hexagon(cell.point, radius), 0x9ca8a5, 0.18, 0.65, true);
      path(contextTraces, cell.trace, 0x8a9492, 0.14, 0.3);
      const lengths = cell.trace.slice(1).map((p, i) => Math.hypot(p.x - cell.trace[i].x, p.y - cell.trace[i].y));
      const total = lengths.reduce((sum, length) => sum + length, 0);
      if (total > 0) flowPaths.push({ points: cell.trace, lengths, total,
        phase: (((cell.col * 13 + cell.row * 23) % 97) + 97) % 97 / 97 });
    }
    drawFlow(motion.matches ? 0 : performance.now());
  }
  const extent = board.bounds(),
    worldBounds = { minX: extent.minX - 8, maxX: extent.maxX + 8 };
  const countries = data.areas.filter((a: any) => a.layer === "country"),
    countryColors = new Map(
      countries.map((a: any, i: number) => [a.id,
        data.world_relief?.countries[a.id]?.border
          ? parseInt(data.world_relief.countries[a.id].border.slice(1), 16)
          : palette[i % palette.length]]),
    );
  const sea = new Graphics(),
    worldGrid = space.root.grid;
  for (let col = 0; col < worldGrid.columns; col++)
    for (let row = -40; row < worldGrid.rows + 40; row++) {
      const p = hexCenter(col, row, worldGrid);
      path(
        sea,
        hexagon(p, worldGrid.hex_size * 0.98),
        0x7394a4,
        0.7,
        0.24,
        true,
      );
    }
  // Floating ice is a cartographic environment symbol, never a political land tile.
  for (const [col, row] of data.world_relief?.ice ?? []) {
    const p = hexCenter(col, row, worldGrid);
    if (board.logicalCell(p)) continue;
    const geometry = prismGeometry(hexagon(p, worldGrid.hex_size * 0.48), 2);
    prism(sea, geometry, 0xa9c4d2);
  }
  const seaTemplate = new Container();
  seaTemplate.addChild(sea);
  const seaCopies = repeatedGraphics(seaLayer, seaTemplate, space.period, {
    minX: hexCenter(0, 0, worldGrid).x - worldGrid.hex_size,
    maxX: hexCenter(worldGrid.columns - 1, 0, worldGrid).x + worldGrid.hex_size,
  });
  const worldModes = new Map<
    string,
    { repeated: ReturnType<typeof repeatedGraphics>; body: Graphics; seams: Graphics }
  >();
  function worldMode(elevated: boolean, political: boolean) {
    const key = `${elevated}:${political}`;
    if (worldModes.has(key)) return worldModes.get(key)!;
    const body = new Graphics(),
      contacts = new Graphics(),
      seams = new Graphics();
    const colorOf = (cell: any) => {
      const level = elevated ? cell.level : 0,
        material = MATERIALS[cell.material as keyof typeof MATERIALS] ?? MATERIALS.temperate,
        neutral = mix(material, 0xf2f4ed, Math.max(0, level) * 0.035);
      return political && !cell.region
          ? mix(
              neutral,
              (countryColors.get(cell.owner?.id) as number) ?? neutral,
              0.26,
            )
          : neutral;
    };
    const patches = buildSurfacePatches(board.cells, {
      heightOf: (cell: any) => board.heightAt(cell.point, undefined, elevated),
      groupOf: (cell: any) => String(colorOf(cell)),
      period: space.period,
    });
    for (const patch of patches) surfaceFill(body, patch, litColor(colorOf(patch.cells[0]), [0, 0, 1]));
    for (const cell of board.cells) {
      const g = board.geometry(cell, elevated);
      prism(body, g, colorOf(cell));
      path(seams, g.top, 0x668392, 0.45, 0.46, true);
    }
    surfaceEdges(contacts, patches, 0.5, space.period);
    const group = new Container();
    group.addChild(body, contacts, seams);
    const bounds = group.getLocalBounds();
    const entry = { repeated: repeatedGraphics(worldLayer, group, space.period, {
      minX: Math.min(worldBounds.minX, bounds.minX), maxX: Math.max(worldBounds.maxX, bounds.maxX),
    }), body, seams };
    worldModes.set(key, entry);
    return entry;
  }
  const selected = new Graphics();
  const borders = countries.map((area: any, i: number) => ({
    area,
    // Keep the existing border hue readable independently of the model lighting.
    color: mix(0x000000, mix(0x233c4d, countryColors.get(area.id) as number, 0.8), 0.92),
    graphic: new Graphics(),
  }));
  const borderTemplate = new Container(), selectionTemplate = new Container();
  borderTemplate.addChild(...borders.map((b: any) => b.graphic));
  selectionTemplate.addChild(selected);
  const borderCopies = repeatedGraphics(borderLayer, borderTemplate, space.period, worldBounds),
    selectionCopies = repeatedGraphics(selectionLayer, selectionTemplate, space.period, worldBounds);
  const details = new Map<string, any>();
  function detail(id: string, elevated: boolean) {
    const key = `${id}:${elevated}`;
    if (details.has(key)) return details.get(key);
    const features = data.feature_maps[id],
      group = new Container(),
      ground = new Graphics(),
      terrainContacts = new Graphics(),
      seams = new Graphics(),
      water = new Graphics(),
      roads = new Graphics(),
      shadows = new Graphics(),
      contacts = new Graphics(),
      buildings = new Graphics();
    const city = board.cities.get(id);
    if (city) {
      const colorOf = (cell: any) => cell.outskirts
            ? mix(0xb4b9a5, 0xd4d3be, Math.min(0.6, (elevated ? cell.level : 0) * 0.08))
            : mix(0xc6d0d3, 0xe0e6e6, (elevated ? cell.level : 0) * 0.1),
        patches = buildSurfacePatches(city.cells, {
          heightOf: (cell: any) => board.localHeight(city, cell, elevated),
          groupOf: (cell: any) => String(colorOf(cell)),
        });
      for (const patch of patches) surfaceFill(ground, patch, litColor(colorOf(patch.cells[0]), [0, 0, 1]));
      for (const cell of city.cells) {
        const g = board.geometry(cell, elevated, id);
        prism(ground, g, colorOf(cell));
        path(seams, g.top, cell.outskirts ? 0xb0b49e : 0xa4b6bd, 0.015, 0.16, true);
      }
      surfaceEdges(terrainContacts, patches, city.radius * 0.075);
    }
    const raw = (points: any[]) => points.map((p) => space.normalized(id, p)),
      drape = (points: any[]) =>
        board.drape(raw(points), city ? id : undefined, elevated);
    for (const f of features?.waterways ?? []) {
      const points = drape(f.geometry.points);
      path(water, points, 0x456f80, 3, 0.85);
      path(water, points, 0x77bac6, 1.7, 1);
    }
    for (const f of features?.routes ?? [])
      path(roads, drape(f.geometry.points), 0xe1ddc6, 0.8);
    for (const f of features?.settlements ?? []) {
      if (f.kind !== "concentric-city") continue;
      const plan = cityGeometry(f),
        scale = Math.min(city.rx, city.ry);
      for (const stream of plan.waterways) {
        const points = stream.closed ? [...stream.points, stream.points[0]] : stream.points,
          runs = clipCityWater(raw(points), board, id, city.radius);
        for (const run of runs) {
          const surface = board.drape(run, id, elevated);
          // Opaque blue water covers terrain seams without a dark bank stroke.
          path(water, surface, 0x85b2bd, stream.width * scale);
          path(water, surface, 0xb1ced2, stream.width * scale * 0.3, 0.3);
        }
      }
      for (const road of plan.roads) {
        const points = road.closed
          ? [...road.points, road.points[0]]
          : road.points;
        path(roads, drape(points), 0xb0bfc4, road.width * scale * 1.5);
        path(roads, drape(points), 0xe5e9e7, road.width * scale);
      }
      const objects = [...plan.buildings, ...plan.bridges.map((bridge: any) => ({ ...bridge, kind: "bridge" }))].map((object: any) => {
        const points = raw(object.points),
          center = { x: points.reduce((s: number, p: Point) => s + p.x, 0) / points.length,
                     y: points.reduce((s: number, p: Point) => s + p.y, 0) / points.length };
        return { ...object, points, center };
      });
      objects.sort((a, b) => a.center.y - b.center.y);
      for (const object of objects) {
        const groundHeights = [object.center, ...object.points].map((point: Point) => board.heightAt(point, id, elevated)),
          h = Math.max(...groundHeights) + (object.base_height ?? 0) * scale,
          top = h + object.height * scale,
          geometry = prismGeometry(object.points, top, object.kind === "bridge" ? h : Math.min(...groundHeights)),
          color = object.district === 'palace' ? 0xf0f1eb : 0xe5e9e8;
        polygon(shadows, object.points.map((p: Point) => {
          const ground = board.raise(p, id, elevated);
          return { x: ground.x - object.height * scale * LIGHT_DIRECTION[0] / LIGHT_DIRECTION[2],
            y: ground.y - object.height * scale * LIGHT_DIRECTION[1] / LIGHT_DIRECTION[2] };
        }), 0x000000, 0.13);
        if (object.kind !== "bridge") softContact(contacts,
          object.points.map((p: Point) => board.raise(p, id, elevated)),
          Math.min(scale * 0.018, Math.max(scale * 0.007, object.height * scale * 0.09)));
        prism(buildings, geometry, color);
        if (object.district === 'palace' && ['palace', 'chapel'].includes(object.kind))
          palaceRecesses(buildings, geometry, scale);
        if (object.roof === 'gable')
          gableRoof(buildings, object.points, top, (object.roofHeight ?? 0.018) * scale, color);
      }
    }
    group.addChild(ground, terrainContacts, seams, roads, water, shadows, contacts, buildings);
    const bounds = group.getLocalBounds();
    const entry = {
      repeated: repeatedGraphics(detailLayer, group, space.period, { minX: bounds.minX, maxX: bounds.maxX }),
      seams, water, roads, shadows, contacts, buildings,
    };
    details.set(key, entry);
    return entry;
  }
  let lastBorder = "",
    lastSelection = "";
  return {
    render(
      camera: any,
      nation: string | undefined,
      city: string | undefined,
      switches: any,
      political: boolean,
      area: any,
    ) {
      board.setTerrain(switches.terrain);
      root.position.set(
        host.clientWidth / 2 - camera.x * camera.zoom,
        host.clientHeight / 2 - camera.y * camera.zoom * camera.tilt,
      );
      root.scale.set(camera.zoom, camera.zoom * camera.tilt);
      const active = worldMode(switches.terrain, political);
      active.seams.visible = switches.grid && !city;
      for (const mode of worldModes.values())
        mode.repeated.update(camera, host.clientWidth, mode === active && !city);
      seaCopies.update(camera, host.clientWidth, switches.grid && !city);
      contextLayer.visible = !!city;
      if (city) drawContext(city, camera, switches.terrain, switches.grid);
      syncMotion();
      for (const entry of details.values()) entry.repeated.update(camera, host.clientWidth, false);
      if (nation && !city) {
        const d = detail(nation, switches.terrain);
        d.water.visible = switches.waterways;
        d.roads.visible = switches.routes;
        d.repeated.update(camera, host.clientWidth);
      }
      if (city) {
        const d = detail(city, switches.terrain);
        d.seams.visible = switches.grid;
        d.water.visible = switches.waterways;
        d.roads.visible = switches.routes;
        d.shadows.visible = d.contacts.visible = d.buildings.visible = switches.settlements;
        d.repeated.update(camera, host.clientWidth);
      }
      const scale = Math.pow(
          1.12,
          Math.round(Math.log(camera.zoom) / Math.log(1.12)),
        ),
        borderKey = `${scale}:${switches.terrain}`;
      if (lastBorder !== borderKey) {
        for (const b of borders)
          outline(b.graphic, board.outline(b.area), b.color, 1.8, scale);
        lastBorder = borderKey;
      }
      borderCopies.update(camera, host.clientWidth, !city);
      const selectionKey = `${area?.id}:${borderKey}`;
      if (selectionKey !== lastSelection) {
        selected.clear();
        if (area) outline(selected, board.outline(area), 0x294c61, 2.6, scale);
        lastSelection = selectionKey;
      }
      selectionCopies.update(camera, host.clientWidth, !!area && !city);
      app.render();
    },
    resize() {
      app.renderer.resize(host.clientWidth, host.clientHeight);
    },
    destroy() {
      motionAbort.abort();
      cancelAnimationFrame(flowFrame);
      app.destroy(
        { removeView: true },
        { children: true, texture: true, textureSource: true },
      );
    },
  };
}
