import {
  classifyCommunityPairOptimumMembership,
  type CommunityCoassignmentRelation,
  type CommunityPairOptimumMembership
} from "./communityOptimumStability.ts";
import { serializeCsv } from "../csvExport.ts";
import { scaleNonNegativeDecimalWeights } from "./exactDecimal.ts";

export const MAX_COMMUNITY_TOPOLOGY_EDGE_EDITS = 8;

export interface CommunityTopologyEdgeAddition {
  id: string;
  action: "add";
  sourceNodeId: string | number;
  targetNodeId: string | number;
  cost: number;
  weight?: number;
}

export interface CommunityTopologyEdgeRemoval {
  id: string;
  action: "remove";
  edgeId: string | number;
  cost: number;
}

export type CommunityTopologyEdgeEdit = CommunityTopologyEdgeAddition | CommunityTopologyEdgeRemoval;

export interface CommunityTopologyCounterfactualConfig {
  edgeEdits: CommunityTopologyEdgeEdit[];
}

export interface CommunityTopologyCounterfactualResult {
  nodeIds: [string, string];
  requestedRelation: CommunityCoassignmentRelation;
  relation: CommunityCoassignmentRelation;
  selectedEdits: CommunityTopologyEdgeEdit[];
  candidateCount: number;
  totalEditCost: number;
  testedEditSets: number;
  globalScaledScore: number;
  togetherScaledScore: number | null;
  separateScaledScore: number | null;
  modularityDenominator: string;
}

export interface CommunityTopologyCounterfactualCsvOptions {
  result: CommunityTopologyCounterfactualResult;
  sourceIdByNodeId: Record<string, string>;
  nodeLabels: Record<string, string>;
  selectedGroup: string;
  resolution: string | number;
  weighted: boolean;
}

export interface CommunityTopologyCounterfactualGraphScores {
  togetherScaledScore: number | null;
  separateScaledScore: number | null;
  modularityDenominator: string;
}

export type CommunityTopologyCounterfactualSearchOutcome =
  | { status: "found"; result: CommunityTopologyCounterfactualResult }
  | { status: "not-found"; testedEditSets: number; candidateCount: number };

/**
 * Searches candidate edge-edit subsets in ASP-proven nondecreasing cost order.
 * Each graph evaluator must return only after both constrained modularity
 * optima have been proved (or one has been proved infeasible).
 */
export async function searchMinimumCostCommunityTopologyCounterfactual(options: {
  edits: readonly CommunityTopologyEdgeEdit[];
  nodeIds: [string, string];
  requestedRelation: CommunityCoassignmentRelation;
  solveSelection: (program: string) => Promise<unknown>;
  evaluateGraph: (editIndexes: readonly number[]) => Promise<CommunityTopologyCounterfactualGraphScores | null>;
}): Promise<CommunityTopologyCounterfactualSearchOutcome> {
  const { edits, nodeIds, requestedRelation, solveSelection, evaluateGraph } = options;
  const configurationError = validateCommunityTopologyCounterfactualConfig({ edgeEdits: edits },
    edits.some((edit) => edit.action === "add" && edit.weight !== undefined));
  if (configurationError) throw new TypeError(configurationError);
  if (!Array.isArray(nodeIds) || nodeIds.length !== 2 || !nodeIds.every((id) => typeof id === "string" && id.length > 0) || nodeIds[0] === nodeIds[1]) {
    throw new TypeError("La coppia del controfattuale deve contenere due ID distinti e non vuoti.");
  }
  if (requestedRelation !== "always" && requestedRelation !== "sometimes" && requestedRelation !== "never") {
    throw new TypeError("La relazione richiesta deve essere always, sometimes oppure never.");
  }

  const excluded: number[][] = [];
  const signatures = new Set<string>();
  let previousCost = -1;
  for (let attempt = 0; attempt <= 2 ** edits.length; attempt += 1) {
    const rawSelection = await solveSelection(buildMinimumCostCommunityEditSelectionProgram(edits, excluded));
    if (!rawSelection || typeof rawSelection !== "object") throw new Error("Risposta vuota del selettore ASP degli edit.");
    const response = rawSelection as { Result?: unknown; Call?: Array<{ Witnesses?: unknown }> };
    if (response.Result === "UNSATISFIABLE") {
      return { status: "not-found", testedEditSets: excluded.length, candidateCount: edits.length };
    }
    if (response.Result !== "OPTIMUM FOUND") {
      throw new Error(`Il selettore non ha provato il costo minimo del prossimo sottoinsieme (${String(response.Result ?? "risposta vuota")}).`);
    }
    const selection = parseCommunityEditSelectionWitnesses(response.Call?.[0]?.Witnesses, edits.map(({ cost }) => cost));
    if (selection.totalCost < previousCost) throw new Error("Il selettore ASP ha restituito sottoinsiemi fuori ordine di costo.");
    previousCost = selection.totalCost;
    const signature = selection.indexes.join(",");
    if (signatures.has(signature)) throw new Error("Il selettore ASP ha ripetuto un sottoinsieme di edit già valutato.");
    signatures.add(signature);

    const scores = await evaluateGraph(selection.indexes);
    if (scores === null) {
      excluded.push(selection.indexes);
      continue;
    }
    const classified = classifyCommunityTopologyCounterfactual(
      nodeIds,
      requestedRelation,
      scores.togetherScaledScore,
      scores.separateScaledScore
    );
    if (communityTopologyCounterfactualMeetsTarget(classified, requestedRelation)) {
      return {
        status: "found",
        result: {
          nodeIds: [...nodeIds],
          requestedRelation,
          relation: classified.relation,
          selectedEdits: selection.indexes.map((index) => edits[index]),
          candidateCount: edits.length,
          totalEditCost: selection.totalCost,
          testedEditSets: excluded.length + 1,
          globalScaledScore: classified.globalScaledScore,
          togetherScaledScore: scores.togetherScaledScore,
          separateScaledScore: scores.separateScaledScore,
          modularityDenominator: scores.modularityDenominator
        }
      };
    }
    excluded.push(selection.indexes);
  }
  throw new Error("Il selettore ASP ha superato il numero finito dei sottoinsiemi possibili.");
}

