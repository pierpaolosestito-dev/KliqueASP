import { performance } from "node:perf_hooks";
import dataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import { buildAspFactsFromGraph, getGraphEndpointId, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMinimumHopPathProgram,
  buildPathEdgeFacts,
  parseWitnessMinimumHopPathWitness
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

function findDiameterPair(graph) {
  const adjacency = new Map(graph.nodes.map((node) => [String(node.id), new Set()]));
  for (const link of graph.links) {
    const source = String(getGraphEndpointId(link.source));
    const target = String(getGraphEndpointId(link.target));
    adjacency.get(source)?.add(target);
    adjacency.get(target)?.add(source);
  }

  let result = { source: "", target: "", distance: -1 };
  let componentCount = 0;
  const seen = new Set();
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    componentCount += 1;
    const distances = new Map([[start, 0]]);
    const queue = [start];
    seen.add(start);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const distance = distances.get(current);
      if (distance > result.distance) result = { source: start, target: current, distance };
      for (const neighbor of adjacency.get(current) ?? []) {
        if (distances.has(neighbor)) continue;
        distances.set(neighbor, distance + 1);
        seen.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return { ...result, componentCount };
}

const numericArgs = process.argv.slice(2).filter((argument) => /^\d+$/.test(argument)).map(Number);
const maximumLength = numericArgs[0] ?? 12;
const repetitions = numericArgs[1] ?? 3;
const explainMinimality = process.argv.includes("explain") || process.argv.includes("--explain");
if (!Number.isSafeInteger(maximumLength) || maximumLength < 0 || maximumLength > 100) {
  throw new RangeError("maximumLength must be an integer between 0 and 100");
}
if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 20) {
  throw new RangeError("repetitions must be an integer between 1 and 20");
}

const graph = normalizeGraphData(dataset);
if (!graph.valid || graph.direction !== "undirected") {
  throw new Error(`Psychology graph is not a valid undirected projection: ${JSON.stringify(graph.diagnostics)}`);
}
const pair = findDiameterPair(graph);
if (pair.distance < 0) throw new Error("The graph has no nodes");
const asp = buildAspFactsFromGraph(graph);
const pathFacts = buildPathEdgeFacts(graph.links, asp.indexByNodeId);
const startNode = asp.indexByNodeId.get(pair.source);
const goalNode = asp.indexByNodeId.get(pair.target);
if (!startNode || !goalNode) throw new Error("The BFS diameter endpoints are absent from the ASP index");

const runner = await createClingoWasmRunner();
const program = [
  asp.facts.trim(),
  pathFacts.facts.trim(),
  buildMinimumHopPathProgram(startNode, goalNode, maximumLength, "", graph.direction, explainMinimality)
].filter(Boolean).join("\n\n");
console.log(JSON.stringify({
  stage: "asp-started",
  nodes: graph.nodes.length,
  edges: graph.links.length,
  componentCount: pair.componentCount,
  maximumLength,
  repetitions,
  explainMinimality,
  bfsDiameterDistance: pair.distance,
  source: pair.source,
  target: pair.target
}));
const elapsedSamplesMs = [];
let result;
for (let repetition = 0; repetition < repetitions; repetition += 1) {
  const startedAt = performance.now();
  result = await runner.run(program, [], 1);
  elapsedSamplesMs.push(performance.now() - startedAt);
  if (result?.Result !== "SATISFIABLE") break;
}
const orderedSamples = [...elapsedSamplesMs].sort((left, right) => left - right);
const elapsedMsMedian = orderedSamples[Math.floor(orderedSamples.length / 2)];
const witness = parseWitnessMinimumHopPathWitness(
  result?.Call?.[0]?.Witnesses,
  asp.reverseIndex,
  pathFacts.reverseEdgeIndex,
  true
);
console.log(JSON.stringify({
  stage: "asp-finished",
  solver: result?.Solver,
  status: result?.Result,
  elapsedMsMedian: Number(elapsedMsMedian?.toFixed(2)),
  elapsedMsSamples: elapsedSamplesMs.map((elapsed) => Number(elapsed.toFixed(2))),
  pathLength: witness?.nodeIds ? witness.nodeIds.length - 1 : null,
  source: witness?.nodeIds?.[0],
  target: witness?.nodeIds?.at(-1),
  validAgainstBfs: result?.Result === "SATISFIABLE" && witness?.nodeIds?.length - 1 === pair.distance,
  certificateAvailable: !explainMinimality || Boolean(witness?.minimalityCertificate),
  error: result?.Error
}, null, 2));
if (result?.Result !== "SATISFIABLE" || !witness || witness.nodeIds.length - 1 !== pair.distance) {
  process.exitCode = 2;
}
