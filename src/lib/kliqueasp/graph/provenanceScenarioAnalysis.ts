import { serializeCsv } from "../csvExport.ts";

export interface ScenarioMaximumCliqueInput {
  scenarioId: string;
  scenarioLabel?: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  maximumCliques: string[][];
}

export interface ProvenanceScenarioMaximumCliqueSummary {
  scenarioId: string;
  scenarioLabel: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  maximumCliqueSize: number;
  maximumCliqueCount: number;
  maximumCliqueNodeIds: string[];
}

export interface ProvenanceScenarioCliqueMembership {
  nodeId: string;
  scenarioSupportCount: number;
  scenarioIds: string[];
  optimalAnswerSetCount: number;
  totalOptimalAnswerSetCount: number;
  stableAcrossEveryOptimalAnswerSet: boolean;
}

export interface ProvenanceScenarioCliqueComparison {
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
}

export interface ProvenanceScenarioKCoreComparison {
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

/**
 * Summarizes exact maximum-node-set answer sets computed independently for a
 * finite, declared set of provenance projections.
 */
function summarizeMaximumNodeSetScenarios(
  scenarioInputs: readonly ScenarioMaximumCliqueInput[],
  structureLabel: string
): ProvenanceScenarioCliqueComparison {
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

    if (!Number.isSafeInteger(scenario.nodesCount) || scenario.nodesCount < 1 ||
      !Number.isSafeInteger(scenario.linksCount) || scenario.linksCount < 0 ||
      !Number.isFinite(scenario.timeMs) || scenario.timeMs < 0) {
      throw new TypeError(`Statistiche non valide per lo scenario '${scenarioId}'`);
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

  for (const scenario of normalizedScenarios) {
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

  const memberships = [...answerSetCounts.entries()]
    .sort(([left], [right]) => compareIds(left, right))
    .map(([nodeId, optimalAnswerSetCount]) => {
      const scenarioIds = scenarioSupport.get(nodeId) ?? [];
      return {
        nodeId,
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
    scenarioCount: normalizedScenarios.length,
    totalOptimalAnswerSetCount,
    stableNodeIds,
    nonUniversalNodeIds,
    scenarios: normalizedScenarios.map(({ maximumCliques: _maximumCliques, ...scenario }) => scenario),
    memberships
  };
}

/**
 * Summarizes exact maximum-clique answer sets over declared provenance
 * projections. The comparison is deterministic and carries no probability or
 * epistemic semantics.
 */
export function summarizeProvenanceScenarioMaximumCliques(
  scenarioInputs: readonly ScenarioMaximumCliqueInput[]
): ProvenanceScenarioCliqueComparison {
  return summarizeMaximumNodeSetScenarios(scenarioInputs, "clique");
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
  const rows: unknown[][] = [[
    "record_type", "scenario_id", "scenario_label", "candidate_nodes_in_scenario",
    "projected_edges", "maximum_clique_size", "maximum_clique_count", "solver_time_ms",
    "selected_group", "confidence_threshold", "timeline_window",
    "view_type_filters_json", "view_group_filters_json", "node_id", "node_label",
    "scenario_support_count", "scenario_ids_json", "optimal_answer_set_count",
    "total_optimal_answer_set_count", "membership_status"
  ]];
  for (const scenario of comparison.scenarios) {
    rows.push([
      "scenario", scenario.scenarioId, scenario.scenarioLabel,
      scenario.nodesCount, scenario.linksCount, scenario.maximumCliqueSize,
      scenario.maximumCliqueCount, scenario.timeMs.toFixed(2), selectedGroup,
      confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      "", "", "", "", "", "", ""
    ]);
  }
  for (const membership of comparison.memberships) {
    rows.push([
      "node_membership", "", "", "", "", "", "", "", selectedGroup,
      confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      membership.nodeId, nodeLabels[membership.nodeId] ?? membership.nodeId,
      membership.scenarioSupportCount, JSON.stringify(membership.scenarioIds),
      membership.optimalAnswerSetCount, membership.totalOptimalAnswerSetCount,
      membership.stableAcrossEveryOptimalAnswerSet ? "universal" : "non-universal"
    ]);
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
  s: number
): ProvenanceScenarioKPlexComparison {
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
  degreeMode: ProvenanceScenarioKCoreComparison["degreeMode"] = "undirected"
): ProvenanceScenarioKCoreComparison {
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

    if (!Number.isSafeInteger(scenario.nodesCount) || scenario.nodesCount < 1 ||
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

  const memberships = [...supportByNode.entries()]
    .sort(([left], [right]) => compareIds(left, right))
    .map(([nodeId, scenarioIds]) => {
      const candidateScenarioIds = candidateSupportByNode.get(nodeId) ?? [];
      return {
        nodeId,
        candidateScenarioSupportCount: candidateScenarioIds.length,
        candidateScenarioIds,
        scenarioSupportCount: scenarioIds.length,
        scenarioIds,
        stableAcrossEveryScenario: scenarioIds.length === scenarioSummaries.length
      };
    });
  const stableNodeIds = memberships
    .filter((membership) => membership.stableAcrossEveryScenario)
    .map((membership) => membership.nodeId);
  const nonUniversalNodeIds = memberships
    .filter((membership) => !membership.stableAcrossEveryScenario)
    .map((membership) => membership.nodeId);

  return {
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
  const rows: unknown[][] = [[
    "record_type", "scenario_id", "scenario_label", "k", "degree_mode",
    "candidate_nodes", "projected_edges", "core_size", "solver_time_ms",
    "selected_group", "confidence_threshold", "timeline_window",
    "view_type_filters_json", "view_group_filters_json",
    "node_id", "node_label", "candidate_scenario_count", "candidate_scenario_ids_json",
    "scenario_support_count", "scenario_ids_json", "membership_status"
  ]];
  for (const scenario of comparison.scenarios) {
    rows.push([
      "scenario", scenario.scenarioId, scenario.scenarioLabel,
      comparison.k, comparison.degreeMode,
      scenario.nodesCount, scenario.linksCount, scenario.coreSize, scenario.timeMs.toFixed(2),
      selectedGroup, confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      "", "", "", "", "", "", ""
    ]);
  }
  for (const membership of comparison.memberships) {
    rows.push([
      "node_membership", "", "", comparison.k, comparison.degreeMode,
      "", "", "", "", selectedGroup, confidenceThreshold ?? "", timelineWindow,
      viewTypeFilters, viewGroupFilters,
      membership.nodeId, nodeLabels[membership.nodeId] ?? membership.nodeId,
      membership.candidateScenarioSupportCount, JSON.stringify(membership.candidateScenarioIds),
      membership.scenarioSupportCount, JSON.stringify(membership.scenarioIds),
      membership.stableAcrossEveryScenario ? "universal" : "non-universal"
    ]);
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
  const rows: unknown[][] = [[
    "record_type", "scenario_id", "scenario_label", "s", "candidate_nodes",
    "projected_nodes", "projected_edges", "maximum_k_plex_size", "maximum_k_plex_count",
    "maximum_k_plex_node_ids_json", "solver_time_ms", "selected_group",
    "confidence_threshold", "timeline_window", "view_type_filters_json",
    "view_group_filters_json", "node_id", "node_label",
    "candidate_scenario_count", "candidate_scenario_ids_json", "scenario_support_count",
    "scenario_ids_json", "optimal_answer_set_count", "total_optimal_answer_set_count",
    "membership_status"
  ]];
  for (const scenario of comparison.scenarios) {
    rows.push([
      "scenario", scenario.scenarioId, scenario.scenarioLabel, comparison.s,
      scenario.candidateNodeCount, scenario.nodesCount, scenario.linksCount,
      scenario.maximumKPlexSize, scenario.maximumKPlexCount,
      JSON.stringify(scenario.maximumKPlexNodeIds), scenario.timeMs.toFixed(2),
      selectedGroup, confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      "", "", "", "", "", "", "", "", ""
    ]);
  }
  for (const membership of comparison.memberships) {
    rows.push([
      "node_membership", "", "", comparison.s, "", "", "", "", "", "", "",
      selectedGroup, confidenceThreshold ?? "", timelineWindow, viewTypeFilters, viewGroupFilters,
      membership.nodeId, nodeLabels[membership.nodeId] ?? membership.nodeId,
      membership.candidateScenarioSupportCount, JSON.stringify(membership.candidateScenarioIds),
      membership.scenarioSupportCount, JSON.stringify(membership.scenarioIds),
      membership.optimalAnswerSetCount, membership.totalOptimalAnswerSetCount,
      membership.stableAcrossEveryOptimalAnswerSet
        ? "universal"
        : membership.optimalAnswerSetCount === 0 ? "never-selected" : "non-universal"
    ]);
  }
  return serializeCsv(rows);
}
