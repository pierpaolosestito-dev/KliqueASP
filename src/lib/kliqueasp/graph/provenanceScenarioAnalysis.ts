import { serializeCsv } from "../csvExport.ts";

export type ProvenanceScenarioWorldAssumption = "declared-projections" | "finite-exhaustive-worlds";

export interface ScenarioMaximumCliqueInput {
  scenarioId: string;
  scenarioLabel?: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  /** Complete eligible vertex domain when the query restricts clique candidates. */
  candidateNodeIds?: string[];
  maximumCliques: string[][];
}

export interface ProvenanceScenarioMaximumCliqueSummary {
  scenarioId: string;
  scenarioLabel: string;
  nodesCount: number;
  candidateNodeCount?: number;
  linksCount: number;
  timeMs: number;
  maximumCliqueSize: number;
  maximumCliqueCount: number;
  maximumCliqueNodeIds: string[];
}

export interface ProvenanceScenarioCliqueMembership {
  nodeId: string;
  candidateScenarioSupportCount?: number;
  candidateScenarioIds?: string[];
  scenarioSupportCount: number;
  scenarioIds: string[];
  optimalAnswerSetCount: number;
  totalOptimalAnswerSetCount: number;
  stableAcrossEveryOptimalAnswerSet: boolean;
}

export interface ProvenanceScenarioCliqueComparison {
  worldAssumption: ProvenanceScenarioWorldAssumption;
  scenarioCount: number;
  totalOptimalAnswerSetCount: number;
  stableNodeIds: string[];
  nonUniversalNodeIds: string[];
  scenarios: ProvenanceScenarioMaximumCliqueSummary[];
  memberships: ProvenanceScenarioCliqueMembership[];
}

export interface ScenarioMaximumKPlexInput {
  scenarioId: string;
  scenarioLabel?: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  candidateNodeIds: string[];
  maximumKPlexes: string[][];
}

export interface ProvenanceScenarioMaximumKPlexSummary {
  scenarioId: string;
  scenarioLabel: string;
  nodesCount: number;
  candidateNodeCount: number;
  linksCount: number;
  timeMs: number;
  maximumKPlexSize: number;
  maximumKPlexCount: number;
  maximumKPlexNodeIds: string[];
}

export interface ProvenanceScenarioKPlexMembership {
  nodeId: string;
  candidateScenarioSupportCount: number;
  candidateScenarioIds: string[];
  scenarioSupportCount: number;
  scenarioIds: string[];
  optimalAnswerSetCount: number;
  totalOptimalAnswerSetCount: number;
  stableAcrossEveryOptimalAnswerSet: boolean;
}

export interface ProvenanceScenarioKPlexComparison {
  worldAssumption?: ProvenanceScenarioWorldAssumption;
  scenarioCount: number;
  s: number;
  totalOptimalAnswerSetCount: number;
  stableNodeIds: string[];
  nonUniversalNodeIds: string[];
  scenarios: ProvenanceScenarioMaximumKPlexSummary[];
  memberships: ProvenanceScenarioKPlexMembership[];
}

export interface ScenarioKCoreInput {
  scenarioId: string;
  scenarioLabel?: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  candidateNodeIds: string[];
  coreNodeIds: string[];
}

export interface ProvenanceScenarioKCoreSummary {
  scenarioId: string;
  scenarioLabel: string;
  nodesCount: number;
  candidateNodeCount: number;
  linksCount: number;
  timeMs: number;
  coreSize: number;
}

export interface ProvenanceScenarioKCoreMembership {
  nodeId: string;
  candidateScenarioSupportCount: number;
  candidateScenarioIds: string[];
  scenarioSupportCount: number;
  scenarioIds: string[];
  stableAcrossEveryScenario: boolean;
  stableAcrossEveryEligibleScenario: boolean;
}

