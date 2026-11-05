import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const solverPanel = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");

test("clique lists keep the intended three-node group threshold explicit", () => {
  assert.match(solverPanel, /let minSize: number = 3/);
  assert.match(solverPanel, /Taglia minima\s*<input type="number" bind:value=\{minSize\} min="3"\s*\/>/);
  assert.match(graphApp, /foundCliques = allCliqueWitnesses\.filter\(\(clique\) => clique\.length >= 3\)/);
});

test("a mathematical clique maximum below the display threshold explains why the result list is empty", () => {
  assert.match(solverPanel, /stats\?\.maxSize > 0 && stats\.maxSize < 3/);
  assert.match(solverPanel, /Clique di almeno 3 nodi trovate/);
  assert.match(solverPanel, /La clique più grande ha \{stats\.maxSize\} nodi; nessuna raggiunge la soglia minima di 3\./);
  assert.match(solverPanel, /class="clique-threshold-next-step"[\s\S]*?dispatch\("openStructuralAnalysis"\)/);
  const emptyStateStart = solverPanel.indexOf("{#if grouped.length === 0 && cliqueAnalysisCompleted}");
  const emptyStateEnd = solverPanel.indexOf("{#each visibleGrouped as group}", emptyStateStart);
  const emptyState = solverPanel.slice(emptyStateStart, emptyStateEnd);
  assert.match(emptyState, /\{:else if stats\?\.maxSize > 0 && stats\.maxSize < 3\}\s*<p>La lista mostra gruppi di almeno 3 nodi\.<\/p>/);
  assert.ok(emptyState.indexOf("{:else if stats?.maxSize > 0 && stats.maxSize < 3}") < emptyState.indexOf("La ricerca non ha restituito clique"));
  assert.match(graphApp, /on:openStructuralAnalysis=\{\(\) => openAnalysisPanel\("structural"\)\}/);
  assert.match(solverPanel, /\.clique-threshold-next-step:focus-visible/);
  assert.doesNotMatch(solverPanel, /riepilogo legacy|ottimo matematico/);
});
