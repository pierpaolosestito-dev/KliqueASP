import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildKCoreMembershipCompletionCounterfactualProgram,
  solveKCoreMembershipCompletionWhyNotByRounds
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const nodeCountArgument = process.argv.find((argument) => argument.startsWith("--nodes="));
const nodeCount = nodeCountArgument ? Number(nodeCountArgument.slice("--nodes=".length)) : 1000;
const fullPeeling = process.argv.includes("--full");
const targetModeArgument = process.argv.find((argument) => argument.startsWith("--target="));
const targetMode = targetModeArgument ? targetModeArgument.slice("--target=".length) : "leaf";
const batchSizeArgument = process.argv.find((argument) => argument.startsWith("--batch-size="));
const batchSizeValue = batchSizeArgument?.slice("--batch-size=".length) ?? "1";
const adaptiveBatching = batchSizeValue === "adaptive";
const maxRoundsPerQuery = adaptiveBatching ? 4 : Number(batchSizeValue);
if (!Number.isSafeInteger(nodeCount) || nodeCount < 6 || nodeCount > 5000) {
  throw new Error("--nodes deve essere un intero compreso fra 6 e 5000");
}
if (targetMode !== "leaf" && targetMode !== "late") {
  throw new Error("--target deve essere leaf o late");
}
if (!adaptiveBatching && (!Number.isSafeInteger(maxRoundsPerQuery) || maxRoundsPerQuery < 1 || maxRoundsPerQuery > 32)) {
  throw new Error("--batch-size deve essere un intero fra 1 e 32 oppure adaptive");
}

// A triangle is the stable 2-core. One authorized chord extends it through node 5,
// leaving a long path tail whose remaining nodes are peeled one synchronous round at a time.
const nodes = Array.from({ length: nodeCount }, (_, index) => ({
  id: "node_" + (index + 1),
  label: "N" + (index + 1)
}));
const edges = [
  { id: "e-1-2", source: "node_1", target: "node_2" },
  { id: "e-2-3", source: "node_2", target: "node_3" },
  { id: "e-1-3", source: "node_1", target: "node_3" }
];
for (let index = 3; index < nodeCount; index += 1) {
  edges.push({
    id: "e-" + index + "-" + (index + 1),
    source: "node_" + index,
    target: "node_" + (index + 1)
  });
}

const normalized = normalizeGraphData({ nodes, edges });
if (!normalized.valid || normalized.direction !== "undirected") {
  throw new Error(`Fixture k-core membership non valido: ${JSON.stringify(normalized.diagnostics)}`);
}
const { facts, reverseIndex } = buildAspFactsFromGraph(normalized);
const indexByNodeId = new Map(Object.entries(reverseIndex).map(([index, id]) => [id, Number(index)]));
const nodeIdByIndex = new Map(Object.entries(reverseIndex).map(([index, id]) => [Number(index), id]));
const candidateNodeIndices = nodes.map((node) => indexByNodeId.get(node.id));
const candidates = [{
  id: "benchmark-chord",
  sourceNodeId: "node_1",
  targetNodeId: "node_5",
  sourceNode: indexByNodeId.get("node_1"),
  targetNode: indexByNodeId.get("node_5"),
  edgeType: "benchmark-only",
  cost: 1,
  recordIndex: 1
}];
const targetNodeId = targetMode === "late" ? "node_6" : `node_${nodeCount}`;
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
  { stopAfterTargetRemoval: !fullPeeling, maxRoundsPerQuery, adaptiveBatching }
);

const targetStep = certificate.peeling.find((step) => step.nodeId === targetNodeId);
if (!targetStep) throw new Error("Il certificato non contiene l'eliminazione del nodo obiettivo");
console.log(JSON.stringify({
  fixture: "triangle-with-long-tail-and-one-authorized-chord",
  nodes: normalized.nodes.length,
  observedEdges: normalized.links.length,
  candidateEdges: candidates.length,
  targetK: 2,
  targetMode,
  maxRoundsPerQuery,
  adaptiveBatching,
  targetNodeId: certificate.targetNodeId,
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
