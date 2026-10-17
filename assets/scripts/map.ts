type AtlasEntity = {
  title?: string;
  page_ref?: string;
  entity_kind?: string;
};

type HexCoordinate = {
  col: number;
  row: number;
};

type AtlasLocation = HexCoordinate & {
  id: string;
  entity_id?: string;
  label: string;
  kind?: string;
};

type HexGrid = {
  columns: number;
  rows: number;
  hex_size: number;
  gap?: number;
  orientation: "flat";
};

type TileMaskRow = {
  row: number;
  ranges: Array<[number, number]>;
};

type TileMask = {
  grid: {
    columns: number;
    rows: number;
    orientation: "flat";
    offset?: "odd-q";
  };
  land_rows: TileMaskRow[];
  area_masks?: Record<string, {
    tile_count: number;
    tile_rows: TileMaskRow[];
  }>;
};

type AtlasArea = {
  id: string;
  map_id: string;
  layer: "continent" | "country" | "special";
  entity_id?: string;
  label: string;
  label_anchor: [number, number];
  polygons?: Array<Array<[number, number]>>;
  tile_source?: "generated";
  style_token?: string;
  political_status?: "active" | "unruled";
  priority?: number;
  detail_status?: "available" | "awaiting-source";
  applies_to?: "land" | "ocean" | "any";
  wrap_x?: boolean;
};

type AtlasAppearance = {
  palette?: string;
  relief?: string;
  material?: string;
};

type AtlasMap = {
  id: string;
  type: "hex";
  mask_id: string;
  grid: HexGrid;
  wrap_x?: boolean;
  min_zoom?: number;
  max_zoom?: number;
  default_zoom?: number;
  default_center?: HexCoordinate;
  appearance?: AtlasAppearance;
};

type AtlasData = {
  maps: AtlasMap[];
  locations: AtlasLocation[];
  areas: AtlasArea[];
  entities: Record<string, AtlasEntity>;
  tile_masks: Record<string, TileMask>;
};

type PixelPoint = {
  x: number;
  y: number;
};

type TileBounds = {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
};

type TileAssignment = {
  continent?: AtlasArea;
  country?: AtlasArea;
  special?: AtlasArea;
};

type HexGeometry = {
  width: number;
  height: number;
  size: number;
  wrapWidth: number;
  centerFor: (coordinate: HexCoordinate) => PixelPoint;
  boundsByArea: Map<string, TileBounds>;
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SQRT_THREE = Math.sqrt(3);

function readData(): AtlasData | null {
  const node = document.querySelector<HTMLScriptElement>("#atlas-map-data");
  if (!node?.textContent) return null;

  try {
    const parsed: unknown = JSON.parse(node.textContent);
    return (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as AtlasData;
  } catch {
    return null;
  }
}

function tileKey(col: number, row: number): string {
  return `${col}:${row}`;
}

function expandTileRows(rows: TileMaskRow[]): Set<string> {
  const tiles = new Set<string>();
  for (const { row, ranges } of rows) {
    for (const [start, end] of ranges) {
      for (let col = start; col <= end; col += 1) tiles.add(tileKey(col, row));
    }
  }
  return tiles;
}

function expandLandRows(mask: TileMask): Set<string> {
  return expandTileRows(mask.land_rows);
}

function pointInPolygon(col: number, row: number, points: Array<[number, number]>): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const [currentCol, currentRow] = points[index];
    const [previousCol, previousRow] = points[previous];
    const crossesRow = (currentRow > row) !== (previousRow > row);
    const edgeCol = ((previousCol - currentCol) * (row - currentRow)) /
      (previousRow - currentRow || Number.EPSILON) + currentCol;
    if (crossesRow && col < edgeCol) inside = !inside;
  }
  return inside;
}

function areaContains(area: AtlasArea, col: number, row: number): boolean {
  return (area.polygons ?? []).some((polygon) => pointInPolygon(col, row, polygon));
}

