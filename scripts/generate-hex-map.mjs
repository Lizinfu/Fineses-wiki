import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import sharp from "sharp";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const configPath = path.join(root, "data/maps/sources.yaml");
const config = parseYaml(await readFile(configPath, "utf8")) ?? {};
const sources = config.sources ?? {};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedCrop(crop, width, height) {
  const left = Math.round(width * Number(crop?.left ?? 0));
  const right = Math.round(width * Number(crop?.right ?? 0));
  const top = Math.round(height * Number(crop?.top ?? 0));
  const bottom = Math.round(height * Number(crop?.bottom ?? 0));
  return {
    left,
    top,
    width: width - left - right,
    height: height - top - bottom,
  };
}

function dilate(mask, width, height, radius) {
  if (radius <= 0) return mask;
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      const minY = Math.max(0, y - radius);
      const maxY = Math.min(height - 1, y + radius);
      const minX = Math.max(0, x - radius);
      const maxX = Math.min(width - 1, x + radius);
      for (let targetY = minY; targetY <= maxY; targetY += 1) {
        for (let targetX = minX; targetX <= maxX; targetX += 1) {
          result[targetY * width + targetX] = 1;
        }
      }
    }
  }
  return result;
}

function nearestOpenPixel(x, y, boundary, width, height) {
  for (let radius = 0; radius <= 12; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const targetX = clamp(x + offsetX, 0, width - 1);
        const targetY = clamp(y + offsetY, 0, height - 1);
        const index = targetY * width + targetX;
        if (!boundary[index]) return index;
      }
    }
  }
  throw new Error(`Ocean seed at ${x},${y} is enclosed by boundary pixels.`);
}

function floodOcean(boundary, width, height, seeds) {
  const ocean = new Uint8Array(boundary.length);
  const queue = new Int32Array(boundary.length);
  let head = 0;
  let tail = 0;

  for (const [normalizedX, normalizedY] of seeds) {
    const x = clamp(Math.round(normalizedX * (width - 1)), 0, width - 1);
    const y = clamp(Math.round(normalizedY * (height - 1)), 0, height - 1);
    const index = nearestOpenPixel(x, y, boundary, width, height);
    if (!ocean[index]) {
      ocean[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < width ? index + 1 : -1,
      y > 0 ? index - width : -1,
      y + 1 < height ? index + width : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || ocean[neighbor] || boundary[neighbor]) continue;
      ocean[neighbor] = 1;
      queue[tail] = neighbor;
      tail += 1;
    }
  }

  return ocean;
}

function sampleLand(ocean, width, height, normalizedX, normalizedY, radiusRatio) {
  const centerX = normalizedX * (width - 1);
  const centerY = normalizedY * (height - 1);
  const radiusX = width * radiusRatio;
  const radiusY = height * radiusRatio;
  const samples = [
    [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
    [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7],
  ];
  let land = 0;
  let usable = 0;
  for (const [offsetX, offsetY] of samples) {
    const x = clamp(Math.round(centerX + offsetX * radiusX), 0, width - 1);
    const y = clamp(Math.round(centerY + offsetY * radiusY), 0, height - 1);
    const index = y * width + x;
    usable += 1;
    if (!ocean[index]) land += 1;
  }
  return usable > 0 ? land / usable : 0;
}

function colorDistanceSquared(red, green, blue, target) {
  return (red - target[0]) ** 2 + (green - target[1]) ** 2 + (blue - target[2]) ** 2;
}

function sampleRegion(data, width, height, channels, normalizedX, normalizedY, options, regions) {
  const centerX = normalizedX * (width - 1);
  const centerY = normalizedY * (height - 1);
  const sampleCount = Math.max(3, Number(options.samples ?? 7));
  const radiusX = width * Number(options.radius_x);
  const radiusY = height * Number(options.radius_y);
  const toleranceSquared = Number(options.color_tolerance ?? 72) ** 2;
  const votes = new Map(regions.map(([id]) => [id, 0]));
  let totalSamples = 0;

  for (let sampleY = 0; sampleY < sampleCount; sampleY += 1) {
    for (let sampleX = 0; sampleX < sampleCount; sampleX += 1) {
      const offsetX = sampleCount === 1 ? 0 : sampleX / (sampleCount - 1) * 2 - 1;
      const offsetY = sampleCount === 1 ? 0 : sampleY / (sampleCount - 1) * 2 - 1;
      if (offsetX ** 2 + offsetY ** 2 > 1.05) continue;
      const x = clamp(Math.round(centerX + offsetX * radiusX), 0, width - 1);
      const y = clamp(Math.round(centerY + offsetY * radiusY), 0, height - 1);
      const pixelOffset = (y * width + x) * channels;
      const red = data[pixelOffset];
      const green = data[pixelOffset + 1];
      const blue = data[pixelOffset + 2];
      let nearestId;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const [id, region] of regions) {
        const distance = colorDistanceSquared(red, green, blue, region.color);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestId = id;
        }
      }
      totalSamples += 1;
      if (nearestId && nearestDistance <= toleranceSquared) {
        votes.set(nearestId, (votes.get(nearestId) ?? 0) + 1);
      }
    }
  }

  const [winnerId, winnerVotes] = [...votes].sort((left, right) => right[1] - left[1])[0] ?? [];
  const ratio = totalSamples > 0 ? Number(winnerVotes ?? 0) / totalSamples : 0;
  return ratio >= Number(options.minimum_region_ratio ?? 0.18) ? winnerId : undefined;
}

