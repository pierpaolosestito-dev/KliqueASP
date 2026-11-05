import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const statusComponent = await readFile(
  new URL("../src/lib/kliqueasp/components/AnalysisCompletionStatus.svelte", import.meta.url),
  "utf8"
);
const solverPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url),
  "utf8"
);
const structuralPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url),
  "utf8"
);
const integrityPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url),
  "utf8"
);
const motifPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url),
  "utf8"
);
const provenancePanel = await readFile(
  new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url),
  "utf8"
);
const contextualCliquePanel = await readFile(
  new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url),
  "utf8"
);
const structuralCompletionPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url),
  "utf8"
);
const typedPathCounterfactualPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url),
  "utf8"
);
const graphApp = await readFile(
  new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url),
  "utf8"
);

test("completion status is concise and announced as a live result", () => {
  assert.doesNotMatch(statusComponent, /\{#if label\.trim\(\)\}/);
  assert.match(statusComponent, /class:has-content=\{Boolean\(label\.trim\(\)\)\}/);
  assert.match(statusComponent, /role="status"\s+aria-live="polite"\s+aria-atomic="true"/);
  assert.match(statusComponent, /\{label\.trim\(\)\}/);
  assert.match(statusComponent, /\.analysis-completion-status\.has-content\s*\{/);
});

test("clique results show the verified completion state even when optional statistics are hidden", () => {
  const optionalStatsEnd = solverPanel.indexOf("{/if}", solverPanel.indexOf("{#if F.stats !== false}"));
  const statusPosition = solverPanel.indexOf("<AnalysisCompletionStatus label={completionLabel} />");
  assert.ok(optionalStatsEnd >= 0 && statusPosition > optionalStatsEnd,
    "lo stato della ricerca deve restare visibile anche se sono nascoste le statistiche opzionali");
  assert.match(solverPanel, /export let completionLabel = ""/);
  assert.match(graphApp, /<SolverPanel[\s\S]*?completionLabel=\{graph2DPanelSummary\.completionLabel \?\? ""\}/);
});

test("structural completion state reaches the visible analysis summary", () => {
  assert.match(graphApp, /<StructuralAnalysisPanel[\s\S]*?completionLabel=\{graph2DPanelSummary\.completionLabel \?\? ""\}/);
  assert.match(structuralPanel, /export let completionLabel = ""/);
  assert.match(structuralPanel, /<AnalysisCompletionStatus label=\{completionLabel\} \/>/);
});

test("integrity, relational analyses, and scenario comparisons share the active verified status", () => {
  for (const component of ["IntegrityPanel", "MotifAnalysisPanel", "ProvenanceScenarioAnalysisPanel"]) {
    assert.match(graphApp, new RegExp(`<${component}[\\s\\S]*?completionLabel=\\{graph2DPanelSummary\\.completionLabel \\?\\? ""\\}`));
  }
  for (const source of [integrityPanel, motifPanel, provenancePanel]) {
    assert.match(source, /<AnalysisCompletionStatus label=\{completionLabel\} \/>/);
  }
});

test("every explicitly assigned analysis family has a visible completion-summary branch", () => {
  const assignedKinds = [...new Set(
    [...graphApp.matchAll(/lastGraph2DAnalysisKind\s*=\s*"([^"]+)"/g)].map((match) => match[1])
  )];
  assert.ok(assignedKinds.length > 0, "nessuna famiglia di analisi assegnata è stata trovata");
  const summaryStart = graphApp.indexOf("$: graph2DAggregateSummary =");
  const summaryEnd = graphApp.indexOf("$: graph2DCliqueSummaryLabel", summaryStart);
  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart, "riepilogo aggregato del grafo 2D non trovato");
  const summarySource = graphApp.slice(summaryStart, summaryEnd);

  for (const kind of assignedKinds) {
    if (kind === "structural") {
      assert.match(graphApp, /structuralStats\.completionLabel \?\? ""/);
      continue;
    }

    const branchStart = summarySource.indexOf(`lastGraph2DAnalysisKind === "${kind}"`);
    assert.ok(branchStart >= 0, `manca il ramo di riepilogo per ${kind}`);
    const branch = summarySource.slice(branchStart, branchStart + 1400);
    assert.match(branch, /completionLabel:/, `il riepilogo di ${kind} non dichiara lo stato di completezza`);
  }
});

test("integrity UNSAT cannot be reported as a complete zero-violation diagnosis", () => {
  const start = graphApp.indexOf("async function runIntegrityAnalysis()");
  const end = graphApp.indexOf("async function runTypedMotifAnalysis(", start);
  assert.ok(start >= 0 && end > start, "flusso della diagnosi di integrita non trovato");
  const flow = graphApp.slice(start, end);
  const unsatStart = flow.indexOf('if (result?.Result === "UNSATISFIABLE")');
  const unsatEnd = flow.indexOf("\n        if (", unsatStart + 1);
  assert.ok(unsatStart >= 0 && unsatEnd > unsatStart, "caso senza modello non gestito");
  const unsatBranch = flow.slice(unsatStart, unsatEnd);
  assert.match(unsatBranch, /integrityError\s*=/);
  assert.match(unsatBranch, /assenza di modelli non dimostra/i);
  assert.doesNotMatch(unsatBranch, /integrityHasRun\s*=\s*true|integrityResults\s*=\s*\[\]/);

  const completeResultGate = flow.indexOf("if (!hasCompleteModelEnumeration(result))");
  const parseResults = flow.indexOf("integrityResults = parseIntegrityViolations(", completeResultGate);
  const markComplete = flow.indexOf("integrityHasRun = true;", parseResults);
  assert.ok(completeResultGate > unsatStart && parseResults > completeResultGate && markComplete > parseResults,
    "la diagnosi deve pubblicare zero violazioni solo dopo un'enumerazione completa con modello");
});

test("contextual clique reports proof, all-optima enumeration, or proven infeasibility", () => {
  assert.match(contextualCliquePanel, /import AnalysisCompletionStatus from "\.\/AnalysisCompletionStatus\.svelte"/);
  assert.match(contextualCliquePanel, /buildGraph2DOptimizationCompletionLabel\(\{/);
  assert.match(contextualCliquePanel, /optimizationProven:\s*true/);
  assert.match(contextualCliquePanel, /hasSolution:\s*results\.length > 0/);
  assert.match(contextualCliquePanel, /enumerateAllOptima,/);
  assert.match(contextualCliquePanel, /allOptimaEnumerationComplete:\s*hasRun/);
  assert.match(contextualCliquePanel, /<AnalysisCompletionStatus label=\{completionLabel\} \/>/);
  assert.match(graphApp, /resultSummary: contextualCliqueResults\.length === 1\s*\?\s*"1 gruppo ottimo"/);
});

test("structural and typed-path counterfactuals expose only their verified optimization state", () => {
  for (const source of [structuralCompletionPanel, typedPathCounterfactualPanel]) {
    assert.match(source, /import AnalysisCompletionStatus from "\.\/AnalysisCompletionStatus\.svelte"/);
    assert.match(source, /buildGraph2DOptimizationCompletionLabel\(\{/);
    assert.match(source, /optimizationProven:\s*true/);
    assert.match(source, /hasSolution:\s*proposals\.length > 0/);
    assert.match(source, /enumerateAllOptima,/);
    assert.match(source, /allOptimaEnumerationComplete:\s*hasRun/);
    assert.match(source, /<AnalysisCompletionStatus label=\{completionLabel\} \/>/);
  }
});

test("motif completion counterfactual states that one minimum-cost proposal is shown", () => {
  const summaryStart = graphApp.indexOf('lastGraph2DAnalysisKind === "motifCounterfactual" && motifCounterfactualHasRun');
  const summaryEnd = graphApp.indexOf("\n    if (showMotifPanel", summaryStart + 1);
  assert.ok(summaryStart >= 0 && summaryEnd > summaryStart, "riepilogo del completamento del motivo non trovato");
  const summary = graphApp.slice(summaryStart, summaryEnd);
  assert.match(summary, /buildGraph2DOptimizationCompletionLabel\(/);
  assert.match(summary, /optimizationProven:\s*true/);
  assert.match(summary, /hasSolution:\s*motifCounterfactuals\.length > 0/);
  assert.match(summary, /enumerateAllOptima:\s*false/);

  const highlightStart = graphApp.indexOf("function highlightTypedMotifCounterfactual(");
  const highlightEnd = graphApp.indexOf("function clearGraph2DOverlay(", highlightStart);
  assert.ok(highlightStart >= 0 && highlightEnd > highlightStart, "overlay del completamento del motivo non trovato");
  const highlight = graphApp.slice(highlightStart, highlightEnd);
  assert.match(highlight, /graph2DOverlayCompletionLabel = buildGraph2DOptimizationCompletionLabel\(/);
  assert.match(highlight, /enumerateAllOptima:\s*false/);
});

test("structural and typed-path counterfactual overlays retain their enumeration scope", () => {
  assert.match(structuralCompletionPanel, /dispatch\("highlightCounterfactual",\s*\{\s*proposal,\s*nodeIds,\s*title,\s*completionLabel\s*\}\)/);
  assert.match(typedPathCounterfactualPanel, /title:\s*"Cammino tipizzato controfattuale",\s*completionLabel/);
  const start = graphApp.indexOf("function highlightStructuralCounterfactual(");
  const end = graphApp.indexOf("function highlightCommunityTopologyCounterfactual(", start);
  assert.ok(start >= 0 && end > start, "gestore del controfattuale strutturale non trovato");
  const handler = graphApp.slice(start, end);
  assert.match(handler, /completionLabel\?: string/);
  assert.match(handler, /graph2DOverlayCompletionLabel = request\.completionLabel\?\.trim\(\) \|\| buildGraph2DOptimizationCompletionLabel\(/);
});

test("single near-match optimum is not presented as a full enumeration in the SVG overlay", () => {
  const start = graphApp.indexOf("function highlightTypedMotifNearMatch(");
  const end = graphApp.indexOf("function highlightIntegrityViolation(", start);
  assert.ok(start >= 0 && end > start, "overlay del near-match non trovato");
  assert.match(graphApp.slice(start, end), /Ottimo lessicografico provato · una soluzione tra eventuali pari merito/);
});

test("near-match result separates a proved best score from non-exhaustive tie listing", () => {
  assert.match(motifPanel, /Il punteggio migliore è provato; l'elenco può non includere tutte le configurazioni a pari merito\./);
  const start = graphApp.indexOf('lastGraph2DAnalysisKind === "motifNearMatch" && motifNearMatchHasRun');
  const end = graphApp.indexOf("\n    if (showMotifPanel", start + 1);
  assert.ok(start >= 0 && end > start, "riepilogo 2D del near-match non trovato");
  const summary = graphApp.slice(start, end);
  assert.match(summary, /configurazioni migliori mostrate/);
  assert.match(summary, /Punteggio migliore provato · pari merito non enumerati tutti/);
});

test("community topology counterfactual highlights its proved minimum cost and the no-edit case", () => {
  assert.match(structuralPanel, /<AnalysisCompletionStatus\s+label=\{result\.selectedEdits\.length === 0\s*\?\s*"Relazione già verificata · nessuna modifica necessaria"\s*:\s*"Costo minimo provato · una proposta tra eventuali pareggi"\}\s*\/>/);
  assert.match(structuralPanel, /<div class="community-topology-result">[\s\S]*?<p class="community-topology-relation" role="status" aria-live="polite">/);
  assert.doesNotMatch(structuralPanel, /<div class="community-topology-result" role="status">/);
});

test("typed-path result updates use the concise live completion announcement", () => {
  assert.match(typedPathCounterfactualPanel, /<section class="typed-path-counterfactual">/);
  assert.doesNotMatch(typedPathCounterfactualPanel, /<section class="typed-path-counterfactual" aria-live=/);
  assert.match(typedPathCounterfactualPanel, /<AnalysisCompletionStatus label=\{completionLabel\} \/>/);
});
