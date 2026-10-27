import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildTypedMotifTemporalNearMatchProgram,
  parseTypedMotifNearMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const sourceUrl = new URL("../tests/fixtures/sociopatterns-invs13-tij.dat", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const edges = source.trim().split(/\r?\n/).map((line, index) => {
  const values = line.trim().split(/\s+/).map(Number);
  if (values.length !== 3 || values.some((value) => !Number.isSafeInteger(value))) {
    throw new TypeError(`Record InVS ${index + 1} non valido`);
  }
  const [time, sourceId, targetId] = values;
  return {
    id: `invs13-row-${index + 1}`,
    source: String(sourceId),
    target: String(targetId),
    kind: "face-to-face-contact",
    validFrom: time - 20,
    validTo: time
  };
});
assert.equal(edges.length, 9_827, "versione del fixture InVS attesa");

const config = {
  schemaVersion: 2,
  graphMapping: {
    node: {
      idField: "$.id",
      typeField: "$.kind",
      attributes: { participant: "$.id" }
    },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      typeField: "$.kind",
      direction: "undirected",
      identity: "multigraph",
      validity: { fromField: "$.validFrom", toField: "$.validTo", numericUnit: "seconds" }
    }
  }
};
const nodeIds = [...new Set(edges.flatMap((edge) => [edge.source, edge.target]))];
const graph = normalizeGraphData({
  nodes: nodeIds.map((id) => ({ id, kind: "person" })),
  edges
}, config);
if (!graph.valid || !graph.capabilities.edgeIntervals.available || !graph.capabilities.nodeAttributes.available) {
  throw new Error(`Dati temporali o attributi InVS non validi: ${JSON.stringify(graph.diagnostics)}`);
}
assert.equal(graph.nodes.length, 92);
assert.equal(graph.links.length, 9_827);

// These IDs define one reproducible query over anonymous participants. The last
// required pair is absent; the first two pairs have 100 strictly ordered records.
const participants = { first: "123", second: "39", third: "194", fourth: "15" };
const motif = {
  id: "invs13-selected-participant-chain",
  label: "Catena temporale per quattro ID partecipante selezionati",
  temporal: { semantics: "orderedByStart", strict: true },
  roles: Object.fromEntries(Object.entries(participants).map(([role, participant]) => [
    role,
    { nodeTypes: ["person"], attributes: { participant } }
  ])),
  edges: [
    { sourceRole: "first", targetRole: "second", edgeType: "face-to-face-contact" },
    { sourceRole: "second", targetRole: "third", edgeType: "face-to-face-contact" },
    { sourceRole: "third", targetRole: "fourth", edgeType: "face-to-face-contact" }
  ]
};

const pairRecords = new Map();
for (const edge of edges) {
  const key = [edge.source, edge.target].sort().join(":");
  const records = pairRecords.get(key) ?? [];
  records.push(edge);
  pairRecords.set(key, records);
}
const expectedSupports = new Set();
for (const first of pairRecords.get("123:39") ?? []) {
  for (const second of pairRecords.get("194:39") ?? []) {
    if (first.validFrom < second.validFrom) {
      expectedSupports.add(JSON.stringify([first.id, second.id]));
    }
  }
}
assert.equal(pairRecords.has("15:194"), false, "il terzo pattern non compare nel dataset osservato");
assert.equal(expectedSupports.size, 100, "oracolo indipendente delle coppie ordinate");

const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
const compiled = buildTypedMotifTemporalNearMatchProgram(motif, graph.direction, "", facts.temporalEncoding);
const program = `${facts.facts}\n${compiled.program}\n`;
assert.ok(Buffer.byteLength(program, "utf8") < 1_000_000,
  "l'encoding compatto deve restare entro il limite prudenziale del Worker WASM");

const runner = await createClingoWasmRunner({ captureWasmMemory: true });
const parse = (result) => parseTypedMotifNearMatches(
  result?.Call?.[0]?.Witnesses,
  compiled,
  facts.reverseIndex,
  facts.reverseSourceIndex,
  facts.reverseEdgeIndex,
  facts.temporalEncoding.decode
);
const signature = (match) => JSON.stringify({
  roles: Object.fromEntries(Object.entries(match.roles).map(([role, value]) => [role, value.sourceId])),
  missingRoles: match.missingRoles,
  missingPatterns: match.missingPatterns.map(({ index }) => index),
  orderViolations: match.temporalEvidence.orderViolations,
  supports: match.temporalEvidence.supportingEdges.map(({ edgeIds }) => edgeIds)
});
const validate = (matches, label) => {
  assert.ok(matches.length > 0, `${label}: near-match ottimo presente`);
  const supports = new Set();
  const signatures = new Set();
  for (const match of matches) {
    assert.deepEqual(Object.fromEntries(Object.entries(match.roles).map(([role, value]) => [role, value.sourceId])),
      participants, `${label}: filtri di attributo per ruolo`);
    assert.deepEqual(match.missingRoles, [], `${label}: tutti i ruoli sono assegnati`);
    assert.deepEqual(match.missingPatterns.map(({ index }) => index), [3], `${label}: pattern mancante`);
    assert.deepEqual(match.temporalEvidence.orderViolations, [], `${label}: supporti in ordine temporale`);
    const [first, second, third] = match.temporalEvidence.supportingEdges;
    assert.equal(first.edgeIds.length, 1);
    assert.equal(second.edgeIds.length, 1);
    assert.deepEqual(third.edgeIds, []);
    supports.add(JSON.stringify([first.edgeIds[0], second.edgeIds[0]]));
    signatures.add(signature(match));
  }
  return { supports, signatures };
};

