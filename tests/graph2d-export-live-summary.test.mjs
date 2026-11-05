import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url),
  "utf8"
);

test("2D export announces only the changing count and completion status", () => {
  const summary = component.match(/<div class="count-summary">([\s\S]*?)\n\s*<\/div>/)?.[1];
  assert.ok(summary, "riepilogo della preview 2D non trovato");
  assert.match(component, /<div class="count-summary">/);
  assert.doesNotMatch(component, /<div class="count-summary" role="status"/);
  assert.match(summary, /<strong role="status" aria-live="polite" aria-atomic="true">\{sceneCountSummary\}<\/strong>/);
  assert.match(summary, /Dimensione finale SVG\/PNG: \{svgOutputSizeLabel\}/);
  assert.doesNotMatch(summary, /\{#if completionLabel\}/);
  assert.match(summary, /class:has-content=\{Boolean\(completionLabel\.trim\(\)\)\}/);
  assert.match(summary, /role="status"\s+aria-live="polite"\s+aria-atomic="true"/);
  assert.match(summary, /Le frecce indicano la direzione\./);
  assert.match(summary, /Le linee tratteggiate sono proposte ipotetiche/);
  assert.match(summary, /Le linee puntinate rosse indicano coppie non adiacenti nella proiezione corrente, non archi osservati o proposti/);
  assert.match(summary, /describeNonAdjacencyScope\(\)/);
});
