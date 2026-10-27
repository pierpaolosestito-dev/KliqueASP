import { serializeCsv } from "../csvExport.ts";
import type { DominatingSetCoverageWitness, KPlexCompletionWhyNot, KCoreCompletionWhyNot, KCoreMembershipCompletionWhyNot, KPlexWitnessExplanation, KCoreSupportingPair, MaximalKPlexWitnessExplanation, ModularityPartition, TypedPathCounterfactualProposal, TypedPathStaticCounterfactualWhyNot, TypedPathTemporalNoRouteCertificate, TypedPathTemporalResult } from "./structuralTasks.ts";
import type { KPlexMaximumMembershipDiagnosis } from "./kplexMembershipDiagnosis.ts";
import { formatScaledDecimal } from "./exactDecimal.ts";

export type StructuralEdgeProvenanceSummary = (edgeIdentities: string[]) => string;
export type StructuralEdgeEvidenceBuilder = (edgeIdentities: string[]) => unknown[];

/** Exports an ASP why-not membership diagnosis for a maximum-cardinality s-plex. */
export function buildKPlexMaximumMembershipDiagnosisCsv(
  diagnosis: KPlexMaximumMembershipDiagnosis,
  sourceIdByNodeId: Record<string, string>,
  selectedGroup: string
): string {
  const sourceTargetId = sourceIdByNodeId[diagnosis.targetNodeId] ?? diagnosis.targetNodeId;
  const sourceNodeIds = diagnosis.witnessNodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId);
  const missingPairs = diagnosis.missingPairs.map(([left, right]) => [
    sourceIdByNodeId[left] ?? left,
    sourceIdByNodeId[right] ?? right
  ]);
  const structuredWitness = {
    target_node_id: sourceTargetId,
    s: diagnosis.s,
    selected_group: selectedGroup || null,
    outcome: diagnosis.outcome,
    global_maximum_s_plex_size: diagnosis.globalMaximumSize,
    maximum_s_plex_size_containing_target: diagnosis.maximumContainingSize,
    size_gap: diagnosis.sizeGap,
    witness_node_ids: sourceNodeIds,
    missing_pairs: missingPairs,
    ...(diagnosis.optimalMembershipSummary ? {
      optimal_k_plex_count: diagnosis.optimalMembershipSummary.totalOptimalKplexes,
      target_membership_count: diagnosis.optimalMembershipSummary.targetOptimalKplexes,
      membership_across_all_optima: diagnosis.optimalMembershipSummary.status
    } : {})
  };
  const optimalMembershipColumns = diagnosis.optimalMembershipSummary
    ? ["optimal_k_plex_count", "target_membership_count", "membership_across_all_optima"]
    : [];
  return serializeCsv([
    [
      "target_node_id", "selected_group", "s", "outcome", "global_maximum_s_plex_size",
      "maximum_s_plex_size_containing_target", "size_gap", "witness_node_ids_json",
      "missing_pairs_json", "structured_witness_json", ...optimalMembershipColumns
    ],
    [
      sourceTargetId,
      selectedGroup,
      diagnosis.s,
      diagnosis.outcome,
      diagnosis.globalMaximumSize,
      diagnosis.maximumContainingSize,
      diagnosis.sizeGap,
      JSON.stringify(sourceNodeIds),
      JSON.stringify(missingPairs),
      JSON.stringify(structuredWitness),
      ...(diagnosis.optimalMembershipSummary ? [
        diagnosis.optimalMembershipSummary.totalOptimalKplexes,
        diagnosis.optimalMembershipSummary.targetOptimalKplexes,
        diagnosis.optimalMembershipSummary.status
      ] : [])
    ]
  ]);
}

export interface TypedPathCounterfactualCsvOptions {
  proposals: readonly TypedPathCounterfactualProposal[];
  edgeTypeSequence: readonly string[];
  selectedGroup: string;
  sourceIdByNodeId: Record<string, string>;
  sourceIdByEdgeId: Record<string, string>;
}

/** Exports each observed or hypothetical record used by a minimum-cost typed path. */
export function buildTypedPathCounterfactualCsv({
  proposals,
  edgeTypeSequence,
  selectedGroup,
  sourceIdByNodeId,
  sourceIdByEdgeId
}: TypedPathCounterfactualCsvOptions): string {
  const rows: unknown[][] = [[
    "proposal_index", "total_cost", "step", "source_node_id", "target_node_id", "edge_type",
    "edge_id", "candidate_cost", "hypothetical", "candidate_edge_ids", "typed_path_sequence", "group"
  ]];

  proposals.forEach((proposal, proposalIndex) => {
    if (proposal.path.nodeIds.length !== edgeTypeSequence.length + 1 ||
      proposal.path.edgeIdsByStep.length !== edgeTypeSequence.length ||
      proposal.path.edgeIdsByStep.some((edgeIds) => edgeIds.length === 0)) {
      throw new Error("Il CSV richiede un witness completo del cammino tipizzato.");
    }
    const candidateIds = proposal.addedEdges.map((edge) => edge.id).join(" | ");
    proposal.path.edgeIdsByStep.forEach((edgeIds, stepIndex) => {
      edgeIds.forEach((edgeId) => {
        const candidate = proposal.addedEdges.find((edge) => `candidate:${edge.id}` === edgeId);
        const sourceNodeId = proposal.path.nodeIds[stepIndex];
        const targetNodeId = proposal.path.nodeIds[stepIndex + 1];
        rows.push([
          proposalIndex + 1,
          proposal.totalCost,
          stepIndex + 1,
          sourceIdByNodeId[sourceNodeId] ?? sourceNodeId,
          sourceIdByNodeId[targetNodeId] ?? targetNodeId,
          candidate?.edgeType ?? edgeTypeSequence[stepIndex],
          candidate?.id ?? sourceIdByEdgeId[edgeId] ?? edgeId,
          candidate?.cost ?? 0,
          Boolean(candidate),
          candidateIds,
          edgeTypeSequence.join(" | "),
          selectedGroup
        ]);
      });
    });
  });

  return serializeCsv(rows);
}

