import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");

test("user-configured motif attribute constraints are summarized and progressively disclosed", () => {
  assert.match(panel, /import ProgressiveList from "\.\/ProgressiveList\.svelte"/);
  assert.match(panel, /const templateConstraintPageSize = 20/);
  assert.match(panel, /selectedTemplateEdgeAttributeSummaries = selectedTemplate\?\.edges[\s\S]*?\.map\(\(edge\) =>/);
  assert.match(panel, /selectedTemplateNodeAttributeSummaries = selectedTemplate[\s\S]*?Object\.entries\(selectedTemplate\.roles\)/);
  assert.match(panel, /items=\{selectedTemplateEdgeAttributeSummaries\}[\s\S]*?resetKey=\{selectedTemplate\}[\s\S]*?label="vincoli sugli archi"/);
  assert.match(panel, /items=\{selectedTemplateNodeAttributeSummaries\}[\s\S]*?resetKey=\{selectedTemplate\}[\s\S]*?label="vincoli sui nodi"/);
  assert.match(panel, /Filtri esatti sugli attributi mappati degli archi · \{selectedTemplateEdgeAttributeSummaries\.length\}/);
  assert.match(panel, /Filtri esatti sugli attributi mappati dei nodi · \{selectedTemplateNodeAttributeSummaries\.length\}/);
  assert.match(panel, /<summary>Assegnazione dei ruoli · \{scenarioComparison\.roleNames\.length\}<\/summary>[\s\S]*?items=\{scenarioComparison\.roleNames\} resetKey=\{membership\} label="ruoli assegnati"/);
  assert.doesNotMatch(panel, /#each selectedTemplate\.edges\.filter|#each Object\.entries\(selectedTemplate\.roles\)/,
    "large user-provided motif configurations should not mount every attribute constraint at once");
  assert.doesNotMatch(panel, /#each scenarioComparison\.roleNames as/,
    "large configured motifs should disclose role assignments without creating an unbounded row");
});
