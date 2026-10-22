import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildTypedPathProgram } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", typeField: "$.type" },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      typeField: "$.type",
      direction: "undirected",
      identity: "multigraph"
    }
  }
};

function makeFixture({ routeLength, nodeCount }) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node_${index}`,
    type: "benchmark-node"
  }));
  const edges = [];
  const edgeTypeSequence = [];

  for (let index = 0; index < routeLength; index += 1) {
    const type = index % 2 === 0 ? "relation-a" : "relation-b";
    edgeTypeSequence.push(type);
    edges.push({
      id: `route-edge-${index}`,
      source: `node_${index}`,
      target: `node_${index + 1}`,
      type
    });
  }

  // Extra disjoint records increase the candidate and grounding domains while
  // leaving exactly one component connecting the selected endpoints.
  let next = routeLength + 1;
  let noiseEdge = 0;
  while (next + 2 < nodeCount) {
    const type = noiseEdge % 2 === 0 ? "relation-a" : "relation-b";
    edges.push({
      id: `noise-edge-${noiseEdge}`,
      source: `node_${next}`,
      target: `node_${next + 1}`,
      type
    });
    next += 2;
    noiseEdge += 1;
  }

  return { nodes, edges, edgeTypeSequence };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

const cases = [
  ...[1, 8, 16, 32, 64].map((routeLength) => ({
    name: `sequence-${routeLength}`,
    routeLength,
    nodeCount: routeLength + 1
  })),
  ...[34, 100, 200].map((nodeCount) => ({
    name: `graph-${nodeCount}`,
    routeLength: 16,
    nodeCount: Math.max(nodeCount, 17)
  }))
];

const runner = await createClingoWasmRunner();
const measurements = [];
const repetitions = 3;

for (const benchmarkCase of cases) {
  const fixture = makeFixture(benchmarkCase);
  const graph = normalizeGraphData(fixture, graphConfig);
  if (!graph.valid) throw new Error(`${benchmarkCase.name}: ${JSON.stringify(graph.diagnostics)}`);

  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedPathProgram({
    startNode: facts.indexByNodeId.get("node_0"),
    goalNode: facts.indexByNodeId.get(`node_${benchmarkCase.routeLength}`),
    edgeTypeSequence: fixture.edgeTypeSequence,
    direction: graph.direction
  });
  const program = `${facts.facts}\n${compiled}`;
  const elapsedSamplesMs = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const startedAt = performance.now();
    const result = await runner.run(program, [], 1);
    elapsedSamplesMs.push(performance.now() - startedAt);
    if (result.Result !== "SATISFIABLE") {
      throw new Error(`${benchmarkCase.name}: expected a witness, received ${result.Result}`);
    }
  }

  measurements.push({
    case: benchmarkCase.name,
    nodes: graph.nodes.length,
    edges: graph.links.length,
    sequenceLength: fixture.edgeTypeSequence.length,
    programBytes: Buffer.byteLength(program, "utf8"),
    repetitions,
    elapsedMsMedian: Number(median(elapsedSamplesMs).toFixed(2)),
    elapsedMsSamples: elapsedSamplesMs.map((value) => Number(value.toFixed(2))),
    returnedWitnessLimit: 1,
    result: "SATISFIABLE"
  });
}

console.log(JSON.stringify({
  note: "Elapsed time includes ASP grounding and solving. Each run requests one witness, not full enumeration. The shipped worker does not expose solver peak memory or detailed statistics.",
  measurements
}, null, 2));
