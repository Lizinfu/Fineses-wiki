import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { buildContentGraph } from "./lib/content-graph.mjs";
import { buildTimeline } from "./lib/timeline.mjs";

const argumentsSet = new Set(process.argv.slice(2));
const checkOnly = argumentsSet.has("--check");
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

function printDiagnostics(title, report) {
  const totals = report.totals ?? {};

  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
  console.log(`Errors:   ${totals.errors ?? 0}`);
  console.log(`Warnings: ${totals.warnings ?? 0}`);

  for (const warning of report.warnings ?? []) {
    console.warn(
      `WARNING [${warning.code}] ${warning.file ?? ""}: ` +
        warning.message,
    );
  }

  for (const error of report.errors ?? []) {
    console.error(
      `ERROR [${error.code}] ${error.file ?? ""}: ` +
        error.message,
    );
  }
}

try {
  const graph = await buildContentGraph({
    projectRoot,
    includeDrafts,
  });
  const timelineResult = await buildTimeline({
    projectRoot,
    knownIds: Object.keys(graph.idIndex),
    includeDrafts,
  });

  printDiagnostics("Content graph", graph.report);
  printDiagnostics("Timeline", timelineResult.report);

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
      writeJsonAtomic(
        path.join(outputDirectory, "timeline.json"),
        timelineResult.timeline,
      ),
      writeJsonAtomic(
        path.join(outputDirectory, "timeline-report.json"),
        timelineResult.report,
      ),
    ]);

    console.log("\nAll generated Wiki data is up to date.");
  }

  const errorCount =
    (graph.report.totals.errors ?? 0) +
    (timelineResult.report.totals.errors ?? 0);

  if (checkOnly && errorCount > 0) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error("\nUnable to prepare Wiki data.");
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}
