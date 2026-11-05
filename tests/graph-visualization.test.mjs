import assert from "node:assert/strict";
import test from "node:test";
import psychologyDataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import psychologyGraphConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import {
  buildGraphDisplayLinkCurves,
  formatGraphDisplayEdgeTypeTooltip,
  formatGraphDisplayLinkTooltip,
  getGraphDisplayEdgeTypeColor,
  getGraphDisplayEdgeTypeLegend,
  getGraphDisplayEdgeType,
  getGraphDisplayNodeTypeLegend,
  getGraphDisplayLinkColor,
  getGraphNeighborhoodNodeIds,
  graphDisplayLinkMatchesIdentities,
  prepareGraphDisplayLinks
} from "../src/lib/kliqueasp/graph/graphVisualization.ts";
import { normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { getStructuralEdgeIdentity } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { readFile } from "node:fs/promises";

const identity = (link) => getStructuralEdgeIdentity(link);
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("parallel graph records use distinct stable 3D lanes without changing source links", () => {
  const reciprocalLinks = [
    { source: "a", target: "b", sourceId: "ab", analysis: { direction: "directed" } },
    { source: "b", target: "a", sourceId: "ba", analysis: { direction: "directed" } }
  ];
  const originalLinks = structuredClone(reciprocalLinks);
  const reciprocalCurves = buildGraphDisplayLinkCurves(reciprocalLinks);
  const reciprocalValues = reciprocalLinks.map((link) => reciprocalCurves.get(link));
  assert.ok(reciprocalValues.every((value) => value && value.curvature !== 0));
  const curveSideOffsets = reciprocalLinks.map((link, index) =>
    (link.source === "a" ? -1 : 1) * reciprocalValues[index].curvature
  );
  assert.equal(curveSideOffsets[0], -curveSideOffsets[1],
    "gli archi opposti devono curvare su lati distinti anche se usano la stessa coppia ordinata");

  const sameDirectionLinks = [
    { source: "a", target: "b", sourceId: "ab-1" },
    { source: "a", target: "b", sourceId: "ab-2" }
  ];
  const sameDirectionCurves = buildGraphDisplayLinkCurves(sameDirectionLinks);
  assert.equal(new Set(sameDirectionLinks.map((link) => sameDirectionCurves.get(link)?.curvature)).size, 2);
  assert.deepEqual(reciprocalLinks, originalLinks, "la geometria di presentazione non deve mutare i record sorgente");
});

test("a single self-loop is visible and parallel self-loops occupy separate rotations", () => {
  const singleLoop = { source: "a", target: "a", sourceId: "loop-1" };
  const singleCurve = buildGraphDisplayLinkCurves([singleLoop]).get(singleLoop);
  assert.equal(singleCurve?.curvature, 0.45);
  assert.equal(singleCurve?.rotation, 0);

  const parallelLoops = [
    { source: "a", target: "a", sourceId: "loop-1" },
    { source: "a", target: "a", sourceId: "loop-2" },
    { source: "a", target: "a", sourceId: "loop-3" }
  ];
  const curves = buildGraphDisplayLinkCurves(parallelLoops);
  const values = parallelLoops.map((link) => curves.get(link));
  assert.ok(values.every((value) => value?.curvature === 0.45));
  assert.equal(new Set(values.map((value) => value?.rotation)).size, parallelLoops.length);
});

test("the 3D renderer applies computed curve lanes to the currently displayed links", () => {
  assert.match(graphApp, /graphDisplayLinkCurves = buildGraphDisplayLinkCurves\(displayLinks\)/);
  assert.match(graphApp, /linkCurvature\(\(link: GraphDisplayLink\) => graphDisplayLinkCurves\.get\(link\)\?\.curvature \?\? 0\)/);
  assert.match(graphApp, /linkCurveRotation\(\(link: GraphDisplayLink\) => graphDisplayLinkCurves\.get\(link\)\?\.rotation \?\? 0\)/);
});

test("colori e legenda degli archi usano soltanto tipi presenti e colori dichiarati", () => {
  const links = [
    { source: "a", target: "b", type: "mentorship", analysis: { type: "mentorship" } },
    { source: "b", target: "c", analysis: { type: " collaboration " } },
    { source: "c", target: "d", analysis: { type: "mentorship" } },
    { source: "d", target: "e", analysis: { type: "unmapped" } },
    { source: "e", target: "f", type: "source-type", analysis: { type: "" } }
  ];
  const colors = { collaboration: " #38bdf8 ", mentorship: "#f59e0b", absent: "#fff" };

  assert.equal(getGraphDisplayEdgeType(links[0]), "mentorship");
  assert.equal(getGraphDisplayEdgeType(links[1]), "collaboration");
  assert.equal(getGraphDisplayEdgeType(links[4]), "source-type");
  assert.equal(getGraphDisplayEdgeTypeColor(links[1], colors), "#38bdf8");
  assert.equal(getGraphDisplayEdgeTypeColor(links[3], colors), null);
  assert.equal(getGraphDisplayEdgeTypeColor(links[0], ["#fff"]), null);
  assert.equal(getGraphDisplayLinkColor(links[1], colors), "#38bdf8");
  assert.equal(getGraphDisplayLinkColor(links[3], colors), "#ffffff");
  assert.equal(getGraphDisplayLinkColor(links[3], colors, "#334155"), "#334155");
  assert.deepEqual(getGraphDisplayEdgeTypeLegend(links, colors), [
    { type: "collaboration", color: "#38bdf8" },
    { type: "mentorship", color: "#f59e0b" }
  ]);
  assert.deepEqual(getGraphDisplayEdgeTypeLegend(links, null), []);
});

test("il caso Psicologia colora le due etichette d'arco letterali senza alterare la proiezione", () => {
  const graph = normalizeGraphData(psychologyDataset, psychologyGraphConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.length, 335);
  assert.equal(graph.links.length, 989);

  const colors = psychologyGraphConfig.colors.edgeTypes;
  assert.deepEqual(getGraphDisplayEdgeTypeLegend(graph.links, colors), [
    { type: "person-person", color: "#38bdf8" },
    { type: "person-place", color: "#f472b6" }
  ]);
  assert.equal(getGraphDisplayEdgeTypeColor(
    graph.links.find((link) => link.analysis?.type === "person-person"),
    colors
  ), "#38bdf8");
  assert.equal(getGraphDisplayEdgeTypeColor(
    graph.links.find((link) => link.analysis?.type === "person-place"),
    colors
  ), "#f472b6");
  assert.deepEqual(getGraphDisplayNodeTypeLegend(graph.nodes, psychologyGraphConfig.nodeTypes), [
    { type: "person", label: "person", color: "#38bdf8" },
    { type: "place", label: "place", color: "#22c55e" }
  ]);
});

test("la legenda dei nodi usa solo tipi presenti, eredita il colore predefinito e protegge le chiavi JSON", () => {
  const styles = JSON.parse('{"default":{"color":"#334155"},"constructor":{"color":"#f59e0b"},"place":{"size":8}}');
  const nodes = [
    { id: "1", type: "place" },
    { id: "2", type: "constructor" },
    { id: "3", type: "__proto__" },
    { id: "4", analysis: { type: "person" } },
    { id: "5" },
    { id: "6", type: "place" }
  ];

  assert.deepEqual(getGraphDisplayNodeTypeLegend(nodes, styles), [
    { type: "__proto__", label: "__proto__", color: "#334155" },
    { type: "constructor", label: "constructor", color: "#f59e0b" },
    { type: "person", label: "person", color: "#334155" },
    { type: "place", label: "place", color: "#334155" },
    { type: "default", label: "Senza tipo", color: "#334155" }
  ]);
  assert.deepEqual(getGraphDisplayNodeTypeLegend(nodes, null), []);
  assert.deepEqual(getGraphDisplayNodeTypeLegend([{ type: "person" }], { person: {} }), []);
});

test("il colore predefinito dei nodi resta distinguibile dallo sfondo del canvas", () => {
  const color = psychologyGraphConfig.nodeTypes.default.color;
  const background = psychologyGraphConfig.graph.backgroundColor;
  const luminance = (hex) => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255);
    const [r, g, b] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const foregroundLuminance = luminance(color);
  const backgroundLuminance = luminance(background);
  const contrast = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);

  assert.ok(contrast >= 3, `Il contrasto dei nodi predefiniti e' ${contrast.toFixed(2)}:1.`);
});

