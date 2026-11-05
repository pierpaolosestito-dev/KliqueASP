import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildGraph2DScene, buildGraph2DSvg } from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import {
  buildGraph2DInfeasibleAnalysisSummary,
  buildGraph2DIncompleteAnalysisSummary,
  buildGraph2DTemporalNoRouteDiagnosticSummary,
  buildGraph2DOptimizationCompletionLabel,
  buildGraph2DStructuralCompletionLabel,
  buildGraph2DScenarioComparisonCompletionLabel,
  getGraph2DActiveAnalysisError,
  selectGraph2DPanelSummary
} from "../src/lib/kliqueasp/graph/graph2DAnalysisOutcome.ts";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
const integrityPanel = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");

test("a timed-out query is labeled as context only, without a witness", () => {
  const summary = buildGraph2DIncompleteAnalysisSummary("TIMEOUT");
  assert.equal(summary?.resultLabel, "Risultato non disponibile");
  assert.match(summary?.completionLabel ?? "", /Limite di calcolo raggiunto/);
  assert.match(summary?.completionLabel ?? "", /grafo di contesto/);
});

test("temporal why-not witnesses remain labeled as diagnostics, not as simple-path solutions", () => {
  assert.deepEqual(buildGraph2DTemporalNoRouteDiagnosticSummary(true), {
    resultLabel: "Diagnosi del cammino temporale",
    completionLabel: "Nessun cammino semplice ammissibile \u00b7 la meta si raggiunge solo ripassando da nodi visitati"
  });
  assert.deepEqual(buildGraph2DTemporalNoRouteDiagnosticSummary(false), {
    resultLabel: "Diagnosi del cammino temporale",
    completionLabel: "Nessun cammino semplice ammissibile \u00b7 il prefisso massimo non raggiunge la meta"
  });
});

test("cancelled and incomplete solver runs have distinct completion labels", () => {
  assert.match(buildGraph2DIncompleteAnalysisSummary("Conteggio annullato; il totale parziale non è stato pubblicato.")?.completionLabel ?? "",
    /Calcolo interrotto/);
  assert.match(buildGraph2DIncompleteAnalysisSummary("Tempo massimo superato (20 s): il calcolo è stato interrotto prima del risultato completo.")?.completionLabel ?? "",
    /Limite di calcolo raggiunto/,
    "un timeout resta riconoscibile anche quando il dettaglio tecnico dice che il calcolo è stato interrotto");
  assert.match(buildGraph2DIncompleteAnalysisSummary("clingo non conferma che tutti gli ottimi siano stati enumerati")?.completionLabel ?? "",
    /Calcolo non completato/);
  assert.match(buildGraph2DIncompleteAnalysisSummary("Errore inatteso")?.completionLabel ?? "",
    /Errore durante il calcolo/);
});

test("engine failures and missing prerequisites are distinct from solver interruptions", () => {
  assert.match(buildGraph2DIncompleteAnalysisSummary("Il worker clingo non è disponibile")?.completionLabel ?? "",
    /Motore di calcolo non disponibile/);
  assert.match(buildGraph2DIncompleteAnalysisSummary("Il tipo di nodo richiesto è assente dalla proiezione")?.completionLabel ?? "",
    /Analisi non eseguita/);
  assert.match(buildGraph2DIncompleteAnalysisSummary("Il gruppo candidato è vuoto")?.completionLabel ?? "",
    /Analisi non eseguita/);
});

test("an integrity diagnosis without a model is reported as incomplete in the 2D summary", () => {
  const summary = buildGraph2DIncompleteAnalysisSummary(
    "Clingo non ha restituito alcun modello diagnostico. L'assenza di modelli non dimostra che il grafo sia privo di violazioni."
  );
  assert.match(summary?.completionLabel ?? "", /Calcolo non completato/);
  assert.match(summary?.completionLabel ?? "", /solo il grafo di contesto/);
});

