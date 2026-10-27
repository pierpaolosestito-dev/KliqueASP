import { serializeCsv } from "../csvExport.ts";
import type { TypedMotifMatch } from "./motifTask.ts";

export const FINITE_MOTIF_WORLD_ASSUMPTION = "finite-exhaustive-worlds" as const;

export interface ProvenanceMotifScenarioInput {
  scenarioId: string;
  scenarioLabel: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  enumerationComplete: boolean;
  matches: readonly TypedMotifMatch[];
}

export interface ProvenanceMotifScenarioSummary {
  scenarioId: string;
  scenarioLabel: string;
  nodesCount: number;
  linksCount: number;
  timeMs: number;
  distinctRoleAssignments: number;
  enumerationComplete: true;
}

export interface ProvenanceMotifMembership {
  roleAssignments: Record<string, string>;
  scenarioIds: string[];
  scenariosPresent: number;
  totalScenarios: number;
  status: "brave-and-cautious" | "brave-only";
  evidenceByScenario: Array<{
    scenarioId: string;
    scenarioLabel: string;
    match: TypedMotifMatch;
  }>;
}

export interface ProvenanceMotifQueryScope {
  selectedGroup: string;
  graphDirection: "directed" | "undirected";
  timelineWindow: string;
  minimumEdgeConfidence: number | null;
  viewFilters: { types: string[]; groups: string[] };
}

export interface ProvenanceMotifScenarioComparison {
  templateId: string;
  templateLabel: string;
  roleNames: string[];
  queryScope: ProvenanceMotifQueryScope;
  worldAssumption: typeof FINITE_MOTIF_WORLD_ASSUMPTION;
  scenarios: ProvenanceMotifScenarioSummary[];
  memberships: ProvenanceMotifMembership[];
}

