import type { Graph2DAnalysisSummary } from "./graph2dExport.ts";
import type { StructuralTask } from "./structuralTasks.ts";

export type Graph2DAnalysisPanel = "clique" | "structural" | "integrity" | "motif" | "provenance" | null;

export type Graph2DAnalysisErrors = Partial<Record<
  | "clique"
  | "structural"
  | "integrity"
  | "integrityRepair"
  | "motif"
  | "motifCount"
  | "motifCounterfactual"
  | "motifNearMatch"
  | "motifScenarioComparison"
  | "signedTriads"
  | "signedTriadScenarioComparison"
  | "contextualClique"
  | "provenanceClique"
  | "provenanceKCore"
  | "provenanceKPlex"
  | "provenanceComponent"
  | "provenanceDominatingSet",
  string
>>;

export type Graph2DPanelSummary = {
  resultLabel: string;
  completionLabel?: string;
  kind?: "aggregate" | "collection";
};

export type Graph2DPanelSummaryCandidates = {
  panel: Graph2DAnalysisPanel;
  incomplete?: Graph2DPanelSummary | null;
  overlay?: Graph2DPanelSummary | null;
  aggregate?: Graph2DPanelSummary | null;
  clique?: Graph2DPanelSummary | null;
  structural?: Graph2DPanelSummary | null;
  hasHighlightedElements?: boolean;
};

/** Selects only the result belonging to the visible analysis panel. */
export function selectGraph2DPanelSummary(candidates: Graph2DPanelSummaryCandidates): Graph2DPanelSummary {
  const activeSummary = candidates.incomplete ?? candidates.overlay ?? candidates.aggregate ??
    (candidates.panel === "clique" ? candidates.clique : null) ??
    (candidates.panel === "structural" ? candidates.structural : null);
  if (activeSummary?.resultLabel.trim()) {
    return {
      resultLabel: activeSummary.resultLabel,
      completionLabel: activeSummary.completionLabel ?? "",
      ...(activeSummary.kind ? { kind: activeSummary.kind } : {})
    };
  }
  return {
    resultLabel: candidates.hasHighlightedElements ? "Risultato selezionato evidenziato" : "Proiezione corrente",
    completionLabel: ""
  };
}

/** Selects the error belonging to the visible analysis, excluding stale errors from other panels. */
export function getGraph2DActiveAnalysisError(
  panel: Graph2DAnalysisPanel,
  analysisKind: string,
  errors: Graph2DAnalysisErrors
): string {
  let errorKey: keyof Graph2DAnalysisErrors | undefined;
  if (panel === "clique") errorKey = "clique";
  else if (panel === "integrity") errorKey = analysisKind === "integrityRepair" ? "integrityRepair" : "integrity";
  else if (panel === "provenance") errorKey = "provenanceClique";
  else if (panel === "structural") {
    errorKey = analysisKind === "provenanceKCore" ? "provenanceKCore"
      : analysisKind === "provenanceKPlex" ? "provenanceKPlex"
        : analysisKind === "provenanceComponent" ? "provenanceComponent"
          : analysisKind === "provenanceDominatingSet" ? "provenanceDominatingSet"
            : "structural";
  } else if (panel === "motif") {
    errorKey = analysisKind === "motifCount" ? "motifCount"
      : analysisKind === "motifCounterfactual" ? "motifCounterfactual"
        : analysisKind === "motifNearMatch" ? "motifNearMatch"
          : analysisKind === "motifScenarioComparison" ? "motifScenarioComparison"
            : analysisKind === "signedTriads" ? "signedTriads"
              : analysisKind === "signedTriadScenarioComparison" ? "signedTriadScenarioComparison"
            : analysisKind === "contextualClique" ? "contextualClique"
              : "motif";
  }
  const error = errorKey ? errors[errorKey] : "";
  return typeof error === "string" ? error : "";
}

/** Labels a failed or incomplete query without treating its partial models as witnesses. */
export function buildGraph2DIncompleteAnalysisSummary(
  errorMessage: unknown,
  provedInfeasibility = false
): Graph2DAnalysisSummary | null {
  if (provedInfeasibility) return null;
  if (typeof errorMessage !== "string" || !errorMessage.trim()) return null;
  const interrupted = /annullat[oa]|interrott[oa]/i.test(errorMessage);
  const limitReached = /tempo massimo|timeout|limite complessivo|budget complessivo|budget.*esaurit/i.test(errorMessage);
  const solverDidNotComplete = /enumeraz|ottim|solver|clingo|worker|certificat|parzial|non ha completat|non conferma/i.test(errorMessage);
  const engineUnavailable = /motore di calcolo non è disponibile|worker.{0,30}clingo.{0,30}non è disponibile|clingo.{0,30}worker.{0,30}non è disponibile/i.test(errorMessage);
  const prerequisiteMissing = /richiede|prerequisit|mapping|schemaversion|non contiene nodi|non sono stati generati fatti|seleziona|configura|mappat[oa]|mancant[ei]|assent[ei]|(?:gruppo|dominio|proiezione|insieme).{0,40}vuot[oa]/i.test(errorMessage);
  const executionError = /\berrore\b|\berror\b|eccezione|exception|failed|failure/i.test(errorMessage);
  const contextOnlySuffix = ` ${String.fromCodePoint(183)} ${String.fromCodePoint(232)} mostrato solo il grafo di contesto`;
  const summary: Graph2DAnalysisSummary = {
    resultLabel: "Risultato non disponibile",
    completionLabel: "Calcolo non completato · è mostrato solo il grafo di contesto"
  };
  if (limitReached) summary.completionLabel = `Limite di calcolo raggiunto${contextOnlySuffix}`;
  else if (interrupted) summary.completionLabel = `Calcolo interrotto${contextOnlySuffix}`;
  else if (engineUnavailable) summary.completionLabel = `Motore di calcolo non disponibile${contextOnlySuffix}`;
  else if (prerequisiteMissing) summary.completionLabel = `Analisi non eseguita${contextOnlySuffix}`;
  else if (executionError) summary.completionLabel = `Errore durante il calcolo${contextOnlySuffix}`;
  else if (!solverDidNotComplete) summary.completionLabel = `Errore durante il calcolo${contextOnlySuffix}`;
  else if (solverDidNotComplete) summary.completionLabel = `Calcolo non completato${contextOnlySuffix}`;
  return summary;
}

