// Keep camera limits and overview label transitions in one shared place.
export const MIN_ZOOM = 0.37;
export const MAX_ZOOM = 40;
export const COUNTRY_LABEL_ZOOM = 0.5;

/** Finite north/south navigation; the minimum zoom is always a fixed overview. */
export function verticalCameraLimits(camera, height, bounds) {
  const center = (bounds.minY + bounds.maxY) / 2;
  const halfWorld = Math.max(0, (bounds.maxY - bounds.minY) / 2);
  const halfViewport = height / (2 * camera.zoom * camera.tilt);
  // The overview reference also locks short viewports, without an abrupt unlock above 37%.
  const overviewHalf = halfWorld * MIN_ZOOM / camera.zoom;
  const travel = Math.max(0, halfWorld - Math.max(halfViewport, overviewHalf));
  return { minY: center - travel, maxY: center + travel };
}

export function constrainCameraY(camera, height, bounds) {
  const limits = verticalCameraLimits(camera, height, bounds);
  return { ...camera, y: Math.max(limits.minY, Math.min(limits.maxY, camera.y)) };
}

/** Repeated strips whose geometry intersects the horizontal world-space viewport. */
export function visibleWorldCopies(camera, width, period, bounds, padding = 0) {
  if (![camera.x, camera.zoom, width, period, bounds.minX, bounds.maxX, padding].every(Number.isFinite) ||
      camera.zoom <= 0 || width <= 0 || period <= 0 || bounds.minX > bounds.maxX)
    return [];
  const halfWidth = width / (2 * camera.zoom) + Math.max(0, padding),
    first = Math.ceil((camera.x - halfWidth - bounds.maxX) / period),
    last = Math.floor((camera.x + halfWidth - bounds.minX) / period);
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}
