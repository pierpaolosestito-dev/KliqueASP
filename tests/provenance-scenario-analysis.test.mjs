import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAspFactsFromGraph,
  buildCliqueProgram,
  getCliqueModeOptions,
  normalizeGraphData,
  parseWitnessCliques,
  selectMaximumCliques
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildConnectedComponentsProgram,
  buildKCoreProgram,
  buildStronglyConnectedComponentsProgram,
  buildWeaklyConnectedComponentsProgram,
  hasCompleteModelEnumeration,
  buildMinimumDominatingSetProgram,
  buildDominatingSetFeasibilityProgram,
  verifyDominatingSetFeasibilityCertificate,
  parseWitnessDominatingSetExplanations,
  parseDominatingSetFeasibilityCertificate,
  selectMinimumNodeSets,
  parseWitnessComponents,
  parseWitnessStrongComponents,
  parseWitnessWeakComponents,
  parseWitnessKPlexExplanations,
  searchMaximumKPlexWithAsp,
  computeKCoreNumbers,
  getStructuralSolverOptions,
  parseWitnessNodeSets,
  selectMaximumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";
import {
  buildProvenanceScenarioComponentsCsv,
  buildProvenanceScenarioDominatingSetCsv,
  buildProvenanceScenarioCliqueCsv,
  buildProvenanceScenarioKCoreCsv,
  buildProvenanceScenarioKPlexCsv,
  summarizeProvenanceScenarioMaximumKPlexes,
  summarizeProvenanceScenarioComponents,
  summarizeProvenanceScenarioDominatingSets,
  summarizeProvenanceScenarioKCores,
  summarizeProvenanceScenarioMaximumCliques
} from "../src/lib/kliqueasp/graph/provenanceScenarioAnalysis.ts";
import { projectVisibleNodeIds } from "../src/lib/kliqueasp/graph/visibleNodeProjection.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("la membership stabile richiede ogni clique ottima in ogni scenario dichiarato", () => {
  const summary = summarizeProvenanceScenarioMaximumCliques([
    {
      scenarioId: "archive-a",
      scenarioLabel: "Archivio A",
      nodesCount: 4,
      linksCount: 5,
      timeMs: 10,
      maximumCliques: [["a", "b"], ["c", "b"]]
    },
    {
      scenarioId: "archive-b",
      scenarioLabel: "Archivio B",
      nodesCount: 4,
      linksCount: 4,
      timeMs: 20,
      maximumCliques: [["b", "c"], ["b", "d"]]
    }
  ]);

  assert.equal(summary.scenarioCount, 2);
  assert.equal(summary.totalOptimalAnswerSetCount, 4);
  assert.deepEqual(summary.stableNodeIds, ["b"]);
  assert.deepEqual(summary.nonUniversalNodeIds, ["a", "c", "d"]);
  assert.deepEqual(summary.memberships, [
    {
      nodeId: "a",
      scenarioSupportCount: 1,
      scenarioIds: ["archive-a"],
      optimalAnswerSetCount: 1,
      totalOptimalAnswerSetCount: 4,
      stableAcrossEveryOptimalAnswerSet: false
    },
    {
      nodeId: "b",
      scenarioSupportCount: 2,
      scenarioIds: ["archive-a", "archive-b"],
      optimalAnswerSetCount: 4,
      totalOptimalAnswerSetCount: 4,
      stableAcrossEveryOptimalAnswerSet: true
    },
    {
      nodeId: "c",
      scenarioSupportCount: 2,
      scenarioIds: ["archive-a", "archive-b"],
      optimalAnswerSetCount: 2,
      totalOptimalAnswerSetCount: 4,
      stableAcrossEveryOptimalAnswerSet: false
    },
    {
      nodeId: "d",
      scenarioSupportCount: 1,
      scenarioIds: ["archive-b"],
      optimalAnswerSetCount: 1,
      totalOptimalAnswerSetCount: 4,
      stableAcrossEveryOptimalAnswerSet: false
    }
  ]);
});

test("il confronto della clique distingue i nodi proiettati, i candidati e i candidati mai selezionati", () => {
  const comparison = summarizeProvenanceScenarioMaximumCliques([
    {
      scenarioId: "source-a",
      nodesCount: 4,
      linksCount: 1,
      timeMs: 1,
      candidateNodeIds: ["a", "b", "only-a", "never"],
      maximumCliques: [["a", "b"]]
    },
    {
      scenarioId: "source-b",
      nodesCount: 3,
      linksCount: 1,
      timeMs: 1,
      candidateNodeIds: ["a", "b", "only-b"],
      maximumCliques: [["a", "b"]]
    }
  ], "finite-exhaustive-worlds");

  assert.deepEqual(comparison.stableNodeIds, ["a", "b"]);
  assert.deepEqual(comparison.nonUniversalNodeIds, ["never", "only-a", "only-b"]);
  assert.deepEqual(comparison.memberships.find(({ nodeId }) => nodeId === "never"), {
    nodeId: "never",
    candidateScenarioSupportCount: 1,
    candidateScenarioIds: ["source-a"],
    scenarioSupportCount: 0,
    scenarioIds: [],
    optimalAnswerSetCount: 0,
    totalOptimalAnswerSetCount: 2,
    stableAcrossEveryOptimalAnswerSet: false
  });
  assert.equal(comparison.scenarios[0].candidateNodeCount, 4);
  assert.equal(comparison.scenarios[0].nodesCount, 4);
  const csv = buildProvenanceScenarioCliqueCsv(comparison);
  assert.match(csv.split("\n")[0], /projected_nodes.*candidate_scenario_count/);
  assert.ok(csv.includes("not-brave"));
  assert.throws(() => summarizeProvenanceScenarioMaximumCliques([
    { scenarioId: "a", nodesCount: 2, linksCount: 1, timeMs: 1, candidateNodeIds: ["a"], maximumCliques: [["a"]] },
    { scenarioId: "b", nodesCount: 2, linksCount: 1, timeMs: 1, maximumCliques: [["a"]] }
  ]), /per tutti gli scenari o per nessuno/);
});

test("CSV clique multi-scenario registra tutti i filtri della proiezione", () => {
  const comparison = summarizeProvenanceScenarioMaximumCliques([{
    scenarioId: "archive-a",
    scenarioLabel: "Archivio A",
    nodesCount: 3,
    linksCount: 2,
    timeMs: 4.5,
    maximumCliques: [["a", "b"]]
  }]);
  const csv = buildProvenanceScenarioCliqueCsv(
    comparison,
    { a: "=Alice" },
    "psychologists",
    0.8,
    "1900–2000",
    { types: ["person", "institution"], groups: ["north"] }
  );
  const [header, scenarioRow, membershipRow] = csv.split("\n");

  assert.match(header, /selected_group.*confidence_threshold.*timeline_window.*view_type_filters_json.*view_group_filters_json/);
  assert.match(scenarioRow, /"psychologists","0.8","1900–2000","\[""institution"",""person""\]","\[""north""\]"/);
  assert.match(membershipRow, /"a","'=Alice"/);
  assert.match(membershipRow, /"universal"/);
});

test("brave e cautious sono dichiarati solo per mondi finiti esaustivi", () => {
  const scenarioInputs = [
    {
      scenarioId: "world-a",
      nodesCount: 4,
      linksCount: 5,
      timeMs: 10,
      maximumCliques: [["a", "b"], ["c", "b"]]
    },
    {
      scenarioId: "world-b",
      nodesCount: 4,
      linksCount: 4,
      timeMs: 20,
      maximumCliques: [["b", "c"], ["b", "d"]]
    }
  ];
  const projections = summarizeProvenanceScenarioMaximumCliques(scenarioInputs);
  const finiteWorlds = summarizeProvenanceScenarioMaximumCliques(scenarioInputs, "finite-exhaustive-worlds");

  assert.equal(projections.worldAssumption, "declared-projections");
  assert.equal(finiteWorlds.worldAssumption, "finite-exhaustive-worlds");
  assert.deepEqual(finiteWorlds.stableNodeIds, ["b"]);
  assert.deepEqual(finiteWorlds.nonUniversalNodeIds, ["a", "c", "d"]);
  const csv = buildProvenanceScenarioCliqueCsv(finiteWorlds);
  const [header, ...rows] = csv.split("\n");
  assert.match(header, /world_assumption.*brave_cautious_status/);
  assert.ok(rows.some((row) => row.includes("\"b\"") && row.includes("brave-and-cautious")));
  assert.ok(rows.some((row) => row.includes("\"c\"") && row.includes("brave-only")));
  assert.throws(() => summarizeProvenanceScenarioMaximumCliques(scenarioInputs, "probabilistic"), /worldAssumption/);
});