export interface TypedPathTemporalCounterfactualCsvOptions extends TypedPathCounterfactualCsvOptions {
  proposals: Array<TypedPathCounterfactualProposal & { path: TypedPathTemporalResult }>;
}

/** Exports temporal path additions in a schema separate from the static counterfactual CSV. */
export function buildTypedPathTemporalCounterfactualCsv({
  proposals,
  edgeTypeSequence,
  selectedGroup,
  sourceIdByNodeId,
  sourceIdByEdgeId
}: TypedPathTemporalCounterfactualCsvOptions): string {
  const rows: unknown[][] = [[
    "proposal_index", "total_cost", "temporal_semantics", "common_time", "step_start_time", "step",
    "source_node_id", "target_node_id", "edge_type", "edge_id", "candidate_cost", "hypothetical",
    "candidate_edge_ids", "typed_path_sequence", "group"
  ]];
  proposals.forEach((proposal, proposalIndex) => {
    if (!("temporalSemantics" in proposal.path) ||
      proposal.path.nodeIds.length !== edgeTypeSequence.length + 1 ||
      proposal.path.edgeIdsByStep.length !== edgeTypeSequence.length ||
      proposal.path.edgeIdsByStep.some((edgeIds) => edgeIds.length === 0) ||
      proposal.path.temporalSemantics === "coValid" && !Number.isSafeInteger(proposal.path.commonTimeValue) ||
      proposal.path.temporalSemantics === "orderedByStart" &&
        proposal.path.startTimeValuesByStep?.length !== edgeTypeSequence.length) {
      throw new Error("Il CSV richiede un witness completo del cammino temporale.");
    }
    const candidateIds = proposal.addedEdges.map((edge) => edge.id).join(" | ");
    proposal.path.edgeIdsByStep.forEach((edgeIds, stepIndex) => {
      edgeIds.forEach((edgeId) => {
        const candidate = proposal.addedEdges.find((edge) => `candidate:${edge.id}` === edgeId);
        rows.push([
          proposalIndex + 1,
          proposal.totalCost,
          proposal.path.temporalSemantics,
          proposal.path.temporalSemantics === "coValid" ? proposal.path.commonTimeValue : "",
          proposal.path.temporalSemantics === "orderedByStart"
            ? proposal.path.startTimeValuesByStep?.[stepIndex] ?? ""
            : "",
          stepIndex + 1,
          sourceIdByNodeId[proposal.path.nodeIds[stepIndex]] ?? proposal.path.nodeIds[stepIndex],
          sourceIdByNodeId[proposal.path.nodeIds[stepIndex + 1]] ?? proposal.path.nodeIds[stepIndex + 1],
          candidate?.edgeType ?? edgeTypeSequence[stepIndex],
          candidate?.id ?? sourceIdByEdgeId[edgeId] ?? edgeId,
          candidate?.cost ?? 0,
          Boolean(candidate),
          candidateIds,
          edgeTypeSequence.join(" | "),
          selectedGroup
        ]);
      });
    });
  });
  return serializeCsv(rows);
}

export interface TypedPathTemporalNoRouteCsvOptions {
  certificate: TypedPathTemporalNoRouteCertificate;
  candidateEdgeIds?: readonly string[];
  startNodeId: string;
  goalNodeId: string;
  selectedGroup: string;
  sourceIdByNodeId: Record<string, string>;
  sourceIdByEdgeId: Record<string, string>;
}

