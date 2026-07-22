import { readFile } from "node:fs/promises";
import process from "node:process";

const reportPath =
  process.argv[2] ?? "data/generated/relation-report.json";

try {
  const source = await readFile(reportPath, "utf8");
  const report = JSON.parse(source);
  const totals = report.totals ?? {};

  console.log("Content relationship report");
  console.log("===========================");
  console.log(`Entities:  ${totals.entities ?? 0}`);
  console.log(`Relations: ${totals.relations ?? 0}`);
  console.log(`Backlinks: ${totals.backlinks ?? 0}`);
  console.log(`Orphans:   ${totals.orphans ?? 0}`);
  console.log(`Warnings:  ${totals.warnings ?? 0}`);
  console.log(`Errors:    ${totals.errors ?? 0}`);

  for (const section of ["warnings", "errors"]) {
    const entries = report[section] ?? [];
    if (entries.length === 0) continue;

    console.log(`\n${section.toUpperCase()}`);
    console.log("-".repeat(section.length));

    for (const entry of entries) {
      console.log(
        `[${entry.code}] ${entry.file ?? ""}: ${entry.message}`,
      );
    }
  }
} catch (error) {
  console.error(`Unable to read ${reportPath}: ${error.message}`);
  process.exitCode = 1;
}
