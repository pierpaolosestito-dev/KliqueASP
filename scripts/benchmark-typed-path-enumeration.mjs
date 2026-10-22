import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildTypedPathProgram } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id" },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      typeField: "$.type",
      direction: "directed",
      identity: "multigraph"
    }
  }
};

function makeLayeredGraph(depth, branchingFactor, requestedNodeCount = 0) {
  const nodes = [{ id: "start" }, { id: "goal" }];
  const edges = [];
  const layers = Array.from({ length: depth }, (_, layerIndex) =>
    Array.from({ length: branchingFactor }, (_, nodeIndex) => {
      const id = `layer_${layerIndex + 1}_${nodeIndex + 1}`;
      nodes.push({ id });
      return id;
    })
  );

  let edgeIndex = 0;
  const addLayerEdges = (sources, targets) => {
    for (const source of sources) {
      for (const target of targets) {
        edgeIndex += 1;
        edges.push({
          id: `path_edge_${edgeIndex}`,
          source,
          target,
          type: "relation"
        });
      }
    }
  };

  addLayerEdges(["start"], layers[0]);
  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    addLayerEdges(layers[layerIndex], layers[layerIndex + 1]);
  }
  addLayerEdges(layers.at(-1), ["goal"]);

  while (nodes.length < requestedNodeCount) {
    nodes.push({ id: `isolated_${nodes.length + 1}` });
  }

  return { nodes, edges };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const cases = [
  ...[4, 6, 8, 10, 12].map((depth) => ({
    profile: "answer-count",
    depth,
    branchingFactor: 2
  })),
  ...[34, 100, 200].map((nodeCount) => ({
    profile: "graph-size",
    depth: 8,
    branchingFactor: 2,
    requestedNodeCount: nodeCount
  }))
];

async function measureCase(benchmarkCase, repetitions = 3, warmupRuns = 1) {
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const memoryBaseline = runner.getWasmLinearMemoryStats();
  if (memoryBaseline.currentBytes === null) {
    throw new Error("The clingo WASM module did not expose its linear memory");
  }
  const fixture = makeLayeredGraph(
    benchmarkCase.depth,
    benchmarkCase.branchingFactor,
    benchmarkCase.requestedNodeCount
  );
  const graph = normalizeGraphData(fixture, graphConfig);
  if (!graph.valid || !graph.capabilities.edgeTypes.available) {
    throw new Error(`Invalid typed-path enumeration fixture: ${JSON.stringify(graph.diagnostics)}`);
  }

  const facts = buildAspFactsFromGraph(graph);
  const program = `${facts.facts}\n${buildTypedPathProgram({
    startNode: facts.indexByNodeId.get("start"),
    goalNode: facts.indexByNodeId.get("goal"),
    edgeTypeSequence: Array(benchmarkCase.depth + 1).fill("relation"),
    direction: "directed"
  })}`;
  const expectedPaths = benchmarkCase.branchingFactor ** benchmarkCase.depth;
  const samples = [];
  let finalResult;
  const processMemoryBaselineBytes = process.memoryUsage.rss();
  const processMaxRssBeforeRunsBytes = Math.round(process.resourceUsage().maxRSS * 1024);
  if (!Number.isFinite(processMemoryBaselineBytes) || processMemoryBaselineBytes <= 0 ||
    !Number.isFinite(processMaxRssBeforeRunsBytes) || processMaxRssBeforeRunsBytes <= 0) {
    throw new Error("Node did not expose process RSS statistics for this benchmark case");
  }

  for (let warmupIndex = 0; warmupIndex < warmupRuns; warmupIndex += 1) {
    const warmup = await runner.run(program, ["--stats=2"], 0);
    if (warmup.Result !== "SATISFIABLE" || warmup.Models?.More !== "no") {
      throw new Error(`Depth ${benchmarkCase.depth}: warm-up enumeration was incomplete`);
    }
  }

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const startedAt = performance.now();
    finalResult = await runner.run(program, ["--stats=2"], 0);
    const elapsedMs = performance.now() - startedAt;
    if (finalResult.Result !== "SATISFIABLE" || finalResult.Models?.More !== "no") {
      throw new Error(`Depth ${benchmarkCase.depth}: clingo did not complete path enumeration`);
    }
    if (Number(finalResult.Models?.Number) !== expectedPaths) {
      throw new Error(`Depth ${benchmarkCase.depth}: expected ${expectedPaths} paths, got ${finalResult.Models?.Number}`);
    }
    if (!finalResult.Stats?.LP || !finalResult.Stats?.Core) {
      throw new Error("clingo --stats=2 did not return the expected grounding/solver statistics");
    }
    const totalSeconds = finiteNumber(finalResult.Time?.Total);
    const solveSeconds = finiteNumber(finalResult.Time?.Solve);
    if (totalSeconds === null || solveSeconds === null) {
      throw new Error("clingo --stats=2 did not return total and solve times");
    }
    samples.push({
      elapsedMs,
      totalMs: totalSeconds * 1000,
      solveMs: solveSeconds * 1000
    });
  }

  const memory = runner.getWasmLinearMemoryStats();
  const processMemoryCurrentBytes = process.memoryUsage.rss();
  const processMaxRssBytes = Math.round(process.resourceUsage().maxRSS * 1024);
  return {
    profile: benchmarkCase.profile,
    depth: benchmarkCase.depth,
    branchingFactor: benchmarkCase.branchingFactor,
    nodes: graph.nodes.length,
    edges: graph.links.length,
    sequenceLength: benchmarkCase.depth + 1,
    expectedPaths,
    enumeratedModels: Number(finalResult.Models.Number),
    complete: finalResult.Models.More === "no",
    programBytes: Buffer.byteLength(program, "utf8"),
    warmupRuns,
    repetitions,
    wallElapsedMsMedian: Number(median(samples.map(({ elapsedMs }) => elapsedMs)).toFixed(2)),
    clingoTotalMsMedian: Number(median(samples.map(({ totalMs }) => totalMs)).toFixed(3)),
    clingoSolveMsMedian: Number(median(samples.map(({ solveMs }) => solveMs)).toFixed(3)),
    grounding: {
      atoms: finalResult.Stats.LP.Atoms,
      originalRules: finalResult.Stats.LP.Rules?.Original,
      finalRules: finalResult.Stats.LP.Rules?.Final,
      originalBodies: finalResult.Stats.LP.Bodies?.Original,
      finalBodies: finalResult.Stats.LP.Bodies?.Final
    },
    solver: {
      choices: finalResult.Stats.Core.Choices,
      conflicts: finalResult.Stats.Core.Conflicts,
      variables: finalResult.Stats.Problem?.Variables
    },
    wasmLinearMemory: {
      baselineBytes: memoryBaseline.currentBytes,
      currentBytes: memory.currentBytes,
      peakBytes: memory.peakBytes,
      peakGrowthBytes: memory.peakBytes - memoryBaseline.currentBytes
    },
    nodeProcessMemory: {
      baselineResidentSetBytes: processMemoryBaselineBytes,
      maxResidentSetBeforeRunsBytes: processMaxRssBeforeRunsBytes,
      currentResidentSetBytes: processMemoryCurrentBytes,
      peakResidentSetBytes: processMaxRssBytes,
      peakIncreaseDuringProfileBytes: Math.max(0, processMaxRssBytes - processMaxRssBeforeRunsBytes),
      warmupRuns,
      measuredRuns: repetitions
    }
  };
}