export interface ProvenanceScenarioKCoreComparison {
  worldAssumption?: ProvenanceScenarioWorldAssumption;
  scenarioCount: number;
  k: number;
  degreeMode: "undirected" | "in" | "out" | "mutual";
  stableNodeIds: string[];
  nonUniversalNodeIds: string[];
  scenarios: ProvenanceScenarioKCoreSummary[];
  memberships: ProvenanceScenarioKCoreMembership[];
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeNodeSet(nodeIds: unknown): string[] | null {
  if (!Array.isArray(nodeIds)) return null;
  const normalized = nodeIds.filter((nodeId): nodeId is string =>
    typeof nodeId === "string" && nodeId.trim() !== ""
  );
  if (normalized.length !== nodeIds.length) return null;
  return [...new Set(normalized)].sort(compareIds);
}

function nodeSetKey(nodeIds: readonly string[]): string {
  return JSON.stringify(nodeIds);
}

function validateWorldAssumption(
  worldAssumption: ProvenanceScenarioWorldAssumption
): ProvenanceScenarioWorldAssumption {
  if (worldAssumption !== "declared-projections" && worldAssumption !== "finite-exhaustive-worlds") {
    throw new TypeError("worldAssumption deve identificare proiezioni dichiarate o mondi finiti esaustivi");
  }
  return worldAssumption;
}

/**
 * Summarizes exact maximum-node-set answer sets computed independently for a
 * finite, declared set of provenance projections.
 */
function summarizeMaximumNodeSetScenarios(
  scenarioInputs: readonly ScenarioMaximumCliqueInput[],
  structureLabel: string,
  worldAssumption: ProvenanceScenarioWorldAssumption = "declared-projections"
): ProvenanceScenarioCliqueComparison {
  validateWorldAssumption(worldAssumption);
  if (scenarioInputs.length === 0) {
    throw new TypeError("È necessario almeno uno scenario di provenienza");
  }

  const seenScenarioIds = new Set<string>();
  const candidateDomainDeclared = scenarioInputs.some((scenario) => scenario.candidateNodeIds !== undefined);
  if (candidateDomainDeclared && scenarioInputs.some((scenario) => scenario.candidateNodeIds === undefined)) {
    throw new TypeError("Il dominio candidato della clique deve essere dichiarato per tutti gli scenari o per nessuno");
  }
  const normalizedScenarios = scenarioInputs.map((scenario) => {
    const scenarioId = typeof scenario.scenarioId === "string" ? scenario.scenarioId.trim() : "";
    if (!scenarioId || seenScenarioIds.has(scenarioId)) {
      throw new TypeError("Gli ID degli scenari devono essere non vuoti e univoci");
    }
    seenScenarioIds.add(scenarioId);

    if (!Number.isSafeInteger(scenario.nodesCount) || scenario.nodesCount < 1 ||
      !Number.isSafeInteger(scenario.linksCount) || scenario.linksCount < 0 ||
      !Number.isFinite(scenario.timeMs) || scenario.timeMs < 0) {
      throw new TypeError(`Statistiche non valide per lo scenario '${scenarioId}'`);
    }

    let candidateNodeIds: string[] | undefined;
    if (candidateDomainDeclared) {
      if (!Array.isArray(scenario.candidateNodeIds)) {
        throw new TypeError(`Dominio candidato clique non valido nello scenario '${scenarioId}'`);
      }
      candidateNodeIds = scenario.candidateNodeIds.map((nodeId) =>
        typeof nodeId === "string" ? nodeId.trim() : ""
      );
      if (candidateNodeIds.some((nodeId) => nodeId === "") ||
        new Set(candidateNodeIds).size !== candidateNodeIds.length ||
        candidateNodeIds.length > scenario.nodesCount) {
        throw new TypeError(`Dominio candidato clique non valido nello scenario '${scenarioId}'`);
      }
    }

    const uniqueCliques = new Map<string, string[]>();
    for (const rawClique of scenario.maximumCliques) {
      const nodeSet = normalizeNodeSet(rawClique);
      if (!nodeSet) {
        throw new TypeError(`Witness di ${structureLabel} non valido nello scenario '${scenarioId}'`);
      }
      uniqueCliques.set(nodeSetKey(nodeSet), nodeSet);
    }

    if (uniqueCliques.size === 0) {
      throw new TypeError(`Lo scenario '${scenarioId}' non contiene witness ottimi completi`);
    }

    const allCliques = [...uniqueCliques.values()];
    if (candidateNodeIds && allCliques.some((clique) => clique.some((nodeId) => !candidateNodeIds!.includes(nodeId)))) {
      throw new TypeError(`Un witness di ${structureLabel} contiene nodi fuori dal dominio candidato dello scenario '${scenarioId}'`);
    }
    const maximumCliqueSize = Math.max(...allCliques.map((clique) => clique.length));
    const maximumCliques = allCliques.filter((clique) => clique.length === maximumCliqueSize);
    const maximumCliqueNodeIds = [...new Set(maximumCliques.flat())].sort(compareIds);
    const scenarioLabel = typeof scenario.scenarioLabel === "string" && scenario.scenarioLabel.trim()
      ? scenario.scenarioLabel.trim()
      : scenarioId;

    return {
      scenarioId,
      scenarioLabel,
      nodesCount: scenario.nodesCount,
      ...(candidateNodeIds ? { candidateNodeCount: candidateNodeIds.length, candidateNodeIds } : {}),
      linksCount: scenario.linksCount,
      timeMs: scenario.timeMs,
      maximumCliqueSize,
      maximumCliqueCount: maximumCliques.length,
      maximumCliques,
      maximumCliqueNodeIds
    };
  });

  const totalOptimalAnswerSetCount = normalizedScenarios.reduce(
    (total, scenario) => total + scenario.maximumCliqueCount,
    0
  );
  const answerSetCounts = new Map<string, number>();
  const scenarioSupport = new Map<string, string[]>();
  const candidateScenarioSupport = new Map<string, string[]>();

  for (const scenario of normalizedScenarios) {
    if (scenario.candidateNodeIds) {
      for (const nodeId of scenario.candidateNodeIds) {
        const scenarioIds = candidateScenarioSupport.get(nodeId) ?? [];
        scenarioIds.push(scenario.scenarioId);
        candidateScenarioSupport.set(nodeId, scenarioIds);
      }
    }
    const nodesInScenario = new Set<string>();
    for (const clique of scenario.maximumCliques) {
      for (const nodeId of clique) {
        answerSetCounts.set(nodeId, (answerSetCounts.get(nodeId) ?? 0) + 1);
        nodesInScenario.add(nodeId);
      }
    }
    for (const nodeId of nodesInScenario) {
      const scenarioIds = scenarioSupport.get(nodeId) ?? [];
      scenarioIds.push(scenario.scenarioId);
      scenarioSupport.set(nodeId, scenarioIds);
    }
  }

  const membershipNodeIds = candidateDomainDeclared
    ? [...candidateScenarioSupport.keys()]
    : [...answerSetCounts.keys()];
  const memberships = membershipNodeIds
    .sort(compareIds)
    .map((nodeId) => {
      const optimalAnswerSetCount = answerSetCounts.get(nodeId) ?? 0;
      const scenarioIds = scenarioSupport.get(nodeId) ?? [];
      return {
        nodeId,
        ...(candidateDomainDeclared ? {
          candidateScenarioSupportCount: candidateScenarioSupport.get(nodeId)?.length ?? 0,
          candidateScenarioIds: candidateScenarioSupport.get(nodeId) ?? []
        } : {}),
        scenarioSupportCount: scenarioIds.length,
        scenarioIds,
        optimalAnswerSetCount,
        totalOptimalAnswerSetCount,
        stableAcrossEveryOptimalAnswerSet: optimalAnswerSetCount === totalOptimalAnswerSetCount
      };
    });
  const stableNodeIds = memberships
    .filter((membership) => membership.stableAcrossEveryOptimalAnswerSet)
    .map((membership) => membership.nodeId);
  const nonUniversalNodeIds = memberships
    .filter((membership) => !membership.stableAcrossEveryOptimalAnswerSet)
    .map((membership) => membership.nodeId);

  return {
    worldAssumption,
    scenarioCount: normalizedScenarios.length,
    totalOptimalAnswerSetCount,
    stableNodeIds,
    nonUniversalNodeIds,
    scenarios: normalizedScenarios.map(({ maximumCliques: _maximumCliques, candidateNodeIds: _candidateNodeIds, ...scenario }) => scenario),
    memberships
  };
}

/**
 * Summarizes exact maximum-clique answer sets over declared provenance
 * projections. The optional finite-world interpretation is conditional on an
 * explicit analyst assertion that the configured scenario list is exhaustive.
 */
export function summarizeProvenanceScenarioMaximumCliques(
  scenarioInputs: readonly ScenarioMaximumCliqueInput[],
  worldAssumption: ProvenanceScenarioWorldAssumption = "declared-projections"
): ProvenanceScenarioCliqueComparison {
  return summarizeMaximumNodeSetScenarios(scenarioInputs, "clique", worldAssumption);
}

export function buildProvenanceScenarioCliqueCsv(
  comparison: ProvenanceScenarioCliqueComparison,
  nodeLabels: Record<string, string> = {},
  selectedGroup = "",
  confidenceThreshold: number | null = null,
  timelineWindow = "",
  viewFilters: { types?: readonly string[]; groups?: readonly string[] } = {}
): string {
  const viewTypeFilters = JSON.stringify([...(viewFilters.types ?? [])].sort(compareIds));
  const viewGroupFilters = JSON.stringify([...(viewFilters.groups ?? [])].sort(compareIds));
  const exhaustiveWorlds = comparison.worldAssumption === "finite-exhaustive-worlds";
  const header = [
    "record_type", "scenario_id", "scenario_label", "candidate_nodes_in_scenario",
    "projected_edges", "maximum_clique_size", "maximum_clique_count", "solver_time_ms",
    "selected_group", "confidence_threshold", "timeline_window",
    "view_type_filters_json", "view_group_filters_json", "node_id", "node_label",
    "scenario_support_count", "scenario_ids_json", "optimal_answer_set_count",
    "total_optimal_answer_set_count", "membership_status", "projected_nodes",
    "candidate_scenario_count", "candidate_scenario_ids_json"
  ];
  if (exhaustiveWorlds) header.push("world_assumption", "brave_cautious_status");
  const rows: unknown[][] = [header];
  for (const scenario of comparison.scenarios) {
    const row: unknown[] = [
      "scenario", scenario.scenarioId, scenario.scenarioLabel,
      scenario.candidateNodeCount ?? "", scenario.linksCount, scenario.maximumCliqueSize,
      scenario.maximumCliqueCount, scenario.timeMs.toFixed(2), selectedGroup,
      confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      "", "", "", "", "", "", "", scenario.nodesCount, "", ""
    ];
    if (exhaustiveWorlds) row.push("finite-exhaustive-worlds", "");
    rows.push(row);
  }
  for (const membership of comparison.memberships) {
    const row: unknown[] = [
      "node_membership", "", "", "", "", "", "", "", selectedGroup,
      confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      membership.nodeId, nodeLabels[membership.nodeId] ?? membership.nodeId,
      membership.scenarioSupportCount, JSON.stringify(membership.scenarioIds),
      membership.optimalAnswerSetCount, membership.totalOptimalAnswerSetCount,
      membership.stableAcrossEveryOptimalAnswerSet
        ? "universal"
        : membership.optimalAnswerSetCount === 0 ? "never-selected" : "non-universal",
      "", membership.candidateScenarioSupportCount ?? "",
      membership.candidateScenarioIds === undefined ? "" : JSON.stringify(membership.candidateScenarioIds)
    ];
    if (exhaustiveWorlds) {
      row.push(
        "finite-exhaustive-worlds",
        membership.stableAcrossEveryOptimalAnswerSet
          ? "brave-and-cautious"
          : membership.optimalAnswerSetCount === 0 ? "not-brave" : "brave-only"
      );
    }
    rows.push(row);
  }
  return serializeCsv(rows);
}

/**
 * Compares membership in every maximum s-plex answer set across a finite,
 * explicitly declared collection of provenance projections. Candidate nodes
 * with no optimal witness remain visible with zero support.
 */
export function summarizeProvenanceScenarioMaximumKPlexes(
  scenarioInputs: readonly ScenarioMaximumKPlexInput[],
  s: number,
  worldAssumption: ProvenanceScenarioWorldAssumption = "declared-projections"
): ProvenanceScenarioKPlexComparison {
  validateWorldAssumption(worldAssumption);
  if (!Number.isSafeInteger(s) || s < 1) {
    throw new RangeError("s deve essere un intero maggiore o uguale a 1");
  }

  const candidatesByScenario = new Map<string, string[]>();
  for (const scenario of scenarioInputs) {
    const scenarioId = typeof scenario.scenarioId === "string" ? scenario.scenarioId.trim() : "";
    if (!Array.isArray(scenario.candidateNodeIds)) {
      throw new TypeError(`Dominio candidato k-plex non valido nello scenario '${scenarioId || "?"}'`);
    }
    const candidateNodeIds = scenario.candidateNodeIds.filter((nodeId): nodeId is string =>
      typeof nodeId === "string" && nodeId.trim() !== ""
    );
    if (candidateNodeIds.length !== scenario.candidateNodeIds.length ||
      new Set(candidateNodeIds).size !== candidateNodeIds.length ||
      candidateNodeIds.length > scenario.nodesCount) {
      throw new TypeError(`Dominio candidato k-plex non valido nello scenario '${scenarioId || "?"}'`);
    }
    candidatesByScenario.set(scenarioId, [...candidateNodeIds]);
  }

  const maximumSetComparison = summarizeMaximumNodeSetScenarios(
    scenarioInputs.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      scenarioLabel: scenario.scenarioLabel,
      nodesCount: scenario.nodesCount,
      linksCount: scenario.linksCount,
      timeMs: scenario.timeMs,
      maximumCliques: scenario.maximumKPlexes
    })),
    "k-plex"
  );
  const maximumNodeIdsByScenario = new Map<string, Set<string>>();
  const candidateScenarioIdsByNode = new Map<string, string[]>();
  const candidateNodeIds = new Set<string>();

  for (const scenario of scenarioInputs) {
    const scenarioId = scenario.scenarioId.trim();
    const candidates = candidatesByScenario.get(scenarioId) ?? [];
    const candidateSet = new Set(candidates);
    const maximumKPlexes = scenario.maximumKPlexes
      .map((nodeIds) => normalizeNodeSet(nodeIds))
      .filter((nodeIds): nodeIds is string[] => nodeIds !== null);
    if (maximumKPlexes.some((nodeIds) => nodeIds.some((nodeId) => !candidateSet.has(nodeId)))) {
      throw new TypeError(`Un k-plex ottimo contiene nodi fuori dal dominio candidato dello scenario '${scenarioId}'`);
    }
    const summary = maximumSetComparison.scenarios.find((item) => item.scenarioId === scenarioId);
    if (!summary) throw new TypeError(`Scenario k-plex '${scenarioId}' non valido`);
    const maxSize = summary.maximumCliqueSize;
    const uniqueMaximumSets = new Map<string, string[]>();
    for (const nodeIds of maximumKPlexes) {
      if (nodeIds.length !== maxSize) continue;
      uniqueMaximumSets.set(JSON.stringify(nodeIds), nodeIds);
    }
    maximumNodeIdsByScenario.set(scenarioId, new Set([...uniqueMaximumSets.values()].flat()));
    for (const nodeId of candidates) {
      candidateNodeIds.add(nodeId);
      const scenarioIds = candidateScenarioIdsByNode.get(nodeId) ?? [];
      scenarioIds.push(scenarioId);
      candidateScenarioIdsByNode.set(nodeId, scenarioIds);
    }
  }

  const maximumMembershipByNode = new Map(
    maximumSetComparison.memberships.map((membership) => [membership.nodeId, membership])
  );
  const memberships: ProvenanceScenarioKPlexMembership[] = [...candidateNodeIds]
    .sort(compareIds)
    .map((nodeId) => {
      const candidateScenarioIds = candidateScenarioIdsByNode.get(nodeId) ?? [];
      const selected = maximumMembershipByNode.get(nodeId);
      const scenarioIds = scenarioInputs
        .filter((scenario) => maximumNodeIdsByScenario.get(scenario.scenarioId.trim())?.has(nodeId))
        .map((scenario) => scenario.scenarioId.trim());
      const optimalAnswerSetCount = selected?.optimalAnswerSetCount ?? 0;
      return {
        nodeId,
        candidateScenarioSupportCount: candidateScenarioIds.length,
        candidateScenarioIds,
        scenarioSupportCount: scenarioIds.length,
        scenarioIds,
        optimalAnswerSetCount,
        totalOptimalAnswerSetCount: maximumSetComparison.totalOptimalAnswerSetCount,
        stableAcrossEveryOptimalAnswerSet:
          optimalAnswerSetCount === maximumSetComparison.totalOptimalAnswerSetCount
      };
    });
  const stableNodeIds = memberships
    .filter((membership) => membership.stableAcrossEveryOptimalAnswerSet)
    .map((membership) => membership.nodeId);
  const nonUniversalNodeIds = memberships
    .filter((membership) => !membership.stableAcrossEveryOptimalAnswerSet)
    .map((membership) => membership.nodeId);

  const scenarioById = new Map(maximumSetComparison.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  return {
    ...(worldAssumption === "finite-exhaustive-worlds" ? { worldAssumption } : {}),
    scenarioCount: maximumSetComparison.scenarioCount,
    s,
    totalOptimalAnswerSetCount: maximumSetComparison.totalOptimalAnswerSetCount,
    stableNodeIds,
    nonUniversalNodeIds,
    scenarios: scenarioInputs.map((scenario) => {
      const scenarioId = scenario.scenarioId.trim();
      const summary = scenarioById.get(scenarioId)!;
      return {
        scenarioId,
        scenarioLabel: summary.scenarioLabel,
        nodesCount: summary.nodesCount,
        candidateNodeCount: candidatesByScenario.get(scenarioId)?.length ?? 0,
        linksCount: summary.linksCount,
        timeMs: summary.timeMs,
        maximumKPlexSize: summary.maximumCliqueSize,
        maximumKPlexCount: summary.maximumCliqueCount,
        maximumKPlexNodeIds: summary.maximumCliqueNodeIds
      };
    }),
    memberships
  };
}

