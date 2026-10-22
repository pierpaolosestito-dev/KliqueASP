import { performance } from "node:perf_hooks";
import psychologyDataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildKCorePeelingRoundFacts, buildKCorePeelingRoundProgram, buildKCoreProgram, computeKCorePeelingRoundCount, getStructuralSolverOptions, parseWitnessNodeSets, selectMaximumNodeSets } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createKCoreBenchmarkFixture, supportedKCoreBenchmarkTopologies } from "./kcore-benchmark-fixtures.mjs";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const explainPeeling = process.argv.includes("--explain");
const iterativePeeling = process.argv.includes("--iterative");
const psychologyFixture = process.argv.includes("--psychology");
const requestedNodeCountArgument = process.argv.find((argument) => argument.startsWith("--nodes="));
const requestedNodeCount = requestedNodeCountArgument
  ? Number(requestedNodeCountArgument.slice("--nodes=".length))
  : undefined;
const requestedTopologyArgument = process.argv.find((argument) => argument.startsWith("--topology="));
const requestedTopology = requestedTopologyArgument
  ? requestedTopologyArgument.slice("--topology=".length)
  : "cycle-with-tail";
const requestedRoundFactsArgument = process.argv.find((argument) => argument.startsWith("--round-facts="));
const roundFactsMode = requestedRoundFactsArgument
  ? requestedRoundFactsArgument.slice("--round-facts=".length)
  : "active";
const repetitions = explainPeeling ? 1 : 3;
if (requestedNodeCount !== undefined &&
    (!Number.isSafeInteger(requestedNodeCount) || requestedNodeCount < 3 || psychologyFixture)) {
  throw new Error("--nodes deve essere un intero sicuro >= 3 e non si può combinare con --psychology");
}
if (!supportedKCoreBenchmarkTopologies.includes(requestedTopology) ||
    (psychologyFixture && requestedTopologyArgument !== undefined)) {
  throw new Error(`--topology deve essere uno di ${supportedKCoreBenchmarkTopologies.join(", ")} e non si può combinare con --psychology`);
}
if (roundFactsMode !== "active" && roundFactsMode !== "full") {
  throw new Error("--round-facts must be active or full");
}
if (roundFactsMode !== "active" && !iterativePeeling) {
  throw new Error("--round-facts=full requires --iterative");
}
const nodeCounts = requestedNodeCount !== undefined
  ? [requestedNodeCount]
  : psychologyFixture ? [335] : explainPeeling ? [34, 100, 250, 335, 500, 600] : [34, 100, 250, 500, 1000];

if (iterativePeeling && !explainPeeling) {
  throw new Error("--iterative richiede anche --explain");
}

