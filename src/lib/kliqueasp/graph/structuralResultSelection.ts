import type { StructuralTask } from "./structuralTasks.ts";

export interface StructuralResultSelectionState {
  activeSeparatorSignature: string;
  selectedDominatingSignature: string;
  selectedKcoreSignature: string;
  selectedKplexSignature: string;
}

/** Returns a pressed state only for result families whose witness selection is tracked. */
export function getStructuralResultPressedState(
  task: StructuralTask,
  resultSignature: string,
  selection: StructuralResultSelectionState
): boolean | undefined {
  switch (task) {
    case "kPlex":
    case "maximalKPlex":
      return resultSignature === selection.selectedKplexSignature;
    case "kCore":
      return resultSignature === selection.selectedKcoreSignature;
    case "dominatingSet":
      return resultSignature === selection.selectedDominatingSignature;
    case "minimumNodeSeparator":
    case "minimumCostNodeSeparator":
    case "minimumEdgeSeparator":
    case "minimumCostEdgeSeparator":
      return resultSignature === selection.activeSeparatorSignature;
    default:
      return undefined;
  }
}
