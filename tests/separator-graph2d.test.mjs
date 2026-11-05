import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildSeparatorGraph2DOverlay } from "../src/lib/kliqueasp/graph/separatorGraph2D.ts";
import {
  buildMinimumEdgeSeparatorFacts,
  buildMinimumEdgeSeparatorProgram,
  buildMinimumCostEdgeSeparatorProgram,
  buildMinimumCostNodeSeparatorProgram,
  buildMinimumNodeSeparatorProgram,
  getStructuralSolverOptions,
  parseWitnessRemovedEdgeSetExplanations,
  parseWitnessRemovedNodeSetExplanations,
  getStructuralEdgeIdentity
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label" },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      direction: "undirected",
      identity: "multigraph"
    }
  }
};

test("separator ASP witnesses preserve removed node, edge identity and reachable side in the 2D SVG", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", label: "Sorgente" },
      { id: "u", label: "Intermedio" },
      { id: "a", label: "Separatore" },
      { id: "t", label: "Destinazione" },
      { id: "x", label: "Estraneo" }
    ],
    edges: [
      { id: "e-sa", from: "s", to: "a", type: "collaborazione" },
      { id: "e-su", from: "s", to: "u", type: "collaborazione" },
      { id: "e-ua", from: "u", to: "a", type: "collaborazione" },
      { id: "e-at", from: "a", to: "t", type: "collaborazione" }
    ]
  }, graphConfig);
  const asp = buildAspFactsFromGraph(graph);
  const runner = await createClingoWasmRunner();
  const sourceIndex = asp.indexByNodeId.get("s");
  const targetIndex = asp.indexByNodeId.get("t");

  const nodeResult = await runner.run([
    asp.facts.trim(),
    buildMinimumNodeSeparatorProgram(sourceIndex, targetIndex)
  ].filter(Boolean).join("\n\n"), getStructuralSolverOptions("minimumNodeSeparator", true));
  assert.equal(nodeResult.Result, "OPTIMUM FOUND", nodeResult.Error ?? JSON.stringify(nodeResult));
  const nodeWitness = parseWitnessRemovedNodeSetExplanations(
    nodeResult.Call?.[0]?.Witnesses,
    asp.reverseIndex
  ).find((explanation) => explanation.removedIds.includes("a"));
  assert.deepEqual(nodeWitness, { removedIds: ["a"], reachableNodeIds: ["s", "u"] });

  const nodeOverlay = buildSeparatorGraph2DOverlay({ kind: "removed-nodes", ids: nodeWitness.removedIds });
  const nodeScene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: nodeWitness.removedIds,
    nodeAnnotations: nodeOverlay.nodeAnnotations
  });
  const nodeSvg = buildGraph2DSvg(nodeScene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: nodeOverlay.resultLabel,
    completionLabel: "Cardinalità minima provata"
  });
  assert.deepEqual(nodeScene.nodes.map((node) => node.id), ["a"]);
  assert.equal(nodeScene.nodes[0].annotation, "Nodo rimosso · separatore");
  assert.match(nodeSvg, /Separatore di nodi/);
  assert.match(nodeSvg, /Nodo rimosso · separatore/);
  assert.doesNotMatch(nodeSvg, /Estraneo/);

  const edgeFacts = buildMinimumEdgeSeparatorFacts(graph.links, asp.indexByNodeId);
  const edgeResult = await runner.run([
    asp.facts.trim(),
    edgeFacts.facts.trim(),
    buildMinimumEdgeSeparatorProgram(sourceIndex, targetIndex, graph.direction)
  ].filter(Boolean).join("\n\n"), getStructuralSolverOptions("minimumEdgeSeparator", true));
  assert.equal(edgeResult.Result, "OPTIMUM FOUND", edgeResult.Error ?? JSON.stringify(edgeResult));
  const edgeWitness = parseWitnessRemovedEdgeSetExplanations(
    edgeResult.Call?.[0]?.Witnesses,
    edgeFacts.reverseEdgeIndex,
    asp.reverseIndex
  ).find((explanation) => explanation.removedIds.includes("source:e-at"));
  assert.deepEqual(edgeWitness, { removedIds: ["source:e-at"], reachableNodeIds: ["a", "s", "u"] });

  const edgeOverlay = buildSeparatorGraph2DOverlay({ kind: "removed-edges", ids: edgeWitness.removedIds });
  const edgeScene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedEdgeIds: edgeWitness.removedIds,
    edgeAnnotations: edgeOverlay.edgeAnnotations
  });
  const edgeSvg = buildGraph2DSvg(edgeScene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: edgeOverlay.resultLabel,
    completionLabel: "Cardinalità minima provata"
  });
  assert.deepEqual(edgeScene.links.map((link) => link.id), ["e-at"]);
  assert.equal(getStructuralEdgeIdentity(graph.links.find((link) => link.sourceId === "e-at")), edgeWitness.removedIds[0]);
  assert.deepEqual(edgeScene.nodes.map((node) => node.id), ["a", "t"]);
  assert.equal(edgeScene.links[0].annotation?.label, "Arco rimosso · taglio");
  assert.equal(edgeScene.links[0].annotation?.dashPattern, "dotted");
  assert.match(edgeSvg, /Taglio di archi/);
  assert.match(edgeSvg, /Arco rimosso · taglio · Record rimosso per separare i terminali · collaborazione · e-at/);
  assert.doesNotMatch(edgeSvg, /Estraneo/);

  const sideOverlay = buildSeparatorGraph2DOverlay({ kind: "reachable-side", ids: edgeWitness.reachableNodeIds });
  const sideScene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: edgeWitness.reachableNodeIds,
    nodeAnnotations: sideOverlay.nodeAnnotations
  });
  const sideSvg = buildGraph2DSvg(sideScene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: sideOverlay.resultLabel,
    completionLabel: "Lato sorgente dopo il taglio minimo"
  });
  assert.deepEqual(sideScene.nodes.map((node) => node.id), ["a", "s", "u"]);
  assert.equal(sideScene.links.length, 3);
  assert.ok(sideScene.links.every((link) => link.contextOnly && !link.selected),
    "gli archi indotti sul lato raggiungibile sono contesto, non evidenza del witness");
  assert.match(sideSvg, /Lato sorgente raggiungibile dopo la rimozione/);
  assert.match(sideSvg, /non fanno parte dell&apos;evidenza restituita dall&apos;analisi/);
  assert.match(sideSvg, /Contesto osservato/);
  assert.match(sideSvg, /Lato raggiungibile dal terminale iniziale/);
  assert.doesNotMatch(sideSvg, /Destinazione/);

  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(graphApp, /kind: "removed-nodes",[\s\S]*?removalCost: structuralStats\?\.minimumNodeRemovalCost/);
  assert.match(graphApp, /kind: "removed-edges",[\s\S]*?removalCost: structuralStats\?\.minimumCutCost/);
  assert.match(graphApp, /kind: "reachable-side",[\s\S]*?removalCost: structuralStats\?\.minimumNodeRemovalCost/);
});

