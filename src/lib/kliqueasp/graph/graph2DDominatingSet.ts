import type { Graph2DEdgeAnnotation } from "./graph2dExport.ts";
import type { DominatingSetCoverageWitness } from "./structuralTasks.ts";

export type Graph2DDominatingSetCoverageOverlay = {
  edgeIds: string[];
  edgeAnnotations: Record<string, Graph2DEdgeAnnotation>;
};

/** Returns source records that certify how a selected dominating set covers its targets. */
export function buildGraph2DDominatingSetCoverageOverlay(
  selectedNodeIds: readonly string[],
  coverageWitnesses: readonly DominatingSetCoverageWitness[],
  nodeLabels: Readonly<Record<string, string>> = {}
): Graph2DDominatingSetCoverageOverlay {
  const selectedNodes = new Set(selectedNodeIds);
  const descriptionsByEdgeId = new Map<string, Set<string>>();

  for (const witness of coverageWitnesses) {
    if (typeof witness?.targetNodeId !== "string" || !witness.targetNodeId ||
      typeof witness.coveringNodeId !== "string" || !selectedNodes.has(witness.coveringNodeId)) continue;
    if (witness.targetNodeId === witness.coveringNodeId) continue;

    const targetLabel = nodeLabels[witness.targetNodeId] || witness.targetNodeId;
    const coveringLabel = nodeLabels[witness.coveringNodeId] || witness.coveringNodeId;
    const description = `${targetLabel} è coperto da ${coveringLabel} nella proiezione non orientata.`;

    for (const record of Array.isArray(witness.supportingRecords) ? witness.supportingRecords : []) {
      const edgeId = typeof record?.edgeIdentity === "string" ? record.edgeIdentity.trim() : "";
      if (!edgeId) continue;
      const descriptions = descriptionsByEdgeId.get(edgeId) ?? new Set<string>();
      descriptions.add(description);
      descriptionsByEdgeId.set(edgeId, descriptions);
    }
  }

  const edgeIds = [...descriptionsByEdgeId.keys()].sort((left, right) => left.localeCompare(right));
  const edgeAnnotations = Object.fromEntries(edgeIds.map((edgeId) => [
    edgeId,
    {
      label: "Copertura",
      description: [...(descriptionsByEdgeId.get(edgeId) ?? [])].sort((left, right) => left.localeCompare(right)).join(" "),
      color: "#d97706"
    }
  ]));

  return { edgeIds, edgeAnnotations };
}
