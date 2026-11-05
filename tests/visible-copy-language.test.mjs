import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "svelte/compiler";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

async function findSvelteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findSvelteFiles(entryPath);
    return entry.name.endsWith(".svelte") ? [entryPath] : [];
  }));
  return nested.flat();
}

function collectVisibleCopy(node, file, hits, inDetails = false) {
  if (!node || typeof node !== "object") return;
  const insideDetails = inDetails || (node.type === "Element" && node.name === "details");

  const untranslatedUiTerms = /\b(?:mapping|pattern|core\s+number|export|upload|download|search|loading|retry|cancel|settings|source|target|reset|clear|close|previous|next|success|failure|input|output)\b/i;

  if (node.type === "Text" && node.data?.trim() && untranslatedUiTerms.test(node.data)) {
    hits.push(`${file}: ${node.data.trim().replace(/\s+/g, " ")}`);
  }

  if (node.type === "Attribute") {
    if (["aria-label", "aria-description", "aria-roledescription", "aria-valuetext", "aria-placeholder", "title", "placeholder", "alt", "data-tooltip"].includes(node.name) && Array.isArray(node.value)) {
      const value = node.value.filter((part) => part.type === "Text").map((part) => part.data).join("").trim();
      if (value && untranslatedUiTerms.test(value)) hits.push(`${file} [${node.name}]: ${value}`);
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (["parent", "loc", "metadata"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) collectVisibleCopy(child, file, hits, insideDetails);
    } else if (value && typeof value === "object") {
      collectVisibleCopy(value, file, hits, insideDetails);
    }
  }
}

function collectDynamicCopy(node, source, file, hits) {
  if (!node || typeof node !== "object") return;
  const value = node.type === "Literal"
    ? node.value
    : node.type === "TemplateElement" ? node.value?.raw : undefined;
  if (typeof value === "string" && (value === "unknown" || /\b(?:must-link|cannot-link)\b/i.test(value))) {
    const line = source.slice(0, node.start).split("\n").length;
    hits.push(`${file}:${line}: ${value.trim().replace(/\s+/g, " ")}`);
  }

  for (const [key, child] of Object.entries(node)) {
    if (["loc", "parent"].includes(key)) continue;
    if (Array.isArray(child)) {
      for (const entry of child) collectDynamicCopy(entry, source, file, hits);
    } else if (child && typeof child === "object") {
      collectDynamicCopy(child, source, file, hits);
    }
  }
}

test("static interface text and accessible labels avoid untranslated analysis jargon", async () => {
  const files = await findSvelteFiles(sourceRoot);
  const hits = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relativeFile = path.relative(sourceRoot, file);
    const ast = parse(source);
    collectVisibleCopy(ast.html, relativeFile, hits);
    for (const script of [ast.instance?.content, ast.module?.content]) {
      if (script) collectDynamicCopy(script, source, relativeFile, hits);
    }
  }

  assert.deepEqual(hits, [], `testi visibili non localizzati:\n${hits.join("\n")}`);
});
