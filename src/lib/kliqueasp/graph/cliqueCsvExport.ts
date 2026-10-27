import type { CliqueSupportingEdge } from "./graphModel";
import type { CliqueMaximumMembershipDiagnosis } from "./cliqueMembershipDiagnosis";
import { serializeCsv } from "../csvExport.ts";
import { getOwnRecordValue } from "./recordUtils.ts";

function cliqueSignature(clique: string[]): string {
  return [...clique].sort().join("\u0000");
}

/** Builds the readable and lossless columns of the additive clique explanation export. */
export function buildCliqueSupportingExportRows(
  cliques: string[][],
  supportingEdgesByClique: Record<string, CliqueSupportingEdge[]>,
  provenanceBySourceId: Record<string, string>,
  provenanceReferencesBySourceId: Record<string, string[]>
): unknown[][] {
  const rows: unknown[][] = [[
    "size", "clique", "supporting_pairs", "source_edge_ids", "generated_record_keys", "source_edge_provenance",
    "clique_node_ids_json", "supporting_pairs_json", "source_edge_ids_json", "generated_record_keys_json",
    "source_edge_provenance_json"
  ]];

  for (const clique of cliques) {
    const support = supportingEdgesByClique[cliqueSignature(clique)] ?? [];
    const sourceEdgeIds = support
      .filter((edge) => edge.edgeId && !edge.edgeIdGenerated)
      .map((edge) => edge.edgeId!);
    const generatedRecordKeys = support
      .filter((edge) => edge.edgeId && edge.edgeIdGenerated)
      .map((edge) => edge.edgeId!);
    const provenanceEdgeIds = [...new Set(support.flatMap((edge) => edge.edgeId ? [edge.edgeId] : []))];
    const sourceProvenance = provenanceEdgeIds.flatMap((edgeId) => {
      const references = getOwnRecordValue<string[]>(provenanceReferencesBySourceId, edgeId);
      return references?.length ? [{ edge_id: edgeId, references }] : [];
    });

    rows.push([
      clique.length,
      clique.join(" | "),
      support.map((edge) => `${edge.sourceNodeId}--${edge.targetNodeId}`).join(" | "),
      sourceEdgeIds.join(" | "),
      generatedRecordKeys.join(" | "),
      provenanceEdgeIds.flatMap((edgeId) => {
        const provenance = getOwnRecordValue<string>(provenanceBySourceId, edgeId);
        return provenance ? [`${edgeId}: ${provenance}`] : [];
      }).join(" | "),
      JSON.stringify(clique),
      JSON.stringify(support.map((edge) => ({
        source_node_id: edge.sourceNodeId,
        target_node_id: edge.targetNodeId
      }))),
      JSON.stringify(sourceEdgeIds),
      JSON.stringify(generatedRecordKeys),
      JSON.stringify(sourceProvenance)
    ]);
  }

  return rows;
}

/** Exports the target-constrained maximum clique and the global-size comparison. */
export function buildCliqueMaximumMembershipDiagnosisCsv(
  diagnosis: CliqueMaximumMembershipDiagnosis,
  sourceIdByNodeId: Record<string, string>,
  selectedGroup: string
): string {
  const sourceNodeIds = diagnosis.witnessNodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId);
  const sourceTargetId = sourceIdByNodeId[diagnosis.targetNodeId] ?? diagnosis.targetNodeId;
  const sourceEdges = diagnosis.supportingEdges.map((edge) => ({
    source_node_id: sourceIdByNodeId[edge.sourceNodeId] ?? edge.sourceNodeId,
    target_node_id: sourceIdByNodeId[edge.targetNodeId] ?? edge.targetNodeId,
    ...(edge.edgeId ? { source_edge_id: edge.edgeId } : {}),
    ...(edge.edgeIdGenerated ? { generated_record_key: edge.edgeId } : {})
  }));
  const rows: unknown[][] = [[
    "target_node_id",
    "selected_group",
    "outcome",
    "global_maximum_clique_size",
    "maximum_clique_size_containing_target",
    "size_gap",
    "witness_node_ids_json",
    "supporting_edges_json",
    "structured_witness_json"
  ], [
    sourceTargetId,
    selectedGroup,
    diagnosis.outcome,
    diagnosis.globalMaximumSize,
    diagnosis.maximumContainingSize,
    diagnosis.sizeGap,
    JSON.stringify(sourceNodeIds),
    JSON.stringify(sourceEdges),
    JSON.stringify({
      target_node_id: sourceTargetId,
      selected_group: selectedGroup || null,
      outcome: diagnosis.outcome,
      global_maximum_clique_size: diagnosis.globalMaximumSize,
      maximum_clique_size_containing_target: diagnosis.maximumContainingSize,
      size_gap: diagnosis.sizeGap,
      witness_node_ids: sourceNodeIds,
      supporting_edges: sourceEdges
    })
  ]];
  return serializeCsv(rows);
}
