export interface TimelineInterval {
  start: number;
  end: number;
}

export interface VisibleNodeProjectionOptions<Node, Link> {
  nodes: readonly Node[];
  links: readonly Link[];
  mode: "simple" | "graph-aware";
  currentStart: number;
  currentEnd: number;
  getNodeId: (node: Node) => string;
  getLinkEndpoints: (link: Link) => [string, string];
  getTimelineInterval: (node: Node) => TimelineInterval | null;
  isAlwaysVisible: (node: Node) => boolean;
  passesTypeFilter: (node: Node) => boolean;
  passesGroupFilter: (node: Node) => boolean;
  passesTimeline: (node: Node) => boolean;
}

/**
 * Computes the visible node cohort for one graph projection.
 * Graph-aware mode expands the active temporal nodes through the supplied
 * links, then applies the same type/group filters and static fallback used by
 * the application view.
 */
export function projectVisibleNodeIds<Node, Link>(
  options: VisibleNodeProjectionOptions<Node, Link>
): Set<string> {
  const {
    nodes,
    links,
    mode,
    currentStart,
    currentEnd,
    getNodeId,
    getLinkEndpoints,
    getTimelineInterval,
    isAlwaysVisible,
    passesTypeFilter,
    passesGroupFilter,
    passesTimeline
  } = options;

  const passesViewFilters = (node: Node) =>
    passesTypeFilter(node) && passesGroupFilter(node);

  if (mode === "simple") {
    return new Set(nodes
      .filter((node) => passesViewFilters(node) && passesTimeline(node))
      .map(getNodeId));
  }

  const visibleTemporal = new Set<string>();
  for (const node of nodes) {
    const interval = getTimelineInterval(node);
    if (interval && interval.start <= currentEnd && interval.end >= currentStart) {
      visibleTemporal.add(getNodeId(node));
    }
  }

  const expanded = new Set<string>(visibleTemporal);
  for (const link of links) {
    const [sourceId, targetId] = getLinkEndpoints(link);
    if (visibleTemporal.has(sourceId)) expanded.add(targetId);
    if (visibleTemporal.has(targetId)) expanded.add(sourceId);
  }

  for (const node of nodes) {
    if (isAlwaysVisible(node)) expanded.add(getNodeId(node));
  }

  const visibleNodes = nodes.filter((node) =>
    expanded.has(getNodeId(node)) && passesViewFilters(node)
  );

  // Preserve the app's existing fallback if graph-aware expansion yields no
  // nodes after type and group filters.
  if (visibleNodes.length > 0) {
    return new Set(visibleNodes.map(getNodeId));
  }

  return new Set(nodes
    .filter((node) => passesViewFilters(node) && passesTimeline(node))
    .map(getNodeId));
}
