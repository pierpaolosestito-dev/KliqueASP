import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import {
  buildConnectedComponentsProgram,
  buildKCoreProgram,
  buildMaximumKPlexProgram,
  buildMinimumDominatingSetProgram,
  getStructuralSolverOptions,
  hasCompleteModelEnumeration,
  hasCompleteOptimalModelEnumeration,
  parseWitnessComponents,
  parseWitnessDominatingSetExplanations,
  parseWitnessNodeSets,
  selectMaximumNodeSets,
  selectMinimumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import {
  summarizeProvenanceScenarioComponents,
  summarizeProvenanceScenarioDominatingSets,
  summarizeProvenanceScenarioKCores,
  summarizeProvenanceScenarioMaximumKPlexes
} from "../src/lib/kliqueasp/graph/provenanceScenarioAnalysis.ts";
import {
  buildAspFactsFromGraph,
  buildCliqueProgram,
  getCliqueModeOptions,
  normalizeGraphData,
  parseWitnessCliques,
  selectMaximumCliques
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";
import { summarizeProvenanceScenarioMaximumCliques } from "../src/lib/kliqueasp/graph/provenanceScenarioAnalysis.ts";
import {
  buildProvenanceScenarioCliqueMembershipGraph2DOverlay,
  buildProvenanceScenarioStructuralMembershipGraph2DAnnotation
} from "../src/lib/kliqueasp/graph/provenanceScenarioGraph2D.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const graphApp = readFileSync(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const structuralPanel = readFileSync(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");

test("scenario membership 2D export explains one selected node as an aggregate", () => {
  const membership = {
    nodeId: "psychologist-1",
    scenarioSupportCount: 2,
    scenarioIds: ["base", "without-x"],
    optimalAnswerSetCount: 4,
    totalOptimalAnswerSetCount: 7,
    stableAcrossEveryOptimalAnswerSet: false
  };
  const overlay = buildProvenanceScenarioCliqueMembershipGraph2DOverlay(membership, {
    scenarioCount: 3,
    totalOptimalAnswerSetCount: 7
  });
  const scene = buildGraph2DScene([
    { id: membership.nodeId, label: "Psicologo 1" },
    { id: "context-node", label: "Nodo di contesto" }
  ], [
    { source: membership.nodeId, target: "context-node", sourceId: "observed-context-edge" }
  ], {
    mode: "witness",
    highlightedNodeIds: overlay.nodeIds,
    nodeAnnotations: overlay.nodeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    resultLabel: overlay.resultLabel,
    completionLabel: overlay.completionLabel,
    scopeLabel: "Nodo selezionato nel confronto tra scenari",
    showAnnotations: true
  });

  assert.deepEqual(overlay.nodeIds, ["psychologist-1"]);
  assert.equal(scene.nodes.length, 1, "la membership aggregata seleziona soltanto il nodo scelto");
  assert.equal(scene.links.length, 0, "non vengono attribuiti archi al risultato aggregato");
  assert.match(svg, /2\/3 scenari · 4\/7 clique massime · presente solo in alcuni ottimi/);
  assert.match(svg, /Presenza del nodo nelle clique massime tra scenari/);
  assert.match(svg, /Enumerazione completa · 7 clique massime in 3 scenari/);
});

test("scenario membership annotation handles a comparison with no optimal cliques", () => {
  const overlay = buildProvenanceScenarioCliqueMembershipGraph2DOverlay({
    nodeId: "candidate",
    scenarioSupportCount: 0,
    scenarioIds: [],
    optimalAnswerSetCount: 0,
    totalOptimalAnswerSetCount: 0,
    stableAcrossEveryOptimalAnswerSet: false
  }, {
    scenarioCount: 2,
    totalOptimalAnswerSetCount: 0
  });

  assert.equal(overlay.nodeAnnotations.candidate, "0/2 scenari · nessuna clique massima calcolata · nessun ottimo trovato");
  assert.match(overlay.completionLabel, /Enumerazione completa · 0 clique massime in 2 scenari/);
});

test("the scenario membership row wires its selected node into the annotated 2D overlay", () => {
  const start = graphApp.indexOf("<ProvenanceScenarioAnalysisPanel");
  const end = graphApp.indexOf("\n/>", start);
  const panel = graphApp.slice(start, end);

  assert.match(panel, /provenanceScenarioComparison\?\.memberships\.find/);
  assert.match(panel, /buildProvenanceScenarioCliqueMembershipGraph2DOverlay/);
  assert.match(panel, /graph2DNodeAnnotations\s*=\s*membershipOverlay\.nodeAnnotations/);
  assert.match(graphApp, /graph2DOverlayResultLabel\.startsWith\("Presenza del nodo "\)[\s\S]{0,250}kind:\s*"aggregate" as const/);
});

test("structural scenario memberships keep family-specific counts in the selected-node SVG", () => {
  const cases = [
    {
      kind: "kCore",
      membership: {
        nodeId: "x", candidateScenarioSupportCount: 3, candidateScenarioIds: ["a", "b", "c"],
        scenarioSupportCount: 2, scenarioIds: ["a", "c"], stableAcrossEveryScenario: false,
        stableAcrossEveryEligibleScenario: true
      },
      comparison: { scenarioCount: 3, k: 2, degreeMode: "undirected", stableNodeIds: [], nonUniversalNodeIds: [], scenarios: [], memberships: [] },
      expectedAnnotation: "k-core in 2/3 scenari · candidato in 3/3",
      expectedLabel: "Presenza del nodo nel k-core k=2 tra scenari"
    },
    {
      kind: "kPlex",
      membership: {
        nodeId: "x", candidateScenarioSupportCount: 2, candidateScenarioIds: ["a", "b"],
        scenarioSupportCount: 2, scenarioIds: ["a", "b"], optimalAnswerSetCount: 4,
        totalOptimalAnswerSetCount: 7, stableAcrossEveryOptimalAnswerSet: false
      },
      comparison: { scenarioCount: 3, s: 2, totalOptimalAnswerSetCount: 7, stableNodeIds: [], nonUniversalNodeIds: [], scenarios: [], memberships: [] },
      expectedAnnotation: "4/7 k-plex massimi · presente in 2/3 scenari",
      expectedLabel: "Presenza del nodo nei k-plex massimi s=2 tra scenari"
    },
    {
      kind: "component",
      membership: {
        nodeId: "x", candidateScenarioCount: 3, candidateScenarioIds: ["a", "b", "c"],
        comparableScenarioCount: 2, comparableScenarioIds: ["a", "c"], sameComponentScenarioCount: 1,
        sameComponentScenarioIds: ["a"], separateComponentScenarioIds: ["c"],
        sameComponentInEveryComparableScenario: false, sameComponentInEveryDeclaredScenario: false
      },
      comparison: { scenarioCount: 3, task: "weakComponents", targetNodeId: "reference", targetEligibleScenarioCount: 3, universallySameComponentNodeIds: [], conditionallySameComponentNodeIds: [], memberships: [], scenarios: [] },
      expectedAnnotation: "stessa componente in 1/2 scenari confrontabili · riferimento reference · candidato in 3/3",
      expectedLabel: "Relazione di componente debolmente connessa con il riferimento reference tra scenari"
    },
    {
      kind: "dominatingSet",
      membership: {
        nodeId: "x", candidateScenarioCount: 2, candidateScenarioIds: ["a", "b"], optimalScenarioCount: 2,
        optimalScenarioIds: ["a", "b"], selectedMinimumSetCount: 3, totalComparableMinimumSetCount: 5,
        selectedInEveryComparableMinimumSet: false, selectedInEveryScenarioMinimumSet: false
      },
      comparison: { scenarioCount: 3, candidateGroup: "clinici", targetGroup: "pazienti", totalMinimumSetCount: 8, universallySelectedNodeIds: [], conditionallySelectedNodeIds: [], memberships: [], scenarios: [] },
      expectedAnnotation: "3/5 coperture minime · candidato in 2/3 scenari",
      expectedLabel: "Selezione del nodo nelle coperture minime tra scenari · candidati clinici · obiettivi pazienti"
    }
  ];

  for (const selection of cases) {
    const overlay = buildProvenanceScenarioStructuralMembershipGraph2DAnnotation(selection);
    const scene = buildGraph2DScene([
      { id: "x", label: "Nodo X" },
      { id: "y", label: "Nodo esterno" }
    ], [{ source: "x", target: "y", sourceId: "context" }], {
      mode: "witness",
      highlightedNodeIds: overlay.nodeIds,
      nodeAnnotations: overlay.nodeAnnotations
    });
    const svg = buildGraph2DSvg(scene, {
      resultLabel: overlay.resultLabel,
      completionLabel: overlay.completionLabel,
      showAnnotations: true
    });

    assert.deepEqual(overlay.nodeIds, ["x"], selection.kind);
    assert.equal(scene.links.length, 0, `${selection.kind} membership must not claim an induced edge as evidence`);
    assert.ok(svg.includes(selection.expectedAnnotation), `${selection.kind} counts must appear in the SVG`);
    assert.ok(svg.includes(selection.expectedLabel), `${selection.kind} must be labeled as an aggregate`);
  }
});

test("structural scenario membership buttons use their dedicated 2D selection path", () => {
  const start = graphApp.indexOf("<StructuralAnalysisPanel");
  const end = graphApp.indexOf("\n/>", start);
  const panel = graphApp.slice(start, end);

  assert.match(panel, /on:highlightScenarioMembership=\{\(event\) => highlightProvenanceStructuralScenarioMembership\(event\.detail\)\}/);
  assert.match(panel, /clearGraph2DOverlay\(\)[\s\S]*graph2DNodeAnnotations\s*=\s*overlay\.nodeAnnotations/);
  for (const dispatch of [
    'dispatch("highlightScenarioMembership", { kind: "kCore", nodeId: membership.nodeId })',
    'dispatch("highlightScenarioMembership", { kind: "kPlex", nodeId: membership.nodeId })',
    'dispatch("highlightScenarioMembership", { kind: "component", nodeId: membership.nodeId })',
    'dispatch("highlightScenarioMembership", { kind: "dominatingSet", nodeId: membership.nodeId })'
  ]) assert.ok(structuralPanel.includes(dispatch), `missing ${dispatch}`);
});

test("clingo scenario clique membership flows from two projections to its annotated SVG", async () => {
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
          { id: "source-a", label: "Fonte A", sources: ["A"] },
          { id: "source-b", label: "Fonte B", sources: ["B"] }
        ],
        unattributedEdges: "exclude",
        referenceMatching: "any"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, type: "person" })),
    edges: [
      { id: "ab", source: "a", target: "b", sources: ["A", "B"] },
      { id: "bc", source: "b", target: "c", sources: ["A"] },
      { id: "bd", source: "b", target: "d", sources: ["B"] }
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
      `${asp.facts}\n${buildCliqueProgram("maximum", "")}`,
      getCliqueModeOptions("maximum")
    );
    assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
    assert.equal(result.Models.More, "no");
    scenarioResults.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      nodesCount: graph.nodes.length,
      linksCount: links.length,
      timeMs: 0,
      maximumCliques: selectMaximumCliques(
        parseWitnessCliques(result.Call?.[0]?.Witnesses, asp.reverseIndex, 1)
      )
    });
  }

  const comparison = summarizeProvenanceScenarioMaximumCliques(scenarioResults);
  const membership = comparison.memberships.find(({ nodeId }) => nodeId === "c");
  assert.ok(membership);
  const overlay = buildProvenanceScenarioCliqueMembershipGraph2DOverlay(membership, comparison);
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    highlightedNodeIds: overlay.nodeIds,
    nodeAnnotations: overlay.nodeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    resultLabel: overlay.resultLabel,
    completionLabel: overlay.completionLabel,
    scopeLabel: "Membership aggregata tra scenari",
    showAnnotations: true
  });

  assert.equal(comparison.totalOptimalAnswerSetCount, 4);
  assert.equal(membership.scenarioSupportCount, 1);
  assert.equal(membership.optimalAnswerSetCount, 1);
  assert.deepEqual(scene.nodes.map(({ id }) => id), ["c"]);
  assert.equal(scene.links.length, 0);
  assert.ok(svg.includes("1/2 scenari"));
  assert.ok(svg.includes("1/4 clique massime"));
  assert.ok(svg.includes("Enumerazione completa · 4 clique massime in 2 scenari"));
  assert.ok(!svg.includes('data-link-id="ab"'));
});

