import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const publicDirectory = path.join(projectRoot, "public");
const ignoredSchemes = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i;

async function walkHtml(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkHtml(absolute)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(absolute);
  }
  return files;
}

function routeFor(filePath) {
  const relative = path.relative(publicDirectory, filePath).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html")) return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
}

function outputPathFor(urlPath) {
  const pathname = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (!pathname) return path.join(publicDirectory, "index.html");
  if (pathname.endsWith("/")) return path.join(publicDirectory, pathname, "index.html");
  return path.join(publicDirectory, pathname);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

let htmlFiles;
try {
  htmlFiles = await walkHtml(publicDirectory);
} catch (error) {
  console.error("ERROR: public/ does not exist. Run Hugo before quality:site.");
  process.exitCode = 1;
  process.exit();
}

const errors = [];
const warnings = [];
for (const filePath of htmlFiles) {
  const relative = path.relative(projectRoot, filePath).split(path.sep).join("/");
  const source = await readFile(filePath, "utf8");

  if (!/<title>\s*\S[\s\S]*?<\/title>/i.test(source)) {
    errors.push(`${relative}: missing non-empty <title>.`);
  }

  for (const image of source.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\balt=["'][^"']*["']/i.test(image[0])) {
      warnings.push(`${relative}: an <img> has no alt attribute.`);
    }
  }

  const currentRoute = routeFor(filePath);
  for (const match of source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) {
    const raw = match[1].trim();
    if (!raw || raw.includes("livereload.js") || ignoredSchemes.test(raw)) continue;

    let resolved;
    try {
      resolved = new URL(raw, `https://wiki.invalid${currentRoute}`);
    } catch {
      errors.push(`${relative}: malformed local reference "${raw}".`);
      continue;
    }
    if (resolved.origin !== "https://wiki.invalid") continue;

    // GitHub project pages are built below /Fineses-wiki/ in production.
    const pathname = resolved.pathname.replace(/^\/Fineses-wiki(?=\/|$)/, "");
    if (!(await exists(outputPathFor(pathname)))) {
      errors.push(`${relative}: local reference "${raw}" has no generated target.`);
    }
  }
}

console.log("Rendered site checks");
console.log("--------------------");
console.log(`HTML files: ${htmlFiles.length}`);
console.log(`Warnings:   ${warnings.length}`);
console.log(`Errors:     ${errors.length}`);
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);
if (errors.length > 0) process.exitCode = 1;