/** Exports the ASP-certified maximum typed temporal walk for an infeasible simple path. */
export function buildTypedPathTemporalNoRouteCsv({
  certificate,
  startNodeId,
  goalNodeId,
  selectedGroup,
  sourceIdByNodeId,
  sourceIdByEdgeId,
  candidateEdgeIds
}: TypedPathTemporalNoRouteCsvOptions): string {
  const { walk, maximumPrefixLength, edgeTypeSequence, temporalSemantics } = certificate;
  const repeatedNodeIds = [...new Set(walk.nodeIds.filter((nodeId, index) => walk.nodeIds.indexOf(nodeId) !== index))].sort();
  if (walk.nodeIds.length !== maximumPrefixLength + 1 || walk.edgeIdsByStep.length !== maximumPrefixLength ||
    walk.edgeIdsByStep.some((ids) => ids.length !== 1 || !ids[0]) ||
    maximumPrefixLength > edgeTypeSequence.length ||
    certificate.firstBlockedStep !== (maximumPrefixLength < edgeTypeSequence.length ? maximumPrefixLength + 1 : undefined) ||
    certificate.goalReachableAsWalk !== (maximumPrefixLength === edgeTypeSequence.length && walk.nodeIds.at(-1) === goalNodeId) ||
    repeatedNodeIds.join("\u0000") !== certificate.repeatedNodeIds.join("\u0000") ||
    temporalSemantics === "coValid" && (maximumPrefixLength > 0
      ? !Number.isSafeInteger(certificate.commonTimeValue) || certificate.startTimeValuesByStep !== undefined
      : certificate.commonTimeValue !== undefined || certificate.startTimeValuesByStep !== undefined) ||
    temporalSemantics === "orderedByStart" &&
      (certificate.startTimeValuesByStep?.length !== maximumPrefixLength || certificate.commonTimeValue !== undefined)) {
    throw new Error("Il CSV richiede un certificato completo e coerente del why-not temporale.");
  }
  const structuredWitness = JSON.stringify({
    temporal_semantics: temporalSemantics,
    edge_type_sequence: edgeTypeSequence,
    walk_node_ids: walk.nodeIds.map((id) => sourceIdByNodeId[id] ?? id),
    walk_edge_record_ids: walk.edgeIdsByStep.map((ids) => ids.map((id) => sourceIdByEdgeId[id] ?? id)),
    maximum_prefix_length: maximumPrefixLength,
    first_blocked_step: certificate.firstBlockedStep ?? null,
    goal_reachable_as_walk: certificate.goalReachableAsWalk,
    repeated_node_ids: repeatedNodeIds.map((id) => sourceIdByNodeId[id] ?? id),
    common_time: certificate.commonTimeValue ?? null,
    start_time_by_step: certificate.startTimeValuesByStep ?? [],
    ...(candidateEdgeIds === undefined ? {} : { candidate_edge_ids: [...candidateEdgeIds] })
  });
  const rows: unknown[][] = [[
    "temporal_semantics", "step", "required_edge_type", "source_node_id", "target_node_id", "edge_record_id",
    "common_time", "edge_start_time", "maximum_prefix_length", "first_blocked_step",
    "goal_reachable_as_walk", "repeated_node_ids_json", "start_node_id", "goal_node_id", "group",
    ...(candidateEdgeIds === undefined ? [] : ["candidate_edge_ids_json"]),
    "structured_witness_json"
  ]];
  if (maximumPrefixLength === 0) {
    rows.push([
      temporalSemantics, 0, "", sourceIdByNodeId[startNodeId] ?? startNodeId, "", "",
      certificate.commonTimeValue ?? "", "", 0, certificate.firstBlockedStep ?? "",
      certificate.goalReachableAsWalk, JSON.stringify(repeatedNodeIds.map((id) => sourceIdByNodeId[id] ?? id)),
      sourceIdByNodeId[startNodeId] ?? startNodeId, sourceIdByNodeId[goalNodeId] ?? goalNodeId, selectedGroup,
      ...(candidateEdgeIds === undefined ? [] : [JSON.stringify([...candidateEdgeIds])]),
      structuredWitness
    ]);
  } else {
    for (let step = 1; step <= maximumPrefixLength; step += 1) {
      const edgeId = walk.edgeIdsByStep[step - 1][0];
      rows.push([
        temporalSemantics,
        step,
        edgeTypeSequence[step - 1],
        sourceIdByNodeId[walk.nodeIds[step - 1]] ?? walk.nodeIds[step - 1],
        sourceIdByNodeId[walk.nodeIds[step]] ?? walk.nodeIds[step],
        sourceIdByEdgeId[edgeId] ?? edgeId,
        certificate.commonTimeValue ?? "",
        certificate.startTimeValuesByStep?.[step - 1] ?? "",
        maximumPrefixLength,
        certificate.firstBlockedStep ?? "",
        certificate.goalReachableAsWalk,
        JSON.stringify(repeatedNodeIds.map((id) => sourceIdByNodeId[id] ?? id)),
        sourceIdByNodeId[startNodeId] ?? startNodeId,
        sourceIdByNodeId[goalNodeId] ?? goalNodeId,
        selectedGroup,
        ...(candidateEdgeIds === undefined ? [] : [JSON.stringify([...candidateEdgeIds])]),
        structuredWitness
      ]);
    }
  }
  return serializeCsv(rows);
}

export interface TypedPathCounterfactualWhyNotCsvOptions {
  certificate: TypedPathStaticCounterfactualWhyNot;
  startNodeId: string;
  goalNodeId: string;
  selectedGroup: string;
  sourceIdByNodeId: Record<string, string>;
}

/** Exports every ASP-certified prefix layer for an infeasible typed-path completion. */
export function buildTypedPathCounterfactualWhyNotCsv({
  certificate,
  startNodeId,
  goalNodeId,
  selectedGroup,
  sourceIdByNodeId
}: TypedPathCounterfactualWhyNotCsvOptions): string {
  const firstEmptyStep = certificate.firstEmptyStep ?? "";
  const interpretation = certificate.firstEmptyStep !== undefined
    ? `nessun nodo raggiungibile dopo il passo ${certificate.firstEmptyStep}`
    : certificate.goalReachableAsWalk
      ? "meta raggiunta come walk; la query primaria ha provato l'assenza di un cammino semplice"
      : "meta non raggiunta dopo la sequenza completa";
  const rows: unknown[][] = [[
    "record_type", "prefix_step", "required_edge_type", "reachable_node_ids_json", "start_node_id", "goal_node_id",
    "candidate_edge_ids_json", "goal_reachable_as_walk", "first_empty_step", "group", "interpretation"
  ]];
  for (const layer of certificate.reachableByStep) {
    rows.push([
      "reachable_prefix",
      layer.step,
      layer.step === 0 ? "" : certificate.edgeTypeSequence[layer.step - 1] ?? "",
      JSON.stringify(layer.nodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId)),
      sourceIdByNodeId[startNodeId] ?? startNodeId,
      sourceIdByNodeId[goalNodeId] ?? goalNodeId,
      JSON.stringify(certificate.candidateEdgeIds),
      certificate.goalReachableAsWalk,
      firstEmptyStep,
      selectedGroup,
      interpretation
    ]);
  }
  return serializeCsv(rows);
}

export interface ModularityCertificateCsvOptions {
  partition: ModularityPartition;
  resolution: number | string;
  resolutionNumerator: number;
  resolutionDenominator: number;
  usesEdgeWeights: boolean;
  totalEdgeCount: number;
  totalScaledWeight: number;
  displayTotalWeight?: string;
  weightScaleFactor: number;
  sourceIdByNodeId: Record<string, string>;
  sourceIdByEdgeId: Record<string, string>;
  edgeProvenanceSummary: StructuralEdgeProvenanceSummary;
  structuredEdgeEvidence: StructuralEdgeEvidenceBuilder;
}

