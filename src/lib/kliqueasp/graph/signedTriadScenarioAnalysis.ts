import { serializeCsv } from "../csvExport.ts";
import type { SignedTriadResult } from "./signedTriadTask.ts";

export const FINITE_SIGNED_TRIAD_WORLD_ASSUMPTION = "finite-exhaustive-worlds" as const;

export type SignedTriadWorldClassification = "balanced" | "unbalanced" | "not-classified";
export type SignedTriadScenarioStability =
  | "stable-balanced"
  | "stable-unbalanced"
  | "balance-varies"
  | "classification-varies"
  | "balance-and-classification-vary";

export interface SignedTriadScenarioInput {
  scenarioId: string;
  scenarioLabel: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  enumerationComplete: boolean;
  triads: readonly SignedTriadResult[];
}

export interface SignedTriadScenarioSummary {
  scenarioId: string;
  scenarioLabel: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  classifiedTriads: number;
  balancedTriads: number;
  unbalancedTriads: number;
  balancedShare: number | null;
  commonTriads: number;
  balancedCommonTriads: number;
  unbalancedCommonTriads: number;
  balancedCommonShare: number | null;
  notClassifiedWithinObservedUnion: number;
  enumerationComplete: true;
}

export interface SignedTriadScenarioWorldStatus {
  scenarioId: string;
  scenarioLabel: string;
  classification: SignedTriadWorldClassification;
  evidence?: SignedTriadResult;
}

export interface SignedTriadScenarioMembership {
  /** Canonically sorted source node IDs; independent of ASP integer indices. */
  nodeIds: [string, string, string];
  stability: SignedTriadScenarioStability;
  worlds: SignedTriadScenarioWorldStatus[];
}

export interface SignedTriadScenarioQueryScope {
  attribute: string;
  positiveValues: readonly (string | number | boolean)[];
  negativeValues: readonly (string | number | boolean)[];
  edgeTypes: readonly string[];
  selectedGroup: string;
  timelineWindow: string;
  minimumEdgeConfidence: number | null;
  viewFilters: { types: string[]; groups: string[] };
}

export interface SignedTriadScenarioComparison {
  worldAssumption: typeof FINITE_SIGNED_TRIAD_WORLD_ASSUMPTION;
  queryScope: SignedTriadScenarioQueryScope;
  scenarios: SignedTriadScenarioSummary[];
  memberships: SignedTriadScenarioMembership[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} deve essere una stringa non vuota`);
  }
  return value.trim();
}

function requireCount(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new RangeError(`${path} deve essere un intero non negativo`);
  }
  return value as number;
}

function isPolarityScalar(value: unknown): value is string | number | boolean {
  return typeof value === "string" ? value.trim() !== "" :
    typeof value === "number" ? Number.isFinite(value) :
    typeof value === "boolean";
}

function polarityValueSignature(value: string | number | boolean): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function validatePolarityValues(
  input: readonly (string | number | boolean)[],
  path: string
): string[] {
  if (input.length === 0) throw new RangeError(`${path} deve contenere almeno un valore`);
  if (input.some((value) => !isPolarityScalar(value))) {
    throw new TypeError(`${path} deve contenere stringhe non vuote, numeri finiti o booleani`);
  }
  const signatures = input.map(polarityValueSignature);
  if (new Set(signatures).size !== signatures.length) {
    throw new TypeError(`${path} non deve contenere valori duplicati`);
  }
  return signatures;
}

function canonicalEdgeTypes(input: readonly string[]): string[] {
  if (!Array.isArray(input) || input.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new TypeError("edgeTypes deve contenere solo stringhe non vuote");
  }
  const values = input.map((value) => value.trim());
  if (new Set(values).size !== values.length) throw new TypeError("edgeTypes non deve contenere duplicati");
  return values.sort(compareText);
}

function canonicalNodeIds(input: unknown, path: string): [string, string, string] {
  if (!Array.isArray(input) || input.length !== 3) {
    throw new TypeError(`${path} deve contenere esattamente tre ID sorgente`);
  }
  const ids = input.map((value, index) => requireText(value, `${path}[${index}]`));
  if (new Set(ids).size !== 3) throw new TypeError(`${path} deve contenere tre ID distinti`);
  return ids.sort(compareText) as [string, string, string];
}

function validateTriadWitness(triad: SignedTriadResult, nodeIds: readonly string[], path: string): void {
  if (!Array.isArray(triad.dyads) || triad.dyads.length !== 3) {
    throw new TypeError(`${path}.dyads deve contenere i tre testimoni di dyade`);
  }
  const nodeSet = new Set(nodeIds);
  const seenPairs = new Set<string>();
  const seenEdgeIds = new Set<string>();
  let negativeDyadCount = 0;
  for (const [index, dyad] of triad.dyads.entries()) {
    const sourceNodeId = requireText(dyad?.sourceNodeId, `${path}.dyads[${index}].sourceNodeId`);
    const targetNodeId = requireText(dyad?.targetNodeId, `${path}.dyads[${index}].targetNodeId`);
    if (sourceNodeId === targetNodeId || !nodeSet.has(sourceNodeId) || !nodeSet.has(targetNodeId)) {
      throw new TypeError(`${path}.dyads[${index}] non collega due nodi distinti della triade`);
    }
    const pairKey = JSON.stringify([sourceNodeId, targetNodeId].sort(compareText));
    if (seenPairs.has(pairKey)) throw new TypeError(`${path}.dyads contiene una coppia duplicata`);
    seenPairs.add(pairKey);
    if (dyad.polarity !== "positive" && dyad.polarity !== "negative") {
      throw new TypeError(`${path}.dyads[${index}].polarity non è valida`);
    }
    if (dyad.polarity === "negative") negativeDyadCount += 1;
    if (!Array.isArray(dyad.edgeRecords) || dyad.edgeRecords.length === 0) {
      throw new TypeError(`${path}.dyads[${index}].edgeRecords deve contenere gli ID sorgente`);
    }
    for (const [recordIndex, record] of dyad.edgeRecords.entries()) {
      const edgeId = requireText(record?.id, `${path}.dyads[${index}].edgeRecords[${recordIndex}].id`);
      if (seenEdgeIds.has(edgeId)) throw new TypeError(`${path} riusa l'ID sorgente '${edgeId}' in più dyadi`);
      seenEdgeIds.add(edgeId);
      if (typeof record.generated !== "boolean") {
        throw new TypeError(`${path}.dyads[${index}].edgeRecords[${recordIndex}].generated deve essere booleano`);
      }
    }
  }
  if (seenPairs.size !== 3 || negativeDyadCount !== triad.negativeDyadCount) {
    throw new TypeError(`${path} non contiene i tre legami e la parità di segni dichiarati`);
  }
}