function peelKCore(nodes, edges, k) {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  for (const edge of edges) {
    adjacency.get(edge.source).add(edge.target);
    adjacency.get(edge.target).add(edge.source);
  }
  const active = new Set(adjacency.keys());
  const queue = [...active].filter((nodeId) => adjacency.get(nodeId).size < k);
  for (let head = 0; head < queue.length; head += 1) {
    const nodeId = queue[head];
    if (!active.delete(nodeId)) continue;
    for (const neighbor of adjacency.get(nodeId)) {
      if (active.has(neighbor) && [...adjacency.get(neighbor)].filter((candidate) => active.has(candidate)).length < k) {
        queue.push(neighbor);
      }
    }
  }
  return [...active].sort();
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

async function runIterativeAspPeeling(runner, graph, k, fullFacts) {
  // Match the one-based ASP indices and exact round program used by GraphApp.
  const indexById = new Map(graph.nodes.map((node, index) => [node.id, index + 1]));
  const nodeCount = graph.nodes.length;
  const active = new Set(Array.from({ length: nodeCount }, (_, index) => index + 1));
  const adjacency = new Map(Array.from(active, (index) => [index, new Set()]));
  for (const link of graph.links) {
    const source = indexById.get(link.source);
    const target = indexById.get(link.target);
    if (source === undefined || target === undefined || source === target) continue;
    adjacency.get(source).add(target);
    adjacency.get(target).add(source);
  }
  const edgeIndexPairs = [];
  for (const [source, neighbors] of adjacency) {
    for (const target of neighbors) {
      if (source < target) edgeIndexPairs.push([source, target]);
    }
  }
  const rounds = [];
  const cumulativeStats = { atoms: 0, originalRules: 0, finalRules: 0, variables: 0, choices: 0, conflicts: 0 };
  let cumulativeClingoMs = 0;
  let totalInputBytes = 0;
  let queryCount = 0;
  let terminalResult;

  while (true) {
    const activeIndices = [...active].sort((left, right) => left - right);
    const roundFacts = roundFactsMode === "full"
      ? fullFacts
      : buildKCorePeelingRoundFacts(activeIndices, edgeIndexPairs, new Map(), "undirected");
    const roundProgram = buildKCorePeelingRoundProgram(k, activeIndices, "", "undirected");
    const program = `${roundFacts}\n\n${roundProgram}`;
    totalInputBytes += Buffer.byteLength(program, "utf8");
    terminalResult = await runner.run(program, ["--stats=2"]);
    queryCount += 1;
    cumulativeClingoMs += Number(terminalResult?.Time?.Total ?? 0) * 1000;

    const stats = terminalResult?.Stats;
    cumulativeStats.atoms += Number(stats?.LP?.Atoms ?? 0);
    cumulativeStats.originalRules += Number(stats?.LP?.Rules?.Original ?? 0);
    cumulativeStats.finalRules += Number(stats?.LP?.Rules?.Final ?? 0);
    cumulativeStats.variables += Number(stats?.Problem?.Variables ?? 0);
    cumulativeStats.choices += Number(stats?.Core?.Choices ?? 0);
    cumulativeStats.conflicts += Number(stats?.Core?.Conflicts ?? 0);
    if (terminalResult?.Result !== "SATISFIABLE") {
      throw new Error(`iterative peeling query ${queryCount} returned ${terminalResult?.Result ?? "no result"}`);
    }

    const shown = terminalResult?.Call?.[0]?.Witnesses?.[0]?.Value ?? [];
    const peeled = new Set(shown.flatMap((atom) => {
      const match = /^peeled\((\d+)\)$/.exec(atom);
      return match ? [Number(match[1])] : [];
    }));
    const supports = new Set(shown.flatMap((atom) => {
      const match = /^peel_support\((\d+),(\d+)\)$/.exec(atom);
      return match ? [`${Number(match[1])},${Number(match[2])}`] : [];
    }));
    const expectedPeeled = new Set([...active].filter((node) =>
      [...adjacency.get(node)].filter((neighbor) => active.has(neighbor)).length < k
    ));
    if ([...peeled].sort((left, right) => left - right).join(",") !==
        [...expectedPeeled].sort((left, right) => left - right).join(",")) {
      throw new Error(`iterative ASP peel disagrees with independent degree check at round ${rounds.length + 1}`);
    }
    const expectedSupports = new Set([...peeled].flatMap((node) =>
      [...adjacency.get(node)].filter((neighbor) => active.has(neighbor)).map((neighbor) => `${node},${neighbor}`)
    ));
    if ([...supports].sort().join(";") !== [...expectedSupports].sort().join(";")) {
      throw new Error(`iterative ASP support disagrees at round ${rounds.length + 1}`);
    }
    if (peeled.size === 0) break;
    rounds.push(peeled.size);
    for (const node of peeled) active.delete(node);
  }

  return {
    core: [...active].map((index) => graph.nodes[index - 1].id).sort(),
    rounds,
    queryCount,
    totalInputBytes,
    cumulativeClingoMs: Number(cumulativeClingoMs.toFixed(2)),
    cumulativeStats,
    terminalResult: terminalResult?.Result
  };
}

for (const nodeCount of nodeCounts) {
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const fixture = psychologyFixture
    ? psychologyDataset
    : createKCoreBenchmarkFixture(requestedTopology, nodeCount);
  const graph = normalizeGraphData(fixture);
  if (!graph.valid || graph.direction !== "undirected") {
    throw new Error(`Invalid synthetic graph: ${JSON.stringify(graph.diagnostics)}`);
  }
  const facts = buildAspFactsFromGraph(graph);
  const kValues = psychologyFixture ? [2, 3] : [2];
  if (iterativePeeling) {
    for (const k of kValues) {
      const startedAt = performance.now();
      const iterative = await runIterativeAspPeeling(runner, graph, k, facts.facts);
      const elapsedWallMs = performance.now() - startedAt;
      const expectedCore = peelKCore(graph.nodes, graph.links, k);
      const valid = iterative.terminalResult === "SATISFIABLE" &&
        iterative.core.join("\u0000") === expectedCore.join("\u0000") &&
        iterative.rounds.length === computeKCorePeelingRoundCount(graph.nodes.map((node) => node.id), graph.links, k);
      console.log(JSON.stringify({
        dataset: psychologyFixture ? "psychology" : requestedTopology,
        nodes: graph.nodes.length,
        edges: graph.links.length,
        k,
        explainPeeling,
        peelingStrategy: "iterative ASP query per synchronous round",
        roundFactsMode,
        peelingRounds: iterative.rounds.length,
        queryCount: iterative.queryCount,
        expectedCoreSize: expectedCore.length,
        aspCoreSize: iterative.core.length,
        aspInputBytesAcrossQueries: iterative.totalInputBytes,
        elapsedWallMs: Number(elapsedWallMs.toFixed(2)),
        cumulativeClingoTimeMs: iterative.cumulativeClingoMs,
        cumulativeGroundingAndSolverStats: iterative.cumulativeStats,
        wasmMemory: runner.getWasmLinearMemoryStats(),
        processMemory: {
          currentRssBytes: process.memoryUsage().rss,
          peakRssBytes: process.resourceUsage().maxRSS * 1024,
          scope: requestedNodeCount === undefined ? "cumulative benchmark process" : "single graph profile"
        },
        result: iterative.terminalResult,
        validAgainstPeeling: valid
      }));
      if (!valid) {
        process.exitCode = 2;
        break;
      }
    }
    if (process.exitCode === 2) break;
    continue;
  }
  for (const k of kValues) {
    const peelingRounds = explainPeeling
      ? computeKCorePeelingRoundCount(graph.nodes.map((node) => node.id), graph.links, k)
      : undefined;
    const program = `${facts.facts}\n\n${buildKCoreProgram(
      k,
      "",
      explainPeeling,
      "undirected",
      undefined,
      peelingRounds
    )}\n`;
    const elapsedSamplesMs = [];
    let result;
    let aspCore;
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      const startedAt = performance.now();
      result = await runner.run(program, ["--stats=2", ...getStructuralSolverOptions("kCore")]);
      elapsedSamplesMs.push(performance.now() - startedAt);
      aspCore = selectMaximumNodeSets(
        parseWitnessNodeSets(result?.Call?.[0]?.Witnesses, facts.reverseIndex)
      )[0] ?? [];
      if (result?.Result !== "OPTIMUM FOUND") break;
    }
    const expectedCore = peelKCore(graph.nodes, graph.links, k);
    const valid = result?.Result === "OPTIMUM FOUND" &&
      [...aspCore].sort().join("\u0000") === expectedCore.join("\u0000") &&
      (fixture.coreSize === undefined || expectedCore.length === fixture.coreSize);
    console.log(JSON.stringify({
      dataset: psychologyFixture ? "psychology" : requestedTopology,
      nodes: graph.nodes.length,
      edges: graph.links.length,
      k,
      explainPeeling,
      peelingRounds: peelingRounds ?? null,
      expectedCoreSize: expectedCore.length,
      aspCoreSize: aspCore.length,
      aspInputBytes: Buffer.byteLength(program, "utf8"),
      repetitions: elapsedSamplesMs.length,
      elapsedWallMsMedian: Number(median(elapsedSamplesMs).toFixed(2)),
      elapsedWallMsSamples: elapsedSamplesMs.map((value) => Number(value.toFixed(2))),
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
      processMemory: {
        currentRssBytes: process.memoryUsage().rss,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        scope: requestedNodeCount === undefined ? "cumulative benchmark process" : "single graph profile"
      },
      result: result?.Result,
      validAgainstPeeling: valid
    }));
    if (!valid) {
      process.exitCode = 2;
      break;
    }
  }
  if (process.exitCode === 2) break;
}
