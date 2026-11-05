import { readFile, writeFile } from "node:fs/promises";
import {
  buildGraph2DScene,
  buildGraph2DSvg,
  countGraph2DNodeLabelOverlaps
} from "../../src/lib/kliqueasp/graph/graph2dExport.ts";

const karate = JSON.parse(await readFile("src/lib/kliqueasp/data/examples/karate-club.json", "utf8"));
const sparseWitnessIds = karate.nodes.slice(0, 5).map((node) => node.id);
const sparseWitnessSet = new Set(sparseWitnessIds);
const sparseAnnotations = Object.fromEntries(sparseWitnessIds.map((id) => [id, "nodo selezionato"]));
const sparseHighlightedEdges = karate.edges
  .filter((edge) => sparseWitnessSet.has(edge.source) && sparseWitnessSet.has(edge.target))
  .map((edge) => edge.sourceId ?? edge.id)
  .filter(Boolean);
const sparseScene = buildGraph2DScene(karate.nodes, karate.edges, {
  graphDirection: "undirected",
  highlightedNodeIds: sparseWitnessIds,
  highlightedEdgeIds: sparseHighlightedEdges,
  nodeAnnotations: sparseAnnotations,
  seed: 7
});
const sparseSvg = buildGraph2DSvg(sparseScene, {
  title: "Karate Club — proiezione sparsa",
  scopeLabel: "Rete completa · 34 nodi · 78 relazioni",
  resultLabel: "Selezione illustrativa",
  completionLabel: "Etichette, legenda e annotazioni",
  showLabels: true,
  showLegend: true,
  showAnnotations: true
});

const denseNodes = Array.from({ length: 28 }, (_, index) => ({
  id: "dense-" + (index + 1),
  label: "Nodo " + String(index + 1).padStart(2, "0"),
  type: index % 2 === 0 ? "ricercatore" : "centro"
}));
const denseLinks = [];
let denseEdgeIndex = 0;
for (let source = 0; source < denseNodes.length; source += 1) {
  for (let target = source + 1; target < denseNodes.length; target += 1) {
    if ((source * 13 + target * 7) % 4 === 0) continue;
    denseEdgeIndex += 1;
    denseLinks.push({
      source: denseNodes[source].id,
      target: denseNodes[target].id,
      sourceId: "dense-edge-" + denseEdgeIndex,
      type: (source + target) % 3 === 0 ? "collaborazione" : "co-autorship"
    });
  }
}
const denseAnnotations = Object.fromEntries(denseNodes.slice(0, 4).map((node, index) =>
  [node.id, "gruppo " + (index % 2 === 0 ? "A" : "B")]));
const denseScene = buildGraph2DScene(denseNodes, denseLinks, {
  graphDirection: "undirected",
  highlightedNodeIds: denseNodes.slice(0, 4).map((node) => node.id),
  nodeAnnotations: denseAnnotations,
  seed: 11
});
const denseSvg = buildGraph2DSvg(denseScene, {
  title: "Rete densa — esempio sintetico",
  scopeLabel: "Esempio sintetico · 28 nodi · " + denseLinks.length + " relazioni",
  resultLabel: "Due tipi di relazione",
  completionLabel: "Prova di leggibilità in stampa",
  showLabels: true,
  showLegend: true,
  showAnnotations: true
});

await writeFile("tmp/pdfs/graph2d-sparse.svg", sparseSvg, "utf8");
await writeFile("tmp/pdfs/graph2d-dense.svg", denseSvg, "utf8");
console.log(JSON.stringify({
  sparse: {
    nodes: sparseScene.nodes.length,
    edges: sparseScene.links.length,
    labelOverlaps: countGraph2DNodeLabelOverlaps(sparseScene, { showLabels: true, showAnnotations: true }),
    svgBytes: Buffer.byteLength(sparseSvg, "utf8")
  },
  dense: {
    nodes: denseScene.nodes.length,
    edges: denseScene.links.length,
    labelOverlaps: countGraph2DNodeLabelOverlaps(denseScene, { showLabels: true, showAnnotations: true }),
    svgBytes: Buffer.byteLength(denseSvg, "utf8")
  }
}, null, 2));