function compressRows(tiles, columns, rows) {
  const rowsOutput = [];
  for (let row = 0; row < rows; row += 1) {
    const ranges = [];
    let start = null;
    for (let col = 0; col <= columns; col += 1) {
      const occupied = col < columns && tiles.has(`${col}:${row}`);
      if (occupied && start === null) start = col;
      if (!occupied && start !== null) {
        ranges.push([start, col - 1]);
        start = null;
      }
    }
    if (ranges.length) rowsOutput.push({ row, ranges });
  }
  return rowsOutput;
}

function hexNeighbors(col, row) {
  const verticalOffset = col % 2 === 0 ? -1 : 1;
  return [
    [col - 1, row + Math.min(verticalOffset, 0)],
    [col - 1, row + Math.max(verticalOffset, 0)],
    [col + 1, row + Math.min(verticalOffset, 0)],
    [col + 1, row + Math.max(verticalOffset, 0)],
    [col, row - 1],
    [col, row + 1],
  ];
}

const SQRT_THREE = Math.sqrt(3);

function unitCenter(col, row) {
  return { x: col * 1.5, y: (row + (col % 2 === 0 ? 0 : 0.5)) * SQRT_THREE };
}

function tileBounds(tiles, radius) {
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const key of tiles) {
    const [col, row] = key.split(":").map(Number);
    const point = unitCenter(col, row);
    bounds.minX = Math.min(bounds.minX, point.x - radius);
    bounds.maxX = Math.max(bounds.maxX, point.x + radius);
    bounds.minY = Math.min(bounds.minY, point.y - radius * SQRT_THREE / 2);
    bounds.maxY = Math.max(bounds.maxY, point.y + radius * SQRT_THREE / 2);
  }
  if (!tiles.size) throw new Error("Cannot align an empty map area.");
  return bounds;
}

function expandRows(rows) {
  const result = new Set();
  for (const { row, ranges } of rows) {
    for (const [start, end] of ranges) {
      for (let col = start; col <= end; col += 1) result.add(`${col}:${row}`);
    }
  }
  return result;
}

function pointInFlatHex(x, y, center, radius) {
  const dx = Math.abs(x - center.x);
  const dy = Math.abs(y - center.y);
  return dx <= radius && dy <= radius * SQRT_THREE / 2 && SQRT_THREE * dx + dy <= SQRT_THREE * radius;
}

function sourceHexRadius(source) {
  const size = Number(source.grid?.hex_size ?? 24);
  return 1 - Number(source.grid?.gap ?? 0.9) / (2 * size);
}

