import assert from "node:assert/strict";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";
import {
  buildSignedTriadProgram,
  parseSignedTriadResults,
  prepareSignedTriads
} from "../src/lib/kliqueasp/graph/signedTriadTask.ts";
import {
  buildSignedTriadScenarioCsv,
  summarizeSignedTriadScenarios
} from "../src/lib/kliqueasp/graph/signedTriadScenarioAnalysis.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import { hasCompleteModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";

const config = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.id" },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      direction: "undirected",
      identity: "multigraph",
      provenanceField: "$.sourceRef",
      attributes: { polarity: "$.sign" }
    }
  },
  graphAnalysis: {
    signedTriads: { attribute: "polarity", positiveValues: ["+"], negativeValues: ["-"] },
    provenanceScenarios: {
      unattributedEdges: "exclude",
      worldAssumption: "finite-exhaustive-worlds",
      scenarios: ["balanced", "unbalanced", "incomplete"].map((id) => ({ id, sources: [id] }))
    }
  }
};

const queryScope = (overrides = {}) => ({
  attribute: "polarity",
  positiveValues: ["+"],
  negativeValues: ["-"],
  edgeTypes: [],
  selectedGroup: "",
  timelineWindow: "",
  minimumEdgeConfidence: null,
  viewFilters: { types: [], groups: [] },
  ...overrides
});

function triad(nodeIds, balanced, negativeDyadCount) {
  const ids = [...nodeIds].sort();
  const dyads = [[ids[0], ids[1]], [ids[0], ids[2]], [ids[1], ids[2]]].map(([sourceNodeId, targetNodeId], index) => ({
    id: index + 1,
    sourceIndex: index + 1,
    targetIndex: index + 2,
    sourceNodeId,
    targetNodeId,
    polarity: index < negativeDyadCount ? "negative" : "positive",
    edgeRecords: [{ id: `edge-${sourceNodeId}-${targetNodeId}`, generated: false }]
  }));
  return { nodeIds, balanced, negativeDyadCount, dyads };
}

function scenario(scenarioId, triads, overrides = {}) {
  return {
    scenarioId,
    scenarioLabel: scenarioId,
    nodesCount: 3,
    linksCount: 3,
    timeMs: 1,
    enumerationComplete: true,
    triads,
    ...overrides
  };
}

test("le classificazioni delle triadi distinguono bilanciamento stabile, variabile e non classificato", () => {
  const comparison = summarizeSignedTriadScenarios([
    scenario("balanced", [triad(["c", "a", "b"], true, 0), triad(["a", "b", "d"], false, 1)]),
    scenario("unbalanced", [triad(["a", "b", "c"], false, 1), triad(["a", "b", "d"], true, 2)]),
    scenario("incomplete", [triad(["a", "b", "d"], true, 0)])
  ], queryScope());

  assert.equal(comparison.worldAssumption, "finite-exhaustive-worlds");
  assert.deepEqual(comparison.memberships.map(({ nodeIds, stability, worlds }) => ({
    nodeIds,
    stability,
    classifications: worlds.map(({ classification }) => classification)
  })), [
    {
      nodeIds: ["a", "b", "c"],
      stability: "balance-and-classification-vary",
      classifications: ["balanced", "unbalanced", "not-classified"]
    },
    {
      nodeIds: ["a", "b", "d"],
      stability: "balance-varies",
      classifications: ["unbalanced", "balanced", "balanced"]
    }
  ]);
  assert.equal(comparison.scenarios[2].notClassifiedWithinObservedUnion, 1);
  assert.deepEqual(comparison.scenarios.map(({
    classifiedTriads,
    balancedTriads,
    unbalancedTriads,
    balancedShare,
    commonTriads,
    balancedCommonTriads,
    unbalancedCommonTriads,
    balancedCommonShare
  }) => ({
    classifiedTriads,
    balancedTriads,
    unbalancedTriads,
    balancedShare,
    commonTriads,
    balancedCommonTriads,
    unbalancedCommonTriads,
    balancedCommonShare
  })), [
    { classifiedTriads: 2, balancedTriads: 1, unbalancedTriads: 1, balancedShare: 0.5, commonTriads: 1, balancedCommonTriads: 0, unbalancedCommonTriads: 1, balancedCommonShare: 0 },
    { classifiedTriads: 2, balancedTriads: 1, unbalancedTriads: 1, balancedShare: 0.5, commonTriads: 1, balancedCommonTriads: 1, unbalancedCommonTriads: 0, balancedCommonShare: 1 },
    { classifiedTriads: 1, balancedTriads: 1, unbalancedTriads: 0, balancedShare: 1, commonTriads: 1, balancedCommonTriads: 1, unbalancedCommonTriads: 0, balancedCommonShare: 1 }
  ]);
});