test("empty or non-text errors do not create an incomplete-result label", () => {
  assert.equal(buildGraph2DIncompleteAnalysisSummary("  "), null);
  assert.equal(buildGraph2DIncompleteAnalysisSummary(undefined), null);
  assert.equal(buildGraph2DIncompleteAnalysisSummary({ message: "timeout" }), null);
});

test("a proved infeasible task is distinguished from an analysis that did not run", () => {
  const summary = buildGraph2DInfeasibleAnalysisSummary(
    "Separatore di nodi",
    "nessun insieme consentito separa i terminali"
  );
  assert.deepEqual(summary, {
    resultLabel: "Separatore di nodi · nessuna soluzione ammissibile · solo grafo di contesto",
    completionLabel: "Infeasibilità provata · nessun insieme consentito separa i terminali"
  });
  assert.equal(buildGraph2DIncompleteAnalysisSummary("UNSATISFIABLE", true), null,
    "un esito infeasible già provato non deve essere declassato a calcolo non eseguito");
  const scene = buildGraph2DScene([{ id: "a" }, { id: "b" }], [{ source: "a", target: "b" }]);
  const svg = buildGraph2DSvg(scene, summary);
  assert.match(svg, /nessuna soluzione ammissibile/);
  assert.match(svg, /Infeasibilit\u00e0 provata/);
  assert.throws(() => buildGraph2DInfeasibleAnalysisSummary(" ", "motivo"), /task e motivo/);
});

