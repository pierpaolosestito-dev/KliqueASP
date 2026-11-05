import assert from "node:assert/strict";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildGraph2DHypotheticalEdgeAnnotations,
  buildGraph2DHypotheticalLinks,
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { mapSourceEdgeIdsToStructuralIdentities } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import {
  buildTypedPathCompletionCounterfactualProgram,
  getStructuralCounterfactualSolverOptions,
  parseTypedPathCompletionCounterfactuals
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("un controfattuale ASP di cammino tipizzato esporta archi osservati e proposti distinti", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
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
    nodes: [{ id: "start" }, { id: "middle" }, { id: "goal" }],
    edges: [{ id: "observed-affiliation", source: "start", target: "middle", type: "affiliation" }]
  }, config);
  const asp = buildAspFactsFromGraph(graph);
  const options = {
    startNode: asp.indexByNodeId.get("start"),
    goalNode: asp.indexByNodeId.get("goal"),
    edgeTypeSequence: ["affiliation", "publication"],
    direction: "directed"
  };
  const candidates = [{
    id: "candidate-publication",
    sourceNodeId: "middle",
    targetNodeId: "goal",
    sourceNode: asp.indexByNodeId.get("middle"),
    targetNode: asp.indexByNodeId.get("goal"),
    edgeType: "publication",
    cost: 4,
    recordIndex: 2
  }];
  const compiled = buildTypedPathCompletionCounterfactualProgram(options, candidates);
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts.trim()}\n\n${compiled.program}`,
    getStructuralCounterfactualSolverOptions(),
    1
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));

  const observedEdges = graph.links.map((link, index) => ({
    recordIndex: index + 1,
    sourceNode: asp.indexByNodeId.get(String(link.source)),
    targetNode: asp.indexByNodeId.get(String(link.target)),
    edgeType: String(link.analysis.type)
  }));
  const proposals = parseTypedPathCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    options,
    compiled.candidates,
    observedEdges,
    asp.reverseIndex,
    asp.reverseEdgeIndex
  );
  assert.equal(proposals.length, 1);
  const proposal = proposals[0];
  assert.deepEqual(proposal.path.nodeIds, ["start", "middle", "goal"]);
  assert.deepEqual(proposal.path.edgeIdsByStep, [["observed-affiliation"], ["candidate:candidate-publication"]]);
  assert.equal(proposal.addedEdges[0].cost, 4);

  const hypotheticalLinks = buildGraph2DHypotheticalLinks("typed-path", proposal.addedEdges, graph.direction);
  const edgeAnnotations = buildGraph2DHypotheticalEdgeAnnotations("typed-path", proposal.addedEdges);
  const observedPathEdgeIdentities = mapSourceEdgeIdsToStructuralIdentities(
    proposal.path.edgeIdsByStep.flat(),
    graph.links
  );
  edgeAnnotations["source:observed-affiliation"] = {
    label: "Arco osservato del cammino",
    description: "Passo 1",
    color: "#2563eb"
  };
  const scene = buildGraph2DScene(graph.nodes, [...graph.links, ...hypotheticalLinks], {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: proposal.path.nodeIds,
    highlightedEdgeIds: observedPathEdgeIdentities,
    nodeAnnotations: Object.fromEntries(proposal.path.nodeIds.map((id, index) => [id, `Passo ${index + 1} del cammino`])),
    edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showLegend: true,
    showAnnotations: true,
    resultLabel: `Cammino tipizzato controfattuale · costo minimo ${proposal.totalCost}`,
    completionLabel: "Costo minimo provato · una proposta tra eventuali pari merito"
  });

  assert.deepEqual(scene.nodes.map(({ id }) => id), ["goal", "middle", "start"]);
  assert.deepEqual(scene.links.map(({ id }) => id), ["observed-affiliation", "hypothetical:typed-path:candidate-publication"]);
  assert.equal(scene.links[0].directed, true);
  assert.equal(scene.links[0].hypothetical, false);
  assert.equal(scene.links[0].annotation?.label, "Arco osservato del cammino");
  assert.equal(scene.links[1].directed, true);
  assert.equal(scene.links[1].hypothetical, true);
  assert.equal(scene.links[1].annotation?.label, "Costo candidato");
  assert.equal(scene.links[1].annotation?.description, "Costo candidato 4");
  assert.match(svg, /Costo minimo provato/);
  assert.match(svg, /observed-affiliation/);
  assert.match(svg, /hypothetical:typed-path:candidate-publication/);
  assert.match(svg, /Passo 1 del cammino/);
  assert.match(svg, /Costo candidato 4/);
  assert.match(svg, /1 arco ipotetico tratteggiato; non appartiene al grafo osservato/);
});

test("il pannello usa le identità dei record osservati per l'evidenza del cammino controfattuale", async () => {
  const graphApp = await (await import("node:fs/promises")).readFile(
    new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url),
    "utf8"
  );
  const start = graphApp.indexOf("function highlightStructuralCounterfactual(");
  const end = graphApp.indexOf("\n  function highlightCommunityTopologyCounterfactual(", start);
  assert.ok(start >= 0 && end > start, "gestore del cammino controfattuale non trovato");
  const handler = graphApp.slice(start, end);
  assert.match(handler, /buildGraph2DCounterfactualEvidenceEdgeIdentities\(/);
  assert.match(handler, /request\.proposal\?\.path \? pathEdgeIds : undefined/);
  assert.match(handler, /highlightedEdgeIds = observedEvidenceEdgeIdentities/);
});