/** Preserves the gamma=1 certificate schema; non-default resolution metadata is appended after the legacy columns. */
export function buildModularityCertificateCsv({
  partition,
  resolution,
  resolutionNumerator,
  resolutionDenominator,
  usesEdgeWeights,
  totalEdgeCount,
  totalScaledWeight,
  displayTotalWeight,
  weightScaleFactor,
  sourceIdByNodeId,
  sourceIdByEdgeId,
  edgeProvenanceSummary,
  structuredEdgeEvidence
}: ModularityCertificateCsvOptions): string {
  if (!partition.communityContributions) {
    throw new Error("Il CSV della modularità richiede le spiegazioni dei contributi attive.");
  }
  const hasNonDefaultResolution = resolutionNumerator !== resolutionDenominator;
  const totalMeasure = usesEdgeWeights ? totalScaledWeight : totalEdgeCount;
  const headers = usesEdgeWeights
    ? [
      "community_representative", "members", "total_edge_weight_M", "internal_weight_L",
      "internal_edge_records", "weighted_volume_D",
      hasNonDefaultResolution ? "scaled_contribution_4MqL_minus_pD2" : "scaled_contribution_4ML_minus_D2",
      hasNonDefaultResolution ? "modularity_contribution_Q_gamma" : "modularity_contribution_Q",
      "supporting_edge_records", "supporting_edge_provenance", "partition_scaled_score",
      hasNonDefaultResolution ? "partition_modularity_Q_gamma" : "partition_modularity_Q",
      "weight_scale_factor", "asp_scaled_total_edge_weight_M", "asp_scaled_internal_weight_L",
      "asp_scaled_weighted_volume_D", "structured_witness_json"
    ]
    : [
      "community_representative", "members", "total_edges_m", "internal_edges_l", "volume_d",
      hasNonDefaultResolution ? "scaled_contribution_4mql_minus_pd2" : "scaled_contribution_4ml_minus_d2",
      hasNonDefaultResolution ? "modularity_contribution_Q_gamma" : "modularity_contribution_Q",
      "supporting_edge_records", "supporting_edge_provenance", "partition_scaled_score",
      hasNonDefaultResolution ? "partition_modularity_Q_gamma" : "partition_modularity_Q",
      "structured_witness_json"
    ];
  if (hasNonDefaultResolution) {
    headers.push("resolution_gamma", "resolution_numerator_p", "resolution_denominator_q");
  }

  const rows: unknown[][] = [headers];
  for (const contribution of partition.communityContributions) {
    const members = partition.communities.find((community) => community.includes(contribution.communityId)) ?? [];
    const memberSourceIds = members.map((id) => sourceIdByNodeId[id] ?? id);
    const supportingEdgeIds = contribution.supportingEdgeIds ?? [];
    const supportingEdgeSourceIds = supportingEdgeIds.map((id) => sourceIdByEdgeId[id] ?? id);
    const witness = {
      ...(hasNonDefaultResolution
        ? { modularity_resolution: { gamma: resolution, numerator: resolutionNumerator, denominator: resolutionDenominator } }
        : {}),
      member_node_ids: memberSourceIds,
      supporting_edge_record_ids: supportingEdgeSourceIds,
      supporting_edge_evidence: structuredEdgeEvidence(supportingEdgeIds),
      attribute_bound_counts: (partition.attributeBoundCounts ?? [])
        .filter((bound) => members.includes(bound.communityId))
        .map((bound) => ({
          attribute: bound.attribute,
          value: bound.value,
          count: bound.count,
          ...(bound.minimum !== undefined ? { minimum_per_community: bound.minimum } : {}),
          ...(bound.maximum !== undefined ? { maximum_per_community: bound.maximum } : {})
        }))
    };
    const normalizedContribution = totalMeasure > 0
      ? contribution.scaledContribution / (4 * totalMeasure * totalMeasure * resolutionDenominator)
      : "";
    const normalizedPartition = totalMeasure > 0
      ? partition.scaledScore / (4 * totalMeasure * totalMeasure * resolutionDenominator)
      : "";
    const fields: unknown[] = [
      sourceIdByNodeId[contribution.communityId] ?? contribution.communityId,
      memberSourceIds.join(" | "),
      ...(usesEdgeWeights
        ? [
          displayTotalWeight ?? formatScaledDecimal(totalMeasure, weightScaleFactor),
          formatScaledDecimal(contribution.internalEdgeWeight, weightScaleFactor),
          contribution.internalEdgeCount,
          formatScaledDecimal(contribution.volume, weightScaleFactor)
        ]
        : [totalEdgeCount, contribution.internalEdgeCount, contribution.volume]),
      contribution.scaledContribution,
      normalizedContribution,
      supportingEdgeSourceIds.join(" | "),
      edgeProvenanceSummary(supportingEdgeIds),
      partition.scaledScore,
      normalizedPartition,
      ...(usesEdgeWeights
        ? [weightScaleFactor, totalMeasure, contribution.internalEdgeWeight, contribution.volume]
        : []),
      JSON.stringify(witness)
    ];
    if (hasNonDefaultResolution) {
      fields.push(resolution, resolutionNumerator, resolutionDenominator);
    }
    rows.push(fields);
  }
  return serializeCsv(rows);
}

export interface KPlexWitnessCsvOptions {
  semantics: "maximum_cardinality" | "inclusion_maximal";
  explanation: KPlexWitnessExplanation;
  sourceIdByNodeId: Record<string, string>;
  maximality?: MaximalKPlexWitnessExplanation;
}

