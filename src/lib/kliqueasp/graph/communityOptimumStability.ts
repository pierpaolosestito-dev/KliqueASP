import { serializeCsv } from "../csvExport.ts";
import type { ModularityPartition } from "./structuralTasks.ts";

export type CommunityCoassignmentRelation = "always" | "sometimes" | "never";

export interface CommunityPairOptimumMembership {
  nodeIds: [string, string];
  relation: CommunityCoassignmentRelation;
  globalScaledScore: number;
  togetherScaledScore: number | null;
  separateScaledScore: number | null;
}

export interface CommunityPairObjectiveLosses {
  togetherScaledLoss: number | null;
  separateScaledLoss: number | null;
}

export interface CommunityCoassignmentEntry {
  nodeId: string;
  sameCommunityOptima: number;
  totalOptima: number;
  relation: CommunityCoassignmentRelation;
}

export interface CommunityCoassignmentSummary {
  selectedNodeId: string;
  totalOptima: number;
  entries: CommunityCoassignmentEntry[];
}

export interface CommunityCoassignmentCsvOptions {
  summary: CommunityCoassignmentSummary;
  sourceIdByNodeId: Record<string, string>;
  nodeLabels: Record<string, string>;
  selectedGroup: string;
  resolution: number | string;
  resolutionNumerator: number;
  resolutionDenominator: number;
  weighted: boolean;
}

export interface CommunityPairMembershipCsvOptions {
  result: CommunityPairOptimumMembership;
  sourceIdByNodeId: Record<string, string>;
  nodeLabels: Record<string, string>;
  selectedGroup: string;
  resolution: number | string;
  resolutionNumerator: number;
  resolutionDenominator: number;
  weighted: boolean;
}

/** Returns exact integer-objective losses for the pair's two constrained optima. */
export function getCommunityPairObjectiveLosses(
  result: Pick<CommunityPairOptimumMembership, "globalScaledScore" | "togetherScaledScore" | "separateScaledScore">
): CommunityPairObjectiveLosses {
  if (!Number.isSafeInteger(result.globalScaledScore)) {
    throw new RangeError("Lo score globale deve essere un intero sicuro.");
  }
  const loss = (score: number | null, name: string): number | null => {
    if (score === null) return null;
    if (!Number.isSafeInteger(score)) {
      throw new RangeError(`Lo score ${name} deve essere un intero sicuro.`);
    }
    const difference = result.globalScaledScore - score;
    if (!Number.isSafeInteger(difference) || difference < 0) {
      throw new RangeError(`Lo scarto ${name} deve essere un intero non negativo sicuro.`);
    }
    return difference;
  };
  return {
    togetherScaledLoss: loss(result.togetherScaledScore, "must-link"),
    separateScaledLoss: loss(result.separateScaledScore, "cannot-link")
  };
}

/**
 * Classifies one pair by comparing exact optimum scores under must-link and
 * cannot-link probes with the already proven unconstrained optimum. A null
 * score means that probe has no feasible partition.
 */
export function classifyCommunityPairOptimumMembership(
  nodeIds: [string, string],
  globalScaledScore: number,
  togetherScaledScore: number | null,
  separateScaledScore: number | null
): CommunityPairOptimumMembership {
  if (!Array.isArray(nodeIds) || nodeIds.length !== 2 ||
    nodeIds.some((nodeId) => typeof nodeId !== "string" || nodeId.length === 0) || nodeIds[0] === nodeIds[1]) {
    throw new TypeError("La coppia deve contenere due ID distinti e non vuoti.");
  }
  if (![globalScaledScore, togetherScaledScore, separateScaledScore]
    .filter((score): score is number => score !== null)
    .every(Number.isSafeInteger)) {
    throw new RangeError("I punteggi ASP devono essere interi sicuri.");
  }
  if ((togetherScaledScore !== null && togetherScaledScore > globalScaledScore) ||
    (separateScaledScore !== null && separateScaledScore > globalScaledScore)) {
    throw new RangeError("Una query vincolata supera il punteggio dell'ottimo globale di riferimento.");
  }

  const togetherIsOptimal = togetherScaledScore === globalScaledScore;
  const separateIsOptimal = separateScaledScore === globalScaledScore;
  if (!togetherIsOptimal && !separateIsOptimal) {
    throw new RangeError("Le query vincolate non concordano con l'ottimo globale provato.");
  }
  return {
    nodeIds: [...nodeIds],
    relation: togetherIsOptimal
      ? separateIsOptimal ? "sometimes" : "always"
      : "never",
    globalScaledScore,
    togetherScaledScore,
    separateScaledScore
  };
}