function alignDetailMask(id, mask, source, generatedMasks, sourceConfigs) {
  const alignment = source.align_to_parent;
  if (!alignment) return mask;
  const parent = generatedMasks[alignment.mask_id];
  const parentArea = parent?.area_masks?.[alignment.area_id];
  const detailAreaId = Object.keys(mask.area_masks ?? {})[0];
  const detailArea = mask.area_masks?.[detailAreaId];
  if (!parentArea || !detailArea || Object.keys(mask.area_masks).length !== 1) {
    throw new Error(`Map source ${id} needs one detail area and an existing parent area to align.`);
  }
  const parentTiles = expandRows(parentArea.tile_rows);
  const sourceTiles = expandRows(detailArea.tile_rows);
  const detailSize = Number(source.grid?.hex_size ?? 24);
  const parentRadius = sourceHexRadius(sourceConfigs[alignment.mask_id]);
  const detailRadius = sourceHexRadius(source);
  const parentBounds = tileBounds(parentTiles, parentRadius);
  const sourceBounds = tileBounds(sourceTiles, detailRadius);
  const scaleX = (sourceBounds.maxX - sourceBounds.minX) / (parentBounds.maxX - parentBounds.minX);
  const scaleY = (sourceBounds.maxY - sourceBounds.minY) / (parentBounds.maxY - parentBounds.minY);
  const offsetX = sourceBounds.minX - parentBounds.minX * scaleX;
  const offsetY = sourceBounds.minY - parentBounds.minY * scaleY;
  const parentCenters = [...parentTiles].map((key) => {
    const [col, row] = key.split(":").map(Number);
    return unitCenter(col, row);
  });
  // Candidate detail tiles overlap the shared parent footprint; the browser clips their
  // visible edges to that exact footprint, so no secondary national border can diverge.
  const margin = Math.max(1 / scaleX, 1 / scaleY) * detailRadius * 1.3;
  const detailTiles = new Set();
  for (let col = 0; col < mask.grid.columns; col += 1) {
    for (let row = 0; row < mask.grid.rows; row += 1) {
      const point = unitCenter(col, row);
      const parentX = (point.x - offsetX) / scaleX;
      const parentY = (point.y - offsetY) / scaleY;
      if (parentCenters.some((center) => pointInFlatHex(parentX, parentY, center, parentRadius + margin))) {
        detailTiles.add(`${col}:${row}`);
      }
    }
  }
  const rows = compressRows(detailTiles, mask.grid.columns, mask.grid.rows);
  return {
    ...mask,
    land_tile_count: detailTiles.size,
    land_rows: rows,
    area_masks: { [detailAreaId]: { tile_count: detailTiles.size, tile_rows: rows } },
    alignment: {
      parent_mask_id: alignment.mask_id,
      parent_area_id: alignment.area_id,
      parent_source_sha256: parent.source_sha256,
      source_land_tile_count: sourceTiles.size,
      transform: [scaleX, scaleY, offsetX, offsetY],
      parent_hex_radius: parentRadius,
    },
  };
}

function deriveNationFromParent(id, source, generatedMasks, sourceConfigs) {
  const derived = source.derive_from_parent;
  const parent = generatedMasks[derived?.mask_id];
  const parentArea = parent?.area_masks?.[derived?.area_id];
  const columns = Number(source.grid?.columns);
  const rows = Number(source.grid?.rows);
  if (!parentArea?.tile_count || !derived.detail_area_id || !Number.isInteger(columns) ||
    !Number.isInteger(rows) || columns < 4 || rows < 4) {
    throw new Error(`Map source ${id} needs an existing parent area and a valid detail grid.`);
  }
  const extent = new Set();
  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) extent.add(`${col}:${row}`);
  }
  const extentRows = compressRows(extent, columns, rows);
  const mask = {
    source: `derived:${derived.mask_id}/${derived.area_id}`,
    source_sha256: createHash("sha256").update(JSON.stringify({
      parent_sha256: parent.source_sha256, area_id: derived.area_id,
      detail_area_id: derived.detail_area_id, columns, rows,
    })).digest("hex"),
    source_dimensions: parent.source_dimensions,
    classification: { method: "parent-political-mask", status: "provisional" },
    grid: { columns, rows, orientation: "flat", offset: "odd-q" },
    land_tile_count: extent.size,
    land_rows: extentRows,
    area_masks: { [derived.detail_area_id]: { tile_count: extent.size, tile_rows: extentRows } },
  };
  return alignDetailMask(id, mask, {
    ...source,
    align_to_parent: { mask_id: derived.mask_id, area_id: derived.area_id },
  }, generatedMasks, sourceConfigs);
}