/**
 * Compares the unique k-core membership over a finite, explicitly declared
 * collection of provenance projections. This is deterministic scenario
 * stability; it does not attach probabilities or epistemic semantics.
 */
export function summarizeProvenanceScenarioKCores(
  scenarioInputs: readonly ScenarioKCoreInput[],
  k: number,
  degreeMode: ProvenanceScenarioKCoreComparison["degreeMode"] = "undirected",
  worldAssumption: ProvenanceScenarioWorldAssumption = "declared-projections"
): ProvenanceScenarioKCoreComparison {
  validateWorldAssumption(worldAssumption);
  if (!Number.isSafeInteger(k) || k < 0) {
    throw new RangeError("k deve essere un intero non negativo");
  }
  if (degreeMode !== "undirected" && degreeMode !== "in" && degreeMode !== "out" && degreeMode !== "mutual") {
    throw new TypeError("La modalità del k-core non è valida");
  }
  if (scenarioInputs.length === 0) {
    throw new TypeError("È necessario almeno uno scenario di provenienza");
  }

  const seenScenarioIds = new Set<string>();
  const scenarioSummaries = scenarioInputs.map((scenario) => {
    const scenarioId = typeof scenario.scenarioId === "string" ? scenario.scenarioId.trim() : "";
    if (!scenarioId || seenScenarioIds.has(scenarioId)) {
      throw new TypeError("Gli ID degli scenari devono essere non vuoti e univoci");
    }
    seenScenarioIds.add(scenarioId);

    if (!Number.isSafeInteger(scenario.nodesCount) || scenario.nodesCount < 0 ||
      !Number.isSafeInteger(scenario.linksCount) || scenario.linksCount < 0 ||
      !Number.isFinite(scenario.timeMs) || scenario.timeMs < 0 ||
      !Array.isArray(scenario.candidateNodeIds) || !Array.isArray(scenario.coreNodeIds)) {
      throw new TypeError(`Statistiche non valide per lo scenario '${scenarioId}'`);
    }
    const candidateNodeIds = scenario.candidateNodeIds.map((nodeId) =>
      typeof nodeId === "string" ? nodeId.trim() : ""
    );
    if (candidateNodeIds.some((nodeId) => nodeId === "") || new Set(candidateNodeIds).size !== candidateNodeIds.length ||
      candidateNodeIds.length > scenario.nodesCount) {
      throw new TypeError(`Dominio candidato k-core non valido nello scenario '${scenarioId}'`);
    }
    const coreNodeIds = scenario.coreNodeIds.map((nodeId) =>
      typeof nodeId === "string" ? nodeId.trim() : ""
    );
    if (coreNodeIds.length > candidateNodeIds.length) {
      throw new TypeError(`Il k-core supera il dominio candidato dello scenario '${scenarioId}'`);
    }
    const candidateSet = new Set(candidateNodeIds);
    if (coreNodeIds.some((nodeId) => nodeId === "" || !candidateSet.has(nodeId)) ||
      new Set(coreNodeIds).size !== coreNodeIds.length) {
      throw new TypeError(`Membership k-core non valida nello scenario '${scenarioId}'`);
    }
    if (coreNodeIds.length > scenario.nodesCount) {
      throw new TypeError(`Il k-core supera il numero di nodi candidati nello scenario '${scenarioId}'`);
    }

    return {
      scenarioId,
      scenarioLabel: typeof scenario.scenarioLabel === "string" && scenario.scenarioLabel.trim()
        ? scenario.scenarioLabel.trim()
        : scenarioId,
      nodesCount: scenario.nodesCount,
      candidateNodeCount: candidateNodeIds.length,
      linksCount: scenario.linksCount,
      timeMs: scenario.timeMs,
      candidateNodeIds: [...candidateNodeIds].sort(compareIds),
      coreSize: coreNodeIds.length,
      coreNodeIds: [...coreNodeIds].sort(compareIds)
    };
  });

  const supportByNode = new Map<string, string[]>();
  const candidateSupportByNode = new Map<string, string[]>();
  for (const scenario of scenarioSummaries) {
    for (const nodeId of scenario.candidateNodeIds) {
      const scenarioIds = candidateSupportByNode.get(nodeId) ?? [];
      scenarioIds.push(scenario.scenarioId);
      candidateSupportByNode.set(nodeId, scenarioIds);
    }
    for (const nodeId of scenario.coreNodeIds) {
      const scenarioIds = supportByNode.get(nodeId) ?? [];
      scenarioIds.push(scenario.scenarioId);
      supportByNode.set(nodeId, scenarioIds);
    }
  }

  const memberships = [...candidateSupportByNode.keys()]
    .sort(compareIds)
    .map((nodeId) => {
      const scenarioIds = supportByNode.get(nodeId) ?? [];
      const candidateScenarioIds = candidateSupportByNode.get(nodeId) ?? [];
      return {
        nodeId,
        candidateScenarioSupportCount: candidateScenarioIds.length,
        candidateScenarioIds,
        scenarioSupportCount: scenarioIds.length,
        scenarioIds,
        stableAcrossEveryScenario: scenarioIds.length === scenarioSummaries.length,
        stableAcrossEveryEligibleScenario: candidateScenarioIds.length > 0 &&
          scenarioIds.length === candidateScenarioIds.length
      };
    });
  const stableNodeIds = memberships
    .filter((membership) => membership.stableAcrossEveryScenario)
    .map((membership) => membership.nodeId);
  const nonUniversalNodeIds = memberships
    .filter((membership) => !membership.stableAcrossEveryScenario)
    .map((membership) => membership.nodeId);

  return {
    ...(worldAssumption === "finite-exhaustive-worlds" ? { worldAssumption } : {}),
    scenarioCount: scenarioSummaries.length,
    k,
    degreeMode,
    stableNodeIds,
    nonUniversalNodeIds,
    scenarios: scenarioSummaries.map(({ coreNodeIds: _coreNodeIds, candidateNodeIds: _candidateNodeIds, ...scenario }) => scenario),
    memberships
  };
}

