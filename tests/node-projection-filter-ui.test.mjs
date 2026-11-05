import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const scopeSummary = await readFile(new URL("../src/lib/kliqueasp/components/AnalysisProjectionScopeSummary.svelte", import.meta.url), "utf8");
const scope = await readFile(new URL("../src/lib/kliqueasp/graph/analysisProjectionScope.ts", import.meta.url), "utf8");

test("node-type filters are searchable, counted, paginated, resettable, and applied to the projection", () => {
  assert.match(graphApp, /const typeFiltersEnabled = GRAPH_CONFIG\.filters\?\.types \?\? true/);
  assert.match(graphApp, /aria-label="Cerca un tipo di nodo nel filtro della proiezione"/);
  assert.match(graphApp, /availableTypeCounts\[type\] \?\? 0/);
  assert.match(graphApp, /label="tipi disponibili"/);
  assert.match(graphApp, /class="filter-reset"[\s\S]*?on:click=\{clearTypeFilters\}[\s\S]*?>Tutti<\/button>/);
  assert.match(graphApp, /return selectedTypes\.has\(node\.type\)/);
  assert.match(graphApp, /passesTypeFilter: nodePassesTypeFilters/);
});

test("degree filters distinguish incident, incoming, and outgoing edge records", () => {
  assert.match(graphApp, /Escludi nodi isolati/);
  assert.match(graphApp, /Escludi nodi senza archi entranti/);
  assert.match(graphApp, /Escludi nodi senza archi uscenti/);
  assert.match(graphApp, /if \(filter !== "excludeIsolated" && graphDirection !== "directed"\) return/);
  assert.match(graphApp, /candidateLinks = timelineQualifiedLinks\.filter/);
  assert.match(graphApp, /filterNodeIdsByDegree\(candidateNodes, candidateLinks/);
  assert.match(graphApp, /degreeFilters: \{ \.\.\.nodeDegreeFilters \}/);
  assert.match(graphApp, /Il grado è misurato dopo gli altri filtri e prima di queste esclusioni, che si combinano tra loro/);
});

test("analysis scope reports the degree filters that produced the selected projection", () => {
  assert.match(scope, /viewDegreeFilters\?/);
  assert.match(scopeSummary, /GraphFilterSummary types=\{scope\.viewTypes\} groups=\{scope\.viewGroups\} degreeFilters=\{scope\.viewDegreeFilters\}/);
  assert.match(scopeSummary, /degreeFilters=\{scope\.viewDegreeFilters\}/);
});
