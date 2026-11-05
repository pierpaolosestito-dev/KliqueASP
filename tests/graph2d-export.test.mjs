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

const contrastAgainstWhite = (hex) => {
  const values = hex.match(/[\da-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  return 1.05 / (luminance + 0.05);
};

test("i conteggi del grafo 2D usano correttamente singolare e plurale", () => {
  assert.equal(formatGraph2DSceneCountSummary(1, 1), "1 nodo · 1 arco");
  assert.equal(formatGraph2DSceneCountSummary(0, 0), "0 nodi · 0 archi");
  assert.equal(formatGraph2DSceneCountSummary(1, 1, 1), "1 nodo · 1 arco osservato · 1 arco proposto");
  assert.equal(formatGraph2DSceneCountSummary(2, 0, 2), "2 nodi · 0 archi osservati · 2 archi proposti");
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

test("the 2D projection colors configured node types and explains visible node colors", () => {
  const scene = buildGraph2DScene([
    { id: "a", type: "person" },
    { id: "b", analysis: { type: "place" } },
    { id: "c" },
    { id: "d", type: "unmapped" }
  ], [{ source: "a", target: "b", type: "person-place" }], {
    highlightedNodeIds: ["a"],
    nodeTypeStyles: {
      default: { color: "#334155" },
      person: { color: "#38bdf8" },
      place: { color: "#22c55e" }
    },
    edgeColors: { "person-place": "#f472b6" }
  });

  assert.equal(scene.nodes.find((node) => node.id === "a")?.color, "#f59e0b");
  assert.equal(scene.nodes.find((node) => node.id === "a")?.selectedColorApplied, true);
  assert.equal(scene.nodes.find((node) => node.id === "b")?.color, "#22c55e");
  assert.equal(scene.nodes.find((node) => node.id === "b")?.nodeTypeColor, "#22c55e");
  assert.equal(scene.nodes.find((node) => node.id === "c")?.color, "#334155");
  assert.equal(scene.nodes.find((node) => node.id === "d")?.color, "#334155");

  const svg = buildGraph2DSvg(scene, { showLegend: true });
  assert.match(svg, />NODI<\/text>/);
  assert.match(svg, />place<\/text>/);
  assert.match(svg, />Senza tipo<\/text>/);
  assert.match(svg, />Nodo evidenziato<\/text>/);
  assert.match(svg, />RELAZIONI<\/text>/);
  assert.match(svg, />person-place<\/text>/);
  const description = svg.match(/<desc id="graph-description">([^<]*)<\/desc>/)?.[1] ?? "";
  assert.match(description, /Tipi di nodo codificati per colore/);
  assert.match(description, /Senza tipo/);
  assert.match(description, /Tipi di relazione codificati con colore e tratto: person-place/);
  assert.match(description, /I nodi evidenziati sono arancioni\./);
});

test("2D relation types use stable line patterns, and explicit annotation styles take precedence", () => {
  const relationTypes = Array.from({ length: 8 }, (_, index) => `R${index + 1}`);
  const relationNodes = Array.from({ length: relationTypes.length + 1 }, (_, index) => ({ id: `n${index}` }));
  const relationLinks = relationTypes.map((type, index) => ({
    source: `n${index}`,
    target: `n${index + 1}`,
    sourceId: `edge-${type}`,
    type
  }));
  const renderStyles = (links, options = {}) => {
    const scene = buildGraph2DScene(relationNodes, links, options);
    const svg = buildGraph2DSvg(scene, { showLegend: true });
    const pathStyles = new Map([...svg.matchAll(/<path d="[^"]*" fill="none"([^>]*)><title>(.*?)<\/title><\/path>/g)]
      .map(([, attributes, title]) => {
        const edgeId = title.match(/edge-R\d+/)?.[0];
        return [edgeId, attributes.match(/stroke-dasharray="([^"]+)"/)?.[1] ?? "solid"];
      }));
    return { svg, pathStyles };
  };

  const first = renderStyles(relationLinks);
  const reversed = renderStyles([...relationLinks].reverse());
  assert.deepEqual(first.pathStyles, reversed.pathStyles);
  assert.equal(new Set([...first.pathStyles.values()]).size, 8);
  assert.match(first.svg, /<line x1="0" y1="0" x2="28"[^>]*stroke-dasharray="4 4"[^>]*\/><text x="35"[^>]*>R3<\/text>/);
  assert.match(first.svg, /Tipi di relazione codificati con colore e tratto/);

  const annotated = renderStyles(relationLinks, {
    edgeAnnotations: {
      "source:edge-R2": { label: "Stile esplicito", dashPattern: "solid" }
    }
  });
  assert.equal(annotated.pathStyles.get("edge-R2"), "solid");
  assert.match(annotated.svg, /stroke-dasharray="10 4"[^>]*\/><text x="35"[^>]*>R2<\/text>/);
});

test("2D exports keep relation types beyond the compact legend visible and distinguishable", () => {
  const relationTypes = Array.from({ length: 12 }, (_, index) => `relazione-${String(index + 1).padStart(2, "0")}`);
  const relationNodes = Array.from({ length: relationTypes.length + 1 }, (_, index) => ({ id: `n${index}` }));
  const relationLinks = relationTypes.map((type, index) => ({
    source: `n${index}`,
    target: `n${index + 1}`,
    sourceId: `edge-${type}`,
    type,
    ...(index === 0 ? { hypothetical: true } : {})
  }));
  const render = (links, sceneOptions = {}) => buildGraph2DSvg(
    buildGraph2DScene(relationNodes, links, sceneOptions),
    { showLegend: true }
  );
  const svg = render(relationLinks);
  const reversedSvg = render([...relationLinks].reverse());
  const pathStyles = (source) => [...source.matchAll(/<path d="[^"]*" fill="none" stroke="([^"]+)"[^>]*><title>(.*?)<\/title><\/path>/g)]
    .map(([, color, title]) => [title.match(/edge-relazione-\d+/)?.[0], color])
    .sort(([left], [right]) => left.localeCompare(right));

  for (const type of relationTypes) assert.match(svg, new RegExp(`>${type}<\\/text>`));
  assert.doesNotMatch(svg, />Altri tipi:/);
  assert.match(svg, /Tipi di relazione codificati con colore e tratto: relazione-01[\s\S]*relazione-12/);
  assert.match(svg, /height="(?!820")[1-9]\d{2,}" viewBox="0 0 1280 (?!820")[1-9]\d{2,}"/);
  assert.deepEqual(pathStyles(svg), pathStyles(reversedSvg));
  assert.ok(new Set(pathStyles(svg).map(([, color]) => color)).size > 1);
  assert.ok(pathStyles(svg).every(([, color]) => contrastAgainstWhite(color) >= 3));
  assert.match(svg, />Proposta ipotetica<\/text>/);

  const annotated = render(relationLinks, {
    edgeAnnotations: {
      "source:edge-relazione-02": { label: "Relazione annotata", color: "#123456", dashPattern: "dotted" }
    }
  });
  assert.match(annotated, />ANNOTAZIONI<\/text>/);
  assert.match(annotated, />Relazione annotata<\/text>/);
  assert.match(annotated, /<line x1="0" y1="0" x2="28"[^>]*stroke="#75859a"[^>]*\/><text x="35"[^>]*>relazione-02<\/text>/);
  assert.match(annotated, /stroke="#123456"/);

  const configured = render(relationLinks, { edgeColors: { [relationTypes[8]]: "#123456" } });
  assert.match(configured, /stroke="#123456"/);
  const paletteCollision = render(relationLinks, { edgeColors: { [relationTypes[0]]: "#1a4793" } });
  const ninthRelationColor = pathStyles(paletteCollision).find(([id]) => id === `edge-${relationTypes[8]}`)?.[1];
  assert.notEqual(ninthRelationColor, "#1a4793");

  const nearMaxHeight = buildGraph2DSvg(
    buildGraph2DScene(relationNodes, relationLinks, { height: 8091 }),
    { showLegend: true }
  );
  const outputHeight = Number(nearMaxHeight.match(/<svg[^>]*\bheight="(\d+)"/)?.[1]);
  assert.ok(outputHeight <= 8192);
  assert.match(nearMaxHeight, />Altri tipi: 12<\/text>/);
  assert.match(nearMaxHeight, /12 tipi non mostrati nella legenda per il limite di dimensione/);

  const withoutLegend = buildGraph2DSvg(
    buildGraph2DScene(relationNodes, relationLinks),
    { showLegend: false }
  );
  assert.match(withoutLegend, /height="820" viewBox="0 0 1280 820"/);
});

test("generated relation colors keep their contrast across a larger type palette", () => {
  const relationTypes = Array.from({ length: 80 }, (_, index) => `relazione-${String(index + 1).padStart(3, "0")}`);
  const nodes = Array.from({ length: relationTypes.length + 1 }, (_, index) => ({ id: `n${index}` }));
  const links = relationTypes.map((type, index) => ({
    source: `n${index}`,
    target: `n${index + 1}`,
    sourceId: `edge-${index}`,
    type
  }));
  const svg = buildGraph2DSvg(buildGraph2DScene(nodes, links));
  const colors = [...svg.matchAll(/<path d="[^"]*" fill="none" stroke="([^"]+)"/g)].map(([, color]) => color);

  assert.equal(colors.length, relationTypes.length);
  assert.equal(new Set(colors.slice(8)).size, relationTypes.length - 8);
  assert.ok(colors.every((color) => contrastAgainstWhite(color) >= 3));
});

test("configured group colors take precedence over node types in the 2D export", () => {
  const scene = buildGraph2DScene([
    { id: "a", type: "person" },
    { id: "b", type: "place" }
  ], [{ source: "a", target: "b", type: "link" }], {
    nodeColors: { a: "#123456", b: "#654321" },
    nodeTypeStyles: { person: { color: "#38bdf8" }, place: { color: "#22c55e" } }
  });

  assert.deepEqual(scene.nodes.map((node) => node.color), ["#123456", "#654321"]);
  assert.ok(scene.nodes.every((node) => !node.nodeTypeColor));
  const svg = buildGraph2DSvg(scene, { showLegend: true });
  assert.doesNotMatch(svg, />NODI<\/text>/);
});

test("node type styles use own JSON keys and ignore invalid colors", () => {
  const styles = JSON.parse('{"default":{"color":"#334155"},"__proto__":{"color":"#abcdef"},"constructor":{"color":"red"}}');
  const scene = buildGraph2DScene([
    { id: "proto", type: "__proto__" },
    { id: "constructor", type: "constructor" },
    { id: "inherited", type: "toString" }
  ], [], { nodeTypeStyles: styles });

  assert.deepEqual(scene.nodes.map((node) => node.color), ["#334155", "#334155", "#abcdef"]);
  assert.deepEqual(scene.nodes.map((node) => node.nodeTypeColor), ["#334155", "#334155", "#abcdef"]);
  assert.equal(Object.prototype.polluted, undefined);
});

test("SVG separates reverse directed records and parallel undirected links into visible lanes", () => {
  const pairNodes = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  const directedScene = buildGraph2DScene(pairNodes, [
    { source: "a", target: "b", sourceId: "ab", analysis: { direction: "directed" } },
    { source: "b", target: "a", sourceId: "ba", analysis: { direction: "directed" } }
  ], { graphDirection: "directed" });
  const directedSvg = buildGraph2DSvg(directedScene);
  assert.match(directedSvg, /2 archi diretti, rappresentati con frecce\./);
  const directedPaths = [...directedSvg.matchAll(/<path d="([^"]+)"[^>]*marker-end="url\(#graph-arrow\)"/g)]
    .map((match) => match[1]);
  assert.equal(directedPaths.length, 2);
  assert.ok(directedPaths.every((path) => path.includes(" Q ")),
    "due archi diretti opposti devono incurvarsi invece di condividere la linea retta");
  assert.notEqual(directedPaths[0], directedPaths[1]);
  const controls = directedPaths.map((path) => path.match(/ Q ([\d.-]+) ([\d.-]+) /)?.slice(1).map(Number));
  assert.ok(controls.every(Boolean));
  assert.notDeepEqual(controls[0], controls[1], "le due direzioni devono occupare lati distinti della coppia");

  const undirectedScene = buildGraph2DScene(pairNodes, [
    { source: "a", target: "b", sourceId: "u1", analysis: { direction: "undirected" } },
    { source: "b", target: "a", sourceId: "u2", analysis: { direction: "undirected" } }
  ]);
  const undirectedSvg = buildGraph2DSvg(undirectedScene);
  const undirectedPaths = [...undirectedSvg.matchAll(/<path d="([^"]+)"[^>]*><title>/g)]
    .map((match) => match[1]);
  assert.equal(undirectedPaths.length, 2);
  assert.ok(undirectedPaths.every((path) => path.includes(" Q ")));
  assert.notEqual(undirectedPaths[0], undirectedPaths[1]);
});

test("parallel self-loops use distinct paths in the SVG", () => {
  const scene = buildGraph2DScene([{ id: "a", label: "A" }], [
    { source: "a", target: "a", sourceId: "loop-1" },
    { source: "a", target: "a", sourceId: "loop-2" }
  ]);
  const svg = buildGraph2DSvg(scene);
  const paths = [...svg.matchAll(/<path d="([^"]+)"[^>]*><title>/g)].map((match) => match[1]);
  assert.equal(paths.length, 2);
  assert.notEqual(paths[0], paths[1], "cappi paralleli non devono essere disegnati sulla stessa curva");
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
  assert.match(svg, /1 arco ipotetico tratteggiato; non appartiene al grafo osservato/);
  assert.match(svg, /1 arco osservato · 1 arco proposto/);
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
  assert.match(svg, /0 archi osservati · 1 arco proposto/);
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
  assert.match(svg, /<text aria-hidden="true" x="289\.5" y="123\.5" text-anchor="end"[^>]*fill="#ffffff" stroke="#ffffff" stroke-width="3\.5"/);
  assert.match(svg, /<text x="289\.5" y="123\.5" text-anchor="end"[^>]*fill="#172033"><title>Member 32<\/title>Member 32<\/text>/);

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

test("narrow SVG captions wrap, reserve space for the graph, and keep the full accessible text", () => {
  const scene = buildGraph2DScene([{ id: "a", label: "Nodo A" }], [], {
    width: 240,
    height: 240,
    graphDirection: "undirected"
  });
  const resultLabel = "Partizione ottima 1 · 12 comunità · Qγ=0,2500 · γ=0,75 · pesata · gruppo coorte A";
  const completionLabel = "Ottimo provato · enumerazione completa degli ottimi";
  const fullCaption = `${resultLabel} · ${completionLabel}`;
  const svg = buildGraph2DSvg(scene, { resultLabel, completionLabel });
  const height = Number(svg.match(/<svg[^>]*\bheight="(\d+)"/)?.[1]);
  const description = svg.match(/<desc id="graph-description">([^<]*)<\/desc>/)?.[1] ?? "";

  assert.ok(svg.includes('<tspan x="28" dy="14">'), "le caption estese usano righe SVG dedicate");
  assert.ok(svg.includes('<g transform="translate(0, '), "il disegno del grafo riserva lo spazio delle righe aggiuntive");
  assert.ok(height > scene.height, "l'altezza finale include lo spazio riservato al riepilogo");
  assert.ok(svg.includes(`<title>${fullCaption}</title>`), "il testo completo resta disponibile sul riepilogo visibile");
  assert.ok(description.includes(fullCaption), "la descrizione accessibile conserva il riepilogo completo");
});

test("long Unicode captions wrap without splitting surrogate pairs", () => {
  const scene = buildGraph2DScene([{ id: "a", label: "Nodo A" }], [], {
    width: 240,
    height: 240,
    graphDirection: "undirected"
  });
  const svg = buildGraph2DSvg(scene, { resultLabel: "🧠".repeat(40) });

  assert.doesNotMatch(svg, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
});

test("unselected aggregate 2D summaries explicitly avoid claiming a graph witness", () => {
  const summary = buildGraph2DAnalysisSummary({
    analysisLabel: "Motivo tipizzato",
    resultSummary: "12 istanze",
    completionLabel: "Conteggio completo",
    kind: "aggregate"
  });
  assert.match(summary.resultLabel, /12 istanze/);
  assert.match(summary.resultLabel, /nessun testimone singolo/);
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
  assert.match(svg, /2 .* archi osservati .* 1 arco proposto/);
  assert.match(svg, /1 arco ipotetico tratteggiato; non appartiene al grafo osservato/);
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
