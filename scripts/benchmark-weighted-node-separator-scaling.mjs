import { performance } from "node:perf_hooks";
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMinimumCostNodeSeparatorProgram,
  getStructuralSolverOptions,
  parseWitnessRemovedNodeSets,
  selectMinimumCostNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";
import { isNodeSeparator, minimumCostNodeSeparatorByDinic } from "./lib/weighted-node-separator-reference.mjs";

const repetitions = 3;
const timeLimitSeconds = 20;
const costForIndex = (index) => 1 + ((index * 37 + 11) % 97);
const config = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", removalCostField: "$.removalCost" },
    edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target", direction: "undirected", identity: "multigraph" }
  }
};

function withSyntheticRemovalCosts(graph) {
  return {
    nodes: graph.nodes.map((node, index) => ({ ...node, removalCost: costForIndex(index) })),
    edges: graph.edges
  };
}

function makeCycle(nodeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({ id: `node_${index}` }));
  const edges = Array.from({ length: nodeCount }, (_, index) => ({
    id: `edge_${index}`,
    source: `node_${index}`,
    target: `node_${(index + 1) % nodeCount}`
  }));
  return { nodes, edges };
}

function makePath(nodeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({ id: `node_${index}` }));
  const edges = Array.from({ length: nodeCount - 1 }, (_, index) => ({
    id: `edge_${index}`,
    source: `node_${index}`,
    target: `node_${index + 1}`
  }));
  return { nodes, edges };
}

function makeStar(nodeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({ id: `node_${index}` }));
  const edges = Array.from({ length: nodeCount - 1 }, (_, index) => ({
    id: `edge_${index}`,
    source: "node_0",
    target: `node_${index + 1}`
  }));
  return { nodes, edges };
}

function makeGrid(sideLength) {
  const nodeCount = sideLength * sideLength;
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({ id: `node_${index}` }));
  const edges = [];
  for (let row = 0; row < sideLength; row += 1) {
    for (let column = 0; column < sideLength; column += 1) {
      const index = row * sideLength + column;
      if (column + 1 < sideLength) edges.push({ id: `edge_${edges.length}`, source: `node_${index}`, target: `node_${index + 1}` });
      if (row + 1 < sideLength) edges.push({ id: `edge_${edges.length}`, source: `node_${index}`, target: `node_${index + sideLength}` });
    }
  }
  return { nodes, edges };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function normalizedNodeIdForSource(graph, sourceId) {
  const node = graph.nodes.find((candidate) =>
    candidate.id === sourceId || String(candidate.sourceId ?? "") === String(sourceId)
  );
  if (!node) throw new Error(`Mapped graph has no node for source ID ${sourceId}`);
  return node.id;
}

const profiles = [
  ...[34, 100, 250, 500, 1000].map((nodeCount) => ({
    family: "cycle",
    size: nodeCount,
    fixture: makeCycle(nodeCount),
    sourceId: "node_0",
    goalId: `node_${Math.floor(nodeCount / 2)}`
  })),
  { family: "path", size: 100, fixture: makePath(100), sourceId: "node_0", goalId: "node_99" },
  { family: "star", size: 100, fixture: makeStar(100), sourceId: "node_1", goalId: "node_99" },
  { family: "grid", size: "10x10", fixture: makeGrid(10), sourceId: "node_0", goalId: "node_99" },
  {
    family: "Davis Southern Women topology",
    size: "32x89",
    fixture: withSyntheticRemovalCosts(davisDataset),
    sourceId: "Evelyn Jefferson",
    goalId: "E14"
  }
];

