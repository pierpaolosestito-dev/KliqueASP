import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const graphApp = readFileSync(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const solverPanel = readFileSync(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");

test("clique group changes expose an explicit rerun action", () => {
  assert.match(solverPanel, /groupSelectionChanged = \(selectedGroup \|\| ""\) !== \(stats\?\.selectedGroup \|\| ""\)/);
  assert.match(solverPanel, /Gruppo analizzato:<\/strong> \{stats\?\.selectedGroup \|\| "tutti i nodi"\}/);
  assert.match(solverPanel, /on:click=\{\(\) => dispatch\("rerun"\)\}/);
  assert.match(graphApp, /on:rerun=\{\(\) => runMaximumClique\(\)\}/);
});

test("clique group choices follow the current projection and reject an empty scope", () => {
  assert.match(graphApp, /visibleAnalysisGroups = Array\.from\(new Set<string>/);
  assert.match(graphApp, /if \(selectedGroup && !visibleAnalysisGroups\.includes\(selectedGroup\)\) selectedGroup = ""/);
  assert.match(graphApp, /availableGroups=\{visibleAnalysisGroups\}/);
  assert.match(graphApp, /Il gruppo selezionato non contiene nodi nella proiezione corrente/);
});
