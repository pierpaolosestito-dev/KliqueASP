import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const summary = await readFile(new URL("../src/lib/kliqueasp/components/GraphFilterSummary.svelte", import.meta.url), "utf8");
const motifPanel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const provenancePanel = await readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8");
const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
const scopeSummary = await readFile(new URL("../src/lib/kliqueasp/components/AnalysisProjectionScopeSummary.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const solverPanel = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");
const integrityPanel = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");

test("view filters stay concise and disclose their complete values progressively", () => {
  assert.match(summary, /typeCountLabel = types\.length === 1 \? "1 tipo"/);
  assert.match(summary, /groupCountLabel = groups\.length === 1 \? "1 gruppo"/);
  assert.match(summary, /export let degreeFilters: Partial<NodeDegreeProjectionFilters> = \{\}/);
  assert.match(summary, /degreeFilterLabels = \[/);
  assert.match(summary, /Esclusioni per grado/);
  assert.match(summary, /senza archi incidenti/);
  assert.match(summary, /senza archi entranti/);
  assert.match(summary, /senza archi uscenti/);
  assert.match(summary, /items=\{types\} resetKey=\{types\} label="tipi di nodo"/);
  assert.match(summary, /<strong>Tipi di nodo · \{types\.length\}<\/strong>/);
  assert.match(summary, /items=\{groups\} resetKey=\{groups\} label="gruppi del filtro"/);
  assert.doesNotMatch(summary, /types\.join|groups\.join/);
});

test("scenario panels share the compact view-filter summary", () => {
  assert.match(motifPanel, /<GraphFilterSummary[\s\S]*?types=\{scenarioComparison\.queryScope\.viewFilters\.types\}[\s\S]*?groups=\{scenarioComparison\.queryScope\.viewFilters\.groups\}[\s\S]*?degreeFilters=\{scenarioComparison\.queryScope\.viewFilters\.degreeFilters\}/);
  assert.match(motifPanel, /degreeFilters=\{signedTriadScenarioComparison\.queryScope\.viewFilters\.degreeFilters\}/);
  assert.match(provenancePanel, /<GraphFilterSummary types=\{viewFilters\.types\} groups=\{viewFilters\.groups\} degreeFilters=\{viewFilters\.degreeFilters\} \/>/);
  for (const family of ["provenanceKCore", "provenanceKPlex", "provenanceComponent", "provenanceDominatingSet"]) {
    assert.match(structuralPanel, new RegExp(`<GraphFilterSummary types=\\{${family}ViewFilters\\.types\\} groups=\\{${family}ViewFilters\\.groups\\} degreeFilters=\\{${family}ViewFilters\\.degreeFilters\\} \\/>`));
  }
  assert.doesNotMatch(structuralPanel, /provenance\w+ViewFilters\.(?:types|groups)\.join\("/);
});

test("large scenario source lists are disclosed instead of concatenated", () => {
  assert.match(structuralPanel, /items=\{provenanceDominatingSetScenarioWhyNot\.scenarioSources\}[^>]*label="fonti dello scenario"/);
  assert.doesNotMatch(structuralPanel, /scenarioSources\.join\("/);
});

test("analysis scope distinguishes node filters, active projection, and view-only focus", () => {
  assert.match(summary, /Tipi di nodo/);
  assert.doesNotMatch(summary, /Tipi di relazione/);
  assert.match(scopeSummary, /proiezione corrente/);
  assert.match(scopeSummary, /grafo di origine/);
  assert.match(scopeSummary, /scope\.periodLabel/);
  assert.match(scopeSummary, /scope\.confidenceThreshold/);
  assert.match(scopeSummary, /Il focus temporaneo di un nodo cambia la vista, non l'insieme analizzato/);
  assert.match(scopeSummary, /Filtri della vista e periodo non applicati/);
});

test("main analysis panels receive the current projection scope and integrity excludes visual filters", () => {
  for (const source of [solverPanel, structuralPanel, integrityPanel, motifPanel]) {
    assert.match(source, /<AnalysisProjectionScopeSummary[\s\S]{0,160}scope=\{analysisScope\}/);
  }
  assert.match(graphApp, /analysisScope=\{analysisProjectionScope\}/);
  assert.match(graphApp, /analysisScope=\{integrityAnalysisScope\}/);
  assert.match(graphApp, /\$:\s*integrityAnalysisScope = \{ \.\.\.analysisProjectionScope, usesVisibleProjection: false \}/);
  assert.match(graphApp, /viewTypes:\s*typeFiltersEnabled \? \[\.\.\.selectedTypes\]\.sort\(\) : \[\]/);
  assert.match(graphApp, /viewGroups:\s*groupFiltersEnabled \? \[\.\.\.selectedGroupsFilter\]\.sort\(\) : \[\]/);
});
