import assert from "node:assert/strict";
import dataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import test from "node:test";
import graphConfig from "../src/lib/kliqueasp/data/examples/davis-southern-women.config.json" with { type: "json" };
import {
  buildAspFactsFromGraph,
  checkGraphTaskRequirements,
  getGraphTaskRequirements,
  normalizeGraphData
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildTypedMotifProgram, parseTypedMotifMatches } from "../src/lib/kliqueasp/graph/motifTask.ts";
import {
  buildGraphIntegrityProgram,
  parseIntegrityViolations
} from "../src/lib/kliqueasp/graph/integrityTask.ts";
import {
  buildMinimumEdgeSeparatorFacts,
  buildTypedPathProgram,
  getStructuralSolverOptions,
  parseWitnessTypedPath
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const sharedEventMotif = graphConfig.graphAnalysis.motifs[0];

function normalizeDavisGraph() {
  return normalizeGraphData(dataset, graphConfig);
}

function expectedSharedEventWitnesses() {
  const attendeesByEvent = new Map(dataset.nodes
    .filter((node) => node.type === "event")
    .map((node) => [node.id, []]));
  for (const edge of dataset.edges) attendeesByEvent.get(edge.target).push(edge.source);

  const signatures = new Set();
  for (const [eventId, attendees] of attendeesByEvent) {
    for (let left = 0; left < attendees.length; left += 1) {
      for (let right = left + 1; right < attendees.length; right += 1) {
        const women = [attendees[left], attendees[right]].sort();
        signatures.add(`${women[0]}\u0000${women[1]}\u0000${eventId}`);
      }
    }
  }
  return signatures;
}

test("Davis si mappa come grafo bipartito tipizzato senza date d'arco inventate", () => {
  const graph = normalizeDavisGraph();

  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.length, 32);
  assert.equal(graph.links.length, 89);
  assert.equal(graph.nodes.filter((node) => node.analysis?.type === "woman").length, 18);
  assert.equal(graph.nodes.filter((node) => node.analysis?.type === "event").length, 14);
  assert.equal(graph.capabilities.nodeTypes.available, true);
  assert.equal(graph.capabilities.edgeTypes.available, true);
  assert.equal(graph.capabilities.edgeIntervals.available, false);
  assert.deepEqual(checkGraphTaskRequirements(
    graph.capabilities,
    getGraphTaskRequirements("typedMotif")
  ), { available: true, missing: [], reasons: [] });
  assert.equal(checkGraphTaskRequirements(
    graph.capabilities,
    getGraphTaskRequirements("temporalMotif")
  ).available, false, "attendance records have no mapped edge intervals");
});

test("i vincoli ASP di integrità verificano i domini e le incidenze Davis", async () => {
  const graph = normalizeDavisGraph();
  const facts = buildAspFactsFromGraph(graph);
  const integrityProgram = buildGraphIntegrityProgram({
    requireNodeTypes: true,
    requireEdgeTypes: true,
    edgeTypeDomains: [
      { edgeType: "attendance", sourceNodeTypes: ["woman"], targetNodeTypes: ["event"] }
    ],
    cardinalities: [
      { nodeType: "woman", edgeType: "attendance", incidence: "any", min: 1 },
      { nodeType: "event", edgeType: "attendance", incidence: "any", min: 1 }
    ]
  }, graph.direction);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${integrityProgram}`);
  const violations = parseIntegrityViolations(
    result.Call?.[0]?.Witnesses,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );

  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.deepEqual(violations, []);
});

test("il motivo ASP delle co-partecipazioni coincide con gli incroci indipendenti per evento", async () => {
  const graph = normalizeDavisGraph();
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram(sharedEventMotif, graph.direction);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  const actual = new Set(matches.map((match) => {
    const women = [match.roles.womanA.sourceId, match.roles.womanB.sourceId].sort();
    return `${women[0]}\u0000${women[1]}\u0000${match.roles.event.sourceId}`;
  }));

  assert.equal(graph.valid, true);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(expectedSharedEventWitnesses().size, 322);
  assert.equal(matches.length, 322);
  assert.deepEqual([...actual].sort(), [...expectedSharedEventWitnesses()].sort());
  assert.ok(matches.length > 0);
  for (const match of matches) {
    assert.equal(match.roles.womanA.nodeId === match.roles.womanB.nodeId, false);
    assert.equal(match.supportingEdges.length, 2);
    assert.ok(match.supportingEdges.every((edge) => edge.edgeIds.length === 1));
    assert.deepEqual(
      match.supportingEdges.flatMap((edge) => edge.edgeIds).sort(),
      [
        `attendance-${String(dataset.edges.findIndex((edge) => edge.source === match.roles.womanA.sourceId && edge.target === match.roles.event.sourceId) + 1).padStart(3, "0")}`,
        `attendance-${String(dataset.edges.findIndex((edge) => edge.source === match.roles.womanB.sourceId && edge.target === match.roles.event.sourceId) + 1).padStart(3, "0")}`
      ].sort()
    );
  }
});

test("il cammino tipizzato ASP attraversa l'incidenza reale e restituisce l'ID sorgente", async () => {
  const graph = normalizeDavisGraph();
  const facts = buildAspFactsFromGraph(graph);
  const startId = "evelyn_jefferson";
  const goalId = "e1";
  const edgeIndex = buildMinimumEdgeSeparatorFacts(graph.links, facts.indexByNodeId);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildTypedPathProgram({
      startNode: facts.indexByNodeId.get(startId),
      goalNode: facts.indexByNodeId.get(goalId),
      edgeTypeSequence: ["attendance"],
      direction: graph.direction
    })}`,
    getStructuralSolverOptions("typedPath"),
    1
  );

  assert.equal(result.Result, "SATISFIABLE");
  assert.deepEqual(
    parseWitnessTypedPath(
      result.Call?.[0]?.Witnesses,
      facts.reverseIndex,
      edgeIndex.reverseEdgeIndex,
      1
    ),
    { nodeIds: [startId, goalId], edgeIdsByStep: [["source:attendance-001"]] }
  );
});
