import type { Graph2DEdgeAnnotation, Graph2DLinkInput } from "./graph2dExport.ts";
import type { ContextualCliqueResult } from "./contextualCliqueTask.ts";
import { getStructuralEdgeIdentity } from "./structuralTasks.ts";

export interface ContextualCliqueGraph2DOverlay {
  nodeIds: string[];
  edgeIds: Set<string>;
  nodeAnnotations: Record<string, string>;
  edgeAnnotations: Record<string, Graph2DEdgeAnnotation>;
  resultLabel: string;
}

/** Maps a solver-verified contextual group to existing graph records for 2D/3D highlighting. */
export function buildContextualCliqueGraph2DOverlay(
  result: ContextualCliqueResult,
  links: readonly Graph2DLinkInput[]
): ContextualCliqueGraph2DOverlay {
  const focalNodeIds = new Set(result.nodeIds);
  const contextNodeIds = new Set(result.pairWitnesses.map(({ contextNodeId }) => contextNodeId));
  const nodeIds = [...new Set([...focalNodeIds, ...contextNodeIds])];
  const annotations = new Map<string, Set<string>>();
  const annotate = (nodeId: string, label: string) => {
    const labels = annotations.get(nodeId) ?? new Set<string>();
    labels.add(label);
    annotations.set(nodeId, labels);
  };

  for (const nodeId of focalNodeIds) annotate(nodeId, "Nodo focale del gruppo contestuale");
  for (const nodeId of contextNodeIds) annotate(nodeId, "Contesto che sostiene una coppia");

  const supportingSourceIds = new Set(result.pairWitnesses.flatMap(({ supportingEdges }) =>
    supportingEdges.map(({ edgeId }) => edgeId)
  ));
  const edgeIds = new Set<string>();
  const edgeAnnotations: Record<string, Graph2DEdgeAnnotation> = {};
  for (const link of links) {
    const sourceId = link.sourceId ?? link.analysis?.id;
    if (sourceId === undefined || sourceId === null || !supportingSourceIds.has(String(sourceId))) continue;
    const identity = getStructuralEdgeIdentity(link);
    edgeIds.add(identity);
    edgeAnnotations[identity] = {
      label: "Relazione di supporto contestuale",
      color: "#2563eb"
    };
  }

  return {
    nodeIds,
    edgeIds,
    nodeAnnotations: Object.fromEntries([...annotations].map(([nodeId, labels]) => [nodeId, [...labels].join(" · ")])),
    edgeAnnotations,
    resultLabel: `Gruppo contestuale · ${result.nodeIds.length} nodi focali · ${result.pairWitnesses.length} supporti coppia-contesto`
  };
}
