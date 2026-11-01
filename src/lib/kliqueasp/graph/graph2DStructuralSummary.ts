import type { StructuralTask } from "./structuralTasks.ts";

export type Graph2DStructuralSummaryInput = {
  task: StructuralTask;
  parameter?: number;
  highlightedNodeCount: number;
  highlightedEdgeCount: number;
  group?: string;
  targetGroup?: string;
  minimumCutCost?: number;
  minimumNodeRemovalCost?: number;
  hasKCoreProfile?: boolean;
  communityCount?: number;
  communityPartitionIndex?: number;
  communityIndex?: number;
};

function nonNegativeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function optionalCost(value: number | undefined, label: string): string {
  return Number.isFinite(value) ? ` · ${label} ${value}` : "";
}

function optionalGroup(group: string | undefined): string {
  return group ? ` · gruppo ${group}` : "";
}

/** Builds a task-specific title for the selected structural witness in a 2D export. */
export function buildGraph2DStructuralResultLabel(input: Graph2DStructuralSummaryInput): string | null {
  const nodeCount = nonNegativeCount(input.highlightedNodeCount);
  const edgeCount = nonNegativeCount(input.highlightedEdgeCount);
  const parameter = Number.isFinite(input.parameter) ? ` ${input.parameter}` : "";
  const group = optionalGroup(input.group);

  switch (input.task) {
    case "kPlex":
      return `k-plex massimo${parameter ? ` · s=${input.parameter}` : ""} · ${nodeCount} nodi evidenziati${group}`;
    case "maximalKPlex":
      return `k-plex massimale${parameter ? ` · s=${input.parameter}` : ""} · ${nodeCount} nodi evidenziati${group}`;
    case "kCore":
      return input.hasKCoreProfile
        ? `Profilo dei core sulla proiezione corrente${group}`
        : `k-core${parameter ? ` · k=${input.parameter}` : ""} · ${nodeCount} nodi evidenziati${group}`;
    case "components":
      return `Componente connessa · ${nodeCount} nodi evidenziati${group}`;
    case "weakComponents":
      return `Componente debolmente connessa · ${nodeCount} nodi evidenziati${group}`;
    case "strongComponents":
      return `Componente fortemente connessa · ${nodeCount} nodi evidenziati${group}`;
    case "path":
      return `Cammino selezionato · ${nodeCount} nodi in ordine${parameter ? ` · massimo ${input.parameter} archi` : ""}${group}`;
    case "typedPath":
      return `Cammino tipizzato selezionato · ${nodeCount} nodi in ordine${group}`;
    case "dominatingSet":
      return `Insieme dominante · ${nodeCount} ${nodeCount === 1 ? "nodo selezionato" : "nodi selezionati"} · ${edgeCount} ${edgeCount === 1 ? "arco di supporto" : "archi di supporto"}${input.targetGroup ? ` · obiettivo ${input.targetGroup}` : group}`;
    case "minimumNodeSeparator":
    case "minimumCostNodeSeparator":
      return nodeCount > 0
        ? `Separatore minimo di nodi · ${nodeCount} ${nodeCount === 1 ? "nodo rimosso" : "nodi rimossi"}${optionalCost(input.minimumNodeRemovalCost, "costo")}${group}`
        : "Terminali già disconnessi · nessun nodo rimosso";
    case "minimumEdgeSeparator":
    case "minimumCostEdgeSeparator":
      return edgeCount > 0
        ? `Taglio minimo di archi · ${edgeCount} ${edgeCount === 1 ? "arco rimosso" : "archi rimossi"}${optionalCost(input.minimumCutCost, "costo")}${group}`
        : "Terminali già disconnessi · nessun arco rimosso";
    case "communities": {
      const partitionCount = nonNegativeCount(input.communityCount ?? 0);
      if (partitionCount === 0) return null;
      const partitionNumber = nonNegativeCount(input.communityPartitionIndex ?? 0) + 1;
      const communityIndex = Number.isInteger(input.communityIndex) ? input.communityIndex! : -1;
      return communityIndex >= 0
        ? `Comunità ${communityIndex + 1} evidenziata · partizione ${partitionNumber}`
        : `Partizione ottima ${partitionNumber} · ${partitionCount} comunità`;
    }
    default:
      return null;
  }
}
