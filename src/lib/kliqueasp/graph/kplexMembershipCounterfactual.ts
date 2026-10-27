import { serializeCsv } from "../csvExport.ts";
import { getOwnRecordValue } from "./recordUtils.ts";
import {
  parseKPlexMaximumMembershipDiagnosis,
  type KPlexMembershipEdgeRecord,
  type KPlexMaximumMembershipDiagnosis
} from "./kplexMembershipDiagnosis.ts";
import {
  validateKPlexCompletionCandidates,
  type KPlexCompletionCandidate
} from "./structuralTasks.ts";

export const MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES = 8;

export interface KPlexMaximumMembershipCounterfactualResult extends KPlexMaximumMembershipDiagnosis {
  selectedEdges: KPlexCompletionCandidate[];
  candidateCount: number;
  totalCost: number;
  testedCandidateSets: number;
}

export type KPlexMaximumMembershipCounterfactualSearchOutcome =
  | { status: "found"; result: KPlexMaximumMembershipCounterfactualResult }
  | { status: "not-found"; testedCandidateSets: number; candidateCount: number };

interface KPlexMaximumMembershipEvaluationInput {
  globalResult: unknown;
  targetResult: unknown;
  reverseIndex: Record<number, string>;
  candidateNodeIds: readonly string[];
  edgeRecords: readonly KPlexMembershipEdgeRecord[];
}

interface ParsedKplexOptimum {
  nodeIds: string[];
  missingPairs: Array<[string, string]>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pairKey(left: string, right: string): string {
  return JSON.stringify(left < right ? [left, right] : [right, left]);
}

function parseKplexOptimumWitnesses(
  resultInput: unknown,
  reverseIndex: Record<number, string>,
  candidateNodeIdsInput: readonly string[],
  edgeRecords: readonly KPlexMembershipEdgeRecord[],
  s: number,
  expectedTargetNodeId?: string
): { maximumSize: number; witness: ParsedKplexOptimum } {
  const result = asRecord(resultInput);
  if (result.Result !== "OPTIMUM FOUND") {
    throw new Error("Clingo non ha provato l'ottimo del k-plex nel grafo ipotetico.");
  }
  const calls = Array.isArray(result.Call) ? result.Call : [];
  const rawWitnesses = calls.flatMap((call) => {
    const value = asRecord(call).Witnesses;
    return Array.isArray(value) ? value : [];
  });
  if (rawWitnesses.length === 0) throw new Error("Clingo non ha restituito il witness del k-plex ottimo.");

  const candidateNodeIds = new Set(candidateNodeIdsInput);
  if (candidateNodeIds.size !== candidateNodeIdsInput.length ||
    candidateNodeIdsInput.some((nodeId) => typeof nodeId !== "string" || nodeId === "") ||
    (expectedTargetNodeId !== undefined && !candidateNodeIds.has(expectedTargetNodeId))) {
    throw new Error("Il dominio candidato o il nodo target del k-plex non è valido.");
  }

  const adjacentPairs = new Set(edgeRecords.flatMap(({ sourceNodeId, targetNodeId }) =>
    sourceNodeId === targetNodeId ? [] : [pairKey(sourceNodeId, targetNodeId)]));
  const parsed = rawWitnesses.map((rawWitness) => {
    const value = asRecord(rawWitness).Value;
    if (!Array.isArray(value) || value.some((atom) => typeof atom !== "string")) {
      throw new Error("Il witness del k-plex ottimo ha un formato non valido.");
    }
    const nodeIds: string[] = [];
    const reportedMissing = new Set<string>();
    for (const atom of value as string[]) {
      const selected = /^in\((\d+)\)$/.exec(atom);
      if (selected) {
        const nodeId = reverseIndex[Number(selected[1])];
        if (!nodeId || !candidateNodeIds.has(nodeId) || nodeIds.includes(nodeId)) {
          throw new Error("Il witness globale contiene nodi duplicati o fuori dal dominio candidato.");
        }
        nodeIds.push(nodeId);
        continue;
      }
      const missing = /^missing_tie\((\d+),(\d+)\)$/.exec(atom);
      if (!missing) throw new Error(`Atomo inatteso nel witness del k-plex globale: ${atom}.`);
      const left = reverseIndex[Number(missing[1])];
      const right = reverseIndex[Number(missing[2])];
      if (!left || !right || left === right || !candidateNodeIds.has(left) || !candidateNodeIds.has(right)) {
        throw new Error("Il witness globale contiene una coppia mancante fuori dominio.");
      }
      const key = pairKey(left, right);
      if (reportedMissing.has(key)) throw new Error("Il witness globale ripete una coppia mancante.");
      reportedMissing.add(key);
    }
    if (expectedTargetNodeId !== undefined && !nodeIds.includes(expectedTargetNodeId)) {
      throw new Error("Il witness non contiene i membri attesi del k-plex.");
    }

    const expectedMissing: Array<[string, string]> = [];
    const missingDegree = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
    const sortedNodes = [...nodeIds].sort((left, right) => left.localeCompare(right));
    for (let leftIndex = 0; leftIndex < sortedNodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < sortedNodes.length; rightIndex += 1) {
        const left = sortedNodes[leftIndex];
        const right = sortedNodes[rightIndex];
        const key = pairKey(left, right);
        if (adjacentPairs.has(key)) continue;
        expectedMissing.push([left, right]);
        missingDegree.set(left, (missingDegree.get(left) ?? 0) + 1);
        missingDegree.set(right, (missingDegree.get(right) ?? 0) + 1);
      }
    }
    if (expectedMissing.some((pair) => !reportedMissing.has(pairKey(pair[0], pair[1]))) ||
      reportedMissing.size !== expectedMissing.length ||
      [...missingDegree.values()].some((degree) => degree >= s)) {
      throw new Error("Il witness globale non coincide con il ricalcolo indipendente della definizione s-plex.");
    }
    return { nodeIds, missingPairs: expectedMissing };
  });
  // clingo may include improving witnesses in addition to the final optimum.
  // OPTIMUM FOUND proves the last objective value; every reported model is
  // checked above, and the largest valid witness is the graph's optimum.
  const maximumSize = Math.max(...parsed.map(({ nodeIds }) => nodeIds.length));
  if (maximumSize < 1) throw new Error("L'ottimo globale ASP del k-plex non contiene nodi.");
  const witness = parsed.find(({ nodeIds }) => nodeIds.length === maximumSize)!;
  return { maximumSize, witness };
}

