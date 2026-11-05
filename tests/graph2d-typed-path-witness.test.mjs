import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGraph2DPathAnnotations,
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMinimumEdgeSeparatorFacts,
  buildTypedPathProgram,
  getStructuralSolverOptions,
  parseWitnessTypedPath
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("un cammino tipizzato osservato conserva sequenza, direzione e record sorgente nell'SVG", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "directed",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "start", label: "Start" },
      { id: "middle", label: "Middle" },
      { id: "goal", label: "Goal" },
      { id: "outside", label: "Outside" }
    ],
    edges: [
      { id: "collab-1", source: "start", target: "middle", type: "collaboration" },
      { id: "collab-2", source: "start", target: "middle", type: "collaboration" },
      { id: "reverse-decoy", source: "middle", target: "start", type: "collaboration" },
      { id: "mentor-1", source: "middle", target: "goal", type: "mentorship" },
      { id: "unrelated", source: "outside", target: "goal", type: "mentorship" }
    ]
  }, config);
  const asp = buildAspFactsFromGraph(graph);
  const edgeIdentityFacts = buildMinimumEdgeSeparatorFacts(graph.links, asp.indexByNodeId);
  const result = await (await createClingoWasmRunner()).run([
    asp.facts.trim(),
    buildTypedPathProgram({
      startNode: asp.indexByNodeId.get("start"),
      goalNode: asp.indexByNodeId.get("goal"),
      edgeTypeSequence: ["collaboration", "mentorship"],
      direction: "directed"
    })
  ].filter(Boolean).join("\n\n"), getStructuralSolverOptions("typedPath"), 1);

  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  const witness = parseWitnessTypedPath(
    result.Call?.[0]?.Witnesses,
    asp.reverseIndex,
    edgeIdentityFacts.reverseEdgeIndex,
    2
  );
  assert.deepEqual(witness, {
    nodeIds: ["start", "middle", "goal"],
    edgeIdsByStep: [["source:collab-1", "source:collab-2"], ["source:mentor-1"]]
  });

  const annotations = buildGraph2DPathAnnotations(witness.nodeIds, witness.edgeIdsByStep);
  const selectedEdgeIds = witness.edgeIdsByStep.flat();
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: selectedEdgeIds,
    nodeAnnotations: annotations.nodeAnnotations,
    edgeAnnotations: annotations.edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: "Cammino tipizzato",
    completionLabel: "Testimone trovato"
  });

  assert.deepEqual(scene.nodes.map((node) => node.id), ["goal", "middle", "start"]);
  assert.deepEqual(new Set(scene.links.map((link) => link.id)), new Set(["collab-1", "collab-2", "mentor-1"]));
  assert.equal(scene.links.length, 3);
  assert.ok(scene.links.every((link) => link.directed && link.selected));
  assert.match(svg, /Start \u00b7 passo 1 del cammino/);
  assert.match(svg, /Middle \u00b7 passo 2 del cammino/);
  assert.match(svg, /Goal \u00b7 passo 3 del cammino/);
  assert.match(svg, /collab-1/);
  assert.match(svg, /collab-2/);
  assert.match(svg, /mentor-1/);
  assert.doesNotMatch(svg, /Outside|reverse-decoy|unrelated/);
});
