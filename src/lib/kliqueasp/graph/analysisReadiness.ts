export interface AnalysisTaskReadiness {
  label: string;
  available: boolean;
  reasons: string[];
}

export interface AnalysisReadinessSummary {
  availableCount: number;
  blockedCount: number;
  totalCount: number;
  blockedTasks: AnalysisTaskReadiness[];
}

/** Summarizes a group of configured analyses without hiding each task's own blocker. */
export function summarizeAnalysisReadiness(
  tasks: readonly AnalysisTaskReadiness[]
): AnalysisReadinessSummary {
  const blockedTasks = tasks.filter((task) => !task.available);
  return {
    availableCount: tasks.length - blockedTasks.length,
    blockedCount: blockedTasks.length,
    totalCount: tasks.length,
    blockedTasks
  };
}

export function describeTypedPathCounterfactualBlocker(options: {
  enabled: boolean;
  requirementReasons: readonly string[];
  startNodeId: string;
  goalNodeId: string;
  edgeTypeSequence: readonly string[];
}): string {
  if (!options.enabled || options.requirementReasons.length > 0) return "";
  if (!options.startNodeId || !options.goalNodeId) return "Seleziona il nodo iniziale e quello finale nel pannello sopra.";
  if (options.startNodeId === options.goalNodeId) return "Scegli due nodi terminali distinti per il cammino.";
  if (options.edgeTypeSequence.length === 0) return "Aggiungi almeno un passo e scegli il tipo di relazione da cercare.";
  if (options.edgeTypeSequence.some((type) => !type.trim())) return "Scegli un tipo di relazione per ogni passo della sequenza.";
  return "";
}

export function describeStructuralCounterfactualBlocker(options: {
  invalidTarget: boolean;
  minimumTarget: number;
  maximumTarget?: number;
  cohortNodeCount: number;
  targetNodeSelection: boolean;
  targetNodeCount: number;
  targetNodeSelected: boolean;
}): string {
  if (options.invalidTarget) {
    const bounds = options.maximumTarget === undefined
      ? `almeno ${options.minimumTarget}`
      : `da ${options.minimumTarget} a ${options.maximumTarget}`;
    return `Inserisci una soglia intera ${bounds}.`;
  }
  if (options.cohortNodeCount === 0) {
    return "Il gruppo candidato non contiene nodi. Scegli un gruppo più ampio o modifica la proiezione.";
  }
  if (options.targetNodeSelection && options.targetNodeCount === 0) {
    return "Nessun nodo obiettivo è disponibile nel gruppo corrente. Cambia gruppo o proiezione.";
  }
  if (options.targetNodeSelection && !options.targetNodeSelected) {
    return "Seleziona un nodo obiettivo disponibile nel dominio corrente.";
  }
  return "";
}
