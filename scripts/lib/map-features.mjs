export const featureCategories = [
  "administrative_regions",
  "terrain",
  "waterways",
  "routes",
  "settlements",
];
const stableId = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const point = (value) =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
const kinds = {
  administrative_regions: ["district"],
  terrain: ["plain", "upland", "hill", "low-hills"],
  waterways: ["river"],
  routes: ["road", "rail"],
  settlements: ["point", "concentric-city"],
};
const flowVectors = {
  "southwest-to-northeast": [1, -1],
  "northeast-to-southwest": [-1, 1],
  "northwest-to-southeast": [1, 1],
  "southeast-to-northwest": [-1, -1],
  "west-to-east": [1, 0],
  "east-to-west": [-1, 0],
  "north-to-south": [0, 1],
  "south-to-north": [0, -1],
};

export function validateMapFeatures(featureMaps, mapIds, entityIds) {
  const errors = [],
    ids = new Set();
  for (const [mapId, set] of Object.entries(featureMaps)) {
    const prefix = `features.${mapId}`;
    if (!mapIds.has(mapId)) errors.push(`${prefix}: map does not exist.`);
    if (!set || typeof set !== "object" || Array.isArray(set)) {
      errors.push(`${prefix}: must be a mapping.`);
      continue;
    }
    for (const key of Object.keys(set))
      if (!featureCategories.includes(key))
        errors.push(`${prefix}.${key}: unknown category.`);
    for (const category of featureCategories) {
      if (!Array.isArray(set[category])) {
        errors.push(`${prefix}.${category}: must be an array.`);
        continue;
      }
      if (set[category].length > 200)
        errors.push(`${prefix}.${category}: exceeds the 200-feature budget.`);
      for (const feature of set[category]) {
        const name = `${prefix}.${category}.${feature?.id ?? "?"}`;
        if (!feature || typeof feature !== "object") {
          errors.push(`${name}: must be a mapping.`);
          continue;
        }
        if (
          typeof feature.id !== "string" ||
          !stableId.test(feature.id) ||
          ids.has(feature.id)
        )
          errors.push(`${name}: missing, invalid or duplicate stable ID.`);
        ids.add(feature.id);
        for (const field of ["label", "description", "source"])
          if (typeof feature[field] !== "string" || !feature[field].trim())
            errors.push(`${name}: ${field} is required.`);
        if (!["provisional", "verified"].includes(feature.geometry_status))
          errors.push(`${name}: geometry_status is required.`);
        if (!kinds[category].includes(feature.kind))
          errors.push(`${name}: unsupported kind.`);
        if (feature.entity_id && !entityIds.has(feature.entity_id))
          errors.push(`${name}: unknown entity_id.`);
        if (
          feature.label_position !== undefined &&
          !point(feature.label_position)
        )
          errors.push(`${name}: invalid label_position.`);
        const geometry = feature.geometry;
        const expected =
          category === "terrain" || feature.kind === "concentric-city"
            ? "ellipse"
            : category === "settlements"
              ? "point"
              : category === "administrative_regions"
                ? "polygon"
                : "polyline";
        if (geometry?.type !== expected) {
          errors.push(`${name}: geometry must be ${expected}.`);
          continue;
        }
        if (expected === "ellipse") {
          if (
            !point(geometry.center) ||
            !point(geometry.radius) ||
            geometry.radius.some((n) => n <= 0)
          )
            errors.push(`${name}: invalid ellipse.`);
        } else if (expected === "point") {
          if (!point(geometry.position)) errors.push(`${name}: invalid point.`);
        } else if (
          !Array.isArray(geometry.points) ||
          geometry.points.length < (expected === "polygon" ? 3 : 2) ||
          geometry.points.length > 256 ||
          !geometry.points.every(point)
        ) {
          errors.push(`${name}: invalid normalized path.`);
        }
        if (category === "terrain") {
          const elevation = feature.elevation;
          if (
            !Number.isInteger(elevation?.level) ||
            elevation.level < 0 ||
            elevation.level > 6 ||
            (elevation.core_level !== undefined &&
              (!Number.isInteger(elevation.core_level) ||
                elevation.core_level < elevation.level ||
                elevation.core_level > 6 ||
                !Number.isFinite(elevation.core_ratio) ||
                elevation.core_ratio <= 0 ||
                elevation.core_ratio >= 1))
          )
            errors.push(`${name}: invalid discrete terrace elevation.`);
          if (elevation?.slope !== undefined) {
            const { direction, levels } = elevation.slope ?? {};
            if (!Array.isArray(direction) || direction.length !== 2 ||
                !direction.every(Number.isFinite) || Math.hypot(...direction) === 0 ||
                !Number.isInteger(levels) || levels < 1 ||
                elevation.level + levels > 6)
              errors.push(`${name}: invalid directional terrace slope.`);
          }
          if (feature.relief !== undefined)
            errors.push(
              `${name}: continuous relief is no longer supported; use terrace elevation.`,
            );
        }
        if (category === "waterways") {
          const vector = flowVectors[feature.flow_direction];
          if (!vector) errors.push(`${name}: unsupported flow_direction.`);
          const points = geometry.points;
          if (
            vector &&
            Array.isArray(points) &&
            points.length >= 2 &&
            points.every(point) &&
            vector.some(
              (sign, axis) =>
                sign && (points.at(-1)[axis] - points[0][axis]) * sign <= 0,
            )
          )
            errors.push(
              `${name}: river points contradict declared flow_direction.`,
            );
        }
        if (feature.kind === "concentric-city") {
          const layout = feature.layout;
          if (
            !layout ||
            !Number.isInteger(layout.spokes) ||
            layout.spokes < 4 ||
            layout.spokes > 24 ||
            layout.spokes % 2 ||
            !Number.isInteger(layout.seed) ||
            !Array.isArray(layout.rings) ||
            layout.rings.length < 2 ||
            layout.rings.length > 6 ||
            !layout.rings.every(
              (n, i, list) =>
                Number.isFinite(n) &&
                n >= 0.24 &&
                n <= 1 &&
                (i === 0 || n - list[i - 1] > 0.08),
            )
          )
            errors.push(`${name}: invalid symmetric city layout.`);
        }
      }
    }
  }
  return errors;
}
