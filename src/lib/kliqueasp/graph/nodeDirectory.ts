export interface GraphNodeDirectoryEntry {
  id: string;
  label: string;
  type: string;
}

interface GraphNodeDirectoryInput {
  id?: unknown;
  label?: unknown;
  type?: unknown;
}

/** Build a stable, text-first index of the nodes currently visible in the graph. */
export function buildGraphNodeDirectoryEntries(
  nodes: readonly GraphNodeDirectoryInput[],
  visibleNodeIds: ReadonlySet<string> | null = null
): GraphNodeDirectoryEntry[] {
  return nodes.flatMap((node) => {
    if (node === null || typeof node !== "object") return [];
    const id = String(node.id ?? "").trim();
    if (!id || (visibleNodeIds !== null && !visibleNodeIds.has(id))) return [];

    return [{
      id,
      label: String(node.label ?? "").trim() || id,
      type: String(node.type ?? "").trim()
    }];
  }).sort((left, right) =>
    left.label.localeCompare(right.label, "it", { sensitivity: "base" }) ||
    left.id.localeCompare(right.id, "en")
  );
}
