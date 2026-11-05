import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
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

function walk(node, visit, seen = new WeakSet()) {
  if (!node || typeof node !== "object" || seen.has(node)) return;
  seen.add(node);
  visit(node);

  for (const [key, value] of Object.entries(node)) {
    if (["parent", "loc", "metadata"].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, seen);
    } else if (value && typeof value === "object") {
      walk(value, visit, seen);
    }
  }
}

function collectPossibleStringIds(expression, values = []) {
  if (!expression || typeof expression !== "object") return values;

  if (expression.type === "Literal") {
    if (typeof expression.value === "string") values.push(expression.value);
    return values;
  }

  if (expression.type === "ConditionalExpression") {
    collectPossibleStringIds(expression.consequent, values);
    collectPossibleStringIds(expression.alternate, values);
    return values;
  }

  if (expression.type === "LogicalExpression") {
    collectPossibleStringIds(expression.right, values);
    return values;
  }

  if (expression.type === "ArrayExpression") {
    for (const element of expression.elements) collectPossibleStringIds(element, values);
    return values;
  }

  if (expression.type === "SequenceExpression") {
    for (const item of expression.expressions) collectPossibleStringIds(item, values);
    return values;
  }

  if (expression.type === "TemplateLiteral" && expression.expressions.length === 0) {
    values.push(expression.quasis[0]?.value?.cooked ?? "");
    return values;
  }

  if (expression.type === "ParenthesizedExpression") {
    collectPossibleStringIds(expression.expression, values);
  }

  return values;
}

function collectIdReferences(markup) {
  const ids = new Set();
  const references = [];
  const disabledControls = [];
  const referenceAttributes = new Set([
    "aria-activedescendant",
    "aria-controls",
    "aria-describedby",
    "aria-details",
    "aria-errormessage",
    "aria-flowto",
    "aria-labelledby",
    "aria-owns",
    "for"
  ]);

  walk(markup, (node) => {
    if (node.type === "Element" && ["button", "fieldset", "input", "select", "textarea"].includes(node.name)) {
      const attributes = new Set((node.attributes ?? [])
        .filter((attribute) => attribute.type === "Attribute")
        .map((attribute) => attribute.name));
      if (attributes.has("disabled")) {
        disabledControls.push({
          tag: node.name,
          hasDescription: attributes.has("aria-describedby"),
          hasBoundaryLabel: attributes.has("aria-label")
        });
      }
    }

    if (node.type !== "Attribute" || !Array.isArray(node.value)) return;

    if (node.name === "id") {
      const id = node.value
        .filter((part) => part.type === "Text")
        .map((part) => part.data)
        .join("")
        .trim();
      if (id) ids.add(id);
      return;
    }

    if (!referenceAttributes.has(node.name)) return;
    const values = [];
    for (const part of node.value) {
      if (part.type === "Text") values.push(part.data);
      else if (part.type === "MustacheTag") collectPossibleStringIds(part.expression, values);
    }

    for (const value of values) {
      for (const id of value.trim().split(/\s+/).filter(Boolean)) references.push(id);
    }
  });

  return { ids, references, disabledControls };
}

test("the ARIA reference audit ignores condition values and detects broken targets", () => {
  const { ids, references } = collectIdReferences(parse(
    '<section><p id="ready"></p><button aria-describedby={state === "busy" ? "ready" : undefined} aria-controls="missing"></button></section>'
  ).html);

  assert.deepEqual([...ids], ["ready"]);
  assert.deepEqual(references, ["ready", "missing"]);
  assert.deepEqual(references.filter((id) => !ids.has(id)), ["missing"]);
});

test("literal ARIA and label references resolve within their component or the shared graph container", async () => {
  const files = await findSvelteFiles(sourceRoot);
  const idsByFile = new Map();
  const references = [];
  const disabledControls = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relativeFile = path.relative(sourceRoot, file);
    const found = collectIdReferences(parse(source).html);
    idsByFile.set(relativeFile, found.ids);
    for (const id of found.references) references.push({ file: relativeFile, id });
    for (const control of found.disabledControls) disabledControls.push({ ...control, file: relativeFile });
  }

  const graphAppPath = path.join("lib", "kliqueasp", "GraphApp.svelte");
  const graphAppIds = idsByFile.get(graphAppPath) ?? new Set();
  const missing = references.filter(({ file, id }) => !idsByFile.get(file)?.has(id) && !graphAppIds.has(id));
  assert.deepEqual(missing, [], `riferimenti ID senza destinazione:\n${missing.map(({ file, id }) => `${file} → ${id}`).join("\n")}`);

  const unexplained = disabledControls.filter(({ hasDescription, hasBoundaryLabel }) => !hasDescription && !hasBoundaryLabel);
  assert.deepEqual(unexplained, [], `controlli disabilitati senza motivo o limite accessibile:\n${unexplained.map(({ file, tag }) => `${file} <${tag}>`).join("\n")}`);
});
