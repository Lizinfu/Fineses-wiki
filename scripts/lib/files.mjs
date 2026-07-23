import { readdir } from "node:fs/promises";
import path from "node:path";

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export async function walkMarkdown(directory) {
  const files = [];

  async function visit(currentDirectory) {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const absolutePath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (
        entry.isFile() &&
        MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
      ) {
        files.push(absolutePath);
      }
    }
  }

  await visit(directory);
  return files;
}