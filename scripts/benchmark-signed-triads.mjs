import { performance } from "node:perf_hooks";
import {
  buildAspFactsFromGraph,
  normalizeGraphData
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildSignedTriadProgram,
  parseSignedTriadResults,
  prepareSignedTriads
} from "../src/lib/kliqueasp/graph/signedTriadTask.ts";
import { buildSignedTriadCsv } from "../src/lib/kliqueasp/graph/signedTriadCsvExport.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const seed = 20_261_025;
const repetitions = 3;
const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label", groupFields: ["$.group"] },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      direction: "undirected",
      identity: "multigraph",
      attributes: { polarity: "$.sign" }
    }
  },
  graphAnalysis: {
    signedTriads: {
      attribute: "polarity",
      positiveValues: ["+"],
      negativeValues: ["-"]
    }
  }
};

function makeRandom(seedValue) {
  let state = seedValue >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function makeFixture({ nodes: nodeCount, probability }, caseSeed) {
  const random = makeRandom(caseSeed);
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index}`,
    group: "all"
  }));
  const edges = [];
  for (let source = 0; source < nodeCount; source += 1) {
    for (let target = source + 1; target < nodeCount; target += 1) {
      if (random() >= probability) continue;
      edges.push({
        id: `e${source}_${target}`,
        source: `n${source}`,
        target: `n${target}`,
        sign: random() < 0.5 ? "+" : "-"
      });
    }
  }
  return { nodes, edges };
}

function countReferenceTriads(nodes, edges) {
  const polarityByPair = new Map();
  const adjacency = Array.from({ length: nodes.length }, () => new Uint8Array(nodes.length));
  for (const edge of edges) {
    const source = Number(edge.source.slice(1));
    const target = Number(edge.target.slice(1));
    adjacency[source][target] = 1;
    adjacency[target][source] = 1;
    polarityByPair.set(`${source}:${target}`, edge.sign === "-" ? 1 : 0);
  }

  let total = 0;
  let balanced = 0;
  for (let first = 0; first < nodes.length; first += 1) {
    for (let second = first + 1; second < nodes.length; second += 1) {
      if (!adjacency[first][second]) continue;
      for (let third = second + 1; third < nodes.length; third += 1) {
        if (!adjacency[first][third] || !adjacency[second][third]) continue;
        total += 1;
        const negatives =
          polarityByPair.get(`${first}:${second}`) +
          polarityByPair.get(`${first}:${third}`) +
          polarityByPair.get(`${second}:${third}`);
        if (negatives % 2 === 0) balanced += 1;
      }
    }
  }
  return { total, balanced, unbalanced: total - balanced };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

const cases = [
  { nodes: 32, probability: 0.1 },
  { nodes: 40, probability: 0.25 },
  { nodes: 48, probability: 0.5 },
  { nodes: 56, probability: 0.75 },
  ...(process.argv.includes("--stress") ? [
    { nodes: 72, probability: 0.85 },
    { nodes: 96, probability: 0.8 }
  ] : [])
];
const measurements = [];

for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
  const benchmarkCase = cases[caseIndex];
  const dataset = makeFixture(benchmarkCase, seed + caseIndex);
  const normalizationStartedAt = performance.now();
  const graph = normalizeGraphData(dataset, graphConfig);
  const normalizationMs = performance.now() - normalizationStartedAt;
  if (!graph.valid || graph.direction !== "undirected") {
    throw new Error(`Invalid fixture: ${JSON.stringify(graph.diagnostics)}`);
  }

  const facts = buildAspFactsFromGraph(graph);
  const preparationStartedAt = performance.now();
  const preparation = prepareSignedTriads(
    graphConfig.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"])
  );
  const preparationMs = performance.now() - preparationStartedAt;
  if (!preparation.available) {
    throw new Error(`Signed triad preparation failed: ${preparation.reasons.join("; ")}`);
  }

  const programStartedAt = performance.now();
  const program = `${facts.facts}\n${buildSignedTriadProgram(preparation)}`;
  const programBuildMs = performance.now() - programStartedAt;
  const expected = countReferenceTriads(dataset.nodes, dataset.edges);
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const wasmMemoryBaseline = runner.getWasmLinearMemoryStats();
  const solverWallSamplesMs = [];
  const parseSamplesMs = [];
  const endToEndSamplesMs = [];
  const clingoTimingSamplesMs = [];
  let groundingStats;
  let finalResults;

  const warmup = await runner.run(program, ["--stats=2"]);
  if (warmup.Result !== "SATISFIABLE") {
    throw new Error(`Warm-up failed for ${benchmarkCase.nodes} nodes: ${warmup.Result}`);
  }

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const startedAt = performance.now();
    const result = await runner.run(program, ["--stats=2"]);
    const solverWallMs = performance.now() - startedAt;
    solverWallSamplesMs.push(solverWallMs);
    if (result.Result !== "SATISFIABLE") {
      throw new Error(`Expected complete triad enumeration, received ${result.Result}`);
    }
    if (Number(result.Models?.Number) !== 1 || result.Models?.More !== "no") {
      throw new Error(`Expected one complete stable model, got ${JSON.stringify(result.Models)}`);
    }
    const totalSeconds = Number(result.Time?.Total);
    const solveSeconds = Number(result.Time?.Solve);
    if (!result.Stats?.LP || !Number.isFinite(totalSeconds) || !Number.isFinite(solveSeconds)) {
      throw new Error(`Missing clingo timings or grounding statistics for ${benchmarkCase.nodes} nodes`);
    }
    clingoTimingSamplesMs.push({
      total: totalSeconds * 1000,
      solve: solveSeconds * 1000,
      preSolve: Math.max(0, totalSeconds - solveSeconds) * 1000
    });
    groundingStats = result.Stats.LP;
    const parseStartedAt = performance.now();
    finalResults = parseSignedTriadResults(
      result.Call?.[0]?.Witnesses,
      facts.reverseIndex,
      preparation.dyads
    );
    const parseMs = performance.now() - parseStartedAt;
    parseSamplesMs.push(parseMs);
    endToEndSamplesMs.push(solverWallMs + parseMs);
  }

  const observed = {
    total: finalResults.length,
    balanced: finalResults.filter((triad) => triad.balanced).length,
    unbalanced: finalResults.filter((triad) => !triad.balanced).length
  };
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(`ASP/reference mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(observed)}`);
  }

  const csvBuildStartedAt = performance.now();
  const csv = buildSignedTriadCsv(finalResults);
  const csvBuildMs = performance.now() - csvBuildStartedAt;
  const csvDataRows = csv.split("\n").length - 1;
  if (csvDataRows !== observed.total) {
    throw new Error(`CSV row count mismatch: expected ${observed.total}, received ${csvDataRows}`);
  }
  const csvBytesUtf8 = Buffer.byteLength(csv, "utf8");

  measurements.push({
    nodes: graph.nodes.length,
    edgeRecords: graph.links.length,
    requestedDensity: benchmarkCase.probability,
    realizedDensity: Number((2 * graph.links.length / (graph.nodes.length * (graph.nodes.length - 1))).toFixed(4)),
    signedDyads: preparation.dyads.length,
    completeTriangles: observed.total,
    balancedTriangles: observed.balanced,
    unbalancedTriangles: observed.unbalanced,
    csvDataRows,
    csvBytesUtf8,
    csvBuildMs: Number(csvBuildMs.toFixed(2)),
    randomSeed: seed + caseIndex,
    normalizationMs: Number(normalizationMs.toFixed(2)),
    preparationMs: Number(preparationMs.toFixed(2)),
    programBuildMs: Number(programBuildMs.toFixed(2)),
    programBytes: Buffer.byteLength(program, "utf8"),
    warmupRuns: 1,
    repetitions,
    solverWallMsMedian: Number(median(solverWallSamplesMs).toFixed(2)),
    solverWallMsSamples: solverWallSamplesMs.map((value) => Number(value.toFixed(2))),
    parserMsMedian: Number(median(parseSamplesMs).toFixed(2)),
    endToEndSolverAndParserMsMedian: Number(median(endToEndSamplesMs).toFixed(2)),
    clingoMsMedian: {
      total: Number(median(clingoTimingSamplesMs.map((timing) => timing.total)).toFixed(2)),
      solve: Number(median(clingoTimingSamplesMs.map((timing) => timing.solve)).toFixed(2)),
      preSolve: Number(median(clingoTimingSamplesMs.map((timing) => timing.preSolve)).toFixed(2))
    },
    grounding: {
      atoms: groundingStats.Atoms,
      originalRules: groundingStats.Rules?.Original,
      finalRules: groundingStats.Rules?.Final
    },
    wasmLinearMemory: {
      baselineBytes: wasmMemoryBaseline.currentBytes,
      ...runner.getWasmLinearMemoryStats()
    },
    complete: true
  });
}

console.log(JSON.stringify({
  note: "Fixed-seed synthetic simple undirected graphs. Each run enumerates all balanced and unbalanced triangles; counts are checked against an independent adjacency/parity implementation and CSV row count before reporting. CSV timing covers in-memory serialization only, not Blob creation, browser download, or peak JavaScript heap. Wall time includes worker harness overhead. Clingo Total-Solve is preSolve (parsing, grounding, and setup), not a pure grounding timer. WASM linear memory excludes JavaScript heap and process RSS. Three measured repetitions follow one warm-up per case; medians and samples are reported.",
  seed,
  measurements
}, null, 2));