function canonicalViewFilters(value: SignedTriadScenarioQueryScope["viewFilters"]) {
  if (!value || !Array.isArray(value.types) || !Array.isArray(value.groups) ||
    [...value.types, ...value.groups].some((entry) => typeof entry !== "string")) {
    throw new TypeError("viewFilters deve contenere liste di tipi e gruppi");
  }
  return {
    types: [...new Set(value.types)].sort(compareText),
    groups: [...new Set(value.groups)].sort(compareText)
  };
}

function stabilityFor(worlds: readonly SignedTriadScenarioWorldStatus[]): SignedTriadScenarioStability {
  const classifications = new Set(worlds.map((world) => world.classification));
  if (classifications.size === 1 && classifications.has("balanced")) return "stable-balanced";
  if (classifications.size === 1 && classifications.has("unbalanced")) return "stable-unbalanced";
  const classifiable = new Set(worlds
    .map((world) => world.classification)
    .filter((status) => status !== "not-classified"));
  if (!classifications.has("not-classified")) return "balance-varies";
  return classifiable.size > 1 ? "balance-and-classification-vary" : "classification-varies";
}

/**
 * Compares the union of complete signed-triad classifications over explicitly
 * exhaustive finite graph worlds. A missing classification is kept distinct
 * from an unbalanced triad: it means this task emitted no classification for
 * that node triple in that world.
 */
