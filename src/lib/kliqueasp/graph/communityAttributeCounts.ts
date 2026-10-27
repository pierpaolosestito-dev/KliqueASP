import type { GraphCommunityConstraints } from "./graphModel.ts";
import type { ModularityPartition } from "./structuralTasks.ts";

interface CommunityAttributeCandidateNode {
  id: string;
  analysis?: { attributes?: unknown } | null;
}

/** Adds host-derived attribute counts to ASP community partitions for display/export. */
export function deriveCommunityAttributeBoundCounts(
  partitions: ModularityPartition[],
  candidateNodes: readonly CommunityAttributeCandidateNode[],
  bounds: GraphCommunityConstraints["attributeBounds"]
): ModularityPartition[] {
  if (!bounds || bounds.length === 0) return partitions;

  const nodeById = new Map(candidateNodes.map((node) => [node.id, node]));
  return partitions.map((partition) => ({
    ...partition,
    attributeBoundCounts: partition.communities.flatMap((community) => bounds.map((bound) => {
      const attribute = bound.attribute.trim();
      return {
        communityId: community[0],
        attribute,
        value: bound.value,
        count: community.filter((nodeId) => {
          const attributes = nodeById.get(nodeId)?.analysis?.attributes;
          return attributes !== null && typeof attributes === "object" && !Array.isArray(attributes) &&
            Object.prototype.hasOwnProperty.call(attributes, attribute) &&
            (attributes as Record<string, unknown>)[attribute] === bound.value;
        }).length,
        ...(bound.minPerCommunity !== undefined && bound.minPerCommunity > 0
          ? { minimum: bound.minPerCommunity }
          : {}),
        ...(bound.maxPerCommunity !== undefined && bound.maxPerCommunity > 0
          ? { maximum: bound.maxPerCommunity }
          : {})
      };
    }))
  }));
}