test("la membership k-plex distingue domini candidati, scenari e tutti i witness massimi", () => {
  const comparison = summarizeProvenanceScenarioMaximumKPlexes([
    {
      scenarioId: "source-a",
      nodesCount: 3,
      linksCount: 2,
      timeMs: 5,
      candidateNodeIds: ["a", "b", "c"],
      maximumKPlexes: [["a", "b"], ["b", "c"]]
    },
    {
      scenarioId: "source-b",
      scenarioLabel: "=Source B",
      nodesCount: 4,
      linksCount: 1,
      timeMs: 7,
      candidateNodeIds: ["a", "b", "c", "d"],
      maximumKPlexes: [["a", "b"]]
    }
  ], 1);

  assert.equal(comparison.s, 1);
  assert.equal(comparison.scenarioCount, 2);
  assert.equal(comparison.totalOptimalAnswerSetCount, 3);
  assert.deepEqual(comparison.stableNodeIds, ["b"]);
  assert.deepEqual(comparison.nonUniversalNodeIds, ["a", "c", "d"]);
  assert.deepEqual(comparison.scenarios.map((scenario) => [
    scenario.scenarioId,
    scenario.candidateNodeCount,
    scenario.maximumKPlexSize,
    scenario.maximumKPlexCount
  ]), [
    ["source-a", 3, 2, 2],
    ["source-b", 4, 2, 1]
  ]);
  assert.deepEqual(comparison.memberships.find((membership) => membership.nodeId === "b"), {
    nodeId: "b",
    candidateScenarioSupportCount: 2,
    candidateScenarioIds: ["source-a", "source-b"],
    scenarioSupportCount: 2,
    scenarioIds: ["source-a", "source-b"],
    optimalAnswerSetCount: 3,
    totalOptimalAnswerSetCount: 3,
    stableAcrossEveryOptimalAnswerSet: true
  });
  assert.deepEqual(comparison.memberships.find((membership) => membership.nodeId === "d"), {
    nodeId: "d",
    candidateScenarioSupportCount: 1,
    candidateScenarioIds: ["source-b"],
    scenarioSupportCount: 0,
    scenarioIds: [],
    optimalAnswerSetCount: 0,
    totalOptimalAnswerSetCount: 3,
    stableAcrossEveryOptimalAnswerSet: false
  });
});

test("la membership k-plex usa brave/cautious solo sotto l'assunzione di mondi esaustivi", () => {
  const scenarioInputs = [
    {
      scenarioId: "world-a",
      nodesCount: 3,
      linksCount: 2,
      timeMs: 5,
      candidateNodeIds: ["a", "b", "c"],
      maximumKPlexes: [["a", "b"], ["b", "c"]]
    },
    {
      scenarioId: "world-b",
      nodesCount: 4,
      linksCount: 1,
      timeMs: 7,
      candidateNodeIds: ["a", "b", "c", "d"],
      maximumKPlexes: [["a", "b"]]
    }
  ];
  const projections = summarizeProvenanceScenarioMaximumKPlexes(scenarioInputs, 1);
  const finiteWorlds = summarizeProvenanceScenarioMaximumKPlexes(
    scenarioInputs,
    1,
    "finite-exhaustive-worlds"
  );

  assert.equal("worldAssumption" in projections, false);
  assert.equal(finiteWorlds.worldAssumption, "finite-exhaustive-worlds");
  assert.deepEqual(finiteWorlds.stableNodeIds, ["b"]);
  assert.deepEqual(finiteWorlds.nonUniversalNodeIds, ["a", "c", "d"]);
  const csv = buildProvenanceScenarioKPlexCsv(finiteWorlds);
  const [header, ...rows] = csv.split("\n");
  assert.match(header, /world_assumption.*brave_cautious_status/);
  assert.ok(rows.some((row) => row.includes('"b"') && row.includes("brave-and-cautious")));
  assert.ok(rows.some((row) => row.includes('"a"') && row.includes("brave-only")));
  assert.ok(rows.some((row) => row.includes('"d"') && row.includes("not-brave")));
  assert.throws(() => summarizeProvenanceScenarioMaximumKPlexes(scenarioInputs, 1, "probabilistic"), /worldAssumption/);
});

test("il riepilogo k-plex rifiuta parametri, domini e witness fuori dominio invalidi", () => {
  const scenario = {
    scenarioId: "source-a",
    nodesCount: 2,
    linksCount: 1,
    timeMs: 1,
    candidateNodeIds: ["a", "b"],
    maximumKPlexes: [["a", "b"]]
  };
  assert.throws(() => summarizeProvenanceScenarioMaximumKPlexes([scenario], 0), /s deve/);
  assert.throws(() => summarizeProvenanceScenarioMaximumKPlexes([], 1), /almeno uno scenario/);
  assert.throws(() => summarizeProvenanceScenarioMaximumKPlexes([
    { ...scenario, candidateNodeIds: ["a"] }
  ], 1), /fuori dal dominio candidato/);
  assert.throws(() => summarizeProvenanceScenarioMaximumKPlexes([
    { ...scenario, candidateNodeIds: ["a", "a"] }
  ], 1), /Dominio candidato/);
});

