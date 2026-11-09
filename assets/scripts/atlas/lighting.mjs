// A single neutral light for every existing atlas material. Coordinates are
// geographic x/east, y/south and z/up; normals never use the tilted screen plane.
/** @typedef {readonly number[] | {x: number, y: number, z?: number}} VectorInput */
/** @typedef {{ambient?: number, diffuse?: number, maxBrightness?: number, maxChannel?: number}} LightingOptions */

/** @param {VectorInput | null | undefined} value */
function vector(value) {
  if (!value) return undefined;
  const result = Array.isArray(value)
    ? [value[0], value[1], value[2] ?? 0]
    : [value.x, value.y, value.z ?? 0];
  return result.every(Number.isFinite) ? result : undefined;
}

/** @param {number[]} value */
function unit(value) {
  const largest = Math.max(...value.map(Math.abs));
  if (largest === 0) return undefined;
  // Scaling first handles both very small normals and finite values whose
  // unscaled length would overflow.
  const scaled = value.map(component => component / largest),
    length = Math.hypot(...scaled);
  return scaled.map(component => component / length);
}

/**
 * Normalize without changing direction; invalid/zero vectors use a finite fallback.
 * @param {VectorInput | null | undefined} value
 * @param {VectorInput} [fallback]
 */
export function normalize3(value, fallback = [0, 0, 1]) {
  const input = vector(value),
    normalized = input && unit(input);
  if (normalized) return normalized;
  const replacement = vector(fallback);
  return replacement ? unit(replacement) ?? [0, 0, 0] : [0, 0, 1];
}

export const LIGHT_DIRECTION = Object.freeze(normalize3([-0.45, -0.6, 0.8]));

/**
 * Ambient + Lambert light scales all RGB channels together, preserving the base
 * material's hue. A common scale also caps highlights without per-channel clipping.
 * @param {number} baseRGB
 * @param {VectorInput | null | undefined} normal
 * @param {LightingOptions} [options]
 */
export function litColor(baseRGB, normal, options = {}) {
  if (!Number.isFinite(baseRGB)) return 0;
  const color = Math.max(0, Math.min(0xffffff, Math.trunc(baseRGB))),
    channels = [color >>> 16, color >>> 8 & 255, color & 255],
    largest = Math.max(...channels);
  if (largest === 0) return 0;
  const bounded = (value, fallback, maximum) => Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, value))
    : fallback;
  const ambient = bounded(options?.ambient, 0.58, 1),
    diffuse = bounded(options?.diffuse, 0.56, 1),
    maximum = bounded(options?.maxBrightness, 1.06, 2),
    ceiling = bounded(options?.maxChannel, 250, 255),
    n = normalize3(normal, [0, 0, 0]),
    lambert = Math.max(0, n.reduce((sum, component, i) => sum + component * LIGHT_DIRECTION[i], 0)),
    scale = Math.min(ambient + diffuse * lambert, maximum, ceiling / largest),
    [r, g, b] = channels.map(channel => Math.round(channel * scale));
  return r << 16 | g << 8 | b;
}

/**
 * Outward vertical normal of an unprojected geographic edge. Positive winding is
 * the usual positive signed area of the original polygon; negative reverses it.
 * @param {VectorInput} edgeA
 * @param {VectorInput} edgeB
 * @param {number} [winding]
 */
export function sideNormal(edgeA, edgeB, winding = 1) {
  const a = vector(edgeA), b = vector(edgeB);
  if (!a || !b) return [0, 0, 0];
  const sign = winding < 0 ? -1 : 1;
  return normalize3([(b[1] - a[1]) * sign, (a[0] - b[0]) * sign, 0], [0, 0, 0]);
}

/**
 * Area-weighted normal of a 3D polygon, including a roof slope. Subtracting the
 * first point before the cross products keeps translations out of the result.
 * @param {readonly VectorInput[]} points
 * @param {number} [winding]
 */
export function faceNormal(points, winding = 1) {
  if (!Array.isArray(points) || points.length < 3) return [0, 0, 1];
  const vertices = points.map(vector);
  if (vertices.some(point => !point)) return [0, 0, 1];
  const origin = vertices[0],
    relative = vertices.map(point => point.map((component, i) => component - origin[i])),
    largest = Math.max(...relative.flat().map(Math.abs));
  if (!Number.isFinite(largest) || largest === 0) return [0, 0, 1];
  const scaled = relative.map(point => point.map(component => component / largest)),
    sum = [0, 0, 0],
    sign = winding < 0 ? -1 : 1;
  for (let i = 1; i < scaled.length - 1; i++) {
    const a = scaled[i], b = scaled[i + 1];
    sum[0] += (a[1] * b[2] - a[2] * b[1]) * sign;
    sum[1] += (a[2] * b[0] - a[0] * b[2]) * sign;
    sum[2] += (a[0] * b[1] - a[1] * b[0]) * sign;
  }
  return normalize3(sum);
}
