import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildTypedMotifProgram } from "../src/lib/kliqueasp/graph/motifTask.ts";
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
      identity: "multigraph",
      validity: { fromField: "$.validFrom", toField: "$.validTo" }
    }
  }
};

const motif = {
  id: "ordered-pair",
  roles: {
    actor: { nodeTypes: ["actor"] },
    context: { nodeTypes: ["context"] },
    place: { nodeTypes: ["place"] }
  },
  edges: [
    { sourceRole: "actor", targetRole: "place", edgeType: "actor-place" },
    { sourceRole: "context", targetRole: "place", edgeType: "context-place" }
  ],
  temporal: { semantics: "orderedByStart", strict: true }
};

function makeFixture({ motifCount, parallelActorRecords }) {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < motifCount; index += 1) {
    const actor = `actor_${index}`;
    const context = `context_${index}`;
    const place = `place_${index}`;
    const start = 1900 + index * 2;
    nodes.push(
      { id: actor, type: "actor" },
      { id: context, type: "context" },
      { id: place, type: "place" }
    );
    for (let parallel = 0; parallel < parallelActorRecords; parallel += 1) {
      edges.push({
        id: `actor-edge-${index}-${parallel}`,
        source: actor,
        target: place,
        type: "actor-place",
        validFrom: start,
        validTo: start + 10
      });
    }
    edges.push({
      id: `context-edge-${index}`,
      source: context,
      target: place,
      type: "context-place",
      validFrom: start + 1,
      validTo: start + 10
    });
  }
  return { nodes, edges };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

const cases = [
  ...[8, 16, 32, 64].map((motifCount) => ({ motifCount, parallelActorRecords: 1 })),
  ...[1, 2, 4].map((parallelActorRecords) => ({ motifCount: 16, parallelActorRecords }))
];
const repetitions = 3;
const measurements = [];

for (const benchmarkCase of cases) {
  const graph = normalizeGraphData(makeFixture(benchmarkCase), graphConfig);
  if (!graph.valid || !graph.capabilities.edgeIntervals.available) {
    throw new Error(`Invalid temporal benchmark fixture: ${JSON.stringify(graph.diagnostics)}`);
  }
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram(motif, graph.direction);
  const program = `${facts.facts}\n${compiled.program}`;
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const wasmMemoryBaseline = runner.getWasmLinearMemoryStats();
  const elapsedSamplesMs = [];
  const clingoTimingSamplesMs = [];
  let groundingStats;
  let modelCount;
  let modelsComplete;

  const warmup = await runner.run(program, ["--stats=2"]);
  if (warmup.Result !== "SATISFIABLE") {
    throw new Error(`${benchmarkCase.motifCount} motifs: warm-up failed with ${warmup.Result}`);
  }
  if (!warmup.Stats?.LP || !Number.isFinite(Number(warmup.Time?.Total)) || !Number.isFinite(Number(warmup.Time?.Solve))) {
    throw new Error(`${benchmarkCase.motifCount} motifs: clingo did not return phase timings and grounding statistics`);
  }

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const startedAt = performance.now();
    const result = await runner.run(program, ["--stats=2"]);
    elapsedSamplesMs.push(performance.now() - startedAt);
    if (result.Result !== "SATISFIABLE") {
      throw new Error(`Expected full temporal enumeration, received ${result.Result}`);
    }
    const totalSeconds = Number(result.Time?.Total);
    const solveSeconds = Number(result.Time?.Solve);
    if (!result.Stats?.LP || !Number.isFinite(totalSeconds) || !Number.isFinite(solveSeconds) || totalSeconds < 0 || solveSeconds < 0) {
      throw new Error(`${benchmarkCase.motifCount} motifs: invalid clingo timing or grounding statistics`);
    }
    clingoTimingSamplesMs.push({
      total: totalSeconds * 1000,
      solve: solveSeconds * 1000,
      preSolve: Math.max(0, totalSeconds - solveSeconds) * 1000
    });
    groundingStats = result.Stats.LP;
    modelCount = Number(result.Models?.Number);
    modelsComplete = result.Models?.More === "no";
  }

  const expectedModels = benchmarkCase.motifCount * benchmarkCase.parallelActorRecords;
  if (modelCount !== expectedModels || !modelsComplete) {
    throw new Error(`Unexpected model enumeration: expected ${expectedModels}, got ${modelCount}, complete=${modelsComplete}`);
  }
  measurements.push({
    ...benchmarkCase,
    nodes: graph.nodes.length,
    edges: graph.links.length,
    expectedTemporalWitnesses: expectedModels,
    enumeratedModels: modelCount,
    programBytes: Buffer.byteLength(program, "utf8"),
    warmupRuns: 1,
    repetitions,
    elapsedMsMedian: Number(median(elapsedSamplesMs).toFixed(2)),
    elapsedMsSamples: elapsedSamplesMs.map((value) => Number(value.toFixed(2))),
    clingoTimingMsMedian: {
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
    complete: modelsComplete
  });
}

console.log(JSON.stringify({
  note: "Synthetic orderedByStart queries. Clingo exposes Total and Solve, not a dedicated grounding timer: preSolve is Total-Solve and includes parsing, grounding, and setup, so it is not pure grounding time. Total, Solve, and preSolve medians are calculated independently and may not add exactly. Ground atoms/rules and WASM linear-memory baseline/current/peak are reported separately; neither attributes the browser worker's JavaScript heap or total resident memory. Each run enumerates all models and rejects incomplete results.",
  measurements
}, null, 2));