function highestPriorityArea(
  areas: AtlasArea[],
  col: number,
  row: number,
  generatedAreaTiles: Map<string, Set<string>>,
): AtlasArea | undefined {
  const key = tileKey(col, row);
  return areas
    .filter((area) => generatedAreaTiles.has(area.id)
      ? generatedAreaTiles.get(area.id)?.has(key)
      : areaContains(area, col, row))
    .sort((left, right) => Number(right.priority ?? 0) - Number(left.priority ?? 0))[0];
}

function neighborCoordinates(col: number, row: number): HexCoordinate[] {
  const verticalOffset = col % 2 === 0 ? -1 : 1;
  return [
    { col: col - 1, row: row + Math.min(verticalOffset, 0) },
    { col: col - 1, row: row + Math.max(verticalOffset, 0) },
    { col: col + 1, row: row + Math.min(verticalOffset, 0) },
    { col: col + 1, row: row + Math.max(verticalOffset, 0) },
    { col, row: row - 1 },
    { col, row: row + 1 },
  ];
}

function hexPoints(center: PixelPoint, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    return `${center.x + radius * Math.cos(angle)},${center.y + radius * Math.sin(angle)}`;
  }).join(" ");
}

function addToBounds(boundsByArea: Map<string, TileBounds>, area: AtlasArea | undefined, col: number, row: number): void {
  if (!area) return;
  const bounds = boundsByArea.get(area.id);
  if (!bounds) {
    boundsByArea.set(area.id, { minCol: col, maxCol: col, minRow: row, maxRow: row });
    return;
  }
  bounds.minCol = Math.min(bounds.minCol, col);
  bounds.maxCol = Math.max(bounds.maxCol, col);
  bounds.minRow = Math.min(bounds.minRow, row);
  bounds.maxRow = Math.max(bounds.maxRow, row);
}