test("CSV k-plex contiene cardinalità, membership dei witness e neutralizza le etichette formula", () => {
  const comparison = summarizeProvenanceScenarioMaximumKPlexes([
    {
      scenarioId: "source-a",
      scenarioLabel: "=HYPERLINK(1)",
      nodesCount: 3,
      linksCount: 2,
      timeMs: 8.5,
      candidateNodeIds: ["a", "b", "c"],
      maximumKPlexes: [["a", "b"], ["b", "c"]]
    }
  ], 1);
  const csv = buildProvenanceScenarioKPlexCsv(
    comparison,
    { b: "+formula" },
    "psychologists",
    0.5,
    "1900–2000",
    { types: ["institution", "person"], groups: ["North"] }
  );
  const [header, ...rows] = csv.split("\n");
  assert.match(header, /maximum_k_plex_count/);
  assert.match(header, /candidate_scenario_ids_json/);
  assert.match(header, /optimal_answer_set_count/);
  assert.match(header, /view_type_filters_json/);
  assert.match(header, /view_group_filters_json/);
  assert.match(rows[0], /'=HYPERLINK\(1\)/);
  assert.ok(rows.some((row) => row.startsWith('"node_membership"') && row.includes(',"b","\'+formula"')));
  assert.match(rows[0], /psychologists/);
  assert.match(rows[0], /1900–2000/);
  assert.match(rows[0], /""institution"",""person""/);
  assert.match(rows[0], /""North""/);
});

test("modelli duplicati e witness non massimi non falsano la comparazione", () => {
  const summary = summarizeProvenanceScenarioMaximumCliques([{
    scenarioId: "a",
    nodesCount: 3,
    linksCount: 2,
    timeMs: 1,
    maximumCliques: [["b", "a"], ["a", "b"], ["b"], ["c", "b"]]
  }]);

  assert.equal(summary.totalOptimalAnswerSetCount, 2);
  assert.equal(summary.scenarios[0].maximumCliqueSize, 2);
  assert.equal(summary.scenarios[0].maximumCliqueCount, 2);
  assert.deepEqual(summary.stableNodeIds, ["b"]);
  assert.deepEqual(summary.nonUniversalNodeIds, ["a", "c"]);
});

test("rifiuta scenari senza ID univoco, statistiche coerenti o answer set ottimi", () => {
  const validScenario = {
    scenarioId: "a",
    nodesCount: 1,
    linksCount: 0,
    timeMs: 1,
    maximumCliques: [["a"]]
  };

  assert.throws(() => summarizeProvenanceScenarioMaximumCliques([]), /almeno uno scenario/);
  assert.throws(() => summarizeProvenanceScenarioMaximumCliques([validScenario, validScenario]), /univoci/);
  assert.throws(() => summarizeProvenanceScenarioMaximumCliques([{
    ...validScenario,
    nodesCount: 0
  }]), /Statistiche non valide/);
  assert.throws(() => summarizeProvenanceScenarioMaximumCliques([{
    ...validScenario,
    maximumCliques: []
  }]), /witness ottimi completi/);
  assert.throws(() => summarizeProvenanceScenarioMaximumCliques([{
    ...validScenario,
    maximumCliques: [["a", null]]
  }]), /Witness di clique non valido/);
});

test("la stabilità del k-core aggrega membership uniche sui soli scenari dichiarati", () => {
  const summary = summarizeProvenanceScenarioKCores([
    {
      scenarioId: "archive-a",
      nodesCount: 4,
      linksCount: 3,
      timeMs: 10,
      candidateNodeIds: ["a", "b", "c", "d"],
      coreNodeIds: ["c", "a", "b"]
    },
    {
      scenarioId: "archive-b",
      nodesCount: 4,
      linksCount: 3,
      timeMs: 12,
      candidateNodeIds: ["a", "b", "c", "d"],
      coreNodeIds: ["d", "b", "a"]
    }
  ], 2);

  assert.equal(summary.k, 2);
  assert.equal(summary.degreeMode, "undirected");
  assert.deepEqual(summary.stableNodeIds, ["a", "b"]);
  assert.deepEqual(summary.nonUniversalNodeIds, ["c", "d"]);
  assert.deepEqual(summary.memberships, [
    { nodeId: "a", candidateScenarioSupportCount: 2, candidateScenarioIds: ["archive-a", "archive-b"], scenarioSupportCount: 2, scenarioIds: ["archive-a", "archive-b"], stableAcrossEveryScenario: true, stableAcrossEveryEligibleScenario: true },
    { nodeId: "b", candidateScenarioSupportCount: 2, candidateScenarioIds: ["archive-a", "archive-b"], scenarioSupportCount: 2, scenarioIds: ["archive-a", "archive-b"], stableAcrossEveryScenario: true, stableAcrossEveryEligibleScenario: true },
    { nodeId: "c", candidateScenarioSupportCount: 2, candidateScenarioIds: ["archive-a", "archive-b"], scenarioSupportCount: 1, scenarioIds: ["archive-a"], stableAcrossEveryScenario: false, stableAcrossEveryEligibleScenario: false },
    { nodeId: "d", candidateScenarioSupportCount: 2, candidateScenarioIds: ["archive-a", "archive-b"], scenarioSupportCount: 1, scenarioIds: ["archive-b"], stableAcrossEveryScenario: false, stableAcrossEveryEligibleScenario: false }
  ]);
});

test("il k-core mantiene i candidati mai selezionati e separa stabilità globale e condizionata all'eleggibilità", () => {
  const comparison = summarizeProvenanceScenarioKCores([
    {
      scenarioId: "world-a", nodesCount: 4, linksCount: 3, timeMs: 1,
      candidateNodeIds: ["always", "conditional", "never", "outside"],
      coreNodeIds: ["always", "conditional"]
    },
    {
      scenarioId: "world-b", nodesCount: 3, linksCount: 2, timeMs: 1,
      candidateNodeIds: ["always", "never", "outside"],
      coreNodeIds: ["always"]
    }
  ], 2, "undirected", "finite-exhaustive-worlds");

  assert.deepEqual(comparison.stableNodeIds, ["always"]);
  assert.deepEqual(comparison.nonUniversalNodeIds, ["conditional", "never", "outside"]);
  assert.equal(comparison.memberships.find(({ nodeId }) => nodeId === "conditional")?.stableAcrossEveryScenario, false);
  assert.equal(comparison.memberships.find(({ nodeId }) => nodeId === "conditional")?.stableAcrossEveryEligibleScenario, true);
  assert.deepEqual(comparison.memberships.find(({ nodeId }) => nodeId === "never"), {
    nodeId: "never",
    candidateScenarioSupportCount: 2,
    candidateScenarioIds: ["world-a", "world-b"],
    scenarioSupportCount: 0,
    scenarioIds: [],
    stableAcrossEveryScenario: false,
    stableAcrossEveryEligibleScenario: false
  });
  assert.equal(comparison.memberships.some(({ nodeId }) => nodeId === "outside"), true);

  const csv = buildProvenanceScenarioKCoreCsv(comparison);
  assert.match(csv.split("\n")[0], /candidate_nodes.*projected_nodes/);
  assert.ok(csv.includes("not-brave"));
  assert.ok(csv.includes("eligible-universal"));
});

test("un confronto k-core accetta uno scenario con dominio candidato vuoto", async () => {
  const graph = normalizeGraphData({ nodes: [], edges: [] });
  const asp = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts}\n${buildKCoreProgram(2, "candidate")}\n`,
    getStructuralSolverOptions("kCore")
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true);
  assert.equal(result.Models.More, "no");
  const coreNodeSets = selectMaximumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, asp.reverseIndex));
  assert.deepEqual(coreNodeSets, [[]]);

  const comparison = summarizeProvenanceScenarioKCores([
    { scenarioId: "empty", nodesCount: 0, linksCount: 0, timeMs: 1, candidateNodeIds: [], coreNodeIds: [] },
    { scenarioId: "candidate", nodesCount: 1, linksCount: 1, timeMs: 1, candidateNodeIds: ["outside"], coreNodeIds: [] }
  ], 2);
  assert.equal(comparison.memberships[0].scenarioSupportCount, 0);
});

test("la stabilità k-core ammette un core vuoto e rifiuta risultati/configurazioni incoerenti", () => {
  const summary = summarizeProvenanceScenarioKCores([
    { scenarioId: "empty", nodesCount: 2, linksCount: 0, timeMs: 0, candidateNodeIds: ["a", "b"], coreNodeIds: [] },
    { scenarioId: "nonempty", nodesCount: 2, linksCount: 1, timeMs: 1, candidateNodeIds: ["a", "b"], coreNodeIds: ["a"] }
  ], 3, "mutual");
  assert.equal(summary.degreeMode, "mutual");
  assert.deepEqual(summary.stableNodeIds, []);
  assert.deepEqual(summary.nonUniversalNodeIds, ["a", "b"]);

  const valid = { scenarioId: "s", nodesCount: 1, linksCount: 0, timeMs: 0, candidateNodeIds: ["a"], coreNodeIds: ["a"] };
  assert.throws(() => summarizeProvenanceScenarioKCores([], 1), /almeno uno scenario/);
  assert.throws(() => summarizeProvenanceScenarioKCores([valid, valid], 1), /univoci/);
  assert.throws(() => summarizeProvenanceScenarioKCores([valid], -1), /k deve/);
  assert.throws(() => summarizeProvenanceScenarioKCores([valid], 1, "invalid"), /modalità/);
  assert.throws(() => summarizeProvenanceScenarioKCores([
    { ...valid, nodesCount: 2, candidateNodeIds: ["a", "b"], coreNodeIds: ["a", "a"] }
  ], 1), /Membership/);
  assert.throws(() => summarizeProvenanceScenarioKCores([{ ...valid, coreNodeIds: ["a", "b"] }], 1), /supera/);
  assert.doesNotThrow(() => summarizeProvenanceScenarioKCores([
    { ...valid, nodesCount: 0, candidateNodeIds: [], coreNodeIds: [] }
  ], 1));
});

test("CSV k-core multi-scenario conserva metadati, membership e neutralizza etichette formula", () => {
  const comparison = summarizeProvenanceScenarioKCores([
    {
      scenarioId: "archive-a",
      scenarioLabel: "Archivio, A",
      nodesCount: 2,
      linksCount: 1,
      timeMs: 10,
      candidateNodeIds: ["a", "b"],
      coreNodeIds: ["a", "b"]
    },
    {
      scenarioId: "archive-b",
      scenarioLabel: "Archivio B",
      nodesCount: 2,
      linksCount: 1,
      timeMs: 12,
      candidateNodeIds: ["a", "b"],
      coreNodeIds: ["a"]
    }
  ], 1);
  const csv = buildProvenanceScenarioKCoreCsv(
    comparison,
    { a: "=Alice", b: "Bruno" },
    'gruppo "A"',
    0.7,
    "2019–2020",
    { types: ["person"], groups: ["italian"] }
  );
  const lines = csv.split("\n");
  assert.equal(lines.length, 1 + 2 + 2);
  assert.equal(lines[0].split(",").length, 22);
  assert.match(lines[1], /^"scenario","archive-a","Archivio, A","1","undirected"/);
  assert.ok(lines[1].includes('"gruppo ""A""","0.7","2019–2020","[""person""]","[""italian""]"'));
  assert.ok(lines[0].includes('"view_type_filters_json","view_group_filters_json"'));
  assert.ok(lines[3].includes('"a","\'=Alice"'));
  assert.ok(lines[3].endsWith('"universal"'));
  assert.ok(lines[4].endsWith('"non-universal"'));
});

test("la membership k-core usa brave/cautious solo sotto l'assunzione di mondi esaustivi", () => {
  const scenarioInputs = [
    {
      scenarioId: "world-a",
      nodesCount: 3,
      linksCount: 2,
      timeMs: 5,
      candidateNodeIds: ["a", "b", "c"],
      coreNodeIds: ["a", "b"]
    },
    {
      scenarioId: "world-b",
      nodesCount: 3,
      linksCount: 2,
      timeMs: 7,
      candidateNodeIds: ["a", "b", "c"],
      coreNodeIds: ["a", "c"]
    }
  ];
  const projections = summarizeProvenanceScenarioKCores(scenarioInputs, 1);
  const finiteWorlds = summarizeProvenanceScenarioKCores(
    scenarioInputs,
    1,
    "undirected",
    "finite-exhaustive-worlds"
  );

  assert.equal("worldAssumption" in projections, false);
  assert.equal(finiteWorlds.worldAssumption, "finite-exhaustive-worlds");
  assert.deepEqual(finiteWorlds.stableNodeIds, ["a"]);
  assert.deepEqual(finiteWorlds.nonUniversalNodeIds, ["b", "c"]);
  const csv = buildProvenanceScenarioKCoreCsv(finiteWorlds);
  const [header, ...rows] = csv.split("\n");
  assert.match(header, /world_assumption.*brave_cautious_status/);
  assert.ok(rows.some((row) => row.includes('"a"') && row.includes("brave-and-cautious")));
  assert.ok(rows.some((row) => row.includes('"b"') && row.includes("brave-only")));
  assert.throws(() => summarizeProvenanceScenarioKCores(
    scenarioInputs,
    1,
    "undirected",
    "probabilistic"
  ), /worldAssumption/);
});

test("clingo ricalcola il k-core per scenario e coincide con il peeling indipendente", async () => {
  const config = {
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
    },
    graphAnalysis: {
      provenanceScenarios: {
        scenarios: [
          { id: "triangle-a", label: "Triangolo A", sources: ["A"] },
          { id: "triangle-b", label: "Triangolo B", sources: ["B"] }
        ],
        unattributedEdges: "exclude",
        referenceMatching: "any"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d", "isolated"].map((id) => ({ id })),
    edges: [
      { id: "ab-a", source: "a", target: "b", sources: ["A"] },
      { id: "bc-a", source: "b", target: "c", sources: ["A"] },
      { id: "ca-a", source: "c", target: "a", sources: ["A"] },
      { id: "ab-b", source: "a", target: "b", sources: ["B"] },
      { id: "bd-b", source: "b", target: "d", sources: ["B"] },
      { id: "da-b", source: "d", target: "a", sources: ["B"] }
    ]
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  const runner = await createClingoWasmRunner();
  const scenarioResults = [];
  for (const scenario of config.graphAnalysis.provenanceScenarios.scenarios) {
    const links = filterLinksByProvenanceScenario(graph.links, {
      sources: scenario.sources,
      unattributedEdges: config.graphAnalysis.provenanceScenarios.unattributedEdges,
      referenceMatching: config.graphAnalysis.provenanceScenarios.referenceMatching
    });
    const asp = buildAspFactsFromGraph({ ...graph, links });
    const result = await runner.run(
      `${asp.facts}\n${buildKCoreProgram(2)}\n`,
      getStructuralSolverOptions("kCore")
    );
    assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
    assert.equal(result.Models.More, "no", "il confronto richiede la prova completa dell'ottimo unico per scenario");
    const coreNodeSets = selectMaximumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, asp.reverseIndex));
    assert.equal(coreNodeSets.length, 1, "il k-core matematico deve avere una membership unica");

    const expected = [...computeKCoreNumbers(graph.nodes.map((node) => node.id), links)
      .entries()]
      .filter(([, coreNumber]) => coreNumber >= 2)
      .map(([nodeId]) => nodeId)
      .sort();
    assert.deepEqual([...coreNodeSets[0]].sort(), expected);
    scenarioResults.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      nodesCount: graph.nodes.length,
      linksCount: links.length,
      timeMs: 0,
      candidateNodeIds: graph.nodes.map((node) => node.id),
      coreNodeIds: coreNodeSets[0]
    });
  }

  const summary = summarizeProvenanceScenarioKCores(scenarioResults, 2);
  assert.deepEqual(summary.stableNodeIds, ["a", "b"]);
  assert.deepEqual(summary.nonUniversalNodeIds, ["c", "d", "isolated"]);
  assert.deepEqual(summary.scenarios.map(({ coreSize }) => coreSize), [3, 3]);
});

test("clingo enumera gli ottimi per ogni scenario e la membership stabile rispetta tutti i pareggi", async () => {
  const config = {
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
    },
    graphAnalysis: {
      provenanceScenarios: {
        scenarios: [
          { id: "star-a", label: "Star A", sources: ["A"] },
          { id: "star-b", label: "Star B", sources: ["B"] }
        ],
        unattributedEdges: "exclude",
        referenceMatching: "any"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id })),
    edges: [
      { id: "ab-a", source: "a", target: "b", sources: ["A"] },
      { id: "bc-a", source: "b", target: "c", sources: ["A"] },
      { id: "bd-a", source: "b", target: "d", sources: ["A"] },
      { id: "ab-b", source: "a", target: "b", sources: ["B"] },
      { id: "bc-b", source: "b", target: "c", sources: ["B"] }
    ]
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  const runner = await createClingoWasmRunner();
  const scenarioResults = [];
  for (const scenario of config.graphAnalysis.provenanceScenarios.scenarios) {
    const links = filterLinksByProvenanceScenario(graph.links, {
      sources: scenario.sources,
      unattributedEdges: config.graphAnalysis.provenanceScenarios.unattributedEdges,
      referenceMatching: config.graphAnalysis.provenanceScenarios.referenceMatching
    });
    const asp = buildAspFactsFromGraph({ ...graph, links });
    const program = `${asp.facts}\n${buildCliqueProgram("maximum", "")}`;
    const startedAt = performance.now();
    const result = await runner.run(program, getCliqueModeOptions("maximum"));
    const timeMs = performance.now() - startedAt;

    assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
    assert.equal(result.Models.More, "no", "la stabilità richiede l'enumerazione completa di tutti i massimi");
    const witnessedCliques = parseWitnessCliques(result.Call?.[0]?.Witnesses, asp.reverseIndex, 1);
    assert.ok(witnessedCliques.length > 0, JSON.stringify(result));
    const maximumCliques = selectMaximumCliques(witnessedCliques);
    scenarioResults.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      nodesCount: graph.nodes.length,
      linksCount: links.length,
      timeMs,
      maximumCliques
    });
  }

  const summary = summarizeProvenanceScenarioMaximumCliques(scenarioResults);
  assert.deepEqual(summary.scenarios.map(({ maximumCliqueCount }) => maximumCliqueCount), [3, 2]);
  assert.deepEqual(summary.stableNodeIds, ["b"]);
  assert.deepEqual(summary.nonUniversalNodeIds, ["a", "c", "d"]);
});

test("clingo prova tutti i k-plex massimi per scenario prima di aggregare la membership", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const projections = [
    {
      scenarioId: "archive-a",
      edges: [["a", "b"], ["b", "c"], ["c", "a"]],
      expected: ["a", "b", "c"]
    },
    {
      scenarioId: "archive-b",
      edges: [["a", "b"], ["b", "d"], ["d", "a"]],
      expected: ["a", "b", "d"]
    }
  ];
  const runner = await createClingoWasmRunner();
  const scenarioResults = [];

  for (const scenario of projections) {
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: scenario.edges.map(([source, target]) => ({ source, target }))
    });
    const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
    const search = await searchMaximumKPlexWithAsp(
      2,
      nodeIds,
      graph.links,
      "",
      true,
      (program, modelLimit) => runner.run(`${facts.trim()}\n\n${program}\n`, [], modelLimit)
    );
    assert.equal(search.complete, true, scenario.scenarioId);
    assert.equal(search.maximumSize, 3, scenario.scenarioId);
    assert.equal(search.result?.Result, "SATISFIABLE", scenario.scenarioId);
    assert.equal(search.result?.Models?.More, "no", `${scenario.scenarioId}: enumeration completeness`);
    const maximumKPlexes = parseWitnessKPlexExplanations(
      search.result?.Call?.[0]?.Witnesses,
      reverseIndex
    ).map((witness) => witness.nodeIds);
    assert.deepEqual(maximumKPlexes, [scenario.expected], scenario.scenarioId);
    scenarioResults.push({
      scenarioId: scenario.scenarioId,
      nodesCount: graph.nodes.length,
      linksCount: graph.links.length,
      timeMs: 1,
      candidateNodeIds: nodeIds,
      maximumKPlexes
    });
  }

  const comparison = summarizeProvenanceScenarioMaximumKPlexes(scenarioResults, 2);
  assert.deepEqual(comparison.stableNodeIds, ["a", "b"]);
  assert.deepEqual(comparison.nonUniversalNodeIds, ["c", "d"]);
});

test("uno scenario senza archi confronta correttamente tutte le clique massime singole", async () => {
  const config = {
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
    },
    graphAnalysis: {
      provenanceScenarios: {
        scenarios: [{ id: "empty", label: "Scenario senza archi", sources: ["B"] }],
        unattributedEdges: "exclude",
        referenceMatching: "any"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id })),
    edges: [{ id: "only-a", source: "a", target: "b", sources: ["A"] }]
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  const scenario = config.graphAnalysis.provenanceScenarios.scenarios[0];
  const links = filterLinksByProvenanceScenario(graph.links, {
    sources: scenario.sources,
    unattributedEdges: config.graphAnalysis.provenanceScenarios.unattributedEdges,
    referenceMatching: config.graphAnalysis.provenanceScenarios.referenceMatching
  });
  assert.deepEqual(links, []);

  const asp = buildAspFactsFromGraph({ ...graph, links });
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts}\n${buildCliqueProgram("maximum", "")}`,
    getCliqueModeOptions("maximum")
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.equal(result.Models.More, "no");

  const maximumCliques = selectMaximumCliques(
    parseWitnessCliques(result.Call?.[0]?.Witnesses, asp.reverseIndex, 1)
  );
  const summary = summarizeProvenanceScenarioMaximumCliques([{
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    nodesCount: graph.nodes.length,
    linksCount: links.length,
    timeMs: 0,
    maximumCliques
  }]);

  assert.equal(summary.scenarios[0].maximumCliqueSize, 1);
  assert.equal(summary.scenarios[0].maximumCliqueCount, 3);
  assert.deepEqual(summary.stableNodeIds, []);
  assert.deepEqual(summary.nonUniversalNodeIds, ["a", "b", "c"]);
});