async function generateUrbanFootprint(id, source, generatedMasks, sourceConfigs) {
  const footprint = source.urban_footprint;
  const parent = generatedMasks[footprint.parent_mask_id];
  if (!parent) throw new Error(`Map source ${id} needs its aligned parent mask first.`);
  const [centerCol, centerRow] = footprint.center_parent ?? [];
  const [radiusCol, radiusRow] = footprint.radius_parent ?? [];
  const columns = Number(source.grid?.columns);
  const rows = Number(source.grid?.rows);
  if (![centerCol, centerRow, radiusCol, radiusRow, columns, rows].every(Number.isFinite) ||
    radiusCol <= 0 || radiusRow <= 0 || columns < 4 || rows < 4 ||
    !footprint.area_id || !footprint.parent_area_id || parent.area_masks?.[footprint.parent_area_id]) {
    throw new Error(`Map source ${id} has an invalid schematic urban footprint.`);
  }
  const input = await readFile(path.join(root, source.input));
  const dimensions = await sharp(input).metadata();
  const center = unitCenter(centerCol, centerRow);
  const parentTiles = new Set();
  for (const key of expandRows(parent.land_rows)) {
    const [col, row] = key.split(":").map(Number);
    const point = unitCenter(col, row);
    const distance = ((point.x - center.x) / (radiusCol * 1.5)) ** 2 +
      ((point.y - center.y) / (radiusRow * SQRT_THREE)) ** 2;
    if (distance <= 1) parentTiles.add(key);
  }
  if (!parentTiles.size) throw new Error(`Map source ${id} produced no parent-city tiles.`);
  const parentRadius = sourceHexRadius(sourceConfigs[footprint.parent_mask_id]);
  const parentRows = compressRows(parentTiles, parent.grid.columns, parent.grid.rows);
  parent.area_masks[footprint.parent_area_id] = { tile_count: parentTiles.size, tile_rows: parentRows };

  const detailRadius = sourceHexRadius(source);
  const parentBounds = tileBounds(parentTiles, parentRadius);
  const detailExtent = new Set();
  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) detailExtent.add(`${col}:${row}`);
  }
  const detailBounds = tileBounds(detailExtent, detailRadius);
  // A uniform scale preserves hex proportions; the slack keeps candidate tiles
  // beyond the parent rim, where a shared SVG clip supplies the exact edge.
  const scale = Math.min(
    (detailBounds.maxX - detailBounds.minX) / (parentBounds.maxX - parentBounds.minX),
    (detailBounds.maxY - detailBounds.minY) / (parentBounds.maxY - parentBounds.minY),
  ) * 0.9;
  const offsetX = (detailBounds.minX + detailBounds.maxX) / 2 -
    (parentBounds.minX + parentBounds.maxX) / 2 * scale;
  const offsetY = (detailBounds.minY + detailBounds.maxY) / 2 -
    (parentBounds.minY + parentBounds.maxY) / 2 * scale;
  const parentCenters = [...parentTiles].map((key) => {
    const [col, row] = key.split(":").map(Number);
    return unitCenter(col, row);
  });
  const margin = detailRadius / scale * 1.3;
  const tiles = new Set();
  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const point = unitCenter(col, row);
      const parentX = (point.x - offsetX) / scale;
      const parentY = (point.y - offsetY) / scale;
      if (!parentCenters.some((candidate) => pointInFlatHex(parentX, parentY, candidate, parentRadius + margin))) continue;
      tiles.add(`${col}:${row}`);
    }
  }
  if (!tiles.size) throw new Error(`Map source ${id} produced no urban tiles.`);
  const landRows = compressRows(tiles, columns, rows);
  return {
    source: source.input.replaceAll("\\", "/"),
    source_sha256: createHash("sha256").update(input).digest("hex"),
    source_dimensions: [dimensions.width, dimensions.height],
    classification: {
      method: "schematic-urban-footprint",
      status: "provisional",
      marker_image: footprint.marker_image,
      center_parent: footprint.center_parent,
      radius_parent: footprint.radius_parent,
      parent_city_tile_count: parentTiles.size,
    },
    grid: { columns, rows, orientation: "flat", offset: "odd-q" },
    land_tile_count: tiles.size,
    land_rows: landRows,
    area_masks: { [footprint.area_id]: { tile_count: tiles.size, tile_rows: landRows } },
    alignment: {
      parent_mask_id: footprint.parent_mask_id,
      parent_area_id: footprint.parent_area_id,
      parent_location_id: footprint.parent_location_id,
      parent_source_sha256: parent.source_sha256,
      transform: [scale, scale, offsetX, offsetY],
      parent_hex_radius: parentRadius,
    },
  };
}

