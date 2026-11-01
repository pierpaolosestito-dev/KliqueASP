import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph2DCliqueResultLabel } from "../src/lib/kliqueasp/graph/graph2DCliqueSummary.ts";

test("distingue le clique di taglia massima dalle soluzioni ottime", () => {
  assert.equal(buildGraph2DCliqueResultLabel({
    mode: "maximum", highlightedNodeCount: 4, resultCount: 2, group: "coorte A"
  }), "Clique di taglia massima · 4 nodi evidenziati · 2 soluzioni ottime · gruppo coorte A");
  assert.equal(buildGraph2DCliqueResultLabel({
    mode: "maximum", highlightedNodeCount: 3, resultCount: 1
  }), "Clique di taglia massima · 3 nodi evidenziati · 1 soluzione ottima");
});

test("distingue clique massimali e tutte le clique con la cardinalità mostrata", () => {
  assert.equal(buildGraph2DCliqueResultLabel({
    mode: "maximal", highlightedNodeCount: 5, resultCount: 3
  }), "Clique massimali · 3 risultati · 5 nodi evidenziati");
  assert.equal(buildGraph2DCliqueResultLabel({
    mode: "all", highlightedNodeCount: 4, resultCount: 1, group: "ricerca"
  }), "Tutte le clique · 1 risultato · 4 nodi evidenziati · gruppo ricerca");
});

test("normalizza i conteggi e ignora modalità non riconosciute", () => {
  assert.equal(buildGraph2DCliqueResultLabel({
    mode: "maximal", highlightedNodeCount: -3, resultCount: Number.NaN
  }), "Clique massimali · 0 risultati · 0 nodi evidenziati");
  assert.equal(buildGraph2DCliqueResultLabel({
    mode: "unknown", highlightedNodeCount: 3, resultCount: 1
  }), null);
});