test("an infeasible integrity repair is a proved outcome separate from a repair error", () => {
  const start = graphApp.indexOf("async function runIntegrityRepair()");
  const end = graphApp.indexOf("// ---------------- LIFECYCLE", start);
  assert.ok(start >= 0 && end > start, "funzione di riparazione d'integrità non trovata");
  const repairFlow = graphApp.slice(start, end);
  assert.match(repairFlow, /lastGraph2DAnalysisKind = "integrityRepair"/);
  const infeasibleStart = repairFlow.indexOf('if (result?.Result === "UNSATISFIABLE")');
  const infeasibleEnd = repairFlow.indexOf("\n      if (result?.Result !==", infeasibleStart);
  assert.ok(infeasibleStart >= 0 && infeasibleEnd > infeasibleStart, "ramo UNSAT della riparazione non trovato");
  const infeasibleBranch = repairFlow.slice(infeasibleStart, infeasibleEnd);
  assert.match(infeasibleBranch, /integrityRepairOutcomeMessage\s*=/);
  assert.doesNotMatch(infeasibleBranch, /integrityRepairError\s*=/,
    "l'assenza provata di riparazioni non è un errore di esecuzione");
  assert.match(graphApp, /analysisLabel:\s*"Riparazione minima d'integrità"[\s\S]*?completionLabel:\s*"Ottimo di costo provato[\s\S]*?kind:\s*"collection"/);
  assert.match(graphApp, /buildGraph2DInfeasibleAnalysisSummary\([\s\S]*?"Riparazione d'integrità"/);
  assert.match(integrityPanel, /\{#if repairOutcomeMessage\}[\s\S]*?class="repair-outcome" role="status" aria-live="polite"/);
  assert.match(integrityPanel, /Rivedi le azioni candidate/);
});

test("dominating-set infeasibility remains visible if its optional why-not certificate fails", () => {
  const start = graphApp.indexOf('if (request.task === "dominatingSet" && result?.Result === "UNSATISFIABLE")');
  const explanation = graphApp.indexOf("const feasibilityProgram = buildDominatingSetFeasibilityProgram", start);
  assert.ok(start >= 0 && explanation > start, "gestione dell'infeasibilità del dominating set non trovata");
  const primaryProof = graphApp.slice(start, explanation);
  assert.match(primaryProof, /structuralError = ""/,
    "l'esito infeasible provato non deve comparire come errore dell'analisi");
  assert.match(primaryProof, /setGraph2DProvenInfeasibility\([\s\S]*?Copertura minima/);
  assert.match(primaryProof, /nessun insieme di nodi candidato copre tutti i nodi obiettivo selezionati/);

  const successStart = graphApp.indexOf("structuralDominatingSetUncoverableTargetNodeIds = expectedUncoverableIds;", explanation);
  const successEnd = graphApp.indexOf("return;", successStart);
  const successfulCertificate = graphApp.slice(successStart, successEnd);
  assert.match(successfulCertificate, /setGraph2DProvenInfeasibility/);
  assert.doesNotMatch(successfulCertificate, /structuralError\s*=/,
    "la diagnosi verificata viene mostrata nel suo pannello dedicato, senza un falso alert di errore");
  assert.match(graphApp.slice(explanation, successStart),
    /La copertura è impossibile, ma la verifica dei nodi non coperti/,
    "gli errori della diagnosi opzionale devono distinguersi dall'infeasibilità provata");
});

test("proven structural infeasibility is presented as an outcome, not a calculation error", () => {
  for (const task of ["path", "typedPath", "minimumNodeSeparator", "minimumCostNodeSeparator", "communities"]) {
    const start = graphApp.indexOf(`if (request.task === "${task}" && result?.Result === "UNSATISFIABLE")`);
    const end = graphApp.indexOf("\n      if (request.task ===", start + 1);
    assert.ok(start >= 0 && end > start, `gestione infeasible non trovata per ${task}`);
    const branch = graphApp.slice(start, end);
    assert.match(branch, /structuralOutcomeMessage\s*=/, `${task} deve mostrare un esito nel pannello`);
    assert.match(branch, /setGraph2DProvenInfeasibility/, `${task} deve mantenere l'esito nel riepilogo 2D`);
    if (task !== "path" && task !== "typedPath") {
      assert.doesNotMatch(branch, /structuralError\s*=\s*["'`]/,
        `${task}: un'infeasibilità provata non è un errore del calcolo`);
    } else {
      assert.match(branch, /structuralError\s*=\s*["'`]Il cammino è impossibile, ma la diagnosi non è stata verificata/,
        `${task}: solo l'eventuale certificato opzionale può produrre un errore`);
    }
  }

  assert.match(structuralPanel, /outcomeMessage\s*=\s*""/);
  assert.match(structuralPanel, /class="analysis-outcome" role="status" aria-live="polite"/);
  assert.match(graphApp, /outcomeMessage=\{structuralOutcomeMessage\}/);
});

test("contextual optimization requires a proof before labeling infeasibility or an optimum", () => {
  assert.equal(buildGraph2DOptimizationCompletionLabel({
    optimizationProven: false,
    hasSolution: false,
    enumerateAllOptima: false
  }), "Prova dell'ottimo non verificata");
  assert.match(buildGraph2DOptimizationCompletionLabel({
    optimizationProven: true,
    hasSolution: false,
    enumerateAllOptima: false
  }), /Infeasibilità provata/);
  assert.equal(buildGraph2DOptimizationCompletionLabel({
    optimizationProven: true,
    hasSolution: true,
    enumerateAllOptima: false
  }),
    "Ottimo provato · una soluzione ottima mostrata");
  assert.equal(buildGraph2DOptimizationCompletionLabel({
    optimizationProven: true,
    hasSolution: true,
    enumerateAllOptima: true,
    allOptimaEnumerationComplete: true
  }),
    "Ottimo provato · enumerazione completa degli ottimi");
  assert.equal(buildGraph2DOptimizationCompletionLabel({
    optimizationProven: true,
    hasSolution: true,
    enumerateAllOptima: true
  }),
    "Ottimo provato · completezza dell’enumerazione non verificata");
});

test("maximum k-plex is never labeled optimal unless the cardinality search is complete", () => {
  const options = {
    task: "kPlex",
    resultStatus: "OPTIMUM FOUND",
    completeModelEnumeration: false,
    hasSolution: true,
    enumerateAllOptima: false
  };
  assert.equal(buildGraph2DStructuralCompletionLabel(options), undefined,
    "lo stato di una query ASP non basta se la ricerca binaria della cardinalità non è completa");
  assert.equal(buildGraph2DStructuralCompletionLabel({
    ...options,
    maximumKPlexSearchComplete: true
  }), "Ottimo provato · una soluzione ottima mostrata");
  assert.equal(buildGraph2DStructuralCompletionLabel({
    ...options,
    maximumKPlexSearchComplete: true,
    enumerateAllOptima: true
  }), "Ottimo provato · completezza dell’enumerazione non verificata");
  assert.equal(buildGraph2DStructuralCompletionLabel({
    ...options,
    maximumKPlexSearchComplete: true,
    enumerateAllOptima: true,
    completeModelEnumeration: true
  }), "Ottimo provato · enumerazione completa degli ottimi");
});

test("path tasks report their witness scope even when the single model stream is exhausted", () => {
  for (const completeModelEnumeration of [false, true]) {
    assert.equal(buildGraph2DStructuralCompletionLabel({
      task: "path",
      resultStatus: "SATISFIABLE",
      completeModelEnumeration,
      hasSolution: true,
      enumerateAllOptima: false
    }), "Cammino minimo provato · un testimone mostrato");
    assert.equal(buildGraph2DStructuralCompletionLabel({
      task: "typedPath",
      resultStatus: "SATISFIABLE",
      completeModelEnumeration,
      hasSolution: true,
      enumerateAllOptima: false
    }), "Vincoli tipizzati soddisfatti · un cammino testimone mostrato");
  }
});

test("selected paths and temporal why-not walks keep their distinct 2D result labels", () => {
  assert.match(graphApp, /graph2DOverlayResultLabel = path\.resultLabel\?\.trim\(\) \?\? ""/);
  assert.match(graphApp, /graph2DOverlayCompletionLabel = path\.completionLabel\?\.trim\(\) \?\? ""/);
  assert.match(structuralPanel, /resultLabel: task === "path" \? "Cammino minimo selezionato"/);
  assert.match(structuralPanel, /resultLabel: summary\.resultLabel/);
  assert.match(structuralPanel, /completionLabel: summary\.completionLabel/);
});

test("maximal k-plex reports one certified set or the requested full enumeration", () => {
  for (const completeModelEnumeration of [false, true]) {
    assert.equal(buildGraph2DStructuralCompletionLabel({
      task: "maximalKPlex",
      resultStatus: "SATISFIABLE",
      completeModelEnumeration,
      hasSolution: true,
      enumerateAllOptima: false,
      enumerateAllMaximalKPlex: false
    }), "K-plex massimale certificato · un risultato mostrato");
  }
  assert.equal(buildGraph2DStructuralCompletionLabel({
    task: "maximalKPlex",
    resultStatus: "SATISFIABLE",
    completeModelEnumeration: true,
    hasSolution: true,
    enumerateAllOptima: false,
    enumerateAllMaximalKPlex: true
  }), "Enumerazione completa · k-plex massimali");
  assert.equal(buildGraph2DStructuralCompletionLabel({
    task: "maximalKPlex",
    resultStatus: "SATISFIABLE",
    completeModelEnumeration: false,
    hasSolution: true,
    enumerateAllOptima: false,
    enumerateAllMaximalKPlex: true
  }), "Enumerazione incompleta · k-plex massimali");
});

test("unique k-core and deterministic component partitions use task semantics", () => {
  assert.equal(buildGraph2DStructuralCompletionLabel({
    task: "kCore",
    resultStatus: "OPTIMUM FOUND",
    completeModelEnumeration: true,
    hasSolution: true,
    enumerateAllOptima: false
  }), "k-core calcolato · risultato unico alla soglia");
  for (const task of ["components", "weakComponents", "strongComponents"]) {
    for (const completeModelEnumeration of [false, true]) {
      assert.equal(buildGraph2DStructuralCompletionLabel({
        task,
        resultStatus: "SATISFIABLE",
        completeModelEnumeration,
        hasSolution: true,
        enumerateAllOptima: false
      }), "Partizione completa · tutte le componenti");
    }
  }
});

test("structural optimization uses the user's all-optima setting in the 2D completion label", () => {
  const start = graphApp.indexOf("structuralStats = {");
  const end = graphApp.indexOf("clearGraphNeighborhoodFocus();", start);
  assert.ok(start >= 0 && end > start, "riepilogo strutturale non trovato");
  const summary = graphApp.slice(start, end);
  assert.match(summary, /completionLabel:\s*buildGraph2DStructuralCompletionLabel\(\{\s*task:\s*request\.task,\s*resultStatus:\s*result\?\.Result,\s*completeModelEnumeration:\s*hasCompleteModelEnumeration\(result\),/);
  assert.match(summary, /enumerateAllOptima:\s*request\.enumerateAllOptima === true/);
});

test("structural completion labels require a completed satisfiable solver status", () => {
  for (const resultStatus of [undefined, "UNKNOWN", "UNSATISFIABLE", "ERROR"]) {
    assert.equal(buildGraph2DStructuralCompletionLabel({
      task: "components",
      resultStatus,
      completeModelEnumeration: true,
      hasSolution: true,
      enumerateAllOptima: false
    }), undefined, `${resultStatus ?? "stato assente"} non può essere presentato come completo`);
    assert.equal(buildGraph2DStructuralCompletionLabel({
      task: "minimumNodeSeparator",
      resultStatus,
      completeModelEnumeration: true,
      hasSolution: true,
      enumerateAllOptima: false
    }), undefined, `${resultStatus ?? "stato assente"} non può certificare un'ottimizzazione`);
  }
});

test("structural completion labels require a parsed model for every task", () => {
  for (const task of ["path", "typedPath", "kPlex", "maximalKPlex", "kCore", "components", "dominatingSet", "communities"]) {
    assert.equal(buildGraph2DStructuralCompletionLabel({
      task,
      resultStatus: task === "kPlex" ? "OPTIMUM FOUND" : "SATISFIABLE",
      completeModelEnumeration: true,
      maximumKPlexSearchComplete: true,
      hasSolution: false,
      enumerateAllOptima: true,
      enumerateAllMaximalKPlex: true
    }), undefined, `${task} non deve certificare un esito senza almeno un modello interpretato`);
  }
});

test("parsed empty answer sets keep valid task-specific outcomes", () => {
  assert.equal(buildGraph2DStructuralCompletionLabel({
    task: "kCore",
    resultStatus: "OPTIMUM FOUND",
    completeModelEnumeration: true,
    hasSolution: true,
    enumerateAllOptima: false
  }), "k-core calcolato · risultato unico alla soglia");
  assert.equal(buildGraph2DStructuralCompletionLabel({
    task: "components",
    resultStatus: "SATISFIABLE",
    completeModelEnumeration: true,
    hasSolution: true,
    enumerateAllOptima: false
  }), "Partizione completa · tutte le componenti");
});

test("maximum k-plex completion follows the proven search and the all-optima setting", () => {
  const start = graphApp.indexOf("structuralStats = {");
  const end = graphApp.indexOf("clearGraphNeighborhoodFocus();", start);
  assert.ok(start >= 0 && end > start, "riepilogo strutturale non trovato");
  const summary = graphApp.slice(start, end);
  assert.match(summary, /maximumKPlexSearchComplete:\s*kPlexSearchComplete/);
  assert.match(summary, /hasSolution:\s*structuralResults\.length > 0/);
  assert.match(summary, /enumerateAllMaximalKPlex:\s*request\.enumerateAllMaximalKPlex === true/);
});

test("restored k-plex results recompute completion from the saved all-optima setting", () => {
  const restoreStart = graphApp.indexOf("if (isRecord(state.structural)) {");
  const restoreEnd = graphApp.indexOf("structuralError =", restoreStart);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, "ripristino strutturale non trovato");
  const restore = graphApp.slice(restoreStart, restoreEnd);
  assert.match(restore, /restoredStats\.task === "kPlex" && structuralResults\.length > 0/);
  assert.match(restore, /enumerateAllOptima:\s*structural\.enumerateAllOptima === true/);
  assert.match(restore, /structuralStats = restoredStats as any/);
});

test("restored path and maximal k-plex results recompute task-scoped completion", () => {
  const restoreStart = graphApp.indexOf("if (isRecord(state.structural)) {");
  const restoreEnd = graphApp.indexOf("structuralError =", restoreStart);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, "ripristino strutturale non trovato");
  const restore = graphApp.slice(restoreStart, restoreEnd);
  assert.match(restore, /restoredStats\.task === "maximalKPlex" \|\| restoredStats\.task === "path" \|\| restoredStats\.task === "typedPath"/);
  assert.match(restore, /resultStatus:\s*"SATISFIABLE"/);
  assert.match(restore, /completeModelEnumeration:\s*structural\.enumerateAllMaximalKPlex === true/);
  assert.match(restore, /enumerateAllMaximalKPlex:\s*structural\.enumerateAllMaximalKPlex === true/);
  assert.match(restore, /restoredStats\.completionLabel = buildGraph2DStructuralCompletionLabel/);
});

test("restored k-core and component partitions keep their unique task-scoped status", () => {
  const restoreStart = graphApp.indexOf("if (isRecord(state.structural)) {");
  const restoreEnd = graphApp.indexOf("structuralError =", restoreStart);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart, "ripristino strutturale non trovato");
  const restore = graphApp.slice(restoreStart, restoreEnd);
  assert.match(restore, /restoredStats\.task === "kCore"[\s\S]*?resultStatus:\s*"OPTIMUM FOUND"/);
  assert.match(restore, /restoredStats\.task === "components" \|\| restoredStats\.task === "weakComponents" \|\|\s*restoredStats\.task === "strongComponents"/);
  assert.match(restore, /resultStatus:\s*"SATISFIABLE",\s*completeModelEnumeration:\s*true/);
});

test("scenario witnesses report only the completion of their own comparison", () => {
  assert.equal(buildGraph2DScenarioComparisonCompletionLabel({ analysisLabel: "scenari", scenarioCount: 4 }),
    "Confronto completo · 4 scenari");
  assert.equal(buildGraph2DScenarioComparisonCompletionLabel({ analysisLabel: "scenari", scenarioCount: 4, error: "timeout" }),
    "Completezza del confronto non verificata");
  assert.equal(buildGraph2DScenarioComparisonCompletionLabel({ analysisLabel: "scenari", scenarioCount: 0 }),
    "Completezza del confronto non verificata");
  assert.equal(buildGraph2DScenarioComparisonCompletionLabel({ analysisLabel: "scenari", scenarioCount: 1.5 }),
    "Completezza del confronto non verificata");
  assert.throws(() => buildGraph2DScenarioComparisonCompletionLabel({ analysisLabel: " ", scenarioCount: 2 }),
    /dichiarare il tipo di analisi/);
});

test("a missing prerequisite is labeled as an analysis that did not run", () => {
  assert.deepEqual(buildGraph2DIncompleteAnalysisSummary("Il confronto richiede almeno due scenari."), {
    resultLabel: "Risultato non disponibile",
    completionLabel: "Analisi non eseguita · è mostrato solo il grafo di contesto"
  });
});

test("the active panel reads only its own error", () => {
  const errors = { structural: "errore precedente", provenanceKPlex: "timeout k-plex" };
  assert.equal(getGraph2DActiveAnalysisError("structural", "provenanceKPlex", errors), "timeout k-plex");
  assert.equal(getGraph2DActiveAnalysisError("structural", "structural", errors), "errore precedente");
  assert.equal(getGraph2DActiveAnalysisError("motif", "signedTriads", { signedTriads: "triade non completata" }), "triade non completata");
  assert.equal(getGraph2DActiveAnalysisError("clique", "provenanceKPlex", errors), "");
  assert.equal(getGraph2DActiveAnalysisError(null, "provenanceKPlex", errors), "");
});

test("integrity repair reads its own error rather than the completed integrity check", () => {
  const errors = { integrity: "verifica precedente completata", integrityRepair: "timeout riparazione" };
  assert.equal(getGraph2DActiveAnalysisError("integrity", "integrityRepair", errors), "timeout riparazione");
  assert.equal(getGraph2DActiveAnalysisError("integrity", "integrity", errors), "verifica precedente completata");
});

test("scenario comparison failures are attributed to the active motif task", () => {
  const errors = {
    motifScenarioComparison: "Confronto interrotto nel secondo mondo",
    signedTriadScenarioComparison: "Tempo complessivo esaurito"
  };
  assert.equal(getGraph2DActiveAnalysisError("motif", "motifScenarioComparison", errors), "Confronto interrotto nel secondo mondo");
  assert.equal(getGraph2DActiveAnalysisError("motif", "signedTriadScenarioComparison", errors), "Tempo complessivo esaurito");
  assert.equal(getGraph2DActiveAnalysisError("motif", "typedMotif", errors), "");
});

test("the 2D result summary excludes completion data from inactive analyses", () => {
  const structural = { resultLabel: "k-core · k=2", completionLabel: "Enumerazione completa" };
  assert.deepEqual(selectGraph2DPanelSummary({ panel: "clique", structural }), {
    resultLabel: "Proiezione corrente",
    completionLabel: ""
  });
  assert.deepEqual(selectGraph2DPanelSummary({ panel: "structural", structural }), structural);
  assert.deepEqual(selectGraph2DPanelSummary({
    panel: "clique",
    structural,
    clique: { resultLabel: "Clique massimali", completionLabel: "Enumerazione completa" }
  }), { resultLabel: "Clique massimali", completionLabel: "Enumerazione completa" });
});

test("the 2D motif-completion summary reports the minimum proposal cost", () => {
  assert.match(graphApp, /analysisLabel: "Completamento del motivo",\s*resultSummary: motifCounterfactuals\.length\s*\?\s*`\$\{motifCounterfactuals\.length\} proposte minime · costo minimo \$\{motifCounterfactuals\[0\]\.totalCost\}`/);
});

test("incomplete or overlay summaries take priority over saved analysis summaries", () => {
  const structural = { resultLabel: "k-core · k=2", completionLabel: "Enumerazione completa" };
  assert.deepEqual(selectGraph2DPanelSummary({
    panel: "structural",
    structural,
    incomplete: { resultLabel: "Risultato non disponibile", completionLabel: "Calcolo non completato" }
  }), { resultLabel: "Risultato non disponibile", completionLabel: "Calcolo non completato" });
  assert.deepEqual(selectGraph2DPanelSummary({
    panel: "structural",
    structural,
    overlay: { resultLabel: "Controfattuale", completionLabel: "Ottimo provato" }
  }), { resultLabel: "Controfattuale", completionLabel: "Ottimo provato" });
  assert.deepEqual(selectGraph2DPanelSummary({
    panel: "structural",
    aggregate: { resultLabel: "k-core · confronto tra scenari", completionLabel: "Confronto completo" },
    structural
  }), { resultLabel: "k-core · confronto tra scenari", completionLabel: "Confronto completo" });
});