function createHexMap(map: AtlasMap, mask: TileMask, areas: AtlasArea[], layer: HTMLElement): HexGeometry {
  const { columns, rows, hex_size: size, gap = 1 } = map.grid;
  const padding = size * 1.25;
  const radius = Math.max(4, size - gap / 2);
  const width = padding * 2 + size * 2 + (columns - 1) * size * 1.5;
  const height = padding * 2 + SQRT_THREE * size * (rows + 0.5);
  const wrapWidth = columns * size * 1.5;
  const centerFor = ({ col, row }: HexCoordinate): PixelPoint => ({
    x: padding + size + col * size * 1.5,
    y: padding + size * SQRT_THREE / 2 +
      (row + (col % 2 === 0 ? 0 : 0.5)) * size * SQRT_THREE,
  });

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("class", "atlas-hex-map");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("aria-hidden", "true");

  const defs = document.createElementNS(SVG_NAMESPACE, "defs");
  const oceanGradient = document.createElementNS(SVG_NAMESPACE, "linearGradient");
  const oceanGradientId = `atlas-ocean-depth-${map.id}`;
  oceanGradient.id = oceanGradientId;
  oceanGradient.setAttribute("class", "atlas-ocean-gradient");
  oceanGradient.setAttribute("x1", "0");
  oceanGradient.setAttribute("y1", "0");
  oceanGradient.setAttribute("x2", "0");
  oceanGradient.setAttribute("y2", "1");
  [
    ["0%", "atlas-ocean-gradient__rim"],
    ["42%", "atlas-ocean-gradient__surface"],
    ["100%", "atlas-ocean-gradient__depth"],
  ].forEach(([offset, className]) => {
    const stop = document.createElementNS(SVG_NAMESPACE, "stop");
    stop.setAttribute("offset", offset);
    stop.setAttribute("class", className);
    oceanGradient.append(stop);
  });
  defs.append(oceanGradient);
  svg.append(defs);

  const hexGroup = document.createElementNS(SVG_NAMESPACE, "g");
  const hexGroupId = `atlas-hexes-${map.id}`;
  hexGroup.id = hexGroupId;
  if (map.wrap_x) {
    for (const direction of [-1, 1]) {
      const repeatedView = document.createElementNS(SVG_NAMESPACE, "use");
      repeatedView.setAttribute("href", `#${hexGroupId}`);
      repeatedView.setAttribute("class", "atlas-hex-repeat");
      repeatedView.setAttribute("transform", `translate(${direction * wrapWidth} 0)`);
      svg.append(repeatedView);
    }
  }
  svg.append(hexGroup);

  const landTiles = expandLandRows(mask);
  const generatedAreaTiles = new Map(Object.entries(mask.area_masks ?? {}).map(([areaId, areaMask]) => (
    [areaId, expandTileRows(areaMask.tile_rows)]
  )));
  const continentAreas = areas.filter((area) => area.layer === "continent");
  const countryAreas = areas.filter((area) => area.layer === "country");
  const specialAreas = areas.filter((area) => area.layer === "special");
  const assignments = new Map<string, TileAssignment>();
  const boundsByArea = new Map<string, TileBounds>();

  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const isLand = landTiles.has(tileKey(col, row));
      const continent = isLand ? highestPriorityArea(continentAreas, col, row, generatedAreaTiles) : undefined;
      const country = isLand ? highestPriorityArea(countryAreas, col, row, generatedAreaTiles) : undefined;
      const special = highestPriorityArea(specialAreas.filter((area) => {
        const target = area.applies_to ?? "land";
        return target === "any" || (target === "land" && isLand) || (target === "ocean" && !isLand);
      }), col, row, generatedAreaTiles);
      assignments.set(tileKey(col, row), { continent, country, special });
      addToBounds(boundsByArea, continent, col, row);
      addToBounds(boundsByArea, country, col, row);
      addToBounds(boundsByArea, special, col, row);
    }
  }

  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const key = tileKey(col, row);
      const isLand = landTiles.has(key);
      const assignment = assignments.get(key) ?? {};
      const polygon = document.createElementNS(SVG_NAMESPACE, "polygon");
      polygon.setAttribute("points", hexPoints(centerFor({ col, row }), radius));
      polygon.setAttribute("class", isLand ? "atlas-hex atlas-hex--land" : "atlas-hex atlas-hex--ocean");
      if (!isLand) polygon.style.fill = `url(#${oceanGradientId})`;
      polygon.dataset.col = String(col);
      polygon.dataset.row = String(row);

      if (isLand) {
        const neighbors = neighborCoordinates(col, row);
        const coast = neighbors.some((neighbor) => !landTiles.has(tileKey(neighbor.col, neighbor.row)));
        const politicalBoundary = Boolean(assignment.country) && neighbors.some((neighbor) => {
          const neighborKey = tileKey(neighbor.col, neighbor.row);
          return landTiles.has(neighborKey) && assignments.get(neighborKey)?.country?.id !== assignment.country?.id;
        });
        const shade = Math.abs(col * 17 + row * 31 + map.mask_id.length) % 4;
        polygon.dataset.mask = map.mask_id;
        polygon.dataset.shade = String(shade);
        if (assignment.continent) polygon.dataset.continent = assignment.continent.id;
        if (assignment.country) {
          polygon.dataset.country = assignment.country.id;
          polygon.dataset.areaStyle = assignment.country.style_token ?? "country-unassigned";
          polygon.dataset.politicalStatus = assignment.country.political_status ?? "active";
        } else if (assignment.special) {
          polygon.dataset.areaStyle = assignment.special.style_token ?? "unexplored";
        }
        if (assignment.special) polygon.dataset.special = assignment.special.id;
        if (coast) polygon.dataset.coast = "true";
        if (politicalBoundary) polygon.dataset.politicalBoundary = "true";
      } else if (assignment.special) {
        polygon.dataset.special = assignment.special.id;
        polygon.dataset.areaStyle = assignment.special.style_token ?? "anomaly";
      }

      hexGroup.append(polygon);
    }
  }

  const overlayNodes = Array.from(layer.querySelectorAll("[data-atlas-marker], [data-atlas-area-label]"));
  layer.replaceChildren(svg, ...overlayNodes);
  layer.style.width = `${width}px`;
  layer.style.height = `${height}px`;
  layer.dataset.palette = map.appearance?.palette ?? "monochrome";
  layer.dataset.relief = map.appearance?.relief ?? "none";
  layer.dataset.material = map.appearance?.material ?? "none";

  layer.querySelectorAll<HTMLElement>("[data-col][data-row]").forEach((element) => {
    const col = Number(element.dataset.col);
    const row = Number(element.dataset.row);
    const point = centerFor({ col, row });
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
  });

  return { width, height, size, wrapWidth, centerFor, boundsByArea };
}

