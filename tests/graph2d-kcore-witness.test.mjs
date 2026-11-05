import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildGraph2DStructuralCompletionLabel } from "../src/lib/kliqueasp/graph/graph2DAnalysisOutcome.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildGraph2DStructuralResultLabel } from "../src/lib/kliqueasp/graph/graph2DStructuralSummary.ts";
import {
  buildKCoreProgram,
  getStructuralSolverOptions,
  mapKCoreSupportPairsToRecords,
  parseWitnessKCoreExplanations,
  selectMaximumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      direction: "undirected",
      identity: "multigraph"
    }
  }
};

test("a selected ASP k-core exports its supporting source records and excludes external edges", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", label: "Alfa" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
      { id: "outside", label: "Esterno" },
      { id: "isolated", label: "Isolato" }
    ],
    edges: [
      { id: "e-ab-1", from: "a", to: "b", type: "collaborazione" },
      { id: "e-ab-2", from: "a", to: "b", type: "collaborazione" },
      { id: "e-ac", from: "a", to: "c", type: "collaborazione" },
      { id: "e-bc", from: "b", to: "c", type: "collaborazione" },
      { id: "e-a-outside", from: "a", to: "outside", type: "collaborazione" }
    ]
  }, graphConfig);
  const asp = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts.trim()}\n\n${buildKCoreProgram(2)}\n`,
    getStructuralSolverOptions("kCore")
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));

  const explanations = parseWitnessKCoreExplanations(result.Call?.[0]?.Witnesses, asp.reverseIndex);
  const maximumNodeSets = selectMaximumNodeSets(explanations.map((item) => item.nodeIds));
  assert.equal(maximumNodeSets.length, 1);
  const maximumSignature = [...maximumNodeSets[0]].sort().join("\u0000");
  const witness = explanations.find((item) => [...item.nodeIds].sort().join("\u0000") === maximumSignature);
  assert.ok(witness, "the ASP result must include the proven maximum core witness");
  assert.deepEqual([...witness.nodeIds].sort(), ["a", "b", "c"]);
  const supportingRecords = mapKCoreSupportPairsToRecords(witness.supportPairs, graph.links);
  const edgeIdentities = supportingRecords.flatMap((pair) => pair.supportingRecords.map((record) => record.edgeIdentity));
  assert.deepEqual([...edgeIdentities].sort(), ["source:e-ab-1", "source:e-ab-2", "source:e-ac", "source:e-bc"]);

  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: edgeIdentities
  });
  const resultLabel = buildGraph2DStructuralResultLabel({
    task: "kCore",
    parameter: 2,
    highlightedNodeCount: witness.nodeIds.length,
    highlightedEdgeCount: edgeIdentities.length
  });
  const svg = buildGraph2DSvg(scene, {
    showLegend: true,
    showNodeIds: true,
    resultLabel: resultLabel ?? undefined,
    completionLabel: "k-core provato"
  });

  assert.deepEqual(scene.nodes.map((node) => node.id), ["a", "b", "c"]);
  assert.deepEqual(scene.links.map((link) => link.id).sort(), ["e-ab-1", "e-ab-2", "e-ac", "e-bc"]);
  assert.ok(scene.links.every((link) => link.selected));
  assert.match(svg, /k-core · k=2 · 3 nodi evidenziati/);
  for (const id of ["e-ab-1", "e-ab-2", "e-ac", "e-bc"]) assert.ok(svg.includes(id));
  assert.doesNotMatch(svg, /Esterno|e-a-outside|Isolato/);

  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(graphApp, /highlightedEdgeIds = new Set\(witness\.edgeIds\)/);
  assert.match(graphApp, /cliqueNodes = new Set\(witness\.nodeIds\)/);
});

test("an empty but parsed ASP k-core keeps its proven completion label", async () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: []
  }, graphConfig);
  const asp = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts.trim()}\n\n${buildKCoreProgram(1)}\n`,
    getStructuralSolverOptions("kCore")
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));

  const explanations = parseWitnessKCoreExplanations(result.Call?.[0]?.Witnesses, asp.reverseIndex);
  assert.equal(explanations.length, 1, "clingo deve restituire un modello che rappresenta il core vuoto");
  assert.deepEqual(explanations[0].nodeIds, []);
  const results = selectMaximumNodeSets(explanations.map((item) => item.nodeIds));
  assert.deepEqual(results, [[]]);
  assert.equal(buildGraph2DStructuralCompletionLabel({
    task: "kCore",
    resultStatus: result.Result,
    completeModelEnumeration: true,
    hasSolution: results.length > 0,
    enumerateAllOptima: false
  }), "k-core calcolato · risultato unico alla soglia");
});
