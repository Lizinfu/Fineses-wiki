import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);
const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const STATUS_LABELS = {
  verified: "已核实",
  probable: "较可信",
  disputed: "存在争议",
  legendary: "传说记录",
  unknown: "可信度未知",
};

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toArray(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function stringValue(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function uniqueStrings(value) {
  return [
    ...new Set(
      toArray(value)
        .map((item) => stringValue(item))
        .filter(Boolean),
    ),
  ];
}

function extractFrontMatter(source, filePath) {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = normalized.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  );

  if (!match) {
    return { data: {}, body: normalized, hasFrontMatter: false };
  }

  let data;

  try {
    data = parseYaml(match[1]) ?? {};
  } catch (error) {
    const wrapped = new Error(
      `Unable to parse YAML front matter in ${filePath}: ${error.message}`,
    );
    wrapped.cause = error;
    throw wrapped;
  }

  if (!isObject(data)) {
    throw new Error(
      `Front matter in ${filePath} must evaluate to a YAML mapping.`,
    );
  }

  return {
    data,
    body: normalized.slice(match[0].length),
    hasFrontMatter: true,
  };
}

async function walkMarkdown(directory) {
  const files = [];

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }

      if (
        entry.isFile() &&
        MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        files.push(absolute);
      }
    }
  }

  await visit(directory);
  return files;
}

function pageRefFromContentPath(relativePath) {
  const normalized = toPosix(relativePath);
  const extension = path.posix.extname(normalized);
  const withoutExtension = normalized.slice(0, -extension.length);
  const baseName = path.posix.basename(withoutExtension).toLowerCase();

  let logicalPath;

  if (baseName === "index" || baseName === "_index") {
    logicalPath = path.posix.dirname(withoutExtension);
  } else {
    logicalPath = withoutExtension;
  }

  if (logicalPath === "." || logicalPath === "") return "/";
  return `/${logicalPath.replace(/^\/+|\/+$/g, "")}`;
}

function sectionFromContentPath(relativePath) {
  const [section = ""] = toPosix(relativePath).split("/");
  return section;
}

async function readVocabulary(filePath, rootKey) {
  const source = await readFile(filePath, "utf8");
  const parsed = parseYaml(source) ?? {};
  const records = Array.isArray(parsed)
    ? parsed
    : toArray(parsed[rootKey]);

  const byId = new Map();
  const diagnostics = [];

  for (const [index, raw] of records.entries()) {
    if (!isObject(raw)) {
      diagnostics.push({
        severity: "error",
        code: "TIMELINE_VOCABULARY_INVALID_SHAPE",
        file: toPosix(filePath),
        message: `${rootKey} entry ${index + 1} must be a mapping.`,
      });
      continue;
    }

    const id = stringValue(raw.id);

    if (!id) {
      diagnostics.push({
        severity: "error",
        code: "TIMELINE_VOCABULARY_ID_MISSING",
        file: toPosix(filePath),
        message: `${rootKey} entry ${index + 1} has no id.`,
      });
      continue;
    }

    if (byId.has(id)) {
      diagnostics.push({
        severity: "error",
        code: "TIMELINE_VOCABULARY_DUPLICATE",
        file: toPosix(filePath),
        value: id,
        message: `${rootKey} value "${id}" is registered more than once.`,
      });
      continue;
    }

    byId.set(id, {
      id,
      label: stringValue(raw.label) || id,
      short_label:
        stringValue(raw.short_label) ||
        stringValue(raw.label) ||
        id,
      description: stringValue(raw.description),
    });
  }

  return { byId, diagnostics };
}

function issue({
  collection,
  severity,
  code,
  file,
  entityId,
  value,
  message,
}) {
  collection.push({
    severity,
    code,
    file: toPosix(file),
    ...(entityId ? { entity_id: entityId } : {}),
    ...(value !== undefined && value !== "" ? { value } : {}),
    message,
  });
}

function finiteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizePoint(raw, fallback = {}) {
  if (raw === undefined || raw === null || raw === "") return null;

  if (typeof raw === "number") {
    return {
      display: String(raw),
      sort_value: raw,
      calendar: fallback.calendar ?? "default",
      precision: fallback.precision ?? "year",
      circa: Boolean(fallback.circa),
    };
  }

  if (typeof raw === "string") {
    return {
      display: raw.trim(),
      sort_value: finiteNumber(fallback.sort_value),
      calendar: fallback.calendar ?? "default",
      precision: fallback.precision ?? "unknown",
      circa: Boolean(fallback.circa),
    };
  }

  if (!isObject(raw)) return { invalidShape: true };

  return {
    display:
      stringValue(raw.display) ||
      stringValue(raw.label) ||
      stringValue(fallback.display),
    sort_value: finiteNumber(
      raw.sort_value ?? raw.sort ?? fallback.sort_value,
    ),
    calendar:
      stringValue(raw.calendar) ||
      stringValue(fallback.calendar) ||
      "default",
    precision:
      stringValue(raw.precision) ||
      stringValue(fallback.precision) ||
      "unknown",
    circa: Boolean(raw.circa ?? fallback.circa),
  };
}

function normalizeVariant(raw, index, defaults) {
  if (!isObject(raw)) {
    return { index, invalidShape: true };
  }

  const point = normalizePoint(raw, defaults);

  return {
    index,
    display: point?.display ?? "",
    sort_value: point?.sort_value ?? null,
    calendar: point?.calendar ?? defaults.calendar ?? "default",
    precision: point?.precision ?? defaults.precision ?? "unknown",
    circa: Boolean(point?.circa),
    note: stringValue(raw.note),
    source_refs: uniqueStrings(
      raw.source_refs ?? raw.source_ref ?? raw.source,
    ),
  };
}

function summarizeBody(body) {
  const withoutShortcodes = body.replace(
    /\{\{[<%][\s\S]*?[>%]\}\}/g,
    " ",
  );
  const withoutMarkdown = withoutShortcodes
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (withoutMarkdown.length <= 180) return withoutMarkdown;
  return `${withoutMarkdown.slice(0, 177).trimEnd()}…`;
}

function sortDiagnostics(items) {
  return items.sort((left, right) => {
    const fileOrder = (left.file ?? "").localeCompare(right.file ?? "");
    if (fileOrder !== 0) return fileOrder;

    const codeOrder = (left.code ?? "").localeCompare(right.code ?? "");
    if (codeOrder !== 0) return codeOrder;

    return (left.message ?? "").localeCompare(right.message ?? "");
  });
}

function countValues(items, getter) {
  const counts = new Map();

  for (const item of items) {
    for (const value of toArray(getter(item))) {
      if (!value) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  return counts;
}

function toFilterRecords(counts, vocabulary = new Map()) {
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: vocabulary.get(id)?.label ?? id,
      count,
    }))
    .sort((left, right) =>
      left.label.localeCompare(right.label, "zh-CN"),
    );
}

