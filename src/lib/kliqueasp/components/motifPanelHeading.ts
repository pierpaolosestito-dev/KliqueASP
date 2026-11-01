export interface MotifPanelHeadingOptions {
  activeAnalysisKind: string;
  hasMotifTemplates: boolean;
  signedTriadsEnabled: boolean;
  contextualCliqueConfigured: boolean;
}

export function getMotifPanelHeading({
  activeAnalysisKind,
  hasMotifTemplates,
  signedTriadsEnabled,
  contextualCliqueConfigured
}: MotifPanelHeadingOptions): string {
  if (activeAnalysisKind === "contextualClique") return "Clique contestuale";
  if (activeAnalysisKind === "signedTriads" || activeAnalysisKind === "signedTriadScenarioComparison") {
    return "Triadi firmate";
  }
  if (["typedMotif", "motifScenarioComparison", "motifCount", "motifNearMatch", "motifCounterfactual"].includes(activeAnalysisKind)) {
    return "Motivi relazionali";
  }

  if (hasMotifTemplates) return signedTriadsEnabled ? "Motivi e triadi" : "Motivi relazionali";
  if (signedTriadsEnabled && !contextualCliqueConfigured) return "Triadi firmate";
  if (contextualCliqueConfigured && !signedTriadsEnabled) return "Clique contestuale";
  return "Analisi relazionali";
}
