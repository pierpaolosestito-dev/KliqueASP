import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAspFactsFromGraph,
  normalizeGraphData
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildMaximumKPlexProgram } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import {
  buildKPlexRequiredNodeConstraint,
  parseKPlexMaximumMembershipDiagnosis,
  summarizeMaximumKPlexMembershipAcrossOptima
} from "../src/lib/kliqueasp/graph/kplexMembershipDiagnosis.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const nodeIds = ["a", "b", "c", "d"];
const allPairs = nodeIds.flatMap((source, index) =>
  nodeIds.slice(index + 1).map((target) => [source, target])
);

function isSPlex(candidate, edgePairs, s) {
  const adjacent = new Set(edgePairs.flatMap(([left, right]) => [
    `${left}\u0000${right}`,
    `${right}\u0000${left}`
  ]));
  return candidate.every((node) =>
    candidate.filter((other) => other !== node && !adjacent.has(`${node}\u0000${other}`)).length <= s - 1
  );
}

function maximumSPlexSize(candidateIds, edgePairs, s, targetId) {
  let maximum = 0;
  for (let mask = 1; mask < 2 ** candidateIds.length; mask += 1) {
    const subset = candidateIds.filter((_, index) => (mask & (1 << index)) !== 0);
    if (targetId && !subset.includes(targetId)) continue;
    if (subset.length > maximum && isSPlex(subset, edgePairs, s)) maximum = subset.length;
  }
  return maximum;
}

function maximumSPlexes(candidateIds, edgePairs, s) {
  let maximum = 0;
  const results = [];
  for (let mask = 1; mask < 2 ** candidateIds.length; mask += 1) {
    const subset = candidateIds.filter((_, index) => (mask & (1 << index)) !== 0);
    if (!isSPlex(subset, edgePairs, s)) continue;
    if (subset.length > maximum) {
      maximum = subset.length;
      results.length = 0;
    }
    if (subset.length === maximum) results.push(subset);
  }
  return results;
}

test("l'ASP certifica la membership di ogni nodo nei k-plex massimi su tutti i grafi a quattro nodi", async () => {
  const runner = await createClingoWasmRunner();
  for (let graphMask = 0; graphMask < 2 ** allPairs.length; graphMask += 1) {
    const edges = allPairs
      .filter((_, index) => (graphMask & (1 << index)) !== 0)
      .map(([source, target]) => ({ source, target }));
    const graph = normalizeGraphData({ nodes: nodeIds.map((id) => ({ id })), edges });
    assert.equal(graph.valid, true);
    const asp = buildAspFactsFromGraph(graph);
    const candidateIds = graph.nodes.map((node) => node.id);
    const edgePairs = graph.links.map((edge) => [edge.source, edge.target]);
    const edgeRecords = graph.links.map((edge) => ({
      sourceNodeId: edge.source,
      targetNodeId: edge.target
    }));

    for (const s of [1, 2, 3]) {
      const globalOptima = maximumSPlexes(candidateIds, edgePairs, s);
      const globalMaximumSize = globalOptima[0].length;
      for (const targetNodeId of candidateIds) {
        const targetIndex = asp.indexByNodeId.get(targetNodeId);
        const result = await runner.run([
          asp.facts.trim(),
          buildMaximumKPlexProgram(s),
          buildKPlexRequiredNodeConstraint(targetIndex)
        ].join("\n\n"), ["--opt-mode=opt"], 0);
        assert.equal(result.Result, "OPTIMUM FOUND", `grafo=${graphMask}, s=${s}, target=${targetNodeId}`);

        const diagnosis = parseKPlexMaximumMembershipDiagnosis(result, {
          reverseIndex: asp.reverseIndex,
          candidateNodeIds: candidateIds,
          edgeRecords,
          targetNodeId,
          s,
          globalMaximumSize
        });
        const expectedContainingSize = maximumSPlexSize(candidateIds, edgePairs, s, targetNodeId);
        assert.equal(diagnosis.globalMaximumSize, globalMaximumSize);
        assert.equal(diagnosis.maximumContainingSize, expectedContainingSize,
          `taglia target-constrained, grafo=${graphMask}, s=${s}, target=${targetNodeId}`);
        assert.equal(diagnosis.sizeGap, globalMaximumSize - expectedContainingSize);
        assert.equal(diagnosis.outcome,
          expectedContainingSize === globalMaximumSize ? "included-in-maximum" : "excluded-from-maximum");
        const membership = summarizeMaximumKPlexMembershipAcrossOptima(targetNodeId, globalOptima, {
          candidateNodeIds: candidateIds,
          globalMaximumSize
        });
        const expectedMembershipCount = globalOptima.filter((plex) => plex.includes(targetNodeId)).length;
        assert.deepEqual(membership, {
          totalOptimalKplexes: globalOptima.length,
          targetOptimalKplexes: expectedMembershipCount,
          status: expectedMembershipCount === 0
            ? "none"
            : expectedMembershipCount === globalOptima.length ? "all" : "some"
        });
        assert.equal(membership.targetOptimalKplexes > 0, diagnosis.sizeGap === 0,
          `membership ASP e enumerazione discordanti, grafo=${graphMask}, s=${s}, target=${targetNodeId}`);
        assert.ok(diagnosis.witnessNodeIds.includes(targetNodeId));
        assert.ok(isSPlex(diagnosis.witnessNodeIds, edgePairs, s));
      }
    }
  }
});