test("clingo structural scenario comparisons flow into aggregate SVG without inventing witnesses", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
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
          { id: "complete", label: "Relazioni A", sources: ["A"] },
          { id: "single-tie", label: "Relazioni B", sources: ["B"] }
        ],
        unattributedEdges: "exclude",
        referenceMatching: "any"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", analysis: { groups: ["candidates"] } },
      { id: "b", analysis: { groups: ["candidates"] } },
      { id: "c", analysis: { groups: ["targets"] } }
    ],
    edges: [
      { id: "ab-a", source: "a", target: "b", sources: ["A"] },
      { id: "ac-a", source: "a", target: "c", sources: ["A"] },
      { id: "bc-a", source: "b", target: "c", sources: ["A"] },
      { id: "ac-b", source: "a", target: "c", sources: ["B"] }
    ]
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  const runner = await createClingoWasmRunner();
  const scenarioGraphs = config.graphAnalysis.provenanceScenarios.scenarios.map((scenario) => {
    const links = filterLinksByProvenanceScenario(graph.links, {
      sources: scenario.sources,
      unattributedEdges: config.graphAnalysis.provenanceScenarios.unattributedEdges,
      referenceMatching: config.graphAnalysis.provenanceScenarios.referenceMatching
    });
    return { scenario, links, asp: buildAspFactsFromGraph({ ...graph, links }) };
  });
  const solve = async (scenarioGraph, program, options, task) => {
    const result = await runner.run(`${scenarioGraph.asp.facts}\n${program}\n`, options);
    assert.equal(result.Result, task === "components" ? "SATISFIABLE" : "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
    if (task === "components") assert.equal(hasCompleteModelEnumeration(result), true);
    else assert.equal(hasCompleteOptimalModelEnumeration(result), true);
    return result;
  };

  const coreInputs = [];
  const kPlexInputs = [];
  const componentInputs = [];
  const dominatingInputs = [];
  for (const scenarioGraph of scenarioGraphs) {
    const { scenario, links, asp } = scenarioGraph;
    const coreResult = await solve(scenarioGraph, buildKCoreProgram(2), getStructuralSolverOptions("kCore"), "kCore");
    const coreNodeIds = selectMaximumNodeSets(
      parseWitnessNodeSets(coreResult.Call?.[0]?.Witnesses, asp.reverseIndex)
    )[0] ?? [];
    assert.deepEqual(
      [...coreNodeIds].sort(),
      scenario.id === "complete" ? ["a", "b", "c"] : [],
      `${scenario.id} k-core witness did not match its projected triangle/edge: ${JSON.stringify(coreResult.Call?.[0]?.Witnesses)}`
    );
    coreInputs.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      nodesCount: graph.nodes.length,
      linksCount: links.length,
      timeMs: 0,
      candidateNodeIds: graph.nodes.map(({ id }) => id),
      coreNodeIds
    });

    const kPlexResult = await solve(
      scenarioGraph,
      buildMaximumKPlexProgram(2),
      getStructuralSolverOptions("kPlex", true),
      "kPlex"
    );
    kPlexInputs.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      nodesCount: graph.nodes.length,
      linksCount: links.length,
      timeMs: 0,
      candidateNodeIds: graph.nodes.map(({ id }) => id),
      maximumKPlexes: selectMaximumNodeSets(parseWitnessNodeSets(kPlexResult.Call?.[0]?.Witnesses, asp.reverseIndex))
    });

    const componentResult = await solve(
      scenarioGraph,
      buildConnectedComponentsProgram(),
      getStructuralSolverOptions("components"),
      "components"
    );
    componentInputs.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      projectedNodeCount: graph.nodes.length,
      linksCount: links.length,
      timeMs: 0,
      candidateNodeIds: graph.nodes.map(({ id }) => id),
      components: parseWitnessComponents(componentResult.Call?.[0]?.Witnesses, asp.reverseIndex)
    });

    const groupedAsp = buildAspFactsFromGraph({ ...graph, links }, (node) => node.analysis.groups);
    const dominatingResult = await runner.run(
      `${groupedAsp.facts}\n${buildMinimumDominatingSetProgram("candidates", "targets")}\n`,
      getStructuralSolverOptions("dominatingSet", true)
    );
    assert.equal(dominatingResult.Result, "OPTIMUM FOUND", dominatingResult.Error ?? JSON.stringify(dominatingResult));
    assert.equal(hasCompleteOptimalModelEnumeration(dominatingResult), true);
    const minimumDominatingSets = selectMinimumNodeSets(
      parseWitnessDominatingSetExplanations(dominatingResult.Call?.[0]?.Witnesses, groupedAsp.reverseIndex)
        .map(({ nodeIds }) => nodeIds)
    );
    dominatingInputs.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      projectedNodeCount: graph.nodes.length,
      projectedNodeIds: graph.nodes.map(({ id }) => id),
      candidateNodeIds: graph.nodes.filter(({ analysis }) => analysis.groups.includes("candidates")).map(({ id }) => id),
      targetNodeIds: graph.nodes.filter(({ analysis }) => analysis.groups.includes("targets")).map(({ id }) => id),
      linksCount: links.length,
      timeMs: 0,
      minimumDominatingSets
    });
  }

  const cases = [
    {
      kind: "kCore",
      comparison: summarizeProvenanceScenarioKCores(coreInputs, 2),
      expectedSupport: "k-core in 1/2 scenari",
      completionLabel: "Confronto completo",
      findMembership: (comparison) => comparison.memberships.find(({ nodeId }) => nodeId === "b")
    },
    {
      kind: "kPlex",
      comparison: summarizeProvenanceScenarioMaximumKPlexes(kPlexInputs, 2),
      expectedSupport: "presente in 2/2 scenari",
      completionLabel: "Enumerazione completa",
      findMembership: (comparison) => comparison.memberships.find(({ nodeId }) => nodeId === "b")
    },
    {
      kind: "component",
      comparison: summarizeProvenanceScenarioComponents(componentInputs, "components", "a"),
      expectedSupport: "stessa componente in 1/2 scenari confrontabili",
      completionLabel: "Confronto completo",
      findMembership: (comparison) => comparison.memberships.find(({ nodeId }) => nodeId === "b")
    },
    {
      kind: "dominatingSet",
      comparison: summarizeProvenanceScenarioDominatingSets(dominatingInputs, "candidates", "targets"),
      expectedSupport: "1/3 coperture minime",
      completionLabel: "Confronto completo",
      findMembership: (comparison) => comparison.memberships.find(({ nodeId }) => nodeId === "b")
    }
  ];

  for (const { kind, comparison, expectedSupport, completionLabel, findMembership } of cases) {
    const membership = findMembership(comparison);
    assert.ok(membership, `${kind} summary must contain node b`);
    const overlay = buildProvenanceScenarioStructuralMembershipGraph2DAnnotation({ kind, membership, comparison });
    const scene = buildGraph2DScene(graph.nodes, graph.links, {
      mode: "witness",
      highlightedNodeIds: overlay.nodeIds,
      nodeAnnotations: overlay.nodeAnnotations
    });
    const svg = buildGraph2DSvg(scene, {
      resultLabel: overlay.resultLabel,
      completionLabel: overlay.completionLabel,
      scopeLabel: "Presenza del nodo tra scenari",
      showAnnotations: true
    });

    assert.deepEqual(scene.nodes.map(({ id }) => id), ["b"], `${kind} should focus only the selected node`);
    assert.equal(scene.links.length, 0, `${kind} membership is aggregate evidence, not an induced-edge witness`);
    assert.ok(svg.includes(expectedSupport), `${kind} should show its own support denominator; SVG: ${svg}`);
    assert.ok(svg.includes(completionLabel), `${kind} should identify the verified completion status`);
  }
});
