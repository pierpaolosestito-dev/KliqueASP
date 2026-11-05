import test from "node:test";
import assert from "node:assert/strict";
import { buildIntegrityViolationVisualization } from "../src/lib/kliqueasp/graph/integrityVisualization.ts";
import { buildIntegrityRepairVisualization } from "../src/lib/kliqueasp/graph/integrityRepairVisualization.ts";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildGraphIntegrityProgram,
  buildMinimumIntegrityRepairProgram,
  parseIntegrityRepairProposal,
  parseIntegrityViolations
} from "../src/lib/kliqueasp/graph/integrityTask.ts";
import {
  buildEdgeProvenanceBySourceId,
  hasCompleteModelEnumeration,
  hasCompleteOptimalModelEnumeration
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const nodes = [
  { id: "n1", sourceId: "source-node-1", label: "Nodo uno" },
  { id: "n2", sourceId: "source-node-2", label: "Nodo due" },
  { id: "n3", sourceId: "source-node-3", label: "Nodo tre" }
];
const links = [
  { source: "n1", target: "n2", sourceId: "source-edge-1", type: "collaborazione", analysis: { provenance: ["survey-1", "dataset-A"] } },
  { source: "n2", target: "n3", sourceId: "source-edge-2", type: "consulenza" }
];

const dataDrivenGraph = normalizeGraphData({
  nodes: [
    { id: "person-a", name: "Ada", kind: "person" },
    { id: "person-b", name: "Bruno", kind: "person" },
    { id: "place-x", name: "Istituto X", kind: "place" }
  ],
  edges: [
    { id: "edge-invalid", from: "person-a", to: "person-b", kind: "works_at" },
    { id: "edge-valid", from: "person-a", to: "place-x", kind: "works_at" }
  ]
}, {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.name", typeField: "$.kind" },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      typeField: "$.kind",
      direction: "directed",
      identity: "multigraph"
    }
  }
});

const integrityConstraints = {
  edgeTypeDomains: [{ edgeType: "works_at", sourceNodeTypes: ["person"], targetNodeTypes: ["place"] }]
};
const dataDrivenAsp = buildAspFactsFromGraph(dataDrivenGraph);
const dataDrivenProvenance = buildEdgeProvenanceBySourceId(dataDrivenGraph.links);

test("an integrity record witness is preserved through a selectable 2D SVG", () => {
  const visualization = buildIntegrityViolationVisualization({
    kind: "missing_edge_type",
    subjectId: "source-edge-1",
    nodeIds: [],
    edgeIds: []
  }, nodes, links, buildEdgeProvenanceBySourceId(links));
  const scene = buildGraph2DScene(nodes, links, {
    mode: "witness",
    highlightedNodeIds: visualization.nodeIds,
    highlightedEdgeIds: visualization.edgeIds,
    nodeAnnotations: visualization.nodeAnnotations,
    edgeAnnotations: visualization.edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: visualization.resultLabel,
    completionLabel: "Enumerazione completa · 1 violazione"
  });

  assert.deepEqual(scene.nodes.map((node) => node.id), ["n1", "n2"]);
  assert.deepEqual(scene.links.map((link) => link.id), ["source-edge-1"]);
  assert.equal(scene.links[0].selected, true);
  assert.match(svg, /Violazione · Tipo arco richiesto ma assente/);
  assert.match(svg, /source-edge-1/);
  assert.match(svg, /Fonte dichiarata · source-edge-1: \[&quot;dataset-A&quot;,&quot;survey-1&quot;\]/);
  assert.match(svg, /Enumerazione completa · 1 violazione/);
  assert.match(svg, /stroke-dasharray="2 4"/);
});

test("a global integrity violation exports context without fabricating a witness", () => {
  const visualization = buildIntegrityViolationVisualization({
    kind: "cardinality_min",
    subjectId: "",
    nodeIds: [],
    edgeIds: []
  }, nodes, links);
  const scene = buildGraph2DScene(nodes, links, { mode: "projection" });
  const svg = buildGraph2DSvg(scene, { resultLabel: visualization.resultLabel });

  assert.equal(visualization.hasWitness, false);
  assert.deepEqual(scene.nodes.map((node) => node.selected), [false, false, false]);
  assert.deepEqual(scene.links.map((link) => link.selected), [false, false]);
  assert.match(svg, /nessun testimone nel grafo/);
  assert.match(svg, /3 nodi · 2 archi/);
});

