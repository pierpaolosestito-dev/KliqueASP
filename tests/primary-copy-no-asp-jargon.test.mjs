import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "svelte/compiler";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const jargon = /\b(?:clingo|solver|answer\s+set|why-not|witness|membership|near-match|walk|round)\b/i;

async function findSvelteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return findSvelteFiles(entryPath);
    return entry.name.endsWith(".svelte") ? [entryPath] : [];
  }));
  return nested.flat();
}

function collectPrimaryCopy(node, file, hits, inDetails = false) {
  if (!node || typeof node !== "object") return;
  const insideDetails = inDetails || (node.type === "Element" && node.name === "details");

  if (!insideDetails && node.type === "Text" && node.data?.trim() && jargon.test(node.data)) {
    hits.push(`${file}: ${node.data.trim().replace(/\s+/g, " ")}`);
  }

  if (!insideDetails && (node.type === "MustacheTag" || node.type === "ExpressionTag") && node.expression) {
    collectVisibleExpressionCopy(node.expression, file, hits);
    return;
  }

  if (node.type === "Attribute") {
    if (!insideDetails && ["aria-label", "title", "placeholder", "alt"].includes(node.name) && Array.isArray(node.value)) {
      const value = node.value.filter((part) => part.type === "Text").map((part) => part.data).join("").trim();
      if (value && jargon.test(value)) hits.push(`${file} [${node.name}]: ${value}`);
      for (const part of node.value) {
        if (part.type === "MustacheTag" && part.expression) collectVisibleExpressionCopy(part.expression, `${file} [${node.name}]`, hits);
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    if (["parent", "loc", "metadata"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) collectPrimaryCopy(child, file, hits, insideDetails);
    } else if (value && typeof value === "object") {
      collectPrimaryCopy(value, file, hits, insideDetails);
    }
  }
}

function collectVisibleExpressionCopy(node, file, hits) {
  if (!node || typeof node !== "object") return;
  const value = node.type === "Literal"
    ? node.value
    : node.type === "TemplateElement" ? node.value?.raw : undefined;
  if (typeof value === "string" && value.trim() && jargon.test(value)) {
    hits.push(`${file}: ${value.trim().replace(/\s+/g, " ")}`);
  }
  for (const [key, child] of Object.entries(node)) {
    if (["loc", "parent", "start", "end"].includes(key)) continue;
    if (Array.isArray(child)) {
      for (const entry of child) collectVisibleExpressionCopy(entry, file, hits);
    } else if (child && typeof child === "object") {
      collectVisibleExpressionCopy(child, file, hits);
    }
  }
}

test("primary interface copy uses graph terms and keeps ASP internals in technical disclosures", async () => {
  const hits = [];
  for (const file of await findSvelteFiles(sourceRoot)) {
    const source = await readFile(file, "utf8");
    const ast = parse(source);
    collectPrimaryCopy(ast.html, path.relative(sourceRoot, file), hits);
  }
  assert.deepEqual(hits, [], `termini tecnici nel testo primario:\n${hits.join("\n")}`);
});
