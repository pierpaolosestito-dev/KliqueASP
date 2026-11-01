import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const graphApp = readFileSync(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const graph2DExportPanel = readFileSync(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");

function getTopLevelAsyncFunction(name) {
  const marker = `  async function ${name}(`;
  const start = graphApp.indexOf(marker);
  assert.notEqual(start, -1, `GraphApp must define ${name}`);
  const next = graphApp.indexOf("\n  async function ", start + marker.length);
  return graphApp.slice(start, next === -1 ? graphApp.length : next);
}

function getComponentSection(startTag, endTag) {
  const start = graphApp.indexOf(startTag);
  assert.notEqual(start, -1, `GraphApp must render ${startTag}`);
  const end = graphApp.indexOf(endTag, start + startTag.length);
  assert.notEqual(end, -1, `GraphApp must render ${endTag} after ${startTag}`);
  return graphApp.slice(start, end);
}

function getEventHandlerBlock(componentSection, eventName) {
  const marker = `on:${eventName}=`;
  const start = componentSection.indexOf(marker);
  assert.notEqual(start, -1, `component must handle ${eventName}`);
  const nextHandler = componentSection.indexOf("\n  on:", start + marker.length);
  const elementEnd = componentSection.indexOf("\n/>", start + marker.length);
  const ends = [nextHandler, elementEnd].filter((index) => index !== -1);
  return componentSection.slice(start, ends.length ? Math.min(...ends) : componentSection.length);
}

const queryFunctions = [
  "runMaximumClique",
  "explainMaximumCliqueMembership",
  "explainMaximumKPlexMembership",
  "searchKPlexMaximumMembershipCounterfactual",
  "runTypedPathCounterfactual",
  "runKPlexCompletionCounterfactual",
  "runKCoreCompletionCounterfactual",
  "runKCoreMembershipCompletionCounterfactual",
  "probeCommunityPairOptimumMembership",
  "runCommunityTopologyCounterfactual",
  "runStructuralAnalysis",
  "runProvenanceScenarioCliqueComparison",
  "runProvenanceScenarioKCoreComparison",
  "runProvenanceScenarioKPlexComparison",
  "runProvenanceScenarioComponentComparison",
  "runProvenanceScenarioDominatingSetComparison",
  "runIntegrityAnalysis",
  "runTypedMotifAnalysis",
  "compareProvenanceScenarioMotifs",
  "countTypedMotifMatches",
  "runSignedTriadAnalysis",
  "compareSignedTriadScenarios",
  "runTypedMotifNearMatch",
  "runTypedMotifCompletionCounterfactual",
  "runContextualClique",
  "runIntegrityRepair"
];

test("starting a new analysis clears a previous 2D overlay before validation or solving", () => {
  for (const name of queryFunctions) {
    const body = getTopLevelAsyncFunction(name);
    assert.match(body, /clearGraph(?:AnalysisFocus|2DOverlay)\(\)|clearMotifAnalysis\(\)|clearSignedTriadAnalysis\(\)/,
      `${name} must clear prior 2D output`);
  }
});

test("selecting a result witness clears overlays from the previously selected analysis", () => {
  const solver = getComponentSection("<SolverPanel", "<ProvenanceScenarioAnalysisPanel");
  for (const eventName of ["highlight", "highlightMembershipWitness"]) {
    assert.match(getEventHandlerBlock(solver, eventName), /clearGraph2DOverlay\(\)/,
      `SolverPanel ${eventName} must clear the previous 2D overlay`);
  }

  const provenance = getComponentSection("<ProvenanceScenarioAnalysisPanel", "<StructuralAnalysisPanel");
  assert.match(getEventHandlerBlock(provenance, "highlight"), /clearGraph2DOverlay\(\)/,
    "scenario witness selection must clear the previous 2D overlay");

  const structural = getComponentSection("<StructuralAnalysisPanel", "<IntegrityPanel");
  for (const eventName of [
    "highlightCommunity",
    "highlightKCore",
    "highlightKCoreProfile",
    "highlightKCorePeeling",
    "highlightDominatingSet",
    "highlightTypedPath"
  ]) {
    assert.match(getEventHandlerBlock(structural, eventName), /clearGraph2DOverlay\(\)/,
      `StructuralAnalysisPanel ${eventName} must clear the previous 2D overlay`);
  }

  const contextualClique = graphApp.slice(
    graphApp.indexOf("  function highlightContextualClique("),
    graphApp.indexOf("\n  function ", graphApp.indexOf("  function highlightContextualClique(") + 1)
  );
  assert.match(contextualClique, /clearGraph2DOverlay\(\)/,
    "contextual clique selection must clear the previous 2D overlay before building its own");
});

test("the 2D export only uses structural annotations for the active structural panel", () => {
  const resetStart = graphApp.indexOf("  function clearGraph2DOverlay() {");
  const resetEnd = graphApp.indexOf("\n  function ", resetStart + 1);
  const resetBody = graphApp.slice(resetStart, resetEnd);
  assert.match(resetBody, /graph2DCommunityPartitionIndex\s*=\s*-1/);
  assert.match(resetBody, /graph2DCommunityIndex\s*=\s*-1/);

  const exportStart = graphApp.indexOf("<Graph2DExportPanel");
  const exportEnd = graphApp.indexOf("\n/>", exportStart);
  const exportProps = graphApp.slice(exportStart, exportEnd);
  for (const prop of ["communityPartitions", "coreNumbers", "orderedNodeIds"]) {
    const line = exportProps.split("\n").find((value) => value.trimStart().startsWith(`${prop}=`));
    assert.ok(line, `Graph2DExportPanel must receive ${prop}`);
    assert.match(line, /showStructuralPanel/,
      `${prop} must be derived only while the structural panel is active`);
  }
});

test("the 2D export restores projection mode when a new analysis has no selected result", () => {
  assert.match(graph2DExportPanel, /resolveGraph2DModeOnOpen\(mode, highlightedNodeIds\.length > 0 \|\| highlightedEdgeIds\.length > 0\)/);
  assert.match(graph2DExportPanel, /resultKind === "aggregate" \? "Elementi evidenziati" : "Risultato selezionato"/);
  assert.match(graphApp, /resultKind=\{graph2DPanelSummary\.kind\}/);
});