test("i separatori pesati mantengono il costo minimo nella preview SVG del witness selezionato", async () => {
  const weightedConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", removalCostField: "$.cost" },
      edge: {
        idField: "$.id",
        sourceField: "$.from",
        targetField: "$.to",
        removalCostField: "$.cost",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  };
  const runner = await createClingoWasmRunner();
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", cost: 100 },
      { id: "a", cost: 1 },
      { id: "b", cost: 1 },
      { id: "x", cost: 9 },
      { id: "t", cost: 100 }
    ],
    edges: [
      { id: "sa", from: "s", to: "a", cost: 1 },
      { id: "ax", from: "a", to: "x", cost: 1 },
      { id: "sb", from: "s", to: "b", cost: 1 },
      { id: "bx", from: "b", to: "x", cost: 1 },
      { id: "xt", from: "x", to: "t", cost: 9 }
    ]
  }, weightedConfig);
  const asp = buildAspFactsFromGraph(graph);
  const start = asp.indexByNodeId.get("s");
  const goal = asp.indexByNodeId.get("t");

  const nodeResult = await runner.run(
    `${asp.facts.trim()}\n\n${buildMinimumCostNodeSeparatorProgram(start, goal)}`,
    getStructuralSolverOptions("minimumCostNodeSeparator", true)
  );
  assert.equal(nodeResult.Result, "OPTIMUM FOUND", nodeResult.Error ?? JSON.stringify(nodeResult));
  const nodeWitness = parseWitnessRemovedNodeSetExplanations(nodeResult.Call?.[0]?.Witnesses, asp.reverseIndex)
    .find(({ removedIds }) => removedIds.length === 2);
  assert.deepEqual(nodeWitness?.removedIds, ["a", "b"]);
  const nodeCost = nodeWitness.removedIds.reduce((sum, id) =>
    sum + Number(graph.nodes.find((node) => node.id === id)?.analysis?.removalCost ?? 0), 0);
  const nodeOverlay = buildSeparatorGraph2DOverlay({
    kind: "removed-nodes",
    ids: nodeWitness.removedIds,
    removalCost: nodeCost
  });
  const nodeSvg = buildGraph2DSvg(buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: nodeWitness.removedIds,
    nodeAnnotations: nodeOverlay.nodeAnnotations
  }), { showAnnotations: true, resultLabel: nodeOverlay.resultLabel, completionLabel: "Ottimo di costo provato" });
  assert.match(nodeSvg, /Separatore di nodi.*costo minimo 2/);
  assert.match(nodeSvg, /Ottimo di costo provato/);

  const edgeGraph = normalizeGraphData({
    nodes: [{ id: "s" }, { id: "a" }, { id: "b" }, { id: "x" }, { id: "t" }],
    edges: [
      { id: "sa", from: "s", to: "a", cost: 1 },
      { id: "ax", from: "a", to: "x", cost: 1 },
      { id: "sb", from: "s", to: "b", cost: 1 },
      { id: "bx", from: "b", to: "x", cost: 1 },
      { id: "xt", from: "x", to: "t", cost: 9 }
    ]
  }, weightedConfig);
  const edgeAsp = buildAspFactsFromGraph(edgeGraph);
  const edgeFacts = buildMinimumEdgeSeparatorFacts(edgeGraph.links, edgeAsp.indexByNodeId);
  const edgeStart = edgeAsp.indexByNodeId.get("s");
  const edgeGoal = edgeAsp.indexByNodeId.get("t");
  const edgeResult = await runner.run([
    edgeAsp.facts.trim(),
    edgeFacts.facts.trim(),
    buildMinimumCostEdgeSeparatorProgram(edgeStart, edgeGoal, edgeGraph.direction)
  ].filter(Boolean).join("\n\n"), getStructuralSolverOptions("minimumCostEdgeSeparator", true));
  assert.equal(edgeResult.Result, "OPTIMUM FOUND", edgeResult.Error ?? JSON.stringify(edgeResult));
  const edgeWitness = parseWitnessRemovedEdgeSetExplanations(
    edgeResult.Call?.[0]?.Witnesses,
    edgeFacts.reverseEdgeIndex,
    edgeAsp.reverseIndex
  ).find(({ removedIds }) => removedIds.length === 2);
  assert.equal(edgeWitness?.removedIds.length, 2);
  const edgeCost = edgeWitness.removedIds.reduce((sum, id) => sum + edgeFacts.removalCostByEdgeId[id], 0);
  assert.equal(edgeCost, 2, "la soluzione pesata preferisce due archi economici al taglio singolo da costo 9");
  const edgeOverlay = buildSeparatorGraph2DOverlay({
    kind: "removed-edges",
    ids: edgeWitness.removedIds,
    removalCost: edgeCost
  });
  const edgeSvg = buildGraph2DSvg(buildGraph2DScene(edgeGraph.nodes, edgeGraph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedEdgeIds: edgeWitness.removedIds,
    edgeAnnotations: edgeOverlay.edgeAnnotations
  }), { showAnnotations: true, resultLabel: edgeOverlay.resultLabel, completionLabel: "Ottimo di costo provato" });
  assert.match(edgeSvg, /Taglio di archi.*costo minimo 2/);
  assert.doesNotMatch(edgeSvg, /Taglio minimo di archi Â· 1 arco rimosso/);
});
