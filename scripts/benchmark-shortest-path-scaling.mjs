import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMinimumHopPathProgram,
  buildPathEdgeFacts,
  parseWitnessMinimumHopPathWitness
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const distance = 12;
const repetitions = 3;
const stressMode = process.argv.includes("--stress");

function makeLayeredGraph(targetNodeCount, requestedWidth) {
  const width = requestedWidth ?? Math.floor((targetNodeCount - 2) / (distance - 1));
  const nodes = [{ id: "source" }];
  const layers = [["source"]];
  for (let level = 1; level < distance; level += 1) {
    const layer = Array.from({ length: width }, (_, index) => `layer_${level}_node_${index}`);
    layers.push(layer);
    nodes.push(...layer.map((id) => ({ id })));
  }
  nodes.push({ id: "target" });
  layers.push(["target"]);
  while (nodes.length < targetNodeCount) nodes.push({ id: `isolated_${nodes.length}` });
  const edges = [];
  for (let level = 0; level < layers.length - 1; level += 1) {
    for (const source of layers[level]) {
      for (const target of layers[level + 1]) edges.push({ id: `e_${source}_${target}`, source, target });
    }
  }
  return { nodes, edges, width };
}

function shortestDistance(graph, startId, goalId) {
  const adjacency = new Map(graph.nodes.map((node) => [String(node.id), new Set()]));
  for (const link of graph.links) {
    adjacency.get(String(link.source))?.add(String(link.target));
    adjacency.get(String(link.target))?.add(String(link.source));
  }
  const distances = new Map([[startId, 0]]);
  const queue = [startId];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    for (const neighbor of adjacency.get(node) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distances.get(node) + 1);
      queue.push(neighbor);
    }
  }
  return distances.get(goalId) ?? null;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

const profiles = stressMode
  ? [[500, 30], [500, 31]]
  : [[34, 2], [100, 8], [250, 16], [500, 22]];

for (const [targetNodeCount, width] of profiles) {
  const runner = await createClingoWasmRunner({ captureWasmMemory: true, includeExceptionDetails: true });
  const fixture = makeLayeredGraph(targetNodeCount, width);
  const graph = normalizeGraphData(fixture);
  if (!graph.valid || graph.direction !== "undirected") {
    throw new Error(`Invalid synthetic graph: ${JSON.stringify(graph.diagnostics)}`);
  }
  const asp = buildAspFactsFromGraph(graph);
  const pathEdges = buildPathEdgeFacts(graph.links, asp.indexByNodeId);
  const expectedLength = shortestDistance(graph, "source", "target");
  if (expectedLength !== distance) throw new Error(`BFS expected ${distance}, received ${expectedLength}`);
  const program = [
    asp.facts.trim(),
    pathEdges.facts.trim(),
    buildMinimumHopPathProgram(
      asp.indexByNodeId.get("source"),
      asp.indexByNodeId.get("target"),
      distance,
      "",
      graph.direction
    )
  ].filter(Boolean).join("\n\n");
  const elapsedSamplesMs = [];
  let result;
  let witness;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const startedAt = performance.now();
    result = await runner.run(program, ["--stats=2"], 1);
    elapsedSamplesMs.push(performance.now() - startedAt);
    witness = parseWitnessMinimumHopPathWitness(
      result?.Call?.[0]?.Witnesses,
      asp.reverseIndex,
      pathEdges.reverseEdgeIndex,
      true
    );
    if (result?.Result !== "SATISFIABLE" || witness?.nodeIds.length - 1 !== expectedLength) break;
  }
  const valid = result?.Result === "SATISFIABLE" && witness?.nodeIds.length - 1 === expectedLength;
  let recoveryProbe;
  let freshWorkerProbe;
  if (stressMode && result?.Result === "ERROR") {
    recoveryProbe = (await runner.run("recovery_probe.", [], 1))?.Result;
    const freshRunner = await createClingoWasmRunner();
    freshWorkerProbe = (await freshRunner.run("recovery_probe.", [], 1))?.Result;
  }
  console.log(JSON.stringify({
    targetNodes: targetNodeCount,
    actualNodes: graph.nodes.length,
    layerWidth: fixture.width,
    edges: graph.links.length,
    aspInputBytes: new TextEncoder().encode(program).byteLength,
    sourceGoalBfsDistance: expectedLength,
    maximumLength: distance,
    repetitions: elapsedSamplesMs.length,
    elapsedMsMedian: Number(median(elapsedSamplesMs).toFixed(2)),
    elapsedMsSamples: elapsedSamplesMs.map((value) => Number(value.toFixed(2))),
    result: result?.Result,
    error: result?.Error,
    ...(result?.Result === "ERROR" ? { callResults: result?.Call } : {}),
    returnedModels: result?.Models?.Number,
    hasMoreTieModels: result?.Models?.More,
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
    ...(recoveryProbe ? { recoveryProbe } : {}),
    ...(freshWorkerProbe ? { freshWorkerProbe } : {}),
    validAgainstBfs: valid
  }));
  if (!valid) {
    process.exitCode = 2;
  }
}
