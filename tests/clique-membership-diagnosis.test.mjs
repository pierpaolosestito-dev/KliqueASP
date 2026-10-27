import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAspFactsFromGraph,
  buildCliqueProgram,
  getGraphEndpointId,
  normalizeGraphData,
  normalizeGraphId
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildCliqueRequiredNodeConstraint,
  parseCliqueMaximumMembershipDiagnosis
} from "../src/lib/kliqueasp/graph/cliqueMembershipDiagnosis.ts";
import { buildCliqueMaximumMembershipDiagnosisCsv } from "../src/lib/kliqueasp/graph/cliqueCsvExport.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

let runnerPromise;
function runner() {
  runnerPromise ??= createClingoWasmRunner();
  return runnerPromise;
}

function isClique(nodeIds, edgePairs) {
  for (let left = 0; left < nodeIds.length; left += 1) {
    for (let right = left + 1; right < nodeIds.length; right += 1) {
      const pair = [nodeIds[left], nodeIds[right]].sort().join("\u0000");
      if (!edgePairs.has(pair)) return false;
    }
  }
  return true;
}

function maximumCliqueSize(nodeIds, edgePairs, requiredNodeId = null) {
  let maximum = 0;
  for (let mask = 0; mask < 1 << nodeIds.length; mask += 1) {
    const selected = nodeIds.filter((_, index) => (mask & (1 << index)) !== 0);
    if (requiredNodeId && !selected.includes(requiredNodeId)) continue;
    if (isClique(selected, edgePairs)) maximum = Math.max(maximum, selected.length);
  }
  return maximum;
}

test("diagnosi clique richiede un indice ASP positivo", () => {
  assert.equal(buildCliqueRequiredNodeConstraint(3), ":- not in(3).");
  assert.throws(() => buildCliqueRequiredNodeConstraint(0), /intero positivo/);
  assert.throws(() => buildCliqueRequiredNodeConstraint(1.5), /intero positivo/);
});

test("ASP prova il gap di membership per ogni nodo sui 64 grafi semplici a quattro nodi", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possibleEdges = nodeIds.flatMap((source, left) => nodeIds
    .slice(left + 1)
    .map((target) => [source, target]));
  const clingo = await runner();

  for (let mask = 0; mask < 1 << possibleEdges.length; mask += 1) {
    const edges = possibleEdges
      .filter((_, index) => (mask & (1 << index)) !== 0)
      .map(([source, target], index) => ({ id: `e-${index}`, source, target }));
    const graph = normalizeGraphData({ nodes: nodeIds.map((id) => ({ id })), edges });
    const asp = buildAspFactsFromGraph(graph);
    const edgePairs = new Set(edges.map((edge) => [edge.source, edge.target].sort().join("\u0000")));
    const globalMaximumSize = maximumCliqueSize(nodeIds, edgePairs);
    const edgeRecords = graph.links.map((link) => ({
      sourceNodeId: normalizeGraphId(getGraphEndpointId(link.source)),
      targetNodeId: normalizeGraphId(getGraphEndpointId(link.target)),
      ...(link.sourceId ? { edgeId: String(link.sourceId) } : {})
    }));

    for (const targetNodeId of nodeIds) {
      const targetIndex = asp.indexByNodeId.get(targetNodeId);
      const program = `${asp.facts}\n${buildCliqueProgram("maximum", "")}\n${buildCliqueRequiredNodeConstraint(targetIndex)}\n`;
      const result = await clingo.run(program, ["--opt-mode=opt"]);
      const diagnosis = parseCliqueMaximumMembershipDiagnosis(result, {
        reverseIndex: asp.reverseIndex,
        candidateNodeIds: nodeIds,
        edgeRecords,
        targetNodeId,
        globalMaximumSize
      });
      const expectedSize = maximumCliqueSize(nodeIds, edgePairs, targetNodeId);

      assert.equal(diagnosis.maximumContainingSize, expectedSize, `mask=${mask}, target=${targetNodeId}`);
      assert.equal(diagnosis.sizeGap, globalMaximumSize - expectedSize);
      assert.equal(diagnosis.outcome, expectedSize === globalMaximumSize
        ? "included-in-maximum"
        : "excluded-from-maximum");
      assert.ok(diagnosis.witnessNodeIds.includes(targetNodeId));
      assert.ok(isClique(diagnosis.witnessNodeIds, edgePairs));
      assert.equal(diagnosis.supportingEdges.length, expectedSize * (expectedSize - 1) / 2);
    }
  }
});

test("parser rejects incomplete, altered, infeasible, or inconsistent membership certificates", () => {
  const base = {
    reverseIndex: { 1: "a", 2: "b", 3: "c" },
    candidateNodeIds: ["a", "b", "c"],
    edgeRecords: [{ sourceNodeId: "a", targetNodeId: "b", edgeId: "ab" }],
    targetNodeId: "a",
    globalMaximumSize: 2
  };
  const result = (Result, Value) => ({ Result, Call: [{ Witnesses: [{ Value }] }] });

  assert.throws(() => parseCliqueMaximumMembershipDiagnosis(result("SATISFIABLE", ["in(1)"]), base), /provato l'ottimo/);
  assert.throws(() => parseCliqueMaximumMembershipDiagnosis(result("OPTIMUM FOUND", []), base), /clique valida/);
  assert.throws(() => parseCliqueMaximumMembershipDiagnosis(result("OPTIMUM FOUND", ["in(1)", "in(3)"]), base), /non adiacente/);
  assert.throws(() => parseCliqueMaximumMembershipDiagnosis(result("OPTIMUM FOUND", ["in(1)", "in(99)"]), base), /fuori dal dominio/);
  assert.throws(() => parseCliqueMaximumMembershipDiagnosis(result("OPTIMUM FOUND", ["in(1)", "in(2)"]), {
    ...base,
    globalMaximumSize: 1
  }), /supera la cardinalità/);
  assert.throws(() => parseCliqueMaximumMembershipDiagnosis({
    Result: "OPTIMUM FOUND",
    Call: [{ Witnesses: [{ Value: ["in(1)"] }] }]
  }, { ...base, targetNodeId: "missing" }), /dominio della query/);
});

test("CSV membership esporta esito, ottimi e record di supporto in modo sicuro", () => {
  const csv = buildCliqueMaximumMembershipDiagnosisCsv({
    targetNodeId: "=target",
    globalMaximumSize: 3,
    maximumContainingSize: 2,
    sizeGap: 1,
    outcome: "excluded-from-maximum",
    witnessNodeIds: ["=A", "=target"],
    supportingEdges: [{
      sourceNodeId: "=A",
      targetNodeId: "=target",
      edgeId: "edge-1"
    }]
  }, { "=A": "=Node A", "=target": "=Target" }, "Analisi");

  assert.match(csv, /global_maximum_clique_size/);
  assert.match(csv, /excluded-from-maximum/);
  assert.match(csv, /edge-1/);
  assert.match(csv, /'=Target/);
});