/** Exports the finite candidate scope and the exact proof scores of the proposed graph. */
export function buildCommunityTopologyCounterfactualCsv({
  result,
  sourceIdByNodeId,
  nodeLabels,
  selectedGroup,
  resolution,
  weighted
}: CommunityTopologyCounterfactualCsvOptions): string {
  const [leftNodeId, rightNodeId] = result.nodeIds;
  const rows: unknown[][] = [[
    "record_type", "edit_id", "edit_action", "source_node_id", "target_node_id", "removed_edge_id", "edit_cost",
    "total_edit_cost", "candidate_edit_count", "tested_edit_sets", "node_a_id", "node_a_label", "node_b_id",
    "node_b_label", "requested_relation", "verified_relation", "global_optimum_scaled_score",
    "together_optimum_scaled_score", "separate_optimum_scaled_score", "modularity_denominator_exact",
    "selected_group", "resolution_gamma", "weighted", "structured_witness_json"
  ]];
  const metadata = {
    pair_internal_ids: result.nodeIds,
    pair_source_ids: result.nodeIds.map((id) => sourceIdByNodeId[id] ?? id),
    requested_relation: result.requestedRelation,
    verified_relation: result.relation,
    total_edit_cost: result.totalEditCost,
    candidate_edit_count: result.candidateCount,
    tested_edit_sets: result.testedEditSets,
    global_optimum_scaled_score: result.globalScaledScore,
    together_optimum_scaled_score: result.togetherScaledScore,
    separate_optimum_scaled_score: result.separateScaledScore,
    modularity_denominator_exact: result.modularityDenominator,
    semantics: "minimum configured edge-edit cost among fully checked subsets whose modified graph has the requested pair relation in its exact modularity optima",
    edit_cost_is_separate_from_modularity: true
  };
  const rowsForEdit = result.selectedEdits.length > 0 ? result.selectedEdits : [null];
  for (const edit of rowsForEdit) {
    rows.push([
      edit ? "selected_edit" : "no_edit_needed",
      edit?.id ?? "",
      edit?.action ?? "",
      edit?.action === "add" ? String(edit.sourceNodeId) : "",
      edit?.action === "add" ? String(edit.targetNodeId) : "",
      edit?.action === "remove" ? String(edit.edgeId) : "",
      edit?.cost ?? "",
      result.totalEditCost,
      result.candidateCount,
      result.testedEditSets,
      sourceIdByNodeId[leftNodeId] ?? leftNodeId,
      nodeLabels[leftNodeId] ?? leftNodeId,
      sourceIdByNodeId[rightNodeId] ?? rightNodeId,
      nodeLabels[rightNodeId] ?? rightNodeId,
      result.requestedRelation,
      result.relation,
      result.globalScaledScore,
      result.togetherScaledScore ?? "",
      result.separateScaledScore ?? "",
      result.modularityDenominator,
      selectedGroup,
      resolution,
      weighted,
      JSON.stringify({
        ...metadata,
        selected_edit: edit,
        selected_edit_ids: result.selectedEdits.map(({ id }) => id)
      })
    ]);
  }
  return serializeCsv(rows);
}

