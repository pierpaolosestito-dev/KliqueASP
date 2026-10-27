import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import graphConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildTypedMotifCountProgram,
  buildTypedMotifProgram,
  parseTypedMotifCount,
  parseTypedMotifMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { hasCompleteModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import {
  resolveTypedMotifCountPartitionDomain,
  resolveTypedMotifCountPartitionSettings,
  runTypedMotifCountPartitions
} from "../src/lib/kliqueasp/graph/motifCountTask.ts";
import { resolveSolverTaskTimeoutMs } from "../src/lib/kliqueasp/graph/solverBudget.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const rawGraph = JSON.parse(await readFile(
  new URL("../src/lib/kliqueasp/data/my-dataset.json", import.meta.url),
  "utf8"
));
const config = structuredClone(graphConfig);
const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, value] = argument.replace(/^--/, "").split("=", 2);
  return [key, value];
}));
const requestedPartitionSize = options["partition-size"] === undefined
  ? 8
  : Number(options["partition-size"]);
if (!Number.isSafeInteger(requestedPartitionSize) || requestedPartitionSize < 1 || requestedPartitionSize > 16) {
  throw new TypeError("--partition-size deve essere un intero fra 1 e 16.");
}

const graph = normalizeGraphData(rawGraph, config);
assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
assert.equal(graph.capabilities.edgeTypes.available, true, "il mapping dei tipi di relazione deve essere attivo");
const template = config.graphAnalysis.motifs.find((candidate) => candidate.id === "shared-place");
assert.ok(template, "il profilo del caso studio deve dichiarare il motivo shared-place");
const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
const settings = resolveTypedMotifCountPartitionSettings({
  partitionSize: requestedPartitionSize,
  maxDurationMs: 1800000
});
assert.equal(settings.enabled, true);
if (!settings.enabled) throw new Error(settings.error);
const perPartitionTimeoutMs = resolveSolverTaskTimeoutMs(config.solver?.taskTimeoutMs);

function independentlyCountSharedPlaces() {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const peopleByPlace = new Map();
  for (const edge of graph.links) {
    if ((edge.type ?? edge.analysis?.type) !== "person-place") continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const person = source?.type === "person" && target?.type === "place"
      ? source
      : target?.type === "person" && source?.type === "place"
        ? target
        : undefined;
    const place = person === source ? target : person === target ? source : undefined;
    assert.ok(person && place, "ogni arco person-place deve collegare i tipi dichiarati");
    const people = peopleByPlace.get(place.id) ?? new Set();
    people.add(person.id);
    peopleByPlace.set(place.id, people);
  }

  let count = 0n;
  for (const people of peopleByPlace.values()) {
    const size = BigInt(people.size);
    count += size * (size - 1n) / 2n;
  }
  return count.toString();
}

const independentStartedAt = performance.now();
const independentCount = independentlyCountSharedPlaces();
const independentElapsedMs = performance.now() - independentStartedAt;

const singleRunner = await createClingoWasmRunner({ captureWasmMemory: true });
const singleProgram = `${facts.facts}\n${buildTypedMotifCountProgram(template, graph.direction).program}\n`;
const singleStartedAt = performance.now();
const singleResult = await singleRunner.run(singleProgram, [], 1);
const singleElapsedMs = performance.now() - singleStartedAt;
assert.equal(singleResult.Result, "SATISFIABLE", singleResult.Error ?? JSON.stringify(singleResult));
assert.equal(singleResult.Models?.More, "no", "il conteggio aggregato deve essere completo");
const singleCount = parseTypedMotifCount(singleResult.Call?.[0]?.Witnesses);
assert.equal(singleCount, independentCount, "ASP e riferimento indipendente devono coincidere");

