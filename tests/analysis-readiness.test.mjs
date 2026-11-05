import test from "node:test";
import assert from "node:assert/strict";
import {
  describeCliqueAnalysisMenuBlocker,
  describeCommunityPairActionBlocker,
  describeCommunityCountBlocker,
  describeDirectedKCoreModeBlocker,
  describeKPlexMembershipBlocker,
  describeMissingRepairAttributeMappings,
  describeNeighborhoodRadiusBlocker,
  describeStructuralCounterfactualBlocker,
  describeStructuralEndpointBlocker,
  describeStructuralParameterBlocker,
  describeTypedPathStepAdditionBlocker,
  describeTypedPathCounterfactualBlocker,
  summarizeAnalysisReadiness
} from "../src/lib/kliqueasp/graph/analysisReadiness.ts";

test("clique menu explains missing graph data and a starting solver but leaves restart available", () => {
  assert.equal(describeCliqueAnalysisMenuBlocker({
    workerStatus: "ready",
    dataAvailable: true,
    dataReasons: []
  }), "");
  assert.equal(describeCliqueAnalysisMenuBlocker({
    workerStatus: "ready",
    dataAvailable: false,
    dataReasons: ["Mappa gli estremi dell'arco.", "Aggiungi nodi al grafo."]
  }), "Mappa gli estremi dell'arco. Aggiungi nodi al grafo.");
  assert.equal(describeCliqueAnalysisMenuBlocker({
    workerStatus: "initializing",
    dataAvailable: true,
    dataReasons: []
  }), "Il motore di analisi è in avvio. Attendi che sia pronto.");
  assert.match(describeCliqueAnalysisMenuBlocker({
    workerStatus: "initializing",
    dataAvailable: false,
    dataReasons: []
  }), /in avvio[\s\S]*Completa i dati e la mappatura/);
  assert.equal(describeCliqueAnalysisMenuBlocker({
    workerStatus: "error",
    dataAvailable: false,
    dataReasons: ["missing data"]
  }), "", "the action remains available to restart a failed worker");
});

test("community pair actions explain stale analysis and incomplete or duplicate selections", () => {
  for (const action of ["membership", "topologyCounterfactual"]) {
    assert.match(describeCommunityPairActionBlocker({
      analysisAvailable: false,
      action,
      leftNodeId: "",
      rightNodeId: ""
    }), /Ricalcola la modularità/);
    assert.match(describeCommunityPairActionBlocker({
      analysisAvailable: true,
      action,
      leftNodeId: "",
      rightNodeId: ""
    }), /primo nodo/);
    assert.match(describeCommunityPairActionBlocker({
      analysisAvailable: true,
      action,
      leftNodeId: "a",
      rightNodeId: ""
    }), /secondo nodo/);
    assert.match(describeCommunityPairActionBlocker({
      analysisAvailable: true,
      action,
      leftNodeId: "a",
      rightNodeId: "a"
    }), /due nodi distinti/);
    assert.equal(describeCommunityPairActionBlocker({
      analysisAvailable: true,
      action,
      leftNodeId: "a",
      rightNodeId: "b"
    }), "");
  }
});

test("structural numeric parameters explain invalid bounds and allow valid values", () => {
  for (const task of ["kPlex", "maximalKPlex"]) {
    assert.match(describeStructuralParameterBlocker({ task, parameter: 0 }), /intero s pari o superiore a 1/);
    assert.equal(describeStructuralParameterBlocker({ task, parameter: 1 }), "");
    assert.match(describeStructuralParameterBlocker({ task, parameter: 1.5 }), /intero s pari o superiore a 1/);
  }
  assert.match(describeStructuralParameterBlocker({ task: "kCore", parameter: -1 }), /intero k pari o superiore a 0/);
  assert.equal(describeStructuralParameterBlocker({ task: "kCore", parameter: 0 }), "");
  assert.equal(describeStructuralParameterBlocker({ task: "kCore", parameter: "0" }), "");
  assert.match(describeStructuralParameterBlocker({ task: "kCore", parameter: undefined }), /intero k pari o superiore a 0/);
  assert.match(describeStructuralParameterBlocker({ task: "kCore", parameter: "" }), /intero k pari o superiore a 0/);
  assert.match(describeStructuralParameterBlocker({ task: "kCore", parameter: null }), /intero k pari o superiore a 0/);
  assert.match(describeStructuralParameterBlocker({ task: "path", parameter: 101 }), /limite intero da 0 a 100 archi/);
  assert.equal(describeStructuralParameterBlocker({ task: "path", parameter: 100 }), "");
  assert.equal(describeStructuralParameterBlocker({ task: "path", parameter: "0" }), "");
  assert.match(describeStructuralParameterBlocker({ task: "path", parameter: "" }), /limite intero da 0 a 100 archi/);
  assert.equal(describeStructuralParameterBlocker({ task: "communities", parameter: undefined }), "");
});

test("typed-path step addition explains missing edge types and the step limit", () => {
  assert.match(describeTypedPathStepAdditionBlocker({ availableTypeCount: 0, stepCount: 1 }), /Mappa il tipo di relazione/);
  assert.equal(describeTypedPathStepAdditionBlocker({ availableTypeCount: 2, stepCount: 1 }), "");
  assert.match(describeTypedPathStepAdditionBlocker({ availableTypeCount: 2, stepCount: 100 }), /limite di 100 passi/);
  assert.equal(describeTypedPathStepAdditionBlocker({ availableTypeCount: 2, stepCount: 12, maximumSteps: 12 }),
    "Hai raggiunto il limite di 12 passi per un cammino tipizzato.");
});

