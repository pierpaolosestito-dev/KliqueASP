import test from "node:test";
import assert from "node:assert/strict";
import { buildIntegrityViolationVisualization } from "../src/lib/kliqueasp/graph/integrityVisualization.ts";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildEdgeProvenanceBySourceId } from "../src/lib/kliqueasp/graph/structuralTasks.ts";

const nodes = [
  { id: "n1", sourceId: "source-node-1", label: "Nodo uno" },
  { id: "n2", sourceId: "source-node-2", label: "Nodo due" },
  { id: "n3", sourceId: "source-node-3", label: "Nodo tre" }
];
const links = [
  { source: "n1", target: "n2", sourceId: "source-edge-1", type: "collaborazione", analysis: { provenance: ["survey-1", "dataset-A"] } },
  { source: "n2", target: "n3", sourceId: "source-edge-2", type: "consulenza" }
];

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
  assert.match(svg, /nessun witness grafico/);
  assert.match(svg, /3 nodi · 2 archi/);
});
