import type {
  ProvenanceScenarioCliqueComparison,
  ProvenanceScenarioCliqueMembership,
  ProvenanceScenarioComponentComparison,
  ProvenanceScenarioComponentMembership,
  ProvenanceScenarioDominatingSetComparison,
  ProvenanceScenarioDominatingSetMembership,
  ProvenanceScenarioKCoreComparison,
  ProvenanceScenarioKCoreMembership,
  ProvenanceScenarioKPlexComparison,
  ProvenanceScenarioKPlexMembership
} from "./provenanceScenarioAnalysis.ts";

export type ProvenanceScenarioCliqueMembershipGraph2DOverlay = {
  nodeIds: string[];
  nodeAnnotations: Record<string, string>;
  resultLabel: string;
  completionLabel: string;
};

/** Describes a selected scenario-membership row without presenting it as a clique witness. */
export function buildProvenanceScenarioCliqueMembershipGraph2DOverlay(
  membership: ProvenanceScenarioCliqueMembership,
  comparison: Pick<ProvenanceScenarioCliqueComparison, "scenarioCount" | "totalOptimalAnswerSetCount">
): ProvenanceScenarioCliqueMembershipGraph2DOverlay {
  const optimumParticipation = comparison.totalOptimalAnswerSetCount > 0
    ? `${membership.optimalAnswerSetCount}/${comparison.totalOptimalAnswerSetCount} clique massime`
    : "nessuna clique massima calcolata";
  const annotation = [
    `${membership.scenarioSupportCount}/${comparison.scenarioCount} scenari`,
    optimumParticipation,
    comparison.totalOptimalAnswerSetCount > 0
      ? membership.stableAcrossEveryOptimalAnswerSet
        ? "presente in tutti gli ottimi"
        : membership.optimalAnswerSetCount > 0
          ? "presente solo in alcuni ottimi"
          : "mai presente negli ottimi"
      : "nessun ottimo trovato"
  ].join(" · ");

  return {
    nodeIds: [membership.nodeId],
    nodeAnnotations: { [membership.nodeId]: annotation },
    resultLabel: "Presenza del nodo nelle clique massime tra scenari",
    completionLabel: `Enumerazione completa · ${comparison.totalOptimalAnswerSetCount} clique massime in ${comparison.scenarioCount} scenari`
  };
}

export type ProvenanceScenarioStructuralMembershipSelection =
  | {
      kind: "kCore";
      membership: ProvenanceScenarioKCoreMembership;
      comparison: ProvenanceScenarioKCoreComparison;
    }
  | {
      kind: "kPlex";
      membership: ProvenanceScenarioKPlexMembership;
      comparison: ProvenanceScenarioKPlexComparison;
    }
  | {
      kind: "component";
      membership: ProvenanceScenarioComponentMembership;
      comparison: ProvenanceScenarioComponentComparison;
    }
  | {
      kind: "dominatingSet";
      membership: ProvenanceScenarioDominatingSetMembership;
      comparison: ProvenanceScenarioDominatingSetComparison;
    };

/** Adds the selected row's counts to its node without turning aggregate support into a group witness. */
export function buildProvenanceScenarioStructuralMembershipGraph2DAnnotation(
  selection: ProvenanceScenarioStructuralMembershipSelection
): ProvenanceScenarioCliqueMembershipGraph2DOverlay {
  let annotation: string;
  let resultLabel: string;
  let completionLabel: string;
  if (selection.kind === "kCore") {
    const { membership, comparison } = selection;
    annotation = `k-core in ${membership.scenarioSupportCount}/${comparison.scenarioCount} scenari · candidato in ${membership.candidateScenarioSupportCount}/${comparison.scenarioCount}`;
    resultLabel = `Presenza del nodo nel k-core k=${comparison.k} tra scenari`;
    completionLabel = `Confronto completo · ${comparison.scenarioCount} scenari`;
  } else if (selection.kind === "kPlex") {
    const { membership, comparison } = selection;
    const optima = comparison.totalOptimalAnswerSetCount > 0
      ? `${membership.optimalAnswerSetCount}/${comparison.totalOptimalAnswerSetCount} k-plex massimi`
      : "nessun k-plex massimo calcolato";
    annotation = `${optima} · presente in ${membership.scenarioSupportCount}/${comparison.scenarioCount} scenari`;
    resultLabel = `Presenza del nodo nei k-plex massimi s=${comparison.s} tra scenari`;
    completionLabel = `Enumerazione completa · ${comparison.totalOptimalAnswerSetCount} k-plex massimi s=${comparison.s} in ${comparison.scenarioCount} scenari`;
  } else if (selection.kind === "component") {
    const { membership, comparison } = selection;
    const relation = membership.comparableScenarioCount > 0
      ? `stessa componente in ${membership.sameComponentScenarioCount}/${membership.comparableScenarioCount} scenari confrontabili`
      : "nessuno scenario confrontabile";
    annotation = `${relation} · riferimento ${comparison.targetNodeId} · candidato in ${membership.candidateScenarioCount}/${comparison.scenarioCount}`;
    const componentType = comparison.task === "components"
      ? "connessa non orientata"
      : comparison.task === "weakComponents"
        ? "debolmente connessa"
        : "fortemente connessa";
    resultLabel = `Relazione di componente ${componentType} con il riferimento ${comparison.targetNodeId} tra scenari`;
    completionLabel = `Confronto completo · ${comparison.scenarioCount} scenari`;
  } else {
    const { membership, comparison } = selection;
    const coverageCount = membership.totalComparableMinimumSetCount > 0
      ? `${membership.selectedMinimumSetCount}/${membership.totalComparableMinimumSetCount} coperture minime`
      : "nessuna copertura minima calcolata";
    annotation = `${coverageCount} · candidato in ${membership.candidateScenarioCount}/${comparison.scenarioCount} scenari`;
    const candidateGroup = comparison.candidateGroup.trim() || "tutti i nodi";
    const targetGroup = comparison.targetGroup.trim() || "tutti i nodi";
    resultLabel = `Selezione del nodo nelle coperture minime tra scenari · candidati ${candidateGroup} · obiettivi ${targetGroup}`;
    completionLabel = `Confronto completo · ${comparison.scenarioCount} scenari · ${comparison.totalMinimumSetCount} coperture minime`;
  }

  return {
    nodeIds: [selection.membership.nodeId],
    nodeAnnotations: { [selection.membership.nodeId]: annotation },
    resultLabel,
    completionLabel
  };
}
