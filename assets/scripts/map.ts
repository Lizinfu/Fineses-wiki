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
  map_id: string;
  entity_id?: string;
  label: string;
  kind?: string;
  detail_status?: "available" | "awaiting-source";
  detail_map_id?: string;
  footprint_status?: "provisional" | "verified";
  position?: {
    x: number;
    y: number;
  };
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
  alignment?: {
    parent_mask_id: string;
    parent_area_id?: string;
    parent_location_id?: string;
    transform: [number, number, number, number];
    parent_hex_radius: number;
  };
};

type AtlasArea = {
  id: string;
  map_id: string;
  layer: "continent" | "country" | "special" | "city";
  entity_id?: string;
  label: string;
  label_anchor: [number, number];
  polygons?: Array<Array<[number, number]>>;
  tile_source?: "generated";
  style_token?: string;
  political_status?: "active" | "unruled";
  priority?: number;
  detail_status?: "available" | "awaiting-source";
  detail_map_id?: string;
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
  title?: string;
  page_ref?: string;
  type: "hex";
  level?: 0 | 1 | 2;
  parent_map_id?: string;
  parent_entity_id?: string;
  mask_id: string;
  grid: HexGrid;
  wrap_x?: boolean;
  land_only?: boolean;
  chunk_size?: number;
  min_zoom?: number;
  max_zoom?: number;
  default_zoom?: number;
  default_center?: HexCoordinate;
  appearance?: AtlasAppearance;
};

type AtlasContext = {
  map: AtlasMap;
  mask: TileMask;
  areas: AtlasArea[];
  focus_area_id: string;
};

type AtlasData = {
  maps: AtlasMap[];
  map_urls?: Record<string, string>;
  detail_areas?: AtlasArea[];
  detail_locations?: AtlasLocation[];
  features?: Record<"administrative_regions" | "terrain" | "waterways" | "routes" | "settlements", unknown[]>;
  context?: AtlasContext;
  locations: AtlasLocation[];
  areas: AtlasArea[];
  entities: Record<string, AtlasEntity>;
  tile_masks: Record<string, TileMask>;
};

type PixelPoint = {
  x: number;
  y: number;
};

type PixelBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
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
  city?: AtlasArea;
};

type HexGeometry = {
  width: number;
  height: number;
  size: number;
  wrapWidth: number;
  centerFor: (coordinate: HexCoordinate) => PixelPoint;
  areaAt: (point: PixelPoint) => TileAssignment | undefined;
  boundsByArea: Map<string, TileBounds>;
  logicalTileCount: number;
  renderedTileNodeCount: number;
  coastSegmentCount: number;
  boundarySegmentCount: number;
  updateVisibleChunks?: (viewport: PixelBounds) => number;
  redrawContext?: () => void;
  contextTileCount?: number;
};

type BoundarySegment = {
  start: PixelPoint;
  end: PixelPoint;
};

type HexNeighbor = HexCoordinate & {
  edgeStart: number;
  edgeEnd: number;
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

function neighborsWithEdges(col: number, row: number): HexNeighbor[] {
  const verticalOffset = col % 2 === 0 ? -1 : 1;
  return [
    { col: col - 1, row: row + Math.min(verticalOffset, 0), edgeStart: 3, edgeEnd: 4 },
    { col: col - 1, row: row + Math.max(verticalOffset, 0), edgeStart: 2, edgeEnd: 3 },
    { col: col + 1, row: row + Math.min(verticalOffset, 0), edgeStart: 5, edgeEnd: 0 },
    { col: col + 1, row: row + Math.max(verticalOffset, 0), edgeStart: 0, edgeEnd: 1 },
    { col, row: row - 1, edgeStart: 4, edgeEnd: 5 },
    { col, row: row + 1, edgeStart: 1, edgeEnd: 2 },
  ];
}

function hexPoints(center: PixelPoint, radius: number): string {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    return `${center.x + radius * Math.cos(angle)},${center.y + radius * Math.sin(angle)}`;
  }).join(" ");
}

function hexCorners(center: PixelPoint, radius: number): PixelPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 3) * index;
    return {
      x: center.x + radius * Math.cos(angle),
      y: center.y + radius * Math.sin(angle),
    };
  });
}

function hexPath(center: PixelPoint, radius: number): string {
  const [first, ...rest] = hexCorners(center, radius);
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")} Z`;
}

function segmentsPath(segments: BoundarySegment[]): string {
  return segments.map(({ start, end }) => `M ${start.x} ${start.y} L ${end.x} ${end.y}`).join(" ");
}

function normalizedTileKey(
  coordinate: HexCoordinate,
  columns: number,
  rows: number,
  wrapX: boolean,
): string | null {
  if (coordinate.row < 0 || coordinate.row >= rows) return null;
  if (!wrapX && (coordinate.col < 0 || coordinate.col >= columns)) return null;
  const col = wrapX
    ? ((coordinate.col % columns) + columns) % columns
    : coordinate.col;
  return tileKey(col, coordinate.row);
}

function politicalRegionId(assignment: TileAssignment): string {
  return assignment.country?.id ?? assignment.city?.id ?? assignment.special?.id ?? "land.unassigned";
}

function locationCoordinate(location: AtlasLocation, map: AtlasMap): HexCoordinate {
  if (!location.position) return location;
  const x = map.wrap_x
    ? ((location.position.x % 1) + 1) % 1
    : Math.min(1, Math.max(0, location.position.x));
  const y = Math.min(1, Math.max(0, location.position.y));
  return {
    col: Math.round(x * (map.grid.columns - 1)),
    row: Math.round(y * (map.grid.rows - 1)),
  };
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

function createContextCanvas(
  context: AtlasContext,
  alignment: NonNullable<TileMask["alignment"]>,
  width: number,
  height: number,
  detailSize: number,
  centerFor: (coordinate: HexCoordinate) => PixelPoint,
  layer: HTMLElement,
  drawCanvas = true,
): { canvas?: HTMLCanvasElement; redraw?: () => void; tileCount: number; footprintPath: string; boundaryPath: string; borderCount: number } | undefined {
  const focusTiles = expandTileRows(context.mask.area_masks?.[context.focus_area_id]?.tile_rows ?? []);
  if (!focusTiles.size) return undefined;
  const [scaleX, scaleY, offsetX, offsetY] = alignment.transform;
  const base = centerFor({ col: 0, row: 0 });
  const worldPointFor = ({ col, row }: HexCoordinate): PixelPoint => ({
    x: base.x + (col * 1.5 * scaleX + offsetX) * detailSize,
    y: base.y + ((row + (col % 2 === 0 ? 0 : 0.5)) * SQRT_THREE * scaleY + offsetY) * detailSize,
  });
  const radiusX = alignment.parent_hex_radius * scaleX * detailSize;
  const radiusY = alignment.parent_hex_radius * scaleY * detailSize;
  const worldCorners = (point: PixelPoint): PixelPoint[] => Array.from({ length: 6 }, (_, corner) => ({
    x: point.x + Math.cos(corner * Math.PI / 3) * radiusX,
    y: point.y + Math.sin(corner * Math.PI / 3) * radiusY,
  }));
  const focusCoordinates = [...focusTiles].map((key) => {
    const [col, row] = key.split(":").map(Number);
    return { col, row };
  });
  const footprintPath = focusCoordinates.map((coordinate) => {
    const [first, ...rest] = worldCorners(worldPointFor(coordinate));
    return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")} Z`;
  }).join(" ");
  const boundarySegments: BoundarySegment[] = [];
  for (const { col, row } of focusCoordinates) {
    const corners = worldCorners(worldPointFor({ col, row }));
    for (const neighbor of neighborsWithEdges(col, row)) {
      if (!focusTiles.has(tileKey(neighbor.col, neighbor.row))) {
        boundarySegments.push({ start: corners[neighbor.edgeStart], end: corners[neighbor.edgeEnd] });
      }
    }
  }
  if (!drawCanvas) {
    return {
      tileCount: 0, footprintPath,
      boundaryPath: segmentsPath(boundarySegments), borderCount: boundarySegments.length,
    };
  }
  const worldLand = expandLandRows(context.mask);
  const worldAreas = new Map<string, AtlasArea>();
  for (const area of [...context.areas].sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0))) {
    if (area.layer !== "country" && area.layer !== "special") continue;
    for (const key of expandTileRows(context.mask.area_masks?.[area.id]?.tile_rows ?? [])) worldAreas.set(key, area);
  }

  const canvas = document.createElement("canvas");
  canvas.className = "atlas-context-canvas";
  const resolution = Math.min(1, 1600 / width, 1100 / height);
  canvas.width = Math.ceil(width * resolution);
  canvas.height = Math.ceil(height * resolution);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const drawing = canvas.getContext("2d", { alpha: true });
  if (!drawing) return undefined;
  const visibleTiles: Array<{ col: number; row: number; point: PixelPoint }> = [];
  for (let col = 0; col < context.map.grid.columns; col += 1) {
    for (let row = 0; row < context.map.grid.rows; row += 1) {
      const point = worldPointFor({ col, row });
      if (point.x < -radiusX || point.x > width + radiusX ||
        point.y < -radiusY || point.y > height + radiusY) continue;
      visibleTiles.push({ col, row, point });
    }
  }

  const drawHex = (point: PixelPoint): void => {
    drawing.beginPath();
    for (let corner = 0; corner < 6; corner += 1) {
      const angle = corner * Math.PI / 3;
      const x = point.x + Math.cos(angle) * radiusX;
      const y = point.y + Math.sin(angle) * radiusY;
      if (corner === 0) drawing.moveTo(x, y);
      else drawing.lineTo(x, y);
    }
    drawing.closePath();
  };

  const redraw = (): void => {
    drawing.setTransform(1, 0, 0, 1, 0, 0);
    drawing.clearRect(0, 0, canvas.width, canvas.height);
    drawing.setTransform(resolution, 0, 0, resolution, 0, 0);
    const style = getComputedStyle(layer);
    const oceanFill = style.getPropertyValue("--atlas-ocean-surface").trim() || "#cbd3d7";
    const landFill = style.getPropertyValue("--atlas-land-1").trim() || "#d6d8d6";
    const targetFill = style.getPropertyValue("--atlas-land-0").trim() || "#dedfdd";
    drawing.lineWidth = 2.5;
    drawing.strokeStyle = style.getPropertyValue("--atlas-ocean-line").trim() || "#a8b3b9";
    for (const { col, row, point } of visibleTiles) {
      const key = tileKey(col, row);
      const area = worldAreas.get(key);
      const token = area?.style_token;
      drawing.fillStyle = area?.id === context.focus_area_id
        ? targetFill
        : token ? (style.getPropertyValue(`--atlas-${token}`).trim() || landFill)
          : worldLand.has(key) ? landFill : oceanFill;
      drawHex(point);
      drawing.fill();
      drawing.stroke();
    }
    drawing.globalCompositeOperation = "destination-out";
    for (const coordinate of focusCoordinates) {
      drawHex(worldPointFor(coordinate));
      drawing.fill();
    }
    drawing.globalCompositeOperation = "source-over";
    drawing.setTransform(1, 0, 0, 1, 0, 0);
  };

  return {
    canvas, redraw, tileCount: visibleTiles.length,
    footprintPath, boundaryPath: segmentsPath(boundarySegments), borderCount: boundarySegments.length,
  };
}