test("community count limits explain invalid values and reversed intervals", () => {
  assert.match(describeCommunityCountBlocker({ minimum: -1, maximum: 0 }), /interi non negativi/);
  assert.match(describeCommunityCountBlocker({ minimum: 1.5, maximum: 4 }), /interi non negativi/);
  assert.match(describeCommunityCountBlocker({ minimum: undefined, maximum: 4 }), /interi non negativi/);
  assert.match(describeCommunityCountBlocker({ minimum: "", maximum: 0 }), /interi non negativi/);
  assert.match(describeCommunityCountBlocker({ minimum: 0, maximum: "" }), /interi non negativi/);
  assert.ok(describeCommunityCountBlocker({ minimum: 5, maximum: 4 }).includes("superare il massimo"));
  assert.equal(describeCommunityCountBlocker({ minimum: 0, maximum: 4 }), "");
  assert.equal(describeCommunityCountBlocker({ minimum: "0", maximum: "4" }), "");
  assert.equal(describeCommunityCountBlocker({ minimum: 4, maximum: 0 }), "");
  assert.equal(describeCommunityCountBlocker({ minimum: 4, maximum: 5 }), "");
});

test("directed k-core requires a visible degree semantic choice", () => {
  assert.match(describeDirectedKCoreModeBlocker({ directed: true, mode: "" }), /predecessori, i successori o solo i vicini reciproci/);
  for (const mode of ["in", "out", "mutual"]) {
    assert.equal(describeDirectedKCoreModeBlocker({ directed: true, mode }), "");
  }
  assert.equal(describeDirectedKCoreModeBlocker({ directed: false, mode: "" }), "");
});

test("k-plex membership actions distinguish a missing maximum result from a missing target node", () => {
  assert.match(describeKPlexMembershipBlocker({ maximumAvailable: false, targetNodeId: "" }), /Calcola prima un k-plex massimo/);
  assert.equal(describeKPlexMembershipBlocker({ maximumAvailable: true, targetNodeId: "" }), "Seleziona un nodo da spiegare.");
  assert.equal(describeKPlexMembershipBlocker({ maximumAvailable: true, targetNodeId: "target" }), "");
});

test("neighborhood focus accepts only a safe integer radius in the graph bounds", () => {
  assert.match(describeNeighborhoodRadiusBlocker({ radius: undefined, maximum: 5 }), /raggio intero da 1 a 5/);
  assert.match(describeNeighborhoodRadiusBlocker({ radius: 0, maximum: 5 }), /raggio intero da 1 a 5/);
  assert.match(describeNeighborhoodRadiusBlocker({ radius: 1.5, maximum: 5 }), /raggio intero da 1 a 5/);
  assert.match(describeNeighborhoodRadiusBlocker({ radius: 6, maximum: 5 }), /raggio intero da 1 a 5/);
  assert.equal(describeNeighborhoodRadiusBlocker({ radius: 1, maximum: 5 }), "");
  assert.equal(describeNeighborhoodRadiusBlocker({ radius: 5, maximum: 5 }), "");
});

test("missing repair mappings identify each graph element and exact attribute alias", () => {
  assert.deepEqual(describeMissingRepairAttributeMappings({
    nodeAttributes: ["email", "seniority"],
    edgeAttributes: ["relationStrength"]
  }), [
    'Mappa l\'attributo del nodo "email" usato dalle riparazioni.',
    'Mappa l\'attributo del nodo "seniority" usato dalle riparazioni.',
    'Mappa l\'attributo dell\'arco "relationStrength" usato dalle riparazioni.'
  ]);
  assert.deepEqual(describeMissingRepairAttributeMappings({ nodeAttributes: [], edgeAttributes: [] }), []);
});

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

test("structural path and separator actions explain missing or equal terminal selections", () => {
  assert.equal(describeStructuralEndpointBlocker({ task: "path", startNodeId: "", goalNodeId: "" }),
    "Seleziona un nodo iniziale e un nodo finale.");
  assert.equal(describeStructuralEndpointBlocker({ task: "path", startNodeId: "a", goalNodeId: "" }),
    "Seleziona un nodo finale.");
  assert.equal(describeStructuralEndpointBlocker({ task: "minimumEdgeSeparator", startNodeId: "", goalNodeId: "b" }),
    "Seleziona un nodo iniziale.");
  for (const task of ["typedPath", "minimumNodeSeparator", "minimumCostNodeSeparator", "minimumEdgeSeparator", "minimumCostEdgeSeparator"]) {
    assert.equal(describeStructuralEndpointBlocker({ task, startNodeId: "same", goalNodeId: "same" }),
      "Scegli due nodi terminali distinti.");
  }
  assert.equal(describeStructuralEndpointBlocker({ task: "path", startNodeId: "same", goalNodeId: "same" }),
    "", "un cammino di lunghezza zero verso lo stesso nodo resta ammesso");
  assert.equal(describeStructuralEndpointBlocker({ task: "kCore", startNodeId: "", goalNodeId: "" }), "");
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