/** ASP selector that yields undeclared-beforehand candidate subsets in nondecreasing cost order. */
export function buildMinimumCostKPlexMembershipSelectionProgram(
  candidatesInput: unknown,
  excludedCandidateIndexes: readonly (readonly number[])[] = []
): { candidates: KPlexCompletionCandidate[]; program: string } {
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  if (candidates.length === 0) throw new RangeError("Il selettore richiede almeno un arco candidato.");
  if (candidates.length > MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES) {
    throw new RangeError(`Il controfattuale ammette al massimo ${MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES} archi candidati, per mantenere finito il numero di grafi da valutare.`);
  }

  const lines = [
    ...candidates.map((_, index) => `cf_kpmc_candidate(${index + 1}).`),
    ...candidates.map(({ cost }, index) => `cf_kpmc_candidate_cost(${index + 1},${cost}).`),
    "{ cf_kpmc_add_edge(E) } :- cf_kpmc_candidate(E).",
    "#minimize { Cost@1,E : cf_kpmc_add_edge(E), cf_kpmc_candidate_cost(E,Cost) }.",
    ...excludedCandidateIndexes.map((indexes, exclusionIndex) => {
      const selected = new Set(indexes);
      if ([...selected].some((index) => !Number.isSafeInteger(index) || index < 0 || index >= candidates.length)) {
        throw new RangeError(`Il sottoinsieme escluso ${exclusionIndex + 1} contiene un indice fuori dominio.`);
      }
      return `:- ${candidates.map((_, index) => selected.has(index)
        ? `cf_kpmc_add_edge(${index + 1})`
        : `not cf_kpmc_add_edge(${index + 1})`).join(", ")}.`;
    }),
    "#show cf_kpmc_add_edge/1."
  ];
  return { candidates, program: lines.join("\n\n") };
}