const enumeration = buildTypedMotifProgram(template, graph.direction);
const enumerationProgram = `${facts.facts}\n${enumeration.program}\n`;
const enumerationStartedAt = performance.now();
const enumerationResult = await singleRunner.run(enumerationProgram);
const enumerationElapsedMs = performance.now() - enumerationStartedAt;
assert.equal(enumerationResult.Result, "SATISFIABLE", enumerationResult.Error ?? JSON.stringify(enumerationResult));
assert.equal(hasCompleteModelEnumeration(enumerationResult), true, "l'enumerazione deve essere completa");
const matches = parseTypedMotifMatches(
  enumerationResult.Call?.[0]?.Witnesses,
  enumeration,
  facts.reverseIndex,
  facts.reverseSourceIndex,
  facts.reverseEdgeIndex
);
assert.equal(matches.length, Number(independentCount), "l'enumerazione completa deve coincidere col conteggio esatto");
assert.ok(matches.every((match) => match.supportingEdges.length === template.edges.length));

const partitionRunner = await createClingoWasmRunner({ captureWasmMemory: true });
const partitionDurationsMs = [];
const partitionProgramBytes = [];
const partitionStartedAt = performance.now();
const partitioned = await runTypedMotifCountPartitions({
  edgeCount: graph.links.length,
  roleNodeCount: graph.nodes.length,
  partitionDomain: resolveTypedMotifCountPartitionDomain(template),
  settings: settings.settings,
  perPartitionTimeoutMs,
  runPartition: async (indexes) => {
    const compiled = buildTypedMotifCountProgram(template, graph.direction, "", {
      firstRoleNodeIndexes: indexes
    });
    const program = `${facts.facts}\n${compiled.program}\n`;
    partitionProgramBytes.push(Buffer.byteLength(program, "utf8"));
    const startedAt = performance.now();
    const result = await partitionRunner.run(program, [], 1);
    partitionDurationsMs.push(performance.now() - startedAt);
    return result;
  }
});
const partitionedElapsedMs = performance.now() - partitionStartedAt;
assert.equal(partitioned.status, "complete", JSON.stringify(partitioned));
if (partitioned.status !== "complete") throw new Error(JSON.stringify(partitioned));
assert.equal(partitioned.count, independentCount, "la somma partizionata e ASP devono coincidere col riferimento");

const sortedPartitionDurations = [...partitionDurationsMs].sort((a, b) => a - b);
const medianPartitionMs = sortedPartitionDurations[Math.floor(sortedPartitionDurations.length / 2)];
console.log(JSON.stringify({
  dataset: "Psychology History Graph",
  interpretation: "Conteggio statico di assegnamenti non ordinati di due persone e un luogo condiviso; non implica collaborazione, simultaneità o comunità sociale.",
  rawNodeCount: rawGraph.nodes.length,
  rawEdgeRecordCount: rawGraph.edges?.length ?? rawGraph.links?.length ?? 0,
  projectedNodeCount: graph.nodes.length,
  projectedEdgeRecordCount: graph.links.length,
  mappedEdgeTypes: [...new Set(graph.links.map((edge) => edge.type ?? edge.analysis?.type))].sort(),
  query: template.id,
  count: independentCount,
  enumeratedMatches: matches.length,
  completeEnumeration: true,
  checks: {
    singleAspEqualsIndependent: singleCount === independentCount,
    partitionedAspEqualsIndependent: partitioned.count === independentCount,
    partitionPlanComplete: true
  },
  countSettings: {
    partitionSize: settings.settings.partitionSize,
    maxDurationMs: settings.settings.maxDurationMs,
    perPartitionTimeoutMs,
    partitionDomain: resolveTypedMotifCountPartitionDomain(template)
  },
  measurementsMs: {
    independentReference: Number(independentElapsedMs.toFixed(2)),
    singleAspWorker: Number(singleElapsedMs.toFixed(2)),
    enumerationAspAndParser: Number(enumerationElapsedMs.toFixed(2)),
    partitionedAspTask: Number(partitionedElapsedMs.toFixed(2)),
    medianPartitionSolveWall: Number(medianPartitionMs.toFixed(2)),
    maximumPartitionSolveWall: Number(Math.max(...partitionDurationsMs).toFixed(2))
  },
  maxPartitionProgramBytes: Math.max(...partitionProgramBytes),
  wasmLinearMemory: {
    singleQuery: singleRunner.getWasmLinearMemoryStats(),
    partitioned: partitionRunner.getWasmLinearMemoryStats()
  }
}, null, 2));
