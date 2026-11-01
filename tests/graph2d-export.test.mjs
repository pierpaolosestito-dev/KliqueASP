import test from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph2DScene,
  buildGraph2DSvg,
  buildGraph2DAnalysisSummary,
  canShowGraph2DNodeText,
  estimateGraph2DSceneSize,
  formatGraph2DSceneCountSummary,
  GRAPH2D_NODE_TEXT_LIMIT,
  buildGraph2DHypotheticalEdgeAnnotations,
  buildGraph2DHypotheticalLinks
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";

const nodes = [
  { id: "a", label: "A & <Alice>" },
  { id: "b", label: "Bob" },
  { id: "c", label: "Carol" },
  { id: "isolated", label: "Alone" }
];
const links = [
  { source: "a", target: "b", sourceId: "ab-1", type: "collaboration" },
  { source: "a", target: "b", sourceId: "ab-2", type: "friendship" },
  { source: "b", target: "c", sourceId: "bc", type: "friendship" },
  { source: "c", target: "c", sourceId: "loop", type: "self" }
];

test("i conteggi del grafo 2D usano correttamente singolare e plurale", () => {
  assert.equal(formatGraph2DSceneCountSummary(1, 1), "1 nodo · 1 arco");
  assert.equal(formatGraph2DSceneCountSummary(0, 0), "0 nodi · 0 archi");
  assert.equal(formatGraph2DSceneCountSummary(1, 1, 1), "1 nodo · 1 arco osservato · 1 proposta");
  assert.equal(formatGraph2DSceneCountSummary(2, 0, 2), "2 nodi · 0 archi osservati · 2 proposte");
});

test("the 2D size estimate counts the active projection or the exact selected witness", () => {
  assert.deepEqual(estimateGraph2DSceneSize(nodes, [...links, { source: "missing", target: "a" }]), {
    nodeCount: 4,
    edgeCount: 4
  });
  assert.deepEqual(estimateGraph2DSceneSize(nodes, links, {
    mode: "witness",
    highlightedNodeIds: ["a", "b"]
  }), { nodeCount: 2, edgeCount: 2 });
  assert.deepEqual(estimateGraph2DSceneSize(nodes, links, {
    mode: "witness",
    highlightedEdgeIds: ["source:bc"]
  }), { nodeCount: 2, edgeCount: 1 });
  assert.deepEqual(estimateGraph2DSceneSize(nodes, [
    links[0],
    { source: "c", target: "isolated", sourceId: "hypothetical:c-isolated", hypothetical: true },
    links[2]
  ], {
    mode: "witness",
    highlightedEdgeIds: ["source:ab-1"]
  }), { nodeCount: 4, edgeCount: 2 });
});

test("node names, IDs, and annotations are limited to readable preview sizes", () => {
  assert.equal(canShowGraph2DNodeText(0), true);
  assert.equal(canShowGraph2DNodeText(GRAPH2D_NODE_TEXT_LIMIT), true);
  assert.equal(canShowGraph2DNodeText(GRAPH2D_NODE_TEXT_LIMIT + 1), false);
  assert.equal(canShowGraph2DNodeText(-1), false);
  assert.equal(canShowGraph2DNodeText(Number.POSITIVE_INFINITY), false);
});

test("2D scene layout is repeatable for identical graph input", () => {
  const first = buildGraph2DScene(nodes, links, { seed: 19, edgeColors: { collaboration: "#123456" } });
  const second = buildGraph2DScene(nodes, links, { seed: 19, edgeColors: { collaboration: "#123456" } });
  assert.deepEqual(first, second);
  assert.equal(first.nodes.length, nodes.length);
  assert.equal(first.links[0].color, "#123456");
});

test("projection includes all normalized nodes and edge records", () => {
  const scene = buildGraph2DScene(nodes, links);
  assert.equal(scene.nodes.length, 4);
  assert.equal(scene.links.length, 4);
  assert.deepEqual(scene.links.map((link) => link.id), ["ab-1", "ab-2", "bc", "loop"]);
});

test("witness includes selected nodes and only its supporting records", () => {
  const scene = buildGraph2DScene(nodes, links, {
    mode: "witness",
    highlightedNodeIds: ["a", "b", "not-in-graph"],
    highlightedEdgeIds: ["source:ab-2"]
  });
  assert.deepEqual(scene.nodes.map((node) => node.id), ["a", "b"]);
  assert.deepEqual(scene.links.map((link) => link.id), ["ab-2"]);
  assert.equal(scene.nodes.find((node) => node.id === "a").selected, true);
  assert.equal(scene.links[0].selected, true);
});

