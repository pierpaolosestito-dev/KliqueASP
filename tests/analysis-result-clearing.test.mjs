import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = graphApp.indexOf(startMarker);
  const end = graphApp.indexOf(endMarker, start);
  return start >= 0 && end > start ? graphApp.slice(start, end) : "";
}

const clearResults = sourceBetween(
  "  function clearAnalysisResultsForProjectionChange() {",
  "\n  function clearAnalysisResultsFromToolbar() {"
);
const clearFromToolbar = sourceBetween(
  "  function clearAnalysisResultsFromToolbar() {",
  "\n  function getEdgeConfidenceRange() {"
);

test("the Vista menu exposes a separate action for clearing analysis results", () => {
  assert.match(graphApp, /\$:\s*analysisResultsAvailable\s*=\s*Boolean\(\s*lastAnalysisPanel\s*\|\|/);
  assert.match(graphApp, /\{#if analysisResultsAvailable\}[\s\S]*?Cancella risultati correnti[\s\S]*?\{\/if\}/);
  assert.match(graphApp, /disabled=\{solverRunning\}[\s\S]*?on:click=\{clearAnalysisResultsFromToolbar\}/);
  assert.ok(/Cancella i risultati correnti e mantiene rete, filtri, vista e cronologia/.test(graphApp), "tooltip should describe what clearing preserves");
});

test("clearing results reuses the projection cleanup and returns focus to Vista", () => {
  assert.notEqual(clearFromToolbar, "", "toolbar action should have a named handler");
  assert.match(clearFromToolbar, /if \(solverRunning \|\| !analysisResultsAvailable\) return;/);
  assert.match(clearFromToolbar, /clearAnalysisResultsForProjectionChange\(\);/);
  assert.match(clearFromToolbar, /closeToolbarMenus\(\);/);
  assert.match(clearFromToolbar, /refreshLinkVisuals\(\);[\s\S]*refreshNodeVisuals\(\);/);
  assert.match(clearFromToolbar, /viewMenuElement\?\.querySelector\("summary"\)\?\.focus\(\);/);
});

test("result cleanup clears the current session and witnesses without resetting graph settings or archive history", () => {
  assert.notEqual(clearResults, "", "projection cleanup should remain a named shared action");
  assert.match(clearResults, /onAnalysisSessionChange\(null\);/);
  assert.match(clearResults, /maximumCliques = \[\];[\s\S]*allCliques = \[\];/);
  assert.match(clearResults, /highlightedEdgeIds = new Set\(\);/);
  assert.match(clearResults, /clearStructuralTaskResult\(\);[\s\S]*clearMotifAnalysis\(\);[\s\S]*clearSignedTriadAnalysis\(\);/);
  assert.doesNotMatch(clearResults, /selectedTypes\s*=|selectedGroupsFilter\s*=|currentStart\s*=|currentEnd\s*=|resetView\s*\(|cameraPosition\s*\(|analysisArchiveEntries\s*=|onAnalysisArchiveChange\s*\(/);
});
