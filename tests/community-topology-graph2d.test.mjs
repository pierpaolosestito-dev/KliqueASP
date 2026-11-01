import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildCommunityTopologyGraph2DOverlay } from "../src/lib/kliqueasp/graph/communityTopologyGraph2D.ts";

test("community topology edits map source IDs to a complete 2D witness and SVG", () => {
  const nodes = [
    { id: "a", sourceId: "node-a", label: "A" },
    { id: "b", sourceId: "node-b", label: "B" },
    { id: "c", sourceId: "node-c", label: "C" }
  ];
  const links = [
    { source: "a", target: "b", analysis: { id: "removed-through-analysis-id" } },
    { source: "a", target: "b", sourceId: "parallel-edge-to-keep" },
    { source: "c", target: "c", sourceId: "generated-record", sourceIdGenerated: true }
  ];
  const result = {
    nodeIds: ["a", "b"],
    requestedRelation: "never",
    relation: "always",
    selectedEdits: [
      { id: "remove-ab", action: "remove", edgeId: "removed-through-analysis-id", cost: 2 },
      { id: "add-bc", action: "add", sourceNodeId: "node-b", targetNodeId: "node-c", cost: 3 }
    ],
    candidateCount: 2,
    totalEditCost: 5,
    testedEditSets: 4,
    globalScaledScore: 100,
    togetherScaledScore: 100,
    separateScaledScore: 80,
    modularityDenominator: "20"
  };

  const overlay = buildCommunityTopologyGraph2DOverlay(result, nodes, links);
  assert.deepEqual(overlay.nodeIds, ["a", "b"]);
  assert.deepEqual([...overlay.edgeIds], ["source:removed-through-analysis-id"]);
  assert.equal(overlay.edgeAnnotations["source:removed-through-analysis-id"].label, "Arco da rimuovere nell'ipotesi");
  assert.match(overlay.edgeAnnotations["source:removed-through-analysis-id"].description, /costo di rimozione 2/);
  assert.equal(overlay.hypotheticalLinks.length, 1);
  assert.equal(overlay.hypotheticalLinks[0].source, "b");
  assert.equal(overlay.hypotheticalLinks[0].target, "c");
  assert.equal(overlay.hypotheticalLinks[0].hypothetical, true);
  assert.equal(overlay.nodeAnnotations.a, "Primo nodo della coppia valutata \u00b7 Estremo di una relazione da rimuovere");
  assert.equal(overlay.nodeAnnotations.c, "Estremo di una relazione da aggiungere");

  const scene = buildGraph2DScene(nodes, [...links, ...overlay.hypotheticalLinks], {
    mode: "witness",
    graphDirection: "undirected",
    highlightedNodeIds: overlay.nodeIds,
    highlightedEdgeIds: overlay.edgeIds,
    nodeAnnotations: overlay.nodeAnnotations,
    edgeAnnotations: overlay.edgeAnnotations
  });
  assert.deepEqual(scene.nodes.map(({ id }) => id), ["a", "b", "c"]);
  assert.deepEqual(scene.links.map(({ id }) => id), [
    "removed-through-analysis-id",
    "hypothetical:community-topology:add-bc"
  ]);
  assert.equal(scene.links[0].annotation?.label, "Arco da rimuovere nell'ipotesi");
  assert.equal(scene.links[1].annotation?.description, "Costo candidato 3");
  const svg = buildGraph2DSvg(scene, {
    showLegend: true,
    showAnnotations: true,
    resultLabel: overlay.resultLabel,
    completionLabel: overlay.completionLabel
  });
  assert.match(svg, /Scenario di modularit\u00e0 \u00b7 sempre insieme \u00b7 2 modifiche/);
  assert.match(svg, /Costo minimo verificato \u00b7 4 ipotesi esaminate/);
  assert.match(svg, /removed-through-analysis-id/);
  assert.match(svg, /hypothetical:community-topology:add-bc/);
  assert.match(svg, /Arco da rimuovere nell&apos;ipotesi/);
});
