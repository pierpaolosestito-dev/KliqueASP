import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");

test("the 2D export guard accounts for both rendered nodes and edge records", () => {
  assert.match(panel, /MAX_PREVIEW_NODES = 5000/);
  assert.match(panel, /MAX_PREVIEW_EDGES = 20000/);
  assert.match(panel, /estimateGraph2DSceneSize\(nodes, links, \{ mode, highlightedNodeIds, highlightedEdgeIds \}\)/);
  assert.match(panel, /exportEstimate\.nodeCount > MAX_PREVIEW_NODES \|\| exportEstimate\.edgeCount > MAX_PREVIEW_EDGES/);
  assert.match(panel, /non vengono rimossi elementi in automatico/);
  assert.match(panel, /seleziona Solo risultato selezionato/);
});

test("induced graph edges are visibly identified as context rather than analysis evidence", () => {
  assert.match(panel, /scene\.links\.some\(\(link\) => link\.contextOnly\)/);
  assert.match(panel, /Linee puntinate: relazioni osservate fra i nodi del risultato, non parte dell'evidenza restituita dall'analisi/);
});

test("oversized 2D export actions reference the visible size limit and next step", () => {
  assert.match(panel, /id="graph2d-export-size-blocker" class="warning" role="status" aria-live="polite"/);
  assert.match(panel, /exportBlockerDescriptionIds = \[[\s\S]*?exportTooLarge \? "graph2d-export-size-blocker"/);
  assert.equal((panel.match(/aria-describedby=\{exportBlockerDescriptionIds\}/g) ?? []).length, 2);
});