/** Preserves the legacy row layout for maximum-cardinality k-plexes and keeps maximality evidence compact. */
export function buildKPlexWitnessCsv({
  semantics,
  explanation,
  sourceIdByNodeId,
  maximality
}: KPlexWitnessCsvOptions): string {
  const sourceNodeIds = explanation.nodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId);

  if (semantics === "inclusion_maximal") {
    if (!maximality) throw new Error("Il CSV del k-plex massimale richiede il certificato ASP di massimalita.");
    const missingTiePairs = maximality.missingTiePairs.map(([first, second]) => [
      sourceIdByNodeId[first] ?? first,
      sourceIdByNodeId[second] ?? second
    ]);
    const candidateNodeIds = maximality.candidateNodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId);
    const blockers = maximality.blockers.map((blocker) => blocker.reason === "candidate_degree"
      ? {
          candidate_node_id: sourceIdByNodeId[blocker.candidateNodeId] ?? blocker.candidateNodeId,
          reason: blocker.reason,
          candidate_missing_degree: blocker.candidateMissingDegree
        }
      : {
          candidate_node_id: sourceIdByNodeId[blocker.candidateNodeId] ?? blocker.candidateNodeId,
          reason: blocker.reason,
          blocking_node_id: sourceIdByNodeId[blocker.blockingNodeId] ?? blocker.blockingNodeId,
          blocking_node_missing_degree: blocker.blockingNodeMissingDegree
        });
    const witness = {
      plex_semantics: semantics,
      k_plex_node_ids: sourceNodeIds,
      missing_tie_pairs: missingTiePairs,
      candidate_node_ids: candidateNodeIds,
      maximality_blockers: blockers
    };
    return serializeCsv([
      [
        "plex_semantics", "k_plex_nodes", "non_adjacent_pairs_json", "candidate_node_ids_json",
        "maximality_blockers_json", "structured_witness_json"
      ],
      [
        semantics,
        sourceNodeIds.join(" | "),
        JSON.stringify(missingTiePairs),
        JSON.stringify(candidateNodeIds),
        JSON.stringify(blockers),
        JSON.stringify(witness)
      ]
    ]);
  }

  const rows: unknown[][] = [[
    "plex_semantics", "k_plex_nodes", "non_adjacent_node_a", "non_adjacent_node_b", "structured_witness_json"
  ]];
  if (explanation.missingTiePairs.length === 0) {
    rows.push([semantics, sourceNodeIds.join(" | "), "", "", JSON.stringify({
      plex_semantics: semantics,
      k_plex_node_ids: sourceNodeIds,
      non_adjacent_pair: []
    })]);
  } else {
    for (const [first, second] of explanation.missingTiePairs) {
      const sourcePair = [sourceIdByNodeId[first] ?? first, sourceIdByNodeId[second] ?? second];
      rows.push([semantics, sourceNodeIds.join(" | "), ...sourcePair, JSON.stringify({
        plex_semantics: semantics,
        k_plex_node_ids: sourceNodeIds,
        non_adjacent_pair: sourcePair
      })]);
    }
  }
  return serializeCsv(rows);
}

/** Exports the fixed-cohort k-plex infeasibility witness with its candidate and projection scope. */
export function buildKPlexCompletionWhyNotCsv(
  certificate: KPlexCompletionWhyNot,
  sourceIdByNodeId: Record<string, string>
): string {
  const sourceNodeId = (nodeId: string) => sourceIdByNodeId[nodeId] ?? nodeId;
  const cohortNodeIds = certificate.cohortNodeIds.map(sourceNodeId);
  const unfillableMissingPairs = certificate.unfillableMissingPairs.map(([left, right]) => [
    sourceNodeId(left), sourceNodeId(right)
  ]);
  const witnessBlockers = certificate.blockers.map((blocker) => ({
    blocking_node_id: sourceNodeId(blocker.nodeId),
    unfillable_missing_neighbor_ids: blocker.unfillableMissingNeighborIds.map(sourceNodeId)
  }));
  return serializeCsv([
    [
      "record_type", "target_s", "cohort_node_ids", "authorized_candidate_edge_ids",
      "unfillable_missing_pair_count", "unfillable_missing_pairs_json", "blockers_json", "structured_witness_json"
    ],
    [
      "k_plex_completion_why_not",
      certificate.targetS,
      cohortNodeIds.join(" | "),
      certificate.candidateEdgeIds.join(" | "),
      unfillableMissingPairs.length,
      JSON.stringify(unfillableMissingPairs),
      JSON.stringify(witnessBlockers),
      JSON.stringify({
        kind: "k_plex_completion_why_not",
        target_s: certificate.targetS,
        cohort_node_ids: cohortNodeIds,
        authorized_candidate_edge_ids: certificate.candidateEdgeIds,
        unfillable_missing_pairs: unfillableMissingPairs,
        blockers: witnessBlockers
      })
    ]
  ]);
}

/** Exports the fixed-cohort k-core infeasibility witness and the degree upper bound for each blocker. */
export function buildKCoreCompletionWhyNotCsv(
  certificate: KCoreCompletionWhyNot,
  sourceIdByNodeId: Record<string, string>
): string {
  const sourceNodeId = (nodeId: string) => sourceIdByNodeId[nodeId] ?? nodeId;
  const cohortNodeIds = certificate.cohortNodeIds.map(sourceNodeId);
  const blockers = certificate.blockers.map((blocker) => ({
    blocking_node_id: sourceNodeId(blocker.nodeId),
    current_neighbor_ids: blocker.currentNeighborIds.map(sourceNodeId),
    additional_candidate_neighbor_ids: blocker.additionalCandidateNeighborIds.map(sourceNodeId),
    current_degree: blocker.currentNeighborIds.length,
    maximum_achievable_degree: blocker.maximumAchievableDegree,
    target_k: certificate.targetK
  }));
  return serializeCsv([
    [
      "record_type", "target_k", "cohort_node_ids", "authorized_candidate_edge_ids",
      "blocker_count", "blockers_json", "structured_witness_json"
    ],
    [
      "k_core_completion_why_not",
      certificate.targetK,
      cohortNodeIds.join(" | "),
      certificate.candidateEdgeIds.join(" | "),
      blockers.length,
      JSON.stringify(blockers),
      JSON.stringify({
        kind: "k_core_completion_why_not",
        target_k: certificate.targetK,
        cohort_node_ids: cohortNodeIds,
        authorized_candidate_edge_ids: certificate.candidateEdgeIds,
        blockers
      })
    ]
  ]);
}

