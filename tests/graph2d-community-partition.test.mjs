import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGraph2DCommunityPresentation,
  buildGraph2DScene,
  buildGraph2DSvg
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import {
  buildMaximumModularityProgram,
  buildModularityFacts,
  getStructuralSolverOptions,
  parseWitnessModularityPartitions,
  selectMaximumModularityPartitions
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("una partizione ASP di comunità conserva assegnazioni, colori e legenda nell'SVG 2D", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  const aspEdges = [
    { source: 1, target: 2 },
    { source: 1, target: 3 },
    { source: 2, target: 3 },
    { source: 4, target: 5 }
  ];
  const graph = {
    nodes: ids.map((id) => ({ id, sourceId: `source-${id}`, label: `Nodo ${id.toUpperCase()}` })),
    links: aspEdges.map((edge, index) => ({
      source: ids[edge.source - 1],
      target: ids[edge.target - 1],
      sourceId: `edge-${index + 1}`
    }))
  };
  const reverseIndex = Object.fromEntries(ids.map((id, index) => [index + 1, id]));
  const facts = buildModularityFacts(ids.map((_, index) => index + 1), aspEdges);
  const solved = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${buildMaximumModularityProgram()}\n`,
    getStructuralSolverOptions("communities")
  );
  assert.equal(solved.Result, "OPTIMUM FOUND", solved.Error ?? JSON.stringify(solved));

  const optima = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(solved.Call?.[0]?.Witnesses, reverseIndex)
  );
  assert.ok(optima.length > 0, "clingo deve restituire una partizione ottima interpretabile");
  const communities = optima[0].communities;
  assert.deepEqual(communities, [["a", "b", "c"], ["d", "e"]]);

  const presentation = buildGraph2DCommunityPresentation(communities);
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "projection",
    graphDirection: "undirected",
    communityByNodeId: presentation.communityByNodeId,
    nodeColors: presentation.nodeColors,
    seed: 19
  });
  const svg = buildGraph2DSvg(scene, {
    title: "Partizione di modularità",
    scopeLabel: "Proiezione corrente",
    showLabels: true,
    showLegend: true,
    communityLegend: presentation.communityLegend,
    resultLabel: "Partizione ottima · 2 comunità",
    completionLabel: "Ottimo provato · partizione completa"
  });

  assert.deepEqual(scene.nodes.map(({ id }) => id).sort(), ids);
  assert.deepEqual(scene.nodes.map(({ id, communityId }) => [id, communityId]).sort(([a], [b]) => a.localeCompare(b)), [
    ["a", "c1"], ["b", "c1"], ["c", "c1"], ["d", "c2"], ["e", "c2"]
  ]);
  const firstColor = scene.nodes.find(({ id }) => id === "a")?.color;
  const secondColor = scene.nodes.find(({ id }) => id === "d")?.color;
  assert.ok(firstColor && secondColor && firstColor !== secondColor);
  assert.equal(scene.nodes.find(({ id }) => id === "c")?.color, firstColor);
  assert.equal(scene.nodes.find(({ id }) => id === "e")?.color, secondColor);
  assert.equal(scene.links.length, graph.links.length);
  assert.ok(scene.links.every(({ selected, hypothetical, absence }) => !selected && !hypothetical && !absence));
  assert.match(svg, /COMUNITÀ/);
  assert.match(svg, /Comunità 1/);
  assert.match(svg, /Comunità 2/);
  assert.match(svg, /graph-description[^>]*>[^<]*Comunità colorate: Comunità 1, Comunità 2/);
  assert.match(svg, /Nodo A/);
  assert.match(svg, /Nodo E/);
  assert.match(svg, /Ottimo provato · partizione completa/);
});

test("la presentazione delle comunità tratta gli ID riservati come normali chiavi dati", () => {
  const presentation = buildGraph2DCommunityPresentation([["__proto__", "constructor", "toString"]]);

  for (const id of ["__proto__", "constructor", "toString"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(presentation.communityByNodeId, id), true);
    assert.equal(presentation.communityByNodeId[id], "c1");
    assert.equal(Object.prototype.hasOwnProperty.call(presentation.nodeColors, id), true);
    assert.match(presentation.nodeColors[id], /^#[\da-f]{6}$/i);
  }
});
