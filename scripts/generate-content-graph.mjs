import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildContentGraph } from "./lib/content-graph.mjs";

const argumentsSet = new Set(process.argv.slice(2));
const checkOnly = argumentsSet.has("--check");
const strict = checkOnly || argumentsSet.has("--strict");
const projectRoot = process.cwd();

function formatDiagnostic(diagnostic) {
  const location = diagnostic.file ? `${diagnostic.file}: ` : "";
  const context = [
    diagnostic.entity_id && `entity=${diagnostic.entity_id}`,
    diagnostic.relation_type &&
      `relation=${diagnostic.relation_type}`,
    diagnostic.target && `target=${diagnostic.target}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    `${diagnostic.severity.toUpperCase()} ` +
    `[${diagnostic.code}] ${location}${diagnostic.message}` +
    (context ? ` (${context})` : "")
  );
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });

  const temporary = `${filePath}.tmp`;
  const serialized = `${JSON.stringify(value, null, 2)}\n`;

  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, filePath);
}

function printSummary(graph) {
  const { totals } = graph.report;

  console.log("\nContent graph summary");
  console.log("---------------------");
  console.log(`Entities:  ${totals.entities}`);
  console.log(`Relations: ${totals.relations}`);
  console.log(`Backlinks: ${totals.backlinks}`);
  console.log(`Orphans:   ${totals.orphans}`);
  console.log(`Warnings:  ${totals.warnings}`);
  console.log(`Errors:    ${totals.errors}`);

  if (graph.report.warnings.length > 0) {
    console.log("\nWarnings");
    console.log("--------");
    graph.report.warnings.forEach((item) => {
      console.warn(formatDiagnostic(item));
    });
  }

  if (graph.report.errors.length > 0) {
    console.log("\nErrors");
    console.log("------");
    graph.report.errors.forEach((item) => {
      console.error(formatDiagnostic(item));
    });
  }
}

try {
  const graph = await buildContentGraph({ projectRoot });
  printSummary(graph);

  if (!checkOnly) {
    const outputDirectory = path.join(
      projectRoot,
      "data",
      "generated",
    );

    await Promise.all([
      writeJsonAtomic(
        path.join(outputDirectory, "id-index.json"),
        graph.idIndex,
      ),
      writeJsonAtomic(
        path.join(outputDirectory, "backlinks.json"),
        graph.backlinks,
      ),
      writeJsonAtomic(
        path.join(outputDirectory, "entity-counts.json"),
        graph.entityCounts,
      ),
      writeJsonAtomic(
        path.join(outputDirectory, "relation-report.json"),
        graph.report,
      ),
    ]);

    console.log("\nGenerated data/generated/*.json");
  }

  if (strict && graph.report.errors.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("\nUnable to build content graph.");
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