export function buildProvenanceScenarioKCoreCsv(
  comparison: ProvenanceScenarioKCoreComparison,
  nodeLabels: Record<string, string> = {},
  selectedGroup = "",
  confidenceThreshold: number | null = null,
  timelineWindow = "",
  viewFilters: { types?: readonly string[]; groups?: readonly string[] } = {}
): string {
  const viewTypeFilters = JSON.stringify([...(viewFilters.types ?? [])].sort(compareIds));
  const viewGroupFilters = JSON.stringify([...(viewFilters.groups ?? [])].sort(compareIds));
  const exhaustiveWorlds = comparison.worldAssumption === "finite-exhaustive-worlds";
  const header: unknown[] = [
    "record_type", "scenario_id", "scenario_label", "k", "degree_mode",
    "candidate_nodes", "projected_nodes", "projected_edges", "core_size", "solver_time_ms",
    "selected_group", "confidence_threshold", "timeline_window",
    "view_type_filters_json", "view_group_filters_json",
    "node_id", "node_label", "candidate_scenario_count", "candidate_scenario_ids_json",
    "scenario_support_count", "scenario_ids_json", "membership_status"
  ];
  if (exhaustiveWorlds) header.push("world_assumption", "brave_cautious_status");
  const rows: unknown[][] = [header];
  for (const scenario of comparison.scenarios) {
    const row: unknown[] = [
      "scenario", scenario.scenarioId, scenario.scenarioLabel,
      comparison.k, comparison.degreeMode,
      scenario.candidateNodeCount, scenario.nodesCount, scenario.linksCount, scenario.coreSize, scenario.timeMs.toFixed(2),
      selectedGroup, confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      "", "", "", "", "", "", "", ""
    ];
    if (exhaustiveWorlds) row.push("finite-exhaustive-worlds", "");
    rows.push(row);
  }
  for (const membership of comparison.memberships) {
    const row: unknown[] = [
      "node_membership", "", "", comparison.k, comparison.degreeMode,
      "", "", "", "", "", selectedGroup, confidenceThreshold ?? "", timelineWindow,
      viewTypeFilters, viewGroupFilters,
      membership.nodeId, nodeLabels[membership.nodeId] ?? membership.nodeId,
      membership.candidateScenarioSupportCount, JSON.stringify(membership.candidateScenarioIds),
      membership.scenarioSupportCount, JSON.stringify(membership.scenarioIds),
      membership.stableAcrossEveryScenario
        ? "universal"
        : membership.scenarioSupportCount === 0
          ? "never-selected"
          : membership.stableAcrossEveryEligibleScenario ? "eligible-universal" : "non-universal"
    ];
    if (exhaustiveWorlds) {
      row.push(
        "finite-exhaustive-worlds",
        membership.stableAcrossEveryScenario
          ? "brave-and-cautious"
          : membership.scenarioSupportCount === 0 ? "not-brave" : "brave-only"
      );
    }
    rows.push(row);
  }
  return serializeCsv(rows);
}