/** Validates the configured finite search surface without depending on app state. */
export function validateCommunityTopologyCounterfactualConfig(
  value: unknown,
  weighted: boolean
): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "graphAnalysis.communities.topologyCounterfactuals deve essere un oggetto.";
  }
  const config = value as Record<string, unknown>;
  if (Object.keys(config).some((key) => key !== "edgeEdits")) {
    return "graphAnalysis.communities.topologyCounterfactuals contiene chiavi non riconosciute.";
  }
  if (!Array.isArray(config.edgeEdits)) {
    return "graphAnalysis.communities.topologyCounterfactuals.edgeEdits deve essere un array.";
  }
  if (config.edgeEdits.length > MAX_COMMUNITY_TOPOLOGY_EDGE_EDITS) {
    return `topologyCounterfactuals.edgeEdits ammette al massimo ${MAX_COMMUNITY_TOPOLOGY_EDGE_EDITS} candidati per mantenere finita e delimitata la ricerca esatta.`;
  }

  const seenIds = new Set<string>();
  const seenRemovalIds = new Set<string>();
  let maximumSelectableCost = 0;
  for (const [index, rawEdit] of config.edgeEdits.entries()) {
    const path = `graphAnalysis.communities.topologyCounterfactuals.edgeEdits[${index}]`;
    if (rawEdit === null || typeof rawEdit !== "object" || Array.isArray(rawEdit)) {
      return `${path} deve essere un oggetto.`;
    }
    const edit = rawEdit as Record<string, unknown>;
    if (typeof edit.id !== "string" || edit.id.trim() === "") {
      return `${path}.id deve essere una stringa non vuota.`;
    }
    if (seenIds.has(edit.id)) return `topologyCounterfactuals.edgeEdits ripete l'ID '${edit.id}'.`;
    seenIds.add(edit.id);
    if (!Number.isSafeInteger(edit.cost) || Number(edit.cost) <= 0) {
      return `${path}.cost deve essere un intero positivo sicuro.`;
    }
    maximumSelectableCost += Number(edit.cost);
    if (!Number.isSafeInteger(maximumSelectableCost)) {
      return "La somma massima dei costi topologyCounterfactuals.edgeEdits deve restare un intero sicuro.";
    }
    if (edit.action === "add") {
      const allowed = new Set(["id", "action", "sourceNodeId", "targetNodeId", "cost", "weight"]);
      if (Object.keys(edit).some((key) => !allowed.has(key))) return `${path} contiene chiavi non riconosciute.`;
      if (!isNodeId(edit.sourceNodeId) || !isNodeId(edit.targetNodeId)) {
        return `${path} deve dichiarare sourceNodeId e targetNodeId stringa o numerici.`;
      }
      if (weighted) {
        if (typeof edit.weight !== "number" || !Number.isFinite(edit.weight) || edit.weight <= 0) {
          return `${path}.weight deve essere un numero positivo quando useEdgeWeights è attivo.`;
        }
        if (!scaleNonNegativeDecimalWeights([edit.weight]).ok) {
          return `${path}.weight non è rappresentabile nel dominio numerico esatto supportato.`;
        }
      } else if (edit.weight !== undefined) {
        return `${path}.weight è ammesso solo quando useEdgeWeights è attivo.`;
      }
    } else if (edit.action === "remove") {
      const allowed = new Set(["id", "action", "edgeId", "cost"]);
      if (Object.keys(edit).some((key) => !allowed.has(key))) return `${path} contiene chiavi non riconosciute.`;
      if (!isNodeId(edit.edgeId)) return `${path}.edgeId deve essere un ID sorgente stringa o numerico.`;
      const removalKey = String(edit.edgeId);
      if (seenRemovalIds.has(removalKey)) return `topologyCounterfactuals.edgeEdits ripete la rimozione dell'arco '${removalKey}'.`;
      seenRemovalIds.add(removalKey);
    } else {
      return `${path}.action deve essere 'add' oppure 'remove'.`;
    }
  }
  return "";
}

function isNodeId(value: unknown): value is string | number {
  return (typeof value === "string" && value.trim() !== "") ||
    (typeof value === "number" && Number.isFinite(value));
}

