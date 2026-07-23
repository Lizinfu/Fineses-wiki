import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse as parseYaml } from "yaml";
import { walkMarkdown } from "./lib/files.mjs";

const projectRoot = process.cwd();
const requiredParams = [
  "id",
  "schema",
  "entity_kind",
  "canon_status",
  "names",
  "classifications",
  "relations",
];
const requiredLibraryFields = [
  "catalog_no",
  "access_level",
  "reliability",
  "last_reviewed",
];

async function vocabularyIds(fileName, key) {
  const source = await readFile(
    path.join(projectRoot, "data", "vocabularies", fileName),
    "utf8",
  );
  const parsed = parseYaml(source) ?? {};
  return new Set((parsed[key] ?? []).map((item) => String(item.id)));
}

function frontMatter(source) {
  const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/);
  return match ? parseYaml(match[1]) ?? {} : null;
}

function asArray(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

const [entityKinds, canonStatuses, accessLevels, reliabilityLevels] =
  await Promise.all([
    vocabularyIds("entity-kinds.yaml", "entity_kinds"),
    vocabularyIds("canon-statuses.yaml", "canon_statuses"),
    vocabularyIds("access-levels.yaml", "access_levels"),
    vocabularyIds("reliability-levels.yaml", "reliability_levels"),
  ]);

const errors = [];
let checked = 0;
for (const filePath of await walkMarkdown(path.join(projectRoot, "content"))) {
  const relativePath = path.relative(projectRoot, filePath);
  const parsed = frontMatter(await readFile(filePath, "utf8"));
  if (!parsed?.params?.id || parsed.draft === true) continue;
  checked += 1;

  const params = parsed.params;
  const library = params.library ?? {};
  for (const field of requiredParams) {
    if (params[field] === undefined || params[field] === null || params[field] === "") {
      errors.push(`${relativePath}: params.${field} is required for entity ${params.id}.`);
    }
  }
  for (const field of requiredLibraryFields) {
    if (!library[field]) {
      errors.push(`${relativePath}: params.library.${field} is required for entity ${params.id}.`);
    }
  }
  if (params.schema !== `${params.entity_kind}.v1`) {
    errors.push(`${relativePath}: schema must be ${params.entity_kind}.v1.`);
  }
  if (!entityKinds.has(params.entity_kind)) {
    errors.push(`${relativePath}: unregistered entity kind ${params.entity_kind}.`);
  }
  if (!canonStatuses.has(params.canon_status)) {
    errors.push(`${relativePath}: unregistered canon status ${params.canon_status}.`);
  }
  if (!accessLevels.has(library.access_level)) {
    errors.push(`${relativePath}: unregistered access level ${library.access_level}.`);
  }
  if (!reliabilityLevels.has(library.reliability)) {
    errors.push(`${relativePath}: unregistered reliability ${library.reliability}.`);
  }
  if (!params.names.official) {
    errors.push(`${relativePath}: params.names.official is required.`);
  }
  for (const field of ["cultures", "eras", "regions", "government_forms", "topics"]) {
    if (!Array.isArray(params.classifications?.[field])) {
      errors.push(`${relativePath}: params.classifications.${field} must be an array.`);
    }
  }
  if (!Array.isArray(params.relations)) {
    errors.push(`${relativePath}: params.relations must be an array.`);
  }
  for (const [field, legacy] of [
    ["cultures", parsed.cultures],
    ["eras", parsed.eras],
    ["topics", parsed.topics],
  ]) {
    if (JSON.stringify(asArray(legacy)) !== JSON.stringify(params.classifications?.[field] ?? [])) {
      errors.push(`${relativePath}: ${field} must match params.classifications.${field}.`);
    }
  }
}

console.log(`Content model validation: ${checked} entities checked.`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Content model validation passed.");
}