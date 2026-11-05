import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAnalysisStatusTone } from "../src/lib/kliqueasp/graph/analysisStatusTone.ts";
import {
  buildGraph2DIncompleteAnalysisSummary,
  buildGraph2DInfeasibleAnalysisSummary,
  buildGraph2DOptimizationCompletionLabel,
  buildGraph2DScenarioComparisonCompletionLabel,
  buildGraph2DStructuralCompletionLabel
} from "../src/lib/kliqueasp/graph/graph2DAnalysisOutcome.ts";
import { buildCommunityTopologyGraph2DOverlay } from "../src/lib/kliqueasp/graph/communityTopologyGraph2D.ts";

const component = await readFile(
  new URL("../src/lib/kliqueasp/components/AnalysisCompletionStatus.svelte", import.meta.url),
  "utf8"
);
const exportPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url),
  "utf8"
);

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

test("distinguishes verified success, incomplete outcomes, and execution errors", () => {
  assert.equal(getAnalysisStatusTone("Ottimo provato · una soluzione ottima mostrata"), "success");
  assert.equal(getAnalysisStatusTone("Ottimo di costo provato · proposta non applicata"), "success");
  assert.equal(getAnalysisStatusTone("Conteggio completo"), "success");
  assert.equal(getAnalysisStatusTone("Partizione completa · tutte le componenti"), "success");
  assert.equal(getAnalysisStatusTone("K-plex massimale certificato · un risultato mostrato"), "success");
  assert.equal(getAnalysisStatusTone("Confronto completo · 2 scenari"), "success");
  assert.equal(getAnalysisStatusTone("Relazione già verificata · nessuna modifica necessaria"), "success");
  assert.equal(getAnalysisStatusTone("Costo minimo provato · una proposta tra eventuali pareggi"), "success");
  assert.equal(getAnalysisStatusTone("Costo minimo verificato · una proposta tra eventuali pari merito"), "success");
  assert.equal(getAnalysisStatusTone("Infeasibilità provata · nessuna soluzione ammissibile"), "caution");
  assert.equal(getAnalysisStatusTone("Limite di calcolo raggiunto · è mostrato solo il grafo di contesto"), "caution");
  assert.equal(getAnalysisStatusTone("Calcolo non completato · è mostrato solo il grafo di contesto"), "caution");
  assert.equal(getAnalysisStatusTone("Errore durante il calcolo · è mostrato solo il grafo di contesto"), "error");
});

test("generated 2D completion labels receive a status tone for every structural task", () => {
  const cases = [
    ...["components", "weakComponents", "strongComponents", "path", "typedPath", "maximalKPlex"].map((task) => ({
      task,
      resultStatus: "SATISFIABLE",
      expectedTone: "success"
    })),
    ...["kPlex", "kCore", "dominatingSet", "minimumNodeSeparator", "minimumCostNodeSeparator", "minimumEdgeSeparator", "minimumCostEdgeSeparator", "communities"].map((task) => ({
      task,
      resultStatus: "OPTIMUM FOUND",
      expectedTone: "success"
    }))
  ];

  for (const { task, resultStatus, expectedTone } of cases) {
    const label = buildGraph2DStructuralCompletionLabel({
      task,
      resultStatus,
      completeModelEnumeration: true,
      maximumKPlexSearchComplete: true,
      hasSolution: true,
      enumerateAllOptima: false
    });
    assert.ok(label, `${task} should produce a completion label`);
    assert.equal(getAnalysisStatusTone(label), expectedTone, `${task}: ${label}`);
  }
});

