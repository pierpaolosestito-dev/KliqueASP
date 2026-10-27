import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildKCoreMembershipCompletionCounterfactualProgram,
  solveKCoreMembershipCompletionWhyNotByRounds
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const treeNodesArgument = process.argv.find((argument) => argument.startsWith("--tree-nodes="));
const treeNodeCount = treeNodesArgument ? Number(treeNodesArgument.slice("--tree-nodes=".length)) : 1020;
const batchSizeArgument = process.argv.find((argument) => argument.startsWith("--batch-size="));
const batchSizeValue = batchSizeArgument?.slice("--batch-size=".length) ?? "1";
const adaptiveBatching = batchSizeValue === "adaptive";
const maxRoundsPerQuery = adaptiveBatching ? 4 : Number(batchSizeValue);
if (!Number.isSafeInteger(treeNodeCount) || treeNodeCount < 7 || treeNodeCount > 4093) {
  throw new Error("--tree-nodes deve essere un intero compreso fra 7 e 4093");
}
if (!adaptiveBatching && (!Number.isSafeInteger(maxRoundsPerQuery) || maxRoundsPerQuery < 1 || maxRoundsPerQuery > 32)) {
  throw new Error("--batch-size deve essere un intero fra 1 e 32 oppure adaptive");
}

// A complete or nearly complete binary tree is attached to a stable triangle.
// One candidate edge closes a long cycle through the leftmost deepest leaf;
// the right subtree remains outside the 2-core and is peeled in parallel waves.
const nodes = Array.from({ length: treeNodeCount + 3 }, (_, index) => ({
  id: `node_${index + 1}`,
  label: `N${index + 1}`
}));
const edges = [
  { id: "e-1-2", source: "node_1", target: "node_2" },
  { id: "e-2-3", source: "node_2", target: "node_3" },
  { id: "e-1-3", source: "node_1", target: "node_3" },
  { id: "e-3-4", source: "node_3", target: "node_4" }
];
for (let treeIndex = 1; treeIndex < treeNodeCount; treeIndex += 1) {
  const parentTreeIndex = Math.floor((treeIndex - 1) / 2);
  edges.push({
    id: `tree-${parentTreeIndex}-${treeIndex}`,
    source: `node_${parentTreeIndex + 4}`,
    target: `node_${treeIndex + 4}`
  });
}

const deepestLeftLeafIndex = 2 ** Math.floor(Math.log2(treeNodeCount)) - 1;
const deepestLeftLeafId = `node_${deepestLeftLeafIndex + 4}`;
const targetNodeId = "node_6"; // Right child of the root: outside the candidate-supported cycle.
const normalized = normalizeGraphData({ nodes, edges });
if (!normalized.valid || normalized.direction !== "undirected") {
  throw new Error(`Fixture k-core binary-tree non valido: ${JSON.stringify(normalized.diagnostics)}`);
}
const { facts, reverseIndex } = buildAspFactsFromGraph(normalized);
const indexByNodeId = new Map(Object.entries(reverseIndex).map(([index, id]) => [id, Number(index)]));
const nodeIdByIndex = new Map(Object.entries(reverseIndex).map(([index, id]) => [Number(index), id]));
const candidateNodeIndices = nodes.map((node) => indexByNodeId.get(node.id));
const candidates = [{
  id: "benchmark-cycle-closing-edge",
  sourceNodeId: "node_1",
  targetNodeId: deepestLeftLeafId,
  sourceNode: indexByNodeId.get("node_1"),
  targetNode: indexByNodeId.get(deepestLeftLeafId),
  edgeType: "benchmark-only",
  cost: 1,
  recordIndex: 1
}];
const targetNodeIndex = indexByNodeId.get(targetNodeId);
const primary = buildKCoreMembershipCompletionCounterfactualProgram(
  2,
  targetNodeIndex,
  candidateNodeIndices,
  candidates
);
const runner = await createClingoWasmRunner({ captureWasmMemory: true });
const primaryResult = await runner.run(`${facts}\n\n${primary.program}`, ["--opt-mode=opt", "--time-limit=25"]);
if (primaryResult.Result !== "UNSATISFIABLE") {
  throw new Error(`Il task primario deve risultare UNSATISFIABLE, ricevuto ${primaryResult.Result}`);
}

const observedEdges = normalized.links.map((link) => ({
  sourceNode: indexByNodeId.get(link.source),
  targetNode: indexByNodeId.get(link.target)
}));
let queries = 0;
let totalClingoMs = 0;
let maxFinalRules = 0;
const startedAt = performance.now();
const certificate = await solveKCoreMembershipCompletionWhyNotByRounds(
  2,
  targetNodeIndex,
  candidateNodeIndices,
  observedEdges,
  candidates,
  nodeIdByIndex,
  async (program) => {
    queries += 1;
    const result = await runner.run(`${program}\n`, ["--stats=2", "--time-limit=25"]);
    totalClingoMs += Number(result.Time?.Total ?? 0) * 1000;
    maxFinalRules = Math.max(maxFinalRules, Number(result.Stats?.LP?.Rules?.Final ?? 0));
    return result;
  },
  { stopAfterTargetRemoval: true, maxRoundsPerQuery, adaptiveBatching }
);
const targetStep = certificate.peeling.find((step) => step.nodeId === targetNodeId);
if (!targetStep) throw new Error("Il certificato non contiene l'eliminazione del nodo obiettivo");
console.log(JSON.stringify({
  fixture: "triangle-with-binary-tree-and-one-cycle-closing-candidate",
  treeNodes: treeNodeCount,
  nodes: normalized.nodes.length,
  observedEdges: normalized.links.length,
  candidateEdges: candidates.length,
  targetK: 2,
  maxRoundsPerQuery,
  adaptiveBatching,
  targetNodeId: certificate.targetNodeId,
  candidateCycleLeaf: deepestLeftLeafId,
  primaryResult: primaryResult.Result,
  certificateScope: certificate.peelingScope,
  targetEliminationRound: targetStep.round,
  peelingRows: certificate.peeling.length,
  queryCount: queries,
  maxFinalGroundRulesPerQuery: maxFinalRules,
  cumulativeClingoMs: Number(totalClingoMs.toFixed(2)),
  elapsedWallMs: Number((performance.now() - startedAt).toFixed(2)),
  wasmLinearMemory: runner.getWasmLinearMemoryStats()
}));