test("le cinque etichette di stabilità mantengono separati i due tipi di variazione", () => {
  const comparison = summarizeSignedTriadScenarios([
    scenario("w1", [triad(["a", "b", "c"], true, 0), triad(["a", "b", "d"], false, 1), triad(["a", "c", "d"], true, 2), triad(["b", "c", "d"], true, 0), triad(["b", "c", "e"], false, 1)]),
    scenario("w2", [triad(["a", "b", "c"], true, 2), triad(["a", "b", "d"], true, 0), triad(["b", "c", "e"], false, 3)])
  ], queryScope());

  assert.deepEqual(comparison.memberships.map(({ stability }) => stability), [
    "stable-balanced",
    "balance-varies",
    "classification-varies",
    "classification-varies",
    "stable-unbalanced"
  ]);
});

test("il confronto rifiuta mondi incompleti, ID duplicati e parità incoerenti", () => {
  assert.throws(() => summarizeSignedTriadScenarios([
    scenario("partial", [triad(["a", "b", "c"], true, 0)], { enumerationComplete: false })
  ], queryScope()), /enumerazione completa/);
  assert.throws(() => summarizeSignedTriadScenarios([
    scenario("same", []), scenario("same", [])
  ], queryScope()), /ID scenario duplicato/);
  assert.throws(() => summarizeSignedTriadScenarios([
    scenario("bad", [triad(["a", "b", "c"], true, 1)])
  ], queryScope()), /parità.*non coincide/);
});

test("la configurazione di polarità del confronto applica scalarità, unicità e disgiunzione tipizzata", () => {
  assert.doesNotThrow(() => summarizeSignedTriadScenarios([
    scenario("typed", [])
  ], queryScope({ positiveValues: [1], negativeValues: ["1"] })));
  assert.throws(() => summarizeSignedTriadScenarios([
    scenario("overlap", [])
  ], queryScope({ positiveValues: [1], negativeValues: [1] })), /devono essere disgiunti/);
  assert.throws(() => summarizeSignedTriadScenarios([
    scenario("duplicate", [])
  ], queryScope({ positiveValues: ["+", "+"] })), /duplicati/);
  assert.throws(() => summarizeSignedTriadScenarios([
    scenario("non-finite", [])
  ], queryScope({ positiveValues: [Infinity] })), /numeri finiti/);
  assert.throws(() => summarizeSignedTriadScenarios([
    scenario("empty-string", [])
  ], queryScope({ positiveValues: [""] })), /stringhe non vuote/);
});

test("il CSV conserva le classificazioni per mondo e non trasforma gli scenari in probabilità", () => {
  const comparison = summarizeSignedTriadScenarios([
    scenario("w1", [triad(["a", "b", "c"], true, 0)]),
    scenario("w2", [])
  ], queryScope({
    edgeTypes: ["workplace", "alliance"],
    selectedGroup: "psychologists",
    viewFilters: { types: ["person"], groups: [] }
  }));
  const csv = buildSignedTriadScenarioCsv(comparison);
  assert.deepEqual(comparison.scenarios.map(({ balancedShare }) => balancedShare), [1, null]);
  assert.match(csv, /"record_type".*"world_classifications_json"/);
  assert.match(csv, /"edge_types_json"/);
  assert.match(csv, /"finite-exhaustive-worlds","polarity"/);
  assert.ok(csv.includes('"[""alliance"",""workplace""]"'));
  assert.match(csv, /"classification-varies"/);
  assert.match(csv, /not-classified/);
  assert.match(csv, /psychologists/);
  assert.doesNotMatch(csv, /probability|likelihood/i);
  assert.ok(csv.includes('balanced_share"":1'));
  assert.ok(csv.includes('balanced_share"":null'));
  assert.ok(csv.includes('balanced_common_share"":null'));
  assert.ok(csv.includes('common_classified_triads"":0'));

  const commonComparison = summarizeSignedTriadScenarios([
    scenario("w1", [triad(["a", "b", "c"], true, 0)]),
    scenario("w2", [triad(["a", "b", "c"], false, 1)])
  ], queryScope());
  assert.deepEqual(commonComparison.scenarios.map(({
    commonTriads,
    balancedCommonTriads,
    unbalancedCommonTriads,
    balancedCommonShare
  }) => ({ commonTriads, balancedCommonTriads, unbalancedCommonTriads, balancedCommonShare })), [
    { commonTriads: 1, balancedCommonTriads: 1, unbalancedCommonTriads: 0, balancedCommonShare: 1 },
    { commonTriads: 1, balancedCommonTriads: 0, unbalancedCommonTriads: 1, balancedCommonShare: 0 }
  ]);
  const commonCsv = buildSignedTriadScenarioCsv(commonComparison);
  assert.ok(commonCsv.includes('balanced_common_share"":1'));
  assert.ok(commonCsv.includes('balanced_common_share"":0'));

  const emptyCsv = buildSignedTriadScenarioCsv(summarizeSignedTriadScenarios([
    scenario("empty", [])
  ], queryScope()));
  assert.match(emptyCsv, /"summary"/);
  assert.match(emptyCsv, /"scenario_id"/);
});

