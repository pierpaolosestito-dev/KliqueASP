import assert from "node:assert/strict";
import test from "node:test";
import { readGraphJsonUpload } from "../src/lib/kliqueasp/graph/graphJsonUpload.ts";
import { collectGraphFieldPaths, updateGraphFieldMapping } from "../src/lib/kliqueasp/graph/graphFieldMapping.ts";
import {
  buildAspFactsFromGraph,
  buildCliqueProgram,
  getCliqueModeOptions,
  normalizeGraphData,
  parseWitnessCliqueResults,
  selectMaximumCliques
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import { hasCompleteOptimalModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("un JSON esterno passa da mapping e clingo a un SVG 2D del risultato", async () => {
  const dataset = {
    nodes: [
      { key: "a", title: "Nodo Alfa", kind: "persona", cohort: "Rete Nord" },
      { key: "b", title: "Nodo Beta", kind: "persona", cohort: "Rete Nord" },
      { key: "c", title: "Nodo Gamma", kind: "persona", cohort: "Rete Nord" },
      { key: "d", title: "Nodo Delta", kind: "persona", cohort: "Rete Sud" }
    ],
    edges: [
      { rid: "legame-ab", from: "a", to: "b", relation: "collaborazione" },
      { rid: "legame-ac", from: "a", to: "c", relation: "collaborazione" },
      { rid: "legame-bc", from: "b", to: "c", relation: "collaborazione" },
      { rid: "legame-cd", from: "c", to: "d", relation: "consulenza" }
    ]
  };
  const uploaded = await readGraphJsonUpload({ text: async () => JSON.stringify(dataset) }, "dataset");
  const nodeFields = collectGraphFieldPaths(uploaded, "nodes");
  const edgeFields = collectGraphFieldPaths(uploaded, "edges");
  assert.ok(nodeFields.includes("$.key") && nodeFields.includes("$.cohort"));
  assert.ok(edgeFields.includes("$.rid") && edgeFields.includes("$.from") && edgeFields.includes("$.to"));

  let config = { schemaVersion: 2 };
  for (const [scope, field, path] of [
    ["node", "idField", "$.key"],
    ["node", "labelField", "$.title"],
    ["node", "typeField", "$.kind"],
    ["node", "groupFields", "$.cohort"],
    ["edge", "idField", "$.rid"],
    ["edge", "sourceField", "$.from"],
    ["edge", "targetField", "$.to"],
    ["edge", "typeField", "$.relation"]
  ]) {
    config = updateGraphFieldMapping(config, uploaded, scope, field, path);
  }
  config = updateGraphFieldMapping(config, uploaded, "edge", "direction", "undirected");
  config = updateGraphFieldMapping(config, uploaded, "edge", "identity", "simple");

  const graph = normalizeGraphData(uploaded, config);
  assert.deepEqual(graph.diagnostics.filter((diagnostic) => diagnostic.severity === "error"), []);
  assert.equal(graph.nodes.length, 4);
  assert.equal(graph.links.length, 4);
  assert.equal(graph.direction, "undirected");
  assert.equal(graph.nodes.find((node) => node.id === "a")?.label, "Nodo Alfa");

  const asp = buildAspFactsFromGraph(graph);
  const program = `${asp.facts}\n${buildCliqueProgram("maximum", "Rete Nord", { enabled: true, includeEdgeRecords: true })}\n`;
  const result = await (await createClingoWasmRunner()).run(program, getCliqueModeOptions("maximum"));
  assert.notEqual(result.Result, "ERROR", result.Error);
  assert.equal(hasCompleteOptimalModelEnumeration(result), true);

  const witnessedCandidates = parseWitnessCliqueResults(
    result.Call?.[0]?.Witnesses,
    asp.reverseIndex,
    asp.reverseSourceIndex,
    asp.reverseEdgeIndex,
    asp.reverseGeneratedEdgeIndex,
    1
  );
  const maximumCliques = selectMaximumCliques(witnessedCandidates.map(({ nodeIds }) => nodeIds));
  assert.equal(maximumCliques.length, 1);
  const witness = witnessedCandidates.find(({ nodeIds }) =>
    nodeIds.length === maximumCliques[0].length && nodeIds.every((id) => maximumCliques[0].includes(id))
  );
  assert.ok(witness);
  assert.deepEqual([...witness.nodeIds].sort(), ["a", "b", "c"]);
  assert.deepEqual(witness.supportingEdges.map((edge) => edge.edgeId).sort(), ["legame-ab", "legame-ac", "legame-bc"]);

  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    highlightedNodeIds: witness.nodeIds,
    seed: 19
  });
  assert.equal(scene.nodes.length, 3);
  assert.equal(scene.links.length, 3);
  assert.ok(scene.nodes.every((node) => node.selected));
  const svg = buildGraph2DSvg(scene, {
    title: "Clique massima",
    scopeLabel: "Solo risultato selezionato",
    resultLabel: "Clique massima · 3 nodi",
    completionLabel: "Ottimo provato · enumerazione completa",
    showLabels: true,
    showNodeIds: true,
    showLegend: true
  });
  assert.match(svg, /Solo risultato selezionato/);
  assert.match(svg, /Clique massima · 3 nodi/);
  assert.match(svg, /Nodo Alfa/);
  assert.match(svg, /legame-ab/);
});