export function buildProvenanceScenarioKPlexCsv(
  comparison: ProvenanceScenarioKPlexComparison,
  nodeLabels: Record<string, string> = {},
  selectedGroup = "",
  confidenceThreshold: number | null = null,
  timelineWindow = "",
  viewFilters: { types?: readonly string[]; groups?: readonly string[] } = {}
): string {
  const viewTypeFilters = JSON.stringify([...(viewFilters.types ?? [])].sort(compareIds));
  const viewGroupFilters = JSON.stringify([...(viewFilters.groups ?? [])].sort(compareIds));
  const exhaustiveWorlds = comparison.worldAssumption === "finite-exhaustive-worlds";
  const header: unknown[] = [
    "record_type", "scenario_id", "scenario_label", "s", "candidate_nodes",
    "projected_nodes", "projected_edges", "maximum_k_plex_size", "maximum_k_plex_count",
    "maximum_k_plex_node_ids_json", "solver_time_ms", "selected_group",
    "confidence_threshold", "timeline_window", "view_type_filters_json",
    "view_group_filters_json", "node_id", "node_label",
    "candidate_scenario_count", "candidate_scenario_ids_json", "scenario_support_count",
    "scenario_ids_json", "optimal_answer_set_count", "total_optimal_answer_set_count",
    "membership_status"
  ];
  if (exhaustiveWorlds) header.push("world_assumption", "brave_cautious_status");
  const rows: unknown[][] = [header];
  for (const scenario of comparison.scenarios) {
    const row: unknown[] = [
      "scenario", scenario.scenarioId, scenario.scenarioLabel, comparison.s,
      scenario.candidateNodeCount, scenario.nodesCount, scenario.linksCount,
      scenario.maximumKPlexSize, scenario.maximumKPlexCount,
      JSON.stringify(scenario.maximumKPlexNodeIds), scenario.timeMs.toFixed(2),
      selectedGroup, confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      "", "", "", "", "", "", "", "", ""
    ];
    if (exhaustiveWorlds) row.push("finite-exhaustive-worlds", "");
    rows.push(row);
  }
  for (const membership of comparison.memberships) {
    const row: unknown[] = [
      "node_membership", "", "", comparison.s, "", "", "", "", "", "", "",
      selectedGroup, confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      membership.nodeId, nodeLabels[membership.nodeId] ?? membership.nodeId,
      membership.candidateScenarioSupportCount, JSON.stringify(membership.candidateScenarioIds),
      membership.scenarioSupportCount, JSON.stringify(membership.scenarioIds),
      membership.optimalAnswerSetCount, membership.totalOptimalAnswerSetCount,
      membership.stableAcrossEveryOptimalAnswerSet
        ? "universal"
        : membership.optimalAnswerSetCount === 0 ? "never-selected" : "non-universal"
    ];
    if (exhaustiveWorlds) {
      row.push(
        "finite-exhaustive-worlds",
        membership.stableAcrossEveryOptimalAnswerSet
          ? "brave-and-cautious"
          : membership.optimalAnswerSetCount === 0 ? "not-brave" : "brave-only"
      );
    }
    rows.push(row);
  }
  return serializeCsv(rows);
}

export type ProvenanceScenarioComponentTask = "components" | "weakComponents" | "strongComponents";

export interface ScenarioComponentPartitionInput {
  scenarioId: string;
  scenarioLabel?: string;
  projectedNodeCount: number;
  linksCount: number;
  timeMs: number;
  candidateNodeIds: string[];
  components: string[][];
}

export interface ProvenanceScenarioComponentSummary {
  scenarioId: string;
  scenarioLabel: string;
  projectedNodeCount: number;
  candidateNodeCount: number;
  linksCount: number;
  timeMs: number;
  componentCount: number;
  targetEligible: boolean;
  targetComponentSize: number;
  targetComponentNodeIds: string[];
}

export interface ProvenanceScenarioComponentMembership {
  nodeId: string;
  candidateScenarioCount: number;
  candidateScenarioIds: string[];
  comparableScenarioCount: number;
  comparableScenarioIds: string[];
  sameComponentScenarioCount: number;
  sameComponentScenarioIds: string[];
  separateComponentScenarioIds: string[];
  sameComponentInEveryComparableScenario: boolean;
  sameComponentInEveryDeclaredScenario: boolean;
}

export interface ProvenanceScenarioComponentComparison {
  worldAssumption?: ProvenanceScenarioWorldAssumption;
  scenarioCount: number;
  task: ProvenanceScenarioComponentTask;
  targetNodeId: string;
  targetEligibleScenarioCount: number;
  universallySameComponentNodeIds: string[];
  conditionallySameComponentNodeIds: string[];
  memberships: ProvenanceScenarioComponentMembership[];
  scenarios: ProvenanceScenarioComponentSummary[];
}

/**
 * Compares the partition induced by one deterministic ASP component task over
 * a finite, explicitly declared set of provenance projections. Membership is
 * compared only in scenarios where both the reference and the node are in the
 * candidate domain; missing eligibility is reported separately from a
 * different component.
 */