function createHexMap(
  map: AtlasMap,
  mask: TileMask,
  areas: AtlasArea[],
  locations: AtlasLocation[],
  layer: HTMLElement,
  context?: AtlasContext,
  drawContext = true,
): HexGeometry {
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

  const lightingGradient = document.createElementNS(SVG_NAMESPACE, "linearGradient");
  const lightingGradientId = `atlas-light-wash-${map.id}`;
  lightingGradient.id = lightingGradientId;
  lightingGradient.setAttribute("x1", "0");
  lightingGradient.setAttribute("y1", "0");
  lightingGradient.setAttribute("x2", "1");
  lightingGradient.setAttribute("y2", "1");
  for (const [offset, className] of [
    ["0%", "atlas-light-wash__highlight"],
    ["50%", "atlas-light-wash__mid"],
    ["100%", "atlas-light-wash__shadow"],
  ]) {
    const stop = document.createElementNS(SVG_NAMESPACE, "stop");
    stop.setAttribute("offset", offset);
    stop.setAttribute("class", className);
    lightingGradient.append(stop);
  }
  defs.append(lightingGradient);

  const landClip = document.createElementNS(SVG_NAMESPACE, "clipPath");
  const landClipId = `atlas-land-clip-${map.id}`;
  landClip.id = landClipId;
  const landClipPath = document.createElementNS(SVG_NAMESPACE, "path");
  landClipPath.setAttribute("class", "atlas-land-clip-path");
  landClip.append(landClipPath);
  defs.append(landClip);

  const reliefFilter = document.createElementNS(SVG_NAMESPACE, "filter");
  const reliefFilterId = `atlas-relief-${map.id}`;
  reliefFilter.id = reliefFilterId;
  reliefFilter.setAttribute("class", "atlas-relief-filter");
  reliefFilter.setAttribute("x", "-10%");
  reliefFilter.setAttribute("y", "-10%");
  reliefFilter.setAttribute("width", "120%");
  reliefFilter.setAttribute("height", "120%");
  const turbulence = document.createElementNS(SVG_NAMESPACE, "feTurbulence");
  turbulence.setAttribute("type", "fractalNoise");
  turbulence.setAttribute("baseFrequency", "0.004 0.009");
  turbulence.setAttribute("numOctaves", "2");
  turbulence.setAttribute("seed", String(map.id.length * 19));
  const monochrome = document.createElementNS(SVG_NAMESPACE, "feColorMatrix");
  monochrome.setAttribute("type", "saturate");
  monochrome.setAttribute("values", "0");
  reliefFilter.append(turbulence, monochrome);
  defs.append(reliefFilter);
  svg.append(defs);

  const mapContent = document.createElementNS(SVG_NAMESPACE, "g");
  const mapContentId = `atlas-map-content-${map.id}`;
  mapContent.id = mapContentId;
  if (map.wrap_x) {
    for (const direction of [-1, 1]) {
      const repeatedView = document.createElementNS(SVG_NAMESPACE, "use");
      repeatedView.setAttribute("href", `#${mapContentId}`);
      repeatedView.setAttribute("class", "atlas-map-repeat atlas-hex-repeat");
      repeatedView.setAttribute("transform", `translate(${direction * wrapWidth} 0)`);
      svg.append(repeatedView);
    }
  }
  svg.append(mapContent);

  const terrainLayer = document.createElementNS(SVG_NAMESPACE, "g");
  terrainLayer.setAttribute("class", "atlas-svg-layer atlas-terrain-layer");
  terrainLayer.dataset.layer = "terrain";
  const relief = document.createElementNS(SVG_NAMESPACE, "rect");
  relief.setAttribute("class", "atlas-terrain-relief");
  relief.setAttribute("width", String(width));
  relief.setAttribute("height", String(height));
  relief.setAttribute("clip-path", `url(#${landClipId})`);
  relief.setAttribute("filter", `url(#${reliefFilterId})`);
  const lightingWash = document.createElementNS(SVG_NAMESPACE, "rect");
  lightingWash.setAttribute("class", "atlas-lighting-wash");
  lightingWash.setAttribute("width", String(width));
  lightingWash.setAttribute("height", String(height));
  lightingWash.setAttribute("fill", `url(#${lightingGradientId})`);
  lightingWash.setAttribute("clip-path", `url(#${landClipId})`);
  terrainLayer.append(relief, lightingWash);

  const politicalLayer = document.createElementNS(SVG_NAMESPACE, "g");
  politicalLayer.setAttribute("class", "atlas-svg-layer atlas-political-layer");
  politicalLayer.dataset.layer = "political";

  const boundaryLayer = document.createElementNS(SVG_NAMESPACE, "g");
  boundaryLayer.setAttribute("class", "atlas-svg-layer atlas-boundary-layer");
  boundaryLayer.dataset.layer = "boundaries";

  const hydrologyLayer = document.createElementNS(SVG_NAMESPACE, "g");
  hydrologyLayer.setAttribute("class", "atlas-svg-layer atlas-hydrology-layer");
  hydrologyLayer.dataset.layer = "waterways";

  const administrativeLayer = document.createElementNS(SVG_NAMESPACE, "g");
  administrativeLayer.setAttribute("class", "atlas-svg-layer atlas-administrative-layer");
  administrativeLayer.dataset.layer = "administrative_regions";

  const settlementLayer = document.createElementNS(SVG_NAMESPACE, "g");
  settlementLayer.setAttribute("class", "atlas-svg-layer atlas-settlement-layer");
  settlementLayer.dataset.layer = "settlements";

  const routeLayer = document.createElementNS(SVG_NAMESPACE, "g");
  routeLayer.setAttribute("class", "atlas-svg-layer atlas-route-layer");
  routeLayer.dataset.layer = "routes";
  routeLayer.setAttribute("aria-hidden", "true");

  mapContent.append(politicalLayer, terrainLayer, hydrologyLayer, administrativeLayer, boundaryLayer, routeLayer, settlementLayer);

  const landTiles = expandLandRows(mask);
  const generatedAreaTiles = new Map(Object.entries(mask.area_masks ?? {}).map(([areaId, areaMask]) => (
    [areaId, expandTileRows(areaMask.tile_rows)]
  )));
  const continentAreas = areas.filter((area) => area.layer === "continent");
  const countryAreas = areas.filter((area) => area.layer === "country");
  const cityAreas = areas.filter((area) => area.layer === "city");
  const specialAreas = areas.filter((area) => area.layer === "special");
  const assignments = new Map<string, TileAssignment>();
  const boundsByArea = new Map<string, TileBounds>();
  const coastSegments: BoundarySegment[] = [];
  const boundarySegments = new Map<string, BoundarySegment[]>();
  const landPaths: string[] = [];
  const chunkSize = map.land_only ? (map.chunk_size ?? 16) : 0;
  const chunkCoordinates = new Map<string, HexCoordinate[]>();

  const applyTileAttributes = (shape: SVGElement, col: number, row: number, isLand: boolean): void => {
    const assignment = assignments.get(tileKey(col, row)) ?? {};
    shape.setAttribute("class", isLand ? "atlas-hex atlas-hex--land" : "atlas-hex atlas-hex--ocean");
    if (!isLand) {
      shape.setAttribute("fill", `url(#${oceanGradientId})`);
      if (assignment.special) {
        shape.dataset.special = assignment.special.id;
        shape.dataset.areaStyle = assignment.special.style_token ?? "unexplored";
      }
      return;
    }
    shape.dataset.mask = map.mask_id;
    const reliefValue = Math.sin(col * 0.29 + row * 0.12) * 0.55 +
      Math.cos(col * 0.11 - row * 0.33) * 0.45;
    shape.dataset.shade = String(Math.max(0, Math.min(3, Math.floor((reliefValue + 1) * 2))));
    if (assignment.continent) shape.dataset.continent = assignment.continent.id;
    if (assignment.country) {
      shape.dataset.country = assignment.country.id;
      shape.dataset.areaStyle = assignment.country.style_token ?? "country-unassigned";
      shape.dataset.politicalStatus = assignment.country.political_status ?? "active";
    } else if (assignment.special) {
      shape.dataset.areaStyle = assignment.special.style_token ?? "unexplored";
    }
    if (assignment.city) {
      shape.dataset.city = assignment.city.id;
      shape.dataset.areaStyle = assignment.city.style_token ?? "urban";
    }
    if (assignment.special) shape.dataset.special = assignment.special.id;
    if (layer.dataset.selectedAreaId) {
      shape.dataset.selected = String([assignment.continent?.id, assignment.country?.id, assignment.special?.id]
        .includes(layer.dataset.selectedAreaId));
    }
  };

  const createTilePolygon = (col: number, row: number): SVGPolygonElement => {
    const polygon = document.createElementNS(SVG_NAMESPACE, "polygon");
    polygon.setAttribute("points", hexPoints(centerFor({ col, row }), radius));
    polygon.dataset.col = String(col);
    polygon.dataset.row = String(row);
    applyTileAttributes(polygon, col, row, landTiles.has(tileKey(col, row)));
    return polygon;
  };

  const worldBatches = new Map<string, { coordinate: HexCoordinate; land: boolean; paths: string[]; count: number }>();
  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const isLand = landTiles.has(tileKey(col, row));
      const continent = isLand ? highestPriorityArea(continentAreas, col, row, generatedAreaTiles) : undefined;
      const country = isLand ? highestPriorityArea(countryAreas, col, row, generatedAreaTiles) : undefined;
      const city = isLand ? highestPriorityArea(cityAreas, col, row, generatedAreaTiles) : undefined;
      const special = highestPriorityArea(specialAreas.filter((area) => {
        const target = area.applies_to ?? "land";
        return target === "any" || (target === "land" && isLand) || (target === "ocean" && !isLand);
      }), col, row, generatedAreaTiles);
      assignments.set(tileKey(col, row), { continent, country, special, city });
      addToBounds(boundsByArea, continent, col, row);
      addToBounds(boundsByArea, country, col, row);
      addToBounds(boundsByArea, special, col, row);
      addToBounds(boundsByArea, city, col, row);
    }
  }

  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const key = tileKey(col, row);
      const isLand = landTiles.has(key);
      if (isLand) landPaths.push(hexPath(centerFor({ col, row }), radius));
      if (map.land_only) {
        if (isLand) {
          const chunkKey = `${Math.floor(col / chunkSize)}:${Math.floor(row / chunkSize)}`;
          const coordinates = chunkCoordinates.get(chunkKey) ?? [];
          coordinates.push({ col, row });
          chunkCoordinates.set(chunkKey, coordinates);
        }
        continue;
      }
      const assignment = assignments.get(key) ?? {};
      const batchKey = [isLand, assignment.continent?.id, assignment.country?.id,
        assignment.special?.id, assignment.city?.id].join("|");
      let batch = worldBatches.get(batchKey);
      if (!batch) {
        batch = { coordinate: { col, row }, land: isLand, paths: [], count: 0 };
        worldBatches.set(batchKey, batch);
      }
      batch.paths.push(hexPath(centerFor({ col, row }), radius));
      batch.count += 1;
    }
  }

  if (!map.land_only) {
    for (const batch of worldBatches.values()) {
      const path = document.createElementNS(SVG_NAMESPACE, "path");
      path.setAttribute("d", batch.paths.join(" "));
      path.setAttribute("class", "atlas-hex atlas-hex-batch");
      path.dataset.tileCount = String(batch.count);
      applyTileAttributes(path, batch.coordinate.col, batch.coordinate.row, batch.land);
      path.classList.add("atlas-hex-batch");
      politicalLayer.append(path);
    }
  }

  landClipPath.setAttribute("d", landPaths.join(" "));

  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const key = tileKey(col, row);
      if (!landTiles.has(key)) continue;
      const assignment = assignments.get(key) ?? {};
      const regionId = politicalRegionId(assignment);
      const corners = hexCorners(centerFor({ col, row }), radius);
      for (const neighbor of neighborsWithEdges(col, row)) {
        const neighborKey = normalizedTileKey(neighbor, columns, rows, Boolean(map.wrap_x));
        const neighborIsLand = Boolean(neighborKey && landTiles.has(neighborKey));
        const segment = { start: corners[neighbor.edgeStart], end: corners[neighbor.edgeEnd] };
        if (!neighborIsLand) {
          coastSegments.push(segment);
          continue;
        }
        const neighborRegionId = politicalRegionId(assignments.get(neighborKey!) ?? {});
        if (neighborRegionId === regionId || key.localeCompare(neighborKey!) > 0) continue;
        const pair = [regionId, neighborRegionId].sort();
        const pairKey = pair.join("|");
        const segments = boundarySegments.get(pairKey) ?? [];
        segments.push(segment);
        boundarySegments.set(pairKey, segments);
      }
    }
  }

  const coastPath = document.createElementNS(SVG_NAMESPACE, "path");
  coastPath.setAttribute("class", "atlas-coast-path");
  coastPath.setAttribute("d", segmentsPath(coastSegments));
  boundaryLayer.append(coastPath);

  let boundarySegmentCount = 0;
  for (const [pairKey, segments] of boundarySegments) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    const areaIds = pairKey.split("|");
    path.setAttribute("class", "atlas-political-boundary-path");
    path.setAttribute("d", segmentsPath(segments));
    path.dataset.boundaryAreas = areaIds.join(" ");
    boundaryLayer.append(path);
    boundarySegmentCount += segments.length;
  }

  const contextCanvas = context?.map && context.mask && mask.alignment
    ? createContextCanvas(context, mask.alignment, width, height, size, centerFor, layer, drawContext)
    : undefined;
  if (contextCanvas) {
    const detailClip = document.createElementNS(SVG_NAMESPACE, "clipPath");
    detailClip.id = `atlas-shared-border-${map.id}`;
    const detailClipPath = document.createElementNS(SVG_NAMESPACE, "path");
    detailClipPath.setAttribute("d", contextCanvas.footprintPath);
    detailClip.append(detailClipPath);
    defs.append(detailClip);
    politicalLayer.setAttribute("clip-path", `url(#${detailClip.id})`);
    terrainLayer.setAttribute("clip-path", `url(#${detailClip.id})`);
    coastPath.setAttribute("d", contextCanvas.boundaryPath);
  }
  const overlayNodes = Array.from(layer.querySelectorAll("[data-atlas-label-layer]"));
  layer.replaceChildren(...(contextCanvas?.canvas ? [contextCanvas.canvas] : []), svg, ...overlayNodes);
  layer.style.width = `${width}px`;
  layer.style.height = `${height}px`;
  layer.dataset.palette = map.appearance?.palette ?? "monochrome";
  layer.dataset.relief = map.appearance?.relief ?? "none";
  layer.dataset.material = map.appearance?.material ?? "none";
  layer.dataset.landOnly = String(Boolean(map.land_only));
  layer.dataset.visualPreset = "political-pastel";

  layer.querySelectorAll<HTMLElement>("[data-col][data-row]").forEach((element) => {
    const location = element.dataset.locationId
      ? locations.find((entry) => entry.id === element.dataset.locationId)
      : undefined;
    const coordinate = location ? locationCoordinate(location, map) : {
      col: Number(element.dataset.col),
      row: Number(element.dataset.row),
    };
    const point = centerFor(coordinate);
    element.style.left = `${point.x}px`;
    element.style.top = `${point.y}px`;
  });
  layer.querySelectorAll<HTMLElement>("[data-map-x][data-map-y]").forEach((element) => {
    element.style.left = `${Number(element.dataset.mapX) * width}px`;
    element.style.top = `${Number(element.dataset.mapY) * height}px`;
  });

  const mountedChunks = new Map<string, SVGGElement>();
  const updateVisibleChunks = map.land_only ? (viewport: PixelBounds): number => {
    const margin = chunkSize * size * 1.5;
    for (const [key, coordinates] of chunkCoordinates) {
      const [chunkCol, chunkRow] = key.split(":").map(Number);
      const first = centerFor({ col: chunkCol * chunkSize, row: chunkRow * chunkSize });
      const last = centerFor({
        col: Math.min(columns - 1, (chunkCol + 1) * chunkSize - 1),
        row: Math.min(rows - 1, (chunkRow + 1) * chunkSize - 1),
      });
      const visible = first.x - margin <= viewport.maxX && last.x + margin >= viewport.minX &&
        first.y - margin <= viewport.maxY && last.y + margin >= viewport.minY;
      const existing = mountedChunks.get(key);
      if (!visible) {
        existing?.remove();
        mountedChunks.delete(key);
        continue;
      }
      if (existing) continue;
      const group = document.createElementNS(SVG_NAMESPACE, "g");
      group.setAttribute("class", "atlas-tile-chunk");
      group.dataset.atlasChunk = key;
      for (const { col, row } of coordinates) {
        group.append(createTilePolygon(col, row));
      }
      politicalLayer.append(group);
      mountedChunks.set(key, group);
    }
    return Array.from(mountedChunks.values()).reduce((total, group) => total + group.childElementCount, 0);
  } : undefined;

  return {
    width,
    height,
    size,
    wrapWidth,
    centerFor,
    areaAt: (point) => {
      const rawCol = Math.round((point.x - padding - size) / (size * 1.5));
      const col = map.wrap_x ? ((rawCol % columns) + columns) % columns : rawCol;
      const row = Math.round((point.y - padding - size * SQRT_THREE / 2) / (size * SQRT_THREE) -
        (col % 2 === 0 ? 0 : 0.5));
      return row >= 0 && row < rows && col >= 0 && col < columns
        ? assignments.get(tileKey(col, row)) : undefined;
    },
    boundsByArea,
    logicalTileCount: map.land_only ? landTiles.size : columns * rows,
    renderedTileNodeCount: map.land_only ? 0 : worldBatches.size,
    coastSegmentCount: contextCanvas?.borderCount ?? coastSegments.length,
    boundarySegmentCount,
    updateVisibleChunks,
    redrawContext: contextCanvas?.redraw,
    contextTileCount: contextCanvas?.tileCount,
  };
}

