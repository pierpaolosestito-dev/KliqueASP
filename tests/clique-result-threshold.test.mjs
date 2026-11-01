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
  assert.match(solverPanel, /La clique massima ha \{stats\.maxSize\} nodi\. La lista mostra solo gruppi di almeno 3 nodi, quindi resta vuota\./);
  assert.doesNotMatch(solverPanel, /riepilogo legacy|ottimo matematico/);
});