/** Exports the all-candidates k-core peeling proof for an impossible membership counterfactual. */
export function buildKCoreMembershipCompletionWhyNotCsv(
  certificate: KCoreMembershipCompletionWhyNot,
  sourceIdByNodeId: Record<string, string>
): string {
  const sourceNodeId = (nodeId: string) => sourceIdByNodeId[nodeId] ?? nodeId;
  const candidateNodeIds = certificate.candidateNodeIds.map(sourceNodeId);
  const peeling = certificate.peeling.map((step) => ({
    node_id: sourceNodeId(step.nodeId),
    round: step.round,
    surviving_neighbor_ids: step.survivingNeighborIds.map(sourceNodeId)
  }));
  const targetPeeling = peeling.find((step) => step.node_id === sourceNodeId(certificate.targetNodeId));
  if (!targetPeeling) throw new Error("Il CSV why-not richiede il round di eliminazione del nodo obiettivo.");
  return serializeCsv([
    [
      "record_type", "target_k", "target_node_id", "target_elimination_round",
      "candidate_node_ids", "authorized_candidate_edge_ids", "peeling_scope", "peeling_json", "structured_witness_json"
    ],
    [
      "k_core_membership_completion_why_not",
      certificate.targetK,
      sourceNodeId(certificate.targetNodeId),
      targetPeeling.round,
      candidateNodeIds.join(" | "),
      certificate.candidateEdgeIds.join(" | "),
      certificate.peelingScope,
      JSON.stringify(peeling),
      JSON.stringify({
        kind: "k_core_membership_completion_why_not",
        target_k: certificate.targetK,
        target_node_id: sourceNodeId(certificate.targetNodeId),
        candidate_node_ids: candidateNodeIds,
        authorized_candidate_edge_ids: certificate.candidateEdgeIds,
        peeling_scope: certificate.peelingScope,
        peeling
      })
    ]
  ]);
}

export interface KCoreWitnessCsvOptions {
  nodeIds: string[];
  supportPairs: KCoreSupportingPair[];
  directedGraph: boolean;
  kCoreMode: string;
  requiredK: number;
  sourceIdByNodeId: Record<string, string>;
  edgeProvenanceSummary: StructuralEdgeProvenanceSummary;
  structuredEdgeEvidence: StructuralEdgeEvidenceBuilder;
}

export function buildKCoreWitnessCsv({
  nodeIds,
  supportPairs,
  directedGraph,
  kCoreMode,
  requiredK,
  sourceIdByNodeId,
  edgeProvenanceSummary,
  structuredEdgeEvidence
}: KCoreWitnessCsvOptions): string {
  const sourceNodeIds = nodeIds.map((id) => sourceIdByNodeId[id] ?? id);
  const rows: unknown[][] = [[
    "k_core_nodes", "node", "k_core_mode", "required_k", "degree_in_core", "supporting_neighbors",
    "source_edge_ids", "source_edge_provenance", "generated_record_keys", "legacy_endpoint_pairs", "structured_witness_json"
  ]];

  for (const nodeId of nodeIds) {
    const pairs = supportPairs.filter((pair) => directedGraph && kCoreMode !== ""
      ? pair.sourceNodeId === nodeId
      : pair.sourceNodeId === nodeId || pair.targetNodeId === nodeId);
    const neighbors = pairs.map((pair) => pair.sourceNodeId === nodeId ? pair.targetNodeId : pair.sourceNodeId);
    const records = pairs.flatMap((pair) => pair.supportingRecords);
    const sourceEdgeIds = records
      .filter((record) => record.edgeId && !record.edgeIdGenerated)
      .map((record) => record.edgeId!);
    const generatedRecordKeys = records
      .filter((record) => record.edgeId && record.edgeIdGenerated)
      .map((record) => record.edgeId!);
    const legacyPairs = pairs
      .filter((pair) => pair.supportingRecords.some((record) => !record.edgeId))
      .map((pair) => `${sourceIdByNodeId[pair.sourceNodeId] ?? pair.sourceNodeId} \u2014 ${sourceIdByNodeId[pair.targetNodeId] ?? pair.targetNodeId}`);

    rows.push([
      sourceNodeIds.join(" | "),
      sourceIdByNodeId[nodeId] ?? nodeId,
      directedGraph ? kCoreMode : "undirected",
      requiredK,
      neighbors.length,
      neighbors.map((id) => sourceIdByNodeId[id] ?? id).join(" | "),
      [...new Set(sourceEdgeIds)].join(" | "),
      edgeProvenanceSummary(records.map((record) => record.edgeIdentity)),
      [...new Set(generatedRecordKeys)].join(" | "),
      [...new Set(legacyPairs)].join(" | "),
      JSON.stringify({
        k_core_node_ids: sourceNodeIds,
        node_id: sourceIdByNodeId[nodeId] ?? nodeId,
        supporting_neighbor_ids: neighbors.map((id) => sourceIdByNodeId[id] ?? id),
        source_edge_ids: [...new Set(sourceEdgeIds)],
        generated_record_keys: [...new Set(generatedRecordKeys)],
        legacy_endpoint_pairs: pairs
          .filter((pair) => pair.supportingRecords.some((record) => !record.edgeId))
          .map((pair) => [sourceIdByNodeId[pair.sourceNodeId] ?? pair.sourceNodeId, sourceIdByNodeId[pair.targetNodeId] ?? pair.targetNodeId]),
        supporting_edge_evidence: structuredEdgeEvidence(records.map((record) => record.edgeIdentity))
      })
    ]);
  }

  return serializeCsv(rows);
}

