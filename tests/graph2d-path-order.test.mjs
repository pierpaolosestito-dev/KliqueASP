import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildGraph2DPathAnnotations,
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMinimumHopPathProgram,
  buildPathEdgeFacts,
  getStructuralSolverOptions,
  parseWitnessMinimumHopPathWitness
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const directedConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id" },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      direction: "directed",
      identity: "multigraph"
    }
  }
};

let runnerPromise;
function getRunner() {
  runnerPromise ??= createClingoWasmRunner();
  return runnerPromise;
}

test("an ASP path witness keeps node order and supporting edge steps in the 2D SVG", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", label: "Start" },
      { id: "a", label: "Middle" },
      { id: "g", label: "Goal" }
    ],
    edges: [
      { id: "edge-s-a", source: "s", target: "a", type: "collaboration" },
      { id: "edge-a-g", source: "a", target: "g", type: "mentoring" }
    ]
  }, directedConfig);
  const asp = buildAspFactsFromGraph(graph);
  const edgeFacts = buildPathEdgeFacts(graph.links, asp.indexByNodeId);
  const result = await (await getRunner()).run([
    asp.facts.trim(),
    edgeFacts.facts.trim(),
    buildMinimumHopPathProgram(
      asp.indexByNodeId.get("s"),
      asp.indexByNodeId.get("g"),
      2,
      "",
      "directed",
      true
    )
  ].filter(Boolean).join("\n\n"), getStructuralSolverOptions("path"), 1);

  assert.equal(result.Result, "SATISFIABLE");
  const witness = parseWitnessMinimumHopPathWitness(
    result.Call?.[0]?.Witnesses,
    asp.reverseIndex,
    edgeFacts.reverseEdgeIndex,
    true
  );
  assert.deepEqual(witness?.nodeIds, ["s", "a", "g"]);
  assert.deepEqual(witness?.edgeIdsByStep, [["source:edge-s-a"], ["source:edge-a-g"]]);

  const annotations = buildGraph2DPathAnnotations(witness.nodeIds, witness.edgeIdsByStep);
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: "directed",
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: witness.edgeIdsByStep.flat(),
    nodeAnnotations: annotations.nodeAnnotations,
    edgeAnnotations: annotations.edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: "Cammino minimo",
    completionLabel: "Cammino minimo provato"
  });

  assert.deepEqual(scene.nodes.map((node) => node.annotation), [
    "passo 2 del cammino",
    "passo 3 del cammino",
    "passo 1 del cammino"
  ]);
  assert.equal(scene.links.length, 2);
  assert.ok(scene.links.every((link) => link.directed && link.selected));
  assert.equal(new Set(scene.links.map((link) => link.annotation?.label)).size, 1,
    "il percorso condivide una sola voce di legenda per gli archi");
  assert.match(svg, /Start \u00b7 passo 1 del cammino/);
  assert.match(svg, /Middle \u00b7 passo 2 del cammino/);
  assert.match(svg, /Goal \u00b7 passo 3 del cammino/);
  assert.match(svg, /Arco del cammino \u00b7 passo 1 del cammino \u00b7 collaboration \u00b7 edge-s-a/);
  assert.match(svg, /Arco del cammino \u00b7 passo 2 del cammino \u00b7 mentoring \u00b7 edge-a-g/);
  assert.match(svg, /marker-end="url\(#graph-arrow\)"/);
});

test("repeated nodes or edge records in a temporal walk retain every step without duplicating legend entries", () => {
  const annotations = buildGraph2DPathAnnotations(
    ["s", "a", "s"],
    [["source:edge-1"], ["source:edge-2"], ["source:edge-1"]]
  );

  assert.deepEqual(annotations.nodeAnnotations, {
    s: "passi 1, 3 del cammino",
    a: "passo 2 del cammino"
  });
  assert.deepEqual(annotations.edgeAnnotations, {
    "source:edge-1": {
      label: "Arco del cammino",
      description: "passi 1, 3 del cammino",
      color: "#2563eb"
    },
    "source:edge-2": {
      label: "Arco del cammino",
      description: "passo 2 del cammino",
      color: "#2563eb"
    }
  });
});

test("ordinary path results and temporal why-not witnesses provide ordered edge records to the graph view", async () => {
  const [graphApp, structuralPanel] = await Promise.all([
    readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8")
  ]);

  assert.match(graphApp, /buildGraph2DPathAnnotations\(path\.nodeIds, path\.edgeIdsByStep \?\? \[\]\)/);
  assert.match(structuralPanel, /edgeIdsByStep:\s*typedPathNoRouteCertificate\.walk\.edgeIdsByStep/);
  assert.match(structuralPanel, /edgeIdsByStep:\s*pathEdgeIdsByStep/);
});
