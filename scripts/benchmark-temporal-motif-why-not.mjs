import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildTypedMotifTemporalNearMatchProgram,
  parseTypedMotifNearMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const config = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", typeField: "$.kind" },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      typeField: "$.kind",
      direction: "directed",
      identity: "multigraph",
      validity: { fromField: "$.validFrom", toField: "$.validTo" }
    }
  }
};

const template = {
  id: "ordered-chain",
  label: "Catena temporale con inversione",
  temporal: { semantics: "orderedByStart" },
  roles: {
    first: { nodeTypes: ["role-first"] },
    second: { nodeTypes: ["role-second"] },
    third: { nodeTypes: ["role-third"] },
    fourth: { nodeTypes: ["role-fourth"] }
  },
  edges: [
    { sourceRole: "first", targetRole: "second", edgeType: "step-1" },
    { sourceRole: "second", targetRole: "third", edgeType: "step-2" },
    { sourceRole: "third", targetRole: "fourth", edgeType: "step-3" }
  ]
};

function makeFixture(motifCount) {
  const nodes = [];
  const edges = [];
  for (let index = 0; index < motifCount; index += 1) {
    const base = 1900 + index * 2;
    const ids = ["a", "b", "c", "d"].map((prefix) => `${prefix}_${index}`);
    nodes.push(
      { id: ids[0], kind: "role-first" },
      { id: ids[1], kind: "role-second" },
      { id: ids[2], kind: "role-third" },
      { id: ids[3], kind: "role-fourth" }
    );
    edges.push(
      { id: `edge-1-${index}`, source: ids[0], target: ids[1], kind: "step-1", validFrom: base + 2, validTo: base + 20 },
      { id: `edge-2-${index}`, source: ids[1], target: ids[2], kind: "step-2", validFrom: base + 1, validTo: base + 20 },
      { id: `edge-3-${index}`, source: ids[2], target: ids[3], kind: "step-3", validFrom: base + 1, validTo: base + 20 }
    );
  }
  return { nodes, edges };
}