function areaKind(area: AtlasArea): string {
  if (area.layer === "continent") return "大陆与板块";
  if (area.layer === "special") return "特殊地理区域";
  return area.political_status === "unruled" ? "无现行政权地区" : "国家";
}

export function initAtlas(): void {
  const root = document.querySelector<HTMLElement>("[data-atlas]");
  const stage = root?.querySelector<HTMLElement>("[data-atlas-stage]");
  const canvas = root?.querySelector<HTMLElement>("[data-atlas-canvas]");
  const layer = canvas?.querySelector<HTMLElement>("[data-atlas-map]");
  const data = readData();

  if (!root || !stage || !canvas || !layer || !data?.maps.length) return;

  const activeMap = data.maps[0];
  if (activeMap.type !== "hex") return;
  const activeMask = data.tile_masks?.[activeMap.mask_id];
  if (!activeMask) return;
  const activeAreas = (data.areas ?? []).filter((area) => area.map_id === activeMap.id);
  const geometry = createHexMap(activeMap, activeMask, activeAreas, layer);
  const minScale = Number(activeMap.min_zoom ?? 0.25);
  const maxScale = Number(activeMap.max_zoom ?? 3);
  const configuredDefaultScale = Number(activeMap.default_zoom ?? 0.82);
  const fitScale = Math.min(
    (stage.clientWidth - 32) / geometry.width,
    (stage.clientHeight - 32) / geometry.height,
  );
  const defaultScale = Math.min(maxScale, Math.max(minScale, Math.min(configuredDefaultScale, fitScale)));
  const defaultCenter = geometry.centerFor(activeMap.default_center ?? {
    col: (activeMap.grid.columns - 1) / 2,
    row: (activeMap.grid.rows - 1) / 2,
  });
  const readout = root.querySelector<HTMLElement>("[data-atlas-zoom-readout]");
  const count = root.querySelector<HTMLElement>("[data-atlas-count]");
  const search = root.querySelector<HTMLInputElement>("[data-atlas-search]");
  const selection = root.querySelector<HTMLElement>("[data-atlas-selection]");
  const selectionKind = root.querySelector<HTMLElement>("[data-atlas-selection-kind]");
  const selectionTitle = root.querySelector<HTMLElement>("[data-atlas-selection-title]");
  const selectionStatus = root.querySelector<HTMLElement>("[data-atlas-selection-status]");
  const selectionLink = root.querySelector<HTMLAnchorElement>("[data-atlas-selection-link]");

  let scale = defaultScale;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  const render = (): void => {
    if (activeMap.wrap_x) {
      const screenPeriod = geometry.wrapWidth * scale;
      offsetX = ((offsetX + screenPeriod / 2) % screenPeriod + screenPeriod) % screenPeriod - screenPeriod / 2;
    }
    layer.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`;
    layer.style.setProperty("--atlas-marker-scale", String(1 / scale));
    layer.style.setProperty("--atlas-area-label-scale", String(1 / scale));
    layer.dataset.zoomBand = scale < 0.3 ? "overview" : scale < 0.6 ? "region" : "detail";
    if (readout) readout.textContent = `${Math.round(scale * 100 + 1e-6)}%`;
  };

  const centerOn = (point: PixelPoint): void => {
    offsetX = (geometry.width / 2 - point.x) * scale;
    offsetY = (geometry.height / 2 - point.y) * scale;
  };

  const clearSelection = (): void => {
    root.querySelectorAll<HTMLElement>("[data-selected]").forEach((element) => element.removeAttribute("data-selected"));
    root.querySelectorAll<HTMLElement>("[aria-pressed='true']").forEach((element) => element.setAttribute("aria-pressed", "false"));
    layer.removeAttribute("data-has-selection");
    if (selection) selection.hidden = true;
  };

  const resetView = (): void => {
    clearSelection();
    scale = defaultScale;
    centerOn(defaultCenter);
    render();
  };

  const setScale = (next: number): void => {
    const previousScale = scale;
    scale = Math.min(maxScale, Math.max(minScale, next));
    const ratio = scale / previousScale;
    offsetX *= ratio;
    offsetY *= ratio;
    render();
  };

  const focusBounds = (bounds: TileBounds): void => {
    const topLeft = geometry.centerFor({ col: bounds.minCol, row: bounds.minRow });
    const bottomRight = geometry.centerFor({ col: bounds.maxCol, row: bounds.maxRow });
    const width = Math.abs(bottomRight.x - topLeft.x) + geometry.size * 3;
    const height = Math.abs(bottomRight.y - topLeft.y) + geometry.size * SQRT_THREE * 3;
    scale = Math.min(maxScale, Math.max(defaultScale, Math.min(
      (stage.clientWidth - 96) / width,
      (stage.clientHeight - 128) / height,
    )));
    centerOn({ x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 });
    render();
  };

  const updateUrl = (parameters: { area?: AtlasArea; location?: AtlasLocation }): void => {
    const url = new URL(window.location.href);
    url.searchParams.delete("area");
    url.searchParams.delete("entity");
    url.searchParams.delete("loc");
    if (parameters.area?.entity_id) url.searchParams.set("entity", parameters.area.entity_id);
    else if (parameters.area) url.searchParams.set("area", parameters.area.id);
    if (parameters.location) url.searchParams.set("loc", parameters.location.id);
    window.history.replaceState({}, "", url);
  };

  const selectArea = (area: AtlasArea, writeUrl = true): void => {
    clearSelection();
    root.querySelectorAll<HTMLElement>("[data-area-id]").forEach((item) => {
      const selected = item.dataset.areaId === area.id;
      item.toggleAttribute("data-selected", selected);
      item.querySelector<HTMLElement>("[data-atlas-area-focus]")?.setAttribute("aria-pressed", String(selected));
    });
    root.querySelectorAll<HTMLElement>("[data-atlas-area-label]").forEach((label) => {
      const selected = label.dataset.atlasAreaFocus === area.id;
      label.toggleAttribute("data-selected", selected);
    });
    layer.querySelectorAll<SVGElement>(".atlas-hex").forEach((hex) => {
      const selected = hex.dataset.country === area.id || hex.dataset.continent === area.id || hex.dataset.special === area.id;
      hex.dataset.selected = String(selected);
    });
    layer.dataset.hasSelection = "true";

    const bounds = geometry.boundsByArea.get(area.id);
    if (bounds) focusBounds(bounds);
    if (selection) selection.hidden = false;
    if (selectionKind) selectionKind.textContent = areaKind(area);
    if (selectionTitle) selectionTitle.textContent = area.label;
    if (selectionStatus) {
      selectionStatus.textContent = area.detail_status === "awaiting-source"
        ? "已聚焦世界总图范围；国家详图等待独立参考图。"
        : "地图区域已聚焦。";
    }
    const entity = area.entity_id ? data.entities?.[area.entity_id] : undefined;
    if (selectionLink && entity?.page_ref) {
      selectionLink.href = entity.page_ref;
      selectionLink.hidden = false;
    } else if (selectionLink) {
      selectionLink.hidden = true;
    }
    if (writeUrl) updateUrl({ area });
  };

  const selectLocation = (location: AtlasLocation, writeUrl = true): void => {
    clearSelection();
    root.querySelectorAll<HTMLElement>("[data-atlas-location-item]").forEach((item) => {
      const selected = item.dataset.locationId === location.id;
      item.toggleAttribute("data-selected", selected);
      item.querySelector<HTMLElement>("[data-atlas-focus]")?.setAttribute("aria-pressed", String(selected));
    });
    root.querySelectorAll<HTMLElement>("[data-atlas-marker]").forEach((marker) => {
      marker.toggleAttribute("data-selected", marker.dataset.locationId === location.id);
    });
    centerOn(geometry.centerFor(location));
    render();
    if (writeUrl) updateUrl({ location });
  };

  root.querySelectorAll<HTMLElement>("[data-atlas-zoom]").forEach((button) => {
    button.addEventListener("click", () => setScale(scale * (button.dataset.atlasZoom === "in" ? 1.25 : 0.8)));
  });

  root.querySelector<HTMLElement>("[data-atlas-reset]")?.addEventListener("click", () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("area");
    url.searchParams.delete("entity");
    url.searchParams.delete("loc");
    window.history.replaceState({}, "", url);
    resetView();
  });

  stage.addEventListener("pointerdown", (event) => {
    if ((event.target as Element).closest("button, a, input")) return;
    dragging = true;
    stage.dataset.dragging = "true";
    stage.setPointerCapture(event.pointerId);
    startX = event.clientX;
    startY = event.clientY;
    originX = offsetX;
    originY = offsetY;
  });

  stage.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    offsetX = originX + event.clientX - startX;
    offsetY = originY + event.clientY - startY;
    render();
  });

  const stopDragging = (): void => {
    dragging = false;
    delete stage.dataset.dragging;
  };

  stage.addEventListener("pointerup", stopDragging);
  stage.addEventListener("pointercancel", stopDragging);
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    setScale(scale * (event.deltaY < 0 ? 1.12 : 0.89));
  }, { passive: false });

  stage.addEventListener("keydown", (event) => {
    const movement = 48;
    if (event.key === "+" || event.key === "=") setScale(scale * 1.25);
    else if (event.key === "-") setScale(scale * 0.8);
    else if (event.key === "ArrowLeft") offsetX += movement;
    else if (event.key === "ArrowRight") offsetX -= movement;
    else if (event.key === "ArrowUp") offsetY += movement;
    else if (event.key === "ArrowDown") offsetY -= movement;
    else if (event.key === "0") resetView();
    else return;
    event.preventDefault();
    render();
  });

  search?.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    root.querySelectorAll<HTMLElement>("[data-atlas-location-item], [data-atlas-area-item]").forEach((item) => {
      const visible = item.textContent?.toLocaleLowerCase().includes(query) ?? false;
      item.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    if (count) count.textContent = `${visibleCount} 个地图条目`;
  });

  root.querySelectorAll<HTMLElement>("[data-atlas-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const location = data.locations.find((entry) => entry.id === button.dataset.atlasFocus);
      if (location) selectLocation(location);
    });
  });

  root.querySelectorAll<HTMLElement>("[data-atlas-area-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const area = activeAreas.find((entry) => entry.id === button.dataset.atlasAreaFocus);
      if (area) selectArea(area);
    });
  });

  const params = new URLSearchParams(window.location.search);
  const requestedArea = params.get("area");
  const requestedLocation = params.get("loc");
  const requestedEntity = params.get("entity");
  const targetArea = activeAreas.find((area) => area.id === requestedArea || area.entity_id === requestedEntity);
  const targetLocation = data.locations.find((location) => (
    location.id === requestedLocation || (!targetArea && !requestedLocation && location.entity_id === requestedEntity)
  ));

  if (targetArea) selectArea(targetArea, false);
  else if (targetLocation) selectLocation(targetLocation, false);
  else resetView();
}