/** Version 2 stores core membership once, then emits one compact row per node witness. */
export function buildCompactKCoreWitnessCsv(options: KCoreWitnessCsvOptions): string {
  const {
    nodeIds,
    supportPairs,
    directedGraph,
    kCoreMode,
    requiredK,
    sourceIdByNodeId,
    edgeProvenanceSummary,
    structuredEdgeEvidence
  } = options;
  const sourceNodeIds = nodeIds.map((id) => sourceIdByNodeId[id] ?? id);
  const rows: unknown[][] = [[
    "record_type", "schema_version", "k_core_node_ids_json", "node", "k_core_mode", "required_k", "degree_in_core",
    "supporting_neighbors", "source_edge_ids", "source_edge_provenance", "generated_record_keys", "legacy_endpoint_pairs", "structured_witness_json"
  ], [
    "core_metadata", 2, JSON.stringify(sourceNodeIds), "", directedGraph ? kCoreMode : "undirected", requiredK, "", "", "", "", "", "",
    JSON.stringify({ record_type: "core_metadata", node_count: sourceNodeIds.length })
  ]];

  for (const nodeId of nodeIds) {
    const pairs = supportPairs.filter((pair) => directedGraph && kCoreMode !== ""
      ? pair.sourceNodeId === nodeId
      : pair.sourceNodeId === nodeId || pair.targetNodeId === nodeId);
    const neighbors = pairs.map((pair) => pair.sourceNodeId === nodeId ? pair.targetNodeId : pair.sourceNodeId);
    const records = pairs.flatMap((pair) => pair.supportingRecords);
    const sourceEdgeIds = records
      .filter((record) => record.edgeId && !record.edgeIdGenerated)
      .map((record) => record.edgeId!);
    const generatedRecordKeys = records
      .filter((record) => record.edgeId && record.edgeIdGenerated)
      .map((record) => record.edgeId!);
    const legacyPairs = pairs
      .filter((pair) => pair.supportingRecords.some((record) => !record.edgeId))
      .map((pair) => `${sourceIdByNodeId[pair.sourceNodeId] ?? pair.sourceNodeId} \u2014 ${sourceIdByNodeId[pair.targetNodeId] ?? pair.targetNodeId}`);

    rows.push([
      "node_witness",
      2,
      "",
      sourceIdByNodeId[nodeId] ?? nodeId,
      directedGraph ? kCoreMode : "undirected",
      requiredK,
      neighbors.length,
      neighbors.map((id) => sourceIdByNodeId[id] ?? id).join(" | "),
      [...new Set(sourceEdgeIds)].join(" | "),
      edgeProvenanceSummary(records.map((record) => record.edgeIdentity)),
      [...new Set(generatedRecordKeys)].join(" | "),
      [...new Set(legacyPairs)].join(" | "),
      JSON.stringify({
        node_id: sourceIdByNodeId[nodeId] ?? nodeId,
        supporting_neighbor_ids: neighbors.map((id) => sourceIdByNodeId[id] ?? id),
        source_edge_ids: [...new Set(sourceEdgeIds)],
        generated_record_keys: [...new Set(generatedRecordKeys)],
        legacy_endpoint_pairs: pairs
          .filter((pair) => pair.supportingRecords.some((record) => !record.edgeId))
          .map((pair) => [sourceIdByNodeId[pair.sourceNodeId] ?? pair.sourceNodeId, sourceIdByNodeId[pair.targetNodeId] ?? pair.targetNodeId]),
        supporting_edge_evidence: structuredEdgeEvidence(records.map((record) => record.edgeIdentity))
      })
    ]);
  }

  return serializeCsv(rows);
}

export interface DominatingSetWitnessCsvOptions {
  coverage: DominatingSetCoverageWitness[];
  sourceIdByNodeId: Record<string, string>;
  edgeProvenanceSummary: StructuralEdgeProvenanceSummary;
  structuredEdgeEvidence: StructuralEdgeEvidenceBuilder;
}

export function buildDominatingSetWitnessCsv({
  coverage,
  sourceIdByNodeId,
  edgeProvenanceSummary,
  structuredEdgeEvidence
}: DominatingSetWitnessCsvOptions): string {
  const rows: unknown[][] = [[
    "target_node", "covering_selected_node", "coverage_kind", "source_edge_ids",
    "source_edge_provenance", "generated_record_keys", "legacy_endpoint_pairs", "structured_witness_json"
  ]];

  for (const item of coverage) {
    const sourceEdgeIds = item.supportingRecords
      .filter((record) => record.edgeId && !record.edgeIdGenerated)
      .map((record) => record.edgeId!);
    const generatedRecordKeys = item.supportingRecords
      .filter((record) => record.edgeId && record.edgeIdGenerated)
      .map((record) => record.edgeId!);
    const legacyEndpointPairs = item.supportingRecords
      .filter((record) => !record.edgeId)
      .map(() => `${sourceIdByNodeId[item.targetNodeId] ?? item.targetNodeId} \u2014 ${sourceIdByNodeId[item.coveringNodeId] ?? item.coveringNodeId}`);

    rows.push([
      sourceIdByNodeId[item.targetNodeId] ?? item.targetNodeId,
      sourceIdByNodeId[item.coveringNodeId] ?? item.coveringNodeId,
      item.targetNodeId === item.coveringNodeId ? "self" : "adjacent selected node",
      [...new Set(sourceEdgeIds)].join(" | "),
      edgeProvenanceSummary(item.supportingRecords.map((record) => record.edgeIdentity)),
      [...new Set(generatedRecordKeys)].join(" | "),
      [...new Set(legacyEndpointPairs)].join(" | "),
      JSON.stringify({
        source_edge_ids: [...new Set(sourceEdgeIds)],
        generated_record_keys: [...new Set(generatedRecordKeys)],
        legacy_endpoint_pairs: item.supportingRecords
          .filter((record) => !record.edgeId)
          .map(() => [sourceIdByNodeId[item.targetNodeId] ?? item.targetNodeId, sourceIdByNodeId[item.coveringNodeId] ?? item.coveringNodeId]),
        supporting_edge_evidence: structuredEdgeEvidence(item.supportingRecords.map((record) => record.edgeIdentity))
      })
    ]);
  }

  return serializeCsv(rows);
}