test("generated incomplete, infeasible, and comparison outcomes use caution or error tones", () => {
  const timeout = buildGraph2DIncompleteAnalysisSummary("Timeout: limite di calcolo raggiunto");
  const error = buildGraph2DIncompleteAnalysisSummary("Errore durante il calcolo");
  const infeasible = buildGraph2DInfeasibleAnalysisSummary("Cammino", "nessun cammino ammissibile");
  const incompleteComparison = buildGraph2DScenarioComparisonCompletionLabel({
    analysisLabel: "triadi",
    scenarioCount: 2,
    error: "interrotto"
  });

  assert.equal(getAnalysisStatusTone(timeout?.completionLabel ?? ""), "caution");
  assert.equal(getAnalysisStatusTone(error?.completionLabel ?? ""), "error");
  assert.equal(getAnalysisStatusTone(infeasible.completionLabel), "caution");
  assert.equal(getAnalysisStatusTone(incompleteComparison), "caution");

  for (const [enumerateAllOptima, allOptimaEnumerationComplete, expectedTone] of [
    [false, false, "success"],
    [true, false, "caution"],
    [true, true, "success"]
  ]) {
    const label = buildGraph2DOptimizationCompletionLabel({
      optimizationProven: true,
      hasSolution: true,
      enumerateAllOptima,
      allOptimaEnumerationComplete
    });
    assert.equal(getAnalysisStatusTone(label), expectedTone, label);
  }
});

test("2D export uses the shared result tone and keeps each tone readable", () => {
  assert.match(exportPanel, /getAnalysisStatusTone\(completionLabel\)/);
  assert.match(exportPanel, /class="completion-status"[\s\S]{0,180}class:has-content=\{Boolean\(completionLabel\.trim\(\)\)\}[\s\S]{0,100}data-tone=\{completionTone\}/);
  assert.match(exportPanel, /role="status"[\s\S]{0,60}aria-live="polite"[\s\S]{0,40}aria-atomic="true"/);
  for (const tone of ["success", "caution", "error", "neutral"]) {
    const rule = exportPanel.match(new RegExp(`\\.completion-status\\[data-tone="${tone}"\\]\\s*\\{([^}]+)\\}`));
    assert.ok(rule, `${tone} export palette rule must exist`);
    const foreground = rule[1].match(/\scolor:\s*(#[0-9a-f]{6})/i)?.[1];
    const background = rule[1].match(/background:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.ok(foreground && background, `${tone} export rule needs explicit text and background colors`);
    const first = luminance(foreground);
    const second = luminance(background);
    const contrast = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    assert.ok(contrast >= 4.5, `${tone} export contrast ${contrast.toFixed(2)}:1 is below WCAG AA`);
  }
});

test("keeps unknown labels neutral and does not assign meaning by color alone", async () => {
  assert.equal(getAnalysisStatusTone("Diagnosi del cammino temporale"), "neutral");
  assert.equal(getAnalysisStatusTone("  "), "neutral");
  assert.match(component, /data-tone=\{tone\}/);
  assert.match(component, /role="status"\s+aria-live="polite"\s+aria-atomic="true"/);
  assert.match(component, /\{label\.trim\(\)\}/);
});

test("the production community-topology witness status is styled as a verified optimum", () => {
  const overlay = buildCommunityTopologyGraph2DOverlay({
    nodeIds: ["a", "b"],
    requestedRelation: "always",
    relation: "always",
    selectedEdits: [],
    candidateCount: 0,
    totalEditCost: 0,
    testedEditSets: 4,
    globalScaledScore: 0,
    togetherScaledScore: 0,
    separateScaledScore: null,
    modularityDenominator: "1"
  }, [{ id: "a" }, { id: "b" }], []);

  assert.match(overlay.completionLabel, /^Costo minimo verificato/);
  assert.equal(getAnalysisStatusTone(overlay.completionLabel), "success");
});

test("status accents keep readable text at WCAG AA contrast", () => {
  for (const tone of ["success", "caution", "error"]) {
    const rule = component.match(new RegExp(`\\.analysis-completion-status\\[data-tone="${tone}"\\]\\s*\\{([^}]+)\\}`));
    assert.ok(rule, `${tone} palette rule must exist`);
    const foreground = rule[1].match(/\scolor:\s*(#[0-9a-f]{6})/i)?.[1];
    const background = rule[1].match(/background:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.ok(foreground && background, `${tone} rule needs explicit text and background colors`);
    const first = luminance(foreground);
    const second = luminance(background);
    const contrast = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    assert.ok(contrast >= 4.5, `${tone} text contrast ${contrast.toFixed(2)}:1 is below WCAG AA`);
  }
});
