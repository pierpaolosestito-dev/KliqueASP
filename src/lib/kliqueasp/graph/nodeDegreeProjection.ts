export interface NodeDegreeProjectionFilters {
  excludeIsolated: boolean;
  excludeWithoutIncoming: boolean;
  excludeWithoutOutgoing: boolean;
}

export interface NodeDegreeProjectionOptions<Node, Link> extends NodeDegreeProjectionFilters {
  direction: "directed" | "undirected";
  getNodeId: (node: Node) => string;
  getLinkEndpoints: (link: Link) => [string, string];
}

type NodeDegree = { total: number; incoming: number; outgoing: number };

/** Removes nodes whose degree condition fails in the supplied induced projection. */
export function filterNodeIdsByDegree<Node, Link>(
  nodes: readonly Node[],
  links: readonly Link[],
  options: NodeDegreeProjectionOptions<Node, Link>
): Set<string> {
  const nodeIds = new Set(nodes.map(options.getNodeId));
  const degreeByNode = new Map<string, NodeDegree>(
    [...nodeIds].map((nodeId) => [nodeId, { total: 0, incoming: 0, outgoing: 0 }])
  );

  for (const link of links) {
    const [sourceId, targetId] = options.getLinkEndpoints(link);
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) continue;
    const source = degreeByNode.get(sourceId)!;
    const target = degreeByNode.get(targetId)!;
    if (sourceId === targetId) {
      source.total += 1;
      if (options.direction === "directed") {
        source.outgoing += 1;
        source.incoming += 1;
      }
      continue;
    }
    source.total += 1;
    target.total += 1;
    if (options.direction === "directed") {
      source.outgoing += 1;
      target.incoming += 1;
    }
  }

  return new Set([...nodeIds].filter((nodeId) => {
    const degree = degreeByNode.get(nodeId)!;
    if (options.excludeIsolated && degree.total === 0) return false;
    if (options.direction === "directed" && options.excludeWithoutIncoming && degree.incoming === 0) return false;
    if (options.direction === "directed" && options.excludeWithoutOutgoing && degree.outgoing === 0) return false;
    return true;
  }));
}
