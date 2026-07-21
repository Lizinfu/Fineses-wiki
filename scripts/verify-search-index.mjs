import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import process from "node:process";

const requiredFiles = [
  "public/pagefind/pagefind.js",
  "public/pagefind/pagefind-entry.json",
];

let failed = false;

for (const file of requiredFiles) {
  try {
    await access(file, constants.R_OK);
    const information = await stat(file);

    if (!information.isFile() || information.size === 0) {
      throw new Error("file is empty or not a regular file");
    }

    console.log(`✓ ${file} (${information.size} bytes)`);
  } catch (error) {
    failed = true;
    console.error(`✗ ${file}: ${error.message}`);
  }
}

if (failed) {
  console.error(
    "\nSearch index verification failed. Run Hugo and Pagefind before deployment.",
  );
  process.exit(1);
}

console.log("\nPagefind search bundle is present.");
