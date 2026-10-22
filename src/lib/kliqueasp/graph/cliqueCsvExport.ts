import type { CliqueSupportingEdge } from "./graphModel";

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
      const references = provenanceReferencesBySourceId[edgeId];
      return references?.length ? [{ edge_id: edgeId, references }] : [];
    });

    rows.push([
      clique.length,
      clique.join(" | "),
      support.map((edge) => `${edge.sourceNodeId}--${edge.targetNodeId}`).join(" | "),
      sourceEdgeIds.join(" | "),
      generatedRecordKeys.join(" | "),
      provenanceEdgeIds.flatMap((edgeId) => {
        const provenance = provenanceBySourceId[edgeId];
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
