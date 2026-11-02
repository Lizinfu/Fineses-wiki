import { createRenderer, type Point } from "./pixi-renderer";
import { createBlockBoard, BOARD_TILT } from "./blocks.mjs";
import {
  createSpace,
  boundsOf,
  hexCenter,
  contains,
  project,
  unproject,
  zoomAt,
  pinchAt,
} from "./space.mjs";

type Camera = { x: number; y: number; zoom: number; tilt: number };
type ScreenRect = { x: number; y: number; width: number; height: number };
type Label = {
  element: HTMLButtonElement;
  point: { x: number; y: number };
  tier: string;
  priority: number;
  id: string;
  width: number;
  height: number;
  offset: Point;
  compact?: { width: number; height: number; offset: Point };
};
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export async function initAtlas(): Promise<void> {
  const rootElement = document.querySelector<HTMLElement>("[data-atlas]"),
    stageElement =
      rootElement?.querySelector<HTMLElement>("[data-atlas-stage]");
  const raw = document.querySelector("#atlas-map-data")?.textContent;
  if (!rootElement || !stageElement || !raw) return;
  const root: HTMLElement = rootElement,
    stage: HTMLElement = stageElement;
  let data = JSON.parse(raw);
  if (typeof data === "string") data = JSON.parse(data);
  const active = data.maps[0];
  if (active.level > 0) {
    const url = new URL(data.map_urls[active.parent_map_id], location.href);
    url.searchParams.set("entity", active.parent_entity_id);
    location.replace(url.href);
    return;
  }
  const started = performance.now(),
    space = createSpace(data),
    board = createBlockBoard(data, space),
    worldBox = board.bounds();
  const host = root.querySelector<HTMLElement>("[data-atlas-canvas]")!;
  let renderer: Awaited<ReturnType<typeof createRenderer>>;
  const status = root.querySelector<HTMLElement>(
    "[data-atlas-runtime-status]",
  )!;
  try {
    renderer = await createRenderer(host, data, space, board);
  } catch (error) {
    root.dataset.atlasRenderer = "unavailable";
    status.textContent = "地图需要可用的 WebGL。可继续使用地点目录与档案链接。";
    status.hidden = false;
    console.error("PixiJS atlas initialization failed", error);
    return;
  }
  root.dataset.atlasRenderer = "webgl";
  root.dataset.atlasScene = "hex-blocks";
  root.dataset.atlasBlockCount = String(board.cells.length);
  root.dataset.featureEnhanced = "true";
  status.hidden = true;
  const abort = new AbortController(),
    signal = abort.signal;
  const listen = (
    target: EventTarget,
    event: string,
    callback: any,
    options: any = {},
  ) => target.addEventListener(event, callback, { ...options, signal });
  const countries = data.areas.filter((area: any) => area.layer === "country"),
    locations = [...data.locations, ...data.detail_locations];
  const featureIndex = new Map<string, any>();
  for (const [mapId, set] of Object.entries(data.feature_maps) as any)
    for (const list of Object.values(set) as any)
      for (const feature of list)
        featureIndex.set(feature.id, { feature, mapId });
  let camera: Camera = {
    x: (worldBox.minX + worldBox.maxX) / 2,
    y: (worldBox.minY + worldBox.maxY) / 2,
    zoom: 0.15,
    tilt: BOARD_TILT,
  };
  let selected: any,
    selectedLocation: any,
    manuallyAdjusted = false,
    political = false,
    raf = 0,
    animation = 0,
    destroyed = false;
  let nationId: string | undefined, cityId: string | undefined;
  let returnFocus: HTMLElement | null = null;
  const switches = {
    terrain: true,
    waterways: true,
    settlements: true,
    routes: true,
    grid: true,
  };
  const featureCard = root.querySelector<HTMLElement>(
    "[data-atlas-feature-card]",
  )!;
  const cardTitle = featureCard.querySelector<HTMLElement>(
    "[data-feature-card-title]",
  )!;
  const cardDescription = featureCard.querySelector<HTMLElement>(
    "[data-feature-card-description]",
  )!;
  const cardStatus = featureCard.querySelector<HTMLElement>(
    "[data-feature-card-status]",
  )!;
  const cardLink = featureCard.querySelector<HTMLAnchorElement>(
    "[data-feature-card-link]",
  )!;
  function info(
    title: string,
    description: string,
    entityId?: string,
    provisional = false,
  ) {
    returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    cardTitle.textContent = title;
    cardDescription.textContent = description;
    cardStatus.textContent = provisional ? "范围与布局示意" : "地图档案";
    const entity = data.entities[entityId ?? ""];
    cardLink.hidden = !entity?.page_ref;
    if (entity?.page_ref) cardLink.href = entity.page_ref;
    featureCard.hidden = false;
    returnFocus?.setAttribute("aria-expanded", "true");
  }
  function updateUrl(query: Record<string, string>, push = true) {
    const url = new URL(location.href);
    for (const key of ["entity", "area", "loc"]) url.searchParams.delete(key);
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    history[push ? "pushState" : "replaceState"]({}, "", url);
  }
  function fit(box: any, min = 0.07) {
    return {
      ...camera,
      x: (box.minX + box.maxX) / 2,
      y: (box.minY + box.maxY) / 2,
      zoom: clamp(
        Math.min(
          (host.clientWidth - 68) / (box.maxX - box.minX),
          (host.clientHeight - 96) / (box.maxY - box.minY) / camera.tilt,
        ),
        min,
        40,
      ),
    };
  }
  function go(target: Camera, animate = true) {
    cancelAnimationFrame(animation);
    manuallyAdjusted = true;
    if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      camera = target;
      schedule();
      return;
    }
    const from = { ...camera },
      start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 430),
        e = 1 - (1 - t) ** 3;
      camera = {
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        zoom: Math.exp(
          Math.log(from.zoom) * (1 - e) + Math.log(target.zoom) * e,
        ),
        tilt: target.tilt,
      };
      schedule();
      if (t < 1) animation = requestAnimationFrame(tick);
      else animation = 0;
    };
    animation = requestAnimationFrame(tick);
  }
  function markSelection(id?: string) {
    root
      .querySelectorAll<HTMLElement>(
        "[data-atlas-area-focus],[data-atlas-city-focus],[data-atlas-focus]",
      )
      .forEach((button) => {
        const yes = [
          button.dataset.atlasAreaFocus,
          button.dataset.atlasCityFocus,
          button.dataset.atlasFocus,
        ].includes(id);
        button.setAttribute("aria-pressed", String(yes));
        button.closest("li")?.toggleAttribute("data-selected", yes);
      });
  }
  function focusCountry(area: any, write = true, animate = true) {
    selected = area;
    selectedLocation = undefined;
    markSelection(area.id);
    info(
      area.label,
      area.political_status === "unruled"
        ? "当前没有现行政权。"
        : "浏览区域地貌、地点与关联档案。",
      area.entity_id,
    );
    go(fit(board.bounds(area), 0.54), animate);
    if (write)
      updateUrl(
        area.entity_id ? { entity: area.entity_id } : { area: area.id },
      );
  }
  function focusLocation(loc: any, write = true, animate = true) {
    selectedLocation = loc;
    selected = countries.find((area: any) => area.detail_map_id === loc.map_id);
    markSelection(loc.id);
    const point = space.normalized(loc.map_id, [
      loc.position.x,
      loc.position.y,
    ]);
    if (loc.detail_map_id) {
      const box = board.bounds(loc.detail_map_id);
      go(fit(box, 2.6), animate);
    } else
      go(
        { ...camera, ...board.raise(point), zoom: Math.max(camera.zoom, 0.75) },
        animate,
      );
    info(
      loc.label,
      loc.detail_map_id
        ? "皇宫居中，城区高度中心对称。街区与路网为可替换的示意。"
        : "地图位置与关联档案。",
      loc.entity_id,
      loc.footprint_status === "provisional",
    );
    if (write) updateUrl({ loc: loc.id });
  }
  function reset(write = true) {
    selected = selectedLocation = undefined;
    markSelection();
    featureCard.hidden = true;
    go(fit(worldBox), false);
    manuallyAdjusted = false;
    if (write) updateUrl({}, false);
  }
  function focusFeature(id: string) {
    const entry = featureIndex.get(id);
    if (!entry) return;
    const map = space.maps.get(entry.mapId);
    if (map.level === 1)
      focusCountry(
        countries.find((area: any) => area.detail_map_id === map.id),
      );
    else if (map.level === 2)
      focusLocation(locations.find((loc: any) => loc.detail_map_id === map.id));
    const f = entry.feature;
    info(
      f.label,
      f.description,
      f.entity_id,
      f.geometry_status === "provisional",
    );
  }
  const labelHost = document.createElement("div");
  labelHost.className = "atlas-screen-labels";
  host.append(labelHost);
  const labels: Label[] = [];
  const labelActions = new Map<HTMLElement, () => void>();
  function addLabel(
    id: string,
    point: any,
    tier: string,
    priority: number,
    title: string,
    subtitle: string,
    action: () => void,
    icon?: string,
  ) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `atlas-map-label atlas-map-label--${tier}`;
    element.dataset.atlasLabel = id;
    element.setAttribute("aria-label", `查看${title}`);
    element.setAttribute("aria-controls", "atlas-feature-card");
    element.setAttribute("aria-expanded", "false");
    element.title = title;
    if (icon) {
      const img = document.createElement("img");
      img.src =
        new URL(data.map_urls.world, location.href).pathname.replace(
          /portals\/atlas\/.*$/,
          "",
        ) + icon;
      img.alt = "";
      img.draggable = false;
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 30;
      img.height = 30;
      element.append(img);
    }
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("span");
    small.textContent = subtitle;
    element.append(strong);
    if (subtitle) element.append(small);
    labelActions.set(element, action);
    // Pointer taps are handled together with map gestures; native keyboard clicks remain.
    listen(element, "click", (event: MouseEvent) => {
      if (event.detail === 0) action();
    });
    labelHost.append(element);
    labels.push({
      element,
      point,
      tier,
      priority,
      id,
      width: 130,
      height: 48,
      offset: { x: 65, y: 24 },
    });
  }
  countries.forEach((area: any) =>
    addLabel(
      area.id,
      space.areaCenter(area),
      "country",
      50,
      area.label,
      area.foreign_label ?? "",
      () => focusCountry(area),
      area.icon_ref,
    ),
  );
  data.areas
    .filter((area: any) => area.layer === "continent")
    .forEach((area: any) =>
      addLabel(
        area.id,
        space.areaCenter(area),
        "continent",
        30,
        area.label,
        "",
        () => {
          info(area.label, "大陆与地理区域档案。", area.entity_id);
          go(
            fit(
              boundsOf(
                area.polygons
                  .flat()
                  .map((p: number[]) => hexCenter(p[0], p[1], space.root.grid)),
              ),
            ),
          );
        },
      ),
    );
  for (const loc of locations) {
    // Keep legacy directory/deep-link entries without duplicating a country label.
    if (
      loc.map_id === space.root.id &&
      loc.kind === "region" &&
      countries.some((area: any) => area.entity_id === loc.entity_id)
    )
      continue;
    addLabel(
      loc.id,
      space.normalized(loc.map_id, [loc.position.x, loc.position.y]),
      loc.detail_map_id ? "capital" : "place",
      100,
      loc.label,
      loc.detail_map_id ? "首都 / CAPITAL" : "档案地点",
      () => focusLocation(loc),
    );
  }
  for (const [id, { feature: f, mapId }] of featureIndex) {
    if (!f.label_position) continue;
    const level = space.maps.get(mapId).level;
    addLabel(
      id,
      space.normalized(mapId, f.label_position),
      level === 2 ? "palace" : f.kind === "river" ? "river" : "terrain",
      f.kind === "river" ? 65 : 80,
      f.kind === "concentric-city" ? "皇宫" : f.label,
      f.kind === "concentric-city"
        ? "CENTRAL PALACE"
        : f.kind === "river"
          ? "西南 → 东北"
          : "地貌示意",
      () =>
        info(
          f.label,
          f.description,
          f.entity_id,
          f.geometry_status === "provisional",
        ),
    );
  }
  function measureLabels() {
    for (const label of labels) {
      const measure = () => {
        const box = label.element.getBoundingClientRect(),
          mark = label.element
            .querySelector<HTMLElement>("img,strong")!
            .getBoundingClientRect();
        return {
          width: label.element.offsetWidth,
          height: label.element.offsetHeight,
          offset:
            label.tier === "capital"
              ? { x: -10, y: mark.top + mark.height / 2 - box.top }
              : {
                  x: mark.left + mark.width / 2 - box.left,
                  y: mark.top + mark.height / 2 - box.top,
                },
        };
      };
      label.element.hidden = false;
      label.element.classList.remove("atlas-map-label--compact");
      Object.assign(label, measure());
      if (label.tier === "capital")
        label.element.style.setProperty(
          "--atlas-marker-top",
          `${label.offset.y}px`,
        );
      if (label.tier === "country" && label.element.querySelector("img")) {
        label.element.classList.add("atlas-map-label--compact");
        label.compact = measure();
        label.element.classList.remove("atlas-map-label--compact");
      }
    }
    schedule();
  }
  let frameCount = 0,
    totalFrameMs = 0;
  function draw() {
    raf = 0;
    if (destroyed) return;
    const start = performance.now();
    camera.x = ((camera.x % space.period) + space.period) % space.period;
    board.setTerrain(switches.terrain);
    const center = board.groundPoint(camera, cityId),
      under = space.countryAt(center),
      candidate =
        selected && contains(space.countryBounds(selected), center)
          ? selected
          : under?.layer === "country"
            ? under
            : undefined;
    nationId =
      candidate?.detail_map_id && camera.zoom >= (nationId?.length ? 0.44 : 0.5)
        ? candidate.detail_map_id
        : undefined;
    if (nationId && !contains(space.bounds(nationId), center))
      nationId = undefined;
    const city = locations.find(
      (loc: any) =>
        loc.detail_map_id &&
        loc.map_id === nationId &&
        board.containsCity(loc.detail_map_id, center),
    );
    cityId =
      city && camera.zoom >= (cityId ? 2.05 : 2.4)
        ? city.detail_map_id
        : undefined;
    try {
      renderer.render(camera, nationId, cityId, switches, political, selected);
    } catch (error) {
      destroyed = true;
      abort.abort();
      observer.disconnect();
      root.dataset.atlasRenderer = "unavailable";
      delete root.dataset.featureEnhanced;
      status.textContent = "地图渲染未能完成。请使用地点目录与档案链接。";
      status.hidden = false;
      console.error("PixiJS atlas rendering failed", error);
      return;
    }
    const tier = cityId
      ? "城区"
      : nationId
        ? "国家详图"
        : camera.zoom < 0.3
          ? "世界总览"
          : "世界地图";
    root.dataset.atlasLevel = String(cityId ? 2 : nationId ? 1 : 0);
    root.dataset.atlasActiveLevel = tier;
    root.dataset.atlasCamera = JSON.stringify(camera);
    root.dataset.atlasNation = nationId ?? "";
    root.dataset.atlasCity = cityId ?? "";
    root.querySelector<HTMLElement>("[data-atlas-view-level]")!.textContent =
      tier;
    root.querySelector<HTMLElement>("[data-atlas-view-region]")!.textContent =
      cityId ? city.label : nationId ? candidate.label : "菲恩尼斯";
    root.querySelector<HTMLElement>("[data-atlas-zoom-readout]")!.textContent =
      `${Math.round(camera.zoom * 100)}%`;
    (
      root.querySelector('[data-atlas-zoom="in"]') as HTMLButtonElement
    ).disabled = camera.zoom >= 40;
    (
      root.querySelector('[data-atlas-zoom="out"]') as HTMLButtonElement
    ).disabled = camera.zoom <= 0.07;
    const occupied: ScreenRect[] = [
      { x: host.clientWidth - 280, y: 0, width: 280, height: 78 },
      { x: 0, y: host.clientHeight - 48, width: 240, height: 48 },
    ];
    const fits = (r: ScreenRect, ignore?: ScreenRect) =>
      r.x >= 8 &&
      r.y >= 8 &&
      r.x + r.width <= host.clientWidth - 8 &&
      r.y + r.height <= host.clientHeight - 8 &&
      !occupied.some(
        (other) =>
          other !== ignore &&
          r.x < other.x + other.width + 10 &&
          r.x + r.width + 10 > other.x &&
          r.y < other.y + other.height + 8 &&
          r.y + r.height + 8 > other.y,
      );
    const expansions: { label: Label; icon: ScreenRect; full: ScreenRect }[] =
      [];
    // Reserve small country emblems first; their text must not displace other emblems.
    const ordered = [...labels].sort(
      (a, b) =>
        Number(b.tier === "country") - Number(a.tier === "country") ||
        b.priority - a.priority,
    );
    for (const label of ordered) {
      let show =
        label.tier === "continent"
          ? camera.zoom < 0.3
          : label.tier === "country"
            ? !cityId && camera.zoom >= 0.28
            : label.tier === "capital"
              ? !!nationId && !cityId
              : label.tier === "palace"
                ? !!cityId
                : label.tier === "place"
                  ? !cityId && camera.zoom >= 0.3
                  : !!nationId && !cityId;
      const entry = featureIndex.get(label.id);
      if (entry) {
        show &&= entry.mapId === (cityId ?? nationId);
        if (label.tier === "terrain") show &&= switches.terrain;
        if (label.tier === "river") show &&= switches.waterways;
        if (label.tier === "palace") show &&= switches.settlements;
      }
      if (label.tier === "capital")
        show &&=
          locations.find((loc: any) => loc.id === label.id)?.map_id ===
          nationId;
      const point = board.raise(
        label.point,
        label.tier === "palace" ? cityId : undefined,
      );
      if (label.tier === "palace")
        point.y -= board.cities.get(cityId)?.palaceHeight ?? 0;
      point.x += Math.round((camera.x - point.x) / space.period) * space.period;
      const p = project(camera, point, host.clientWidth, host.clientHeight);
      let compact = false,
        rect = {
          x: p.x - label.offset.x,
          y: p.y - label.offset.y,
          width: label.width,
          height: label.height,
        };
      const full = rect;
      if (label.compact) {
        compact = true;
        rect = {
          x: p.x - label.compact.offset.x,
          y: p.y - label.compact.offset.y,
          width: label.compact.width,
          height: label.compact.height,
        };
      }
      show &&= fits(rect);
      label.element.classList.toggle("atlas-map-label--compact", compact);
      label.element.dataset.labelMode = compact ? "icon" : "full";
      label.element.hidden = !show;
      if (show) {
        occupied.push(rect);
        if (label.compact) expansions.push({ label, icon: rect, full });
        label.element.style.transform = `translate(${rect.x}px,${rect.y}px)`;
        label.element.dataset.anchor = JSON.stringify(p);
      }
    }
    // Expand captions into remaining room while keeping the emblem at the exact same point.
    for (const { label, icon, full } of expansions) {
      if (!fits(full, icon)) continue;
      occupied[occupied.indexOf(icon)] = full;
      label.element.classList.remove("atlas-map-label--compact");
      label.element.dataset.labelMode = "full";
      label.element.style.transform = `translate(${full.x}px,${full.y}px)`;
    }
    frameCount++;
    totalFrameMs += performance.now() - start;
    root.dataset.atlasFrameMs = (totalFrameMs / frameCount).toFixed(2);
    root.dataset.atlasDraws = String(frameCount);
  }
  function schedule() {
    if (!raf && !destroyed) raf = requestAnimationFrame(draw);
  }
  function setZoom(
    value: number,
    anchor = { x: host.clientWidth / 2, y: host.clientHeight / 2 },
  ) {
    cancelAnimationFrame(animation);
    animation = 0;
    manuallyAdjusted = true;
    camera = zoomAt(
      camera,
      clamp(value, 0.07, 40),
      anchor,
      host.clientWidth,
      host.clientHeight,
    );
    schedule();
  }
  root
    .querySelectorAll<HTMLElement>("[data-atlas-zoom]")
    .forEach((button) =>
      listen(button, "click", () =>
        setZoom(camera.zoom * (button.dataset.atlasZoom === "in" ? 1.25 : 0.8)),
      ),
    );
  listen(root.querySelector("[data-atlas-reset]")!, "click", () => reset());
  const closeInfo = () => {
    featureCard.hidden = true;
    returnFocus?.setAttribute("aria-expanded", "false");
    returnFocus?.focus({ preventScroll: true });
  };
  listen(root.querySelector("[data-feature-card-close]")!, "click", closeInfo);
  listen(
    root.querySelector("[data-atlas-preset-toggle]")!,
    "click",
    (event: Event) => {
      political = !political;
      (event.currentTarget as HTMLElement).setAttribute(
        "aria-pressed",
        String(political),
      );
      schedule();
    },
  );
  listen(root.querySelector("[data-atlas-tilt]")!, "click", (event: Event) => {
    camera.tilt = camera.tilt === 1 ? BOARD_TILT : 1;
    (event.currentTarget as HTMLElement).setAttribute(
      "aria-pressed",
      String(camera.tilt !== 1),
    );
    schedule();
  });
  root
    .querySelectorAll<HTMLInputElement>("[data-feature-toggle]")
    .forEach((input) =>
      listen(input, "change", () => {
        const ground = board.groundPoint(camera, cityId),
          before = board.raise(ground, cityId);
        switches[input.dataset.featureToggle as keyof typeof switches] =
          input.checked;
        if (input.dataset.featureToggle === "terrain") {
          board.setTerrain(input.checked);
          camera.y += board.raise(ground, cityId).y - before.y;
        }
        schedule();
      }),
    );
  root
    .querySelectorAll<HTMLElement>("[data-atlas-area-focus]")
    .forEach((button) =>
      listen(button, "click", () =>
        focusCountry(
          countries.find(
            (area: any) => area.id === button.dataset.atlasAreaFocus,
          ),
        ),
      ),
    );
  root
    .querySelectorAll<HTMLElement>("[data-atlas-city-focus],[data-atlas-focus]")
    .forEach((button) =>
      listen(button, "click", () =>
        focusLocation(
          locations.find(
            (loc: any) =>
              loc.id ===
              (button.dataset.atlasCityFocus ?? button.dataset.atlasFocus),
          ),
        ),
      ),
    );
  root
    .querySelectorAll<HTMLElement>("[data-atlas-feature-focus]")
    .forEach((button) =>
      listen(button, "click", () =>
        focusFeature(button.dataset.atlasFeatureFocus!),
      ),
    );
  listen(
    root.querySelector("[data-atlas-search]")!,
    "input",
    (event: Event) => {
      const query = (event.target as HTMLInputElement).value
        .trim()
        .toLocaleLowerCase();
      let count = 0;
      root
        .querySelectorAll<HTMLElement>(
          "[data-atlas-area-item],[data-atlas-location-item],[data-atlas-city-item],[data-atlas-feature-item]",
        )
        .forEach((item) => {
          item.hidden = !(item.dataset.featureSearch ?? item.textContent ?? "")
            .toLocaleLowerCase()
            .includes(query);
          if (!item.hidden) count++;
        });
      root.querySelector<HTMLElement>("[data-atlas-count]")!.textContent =
        `${count} 个地图条目`;
    },
  );
  const pointers = new Map<number, Point>();
  let drag: any;
  const point = (event: PointerEvent | WheelEvent) => {
    const r = host.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  };
  listen(host, "pointerdown", (event: PointerEvent) => {
    if (event.button !== 0) return;
    const label = (event.target as Element).closest<HTMLElement>(
      ".atlas-map-label",
    );
    if (!label && (event.target as Element).closest("button,a")) return;
    event.preventDefault();
    (label && pointers.size === 0 ? label : stage).focus({
      preventScroll: true,
    });
    host.setPointerCapture(event.pointerId);
    cancelAnimationFrame(animation);
    animation = 0;
    pointers.set(event.pointerId, point(event));
    const ps = [...pointers.values()];
    drag = {
      camera: { ...camera },
      start: ps[0],
      moved: ps.length > 1,
      label: ps.length === 1 ? label : null,
      center:
        ps.length === 2
          ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }
          : ps[0],
      distance:
        ps.length === 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0,
    };
  });
  listen(host, "pointermove", (event: PointerEvent) => {
    if (!pointers.has(event.pointerId) || !drag) return;
    pointers.set(event.pointerId, point(event));
    const ps = [...pointers.values()];
    const delta = { x: ps[0].x - drag.start.x, y: ps[0].y - drag.start.y };
    if (ps.length === 2 && drag.distance) {
      const distance = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      camera = pinchAt(
        drag.camera,
        clamp((drag.camera.zoom * distance) / drag.distance, 0.07, 40),
        drag.center,
        { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 },
        host.clientWidth,
        host.clientHeight,
      );
      drag.moved = true;
    } else {
      camera = {
        ...camera,
        x: drag.camera.x - delta.x / camera.zoom,
        y: drag.camera.y - delta.y / (camera.zoom * camera.tilt),
      };
      if (Math.hypot(delta.x, delta.y) > 4) drag.moved = true;
    }
    if (drag.moved) selected = selectedLocation = undefined;
    manuallyAdjusted = true;
    schedule();
  });
  const endPointer = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    const click = drag && !drag.moved && pointers.size === 1;
    const label = drag?.label as HTMLElement | undefined;
    pointers.delete(event.pointerId);
    if (click && label) labelActions.get(label)?.();
    else if (click) {
      const visual = unproject(
          camera,
          point(event),
          host.clientWidth,
          host.clientHeight,
        ),
        p = board.groundPoint(visual, cityId),
        area = space.countryAt(p);
      if (cityId && board.pick(visual, cityId)?.city === cityId) {
        const plan = featureIndex.get("settlement.cathair.plan");
        if (plan)
          info(
            plan.feature.label,
            plan.feature.description,
            plan.feature.entity_id,
            true,
          );
      } else if (area?.layer === "country") focusCountry(area);
    }
    const remaining = [...pointers.values()];
    drag = remaining.length
      ? { camera: { ...camera }, start: remaining[0], moved: true, distance: 0 }
      : undefined;
  };
  listen(host, "pointerup", endPointer);
  listen(host, "pointercancel", (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    drag = undefined;
  });
  listen(
    host,
    "wheel",
    (event: WheelEvent) => {
      event.preventDefault();
      setZoom(camera.zoom * Math.exp(-event.deltaY * 0.0015), point(event));
    },
    { passive: false },
  );
  listen(root, "keydown", (event: KeyboardEvent) => {
    if (
      (event.target as Element).closest(
        "input,textarea,select,[contenteditable=true]",
      )
    )
      return;
    if (["+", "=", "-", "_"].includes(event.key))
      setZoom(camera.zoom * (["+", "="].includes(event.key) ? 1.25 : 0.8));
    else if (event.key === "0") reset();
    else if (event.key === "Escape") {
      closeInfo();
      return;
    } else if (
      event.key.startsWith("Arrow") &&
      stage.contains(event.target as Node)
    ) {
      manuallyAdjusted = true;
      camera.x +=
        event.key === "ArrowRight"
          ? 48 / camera.zoom
          : event.key === "ArrowLeft"
            ? -48 / camera.zoom
            : 0;
      camera.y +=
        event.key === "ArrowDown"
          ? 48 / camera.zoom / camera.tilt
          : event.key === "ArrowUp"
            ? -48 / camera.zoom / camera.tilt
            : 0;
      schedule();
    } else return;
    event.preventDefault();
  });
  function restore() {
    const params = new URLSearchParams(location.search),
      area = countries.find(
        (a: any) =>
          a.entity_id === params.get("entity") || a.id === params.get("area"),
      ),
      loc = locations.find(
        (l: any) =>
          l.id === params.get("loc") ||
          (!area && l.entity_id === params.get("entity")),
      );
    if (loc) focusLocation(loc, false, false);
    else if (area) focusCountry(area, false, false);
    else reset(false);
  }
  listen(window, "popstate", restore);
  const observer = new ResizeObserver(() => {
    renderer.resize();
    if (!manuallyAdjusted) camera = fit(worldBox);
    measureLabels();
  });
  observer.observe(host);
  listen(window, "pagehide", (event: PageTransitionEvent) => {
    if (event.persisted) return;
    destroyed = true;
    abort.abort();
    observer.disconnect();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(animation);
    renderer.destroy();
  });
  measureLabels();
  document.fonts.ready.then(measureLabels);
  restore();
  root.dataset.atlasInitMs = String(Math.round(performance.now() - started));
  root.dispatchEvent(new CustomEvent("atlas:ready"));
}
