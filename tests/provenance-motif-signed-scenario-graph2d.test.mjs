import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildGraph2DScenarioComparisonCompletionLabel } from "../src/lib/kliqueasp/graph/graph2DAnalysisOutcome.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { summarizeProvenanceScenarioMotifs } from "../src/lib/kliqueasp/graph/motifScenarioAnalysis.ts";
import { buildTypedMotifProgram, parseTypedMotifMatches } from "../src/lib/kliqueasp/graph/motifTask.ts";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";
import { summarizeSignedTriadScenarios } from "../src/lib/kliqueasp/graph/signedTriadScenarioAnalysis.ts";
import { buildSignedTriadProgram, parseSignedTriadResults, prepareSignedTriads } from "../src/lib/kliqueasp/graph/signedTriadTask.ts";
import { getStructuralEdgeIdentity, hasCompleteModelEnumeration, mapSourceEdgeIdsToStructuralIdentities } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const directedConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.id", typeField: "$.kind" },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      typeField: "$.kind",
      provenanceField: "$.sourceRef",
      direction: "directed",
      identity: "multigraph"
    }
  }
};

const undirectedSignedConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.id" },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      provenanceField: "$.sourceRef",
      direction: "undirected",
      identity: "multigraph",
      attributes: { polarity: "$.sign" }
    }
  },
  graphAnalysis: {
    signedTriads: { attribute: "polarity", positiveValues: ["+"], negativeValues: ["-"] }
  }
};

const scenarioFilter = (scenarioId) => ({
  sources: [scenarioId],
  unattributedEdges: "exclude",
  referenceMatching: "any"
});

test("a selected provenance-motif scenario witness reaches SVG with only its directed source evidence", async () => {
  const normalized = normalizeGraphData({
    nodes: [
      { id: "a", kind: "person" },
      { id: "b", kind: "person" },
      { id: "outside", kind: "other" }
    ],
    edges: [
      { id: "ab-a1", from: "a", to: "b", kind: "knows", sourceRef: "A" },
      { id: "ab-a2", from: "a", to: "b", kind: "knows", sourceRef: "A" },
      { id: "ab-b", from: "a", to: "b", kind: "knows", sourceRef: "B" },
      { id: "ba-b", from: "b", to: "a", kind: "knows", sourceRef: "B" },
      { id: "outside-b", from: "a", to: "outside", kind: "knows", sourceRef: "B" }
    ]
  }, directedConfig);
  assert.equal(normalized.valid, true, JSON.stringify(normalized.diagnostics));

  const template = {
    id: "directed-knows-pair",
    label: "Relazione diretta",
    roles: {
      source: { nodeTypes: ["person"] },
      target: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "source", targetRole: "target", edgeType: "knows" }]
  };
  const runner = await createClingoWasmRunner();
  const scenarioInputs = [];
  const projectedByScenario = new Map();

  for (const scenarioId of ["A", "B"]) {
    const links = filterLinksByProvenanceScenario(normalized.links, scenarioFilter(scenarioId));
    const graph = { ...normalized, links };
    projectedByScenario.set(scenarioId, graph);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(template, normalized.direction);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
    assert.equal(hasCompleteModelEnumeration(result), true);
    const matches = parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    );
    scenarioInputs.push({
      scenarioId,
      scenarioLabel: `Mondo ${scenarioId}`,
      nodesCount: graph.nodes.length,
      linksCount: graph.links.length,
      timeMs: 1,
      enumerationComplete: true,
      matches
    });
  }

  const comparison = summarizeProvenanceScenarioMotifs(
    template.id,
    template.label,
    Object.keys(template.roles),
    scenarioInputs,
    {
      selectedGroup: "",
      graphDirection: "directed",
      timelineWindow: "",
      minimumEdgeConfidence: null,
      viewFilters: { types: [], groups: [] }
    }
  );
  const membership = comparison.memberships.find(({ roleAssignments }) =>
    roleAssignments.source === "a" && roleAssignments.target === "b");
  assert.ok(membership);
  const selected = membership.evidenceByScenario.find(({ scenarioId }) => scenarioId === "B");
  assert.ok(selected);
  const witness = selected.match;
  const scenarioGraph = projectedByScenario.get("B");
  const edgeIds = witness.supportingEdges.flatMap((edge) => edge.edgeIds);
  const edgeIdentities = mapSourceEdgeIdsToStructuralIdentities(edgeIds, scenarioGraph.links);
  const scene = buildGraph2DScene(scenarioGraph.nodes, scenarioGraph.links, {
    mode: "witness",
    graphDirection: scenarioGraph.direction,
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: edgeIdentities,
    nodeAnnotations: Object.fromEntries(Object.entries(witness.roles).map(([role, assignment]) => [
      assignment.nodeId,
      `Ruolo ${role}`
    ]))
  });
  const svg = buildGraph2DSvg(scene, {
    resultLabel: "Motivo tipizzato · ruoli sui nodi",
    completionLabel: buildGraph2DScenarioComparisonCompletionLabel({
      analysisLabel: "scenari",
      scenarioCount: comparison.scenarios.length
    }),
    showAnnotations: true,
    showLegend: true
  });

  assert.deepEqual(edgeIds, ["ab-b"]);
  assert.deepEqual([...edgeIdentities], ["source:ab-b"]);
  assert.deepEqual(scene.nodes.map(({ id }) => id).sort(), ["a", "b"]);
  assert.deepEqual(scene.links.map(({ id }) => id), ["ab-b"]);
  assert.ok(scene.links.every(({ directed, selected }) => directed && selected));
  assert.match(svg, /Ruolo source/);
  assert.match(svg, /Ruolo target/);
  assert.match(svg, /Confronto completo · 2 scenari/);
  assert.doesNotMatch(svg, /ab-a1|ab-a2|ba-b|outside-b|outside/);

  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(graphApp, /on:inspectScenarioMatch=\{\(event\) => inspectProvenanceMotifWitness\(event\.detail\)\}/);
  const start = graphApp.indexOf("function inspectProvenanceMotifWitness(");
  const end = graphApp.indexOf("\n  function inspectSignedTriadScenarioWitness(", start);
  assert.ok(start >= 0 && end > start);
  const handler = graphApp.slice(start, end);
  const labelIndex = handler.indexOf("const completionLabel = buildGraph2DScenarioComparisonCompletionLabel(");
  const scenarioIndex = handler.indexOf("setProvenanceScenario(request.scenarioId)");
  const witnessIndex = handler.indexOf("highlightTypedMotif(request.match, completionLabel)");
  assert.ok(labelIndex >= 0 && labelIndex < scenarioIndex && scenarioIndex < witnessIndex,
    "the comparison status must be captured before changing scenarios clears its results");
  assert.match(handler.slice(labelIndex, scenarioIndex), /motifScenarioComparison\?\.scenarios\.length/);
});