const caseArgumentIndex = process.argv.indexOf("--case");
if (caseArgumentIndex >= 0) {
  const rawCase = process.argv[caseArgumentIndex + 1];
  if (!rawCase) throw new Error("--case requires a JSON case description");
  const benchmarkCase = JSON.parse(rawCase);
  const repetitions = benchmarkCase.repetitions ?? 3;
  const warmupRuns = benchmarkCase.warmupRuns ?? 1;
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new RangeError("case repetitions must be a positive safe integer");
  }
  if (!Number.isSafeInteger(warmupRuns) || warmupRuns < 0 || warmupRuns > 1) {
    throw new RangeError("case warmupRuns must be 0 or 1");
  }
  delete benchmarkCase.repetitions;
  delete benchmarkCase.warmupRuns;
  console.log(JSON.stringify(await measureCase(benchmarkCase, repetitions, warmupRuns)));
} else {
  const measurements = [];
  const scriptPath = fileURLToPath(import.meta.url);
  const runIsolatedCase = (caseWithProfile) => {
    const child = spawnSync(process.execPath, [
      "--experimental-strip-types",
      scriptPath,
      "--case",
      JSON.stringify(caseWithProfile)
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 120000
    });
    if (child.error) throw child.error;
    if (child.status !== 0) {
      throw new Error(`Profile ${caseWithProfile.profile}/${caseWithProfile.depth} failed: ${child.stderr || child.stdout}`);
    }
    return JSON.parse(child.stdout);
  };

  for (const benchmarkCase of cases) {
    const timing = runIsolatedCase({ ...benchmarkCase, repetitions: 3, warmupRuns: 1 });
    const memory = runIsolatedCase({ ...benchmarkCase, repetitions: 1, warmupRuns: 0 });
    measurements.push({
      ...timing,
      wasmLinearMemory: memory.wasmLinearMemory,
      nodeProcessMemory: memory.nodeProcessMemory
    });
  }

  console.log(JSON.stringify({
    note: "Synthetic directed layered graphs; each simple path is one answer set and all models are enumerated with clingo --stats=2. Grounding and timing medians come from one warmed isolated process; WebAssembly linear memory and max RSS come from a second fresh process with one measured solve and no warmup. RSS includes Node, JavaScript output, and WASM; it is a harness measurement, not a browser-worker-only allocation.",
    measurements
  }, null, 2));
}