test("an ASP integrity violation travels through source identity to its exact 2D SVG witness", async () => {
  const runner = await createClingoWasmRunner();
  const result = await runner.run(
    `${dataDrivenAsp.facts}\n${buildGraphIntegrityProgram(integrityConstraints, dataDrivenGraph.direction)}`
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true);

  const violations = parseIntegrityViolations(
    result.Call?.[0]?.Witnesses,
    dataDrivenAsp.reverseSourceIndex,
    dataDrivenAsp.reverseEdgeIndex
  );
  const violation = violations.find(({ kind, subjectId }) =>
    kind === "edge_endpoint_type" && subjectId === "edge-invalid"
  );
  assert.ok(violation, "clingo should identify the invalid source edge");

  const visualization = buildIntegrityViolationVisualization(
    violation,
    dataDrivenGraph.nodes,
    dataDrivenGraph.links,
    dataDrivenProvenance
  );
  const scene = buildGraph2DScene(dataDrivenGraph.nodes, dataDrivenGraph.links, {
    mode: "witness",
    graphDirection: dataDrivenGraph.direction,
    highlightedNodeIds: visualization.nodeIds,
    highlightedEdgeIds: visualization.edgeIds,
    nodeAnnotations: visualization.nodeAnnotations,
    edgeAnnotations: visualization.edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: visualization.resultLabel,
    completionLabel: "Enumerazione completa · 1 violazione"
  });

  const endpointNodeIds = dataDrivenGraph.nodes
    .filter(({ sourceId }) => sourceId === "person-a" || sourceId === "person-b")
    .map(({ id }) => id)
    .sort();
  assert.deepEqual(scene.nodes.map(({ id }) => id).sort(), endpointNodeIds);
  assert.deepEqual(scene.links.map(({ id }) => id), ["edge-invalid"]);
  assert.equal(scene.links[0].selected, true);
  assert.match(svg, /Tipo degli estremi incompatibile/);
  assert.match(svg, /edge-invalid/);
  assert.match(svg, /Enumerazione completa · 1 violazione/);
  assert.doesNotMatch(svg, /Istituto X|edge-valid/);
});

test("an ASP minimum integrity repair travels through source identity to a proposed 2D SVG", async () => {
  const repair = buildMinimumIntegrityRepairProgram({
    ...integrityConstraints,
    repairSuggestions: { removableEdges: [{ edgeId: "edge-invalid", cost: 2 }] }
  }, dataDrivenGraph.direction, dataDrivenAsp.reverseEdgeIndex, dataDrivenAsp.indexByNodeId, dataDrivenAsp.reverseSourceIndex);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${dataDrivenAsp.facts}\n${repair.program}`, ["--opt-mode=opt"]);
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteOptimalModelEnumeration(result), true);

  const proposal = parseIntegrityRepairProposal(
    result.Call?.[0]?.Witnesses,
    dataDrivenAsp.reverseEdgeIndex,
    repair.costByEdgeId,
    repair.attributeCandidateById,
    repair.edgeAttributeCandidateById,
    repair.nodeAttributeReplacementById,
    repair.edgeAttributeReplacementById,
    repair.nodeTypeReplacementById,
    repair.edgeTypeReplacementById,
    repair.edgeIntervalReplacementById
  );
  assert.deepEqual(proposal?.edgeIds, ["edge-invalid"]);
  assert.equal(proposal?.cost, 2);

  const visualization = buildIntegrityRepairVisualization(
    proposal,
    dataDrivenGraph.nodes,
    dataDrivenGraph.links,
    dataDrivenProvenance
  );
  const scene = buildGraph2DScene(dataDrivenGraph.nodes, dataDrivenGraph.links, {
    mode: "projection",
    graphDirection: dataDrivenGraph.direction,
    highlightedNodeIds: visualization.nodeIds,
    highlightedEdgeIds: visualization.edgeIds,
    nodeAnnotations: visualization.nodeAnnotations,
    edgeAnnotations: visualization.edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: visualization.resultLabel,
    completionLabel: visualization.completionLabel
  });

  assert.equal(visualization.hasWitness, true);
  assert.deepEqual(scene.nodes.map(({ id }) => id).sort(), dataDrivenGraph.nodes.map(({ id }) => id).sort());
  assert.deepEqual(scene.links.map(({ id }) => id).sort(), dataDrivenGraph.links.map(({ sourceId }) => sourceId).sort());
  const proposedLink = scene.links.find(({ id }) => id === "edge-invalid");
  assert.equal(proposedLink?.selected, true);
  assert.match(svg, /edge-invalid/);
  assert.match(svg, /Rimozione proposta/);
  assert.match(svg, /Ottimo di costo provato · una proposta tra eventuali pari merito · costo 2 · dati invariati/);
  assert.deepEqual(dataDrivenGraph.links.map(({ sourceId }) => sourceId).sort(), ["edge-invalid", "edge-valid"]);
});
