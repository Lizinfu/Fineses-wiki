import { readFile } from "node:fs/promises";
import process from "node:process";

const reportPath =
  process.argv[2] ?? "data/generated/timeline-report.json";

try {
  const source = await readFile(reportPath, "utf8");
  const report = JSON.parse(source);
  const totals = report.totals ?? {};

  console.log("Timeline report");
  console.log("===============");
  console.log(`Entries:  ${totals.entries ?? 0}`);
  console.log(`Dated:    ${totals.dated ?? 0}`);
  console.log(`Undated:  ${totals.undated ?? 0}`);
  console.log(`Warnings: ${totals.warnings ?? 0}`);
  console.log(`Errors:   ${totals.errors ?? 0}`);

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