export function summarizeProvenanceScenarioComponents(
  scenarioInputs: readonly ScenarioComponentPartitionInput[],
  task: ProvenanceScenarioComponentTask,
  targetNodeId: string,
  worldAssumption: ProvenanceScenarioWorldAssumption = "declared-projections"
): ProvenanceScenarioComponentComparison {
  validateWorldAssumption(worldAssumption);
  if (task !== "components" && task !== "weakComponents" && task !== "strongComponents") {
    throw new TypeError("Il task di componenti non è valido");
  }
  const targetId = typeof targetNodeId === "string" ? targetNodeId.trim() : "";
  if (!targetId) throw new TypeError("Il nodo di riferimento deve avere un ID non vuoto");
  if (scenarioInputs.length === 0) {
    throw new TypeError("È necessario almeno uno scenario di provenienza");
  }

  const seenScenarioIds = new Set<string>();
  const normalizedScenarios = scenarioInputs.map((scenario) => {
    const scenarioId = typeof scenario.scenarioId === "string" ? scenario.scenarioId.trim() : "";
    if (!scenarioId || seenScenarioIds.has(scenarioId)) {
      throw new TypeError("Gli ID degli scenari devono essere non vuoti e univoci");
    }
    seenScenarioIds.add(scenarioId);

    if (!Number.isSafeInteger(scenario.projectedNodeCount) || scenario.projectedNodeCount < 0 ||
      !Number.isSafeInteger(scenario.linksCount) || scenario.linksCount < 0 ||
      !Number.isFinite(scenario.timeMs) || scenario.timeMs < 0 ||
      !Array.isArray(scenario.candidateNodeIds) || !Array.isArray(scenario.components)) {
      throw new TypeError(`Statistiche o partizione non valide per lo scenario '${scenarioId}'`);
    }
    const candidateNodeIds = scenario.candidateNodeIds.map((nodeId) =>
      typeof nodeId === "string" ? nodeId.trim() : ""
    );
    if (candidateNodeIds.some((nodeId) => nodeId === "") ||
      new Set(candidateNodeIds).size !== candidateNodeIds.length ||
      candidateNodeIds.length > scenario.projectedNodeCount) {
      throw new TypeError(`Dominio candidato non valido nello scenario '${scenarioId}'`);
    }

    const candidateSet = new Set(candidateNodeIds);
    const partitionNodeIds = new Set<string>();
    const components = scenario.components.map((rawComponent) => {
      const component = normalizeNodeSet(rawComponent);
      if (!component || component.length !== rawComponent.length || component.length === 0 ||
        component.some((nodeId) => !candidateSet.has(nodeId) || partitionNodeIds.has(nodeId))) {
        throw new TypeError(`Componente ASP non valida nello scenario '${scenarioId}'`);
      }
      for (const nodeId of component) partitionNodeIds.add(nodeId);
      return component;
    }).sort((left, right) => compareIds(left[0] ?? "", right[0] ?? ""));
    if (partitionNodeIds.size !== candidateSet.size ||
      [...candidateSet].some((nodeId) => !partitionNodeIds.has(nodeId))) {
      throw new TypeError(`La partizione ASP non copre esattamente il dominio candidato dello scenario '${scenarioId}'`);
    }

    const targetComponentNodeIds = components.find((component) => component.includes(targetId)) ?? [];
    return {
      scenarioId,
      scenarioLabel: typeof scenario.scenarioLabel === "string" && scenario.scenarioLabel.trim()
        ? scenario.scenarioLabel.trim()
        : scenarioId,
      projectedNodeCount: scenario.projectedNodeCount,
      candidateNodeCount: candidateNodeIds.length,
      linksCount: scenario.linksCount,
      timeMs: scenario.timeMs,
      componentCount: components.length,
      candidateNodeIds: [...candidateNodeIds].sort(compareIds),
      components,
      targetEligible: candidateSet.has(targetId),
      targetComponentSize: targetComponentNodeIds.length,
      targetComponentNodeIds
    };
  });

  const candidateScenarioIdsByNode = new Map<string, string[]>();
  const sameComponentScenarioIdsByNode = new Map<string, string[]>();
  const comparableScenarioIdsByNode = new Map<string, string[]>();
  const separateComponentScenarioIdsByNode = new Map<string, string[]>();
  const nodesByScenario = normalizedScenarios.map((scenario) => new Set(scenario.candidateNodeIds));

  normalizedScenarios.forEach((scenario, index) => {
    const candidateSet = nodesByScenario[index];
    for (const nodeId of candidateSet) {
      const candidateScenarioIds = candidateScenarioIdsByNode.get(nodeId) ?? [];
      candidateScenarioIds.push(scenario.scenarioId);
      candidateScenarioIdsByNode.set(nodeId, candidateScenarioIds);
    }
    if (!scenario.targetEligible) return;
    const targetComponent = new Set(scenario.targetComponentNodeIds);
    for (const nodeId of candidateSet) {
      if (nodeId === targetId) continue;
      const comparableScenarioIds = comparableScenarioIdsByNode.get(nodeId) ?? [];
      comparableScenarioIds.push(scenario.scenarioId);
      comparableScenarioIdsByNode.set(nodeId, comparableScenarioIds);
      const sameComponentScenarioIds = targetComponent.has(nodeId)
        ? sameComponentScenarioIdsByNode.get(nodeId) ?? []
        : null;
      if (sameComponentScenarioIds) {
        sameComponentScenarioIds.push(scenario.scenarioId);
        sameComponentScenarioIdsByNode.set(nodeId, sameComponentScenarioIds);
      } else {
        const separateScenarioIds = separateComponentScenarioIdsByNode.get(nodeId) ?? [];
        separateScenarioIds.push(scenario.scenarioId);
        separateComponentScenarioIdsByNode.set(nodeId, separateScenarioIds);
      }
    }
  });

  const memberships = [...candidateScenarioIdsByNode.keys()]
    .filter((nodeId) => nodeId !== targetId)
    .sort(compareIds)
    .map((nodeId) => {
      const candidateScenarioIds = candidateScenarioIdsByNode.get(nodeId) ?? [];
      const comparableScenarioIds = comparableScenarioIdsByNode.get(nodeId) ?? [];
      const sameComponentScenarioIds = sameComponentScenarioIdsByNode.get(nodeId) ?? [];
      const separateComponentScenarioIds = separateComponentScenarioIdsByNode.get(nodeId) ?? [];
      return {
        nodeId,
        candidateScenarioCount: candidateScenarioIds.length,
        candidateScenarioIds,
        comparableScenarioCount: comparableScenarioIds.length,
        comparableScenarioIds,
        sameComponentScenarioCount: sameComponentScenarioIds.length,
        sameComponentScenarioIds,
        separateComponentScenarioIds,
        sameComponentInEveryComparableScenario: comparableScenarioIds.length > 0 &&
          sameComponentScenarioIds.length === comparableScenarioIds.length,
        sameComponentInEveryDeclaredScenario: comparableScenarioIds.length === normalizedScenarios.length &&
          sameComponentScenarioIds.length === normalizedScenarios.length
      };
    });

  const universallySameComponentNodeIds = memberships
    .filter((membership) => membership.sameComponentInEveryDeclaredScenario)
    .map((membership) => membership.nodeId);
  const conditionallySameComponentNodeIds = memberships
    .filter((membership) => membership.sameComponentInEveryComparableScenario &&
      !membership.sameComponentInEveryDeclaredScenario)
    .map((membership) => membership.nodeId);

  return {
    ...(worldAssumption === "finite-exhaustive-worlds" ? { worldAssumption } : {}),
    scenarioCount: normalizedScenarios.length,
    task,
    targetNodeId: targetId,
    targetEligibleScenarioCount: normalizedScenarios.filter((scenario) => scenario.targetEligible).length,
    universallySameComponentNodeIds,
    conditionallySameComponentNodeIds,
    memberships,
    scenarios: normalizedScenarios.map(({ candidateNodeIds: _candidateNodeIds, components: _components, ...scenario }) => scenario)
  };
}

export function buildProvenanceScenarioComponentsCsv(
  comparison: ProvenanceScenarioComponentComparison,
  nodeLabels: Record<string, string> = {},
  selectedGroup = "",
  confidenceThreshold: number | null = null,
  timelineWindow = "",
  viewFilters: { types?: readonly string[]; groups?: readonly string[] } = {}
): string {
  const viewTypeFilters = JSON.stringify([...(viewFilters.types ?? [])].sort(compareIds));
  const viewGroupFilters = JSON.stringify([...(viewFilters.groups ?? [])].sort(compareIds));
  const exhaustiveWorlds = comparison.worldAssumption === "finite-exhaustive-worlds";
  const header: unknown[] = [
    "record_type", "task", "target_node_id", "target_node_label", "scenario_id", "scenario_label",
    "projected_nodes", "candidate_nodes", "projected_edges", "component_count",
    "target_eligible", "target_component_size", "solver_time_ms", "selected_group",
    "confidence_threshold", "timeline_window", "view_type_filters_json", "view_group_filters_json",
    "node_id", "node_label", "candidate_scenario_count", "candidate_scenario_ids_json",
    "comparable_scenario_count", "comparable_scenario_ids_json", "same_component_scenario_count",
    "same_component_scenario_ids_json", "separate_component_scenario_ids_json",
    "same_component_in_every_comparable_scenario", "same_component_in_every_declared_scenario"
  ];
  if (exhaustiveWorlds) header.push("world_assumption", "brave_cautious_status");
  const rows: unknown[][] = [header];
  for (const scenario of comparison.scenarios) {
    const row: unknown[] = [
      "scenario", comparison.task, comparison.targetNodeId,
      nodeLabels[comparison.targetNodeId] ?? comparison.targetNodeId,
      scenario.scenarioId, scenario.scenarioLabel, scenario.projectedNodeCount,
      scenario.candidateNodeCount, scenario.linksCount, scenario.componentCount,
      scenario.targetEligible, scenario.targetComponentSize, scenario.timeMs.toFixed(2),
      selectedGroup, confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      "", "", "", "", "", "", "", "", "", "", ""
    ];
    if (exhaustiveWorlds) row.push("finite-exhaustive-worlds", "");
    rows.push(row);
  }
  for (const membership of comparison.memberships) {
    const row: unknown[] = [
      "node_membership", comparison.task, comparison.targetNodeId,
      nodeLabels[comparison.targetNodeId] ?? comparison.targetNodeId,
      "", "", "", "", "", "", "", "", "", selectedGroup,
      confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      membership.nodeId, nodeLabels[membership.nodeId] ?? membership.nodeId,
      membership.candidateScenarioCount, JSON.stringify(membership.candidateScenarioIds),
      membership.comparableScenarioCount, JSON.stringify(membership.comparableScenarioIds),
      membership.sameComponentScenarioCount, JSON.stringify(membership.sameComponentScenarioIds),
      JSON.stringify(membership.separateComponentScenarioIds),
      membership.sameComponentInEveryComparableScenario,
      membership.sameComponentInEveryDeclaredScenario
    ];
    if (exhaustiveWorlds) {
      row.push(
        "finite-exhaustive-worlds",
        membership.sameComponentInEveryDeclaredScenario
          ? "brave-and-cautious"
          : membership.sameComponentScenarioCount > 0
            ? "brave-only"
            : membership.comparableScenarioCount === 0 ? "undefined-no-comparable-world" : "not-brave"
      );
    }
    rows.push(row);
  }
  return serializeCsv(rows);
}