export interface DominatingSetInfeasibilityCsvOptions {
  uncoverableTargetNodeIds: readonly string[];
  sourceIdByNodeId?: Record<string, string>;
  nodeLabels?: Record<string, string>;
  candidateGroup?: string;
  targetGroup?: string;
}

/** Exports the target nodes ASP proves have no self-or-adjacent candidate. */
export function buildDominatingSetInfeasibilityCsv({
  uncoverableTargetNodeIds,
  sourceIdByNodeId = {},
  nodeLabels = {},
  candidateGroup = "",
  targetGroup = ""
}: DominatingSetInfeasibilityCsvOptions): string {
  const rows: unknown[][] = [[
    "record_type", "target_node_id", "target_node_label", "candidate_group", "target_group", "why_not"
  ]];
  for (const nodeId of [...new Set(uncoverableTargetNodeIds)].sort()) {
    rows.push([
      "uncoverable_target",
      sourceIdByNodeId[nodeId] ?? nodeId,
      nodeLabels[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId,
      candidateGroup,
      targetGroup,
      "nessun candidato eleggibile coincide con il target o gli è adiacente nella proiezione non orientata corrente"
    ]);
  }
  return serializeCsv(rows);
}

export interface ProvenanceScenarioDominatingSetInfeasibilityCsvOptions {
  scenarioId: string;
  scenarioLabel: string;
  scenarioSources: readonly string[];
  uncoverableTargetNodeIds: readonly string[];
  sourceIdByNodeId?: Record<string, string>;
  nodeLabels?: Record<string, string>;
  candidateGroup?: string;
  targetGroup?: string;
  confidenceThreshold?: number | null;
  timelineWindow?: string;
  viewFilters?: { types: string[]; groups: string[] };
}

/** Exports one verified infeasible scenario with the projection filters needed to read its why-not witness. */
export function buildProvenanceScenarioDominatingSetInfeasibilityCsv({
  scenarioId,
  scenarioLabel,
  scenarioSources,
  uncoverableTargetNodeIds,
  sourceIdByNodeId = {},
  nodeLabels = {},
  candidateGroup = "",
  targetGroup = "",
  confidenceThreshold = null,
  timelineWindow = "",
  viewFilters = { types: [], groups: [] }
}: ProvenanceScenarioDominatingSetInfeasibilityCsvOptions): string {
  const rows: unknown[][] = [[
    "record_type", "scenario_id", "scenario_label", "scenario_sources", "target_node_id", "target_node_label",
    "candidate_group", "target_group", "confidence_threshold", "timeline_window", "type_filters", "group_filters", "why_not"
  ]];
  for (const nodeId of [...new Set(uncoverableTargetNodeIds)].sort()) {
    rows.push([
      "uncoverable_target",
      scenarioId,
      scenarioLabel,
      JSON.stringify([...scenarioSources]),
      sourceIdByNodeId[nodeId] ?? nodeId,
      nodeLabels[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId,
      candidateGroup,
      targetGroup,
      confidenceThreshold ?? "",
      timelineWindow,
      JSON.stringify(viewFilters.types),
      JSON.stringify(viewFilters.groups),
      "nessun candidato eleggibile coincide con il target o gli è adiacente nella proiezione dello scenario"
    ]);
  }
  return serializeCsv(rows);
}

export interface SeparatorCertificateCsvWitness {
  removedIds: string[];
  reachableNodeIds: string[];
}

export interface SeparatorCertificateCsvOptions {
  task: string;
  startTerminalId: string;
  goalTerminalId: string;
  witnesses: SeparatorCertificateCsvWitness[];
  edgeTask: boolean;
  sourceIdByNodeId: Record<string, string>;
  sourceIdByEdgeId: Record<string, string>;
  edgeProvenanceSummary: StructuralEdgeProvenanceSummary;
  structuredEdgeEvidence: StructuralEdgeEvidenceBuilder;
}

export function buildSeparatorCertificateCsv({
  task,
  startTerminalId,
  goalTerminalId,
  witnesses,
  edgeTask,
  sourceIdByNodeId,
  sourceIdByEdgeId,
  edgeProvenanceSummary,
  structuredEdgeEvidence
}: SeparatorCertificateCsvOptions): string {
  const rows: unknown[][] = [[
    "task", "start_terminal", "goal_terminal", "removed_element_kind", "removed_elements", "reachable_source_side",
    ...(edgeTask ? ["removed_edge_provenance"] : []), "structured_witness_json"
  ]];

  for (const witness of witnesses) {
    const removedSourceIds = witness.removedIds.map((id) => edgeTask
      ? sourceIdByEdgeId[id] ?? id
      : sourceIdByNodeId[id] ?? id);
    const reachableSourceIds = witness.reachableNodeIds.map((id) => sourceIdByNodeId[id] ?? id);
    rows.push([
      task,
      sourceIdByNodeId[startTerminalId] ?? startTerminalId,
      sourceIdByNodeId[goalTerminalId] ?? goalTerminalId,
      edgeTask ? "edge_record" : "node",
      removedSourceIds.join(" | "),
      reachableSourceIds.join(" | "),
      ...(edgeTask ? [edgeProvenanceSummary(witness.removedIds)] : []),
      JSON.stringify({
        removed_elements: removedSourceIds,
        reachable_source_side: reachableSourceIds,
        ...(edgeTask ? { removed_edge_evidence: structuredEdgeEvidence(witness.removedIds) } : {})
      })
    ]);
  }

  return serializeCsv(rows);
}
