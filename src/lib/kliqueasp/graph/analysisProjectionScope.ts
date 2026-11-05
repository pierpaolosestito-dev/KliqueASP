export interface AnalysisProjectionScope {
  direction: "directed" | "undirected";
  viewTypes: string[];
  viewGroups: string[];
  viewDegreeFilters?: {
    excludeIsolated: boolean;
    excludeWithoutIncoming: boolean;
    excludeWithoutOutgoing: boolean;
  };
  periodLabel: string;
  confidenceThreshold: number | null;
  provenanceScenarioAvailable: boolean;
  provenanceScenarioLabel: string;
  usesVisibleProjection: boolean;
}

export const DEFAULT_ANALYSIS_PROJECTION_SCOPE: AnalysisProjectionScope = {
  direction: "undirected",
  viewTypes: [],
  viewGroups: [],
  viewDegreeFilters: {
    excludeIsolated: false,
    excludeWithoutIncoming: false,
    excludeWithoutOutgoing: false
  },
  periodLabel: "",
  confidenceThreshold: null,
  provenanceScenarioAvailable: false,
  provenanceScenarioLabel: "",
  usesVisibleProjection: true
};