test("la timeline graph-aware ricalcola la coorte per scenario prima dell'ASP", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", typeField: "$.type" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        provenanceField: "$.sources"
      }
    },
    graphAnalysis: {
      provenanceScenarios: {
        scenarios: [
          { id: "source-a", label: "Source A", sources: ["A"] },
          { id: "source-b", label: "Source B", sources: ["B"] }
        ],
        unattributedEdges: "exclude",
        referenceMatching: "any"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "anchor", type: "temporal", data: { start: 5, end: 10 } },
      { id: "context-a", type: "context" },
      { id: "context-b", type: "context" }
    ],
    edges: [
      { id: "edge-a", source: "anchor", target: "context-a", sources: ["A"] },
      { id: "edge-b", source: "anchor", target: "context-b", sources: ["B"] }
    ]
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  const runner = await createClingoWasmRunner();
  const results = [];
  for (const scenario of config.graphAnalysis.provenanceScenarios.scenarios) {
    const links = filterLinksByProvenanceScenario(graph.links, {
      sources: scenario.sources,
      unattributedEdges: config.graphAnalysis.provenanceScenarios.unattributedEdges,
      referenceMatching: config.graphAnalysis.provenanceScenarios.referenceMatching
    });
    const visibleIds = projectVisibleNodeIds({
      nodes: graph.nodes,
      links,
      mode: "graph-aware",
      currentStart: 6,
      currentEnd: 6,
      getNodeId: (node) => node.id,
      getLinkEndpoints: (link) => [link.source, link.target],
      getTimelineInterval: (node) => node.type === "temporal"
        ? { start: node.data.start, end: node.data.end }
        : null,
      isAlwaysVisible: () => false,
      passesTypeFilter: () => true,
      passesGroupFilter: () => true,
      passesTimeline: () => true
    });
    const nodes = graph.nodes.filter((node) => visibleIds.has(node.id));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const projectedLinks = links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target));
    assert.deepEqual(nodes.map((node) => node.id).sort(), ["anchor", scenario.id === "source-a" ? "context_a" : "context_b"].sort());

    const asp = buildAspFactsFromGraph({ ...graph, nodes, links: projectedLinks });
    const result = await runner.run(
      `${asp.facts}\n${buildCliqueProgram("maximum", "")}`,
      getCliqueModeOptions("maximum")
    );
    assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
    assert.equal(result.Models.More, "no");
    results.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      nodesCount: nodes.length,
      linksCount: projectedLinks.length,
      timeMs: 0,
      maximumCliques: selectMaximumCliques(
        parseWitnessCliques(result.Call?.[0]?.Witnesses, asp.reverseIndex, 1)
      )
    });
  }

  const summary = summarizeProvenanceScenarioMaximumCliques(results);
  assert.deepEqual(summary.scenarios.map(({ nodesCount, linksCount }) => [nodesCount, linksCount]), [[2, 1], [2, 1]]);
  assert.deepEqual(summary.stableNodeIds, ["anchor"]);
  assert.deepEqual(summary.nonUniversalNodeIds, ["context_a", "context_b"]);
});

