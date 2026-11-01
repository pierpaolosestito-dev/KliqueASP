import {
  buildGraph2DHypotheticalEdgeAnnotations,
  buildGraph2DHypotheticalLinks,
  type Graph2DEdgeAnnotation,
  type Graph2DLinkInput,
  type Graph2DNodeInput
} from "./graph2dExport.ts";
import { getGraphEndpointId, normalizeGraphId } from "./graphModel.ts";
import type { CommunityTopologyCounterfactualResult } from "./communityTopologyCounterfactual.ts";
import { getStructuralEdgeIdentity } from "./structuralTasks.ts";

export interface CommunityTopologyGraph2DOverlay {
  nodeIds: string[];
  edgeIds: Set<string>;
  nodeAnnotations: Record<string, string>;
  edgeAnnotations: Record<string, Graph2DEdgeAnnotation>;
  hypotheticalLinks: Graph2DLinkInput[];
  resultLabel: string;
  completionLabel: string;
}

/** Maps a proved community-topology edit set to a display-only 2D witness. */
export function buildCommunityTopologyGraph2DOverlay(
  result: CommunityTopologyCounterfactualResult,
  nodes: readonly Graph2DNodeInput[],
  links: readonly Graph2DLinkInput[]
): CommunityTopologyGraph2DOverlay {
  const knownNodeIds = new Set(nodes.flatMap((node) => {
    const id = node.id === undefined || node.id === null ? "" : String(node.id);
    return id ? [id] : [];
  }));
  const sourceNodeIds = new Map<string, string>();
  const ambiguousSourceIds = new Set<string>();
  for (const node of nodes) {
    const nodeId = node.id === undefined || node.id === null ? "" : String(node.id);
    const sourceReference = normalizeGraphId(node.sourceId ?? node.analysis?.id ?? node.id);
    if (!nodeId || !sourceReference || ambiguousSourceIds.has(sourceReference)) continue;
    const previous = sourceNodeIds.get(sourceReference);
    if (previous && previous !== nodeId) {
      sourceNodeIds.delete(sourceReference);
      ambiguousSourceIds.add(sourceReference);
      continue;
    }
    sourceNodeIds.set(sourceReference, nodeId);
  }

  const nodeAnnotations = new Map<string, Set<string>>();
  const annotateNode = (nodeId: string, label: string) => {
    if (!knownNodeIds.has(nodeId)) return;
    const labels = nodeAnnotations.get(nodeId) ?? new Set<string>();
    labels.add(label);
    nodeAnnotations.set(nodeId, labels);
  };
  const nodeIds = [...new Set(result.nodeIds.map(String).filter((nodeId) => knownNodeIds.has(nodeId)))];
  for (const [index, nodeId] of result.nodeIds.entries()) {
    annotateNode(String(nodeId), index === 0 ? "Primo nodo della coppia valutata" : "Secondo nodo della coppia valutata");
  }

  const edgeIds = new Set<string>();
  const edgeAnnotations: Record<string, Graph2DEdgeAnnotation> = {};
  const additions: Array<{ id: string; sourceNodeId: string; targetNodeId: string; edgeType: string; cost: number }> = [];
  for (const edit of result.selectedEdits) {
    if (edit.action === "add") {
      const sourceNodeId = sourceNodeIds.get(normalizeGraphId(edit.sourceNodeId));
      const targetNodeId = sourceNodeIds.get(normalizeGraphId(edit.targetNodeId));
      if (!sourceNodeId || !targetNodeId) continue;
      additions.push({ id: edit.id, sourceNodeId, targetNodeId, edgeType: "", cost: edit.cost });
      annotateNode(sourceNodeId, "Estremo di una relazione da aggiungere");
      annotateNode(targetNodeId, "Estremo di una relazione da aggiungere");
      continue;
    }

    for (const link of links) {
      const sourceId = link.sourceId ?? link.analysis?.id;
      if (link.sourceIdGenerated === true || sourceId === undefined || sourceId === null || String(sourceId) !== String(edit.edgeId)) continue;
      const identity = getStructuralEdgeIdentity(link);
      edgeIds.add(identity);
      edgeAnnotations[identity] = {
        label: "Arco da rimuovere nell'ipotesi",
        description: `ID arco sorgente: ${String(sourceId)} \u00b7 costo di rimozione ${edit.cost}`,
        color: "#b4233c",
        dashPattern: "dotted"
      };
      for (const endpoint of [link.source, link.target]) {
        const nodeId = String(getGraphEndpointId(endpoint) ?? "");
        annotateNode(nodeId, "Estremo di una relazione da rimuovere");
      }
    }
  }

  const hypotheticalLinks = buildGraph2DHypotheticalLinks("community-topology", additions, "undirected");
  Object.assign(edgeAnnotations, buildGraph2DHypotheticalEdgeAnnotations("community-topology", additions));
  const relationLabel = result.relation === "always"
    ? "sempre insieme"
    : result.relation === "sometimes"
      ? "insieme in alcuni ottimi"
      : "sempre separati";
  return {
    nodeIds,
    edgeIds,
    nodeAnnotations: Object.fromEntries([...nodeAnnotations].map(([nodeId, labels]) => [nodeId, [...labels].join(" \u00b7 ")])),
    edgeAnnotations,
    hypotheticalLinks,
    resultLabel: `Scenario di modularit\u00e0 \u00b7 ${relationLabel} \u00b7 ${result.selectedEdits.length} modifiche`,
    completionLabel: `Costo minimo verificato \u00b7 ${result.testedEditSets} ipotesi esaminate`
  };
}
