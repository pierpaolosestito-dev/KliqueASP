import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildGraphWitnessStatus } from "../src/lib/kliqueasp/graph/graphWitnessStatus.ts";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("highlight status describes node-only, edge-only, and mixed witnesses accurately", () => {
  assert.equal(buildGraphWitnessStatus(3, 0), "Risultato evidenziato · 3 nodi");
  assert.equal(buildGraphWitnessStatus(0, 1), "Risultato evidenziato · 1 arco");
  assert.equal(buildGraphWitnessStatus(2, 4), "Risultato evidenziato · 2 nodi · 4 archi");
  assert.equal(buildGraphWitnessStatus(1, 1), "Risultato evidenziato · 1 nodo · 1 arco");
});

test("highlight counts are formatted and invalid or zero-only inputs do not claim a witness", () => {
  assert.equal(buildGraphWitnessStatus(12500, Number.NaN), "Risultato evidenziato · 12.500 nodi");
  assert.equal(buildGraphWitnessStatus(-1, 0), "Nessun risultato evidenziato");
});

test("the live graph status uses actual highlighted node and edge counts", () => {
  assert.match(graphApp, /buildGraphWitnessStatus\(cliqueNodes\.size, highlightedEdgeIds\.size\)/);
  assert.doesNotMatch(graphApp, /Risultato evidenziato · \{cliqueNodes\.size\} nodi/);
});
