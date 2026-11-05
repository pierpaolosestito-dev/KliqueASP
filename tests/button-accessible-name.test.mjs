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
    return entry.isDirectory()
      ? svelteFiles(entryPath)
      : entry.name.endsWith(".svelte")
        ? [entryPath]
        : [];
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

function hasVisibleText(nodes) {
  return (nodes ?? []).some((node) => {
    if (!node || typeof node !== "object") return false;
    if (node.type === "Text") return Boolean(node.data?.trim());
    if (["MustacheTag", "HtmlTag"].includes(node.type)) return true;
    if (node.type === "Element" && node.name === "svg") return false;
    return hasVisibleText(markupChildren(node));
  });
}

function hasExplicitName(node) {
  return (node.attributes ?? []).some((attribute) => {
    if (attribute.type !== "Attribute" || !["aria-label", "aria-labelledby", "title"].includes(attribute.name)) {
      return false;
    }
    return (attribute.value ?? []).some((part) =>
      part.type === "MustacheTag" || (part.type === "Text" && Boolean(part.data?.trim()))
    );
  });
}

function inspectInteractiveNames(node, source, file, issues, counts) {
  if (!node || typeof node !== "object") return;
  if (node.type === "Element" && (node.name === "button" || node.name === "a")) {
    const elementName = node.name === "button" ? "buttons" : "links";
    counts[elementName] += 1;
    if (!hasExplicitName(node) && !hasVisibleText(node.children)) {
      issues.push(`${file}:${source.slice(0, node.start).split(/\r?\n/).length} <${node.name}>`);
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => inspectInteractiveNames(child, source, file, issues, counts));
    else if (value && typeof value === "object") inspectInteractiveNames(value, source, file, issues, counts);
  }
}

test("every Svelte button and link exposes text or an explicit accessible name", async () => {
  const components = await svelteFiles(sourceRoot);
  const issues = [];
  const counts = { buttons: 0, links: 0 };
  for (const file of components) {
    const source = await readFile(file, "utf8");
    inspectInteractiveNames(parse(source, { filename: file }).html, source, path.relative(repositoryRoot, file), issues, counts);
  }

  assert.ok(components.length >= 30, `expected a repository-wide scan; found ${components.length} Svelte components`);
  assert.ok(counts.buttons >= 200, `expected the scan to include the app controls; found ${counts.buttons} buttons`);
  assert.ok(counts.links >= 5, `expected a repository-wide link scan; found ${counts.links} links`);
  assert.deepEqual(issues, [], "buttons and links without text need aria-label, aria-labelledby, or title");
});

test("the interactive-name audit catches empty controls and accepts named icon controls", () => {
  const source = [
    "<button><svg aria-hidden=\"true\"></svg></button>",
    "<button aria-label=\"\"><svg aria-hidden=\"true\"></svg></button>",
    "<button aria-label=\"Chiudi\"><svg aria-hidden=\"true\"></svg></button>",
    "<button><span>Apri</span></button>",
    "<a href=\"/\"><svg aria-hidden=\"true\"></svg></a>",
    "<a href=\"/\" aria-label=\"  \"><svg aria-hidden=\"true\"></svg></a>",
    "<a href=\"/\" aria-label=\"Apri home\"><svg aria-hidden=\"true\"></svg></a>",
    "<a href=\"/\"><span>Apri la home</span></a>",
    "<a href=\"/\" aria-label={linkName}><svg aria-hidden=\"true\"></svg></a>"
  ].join("\n");
  const issues = [];
  inspectInteractiveNames(parse(source).html, source, "fixture.svelte", issues, { buttons: 0, links: 0 });
  assert.deepEqual(issues, [
    "fixture.svelte:1 <button>",
    "fixture.svelte:2 <button>",
    "fixture.svelte:5 <a>",
    "fixture.svelte:6 <a>"
  ]);
});