test("witness falls back to induced edge records when only nodes are highlighted", () => {
  const scene = buildGraph2DScene(nodes, links, {
    mode: "witness",
    highlightedNodeIds: ["a", "b"]
  });
  assert.equal(scene.links.length, 2);
  assert.deepEqual(scene.links.map((link) => link.id), ["ab-1", "ab-2"]);
  assert.ok(scene.links.every((link) => link.contextOnly && !link.selected));

  const svg = buildGraph2DSvg(scene, { showLegend: true, resultLabel: "Risultato selezionato" });
  const svgWithoutLegend = buildGraph2DSvg(scene, { showLegend: false, resultLabel: "Risultato selezionato" });
  assert.match(svg, /stroke-dasharray="2 4"/);
  assert.match(svg, /Contesto osservato/);
  assert.match(svgWithoutLegend, /Puntinate: relazioni osservate/);
  assert.match(svgWithoutLegend, /contesto, non evidenza dell(?:'|&apos;)analisi/);
  assert.match(svg, /non parte dell(?:'|&apos;)evidenza restituita dall(?:'|&apos;)analisi/);
  assert.match(svg, /non fanno parte dell(?:'|&apos;)evidenza restituita dall(?:'|&apos;)analisi/);

  const compactScene = buildGraph2DScene(nodes, links, {
    mode: "witness",
    width: 240,
    height: 240,
    highlightedNodeIds: ["a", "b"]
  });
  const compactSvg = buildGraph2DSvg(compactScene, { showLegend: false });
  assert.match(compactSvg, /Puntinate: relazioni osservate/);
  assert.match(compactSvg, /contesto, non evidenza dell(?:'|&apos;)analisi/);
});

test("counterfactual links stay distinct from observed edges in a 2D witness", () => {
  const proposed = {
    source: "a",
    target: "c",
    sourceId: "hypothetical:ac",
    type: "collaboration",
    hypothetical: true,
    analysis: { id: "hypothetical:ac", type: "collaboration", direction: "directed", hypothetical: true }
  };
  const scene = buildGraph2DScene(nodes, [...links, proposed], {
    mode: "witness",
    graphDirection: "directed",
    highlightedNodeIds: ["a", "c"],
    highlightedEdgeIds: ["source:ab-1"]
  });
  const proposedLink = scene.links.find((link) => link.id === "hypothetical:ac");
  assert.equal(proposedLink?.hypothetical, true);
  assert.equal(proposedLink?.selected, true);
  const svg = buildGraph2DSvg(scene, { showLegend: true, resultLabel: "Relazione proposta" });
  assert.match(svg, /stroke-dasharray="7 5"/);
  assert.match(svg, /Proposta ipotetica/);
  assert.match(svg, /non appartengono al grafo osservato/);
  assert.match(svg, /1 arco osservato · 1 proposta/);
});

test("structural counterfactual proposals retain identity, direction, and costs in the 2D export", () => {
  const proposal = [{ id: "candidate-ac", sourceNodeId: "a", targetNodeId: "c", edgeType: "collaboration", cost: 2.5 }];
  const hypotheticalLinks = buildGraph2DHypotheticalLinks("typed path", proposal, "directed");
  const edgeAnnotations = buildGraph2DHypotheticalEdgeAnnotations("typed path", proposal);
  assert.equal(hypotheticalLinks[0].sourceId, "hypothetical:typed-path:candidate-ac");
  assert.equal(hypotheticalLinks[0].analysis.direction, "directed");

  const scene = buildGraph2DScene(nodes, [...links, ...hypotheticalLinks], {
    mode: "witness",
    graphDirection: "directed",
    highlightedNodeIds: ["a", "c"],
    edgeAnnotations
  });
  const proposedLink = scene.links.find((link) => link.id === "hypothetical:typed-path:candidate-ac");
  assert.equal(proposedLink?.hypothetical, true);
  assert.equal(proposedLink?.directed, true);
  assert.equal(proposedLink?.annotation?.label, "Costo candidato");
  assert.equal(proposedLink?.annotation?.description, "Costo candidato 2.5");

  const svg = buildGraph2DSvg(scene, { showLegend: true, resultLabel: "Cammino controfattuale" });
  assert.match(svg, /marker-end="url\(#graph-arrow\)"/);
  assert.match(svg, /Costo candidato · Costo candidato 2\.5/);
  assert.match(svg, /0 archi osservati · 1 proposta/);
});

test("many hypothetical candidates keep one compact legend entry and preserve edge evidence", () => {
  const candidates = [
    { id: "motif-1", sourceNodeId: "a", targetNodeId: "c", edgeType: "collaboration", cost: 1, description: "Relazioni richieste dal motivo: 1" },
    { id: "motif-2", sourceNodeId: "c", targetNodeId: "isolated", edgeType: "friendship", cost: 3.5, description: "Relazioni richieste dal motivo: 2" }
  ];
  const hypotheticalLinks = buildGraph2DHypotheticalLinks("typed-motif", candidates, "directed");
  const annotations = buildGraph2DHypotheticalEdgeAnnotations("typed-motif", candidates);
  const scene = buildGraph2DScene(nodes, [...links, ...hypotheticalLinks], {
    mode: "witness",
    graphDirection: "directed",
    highlightedNodeIds: ["a", "c", "isolated"],
    edgeAnnotations: annotations
  });
  assert.deepEqual(scene.links.filter((link) => link.hypothetical).map((link) => link.annotation?.label), [
    "Costo candidato", "Costo candidato"
  ]);
  assert.equal(scene.links.find((link) => link.id === "hypothetical:typed-motif:motif-1")?.annotation?.description,
    "Costo candidato 1 · Relazioni richieste dal motivo: 1");
  assert.equal(scene.links.find((link) => link.id === "hypothetical:typed-motif:motif-2")?.annotation?.description,
    "Costo candidato 3.5 · Relazioni richieste dal motivo: 2");
  const svg = buildGraph2DSvg(scene, { showLegend: true, showAnnotations: true });
  assert.equal((svg.match(/>Costo candidato<\/text>/g) ?? []).length, 1);
  assert.match(svg, /motif-2/);
  assert.match(svg, /Costo candidato 3\.5 · Relazioni richieste dal motivo: 2/);
  assert.match(svg, /Proposta ipotetica/);
});

test("SVG escapes untrusted labels and reports edge identities", () => {
  const scene = buildGraph2DScene(nodes, links, {
    highlightedNodeIds: ["a"],
    graphDirection: "directed"
  });
  const svg = buildGraph2DSvg(scene, {
    title: "Network <test>",
    scopeLabel: "Scenario & group",
    showLabels: true,
    showLegend: true
  });
  assert.match(svg, /Network &lt;test&gt;/);
  assert.match(svg, /A &amp; &lt;Alice&gt;/);
  assert.match(svg, /Scenario &amp; group/);
  assert.match(svg, /ab-1/);
  assert.match(svg, /marker-end="url\(#graph-arrow\)"/);
  assert.match(svg, /RELAZIONI/);
});

test("SVG can show node IDs and annotations without showing node names", () => {
  const scene = buildGraph2DScene(
    [{ id: "alice", label: "Alice Rossi" }, { id: "bruno", label: "Bruno Verdi" }],
    [{ source: "alice", target: "bruno", sourceId: "ab", type: "collaboration" }],
    { highlightedNodeIds: ["alice"], nodeAnnotations: { alice: "core 4" } }
  );

  const idAndAnnotationSvg = buildGraph2DSvg(scene, {
    showLabels: false,
    showNodeIds: true,
    showAnnotations: true,
    showLegend: false
  });
  assert.ok(idAndAnnotationSvg.includes("<title>Alice Rossi \u00b7 core 4 \u00b7 ID alice</title>"));
  assert.ok(idAndAnnotationSvg.includes("<title>ID alice \u00b7 core 4</title>ID alice \u00b7 core 4</text>"));
  assert.doesNotMatch(idAndAnnotationSvg, /<text[^>]*>Alice Rossi/);

  const annotationOnlySvg = buildGraph2DSvg(scene, {
    showLabels: false,
    showNodeIds: false,
    showAnnotations: true,
    showLegend: false
  });
  assert.ok(annotationOnlySvg.includes("<title>Alice Rossi \u00b7 core 4 \u00b7 ID alice</title>"));
  assert.ok(annotationOnlySvg.includes("<title>core 4</title>core 4</text>"));
});

test("SVG keeps labels inside the canvas and exposes full text when a label is shortened", () => {
  const scene = {
    width: 320,
    height: 240,
    nodes: [{
      id: "edge-node",
      label: "Member 32",
      type: "",
      color: "#2f8f83",
      x: 300,
      y: 120,
      selected: false,
      annotation: "",
      communityId: ""
    }],
    links: []
  };
  const svg = buildGraph2DSvg(scene, { showLabels: true, showLegend: false });
  assert.match(svg, /<text x="289\.5" y="123\.5" text-anchor="end"[^>]*><title>Member 32<\/title>Member 32<\/text>/);
  assert.match(svg, /stroke="#ffffff" stroke-width="3\.5" stroke-linejoin="round" paint-order="stroke"/);

  const longLabel = "Regional Network Association West and Central District";
  const narrowScene = {
    ...scene,
    width: 180,
    nodes: [{ ...scene.nodes[0], label: longLabel, x: 170 }]
  };
  const narrowSvg = buildGraph2DSvg(narrowScene, { showLabels: true, showLegend: false });
  assert.match(narrowSvg, /<title>Regional Network Association West and Central District<\/title>[^<]*…<\/text>/);
});

test("SVG reports solver completion status alongside the result label", () => {
  const scene = buildGraph2DScene(nodes, links, { highlightedNodeIds: ["a", "b"] });
  const svg = buildGraph2DSvg(scene, {
    resultLabel: "Clique selezionata",
    completionLabel: "Ottimo provato & completo"
  });
  assert.match(svg, /Clique selezionata · Ottimo provato &amp; completo/);
  assert.match(svg, /graph-description[^>]*>[^<]*Ottimo provato &amp; completo/);

  const withoutStatus = buildGraph2DSvg(scene, { resultLabel: "Clique selezionata" });
  assert.doesNotMatch(withoutStatus, /Ottimo provato/);
});

test("unselected aggregate 2D summaries explicitly avoid claiming a graph witness", () => {
  const summary = buildGraph2DAnalysisSummary({
    analysisLabel: "Motivo tipizzato",
    resultSummary: "12 istanze",
    completionLabel: "Conteggio completo",
    kind: "aggregate"
  });
  assert.match(summary.resultLabel, /12 istanze/);
  assert.match(summary.resultLabel, /nessun witness singolo/);
  assert.equal(summary.completionLabel, "Conteggio completo");
  assert.throws(() => buildGraph2DAnalysisSummary({
    analysisLabel: " ", resultSummary: "12 istanze", completionLabel: "", kind: "aggregate"
  }), TypeError);
});

test("signed triad polarities are visible in the SVG with colors, line patterns, labels, and a legend", () => {
  const triadLinks = [
    { source: "a", target: "b", sourceId: "positive-ab", type: "friendship" },
    { source: "b", target: "c", sourceId: "negative-bc", type: "friendship" },
    { source: "a", target: "c", sourceId: "positive-ac", type: "friendship" }
  ];
  const annotations = {
    "source:positive-ab": { label: "Positiva", color: "#16834a" },
    "source:negative-bc": { label: "Negativa", color: "#b4233c", dashPattern: "dashed" },
    "source:positive-ac": { label: "Positiva", color: "#16834a" }
  };
  const scene = buildGraph2DScene(nodes.slice(0, 3), triadLinks, {
    mode: "witness",
    highlightedNodeIds: ["a", "b", "c"],
    highlightedEdgeIds: ["source:positive-ab", "source:negative-bc", "source:positive-ac"],
    edgeAnnotations: annotations
  });

  assert.equal(scene.links.find((link) => link.id === "positive-ab")?.color, "#16834a");
  assert.equal(scene.links.find((link) => link.id === "negative-bc")?.annotation?.label, "Negativa");
  assert.equal(scene.links.find((link) => link.id === "negative-bc")?.selected, true);
  const svg = buildGraph2DSvg(scene, { showLegend: true, resultLabel: "Triade non bilanciata" });
  assert.match(svg, /stroke-dasharray="5 4"/);
  assert.match(svg, /Negativa · friendship · negative-bc/);
  assert.match(svg, /<text[^>]*>Positiva<\/text>/);
  assert.match(svg, /<text[^>]*>Negativa<\/text>/);
  assert.match(svg, /Triade non bilanciata/);
});

test("separator witnesses distinguish removed nodes and edge records in the 2D export", () => {
  const scene = buildGraph2DScene(nodes.slice(0, 3), links.slice(0, 1), {
    highlightedNodeIds: ["a"],
    highlightedEdgeIds: ["source:ab-1"],
    nodeAnnotations: { a: "Nodo rimosso · separatore" },
    edgeAnnotations: {
      "source:ab-1": { label: "Arco rimosso", color: "#b4233c", dashPattern: "dotted" }
    }
  });
  const svg = buildGraph2DSvg(scene, { showLegend: true, showAnnotations: true });

  assert.equal(scene.links[0].annotation?.label, "Arco rimosso");
  assert.match(svg, /stroke-dasharray="2 4"/);
  assert.match(svg, /Arco rimosso · collaboration · ab-1/);
  assert.match(svg, /Nodo rimosso · separatore/);
  assert.match(svg, /ANNOTAZIONI/);
  assert.match(svg, /Arco rimosso/);
});

test("SVG can print stable source node IDs alongside labels", () => {
  const scene = buildGraph2DScene(nodes, links);
  const svg = buildGraph2DSvg(scene, { showLabels: true, showNodeIds: true });
  assert.match(svg, /A &amp; &lt;Alice&gt; · ID a/);
  assert.match(svg, /Bob · ID b/);
});

test("community colors and path order annotations survive into the SVG", () => {
  const scene = buildGraph2DScene(nodes, links, {
    nodeColors: { a: "#2563eb", b: "#9333ea" },
    communityByNodeId: { a: "c1", b: "c2" },
    nodeAnnotations: { a: "passo 1", b: "passo 2" }
  });
  assert.equal(scene.nodes.find((node) => node.id === "a").color, "#2563eb");
  assert.equal(scene.nodes.find((node) => node.id === "a").communityId, "c1");
  const svg = buildGraph2DSvg(scene, {
    showLabels: true,
    showLegend: true,
    showAnnotations: true,
    resultLabel: "Cammino selezionato",
    communityLegend: [
      { id: "c1", label: "Comunità 1", color: "#2563eb" },
      { id: "c2", label: "Comunità 2", color: "#9333ea" }
    ]
  });
  assert.match(svg, /fill="#2563eb"/);
  assert.match(svg, /A &amp; &lt;Alice&gt; · passo 1/);
  assert.match(svg, /Cammino selezionato/);
  assert.match(svg, /Comunità 1/);
});

test("combined witness, community, signed-edge, and hypothetical annotations remain distinct", () => {
  const mixedLinks = [
    { source: "a", target: "b", sourceId: "positive-ab", type: "friendship" },
    { source: "b", target: "c", sourceId: "negative-bc", type: "friendship" },
    {
      source: "a",
      target: "c",
      sourceId: "hypothetical:proposed-ac",
      type: "collaboration",
      hypothetical: true,
      analysis: { id: "hypothetical:proposed-ac", type: "collaboration", direction: "directed", hypothetical: true }
    }
  ];
  const scene = buildGraph2DScene(nodes.slice(0, 3), mixedLinks, {
    graphDirection: "directed",
    highlightedNodeIds: ["a", "b", "c"],
    highlightedEdgeIds: ["source:positive-ab", "source:negative-bc"],
    nodeColors: { a: "#2563eb", b: "#9333ea", c: "#16834a" },
    communityByNodeId: { a: "c1", b: "c2", c: "c1" },
    nodeAnnotations: { a: "step 1", b: "core 2" },
    edgeAnnotations: {
      "source:positive-ab": { label: "positive", color: "#16834a" },
      "source:negative-bc": { label: "negative", color: "#b4233c", dashPattern: "dotted" },
      "source:hypothetical:proposed-ac": { label: "proposed addition", color: "#7c3aed", dashPattern: "dashed" }
    }
  });
  const svg = buildGraph2DSvg(scene, {
    showLabels: true,
    showLegend: true,
    showAnnotations: true,
    communityLegend: [
      { id: "c1", label: "Community 1", color: "#2563eb" },
      { id: "c2", label: "Community 2", color: "#9333ea" }
    ],
    resultLabel: "Selected witness"
  });

  assert.match(svg, /fill="#2563eb"/);
  assert.match(svg, /fill="#9333ea"/);
  assert.match(svg, /stroke="#b45309"/);
  assert.match(svg, /Alice.*step 1/);
  assert.match(svg, /Bob.*core 2/);
  assert.match(svg, /stroke-dasharray="2 4"/);
  assert.match(svg, /stroke-dasharray="7 5"/);
  assert.match(svg, /marker-end="url\(#graph-arrow\)"/);
  assert.match(svg, /proposed addition/);
  assert.match(svg, /positive/);
  assert.match(svg, /negative/);
  assert.match(svg, /Community 1/);
  assert.match(svg, /Selected witness/);
  assert.match(svg, /2 .* archi osservati .* 1 proposta/);
  assert.match(svg, /non appartengono al grafo osservato/);
});

test("empty graphs produce a valid empty SVG", () => {
  const svg = buildGraph2DSvg(buildGraph2DScene([], []));
  assert.match(svg, /^<svg /);
  assert.match(svg, /0 nodi · 0 archi/);
  assert.match(svg, /<\/svg>$/);
});

test("dimensions outside the supported range are rejected", () => {
  assert.throws(() => buildGraph2DScene(nodes, links, { width: 120 }), RangeError);
  assert.throws(() => buildGraph2DScene(nodes, links, { height: 9000 }), RangeError);
});
