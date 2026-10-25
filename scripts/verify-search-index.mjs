import { access, readFile } from "node:fs/promises";
import path from "node:path";

const indexPath = path.join("public", "search-index.json");
let index;
try {
  index = JSON.parse(await readFile(indexPath, "utf8"));
} catch (error) {
  console.error(`ERROR: cannot read ${indexPath}: ${error.message}`);
  process.exit(1);
}

const errors = [];
if (index.version !== 1 || !Array.isArray(index.documents)) {
  errors.push("Search index must contain version 1 and a documents array.");
}

const seen = new Set();
const basePath = index.base_path ?? "/";
for (const [position, document] of (index.documents ?? []).entries()) {
  const label = `Document ${position + 1}`;
  if (typeof document.url !== "string" || !document.url.startsWith("/")) {
    errors.push(`${label}: invalid URL.`);
    continue;
  }
  if (seen.has(document.url)) errors.push(`${label}: duplicate URL ${document.url}.`);
  seen.add(document.url);
  if (!document.title || !document.body?.trim()) {
    errors.push(`${label}: missing title or body (${document.url}).`);
  }
  if (document.url.startsWith("/search/")) {
    errors.push(`${label}: search interface must not index itself.`);
  }
  if (!document.url.startsWith(basePath)) {
    errors.push(`${label}: URL is outside site base path (${document.url}).`);
    continue;
  }
  const siteRelative = decodeURIComponent(document.url.slice(basePath.length)).replace(/\/$/, "");
  const output = path.join("public", siteRelative, "index.html");
  try {
    await access(output);
  } catch {
    errors.push(`${label}: missing rendered page ${output}.`);
  }
}

if (seen.size === 0) errors.push("Search index has no documents.");
console.log(`Body search index: ${seen.size} documents, ${errors.length} errors.`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length) process.exitCode = 1;
