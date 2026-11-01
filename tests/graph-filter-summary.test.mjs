import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const summary = await readFile(new URL("../src/lib/kliqueasp/components/GraphFilterSummary.svelte", import.meta.url), "utf8");
const motifPanel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const provenancePanel = await readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8");
const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");

test("view filters stay concise and disclose their complete values progressively", () => {
  assert.match(summary, /typeCountLabel = types\.length === 1 \? "1 tipo"/);
  assert.match(summary, /groupCountLabel = groups\.length === 1 \? "1 gruppo"/);
  assert.match(summary, /items=\{types\} resetKey=\{types\} label="tipi di relazione"/);
  assert.match(summary, /items=\{groups\} resetKey=\{groups\} label="gruppi del filtro"/);
  assert.doesNotMatch(summary, /types\.join|groups\.join/);
});

test("scenario panels share the compact view-filter summary", () => {
  assert.match(motifPanel, /<GraphFilterSummary types=\{scenarioComparison\.queryScope\.viewFilters\.types\} groups=\{scenarioComparison\.queryScope\.viewFilters\.groups\} \/>/);
  assert.match(provenancePanel, /<GraphFilterSummary types=\{viewFilters\.types\} groups=\{viewFilters\.groups\} \/>/);
  for (const family of ["provenanceKCore", "provenanceKPlex", "provenanceComponent", "provenanceDominatingSet"]) {
    assert.match(structuralPanel, new RegExp(`<GraphFilterSummary types=\\{${family}ViewFilters\\.types\\} groups=\\{${family}ViewFilters\\.groups\\} \\/>`));
  }
  assert.doesNotMatch(structuralPanel, /provenance\w+ViewFilters\.(?:types|groups)\.join\("/);
});

test("large scenario source lists are disclosed instead of concatenated", () => {
  assert.match(structuralPanel, /items=\{provenanceDominatingSetScenarioWhyNot\.scenarioSources\}[^>]*label="fonti dello scenario"/);
  assert.doesNotMatch(structuralPanel, /scenarioSources\.join\("/);
});