const warmup = await runner.run(program, ["--opt-mode=opt", "--stats=2"]);
assert.equal(warmup.Result, "OPTIMUM FOUND", warmup.Error ?? "warm-up non ottimo");
validate(parse(warmup), "warm-up");

const selectionTimesMs = [];
const selectedSignatures = [];
const selectedCosts = [];
let selectionStats;
for (let repetition = 0; repetition < 3; repetition += 1) {
  const startedAt = performance.now();
  const result = await runner.run(program, ["--opt-mode=opt", "--stats=2"]);
  selectionTimesMs.push(performance.now() - startedAt);
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? `run ${repetition + 1} non ottimo`);
  const current = validate(parse(result), `opt run ${repetition + 1}`);
  assert.ok([...current.supports].every((support) => expectedSupports.has(support)),
    "il witness selezionato deve appartenere all'oracolo indipendente");
  selectedSignatures.push(JSON.stringify([...current.signatures].sort()));
  selectedCosts.push([...new Set((result.Call?.[0]?.Witnesses ?? []).map(({ Costs }) => JSON.stringify(Costs)))].sort());
  selectionStats = { lp: result.Stats?.LP, time: result.Time };
}
assert.ok(selectedSignatures.every((value) => value === selectedSignatures[0]),
  "il near-match UI deve restare stabile tra run ripetuti");

const tieStartedAt = performance.now();
const allOptima = await runner.run(program, ["--opt-mode=optN", "--stats=2"]);
const tieEnumerationWallMs = performance.now() - tieStartedAt;
assert.equal(allOptima.Result, "OPTIMUM FOUND", allOptima.Error ?? "enumerazione ottimi non riuscita");
assert.equal(allOptima.Models?.More, "no", "optN deve dichiarare l'enumerazione completa");
const allMatches = parse(allOptima);
const tieValidation = validate(allMatches, "optN");
assert.deepEqual(tieValidation.supports, expectedSupports,
  "ASP enumera esattamente tutte le coppie indipendenti di record ordinate");
assert.equal(tieValidation.signatures.size, expectedSupports.size);
const optimalWitnesses = allOptima.Call?.[0]?.Witnesses ?? [];
const optimalCosts = new Set(optimalWitnesses.map(({ Costs }) => JSON.stringify(Costs)));
assert.equal(optimalCosts.size, 1, "ogni testimone ottimo deve avere lo stesso costo lessicografico");
assert.ok(optimalWitnesses.length >= expectedSupports.size,
  "l'output grezzo del solver deve contenere almeno un witness per ogni pari distinto");

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};
console.log(JSON.stringify({
  note: "Contatti osservati InVS 2013: ogni record t è mappato sull'intervallo documentato [t−20s,t]. La query seleziona quattro ID anonimi e chiede una catena di tre contatti con inizi strettamente ordinati; il terzo contatto richiesto è assente. Questo why-not descrive la query configurata sui record di prossimità, non amicizia, persistenza, influenza o causalità.",
  participants,
  graph: { nodes: graph.nodes.length, records: graph.links.length },
  programBytes: Buffer.byteLength(program, "utf8"),
  independentOrderedSupportPairs: expectedSupports.size,
  optimalCost: [...optimalCosts][0],
  selectedWitnessStableAcrossRuns: true,
  selectedWitness: JSON.parse(JSON.parse(selectedSignatures[0])[0]),
  optModeWallMsMedian: Number(median(selectionTimesMs).toFixed(2)),
  optModeWallMsSamples: selectionTimesMs.map((value) => Number(value.toFixed(2))),
  optModeCosts: selectedCosts,
  optNAllTiesWallMs: Number(tieEnumerationWallMs.toFixed(2)),
  optNRawWitnessRecords: optimalWitnesses.length,
  distinctOptimalNearMatches: tieValidation.signatures.size,
  optimalEnumerationComplete: allOptima.Models.More === "no",
  grounding: {
    atoms: allOptima.Stats?.LP?.Atoms,
    originalRules: allOptima.Stats?.LP?.Rules?.Original,
    finalRules: allOptima.Stats?.LP?.Rules?.Final
  },
  clingoMs: {
    total: Number((Number(allOptima.Time?.Total) * 1000).toFixed(2)),
    solve: Number((Number(allOptima.Time?.Solve) * 1000).toFixed(2))
  },
  wasmLinearMemory: runner.getWasmLinearMemoryStats(),
  selectionGrounding: selectionStats.lp
}, null, 2));