export async function buildTimeline({
  projectRoot = process.cwd(),
  knownIds = [],
  includeDrafts = false,
} = {}) {
  const contentDirectory = path.join(projectRoot, "content");
  const calendarPath = path.join(
    projectRoot,
    "data",
    "vocabularies",
    "calendars.yaml",
  );
  const categoryPath = path.join(
    projectRoot,
    "data",
    "vocabularies",
    "timeline-categories.yaml",
  );

  const calendars = await readVocabulary(calendarPath, "calendars");
  const categories = await readVocabulary(
    categoryPath,
    "timeline_categories",
  );

  const errors = [];
  const warnings = [];
  const entries = [];
  const timelineIds = new Set();
  const knownIdSet = new Set(knownIds);

  for (const diagnostic of [
    ...calendars.diagnostics,
    ...categories.diagnostics,
  ]) {
    if (diagnostic.severity === "error") errors.push(diagnostic);
    else warnings.push(diagnostic);
  }

  const markdownFiles = await walkMarkdown(contentDirectory);

  for (const absolutePath of markdownFiles) {
    const relativePath = toPosix(
      path.relative(contentDirectory, absolutePath),
    );
    const source = await readFile(absolutePath, "utf8");

    let parsed;

    try {
      parsed = extractFrontMatter(source, relativePath);
    } catch (error) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_FRONT_MATTER_PARSE_FAILED",
        file: relativePath,
        message: error.message,
      });
      continue;
    }

    const frontMatter = parsed.data;

    if (Boolean(frontMatter.draft) && !includeDrafts) continue;

    const params = isObject(frontMatter.params)
      ? frontMatter.params
      : {};
    const timeline = isObject(params.timeline)
      ? params.timeline
      : isObject(frontMatter.timeline)
        ? frontMatter.timeline
        : null;

    if (!timeline || timeline.include === false) continue;

    const entityId = stringValue(params.id ?? frontMatter.id);
    const title =
      stringValue(timeline.title) ||
      stringValue(frontMatter.title);
    const entityKind =
      stringValue(params.entity_kind) ||
      stringValue(frontMatter.entity_kind) ||
      sectionFromContentPath(relativePath) ||
      "page";
    const defaultCalendar =
      stringValue(timeline.calendar) || "default";
    const defaultPrecision =
      stringValue(timeline.precision) || "unknown";
    const undated = Boolean(timeline.undated);

    if (!entityId) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_ENTITY_ID_MISSING",
        file: relativePath,
        message:
          "A page included in the global timeline must define params.id.",
      });
      continue;
    }

    if (!ID_PATTERN.test(entityId)) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_ENTITY_ID_INVALID",
        file: relativePath,
        entityId,
        message: `Timeline entity ID "${entityId}" is invalid.`,
      });
    }

    if (timelineIds.has(entityId)) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_ENTITY_DUPLICATE",
        file: relativePath,
        entityId,
        message:
          `Timeline entity "${entityId}" is included more than once.`,
      });
      continue;
    }

    timelineIds.add(entityId);

    if (!title) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_TITLE_MISSING",
        file: relativePath,
        entityId,
        message: `Timeline entry "${entityId}" must have a title.`,
      });
    }

    const start = normalizePoint(
      timeline.start ?? timeline.date,
      {
        display: timeline.display,
        sort_value:
          timeline.sort_value ??
          timeline.sort ??
          timeline.start_sort_value,
        calendar: defaultCalendar,
        precision: defaultPrecision,
        circa: timeline.circa,
      },
    );

    const end = normalizePoint(timeline.end, {
      sort_value: timeline.end_sort_value,
      calendar: defaultCalendar,
      precision: defaultPrecision,
      circa: timeline.end_circa,
    });

    if (!undated && !start) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_START_MISSING",
        file: relativePath,
        entityId,
        message:
          "A dated timeline entry must define timeline.start or timeline.date.",
      });
    }

    if (start?.invalidShape) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_START_INVALID_SHAPE",
        file: relativePath,
        entityId,
        message: "timeline.start must be a number, string, or mapping.",
      });
    }

    if (end?.invalidShape) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_END_INVALID_SHAPE",
        file: relativePath,
        entityId,
        message: "timeline.end must be a number, string, or mapping.",
      });
    }

    if (!undated && start && !start.display) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_DISPLAY_MISSING",
        file: relativePath,
        entityId,
        message: "timeline.start.display is required.",
      });
    }

    if (!undated && start && start.sort_value === null) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_SORT_VALUE_MISSING",
        file: relativePath,
        entityId,
        message:
          "A dated timeline entry needs a numeric sort_value for stable ordering.",
      });
    }

    if (end && !end.display) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_END_DISPLAY_MISSING",
        file: relativePath,
        entityId,
        message: "timeline.end.display is required when an end exists.",
      });
    }

    if (end && end.sort_value === null) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_END_SORT_VALUE_MISSING",
        file: relativePath,
        entityId,
        message:
          "timeline.end needs a numeric sort_value for stable ordering.",
      });
    }

    if (end && !calendars.byId.has(end.calendar)) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_END_CALENDAR_UNREGISTERED",
        file: relativePath,
        entityId,
        value: end.calendar,
        message:
          `Timeline end calendar "${end.calendar}" is unregistered.`,
      });
    }

    if (
      start?.sort_value !== null &&
      end?.sort_value !== null &&
      end.sort_value < start.sort_value
    ) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_RANGE_REVERSED",
        file: relativePath,
        entityId,
        message: "timeline.end.sort_value cannot be earlier than start.",
      });
    }

    const calendarId =
      start?.calendar || defaultCalendar || "default";

    if (!calendars.byId.has(calendarId)) {
      issue({
        collection: errors,
        severity: "error",
        code: "TIMELINE_CALENDAR_UNREGISTERED",
        file: relativePath,
        entityId,
        value: calendarId,
        message:
          `Calendar "${calendarId}" is not registered in ` +
          "data/vocabularies/calendars.yaml.",
      });
    }

    const categoryIds = uniqueStrings(
      timeline.categories ?? timeline.category ?? "other",
    );

    for (const categoryId of categoryIds) {
      if (!categories.byId.has(categoryId)) {
        issue({
          collection: errors,
          severity: "error",
          code: "TIMELINE_CATEGORY_UNREGISTERED",
          file: relativePath,
          entityId,
          value: categoryId,
          message:
            `Timeline category "${categoryId}" is not registered in ` +
            "data/vocabularies/timeline-categories.yaml.",
        });
      }
    }

    const status = stringValue(timeline.status) || "verified";

    if (!Object.hasOwn(STATUS_LABELS, status)) {
      issue({
        collection: warnings,
        severity: "warning",
        code: "TIMELINE_STATUS_UNKNOWN",
        file: relativePath,
        entityId,
        value: status,
        message:
          `Timeline status "${status}" has no built-in display label.`,
      });
    }

    const sourceRefs = uniqueStrings(
      timeline.source_refs ??
        timeline.source_ref ??
        timeline.source,
    );

    for (const sourceReference of sourceRefs) {
      if (
        ID_PATTERN.test(sourceReference) &&
        knownIdSet.size > 0 &&
        !knownIdSet.has(sourceReference)
      ) {
        issue({
          collection: errors,
          severity: "error",
          code: "TIMELINE_SOURCE_NOT_FOUND",
          file: relativePath,
          entityId,
          value: sourceReference,
          message:
            `Timeline source reference "${sourceReference}" does not exist.`,
        });
      }
    }

    const variants = toArray(timeline.variants).map(
      (variant, index) =>
        normalizeVariant(variant, index, {
          calendar: calendarId,
          precision: defaultPrecision,
        }),
    );

    for (const variant of variants) {
      if (variant.invalidShape) {
        issue({
          collection: errors,
          severity: "error",
          code: "TIMELINE_VARIANT_INVALID_SHAPE",
          file: relativePath,
          entityId,
          message:
            `Timeline variant ${variant.index + 1} must be a mapping.`,
        });
        continue;
      }

      if (!variant.display) {
        issue({
          collection: errors,
          severity: "error",
          code: "TIMELINE_VARIANT_DISPLAY_MISSING",
          file: relativePath,
          entityId,
          message:
            `Timeline variant ${variant.index + 1} needs display text.`,
        });
      }

      if (!calendars.byId.has(variant.calendar)) {
        issue({
          collection: errors,
          severity: "error",
          code: "TIMELINE_VARIANT_CALENDAR_UNREGISTERED",
          file: relativePath,
          entityId,
          value: variant.calendar,
          message:
            `Timeline variant calendar "${variant.calendar}" is unregistered.`,
        });
      }

      for (const sourceReference of variant.source_refs) {
        if (
          ID_PATTERN.test(sourceReference) &&
          knownIdSet.size > 0 &&
          !knownIdSet.has(sourceReference)
        ) {
          issue({
            collection: errors,
            severity: "error",
            code: "TIMELINE_VARIANT_SOURCE_NOT_FOUND",
            file: relativePath,
            entityId,
            value: sourceReference,
            message:
              `Timeline variant source "${sourceReference}" does not exist.`,
          });
        }
      }
    }

    if (status === "disputed" && variants.length === 0) {
      issue({
        collection: warnings,
        severity: "warning",
        code: "TIMELINE_DISPUTED_WITHOUT_VARIANTS",
        file: relativePath,
        entityId,
        message:
          "A disputed timeline entry should usually provide timeline.variants.",
      });
    }

    entries.push({
      id: entityId,
      title,
      page_ref: pageRefFromContentPath(relativePath),
      content_path: relativePath,
      section: sectionFromContentPath(relativePath),
      entity_kind: entityKind,
      summary:
        stringValue(timeline.summary) ||
        stringValue(frontMatter.description) ||
        summarizeBody(parsed.body),
      start: undated
        ? null
        : {
            ...start,
            calendar_label:
              calendars.byId.get(calendarId)?.label ?? calendarId,
          },
      end: end
        ? {
            ...end,
            calendar_label:
              calendars.byId.get(end.calendar)?.label ?? end.calendar,
          }
        : null,
      undated,
      undated_label:
        stringValue(timeline.undated_label) || "日期不详",
      order_hint:
        finiteNumber(timeline.order_hint) ??
        finiteNumber(timeline.weight) ??
        0,
      calendar: calendarId,
      calendar_label:
        calendars.byId.get(calendarId)?.label ?? calendarId,
      categories: categoryIds,
      category_labels: categoryIds.map(
        (categoryId) =>
          categories.byId.get(categoryId)?.label ?? categoryId,
      ),
      status,
      status_label: STATUS_LABELS[status] ?? status,
      source_refs: sourceRefs,
      note: stringValue(timeline.note),
      variants: variants.filter((variant) => !variant.invalidShape),
    });
  }

  const dated = entries
    .filter((entry) => !entry.undated)
    .sort((left, right) => {
      const startOrder =
        (left.start?.sort_value ?? 0) -
        (right.start?.sort_value ?? 0);
      if (startOrder !== 0) return startOrder;

      const endOrder =
        (left.end?.sort_value ?? left.start?.sort_value ?? 0) -
        (right.end?.sort_value ?? right.start?.sort_value ?? 0);
      if (endOrder !== 0) return endOrder;

      return left.title.localeCompare(right.title, "zh-CN");
    });

  const undatedEntries = entries
    .filter((entry) => entry.undated)
    .sort((left, right) => {
      const hintOrder = left.order_hint - right.order_hint;
      if (hintOrder !== 0) return hintOrder;
      return left.title.localeCompare(right.title, "zh-CN");
    });

  const allEntries = [...dated, ...undatedEntries];

  const filters = {
    calendars: toFilterRecords(
      countValues(allEntries, (entry) => entry.calendar),
      calendars.byId,
    ),
    categories: toFilterRecords(
      countValues(allEntries, (entry) => entry.categories),
      categories.byId,
    ),
    entity_kinds: toFilterRecords(
      countValues(allEntries, (entry) => entry.entity_kind),
    ),
    statuses: toFilterRecords(
      countValues(allEntries, (entry) => entry.status),
      new Map(
        Object.entries(STATUS_LABELS).map(([id, label]) => [
          id,
          { id, label },
        ]),
      ),
    ),
  };

  sortDiagnostics(errors);
  sortDiagnostics(warnings);

  return {
    timeline: {
      schema_version: 1,
      entries: dated,
      undated: undatedEntries,
      filters,
    },
    report: {
      schema_version: 1,
      totals: {
        entries: allEntries.length,
        dated: dated.length,
        undated: undatedEntries.length,
        errors: errors.length,
        warnings: warnings.length,
      },
      errors,
      warnings,
    },
  };
}