test("membership nei k-plex ottimi distingue universalità, pareggi e assenza", () => {
  const maximumKplexes = [["a", "b", "c"], ["a", "b", "d"]];
  const candidates = ["a", "b", "c", "d", "e"];
  const options = { candidateNodeIds: candidates, globalMaximumSize: 3 };
  assert.deepEqual(summarizeMaximumKPlexMembershipAcrossOptima("a", maximumKplexes, options), {
    totalOptimalKplexes: 2,
    targetOptimalKplexes: 2,
    status: "all"
  });
  assert.deepEqual(summarizeMaximumKPlexMembershipAcrossOptima("c", maximumKplexes, options), {
    totalOptimalKplexes: 2,
    targetOptimalKplexes: 1,
    status: "some"
  });
  assert.deepEqual(summarizeMaximumKPlexMembershipAcrossOptima("e", maximumKplexes, options), {
    totalOptimalKplexes: 2,
    targetOptimalKplexes: 0,
    status: "none"
  });
  assert.throws(() => summarizeMaximumKPlexMembershipAcrossOptima("a", [...maximumKplexes, maximumKplexes[0]], options), /ripete/);
  assert.throws(() => summarizeMaximumKPlexMembershipAcrossOptima("a", [["a", "b"]], options), /taglia o dominio/);
  assert.throws(() => summarizeMaximumKPlexMembershipAcrossOptima("z", maximumKplexes, options), /dominio candidato/);
});

test("la diagnosi k-plex rifiuta risultati non ottimi, witness incoerenti e parametri invalidi", () => {
  assert.throws(() => buildKPlexRequiredNodeConstraint(0), /intero positivo/);
  assert.throws(() => buildKPlexRequiredNodeConstraint(1.5), /intero positivo/);

  const options = {
    reverseIndex: { 1: "a", 2: "b", 3: "c", 4: "d" },
    candidateNodeIds: nodeIds,
    edgeRecords: [["a", "b"], ["b", "c"], ["a", "c"]]
      .map(([sourceNodeId, targetNodeId]) => ({ sourceNodeId, targetNodeId })),
    targetNodeId: "d",
    s: 2,
    globalMaximumSize: 3
  };

  assert.throws(() => parseKPlexMaximumMembershipDiagnosis({ Result: "SATISFIABLE" }, options), /non ha provato l'ottimo/);
  assert.throws(() => parseKPlexMaximumMembershipDiagnosis({
    Result: "OPTIMUM FOUND",
    Call: [{ Witnesses: [{ Value: ["in(1)", "in(2)"] }] }]
  }, options), /non include il nodo selezionato/);
  assert.throws(() => parseKPlexMaximumMembershipDiagnosis({
    Result: "OPTIMUM FOUND",
    Call: [{ Witnesses: [{ Value: ["in(1)", "in(2)", "in(4)"] }] }]
  }, options), /non soddisfa la definizione/);
  assert.throws(() => parseKPlexMaximumMembershipDiagnosis({
    Result: "OPTIMUM FOUND",
    Call: [{ Witnesses: [{ Value: ["in(1)", "in(4)", "unexpected"] }] }]
  }, options), /atomo inatteso/);
  assert.throws(() => parseKPlexMaximumMembershipDiagnosis({
    Result: "OPTIMUM FOUND",
    Call: [{ Witnesses: [{ Value: ["in(1)", "in(4)"] }] }]
  }, { ...options, s: 0 }), /parametro s/);
});

test("la diagnosi k-plex identifica il target escluso dall'ottimo globale e le coppie mancanti", async () => {
  const runner = await createClingoWasmRunner();
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: [["a", "b"], ["a", "c"], ["b", "c"]].map(([source, target]) => ({ source, target }))
  });
  const asp = buildAspFactsFromGraph(graph);
  const result = await runner.run([
    asp.facts.trim(),
    buildMaximumKPlexProgram(2),
    buildKPlexRequiredNodeConstraint(asp.indexByNodeId.get("d"))
  ].join("\n\n"), ["--opt-mode=opt"], 0);
  const diagnosis = parseKPlexMaximumMembershipDiagnosis(result, {
    reverseIndex: asp.reverseIndex,
    candidateNodeIds: nodeIds,
    edgeRecords: graph.links.map((edge) => ({ sourceNodeId: edge.source, targetNodeId: edge.target })),
    targetNodeId: "d",
    s: 2,
    globalMaximumSize: 3
  });
  assert.equal(diagnosis.outcome, "excluded-from-maximum");
  assert.equal(diagnosis.maximumContainingSize, 2);
  assert.equal(diagnosis.sizeGap, 1);
  assert.ok(diagnosis.witnessNodeIds.includes("d"));
  const partnerId = diagnosis.witnessNodeIds.find((nodeId) => nodeId !== "d");
  assert.deepEqual(diagnosis.missingPairs, [[partnerId, "d"]]);
});
