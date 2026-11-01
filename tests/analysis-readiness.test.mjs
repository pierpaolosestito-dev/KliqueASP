import test from "node:test";
import assert from "node:assert/strict";
import {
  describeStructuralCounterfactualBlocker,
  describeTypedPathCounterfactualBlocker,
  summarizeAnalysisReadiness
} from "../src/lib/kliqueasp/graph/analysisReadiness.ts";

test("summarizes ready and blocked analysis tasks without losing blockers", () => {
  const blockedTask = { label: "k-core", available: false, reasons: ["Mappa la direzione."] };
  const result = summarizeAnalysisReadiness([
    { label: "Clique", available: true, reasons: [] },
    blockedTask,
    { label: "Componenti", available: true, reasons: [] }
  ]);

  assert.deepEqual(result, {
    availableCount: 2,
    blockedCount: 1,
    totalCount: 3,
    blockedTasks: [blockedTask]
  });
});

test("empty readiness groups report zero tasks", () => {
  assert.deepEqual(summarizeAnalysisReadiness([]), {
    availableCount: 0,
    blockedCount: 0,
    totalCount: 0,
    blockedTasks: []
  });
});

test("all-blocked groups keep every task and its concrete reasons", () => {
  const tasks = [
    { label: "k-plex", available: false, reasons: ["Direzione non mappata."] },
    { label: "k-core", available: false, reasons: ["Nodi mancanti.", "Grafo vuoto."] }
  ];
  const result = summarizeAnalysisReadiness(tasks);

  assert.equal(result.availableCount, 0);
  assert.equal(result.blockedCount, 2);
  assert.deepEqual(result.blockedTasks, tasks);
});

test("typed-path counterfactual explains missing terminals and relationship steps", () => {
  const ready = { enabled: true, requirementReasons: [], startNodeId: "", goalNodeId: "b", edgeTypeSequence: [] };
  assert.match(describeTypedPathCounterfactualBlocker(ready), /nodo iniziale/);
  assert.match(describeTypedPathCounterfactualBlocker({ ...ready, startNodeId: "a", goalNodeId: "a" }), /distinti/);
  assert.match(describeTypedPathCounterfactualBlocker({ ...ready, startNodeId: "a", edgeTypeSequence: [] }), /almeno un passo/);
  assert.match(describeTypedPathCounterfactualBlocker({ ...ready, startNodeId: "a", edgeTypeSequence: [""] }), /ogni passo/);
  assert.equal(describeTypedPathCounterfactualBlocker({
    ...ready,
    startNodeId: "a",
    edgeTypeSequence: ["collabora"]
  }), "");
  assert.equal(describeTypedPathCounterfactualBlocker({ ...ready, enabled: false }), "",
    "la configurazione mancante viene spiegata dalla sezione candidati già visibile");
});

test("structural counterfactual explains invalid targets and empty target domains", () => {
  const base = {
    invalidTarget: false,
    minimumTarget: 2,
    maximumTarget: 5,
    cohortNodeCount: 2,
    targetNodeSelection: true,
    targetNodeCount: 0,
    targetNodeSelected: false
  };
  const invalidThreshold = describeStructuralCounterfactualBlocker({ ...base, invalidTarget: true });
  assert.match(invalidThreshold, /soglia intera da 2 a 5/);
  assert.doesNotMatch(invalidThreshold, /target/i);
  assert.match(describeStructuralCounterfactualBlocker({ ...base, cohortNodeCount: 0 }), /Il gruppo candidato non contiene nodi/);
  assert.match(describeStructuralCounterfactualBlocker(base), /Nessun nodo obiettivo/);
  assert.match(describeStructuralCounterfactualBlocker({ ...base, targetNodeCount: 2 }), /Seleziona un nodo obiettivo/);
  assert.equal(describeStructuralCounterfactualBlocker({ ...base, targetNodeCount: 2, targetNodeSelected: true }), "");
});
