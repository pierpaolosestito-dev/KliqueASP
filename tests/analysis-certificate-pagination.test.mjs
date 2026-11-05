import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
const solverPanel = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");

test("large clique histograms disclose size bins progressively", () => {
  assert.match(solverPanel, /<ProgressiveList items=\{histogramRows\} label="taglie della distribuzione"/);
  assert.doesNotMatch(solverPanel, /#each histogramRows as/);
});

test("selected structural counterfactual edits remain readable without mounting the full edit set", () => {
  assert.match(structuralPanel, /items=\{counterfactual\.selectedEdges\} resetKey=\{counterfactual\} pageSize=\{certificatePageSize\} label="aggiunte candidate selezionate"/);
  assert.match(structuralPanel, /items=\{result\.selectedEdits\} resetKey=\{result\} pageSize=\{certificatePageSize\} label="modifiche selezionate"/);
  assert.doesNotMatch(structuralPanel, /#each counterfactual\.selectedEdges as|#each result\.selectedEdits as/);
});

test("modularity attribute bounds and both k-core support certificates page nested evidence", () => {
  assert.match(structuralPanel, /items=\{attributeBounds\} resetKey=\{`\$\{partitionIndex\}:\$\{communityIndex\}`\} label=\{`valori degli attributi della comunità/);
  assert.equal((structuralPanel.match(/items=\{step\.supportingPairs\} resetKey=\{step\}/g) ?? []).length, 2);
  assert.doesNotMatch(structuralPanel, /#each communityAttributeBoundsFor\(community, partition\) as|#each step\.supportingPairs as pair/);
  assert.match(structuralPanel, /\.community-attribute-bounds \{[\s\S]*?max-height: 150px;[\s\S]*?overflow: auto;/);
  assert.match(structuralPanel, /\.kcore-supporting-pair-list \{[\s\S]*?max-height: 180px;[\s\S]*?overflow: auto;/);
});