test("a selected signed-triad scenario witness reaches SVG with only its three source records and polarities", async () => {
  const normalized = normalizeGraphData({
    nodes: ["a", "b", "c", "x", "y"].map((id) => ({ id })),
    edges: [
      { id: "ab-a", from: "a", to: "b", sign: "+", sourceRef: "A" },
      { id: "ac-a", from: "a", to: "c", sign: "+", sourceRef: "A" },
      { id: "bc-a", from: "b", to: "c", sign: "+", sourceRef: "A" },
      { id: "ab-b", from: "a", to: "b", sign: "-", sourceRef: "B" },
      { id: "ac-b", from: "a", to: "c", sign: "+", sourceRef: "B" },
      { id: "bc-b", from: "b", to: "c", sign: "+", sourceRef: "B" },
      { id: "xy-b", from: "x", to: "y", sign: "+", sourceRef: "B" }
    ]
  }, undirectedSignedConfig);
  assert.equal(normalized.valid, true, JSON.stringify(normalized.diagnostics));

  const runner = await createClingoWasmRunner();
  const scenarioInputs = [];
  const projectedByScenario = new Map();
  for (const scenarioId of ["A", "B"]) {
    const links = filterLinksByProvenanceScenario(normalized.links, scenarioFilter(scenarioId));
    const graph = { ...normalized, links };
    projectedByScenario.set(scenarioId, graph);
    const facts = buildAspFactsFromGraph(graph);
    const preparation = prepareSignedTriads(
      undirectedSignedConfig.graphAnalysis.signedTriads,
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
      scenarioId,
      scenarioLabel: `Mondo ${scenarioId}`,
      nodesCount: graph.nodes.length,
      linksCount: graph.links.length,
      timeMs: 1,
      enumerationComplete: true,
      triads: parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, preparation.dyads)
    });
  }

  const comparison = summarizeSignedTriadScenarios(scenarioInputs, {
    attribute: "polarity",
    positiveValues: ["+"],
    negativeValues: ["-"],
    edgeTypes: [],
    selectedGroup: "",
    timelineWindow: "",
    minimumEdgeConfidence: null,
    viewFilters: { types: [], groups: [] }
  });
  const membership = comparison.memberships.find(({ nodeIds }) => nodeIds.join(",") === "a,b,c");
  assert.ok(membership);
  assert.deepEqual(membership.worlds.map(({ classification }) => classification), ["balanced", "unbalanced"]);
  const triad = membership.worlds.find(({ scenarioId }) => scenarioId === "B")?.evidence;
  assert.ok(triad);
  const recordIds = triad.dyads.flatMap((dyad) => dyad.edgeRecords.map((record) => record.id));
  const scenarioGraph = projectedByScenario.get("B");
  const edgeIdentities = new Set(recordIds.map((id) => getStructuralEdgeIdentity({
    source: "",
    target: "",
    sourceId: id
  })));
  const edgeAnnotations = Object.fromEntries(triad.dyads.flatMap((dyad) => dyad.edgeRecords.map((record) => [
    `source:${record.id}`,
    dyad.polarity === "positive"
      ? { label: "Positiva", description: "Polarità positiva della dyade", color: "#16834a" }
      : { label: "Negativa", description: "Polarità negativa della dyade", color: "#b4233c", dashPattern: "dashed" }
  ])));
  const scene = buildGraph2DScene(scenarioGraph.nodes, scenarioGraph.links, {
    mode: "witness",
    graphDirection: scenarioGraph.direction,
    highlightedNodeIds: triad.nodeIds,
    highlightedEdgeIds: edgeIdentities,
    nodeAnnotations: Object.fromEntries(triad.nodeIds.map((nodeId, index) => [
      nodeId,
      `Nodo ${index + 1} · triade ${triad.balanced ? "bilanciata" : "non bilanciata"}`
    ])),
    edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    resultLabel: "Triade firmata non bilanciata · nodi e polarità evidenziati",
    completionLabel: buildGraph2DScenarioComparisonCompletionLabel({
      analysisLabel: "scenari",
      scenarioCount: comparison.scenarios.length
    }),
    showAnnotations: true,
    showLegend: true
  });

  assert.deepEqual(recordIds.sort(), ["ab-b", "ac-b", "bc-b"]);
  assert.deepEqual(scene.nodes.map(({ id }) => id).sort(), ["a", "b", "c"]);
  assert.equal(scene.links.length, 3);
  assert.ok(scene.links.every(({ selected, contextOnly }) => selected && !contextOnly));
  assert.equal(scene.links.filter(({ annotation }) => annotation?.label === "Positiva").length, 2);
  assert.equal(scene.links.filter(({ annotation }) => annotation?.label === "Negativa").length, 1);
  assert.match(svg, /Triade firmata non bilanciata/);
  assert.match(svg, /Confronto completo · 2 scenari/);
  assert.match(svg, /Polarità negativa della dyade/);
  assert.doesNotMatch(svg, /ab-a|ac-a|bc-a|xy-b/);

  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(graphApp, /on:inspectSignedTriadScenarioWitness=\{\(event\) => inspectSignedTriadScenarioWitness\(event\.detail\)\}/);
  const start = graphApp.indexOf("function inspectSignedTriadScenarioWitness(");
  const end = graphApp.indexOf("\n  function highlightTypedMotifNearMatch(", start);
  assert.ok(start >= 0 && end > start);
  const handler = graphApp.slice(start, end);
  const labelIndex = handler.indexOf("const completionLabel = buildGraph2DScenarioComparisonCompletionLabel(");
  const scenarioIndex = handler.indexOf("setProvenanceScenario(request.scenarioId)");
  const witnessIndex = handler.indexOf("showSignedTriadInGraph(request.triad, false, completionLabel)");
  assert.ok(labelIndex >= 0 && labelIndex < scenarioIndex && scenarioIndex < witnessIndex,
    "the comparison status must be captured before changing scenarios clears its results");
  assert.match(handler.slice(labelIndex, scenarioIndex), /signedTriadScenarioComparison\?\.scenarios\.length/);
});