export interface ScenarioMinimumDominatingSetInput {
  scenarioId: string;
  scenarioLabel?: string;
  projectedNodeCount: number;
  projectedNodeIds: string[];
  candidateNodeIds: string[];
  targetNodeIds: string[];
  linksCount: number;
  timeMs: number;
  minimumDominatingSets: string[][];
}

export interface ProvenanceScenarioMinimumDominatingSetSummary {
  scenarioId: string;
  scenarioLabel: string;
  projectedNodeCount: number;
  candidateNodeCount: number;
  targetNodeCount: number;
  linksCount: number;
  timeMs: number;
  minimumSetSize: number;
  minimumSetCount: number;
}

export interface ProvenanceScenarioDominatingSetMembership {
  nodeId: string;
  candidateScenarioCount: number;
  candidateScenarioIds: string[];
  optimalScenarioCount: number;
  optimalScenarioIds: string[];
  selectedMinimumSetCount: number;
  totalComparableMinimumSetCount: number;
  selectedInEveryComparableMinimumSet: boolean;
  selectedInEveryScenarioMinimumSet: boolean;
}

export interface ProvenanceScenarioDominatingSetComparison {
  worldAssumption?: ProvenanceScenarioWorldAssumption;
  scenarioCount: number;
  candidateGroup: string;
  targetGroup: string;
  totalMinimumSetCount: number;
  universallySelectedNodeIds: string[];
  conditionallySelectedNodeIds: string[];
  memberships: ProvenanceScenarioDominatingSetMembership[];
  scenarios: ProvenanceScenarioMinimumDominatingSetSummary[];
}

/**
 * Compares every minimum dominating set in each explicitly declared source
 * projection. Candidate eligibility is tracked separately from selection so a
 * node outside a scenario's candidate group is not treated as an omitted
 * optimum member.
 */