function requireName(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} deve essere una stringa non vuota`);
  }
  return value.trim();
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareAssignments(left: Record<string, string>, right: Record<string, string>, roleNames: string[]): number {
  for (const roleName of roleNames) {
    const difference = compareText(left[roleName], right[roleName]);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Compares complete motif enumerations over an explicitly exhaustive finite
 * list of projections. Instance identity is the ordered assignment of source
 * node IDs to template roles; edge witnesses and valid times are evidence for
 * an instance, not part of its cross-world identity.
 */
export function summarizeProvenanceScenarioMotifs(
  templateId: string,
  templateLabel: string,
  roleNamesInput: readonly string[],
  scenarioInputs: readonly ProvenanceMotifScenarioInput[],
  queryScopeInput: ProvenanceMotifQueryScope
): ProvenanceMotifScenarioComparison {
  const normalizedTemplateId = requireName(templateId, "templateId");
  const normalizedTemplateLabel = requireName(templateLabel, "templateLabel");
  if (!Array.isArray(roleNamesInput) || roleNamesInput.length < 2) {
    throw new TypeError("Il template deve dichiarare almeno due ruoli per confrontare le istanze.");
  }
  const roleNames = roleNamesInput.map((role, index) => requireName(role, `roleNames[${index}]`));
  if (new Set(roleNames).size !== roleNames.length) {
    throw new TypeError("I ruoli del template devono essere univoci.");
  }
  if (!Array.isArray(scenarioInputs) || scenarioInputs.length === 0) {
    throw new RangeError("Serve almeno uno scenario completo per confrontare i motivi.");
  }
  if (!queryScopeInput || typeof queryScopeInput !== "object" || Array.isArray(queryScopeInput)) {
    throw new TypeError("Il confronto deve conservare il contesto di filtri e proiezione della query.");
  }
  if (typeof queryScopeInput.selectedGroup !== "string") {
    throw new TypeError("selectedGroup deve essere una stringa.");
  }
  const selectedGroup = queryScopeInput.selectedGroup;
  const graphDirection = queryScopeInput.graphDirection;
  if (graphDirection !== "directed" && graphDirection !== "undirected") {
    throw new TypeError("graphDirection deve essere directed oppure undirected.");
  }
  if (typeof queryScopeInput.timelineWindow !== "string") {
    throw new TypeError("timelineWindow deve essere una stringa.");
  }
  const timelineWindow = queryScopeInput.timelineWindow;
  const minimumEdgeConfidence = queryScopeInput.minimumEdgeConfidence;
  if (minimumEdgeConfidence !== null && (!Number.isFinite(minimumEdgeConfidence) || minimumEdgeConfidence < 0)) {
    throw new RangeError("minimumEdgeConfidence deve essere null o un numero finito non negativo.");
  }
  const viewFilters = queryScopeInput.viewFilters;
  if (!viewFilters || typeof viewFilters !== "object" || Array.isArray(viewFilters) ||
    !Array.isArray(viewFilters.types) || !Array.isArray(viewFilters.groups) ||
    [...viewFilters.types, ...viewFilters.groups].some((value) => typeof value !== "string")) {
    throw new TypeError("viewFilters deve contenere liste di tipi e gruppi.");
  }
  const queryScope: ProvenanceMotifQueryScope = {
    selectedGroup,
    graphDirection,
    timelineWindow,
    minimumEdgeConfidence,
    viewFilters: {
      types: [...new Set(viewFilters.types)].sort(compareText),
      groups: [...new Set(viewFilters.groups)].sort(compareText)
    }
  };

  const seenScenarioIds = new Set<string>();
  const occurrenceByAssignment = new Map<string, {
    roleAssignments: Record<string, string>;
    scenarioIds: string[];
    evidenceByScenario: ProvenanceMotifMembership["evidenceByScenario"];
  }>();
  const scenarios: ProvenanceMotifScenarioSummary[] = [];

  for (const [scenarioIndex, scenario] of scenarioInputs.entries()) {
    if (!scenario || typeof scenario !== "object") {
      throw new TypeError(`Lo scenario ${scenarioIndex + 1} non è valido.`);
    }
    const scenarioId = requireName(scenario.scenarioId, `scenarios[${scenarioIndex}].scenarioId`);
    const scenarioLabel = requireName(scenario.scenarioLabel, `scenarios[${scenarioIndex}].scenarioLabel`);
    if (seenScenarioIds.has(scenarioId)) throw new RangeError(`ID scenario duplicato: ${scenarioId}`);
    seenScenarioIds.add(scenarioId);
    if (![scenario.nodesCount, scenario.linksCount].every((count) => Number.isSafeInteger(count) && count >= 0)) {
      throw new RangeError(`I conteggi di nodi e archi dello scenario '${scenarioId}' non sono validi.`);
    }
    if (!Number.isFinite(scenario.timeMs) || scenario.timeMs < 0) {
      throw new RangeError(`Il tempo dello scenario '${scenarioId}' deve essere finito e non negativo.`);
    }
    if (scenario.enumerationComplete !== true) {
      throw new RangeError(`L'enumerazione dello scenario '${scenarioId}' non è completa; il confronto non può aggregare risultati parziali.`);
    }
    if (!Array.isArray(scenario.matches)) {
      throw new TypeError(`L'enumerazione dello scenario '${scenarioId}' non è valida.`);
    }

    const scenarioAssignments = new Map<string, { roleAssignments: Record<string, string>; match: TypedMotifMatch; witnessSignature: string }>();
    for (const [matchIndex, match] of scenario.matches.entries()) {
      if (!match || !match.roles || typeof match.roles !== "object" || Array.isArray(match.roles)) {
        throw new TypeError(`L'istanza ${matchIndex + 1} dello scenario '${scenarioId}' non contiene i ruoli.`);
      }
      const assignment = Object.fromEntries(roleNames.map((roleName) => [
        roleName,
        requireName(match.roles[roleName]?.sourceId, `matches[${matchIndex}].roles.${roleName}.sourceId`)
      ])) as Record<string, string>;
      if (Object.keys(match.roles).length !== roleNames.length ||
        Object.keys(match.roles).some((roleName) => !roleNames.includes(roleName))) {
        throw new TypeError(`L'istanza ${matchIndex + 1} dello scenario '${scenarioId}' non coincide con i ruoli del template.`);
      }
      if (!Array.isArray(match.supportingEdges)) {
        throw new TypeError(`L'istanza ${matchIndex + 1} dello scenario '${scenarioId}' non contiene un testimone di archi valido.`);
      }
      const signature = JSON.stringify(roleNames.map((roleName) => assignment[roleName]));
      const matchEdges: TypedMotifMatch["supportingEdges"] = match.supportingEdges;
      const witnessSignature = JSON.stringify({
        timeValue: match.timeValue ?? null,
        supportingEdges: matchEdges.map((edge) => ({
          sourceRole: edge.sourceRole,
          targetRole: edge.targetRole,
          edgeType: edge.edgeType,
          edgeIds: [...edge.edgeIds].sort(compareText),
          startTimeValue: edge.startTimeValue ?? null
        }))
      });
      const previous = scenarioAssignments.get(signature);
      if (!previous || compareText(witnessSignature, previous.witnessSignature) < 0) {
        scenarioAssignments.set(signature, { roleAssignments: assignment, match, witnessSignature });
      }
    }

    for (const [signature, assignmentEntry] of scenarioAssignments) {
      const occurrence = occurrenceByAssignment.get(signature) ?? {
        roleAssignments: assignmentEntry.roleAssignments,
        scenarioIds: [],
        evidenceByScenario: []
      };
      occurrence.scenarioIds.push(scenarioId);
      occurrence.evidenceByScenario.push({
        scenarioId,
        scenarioLabel,
        match: assignmentEntry.match
      });
      occurrenceByAssignment.set(signature, occurrence);
    }
    scenarios.push({
      scenarioId,
      scenarioLabel,
      nodesCount: scenario.nodesCount,
      linksCount: scenario.linksCount,
      timeMs: scenario.timeMs,
      distinctRoleAssignments: scenarioAssignments.size,
      enumerationComplete: true
    });
  }

  const totalScenarios = scenarios.length;
  const memberships: ProvenanceMotifMembership[] = [...occurrenceByAssignment.values()]
    .map(({ roleAssignments, scenarioIds, evidenceByScenario }): ProvenanceMotifMembership => ({
      roleAssignments,
      scenarioIds: [...scenarioIds],
      scenariosPresent: scenarioIds.length,
      totalScenarios,
      status: scenarioIds.length === totalScenarios ? "brave-and-cautious" : "brave-only",
      evidenceByScenario
    }))
    .sort((left, right) => compareAssignments(left.roleAssignments, right.roleAssignments, roleNames));

  return {
    templateId: normalizedTemplateId,
    templateLabel: normalizedTemplateLabel,
    roleNames,
    queryScope,
    worldAssumption: FINITE_MOTIF_WORLD_ASSUMPTION,
    scenarios,
    memberships
  };
}