type AlignedOverlay = {
  layer: HTMLElement;
  geometry: HexGeometry;
  parentToDetail: (point: PixelPoint) => PixelPoint;
  detailToParent: (point: PixelPoint) => PixelPoint;
  setHorizontalRepeat: (shift: number) => void;
  scaleX: number;
  scaleY: number;
};

function alignDetailLayer(
  layer: HTMLElement,
  detail: HexGeometry,
  parent: HexGeometry,
  map: AtlasMap,
  alignment: NonNullable<TileMask["alignment"]>,
): AlignedOverlay {
  const [alignX, alignY, offsetX, offsetY] = alignment.transform;
  const parentZero = parent.centerFor({ col: 0, row: 0 });
  const detailZero = detail.centerFor({ col: 0, row: 0 });
  const scaleX = parent.size / (map.grid.hex_size * alignX);
  const scaleY = parent.size / (map.grid.hex_size * alignY);
  const shiftX = parentZero.x - (detailZero.x + offsetX * map.grid.hex_size) * scaleX;
  const shiftY = parentZero.y - (detailZero.y + offsetY * map.grid.hex_size) * scaleY;
  let horizontalRepeat = 0;
  const setHorizontalRepeat = (shift: number): void => {
    if (horizontalRepeat === shift && layer.style.transform) return;
    horizontalRepeat = shift;
    layer.style.transform = `translate(${shiftX + shift}px, ${shiftY}px) scale(${scaleX}, ${scaleY})`;
  };
  setHorizontalRepeat(0);
  return {
    layer, geometry: detail, scaleX, scaleY, setHorizontalRepeat,
    parentToDetail: (point) => ({ x: (point.x - shiftX - horizontalRepeat) / scaleX, y: (point.y - shiftY) / scaleY }),
    detailToParent: (point) => ({ x: shiftX + horizontalRepeat + point.x * scaleX, y: shiftY + point.y * scaleY }),
  };
}