export function summarizeSignedTriadScenarios(
  scenarioInputs: readonly SignedTriadScenarioInput[],
  queryScopeInput: SignedTriadScenarioQueryScope
): SignedTriadScenarioComparison {
  if (!Array.isArray(scenarioInputs) || scenarioInputs.length === 0) {
    throw new RangeError("Serve almeno uno scenario completo per confrontare le triadi firmate");
  }
  if (!queryScopeInput || typeof queryScopeInput !== "object" || Array.isArray(queryScopeInput)) {
    throw new TypeError("Il confronto deve conservare la configurazione di polarità e il contesto della query");
  }
  const attribute = requireText(queryScopeInput.attribute, "queryScope.attribute");
  if (!Array.isArray(queryScopeInput.positiveValues) || !Array.isArray(queryScopeInput.negativeValues)) {
    throw new TypeError("positiveValues e negativeValues devono essere liste");
  }
  const positiveSignatures = validatePolarityValues(queryScopeInput.positiveValues, "positiveValues");
  const negativeSignatures = validatePolarityValues(queryScopeInput.negativeValues, "negativeValues");
  if (negativeSignatures.some((signature) => positiveSignatures.includes(signature))) {
    throw new TypeError("positiveValues e negativeValues devono essere disgiunti");
  }
  if (typeof queryScopeInput.selectedGroup !== "string" || typeof queryScopeInput.timelineWindow !== "string") {
    throw new TypeError("selectedGroup e timelineWindow devono essere stringhe");
  }
  const threshold = queryScopeInput.minimumEdgeConfidence;
  if (threshold !== null && (!Number.isFinite(threshold) || threshold < 0)) {
    throw new RangeError("minimumEdgeConfidence deve essere null o un numero finito non negativo");
  }
  const queryScope: SignedTriadScenarioQueryScope = {
    attribute,
    positiveValues: [...queryScopeInput.positiveValues],
    negativeValues: [...queryScopeInput.negativeValues],
    edgeTypes: canonicalEdgeTypes(queryScopeInput.edgeTypes),
    selectedGroup: queryScopeInput.selectedGroup,
    timelineWindow: queryScopeInput.timelineWindow,
    minimumEdgeConfidence: threshold,
    viewFilters: canonicalViewFilters(queryScopeInput.viewFilters)
  };

  const scenarioIds = new Set<string>();
  const occurrenceByTriple = new Map<string, Map<string, SignedTriadResult>>();
  const scenarioRows: Array<Omit<
    SignedTriadScenarioSummary,
    | "commonTriads"
    | "balancedCommonTriads"
    | "unbalancedCommonTriads"
    | "balancedCommonShare"
    | "notClassifiedWithinObservedUnion"
  >> = [];

  for (const [scenarioIndex, scenario] of scenarioInputs.entries()) {
    const scenarioId = requireText(scenario?.scenarioId, `scenarios[${scenarioIndex}].scenarioId`);
    const scenarioLabel = requireText(scenario?.scenarioLabel, `scenarios[${scenarioIndex}].scenarioLabel`);
    if (scenarioIds.has(scenarioId)) throw new TypeError(`ID scenario duplicato: ${scenarioId}`);
    scenarioIds.add(scenarioId);
    const nodesCount = requireCount(scenario.nodesCount, `scenarios[${scenarioIndex}].nodesCount`);
    const linksCount = requireCount(scenario.linksCount, `scenarios[${scenarioIndex}].linksCount`);
    if (!Number.isFinite(scenario.timeMs) || scenario.timeMs < 0) {
      throw new RangeError(`scenarios[${scenarioIndex}].timeMs deve essere finito e non negativo`);
    }
    if (scenario.enumerationComplete !== true) {
      throw new Error(`Lo scenario '${scenarioId}' non ha un'enumerazione completa; il confronto è stato rifiutato`);
    }
    if (!Array.isArray(scenario.triads)) throw new TypeError(`scenarios[${scenarioIndex}].triads deve essere una lista`);
    const seenTriples = new Set<string>();
    let balancedTriads = 0;
    let unbalancedTriads = 0;
    for (const [triadIndex, triad] of scenario.triads.entries()) {
      const ids = canonicalNodeIds(triad?.nodeIds, `scenarios[${scenarioIndex}].triads[${triadIndex}].nodeIds`);
      const key = JSON.stringify(ids);
      if (seenTriples.has(key)) throw new TypeError(`Triade duplicata nello scenario '${scenarioId}': ${key}`);
      seenTriples.add(key);
      if (typeof triad.balanced !== "boolean") throw new TypeError(`Classificazione non valida per ${key}`);
      if (!Number.isInteger(triad.negativeDyadCount) || triad.negativeDyadCount < 0 || triad.negativeDyadCount > 3 ||
        triad.balanced !== (triad.negativeDyadCount % 2 === 0)) {
        throw new TypeError(`La parità delle dyadi negative non coincide con la classificazione per ${key}`);
      }
      validateTriadWitness(triad, ids, `scenarios[${scenarioIndex}].triads[${triadIndex}]`);
      const evidence: SignedTriadResult = { ...triad, nodeIds: ids };
      const occurrences = occurrenceByTriple.get(key) ?? new Map<string, SignedTriadResult>();
      occurrences.set(scenarioId, evidence);
      occurrenceByTriple.set(key, occurrences);
      if (triad.balanced) balancedTriads += 1;
      else unbalancedTriads += 1;
    }
    scenarioRows.push({
      scenarioId,
      scenarioLabel,
      nodesCount,
      linksCount,
      timeMs: scenario.timeMs,
      classifiedTriads: scenario.triads.length,
      balancedTriads,
      unbalancedTriads,
      balancedShare: scenario.triads.length === 0 ? null : balancedTriads / scenario.triads.length,
      enumerationComplete: true
    });
  }

  const tripleKeys = [...occurrenceByTriple.keys()].sort((left, right) => {
    const leftIds = JSON.parse(left) as string[];
    const rightIds = JSON.parse(right) as string[];
    return leftIds.map((id, index) => compareText(id, rightIds[index])).find((difference) => difference !== 0) ?? 0;
  });
  const memberships = tripleKeys.map((key): SignedTriadScenarioMembership => {
    const nodeIds = JSON.parse(key) as [string, string, string];
    const occurrences = occurrenceByTriple.get(key)!;
    const worlds = scenarioRows.map((scenario): SignedTriadScenarioWorldStatus => {
      const evidence = occurrences.get(scenario.scenarioId);
      return {
        scenarioId: scenario.scenarioId,
        scenarioLabel: scenario.scenarioLabel,
        classification: evidence ? evidence.balanced ? "balanced" : "unbalanced" : "not-classified",
        ...(evidence ? { evidence } : {})
      };
    });
    return { nodeIds, stability: stabilityFor(worlds), worlds };
  });
  const observedUnionSize = memberships.length;
  const commonMemberships = memberships.filter(({ worlds }) =>
    worlds.length === scenarioRows.length && worlds.every((world) => world.classification !== "not-classified")
  );
  const balancedCommonByScenario = new Map(scenarioRows.map((scenario) => [scenario.scenarioId, 0]));
  for (const membership of commonMemberships) {
    for (const world of membership.worlds) {
      if (world.evidence?.balanced === true) {
        balancedCommonByScenario.set(world.scenarioId, (balancedCommonByScenario.get(world.scenarioId) ?? 0) + 1);
      }
    }
  }
  const scenarios = scenarioRows.map((scenario): SignedTriadScenarioSummary => {
    const balancedCommonTriads = balancedCommonByScenario.get(scenario.scenarioId) ?? 0;
    const commonTriads = commonMemberships.length;
    return {
      ...scenario,
      commonTriads,
      balancedCommonTriads,
      unbalancedCommonTriads: commonTriads - balancedCommonTriads,
      balancedCommonShare: commonTriads === 0 ? null : balancedCommonTriads / commonTriads,
      notClassifiedWithinObservedUnion: observedUnionSize - scenario.classifiedTriads
    };
  });
  return {
    worldAssumption: FINITE_SIGNED_TRIAD_WORLD_ASSUMPTION,
    queryScope,
    scenarios,
    memberships
  };
}

