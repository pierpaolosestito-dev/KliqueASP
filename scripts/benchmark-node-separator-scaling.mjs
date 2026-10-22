import { performance } from "node:perf_hooks";
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMinimumNodeSeparatorProgram,
  getStructuralSolverOptions,
  parseWitnessRemovedNodeSets,
  selectMinimumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const repetitions = 3;
const davisConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id" },
    edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target", direction: "undirected", identity: "multigraph" }
  }
};

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

function vertexConnectivityByDinic(nodes, edges, source, target) {
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const sourceIndex = indexById.get(source);
  const targetIndex = indexById.get(target);
  if (sourceIndex === undefined || targetIndex === undefined) throw new Error("Dinic terminals missing");

  const graph = Array.from({ length: nodes.length * 2 }, () => []);
  const addArc = (from, to, capacity) => {
    const forward = { to, capacity, reverse: graph[to].length };
    const backward = { to: from, capacity: 0, reverse: graph[from].length };
    graph[from].push(forward);
    graph[to].push(backward);
  };
  const inNode = (index) => index * 2;
  const outNode = (index) => index * 2 + 1;
  const infiniteCapacity = nodes.length + 1;

  for (let index = 0; index < nodes.length; index += 1) {
    addArc(inNode(index), outNode(index), index === sourceIndex || index === targetIndex ? infiniteCapacity : 1);
  }
  for (const edge of edges) {
    const left = indexById.get(edge.source);
    const right = indexById.get(edge.target);
    if (left === undefined || right === undefined) throw new Error("Dinic edge endpoint missing");
    addArc(outNode(left), inNode(right), infiniteCapacity);
    addArc(outNode(right), inNode(left), infiniteCapacity);
  }

  let totalFlow = 0;
  while (true) {
    const level = Array(graph.length).fill(-1);
    level[outNode(sourceIndex)] = 0;
    const queue = [outNode(sourceIndex)];
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      for (const arc of graph[current]) {
        if (arc.capacity <= 0 || level[arc.to] !== -1) continue;
        level[arc.to] = level[current] + 1;
        queue.push(arc.to);
      }
    }
    if (level[inNode(targetIndex)] === -1) break;

    const nextArc = Array(graph.length).fill(0);
    const send = (current, amount) => {
      if (current === inNode(targetIndex)) return amount;
      for (; nextArc[current] < graph[current].length; nextArc[current] += 1) {
        const arc = graph[current][nextArc[current]];
        if (arc.capacity <= 0 || level[arc.to] !== level[current] + 1) continue;
        const pushed = send(arc.to, Math.min(amount, arc.capacity));
        if (pushed === 0) continue;
        arc.capacity -= pushed;
        graph[arc.to][arc.reverse].capacity += pushed;
        return pushed;
      }
      return 0;
    };

    while (true) {
      const pushed = send(outNode(sourceIndex), infiniteCapacity);
      if (pushed === 0) break;
      totalFlow += pushed;
      if (totalFlow >= infiniteCapacity) return null;
    }
  }
  return totalFlow;
}