/** Parses a complete selector model and recomputes its candidate cost. */
export function parseMinimumCostKPlexMembershipSelection(
  witnesses: unknown,
  candidates: readonly Pick<KPlexCompletionCandidate, "cost">[]
): { indexes: number[]; totalCost: number } {
  if (!Array.isArray(witnesses) || witnesses.length === 0) {
    throw new Error("Clingo non ha restituito il sottoinsieme di archi candidato.");
  }
  const witness = asRecord(witnesses.at(-1));
  if (!Array.isArray(witness.Value) || witness.Value.some((atom) => typeof atom !== "string") ||
    !Array.isArray(witness.Costs)) {
    throw new Error("Il witness ASP del selettore è incompleto.");
  }
  const indexes: number[] = [];
  for (const atom of witness.Value as string[]) {
    const match = /^cf_kpmc_add_edge\((\d+)\)$/.exec(atom);
    if (!match) throw new Error(`Atomo inatteso nel witness del selettore k-plex: ${atom}.`);
    const index = Number(match[1]) - 1;
    if (!Number.isSafeInteger(index) || index < 0 || index >= candidates.length || indexes.includes(index)) {
      throw new Error("Il selettore ha restituito un indice candidato duplicato o fuori dominio.");
    }
    indexes.push(index);
  }
  indexes.sort((left, right) => left - right);
  const totalCost = indexes.reduce((sum, index) => sum + candidates[index].cost, 0);
  const reportedCosts = witness.Costs;
  if (!Number.isSafeInteger(totalCost) || reportedCosts.length !== 1 ||
    !Number.isSafeInteger(reportedCosts[0]) || reportedCosts[0] !== totalCost) {
    throw new Error("Il costo ASP non coincide con la somma indipendente dei candidati selezionati.");
  }
  return { indexes, totalCost };
}

/**
 * Searches declared edge-addition subsets by cost. For every subset, it requires
 * proven global and target-constrained maximum s-plex queries on the same graph.
 */
export async function searchMinimumCostKPlexMaximumMembershipCounterfactual(options: {
  s: number;
  targetNodeId: string;
  candidates: unknown;
  solveSelection: (program: string) => Promise<unknown>;
  evaluateGraph: (selectedCandidates: readonly KPlexCompletionCandidate[]) => Promise<KPlexMaximumMembershipEvaluationInput>;
}): Promise<KPlexMaximumMembershipCounterfactualSearchOutcome> {
  if (!Number.isSafeInteger(options.s) || options.s < 1) throw new RangeError("s deve essere un intero positivo.");
  if (typeof options.targetNodeId !== "string" || options.targetNodeId === "") {
    throw new TypeError("Il nodo target del controfattuale deve avere un ID valido.");
  }
  const candidates = validateKPlexCompletionCandidates(options.candidates);
  if (candidates.length > MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES) {
    throw new RangeError(`Il controfattuale ammette al massimo ${MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES} archi candidati, per mantenere finito il numero di grafi da valutare.`);
  }

  const evaluate = async (selectedCandidates: readonly KPlexCompletionCandidate[]) => {
    const input = await options.evaluateGraph(selectedCandidates);
    const global = parseKplexOptimumWitnesses(
      input.globalResult,
      input.reverseIndex,
      input.candidateNodeIds,
      input.edgeRecords,
      options.s
    );
    const diagnosis = parseKPlexMaximumMembershipDiagnosis(input.targetResult, {
      reverseIndex: input.reverseIndex,
      candidateNodeIds: input.candidateNodeIds,
      edgeRecords: input.edgeRecords,
      targetNodeId: options.targetNodeId,
      s: options.s,
      globalMaximumSize: global.maximumSize
    });
    return { global, diagnosis };
  };

  if (candidates.length === 0) {
    const { global, diagnosis } = await evaluate([]);
    if (diagnosis.outcome !== "included-in-maximum") {
      return { status: "not-found", testedCandidateSets: 1, candidateCount: 0 };
    }
    return {
      status: "found",
      result: {
        ...diagnosis,
        selectedEdges: [],
        candidateCount: 0,
        totalCost: 0,
        testedCandidateSets: 1
      }
    };
  }

  const excluded: number[][] = [];
  const seen = new Set<string>();
  let previousCost = -1;
  for (let attempt = 0; attempt <= 2 ** candidates.length; attempt += 1) {
    const selector = buildMinimumCostKPlexMembershipSelectionProgram(candidates, excluded);
    const rawSelection = await options.solveSelection(selector.program);
    const response = asRecord(rawSelection);
    if (response.Result === "UNSATISFIABLE") {
      return { status: "not-found", testedCandidateSets: excluded.length, candidateCount: candidates.length };
    }
    if (response.Result !== "OPTIMUM FOUND") {
      throw new Error(`Il selettore non ha provato il costo minimo del prossimo insieme (${String(response.Result ?? "risposta vuota")}).`);
    }
    const selection = parseMinimumCostKPlexMembershipSelection(
      asRecord(Array.isArray(response.Call) ? response.Call[0] : undefined).Witnesses,
      candidates
    );
    if (selection.totalCost < previousCost) throw new Error("I sottoinsiemi ASP non sono ordinati per costo non decrescente.");
    previousCost = selection.totalCost;
    const signature = selection.indexes.join(",");
    if (seen.has(signature)) throw new Error("Il selettore ha ripetuto un sottoinsieme già valutato.");
    seen.add(signature);

    const selectedCandidates = selection.indexes.map((index) => candidates[index]);
    const { global, diagnosis } = await evaluate(selectedCandidates);
    if (diagnosis.outcome === "included-in-maximum") {
      return {
        status: "found",
        result: {
          ...diagnosis,
          globalMaximumSize: global.maximumSize,
          selectedEdges: selectedCandidates,
          candidateCount: candidates.length,
          totalCost: selection.totalCost,
          testedCandidateSets: excluded.length + 1
        }
      };
    }
    excluded.push(selection.indexes);
  }
  throw new Error("Il selettore ha superato il numero finito dei sottoinsiemi candidati.");
}