function areaKind(area: AtlasArea): string {
  if (area.layer === "city") return "城区";
  if (area.layer === "continent") return "大陆与板块";
  if (area.layer === "special") return "特殊地理区域";
  return area.political_status === "unruled" ? "无现行政权地区" : "国家";
}

export function initAtlas(): void {
  const initStarted = performance.now();
  const root = document.querySelector<HTMLElement>("[data-atlas]");
  const stage = root?.querySelector<HTMLElement>("[data-atlas-stage]");
  const canvas = root?.querySelector<HTMLElement>("[data-atlas-canvas]");
  const layer = canvas?.querySelector<HTMLElement>("[data-atlas-map]");
  const data = readData();

  if (!root || !stage || !canvas || !layer || !data?.maps.length) return;

  const activeMap = data.maps[0];
  if (activeMap.type !== "hex") return;
  // Old national URLs remain valid deep links, but the interactive map has one home.
  if (activeMap.level === 1 && activeMap.parent_map_id) {
    const parentUrl = new URL(data.map_urls?.[activeMap.parent_map_id] ?? "/portals/atlas/", window.location.href);
    if (activeMap.parent_entity_id) parentUrl.searchParams.set("entity", activeMap.parent_entity_id);
    window.location.replace(parentUrl.href);
    return;
  }
  const activeMask = data.tile_masks?.[activeMap.mask_id];
  if (!activeMask) return;
  const activeAreas = (data.areas ?? []).filter((area) => area.map_id === activeMap.id);
  const activeLocations = (data.locations ?? []).filter((location) => location.map_id === activeMap.id);
  const geometry = createHexMap(activeMap, activeMask, activeAreas, activeLocations, layer, data.context);
  const detailEnterScale = 0.62;
  const detailExitScale = 0.53;
  const cityEnterScale = 2.4;
  const cityExitScale = 2.05;
  const nationOverlays: Array<{
    map: AtlasMap; area: AtlasArea; overlay: AlignedOverlay; visible: boolean;
    worldBox?: PixelBounds; visibleWorldBox?: PixelBounds; worldShift: number;
  }> = [];
  for (const nationMap of data.maps.filter((map) => map.parent_map_id === activeMap.id && map.level === 1)) {
    const detailMask = data.tile_masks?.[nationMap.mask_id];
    const alignment = detailMask?.alignment;
    const detailArea = activeAreas.find((area) => area.detail_map_id === nationMap.id);
    if (!detailMask || !alignment || !detailArea || alignment.parent_mask_id !== activeMap.mask_id) continue;
    const detailLayer = document.createElement("div");
    detailLayer.className = "atlas-map-layer atlas-detail-overlay";
    detailLayer.dataset.atlasDetailMap = nationMap.id;
    const detailAreas = (data.detail_areas ?? []).filter((area) => area.map_id === nationMap.id);
    const detailGeometry = createHexMap(nationMap, detailMask, detailAreas, [], detailLayer, {
      map: activeMap, mask: activeMask, areas: activeAreas, focus_area_id: detailArea.id,
    }, false);
    layer.append(detailLayer);
    const overlay = alignDetailLayer(detailLayer, detailGeometry, geometry, nationMap, alignment);
    nationOverlays.push({ map: nationMap, area: detailArea, overlay, visible: false, worldShift: 0 });
    layer.querySelectorAll<HTMLElement>("[data-atlas-area-label]").forEach((label) => {
      if (label.dataset.atlasAreaFocus === detailArea.id) label.dataset.detailMapId = nationMap.id;
    });
  }
  root.dataset.atlasDetailMapCount = String(nationOverlays.length);
  root.dataset.atlasDetailLogicalTiles = String(nationOverlays.reduce(
    (count, nation) => count + nation.overlay.geometry.logicalTileCount, 0));
  const cityMap = data.maps.find((map) => map.level === 2 && nationOverlays.some((nation) => nation.map.id === map.parent_map_id));
  const cityParent = nationOverlays.find((nation) => nation.map.id === cityMap?.parent_map_id);
  const detailMap = cityParent?.map;
  const detailOverlay = cityParent?.overlay;
  if (detailMap) root.dataset.atlasDetailMapId = detailMap.id;
  const detailMask = detailMap && data.tile_masks?.[detailMap.mask_id];
  const cityMask = cityMap && data.tile_masks?.[cityMap.mask_id];
  const cityLocation = (data.detail_locations ?? []).find((location) => location.detail_map_id === cityMap?.id);
  const cityParentArea = (data.detail_areas ?? []).find((area) =>
    area.id === cityMask?.alignment?.parent_area_id && area.map_id === detailMap?.id);
  let cityOverlay: AlignedOverlay | undefined;
  if (cityMap && cityMask?.alignment && detailMap && detailMask && detailOverlay && cityLocation && cityParentArea &&
    cityMask.alignment.parent_mask_id === detailMap.mask_id) {
    const nationLabels = document.createElement("div");
    nationLabels.className = "atlas-html-layer atlas-nation-labels";
    const cityButton = document.createElement("button");
    cityButton.type = "button";
    cityButton.className = "atlas-city-label";
    cityButton.dataset.atlasCityFocus = cityLocation.id;
    cityButton.setAttribute("aria-label", `放大查看${cityLocation.label}城区`);
    cityButton.textContent = cityLocation.label;
    const cityAnchor = detailOverlay.geometry.centerFor(locationCoordinate(cityLocation, detailMap));
    cityButton.style.left = `${cityAnchor.x}px`;
    cityButton.style.top = `${cityAnchor.y}px`;
    nationLabels.append(cityButton);
    detailOverlay.layer.append(nationLabels);

    const cityLayer = document.createElement("div");
    cityLayer.className = "atlas-map-layer atlas-detail-overlay atlas-city-overlay";
    cityLayer.dataset.atlasCityMap = cityMap.id;
    const cityAreas = (data.detail_areas ?? []).filter((area) => area.map_id === cityMap.id);
    const parentAreas = (data.detail_areas ?? []).filter((area) => area.map_id === detailMap.id);
    const cityGeometry = createHexMap(cityMap, cityMask, cityAreas, [], cityLayer, {
      map: detailMap, mask: detailMask, areas: parentAreas, focus_area_id: cityParentArea.id,
    }, false);
    detailOverlay.layer.append(cityLayer);
    cityOverlay = alignDetailLayer(cityLayer, cityGeometry, detailOverlay.geometry, cityMap, cityMask.alignment);
    root.dataset.atlasCityMapId = cityMap.id;
    root.dataset.atlasCityLogicalTiles = String(cityGeometry.logicalTileCount);
  }
  const minScale = Number(activeMap.min_zoom ?? 0.25);
  const maxScale = Number(activeMap.max_zoom ?? 3);
  const configuredDefaultScale = Number(activeMap.default_zoom ?? 0.82);
  const calculateDefaultScale = (): number => {
    const fitScale = Math.min(
      (stage.clientWidth - 32) / geometry.width,
      (stage.clientHeight - 32) / geometry.height,
    );
    return Math.min(maxScale, Math.max(minScale, Math.min(configuredDefaultScale, fitScale)));
  };
  let defaultScale = calculateDefaultScale();
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
  const selectionLeader = root.querySelector<SVGSVGElement>("[data-atlas-selection-leader]");
  const selectionLine = root.querySelector<SVGLineElement>("[data-atlas-selection-line]");
  const selectionPoint = root.querySelector<SVGCircleElement>("[data-atlas-selection-point]");
  const presetToggle = root.querySelector<HTMLButtonElement>("[data-atlas-preset-toggle]");
  const viewLevel = root.querySelector<HTMLElement>("[data-atlas-view-level]");
  const viewRegion = root.querySelector<HTMLElement>("[data-atlas-view-region]");
  const zoomIn = root.querySelector<HTMLButtonElement>("[data-atlas-zoom='in']");
  const zoomOut = root.querySelector<HTMLButtonElement>("[data-atlas-zoom='out']");

  const boundsInWorld = (bounds: TileBounds, pointFor: (coordinate: HexCoordinate) => PixelPoint,
    paddingSize: number): PixelBounds => {
    const first = pointFor({ col: bounds.minCol, row: bounds.minRow });
    const last = pointFor({ col: bounds.maxCol, row: bounds.maxRow });
    return {
      minX: Math.min(first.x, last.x) - paddingSize,
      maxX: Math.max(first.x, last.x) + paddingSize,
      minY: Math.min(first.y, last.y) - paddingSize,
      maxY: Math.max(first.y, last.y) + paddingSize,
    };
  };
  for (const nation of nationOverlays) {
    const bounds = geometry.boundsByArea.get(nation.area.id);
    if (bounds) nation.worldBox = boundsInWorld(bounds, geometry.centerFor, geometry.size * 2);
  }
  const cityBounds = cityParentArea && detailOverlay?.geometry.boundsByArea.get(cityParentArea.id);
  const cityWorldBox = cityBounds && detailOverlay && boundsInWorld(cityBounds,
    (coordinate) => detailOverlay.detailToParent(detailOverlay.geometry.centerFor(coordinate)),
    detailOverlay.geometry.size * detailOverlay.scaleX * 2);
  const intersects = (a: PixelBounds, b?: PixelBounds): boolean => Boolean(b &&
    a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY);

  root.dataset.atlasLogicalTiles = String(geometry.logicalTileCount);
  root.dataset.atlasSvgTiles = String(geometry.renderedTileNodeCount);
  root.dataset.atlasCoastSegments = String(geometry.coastSegmentCount);
  root.dataset.atlasBoundarySegments = String(geometry.boundarySegmentCount);
  root.dataset.atlasWrapWidth = String(geometry.wrapWidth);
  root.dataset.atlasContextTiles = String(geometry.contextTileCount ?? 0);

  let scale = defaultScale;
  let offsetX = 0;
  let offsetY = 0;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  let userAdjustedView = false;
  let detailVisible = false;
  let cityVisible = false;
  let cameraFrame = 0;
  let interactionTimer = 0;
  let selectionAnchor: PixelPoint | null = null;
  let selectionMeasureDirty = true;
  let selectionMeasuredStageWidth = -1;
  let selectionWidth = 240;
  let selectionHeight = 130;

  const positionSelection = (): void => {
    if (!selection || !selectionAnchor || selection.hidden) {
      selectionLeader?.toggleAttribute("hidden", true);
      return;
    }
    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;
    if (selectionMeasureDirty || selectionMeasuredStageWidth !== stageWidth) {
      selectionWidth = selection.offsetWidth;
      selectionHeight = selection.offsetHeight;
      selectionMeasuredStageWidth = stageWidth;
      selectionMeasureDirty = false;
    }
    let anchorX = stageWidth / 2 + offsetX + (selectionAnchor.x - geometry.width / 2) * scale;
    const anchorY = stageHeight / 2 + offsetY + (selectionAnchor.y - geometry.height / 2) * scale;
    if (activeMap.wrap_x) {
      const period = geometry.wrapWidth * scale;
      anchorX += Math.round((stageWidth / 2 - anchorX) / period) * period;
    }
    const outside = anchorX < 0 || anchorX > stageWidth || anchorY < 0 || anchorY > stageHeight;
    selection.dataset.offscreen = String(outside);
    selection.setAttribute("aria-hidden", String(outside));
    selectionLeader?.toggleAttribute("hidden", outside);
    if (outside) return;

    const inset = 12;
    const gap = 24;
    const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);
    const fitsRight = anchorX + gap + selectionWidth <= stageWidth - inset;
    const fitsLeft = anchorX - gap - selectionWidth >= inset;
    let cardX: number;
    let cardY: number;
    let lineX: number;
    let lineY: number;
    if (fitsRight || fitsLeft) {
      const right = fitsRight && (!fitsLeft || anchorX < stageWidth / 2);
      cardX = right ? anchorX + gap : anchorX - gap - selectionWidth;
      cardY = clamp(anchorY - selectionHeight * 0.35, inset, stageHeight - selectionHeight - inset);
      lineX = right ? cardX : cardX + selectionWidth;
      lineY = clamp(anchorY, cardY + 20, cardY + selectionHeight - 20);
    } else {
      const below = anchorY + gap + selectionHeight <= stageHeight - inset;
      cardX = clamp(anchorX - selectionWidth / 2, inset, stageWidth - selectionWidth - inset);
      cardY = clamp(below ? anchorY + gap : anchorY - gap - selectionHeight,
        inset, stageHeight - selectionHeight - inset);
      lineX = clamp(anchorX, cardX + 20, cardX + selectionWidth - 20);
      lineY = below ? cardY : cardY + selectionHeight;
    }
    if (cityParent?.visible && !cityVisible && cityLocation && detailOverlay && detailMap) {
      const cityPoint = detailOverlay.detailToParent(
        detailOverlay.geometry.centerFor(locationCoordinate(cityLocation, detailMap)));
      let cityX = stageWidth / 2 + offsetX + (cityPoint.x - geometry.width / 2) * scale;
      if (activeMap.wrap_x) {
        const period = geometry.wrapWidth * scale;
        cityX += Math.round((stageWidth / 2 - cityX) / period) * period;
      }
      const cityY = stageHeight / 2 + offsetY + (cityPoint.y - geometry.height / 2) * scale;
      const obscuresCity = cardX < cityX + 70 && cardX + selectionWidth > cityX - 70 &&
        cardY < cityY + 28 && cardY + selectionHeight > cityY - 28;
      if (obscuresCity) {
        const above = anchorY - selectionHeight - 40;
        cardX = clamp(anchorX - selectionWidth / 2, inset, stageWidth - selectionWidth - inset);
        cardY = clamp(above >= inset ? above : anchorY + 40, inset, stageHeight - selectionHeight - inset);
        lineX = clamp(anchorX, cardX + 20, cardX + selectionWidth - 20);
        lineY = cardY < anchorY ? cardY + selectionHeight : cardY;
      }
    }
    selection.style.left = `${Math.round(cardX)}px`;
    selection.style.top = `${Math.round(cardY)}px`;
    if (selectionLeader && selectionLine && selectionPoint) {
      const viewBox = `0 0 ${stageWidth} ${stageHeight}`;
      if (selectionLeader.getAttribute("viewBox") !== viewBox) selectionLeader.setAttribute("viewBox", viewBox);
      selectionLine.setAttribute("x1", String(anchorX));
      selectionLine.setAttribute("y1", String(anchorY));
      selectionLine.setAttribute("x2", String(lineX));
      selectionLine.setAttribute("y2", String(lineY));
      selectionPoint.setAttribute("cx", String(anchorX));
      selectionPoint.setAttribute("cy", String(anchorY));
    }
  };

  const beginInteraction = (): void => {
    window.clearTimeout(interactionTimer);
    stage.dataset.atlasInteracting = "true";
  };
  const endInteractionSoon = (): void => {
    window.clearTimeout(interactionTimer);
    interactionTimer = window.setTimeout(() => {
      if (!dragging && !cameraFrame) delete stage.dataset.atlasInteracting;
    }, 180);
  };

  const setVisualPreset = (preset: "political-pastel" | "tactical-paper"): void => {
    layer.dataset.visualPreset = preset;
    for (const nation of nationOverlays) nation.overlay.layer.dataset.visualPreset = preset;
    if (cityOverlay) cityOverlay.layer.dataset.visualPreset = preset;
    geometry.redrawContext?.();
    const tactical = preset === "tactical-paper";
    presetToggle?.setAttribute("aria-pressed", String(tactical));
    if (presetToggle) presetToggle.textContent = tactical ? "政治配色" : "战术质感";
    try {
      window.localStorage.setItem("world-library:atlas-preset", preset);
    } catch {
      // The map remains usable when storage is unavailable.
    }
  };

  const render = (): void => {
    if (activeMap.wrap_x) {
      const screenPeriod = geometry.wrapWidth * scale;
      offsetX = ((offsetX + screenPeriod / 2) % screenPeriod + screenPeriod) % screenPeriod - screenPeriod / 2;
    }
    layer.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`;
    layer.style.setProperty("--atlas-marker-scale", String(1 / scale));
    layer.style.setProperty("--atlas-area-label-scale", String(1 / scale));
    const overviewLimit = activeMap.level === 1 ? 0.16 : 0.3;
    const detailLimit = activeMap.level === 1 ? 0.45 : 0.6;
    layer.dataset.zoomBand = scale < overviewLimit ? "overview" : scale < detailLimit ? "region" : "detail";
    const viewport = {
      minX: geometry.width / 2 + (-stage.clientWidth / 2 - offsetX) / scale,
      maxX: geometry.width / 2 + (stage.clientWidth / 2 - offsetX) / scale,
      minY: geometry.height / 2 + (-stage.clientHeight / 2 - offsetY) / scale,
      maxY: geometry.height / 2 + (stage.clientHeight / 2 - offsetY) / scale,
    };
    if (nationOverlays.length) {
      // Hysteresis avoids flickering when wheel zoom settles on the LOD boundary.
      let detailTiles = 0;
      for (const nation of nationOverlays) {
        const centerX = nation.worldBox ? (nation.worldBox.minX + nation.worldBox.maxX) / 2 : 0;
        const viewportCenterX = (viewport.minX + viewport.maxX) / 2;
        nation.worldShift = activeMap.wrap_x
          ? Math.round((viewportCenterX - centerX) / geometry.wrapWidth) * geometry.wrapWidth : 0;
        nation.overlay.setHorizontalRepeat(nation.worldShift);
        nation.visibleWorldBox = nation.worldBox && {
          minX: nation.worldBox.minX + nation.worldShift,
          maxX: nation.worldBox.maxX + nation.worldShift,
          minY: nation.worldBox.minY, maxY: nation.worldBox.maxY,
        };
        const wasVisible = nation.visible;
        nation.visible = intersects(viewport, nation.visibleWorldBox) &&
          (wasVisible ? scale >= detailExitScale : scale >= detailEnterScale);
        const detailLayer = nation.overlay.layer;
        detailLayer.dataset.detailVisible = String(nation.visible);
        if (wasVisible && !nation.visible) {
          nation.overlay.geometry.updateVisibleChunks?.({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        }
        if (nation.visible) {
          const first = nation.overlay.parentToDetail({ x: viewport.minX, y: viewport.minY });
          const last = nation.overlay.parentToDetail({ x: viewport.maxX, y: viewport.maxY });
          detailTiles += nation.overlay.geometry.updateVisibleChunks?.({
            minX: first.x, minY: first.y, maxX: last.x, maxY: last.y,
          }) ?? 0;
        }
      }
      detailVisible = nationOverlays.some((nation) => nation.visible);
      layer.dataset.detailActive = String(detailVisible);
      let cityTiles = 0;
      if (cityOverlay && detailOverlay && cityParent) {
        const detailLayer = detailOverlay.layer;
        detailLayer.style.setProperty("--atlas-city-label-scale", String(1 / (scale * detailOverlay.scaleX)));
        const wasCityVisible = cityVisible;
        const repeatedCityBox = cityWorldBox && {
          minX: cityWorldBox.minX + cityParent.worldShift,
          maxX: cityWorldBox.maxX + cityParent.worldShift,
          minY: cityWorldBox.minY, maxY: cityWorldBox.maxY,
        };
        cityVisible = cityParent.visible && intersects(viewport, repeatedCityBox) &&
          (cityVisible ? scale >= cityExitScale : scale >= cityEnterScale);
        cityOverlay.layer.dataset.detailVisible = String(cityVisible);
        detailLayer.dataset.cityActive = String(cityVisible);
        if (wasCityVisible && !cityVisible) {
          cityOverlay.geometry.updateVisibleChunks?.({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
        }
        if (cityVisible) {
          const first = detailOverlay.parentToDetail({ x: viewport.minX, y: viewport.minY });
          const last = detailOverlay.parentToDetail({ x: viewport.maxX, y: viewport.maxY });
          const cityFirst = cityOverlay.parentToDetail(first);
          const cityLast = cityOverlay.parentToDetail(last);
          cityTiles = cityOverlay.geometry.updateVisibleChunks?.({
            minX: cityFirst.x, minY: cityFirst.y, maxX: cityLast.x, maxY: cityLast.y,
          }) ?? 0;
        }
        root.dataset.atlasCityVisibleTiles = String(cityTiles);
      }
      root.dataset.atlasDetailVisibleTiles = String(detailTiles);
      root.dataset.atlasSvgTiles = String(geometry.renderedTileNodeCount + detailTiles + cityTiles);
    }
    if (readout) readout.textContent = `${Math.round(scale * 100 + 1e-6)}%`;
    if (zoomIn) zoomIn.disabled = scale >= maxScale - 1e-6;
    if (zoomOut) zoomOut.disabled = scale <= minScale + 1e-6;
    const viewCenter = { x: (viewport.minX + viewport.maxX) / 2, y: (viewport.minY + viewport.maxY) / 2 };
    const focusedArea = geometry.areaAt(viewCenter);
    const centerIn = (box?: PixelBounds): boolean => Boolean(box && viewCenter.x >= box.minX &&
      viewCenter.x <= box.maxX && viewCenter.y >= box.minY && viewCenter.y <= box.maxY);
    const focusedNation = nationOverlays.find((nation) => nation.visible && centerIn(nation.visibleWorldBox) &&
      (focusedArea?.country?.id === nation.area.id ||
        (!focusedArea?.country && layer.dataset.selectedAreaId === nation.area.id)));
    layer.querySelectorAll<HTMLElement>("[data-detail-map-id]").forEach((label) => {
      label.dataset.detailActive = String(label.dataset.detailMapId === focusedNation?.map.id);
    });
    const focusedCityBox = cityWorldBox && {
      minX: cityWorldBox.minX + (cityParent?.worldShift ?? 0),
      maxX: cityWorldBox.maxX + (cityParent?.worldShift ?? 0),
      minY: cityWorldBox.minY, maxY: cityWorldBox.maxY,
    };
    const viewTier = cityVisible && centerIn(focusedCityBox) ? "城区" :
      focusedNation ? "国家详图" :
        layer.dataset.zoomBand === "overview" ? "世界总览" : "世界地图";
    const region = viewTier === "城区" ? cityLocation?.label : viewTier === "国家详图" ? focusedNation?.area.label :
      layer.dataset.zoomBand === "overview" ? "全球" :
        focusedArea?.country?.label ?? focusedArea?.special?.label ?? focusedArea?.continent?.label ?? "海洋";
    if (viewLevel && viewLevel.textContent !== viewTier) viewLevel.textContent = viewTier;
    if (viewRegion && viewRegion.textContent !== region) viewRegion.textContent = region ?? "海洋";
    if (root.dataset.atlasActiveLevel !== viewTier) root.dataset.atlasActiveLevel = viewTier;
    positionSelection();
  };

  let renderFrame = 0;
  const scheduleRender = (): void => {
    if (renderFrame) return;
    renderFrame = window.requestAnimationFrame(() => {
      renderFrame = 0;
      render();
    });
  };

  const centerOn = (point: PixelPoint): void => {
    offsetX = (geometry.width / 2 - point.x) * scale;
    offsetY = (geometry.height / 2 - point.y) * scale;
  };

  const clearSelection = (): void => {
    selectionAnchor = null;
    selectionLeader?.toggleAttribute("hidden", true);
    root.querySelectorAll<HTMLElement>("[data-selected]").forEach((element) => element.removeAttribute("data-selected"));
    root.querySelectorAll<HTMLElement>("[data-atlas-area-focus][aria-pressed='true'], [data-atlas-focus][aria-pressed='true'], [data-atlas-city-focus][aria-pressed='true']")
      .forEach((element) => element.setAttribute("aria-pressed", "false"));
    layer.removeAttribute("data-has-selection");
    delete layer.dataset.selectedAreaId;
    layer.querySelectorAll<SVGElement>(".atlas-political-boundary-path[data-selected]")
      .forEach((path) => path.removeAttribute("data-selected"));
    if (selection) selection.hidden = true;
  };

  const resetView = (): void => {
    if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    clearSelection();
    userAdjustedView = false;
    defaultScale = calculateDefaultScale();
    scale = defaultScale;
    centerOn(defaultCenter);
    render();
  };

  const setScale = (next: number, defer = false, anchor: PixelPoint = { x: 0, y: 0 }): void => {
    if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    beginInteraction();
    userAdjustedView = true;
    const previousScale = scale;
    scale = Math.min(maxScale, Math.max(minScale, next));
    const ratio = scale / previousScale;
    offsetX = anchor.x + (offsetX - anchor.x) * ratio;
    offsetY = anchor.y + (offsetY - anchor.y) * ratio;
    if (defer) scheduleRender();
    else render();
    endInteractionSoon();
  };

  type CameraView = { scale: number; offsetX: number; offsetY: number };
  const viewForWorldBox = (topLeft: PixelPoint, bottomRight: PixelPoint, paddingSize = geometry.size): CameraView => {
    const width = Math.abs(bottomRight.x - topLeft.x) + paddingSize * 3;
    const height = Math.abs(bottomRight.y - topLeft.y) + paddingSize * SQRT_THREE * 3;
    const targetScale = Math.min(maxScale, Math.max(defaultScale, Math.min(
      (stage.clientWidth - 96) / width,
      (stage.clientHeight - 128) / height,
    )));
    return {
      scale: targetScale,
      offsetX: (geometry.width / 2 - (topLeft.x + bottomRight.x) / 2) * targetScale,
      offsetY: (geometry.height / 2 - (topLeft.y + bottomRight.y) / 2) * targetScale,
    };
  };

  const viewForBounds = (bounds: TileBounds): CameraView => viewForWorldBox(
    geometry.centerFor({ col: bounds.minCol, row: bounds.minRow }),
    geometry.centerFor({ col: bounds.maxCol, row: bounds.maxRow }),
  );

  const focusBounds = (bounds: TileBounds, minimumScale = 0): void => {
    const target = viewForBounds(bounds);
    if (target.scale < minimumScale) {
      const factor = minimumScale / target.scale;
      target.scale = minimumScale;
      target.offsetX *= factor;
      target.offsetY *= factor;
    }
    ({ scale, offsetX, offsetY } = target);
    render();
  };

  const animateToView = (target: CameraView): void => {
    if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ({ scale, offsetX, offsetY } = target);
      render();
      return;
    }
    const from = { scale, offsetX, offsetY };
    beginInteraction();
    const start = performance.now();
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / 430);
      const eased = 1 - (1 - progress) ** 3;
      scale = from.scale + (target.scale - from.scale) * eased;
      offsetX = from.offsetX + (target.offsetX - from.offsetX) * eased;
      offsetY = from.offsetY + (target.offsetY - from.offsetY) * eased;
      render();
      cameraFrame = progress < 1 ? window.requestAnimationFrame(tick) : 0;
      if (!cameraFrame) endInteractionSoon();
    };
    cameraFrame = window.requestAnimationFrame(tick);
  };

  const animateFocusBounds = (bounds: TileBounds, minimumScale = 0): void => {
    const target = viewForBounds(bounds);
    const fittedScale = target.scale;
    target.scale = Math.min(maxScale, Math.max(target.scale, minimumScale));
    if (minimumScale && target.scale !== fittedScale) {
      const factor = target.scale / fittedScale;
      target.offsetX *= factor;
      target.offsetY *= factor;
    }
    animateToView(target);
  };

  const updateUrl = (parameters: { area?: AtlasArea; location?: AtlasLocation }, push = false): void => {
    const url = new URL(window.location.href);
    url.searchParams.delete("area");
    url.searchParams.delete("entity");
    url.searchParams.delete("loc");
    if (parameters.area?.entity_id) url.searchParams.set("entity", parameters.area.entity_id);
    else if (parameters.area) url.searchParams.set("area", parameters.area.id);
    if (parameters.location) url.searchParams.set("loc", parameters.location.id);
    window.history[push ? "pushState" : "replaceState"]({}, "", url);
  };

  const selectArea = (area: AtlasArea, writeUrl = true, animate = false): void => {
    if (writeUrl) userAdjustedView = true;
    clearSelection();
    selectionAnchor = geometry.centerFor({ col: area.label_anchor[0], row: area.label_anchor[1] });
    layer.dataset.selectedAreaId = area.id;
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
    layer.querySelectorAll<SVGElement>(".atlas-political-boundary-path").forEach((path) => {
      const boundaryAreas = path.dataset.boundaryAreas?.split(" ") ?? [];
      path.toggleAttribute("data-selected", boundaryAreas.includes(area.id));
    });
    layer.dataset.hasSelection = "true";

    const bounds = geometry.boundsByArea.get(area.id);
    if (bounds) {
      const minimumScale = area.detail_map_id && nationOverlays.some(
        (nation) => nation.map.id === area.detail_map_id) ? detailEnterScale + 0.01 : 0;
      if (animate) animateFocusBounds(bounds, minimumScale);
      else focusBounds(bounds, minimumScale);
    }
    if (selection) selection.hidden = false;
    if (selectionKind) selectionKind.textContent = areaKind(area);
    if (selectionTitle) selectionTitle.textContent = area.label;
    if (selectionStatus) {
      selectionStatus.textContent = area.detail_status === "awaiting-source"
        ? "详图待补充" : "";
      selectionStatus.hidden = !selectionStatus.textContent;
    }
    const entity = area.entity_id ? data.entities?.[area.entity_id] : undefined;
    if (selectionLink && entity?.page_ref) {
      selectionLink.href = entity.page_ref;
      selectionLink.hidden = false;
    } else if (selectionLink) {
      selectionLink.hidden = true;
    }
    if (writeUrl) updateUrl({ area }, animate);
    selectionMeasureDirty = true;
    positionSelection();
  };

  const selectLocation = (location: AtlasLocation, writeUrl = true): void => {
    userAdjustedView = true;
    clearSelection();
    selectionAnchor = geometry.centerFor(locationCoordinate(location, activeMap));
    root.querySelectorAll<HTMLElement>("[data-atlas-location-item]").forEach((item) => {
      const selected = item.dataset.locationId === location.id;
      item.toggleAttribute("data-selected", selected);
      item.querySelector<HTMLElement>("[data-atlas-focus]")?.setAttribute("aria-pressed", String(selected));
    });
    root.querySelectorAll<HTMLElement>("[data-atlas-marker]").forEach((marker) => {
      marker.toggleAttribute("data-selected", marker.dataset.locationId === location.id);
    });
    centerOn(geometry.centerFor(locationCoordinate(location, activeMap)));
    render();
    if (selection) selection.hidden = false;
    if (selectionKind) selectionKind.textContent = location.kind === "capital" ? "首都" : "地点";
    if (selectionTitle) selectionTitle.textContent = location.label;
    if (selectionStatus) {
      selectionStatus.textContent = location.detail_status === "awaiting-source" ? "详图待补充" : "";
      selectionStatus.hidden = !selectionStatus.textContent;
    }
    const entity = data.entities?.[location.entity_id ?? ""];
    if (selectionLink && entity?.page_ref) {
      selectionLink.href = entity.page_ref;
      selectionLink.hidden = false;
    } else if (selectionLink) selectionLink.hidden = true;
    if (writeUrl) updateUrl({ location });
    selectionMeasureDirty = true;
    positionSelection();
  };

  const selectCity = (location: AtlasLocation, writeUrl = true, animate = true): void => {
    if (!cityOverlay || !detailOverlay || !detailMap || !cityMap) return;
    userAdjustedView = true;
    clearSelection();
    selectionAnchor = detailOverlay.detailToParent(
      detailOverlay.geometry.centerFor(locationCoordinate(location, detailMap)));
    root.querySelectorAll<HTMLElement>("[data-atlas-city-item]").forEach((item) => {
      const selected = item.dataset.locationId === location.id;
      item.toggleAttribute("data-selected", selected);
      item.querySelector<HTMLElement>("[data-atlas-city-focus]")?.setAttribute("aria-pressed", String(selected));
    });
    detailOverlay.layer.querySelector<HTMLElement>("[data-atlas-city-focus]")?.setAttribute("aria-pressed", "true");
    const cityArea = (data.detail_areas ?? []).find((area) => area.map_id === cityMap.id && area.entity_id === location.entity_id);
    const bounds = cityArea && cityOverlay.geometry.boundsByArea.get(cityArea.id);
    if (bounds) {
      const worldPoint = (coordinate: HexCoordinate): PixelPoint => detailOverlay.detailToParent(
        cityOverlay.detailToParent(cityOverlay.geometry.centerFor(coordinate)),
      );
      const target = viewForWorldBox(
        worldPoint({ col: bounds.minCol, row: bounds.minRow }),
        worldPoint({ col: bounds.maxCol, row: bounds.maxRow }),
        cityOverlay.geometry.size * cityOverlay.scaleX * detailOverlay.scaleX,
      );
      target.scale = Math.min(maxScale, Math.max(target.scale, cityEnterScale + 0.1));
      const center = worldPoint({
        col: (bounds.minCol + bounds.maxCol) / 2,
        row: (bounds.minRow + bounds.maxRow) / 2,
      });
      target.offsetX = (geometry.width / 2 - center.x) * target.scale;
      target.offsetY = (geometry.height / 2 - center.y) * target.scale;
      if (animate) animateToView(target);
      else {
        ({ scale, offsetX, offsetY } = target);
        render();
      }
    }
    if (selection) selection.hidden = false;
    if (selectionKind) selectionKind.textContent = location.kind === "capital" ? "首都城区" : "城市城区";
    if (selectionTitle) selectionTitle.textContent = location.label;
    if (selectionStatus) {
      selectionStatus.textContent = location.footprint_status === "provisional" ? "暂定范围" : "";
      selectionStatus.hidden = !selectionStatus.textContent;
    }
    const entity = data.entities?.[location.entity_id ?? ""];
    if (selectionLink && entity?.page_ref) {
      selectionLink.href = entity.page_ref;
      selectionLink.hidden = false;
    } else if (selectionLink) selectionLink.hidden = true;
    if (writeUrl) updateUrl({ location }, true);
    selectionMeasureDirty = true;
    positionSelection();
  };

  root.querySelectorAll<HTMLElement>("[data-atlas-zoom]").forEach((button) => {
    button.addEventListener("click", () => setScale(scale * (button.dataset.atlasZoom === "in" ? 1.25 : 0.8)));
  });

  presetToggle?.addEventListener("click", () => {
    setVisualPreset(layer.dataset.visualPreset === "tactical-paper" ? "political-pastel" : "tactical-paper");
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
    stage.focus({ preventScroll: true });
    if (cameraFrame) window.cancelAnimationFrame(cameraFrame);
    cameraFrame = 0;
    beginInteraction();
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
    userAdjustedView = true;
    offsetX = originX + event.clientX - startX;
    offsetY = originY + event.clientY - startY;
    scheduleRender();
  });

  const stopDragging = (): void => {
    dragging = false;
    delete stage.dataset.dragging;
    endInteractionSoon();
  };

  stage.addEventListener("pointerup", stopDragging);
  stage.addEventListener("pointercancel", stopDragging);
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    setScale(scale * (event.deltaY < 0 ? 1.12 : 0.89), true, {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    });
  }, { passive: false });

  root.addEventListener("keydown", (event) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const movement = 48;
    if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") setScale(scale * 1.25);
    else if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") setScale(scale * 0.8);
    else if (event.key.startsWith("Arrow") && stage.contains(target)) {
      if (event.key === "ArrowLeft") offsetX += movement;
      else if (event.key === "ArrowRight") offsetX -= movement;
      else if (event.key === "ArrowUp") offsetY += movement;
      else if (event.key === "ArrowDown") offsetY -= movement;
      else return;
    }
    else if (event.key === "0") resetView();
    else return;
    event.preventDefault();
    if (event.key.startsWith("Arrow")) userAdjustedView = true;
    render();
  });

  search?.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    root.querySelectorAll<HTMLElement>("[data-atlas-location-item], [data-atlas-area-item], [data-atlas-city-item]").forEach((item) => {
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

  root.querySelectorAll<HTMLElement>("[data-atlas-city-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const location = (data.detail_locations ?? []).find((entry) => entry.id === button.dataset.atlasCityFocus);
      if (location) selectCity(location);
    });
  });

  const enterDetail = (area: AtlasArea): void => selectArea(area, true, true);

  root.querySelectorAll<HTMLElement>("[data-atlas-area-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const area = activeAreas.find((entry) => entry.id === button.dataset.atlasAreaFocus);
      if (!area) return;
      const detailHref = button.dataset.detailHref;
      if (detailHref && nationOverlays.some((nation) => nation.map.id === area.detail_map_id)) enterDetail(area);
      else selectArea(area);
    });
  });

  root.querySelectorAll<HTMLAnchorElement>(".atlas-detail-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      const areaId = link.closest<HTMLElement>("[data-area-id]")?.dataset.areaId;
      const area = activeAreas.find((entry) => entry.id === areaId);
      if (!area || !nationOverlays.some((nation) => nation.map.id === area.detail_map_id)) return;
      event.preventDefault();
      enterDetail(area);
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
  const targetCity = (data.detail_locations ?? []).find((location) => (
    location.id === requestedLocation || (!targetArea && !targetLocation && !requestedLocation && location.entity_id === requestedEntity)
  ));

  let savedPreset: string | null = null;
  try {
    savedPreset = window.localStorage.getItem("world-library:atlas-preset");
  } catch {
    savedPreset = null;
  }
  setVisualPreset(savedPreset === "tactical-paper" ? "tactical-paper" : "political-pastel");
  if (geometry.redrawContext) {
    new MutationObserver(() => geometry.redrawContext?.())
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  if (targetArea) selectArea(targetArea, false);
  else if (targetLocation) selectLocation(targetLocation, false);
  else if (targetCity) selectCity(targetCity, false, false);
  else resetView();

  window.addEventListener("popstate", () => {
    const state = new URLSearchParams(window.location.search);
    const area = activeAreas.find((entry) => entry.id === state.get("area") || entry.entity_id === state.get("entity"));
    const location = activeLocations.find((entry) => entry.id === state.get("loc"));
    const city = (data.detail_locations ?? []).find((entry) => entry.id === state.get("loc"));
    if (area) selectArea(area, false, true);
    else if (location) selectLocation(location, false);
    else if (city) selectCity(city, false);
    else resetView();
  });

  // Force one post-layout fit: a viewport may change while the larger L0 SVG initializes.
  let stageWidth = -1;
  let stageHeight = -1;
  new ResizeObserver(() => {
    if (stage.clientWidth === stageWidth && stage.clientHeight === stageHeight) return;
    stageWidth = stage.clientWidth;
    stageHeight = stage.clientHeight;
    defaultScale = calculateDefaultScale();
    if (!userAdjustedView) {
      const selectedBounds = geometry.boundsByArea.get(layer.dataset.selectedAreaId ?? "");
      if (selectedBounds) focusBounds(selectedBounds);
      else {
        scale = defaultScale;
        centerOn(defaultCenter);
        render();
      }
    } else scheduleRender();
  }).observe(stage);

  root.dataset.atlasInitMs = String(Math.round(performance.now() - initStarted));
  root.dispatchEvent(new CustomEvent("atlas:ready", {
    detail: {
      logicalTileCount: geometry.logicalTileCount,
      coastSegmentCount: geometry.coastSegmentCount,
      boundarySegmentCount: geometry.boundarySegmentCount,
    },
  }));
}