/** Labels a solver-proved infeasible query without implying that it was skipped. */
export function buildGraph2DInfeasibleAnalysisSummary(
  analysisLabel: string,
  reason: string
): Graph2DAnalysisSummary {
  const label = analysisLabel.trim();
  const explanation = reason.trim();
  if (!label || !explanation) throw new TypeError("L'analisi infeasible deve dichiarare task e motivo.");
  return {
    resultLabel: `${label} · nessuna soluzione ammissibile · solo grafo di contesto`,
    completionLabel: `Infeasibilità provata · ${explanation}`
  };
}

/** Labels the temporal walk shown to explain why no simple typed path exists. */
export function buildGraph2DTemporalNoRouteDiagnosticSummary(
  goalReachableAsWalk: boolean
): Graph2DAnalysisSummary {
  return {
    resultLabel: "Diagnosi del cammino temporale",
    completionLabel: goalReachableAsWalk
      ? "Nessun cammino semplice ammissibile · la meta si raggiunge solo ripassando da nodi visitati"
      : "Nessun cammino semplice ammissibile · il prefisso massimo non raggiunge la meta"
  };
}

/** Reports the correct proof state for optimization tasks that can be infeasible. */
export function buildGraph2DOptimizationCompletionLabel(options: {
  optimizationProven: boolean;
  hasSolution: boolean;
  enumerateAllOptima: boolean;
  allOptimaEnumerationComplete?: boolean;
}): string {
  if (!options.optimizationProven) return "Prova dell'ottimo non verificata";
  if (!options.hasSolution) return "Infeasibilità provata · nessuna soluzione ammissibile";
  if (!options.enumerateAllOptima) return "Ottimo provato · una soluzione ottima mostrata";
  return options.allOptimaEnumerationComplete === true
    ? "Ottimo provato · enumerazione completa degli ottimi"
    : "Ottimo provato · completezza dell’enumerazione non verificata";
}

/** Describes what a structural task proved without confusing one witness with full enumeration. */
export function buildGraph2DStructuralCompletionLabel(options: {
  task: StructuralTask;
  resultStatus?: string;
  completeModelEnumeration: boolean;
  maximumKPlexSearchComplete?: boolean;
  hasSolution: boolean;
  enumerateAllOptima: boolean;
  enumerateAllMaximalKPlex?: boolean;
}): string | undefined {
  if (options.resultStatus !== "SATISFIABLE" && options.resultStatus !== "OPTIMUM FOUND") return undefined;
  if (!options.hasSolution) return undefined;
  if (options.task === "components" || options.task === "weakComponents" || options.task === "strongComponents") {
    return "Partizione completa · tutte le componenti";
  }
  if (options.resultStatus === "SATISFIABLE" && options.task === "path") {
    return "Cammino minimo provato · un testimone mostrato";
  }
  if (options.resultStatus === "SATISFIABLE" && options.task === "typedPath") {
    return "Vincoli tipizzati soddisfatti · un cammino testimone mostrato";
  }
  if (options.resultStatus === "SATISFIABLE" && options.task === "maximalKPlex") {
    if (options.enumerateAllMaximalKPlex === true) {
      return options.completeModelEnumeration
        ? "Enumerazione completa · k-plex massimali"
        : "Enumerazione incompleta · k-plex massimali";
    }
    return "K-plex massimale certificato · un risultato mostrato";
  }
  if (options.resultStatus === "OPTIMUM FOUND" && options.task === "kCore") {
    return "k-core calcolato · risultato unico alla soglia";
  }
  if (options.task === "kPlex") {
    if (options.maximumKPlexSearchComplete !== true) return undefined;
    return buildGraph2DOptimizationCompletionLabel({
      optimizationProven: true,
      hasSolution: options.hasSolution,
      enumerateAllOptima: options.enumerateAllOptima,
      allOptimaEnumerationComplete: options.completeModelEnumeration
    });
  }
  if (options.resultStatus === "OPTIMUM FOUND") {
    return buildGraph2DOptimizationCompletionLabel({
      optimizationProven: true,
      hasSolution: true,
      enumerateAllOptima: options.enumerateAllOptima,
      allOptimaEnumerationComplete: options.completeModelEnumeration
    });
  }
  return options.completeModelEnumeration ? "Enumerazione completa" : undefined;
}

/** Labels a scenario witness only from the completion state of its own comparison. */
export function buildGraph2DScenarioComparisonCompletionLabel(options: {
  analysisLabel: string;
  scenarioCount: number;
  error?: string;
}): string {
  const label = options.analysisLabel.trim();
  if (!label) throw new TypeError("Il confronto tra scenari deve dichiarare il tipo di analisi.");
  if (options.error?.trim() || !Number.isInteger(options.scenarioCount) || options.scenarioCount < 1) {
    return "Completezza del confronto non verificata";
  }
  return `Confronto completo · ${options.scenarioCount} ${label}`;
}
