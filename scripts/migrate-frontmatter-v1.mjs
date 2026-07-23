import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { walkMarkdown } from "./lib/files.mjs";

const writeChanges = process.argv.includes("--write");
const projectRoot = process.cwd();
const schemaByKind = {
  artifact: "artifact.v1",
  concept: "concept.v1",
  event: "event.v1",
  nation: "nation.v1",
  organization: "organization.v1",
  person: "person.v1",
  region: "region.v1",
  species: "species.v1",
  subpage: "subpage.v1",
};

// These are the only relations established explicitly in the current prose.
const relationsById = {
  "per.luo-yan": [{ type: "participated_in", target: "evt.white-tide-0312" }],
  "reg.esa.sdv": [{ type: "part_of", target: "nat.esa" }],
};

function frontMatterRange(source) {
  return source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
}

function asArray(value) {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

async function writeAtomic(filePath, content) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, filePath);
}

let migrated = 0;

for (const filePath of await walkMarkdown(path.join(projectRoot, "content"))) {
  const source = await readFile(filePath, "utf8");
  const range = frontMatterRange(source);
  if (!range) continue;

  const frontMatter = parseYaml(range[1]) ?? {};
  const params = frontMatter.params ?? {};
  const entityId = String(params.id ?? "").trim();
  if (!entityId) continue;

  const entityKind = String(params.entity_kind ?? "").trim();
  const classifications = params.classifications ?? {};
  const relations = relationsById[entityId] ?? params.relations ?? [];
  const hasRelationship =
    relations.length > 0 || Object.values(relationsById).some((entries) =>
      entries.some((entry) => entry.target === entityId),
    );

  params.schema = params.schema ?? schemaByKind[entityKind] ?? "entity.v1";
  params.entity_kind = entityKind;
  params.canon_status = params.canon_status ?? "canon";
  params.names = {
    official: frontMatter.title ?? "",
    short: "",
    native: [],
    former: [],
    aliases: [...asArray(frontMatter.keywords)],
    ...params.names,
  };
  params.classifications = {
    cultures: [...asArray(frontMatter.cultures)],
    eras: [...asArray(frontMatter.eras)],
    regions: [],
    government_forms: [],
    topics: [...asArray(frontMatter.topics)],
    ...classifications,
  };
  params.relations = relations;

  if (hasRelationship) {
    delete params.allow_orphan;
  } else {
    params.allow_orphan = true;
  }

  frontMatter.params = params;
  const normalized = stringifyYaml(frontMatter, {
    indent: 2,
    lineWidth: 0,
    aliasDuplicateObjects: false,
  });
  const output = `---\n${normalized}---\n${source.slice(range[0].length)}`;

  if (output === source) continue;
  migrated += 1;
  const relativePath = path.relative(projectRoot, filePath);
  console.log(`${writeChanges ? "Migrated" : "Would migrate"}: ${relativePath}`);

  if (writeChanges) await writeAtomic(filePath, output);
}

console.log(`\n${writeChanges ? "Migrated" : "Would migrate"} ${migrated} entity files.`);
if (!writeChanges) console.log("Run with --write to apply the migration.");