import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph2DDominatingSetCoverageOverlay } from "../src/lib/kliqueasp/graph/graph2DDominatingSet.ts";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildGraph2DStructuralResultLabel } from "../src/lib/kliqueasp/graph/graph2DStructuralSummary.ts";

test("il testimone dominante include i record sorgente che certificano la copertura", () => {
  const overlay = buildGraph2DDominatingSetCoverageOverlay(
    ["c"],
    [
      {
        targetNodeId: "a",
        coveringNodeId: "c",
        supportingRecords: [
          { edgeIdentity: "source:ac", edgeId: "ac", edgeIdGenerated: false },
          { edgeIdentity: "source:ac-reverse", edgeId: "ac-reverse", edgeIdGenerated: false }
        ]
      },
      {
        targetNodeId: "b",
        coveringNodeId: "c",
        supportingRecords: [{ edgeIdentity: "source:bc", edgeId: "bc", edgeIdGenerated: false }]
      },
      {
        targetNodeId: "c",
        coveringNodeId: "c",
        supportingRecords: []
      },
      {
        targetNodeId: "outside",
        coveringNodeId: "not-selected",
        supportingRecords: [{ edgeIdentity: "source:ignored", edgeId: "ignored", edgeIdGenerated: false }]
      }
    ],
    { a: "Alice Rossi", b: "Bruno Verdi", c: "Carla Bianchi" }
  );

  assert.deepEqual(overlay.edgeIds, ["source:ac", "source:ac-reverse", "source:bc"]);
  assert.deepEqual(Object.keys(overlay.edgeAnnotations), overlay.edgeIds);
  assert.equal(overlay.edgeAnnotations["source:ac"].label, "Copertura");
  assert.match(overlay.edgeAnnotations["source:ac"].description, /Alice Rossi è coperto da Carla Bianchi/);
  assert.equal(overlay.edgeAnnotations["source:ac"].color, "#d97706");
});

test("l'export isolato del set dominante mantiene nodi obiettivo e archi di supporto osservati", () => {
  const nodes = [
    { id: "a", label: "Alice Rossi" },
    { id: "b", label: "Bruno Verdi" },
    { id: "c", label: "Carla Bianchi" }
  ];
  const links = [
    { source: "a", target: "c", sourceId: "ac", analysis: { id: "ac" } },
    { source: "b", target: "c", sourceId: "bc", analysis: { id: "bc" } },
    { source: "a", target: "b", sourceId: "ab", analysis: { id: "ab" } }
  ];
  const coverage = buildGraph2DDominatingSetCoverageOverlay(
    ["c"],
    [
      { targetNodeId: "a", coveringNodeId: "c", supportingRecords: [{ edgeIdentity: "source:ac", edgeId: "ac", edgeIdGenerated: false }] },
      { targetNodeId: "b", coveringNodeId: "c", supportingRecords: [{ edgeIdentity: "source:bc", edgeId: "bc", edgeIdGenerated: false }] },
      { targetNodeId: "c", coveringNodeId: "c", supportingRecords: [] }
    ],
    { a: "Alice Rossi", b: "Bruno Verdi", c: "Carla Bianchi" }
  );
  const scene = buildGraph2DScene(nodes, links, {
    mode: "witness",
    highlightedNodeIds: ["c"],
    highlightedEdgeIds: coverage.edgeIds,
    edgeAnnotations: coverage.edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    title: "Testimone dell'insieme dominante",
    resultLabel: "Insieme dominante · 1 nodo selezionato · 2 archi di supporto",
    showLabels: true,
    showLegend: true
  });

  assert.equal(scene.nodes.length, 3);
  assert.equal(scene.links.length, 2);
  assert.deepEqual(scene.nodes.map((node) => node.id).sort(), ["a", "b", "c"]);
  assert.deepEqual(scene.links.map((link) => link.id).sort(), ["ac", "bc"]);
  assert.equal(scene.nodes.find((node) => node.id === "c").selected, true);
  assert.ok(scene.links.every((link) => link.selected && link.annotation?.label === "Copertura"));
  assert.match(svg, /Alice Rossi è coperto da Carla Bianchi/);
  assert.match(svg, /Insieme dominante · 1 nodo selezionato · 2 archi di supporto/);
});

test("il riepilogo mantiene la cardinalità del set separata dagli archi di supporto", () => {
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "dominatingSet",
    highlightedNodeCount: 1,
    highlightedEdgeCount: 2,
    targetGroup: "studenti"
  }), "Insieme dominante · 1 nodo selezionato · 2 archi di supporto · obiettivo studenti");
});