test("colori degli archi rispettano chiavi JSON riservate senza ereditare dal prototipo", () => {
  const colors = JSON.parse('{"__proto__":"#123456","constructor":"#654321"}');
  assert.equal(getGraphDisplayEdgeTypeColor({ analysis: { type: "__proto__" } }, colors), "#123456");
  assert.equal(getGraphDisplayEdgeTypeColor({ analysis: { type: "toString" } }, colors), null);
  assert.deepEqual(getGraphDisplayEdgeTypeLegend([
    { analysis: { type: "constructor" } },
    { analysis: { type: "__proto__" } }
  ], colors), [
    { type: "__proto__", color: "#123456" },
    { type: "constructor", color: "#654321" }
  ]);
});

test("tooltip degli archi espone etichetta, direzione e identità come testo semplice", () => {
  assert.equal(
    formatGraphDisplayEdgeTypeTooltip({
      source: { id: "a" },
      target: "b",
      sourceId: "edge-1",
      analysis: { type: "collaboration", direction: "directed" }
    }),
    "Tipo: collaboration; a → b; ID: edge-1"
  );
  assert.equal(
    formatGraphDisplayEdgeTypeTooltip({
      source: "b",
      target: "a",
      analysis: { type: "mentorship" }
    }, "directed"),
    "Tipo: mentorship; b → a"
  );
  assert.equal(formatGraphDisplayEdgeTypeTooltip({ source: "a", target: "b" }), "Arco; a — b");
});

