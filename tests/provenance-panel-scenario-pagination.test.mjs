import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8");

test("clique provenance panel progressively discloses scenario summaries", () => {
  assert.match(panel, /const scenarioPageSize = 20/);
  assert.match(panel, /comparison\?\.scenarios\.slice\(0, visibleScenarioLimit\)/);
  assert.match(panel, /\{#each visibleScenarios as scenario/);
  assert.match(panel, /total=\{comparison\.scenarios\.length\}[\s\S]*?visible=\{visibleScenarios\.length\}/);
  assert.match(panel, /showMore=\{\(\) => visibleScenarioLimit \+= scenarioPageSize\}/);
  assert.match(panel, /comparison !== previousComparison\)[\s\S]*?visibleScenarioLimit = scenarioPageSize/);
  assert.doesNotMatch(panel, /\{#each comparison\.scenarios as scenario/);
});
