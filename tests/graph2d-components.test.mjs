import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildGraph2DComponentPresentation,
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildConnectedComponentsProgram,
  buildStronglyConnectedComponentsProgram,
  buildWeaklyConnectedComponentsProgram,
  getStructuralSolverOptions,
  parseWitnessComponents,
  parseWitnessStrongComponents,
  parseWitnessWeakComponents
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const graphConfig = (direction) => ({
  schemaVersion: 2,
  graphMapping: {
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      direction,
      identity: "multigraph"
    }
  }
});

async function solvePartition(graph, task, programBuilder, parser) {
  const asp = buildAspFactsFromGraph(graph);
  const result = await (await createClingoWasmRunner()).run(
    `${asp.facts.trim()}\n\n${programBuilder()}\n`,
    getStructuralSolverOptions(task)
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  return parser(result.Call?.[0]?.Witnesses, asp.reverseIndex);
}

const partitionLegend = (presentation, title) => ({
  title,
  items: presentation.legend,
  overflowLabel: "Altri componenti"
});

test("la partizione di componenti connesse calcolata da clingo colora tutti i gruppi nell'export", async () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d", "isolated"].map((id) => ({ id, label: `Nodo ${id}` })),
    edges: [
      { id: "ab", from: "a", to: "b" },
      { id: "cd", from: "c", to: "d" }
    ]
  }, graphConfig("undirected"));
  const components = await solvePartition(graph, "components", buildConnectedComponentsProgram, parseWitnessComponents);
  assert.deepEqual(components, [["a", "b"], ["c", "d"], ["isolated"]]);

  const presentation = buildGraph2DComponentPresentation(components);
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    graphDirection: graph.direction,
    nodeGroupIds: presentation.groupByNodeId,
    nodeColors: presentation.nodeColors
  });
  const svg = buildGraph2DSvg(scene, {
    showLegend: true,
    nodeGroupLegend: partitionLegend(presentation, "COMPONENTI CONNESSE"),
    resultLabel: "Partizione in componenti connesse"
  });

  assert.equal(scene.nodes.length, 5);
  assert.equal(new Set(scene.nodes.map((node) => node.color)).size, 3);
  assert.deepEqual(scene.nodes.map(({ id, nodeGroupId }) => [id, nodeGroupId]), [
    ["a", "p1"], ["b", "p1"], ["c", "p2"], ["d", "p2"], ["isolated", "p3"]
  ]);
  assert.equal(scene.links.length, 2);
  assert.match(svg, /COMPONENTI CONNESSE/);
  assert.match(svg, /Componente 1/);
  assert.match(svg, /Componente 3/);
  assert.match(svg, /graph-description[^>]*>[^<]*COMPONENTI CONNESSE: Componente 1, Componente 2, Componente 3/);
});