/** Exports the exact pair classification and both constrained optimum scores. */
export function buildCommunityPairMembershipCsv({
  result,
  sourceIdByNodeId,
  nodeLabels,
  selectedGroup,
  resolution,
  resolutionNumerator,
  resolutionDenominator,
  weighted
}: CommunityPairMembershipCsvOptions): string {
  const [leftNodeId, rightNodeId] = result.nodeIds;
  const leftSourceId = sourceIdByNodeId[leftNodeId] ?? leftNodeId;
  const rightSourceId = sourceIdByNodeId[rightNodeId] ?? rightNodeId;
  const objectiveLosses = getCommunityPairObjectiveLosses(result);
  return serializeCsv([[
    "node_a_id",
    "node_a_label",
    "node_b_id",
    "node_b_label",
    "coassignment_status",
    "global_scaled_score",
    "together_optimum_scaled_score",
    "separate_optimum_scaled_score",
    "together_objective_loss_scaled",
    "separate_objective_loss_scaled",
    "selected_group",
    "resolution_gamma",
    "resolution_numerator_p",
    "resolution_denominator_q",
    "weighted",
    "structured_witness_json"
  ], [
    leftSourceId,
    nodeLabels[leftNodeId] ?? leftNodeId,
    rightSourceId,
    nodeLabels[rightNodeId] ?? rightNodeId,
    result.relation,
    result.globalScaledScore,
    result.togetherScaledScore ?? "",
    result.separateScaledScore ?? "",
    objectiveLosses.togetherScaledLoss ?? "",
    objectiveLosses.separateScaledLoss ?? "",
    selectedGroup,
    resolution,
    resolutionNumerator,
    resolutionDenominator,
    weighted,
    JSON.stringify({
      node_a_internal_id: leftNodeId,
      node_a_id: leftSourceId,
      node_b_internal_id: rightNodeId,
      node_b_id: rightSourceId,
      relation: result.relation,
      global_scaled_score: result.globalScaledScore,
      together_optimum_scaled_score: result.togetherScaledScore,
      separate_optimum_scaled_score: result.separateScaledScore,
      together_objective_loss_scaled: objectiveLosses.togetherScaledLoss,
      separate_objective_loss_scaled: objectiveLosses.separateScaledLoss,
      semantics: "co-assignment in globally optimal partitions under the current graph and constraints"
    })
  ]]);
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Summarizes pairwise co-assignment for one node across every supplied optimum.
 * Callers must only pass a complete, proven enumeration of optimal partitions.
 */
export function summarizeCommunityCoassignment(
  partitions: readonly Pick<ModularityPartition, "communities">[],
  selectedNodeId: string
): CommunityCoassignmentSummary {
  if (partitions.length === 0) throw new RangeError("Serve almeno una partizione ottima per calcolare la co-appartenenza.");
  if (typeof selectedNodeId !== "string" || selectedNodeId.length === 0) {
    throw new TypeError("Il nodo di riferimento deve avere un ID non vuoto.");
  }

  let domain: string[] | undefined;
  const coassignmentCounts = new Map<string, number>();
  const seenPartitions = new Set<string>();

  for (const [partitionIndex, partition] of partitions.entries()) {
    if (!partition || !Array.isArray(partition.communities) || partition.communities.length === 0) {
      throw new TypeError(`La partizione ${partitionIndex + 1} non contiene comunità valide.`);
    }
    const seenNodeIds = new Set<string>();
    let selectedCommunity: string[] | undefined;
    const normalizedCommunities: string[][] = [];

    for (const community of partition.communities) {
      if (!Array.isArray(community) || community.length === 0) {
        throw new TypeError(`La partizione ${partitionIndex + 1} contiene una comunità vuota o non valida.`);
      }
      if (community.some((nodeId) => typeof nodeId !== "string" || nodeId.length === 0)) {
        throw new TypeError(`La partizione ${partitionIndex + 1} contiene un ID vuoto o non valido.`);
      }
      const normalizedCommunity = [...community].sort(compareIds);
      for (const nodeId of normalizedCommunity) {
        if (seenNodeIds.has(nodeId)) {
          throw new TypeError(`La partizione ${partitionIndex + 1} contiene un ID vuoto o assegnato più volte.`);
        }
        seenNodeIds.add(nodeId);
      }
      if (normalizedCommunity.includes(selectedNodeId)) selectedCommunity = normalizedCommunity;
      normalizedCommunities.push(normalizedCommunity);
    }

    if (!selectedCommunity) {
      throw new RangeError(`Il nodo ${selectedNodeId} non compare nella partizione ottima ${partitionIndex + 1}.`);
    }
    const currentDomain = [...seenNodeIds].sort(compareIds);
    if (domain && (domain.length !== currentDomain.length || domain.some((nodeId, index) => nodeId !== currentDomain[index]))) {
      throw new RangeError("Le partizioni ottime non coprono lo stesso dominio di nodi.");
    }
    domain ??= currentDomain;

    const partitionSignature = JSON.stringify(normalizedCommunities.sort((left, right) => {
      const leftSignature = JSON.stringify(left);
      const rightSignature = JSON.stringify(right);
      return compareIds(leftSignature, rightSignature);
    }));
    if (seenPartitions.has(partitionSignature)) {
      throw new RangeError("L'enumerazione contiene una partizione ottima duplicata.");
    }
    seenPartitions.add(partitionSignature);

    for (const nodeId of selectedCommunity) {
      if (nodeId !== selectedNodeId) coassignmentCounts.set(nodeId, (coassignmentCounts.get(nodeId) ?? 0) + 1);
    }
  }

  const totalOptima = partitions.length;
  const entries = (domain ?? [])
    .filter((nodeId) => nodeId !== selectedNodeId)
    .sort(compareIds)
    .map((nodeId): CommunityCoassignmentEntry => {
      const sameCommunityOptima = coassignmentCounts.get(nodeId) ?? 0;
      return {
        nodeId,
        sameCommunityOptima,
        totalOptima,
        relation: sameCommunityOptima === totalOptima
          ? "always"
          : sameCommunityOptima === 0
            ? "never"
            : "sometimes"
      };
    });

  return { selectedNodeId, totalOptima, entries };
}

/** Exports exact co-assignment counts without interpreting them as probabilities. */
export function buildCommunityCoassignmentCsv({
  summary,
  sourceIdByNodeId,
  nodeLabels,
  selectedGroup,
  resolution,
  resolutionNumerator,
  resolutionDenominator,
  weighted
}: CommunityCoassignmentCsvOptions): string {
  const selectedSourceId = sourceIdByNodeId[summary.selectedNodeId] ?? summary.selectedNodeId;
  const rows: unknown[][] = [[
    "selected_node_id",
    "selected_node_label",
    "other_node_id",
    "other_node_label",
    "same_community_optima",
    "total_optimal_partitions",
    "coassignment_status",
    "selected_group",
    "resolution_gamma",
    "resolution_numerator_p",
    "resolution_denominator_q",
    "weighted",
    "structured_witness_json"
  ]];

  for (const entry of summary.entries) {
    const otherSourceId = sourceIdByNodeId[entry.nodeId] ?? entry.nodeId;
    rows.push([
      selectedSourceId,
      nodeLabels[summary.selectedNodeId] ?? summary.selectedNodeId,
      otherSourceId,
      nodeLabels[entry.nodeId] ?? entry.nodeId,
      entry.sameCommunityOptima,
      entry.totalOptima,
      entry.relation,
      selectedGroup,
      resolution,
      resolutionNumerator,
      resolutionDenominator,
      weighted,
      JSON.stringify({
        selected_node_internal_id: summary.selectedNodeId,
        selected_node_id: selectedSourceId,
        other_node_internal_id: entry.nodeId,
        other_node_id: otherSourceId,
        same_community_optima: entry.sameCommunityOptima,
        total_optimal_partitions: entry.totalOptima,
        relation: entry.relation
      })
    ]);
  }

  return serializeCsv(rows);
}