async function generateSource(id, source) {
  const inputPath = path.join(root, source.input);
  const input = await readFile(inputPath);
  const sourceHash = createHash("sha256").update(input).digest("hex");
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const crop = normalizedCrop(source.crop, decoded.info.width, decoded.info.height);
  const cropped = await sharp(input).extract(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = cropped.info;
  const columns = Number(source.grid?.columns);
  const rows = Number(source.grid?.rows);

  if (source.regions && typeof source.regions === "object") {
    const regions = Object.entries(source.regions);
    const regionTiles = new Map(regions.map(([regionId]) => [regionId, new Set()]));
    const sampling = source.region_sampling ?? {};
    const samplingOptions = {
      ...sampling,
      radius_x: Number(sampling.radius_x ?? 0.44) / columns,
      radius_y: Number(sampling.radius_y ?? 0.44) / rows,
    };

    for (const [regionId, region] of regions) {
      if (!Array.isArray(region.color) || region.color.length !== 3 || !region.color.every(Number.isFinite)) {
        throw new Error(`Map source ${id} region ${regionId} requires an RGB color triplet.`);
      }
    }

    for (let col = 0; col < columns; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const normalizedX = (col + 0.5) / columns;
        const normalizedY = (row + 0.5 + (col % 2 === 0 ? 0 : 0.5)) / (rows + 0.5);
        const regionId = sampleRegion(
          cropped.data,
          width,
          height,
          channels,
          normalizedX,
          normalizedY,
          samplingOptions,
          regions,
        );
        if (regionId) regionTiles.get(regionId).add(`${col}:${row}`);
      }
    }

    let whiteAnnotationHolesFilled = 0;
    if (sampling.fill_enclosed_white_annotations === true) {
      for (const [, tiles] of regionTiles) {
        const additions = [];
        for (let col = 1; col < columns - 1; col += 1) {
          for (let row = 1; row < rows - 1; row += 1) {
            const key = `${col}:${row}`;
            if (tiles.has(key) || !hexNeighbors(col, row).every(([neighborCol, neighborRow]) => tiles.has(`${neighborCol}:${neighborRow}`))) continue;
            const normalizedX = (col + 0.5) / columns;
            const normalizedY = (row + 0.5 + (col % 2 === 0 ? 0 : 0.5)) / (rows + 0.5);
            const x = Math.round(normalizedX * (width - 1));
            const y = Math.round(normalizedY * (height - 1));
            const pixel = (y * width + x) * channels;
            if (cropped.data[pixel] >= 220 && cropped.data[pixel + 1] >= 220 && cropped.data[pixel + 2] >= 220) additions.push(key);
          }
        }
        for (const key of additions) tiles.add(key);
        whiteAnnotationHolesFilled += additions.length;
      }
    }

    let enclosedAnnotationHolesFilled = 0;
    if (sampling.fill_enclosed_annotation_holes === true) {
      const occupied = new Set([...regionTiles.values()].flatMap((tiles) => [...tiles]));
      for (const [, tiles] of regionTiles) {
        const additions = [];
        for (let col = 1; col < columns - 1; col += 1) {
          for (let row = 1; row < rows - 1; row += 1) {
            const key = `${col}:${row}`;
            if (occupied.has(key) || !hexNeighbors(col, row).every(([nearCol, nearRow]) => tiles.has(`${nearCol}:${nearRow}`))) continue;
            additions.push(key);
          }
        }
        for (const key of additions) {
          tiles.add(key);
          occupied.add(key);
        }
        enclosedAnnotationHolesFilled += additions.length;
      }
    }

    const landTiles = new Set([...regionTiles.values()].flatMap((tiles) => [...tiles]));
    const areaMasks = Object.fromEntries([...regionTiles].map(([regionId, tiles]) => [regionId, {
      tile_count: tiles.size,
      tile_rows: compressRows(tiles, columns, rows),
    }]));
    return {
      source: source.input.replaceAll("\\", "/"),
      source_sha256: sourceHash,
      source_dimensions: [decoded.info.width, decoded.info.height],
      crop_pixels: crop,
      classification: {
        method: "palette-majority",
        samples: Number(samplingOptions.samples ?? 7),
        color_tolerance: Number(samplingOptions.color_tolerance ?? 72),
        minimum_region_ratio: Number(samplingOptions.minimum_region_ratio ?? 0.18),
        fill_enclosed_white_annotations: sampling.fill_enclosed_white_annotations === true,
        white_annotation_holes_filled: whiteAnnotationHolesFilled,
        fill_enclosed_annotation_holes: sampling.fill_enclosed_annotation_holes === true,
        enclosed_annotation_holes_filled: enclosedAnnotationHolesFilled,
      },
      grid: { columns, rows, orientation: "flat", offset: "odd-q" },
      land_tile_count: landTiles.size,
      land_rows: compressRows(landTiles, columns, rows),
      area_masks: areaMasks,
    };
  }

  const threshold = Number(source.boundary?.luminance_threshold ?? 64);
  const initialBoundary = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels;
    const red = cropped.data[offset];
    const green = cropped.data[offset + 1];
    const blue = cropped.data[offset + 2];
    const alpha = cropped.data[offset + 3] / 255;
    const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) * alpha;
    if (luminance >= threshold) initialBoundary[index] = 1;
  }

  const dilationRadius = Number(source.boundary?.dilation_radius ?? 1);
  const boundary = dilate(initialBoundary, width, height, dilationRadius);
  const oceanSeeds = Array.isArray(source.ocean_seeds) ? source.ocean_seeds : [[0.5, 0.9]];
  const ocean = floodOcean(boundary, width, height, oceanSeeds);
  const landRatio = Number(source.sampling?.land_ratio ?? 0.5);
  const samplingRadius = Number(source.sampling?.radius ?? 0.2);
  const landTiles = new Set();

  for (let col = 0; col < columns; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const normalizedX = (col + 0.5) / columns;
      const normalizedY = (row + 0.5 + (col % 2 === 0 ? 0 : 0.5)) / (rows + 0.5);
      const ratio = sampleLand(
        ocean,
        width,
        height,
        normalizedX,
        normalizedY,
        samplingRadius / Math.max(columns, rows),
      );
      if (ratio >= landRatio) landTiles.add(`${col}:${row}`);
    }
  }

  return {
    source: source.input.replaceAll("\\", "/"),
    source_sha256: sourceHash,
    source_dimensions: [decoded.info.width, decoded.info.height],
    crop_pixels: crop,
    grid: { columns, rows, orientation: "flat", offset: "odd-q" },
    land_tile_count: landTiles.size,
    land_rows: compressRows(landTiles, columns, rows),
  };
}