test("il confronto delle componenti distingue separazione e nodi non eleggibili", () => {
  const comparison = summarizeProvenanceScenarioComponents([
    {
      scenarioId: "a",
      projectedNodeCount: 3,
      linksCount: 2,
      timeMs: 1,
      candidateNodeIds: ["a", "b", "c"],
      components: [["a", "b"], ["c"]]
    },
    {
      scenarioId: "b",
      projectedNodeCount: 7,
      projectedNodeIds: ["anchor", "source_only", "alternative_a", "alternative_b", "never_candidate", "target_1", "target_2"],
      linksCount: 2,
      timeMs: 2,
      candidateNodeIds: ["a", "b", "d", "e"],
      components: [["a", "b", "d"], ["e"]]
    },
    {
      scenarioId: "c",
      projectedNodeCount: 5,
      projectedNodeIds: ["anchor", "alternative_a", "alternative_b", "never_candidate", "target_1"],
      linksCount: 2,
      timeMs: 3,
      candidateNodeIds: ["b", "c", "d"],
      components: [["b", "c", "d"]]
    }
  ], "weakComponents", "a");

  assert.equal(comparison.targetEligibleScenarioCount, 2);
  assert.deepEqual(comparison.scenarios.map(({ targetEligible, targetComponentSize }) => [targetEligible, targetComponentSize]), [
    [true, 2], [true, 3], [false, 0]
  ]);
  assert.deepEqual(comparison.universallySameComponentNodeIds, []);
  assert.deepEqual(comparison.conditionallySameComponentNodeIds, ["b", "d"]);
  assert.deepEqual(comparison.memberships.map(({ nodeId, candidateScenarioCount, comparableScenarioCount, sameComponentScenarioCount, separateComponentScenarioIds, sameComponentInEveryComparableScenario, sameComponentInEveryDeclaredScenario }) => ({
    nodeId,
    candidateScenarioCount,
    comparableScenarioCount,
    sameComponentScenarioCount,
    separateComponentScenarioIds,
    sameComponentInEveryComparableScenario,
    sameComponentInEveryDeclaredScenario
  })), [
    {
      nodeId: "b", candidateScenarioCount: 3, comparableScenarioCount: 2,
      sameComponentScenarioCount: 2, separateComponentScenarioIds: [],
      sameComponentInEveryComparableScenario: true, sameComponentInEveryDeclaredScenario: false
    },
    {
      nodeId: "c", candidateScenarioCount: 2, comparableScenarioCount: 1,
      sameComponentScenarioCount: 0, separateComponentScenarioIds: ["a"],
      sameComponentInEveryComparableScenario: false, sameComponentInEveryDeclaredScenario: false
    },
    {
      nodeId: "d", candidateScenarioCount: 2, comparableScenarioCount: 1,
      sameComponentScenarioCount: 1, separateComponentScenarioIds: [],
      sameComponentInEveryComparableScenario: true, sameComponentInEveryDeclaredScenario: false
    },
    {
      nodeId: "e", candidateScenarioCount: 1, comparableScenarioCount: 1,
      sameComponentScenarioCount: 0, separateComponentScenarioIds: ["b"],
      sameComponentInEveryComparableScenario: false, sameComponentInEveryDeclaredScenario: false
    }
  ]);

  const csv = buildProvenanceScenarioComponentsCsv(
    comparison,
    { a: "Nodo A", b: "Nodo B" },
    "psychologists",
    0.5,
    "1900–2000",
    { types: ["person"], groups: ["italian"] }
  );
  const rows = csv.split("\n");
  assert.equal(rows.length, 1 + comparison.scenarioCount + comparison.memberships.length);
  assert.match(rows[0], /same_component_in_every_declared_scenario/);
  assert.match(rows[1], /^"scenario","weakComponents","a","Nodo A","a"/);
  assert.ok(rows.some((row) => row.startsWith('"node_membership","weakComponents","a","Nodo A"')));
  const formulaSafeCsv = buildProvenanceScenarioComponentsCsv(comparison, {
    a: "=Nodo A",
    b: "@Nodo B"
  });
  assert.ok(formulaSafeCsv.includes("\"'=Nodo A\""));
  assert.ok(formulaSafeCsv.includes("\"'@Nodo B\""));
});

