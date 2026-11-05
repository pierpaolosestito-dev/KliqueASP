import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import dataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import test from "node:test";
import graphConfig from "../src/lib/kliqueasp/data/examples/davis-southern-women.config.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildGraph2DHypotheticalEdgeAnnotations,
  buildGraph2DHypotheticalLinks,
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { graphDisplayLinkMatchesIdentities } from "../src/lib/kliqueasp/graph/graphVisualization.ts";
import {
  buildTypedMotifCompletionCounterfactualProgram,
  buildTypedMotifProgram,
  parseTypedMotifCompletionCounterfactuals,
  parseTypedMotifMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import {
  getStructuralEdgeIdentity,
  mapSourceEdgeIdsToStructuralIdentities
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("an ASP typed-motif witness exports only its role nodes and supporting source records", async () => {
  const graph = normalizeGraphData(dataset, graphConfig);
  const asp = buildAspFactsFromGraph(graph);
  const motif = graphConfig.graphAnalysis.motifs[0];
  const compiled = buildTypedMotifProgram(motif, graph.direction);
  const result = await (await createClingoWasmRunner()).run(`${asp.facts.trim()}\n\n${compiled.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));

  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    asp.reverseIndex,
    asp.reverseSourceIndex,
    asp.reverseEdgeIndex
  );
  assert.ok(matches.length > 0);
  const witness = matches[0];
  const nodeAnnotations = Object.fromEntries(Object.entries(witness.roles).map(([role, assignment]) => [
    assignment.nodeId,
    `Ruolo ${role}`
  ]));
  const supportingEdgeIds = witness.supportingEdges.flatMap((edge) => edge.edgeIds);
  const supportingEdgeIdentities = mapSourceEdgeIdsToStructuralIdentities(supportingEdgeIds, graph.links);
  const threeDHighlightedLinks = graph.links.filter((link) =>
    graphDisplayLinkMatchesIdentities(link, supportingEdgeIdentities, getStructuralEdgeIdentity));
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: witness.nodeIds,
    highlightedEdgeIds: [...supportingEdgeIdentities],
    nodeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: "Motivo tipizzato selezionato",
    completionLabel: `Enumerazione completa · ${matches.length} istanze`
  });

  assert.equal(scene.nodes.length, Object.keys(witness.roles).length);
  assert.equal(scene.links.length, supportingEdgeIds.length);
  assert.deepEqual(threeDHighlightedLinks.map((link) => link.sourceId).sort(), [...supportingEdgeIds].sort(),
    "la stessa identità deve selezionare in 3D esattamente i record restituiti dal testimone ASP");
  assert.deepEqual(scene.links.map((edge) => edge.id).sort(),
    [...supportingEdgeIds].sort());
  assert.ok(scene.links.every((edge) => edge.selected));
  assert.ok(scene.links.every((edge) => edge.directed === (graph.direction === "directed")));
  for (const role of Object.keys(witness.roles)) assert.match(svg, new RegExp(`Ruolo ${role}`));
  for (const edge of scene.links) assert.ok(svg.includes(edge.id), `SVG must preserve source edge ID ${edge.id}`);
  assert.match(svg, /Motivo tipizzato selezionato/);
  assert.match(svg, /Enumerazione completa/);
  assert.equal(scene.nodes.some((node) => !witness.nodeIds.includes(node.id)), false,
    "il testimone isolato non deve includere nodi di contesto estranei");
});

test("the application maps typed-motif role assignments and supporting records to the active graph overlay", async () => {
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  const start = graphApp.indexOf("function highlightTypedMotif(match:");
  const end = graphApp.indexOf("\n  function inspectProvenanceMotifWitness", start);
  assert.ok(start >= 0 && end > start, "typed-motif highlight handler must remain discoverable");
  const handler = graphApp.slice(start, end);

  assert.match(handler, /highlightedEdgeIds = mapSourceEdgeIdsToStructuralIdentities\(/);
  assert.match(handler, /data\?\.links \?\? \[\]/);
  assert.match(handler, /new Set\(match\.nodeIds\)/);
  assert.match(handler, /buildTypedMotifGraph2DAnnotations\(match\)/);
  assert.match(handler, /graph2DAnnotations\.edgeAnnotations/);

  const nearMatchStart = graphApp.indexOf("function highlightTypedMotifNearMatch(match:");
  const nearMatchEnd = graphApp.indexOf("\n  function ", nearMatchStart + 1);
  assert.ok(nearMatchStart >= 0 && nearMatchEnd > nearMatchStart, "near-match highlight handler must remain discoverable");
  assert.match(graphApp.slice(nearMatchStart, nearMatchEnd), /mapSourceEdgeIdsToStructuralIdentities\(/);
  assert.match(graphApp.slice(nearMatchStart, nearMatchEnd), /buildTypedMotifNearMatchGraph2DAnnotations\(match\)/);
  assert.match(graphApp.slice(nearMatchStart, nearMatchEnd), /match\.temporalEvidence\.semantics === "orderedByStart"/);
  assert.match(graphApp.slice(nearMatchStart, nearMatchEnd), /istante esaminato annotato/);

  const edgeAnnotationMapperStart = graphApp.indexOf("function mapTypedMotifGraph2DEdgeAnnotations(");
  const edgeAnnotationMapperEnd = graphApp.indexOf("\n  function ", edgeAnnotationMapperStart + 1);
  assert.ok(edgeAnnotationMapperStart >= 0 && edgeAnnotationMapperEnd > edgeAnnotationMapperStart,
    "typed-motif source-record annotations must be mapped to graph identities");
  assert.match(graphApp.slice(edgeAnnotationMapperStart, edgeAnnotationMapperEnd), /mapSourceEdgeIdsToStructuralIdentities\(/);
});

test("an ASP motif-completion proposal keeps observed evidence and candidate details distinct in SVG", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", labelField: "$.label", typeField: "$.kind" },
      edge: {
        idField: "$.id",
        sourceField: "$.from",
        targetField: "$.to",
        typeField: "$.kind",
        direction: "directed"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", label: "Source", kind: "source" },
      { id: "m", label: "Middle", kind: "middle" },
      { id: "t", label: "Target", kind: "target" },
      { id: "outside", label: "Outside", kind: "other" }
    ],
    edges: [
      { id: "observed-sm", from: "s", to: "m", kind: "knows" },
      { id: "outside-edge", from: "s", to: "outside", kind: "knows" }
    ]
  }, config);
  const facts = buildAspFactsFromGraph(graph);
  const nodeIndexById = Object.fromEntries(Object.entries(facts.reverseIndex).map(([index, id]) => [id, Number(index)]));
  const motif = {
    id: "safe-completion",
    label: "Percorso di conoscenza",
    roles: {
      source: { nodeTypes: ["source"] },
      middle: { nodeTypes: ["middle"] },
      target: { nodeTypes: ["target"] }
    },
    edges: [
      { sourceRole: "source", targetRole: "middle", edgeType: "knows" },
      { sourceRole: "middle", targetRole: "target", edgeType: "knows" }
    ],
    inducedEdgeTypes: ["knows"],
    closedWorld: true
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(motif, graph.direction, "", [
    {
      id: "candidate-mt",
      sourceNodeId: "m",
      targetNodeId: "t",
      sourceNode: nodeIndexById.m,
      targetNode: nodeIndexById.t,
      edgeType: "knows",
      cost: 2,
      recordIndex: 3
    },
    {
      id: "candidate-shortcut",
      sourceNodeId: "s",
      targetNodeId: "t",
      sourceNode: nodeIndexById.s,
      targetNode: nodeIndexById.t,
      edgeType: "knows",
      cost: 1,
      recordIndex: 4
    }
  ]);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(proposal);
  assert.equal(proposal.totalCost, 2);
  assert.deepEqual(proposal.addedEdges.map(({ id }) => id), ["candidate-mt"]);
  assert.deepEqual(proposal.addedEdges[0].patternIndexes, [2]);

  const sourceIds = proposal.match.supportingEdges.flatMap((edge) => edge.edgeIds);
  const observedEdgeIdentities = mapSourceEdgeIdsToStructuralIdentities(sourceIds, graph.links);
  const hypotheticalEdges = proposal.addedEdges.map((edge) => ({
    ...edge,
    description: edge.patternIndexes.length
      ? `Relazioni richieste dal motivo: ${edge.patternIndexes.join(", ")}`
      : "Relazione richiesta dal motivo"
  }));
  const hypotheticalLinks = buildGraph2DHypotheticalLinks("typed-motif", hypotheticalEdges, graph.direction);
  const edgeAnnotations = buildGraph2DHypotheticalEdgeAnnotations("typed-motif", hypotheticalEdges);
  const nodeAnnotations = Object.fromEntries(Object.entries(proposal.match.roles).map(([role, assignment]) => [
    assignment.nodeId,
    `Ruolo ${role}`
  ]));
  const scene = buildGraph2DScene(graph.nodes, [...graph.links, ...hypotheticalLinks], {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: proposal.match.nodeIds,
    highlightedEdgeIds: [...observedEdgeIdentities],
    nodeAnnotations,
    edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: `Controfattuale di motivo · ${proposal.label} · costo totale ${proposal.totalCost}`,
    completionLabel: "Costo minimo provato · una proposta tra eventuali pari merito"
  });

  assert.deepEqual(scene.nodes.map(({ id }) => id).sort(), proposal.match.nodeIds.slice().sort());
  assert.deepEqual([...observedEdgeIdentities], ["source:observed-sm"]);
  assert.deepEqual(scene.links.map(({ id }) => id).sort(), ["hypothetical:typed-motif:candidate-mt", "observed-sm"]);
  assert.ok(scene.links.find(({ id }) => id === "observed-sm")?.selected,
    "l'arco restituito dal testimone deve restare distinto e selezionato come evidenza osservata");
  assert.ok(scene.links.find(({ hypothetical }) => hypothetical)?.directed,
    "la relazione candidata deve conservare la direzione del grafo");
  assert.equal(scene.nodes.some(({ id }) => id === "outside"), false);
  assert.match(svg, /Controfattuale di motivo · Percorso di conoscenza · costo totale 2/);
  assert.match(svg, /Costo candidato 2 · Relazioni richieste dal motivo: 2/);
  assert.match(svg, /1 arco ipotetico tratteggiato; non appartiene al grafo osservato/);
  assert.doesNotMatch(svg, /outside-edge/);

  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  const start = graphApp.indexOf("function highlightTypedMotifCounterfactual(");
  const end = graphApp.indexOf("\n  function clearGraph2DOverlay(", start);
  assert.ok(start >= 0 && end > start);
  const handler = graphApp.slice(start, end);
  assert.match(handler, /highlightTypedMotif\(counterfactual\.match\)/);
  assert.match(handler, /buildGraph2DHypotheticalLinks\("typed-motif", addedEdges, graphDirection\)/);
  assert.match(handler, /buildGraph2DHypotheticalEdgeAnnotations\("typed-motif", addedEdges\)/);
  assert.match(handler, /Controfattuale di motivo · \$\{counterfactual\.label\} · costo totale \$\{counterfactual\.totalCost\}/);
});
