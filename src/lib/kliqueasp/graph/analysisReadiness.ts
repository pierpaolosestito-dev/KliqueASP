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

export type StructuralEndpointTask =
  | "path"
  | "typedPath"
  | "minimumNodeSeparator"
  | "minimumCostNodeSeparator"
  | "minimumEdgeSeparator"
  | "minimumCostEdgeSeparator";

function parseNumericInput(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Explains why the primary clique action in the analysis menu is disabled. */
export function describeCliqueAnalysisMenuBlocker(options: {
  workerStatus: "initializing" | "ready" | "error";
  dataAvailable: boolean;
  dataReasons: readonly string[];
}): string {
  if (options.workerStatus === "error") return "";
  const blockers: string[] = [];
  if (options.workerStatus === "initializing") {
    blockers.push("Il motore di analisi è in avvio. Attendi che sia pronto.");
  }
  if (!options.dataAvailable) {
    const reasons = options.dataReasons.map((reason) => reason.trim()).filter(Boolean);
    blockers.push(reasons.length > 0
      ? reasons.join(" ")
      : "Completa i dati e la mappatura prima di avviare l'analisi delle clique.");
  }
  return blockers.join(" ");
}

/** Explains the mandatory degree semantics for k-core on directed graphs. */
export function describeDirectedKCoreModeBlocker(options: {
  directed: boolean;
  mode: string;
}): string {
  if (!options.directed || ["in", "out", "mutual"].includes(options.mode)) return "";
  return "Scegli se contare i predecessori, i successori o solo i vicini reciproci.";
}

/** Explains the supported integer range for a node-neighborhood focus. */
export function describeNeighborhoodRadiusBlocker(options: {
  radius: unknown;
  maximum: number;
}): string {
  const radius = parseNumericInput(options.radius);
  return radius !== undefined && Number.isSafeInteger(radius) && radius >= 1 && radius <= options.maximum
    ? ""
    : `Inserisci un raggio intero da 1 a ${options.maximum}.`;
}

/** Returns concise input guidance for the numeric controls that gate structural runs. */
export function describeStructuralParameterBlocker(options: {
  task: string;
  parameter: unknown;
}): string {
  const value = parseNumericInput(options.parameter);
  if (options.task === "kPlex" || options.task === "maximalKPlex") {
    return value !== undefined && Number.isInteger(value) && value >= 1 ? "" : "Inserisci un intero s pari o superiore a 1.";
  }
  if (options.task === "kCore") {
    return value !== undefined && Number.isInteger(value) && value >= 0 ? "" : "Inserisci un intero k pari o superiore a 0.";
  }
  if (options.task === "path") {
    return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 100 ? "" : "Inserisci un limite intero da 0 a 100 archi.";
  }
  return "";
}

/** Explains the selected node or maximum-result prerequisite for k-plex membership actions. */
export function describeKPlexMembershipBlocker(options: {
  maximumAvailable: boolean;
  targetNodeId: string;
}): string {
  if (!options.maximumAvailable) {
    return "Calcola prima un k-plex massimo con la proiezione e i parametri correnti.";
  }
  return options.targetNodeId.trim() ? "" : "Seleziona un nodo da spiegare.";
}

/** Returns field-specific guidance for an invalid community-count interval. */
export function describeCommunityCountBlocker(options: {
  minimum: unknown;
  maximum: unknown;
}): string {
  const minimum = parseNumericInput(options.minimum);
  const maximum = parseNumericInput(options.maximum);
  if (minimum === undefined || maximum === undefined || !Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 0 || maximum < 0) {
    return "Inserisci numeri interi non negativi; 0 significa nessun limite.";
  }
  if (minimum > 0 && maximum > 0 && minimum > maximum) {
    return "Il numero minimo non può superare il massimo. Imposta a 0 il limite che vuoi lasciare libero.";
  }
  return "";
}

/** Explains the endpoint selections that keep a structural analysis disabled. */
export function describeStructuralEndpointBlocker(options: {
  task: string;
  startNodeId: string;
  goalNodeId: string;
}): string {
  const endpointTasks: readonly StructuralEndpointTask[] = [
    "path", "typedPath", "minimumNodeSeparator", "minimumCostNodeSeparator", "minimumEdgeSeparator", "minimumCostEdgeSeparator"
  ];
  if (!endpointTasks.includes(options.task as StructuralEndpointTask)) return "";

  const startNodeId = options.startNodeId.trim();
  const goalNodeId = options.goalNodeId.trim();
  if (!startNodeId && !goalNodeId) return "Seleziona un nodo iniziale e un nodo finale.";
  if (!startNodeId) return "Seleziona un nodo iniziale.";
  if (!goalNodeId) return "Seleziona un nodo finale.";

  const requiresDistinctTerminals = options.task !== "path";
  return requiresDistinctTerminals && startNodeId === goalNodeId
    ? "Scegli due nodi terminali distinti."
    : "";
}

/** Explains why another relationship step cannot be added to a typed path. */
export function describeTypedPathStepAdditionBlocker(options: {
  availableTypeCount: number;
  stepCount: number;
  maximumSteps?: number;
}): string {
  if (options.availableTypeCount <= 0) {
    return "Non ci sono tipi d'arco disponibili. Mappa il tipo di relazione in Dati e configurazione.";
  }
  const maximumSteps = options.maximumSteps ?? 100;
  return options.stepCount >= maximumSteps
    ? `Hai raggiunto il limite di ${maximumSteps} passi per un cammino tipizzato.`
    : "";
}

/** Explains why a pair-level community analysis cannot run yet. */
export function describeCommunityPairActionBlocker(options: {
  analysisAvailable: boolean;
  action: "membership" | "topologyCounterfactual";
  leftNodeId: string;
  rightNodeId: string;
}): string {
  const leftNodeId = options.leftNodeId.trim();
  const rightNodeId = options.rightNodeId.trim();
  if (!options.analysisAvailable) {
    return options.action === "membership"
      ? "Ricalcola la modularità sulla proiezione corrente per abilitare la verifica."
      : "Ricalcola la modularità sulla proiezione corrente per valutare le modifiche.";
  }
  if (!leftNodeId) return "Seleziona il primo nodo della coppia.";
  if (!rightNodeId) return "Seleziona il secondo nodo della coppia.";
  if (leftNodeId === rightNodeId) return "Scegli due nodi distinti per la coppia.";
  return "";
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

/** Gives one actionable mapping instruction per repair attribute that the graph does not expose. */
export function describeMissingRepairAttributeMappings(options: {
  nodeAttributes: readonly string[];
  edgeAttributes: readonly string[];
}): string[] {
  return [
    ...options.nodeAttributes.map((attribute) => `Mappa l'attributo del nodo "${attribute}" usato dalle riparazioni.`),
    ...options.edgeAttributes.map((attribute) => `Mappa l'attributo dell'arco "${attribute}" usato dalle riparazioni.`)
  ];
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
