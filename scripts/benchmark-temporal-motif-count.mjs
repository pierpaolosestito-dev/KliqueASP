import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildTypedMotifCountProgram, parseTypedMotifCount } from "../src/lib/kliqueasp/graph/motifTask.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const defaultWindow = { from: 28_800, to: 57_600 };
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [name, value] = argument.replace(/^--/, "").split("=", 2);
  return [name, value];
}));
const window = {
  from: options.from === undefined ? defaultWindow.from : Number(options.from),
  to: options.to === undefined ? defaultWindow.to : Number(options.to)
};
const skipIndependent = Object.hasOwn(options, "skip-independent");
const partitionSize = options["partition-starts"] === undefined
  ? undefined
  : Number(options["partition-starts"]);
const rolePartitionSize = options["partition-roles"] === undefined
  ? undefined
  : Number(options["partition-roles"]);
const edgePartitionSize = options["partition-edges"] === undefined
  ? undefined
  : Number(options["partition-edges"]);
const showPartitionProgress = Object.hasOwn(options, "progress");
const partitionLimit = options["limit-partitions"] === undefined
  ? undefined
  : Number(options["limit-partitions"]);
const partitionIndex = options["partition-index"] === undefined
  ? undefined
  : Number(options["partition-index"]);
if (!Number.isSafeInteger(window.from) || !Number.isSafeInteger(window.to) || window.from > window.to) {
  throw new TypeError("Usare --from e --to con interi sicuri e from <= to.");
}
if (partitionSize !== undefined && (!Number.isSafeInteger(partitionSize) || partitionSize < 1)) {
  throw new TypeError("--partition-starts deve essere un intero positivo.");
}
if (rolePartitionSize !== undefined && (!Number.isSafeInteger(rolePartitionSize) || rolePartitionSize < 1)) {
  throw new TypeError("--partition-roles deve essere un intero positivo.");
}
if (edgePartitionSize !== undefined && (!Number.isSafeInteger(edgePartitionSize) || edgePartitionSize < 1)) {
  throw new TypeError("--partition-edges deve essere un intero positivo.");
}
if (partitionLimit !== undefined && (!Number.isSafeInteger(partitionLimit) || partitionLimit < 1 ||
  (partitionSize === undefined && rolePartitionSize === undefined && edgePartitionSize === undefined))) {
  throw new TypeError("--limit-partitions richiede un partizionamento e un intero positivo.");
}
if (partitionIndex !== undefined && (!Number.isSafeInteger(partitionIndex) || partitionIndex < 0 ||
  (partitionSize === undefined && rolePartitionSize === undefined && edgePartitionSize === undefined) || partitionLimit !== undefined)) {
  throw new TypeError("--partition-index richiede un partizionamento e un indice zero-based non combinabile con --limit-partitions.");
}

const fixture = JSON.parse(await readFile(new URL("../tests/fixtures/sociopatterns-invs13-temporal-chain.json", import.meta.url), "utf8"));
const source = await readFile(new URL("../tests/fixtures/sociopatterns-invs13-tij.dat", import.meta.url), "utf8");
const allEdges = source.trim().split(/\r?\n/).map((line, index) => {
  const [time, sourceId, targetId] = line.trim().split(/\s+/).map(Number);
  return {
    id: `invs13-row-${index + 1}`,
    source: String(sourceId),
    target: String(targetId),
    kind: "face-to-face-contact",
    validFrom: time - 20,
    validTo: time
  };
});
const edges = allEdges.filter((edge) => edge.validFrom <= window.to && edge.validTo >= window.from);
const nodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
const graph = normalizeGraphData({
  nodes: [...nodeIds].map((id) => ({ id, kind: "person" })),
  edges
}, fixture.config);
if (!graph.valid || !graph.capabilities.edgeIntervals.available) {
  throw new Error(`The selected SocioPatterns projection is invalid: ${JSON.stringify(graph.diagnostics)}`);
}

let independentCount = null;
if (!skipIndependent) {
  const outgoing = new Map();
  for (const edge of edges) {
    for (const [sourceId, targetId] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const records = outgoing.get(sourceId) ?? [];
      records.push({ edge, targetId });
      outgoing.set(sourceId, records);
    }
  }
  independentCount = 0;
  for (const first of edges) {
    for (const [firstRole, secondRole] of [[first.source, first.target], [first.target, first.source]]) {
      if (firstRole === secondRole) continue;
      for (const second of outgoing.get(secondRole) ?? []) {
        if (second.targetId === firstRole || second.targetId === secondRole ||
          first.validFrom >= second.edge.validFrom) continue;
        for (const third of outgoing.get(second.targetId) ?? []) {
          if (third.targetId === firstRole || third.targetId === secondRole ||
            third.targetId === second.targetId || second.edge.validFrom >= third.edge.validFrom) continue;
          independentCount += 1;
        }
      }
    }
  }
}

const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
const startValues = [...new Set(edges
  .map((edge) => facts.temporalEncoding.encode(edge.validFrom))
  .filter((value) => value !== null))].sort((left, right) => left - right);
const startPartitions = partitionSize !== undefined && startValues.length > 0
  ? Array.from({ length: Math.ceil(startValues.length / partitionSize) }, (_, index) => ({
      firstPatternStartValues: startValues.slice(index * partitionSize, (index + 1) * partitionSize)
    }))
  : [{}];
const rolePartitions = rolePartitionSize !== undefined && graph.nodes.length > 0
  ? Array.from({ length: Math.ceil(graph.nodes.length / rolePartitionSize) }, (_, index) => ({
      firstRoleNodeIndexes: Array.from({
        length: Math.min(rolePartitionSize, graph.nodes.length - index * rolePartitionSize)
      }, (_, offset) => index * rolePartitionSize + offset + 1)
    }))
  : [{}];
