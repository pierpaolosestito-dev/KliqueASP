import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildContextualCliqueGraph2DOverlay } from "../src/lib/kliqueasp/graph/contextualCliqueGraph2D.ts";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { parseKliqueAspProject } from "../src/lib/kliqueasp/graph/projectFile.ts";
import {
  buildContextualCliqueIncidenceIndex,
  buildContextualCliqueProgram,
  parseContextualCliqueResults,
  validateContextualCliqueConfig
} from "../src/lib/kliqueasp/graph/contextualCliqueTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const projectFixture = parseKliqueAspProject(JSON.parse(readFileSync(new URL("./fixtures/contextual-clique-project.json", import.meta.url), "utf8")));
const config = validateContextualCliqueConfig(projectFixture.graphConfig.graphAnalysis.contextualClique);
function makeGraph() {
  return normalizeGraphData(projectFixture.graphData, projectFixture.graphConfig);
}

test("un risultato clingo contestuale diventa un export 2D con soli nodi e archi witness reali", async () => {
  const graph = makeGraph();
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const facts = buildAspFactsFromGraph(graph);
  const incidenceIndex = buildContextualCliqueIncidenceIndex(graph, config, facts.indexByNodeId);
  const program = buildContextualCliqueProgram(config, graph.direction);
  const runner = await createClingoWasmRunner();
  const solved = await runner.run(`${facts.facts}\n${program}`, ["--opt-mode=optN"]);
  assert.equal(solved.Result, "OPTIMUM FOUND", solved.Error ?? JSON.stringify(solved));

  const results = parseContextualCliqueResults(
    solved.Call?.[0]?.Witnesses,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    incidenceIndex,
    config.minimumSize
  );
  const result = results[0];
  assert.ok(result, "clingo must return a verified contextual group");
  assert.deepEqual(result.sourceNodeIds.sort(), ["p1", "p2", "p3"]);

  const overlay = buildContextualCliqueGraph2DOverlay(result, graph.links);
  const scene = buildGraph2DScene(graph.nodes, graph.links, {
    mode: "witness",
    graphDirection: graph.direction,
    highlightedNodeIds: overlay.nodeIds,
    highlightedEdgeIds: overlay.edgeIds,
    nodeAnnotations: overlay.nodeAnnotations,
    edgeAnnotations: overlay.edgeAnnotations
  });
  const expectedNodeIds = [...new Set([
    ...result.nodeIds,
    ...result.pairWitnesses.map(({ contextNodeId }) => contextNodeId)
  ])].sort();
  const expectedEdgeIds = [...new Set(result.pairWitnesses.flatMap(({ supportingEdges }) =>
    supportingEdges.map(({ edgeId }) => edgeId)
  ))].sort();

  assert.deepEqual(scene.nodes.map(({ id }) => id).sort(), expectedNodeIds);
  assert.deepEqual(scene.links.map(({ id }) => id).sort(), expectedEdgeIds);
  assert.equal(scene.nodes.some(({ label }) => label === "Persona esclusa"), false);
  assert.ok(scene.nodes.filter(({ id }) => result.nodeIds.includes(id))
    .every(({ annotation }) => annotation.includes("Nodo focale del gruppo contestuale")));
  assert.ok(scene.nodes.filter(({ id }) => result.pairWitnesses.some((pair) => pair.contextNodeId === id))
    .every(({ annotation }) => annotation.includes("Contesto che sostiene una coppia")));
  assert.ok(scene.links.every(({ selected, type, annotation }) =>
    selected && type === "person-place" && annotation?.label === "Relazione di supporto contestuale"));

  const svg = buildGraph2DSvg(scene, {
    showLabels: true,
    showNodeIds: true,
    showAnnotations: true,
    showLegend: true,
    resultLabel: overlay.resultLabel,
    completionLabel: "Ottimo provato · enumerazione degli ottimi completa"
  });
  assert.match(svg, /Gruppo contestuale · 3 nodi focali/);
  assert.match(svg, /enumerazione degli ottimi completa/);
  assert.match(svg, /Persona 1/);
  assert.match(svg, /Luogo A/);
  assert.match(svg, /Relazione di supporto contestuale/);
  assert.doesNotMatch(svg, /Persona esclusa/);
});

test("un nodo che ha entrambi i ruoli mantiene tutte le annotazioni", () => {
  const overlay = buildContextualCliqueGraph2DOverlay({
    nodeIds: ["n1", "n2", "n3"],
    sourceNodeIds: ["n1", "n2", "n3"],
    pairWitnesses: [{
      focusNodeIds: ["n1", "n2"],
      focusSourceIds: ["n1", "n2"],
      contextNodeId: "n1",
      contextSourceId: "n1",
      supportingEdges: []
    }]
  }, []);
  assert.match(overlay.nodeAnnotations.n1, /Nodo focale del gruppo contestuale/);
  assert.match(overlay.nodeAnnotations.n1, /Contesto che sostiene una coppia/);
});

test("il comando contestuale collega l'evidenza alla vista 2D e all'export", () => {
  const graphApp = readFileSync(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");
  const start = graphApp.indexOf("  function highlightContextualClique(");
  const end = graphApp.indexOf("\n  function ", start + 1);
  const handler = graphApp.slice(start, end);

  assert.notEqual(start, -1, "GraphApp must define the contextual result handler");
  assert.match(handler, /buildContextualCliqueGraph2DOverlay\(result, data\?\.links \?\? \[\]\)/);
  assert.match(handler, /showGraph2DExportPanel\s*=\s*true/);
  assert.match(handler, /graph2DOverlayResultLabel\s*=\s*overlay\.resultLabel/);
  assert.match(panel, /Evidenzia in 3D e apri la vista 2D/);
});

test("cambiare i criteri contestuali scarta i risultati e il witness della ricerca precedente", () => {
  const graphApp = readFileSync(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  const motifPanel = readFileSync(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");
  const clearStart = graphApp.indexOf("  function clearContextualCliqueResultAndFocus() {");
  const clearEnd = graphApp.indexOf("\n  }", clearStart);
  const clearHandler = graphApp.slice(clearStart, clearEnd);

  assert.match(panel, /bind:value=\{selectedGroup\}[^>]*on:change=\{criteriaChanged\}/);
  assert.match(panel, /bind:checked=\{enumerateAllOptima\}[^>]*on:change=\{criteriaChanged\}/);
  assert.match(panel, /if \(hasRun \|\| results\.length > 0\) criteriaChangedAfterRun = true/);
  assert.match(panel, /Criteri modificati: rilancia la ricerca per aggiornare il risultato/);
  assert.match(panel, /criteriaChangedAfterRun = false;\s+expandedResultKey = null;\s+dispatch\("run"/);
  assert.match(motifPanel, /on:criteriaChange=\{\(\) => dispatch\("clearContextualClique"\)\}/);
  assert.match(graphApp, /on:clearContextualClique=\{clearContextualCliqueResultAndFocus\}/);
  assert.match(clearHandler, /clearContextualCliqueAnalysis\(\);/);
  assert.match(clearHandler, /clearGraphAnalysisFocus\(\);/);
});