/** Exports only observed triad identities and complete per-world classifications. */
export function buildSignedTriadScenarioCsv(comparison: SignedTriadScenarioComparison): string {
  const headers = [
    "record_type",
    "world_assumption",
    "edge_attribute",
    "edge_types_json",
    "positive_values_json",
    "negative_values_json",
    "selected_group",
    "timeline_window",
    "minimum_edge_confidence",
    "view_types_json",
    "view_groups_json",
    "node_ids_json",
    "stability",
    "world_classifications_json",
    "world_witnesses_json",
    "scenario_summary_json"
  ];
  const scenarioSummaryJson = JSON.stringify(comparison.scenarios.map((scenario) => ({
    scenario_id: scenario.scenarioId,
    scenario_label: scenario.scenarioLabel,
    nodes_count: scenario.nodesCount,
    links_count: scenario.linksCount,
    classified_triads: scenario.classifiedTriads,
    balanced_triads: scenario.balancedTriads,
    unbalanced_triads: scenario.unbalancedTriads,
    balanced_share: scenario.balancedShare,
    common_classified_triads: scenario.commonTriads,
    balanced_common_triads: scenario.balancedCommonTriads,
    unbalanced_common_triads: scenario.unbalancedCommonTriads,
    balanced_common_share: scenario.balancedCommonShare,
    not_classified_within_observed_union: scenario.notClassifiedWithinObservedUnion,
    enumeration_complete: scenario.enumerationComplete,
    solver_time_ms: scenario.timeMs
  })));
  const queryFields = [
    comparison.worldAssumption,
    comparison.queryScope.attribute,
    JSON.stringify(comparison.queryScope.edgeTypes),
    JSON.stringify(comparison.queryScope.positiveValues),
    JSON.stringify(comparison.queryScope.negativeValues),
    comparison.queryScope.selectedGroup,
    comparison.queryScope.timelineWindow,
    comparison.queryScope.minimumEdgeConfidence ?? "",
    JSON.stringify(comparison.queryScope.viewFilters.types),
    JSON.stringify(comparison.queryScope.viewFilters.groups)
  ];
  const rows = comparison.memberships.map((membership) => [
    "triad",
    ...queryFields,
    JSON.stringify(membership.nodeIds),
    membership.stability,
    JSON.stringify(membership.worlds.map(({ scenarioId, scenarioLabel, classification }) => ({
      scenario_id: scenarioId,
      scenario_label: scenarioLabel,
      classification
    }))),
    JSON.stringify(membership.worlds.filter((world) => world.evidence).map((world) => ({
      scenario_id: world.scenarioId,
      triad: world.evidence
    }))),
    scenarioSummaryJson
  ]);
  if (rows.length === 0) {
    rows.push([
      "summary", ...queryFields, "", "", "[]", "[]", scenarioSummaryJson
    ]);
  }
  return serializeCsv([headers, ...rows]);
}
