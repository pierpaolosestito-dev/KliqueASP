export type Graph2DCliqueSummaryInput = {
  mode?: string;
  highlightedNodeCount: number;
  resultCount: number;
  group?: string;
};

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function groupLabel(group: string | undefined): string {
  return group ? ` · gruppo ${group}` : "";
}

/** Describes the clique query and the highlighted witness in a 2D export. */
export function buildGraph2DCliqueResultLabel(input: Graph2DCliqueSummaryInput): string | null {
  const nodeCount = count(input.highlightedNodeCount);
  const resultCount = count(input.resultCount);
  const group = groupLabel(input.group);

  switch (input.mode) {
    case "maximum":
      return `Clique di taglia massima · ${nodeCount} nodi evidenziati · ${resultCount} ${resultCount === 1 ? "soluzione ottima" : "soluzioni ottime"}${group}`;
    case "maximal":
      return `Clique massimali · ${resultCount} ${resultCount === 1 ? "risultato" : "risultati"} · ${nodeCount} nodi evidenziati${group}`;
    case "all":
      return `Tutte le clique · ${resultCount} ${resultCount === 1 ? "risultato" : "risultati"} · ${nodeCount} nodi evidenziati${group}`;
    default:
      return null;
  }
}