test("display neighborhood focus respects hop radius and weak/outgoing/incoming direction", () => {
  const nodes = ["a", "b", "c", "d", "isolated"];
  const links = [
    { source: "a", target: "b", analysis: { direction: "directed" } },
    { source: { id: "b" }, target: { id: "c" }, analysis: { direction: "undirected" } },
    { source: "d", target: "c", analysis: { direction: "directed" } },
    { source: "c", target: "c", analysis: { direction: "directed" } },
    { source: "a", target: "b", analysis: { direction: "directed" } }
  ];
  const originalLinks = structuredClone(links);
  const focus = (root, maxHops, direction) => getGraphNeighborhoodNodeIds(nodes, links, root, {
    maxHops,
    direction,
    defaultGraphDirection: "directed"
  });

  assert.deepEqual([...focus("a", 0, "weak")], ["a"]);
  assert.deepEqual([...focus("a", 2, "weak")].sort(), ["a", "b", "c"]);
  assert.deepEqual([...focus("a", 2, "outgoing")].sort(), ["a", "b", "c"]);
  assert.deepEqual([...focus("c", 1, "outgoing")].sort(), ["b", "c"]);
  assert.deepEqual([...focus("c", 2, "incoming")].sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(links, originalLinks);
  assert.ok(!focus("a", 3, "weak").has("isolated"));
});

test("display neighborhood focus supports radii beyond three on longer graph paths", () => {
  const nodes = ["a", "b", "c", "d", "e", "f"];
  const links = nodes.slice(1).map((target, index) => ({ source: nodes[index], target }));
  const focus = (maxHops) => getGraphNeighborhoodNodeIds(nodes, links, "a", {
    maxHops,
    direction: "weak",
    defaultGraphDirection: "undirected"
  });

  assert.deepEqual([...focus(3)], ["a", "b", "c", "d"]);
  assert.deepEqual([...focus(5)], nodes);
  assert.deepEqual([...focus(nodes.length)], nodes);
});

test("display neighborhood focus validates its visible domain and traversal parameters", () => {
  const nodes = ["a", "b"];
  const links = [{ source: "a", target: "b" }];
  const base = { maxHops: 1, direction: "weak" };

  assert.throws(() => getGraphNeighborhoodNodeIds(nodes, links, "missing", base), /dominio visibile/);
  assert.throws(() => getGraphNeighborhoodNodeIds(nodes, links, "a", { ...base, maxHops: -1 }), /maxHops/);
  assert.throws(() => getGraphNeighborhoodNodeIds(nodes, links, "a", { ...base, direction: "sideways" }), /direzione/);
  assert.throws(() => getGraphNeighborhoodNodeIds(["a", "a"], links, "a", base), /ID stringa univoci/);
});

test("aggregazione visuale undirected unisce record equivalenti e conserva identità e sorgenti", () => {
  const links = [
    { source: "a", target: "b", sourceId: "contact-1", type: "contact", analysis: { id: "contact-1", direction: "undirected", type: "contact", validity: { from: 10, to: 20 }, provenance: "study-a", attributes: { setting: "office" } } },
    { source: "b", target: "a", sourceId: "contact-2", type: "contact", analysis: { id: "contact-2", direction: "undirected", type: "contact", validity: { from: 20, to: 30 }, provenance: "study-b", attributes: { setting: "office" } } }
  ];

  const displayLinks = prepareGraphDisplayLinks(links, {
    aggregateParallelEdges: true,
    getIdentity: identity
  });

  assert.equal(displayLinks.length, 1);
  assert.equal(displayLinks[0].visualRecordCount, 2);
  assert.deepEqual(displayLinks[0].visualSourceIds, ["contact-1", "contact-2"]);
  assert.deepEqual(displayLinks[0].visualSourceEdgeIdentities, ["source:contact-1", "source:contact-2"]);
  assert.equal(formatGraphDisplayLinkTooltip(displayLinks[0]), "2 record di contatto aggregati solo nella vista; ID: contact-1, contact-2.");
  assert.equal(graphDisplayLinkMatchesIdentities(displayLinks[0], new Set(["source:contact-2"]), identity), true);
  assert.deepEqual(links[0].source, "a");
  assert.deepEqual(links[0].analysis.validity, { from: 10, to: 20 });
});

test("aggregazione mantiene separati direzione, relazione e attributi semantici", () => {
  const links = [
    { source: "a", target: "b", sourceId: "u", type: "contact", analysis: { direction: "undirected", type: "contact", attributes: { sign: "+" } } },
    { source: "b", target: "a", sourceId: "d-reverse", type: "contact", analysis: { direction: "directed", type: "contact", attributes: { sign: "+" } } },
    { source: "a", target: "b", sourceId: "d-forward", type: "contact", analysis: { direction: "directed", type: "contact", attributes: { sign: "+" } } },
    { source: "a", target: "b", sourceId: "other-type", type: "message", analysis: { direction: "undirected", type: "message", attributes: { sign: "+" } } },
    { source: "a", target: "b", sourceId: "other-sign", type: "contact", analysis: { direction: "undirected", type: "contact", attributes: { sign: "-" } } },
    { source: "a", target: "b", sourceId: "other-weight", type: "contact", analysis: { direction: "undirected", type: "contact", attributes: { sign: "+" }, weight: 2 } }
  ];

  const displayLinks = prepareGraphDisplayLinks(links, {
    aggregateParallelEdges: true,
    getIdentity: identity
  });

  assert.equal(displayLinks.length, 6);
  assert.deepEqual(displayLinks.map((link) => link.visualSourceIds[0]), ["u", "d-reverse", "d-forward", "other-type", "other-sign", "other-weight"]);
});

test("tooltip limita gli ID mostrati ma conserva nel conteggio quelli omessi", () => {
  const links = Array.from({ length: 7 }, (_, index) => ({
    source: "a",
    target: "b",
    sourceId: `record-${index + 1}`,
    analysis: { direction: "undirected", validity: { from: index, to: index + 1 } }
  }));
  const [displayLink] = prepareGraphDisplayLinks(links, {
    aggregateParallelEdges: true,
    getIdentity: identity
  });

  assert.equal(displayLink.visualRecordCount, 7);
  assert.equal(formatGraphDisplayLinkTooltip(displayLink), "7 record di contatto aggregati solo nella vista; ID: record-1, record-2, record-3, record-4, record-5, altri 2.");
  assert.equal(displayLink.visualSourceIds.length, 7);
});

test("tooltip mostra l'ID anche quando la linea visuale rappresenta un solo record", () => {
  const [displayLink] = prepareGraphDisplayLinks([
    { source: "a", target: "b", sourceId: "single-contact", analysis: { direction: "undirected" } }
  ], {
    aggregateParallelEdges: true,
    getIdentity: identity
  });

  assert.equal(formatGraphDisplayLinkTooltip(displayLink), "1 record di contatto; ID: single-contact.");
});

test("aggregazione disattivata lascia invariati array e oggetti del renderer", () => {
  const links = [{ source: "a", target: "b", sourceId: "one", analysis: { direction: "undirected" } }];
  const displayLinks = prepareGraphDisplayLinks(links, {
    aggregateParallelEdges: false,
    getIdentity: identity
  });

  assert.equal(displayLinks, links);
  assert.equal(displayLinks[0], links[0]);
  assert.equal(graphDisplayLinkMatchesIdentities(links[0], new Set(["source:one"]), identity), true);
});
