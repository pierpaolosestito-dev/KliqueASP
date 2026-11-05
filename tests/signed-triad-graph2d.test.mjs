import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildSignedTriadProgram, parseSignedTriadResults, prepareSignedTriads } from "../src/lib/kliqueasp/graph/signedTriadTask.ts";
import { getStructuralEdgeIdentity, hasCompleteModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const config = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label" },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      direction: "undirected",
      identity: "multigraph",
      attributes: { polarity: "$.sign" }
    }
  },
  graphAnalysis: {
    signedTriads: { attribute: "polarity", positiveValues: ["+"], negativeValues: ["-"] }
  }
};

test("una triade firmata ASP esporta solo le sue dyadi con polarità e ID sorgente", async () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "x", "y"].map((id) => ({ id, label: id.toUpperCase() })),
    edges: [
      { id: "ab-positive", from: "a", to: "b", sign: "+" },
      { id: "ac-positive", from: "a", to: "c", sign: "+" },
      { id: "bc-negative", from: "b", to: "c", sign: "-" },
      { id: "xy-unrelated", from: "x", to: "y", sign: "+" }
    ]
  }, config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));

  const facts = buildAspFactsFromGraph(graph);
  const preparation = prepareSignedTriads(
    config.graphAnalysis.signedTriads,
    graph.schemaVersion,
    graph.direction,
    graph.nodes,
    graph.links,
    new Set(["polarity"])
  );
  assert.equal(preparation.available, true, JSON.stringify(preparation.reasons));

  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildSignedTriadProgram(preparation)}`
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true);

  const [triad] = parseSignedTriadResults(result.Call?.[0]?.Witnesses, facts.reverseIndex, preparation.dyads);
  assert.ok(triad);
  assert.deepEqual(triad.nodeIds, ["a", "b", "c"]);
  assert.equal(triad.balanced, false);
  assert.equal(triad.negativeDyadCount, 1);

  const sourceEdgeIds = new Set(triad.dyads.flatMap((dyad) => dyad.edgeRecords.map((record) => record.id)));
  const edgeIdentities = new Set(graph.links
    .filter((link) => sourceEdgeIds.has(String(link.sourceId)))
    .map((link) => getStructuralEdgeIdentity(link)));
  assert.equal(edgeIdentities.size, 3, "tutte e sole le tre dyadi ASP del witness devono avere identità sorgente");

  const edgeAnnotations = Object.fromEntries(triad.dyads.flatMap((dyad) => dyad.edgeRecords.map((record) => [
    `source:${record.id}`,
    dyad.polarity === "positive"
      ? { label: "Positiva", description: "Polarità positiva della dyade", color: "#16834a" }
      : { label: "Negativa", description: "Polarità negativa della dyade", color: "#b4233c", dashPattern: "dashed" }
  ])));
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: "undirected",
    highlightedNodeIds: triad.nodeIds,
    highlightedEdgeIds: edgeIdentities,
    nodeAnnotations: Object.fromEntries(triad.nodeIds.map((nodeId, index) => [
      nodeId,
      `Nodo ${index + 1} · triade non bilanciata`
    ])),
    edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    title: "Triade firmata",
    scope: "Proiezione corrente",
    resultLabel: "Triade firmata non bilanciata · nodi e polarità evidenziati",
    completionLabel: "Enumerazione completa · 1 triade classificata",
    showLegend: true,
    showAnnotations: true
  });

  assert.deepEqual(scene.nodes.map((node) => node.id), ["a", "b", "c"]);
  assert.equal(scene.links.length, 3);
  assert.ok(scene.links.every((link) => link.selected && !link.contextOnly && !link.directed));
  assert.equal(scene.links.filter((link) => link.annotation?.label === "Positiva").length, 2);
  assert.equal(scene.links.filter((link) => link.annotation?.label === "Negativa").length, 1);
  assert.equal(scene.links.find((link) => link.annotation?.label === "Negativa")?.annotation?.dashPattern, "dashed");
  assert.match(svg, /Triade firmata non bilanciata/);
  assert.match(svg, /Enumerazione completa · 1 triade classificata/);
  assert.match(svg, /Positiva/);
  assert.match(svg, /Negativa/);
  assert.match(svg, /bc-negative/);
  assert.doesNotMatch(svg, /xy-unrelated/);
  assert.match(svg, /triade non bilanciata/);
  const accessibleDescription = svg.match(/<desc[^>]*>(.*?)<\/desc>/)?.[1] ?? "";
  assert.match(accessibleDescription, /Polarità positiva della dyade/);
  assert.match(accessibleDescription, /Polarità negativa della dyade/);
});

test("il click di triade usa le identità dei record e allega annotazioni di polarità al grafo 2D", async () => {
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  const motifPanel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");

  assert.match(motifPanel, /dispatch\("highlightSignedTriad", triad\)/);
  assert.match(graphApp, /on:highlightSignedTriad=\{\(event\) => showSignedTriadInGraph\(event\.detail as SignedTriadResult\)\}/);
  const handlerStart = graphApp.indexOf("function showSignedTriadInGraph(");
  const handlerEnd = graphApp.indexOf("\n  function clearSignedTriadGraphFocus", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
  const handler = graphApp.slice(handlerStart, handlerEnd);
  assert.match(handler, /dyad\.edgeRecords\.map\(\(record\) => getStructuralEdgeIdentity/);
  assert.match(handler, /highlightedEdgeIds = edgeIdentities/);
  assert.match(handler, /dyad\.polarity === "positive"[\s\S]*?label: "Positiva"[\s\S]*?label: "Negativa"/);
  assert.match(handler, /Polarità positiva della dyade/);
  assert.match(handler, /Polarità negativa della dyade/);
  assert.match(handler, /graph2DHypotheticalLinks = \[\]/);
});
