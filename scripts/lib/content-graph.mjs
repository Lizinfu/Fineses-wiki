import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

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

function toStringValue(value) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function normalizeStableReferences(value) {
  return toArray(value)
    .map((item) => toStringValue(item).trim())
    .filter(Boolean);
}

function extractFrontMatter(source, filePath) {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = normalized.match(
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/,
  );

  if (!match) {
    return {
      data: {},
      body: normalized,
      hasFrontMatter: false,
    };
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

function collectAliases(frontMatter) {
  const params = isObject(frontMatter.params) ? frontMatter.params : {};
  const names = isObject(params.names) ? params.names : {};
  const values = [];

  values.push(...normalizeStableReferences(frontMatter.keywords));

  for (const key of [
    "official",
    "short",
    "native",
    "former",
    "aliases",
  ]) {
    values.push(...normalizeStableReferences(names[key]));
  }

  return [...new Set(values)];
}

function normalizeRelation(raw, index) {
  if (!isObject(raw)) {
    return {
      index,
      type: "",
      target: "",
      note: "",
      period: null,
      reliability: "",
      source_refs: [],
      invalidShape: true,
    };
  }

  return {
    index,
    type: toStringValue(raw.type).trim(),
    target: toStringValue(raw.target).trim(),
    note: toStringValue(raw.note).trim(),
    period: raw.period ?? null,
    reliability: toStringValue(raw.reliability).trim(),
    source_refs: normalizeStableReferences(
      raw.source_refs ?? raw.source_ref ?? raw.source,
    ),
    invalidShape: false,
  };
}

async function readRelationVocabulary(filePath) {
  const source = await readFile(filePath, "utf8");
  const parsed = parseYaml(source) ?? {};
  const records = Array.isArray(parsed)
    ? parsed
    : toArray(parsed.relation_types);

  const byId = new Map();
  const diagnostics = [];

  for (const [index, raw] of records.entries()) {
    if (!isObject(raw)) {
      diagnostics.push({
        severity: "error",
        code: "RELATION_TYPE_INVALID_SHAPE",
        file: toPosix(filePath),
        message: `Relation type entry ${index + 1} must be a mapping.`,
      });
      continue;
    }

    const id = toStringValue(raw.id).trim();

    if (!id) {
      diagnostics.push({
        severity: "error",
        code: "RELATION_TYPE_ID_MISSING",
        file: toPosix(filePath),
        message: `Relation type entry ${index + 1} has no id.`,
      });
      continue;
    }

    if (byId.has(id)) {
      diagnostics.push({
        severity: "error",
        code: "RELATION_TYPE_DUPLICATE",
        file: toPosix(filePath),
        relation_type: id,
        message: `Relation type "${id}" is registered more than once.`,
      });
      continue;
    }

    byId.set(id, {
      id,
      label: toStringValue(raw.label) || id,
      reverse_label:
        toStringValue(raw.reverse_label) ||
        toStringValue(raw.label) ||
        id,
      symmetric: Boolean(raw.symmetric),
      description: toStringValue(raw.description),
    });
  }

  return { byId, diagnostics };
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

function issue({
  collection,
  severity,
  code,
  file,
  entityId,
  relationType,
  target,
  message,
}) {
  collection.push({
    severity,
    code,
    file: toPosix(file),
    ...(entityId ? { entity_id: entityId } : {}),
    ...(relationType ? { relation_type: relationType } : {}),
    ...(target ? { target } : {}),
    message,
  });
}

export async function buildContentGraph({
  projectRoot = process.cwd(),
  includeDrafts = false,
} = {}) {
  const contentDirectory = path.join(projectRoot, "content");
  const relationVocabularyPath = path.join(
    projectRoot,
    "data",
    "vocabularies",
    "relation-types.yaml",
  );

  const errors = [];
  const warnings = [];
  const pages = [];
  const entities = [];
  const entityById = new Map();

  const vocabulary = await readRelationVocabulary(
    relationVocabularyPath,
  );

  for (const diagnostic of vocabulary.diagnostics) {
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
        code: "FRONT_MATTER_PARSE_FAILED",
        file: relativePath,
        message: error.message,
      });
      continue;
    }

    const frontMatter = parsed.data;
    const params = isObject(frontMatter.params)
      ? frontMatter.params
      : {};
    const library = isObject(params.library)
      ? params.library
      : {};

    const page = {
      content_path: relativePath,
      page_ref: pageRefFromContentPath(relativePath),
      section: sectionFromContentPath(relativePath),
      title: toStringValue(frontMatter.title).trim(),
      draft: Boolean(frontMatter.draft),
      id: toStringValue(params.id).trim(),
      schema: toStringValue(params.schema).trim(),
      entity_kind: toStringValue(params.entity_kind).trim(),
      catalog_no: toStringValue(library.catalog_no).trim(),
      aliases: collectAliases(frontMatter),
      relations: toArray(params.relations).map(normalizeRelation),
      source_refs: normalizeStableReferences(library.source_refs),
      allow_orphan: Boolean(params.allow_orphan),
    };

    if (page.draft && !includeDrafts) continue;

    pages.push(page);

    if (!page.id) continue;

    if (!page.title) {
      issue({
        collection: errors,
        severity: "error",
        code: "ENTITY_TITLE_MISSING",
        file: relativePath,
        entityId: page.id,
        message: `Entity "${page.id}" must have a title.`,
      });
    }

    if (!ID_PATTERN.test(page.id)) {
      issue({
        collection: errors,
        severity: "error",
        code: "ENTITY_ID_INVALID",
        file: relativePath,
        entityId: page.id,
        message:
          `Stable ID "${page.id}" may contain only lowercase letters, ` +
          "numbers, dots, and hyphens.",
      });
    }

    if (entityById.has(page.id)) {
      const existing = entityById.get(page.id);

      issue({
        collection: errors,
        severity: "error",
        code: "ENTITY_ID_DUPLICATE",
        file: relativePath,
        entityId: page.id,
        message:
          `Stable ID "${page.id}" is also used by ` +
          `"${existing.content_path}".`,
      });
      continue;
    }

    entities.push(page);
    entityById.set(page.id, page);
  }

  const backlinks = new Map();
  const outgoingCount = new Map();
  let relationCount = 0;

  for (const entity of entities) {
    outgoingCount.set(entity.id, 0);

    for (const relation of entity.relations) {
      relationCount += 1;

      if (relation.invalidShape) {
        issue({
          collection: errors,
          severity: "error",
          code: "RELATION_INVALID_SHAPE",
          file: entity.content_path,
          entityId: entity.id,
          message:
            `Relation entry ${relation.index + 1} must be a mapping.`,
        });
        continue;
      }

      if (!relation.type) {
        issue({
          collection: errors,
          severity: "error",
          code: "RELATION_TYPE_MISSING",
          file: entity.content_path,
          entityId: entity.id,
          target: relation.target,
          message:
            `Relation entry ${relation.index + 1} has no type.`,
        });
      } else if (!vocabulary.byId.has(relation.type)) {
        issue({
          collection: errors,
          severity: "error",
          code: "RELATION_TYPE_UNREGISTERED",
          file: entity.content_path,
          entityId: entity.id,
          relationType: relation.type,
          target: relation.target,
          message:
            `Relation type "${relation.type}" is not registered in ` +
            "data/vocabularies/relation-types.yaml.",
        });
      }

      if (!relation.target) {
        issue({
          collection: errors,
          severity: "error",
          code: "RELATION_TARGET_MISSING",
          file: entity.content_path,
          entityId: entity.id,
          relationType: relation.type,
          message:
            `Relation entry ${relation.index + 1} has no target.`,
        });
        continue;
      }

      if (relation.target === entity.id) {
        issue({
          collection: warnings,
          severity: "warning",
          code: "RELATION_SELF_REFERENCE",
          file: entity.content_path,
          entityId: entity.id,
          relationType: relation.type,
          target: relation.target,
          message: `Entity "${entity.id}" relates to itself.`,
        });
      }

      const targetEntity = entityById.get(relation.target);

      if (!targetEntity) {
        issue({
          collection: errors,
          severity: "error",
          code: "RELATION_TARGET_NOT_FOUND",
          file: entity.content_path,
          entityId: entity.id,
          relationType: relation.type,
          target: relation.target,
          message:
            `Relation target "${relation.target}" does not exist.`,
        });
        continue;
      }

      outgoingCount.set(
        entity.id,
        (outgoingCount.get(entity.id) ?? 0) + 1,
      );

      const targetBacklinks = backlinks.get(relation.target) ?? [];

      targetBacklinks.push({
        source_id: entity.id,
        source_title: entity.title,
        source_page_ref: entity.page_ref,
        type: relation.type,
        note: relation.note,
        period: relation.period,
        reliability: relation.reliability,
        source_refs: relation.source_refs,
      });

      backlinks.set(relation.target, targetBacklinks);

      for (const sourceReference of relation.source_refs) {
        if (
          ID_PATTERN.test(sourceReference) &&
          !entityById.has(sourceReference)
        ) {
          issue({
            collection: errors,
            severity: "error",
            code: "RELATION_SOURCE_NOT_FOUND",
            file: entity.content_path,
            entityId: entity.id,
            relationType: relation.type,
            target: sourceReference,
            message:
              `Relation source reference "${sourceReference}" ` +
              "does not exist.",
          });
        }
      }
    }

    for (const sourceReference of entity.source_refs) {
      if (
        ID_PATTERN.test(sourceReference) &&
        !entityById.has(sourceReference)
      ) {
        issue({
          collection: errors,
          severity: "error",
          code: "ENTITY_SOURCE_NOT_FOUND",
          file: entity.content_path,
          entityId: entity.id,
          target: sourceReference,
          message:
            `Library source reference "${sourceReference}" does not exist.`,
        });
      }
    }
  }

  const orphanEntities = entities
    .filter((entity) => {
      if (entity.allow_orphan) return false;

      const outgoing = outgoingCount.get(entity.id) ?? 0;
      const incoming = backlinks.get(entity.id)?.length ?? 0;
      return outgoing === 0 && incoming === 0;
    })
    .map((entity) => ({
      id: entity.id,
      title: entity.title,
      content_path: entity.content_path,
      page_ref: entity.page_ref,
      entity_kind: entity.entity_kind,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const orphan of orphanEntities) {
    issue({
      collection: warnings,
      severity: "warning",
      code: "ENTITY_ORPHAN",
      file: orphan.content_path,
      entityId: orphan.id,
      message:
        `Entity "${orphan.id}" has no incoming or outgoing relations. ` +
        "Set params.allow_orphan=true when this is intentional.",
    });
  }

  const idIndex = Object.fromEntries(
    [...entityById.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, entity]) => [
        id,
        {
          title: entity.title,
          page_ref: entity.page_ref,
          content_path: entity.content_path,
          section: entity.section,
          entity_kind: entity.entity_kind,
          schema: entity.schema,
          catalog_no: entity.catalog_no,
          aliases: entity.aliases,
        },
      ]),
  );

  const backlinkObject = Object.fromEntries(
    [...backlinks.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([target, records]) => [
        target,
        records.sort((left, right) => {
          const typeOrder = left.type.localeCompare(right.type);
          if (typeOrder !== 0) return typeOrder;
          return left.source_id.localeCompare(right.source_id);
        }),
      ]),
  );

  const byKind = {};
  const bySection = {};

  for (const entity of entities) {
    const kind = entity.entity_kind || "unspecified";
    const section = entity.section || "root";

    byKind[kind] = (byKind[kind] ?? 0) + 1;
    bySection[section] = (bySection[section] ?? 0) + 1;
  }

  sortDiagnostics(errors);
  sortDiagnostics(warnings);

  return {
    idIndex,
    backlinks: backlinkObject,
    entityCounts: {
      total: entities.length,
      by_kind: Object.fromEntries(
        Object.entries(byKind).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      by_section: Object.fromEntries(
        Object.entries(bySection).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    },
    report: {
      schema_version: 1,
      totals: {
        entities: entities.length,
        relations: relationCount,
        backlinks: Object.values(backlinkObject).reduce(
          (total, records) => total + records.length,
          0,
        ),
        errors: errors.length,
        warnings: warnings.length,
        orphans: orphanEntities.length,
      },
      errors,
      warnings,
      orphans: orphanEntities,
    },
  };
}
