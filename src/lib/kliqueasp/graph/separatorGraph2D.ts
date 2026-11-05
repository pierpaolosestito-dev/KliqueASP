import type { Graph2DEdgeAnnotation } from "./graph2dExport.ts";

export type SeparatorGraph2DRequest =
  | { kind: "removed-nodes"; ids: readonly string[]; removalCost?: number }
  | { kind: "removed-edges"; ids: readonly string[]; removalCost?: number }
  | { kind: "reachable-side"; ids: readonly string[]; removalCost?: number };

export interface SeparatorGraph2DOverlay {
  nodeAnnotations: Record<string, string>;
  edgeAnnotations: Record<string, Graph2DEdgeAnnotation>;
  resultLabel: string;
}

/** Builds the annotations shared by the graph highlight and its 2D witness export. */
export function buildSeparatorGraph2DOverlay(
  request: SeparatorGraph2DRequest
): SeparatorGraph2DOverlay {
  const costLabel = Number.isFinite(request.removalCost)
    ? ` · costo minimo ${request.removalCost}`
    : "";

  if (request.kind === "removed-nodes") {
    return {
      nodeAnnotations: Object.fromEntries(request.ids.map((id) => [id, "Nodo rimosso · separatore"])),
      edgeAnnotations: {},
      resultLabel: `Separatore di nodi${costLabel}`
    };
  }

  if (request.kind === "removed-edges") {
    return {
      nodeAnnotations: {},
      edgeAnnotations: Object.fromEntries(request.ids.map((id) => [id, {
        label: "Arco rimosso · taglio",
        description: "Record rimosso per separare i terminali",
        color: "#b4233c",
        dashPattern: "dotted"
      }])),
      resultLabel: `Taglio di archi${costLabel}`
    };
  }

  return {
    nodeAnnotations: Object.fromEntries(request.ids.map((id) => [
      id,
      "Lato raggiungibile dal terminale iniziale"
    ])),
    edgeAnnotations: {},
    resultLabel: `Lato sorgente raggiungibile dopo la rimozione${costLabel}`
  };
}
