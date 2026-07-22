import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildContentGraph } from "./lib/content-graph.mjs";
import { buildTimeline } from "./lib/timeline.mjs";

const argumentsSet = new Set(process.argv.slice(2));
const checkOnly = argumentsSet.has("--check");
const strict = checkOnly || argumentsSet.has("--strict");
const includeDrafts = argumentsSet.has("--include-drafts");
const projectRoot = process.cwd();

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });

  const temporary = `${filePath}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  await rename(temporary, filePath);
}

function formatDiagnostic(diagnostic) {
  const location = diagnostic.file ? `${diagnostic.file}: ` : "";
  const context = [
    diagnostic.entity_id && `entity=${diagnostic.entity_id}`,
    diagnostic.value !== undefined &&
      diagnostic.value !== "" &&
      `value=${diagnostic.value}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    `${diagnostic.severity.toUpperCase()} ` +
    `[${diagnostic.code}] ${location}${diagnostic.message}` +
    (context ? ` (${context})` : "")
  );
}

function printSummary(result) {
  const { totals } = result.report;

  console.log("\nTimeline summary");
  console.log("----------------");
  console.log(`Entries:  ${totals.entries}`);
  console.log(`Dated:    ${totals.dated}`);
  console.log(`Undated:  ${totals.undated}`);
  console.log(`Warnings: ${totals.warnings}`);
  console.log(`Errors:   ${totals.errors}`);

  for (const item of result.report.warnings) {
    console.warn(formatDiagnostic(item));
  }

  for (const item of result.report.errors) {
    console.error(formatDiagnostic(item));
  }
}

try {
  const graph = await buildContentGraph({
    projectRoot,
    includeDrafts,
  });
  const result = await buildTimeline({
    projectRoot,
    knownIds: Object.keys(graph.idIndex),
    includeDrafts,
  });

  printSummary(result);

  if (!checkOnly) {
    const outputDirectory = path.join(
      projectRoot,
      "data",
      "generated",
    );

    await Promise.all([
      writeJsonAtomic(
        path.join(outputDirectory, "timeline.json"),
        result.timeline,
      ),
      writeJsonAtomic(
        path.join(outputDirectory, "timeline-report.json"),
        result.report,
      ),
    ]);

    console.log("\nGenerated timeline data.");
  }

  if (strict && result.report.errors.length > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("\nUnable to build timeline.");
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