test("il contesto multi-mondo canonizza i tipi firmati e ne rifiuta le dichiarazioni ambigue", () => {
  const comparison = summarizeSignedTriadScenarios([scenario("typed", [])], queryScope({
    edgeTypes: ["workplace", "alliance"]
  }));
  assert.deepEqual(comparison.queryScope.edgeTypes, ["alliance", "workplace"]);
  assert.throws(() => summarizeSignedTriadScenarios([scenario("duplicate", [])], queryScope({
    edgeTypes: ["friendship", "friendship"]
  })), /edgeTypes non deve contenere duplicati/);
  assert.throws(() => summarizeSignedTriadScenarios([scenario("empty", [])], queryScope({
    edgeTypes: [""]
  })), /edgeTypes deve contenere solo stringhe non vuote/);
});

test("il confronto ASP multi-mondo identifica triadi bilanciate, sbilanciate e non classificate", async () => {
  const normalized = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id })),
    edges: [
      { id: "ab-balanced", from: "a", to: "b", sign: "+", sourceRef: "balanced" },
      { id: "ac-balanced", from: "a", to: "c", sign: "+", sourceRef: "balanced" },
      { id: "bc-balanced", from: "b", to: "c", sign: "+", sourceRef: "balanced" },
      { id: "ab-unbalanced", from: "a", to: "b", sign: "-", sourceRef: "unbalanced" },
      { id: "ac-unbalanced", from: "a", to: "c", sign: "+", sourceRef: "unbalanced" },
      { id: "bc-unbalanced", from: "b", to: "c", sign: "+", sourceRef: "unbalanced" },
      { id: "ab-incomplete", from: "a", to: "b", sign: "+", sourceRef: "incomplete" },
      { id: "ac-incomplete", from: "a", to: "c", sign: "+", sourceRef: "incomplete" }
    ]
  }, config);
  assert.equal(normalized.valid, true, JSON.stringify(normalized.diagnostics));

  const runner = await createClingoWasmRunner();
  const scenarioInputs = [];
  for (const id of ["balanced", "unbalanced", "incomplete"]) {
    const links = filterLinksByProvenanceScenario(normalized.links, {
      sources: [id],
      unattributedEdges: "exclude",
      referenceMatching: "any"
    });
    const graph = { ...normalized, links };
    const facts = buildAspFactsFromGraph(graph);
    const preparation = prepareSignedTriads(
      config.graphAnalysis.signedTriads,
      graph.schemaVersion,
      graph.direction,
      graph.nodes,
      graph.links,
      new Set(["polarity"])
    );
    assert.equal(preparation.available, true, JSON.stringify(preparation.reasons));
    const result = await runner.run(`${facts.facts}\n${buildSignedTriadProgram(preparation)}`);
    assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
    assert.equal(hasCompleteModelEnumeration(result), true);
    scenarioInputs.push({
      scenarioId: id,
      scenarioLabel: id,
      nodesCount: graph.nodes.length,
      linksCount: graph.links.length,
      timeMs: 1,
      enumerationComplete: true,
      triads: parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, preparation.dyads)
    });
  }

  const comparison = summarizeSignedTriadScenarios(scenarioInputs, queryScope());
  assert.equal(comparison.memberships.length, 1);
  assert.equal(comparison.memberships[0].stability, "balance-and-classification-vary");
  assert.deepEqual(comparison.memberships[0].worlds.map(({ classification }) => classification), [
    "balanced", "unbalanced", "not-classified"
  ]);
  assert.deepEqual(comparison.memberships[0].worlds[0].evidence.dyads.flatMap((dyad) =>
    dyad.edgeRecords.map((record) => record.id)), ["ab-balanced", "ac-balanced", "bc-balanced"]);
  assert.deepEqual(comparison.scenarios.map(({
    classifiedTriads,
    balancedTriads,
    unbalancedTriads,
    balancedShare,
    commonTriads,
    balancedCommonTriads,
    unbalancedCommonTriads,
    balancedCommonShare
  }) => ({
    classifiedTriads,
    balancedTriads,
    unbalancedTriads,
    balancedShare,
    commonTriads,
    balancedCommonTriads,
    unbalancedCommonTriads,
    balancedCommonShare
  })), [
    { classifiedTriads: 1, balancedTriads: 1, unbalancedTriads: 0, balancedShare: 1, commonTriads: 0, balancedCommonTriads: 0, unbalancedCommonTriads: 0, balancedCommonShare: null },
    { classifiedTriads: 1, balancedTriads: 0, unbalancedTriads: 1, balancedShare: 0, commonTriads: 0, balancedCommonTriads: 0, unbalancedCommonTriads: 0, balancedCommonShare: null },
    { classifiedTriads: 0, balancedTriads: 0, unbalancedTriads: 0, balancedShare: null, commonTriads: 0, balancedCommonTriads: 0, unbalancedCommonTriads: 0, balancedCommonShare: null }
  ]);
});