test("la membership di componente ha brave/cautious e stati non definiti solo con mondi esaustivi", () => {
  const scenarioInputs = [
    {
      scenarioId: "world-a",
      projectedNodeCount: 3,
      linksCount: 1,
      timeMs: 5,
      candidateNodeIds: ["reference", "x", "y"],
      components: [["reference", "x"], ["y"]]
    },
    {
      scenarioId: "world-b",
      projectedNodeCount: 3,
      linksCount: 1,
      timeMs: 7,
      candidateNodeIds: ["x", "y", "z"],
      components: [["x", "z"], ["y"]]
    }
  ];
  const projections = summarizeProvenanceScenarioComponents(scenarioInputs, "components", "reference");
  const finiteWorlds = summarizeProvenanceScenarioComponents(
    scenarioInputs,
    "components",
    "reference",
    "finite-exhaustive-worlds"
  );

  assert.equal("worldAssumption" in projections, false);
  assert.equal(finiteWorlds.worldAssumption, "finite-exhaustive-worlds");
  assert.deepEqual(finiteWorlds.universallySameComponentNodeIds, []);
  assert.deepEqual(finiteWorlds.conditionallySameComponentNodeIds, ["x"]);
  assert.equal(finiteWorlds.memberships.find(({ nodeId }) => nodeId === "x")?.sameComponentScenarioCount, 1);
  assert.equal(finiteWorlds.memberships.find(({ nodeId }) => nodeId === "y")?.sameComponentScenarioCount, 0);
  assert.equal(finiteWorlds.memberships.find(({ nodeId }) => nodeId === "z")?.comparableScenarioCount, 0);
  const csv = buildProvenanceScenarioComponentsCsv(finiteWorlds);
  const [header, ...rows] = csv.split("\n");
  assert.match(header, /world_assumption.*brave_cautious_status/);
  assert.ok(rows.some((row) => row.includes('"x"') && row.includes("brave-only")));
  assert.ok(rows.some((row) => row.includes('"y"') && row.includes("not-brave")));
  assert.ok(rows.some((row) => row.includes('"z"') && row.includes("undefined-no-comparable-world")));
  assert.throws(() => summarizeProvenanceScenarioComponents(
    scenarioInputs,
    "components",
    "reference",
    "probabilistic"
  ), /worldAssumption/);
});

test("il riepilogo rifiuta partizioni ASP parziali o sovrapposte", () => {
  const input = {
    scenarioId: "source-a",
    projectedNodeCount: 2,
    linksCount: 1,
    timeMs: 1,
    candidateNodeIds: ["a", "b"]
  };
  assert.throws(() => summarizeProvenanceScenarioComponents([
    { ...input, components: [["a"]] }
  ], "components", "a"), /non copre esattamente/);
  assert.throws(() => summarizeProvenanceScenarioComponents([
    { ...input, components: [["a", "b"], ["b"]] }
  ], "components", "a"), /Componente ASP non valida/);
  assert.throws(() => summarizeProvenanceScenarioComponents([
    { ...input, components: [["a", "a"], ["b"]] }
  ], "components", "a"), /Componente ASP non valida/);
});

test("le partizioni ASP per scenari rispettano il tipo di connettività e la coorte graph-aware", async () => {
  const runner = await createClingoWasmRunner();
  const taskSpecs = [
    { task: "components", direction: "undirected", parser: parseWitnessComponents, kind: "undirected" },
    { task: "weakComponents", direction: "directed", parser: parseWitnessWeakComponents, kind: "weak" },
    { task: "strongComponents", direction: "directed", parser: parseWitnessStrongComponents, kind: "strong" }
  ];

  function referencePartition(nodeIds, links, kind) {
    const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
    for (const link of links) {
      adjacency.get(link.source)?.add(link.target);
      if (kind !== "strong") adjacency.get(link.target)?.add(link.source);
    }
    const reachable = (start) => {
      const visited = new Set([start]);
      const queue = [start];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        for (const next of adjacency.get(queue[cursor]) ?? []) {
          if (!visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }
      return visited;
    };
    if (kind !== "strong") {
      const unseen = new Set(nodeIds);
      const components = [];
      while (unseen.size) {
        const root = unseen.values().next().value;
        const component = reachable(root);
        for (const nodeId of component) unseen.delete(nodeId);
        components.push([...component].sort());
      }
      return components.sort((left, right) => left[0].localeCompare(right[0]));
    }
    const unseen = new Set(nodeIds);
    const components = [];
    while (unseen.size) {
      const root = unseen.values().next().value;
      const fromRoot = reachable(root);
      const component = [...unseen].filter((nodeId) => fromRoot.has(nodeId) && reachable(nodeId).has(root));
      for (const nodeId of component) unseen.delete(nodeId);
      components.push(component.sort());
    }
    return components.sort((left, right) => left[0].localeCompare(right[0]));
  }

  for (const spec of taskSpecs) {
    const config = {
      schemaVersion: 2,
      graphMapping: {
        node: { idField: "$.id", typeField: "$.type" },
        edge: {
          idField: "$.id",
          sourceField: "$.source",
          targetField: "$.target",
          direction: spec.direction,
          identity: "multigraph",
          provenanceField: "$.sources"
        }
      },
      graphAnalysis: {
        provenanceScenarios: {
          scenarios: [
            { id: "source-a", label: "Fonte A", sources: ["A"] },
            { id: "source-b", label: "Fonte B", sources: ["B"] }
          ],
          unattributedEdges: "exclude",
          referenceMatching: "any"
        }
      }
    };
    const graph = normalizeGraphData({
      nodes: [
        { id: "anchor", type: "temporal", data: { start: 5, end: 10 } },
        { id: "reference", type: "context" },
        { id: "neighbor_a", type: "context" },
        { id: "neighbor_b", type: "context" }
      ],
      edges: [
        { id: "anchor-reference", source: "anchor", target: "reference", sources: ["A"] },
        { id: "anchor-neighbor-a", source: "anchor", target: "neighbor_a", sources: ["A"] },
        { id: "anchor-neighbor-b", source: "anchor", target: "neighbor_b", sources: ["B"] }
      ]
    }, config);
    assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

    const scenarioInputs = [];
    for (const scenario of config.graphAnalysis.provenanceScenarios.scenarios) {
      const links = filterLinksByProvenanceScenario(graph.links, {
        sources: scenario.sources,
        unattributedEdges: "exclude",
        referenceMatching: "any"
      });
      const visibleIds = projectVisibleNodeIds({
        nodes: graph.nodes,
        links,
        mode: "graph-aware",
        currentStart: 6,
        currentEnd: 6,
        getNodeId: (node) => node.id,
        getLinkEndpoints: (link) => [link.source, link.target],
        getTimelineInterval: (node) => node.type === "temporal"
          ? { start: node.data.start, end: node.data.end }
          : null,
        isAlwaysVisible: () => false,
        passesTypeFilter: () => true,
        passesGroupFilter: () => true,
        passesTimeline: () => true
      });
      const nodes = graph.nodes.filter((node) => visibleIds.has(node.id));
      const nodeIds = new Set(nodes.map((node) => node.id));
      const projectedLinks = links.filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target));
      const asp = buildAspFactsFromGraph({ ...graph, nodes, links: projectedLinks });
      const program = spec.task === "components"
        ? buildConnectedComponentsProgram()
        : spec.task === "weakComponents"
          ? buildWeaklyConnectedComponentsProgram()
          : buildStronglyConnectedComponentsProgram();
      const result = await runner.run(`${asp.facts}\n${program}\n`, []);
      assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
      assert.equal(hasCompleteModelEnumeration(result), true, `${spec.task}: la partizione deve essere completa`);
      const components = spec.parser(result.Call?.[0]?.Witnesses, asp.reverseIndex);
      assert.deepEqual(components, referencePartition(nodes.map((node) => node.id), projectedLinks, spec.kind));
      scenarioInputs.push({
        scenarioId: scenario.id,
        projectedNodeCount: nodes.length,
        linksCount: projectedLinks.length,
        timeMs: 0,
        candidateNodeIds: nodes.map((node) => node.id),
        components
      });
    }

    const comparison = summarizeProvenanceScenarioComponents(scenarioInputs, spec.task, "reference");
    assert.equal(comparison.targetEligibleScenarioCount, 1);
    assert.equal(comparison.scenarios[0].targetComponentSize, spec.kind === "strong" ? 1 : 3);
    assert.equal(comparison.scenarios[1].targetEligible, false);
    assert.equal(comparison.memberships.find(({ nodeId }) => nodeId === "neighbor_a")
      ?.sameComponentInEveryComparableScenario, spec.kind !== "strong");
    assert.equal(comparison.memberships.find(({ nodeId }) => nodeId === "neighbor_b")
      ?.comparableScenarioCount, 0);
  }
});

