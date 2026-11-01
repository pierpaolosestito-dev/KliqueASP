import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = new URL("../src/", import.meta.url);
const sourceRootPath = fileURLToPath(sourceRoot);
const sourceExtensions = new Set([".svelte", ".ts", ".js", ".mjs"]);
const mojibakePattern = /(?:Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â€|â†|â€“|â€”|â€¦)/u;

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSourceFiles(path));
    else if (sourceExtensions.has(path.slice(path.lastIndexOf(".")))) files.push(path);
  }
  return files;
}

test("application source contains no common UTF-8 mojibake sequences", async () => {
  const files = await collectSourceFiles(sourceRootPath);
  const affected = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    if (mojibakePattern.test(contents)) affected.push(relative(sourceRootPath, file));
  }
  assert.deepEqual(affected, [], `repair misdecoded text in: ${affected.join(", ")}`);
});
