import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildGraph2DAbsenceLinks,
  buildGraph2DScene,
  buildGraph2DSvg,
  estimateGraph2DSceneSize,
  formatGraph2DSceneCountSummary
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { graphDisplayLinkMatchesIdentities } from "../src/lib/kliqueasp/graph/graphVisualization.ts";
import {
  buildMaximumKPlexProgram,
  buildMaximalKPlexProgram,
  getStructuralSolverOptions,
  getStructuralEdgeIdentity,
  parseWitnessKPlexExplanations,
  parseWitnessMaximalKPlexExplanations
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("an ASP 2-plex witness exports observed edges and absent pairs as different evidence", async () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase() })),
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
      { id: "cd", source: "c", target: "d" },
      { id: "da", source: "d", target: "a" },
      { id: "aa", source: "a", target: "a" }
    ]
  });
  const asp = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(`${asp.facts.trim()}\n\n${buildMaximalKPlexProgram(2)}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));

  const witnesses = parseWitnessMaximalKPlexExplanations(
    result.Call?.[0]?.Witnesses,
    asp.reverseIndex
  );
  const witness = witnesses.find((item) => item.nodeIds.length === 4);
  assert.ok(witness, "ASP must return the full maximal 2-plex on the four-cycle");
  assert.deepEqual(witness.missingTiePairs, [["a", "c"], ["b", "d"]]);

  const observedEdgeIds = graph.links
    .filter((link) => link.source !== link.target && witness.nodeIds.includes(String(link.source)) && witness.nodeIds.includes(String(link.target)))
    .map((link) => getStructuralEdgeIdentity(link));
  const threeDHighlightedLinks = graph.links.filter((link) =>
    graphDisplayLinkMatchesIdentities(link, new Set(observedEdgeIds), getStructuralEdgeIdentity));
  const absentLinks = buildGraph2DAbsenceLinks(witness.missingTiePairs, {
    scope: "k-plex-s2",
    description: "Assente nella proiezione analizzata; ammessa dal 2-plex.",
    reservedSourceIds: graph.links.map((link) => link.sourceId ?? link.analysis?.id).filter(Boolean)
  });
  const inputs = [...graph.links, ...absentLinks];
  const scene = buildGraph2DScene(graph.nodes, inputs, {
    mode: "witness",
    graphDirection: "undirected",
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: observedEdgeIds,
    nodeAnnotations: Object.fromEntries(witness.nodeIds.map((id) => [id, "Membro del k-plex"]))
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: "k-plex massimale per inclusione selezionato",
    completionLabel: "Massimalit\u00e0 per inclusione verificata"
  });

  assert.equal(scene.nodes.length, 4);
  assert.equal(scene.links.length, 6);
  assert.equal(scene.links.filter((link) => !link.absence).length, 4);
  assert.equal(scene.links.filter((link) => link.absence).length, 2);
  assert.ok(scene.links.every((link) => link.selected && !link.contextOnly));
  assert.equal(threeDHighlightedLinks.length, 4,
    "l'highlight 3D deve includere le adiacenze osservate e ignorare i cappi esclusi dalla semantica k-plex");
  assert.ok(threeDHighlightedLinks.every((link) => link.source !== link.target));
  assert.ok(scene.links.filter((link) => link.absence).every((link) => !link.hypothetical && !link.directed));
  assert.equal(estimateGraph2DSceneSize(graph.nodes, inputs, {
    mode: "witness",
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: observedEdgeIds
  }).edgeCount, 6);
  assert.equal(estimateGraph2DSceneSize(graph.nodes, inputs, { mode: "projection" }).edgeCount, 5,
    "assenze visuali non devono diventare archi nella proiezione completa");
  assert.equal(formatGraph2DSceneCountSummary(4, 4, 0, 2),
    "4 nodi · 4 archi osservati · 2 coppie non adiacenti");
  assert.match(svg, /4 archi osservati · 2 coppie non adiacenti/);
  assert.match(svg, /k-plex massimale per inclusione selezionato/);
  assert.match(svg, /Massimalit\u00e0 per inclusione verificata/);
  assert.doesNotMatch(svg, /cardinalit\u00e0 massima|Ottimo provato/);
  assert.match(svg, /Coppie non adiacenti/);
  assert.match(svg, /Coppia non adiacente: A — C/);
  assert.match(svg, /non sono archi osservati o proposte/);
  assert.match(svg, /Con dati incompleti, una coppia senza arco può indicare una relazione non documentata/);
  assert.doesNotMatch(svg, /Proposta ipotetica/);

  const projection = buildGraph2DScene(graph.nodes, inputs, { mode: "projection" });
  assert.equal(projection.links.length, 5);
  assert.ok(projection.links.every((link) => !link.absence));
});

test("absence markers are canonicalized, deduplicated, and kept out of source identity collisions", () => {
  const baseId = "graph2d-absence:k-plex-s2:%5B%22a%22%2C%22c%22%5D";
  const links = buildGraph2DAbsenceLinks([["c", "a"], ["a", "c"], ["d", "b"]], {
    scope: "k-plex-s2",
    description: "assenza nel grafo analizzato",
    reservedSourceIds: [baseId]
  });

  assert.equal(links.length, 2);
  assert.deepEqual(links.map(({ source, target }) => [source, target]), [["a", "c"], ["b", "d"]]);
  assert.equal(links[0].sourceId, `${baseId}:1`);
  assert.ok(links.every((link) => link.absence === true && link.hypothetical !== true));
});

test("the selected k-plex missing-pair evidence reaches the 3D highlight and 2D export flows", async () => {
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
  const exportPanel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");

  assert.match(structuralPanel, /dispatch\("highlightKPlexWitness", \{\s*nodeIds,\s*missingTiePairs: kPlexMissingPairsBySet\[nextKplexSignature\] \?\? \[\],/);
  assert.match(graphApp, /on:highlightKPlexWitness=\{\(event\) => highlightKPlexWitness\(event\.detail\)\}/);
  const highlightStart = graphApp.indexOf("function highlightKPlexWitness(witness:");
  const highlightEnd = graphApp.indexOf("\n  function highlightTypedMotif", highlightStart);
  assert.ok(highlightStart >= 0 && highlightEnd > highlightStart);
  const handler = graphApp.slice(highlightStart, highlightEnd);
  assert.match(handler, /buildGraph2DAbsenceLinks\(missingTiePairs/);
  assert.match(handler, /highlightedEdgeIds = new Set\(observedLinks\.map/);
  assert.match(handler, /refreshLinkVisuals\(\)/);
  assert.match(exportPanel, /sceneAbsenceCount/);
  assert.match(exportPanel, /coppie non adiacenti nella proiezione corrente, non archi osservati o proposti/);
  assert.match(exportPanel, /describeNonAdjacencyScope\(\)/);
  assert.match(structuralPanel, /describeNonAdjacencyScope\(\)/);
  assert.match(exportPanel, /inputAbsenceCount = links\.filter/);
  assert.match(exportPanel, /inputObservedCount = Math\.max\(0, links\.length - inputHypotheticalCount - inputAbsenceCount\)/);
  assert.match(exportPanel, /formatGraph2DSceneCountSummary\(\s*nodes\.length,\s*inputObservedCount,\s*inputHypotheticalCount/);
});

test("l'export distingue un k-plex massimale più piccolo del k-plex massimo", async () => {
  const nodes = ["a", "b", "c", "d", "e", "f", "g"];
  const edges = [
    ["a", "b"], ["a", "c"], ["b", "c"],
    ["d", "e"], ["d", "f"], ["d", "g"], ["e", "f"], ["e", "g"], ["f", "g"]
  ];
  const graph = normalizeGraphData({
    nodes: nodes.map((id) => ({ id, label: `Nodo ${id.toUpperCase()}` })),
    edges: edges.map(([source, target], index) => ({ id: `e${index + 1}`, source, target }))
  });
  const asp = buildAspFactsFromGraph(graph);
  const runner = await createClingoWasmRunner();
  const maximumResult = await runner.run(
    `${asp.facts.trim()}\n\n${buildMaximumKPlexProgram(1)}`,
    getStructuralSolverOptions("kPlex")
  );
  assert.equal(maximumResult.Result, "OPTIMUM FOUND", maximumResult.Error ?? JSON.stringify(maximumResult));
  const maximumSets = parseWitnessKPlexExplanations(maximumResult.Call?.[0]?.Witnesses, asp.reverseIndex);
  const maximumCardinality = Math.max(...maximumSets.map(({ nodeIds }) => nodeIds.length));
  assert.equal(maximumCardinality, 4);

  const maximalResult = await runner.run(
    `${asp.facts.trim()}\n\n${buildMaximalKPlexProgram(1)}`,
    getStructuralSolverOptions("maximalKPlex")
  );
  assert.equal(maximalResult.Result, "SATISFIABLE", maximalResult.Error ?? JSON.stringify(maximalResult));
  const maximalSets = parseWitnessMaximalKPlexExplanations(maximalResult.Call?.[0]?.Witnesses, asp.reverseIndex);
  const smallerMaximal = maximalSets.find(({ nodeIds }) => nodeIds.length === 3);
  assert.ok(smallerMaximal, "il triangolo disconnesso dal K4 deve risultare massimale per inclusione");
  assert.ok(smallerMaximal.nodeIds.length < maximumCardinality,
    "massimale per inclusione non implica cardinalita massima");
  assert.deepEqual(smallerMaximal.nodeIds, ["a", "b", "c"]);
  assert.deepEqual(smallerMaximal.missingTiePairs, []);
  assert.deepEqual(smallerMaximal.candidateNodeIds, ["d", "e", "f", "g"]);

  const nodeAnnotations = Object.fromEntries(smallerMaximal.nodeIds.map((id) => [id, "Membro del k-plex"]));
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: "undirected",
    highlightedNodeIds: smallerMaximal.nodeIds,
    nodeAnnotations
  });
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(graphApp, /witness\.task === "maximalKPlex"[\s\S]*?k-plex massimale selezionato[\s\S]*?:[\s\S]*?k-plex di cardinalit\u00e0 massima selezionato/);
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    resultLabel: "k-plex massimale selezionato · s=1 · 3 nodi",
    completionLabel: "Enumerazione dei k-plex massimali completata"
  });

  assert.deepEqual(scene.nodes.map(({ id }) => id), ["a", "b", "c"]);
  assert.equal(scene.links.length, 3);
  assert.match(svg, /k-plex massimale selezionato/);
  assert.match(svg, /Enumerazione dei k-plex massimali completata/);
  assert.doesNotMatch(svg, /cardinalit\u00e0 massima|Ottimo provato/);
});