test("il confronto delle coperture distingue nodi universali, condizionali e mai candidati", () => {
  const comparison = summarizeProvenanceScenarioDominatingSets([
    {
      scenarioId: "source-a",
      scenarioLabel: "Fonte A",
      projectedNodeCount: 7,
      projectedNodeIds: ["anchor", "source_only", "alternative_a", "alternative_b", "never_candidate", "target_1", "target_2"],
      candidateNodeIds: ["anchor", "source_only", "alternative_a", "alternative_b"],
      targetNodeIds: ["target_1", "target_2"],
      linksCount: 3,
      timeMs: 12,
      minimumDominatingSets: [
        ["anchor", "source_only", "alternative_a"],
        ["anchor", "source_only", "alternative_b"]
      ]
    },
    {
      scenarioId: "source-b",
      scenarioLabel: "Fonte B",
      projectedNodeCount: 5,
      projectedNodeIds: ["anchor", "alternative_a", "alternative_b", "never_candidate", "target_1"],
      candidateNodeIds: ["anchor", "alternative_a", "alternative_b"],
      targetNodeIds: ["target_1"],
      linksCount: 2,
      timeMs: 18,
      minimumDominatingSets: [
        ["anchor", "alternative_a"],
        ["anchor", "alternative_b"]
      ]
    }
  ], "candidates", "targets");

  assert.equal(comparison.scenarioCount, 2);
  assert.equal(comparison.totalMinimumSetCount, 4);
  assert.equal(comparison.candidateGroup, "candidates");
  assert.equal(comparison.targetGroup, "targets");
  assert.deepEqual(comparison.universallySelectedNodeIds, ["anchor"]);
  assert.deepEqual(comparison.conditionallySelectedNodeIds, ["source_only"]);
  assert.equal(comparison.memberships.some(({ nodeId }) => nodeId === "never_candidate"), false);
  assert.deepEqual(comparison.memberships.find(({ nodeId }) => nodeId === "anchor"), {
    nodeId: "anchor",
    candidateScenarioCount: 2,
    candidateScenarioIds: ["source-a", "source-b"],
    optimalScenarioCount: 2,
    optimalScenarioIds: ["source-a", "source-b"],
    selectedMinimumSetCount: 4,
    totalComparableMinimumSetCount: 4,
    selectedInEveryComparableMinimumSet: true,
    selectedInEveryScenarioMinimumSet: true
  });
  assert.deepEqual(comparison.memberships.find(({ nodeId }) => nodeId === "source_only"), {
    nodeId: "source_only",
    candidateScenarioCount: 1,
    candidateScenarioIds: ["source-a"],
    optimalScenarioCount: 1,
    optimalScenarioIds: ["source-a"],
    selectedMinimumSetCount: 2,
    totalComparableMinimumSetCount: 2,
    selectedInEveryComparableMinimumSet: true,
    selectedInEveryScenarioMinimumSet: false
  });

  const csv = buildProvenanceScenarioDominatingSetCsv(comparison, {
    anchor: "=Nodo universale",
    source_only: "Nodo condizionale"
  }, 0.4, "1900–2000", { types: ["person"], groups: ["professionals"] });
  assert.match(csv.split("\n")[0], /selected_in_every_scenario_minimum_set/);
  assert.ok(csv.includes("\"'=Nodo universale\""));
  assert.ok(csv.includes("\"candidates\",\"targets\""));
});

test("la membership delle coperture minime usa brave/cautious solo su mondi esaustivi", () => {
  const scenarioInputs = [
    {
      scenarioId: "world-a",
      projectedNodeCount: 5,
      projectedNodeIds: ["a", "b", "c", "d", "target"],
      candidateNodeIds: ["a", "b", "c", "d"],
      targetNodeIds: ["target"],
      linksCount: 3,
      timeMs: 5,
      minimumDominatingSets: [["a", "b"], ["a", "c"]]
    },
    {
      scenarioId: "world-b",
      projectedNodeCount: 5,
      projectedNodeIds: ["a", "b", "c", "d", "target"],
      candidateNodeIds: ["a", "b", "c", "d"],
      targetNodeIds: ["target"],
      linksCount: 2,
      timeMs: 7,
      minimumDominatingSets: [["a", "b"]]
    }
  ];
  const projections = summarizeProvenanceScenarioDominatingSets(scenarioInputs, "candidates", "targets");
  const finiteWorlds = summarizeProvenanceScenarioDominatingSets(
    scenarioInputs,
    "candidates",
    "targets",
    "finite-exhaustive-worlds"
  );

  assert.equal("worldAssumption" in projections, false);
  assert.equal(finiteWorlds.worldAssumption, "finite-exhaustive-worlds");
  assert.deepEqual(finiteWorlds.universallySelectedNodeIds, ["a"]);
  assert.equal(finiteWorlds.memberships.find(({ nodeId }) => nodeId === "b")?.selectedMinimumSetCount, 2);
  assert.equal(finiteWorlds.memberships.find(({ nodeId }) => nodeId === "c")?.selectedMinimumSetCount, 1);
  assert.equal(finiteWorlds.memberships.find(({ nodeId }) => nodeId === "d")?.selectedMinimumSetCount, 0);
  const csv = buildProvenanceScenarioDominatingSetCsv(finiteWorlds);
  const [header, ...rows] = csv.split("\n");
  assert.match(header, /world_assumption.*brave_cautious_status/);
  assert.ok(rows.some((row) => row.includes('"a"') && row.includes("brave-and-cautious")));
  assert.ok(rows.some((row) => row.includes('"c"') && row.includes("brave-only")));
  assert.ok(rows.some((row) => row.includes('"d"') && row.includes("not-brave")));
  assert.throws(() => summarizeProvenanceScenarioDominatingSets(
    scenarioInputs,
    "candidates",
    "targets",
    "probabilistic"
  ), /worldAssumption/);
});

test("il riepilogo delle coperture rifiuta domini e insiemi ASP inconsistenti", () => {
  const base = {
    scenarioId: "source-a",
    projectedNodeCount: 3,
    projectedNodeIds: ["a", "b", "c"],
    candidateNodeIds: ["a", "b"],
    targetNodeIds: ["a", "b"],
    linksCount: 1,
    timeMs: 1
  };
  assert.throws(() => summarizeProvenanceScenarioDominatingSets([
    { ...base, minimumDominatingSets: [["a", "ghost"]] }
  ]), /Insieme dominante ASP non valido/);
  assert.throws(() => summarizeProvenanceScenarioDominatingSets([
    { ...base, minimumDominatingSets: [["a"], ["a", "b"]] }
  ]), /stessa cardinalità minima/);
  assert.throws(() => summarizeProvenanceScenarioDominatingSets([
    { ...base, candidateNodeIds: ["a", "ghost"], minimumDominatingSets: [["a"]] }
  ]), /Domini candidati o obiettivo non validi/);
  const vacuous = summarizeProvenanceScenarioDominatingSets([
    { ...base, targetNodeIds: [], minimumDominatingSets: [[]] }
  ]);
  assert.equal(vacuous.scenarios[0].minimumSetSize, 0);
  assert.equal(vacuous.scenarios[0].targetNodeCount, 0);
  assert.deepEqual(vacuous.universallySelectedNodeIds, []);
  assert.throws(() => summarizeProvenanceScenarioDominatingSets([
    { ...base, targetNodeIds: [], minimumDominatingSets: [["a"]] }
  ]), /Insieme dominante ASP non valido/);
  assert.throws(() => summarizeProvenanceScenarioDominatingSets([
    { ...base, minimumDominatingSets: [] }
  ]), /Nessun insieme dominante minimo completo/);
});

