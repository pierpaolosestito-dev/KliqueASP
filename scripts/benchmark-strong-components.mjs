import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildStronglyConnectedComponentsProgram,
  parseWitnessStrongComponents
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const stress = process.argv.includes("--stress");
const profiles = stress
  ? [34, 100, 250, 500].flatMap((size) => ["chain", "cycle"].map((shape) => [size, shape]))
  : [[34, "chain"], [34, "cycle"], [100, "chain"], [100, "cycle"], [250, "chain"], [250, "cycle"]];

function makeDirectedGraph(size, shape) {
  const nodes = Array.from({ length: size }, (_, index) => ({ id: `node_${index}` }));
  const edges = Array.from({ length: shape === "cycle" ? size : size - 1 }, (_, index) => ({
    source: `node_${index}`,
    target: `node_${(index + 1) % size}`
  }));
  return { nodes, edges };
}

function kosaraju(nodeIds, edges) {
  const outgoing = new Map(nodeIds.map((node) => [node, []]));
  const incoming = new Map(nodeIds.map((node) => [node, []]));
  for (const { source, target } of edges) {
    outgoing.get(source).push(target);
    incoming.get(target).push(source);
  }
  const visited = new Set();
  const order = [];
  const visit = (node) => {
    visited.add(node);
    for (const next of outgoing.get(node)) if (!visited.has(next)) visit(next);
    order.push(node);
  };
  for (const node of nodeIds) if (!visited.has(node)) visit(node);
  visited.clear();
  const components = [];
  for (const start of order.reverse()) {
    if (visited.has(start)) continue;
    const component = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const node = stack.pop();
      component.push(node);
      for (const next of incoming.get(node)) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    components.push(component.sort());
  }
  return components.sort((left, right) => left[0].localeCompare(right[0]));
}

function samePartition(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const directedConfig = {
  schemaVersion: 2,
  graphMapping: {
    edge: { sourceField: "$.source", targetField: "$.target", direction: "directed" }
  }
};

for (const [size, shape] of profiles) {
  const graph = normalizeGraphData(makeDirectedGraph(size, shape), directedConfig);
  if (!graph.valid || graph.direction !== "directed") {
    throw new Error(`Invalid directed graph: ${JSON.stringify(graph.diagnostics)}`);
  }
  const asp = buildAspFactsFromGraph(graph);
  const program = `${asp.facts}\n${buildStronglyConnectedComponentsProgram()}\n`;
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const startedAt = performance.now();
  const result = await runner.run(program, ["--stats=2"], 1);
  const elapsedMs = performance.now() - startedAt;
  const actual = parseWitnessStrongComponents(result?.Call?.[0]?.Witnesses, asp.reverseIndex);
  const expected = kosaraju(graph.nodes.map((node) => node.id), graph.links);
  const valid = result?.Result === "SATISFIABLE" && samePartition(actual, expected);
  console.log(JSON.stringify({
    nodes: size,
    directedEdges: graph.links.length,
    topology: shape,
    expectedComponents: expected.length,
    returnedComponents: actual.length,
    aspInputBytes: Buffer.byteLength(program, "utf8"),
    elapsedMs: Number(elapsedMs.toFixed(2)),
    clingoTimeMs: result?.Time?.Total !== undefined
      ? Number((Number(result.Time.Total) * 1000).toFixed(2))
      : null,
    groundAtoms: result?.Stats?.LP?.Atoms ?? null,
    wasmMemory: runner.getWasmLinearMemoryStats(),
    result: result?.Result,
    validAgainstKosaraju: valid
  }));
  if (!valid) {
    process.exitCode = 2;
    break;
  }
}
