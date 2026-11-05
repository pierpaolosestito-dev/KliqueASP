import assert from "node:assert/strict";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import {
  buildTypedMotifProgram,
  buildTypedMotifTemporalNearMatchProgram,
  parseTypedMotifMatches,
  parseTypedMotifNearMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { mapSourceEdgeIdsToStructuralIdentities } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import {
  buildTypedMotifGraph2DAnnotations,
  buildTypedMotifNearMatchGraph2DAnnotations
} from "../src/lib/kliqueasp/graph/typedMotifGraph2D.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label", typeField: "$.type" },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      typeField: "$.type",
      direction: "directed",
      identity: "multigraph",
      validity: { fromField: "$.validFrom", toField: "$.validTo" }
    }
  }
};

function temporalMotif(semantics) {
  return {
    id: `temporal-${semantics}`,
    label: "Percorso temporale",
    roles: {
      source: { nodeTypes: ["source"] },
      middle: { nodeTypes: ["middle"] },
      target: { nodeTypes: ["target"] }
    },
    edges: [
      { sourceRole: "source", targetRole: "middle", edgeType: "introduces" },
      { sourceRole: "middle", targetRole: "target", edgeType: "collaborates" }
    ],
    temporal: { semantics }
  };
}

async function solveAndExport(semantics, edges) {
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", label: "Sorgente", type: "source" },
      { id: "m", label: "Intermediario", type: "middle" },
      { id: "t", label: "Destinazione", type: "target" },
      { id: "outside", label: "Esterno", type: "other" }
    ],
    edges: [...edges, { id: "context", source: "s", target: "outside", type: "unrelated", validFrom: "1980-01-01", validTo: "1980-01-02" }]
  }, graphConfig);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram(temporalMotif(semantics), graph.direction, "", false, false, facts.temporalEncoding);
  const solver = await createClingoWasmRunner();
  const result = await solver.run(`${facts.facts.trim()}\n\n${compiled.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));

  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    new Set(),
    facts.temporalEncoding.decode
  );
  assert.ok(matches.length > 0);
  const match = matches[0];
  const annotations = buildTypedMotifGraph2DAnnotations(match);
  const supportSourceIds = match.supportingEdges.flatMap((edge) => edge.edgeIds);
  assert.deepEqual([...Object.keys(annotations.edgeAnnotations)].sort(), [...supportSourceIds].sort());

  const supportIdentities = mapSourceEdgeIdsToStructuralIdentities(supportSourceIds, graph.links);
  const edgeAnnotations = Object.fromEntries(Object.entries(annotations.edgeAnnotations).flatMap(([sourceId, annotation]) =>
    [...mapSourceEdgeIdsToStructuralIdentities([sourceId], graph.links)].map((identity) => [identity, annotation])
  ));
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: match.nodeIds,
    highlightedEdgeIds: [...supportIdentities],
    nodeAnnotations: annotations.nodeAnnotations,
    edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: "Motivo temporale selezionato",
    completionLabel: "Enumerazione completa"
  });

  assert.deepEqual(scene.nodes.map((node) => node.id).sort(), [...match.nodeIds].sort());
  assert.deepEqual(scene.links.map((link) => link.id).sort(), [...supportSourceIds].sort());
  assert.ok(scene.links.every((link) => link.annotation?.label === "Relazione temporale del motivo"));
  assert.equal(scene.links.some((link) => link.id === "context"), false);
  assert.match(svg, /Motivo temporale selezionato/);
  assert.match(svg, /relazione temporale del motivo/i);
  return { match, scene, svg };
}

function svgDescription(svg) {
  return svg.match(/<desc id="graph-description">([^<]*)<\/desc>/)?.[1] ?? "";
}

test("a co-valid temporal motif keeps the shared valid time on each selected 2D edge", async () => {
  const { match, scene, svg } = await solveAndExport("coValid", [
    { id: "event-1", source: "s", target: "m", type: "introduces", validFrom: "1990-01-01", validTo: "1990-01-03" },
    { id: "event-2", source: "m", target: "t", type: "collaborates", validFrom: "1990-01-02", validTo: "1990-01-04" }
  ]);

  assert.notEqual(match.timeValue, undefined);
  const commonTime = new Date(match.timeValue).toISOString();
  for (const link of scene.links) assert.ok(link.annotation?.description.includes(`istante comune ${commonTime}`));
  assert.ok(svgDescription(svg).includes(commonTime), "the accessible SVG description must expose the shared time");
  assert.ok(svg.includes(`<title>Relazione temporale del motivo · ${scene.links[0].annotation.description}`),
    "the supporting edge title must expose its selected common time");
});

test("an ordered temporal motif keeps each ASP-selected edge start in the 2D witness", async () => {
  const { match, scene, svg } = await solveAndExport("orderedByStart", [
    { id: "event-1", source: "s", target: "m", type: "introduces", validFrom: "1990-01-01", validTo: "1990-01-03" },
    { id: "event-2", source: "m", target: "t", type: "collaborates", validFrom: "1990-01-04", validTo: "1990-01-06" }
  ]);

  assert.ok(match.supportingEdges.every((edge) => edge.startTimeValue !== undefined));
  for (const edge of match.supportingEdges) {
    const time = new Date(edge.startTimeValue).toISOString();
    const annotation = scene.links.find((link) => edge.edgeIds.includes(link.id))?.annotation;
    assert.ok(annotation?.description.includes(`inizio scelto ${time}`));
    assert.ok(svgDescription(svg).includes(time), "the accessible SVG description must expose each selected start");
    assert.ok(svg.includes(time), "the SVG edge title must expose each selected start");
  }
});

test("a temporal near-match exports the ASP-selected times and ordering violations with its source edges", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", label: "Sorgente", type: "source" },
      { id: "m", label: "Intermediario", type: "middle" },
      { id: "t", label: "Destinazione", type: "target" }
    ],
    edges: [
      { id: "later-first", source: "s", target: "m", type: "introduces", validFrom: "1990-01-02", validTo: "1990-01-05" },
      { id: "earlier-second", source: "m", target: "t", type: "collaborates", validFrom: "1990-01-01", validTo: "1990-01-05" }
    ]
  }, graphConfig);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifTemporalNearMatchProgram(
    temporalMotif("orderedByStart"), graph.direction, "", facts.temporalEncoding
  );
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts.trim()}\n\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));

  const [nearMatch] = parseTypedMotifNearMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    facts.temporalEncoding.decode
  );
  assert.ok(nearMatch?.temporalEvidence);
  assert.deepEqual(nearMatch.temporalEvidence.orderViolations, [{ firstIndex: 1, secondIndex: 2 }]);
  const annotations = buildTypedMotifNearMatchGraph2DAnnotations(nearMatch);
  const edgeIds = nearMatch.temporalEvidence.supportingEdges.flatMap((edge) => edge.edgeIds);
  assert.deepEqual(Object.keys(annotations.edgeAnnotations).sort(), [...edgeIds].sort());

  const edgeAnnotations = Object.fromEntries(Object.entries(annotations.edgeAnnotations).flatMap(([sourceId, annotation]) =>
    [...mapSourceEdgeIdsToStructuralIdentities([sourceId], graph.links)].map((identity) => [identity, annotation])
  ));
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: Object.values(nearMatch.roles).map((role) => role.nodeId),
    highlightedEdgeIds: [...mapSourceEdgeIdsToStructuralIdentities(edgeIds, graph.links)],
    nodeAnnotations: annotations.nodeAnnotations,
    edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: "Motivo temporale quasi corrispondente · inizi e ordine annotati"
  });

  assert.deepEqual(scene.links.map((link) => link.id).sort(), [...edgeIds].sort());
  assert.ok(scene.links.every((link) => link.annotation?.description.includes("ordine temporale invertito")));
  for (const edge of nearMatch.temporalEvidence.supportingEdges) {
    const time = new Date(edge.startTimeValue).toISOString();
    assert.ok(scene.links.some((link) => edge.edgeIds.includes(link.id) && link.annotation?.description.includes(time)));
    assert.ok(svgDescription(svg).includes(time));
  }
  assert.match(svg, /Motivo temporale quasi corrispondente/);
});

test("static typed motifs do not acquire invented temporal edge annotations", () => {
  const staticMatch = {
    templateId: "static",
    label: "Static",
    roles: { a: { nodeId: "1", sourceId: "source-1" } },
    nodeIds: ["1"],
    supportingEdges: [{ sourceRole: "a", targetRole: "a", edgeType: "knows", edgeIds: ["edge-1"] }]
  };

  assert.deepEqual(buildTypedMotifGraph2DAnnotations(staticMatch), {
    nodeAnnotations: { "1": "Ruolo a" },
    edgeAnnotations: {}
  });
});