function makeLayeredFixture(width) {
  const layers = [
    { prefix: "a", kind: "role-first" },
    { prefix: "b", kind: "role-second" },
    { prefix: "c", kind: "role-third" },
    { prefix: "d", kind: "role-fourth" }
  ];
  const nodes = layers.flatMap(({ prefix, kind }) =>
    Array.from({ length: width }, (_, index) => ({ id: `${prefix}_${index}`, kind })));
  const edges = [];
  for (let layer = 0; layer < layers.length - 1; layer += 1) {
    for (let sourceIndex = 0; sourceIndex < width; sourceIndex += 1) {
      for (let targetIndex = 0; targetIndex < width; targetIndex += 1) {
        const step = layer + 1;
        const validFrom = 2000 + (step === 1 ? 2 : 1);
        edges.push({
          id: `edge-${step}-${sourceIndex}-${targetIndex}`,
          source: `${layers[layer].prefix}_${sourceIndex}`,
          target: `${layers[layer + 1].prefix}_${targetIndex}`,
          kind: `step-${step}`,
          validFrom,
          validTo: 2020
        });
      }
    }
  }
  return { nodes, edges };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function nearMatchSignature(match) {
  return JSON.stringify({
    roles: Object.fromEntries(Object.entries(match.roles).map(([role, value]) => [role, value.sourceId])),
    missingRoles: match.missingRoles,
    missingPatterns: match.missingPatterns.map(({ index }) => index),
    unavailablePatterns: match.temporalEvidence.unavailablePatterns.map(({ index }) => index),
    orderViolations: match.temporalEvidence.orderViolations,
    supportingEdges: match.temporalEvidence.supportingEdges.map((edge) => [...edge.edgeIds].sort())
  });
}

function compareCosts(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function selectOptimalCostWitnesses(result) {
  const witnesses = result?.Call?.[0]?.Witnesses;
  if (!Array.isArray(witnesses) || witnesses.length === 0) throw new Error("clingo non ha restituito witness near-match");
  const costs = witnesses.map((witness) => witness?.Costs);
  if (costs.some((value) => !Array.isArray(value) || !value.every(Number.isSafeInteger))) {
    throw new Error("clingo non ha restituito vettori di costo leggibili per tutti i witness");
  }
  const bestCosts = costs.reduce((best, value) => !best || compareCosts(value, best) < 0 ? value : best, undefined);
  return witnesses.filter((witness) => compareCosts(witness.Costs, bestCosts) === 0);
}

function optimalModelSignature(witness) {
  const atoms = Array.isArray(witness?.Value) ? witness.Value.filter((atom) => typeof atom === "string") : [];
  return JSON.stringify([...new Set(atoms)].sort());
}

function validateNearMatches(matches, motifCount, expectedDistinctCount, label) {
  assert.ok(matches.length > 0, `${label}: almeno un near-match ottimo`);
  const clusterIndexes = new Set();
  const signatures = new Set();
  for (const match of matches) {
    assert.deepEqual(match.missingRoles, [], `${label}: ruoli assegnati`);
    assert.deepEqual(match.missingPatterns, [], `${label}: pattern strutturali soddisfatti`);
    assert.deepEqual(match.temporalEvidence.unavailablePatterns, [], `${label}: intervalli disponibili`);
    assert.deepEqual(match.temporalEvidence.orderViolations, [{ firstIndex: 1, secondIndex: 2 }], `${label}: singola inversione temporale`);
    const suffix = match.roles.first.sourceId.match(/^a_(\d+)$/)?.[1];
    assert.ok(suffix !== undefined, `${label}: nodo iniziale riconducibile alla fixture`);
    const clusterIndex = Number(suffix);
    assert.ok(clusterIndex >= 0 && clusterIndex < motifCount, `${label}: indice del cluster nel dominio`);
    assert.deepEqual(
      Object.values(match.roles).map(({ sourceId }) => sourceId),
      [`a_${clusterIndex}`, `b_${clusterIndex}`, `c_${clusterIndex}`, `d_${clusterIndex}`],
      `${label}: ruoli co-localizzati nel cluster`
    );
    assert.deepEqual(
      match.temporalEvidence.supportingEdges.map((edge) => edge.edgeIds),
      [[`edge-1-${clusterIndex}`], [`edge-2-${clusterIndex}`], [`edge-3-${clusterIndex}`]],
      `${label}: ID dei tre archi testimoni`
    );
    clusterIndexes.add(clusterIndex);
    signatures.add(nearMatchSignature(match));
  }
  assert.equal(signatures.size, expectedDistinctCount ?? signatures.size,
    `${label}: numero di near-match semanticamente distinti`);
  if (expectedDistinctCount === motifCount) {
    assert.deepEqual([...clusterIndexes].sort((left, right) => left - right),
      Array.from({ length: motifCount }, (_, index) => index), `${label}: copertura di tutti i pareggi`);
  }
  return { signatures: [...signatures].sort(), semanticCount: signatures.size };
}

function validateLayeredNearMatches(matches, width, expectedDistinctCount, label) {
  assert.ok(matches.length > 0, `${label}: almeno un near-match ottimo`);
  const assignments = new Set();
  const signatures = new Set();
  const rolePrefixes = ["a", "b", "c", "d"];
  for (const match of matches) {
    assert.deepEqual(match.missingRoles, [], `${label}: ruoli assegnati`);
    assert.deepEqual(match.missingPatterns, [], `${label}: pattern strutturali soddisfatti`);
    assert.deepEqual(match.temporalEvidence.unavailablePatterns, [], `${label}: intervalli disponibili`);
    assert.deepEqual(match.temporalEvidence.orderViolations, [{ firstIndex: 1, secondIndex: 2 }], `${label}: singola inversione temporale`);
    const assignedNodes = ["first", "second", "third", "fourth"]
      .map((role) => match.roles[role]?.sourceId);
    const indices = assignedNodes.map((nodeId, index) => {
      const matchId = new RegExp(`^${rolePrefixes[index]}_(\\d+)$`).exec(nodeId ?? "");
      assert.ok(matchId, `${label}: tipo del ruolo ${index + 1} coerente con il livello`);
      const nodeIndex = Number(matchId[1]);
      assert.ok(nodeIndex >= 0 && nodeIndex < width, `${label}: nodo entro il livello`);
      return nodeIndex;
    });
    const [first, second, third, fourth] = indices;
    assert.deepEqual(
      match.temporalEvidence.supportingEdges.map((edge) => edge.edgeIds),
      [[`edge-1-${first}-${second}`], [`edge-2-${second}-${third}`], [`edge-3-${third}-${fourth}`]],
      `${label}: ID degli archi testimoni corrispondono ai ruoli`
    );
    assignments.add(indices.join(":"));
    signatures.add(nearMatchSignature(match));
  }
  const expectedCount = width ** 4;
  assert.equal(assignments.size, expectedDistinctCount ?? assignments.size,
    `${label}: assegnazioni di ruoli distinte`);
  assert.equal(signatures.size, expectedDistinctCount ?? signatures.size,
    `${label}: near-match semanticamente distinti`);
  if (expectedDistinctCount !== undefined) {
    const expectedAssignments = [];
    for (let first = 0; first < width; first += 1) {
      for (let second = 0; second < width; second += 1) {
        for (let third = 0; third < width; third += 1) {
          for (let fourth = 0; fourth < width; fourth += 1) {
            expectedAssignments.push([first, second, third, fourth].join(":"));
          }
        }
      }
    }
    assert.deepEqual([...assignments].sort(), expectedAssignments.sort(), `${label}: enumerazione completa dei ruoli`);
    assert.equal(assignments.size, expectedCount, `${label}: cardinalità combinatoria attesa`);
  }
  return { signatures: [...signatures].sort(), semanticCount: signatures.size };
}

async function benchmarkProfile({ profile, scale, expectedNearMatchCount, input, validate }) {
  const label = `${profile} ${scale}`;
  const graph = normalizeGraphData(input, config);
  if (!graph.valid || !graph.capabilities.edgeIntervals.available) {
    throw new Error(`Fixture temporale non valida: ${JSON.stringify(graph.diagnostics)}`);
  }
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifTemporalNearMatchProgram(template, graph.direction);
  const program = `${facts.facts}\n${compiled.program}\n`;
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const parse = (result, label) => {
    if (result?.Result !== "OPTIMUM FOUND") {
      throw new Error(`${label}: atteso OPTIMUM FOUND, ricevuto ${result?.Result ?? "NO_RESULT"}: ${result?.Error ?? ""}`);
    }
    return parseTypedMotifNearMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex,
      facts.temporalEncoding.decode
    );
  };

  const warmup = await runner.run(program, ["--opt-mode=opt", "--stats=2"]);
  const warmupMatches = parse(warmup, `${label} warm-up`);
  validate(warmupMatches, undefined, `${label} warm-up`);

  const selectionWallMs = [];
  const selectionParseMs = [];
  const selectionClingoMs = [];
  let selectionSignature;
  let groundingStats;
  let selectionModelCount;
  for (let repetition = 0; repetition < 3; repetition += 1) {
    const startedAt = performance.now();
    const result = await runner.run(program, ["--opt-mode=opt", "--stats=2"]);
    selectionWallMs.push(performance.now() - startedAt);
    if (!result.Stats?.LP || !Number.isFinite(Number(result.Time?.Total)) || !Number.isFinite(Number(result.Time?.Solve))) {
      throw new Error(`${label}: timing o statistiche di grounding mancanti`);
    }
    const parseStartedAt = performance.now();
    const matches = parse(result, `${label} opt run ${repetition + 1}`);
    selectionParseMs.push(performance.now() - parseStartedAt);
    const currentValidation = validate(matches, undefined, `${label} opt run ${repetition + 1}`);
    const currentSignature = JSON.stringify(currentValidation.signatures);
    if (selectionSignature !== undefined && currentSignature !== selectionSignature) {
      throw new Error(`${label}: il near-match selezionato cambia tra run con lo stesso input`);
    }
    selectionSignature = currentSignature;
    selectionModelCount = currentValidation.semanticCount;
    selectionClingoMs.push({ total: Number(result.Time.Total) * 1000, solve: Number(result.Time.Solve) * 1000 });
    groundingStats = result.Stats.LP;
  }

  const tieStartedAt = performance.now();
  const allOptima = await runner.run(program, ["--opt-mode=optN", "--stats=2"]);
  const tieEnumerationWallMs = performance.now() - tieStartedAt;
  if (allOptima?.Models?.More !== "no") {
    throw new Error(`${label}: optN non ha provato la completezza dell'enumerazione (${allOptima?.Models?.More ?? "metadato assente"})`);
  }
  const allMatches = parse(allOptima, `${label} optN`);
  const allTieValidation = validate(allMatches, expectedNearMatchCount, `${label} optN`);
  const optimalCostWitnesses = selectOptimalCostWitnesses(allOptima);
  const distinctOptimalModelCount = new Set(optimalCostWitnesses.map(optimalModelSignature)).size;
  assert.equal(distinctOptimalModelCount, expectedNearMatchCount,
    `${label}: il solver enumera un modello ASP distinto per near-match semantico`);
  const tieCosts = optimalCostWitnesses.map((witness) => JSON.stringify(witness.Costs));
  assert.ok(tieCosts.length >= expectedNearMatchCount,
    `${label}: ogni optimum semantico deve avere almeno un record di costo`);
  assert.equal(new Set(tieCosts).size, 1, `${label}: tutti i near-match condividono il costo ottimo`);

  const clingoTotalMs = selectionClingoMs.map(({ total }) => total);
  const clingoSolveMs = selectionClingoMs.map(({ solve }) => solve);
  return {
    profile,
    scale,
    expectedNearMatchCount,
    nodes: graph.nodes.length,
    directedEdges: graph.links.length,
    uniqueTemporalValues: new Set(input.edges.flatMap((edge) => [edge.validFrom, edge.validTo])).size,
    programBytes: Buffer.byteLength(program, "utf8"),
    distinctOptimalNearMatches: allTieValidation.semanticCount,
    rawOptimalWitnessRecords: optimalCostWitnesses.length,
    duplicateRawOptimalWitnessRecords: optimalCostWitnesses.length - distinctOptimalModelCount,
    selectedOptimalWitnessesInOptMode: selectionModelCount,
    selectedWitnessStableAcrossRuns: true,
    allOptimalWitnessesHaveSameCost: true,
    allTiedNearMatchesHaveDistinctSignatures: allTieValidation.semanticCount === expectedNearMatchCount,
    optModeWallMsMedian: Number(median(selectionWallMs).toFixed(2)),
    optModeWallMsSamples: selectionWallMs.map((value) => Number(value.toFixed(2))),
    optModeClingoMsMedian: {
      total: Number(median(clingoTotalMs).toFixed(2)),
      solve: Number(median(clingoSolveMs).toFixed(2)),
      preSolveEstimate: Number(median(selectionClingoMs.map(({ total, solve }) => total - solve)).toFixed(2))
    },
    parseMsMedian: Number(median(selectionParseMs).toFixed(2)),
    optNAllTiesWallMs: Number(tieEnumerationWallMs.toFixed(2)),
    grounding: {
      atoms: groundingStats.Atoms,
      originalRules: groundingStats.Rules?.Original,
      finalRules: groundingStats.Rules?.Final
    },
    wasmLinearMemory: runner.getWasmLinearMemoryStats()
  };
}

async function benchmarkDisjoint(motifCount) {
  return benchmarkProfile({
    profile: "disjoint-chains",
    scale: motifCount,
    expectedNearMatchCount: motifCount,
    input: makeFixture(motifCount),
    validate: (matches, expected, label) => validateNearMatches(matches, motifCount, expected, label)
  });
}

async function benchmarkLayered(width) {
  return benchmarkProfile({
    profile: "complete-layers",
    scale: width,
    expectedNearMatchCount: width ** 4,
    input: makeLayeredFixture(width),
    validate: (matches, expected, label) => validateLayeredNearMatches(matches, width, expected, label)
  });
}

const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--stress") || args.filter((argument) => argument === "--stress").length > 1) {
  throw new Error("Opzione supportata: --stress, per estendere i profili fino a 256 catene e 4.096 near-match.");
}
const stress = args.includes("--stress");
const motifCounts = stress ? [8, 16, 32, 64, 128, 256] : [8, 16, 32, 64];
const layerWidths = stress ? [2, 3, 4, 6, 8] : [2, 3, 4];
const measurements = [];
for (const motifCount of motifCounts) measurements.push(await benchmarkDisjoint(motifCount));
for (const width of layerWidths) measurements.push(await benchmarkLayered(width));

console.log(JSON.stringify({
  note: "Benchmark sintetico del why-not temporale orderedByStart. Le catene disgiunte misurano una crescita lineare; la topologia complete-layers ha width nodi per ruolo, tutti gli archi tra ruoli adiacenti e width^4 assegnazioni ottime con una inversione temporale ciascuna. opt-mode viene ripetuto tre volte per misurare la stabilita del witness UI, mentre optN deve enumerare tutti i pareggi distinti e completo. Total-Solve e una stima pre-solving (parsing, grounding e setup), non un timer puro del grounder. Le date sono anni sintetici e non attestano una cronologia di dominio; memoria WASM e separata dall'heap JS/RSS del Worker browser.",
  measurements
}, null, 2));
