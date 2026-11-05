import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "svelte/compiler";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(testDirectory, "../src");
const repositoryRoot = path.resolve(testDirectory, "..");

async function svelteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return svelteFiles(entryPath);
    return entry.name.endsWith(".svelte") ? [entryPath] : [];
  }));
  return nested.flat();
}

function markupChildren(node) {
  if (!node || typeof node !== "object") return [];
  const children = [...(node.children ?? []), ...(node.nodes ?? [])];
  for (const branch of [node.else, node.elseif, node.pending, node.then, node.catch]) {
    children.push(...(branch?.children ?? []));
  }
  return children;
}

function attribute(node, name) {
  return (node.attributes ?? []).find((item) => item.type === "Attribute" && item.name === name);
}

function attributeValue(node, name, source) {
  const item = attribute(node, name);
  return (item?.value ?? []).map((part) => {
    if (part.type === "Text") return part.data;
    if (part.type === "MustacheTag") return `{${source.slice(part.expression.start, part.expression.end)}}`;
    return "";
  }).join("").trim();
}

function hasLabelText(nodes) {
  return (nodes ?? []).some((node) => {
    if (!node || typeof node !== "object") return false;
    if (node.type === "Text") return Boolean(node.data?.trim());
    if (["MustacheTag", "HtmlTag"].includes(node.type)) return true;
    if (node.type === "Element" && node.name === "svg") return false;
    return hasLabelText(markupChildren(node));
  });
}

function hasExplicitName(node, source, type) {
  const namedAttributes = ["aria-label", "aria-labelledby", "title"];
  if (type === "image") namedAttributes.push("alt");
  if (["button", "submit", "reset"].includes(type) && attributeValue(node, "value", source)) return true;
  return namedAttributes.some((name) => Boolean(attributeValue(node, name, source)));
}

function collectLabelTargets(node, source, targets) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Element" && node.name === "label" && hasLabelText(node.children)) {
    const target = attributeValue(node, "for", source);
    if (target) targets.add(target);
  }
  for (const child of markupChildren(node)) collectLabelTargets(child, source, targets);
}

function inspectControls(node, source, file, labelTargets, nestedLabel = false, issues = []) {
  if (!node || typeof node !== "object") return issues;
  if (node.type === "Element") {
    const type = attributeValue(node, "type", source).toLowerCase();
    if (["input", "select", "textarea"].includes(node.name) && !(node.name === "input" && type === "hidden")) {
      const id = attributeValue(node, "id", source);
      const labelledByElement = nestedLabel || labelTargets.has(id);
      if (!labelledByElement && !hasExplicitName(node, source, type)) {
        const line = source.slice(0, node.start).split(/\r?\n/).length;
        issues.push(`${file}:${line} <${node.name}${type ? ` type="${type}"` : ""}> senza nome accessibile`);
      }
    }

    const hasNamedWrappingLabel = nestedLabel || (node.name === "label" && hasLabelText(node.children));
    for (const child of node.children ?? []) {
      inspectControls(child, source, file, labelTargets, hasNamedWrappingLabel, issues);
    }
    return issues;
  }

  for (const child of markupChildren(node)) {
    inspectControls(child, source, file, labelTargets, nestedLabel, issues);
  }
  return issues;
}

function findUnnamedControls(source, filename) {
  const tree = parse(source, { filename }).html;
  const labelTargets = new Set();
  collectLabelTargets(tree, source, labelTargets);
  return inspectControls(tree, source, filename, labelTargets);
}

test("all Svelte input, select, and textarea controls have an accessible name", async () => {
  const components = await svelteFiles(sourceRoot);
  const unnamed = [];

  for (const file of components) {
    const source = await readFile(file, "utf8");
    unnamed.push(...findUnnamedControls(source, path.relative(repositoryRoot, file)));
  }

  assert.deepEqual(unnamed, [], `controlli senza nome accessibile:\n${unnamed.join("\n")}`);
});

test("form-control audit recognizes a dynamic label-for and input-id association", () => {
  const source = '<label for={controlId}>Cerca per nodo</label><input id={controlId} type="search" placeholder="Cerca…">';
  assert.deepEqual(findUnnamedControls(source, "fixture.svelte"), []);
});

test("form-control audit rejects a placeholder-only label", () => {
  const source = '<input type="search" placeholder="Cerca nodo…">';
  assert.deepEqual(findUnnamedControls(source, "fixture.svelte"), [
    'fixture.svelte:1 <input type="search"> senza nome accessibile'
  ]);
});