function validateDinicReference() {
  const fixtures = [
    {
      name: "chain",
      nodes: Array.from({ length: 6 }, (_, index) => ({ id: `chain_${index}` })),
      edges: Array.from({ length: 5 }, (_, index) => ({ source: `chain_${index}`, target: `chain_${index + 1}` })),
      source: "chain_0",
      target: "chain_5",
      expected: 1
    },
    {
      name: "two-disjoint-paths",
      nodes: ["s", "a", "b", "t"].map((id) => ({ id })),
      edges: [{ source: "s", target: "a" }, { source: "a", target: "t" }, { source: "s", target: "b" }, { source: "b", target: "t" }],
      source: "s",
      target: "t",
      expected: 2
    },
    {
      name: "direct-terminal-edge",
      nodes: ["s", "a", "t"].map((id) => ({ id })),
      edges: [{ source: "s", target: "t" }, { source: "s", target: "a" }, { source: "a", target: "t" }],
      source: "s",
      target: "t",
      expected: null
    },
    {
      name: "already-disconnected",
      nodes: ["s", "a", "b", "t"].map((id) => ({ id })),
      edges: [{ source: "s", target: "a" }, { source: "b", target: "t" }],
      source: "s",
      target: "t",
      expected: 0
    }
  ];
  for (const fixture of fixtures) {
    const result = vertexConnectivityByDinic(fixture.nodes, fixture.edges, fixture.source, fixture.target);
    if (result !== fixture.expected) {
      throw new Error(`Dinic reference failed ${fixture.name}: expected ${fixture.expected}, received ${result}`);
    }
  }
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

validateDinicReference();
const profiles = [
  ...[34, 100, 250, 500, 1000].map((nodeCount) => ({
    family: "cycle",
    size: nodeCount,
    fixture: makeCycle(nodeCount),
    sourceId: "node_0",
    goalId: `node_${Math.floor(nodeCount / 2)}`,
    expectedCutSize: 2
  })),
  { family: "path", size: 100, fixture: makePath(100), sourceId: "node_0", goalId: "node_99", expectedCutSize: 1 },
  { family: "star", size: 100, fixture: makeStar(100), sourceId: "node_1", goalId: "node_99", expectedCutSize: 1 },
  { family: "grid", size: "10x10", fixture: makeGrid(10), sourceId: "node_0", goalId: "node_99", expectedCutSize: 2 },
  {
    family: "Davis Southern Women",
    size: "32x89",
    fixture: davisDataset,
    config: davisConfig,
    sourceId: "Evelyn Jefferson",
    goalId: "E14"
  }
];

for (const profile of profiles) {
  const { family, size, fixture, sourceId, goalId } = profile;
  const graph = normalizeGraphData(fixture, profile.config);
  if (!graph.valid || graph.direction !== "undirected") {
    throw new Error(`Invalid ${family} graph: ${JSON.stringify(graph.diagnostics)}`);
  }
  const referenceStartedAt = performance.now();
  const expectedCutSize = vertexConnectivityByDinic(fixture.nodes, fixture.edges, sourceId, goalId);
  const dinicElapsedMs = performance.now() - referenceStartedAt;
  if (expectedCutSize !== profile.expectedCutSize && profile.expectedCutSize !== undefined) {
    throw new Error(`${family} vertex connectivity should be ${profile.expectedCutSize}, got ${expectedCutSize}`);
  }

  const facts = buildAspFactsFromGraph(graph);
  const normalizedSourceId = normalizedNodeIdForSource(graph, sourceId);
  const normalizedGoalId = normalizedNodeIdForSource(graph, goalId);
  const program = `${facts.facts}\n\n${buildMinimumNodeSeparatorProgram(
    facts.indexByNodeId.get(normalizedSourceId),
    facts.indexByNodeId.get(normalizedGoalId)
  )}\n`;
  const elapsedSamplesMs = [];
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  let result;
  let optimumSeparators = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const startedAt = performance.now();
    result = await runner.run(program, ["--stats=2", ...getStructuralSolverOptions("minimumNodeSeparator")]);
    elapsedSamplesMs.push(performance.now() - startedAt);
    if (result?.Result === "OPTIMUM FOUND") {
      optimumSeparators = selectMinimumNodeSets(
        parseWitnessRemovedNodeSets(result?.Call?.[0]?.Witnesses, facts.reverseIndex)
      );
    } else {
      break;
    }
  }
  const aspCutSize = optimumSeparators[0]?.length ?? null;
  const valid = result?.Result === "OPTIMUM FOUND" && aspCutSize === expectedCutSize;
  console.log(JSON.stringify({
    graphFamily: family,
    profileSize: size,
    nodes: graph.nodes.length,
    edges: graph.links.length,
    terminals: [sourceId, goalId],
    dinicCutSize: expectedCutSize,
    aspCutSize,
    aspOptimumCountReturned: optimumSeparators.length,
    aspInputBytes: Buffer.byteLength(program, "utf8"),
    repetitions: elapsedSamplesMs.length,
    aspWallMsMedian: elapsedSamplesMs.length ? Number(median(elapsedSamplesMs).toFixed(2)) : null,
    aspWallMsSamples: elapsedSamplesMs.map((value) => Number(value.toFixed(2))),
    dinicMs: Number(dinicElapsedMs.toFixed(3)),
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
    validAgainstDinic: valid
  }));
  if (!valid) {
    process.exitCode = 2;
    break;
  }
}