/** Emits a cost-optimal edit set not present in the exact exclusion list. */
export function buildMinimumCostCommunityEditSelectionProgram(
  edits: readonly Pick<CommunityTopologyEdgeEdit, "cost">[],
  excludedEditIndexes: readonly (readonly number[])[] = []
): string {
  if (edits.length > MAX_COMMUNITY_TOPOLOGY_EDGE_EDITS) {
    throw new RangeError(`La ricerca ammette al massimo ${MAX_COMMUNITY_TOPOLOGY_EDGE_EDITS} edit candidati.`);
  }
  if (edits.some((edit) => !Number.isSafeInteger(edit.cost) || edit.cost <= 0)) {
    throw new RangeError("I costi degli edit devono essere interi positivi sicuri.");
  }
  if (!Number.isSafeInteger(edits.reduce((sum, edit) => sum + edit.cost, 0))) {
    throw new RangeError("La somma massima dei costi degli edit deve restare un intero sicuro.");
  }
  const ids = edits.map((_, index) => index + 1);
  const lines = [
    ...ids.map((id) => `community_edit_candidate(${id}).`),
    ...edits.map((edit, index) => `community_edit_cost(${index + 1},${edit.cost}).`),
    "{ community_selected_edit(E) : community_edit_candidate(E) }.",
    "#minimize { Cost@1,E : community_selected_edit(E), community_edit_cost(E,Cost) }.",
    ...excludedEditIndexes.map((indexes, exclusionIndex) => {
      const selected = new Set(indexes);
      if ([...selected].some((index) => !Number.isSafeInteger(index) || index < 0 || index >= edits.length)) {
        throw new RangeError(`Il sottoinsieme escluso ${exclusionIndex + 1} contiene un indice fuori dominio.`);
      }
      const conditions = ids.map((id, index) => selected.has(index)
        ? `community_selected_edit(${id})`
        : `not community_selected_edit(${id})`);
      return `:- ${conditions.join(", ")}.`;
    }),
    "#show community_selected_edit/1."
  ];
  return lines.join("\n\n");
}

/** Parses one complete selector witness and independently checks its cost. */
export function parseCommunityEditSelectionWitnesses(
  witnesses: unknown,
  editCosts: readonly number[]
): { indexes: number[]; totalCost: number } {
  if (!Array.isArray(witnesses) || witnesses.length === 0) {
    throw new Error("clingo non ha restituito il testimone completo del sottoinsieme di edit.");
  }
  const witness = witnesses[witnesses.length - 1] as { Value?: unknown; Costs?: unknown };
  if (!witness || !Array.isArray(witness.Value) || !Array.isArray(witness.Costs)) {
    throw new Error("Il testimone ASP del sottoinsieme di edit è incompleto.");
  }
  const indexes: number[] = [];
  for (const atom of witness.Value) {
    if (typeof atom !== "string") throw new Error("Il witness ASP contiene un atomo di edit non testuale.");
    const match = /^community_selected_edit\((\d+)\)$/.exec(atom);
    if (!match) throw new Error(`Atomo inatteso nel witness del selettore: ${atom}.`);
    const index = Number(match[1]) - 1;
    if (!Number.isSafeInteger(index) || index < 0 || index >= editCosts.length || indexes.includes(index)) {
      throw new Error("Il witness ASP contiene un indice di edit duplicato o fuori dominio.");
    }
    indexes.push(index);
  }
  indexes.sort((left, right) => left - right);
  const totalCost = indexes.reduce((sum, index) => sum + editCosts[index], 0);
  if (!Number.isSafeInteger(totalCost)) throw new Error("Il costo totale degli edit supera il dominio intero sicuro.");
  const reportedCosts = witness.Costs;
  if (reportedCosts.length !== 1 || !Number.isSafeInteger(reportedCosts[0]) || reportedCosts[0] !== totalCost) {
    throw new Error("Il costo ASP non coincide con la somma indipendente dei costi selezionati.");
  }
  return { indexes, totalCost };
}

/** Classifies a modified graph from the two exact constrained modularity optima. */
export function classifyCommunityTopologyCounterfactual(
  nodeIds: [string, string],
  requestedRelation: CommunityCoassignmentRelation,
  togetherScaledScore: number | null,
  separateScaledScore: number | null
): CommunityPairOptimumMembership {
  if (requestedRelation !== "always" && requestedRelation !== "sometimes" && requestedRelation !== "never") {
    throw new TypeError("La relazione richiesta deve essere always, sometimes oppure never.");
  }
  const availableScores = [togetherScaledScore, separateScaledScore]
    .filter((score): score is number => score !== null);
  if (availableScores.length === 0) throw new Error("Il grafo modificato non ha una partizione comunitaria ammissibile.");
  const globalScaledScore = Math.max(...availableScores);
  const result = classifyCommunityPairOptimumMembership(
    nodeIds,
    globalScaledScore,
    togetherScaledScore,
    separateScaledScore
  );
  return result;
}

/** Returns whether a proven modified-graph relation meets the requested target. */
export function communityTopologyCounterfactualMeetsTarget(
  result: Pick<CommunityPairOptimumMembership, "relation">,
  requestedRelation: CommunityCoassignmentRelation
): boolean {
  return result.relation === requestedRelation;
}
