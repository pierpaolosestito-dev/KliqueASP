import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph2DStructuralResultLabel } from "../src/lib/kliqueasp/graph/graph2DStructuralSummary.ts";

test("etichetta k-plex massimi e massimali con parametro e gruppo", () => {
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "kPlex", parameter: 3, highlightedNodeCount: 5, highlightedEdgeCount: 6, group: "ricerca"
  }), "k-plex massimo · s=3 · 5 nodi evidenziati · gruppo ricerca");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "maximalKPlex", parameter: 2, highlightedNodeCount: 4, highlightedEdgeCount: 4
  }), "k-plex massimale · s=2 · 4 nodi evidenziati");
});

test("distingue un witness k-core dal profilo completo", () => {
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "kCore", parameter: 3, highlightedNodeCount: 4, highlightedEdgeCount: 6
  }), "k-core · k=3 · 4 nodi evidenziati");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "kCore", parameter: 3, highlightedNodeCount: 0, highlightedEdgeCount: 0, hasKCoreProfile: true, group: "coorte A"
  }), "Profilo dei core sulla proiezione corrente · gruppo coorte A");
});

test("nomina le componenti secondo la semantica direzionale del task", () => {
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "components", highlightedNodeCount: 3, highlightedEdgeCount: 2
  }), "Componente connessa · 3 nodi evidenziati");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "weakComponents", highlightedNodeCount: 3, highlightedEdgeCount: 2
  }), "Componente debolmente connessa · 3 nodi evidenziati");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "strongComponents", highlightedNodeCount: 2, highlightedEdgeCount: 1
  }), "Componente fortemente connessa · 2 nodi evidenziati");
});

test("descrive i cammini e conserva parametro, ordine e dominio", () => {
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "path", parameter: 6, highlightedNodeCount: 4, highlightedEdgeCount: 3, group: "A"
  }), "Cammino selezionato · 4 nodi in ordine · massimo 6 archi · gruppo A");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "typedPath", highlightedNodeCount: 2, highlightedEdgeCount: 1
  }), "Cammino tipizzato selezionato · 2 nodi in ordine");
});

test("descrive copertura, tagli e separatori, inclusi i terminali già separati", () => {
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "dominatingSet", highlightedNodeCount: 2, highlightedEdgeCount: 3, targetGroup: "studenti"
  }), "Insieme dominante · 2 nodi selezionati · 3 archi di supporto · obiettivo studenti");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "minimumCostNodeSeparator", highlightedNodeCount: 1, highlightedEdgeCount: 0, minimumNodeRemovalCost: 7
  }), "Separatore minimo di nodi · 1 nodo rimosso · costo 7");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "minimumEdgeSeparator", highlightedNodeCount: 0, highlightedEdgeCount: 2, minimumCutCost: 4
  }), "Taglio minimo di archi · 2 archi rimossi · costo 4");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "minimumNodeSeparator", highlightedNodeCount: 0, highlightedEdgeCount: 0
  }), "Terminali già disconnessi · nessun nodo rimosso");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "minimumCostEdgeSeparator", highlightedNodeCount: 0, highlightedEdgeCount: 0
  }), "Terminali già disconnessi · nessun arco rimosso");
});

test("mostra partizione e comunità selezionate senza inventare un witness", () => {
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "communities", highlightedNodeCount: 0, highlightedEdgeCount: 0,
    communityCount: 4, communityPartitionIndex: 1
  }), "Partizione ottima 2 · 4 comunità");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "communities", highlightedNodeCount: 3, highlightedEdgeCount: 2,
    communityCount: 4, communityPartitionIndex: 1, communityIndex: 2
  }), "Comunità 3 evidenziata · partizione 2");
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "communities", highlightedNodeCount: 0, highlightedEdgeCount: 0, communityCount: 0
  }), null);
});