test("ASP enumera tutti gli insiemi dominanti minimi e il confronto verifica membership per scenario", async () => {
  const runner = await createClingoWasmRunner();
  const config = {
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
    },
    graphAnalysis: {
      provenanceScenarios: {
        scenarios: [
          { id: "source-a", label: "Fonte A", sources: ["A"] },
          { id: "source-b", label: "Fonte B", sources: ["B"] }
        ],
        unattributedEdges: "exclude",
        referenceMatching: "any"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    edges: [
      { id: "ab-a", source: "a", target: "b", sources: ["A"] },
      { id: "bc-a", source: "b", target: "c", sources: ["A"] },
      { id: "ab-b", source: "a", target: "b", sources: ["B"] }
    ]
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  function bruteForceMinimumDominatingSets(nodeIds, links) {
    const adjacent = (left, right) => links.some((link) =>
      (link.source === left && link.target === right) || (link.source === right && link.target === left)
    );
    for (let size = 0; size <= nodeIds.length; size += 1) {
      const solutions = [];
      for (let mask = 0; mask < 2 ** nodeIds.length; mask += 1) {
        const selected = nodeIds.filter((_, index) => (mask & (1 << index)) !== 0);
        if (selected.length !== size) continue;
        if (nodeIds.every((target) => selected.includes(target) || selected.some((candidate) => adjacent(candidate, target)))) {
          solutions.push(selected.sort());
        }
      }
      if (solutions.length > 0) {
        return solutions.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      }
    }
    return [];
  }

  const scenarioInputs = [];
  for (const scenario of config.graphAnalysis.provenanceScenarios.scenarios) {
    const links = filterLinksByProvenanceScenario(graph.links, {
      sources: scenario.sources,
      unattributedEdges: "exclude",
      referenceMatching: "any"
    });
    const asp = buildAspFactsFromGraph({ ...graph, links }, () => []);
    const program = buildMinimumDominatingSetProgram();
    const result = await runner.run(
      `${asp.facts}\n${program}\n`,
      getStructuralSolverOptions("dominatingSet", true)
    );
    assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
    assert.equal(result.Models.More, "no", "tutte le coperture ottime devono essere enumerate");
    const explanations = parseWitnessDominatingSetExplanations(result.Call?.[0]?.Witnesses, asp.reverseIndex);
    const minimumDominatingSets = selectMinimumNodeSets(explanations.map(({ nodeIds }) => nodeIds));
    const canonicalizeSets = (sets) => sets
      .map((set) => [...set].sort())
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    assert.deepEqual(canonicalizeSets(minimumDominatingSets), canonicalizeSets(bruteForceMinimumDominatingSets(
      graph.nodes.map(({ id }) => id), links
    )));
    for (const explanation of explanations) {
      const selected = new Set(explanation.nodeIds);
      assert.deepEqual(
        new Set(explanation.coveragePairs.map(([target]) => target)),
        new Set(graph.nodes.map(({ id }) => id)),
        "ogni target deve avere un testimone ASP di copertura"
      );
      assert.ok([...selected].every((nodeId) => graph.nodes.some((node) => node.id === nodeId)));
      const candidateIds = new Set(graph.nodes.map(({ id }) => id));
      assert.ok([...selected].every((nodeId) => candidateIds.has(nodeId)));
      for (const [targetId, coveringId] of explanation.coveragePairs) {
        assert.ok(graph.nodes.some((node) => node.id === targetId), "target fuori dalla proiezione");
        assert.ok(selected.has(coveringId), "testimone non selezionato");
        assert.ok(targetId === coveringId || links.some((link) =>
          (link.source === coveringId && link.target === targetId) ||
          (link.source === targetId && link.target === coveringId)
        ), "testimone senza adiacenza nello scenario");
      }
    }
    scenarioInputs.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      projectedNodeCount: graph.nodes.length,
      projectedNodeIds: graph.nodes.map(({ id }) => id),
      candidateNodeIds: graph.nodes.map(({ id }) => id),
      targetNodeIds: graph.nodes.map(({ id }) => id),
      linksCount: links.length,
      timeMs: 0,
      minimumDominatingSets
    });
  }

  const comparison = summarizeProvenanceScenarioDominatingSets(scenarioInputs);
  assert.deepEqual(comparison.scenarios.map(({ minimumSetSize, minimumSetCount }) => [minimumSetSize, minimumSetCount]), [
    [2, 1], [3, 2]
  ]);
  assert.deepEqual(comparison.universallySelectedNodeIds, ["d"]);
  assert.equal(comparison.memberships.find(({ nodeId }) => nodeId === "b")?.selectedMinimumSetCount, 2);
  assert.equal(comparison.memberships.find(({ nodeId }) => nodeId === "b")?.totalComparableMinimumSetCount, 3);
});

test("ASP separa candidati e target nei gruppi e gestisce una copertura vacua", async () => {
  const runner = await createClingoWasmRunner();
  const graph = {
    schemaVersion: 2,
    direction: "undirected",
    nodes: [
      { id: "clinician", analysis: { groups: ["candidates"] } },
      { id: "patient", analysis: { groups: ["targets"] } },
      { id: "other_patient", analysis: { groups: ["other"] } }
    ],
    links: [{ source: "clinician", target: "patient" }]
  };
  const asp = buildAspFactsFromGraph(graph);
  const solve = (targetGroup) => runner.run(
    `${asp.facts}\n${buildMinimumDominatingSetProgram("candidates", targetGroup)}\n`,
    getStructuralSolverOptions("dominatingSet", true)
  );

  const covered = await solve("targets");
  assert.equal(covered.Result, "OPTIMUM FOUND", covered.Error ?? JSON.stringify(covered));
  const explanations = parseWitnessDominatingSetExplanations(covered.Call?.[0]?.Witnesses, asp.reverseIndex);
  assert.deepEqual(selectMinimumNodeSets(explanations.map(({ nodeIds }) => nodeIds)), [["clinician"]]);
  assert.deepEqual(explanations[0]?.coveragePairs, [["patient", "clinician"]]);
  assert.equal(covered.Models.More, "no");

  const vacuous = await solve("missing-target-group");
  assert.equal(vacuous.Result, "OPTIMUM FOUND", vacuous.Error ?? JSON.stringify(vacuous));
  assert.equal(vacuous.Models.More, "no");
  const vacuousExplanations = parseWitnessDominatingSetExplanations(vacuous.Call?.[0]?.Witnesses, asp.reverseIndex);
  assert.deepEqual(selectMinimumNodeSets(vacuousExplanations.map(({ nodeIds }) => nodeIds)), [[]]);
  assert.deepEqual(vacuousExplanations[0]?.coveragePairs, []);
});

test("why-not della copertura tra scenari usa solo target e candidati visibili nello scenario che blocca", async () => {
  const runner = await createClingoWasmRunner();
  const graph = {
    schemaVersion: 2,
    direction: "undirected",
    nodes: [
      { id: "candidate", analysis: { groups: ["candidates"] } },
      { id: "target_a", analysis: { groups: ["targets"] } },
      { id: "target_b", analysis: { groups: ["targets"] } }
    ],
    links: [
      { source: "target_a", target: "target_b", analysis: { provenance: ["source:a"] } },
      { source: "candidate", target: "target_a", analysis: { provenance: ["source:b"] } },
      { source: "candidate", target: "target_b", analysis: { provenance: ["source:b"] } }
    ]
  };
  const solveScenario = async (sourceId) => {
    const links = filterLinksByProvenanceScenario(graph.links, {
      sources: [sourceId],
      unattributedEdges: "exclude",
      referenceMatching: "any"
    });
    const visibleNodeIds = new Set(links.flatMap((link) => [link.source, link.target]));
    const nodes = graph.nodes.filter((node) => visibleNodeIds.has(node.id));
    const asp = buildAspFactsFromGraph({ ...graph, nodes, links }, (node) => node.analysis.groups);
    const run = (program, options = []) => runner.run(`${asp.facts}\n${program}\n`, options);
    const primary = await run(
      buildMinimumDominatingSetProgram("candidates", "targets"),
      getStructuralSolverOptions("dominatingSet", true)
    );
    return { links, nodes, asp, primary, run };
  };

  const blockingScenario = await solveScenario("source:a");
  assert.equal(blockingScenario.nodes.length, 2);
  assert.equal(blockingScenario.primary.Result, "UNSATISFIABLE");
  const whyNot = await blockingScenario.run(buildDominatingSetFeasibilityProgram("candidates", "targets"));
  assert.equal(whyNot.Result, "SATISFIABLE", whyNot.Error ?? JSON.stringify(whyNot));
  const certificate = parseDominatingSetFeasibilityCertificate(
    whyNot.Call?.[0]?.Witnesses,
    blockingScenario.asp.reverseIndex
  );
  assert.deepEqual(certificate, {
    targetNodeIds: ["target_a", "target_b"],
    uncoverableTargetNodeIds: ["target_a", "target_b"]
  });
  const candidateIds = new Set(blockingScenario.nodes
    .filter((node) => node.analysis.groups.includes("candidates"))
    .map((node) => node.id));
  const expectedUncoverable = blockingScenario.nodes
    .filter((node) => node.analysis.groups.includes("targets"))
    .filter((target) => !candidateIds.has(target.id) && !blockingScenario.links.some((link) =>
      (link.source === target.id && candidateIds.has(link.target)) ||
      (link.target === target.id && candidateIds.has(link.source))
    ))
    .map((node) => node.id)
    .sort();
  assert.deepEqual(verifyDominatingSetFeasibilityCertificate(
    certificate,
    [...candidateIds],
    blockingScenario.nodes.filter((node) => node.analysis.groups.includes("targets")).map((node) => node.id),
    blockingScenario.links.map((link) => [link.source, link.target])
  ), expectedUncoverable);

  const feasibleScenario = await solveScenario("source:b");
  assert.equal(feasibleScenario.primary.Result, "OPTIMUM FOUND");
});
