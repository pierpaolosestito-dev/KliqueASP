import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [name, value] = argument.replace(/^--/, "").split("=", 2);
  return [name, value];
}));
const edgeCount = options.edges === undefined ? 5_000 : Number(options.edges);
if (!Number.isSafeInteger(edgeCount) || edgeCount < 1 || edgeCount > 10_000) {
  throw new TypeError("--edges deve essere un intero fra 1 e 10000.");
}

const edgePairs = [["a", "b"], ["b", "c"], ["a", "c"]];
const graph = normalizeGraphData({
  nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
  edges: Array.from({ length: edgeCount }, (_, index) => ({
    id: `edge-${index + 1}`,
    source: edgePairs[index % edgePairs.length][0],
    target: edgePairs[index % edgePairs.length][1],
    sources: [`archive-${index + 1}`, "shared-source"]
  }))
}, {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id" },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      direction: "undirected",
      identity: "multigraph",
      provenanceField: "$.sources"
    }
  }
});
assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
assert.equal(graph.links.length, edgeCount);

const sourceReferences = [...new Set(graph.links.flatMap((edge) => edge.analysis.provenance))].sort();
const sourceIndexByReference = new Map(sourceReferences.map((source, index) => [source, index + 1]));
const sharedSourceIndex = sourceIndexByReference.get("shared-source");
assert.ok(sharedSourceIndex);

const expandedTextualFacts = buildAspFactsFromGraph(graph, undefined, {
  includeEdgeProvenance: true
});
const compactTextualFacts = buildAspFactsFromGraph(graph, undefined, {
  compact: true,
  includeEdgeProvenance: true
});
const indexedBaseFacts = buildAspFactsFromGraph(graph, undefined, {
  compact: true,
  includeEdgeProvenance: false
});
const indexedProvenanceTuples = graph.links.flatMap((edge, index) =>
  edge.analysis.provenance.map((source) =>
    `${index + 1},${sourceIndexByReference.get(source)}`
  )
);
const sourceReferenceByIndex = new Map([...sourceIndexByReference].map(([source, index]) => [index, source]));
const expectedProvenancePairs = graph.links.flatMap((edge, index) =>
  edge.analysis.provenance.map((source) => `${index + 1}\u0000${source}`)
).sort();
const decodedIndexedProvenancePairs = indexedProvenanceTuples.map((tuple) => {
  const [record, sourceIndex] = tuple.split(",");
  return `${record}\u0000${sourceReferenceByIndex.get(Number(sourceIndex))}`;
}).sort();
assert.deepEqual(decodedIndexedProvenancePairs, expectedProvenancePairs);
const indexedProvenanceStatements = [];
for (let index = 0; index < indexedProvenanceTuples.length; index += 256) {
  indexedProvenanceStatements.push(
    `edge_provenance(${indexedProvenanceTuples.slice(index, index + 256).join(";")}).`
  );
}
const indexedProvenanceFacts = indexedProvenanceStatements.join("\n");

const querySuffix = `selected_source("shared-source").\n` +
  `source_record_count(N) :- N = #count { E : edge_provenance(E,S), selected_source(S) }.\n` +
  `#show source_record_count/1.\n`;
const expandedTextualProgram = `${expandedTextualFacts.facts}\n` + querySuffix;
const compactTextualProgram = `${compactTextualFacts.facts}\n` + querySuffix;
const indexedProgram = `${indexedBaseFacts.facts}\n${indexedProvenanceFacts}\n` +
  `selected_source(${sharedSourceIndex}).\n` +
  `source_record_count(N) :- N = #count { E : edge_provenance(E,S), selected_source(S) }.\n` +
  `#show source_record_count/1.\n`;

function extractSourceCount(result) {
  const values = result.Call?.[0]?.Witnesses?.[0]?.Value ?? [];
  const match = values.find((value) => /^source_record_count\(\d+\)$/.test(value));
  return match ? Number(match.match(/\d+/)?.[0]) : null;
}

async function measure(name, program) {
  const runs = [];
  for (let index = 0; index < 3; index += 1) {
    const runner = await createClingoWasmRunner({ captureWasmMemory: true, includeExceptionDetails: true });
    const startedAt = performance.now();
    let result;
    let thrownError;
    try {
      result = await runner.run(program, ["--stats=2"], 1);
    } catch (error) {
      thrownError = error instanceof Error ? error.message : String(error);
    }
    const wallMs = performance.now() - startedAt;
    const memory = runner.getWasmLinearMemoryStats();
    runs.push({
      result: result?.Result ?? "THREW",
      error: thrownError ?? result?.Error ?? null,
      wallMs: Number(wallMs.toFixed(2)),
      sourceCount: result ? extractSourceCount(result) : null,
      peakWasmLinearMemoryBytes: memory.peakBytes,
      atoms: result?.Stats?.LP?.Atoms ?? null,
      finalRules: result?.Stats?.LP?.Rules?.Final ?? null
    });
  }
  const sortedWallTimes = runs.map(({ wallMs }) => wallMs).sort((left, right) => left - right);
  return {
    encoding: name,
    programBytes: Buffer.byteLength(program, "utf8"),
    medianWallMs: sortedWallTimes[1],
    result: [...new Set(runs.map(({ result }) => result))].join(" / "),
    sourceCount: [...new Set(runs.map(({ sourceCount }) => sourceCount))],
    peakWasmLinearMemoryBytes: Math.max(...runs.map(({ peakWasmLinearMemoryBytes }) => peakWasmLinearMemoryBytes ?? 0)),
    atoms: [...new Set(runs.map(({ atoms }) => atoms))],
    finalRules: [...new Set(runs.map(({ finalRules }) => finalRules))],
    errors: [...new Set(runs.map(({ error }) => error).filter(Boolean))]
  };
}

const expandedTextual = await measure("expanded_textual_source_ids", expandedTextualProgram);
const compactTextual = await measure("batched_textual_source_ids", compactTextualProgram);
const indexed = await measure("integer_source_dictionary", indexedProgram);
const countMatches = (profile) => profile.result === "SATISFIABLE" &&
  profile.sourceCount.length === 1 && profile.sourceCount[0] === edgeCount;
const report = {
  scope: "benchmark-only; source labels are exact identifiers, not reliability or alternative-world semantics",
  edgeCount,
  uniqueSourceReferences: sourceReferences.length,
  expectedSharedSourceRecords: edgeCount,
  indexedProvenanceRoundTripVerified: true,
  provenanceTupleCount: graph.links.reduce((count, edge) => count + edge.analysis.provenance.length, 0),
  expandedTextualProvenanceStatements: (expandedTextualFacts.facts.match(/^edge_provenance\(/gm) ?? []).length,
  batchedTextualProvenanceStatements: (compactTextualFacts.facts.match(/^edge_provenance\(/gm) ?? []).length,
  batchedIndexedProvenanceStatements: indexedProvenanceStatements.length,
  sourceDictionaryBytesSentToClingo: 0,
  expandedTextual,
  compactTextual,
  indexed,
  indexedCountMatches: countMatches(indexed),
  compactTextualCountMatches: countMatches(compactTextual),
  expandedTextualCountMatches: countMatches(expandedTextual)
};
console.log(JSON.stringify(report, null, 2));

assert.ok(report.compactTextualCountMatches, "l'encoding compatto testuale deve mantenere lo stesso conteggio");
assert.ok(report.indexedCountMatches, "l'encoding compatto indicizzato deve mantenere lo stesso conteggio");
