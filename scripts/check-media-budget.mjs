import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const roots = ["content", "static"];
const mediaExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const maxFileBytes = 5 * 1024 * 1024;
const maxTotalBytes = 300 * 1024 * 1024;

async function walk(directory) {
  const files = [];
  let entries = [];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return files;
    throw error;
  }

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

const mediaFiles = (
  await Promise.all(roots.map((root) => walk(path.join(projectRoot, root))))
)
  .flat()
  .filter((filePath) => mediaExtensions.has(path.extname(filePath).toLowerCase()));

const records = await Promise.all(
  mediaFiles.map(async (filePath) => ({
    filePath,
    size: (await stat(filePath)).size,
  })),
);
const totalBytes = records.reduce((total, record) => total + record.size, 0);
const errors = [];
const warnings = [];

for (const record of records) {
  const relative = path.relative(projectRoot, record.filePath);
  if (record.size > maxFileBytes) {
    errors.push(
      `${relative} is ${formatBytes(record.size)}; the per-file limit is ${formatBytes(maxFileBytes)}.`,
    );
  } else if (record.size === 0) {
    warnings.push(`${relative} is empty and should be replaced or removed.`);
  }
}

if (totalBytes > maxTotalBytes) {
  errors.push(
    `Media total is ${formatBytes(totalBytes)}; the repository media budget is ${formatBytes(maxTotalBytes)}.`,
  );
}

console.log("Media budget");
console.log("------------");
console.log(`Files:    ${records.length}`);
console.log(`Total:    ${formatBytes(totalBytes)}`);
console.log(`Limit:    ${formatBytes(maxTotalBytes)}`);
console.log(`Warnings: ${warnings.length}`);
console.log(`Errors:   ${errors.length}`);

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length > 0) process.exitCode = 1;