export function buildKPlexMaximumMembershipCounterfactualCsv(options: {
  result: KPlexMaximumMembershipCounterfactualResult;
  sourceIdByNodeId: Record<string, string>;
  selectedGroup?: string;
}): string {
  const { result, sourceIdByNodeId, selectedGroup = "" } = options;
  if (result.outcome !== "included-in-maximum" ||
    !Number.isSafeInteger(result.totalCost) || result.totalCost < 0 ||
    result.maximumContainingSize !== result.globalMaximumSize ||
    result.selectedEdges.reduce((sum, edge) => sum + edge.cost, 0) !== result.totalCost) {
    throw new Error("Il CSV richiede una proposta verificata di membership in un k-plex massimo.");
  }
  const sourceId = (nodeId: string) => getOwnRecordValue(sourceIdByNodeId, nodeId) ?? nodeId;
  const witnessNodeIds = result.witnessNodeIds.map(sourceId);
  const missingPairs = result.missingPairs.map(([left, right]) => [sourceId(left), sourceId(right)]);
  const selectedEdges = result.selectedEdges.map(({ id, sourceNodeId, targetNodeId, edgeType, cost }) => ({
    id,
    sourceNodeId: sourceId(sourceNodeId),
    targetNodeId: sourceId(targetNodeId),
    edgeType,
    cost
  }));
  const rows: unknown[][] = [[
    "record_type", "hypothetical", "analysis_group", "target_node_id", "s", "global_maximum_size", "maximum_containing_size",
    "total_edit_cost", "candidate_count", "tested_candidate_sets", "candidate_edge_id", "source_node_id",
    "target_endpoint_node_id", "edge_type", "candidate_cost", "witness_node_ids_json",
    "missing_pairs_json", "selected_edges_json", "structured_witness_json"
  ]];
  const base = {
    kind: "k_plex_maximum_membership_counterfactual",
    analysis_group: selectedGroup,
    target_node_id: sourceId(result.targetNodeId),
    s: result.s,
    global_maximum_size: result.globalMaximumSize,
    maximum_containing_size: result.maximumContainingSize,
    total_edit_cost: result.totalCost,
    candidate_count: result.candidateCount,
    tested_candidate_sets: result.testedCandidateSets,
    witness_node_ids: witnessNodeIds,
    missing_pairs: missingPairs,
    selected_edges: selectedEdges,
    hypothetical: true
  };
  if (selectedEdges.length === 0) {
    rows.push([
      "no_edit_needed", true, selectedGroup, sourceId(result.targetNodeId), result.s, result.globalMaximumSize,
      result.maximumContainingSize, result.totalCost, result.candidateCount, result.testedCandidateSets,
      "", "", "", "", 0, JSON.stringify(witnessNodeIds), JSON.stringify(missingPairs),
      JSON.stringify(selectedEdges), JSON.stringify(base)
    ]);
  } else {
    for (const edge of selectedEdges) {
      rows.push([
        "selected_candidate", true, selectedGroup, sourceId(result.targetNodeId), result.s, result.globalMaximumSize,
        result.maximumContainingSize, result.totalCost, result.candidateCount, result.testedCandidateSets,
        edge.id, edge.sourceNodeId, edge.targetNodeId, edge.edgeType, edge.cost,
        JSON.stringify(witnessNodeIds), JSON.stringify(missingPairs), JSON.stringify(selectedEdges),
        JSON.stringify({ ...base, row_candidate_edge_id: edge.id })
      ]);
    }
  }
  return serializeCsv(rows);
}
