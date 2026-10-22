import { serializeCsv } from "../csvExport.ts";
import type { DominatingSetCoverageWitness, KPlexWitnessExplanation, KCoreSupportingPair, MaximalKPlexWitnessExplanation, ModularityPartition } from "./structuralTasks.ts";
import { formatScaledDecimal } from "./exactDecimal.ts";

export type StructuralEdgeProvenanceSummary = (edgeIdentities: string[]) => string;
export type StructuralEdgeEvidenceBuilder = (edgeIdentities: string[]) => unknown[];

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