const edgePartitions = edgePartitionSize !== undefined && graph.links.length > 0
  ? Array.from({ length: Math.ceil(graph.links.length / edgePartitionSize) }, (_, index) => ({
      firstPatternEdgeIndexes: Array.from({
        length: Math.min(edgePartitionSize, graph.links.length - index * edgePartitionSize)
      }, (_, offset) => index * edgePartitionSize + offset + 1)
    }))
  : [{}];
const plannedPartitions = startPartitions.flatMap((startPartition) =>
  edgePartitions.flatMap((edgePartition) =>
    rolePartitions.map((rolePartition) => ({ ...startPartition, ...edgePartition, ...rolePartition }))
  )
);
const partitions = partitionIndex === undefined
  ? plannedPartitions.slice(0, partitionLimit ?? plannedPartitions.length)
  : plannedPartitions.slice(partitionIndex, partitionIndex + 1);
if (partitions.length === 0) throw new RangeError("--partition-index non identifica una partizione del piano.");
const partitionPlanComplete = partitionIndex === undefined && partitions.length === plannedPartitions.length;
if (!partitionPlanComplete && !skipIndependent) {
  throw new TypeError("--limit-partitions richiede --skip-independent perché produce solo una sonda parziale.");
}
const runner = await createClingoWasmRunner({ captureWasmMemory: true });
const startedAt = performance.now();
let countTotal = 0n;
let totalProgramBytes = 0;
let totalClingoMs = 0;
let totalSolveMs = 0;
let maximumGroundAtoms = 0;
let totalGroundAtoms = 0;
const partitionResults = [];
for (const [index, partition] of partitions.entries()) {
  const compiled = buildTypedMotifCountProgram(fixture.template, graph.direction, "", partition);
  const program = `${facts.facts}\n${compiled.program}\n`;
  const programBytes = Buffer.byteLength(program, "utf8");
  if (programBytes >= 1_000_000) {
    throw new RangeError(`Il programma della partizione ${index + 1} supera il limite prudenziale del worker clingo-WASM.`);
  }
  totalProgramBytes = Math.max(totalProgramBytes, programBytes);
  const result = await runner.run(program, ["--stats=2"], 1);
  if (result.Result !== "SATISFIABLE" || result.Models?.More !== "no") {
    throw new Error(`clingo did not return one complete aggregate model for partition ${index + 1}: ${result.Result}; ${result.Error ?? ""}`);
  }
  const count = parseTypedMotifCount(result.Call?.[0]?.Witnesses);
  if (count === undefined) {
    throw new Error(`clingo did not return an exact aggregate count for partition ${index + 1}`);
  }
  countTotal += BigInt(count);
  const totalMs = Number(result.Time?.Total) * 1000;
  const solveMs = Number(result.Time?.Solve) * 1000;
  if (Number.isFinite(totalMs) && Number.isFinite(solveMs)) {
    totalClingoMs += totalMs;
    totalSolveMs += solveMs;
  }
  const atoms = Number(result.Stats?.LP?.Atoms);
  if (Number.isFinite(atoms)) {
    totalGroundAtoms += atoms;
    maximumGroundAtoms = Math.max(maximumGroundAtoms, atoms);
  }
  const wasmMemory = runner.getWasmLinearMemoryStats();
  partitionResults.push({
    startValues: partition.firstPatternStartValues?.length ?? null,
    firstEdgeRange: partition.firstPatternEdgeIndexes
      ? [partition.firstPatternEdgeIndexes[0], partition.firstPatternEdgeIndexes.at(-1)]
      : null,
    firstEdges: partition.firstPatternEdgeIndexes?.length ?? null,
    firstRoleNodes: partition.firstRoleNodeIndexes?.length ?? null,
    count,
    atoms: Number.isFinite(atoms) ? atoms : null,
    wasmPeakBytes: wasmMemory.peakBytes
  });
  if (showPartitionProgress) {
    console.error(JSON.stringify({
      type: "partition-progress",
      partition: index + 1,
      partitionCount: partitions.length,
      count,
      wasmPeakBytes: wasmMemory.peakBytes,
      elapsedMs: Number(totalMs.toFixed(2))
    }));
  }
}
const elapsedMs = performance.now() - startedAt;
const count = countTotal.toString();
if (independentCount !== null && BigInt(count) !== BigInt(independentCount)) {
  throw new Error(`ASP count ${count ?? "missing"} differs from independent count ${independentCount}`);
}

console.log(JSON.stringify({
  dataset: "SocioPatterns InVS 2013 workplace",
  query: "strict ordered four-role contact chain",
  semantics: "Each ordered witness tuple counts once; all four role nodes are distinct.",
  window,
  nodes: graph.nodes.length,
  edgeRecords: graph.links.length,
  maxProgramBytes: totalProgramBytes,
  count: partitionPlanComplete ? count : null,
  ...(partitionPlanComplete ? {} : { partialCount: count }),
  independentCount,
  independentCheckSkipped: skipIndependent,
  result: "SATISFIABLE",
  returnedModelsPerPartition: 1,
  partitionPlanComplete,
  eachExecutedModelComplete: true,
  partitionSize,
  edgePartitionSize,
  rolePartitionSize,
  partitionCount: partitionResults.length,
  partitionResults,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  clingoMs: {
    total: Number(totalClingoMs.toFixed(2)),
    solve: Number(totalSolveMs.toFixed(2)),
    preSolveEstimate: Number(Math.max(0, totalClingoMs - totalSolveMs).toFixed(2))
  },
  grounding: {
    atomsAcrossPartitions: totalGroundAtoms,
    maximumAtomsInOnePartition: maximumGroundAtoms
  },
  wasmLinearMemory: runner.getWasmLinearMemoryStats()
}, null, 2));