/** Exports role assignment membership without turning world counts into probabilities. */
export function buildProvenanceScenarioMotifCsv(
  comparison: ProvenanceMotifScenarioComparison
): string {
  const scenarioSummaryJson = JSON.stringify(comparison.scenarios.map((scenario) => ({
    scenario_id: scenario.scenarioId,
    scenario_label: scenario.scenarioLabel,
    nodes_count: scenario.nodesCount,
    links_count: scenario.linksCount,
    distinct_role_assignments: scenario.distinctRoleAssignments,
    enumeration_complete: scenario.enumerationComplete,
    solver_time_ms: scenario.timeMs
  })));
  const queryFields = [
    comparison.templateId,
    comparison.templateLabel,
    JSON.stringify(comparison.roleNames),
    comparison.worldAssumption,
    comparison.queryScope.graphDirection,
    comparison.queryScope.selectedGroup,
    comparison.queryScope.timelineWindow,
    comparison.queryScope.minimumEdgeConfidence ?? "",
    JSON.stringify(comparison.queryScope.viewFilters.types),
    JSON.stringify(comparison.queryScope.viewFilters.groups)
  ];
  const headers = [
    "record_type",
    "motif_id",
    "motif_label",
    "role_names",
    "world_assumption",
    "graph_direction",
    "selected_group",
    "timeline_window",
    "minimum_edge_confidence",
    "view_types_json",
    "view_groups_json",
    "role_assignments",
    "brave_cautious_status",
    "worlds_present_count",
    "total_worlds",
    "all_world_enumerations_complete",
    "worlds_present_json",
    "worlds_absent_json",
    "scenario_summary_json",
    "world_witnesses_json"
  ];
  const rows = comparison.memberships.map((membership) => {
      const present = new Set(membership.scenarioIds);
      return [
        "membership",
        ...queryFields,
        JSON.stringify(membership.roleAssignments),
        membership.status,
        membership.scenariosPresent,
        membership.totalScenarios,
        comparison.scenarios.every((scenario) => scenario.enumerationComplete),
        JSON.stringify(comparison.scenarios.filter((scenario) => present.has(scenario.scenarioId))
          .map((scenario) => scenario.scenarioId)),
        JSON.stringify(comparison.scenarios.filter((scenario) => !present.has(scenario.scenarioId))
          .map((scenario) => scenario.scenarioId)),
        scenarioSummaryJson,
        JSON.stringify(membership.evidenceByScenario.map(({ scenarioId, scenarioLabel, match }) => ({
          scenario_id: scenarioId,
          scenario_label: scenarioLabel,
          time_value: match.timeValue ?? null,
          supporting_edges: (match.supportingEdges ?? []).map((edge) => ({
            source_role: edge.sourceRole,
            target_role: edge.targetRole,
            edge_type: edge.edgeType,
            edge_ids: edge.edgeIds,
            start_time_value: edge.startTimeValue ?? null
          }))
        })))
      ];
    });
  if (rows.length === 0) {
    rows.push([
      "summary",
      ...queryFields,
      "",
      "",
      "",
      comparison.scenarios.length,
      comparison.scenarios.every((scenario) => scenario.enumerationComplete),
      "",
      "",
      scenarioSummaryJson,
      "[]"
    ]);
  }
  return serializeCsv([headers, ...rows]);
}