test("componenti deboli e forti conservano semantica diretta e restringono la legenda al witness", async () => {
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d", "e"].map((id) => ({ id, label: `Nodo ${id}` })),
    edges: [
      { id: "ab", from: "a", to: "b" },
      { id: "ba", from: "b", to: "a" },
      { id: "bc", from: "b", to: "c" },
      { id: "cd", from: "c", to: "d" },
      { id: "dc", from: "d", to: "c" },
      { id: "ee", from: "e", to: "e" }
    ]
  }, graphConfig("directed"));

  const weakComponents = await solvePartition(graph, "weakComponents", buildWeaklyConnectedComponentsProgram, parseWitnessWeakComponents);
  assert.deepEqual(weakComponents, [["a", "b", "c", "d"], ["e"]]);
  const weakPresentation = buildGraph2DComponentPresentation(weakComponents, "Componente debole");
  const weakWitness = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: ["a", "b", "c", "d"],
    nodeGroupIds: weakPresentation.groupByNodeId,
    nodeColors: weakPresentation.nodeColors
  });
  const weakSvg = buildGraph2DSvg(weakWitness, {
    showLegend: true,
    nodeGroupLegend: partitionLegend(weakPresentation, "COMPONENTI DEBOLI"),
    resultLabel: "Componente debole 1 evidenziato"
  });
  assert.deepEqual(weakWitness.nodes.map((node) => node.id), ["a", "b", "c", "d"]);
  assert.equal(weakWitness.links.length, 5);
  assert.ok(weakWitness.links.every((link) => link.directed));
  assert.match(weakSvg, /COMPONENTI DEBOLI/);
  assert.match(weakSvg, /Componente debole 1/);
  assert.doesNotMatch(weakSvg, /Componente debole 2/);

  const strongComponents = await solvePartition(graph, "strongComponents", buildStronglyConnectedComponentsProgram, parseWitnessStrongComponents);
  assert.deepEqual(strongComponents, [["a", "b"], ["c", "d"], ["e"]]);
  const strongPresentation = buildGraph2DComponentPresentation(strongComponents, "Componente forte");
  const strongWitness = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: ["c", "d"],
    nodeGroupIds: strongPresentation.groupByNodeId,
    nodeColors: strongPresentation.nodeColors
  });
  const strongSvg = buildGraph2DSvg(strongWitness, {
    showLegend: true,
    nodeGroupLegend: partitionLegend(strongPresentation, "COMPONENTI FORTI"),
    resultLabel: "Componente forte 2 evidenziato"
  });
  assert.deepEqual(strongWitness.nodes.map((node) => node.id), ["c", "d"]);
  assert.deepEqual(strongWitness.links.map((link) => link.id), ["cd", "dc"]);
  assert.ok(strongWitness.links.every((link) => link.directed));
  assert.match(strongSvg, /COMPONENTI FORTI/);
  assert.match(strongSvg, /Componente forte 2/);
  assert.doesNotMatch(strongSvg, /Componente forte 1|Componente forte 3/);
  assert.doesNotMatch(strongSvg, /a &#183;|Nodo a|Nodo e/);
});

test("GraphApp passa al pannello 2D la partizione completa dei tre task di componenti", async () => {
  const [graphApp, exportPanel] = await Promise.all([
    readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8")
  ]);
  assert.match(graphApp, /componentPartition=\{!graph2DOverlayResultLabel && showStructuralPanel && \["components", "weakComponents", "strongComponents"\]\.includes\(structuralStats\?\.task \?\? ""\) \? structuralResults : \[\]\}/);
  assert.match(graphApp, /COMPONENTI FORTI/);
  assert.match(graphApp, /COMPONENTI DEBOLI/);
  assert.match(graphApp, /COMPONENTI CONNESSE/);
  assert.match(exportPanel, /\$:\s*exportResultLabel\s*=\s*componentPartition\.length[\s\S]*?\$\{componentPartition\.length\} \$\{componentPartition\.length === 1 \? "componente" : "componenti"\}/);
});

test("legenda delle componenti e delle relazioni resta entro i limiti dell'SVG stretto", () => {
  const presentation = buildGraph2DComponentPresentation([["a"], ["b"]], "Componente debole");
  const scene = buildGraph2DScene(
    [{ id: "a" }, { id: "b" }],
    [{ source: "a", target: "b", type: "relazione" }],
    {
      width: 300,
      height: 320,
      graphDirection: "directed",
      nodeGroupIds: presentation.groupByNodeId,
      nodeColors: presentation.nodeColors
    }
  );
  const svg = buildGraph2DSvg(scene, {
    showLegend: true,
    nodeGroupLegend: partitionLegend(presentation, "COMPONENTI DEBOLI")
  });
  const groupLegendY = Number(/<g transform="translate\(22, (\d+)\)"><rect width="250"/.exec(svg)?.[1]);
  const relationLegendY = Number(/<g transform="translate\(76, (\d+)\)"><rect width="202"/.exec(svg)?.[1]);
  assert.ok(Number.isFinite(groupLegendY) && groupLegendY > 0);
  assert.ok(Number.isFinite(relationLegendY) && relationLegendY > groupLegendY);
  assert.match(svg, /viewBox="0 0 300 320"/);
});
