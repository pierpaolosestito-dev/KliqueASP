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
  buildKCoreProgram,
  parseWitnessKPlexExplanations,
  searchMaximumKPlexWithAsp,
  computeKCoreNumbers,
  getStructuralSolverOptions,
  parseWitnessNodeSets,
  selectMaximumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";
import {
  buildProvenanceScenarioCliqueCsv,
  buildProvenanceScenarioKCoreCsv,
  buildProvenanceScenarioKPlexCsv,
  summarizeProvenanceScenarioMaximumKPlexes,
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
  assert.match(membershipRow, /"universal"$/);
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
    { nodeId: "a", candidateScenarioSupportCount: 2, candidateScenarioIds: ["archive-a", "archive-b"], scenarioSupportCount: 2, scenarioIds: ["archive-a", "archive-b"], stableAcrossEveryScenario: true },
    { nodeId: "b", candidateScenarioSupportCount: 2, candidateScenarioIds: ["archive-a", "archive-b"], scenarioSupportCount: 2, scenarioIds: ["archive-a", "archive-b"], stableAcrossEveryScenario: true },
    { nodeId: "c", candidateScenarioSupportCount: 2, candidateScenarioIds: ["archive-a", "archive-b"], scenarioSupportCount: 1, scenarioIds: ["archive-a"], stableAcrossEveryScenario: false },
    { nodeId: "d", candidateScenarioSupportCount: 2, candidateScenarioIds: ["archive-a", "archive-b"], scenarioSupportCount: 1, scenarioIds: ["archive-b"], stableAcrossEveryScenario: false }
  ]);
});

test("la stabilità k-core ammette un core vuoto e rifiuta risultati/configurazioni incoerenti", () => {
  const summary = summarizeProvenanceScenarioKCores([
    { scenarioId: "empty", nodesCount: 2, linksCount: 0, timeMs: 0, candidateNodeIds: ["a", "b"], coreNodeIds: [] },
    { scenarioId: "nonempty", nodesCount: 2, linksCount: 1, timeMs: 1, candidateNodeIds: ["a", "b"], coreNodeIds: ["a"] }
  ], 3, "mutual");
  assert.equal(summary.degreeMode, "mutual");
  assert.deepEqual(summary.stableNodeIds, []);
  assert.deepEqual(summary.nonUniversalNodeIds, ["a"]);

  const valid = { scenarioId: "s", nodesCount: 1, linksCount: 0, timeMs: 0, candidateNodeIds: ["a"], coreNodeIds: ["a"] };
  assert.throws(() => summarizeProvenanceScenarioKCores([], 1), /almeno uno scenario/);
  assert.throws(() => summarizeProvenanceScenarioKCores([valid, valid], 1), /univoci/);
  assert.throws(() => summarizeProvenanceScenarioKCores([valid], -1), /k deve/);
  assert.throws(() => summarizeProvenanceScenarioKCores([valid], 1, "invalid"), /modalità/);
  assert.throws(() => summarizeProvenanceScenarioKCores([
    { ...valid, nodesCount: 2, candidateNodeIds: ["a", "b"], coreNodeIds: ["a", "a"] }
  ], 1), /Membership/);
  assert.throws(() => summarizeProvenanceScenarioKCores([{ ...valid, coreNodeIds: ["a", "b"] }], 1), /supera/);
  assert.throws(() => summarizeProvenanceScenarioKCores([{ ...valid, candidateNodeIds: [] }], 1), /dominio candidato/);
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
  assert.equal(lines[0].split(",").length, 21);
  assert.match(lines[1], /^"scenario","archive-a","Archivio, A","1","undirected"/);
  assert.ok(lines[1].includes('"gruppo ""A""","0.7","2019–2020","[""person""]","[""italian""]"'));
  assert.ok(lines[0].includes('"view_type_filters_json","view_group_filters_json"'));
  assert.ok(lines[3].includes('"a","\'=Alice"'));
  assert.ok(lines[3].endsWith('"universal"'));
  assert.ok(lines[4].endsWith('"non-universal"'));
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
  assert.deepEqual(summary.nonUniversalNodeIds, ["c", "d"]);
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
