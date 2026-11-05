import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const sourceRoot = path.resolve("src");
const sourceFiles = [];
const graphConfigFiles = [
  path.resolve("src/lib/kliqueasp/config/graph.config.json"),
  path.resolve("static/assets/PsychologyHistoryGraph/results/jsons/graph.config.json")
];

async function collectSourceFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(entryPath);
    else if (/\.(?:svelte|css|html)$/.test(entry.name)) sourceFiles.push(entryPath);
  }
}

await collectSourceFiles(sourceRoot);
sourceFiles.push(path.resolve("src/lib/kliqueasp/graph/graph2dExport.ts"));

test("application pages, graph configuration, and exports use the familiar local Arial stack", async () => {
  const source = (await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /font(?:-family)?\s*(?:=|:)\s*[^;\n]*(?:system-ui|Segoe UI|Inter|Roboto|Poppins|Montserrat|Outfit)/i);
  assert.doesNotMatch(source, /fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\(/i);
  assert.match(source, /font-family:\s*var\(--body-font, Arial, Helvetica, sans-serif\)/);
  assert.match(source, /font-family="Arial, Helvetica, sans-serif"/);

  for (const configFile of graphConfigFiles) {
    const config = JSON.parse(await readFile(configFile, "utf8"));
    assert.equal(config.ui?.body?.fontFamily, "Arial, Helvetica, sans-serif", configFile);
    assert.equal(config.node?.label?.font, "26px Arial, Helvetica, sans-serif", configFile);
  }
});