for (const profile of profiles) {
  const { family, size, fixture, sourceId, goalId } = profile;
  const graph = normalizeGraphData(withSyntheticRemovalCosts(fixture), config);
  if (!graph.valid || graph.direction !== "undirected" || !graph.capabilities.nodeRemovalCosts.available) {
    throw new Error(`Invalid ${family} graph or incomplete synthetic costs: ${JSON.stringify(graph.diagnostics)}`);
  }

  const sourceNodeId = normalizedNodeIdForSource(graph, sourceId);
  const goalNodeId = normalizedNodeIdForSource(graph, goalId);
  const costsByNodeId = new Map(graph.nodes.map((node) => [node.id, node.analysis.removalCost]));
  const expectedMinimumCost = minimumCostNodeSeparatorByDinic(
    graph.nodes,
    graph.links.map((link) => ({
      source: typeof link.source === "string" ? link.source : link.source.id,
      target: typeof link.target === "string" ? link.target : link.target.id
    })),
    costsByNodeId,
    sourceNodeId,
    goalNodeId
  );
  if (expectedMinimumCost === null) throw new Error(`${family} has no finite node separator`);

  const facts = buildAspFactsFromGraph(graph);
  const program = `${facts.facts}\n\n${buildMinimumCostNodeSeparatorProgram(
    facts.indexByNodeId.get(sourceNodeId),
    facts.indexByNodeId.get(goalNodeId)
  )}\n`;
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const elapsedSamplesMs = [];
  let result;
  let optimumSets = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const startedAt = performance.now();
    result = await runner.run(program, [
      `--time-limit=${timeLimitSeconds}`,
      "--stats=2",
      ...getStructuralSolverOptions("minimumCostNodeSeparator")
    ]);
    elapsedSamplesMs.push(performance.now() - startedAt);
    if (result?.Result !== "OPTIMUM FOUND") break;
    optimumSets = selectMinimumCostNodeSets(
      parseWitnessRemovedNodeSets(result?.Call?.[0]?.Witnesses, facts.reverseIndex),
      Object.fromEntries(costsByNodeId)
    );
  }

  const selectedSet = optimumSets[0] ?? null;
  const aspCost = selectedSet?.reduce((sum, nodeId) => sum + costsByNodeId.get(nodeId), 0) ?? null;
  const edgePairs = graph.links.map((link) => ({
    source: typeof link.source === "string" ? link.source : link.source.id,
    target: typeof link.target === "string" ? link.target : link.target.id
  }));
  const separatorFeasible = selectedSet !== null && isNodeSeparator(
    graph.nodes,
    edgePairs,
    selectedSet,
    sourceNodeId,
    goalNodeId
  );
  const validAgainstDinic = result?.Result === "OPTIMUM FOUND" && separatorFeasible && aspCost === expectedMinimumCost;
  console.log(JSON.stringify({
    graphFamily: family,
    profileSize: size,
    nodes: graph.nodes.length,
    edges: graph.links.length,
    terminals: [sourceId, goalId],
    costOrigin: "deterministic synthetic benchmark costs; not a domain dataset attribute",
    costFormula: "1 + ((nodeIndex * 37 + 11) % 97)",
    dinicMinimumCost: expectedMinimumCost,
    aspMinimumCost: aspCost,
    oneOptimumSeparator: selectedSet,
    separatorFeasible,
    aspInputBytes: Buffer.byteLength(program, "utf8"),
    repetitions: elapsedSamplesMs.length,
    timeLimitSeconds,
    aspWallMsMedian: elapsedSamplesMs.length ? Number(median(elapsedSamplesMs).toFixed(2)) : null,
    aspWallMsSamples: elapsedSamplesMs.map((value) => Number(value.toFixed(2))),
    clingoTimeMs: result?.Time
      ? {
          total: Number.isFinite(Number(result.Time.Total)) ? Number((Number(result.Time.Total) * 1000).toFixed(2)) : null,
          solve: Number.isFinite(Number(result.Time.Solve)) ? Number((Number(result.Time.Solve) * 1000).toFixed(2)) : null
        }
      : null,
    groundingAndSolverStats: result?.Stats?.LP
      ? {
          atoms: result.Stats.LP.Atoms,
          originalRules: result.Stats.LP.Rules?.Original,
          finalRules: result.Stats.LP.Rules?.Final,
          variables: result.Stats.Problem?.Variables,
          choices: result.Stats.Core?.Choices,
          conflicts: result.Stats.Core?.Conflicts
        }
      : null,
    wasmMemory: runner.getWasmLinearMemoryStats(),
    result: result?.Result,
    validAgainstDinic
  }));

  if (!validAgainstDinic) {
    process.exitCode = 2;
    break;
  }
}