const masks = {};
for (const [id, source] of Object.entries(sources)) {
  masks[id] = source.urban_footprint
    ? await generateUrbanFootprint(id, source, masks, sources)
    : source.derive_from_parent
      ? deriveNationFromParent(id, source, masks, sources)
    : alignDetailMask(id, await generateSource(id, source), source, masks, sources);
}

const outputDocument = {
  version: 1,
  generated_notice: "由 npm run map:generate 生成，请勿手工修改。",
  masks,
};
const output = stringifyYaml(outputDocument, { lineWidth: 0 });
const outputPaths = new Set(Object.values(sources).map((source) => source.output));
if (outputPaths.size !== 1) throw new Error("All configured map sources must currently share one output file.");
const [relativeOutputPath] = outputPaths;
const outputPath = path.join(root, relativeOutputPath);

if (checkOnly) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== output) {
    console.error(`Generated map data is stale: ${relativeOutputPath}. Run npm run map:generate.`);
    process.exitCode = 1;
  } else {
    console.log(`Generated map data is current: ${relativeOutputPath}.`);
  }
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output, "utf8");
  for (const [id, mask] of Object.entries(masks)) {
    console.log(`Generated ${id}: ${mask.land_tile_count} land tiles on ${mask.grid.columns}x${mask.grid.rows}.`);
  }
  console.log(`Wrote ${relativeOutputPath}.`);
}
