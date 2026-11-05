import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "svelte/compiler";

const iconCodePoints = new Set([0x00d7, 0x2715, 0x2716, 0x2717, 0x2713, 0x2714, 0x2190, 0x2192, 0x2212, 0x002b, 0x2026]);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(testDirectory, "../src");
const repositoryRoot = path.resolve(testDirectory, "..");

async function svelteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? svelteFiles(entryPath) : entry.name.endsWith(".svelte") ? [entryPath] : [];
  }));
  return nested.flat();
}

function inspectIconButtons(node, source, file, results) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Element" && node.name === "button") {
    const visibleText = (node.children ?? [])
      .map((child) => child.type === "Text" ? child.data : "")
      .join("")
      .trim();
    if ([...visibleText].length === 1 && iconCodePoints.has(visibleText.codePointAt(0))) {
      const attributes = new Set((node.attributes ?? []).map((attribute) => attribute.name));
      results.push({
        file,
        line: source.slice(0, node.start).split(/\r?\n/).length,
        accessibleName: attributes.has("aria-label") || attributes.has("aria-labelledby"),
        tooltip: attributes.has("title")
      });
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => inspectIconButtons(child, source, file, results));
    else if (value && typeof value === "object") inspectIconButtons(value, source, file, results);
  }
}

function markupChildren(node) {
  if (!node || typeof node !== "object") return [];
  const children = [...(node.children ?? []), ...(node.nodes ?? [])];
  for (const branch of [node.else, node.elseif, node.pending, node.then, node.catch]) {
    children.push(...(branch?.children ?? []));
  }
  return children;
}

function hasVisibleButtonText(nodes) {
  return (nodes ?? []).some((node) => {
    if (!node || typeof node !== "object") return false;
    if (node.type === "Text") return Boolean(node.data?.trim());
    if (["MustacheTag", "HtmlTag"].includes(node.type)) return true;
    if (node.type === "Element" && node.name === "svg") return false;
    return hasVisibleButtonText(markupChildren(node));
  });
}

function hasSvgIcon(nodes) {
  return (nodes ?? []).some((node) => {
    if (!node || typeof node !== "object") return false;
    if (node.type === "Element" && node.name === "svg") return true;
    return hasSvgIcon(markupChildren(node));
  });
}

function inspectSvgOnlyButtons(node, source, file, results) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Element" && node.name === "button") {
    const attributes = new Set((node.attributes ?? []).map((attribute) => attribute.name));
    if (
      hasSvgIcon(node.children)
      && !hasVisibleButtonText(node.children)
      && !attributes.has("aria-label")
      && !attributes.has("aria-labelledby")
      && !attributes.has("title")
    ) {
      results.push(`${file}:${source.slice(0, node.start).split(/\r?\n/).length}`);
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => inspectSvgOnlyButtons(child, source, file, results));
    else if (value && typeof value === "object") inspectSvgOnlyButtons(value, source, file, results);
  }
}

test("every icon-only text button has an accessible name and a discoverable tooltip", async () => {
  const components = await svelteFiles(sourceRoot);
  const icons = [];
  for (const file of components) {
    const source = await readFile(file, "utf8");
    inspectIconButtons(parse(source, { filename: file }).html, source, path.relative(repositoryRoot, file), icons);
  }

  assert.ok(icons.length >= 13, `expected the icon audit to find the current icon-only actions; found ${icons.length}`);
  assert.deepEqual(icons.filter((icon) => !icon.accessibleName || !icon.tooltip), [], "each icon-only action needs an accessible name and a title tooltip");
});

test("every SVG-only button has an accessible name", async () => {
  const components = await svelteFiles(sourceRoot);
  const unlabeled = [];
  for (const file of components) {
    const source = await readFile(file, "utf8");
    inspectSvgOnlyButtons(parse(source, { filename: file }).html, source, path.relative(repositoryRoot, file), unlabeled);
  }

  assert.deepEqual(unlabeled, [], "SVG-only actions need an aria-label, aria-labelledby, or title");
});

test("the SVG-only audit inspects conditional button content", () => {
  const source = "<button>{#if active}<svg></svg>{:else}<svg></svg>{/if}</button>";
  const issues = [];
  inspectSvgOnlyButtons(parse(source).html, source, "fixture.svelte", issues);
  assert.deepEqual(issues, ["fixture.svelte:1"]);
});
