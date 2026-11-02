import { Application, Container, Graphics } from "pixi.js";
import { cityGeometry } from "./terrain.mjs";
import { hexCenter, hexagon } from "./space.mjs";
import { prismGeometry } from "./blocks.mjs";

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
    const [a, b] = face.points,
      shade = b.y > a.y ? 0.56 : b.y < a.y ? 0.74 : 0.64;
    polygon(g, face.points, mix(0x233c50, topColor, shade));
  }
  polygon(g, geometry.top, topColor);
}
function bevel(g: Graphics, top: Polygon, width: number) {
  // A crisp north rim, never a blurred height field or a per-cell noise texture.
  for (let i = 3; i < 6; i++)
    path(g, [top[i], top[(i + 1) % 6]], 0xe1eff0, width, 0.64);
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
    backgroundColor: 0x233c4d,
  });
  host.prepend(app.canvas);
  app.canvas.className = "atlas-pixi-canvas";
  app.canvas.setAttribute("aria-hidden", "true");
  const root = new Container();
  app.stage.addChild(root);
  const countries = data.areas.filter((a: any) => a.layer === "country"),
    countryColors = new Map(
      countries.map((a: any, i: number) => [a.id, palette[i % palette.length]]),
    );
  const sea = new Graphics(),
    worldGrid = space.root.grid;
  for (let col = 0; col < worldGrid.columns; col++)
    for (let row = 0; row < worldGrid.rows; row++) {
      const p = hexCenter(col, row, worldGrid);
      path(
        sea,
        hexagon(p, worldGrid.hex_size * 0.98),
        0x3b596a,
        0.5,
        0.42,
        true,
      );
    }
  const seaCopies = [0, -1, 1].map((direction) => {
    const g = direction ? new Graphics(sea.context) : sea;
    g.x = direction * space.period;
    root.addChild(g);
    return g;
  });
  const worldModes = new Map<
    string,
    { copies: Container[]; seams: Graphics[] }
  >();
  function worldMode(elevated: boolean, political: boolean) {
    const key = `${elevated}:${political}`;
    if (worldModes.has(key)) return worldModes.get(key)!;
    const body = new Graphics(),
      shadow = new Graphics(),
      seams = new Graphics();
    for (const cell of board.cells) {
      const g = board.geometry(cell, elevated),
        level = elevated ? cell.level : 0,
        neutral = mix(0xa8beca, 0xe1e8e5, level * 0.11),
        color = political
          ? mix(
              neutral,
              (countryColors.get(cell.owner?.id) as number) ?? neutral,
              0.35,
            )
          : neutral;
      polygon(
        shadow,
        hexagon(
          { x: cell.point.x + 2, y: cell.point.y + 3 },
          cell.radius * 0.97,
        ),
        0x0c202e,
        0.3,
      );
      prism(body, g, color);
      bevel(body, g.top, 0.48);
      path(seams, g.top, 0x527486, 0.35, 0.48, true);
    }
    const copies: Container[] = [],
      seamCopies: Graphics[] = [];
    for (const direction of [0, -1, 1]) {
      const group = new Container(),
        s = direction ? new Graphics(seams.context) : seams;
      group.addChild(
        direction ? new Graphics(shadow.context) : shadow,
        direction ? new Graphics(body.context) : body,
        s,
      );
      group.x = direction * space.period;
      root.addChild(group);
      copies.push(group);
      seamCopies.push(s);
    }
    const entry = { copies, seams: seamCopies };
    worldModes.set(key, entry);
    return entry;
  }
  const detailLayer = new Container(),
    borderLayer = new Container(),
    selected = new Graphics();
  const borders = countries.map((area: any, i: number) => ({
    area,
    color: mix(0x344f63, palette[i % palette.length], 0.45),
    graphic: new Graphics(),
  }));
  borderLayer.addChild(...borders.map((b: any) => b.graphic));
  const borderCopies = [-1, 1].map((direction) => {
    const group = new Container();
    for (const b of borders) group.addChild(new Graphics(b.graphic.context));
    group.x = direction * space.period;
    borderLayer.addChild(group);
    return group;
  });
  const details = new Map<string, any>();
  function detail(id: string, elevated: boolean) {
    const key = `${id}:${elevated}`;
    if (details.has(key)) return details.get(key);
    const features = data.feature_maps[id],
      group = new Container(),
      ground = new Graphics(),
      seams = new Graphics(),
      water = new Graphics(),
      roads = new Graphics(),
      buildings = new Graphics(),
      accent = new Graphics();
    const city = board.cities.get(id),
      unit = Math.min(space.frame(id).sx, space.frame(id).sy);
    if (city) {
      const foundation = board.cityFoundation(id, elevated);
      polygon(
        ground,
        foundation.bottom.map((p: Point) => ({ x: p.x + 1, y: p.y + 1.5 })),
        0x112938,
        0.3,
      );
      prism(ground, foundation, 0x839eac);
      path(ground, foundation.top, 0x8bc2ce, 0.22, 0.85, true);
      for (const cell of city.cells) {
        const g = board.geometry(cell, elevated, id);
        prism(
          ground,
          g,
          mix(0xb8cbd1, 0xdce6e4, (elevated ? cell.level : 0) * 0.08),
        );
        bevel(ground, g.top, 0.028);
        path(seams, g.top, 0x6b929f, 0.025, 0.6, true);
      }
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
        objects: any[] = [];
      for (const block of plan.blocks) {
        if (block.park) {
          const points = raw(block.points),
            center = {
              x: points.reduce((s: number, p: Point) => s + p.x, 0) / 4,
              y: points.reduce((s: number, p: Point) => s + p.y, 0) / 4,
            },
            h = board.heightAt(center, id, elevated);
          polygon(
            roads,
            points.map((p: Point) => ({ x: p.x, y: p.y - h - 0.02 })),
            0x89a397,
          );
          continue;
        }
        const [a, b, c, d] = block.points,
          lerp = (p: number[], q: number[], t: number) =>
            p.map((v, i) => v + (q[i] - v) * t);
        for (let section = 0; section < 2; section++)
          for (let depth = 0; depth < 2; depth++) {
            const from = (section + 0.13) / 2,
              to = (section + 0.87) / 2,
              ia = lerp(a, b, (depth + 0.13) / 2),
              oa = lerp(a, b, (depth + 0.87) / 2),
              ib = lerp(d, c, (depth + 0.13) / 2),
              ob = lerp(d, c, (depth + 0.87) / 2),
              points = raw([
                lerp(ia, ib, from),
                lerp(oa, ob, from),
                lerp(oa, ob, to),
                lerp(ia, ib, to),
              ]),
              center = {
                x: points.reduce((s: number, p: Point) => s + p.x, 0) / 4,
                y: points.reduce((s: number, p: Point) => s + p.y, 0) / 4,
              };
            objects.push({
              points,
              center,
              color: [0xa9bac1, 0xc1cccb, 0x859eac][block.shade],
            });
          }
      }
      for (const road of plan.roads) {
        const points = road.closed
          ? [...road.points, road.points[0]]
          : road.points;
        path(roads, drape(points), 0xf0ead4, 1.6 * unit);
      }
      objects.sort((a, b) => a.center.y - b.center.y);
      for (const object of objects) {
        const h = board.heightAt(object.center, id, elevated),
          geometry = prismGeometry(object.points, h + 2.4 * unit, h);
        prism(buildings, geometry, object.color);
        path(
          buildings,
          [geometry.top[0], geometry.top[1]],
          0xd7e3e3,
          0.35 * unit,
          0.8,
        );
      }
      const palace = raw(plan.palace),
        center = space.normalized(id, plan.center),
        h = board.heightAt(center, id, elevated),
        g = prismGeometry(palace, h + city.palaceHeight, h);
      prism(accent, g, 0xe3d5ac);
      path(accent, g.top, 0xb09b69, 0.65 * unit, 1, true);
    }
    group.addChild(ground, seams, water, roads, buildings, accent);
    detailLayer.addChild(group);
    const entry = { group, seams, water, roads, buildings, accent };
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
      if (root.children.at(-1) !== selected)
        root.addChild(detailLayer, borderLayer, selected);
      for (const mode of worldModes.values())
        mode.copies.forEach((g, i) => {
          g.visible = mode === active && (i === 0 || camera.zoom < 0.4);
          (g.children[1] as Graphics).tint = city ? 0x8095a3 : 0xffffff;
        });
      active.seams.forEach((g) => (g.visible = switches.grid && !city));
      seaCopies.forEach(
        (g, i) => (g.visible = switches.grid && (i === 0 || camera.zoom < 0.4)),
      );
      for (const entry of details.values()) entry.group.visible = false;
      if (nation) {
        const d = detail(nation, switches.terrain);
        d.group.visible = true;
        d.water.visible = switches.waterways;
        d.roads.visible = switches.routes;
      }
      if (city) {
        const d = detail(city, switches.terrain);
        d.group.visible = true;
        d.seams.visible = switches.grid;
        d.roads.visible = switches.routes;
        d.buildings.visible = d.accent.visible = switches.settlements;
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
      borderLayer.visible = !city;
      borderCopies.forEach((g) => (g.visible = camera.zoom < 0.4));
      const selectionKey = `${area?.id}:${borderKey}`;
      if (selectionKey !== lastSelection) {
        selected.clear();
        if (area) outline(selected, board.outline(area), 0x507e92, 2.6, scale);
        lastSelection = selectionKey;
      }
      selected.visible = !city;
      app.render();
    },
    resize() {
      app.renderer.resize(host.clientWidth, host.clientHeight);
    },
    destroy() {
      app.destroy(
        { removeView: true },
        { children: true, texture: true, textureSource: true },
      );
    },
  };
}
