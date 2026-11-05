import assert from "node:assert/strict";
import test from "node:test";
import { buildGraph2DDominatingSetCoverageOverlay } from "../src/lib/kliqueasp/graph/graph2DDominatingSet.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildGraph2DStructuralResultLabel } from "../src/lib/kliqueasp/graph/graph2DStructuralSummary.ts";
import {
  buildMinimumDominatingSetProgram,
  getStructuralSolverOptions,
  mapDominatingSetSupportPairsToRecords,
  parseWitnessDominatingSetExplanations
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label", groupFields: ["$.group"] },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      direction: "undirected",
      identity: "multigraph"
    }
  }
};

test("un set dominante ASP ottimo diventa una vista 2D con soli archi sorgente di copertura", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p1", label: "Psicologo 1", group: "candidates" },
      { id: "p2", label: "Psicologo 2", group: "candidates" },
      { id: "t1", label: "Persona 1", group: "targets" },
      { id: "t2", label: "Persona 2", group: "targets" },
      { id: "t3", label: "Persona 3", group: "targets" },
      { id: "outside", label: "Fuori dal risultato" }
    ],
    edges: [
      { id: "e-p1-t1", from: "p1", to: "t1" },
      { id: "e-p1-t2", from: "p1", to: "t2" },
      { id: "e-p1-t2-parallel", from: "p1", to: "t2" },
      { id: "e-p2-t2", from: "p2", to: "t2" },
      { id: "e-p2-t3", from: "p2", to: "t3" },
      { id: "e-outside", from: "p1", to: "outside" }
    ]
  }, graphConfig);
  const asp = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts.trim()}\n\n${buildMinimumDominatingSetProgram("candidates", "targets")}\n`,
    getStructuralSolverOptions("dominatingSet", true)
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));

  const witnesses = parseWitnessDominatingSetExplanations(result.Call?.[0]?.Witnesses, asp.reverseIndex);
  const witness = witnesses.find((item) => item.nodeIds.length === 2);
  assert.ok(witness, "l'ottimo deve selezionare i due candidati che coprono i tre obiettivi");
  assert.deepEqual([...witness.nodeIds].sort(), ["p1", "p2"]);

  const coverage = mapDominatingSetSupportPairsToRecords(witness.coveragePairs, graph.links);
  const overlay = buildGraph2DDominatingSetCoverageOverlay(witness.nodeIds, coverage, {
    p1: "Psicologo 1",
    p2: "Psicologo 2",
    t1: "Persona 1",
    t2: "Persona 2",
    t3: "Persona 3"
  });
  assert.deepEqual(overlay.edgeIds, [
    "source:e-p1-t1",
    "source:e-p1-t2",
    "source:e-p1-t2-parallel",
    "source:e-p2-t2",
    "source:e-p2-t3"
  ]);

  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: overlay.edgeIds,
    edgeAnnotations: overlay.edgeAnnotations
  });
  const label = buildGraph2DStructuralResultLabel({
    task: "dominatingSet",
    highlightedNodeCount: witness.nodeIds.length,
    highlightedEdgeCount: overlay.edgeIds.length,
    targetGroup: "targets"
  });
  const svg = buildGraph2DSvg(scene, {
    title: "Insieme dominante minimo",
    resultLabel: label ?? undefined,
    completionLabel: "Ottimo di cardinalità minima provato",
    showLabels: true,
    showNodeIds: true,
    showLegend: true
  });

  assert.deepEqual(scene.nodes.map((node) => node.id).sort(), ["p1", "p2", "t1", "t2", "t3"]);
  assert.deepEqual(scene.links.map((link) => link.id).sort(), [
    "e-p1-t1",
    "e-p1-t2",
    "e-p1-t2-parallel",
    "e-p2-t2",
    "e-p2-t3"
  ]);
  assert.ok(scene.links.every((link) => link.selected && link.annotation?.label === "Copertura"));
  assert.match(svg, /Persona 1 è coperto da Psicologo 1/);
  assert.match(svg, /e-p1-t2-parallel/);
  assert.match(svg, /Insieme dominante minimo · 2 nodi selezionati · 5 archi di supporto · obiettivo targets/);
  assert.match(svg, /Ottimo di cardinalità minima provato/);
  assert.doesNotMatch(svg, /Fuori dal risultato|e-outside/);
});

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
    resultLabel: "Insieme dominante minimo · 1 nodo selezionato · 2 archi di supporto",
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
  assert.match(svg, /Insieme dominante minimo · 1 nodo selezionato · 2 archi di supporto/);
});

test("il riepilogo mantiene la cardinalità del set separata dagli archi di supporto", () => {
  assert.equal(buildGraph2DStructuralResultLabel({
    task: "dominatingSet",
    highlightedNodeCount: 1,
    highlightedEdgeCount: 2,
    targetGroup: "studenti"
  }), "Insieme dominante minimo · 1 nodo selezionato · 2 archi di supporto · obiettivo studenti");
});
