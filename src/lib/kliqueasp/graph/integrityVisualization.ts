import type { Graph2DEdgeAnnotation, Graph2DLinkInput, Graph2DNodeInput } from "./graph2dExport.ts";
import { getGraphEndpointId, normalizeGraphId } from "./graphModel.ts";
import type { IntegrityViolation } from "./integrityTask.ts";
import { getStructuralEdgeIdentity, summarizeEdgeProvenance } from "./structuralTasks.ts";
import { getIntegrityViolationLabel } from "./integrityViolationLabels.ts";
import { getOwnRecordValue } from "./recordUtils.ts";

const EDGE_SUBJECT_KINDS = new Set([
  "edge_endpoint_type", "missing_endpoint_node_type", "edge_type_out_of_domain", "missing_edge_type",
  "missing_edge_attribute", "edge_attribute_out_of_domain", "missing_edge_interval",
  "invalid_edge_interval_value", "invalid_edge_interval", "duplicate_edge_attribute"
]);

export type IntegrityViolationVisualization = {
  nodeIds: string[];
  edgeIds: string[];
  nodeAnnotations: Record<string, string>;
  edgeAnnotations: Record<string, Graph2DEdgeAnnotation>;
  resultLabel: string;
  hasWitness: boolean;
};

/** Projects only source elements named by an integrity witness onto the 2D graph. */
export function buildIntegrityViolationVisualization(
  violation: IntegrityViolation,
  nodes: Graph2DNodeInput[],
  links: Graph2DLinkInput[],
  provenanceBySourceId: Record<string, string> = {}
): IntegrityViolationVisualization {
  const label = getIntegrityViolationLabel(violation.kind);
  const wantedEdgeIds = new Set(
    violation.edgeIds?.length
      ? violation.edgeIds.map(String)
      : violation.subjectId && EDGE_SUBJECT_KINDS.has(violation.kind)
        ? [String(violation.subjectId)]
        : []
  );
  const matchingLinks = links.filter((link) =>
    wantedEdgeIds.has(String(link.sourceId ?? link.analysis?.id ?? ""))
  );
  const nodeBySourceId = new Map<string, string>();
  const knownNodeIds = new Set<string>();
  for (const node of nodes) {
    const id = normalizeGraphId(node.id);
    knownNodeIds.add(id);
    nodeBySourceId.set(String(node.sourceId ?? node.analysis?.id ?? node.id), id);
    nodeBySourceId.set(String(node.id), id);
  }

  const selectedNodeIds = new Set(
    violation.nodeIds
      .map((sourceId) => nodeBySourceId.get(String(sourceId)))
      .filter((nodeId): nodeId is string => nodeId !== undefined)
  );
  if (selectedNodeIds.size === 0) {
    for (const link of matchingLinks) {
      for (const endpoint of [link.source, link.target]) {
        const nodeId = normalizeGraphId(getGraphEndpointId(endpoint));
        if (knownNodeIds.has(nodeId)) selectedNodeIds.add(nodeId);
      }
    }
  }

  const nodeIds = [...selectedNodeIds];
  const edgeIds = matchingLinks.map((link) => getStructuralEdgeIdentity(link));
  const nodeAnnotations = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, `Violazione · ${label}`]));
  const edgeAnnotations = Object.fromEntries(edgeIds.map((edgeId, index) => {
    const sourceId = String(matchingLinks[index]?.sourceId ?? matchingLinks[index]?.analysis?.id ?? "");
    const provenance = sourceId ? getOwnRecordValue<string>(provenanceBySourceId, sourceId) : undefined;
    const detail = provenance ? `Fonte dichiarata · ${sourceId}: ${provenance}` : undefined;
    return [edgeId, {
      label: `Violazione · ${label}`,
      ...(detail ? { description: detail } : {}),
      color: "#b4233c",
      dashPattern: "dotted"
    } satisfies Graph2DEdgeAnnotation];
  }));
  const hasWitness = nodeIds.length > 0 || edgeIds.length > 0;

  return {
    nodeIds,
    edgeIds,
    nodeAnnotations,
    edgeAnnotations,
    resultLabel: hasWitness
      ? `Violazione · ${label}`
      : `Vincolo globale · ${label} (nessun testimone nel grafo)`,
    hasWitness
  };
}