export function summarizeProvenanceScenarioDominatingSets(
  scenarioInputs: readonly ScenarioMinimumDominatingSetInput[],
  candidateGroup = "",
  targetGroup = "",
  worldAssumption: ProvenanceScenarioWorldAssumption = "declared-projections"
): ProvenanceScenarioDominatingSetComparison {
  validateWorldAssumption(worldAssumption);
  if (scenarioInputs.length === 0) {
    throw new TypeError("È necessario almeno uno scenario di provenienza");
  }

  const seenScenarioIds = new Set<string>();
  const normalizedScenarios = scenarioInputs.map((scenario) => {
    const scenarioId = typeof scenario.scenarioId === "string" ? scenario.scenarioId.trim() : "";
    if (!scenarioId || seenScenarioIds.has(scenarioId)) {
      throw new TypeError("Gli ID degli scenari devono essere non vuoti e univoci");
    }
    seenScenarioIds.add(scenarioId);
    if (!Number.isSafeInteger(scenario.projectedNodeCount) || scenario.projectedNodeCount < 0 ||
      !Number.isSafeInteger(scenario.linksCount) || scenario.linksCount < 0 ||
      !Number.isFinite(scenario.timeMs) || scenario.timeMs < 0 ||
      !Array.isArray(scenario.projectedNodeIds) || !Array.isArray(scenario.candidateNodeIds) || !Array.isArray(scenario.targetNodeIds) ||
      !Array.isArray(scenario.minimumDominatingSets)) {
      throw new TypeError(`Statistiche o soluzioni non valide per lo scenario '${scenarioId}'`);
    }

    const normalizeDomain = (nodeIds: string[], description: string) => {
      const normalized = nodeIds.map((nodeId) => typeof nodeId === "string" ? nodeId.trim() : "");
      if (normalized.some((nodeId) => nodeId === "") || new Set(normalized).size !== normalized.length) {
        throw new TypeError(`${description} non valido nello scenario '${scenarioId}'`);
      }
      return [...normalized].sort(compareIds);
    };
    const projectedNodeIds = normalizeDomain(scenario.projectedNodeIds, "Dominio proiettato");
    const candidateNodeIds = normalizeDomain(scenario.candidateNodeIds, "Dominio candidato");
    const targetNodeIds = normalizeDomain(scenario.targetNodeIds, "Dominio obiettivo");
    const projectedNodeSet = new Set(projectedNodeIds);
    if (projectedNodeIds.length !== scenario.projectedNodeCount ||
      candidateNodeIds.some((nodeId) => !projectedNodeSet.has(nodeId)) ||
      targetNodeIds.some((nodeId) => !projectedNodeSet.has(nodeId))) {
      throw new TypeError(`Domini candidati o obiettivo non validi nello scenario '${scenarioId}'`);
    }

    const candidateSet = new Set(candidateNodeIds);
    const minimumSetByKey = new Map<string, string[]>();
    for (const rawSet of scenario.minimumDominatingSets) {
      const nodeSet = normalizeNodeSet(rawSet);
      if (!nodeSet || nodeSet.length !== rawSet.length ||
        (nodeSet.length === 0 && targetNodeIds.length > 0) ||
        (nodeSet.length > 0 && targetNodeIds.length === 0) ||
        nodeSet.some((nodeId) => !candidateSet.has(nodeId))) {
        throw new TypeError(`Insieme dominante ASP non valido nello scenario '${scenarioId}'`);
      }
      minimumSetByKey.set(nodeSetKey(nodeSet), nodeSet);
    }
    const minimumDominatingSets = [...minimumSetByKey.values()]
      .sort((left, right) => compareIds(nodeSetKey(left), nodeSetKey(right)));
    if (minimumDominatingSets.length === 0) {
      throw new TypeError(`Nessun insieme dominante minimo completo nello scenario '${scenarioId}'`);
    }
    const minimumSetSize = minimumDominatingSets[0].length;
    if (minimumDominatingSets.some((nodeSet) => nodeSet.length !== minimumSetSize)) {
      throw new TypeError(`Gli insiemi ASP non hanno tutti la stessa cardinalità minima nello scenario '${scenarioId}'`);
    }

    return {
      scenarioId,
      scenarioLabel: typeof scenario.scenarioLabel === "string" && scenario.scenarioLabel.trim()
        ? scenario.scenarioLabel.trim()
        : scenarioId,
      projectedNodeCount: scenario.projectedNodeCount,
      candidateNodeCount: candidateNodeIds.length,
      targetNodeCount: targetNodeIds.length,
      linksCount: scenario.linksCount,
      timeMs: scenario.timeMs,
      candidateNodeIds,
      minimumDominatingSets,
      minimumSetSize
    };
  });

  const candidateScenarioIdsByNode = new Map<string, string[]>();
  const optimalScenarioIdsByNode = new Map<string, string[]>();
  const selectedMinimumSetCountByNode = new Map<string, number>();
  const totalComparableMinimumSetCountByNode = new Map<string, number>();
  const totalMinimumSetCount = normalizedScenarios.reduce(
    (total, scenario) => total + scenario.minimumDominatingSets.length,
    0
  );

  for (const scenario of normalizedScenarios) {
    const selectedByNode = new Map<string, number>();
    for (const nodeSet of scenario.minimumDominatingSets) {
      for (const nodeId of nodeSet) selectedByNode.set(nodeId, (selectedByNode.get(nodeId) ?? 0) + 1);
    }
    for (const nodeId of scenario.candidateNodeIds) {
      const candidateScenarioIds = candidateScenarioIdsByNode.get(nodeId) ?? [];
      candidateScenarioIds.push(scenario.scenarioId);
      candidateScenarioIdsByNode.set(nodeId, candidateScenarioIds);
      totalComparableMinimumSetCountByNode.set(
        nodeId,
        (totalComparableMinimumSetCountByNode.get(nodeId) ?? 0) + scenario.minimumDominatingSets.length
      );
      const selectedCount = selectedByNode.get(nodeId) ?? 0;
      if (selectedCount > 0) {
        const optimalScenarioIds = optimalScenarioIdsByNode.get(nodeId) ?? [];
        optimalScenarioIds.push(scenario.scenarioId);
        optimalScenarioIdsByNode.set(nodeId, optimalScenarioIds);
      }
      selectedMinimumSetCountByNode.set(
        nodeId,
        (selectedMinimumSetCountByNode.get(nodeId) ?? 0) + selectedCount
      );
    }
  }

  const memberships = [...candidateScenarioIdsByNode.keys()].sort(compareIds).map((nodeId) => {
    const candidateScenarioIds = candidateScenarioIdsByNode.get(nodeId) ?? [];
    const optimalScenarioIds = optimalScenarioIdsByNode.get(nodeId) ?? [];
    const selectedMinimumSetCount = selectedMinimumSetCountByNode.get(nodeId) ?? 0;
    const totalComparableMinimumSetCount = totalComparableMinimumSetCountByNode.get(nodeId) ?? 0;
    const selectedInEveryComparableMinimumSet = totalComparableMinimumSetCount > 0 &&
      selectedMinimumSetCount === totalComparableMinimumSetCount;
    return {
      nodeId,
      candidateScenarioCount: candidateScenarioIds.length,
      candidateScenarioIds,
      optimalScenarioCount: optimalScenarioIds.length,
      optimalScenarioIds,
      selectedMinimumSetCount,
      totalComparableMinimumSetCount,
      selectedInEveryComparableMinimumSet,
      selectedInEveryScenarioMinimumSet: candidateScenarioIds.length === normalizedScenarios.length &&
        selectedInEveryComparableMinimumSet
    };
  });

  return {
    ...(worldAssumption === "finite-exhaustive-worlds" ? { worldAssumption } : {}),
    scenarioCount: normalizedScenarios.length,
    candidateGroup: typeof candidateGroup === "string" ? candidateGroup.trim() : "",
    targetGroup: typeof targetGroup === "string" ? targetGroup.trim() : "",
    totalMinimumSetCount,
    universallySelectedNodeIds: memberships
      .filter((membership) => membership.selectedInEveryScenarioMinimumSet)
      .map((membership) => membership.nodeId),
    conditionallySelectedNodeIds: memberships
      .filter((membership) => membership.selectedInEveryComparableMinimumSet &&
        !membership.selectedInEveryScenarioMinimumSet)
      .map((membership) => membership.nodeId),
    memberships,
    scenarios: normalizedScenarios.map(({ candidateNodeIds: _candidateNodeIds, minimumDominatingSets, ...scenario }) => ({
      ...scenario,
      minimumSetCount: minimumDominatingSets.length
    }))
  };
}

export function buildProvenanceScenarioDominatingSetCsv(
  comparison: ProvenanceScenarioDominatingSetComparison,
  nodeLabels: Record<string, string> = {},
  confidenceThreshold: number | null = null,
  timelineWindow = "",
  viewFilters: { types?: readonly string[]; groups?: readonly string[] } = {}
): string {
  const viewTypeFilters = JSON.stringify([...(viewFilters.types ?? [])].sort(compareIds));
  const viewGroupFilters = JSON.stringify([...(viewFilters.groups ?? [])].sort(compareIds));
  const exhaustiveWorlds = comparison.worldAssumption === "finite-exhaustive-worlds";
  const header: unknown[] = [
    "record_type", "scenario_id", "scenario_label", "projected_nodes", "candidate_nodes", "target_nodes",
    "projected_edges", "minimum_set_size", "minimum_set_count", "solver_time_ms", "candidate_group",
    "target_group", "confidence_threshold", "timeline_window", "view_type_filters_json",
    "view_group_filters_json", "node_id", "node_label", "candidate_scenario_count",
    "candidate_scenario_ids_json", "optimal_scenario_count", "optimal_scenario_ids_json",
    "selected_minimum_set_count", "total_comparable_minimum_set_count",
    "selected_in_every_comparable_minimum_set", "selected_in_every_scenario_minimum_set"
  ];
  if (exhaustiveWorlds) header.push("world_assumption", "brave_cautious_status");
  const rows: unknown[][] = [header];
  for (const scenario of comparison.scenarios) {
    const row: unknown[] = [
      "scenario", scenario.scenarioId, scenario.scenarioLabel, scenario.projectedNodeCount,
      scenario.candidateNodeCount, scenario.targetNodeCount, scenario.linksCount,
      scenario.minimumSetSize, scenario.minimumSetCount, scenario.timeMs.toFixed(2),
      comparison.candidateGroup, comparison.targetGroup, confidenceThreshold ?? "", timelineWindow,
      viewTypeFilters, viewGroupFilters, "", "", "", "", "", "", "", "", "", ""
    ];
    if (exhaustiveWorlds) row.push("finite-exhaustive-worlds", "");
    rows.push(row);
  }
  for (const membership of comparison.memberships) {
    const row: unknown[] = [
      "node_membership", "", "", "", "", "", "", "", "", "",
      comparison.candidateGroup, comparison.targetGroup, confidenceThreshold ?? "", timelineWindow,
      viewTypeFilters, viewGroupFilters, membership.nodeId, nodeLabels[membership.nodeId] ?? membership.nodeId,
      membership.candidateScenarioCount, JSON.stringify(membership.candidateScenarioIds),
      membership.optimalScenarioCount, JSON.stringify(membership.optimalScenarioIds),
      membership.selectedMinimumSetCount, membership.totalComparableMinimumSetCount,
      membership.selectedInEveryComparableMinimumSet, membership.selectedInEveryScenarioMinimumSet
    ];
    if (exhaustiveWorlds) {
      row.push(
        "finite-exhaustive-worlds",
        membership.selectedInEveryScenarioMinimumSet
          ? "brave-and-cautious"
          : membership.selectedMinimumSetCount === 0 ? "not-brave" : "brave-only"
      );
    }
    rows.push(row);
  }
  return serializeCsv(rows);
}
