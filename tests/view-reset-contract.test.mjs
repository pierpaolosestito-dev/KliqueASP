import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const graphAppSource = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const resetViewStart = graphAppSource.indexOf("  function resetView() {");
const resetViewEnd = graphAppSource.indexOf("\n  function clearClique()", resetViewStart);
const resetViewSource = resetViewStart >= 0 && resetViewEnd > resetViewStart
  ? graphAppSource.slice(resetViewStart, resetViewEnd)
  : "";
const clearHighlightStart = graphAppSource.indexOf("  function clearClique() {");
const clearHighlightEnd = graphAppSource.indexOf("\n  function zoomIn()", clearHighlightStart);
const clearHighlightSource = clearHighlightStart >= 0 && clearHighlightEnd > clearHighlightStart
  ? graphAppSource.slice(clearHighlightStart, clearHighlightEnd)
  : "";

test("resetting filters and view preserves node navigation history", () => {
  assert.notEqual(resetViewSource, "", "resetView should remain a named view action");
  assert.match(resetViewSource, /selectedTypes = new Set\(\)/);
  assert.match(resetViewSource, /selectedGroupsFilter = new Set\(\)/);
  assert.match(resetViewSource, /graph3D\.cameraPosition\(/);
  assert.doesNotMatch(resetViewSource, /\bclearHistory\s*\(/);
  assert.match(graphAppSource, /resetView\(\); closeToolbarMenus\(\); \}\}>Reimposta filtri e vista/);
});

test("resetting the view saves its cleared focus for the next session restore", () => {
  assert.match(resetViewSource, /selectedId = null/);
  assert.match(resetViewSource, /selectedNode = null/);
  assert.match(resetViewSource, /persistCurrentAnalysisSession\(\);/);
});

test("removing a graph highlight persists only the cleared visual selection", () => {
  assert.notEqual(clearHighlightSource, "", "clearClique should remain a named view action");
  assert.match(clearHighlightSource, /cliqueNodes = new Set\(\)/);
  assert.match(clearHighlightSource, /highlightedEdgeIds = new Set\(\)/);
  assert.match(clearHighlightSource, /persistCurrentAnalysisSession\(true\)/);
  assert.match(graphAppSource, /clearClique\(\); closeToolbarMenus\(\); \}\}>Rimuovi evidenziazione/);
});
