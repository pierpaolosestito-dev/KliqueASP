import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildIntegrityRepairVisualization } from "../src/lib/kliqueasp/graph/integrityRepairVisualization.ts";
import { buildEdgeProvenanceBySourceId } from "../src/lib/kliqueasp/graph/structuralTasks.ts";

const nodes = [
  { id: "n1", sourceId: "source-n1", label: "Nodo uno" },
  { id: "n2", sourceId: "source-n2", label: "Nodo due" },
  { id: "n3", sourceId: "source-n3", label: "Nodo tre" }
];

const links = [
  { source: "n1", target: "n2", sourceId: "e-1", type: "collega", analysis: { direction: "directed", provenance: ["survey-B", "survey-A & <lab>"] } },
  { source: "n2", target: "n3", sourceId: "e-2", type: "collega" },
  { source: "n1", target: "n3", sourceId: "e-3", type: "collega" },
  { source: "n3", target: "n1", sourceId: "e-4", type: "collega" }
];

test("projects every integrity repair action onto its source node or edge in an accessible 2D SVG", () => {
  const proposal = {
    edgeIds: ["e-1"],
    edgeCosts: { "e-1": 3 },
    nodeAttributes: [{ nodeId: "source-n1", attribute: "settore", value: "clinica", cost: 2 }],
    nodeAttributeReplacements: [{ nodeId: "source-n1", attribute: "citta", expectedValue: "Roma", value: "Milano", cost: 1 }],
    nodeTypeReplacements: [{ nodeId: "source-n2", expectedType: "persona", newType: "ente", cost: 4 }],
    edgeAttributes: [{ edgeId: "e-1", attribute: "fiducia", value: 1, cost: 1 }],
    edgeAttributeReplacements: [{ edgeId: "e-2", attribute: "anno", expectedValue: 2010, value: 2011, cost: 1 }],
    edgeTypeReplacements: [{ edgeId: "e-3", expectedType: "collega", newType: "mentore", cost: 2 }],
    edgeIntervalReplacements: [{ edgeId: "e-4", expectedFrom: 2020, expectedTo: 2021, from: 2021, to: 2022, cost: 2 }],
    cost: 16
  };
  const result = buildIntegrityRepairVisualization(proposal, nodes, links, {
    ...buildEdgeProvenanceBySourceId(links),
    "e-4": "registro temporale"
  });
  const scene = buildGraph2DScene(nodes, links, {
    mode: "projection",
    graphDirection: "directed",
    highlightedNodeIds: result.nodeIds,
    highlightedEdgeIds: result.edgeIds,
    nodeAnnotations: result.nodeAnnotations,
    edgeAnnotations: result.edgeAnnotations
  });
  const svg = buildGraph2DSvg(scene, {
    showAnnotations: true,
    showLegend: true,
    resultLabel: result.resultLabel,
    completionLabel: result.completionLabel
  });

  assert.equal(result.hasWitness, true);
  assert.deepEqual(result.nodeIds.sort(), ["n1", "n2", "n3"]);
  assert.deepEqual(result.edgeIds.sort(), ["source:e-1", "source:e-2", "source:e-3", "source:e-4"]);
  assert.equal(result.resultLabel, "Proposta minima di riparazione · 8 azioni visibili");
  assert.equal(result.completionLabel, "Ottimo di costo provato · una proposta tra eventuali pari merito · costo 16 · dati invariati");
  assert.match(result.nodeAnnotations.n1, /settore = \"clinica\"/);
  assert.match(result.nodeAnnotations.n1, /citta: \"Roma\" → \"Milano\"/);
  assert.match(result.nodeAnnotations.n2, /persona → ente/);
  assert.equal(result.edgeAnnotations["source:e-1"].label, "Rimozione e modifica proposte");
  assert.equal(result.edgeAnnotations["source:e-1"].dashPattern, "dotted");
  assert.equal(result.edgeAnnotations["source:e-2"].dashPattern, "dashed");
  assert.match(result.edgeAnnotations["source:e-1"].description, /costo 3/);
  assert.match(result.edgeAnnotations["source:e-1"].description, /Assegnare fiducia = 1 · costo 1/);
  assert.match(result.edgeAnnotations["source:e-1"].description, /Fonte dichiarata: \[\"survey-A & <lab>\",\"survey-B\"\]/);
  assert.match(result.edgeAnnotations["source:e-2"].description, /anno: 2010 → 2011 · costo 1/);
  assert.match(result.edgeAnnotations["source:e-3"].description, /collega → mentore · costo 2/);
  assert.match(result.edgeAnnotations["source:e-4"].description, /\[2020, 2021\] → \[2021, 2022\] · costo 2/);
  assert.match(result.edgeAnnotations["source:e-4"].description, /registro temporale/);
  assert.ok(scene.links.find((link) => link.id === "e-1").directed);
  assert.match(svg, /Proposta minima di riparazione · 8 azioni visibili/);
  assert.match(svg, /dati invariati/);
  assert.match(svg, /Rimozione e modifica proposte/);
  assert.match(svg, /stroke-dasharray="2 4"/);
  assert.match(svg, /stroke-dasharray="5 4"/);
  assert.match(svg, /settore = &quot;clinica&quot;/);
  assert.match(svg, /Fonte dichiarata: \[&quot;survey-A &amp; &lt;lab&gt;&quot;,&quot;survey-B&quot;\]/);
});

test("reports when a repair target is outside the current graph projection", () => {
  const result = buildIntegrityRepairVisualization({
    edgeIds: ["outside-edge"],
    cost: 2,
    nodeAttributes: [{ nodeId: "outside-node", attribute: "type", value: "person", cost: 1 }]
  }, nodes, links);

  assert.equal(result.hasWitness, false);
  assert.deepEqual(result.nodeIds, []);
  assert.deepEqual(result.edgeIds, []);
  assert.equal(result.resultLabel, "Proposta di riparazione · nessun target visibile nella proiezione corrente");
  assert.equal(result.completionLabel, "Ottimo di costo provato · una proposta tra eventuali pari merito · costo 2 · dati invariati");
});

test("maps a node-only repair by its current ID and reports the actions hidden by projection", () => {
  const result = buildIntegrityRepairVisualization({
    edgeIds: ["outside-edge"],
    nodeTypeReplacements: [{ nodeId: "n2", expectedType: "persona", newType: "ente", cost: 2 }],
    cost: 4
  }, nodes, links);

  assert.equal(result.hasWitness, true);
  assert.deepEqual(result.nodeIds, ["n2"]);
  assert.deepEqual(result.edgeIds, []);
  assert.match(result.nodeAnnotations.n2, /persona → ente/);
  assert.equal(result.resultLabel, "Proposta minima di riparazione · 1 azione visibile · 1 fuori proiezione");
});

test("preserves inherited JSON node IDs as data through repair annotations and the 2D SVG", () => {
  const reservedNodes = [{ id: "constructor", sourceId: "constructor", label: "Nodo riservato" }];
  const proposal = {
    edgeIds: [],
    nodeTypeReplacements: [{ nodeId: "constructor", expectedType: "persona", newType: "ente", cost: 1 }],
    cost: 1
  };
  const result = buildIntegrityRepairVisualization(proposal, reservedNodes, []);
  const scene = buildGraph2DScene(reservedNodes, [], {
    mode: "projection",
    highlightedNodeIds: result.nodeIds,
    nodeAnnotations: result.nodeAnnotations
  });
  const svg = buildGraph2DSvg(scene, { showAnnotations: true, resultLabel: result.resultLabel });

  assert.equal(Object.hasOwn(result.nodeAnnotations, "constructor"), true);
  assert.match(result.nodeAnnotations.constructor, /persona → ente/);
  assert.deepEqual(result.nodeIds, ["constructor"]);
  assert.match(svg, /persona → ente/);
  assert.equal(Object.prototype.polluted, undefined);
});
