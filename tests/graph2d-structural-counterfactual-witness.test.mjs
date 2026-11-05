import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildGraph2DCounterfactualEvidenceEdgeIdentities,
  buildGraph2DHypotheticalEdgeAnnotations,
  buildGraph2DHypotheticalLinks,
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import {
  buildKCoreCompletionCounterfactualProgram,
  buildKPlexCompletionCounterfactualProgram,
  getStructuralCounterfactualSolverOptions,
  parseKCoreCompletionCounterfactuals,
  parseKPlexCompletionCounterfactuals
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("il completamento k-plex esporta tutto il gruppo fissato, gli archi osservati e le aggiunte", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "outside" }],
    edges: [
      { id: "observed-ab", source: "a", target: "b", type: "relation" },
      { id: "outside-edge", source: "a", target: "outside", type: "relation" }
    ]
  }, config);
  const asp = buildAspFactsFromGraph(graph);
  const candidates = [
    {
      id: "candidate-ac",
      sourceNodeId: "a",
      targetNodeId: "c",
      sourceNode: asp.indexByNodeId.get("a"),
      targetNode: asp.indexByNodeId.get("c"),
      edgeType: "relation",
      cost: 2,
      recordIndex: 3
    },
    {
      id: "candidate-bc",
      sourceNodeId: "b",
      targetNodeId: "c",
      sourceNode: asp.indexByNodeId.get("b"),
      targetNode: asp.indexByNodeId.get("c"),
      edgeType: "relation",
      cost: 3,
      recordIndex: 4
    }
  ];
  const cohortNodeIds = ["a", "b", "c"];
  const compiled = buildKPlexCompletionCounterfactualProgram(
    1,
    cohortNodeIds.map((id) => asp.indexByNodeId.get(id)),
    candidates
  );
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts.trim()}\n\n${compiled.program}`,
    getStructuralCounterfactualSolverOptions(),
    1
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const proposals = parseKPlexCompletionCounterfactuals(result.Call?.[0]?.Witnesses, compiled.candidates);
  assert.equal(proposals.length, 1);
  const proposal = proposals[0];
  assert.deepEqual(proposal.addedEdges.map(({ id }) => id), ["candidate-ac", "candidate-bc"]);

  const edgeIdentities = buildGraph2DCounterfactualEvidenceEdgeIdentities(graph.links, cohortNodeIds);
  const hypotheticalLinks = buildGraph2DHypotheticalLinks("structural-completion", proposal.addedEdges, graph.direction);
  const edgeAnnotations = buildGraph2DHypotheticalEdgeAnnotations("structural-completion", proposal.addedEdges);
  for (const identity of edgeIdentities) {
    edgeAnnotations[identity] = { label: "Arco osservato nel gruppo", color: "#2563eb" };
  }
  const scene = buildGraph2DScene(graph.nodes, [...graph.links, ...hypotheticalLinks], {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: cohortNodeIds,
    highlightedEdgeIds: edgeIdentities,
    edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showLegend: true,
    showAnnotations: true,
    resultLabel: `Completamento k-plex · costo minimo ${proposal.totalCost}`,
    completionLabel: "Costo minimo provato · una proposta tra eventuali pari merito"
  });

  assert.deepEqual(scene.nodes.map(({ id }) => id), cohortNodeIds);
  assert.deepEqual(scene.links.map(({ id }) => id), [
    "observed-ab",
    "hypothetical:structural-completion:candidate-ac",
    "hypothetical:structural-completion:candidate-bc"
  ]);
  assert.equal(scene.links[0].annotation?.label, "Arco osservato nel gruppo");
  assert.ok(scene.links.slice(1).every(({ hypothetical, directed }) => hypothetical && !directed));
  assert.match(svg, /observed-ab/);
  assert.match(svg, /hypothetical:structural-completion:candidate-ac/);
  assert.match(svg, /hypothetical:structural-completion:candidate-bc/);
  assert.doesNotMatch(svg, /outside-edge/, "un arco che esce dal gruppo fissato non deve entrare nel witness");
  assert.match(svg, /Costo candidato 2/);
  assert.match(svg, /Costo candidato 3/);
  assert.match(svg, /3 nodi · 1 arco osservato · 2 archi proposti/);
});

test("un cammino controfattuale limita le relazioni osservate ai soli archi del percorso", () => {
  const links = [
    { source: "a", target: "b", sourceId: "path-edge" },
    { source: "b", target: "c", sourceId: "context-edge" }
  ];

  assert.deepEqual(
    [...buildGraph2DCounterfactualEvidenceEdgeIdentities(links, ["a", "b", "c"], ["path-edge"])],
    ["source:path-edge"]
  );
  assert.deepEqual(
    [...buildGraph2DCounterfactualEvidenceEdgeIdentities(links, ["a", "b", "c"])],
    ["source:path-edge", "source:context-edge"]
  );
});

test("il completamento k-core esporta il gruppo fisso con il supporto interno osservato", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "outside" }],
    edges: [
      { id: "observed-ab", source: "a", target: "b", type: "relation" },
      { id: "outside-edge", source: "a", target: "outside", type: "relation" }
    ]
  }, config);
  const asp = buildAspFactsFromGraph(graph);
  const cohortNodeIds = ["a", "b", "c"];
  const candidates = [
    {
      id: "candidate-ac",
      sourceNodeId: "a",
      targetNodeId: "c",
      sourceNode: asp.indexByNodeId.get("a"),
      targetNode: asp.indexByNodeId.get("c"),
      edgeType: "relation",
      cost: 2,
      recordIndex: 3
    },
    {
      id: "candidate-bc",
      sourceNodeId: "b",
      targetNodeId: "c",
      sourceNode: asp.indexByNodeId.get("b"),
      targetNode: asp.indexByNodeId.get("c"),
      edgeType: "relation",
      cost: 3,
      recordIndex: 4
    }
  ];
  const compiled = buildKCoreCompletionCounterfactualProgram(
    2,
    cohortNodeIds.map((id) => asp.indexByNodeId.get(id)),
    candidates
  );
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts.trim()}\n\n${compiled.program}`,
    getStructuralCounterfactualSolverOptions(),
    1
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const proposals = parseKCoreCompletionCounterfactuals(result.Call?.[0]?.Witnesses, compiled.candidates);
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0].addedEdges.map(({ id }) => id), ["candidate-ac", "candidate-bc"]);

  const evidenceEdges = buildGraph2DCounterfactualEvidenceEdgeIdentities(graph.links, cohortNodeIds);
  const hypotheticalLinks = buildGraph2DHypotheticalLinks("structural-completion", proposals[0].addedEdges, graph.direction);
  const edgeAnnotations = buildGraph2DHypotheticalEdgeAnnotations("structural-completion", proposals[0].addedEdges);
  for (const identity of evidenceEdges) edgeAnnotations[identity] = { label: "Arco osservato nel gruppo" };
  const scene = buildGraph2DScene(graph.nodes, [...graph.links, ...hypotheticalLinks], {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: cohortNodeIds,
    highlightedEdgeIds: evidenceEdges,
    edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, { showLegend: true, showAnnotations: true });

  assert.deepEqual(scene.nodes.map(({ id }) => id), cohortNodeIds);
  assert.deepEqual(scene.links.map(({ id }) => id), [
    "observed-ab",
    "hypothetical:structural-completion:candidate-ac",
    "hypothetical:structural-completion:candidate-bc"
  ]);
  assert.match(svg, /Arco osservato nel gruppo/);
  assert.match(svg, /Costo candidato 2/);
  assert.match(svg, /Costo candidato 3/);
  assert.doesNotMatch(svg, /outside-edge/);
});

test("il pannello conserva il gruppo fissato e il gestore mappa l'evidenza del completamento", async () => {
  const [panel, graphApp] = await Promise.all([
    readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8")
  ]);
  const highlightStart = panel.indexOf("function highlight(proposal:");
  const highlightEnd = panel.indexOf("\n  }", highlightStart);
  const panelHandler = panel.slice(highlightStart, highlightEnd);
  assert.match(panelHandler, /proposal\.coreWitnessNodeIds\?\.length \? proposal\.coreWitnessNodeIds : cohortNodeIds/);

  const graphStart = graphApp.indexOf("function highlightStructuralCounterfactual(");
  const graphEnd = graphApp.indexOf("\n  function highlightCommunityTopologyCounterfactual(", graphStart);
  const graphHandler = graphApp.slice(graphStart, graphEnd);
  assert.match(graphHandler, /buildGraph2DCounterfactualEvidenceEdgeIdentities\(/);
  assert.match(graphHandler, /request\.proposal\?\.path \? pathEdgeIds : undefined/);
  assert.match(graphHandler, /highlightedEdgeIds = observedEvidenceEdgeIdentities/);
});
