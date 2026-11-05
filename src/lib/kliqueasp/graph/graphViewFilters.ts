import type { NodeDegreeProjectionFilters } from "./nodeDegreeProjection.ts";

/** View-only filters captured with an analysis result or scenario comparison. */
export interface GraphViewFilterSnapshot {
  types: string[];
  groups: string[];
  degreeFilters?: Partial<NodeDegreeProjectionFilters>;
}
