export type GraphNodeHighlightState = "selected" | "witness" | "preview" | "neighbor" | "muted" | "default";

/** Adds a size cue to 3D node emphasis so highlighted results are not distinguished by color alone. */
export function getGraphNodeHighlightScaleFactor(state: GraphNodeHighlightState): number {
  switch (state) {
    case "selected": return 1.4;
    case "preview": return 1.3;
    case "witness": return 1.25;
    case "neighbor": return 1.15;
    case "muted":
    case "default": return 1;
  }
}

export function getGraphNodeHighlightState(
  nodeId: string,
  options: {
    selectedNodeId: string | null;
    witnessNodeIds: ReadonlySet<string>;
    highlightedNeighborIds: ReadonlySet<string>;
    selectedNodeNeighborIds: ReadonlySet<string>;
  }
): GraphNodeHighlightState {
  if (options.witnessNodeIds.size > 0) {
    if (options.witnessNodeIds.has(nodeId)) return "witness";
    return options.selectedNodeId === nodeId ? "selected" : "muted";
  }

  if (options.selectedNodeId === nodeId) return "selected";
  if (!options.selectedNodeId) return "default";
  if (options.highlightedNeighborIds.has(nodeId)) return "preview";
  if (options.selectedNodeNeighborIds.has(nodeId)) return "neighbor";
  return "muted";
}
