<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { formatItalianNumber } from "../graph/formatItalianNumber.ts";
  import { displayNodeResultLabel } from "../graph/nodeResultLabel.ts";
  import { displayMappedGraphTime } from "../graph/temporalDisplay.ts";
  import ResultListPager from "./ResultListPager.svelte";
  import ProgressiveList from "./ProgressiveList.svelte";
  import ProvenanceReferences from "./ProvenanceReferences.svelte";
  import SearchableNodeSelect from "./SearchableNodeSelect.svelte";
  import { csvCell, downloadCsvText } from "../csvExport";
import AnalysisErrorMessage from "./AnalysisErrorMessage.svelte";
import AnalysisCompletionStatus from "./AnalysisCompletionStatus.svelte";
  import GraphFilterSummary from "./GraphFilterSummary.svelte";
  import AnalysisProjectionScopeSummary from "./AnalysisProjectionScopeSummary.svelte";
  import { DEFAULT_ANALYSIS_PROJECTION_SCOPE, type AnalysisProjectionScope } from "../graph/analysisProjectionScope.ts";
  import CounterfactualConfigHint from "./CounterfactualConfigHint.svelte";
import SolverDiagnosticsDetails from "./SolverDiagnosticsDetails.svelte";
  import ContextualCliquePanel from "./ContextualCliquePanel.svelte";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
  import type { GraphContextualCliqueConfig, GraphJsonScalar, GraphMotifTemplate } from "../graph/graphModel";
  import type { ContextualCliqueResult } from "../graph/contextualCliqueTask";
  import type { TypedMotifMatch, TypedMotifNearMatch, TypedMotifCounterfactual } from "../graph/motifTask";
  import {
    type TypedMotifCountPartitionProgress
  } from "../graph/motifCountTask";
import { summarizeSignedTriads, type SignedTriadDyad, type SignedTriadResult } from "../graph/signedTriadTask";
  import { buildSignedTriadCsv } from "../graph/signedTriadCsvExport";
  import {
    buildSignedTriadScenarioCsv,
    type SignedTriadScenarioComparison,
    type SignedTriadScenarioMembership,
    type SignedTriadScenarioStability
  } from "../graph/signedTriadScenarioAnalysis";
  import { summarizeEdgeProvenance } from "../graph/structuralTasks";
  import { getOwnRecordValue } from "../graph/recordUtils";
  import { getMotifPanelHeading } from "./motifPanelHeading";
  import { getGraphTaskContract, getTaskEnumerationDescription } from "../graph/graphTaskContracts";
  import {
    buildProvenanceScenarioMotifCsv,
    type ProvenanceMotifMembership,
    type ProvenanceMotifScenarioComparison
  } from "../graph/motifScenarioAnalysis";

  export let open = false;
  export let compactModal = false;
  export let running = false;
  export let analysisScope: AnalysisProjectionScope = DEFAULT_ANALYSIS_PROJECTION_SCOPE;
  export let completionLabel = "";
  export let error = "";
  export let hasRun = false;
  export let templates: GraphMotifTemplate[] = [];
  export let selectedTemplateIndex = "0";
  export let selectedGroup = "";
  export let availableGroups: string[] = [];
  export let matches: TypedMotifMatch[] = [];
  export let scenarioComparisonAvailable = false;
  export let scenarioComparisonRequirementReason = "";
  export let provenanceScenarioCount = 0;
  export let scenarioComparisonProgress = "";
  export let scenarioComparisonError = "";
  export let scenarioComparison: ProvenanceMotifScenarioComparison | null = null;
  export let scenarioComparisonTimeMs: number | undefined;
  export let motifCount: string | undefined = undefined;
  export let motifCountHasRun = false;
  export let motifCountError = "";
  export let motifCountTimeMs: number | undefined;
  export let motifCountMaxDurationMs: number | undefined;
  export let motifCountProgress: TypedMotifCountPartitionProgress | undefined;
  export let motifCountNotice = "";
  export let nearMatches: TypedMotifNearMatch[] = [];
  export let nearMatchHasRun = false;
  export let nearMatchError = "";
  export let nearMatchTimeMs: number | undefined;
  export let counterfactualEnabled = false;
  export let counterfactuals: TypedMotifCounterfactual[] = [];
  export let counterfactualHasRun = false;
  export let counterfactualError = "";
  export let counterfactualTimeMs: number | undefined;
  export let counterfactualExcludedCandidateCount = 0;
  export let counterfactualCandidateCount = 0;
  export let timeMs: number | undefined;
  export let requirementsAvailable = false;
  export let requirementReasons: string[] = [];
  export let temporalRequirementsAvailable = false;
  export let temporalRequirementReasons: string[] = [];
  export let graphNodesCount = 0;
  export let graphEdgesCount = 0;
  export let edgeProvenanceBySourceId: Record<string, string> = {};
  export let edgeProvenanceReferencesBySourceId: Record<string, string[]> = {};
  export let workerWasmMemoryStats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming: boolean = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats: boolean = false;
  export let signedTriadsEnabled = false;
  export let signedTriadAttribute = "";
  export let signedTriadPositiveValues: GraphJsonScalar[] = [];
  export let signedTriadNegativeValues: GraphJsonScalar[] = [];
  export let signedTriadEdgeTypes: string[] = [];
  export let signedTriadRequirementsAvailable = false;
  export let signedTriadRequirementReasons: string[] = [];
  export let signedTriadGroup = "";
  export let signedTriadResults: SignedTriadResult[] = [];
  export let signedTriadHasRun = false;
  export let signedTriadError = "";
  export let signedTriadTimeMs: number | undefined;
  export let signedTriadFocusedKey = "";
  export let signedTriadScenarioComparisonAvailable = false;
  export let signedTriadScenarioComparisonRequirementReason = "";
  export let signedTriadScenarioComparison: SignedTriadScenarioComparison | null = null;
  export let signedTriadScenarioComparisonError = "";
  export let signedTriadScenarioComparisonProgress = "";
  export let signedTriadScenarioComparisonTimeMs: number | undefined;
  export let sourceIdByNodeId: Record<string, string> = {};
  export let nodeLabelById: Record<string, string> = {};
  export let contextualCliqueConfig: GraphContextualCliqueConfig | undefined = undefined;
  export let contextualCliqueAvailable = false;
  export let contextualCliqueRequirementReasons: string[] = [];
  export let contextualCliqueGroup = "";
  export let contextualCliqueEnumerateAllOptima = false;
  export let contextualCliqueResults: ContextualCliqueResult[] = [];
  export let contextualCliqueHasRun = false;
  export let contextualCliqueError = "";
  export let contextualCliqueTimeMs: number | undefined;
  export let activeAnalysisKind = "";

  $: panelHeading = getMotifPanelHeading({
    activeAnalysisKind,
    hasMotifTemplates: templates.length > 0,
    signedTriadsEnabled,
    contextualCliqueConfigured: Boolean(contextualCliqueConfig)
  });

  const scenarioDetailPageSize = 20;
  const templateConstraintPageSize = 20;
  let visibleLimit = 100;
  let visibleMotifScenarioLimit = scenarioDetailPageSize;
  let visibleScenarioMembershipLimit = 100;
  let visibleSignedTriadScenarioSummaryLimit = scenarioDetailPageSize;
  let visibleSignedTriadLimit = 100;
  let visibleSignedTriadScenarioLimit = 100;
  let visibleMotifScenarioEvidenceLimits: Record<string, number> = {};
  let visibleSignedTriadWorldLimits: Record<string, number> = {};
  let visibleSignedTriadEdgeRecordLimits: Record<string, number> = {};
  let visibleCounterfactualLimit = 100;
  let visibleNearMatchLimit = 100;
  let expandedResultEvidence: { kind: "counterfactual" | "match" | "nearMatch"; index: number } | null = null;
  let selectedMatchIndex: number | null = null;
  let selectedCounterfactualIndex: number | null = null;
  let selectedNearMatchIndex: number | null = null;
  let selectedSignedTriadKey = "";
  let previousMatches = matches;
  let previousCounterfactuals = counterfactuals;
  let previousNearMatches = nearMatches;
  let previousSignedTriadResults = signedTriadResults;
  let previousScenarioComparison = scenarioComparison;
  let previousSignedTriadScenarioComparison = signedTriadScenarioComparison;
  $: if (counterfactuals !== previousCounterfactuals) {
    previousCounterfactuals = counterfactuals;
    visibleCounterfactualLimit = 100;
    selectedCounterfactualIndex = null;
    if (expandedResultEvidence?.kind === "counterfactual") expandedResultEvidence = null;
  }
  $: if (nearMatches !== previousNearMatches) {
    previousNearMatches = nearMatches;
    visibleNearMatchLimit = 100;
    selectedNearMatchIndex = null;
    if (expandedResultEvidence?.kind === "nearMatch") expandedResultEvidence = null;
  }
  $: if (signedTriadResults !== previousSignedTriadResults) {
    previousSignedTriadResults = signedTriadResults;
    visibleSignedTriadLimit = 100;
    selectedSignedTriadKey = "";
  }
  $: if (scenarioComparison !== previousScenarioComparison) {
    previousScenarioComparison = scenarioComparison;
    visibleMotifScenarioLimit = scenarioDetailPageSize;
    visibleScenarioMembershipLimit = 100;
    visibleMotifScenarioEvidenceLimits = {};
  }
  $: if (signedTriadScenarioComparison !== previousSignedTriadScenarioComparison) {
    previousSignedTriadScenarioComparison = signedTriadScenarioComparison;
    visibleSignedTriadScenarioSummaryLimit = scenarioDetailPageSize;
    visibleSignedTriadScenarioLimit = 100;
    visibleSignedTriadWorldLimits = {};
    visibleSignedTriadEdgeRecordLimits = {};
  }
  const dispatch = createEventDispatcher();
  let pendingScenarioComparison: "motif" | "signedTriads" | null = null;
  $: if (!running && pendingScenarioComparison !== null) pendingScenarioComparison = null;
  const signedTriadContract = getGraphTaskContract("signedTriads");
  $: selectedTemplate = templates[Number(selectedTemplateIndex)];
  $: selectedTemplateEdgeAttributeSummaries = selectedTemplate?.edges
    .filter((edge) => Boolean(edge.attributes))
    .map((edge) => `${edge.sourceRole} —${edge.edgeType}→ ${edge.targetRole}: ${formatAttributeConstraints(edge.attributes)}`) ?? [];
  $: selectedTemplateNodeAttributeSummaries = selectedTemplate
    ? Object.entries(selectedTemplate.roles)
        .filter(([, role]) => Boolean(role.attributes))
        .map(([role, roleConfig]) => `${role}: ${formatAttributeConstraints(roleConfig.attributes)}`)
    : [];
  $: visibleMatches = matches.slice(0, visibleLimit);
  $: if (matches !== previousMatches) {
    previousMatches = matches;
    visibleLimit = 100;
    selectedMatchIndex = null;
    if (expandedResultEvidence?.kind === "match") expandedResultEvidence = null;
  }
  $: searchableGroupOptions = availableGroups.map((group) => ({ value: group, label: group }));
  $: searchableTemplateOptions = templates.map((template, index) => ({
    value: String(index),
    label: template.label ?? template.id
  }));
  $: visibleCounterfactuals = counterfactuals.slice(0, visibleCounterfactualLimit);
  $: visibleNearMatches = nearMatches.slice(0, visibleNearMatchLimit);
  $: visibleSignedTriads = signedTriadResults.slice(0, visibleSignedTriadLimit);
  $: visibleMotifScenarioSummaries = scenarioComparison?.scenarios.slice(0, visibleMotifScenarioLimit) ?? [];
  $: visibleSignedTriadScenarioSummaries = signedTriadScenarioComparison?.scenarios.slice(0, visibleSignedTriadScenarioSummaryLimit) ?? [];
  $: signedTriadSummary = summarizeSignedTriads(signedTriadResults);
  $: visibleSignedTriadScenarioMemberships = signedTriadScenarioComparison?.memberships.slice(0, visibleSignedTriadScenarioLimit) ?? [];
  $: stableBalancedScenarioTriadCount = signedTriadScenarioComparison?.memberships.filter((entry) => entry.stability === "stable-balanced").length ?? 0;
  $: stableUnbalancedScenarioTriadCount = signedTriadScenarioComparison?.memberships.filter((entry) => entry.stability === "stable-unbalanced").length ?? 0;
  $: variableScenarioTriadCount = (signedTriadScenarioComparison?.memberships.length ?? 0) - stableBalancedScenarioTriadCount - stableUnbalancedScenarioTriadCount;
  $: scenarioComparisonCautiousCount = scenarioComparison?.memberships.filter((entry) => entry.status === "brave-and-cautious").length ?? 0;
  $: scenarioComparisonBraveOnlyCount = scenarioComparison?.memberships.filter((entry) => entry.status === "brave-only").length ?? 0;
  $: selectedTemporalSemantics = selectedTemplate?.temporal?.semantics;
  $: selectedStrictTemporalOrder = selectedTemplate?.temporal?.semantics === "orderedByStart" &&
    selectedTemplate.temporal.strict === true;
  $: selectedIsTemporal = selectedTemporalSemantics !== undefined;
  $: selectedInducedEdgeTypes = selectedTemplate?.inducedEdgeTypes ?? [];

  function motifScenarioMembershipKey(membership: ProvenanceMotifMembership): string {
    return JSON.stringify(Object.entries(membership.roleAssignments).sort(([left], [right]) => left.localeCompare(right)));
  }

  function visibleMotifScenarioEvidence(membership: ProvenanceMotifMembership): ProvenanceMotifMembership["evidenceByScenario"] {
    const key = motifScenarioMembershipKey(membership);
    return membership.evidenceByScenario.slice(0, visibleMotifScenarioEvidenceLimits[key] ?? scenarioDetailPageSize);
  }

  function showMoreMotifScenarioEvidence(membership: ProvenanceMotifMembership) {
    const key = motifScenarioMembershipKey(membership);
    visibleMotifScenarioEvidenceLimits = {
      ...visibleMotifScenarioEvidenceLimits,
      [key]: (visibleMotifScenarioEvidenceLimits[key] ?? scenarioDetailPageSize) + scenarioDetailPageSize
    };
  }

  function signedTriadMembershipKey(membership: SignedTriadScenarioMembership): string {
    return membership.nodeIds.join("\u0000");
  }

  function visibleSignedTriadWorlds(membership: SignedTriadScenarioMembership): SignedTriadScenarioMembership["worlds"] {
    const key = signedTriadMembershipKey(membership);
    return membership.worlds.slice(0, visibleSignedTriadWorldLimits[key] ?? scenarioDetailPageSize);
  }

  function showMoreSignedTriadWorlds(membership: SignedTriadScenarioMembership) {
    const key = signedTriadMembershipKey(membership);
    visibleSignedTriadWorldLimits = {
      ...visibleSignedTriadWorldLimits,
      [key]: (visibleSignedTriadWorldLimits[key] ?? scenarioDetailPageSize) + scenarioDetailPageSize
    };
  }

  function signedTriadDyadEvidenceKey(nodeIds: readonly string[], scenarioId: string, dyad: SignedTriadDyad): string {
    return `${[...nodeIds].sort().join("\u0000")}\u0000${scenarioId}\u0000${dyad.sourceNodeId}\u0000${dyad.targetNodeId}`;
  }

  function visibleSignedTriadEdgeRecords(key: string, records: SignedTriadDyad["edgeRecords"]): SignedTriadDyad["edgeRecords"] {
    return records.slice(0, visibleSignedTriadEdgeRecordLimits[key] ?? scenarioDetailPageSize);
  }

  function showMoreSignedTriadEdgeRecords(key: string) {
    visibleSignedTriadEdgeRecordLimits = {
      ...visibleSignedTriadEdgeRecordLimits,
      [key]: (visibleSignedTriadEdgeRecordLimits[key] ?? scenarioDetailPageSize) + scenarioDetailPageSize
    };
  }
  $: selectedHasAbsenceConditions = Boolean(selectedTemplate?.absentEdges?.length || selectedInducedEdgeTypes.length);
  $: selectedHasInducedConditions = selectedInducedEdgeTypes.length > 0;
  $: selectedAbsenceSemanticsUnsupported = selectedHasAbsenceConditions && selectedIsTemporal;
  $: selectedRequirementsAvailable = requirementsAvailable &&
    (!selectedIsTemporal || temporalRequirementsAvailable) && !selectedAbsenceSemanticsUnsupported;
  $: selectedRequirementReasons = !requirementsAvailable
    ? requirementReasons
    : selectedAbsenceSemanticsUnsupported
      ? ["I vincoli di assenza sono disponibili solo per motivi senza tempo; i motivi temporali richiedono una condizione che specifichi quando la relazione deve mancare."]
    : selectedIsTemporal && !temporalRequirementsAvailable
      ? temporalRequirementReasons
      : [];
  $: motifAnalysisActionDescriptionIds = [
    running ? "analysis-in-progress-status" : "",
    !selectedRequirementsAvailable ? "motif-analysis-readiness" : ""
  ].filter(Boolean).join(" ") || undefined;
  $: signedTriadActionDescriptionIds = [
    running ? "analysis-in-progress-status" : "",
    !signedTriadRequirementsAvailable ? "signed-triad-readiness" : ""
  ].filter(Boolean).join(" ") || undefined;
  $: motifScenarioDescriptionIds = [
    running ? "analysis-in-progress-status" : "",
    !selectedRequirementsAvailable ? "motif-analysis-readiness" : "",
    !scenarioComparisonAvailable ? "motif-scenario-readiness" : ""
  ].filter(Boolean).join(" ") || undefined;
  $: signedTriadScenarioDescriptionIds = [
    running ? "analysis-in-progress-status" : "",
    !signedTriadRequirementsAvailable ? "signed-triad-readiness" : "",
    !signedTriadScenarioComparisonAvailable ? "signed-triad-scenario-readiness" : ""
  ].filter(Boolean).join(" ") || undefined;

  function formatAttributeConstraints(attributes?: Record<string, GraphJsonScalar>): string {
    if (!attributes) return "";
    return Object.entries(attributes).map(([alias, value]) => `${alias}=${JSON.stringify(value)}`).join(", ");
  }

  function provenanceForEdges(edgeIds: string[]): string {
    return summarizeEdgeProvenance(edgeIds, edgeProvenanceBySourceId);
  }

  function provenanceForEdge(edgeId: string): string {
    return getOwnRecordValue<string>(edgeProvenanceBySourceId, edgeId) ?? "";
  }

  function provenanceReferencesForEdge(edgeId: string): string[] {
    return getOwnRecordValue<string[]>(edgeProvenanceReferencesBySourceId, edgeId) ?? [];
  }

  function structuredEdgeEvidence(edgeIds: string[]) {
    return edgeIds.map((edgeId) => ({
      edge_id: edgeId,
      provenance_references: getOwnRecordValue<string[]>(edgeProvenanceReferencesBySourceId, edgeId) ?? []
    }));
  }

  function structuredRoles(roles: Record<string, { nodeId: string; sourceId: string; requiredAttributes?: Record<string, GraphJsonScalar> }>) {
    return Object.fromEntries(Object.entries(roles).map(([role, node]) => [role, node.sourceId]));
  }

  function structuredRoleAttributeConstraints(roles: Record<string, { requiredAttributes?: Record<string, GraphJsonScalar> }>) {
    const constraints = Object.fromEntries(Object.entries(roles)
      .filter(([, node]) => node.requiredAttributes)
      .map(([role, node]) => [role, node.requiredAttributes]));
    return Object.keys(constraints).length > 0 ? constraints : undefined;
  }

  function structuredTemplateRoleAttributeConstraints(roles: GraphMotifTemplate["roles"]) {
    const constraints = Object.fromEntries(Object.entries(roles)
      .filter(([, role]) => role.attributes)
      .map(([name, role]) => [name, role.attributes]));
    return Object.keys(constraints).length > 0 ? constraints : undefined;
  }

  function structuredSupportingEdges(edges: Array<{
    sourceRole: string;
    targetRole: string;
    edgeType: string;
    attributes?: Record<string, GraphJsonScalar>;
    edgeIds: string[];
    startTimeValue?: number;
  }>) {
    return edges.map((edge) => ({
      source_role: edge.sourceRole,
      target_role: edge.targetRole,
      edge_type: edge.edgeType,
      ...(edge.attributes ? { required_edge_attributes: edge.attributes } : {}),
      edge_ids: edge.edgeIds,
      source_edge_evidence: structuredEdgeEvidence(edge.edgeIds),
      ...(edge.startTimeValue === undefined ? {} : { start_time_value: edge.startTimeValue })
    }));
  }

  function run() {
    visibleLimit = 100;
    expandedResultEvidence = null;
    selectedMatchIndex = null;
    dispatch("run", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function compareScenarios() {
    visibleScenarioMembershipLimit = 100;
    pendingScenarioComparison = "motif";
    dispatch("compareScenarios", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function inspectScenarioMatch(scenarioId: string, match: TypedMotifMatch) {
    dispatch("inspectScenarioMatch", { scenarioId, match });
  }

  function count() {
    dispatch("count", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function runSignedTriads() {
    visibleSignedTriadLimit = 100;
    selectedSignedTriadKey = "";
    dispatch("runSignedTriads", { group: signedTriadGroup });
  }

  function compareSignedTriadScenarios() {
    visibleSignedTriadScenarioLimit = 100;
    pendingScenarioComparison = "signedTriads";
    dispatch("compareSignedTriadScenarios", { group: signedTriadGroup });
  }

  function clearSignedTriadResults() {
    visibleSignedTriadLimit = 100;
    selectedSignedTriadKey = "";
    dispatch("clearSignedTriads");
  }

  function signedTriadResultKey(triad: SignedTriadResult): string {
    return JSON.stringify([
      triad.nodeIds,
      triad.dyads.map((dyad) => [
        dyad.sourceNodeId,
        dyad.targetNodeId,
        dyad.polarity,
        dyad.edgeRecords.map((record) => record.id)
      ])
    ]);
  }

  function highlightSignedTriadResult(triad: SignedTriadResult) {
    selectedSignedTriadKey = signedTriadResultKey(triad);
    dispatch("highlightSignedTriad", triad);
  }

  function focusSignedTriad(triad: SignedTriadResult) {
    selectedSignedTriadKey = signedTriadResultKey(triad);
    dispatch("focusSignedTriad", triad);
  }

  function clearSignedTriadFocus() {
    selectedSignedTriadKey = "";
    dispatch("clearSignedTriadFocus");
  }

  function signedTriadNodeDisplay(nodeId: string): string {
    return displayNodeResultLabel(nodeId, nodeLabelById, sourceIdByNodeId);
  }

  function exportSignedTriads() {
    downloadCsvText("signed_triad_balance.csv", buildSignedTriadCsv(signedTriadResults, sourceIdByNodeId));
  }

  function exportSignedTriadScenarioComparison() {
    if (!signedTriadScenarioComparison) return;
    downloadCsvText("signed_triad_scenario_comparison.csv", buildSignedTriadScenarioCsv(signedTriadScenarioComparison));
  }

  function inspectSignedTriadScenarioWitness(scenarioId: string, triad?: SignedTriadResult) {
    if (!triad) return;
    dispatch("inspectSignedTriadScenarioWitness", { scenarioId, triad });
  }

  function signedTriadStabilityLabel(stability: SignedTriadScenarioStability): string {
    switch (stability) {
      case "stable-balanced": return "Bilanciata in tutti gli scenari";
      case "stable-unbalanced": return "Non bilanciata in tutti gli scenari";
      case "balance-varies": return "Il bilanciamento varia tra gli scenari";
      case "classification-varies": return "Classificabile solo in alcuni scenari";
      case "balance-and-classification-vary": return "Variano classificabilità e bilanciamento";
    }
  }

  function signedTriadWorldStatusLabel(status: "balanced" | "unbalanced" | "not-classified"): string {
    if (status === "balanced") return "bilanciata";
    if (status === "unbalanced") return "non bilanciata";
    return "non classificata";
  }

  function diagnose() {
    visibleLimit = 100;
    expandedResultEvidence = null;
    selectedNearMatchIndex = null;
    dispatch("diagnose", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function proposeCounterfactual() {
    visibleCounterfactualLimit = 100;
    expandedResultEvidence = null;
    selectedCounterfactualIndex = null;
    dispatch("counterfactual", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function clearResults() {
    expandedResultEvidence = null;
    selectedMatchIndex = null;
    selectedNearMatchIndex = null;
    selectedCounterfactualIndex = null;
    dispatch("clear");
  }

  function highlightMatch(match: TypedMotifMatch, index: number) {
    selectedMatchIndex = index;
    dispatch("highlight", match);
  }

  function highlightNearMatch(nearMatch: TypedMotifNearMatch, index: number) {
    selectedNearMatchIndex = index;
    dispatch("highlightNearMatch", nearMatch);
  }

  function highlightCounterfactual(proposal: TypedMotifCounterfactual, index: number) {
    selectedCounterfactualIndex = index;
    dispatch("highlightCounterfactual", proposal);
  }

  function resultEvidenceIsOpen(kind: "counterfactual" | "match" | "nearMatch", index: number): boolean {
    return expandedResultEvidence?.kind === kind && expandedResultEvidence.index === index;
  }

  function setResultEvidenceOpen(kind: "counterfactual" | "match" | "nearMatch", index: number, open: boolean) {
    if (open) expandedResultEvidence = { kind, index };
    else if (resultEvidenceIsOpen(kind, index)) expandedResultEvidence = null;
  }

  function exportResults() {
    if (!matches.length) return;
    const rows: unknown[][] = [["motif_id", "time_value", "maximum_span", "role_assignments", "supporting_edges", "supporting_edge_provenance", "closed_world_scope", "induced_edge_types", "required_absences", "structured_witness_json"]];
    for (const match of matches) {
      rows.push([
        match.templateId,
        match.timeValue === undefined ? "" : displayMappedGraphTime(match.timeValue),
        match.maximumSpan ? `${match.maximumSpan.value} ${match.maximumSpan.unit}` : "",
        Object.entries(match.roles).map(([role, node]) => `${role}=${node.sourceId}`).join(" | "),
        match.supportingEdges.map((edge) => {
          const edgeIds = edge.edgeIds.map((edgeId) => edge.startTimeValue === undefined
            ? edgeId
            : `${edgeId}@${displayMappedGraphTime(edge.startTimeValue)}`);
          return `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}: ${edgeIds.join("|")}`;
        }).join(" ; "),
        provenanceForEdges(match.supportingEdges.flatMap((edge) => edge.edgeIds)),
        match.absenceConditions?.length ? "visible_projection" : "",
        match.inducedEdgeTypes?.join(" | ") ?? "",
        match.absenceConditions?.map((edge) => `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}`).join(" | ") ?? "",
        JSON.stringify({
          role_assignments: structuredRoles(match.roles),
          ...(structuredRoleAttributeConstraints(match.roles)
            ? { required_role_attributes: structuredRoleAttributeConstraints(match.roles) }
            : {}),
          maximum_span: match.maximumSpan ?? null,
          supporting_edges: structuredSupportingEdges(match.supportingEdges),
          absence_conditions: match.absenceConditions ?? [],
          induced_edge_types: match.inducedEdgeTypes ?? []
        })
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const fileStem = (selectedTemplate?.id ?? "typed_motif").replace(/[^a-zA-Z0-9_-]+/g, "_");
    downloadCsvText(`${fileStem}_matches.csv`, csv);
  }

  function exportScenarioComparison() {
    if (!scenarioComparison) return;
    const fileStem = scenarioComparison.templateId.replace(/[^a-zA-Z0-9_-]+/g, "_");
    downloadCsvText(`${fileStem}_finite_world_membership.csv`, buildProvenanceScenarioMotifCsv(scenarioComparison));
  }

  function exportNearMatches() {
    if (!nearMatches.length) return;
    const rows: unknown[][] = [[
      "motif_id", "assigned_roles", "missing_roles", "missing_patterns", "unresolved_patterns",
      "violated_absence_patterns", "violated_absence_provenance", "unresolved_absence_patterns",
        "supporting_edge_records", "supporting_edge_provenance", "temporal_semantics", "temporal_maximum_span", "temporal_span_violation", "selected_time", "temporal_unavailable_patterns",
      "temporal_inactive_patterns", "temporal_order_violations", "temporal_support_records", "temporal_support_provenance", "induced_edge_types",
      "structured_diagnostic_json"
    ]];
    for (const match of nearMatches) {
      rows.push([
        match.templateId,
        Object.entries(match.roles).map(([role, node]) => `${role}=${node.sourceId}`).join(" | "),
        match.missingRoles.join(" | "),
        match.missingPatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | "),
        match.unresolvedPatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | "),
        match.violatedAbsencePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}: ${pattern.edgeIds.join("|")}`).join(" | "),
        provenanceForEdges(match.violatedAbsencePatterns.flatMap((pattern) => pattern.edgeIds)),
        match.unresolvedAbsencePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | "),
        match.supportingEdges.map((edge) => `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}: ${edge.edgeIds.join("|")}`).join(" ; "),
        provenanceForEdges(match.supportingEdges.flatMap((edge) => edge.edgeIds)),
        match.temporalEvidence?.semantics ?? "",
        match.temporalEvidence?.maximumSpan
          ? `${match.temporalEvidence.maximumSpan.value} ${match.temporalEvidence.maximumSpan.unit}`
          : "",
        match.temporalEvidence?.spanViolation === undefined ? "" : match.temporalEvidence.spanViolation,
        match.temporalEvidence?.timeValue === undefined ? "" : displayMappedGraphTime(match.temporalEvidence.timeValue),
        match.temporalEvidence?.unavailablePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | ") ?? "",
        match.temporalEvidence?.inactivePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | ") ?? "",
        match.temporalEvidence?.orderViolations.map((pair) => `${pair.firstIndex}->${pair.secondIndex}`).join(" | ") ?? "",
        match.temporalEvidence?.supportingEdges.map((edge) => {
          const records = edge.edgeIds.map((edgeId) => edge.startTimeValue === undefined
            ? edgeId
            : `${edgeId}@${displayMappedGraphTime(edge.startTimeValue)}`);
          return `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}: ${records.join("|")}`;
        }).join(" ; ") ?? "",
        provenanceForEdges(match.temporalEvidence?.supportingEdges.flatMap((edge) => edge.edgeIds) ?? []),
        selectedTemplate?.inducedEdgeTypes?.join(" | ") ?? "",
        JSON.stringify({
          role_assignments: structuredRoles(match.roles),
          ...(selectedTemplate && structuredTemplateRoleAttributeConstraints(selectedTemplate.roles)
            ? { required_role_attributes: structuredTemplateRoleAttributeConstraints(selectedTemplate.roles) }
            : {}),
          missing_roles: match.missingRoles,
          missing_patterns: match.missingPatterns,
          unresolved_patterns: match.unresolvedPatterns,
          violated_absence_patterns: match.violatedAbsencePatterns.map((pattern) => ({
            ...pattern,
            supporting_edge_evidence: structuredEdgeEvidence(pattern.edgeIds)
          })),
          unresolved_absence_patterns: match.unresolvedAbsencePatterns,
          supporting_edges: structuredSupportingEdges(match.supportingEdges),
          temporal_evidence: match.temporalEvidence ? {
            ...match.temporalEvidence,
            supporting_edges: structuredSupportingEdges(match.temporalEvidence.supportingEdges),
            supporting_edge_evidence: match.temporalEvidence.supportingEdges.map((edge) => structuredEdgeEvidence(edge.edgeIds))
          } : null,
          induced_edge_types: selectedTemplate?.inducedEdgeTypes ?? []
        })
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const fileStem = (selectedTemplate?.id ?? "typed_motif").replace(/[^a-zA-Z0-9_-]+/g, "_");
    downloadCsvText(`${fileStem}_near_matches.csv`, csv);
  }

  function exportCounterfactuals() {
    if (!counterfactuals.length) return;
    const rows: unknown[][] = [[
      "motif_id", "total_cost", "role_assignments", "observed_support_edges", "observed_support_provenance", "hypothetical_additions", "candidate_validity", "closed_world_scope", "induced_edge_types", "required_absences",
      "structured_counterfactual_json"
    ]];
    for (const proposal of counterfactuals) {
      rows.push([
        proposal.templateId,
        proposal.totalCost,
        Object.entries(proposal.match.roles).map(([role, node]) => `${role}=${node.sourceId}`).join(" | "),
        proposal.match.supportingEdges.map((edge) =>
          `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}: ${edge.edgeIds.join("|")}`
        ).join(" ; "),
        provenanceForEdges(proposal.match.supportingEdges.flatMap((edge) => edge.edgeIds)),
        proposal.addedEdges.map((edge) =>
          `${edge.id}: ${edge.sourceNodeId}-${edge.edgeType}->${edge.targetNodeId} (cost=${edge.cost}; patterns=${edge.patternIndexes.join("|")})`
        ).join(" ; "),
        proposal.addedEdges.filter((edge) => edge.validity).map((edge) =>
          `${edge.id}: ${displayMappedGraphTime(edge.validity!.from)}..${displayMappedGraphTime(edge.validity!.to)}`
        ).join(" ; "),
        proposal.match.absenceConditions?.length ? "visible_projection" : "",
        proposal.match.inducedEdgeTypes?.join(" | ") ?? "",
        proposal.match.absenceConditions?.map((edge) => `${edge.sourceRole}-${edge.edgeType}-${edge.targetRole}`).join(" | ") ?? "",
        JSON.stringify({
          role_assignments: structuredRoles(proposal.match.roles),
          ...(structuredRoleAttributeConstraints(proposal.match.roles)
            ? { required_role_attributes: structuredRoleAttributeConstraints(proposal.match.roles) }
            : {}),
          observed_support_edges: structuredSupportingEdges(proposal.match.supportingEdges),
          hypothetical_additions: proposal.addedEdges.map((edge) => ({
            id: edge.id,
            source_node_id: edge.sourceNodeId,
            target_node_id: edge.targetNodeId,
            edge_type: edge.edgeType,
            attributes: edge.attributes ?? {},
            cost: edge.cost,
            pattern_indexes: edge.patternIndexes,
            validity: edge.validity ?? null
          })),
          absence_conditions: proposal.match.absenceConditions ?? [],
          induced_edge_types: proposal.match.inducedEdgeTypes ?? []
        })
      ]);
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const fileStem = (selectedTemplate?.id ?? "typed_motif").replace(/[^a-zA-Z0-9_-]+/g, "_");
    downloadCsvText(`${fileStem}_counterfactual_proposals.csv`, csv);
  }
</script>

{#if open}
  <section
    class="motif-panel"
    role={compactModal ? "dialog" : undefined}
    aria-modal={compactModal ? "true" : undefined}
    aria-labelledby="motif-analysis-heading"
    tabindex="-1"
  >
    <header>
      <div>
        <h3 id="motif-analysis-heading">{panelHeading}</h3>
        {#if templates.length > 0}
          <p>
            {selectedHasInducedConditions
            ? `Relazioni richieste e controlli indotti su ${selectedInducedEdgeTypes.length} ${selectedInducedEdgeTypes.length === 1 ? "tipo di arco" : "tipi di arco"} nella proiezione filtrata.`
            : selectedHasAbsenceConditions
            ? "Relazioni richieste e assenze sono valutate nella proiezione filtrata."
            : selectedTemporalSemantics === "coValid"
            ? "Le relazioni dell'istanza devono condividere un istante di validità."
            : selectedTemporalSemantics === "orderedByStart"
              ? `Confronta gli inizi di validità nell’ordine degli archi dichiarato${selectedStrictTemporalOrder ? ", in modo stretto" : ", consentendo parità"}.`
              : "Assegnazioni dei ruoli e relazioni del motivo nella proiezione filtrata."}
          </p>
          {#if selectedHasInducedConditions}
            <details class="induced-edge-types">
              <summary>Tipi di arco controllati · {selectedInducedEdgeTypes.length}</summary>
              <ProgressiveList items={selectedInducedEdgeTypes} label="tipi di arco" let:item>
                <span class="induced-edge-type"><code>{item}</code></span>
              </ProgressiveList>
            </details>
          {/if}
        {/if}
      </div>
      <button type="button" class="close" aria-label="Chiudi analisi relazionale" title="Chiudi analisi relazionale" on:click={() => dispatch("close")}>×</button>
    </header>

    <AnalysisProjectionScopeSummary scope={analysisScope} />
    <AnalysisCompletionStatus label={completionLabel} />

    <SolverDiagnosticsDetails
      {workerWasmMemoryStats}
      {clingoTiming}
      {showClingoTiming}
      {clingoStats}
      {showClingoStats}
    />

    {#if templates.length > 0}
    <p class="motif-configuration-note">Motivi e gruppi disponibili dipendono dalla configurazione.</p>
    <div class="controls">
      <label>
        Motivo
        <SearchableNodeSelect
          id="motif-analysis-template"
          bind:value={selectedTemplateIndex}
          options={searchableTemplateOptions}
          ariaLabel="Cerca un motivo configurato"
          placeholder="Cerca un motivo..."
          emptyMessage="Nessun motivo configurato."
          noResultsMessage="Nessun motivo corrisponde alla ricerca."
          singularResultLabel="motivo trovato"
          pluralResultLabel="motivi trovati"
          disabledDescriptionId={running ? "analysis-in-progress-status" : undefined}
          disabled={running || templates.length === 0}
          on:change={clearResults}
        />
      </label>
      <label>
        Gruppo
        <SearchableNodeSelect
          id="motif-analysis-group"
          bind:value={selectedGroup}
          options={searchableGroupOptions}
          ariaLabel="Cerca un gruppo per l'analisi dei motivi"
          placeholder="Tutti i nodi"
          disabledDescriptionId={running ? "analysis-in-progress-status" : undefined}
          disabled={running}
          on:change={clearResults}
        />
      </label>
      <button type="button" class="run" on:click={run} aria-describedby={motifAnalysisActionDescriptionIds} disabled={running || !selectedTemplate || !selectedRequirementsAvailable}>
        {running && activeAnalysisKind === "typedMotif" ? "Ricerca in corso…" : "Esegui motivo"}
      </button>
      <button type="button" on:click={count} aria-describedby={motifAnalysisActionDescriptionIds} disabled={running || !selectedTemplate || !selectedRequirementsAvailable}>
        {running && activeAnalysisKind === "motifCount" ? "Conteggio in corso…" : "Conta istanze"}
      </button>
      <details class="scenario-comparison-options" open={scenarioComparison !== null || pendingScenarioComparison === "motif"}>
        <summary>
          <span>Confronto tra scenari</span>
          <span class="scenario-comparison-status">{provenanceScenarioCount === 0 ? "non configurato" : `${provenanceScenarioCount} ${provenanceScenarioCount === 1 ? "scenario" : "scenari"}`}</span>
        </summary>
        <div class="scenario-comparison-body">
          {#if provenanceScenarioCount > 0}
            <button type="button" class="scenario-run" class:running={pendingScenarioComparison === "motif"} on:click={compareScenarios} aria-describedby={motifScenarioDescriptionIds} disabled={running || !scenarioComparisonAvailable || !selectedTemplate || !selectedRequirementsAvailable}>
              {pendingScenarioComparison === "motif" ? "Confronto in corso…" : "Confronta istanze tra scenari"}
            </button>
            {#if !scenarioComparisonAvailable}
              <small id="motif-scenario-readiness" class="field-note scenario-readiness-note" role="status" aria-live="polite">{scenarioComparisonRequirementReason}</small>
              <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Apri Dati e configurazione scenari</button>
            {/if}
          {:else}
            <small class="field-note scenario-readiness-note">Definisci almeno uno scenario per confrontare le istanze.</small>
            <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Configura scenari</button>
          {/if}
        </div>
      </details>
    </div>

    <div id="motif-analysis-readiness" class="readiness" role="status">
      <strong>{selectedRequirementsAvailable ? "Prerequisiti disponibili" : "Prerequisiti dati mancanti"}</strong>
      <span>{graphNodesCount} nodi · {graphEdgesCount} archi visibili</span>
      {#if selectedRequirementReasons.length > 0}
        <div class="readiness-reasons">
          <ProgressiveList items={selectedRequirementReasons} label="prerequisiti mancanti" let:item>
            <div>{item}</div>
          </ProgressiveList>
        </div>
        {#if !requirementsAvailable || (selectedIsTemporal && !temporalRequirementsAvailable)}
          <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Apri Dati e mappatura</button>
        {/if}
      {/if}
      {#if selectedTemplateEdgeAttributeSummaries.length > 0}
        <span>Filtri esatti sugli attributi mappati degli archi · {selectedTemplateEdgeAttributeSummaries.length}:</span>
        <div class="configured-constraint-list">
          <ProgressiveList
            items={selectedTemplateEdgeAttributeSummaries}
            pageSize={templateConstraintPageSize}
            resetKey={selectedTemplate}
            label="vincoli sugli archi"
            let:item
          >
            <div>{item}</div>
          </ProgressiveList>
        </div>
      {/if}
      {#if selectedTemplateNodeAttributeSummaries.length > 0}
        <span>Filtri esatti sugli attributi mappati dei nodi · {selectedTemplateNodeAttributeSummaries.length}:</span>
        <div class="configured-constraint-list">
          <ProgressiveList
            items={selectedTemplateNodeAttributeSummaries}
            pageSize={templateConstraintPageSize}
            resetKey={selectedTemplate}
            label="vincoli sui nodi"
            let:item
          >
            <div>{item}</div>
          </ProgressiveList>
        </div>
      {/if}
    </div>

    {#if selectedHasAbsenceConditions}
      <div class="readiness absence-semantics" role="note">
        <strong>Relazioni assenti</strong>
        <span>I filtri correnti definiscono il perimetro; si presume che i dati siano completi per questi tipi.</span>
        <details>
          <summary>Semantica dei vincoli di assenza</summary>
          <p>Una relazione configurata come assente non deve comparire nella proiezione filtrata. Se il dataset è incompleto per il tipo di relazione, l’assenza osservata non basta a concludere che la relazione manchi nel caso reale. Il focus grafico non restringe l’analisi.</p>
          {#if selectedHasInducedConditions}
            <p>Per i tipi indotti si controllano tutte le coppie di ruoli nella direzione del grafo, incluse le relazioni di un ruolo con sé stesso. I tipi non elencati sono ignorati, salvo gli archi positivi richiesti esplicitamente.</p>
          {/if}
        </details>
      </div>
    {/if}
    {#if !hasRun && !error}
      <details class="motif-enumeration-details">
        <summary>Dettagli su conteggio ed enumerazione</summary>
        <p>{selectedTemporalSemantics === "orderedByStart"
          ? "Sono elencate tutte le sequenze valide; archi paralleli possono produrre più sequenze per la stessa assegnazione dei ruoli."
          : "Sono elencate tutte le assegnazioni dei ruoli compatibili con il motivo configurato."}</p>
        <p>Il conteggio restituisce il totale esatto senza elencare le istanze; sui grafi densi può richiedere più tempo.</p>
      </details>
    {/if}
    {#if motifCountMaxDurationMs !== undefined}
      <small>
        Budget complessivo del conteggio: {motifCountMaxDurationMs?.toLocaleString("it-IT")} ms.
      </small>
    {/if}

    {#if motifCountProgress}
      <div class="readiness">
        <div role="progressbar" aria-label="Avanzamento del conteggio dei motivi"
          aria-valuemin="0" aria-valuemax={motifCountProgress.total} aria-valuenow={motifCountProgress.completed}>
          <strong>{motifCountProgress.completed}/{motifCountProgress.total} passaggi completati</strong>
        </div>
        {#if motifCountProgress.completed < motifCountProgress.total && running}
          <button
            type="button"
            on:click={() => dispatch("cancelCount")}
            aria-describedby={motifCountNotice.startsWith("Annullamento") ? "motif-count-cancel-status" : undefined}
            disabled={motifCountNotice.startsWith("Annullamento")}
          >
            {motifCountNotice.startsWith("Annullamento") ? "Annullamento in corso…" : "Interrompi conteggio"}
          </button>
        {/if}
      </div>
    {/if}

    {#if motifCountNotice}
      <div id="motif-count-cancel-status" class="readiness" role="status">{motifCountNotice}</div>
    {/if}

    {#if motifCountError}
      <AnalysisErrorMessage message={motifCountError} />
    {/if}

    {#if motifCountHasRun && motifCount !== undefined}
      <div class="summary" role="status">
        <strong>{motifCount}</strong>
        {selectedTemporalSemantics === "orderedByStart"
          ? motifCount === "1" ? " sequenza temporale valida" : " sequenze temporali valide"
          : motifCount === "1" ? " istanza del motivo" : " istanze del motivo"}
        {#if motifCountTimeMs !== undefined}<span> · {formatItalianNumber(motifCountTimeMs, 1)} ms</span>{/if}
        <p>Conteggio esatto per il motivo e la proiezione visibile correnti. Non vengono mostrati i singoli nodi e archi di ogni istanza; se il calcolo si interrompe, non compare un totale parziale.</p>
      </div>
    {/if}

    {#if error}
      <AnalysisErrorMessage message={error} />
    {/if}

    {#if scenarioComparisonProgress}
      <div class="readiness" role="status">{scenarioComparisonProgress}</div>
    {/if}
    {#if scenarioComparisonError}
      <AnalysisErrorMessage message={scenarioComparisonError} />
    {/if}
    {#if scenarioComparison}
      <div class="summary" role="status" aria-label="Confronto della presenza dei motivi tra scenari">
        <strong>{scenarioComparison.memberships.length}</strong>
        {scenarioComparison.memberships.length === 1 ? " assegnazione di ruoli distinta" : " assegnazioni di ruoli distinte"}
        · {scenarioComparisonCautiousCount} presenti in tutti gli scenari · {scenarioComparisonBraveOnlyCount} presenti in alcuni scenari
        {#if scenarioComparisonTimeMs !== undefined}<span> · {formatItalianNumber(scenarioComparisonTimeMs, 1)} ms complessivi</span>{/if}
        <div class="results-heading">
          <strong>Presenza per assegnazione dei ruoli</strong>
          <button type="button" on:click={exportScenarioComparison}>Esporta CSV</button>
        </div>
        <div class="readiness">
          {#each visibleMotifScenarioSummaries as scenario (scenario.scenarioId)}
            <span>{scenario.scenarioLabel}: {scenario.distinctRoleAssignments} {scenario.distinctRoleAssignments === 1 ? "assegnamento" : "assegnamenti"} · {scenario.nodesCount} nodi · {scenario.linksCount} {scenario.linksCount === 1 ? "arco" : "archi"} · enumerazione completa · {formatItalianNumber(scenario.timeMs, 1)} ms</span>
          {/each}
        </div>
        <ResultListPager
          total={scenarioComparison.scenarios.length}
          visible={visibleMotifScenarioSummaries.length}
          pageSize={scenarioDetailPageSize}
          label="scenari del motivo"
          showMore={() => visibleMotifScenarioLimit += scenarioDetailPageSize}
        />
        <div class="readiness">
          <strong>Ambito del confronto</strong>
          <span>Gruppo: {scenarioComparison.queryScope.selectedGroup || "tutti i nodi"} · direzione: {scenarioComparison.queryScope.graphDirection}</span>
          <span>Finestra: {scenarioComparison.queryScope.timelineWindow || "non attiva"} · confidenza minima: {scenarioComparison.queryScope.minimumEdgeConfidence ?? "non applicata"}</span>
          <GraphFilterSummary
            types={scenarioComparison.queryScope.viewFilters.types}
            groups={scenarioComparison.queryScope.viewFilters.groups}
            degreeFilters={scenarioComparison.queryScope.viewFilters.degreeFilters}
          />
        </div>
        {#if scenarioComparison.memberships.length > 0}
          <ul class="results">
            {#each scenarioComparison.memberships.slice(0, visibleScenarioMembershipLimit) as membership, index}
              {@const visibleEvidence = visibleMotifScenarioEvidence(membership)}
              <li class="match scenario-membership">
                <strong>{index + 1}. {membership.status === "brave-and-cautious" ? "Presente in tutti gli scenari" : "Presente in alcuni scenari"}</strong>
                <details class="role-assignment-details">
                  <summary>Assegnazione dei ruoli · {scenarioComparison.roleNames.length}</summary>
                  <div class="role-assignment-list">
                    <ProgressiveList items={scenarioComparison.roleNames} resetKey={membership} label="ruoli assegnati" let:item={role}>
                      <span><strong>{role}</strong>: {membership.roleAssignments[role] ?? "non assegnato"}</span>
                    </ProgressiveList>
                  </div>
                </details>
                <span>Presente in {membership.scenariosPresent}/{membership.totalScenarios} scenari</span>
                <div class="world-witnesses">
                  {#each visibleEvidence as evidence (evidence.scenarioId)}
                    <button type="button" aria-describedby={running ? "analysis-in-progress-status" : undefined} disabled={running} on:click={() => inspectScenarioMatch(evidence.scenarioId, evidence.match)}>
                      Mostra un'istanza in {evidence.scenarioLabel}
                    </button>
                  {/each}
                </div>
                <ResultListPager
                  total={membership.evidenceByScenario.length}
                  visible={visibleEvidence.length}
                  pageSize={scenarioDetailPageSize}
                  label="scenari con un'istanza"
                  showMore={() => showMoreMotifScenarioEvidence(membership)}
                />
              </li>
            {/each}
          </ul>
          <ResultListPager
            total={scenarioComparison.memberships.length}
            visible={Math.min(scenarioComparison.memberships.length, visibleScenarioMembershipLimit)}
            pageSize={100}
            label="assegnamenti"
            showMore={() => visibleScenarioMembershipLimit += 100}
          />
        {:else}
          <p>Nessuna assegnazione di ruoli realizza il motivo in alcuno degli scenari dichiarati.</p>
          <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Rivedi motivo e scenari in Dati</button>
        {/if}
        <small>La presenza segue l’assegnazione dei ruoli; gli archi di supporto possono variare tra scenari.</small>
        <details class="scenario-interpretation">
          <summary>Come leggere presenza e identità</summary>
          <p>
            L’identità dell’istanza è l’assegnazione ordinata di tutti i ruoli, inclusi quelli di contesto, agli ID sorgente dei nodi. Archi o tempi diversi possono sostenere la stessa istanza nei diversi scenari; il confronto non afferma che persista lo stesso arco o lo stesso istante. I pulsanti aprono lo scenario e mostrano un esempio grafico dell'istanza.
            {#if selectedHasAbsenceConditions} I vincoli di assenza e di indotto sono rivalutati separatamente sulla proiezione chiusa di ciascuno scenario.{/if}
            “Presente in alcuni scenari” significa almeno uno, “presente in tutti” richiede ogni scenario elencato. Il confronto appare solo quando il calcolo termina per tutti gli scenari; se si interrompe, non viene mostrato un risultato parziale. Questa lettura assume che la lista sia esaustiva e non assegna probabilità agli scenari. Ogni motivo viene valutato sulla propria proiezione, mantenendo gruppo, filtri, soglia di confidenza e finestra correnti.
          </p>
        </details>
      </div>
    {/if}

    {#if hasRun && matches.length === 0 && !error}
      <div class="near-match-controls">
          <button type="button" on:click={diagnose} aria-describedby={motifAnalysisActionDescriptionIds} disabled={running || !selectedRequirementsAvailable}>
          {running && activeAnalysisKind === "motifNearMatch" ? "Ricerca in corso…" : selectedIsTemporal ? "Analizza la struttura più vicina" : "Spiega il mancato match"}
        </button>
        <small>
          Cerca un assegnamento che riempie il maggior numero di ruoli e poi minimizza i vincoli strutturali violati.
          È una verifica aggiuntiva e può richiedere tempo sui grafi grandi.
          {#if selectedIsTemporal}
            {#if selectedTemporalSemantics === "coValid"}
              A parità strutturale sceglie l’istante che rende temporalmente attive più relazioni richieste; distingue le relazioni senza intervalli validi da quelle inattive all’istante scelto.
            {:else}
              A parità strutturale sceglie i record con meno inversioni tra inizi consecutivi; distingue le relazioni senza intervalli validi.
            {/if}
          {:else}
            A parità di ruoli assegnati, minimizza sia le relazioni richieste mancanti sia gli archi presenti che violano un vincolo di assenza.
          {/if}
        </small>
      </div>
    {/if}

    {#if hasRun && matches.length === 0 && !error && counterfactualEnabled}
      <div class="counterfactual-controls">
        <button type="button" on:click={proposeCounterfactual} aria-describedby={motifAnalysisActionDescriptionIds} disabled={running || !selectedRequirementsAvailable}>
          {running && activeAnalysisKind === "motifCounterfactual" ? "Ricerca in corso…" : "Cerca aggiunte ipotetiche minime"}
        </button>
        <small>
          Valuta solo i {counterfactualCandidateCount} archi esplicitamente configurati con costo positivo.
          La proposta non viene applicata al grafo; il costo ordina gli scenari dichiarati e non esprime probabilità o causalità.
          {#if selectedIsTemporal} Ogni candidato deve dichiarare un intervallo di validità.{/if}
        </small>
      </div>
    {/if}

    {#if hasRun && matches.length === 0 && !error && !counterfactualEnabled}
      <CounterfactualConfigHint
        description="Puoi cercare una completazione ipotetica aggiungendo archi candidati e i relativi costi alla configurazione del grafo."
        actionLabel="Configura candidati"
        on:openData={() => dispatch("openData")}
      />
    {/if}

    {#if counterfactualError}
      <AnalysisErrorMessage message={counterfactualError} />
    {/if}

    {#if counterfactualHasRun}
      <div class="summary" role="status">
        {#if counterfactuals.length > 0}
          <strong>{counterfactuals.length}</strong> proposta{counterfactuals.length === 1 ? " ottima" : " ottime"} a costo minimo
        {:else}
          Nessuna combinazione dei candidati configurati completa il motivo.
        {/if}
        {#if counterfactualTimeMs !== undefined}<span> · {formatItalianNumber(counterfactualTimeMs, 1)} ms</span>{/if}
        {#if counterfactualExcludedCandidateCount > 0}
          <p>{counterfactualExcludedCandidateCount} candidati esclusi perché fuori dalla proiezione visibile o dal gruppo selezionato.</p>
        {/if}
      </div>
    {/if}
    {#if counterfactualHasRun && counterfactuals.length === 0}
      <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Rivedi candidati e vincoli del motivo</button>
    {/if}

    {#if counterfactuals.length > 0}
      <div class="results-heading">
        <strong>Proposte ipotetiche · costo totale {counterfactuals[0].totalCost}</strong>
        <button type="button" on:click={exportCounterfactuals}>Esporta CSV</button>
      </div>
      <ul class="results">
        {#each visibleCounterfactuals as proposal, index}
          <li>
            <button type="button" class="match" aria-pressed={selectedCounterfactualIndex === index} on:click={() => highlightCounterfactual(proposal, index)}>
              <strong>{index + 1}. {proposal.label} · costo {proposal.totalCost}</strong>
              <span>{Object.keys(proposal.match.roles).length} ruoli · {proposal.addedEdges.length} archi ipotetici · {proposal.match.supportingEdges.length} relazioni osservate</span>
            </button>
            <details
              class="result-evidence"
              open={resultEvidenceIsOpen("counterfactual", index)}
              on:toggle={(event) => setResultEvidenceOpen("counterfactual", index, event.currentTarget.open)}
            >
              <summary>Dettagli della proposta</summary>
              {#if resultEvidenceIsOpen("counterfactual", index)}
                <div class="result-evidence-content">
                  <ProgressiveList items={Object.entries(proposal.match.roles)} resetKey={proposal} label="ruoli" let:item>
                    <span>{item[0]}: {item[1].sourceId}</span>
                    {#if item[1].requiredAttributes}<span>Attributi richiesti per {item[0]}: {formatAttributeConstraints(item[1].requiredAttributes)}</span>{/if}
                  </ProgressiveList>
                  <ProgressiveList items={proposal.addedEdges} resetKey={proposal} label="archi ipotetici" let:item>
                    <span>
                      {#if formatAttributeConstraints(item.attributes)}Attributi ipotizzati: {formatAttributeConstraints(item.attributes)} · {/if}
                      Aggiunta ipotetica {item.id}: {item.sourceNodeId} —{item.edgeType}→ {item.targetNodeId} · costo {item.cost} · {item.patternIndexes.length} relazioni del motivo
                      {#if item.validity} · validità {displayMappedGraphTime(item.validity.from)}–{displayMappedGraphTime(item.validity.to)}{/if}
                    </span>
                    <details class="edge-record-evidence">
                      <summary>Relazioni del motivo associate · {item.patternIndexes.length}</summary>
                      <ProgressiveList items={item.patternIndexes} resetKey={item} label="relazioni del motivo" let:item={patternIndex}>
                        <span>Relazione {patternIndex + 1}</span>
                      </ProgressiveList>
                    </details>
                  </ProgressiveList>
                  <ProgressiveList items={proposal.match.supportingEdges} resetKey={proposal} label="relazioni osservate" let:item>
                    {#if item.edgeIds.length > 0}
                    <span>
                      {#if formatAttributeConstraints(item.attributes)}Attributi richiesti: {formatAttributeConstraints(item.attributes)} · {/if}
                      Supporto osservato {item.sourceRole} —{item.edgeType}→ {item.targetRole} · {item.edgeIds.length} record d'arco
                    </span>
                    <details class="edge-record-evidence">
                      <summary>Mostra ID e fonti dei record</summary>
                      <ProgressiveList items={item.edgeIds} resetKey={item} label="record d'arco" let:item={edgeId}>
                        <span><code>{edgeId}</code></span>
                        <ProvenanceReferences
                          references={provenanceReferencesForEdge(edgeId)}
                          fallback={provenanceForEdge(edgeId)}
                          resetKey={edgeId}
                        />
                      </ProgressiveList>
                    </details>
                    {/if}
                  </ProgressiveList>
                  <ProgressiveList items={proposal.match.absenceConditions ?? []} resetKey={proposal} label="assenze richieste" let:item>
                    <span>Relazione assente nella proiezione visibile: {item.sourceRole} —{item.edgeType}→ {item.targetRole}</span>
                  </ProgressiveList>
                </div>
              {/if}
            </details>
          </li>
        {/each}
      </ul>
      <ResultListPager
        total={counterfactuals.length}
        visible={visibleCounterfactuals.length}
        pageSize={100}
        label="proposte"
        showMore={() => visibleCounterfactualLimit += 100}
      />
      <small>Le evidenziazioni mostrano solo il supporto osservato; gli archi ipotetici restano separati.</small>
      <details class="counterfactual-evidence-details">
        <summary>Dettagli sull'evidenza</summary>
        <p>Gli archi ipotetici non entrano nella vista del grafo. L'ottimalità dipende dagli archi candidati, dai costi, dal motivo e dalla proiezione corrente.</p>
      </details>
    {/if}

    {#if nearMatchError}
      <AnalysisErrorMessage message={nearMatchError} />
    {/if}

    {#if hasRun && !error}
      <div class="summary" role="status">
        <strong>{matches.length}</strong>
        {selectedTemporalSemantics === "orderedByStart"
          ? matches.length === 1 ? " sequenza valida" : " sequenze valide"
          : matches.length === 1 ? " istanza del motivo" : " istanze del motivo"}
        {#if timeMs !== undefined}<span> · {formatItalianNumber(timeMs, 1)} ms</span>{/if}
        {#if matches.length === 0}
          <p>
            {selectedTemporalSemantics === "orderedByStart"
              ? "Nessuna sequenza di relazioni osservate rispetta l’ordine degli inizi di validità richiesto."
              : selectedTemporalSemantics === "coValid"
                ? "Nessuna assegnazione presenta tutte le relazioni richieste nello stesso istante."
                : "Nessuna assegnazione realizza il motivo con i tipi e le relazioni richiesti."}
          </p>
        {/if}
      </div>
    {/if}

    {#if matches.length > 0}
      <div class="results-heading">
        <strong>Ruoli e relazioni presenti</strong>
        <button type="button" on:click={exportResults}>Esporta CSV</button>
      </div>
      <ul class="results">
        {#each visibleMatches as match, index}
          <li>
            <button type="button" class="match" aria-pressed={selectedMatchIndex === index} on:click={() => highlightMatch(match, index)}>
              <strong>{index + 1}. {match.label}</strong>
              {#if match.timeValue !== undefined}<span>Istante comune di validità: {displayMappedGraphTime(match.timeValue)}</span>{/if}
              {#if match.maximumSpan}<span>Durata massima fra il primo e l'ultimo inizio: {match.maximumSpan.value} {match.maximumSpan.unit}</span>{/if}
              <span>{Object.keys(match.roles).length} ruoli · {match.supportingEdges.length} relazioni · {match.nodeIds.length} nodi</span>
            </button>
            <details
              class="result-evidence"
              open={resultEvidenceIsOpen("match", index)}
              on:toggle={(event) => setResultEvidenceOpen("match", index, event.currentTarget.open)}
            >
              <summary>Dettagli dell'istanza</summary>
              {#if resultEvidenceIsOpen("match", index)}
                <div class="result-evidence-content">
                  <ProgressiveList items={Object.entries(match.roles)} resetKey={match} label="ruoli" let:item>
                    <span>{item[0]}: {item[1].sourceId}</span>
                    {#if item[1].requiredAttributes}<span>Attributi richiesti per {item[0]}: {formatAttributeConstraints(item[1].requiredAttributes)}</span>{/if}
                  </ProgressiveList>
                  <ProgressiveList items={match.supportingEdges} resetKey={match} label="relazioni" let:item>
                    <span>
                      {#if formatAttributeConstraints(item.attributes)}Attributi richiesti: {formatAttributeConstraints(item.attributes)} · {/if}
                      {item.sourceRole} —{item.edgeType}→ {item.targetRole} · {item.edgeIds.length} record d'arco
                      {#if item.startTimeValue !== undefined} · inizio {displayMappedGraphTime(item.startTimeValue)}{/if}
                    </span>
                    {#if item.edgeIds.length > 0}
                      <details class="edge-record-evidence">
                        <summary>Mostra ID e fonti dei record</summary>
                        <ProgressiveList items={item.edgeIds} resetKey={item} label="record d'arco" let:item={edgeId}>
                          <span><code>{edgeId}</code></span>
                          <ProvenanceReferences
                            references={provenanceReferencesForEdge(edgeId)}
                            fallback={provenanceForEdge(edgeId)}
                            resetKey={edgeId}
                          />
                        </ProgressiveList>
                      </details>
                    {/if}
                  </ProgressiveList>
                  <ProgressiveList items={match.absenceConditions ?? []} resetKey={match} label="assenze richieste" let:item>
                    <span>Relazione assente nella proiezione visibile: {item.sourceRole} —{item.edgeType}→ {item.targetRole}</span>
                  </ProgressiveList>
                </div>
              {/if}
            </details>
          </li>
        {/each}
      </ul>
      <ResultListPager
        total={matches.length}
        visible={visibleMatches.length}
        pageSize={100}
        label="istanze"
        showMore={() => visibleLimit += 100}
      />
      <small>
        Ogni istanza assegna nodi distinti ai ruoli e mostra almeno un record d’arco per ogni relazione richiesta.
        {#if selectedHasAbsenceConditions} Le relazioni assenti sono valutate nella proiezione visibile e richiedono dati completi per i tipi indicati.{/if}
      </small>
      <details class="instance-interpretation">
        <summary>Dettagli sulla verifica</summary>
        <p>
        Per co-validità mostra anche l’istante comune; per l’ordine temporale mostra il record e l’inizio di validità usati per ogni passo.
        Tipi e intervalli seguono la mappatura e lo schema del motivo; la verifica prova compatibilità strutturale, non causalità o verità storica.
        </p>
      </details>
    {/if}

    {#if nearMatchHasRun && nearMatches.length > 0}
      <div class="summary" role="status">
        <strong>{nearMatches.length}</strong> {nearMatches.length === 1 ? "configurazione più vicina" : "configurazioni più vicine"} {nearMatches[0].temporalEvidence ? "temporale" : "strutturale"}
        {#if nearMatchTimeMs !== undefined}<span> · {formatItalianNumber(nearMatchTimeMs, 1)} ms</span>{/if}
        {#if nearMatches[0].temporalEvidence}
          <p>Prima si massimizzano i ruoli assegnati, poi le relazioni esistenti; infine si riducono le incompatibilità temporali.</p>
        {:else}
          <p>Prima si massimizza il numero di ruoli assegnati; poi si minimizza il numero totale di relazioni richieste mancanti e di vincoli di assenza violati.</p>
        {/if}
        <p>Il punteggio migliore è provato; l'elenco può non includere tutte le configurazioni a pari merito.</p>
      </div>
      <div class="results-heading">
        <strong>{nearMatches[0].temporalEvidence ? "Corrispondenze temporali più vicine" : "Corrispondenze strutturali più vicine"}</strong>
        <button type="button" on:click={exportNearMatches}>Esporta CSV</button>
      </div>
      <ul class="near-matches">
        {#each visibleNearMatches as nearMatch, index}
          <li class="near-match">
            <button type="button" class="match" aria-pressed={selectedNearMatchIndex === index} on:click={() => highlightNearMatch(nearMatch, index)}>
              <strong>{index + 1}. {nearMatch.label}</strong>
              <span>Ruoli assegnati: {Object.keys(nearMatch.roles).length} / {Object.keys(selectedTemplate?.roles ?? {}).length} · relazioni mancanti: {nearMatch.missingPatterns.length} · assenze violate: {nearMatch.violatedAbsencePatterns.length}</span>
            </button>
            <details
              class="result-evidence"
              open={resultEvidenceIsOpen("nearMatch", index)}
              on:toggle={(event) => setResultEvidenceOpen("nearMatch", index, event.currentTarget.open)}
            >
              <summary>Dettagli della diagnosi</summary>
              {#if resultEvidenceIsOpen("nearMatch", index)}
                <div class="result-evidence-content">
              <ProgressiveList items={Object.entries(nearMatch.roles)} resetKey={nearMatch} label="ruoli assegnati" let:item>
                <span>{item[0]}: {item[1].sourceId}</span>
                {#if item[1].requiredAttributes}<span>Attributi richiesti per {item[0]}: {formatAttributeConstraints(item[1].requiredAttributes)}</span>{/if}
              </ProgressiveList>
              <ProgressiveList items={nearMatch.missingRoles} resetKey={nearMatch} label="ruoli senza candidato" let:item>
                <span>Nessun candidato per il ruolo nella proiezione visibile corrente: {item}</span>
                {#if selectedTemplate?.roles[item]?.attributes}
                  <span>Filtri richiesti per {item}: {formatAttributeConstraints(selectedTemplate.roles[item].attributes)}</span>
                {/if}
              </ProgressiveList>
              <ProgressiveList items={nearMatch.missingPatterns} resetKey={nearMatch} label="relazioni mancanti" let:item>
                {#if formatAttributeConstraints(item.attributes)}<span>Filtri richiesti: {formatAttributeConstraints(item.attributes)}</span>{/if}
                <span>Relazione non trovata nella proiezione visibile corrente: {item.sourceRole} —{item.edgeType}→ {item.targetRole}</span>
              </ProgressiveList>
              <ProgressiveList items={nearMatch.unresolvedPatterns} resetKey={nearMatch} label="relazioni non valutabili" let:item>
                {#if formatAttributeConstraints(item.attributes)}<span>Filtri richiesti: {formatAttributeConstraints(item.attributes)}</span>{/if}
                <span>Relazione non valutabile perché manca un ruolo: {item.sourceRole} —{item.edgeType}→ {item.targetRole}</span>
              </ProgressiveList>
              <ProgressiveList items={nearMatch.violatedAbsencePatterns} resetKey={nearMatch} label="assenze violate" let:item>
                <span>
                  Relazione presente ma dichiarata assente: {item.sourceRole} —{item.edgeType}→ {item.targetRole} · {item.edgeIds.length} record d'arco
                </span>
                <details class="edge-record-evidence">
                  <summary>Mostra ID e fonti dei record</summary>
                  <ProgressiveList items={item.edgeIds} resetKey={item} label="record d'arco" let:item={edgeId}>
                    <span><code>{edgeId}</code></span>
                    <ProvenanceReferences
                      references={provenanceReferencesForEdge(edgeId)}
                      fallback={provenanceForEdge(edgeId)}
                      resetKey={edgeId}
                    />
                  </ProgressiveList>
                </details>
              </ProgressiveList>
              <ProgressiveList items={nearMatch.unresolvedAbsencePatterns} resetKey={nearMatch} label="assenze non valutabili" let:item>
                <span>Assenza non valutabile perché manca un ruolo: {item.sourceRole} —{item.edgeType}→ {item.targetRole}</span>
              </ProgressiveList>
              <ProgressiveList items={nearMatch.supportingEdges} resetKey={nearMatch} label="relazioni presenti" let:item>
                {#if item.edgeIds.length > 0}
                <span>
                  {#if formatAttributeConstraints(item.attributes)}Attributi richiesti: {formatAttributeConstraints(item.attributes)} · {/if}
                  Relazione presente: {item.sourceRole} —{item.edgeType}→ {item.targetRole} · {item.edgeIds.length} record d'arco
                </span>
                <details class="edge-record-evidence">
                  <summary>Mostra ID e fonti dei record</summary>
                  <ProgressiveList items={item.edgeIds} resetKey={item} label="record d'arco" let:item={edgeId}>
                    <span><code>{edgeId}</code></span>
                    <ProvenanceReferences
                      references={provenanceReferencesForEdge(edgeId)}
                      fallback={provenanceForEdge(edgeId)}
                      resetKey={edgeId}
                    />
                  </ProgressiveList>
                </details>
                {/if}
              </ProgressiveList>
              {#if nearMatch.temporalEvidence}
                {#if nearMatch.temporalEvidence.maximumSpan}
                  <span>
                    Finestra massima {nearMatch.temporalEvidence.maximumSpan.value} {nearMatch.temporalEvidence.maximumSpan.unit}:
                    {nearMatch.temporalEvidence.spanViolation ? "superata" : "rispettata"}
                  </span>
                {/if}
                {#if nearMatch.temporalEvidence.timeValue !== undefined}
                  <span>Istante scelto che rende attive contemporaneamente più relazioni: {displayMappedGraphTime(nearMatch.temporalEvidence.timeValue)}</span>
                {/if}
                <ProgressiveList items={nearMatch.temporalEvidence.unavailablePatterns} resetKey={nearMatch} label="intervalli non disponibili" let:item>
                  <span>Intervallo temporale assente o non valido: {item.sourceRole} —{item.edgeType}→ {item.targetRole}</span>
                </ProgressiveList>
                <ProgressiveList items={nearMatch.temporalEvidence.inactivePatterns} resetKey={nearMatch} label="relazioni inattive" let:item>
                  <span>Nessun record attivo all'istante scelto: {item.sourceRole} —{item.edgeType}→ {item.targetRole}</span>
                </ProgressiveList>
                <ProgressiveList items={nearMatch.temporalEvidence.orderViolations} resetKey={nearMatch} label="inversioni temporali" let:item>
                  <span>Ordine invertito tra relazioni {item.firstIndex} e {item.secondIndex}</span>
                </ProgressiveList>
                <ProgressiveList items={nearMatch.temporalEvidence.supportingEdges} resetKey={nearMatch} label="relazioni temporali" let:item>
                  {#if item.edgeIds.length > 0}
                  <span>
                    Supporto temporale {item.sourceRole} —{item.edgeType}→ {item.targetRole} · {item.edgeIds.length} record d'arco
                    {#if item.startTimeValue !== undefined} · inizio {displayMappedGraphTime(item.startTimeValue)}{/if}
                  </span>
                  <details class="edge-record-evidence">
                    <summary>Mostra ID e fonti dei record</summary>
                    <ProgressiveList items={item.edgeIds} resetKey={item} label="record d'arco" let:item={edgeId}>
                      <span><code>{edgeId}</code></span>
                      <ProvenanceReferences
                        references={provenanceReferencesForEdge(edgeId)}
                        fallback={provenanceForEdge(edgeId)}
                        resetKey={edgeId}
                      />
                    </ProgressiveList>
                  </details>
                  {/if}
                </ProgressiveList>
              {/if}
                </div>
              {/if}
            </details>
          </li>
        {/each}
      </ul>
      <ResultListPager
        total={nearMatches.length}
        visible={visibleNearMatches.length}
        pageSize={100}
        label="diagnosi"
        showMore={() => visibleNearMatchLimit += 100}
      />
      <small>
        È una spiegazione strutturale ordinata dal criterio dichiarato: non propone di aggiungere archi e non attribuisce loro significato causale.
        {#if nearMatches[0].temporalEvidence}
          Per co-validità il tempo è scelto fra gli estremi degli intervalli mappati; per l’ordine le sequenze individuate riducono le inversioni consecutive. L’ottimo temporale descrive una realizzazione del motivo, non un intervento causale.
        {/if}
      </small>
    {/if}
    {:else if ["typedMotif", "motifScenarioComparison", "motifCount", "motifNearMatch", "motifCounterfactual"].includes(activeAnalysisKind) || (!activeAnalysisKind && !signedTriadsEnabled && !contextualCliqueConfig)}
      <div class="readiness empty-motif-configuration" role="status">
        <p>Nessun motivo tipizzato è configurato. Per avviare un’analisi di motivi, aggiungi un modello in Dati.</p>
        <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Configura motivi in Dati</button>
      </div>
    {/if}

    {#if contextualCliqueConfig}
      <ContextualCliquePanel
        config={contextualCliqueConfig}
        running={running}
        available={contextualCliqueAvailable}
        requirementReasons={contextualCliqueRequirementReasons}
        bind:selectedGroup={contextualCliqueGroup}
        bind:enumerateAllOptima={contextualCliqueEnumerateAllOptima}
        results={contextualCliqueResults}
        hasRun={contextualCliqueHasRun}
        error={contextualCliqueError}
        timeMs={contextualCliqueTimeMs}
        graphNodesCount={graphNodesCount}
        graphEdgesCount={graphEdgesCount}
        {availableGroups}
        {nodeLabelById}
        on:run={(event) => dispatch("runContextualClique", event.detail)}
        on:clear={() => dispatch("clearContextualClique")}
        on:criteriaChange={() => dispatch("clearContextualClique")}
        on:highlight={(event) => dispatch("highlightContextualClique", event.detail)}
        on:openData={() => dispatch("openData")}
      />
    {/if}

    {#if signedTriadsEnabled}
      <section class="signed-triad-section" aria-label="Bilanciamento delle triadi firmate">
        <div class="signed-triad-heading">
          <div>
            <h4>Bilanciamento delle triadi firmate</h4>
            <small>
              Attributo: <code>{signedTriadAttribute}</code>; valori positivi: <code>{JSON.stringify(signedTriadPositiveValues)}</code>; valori negativi: <code>{JSON.stringify(signedTriadNegativeValues)}</code>; tipi di arco: <code>{signedTriadEdgeTypes.length ? JSON.stringify(signedTriadEdgeTypes) : "tutti"}</code>. Una triade è bilanciata quando contiene un numero pari di dyadi negative; la classificazione descrive la struttura configurata e non inferisce sentimenti o causalità.
            </small>
          </div>
        </div>
        {#if signedTriadContract}
          <details class="signed-triad-contract">
            <summary>Regole di classificazione</summary>
            <p>{signedTriadContract.querySemantics}</p>
            <small>
              {getTaskEnumerationDescription("signedTriads")} · encoding: {signedTriadContract.aspEncoding} v{signedTriadContract.encodingVersion} ·
              dati di ingresso: {signedTriadContract.inputPredicates.join(", ")} · risultato: {signedTriadContract.witnessPredicates.join(", ")} ·
              parser: {signedTriadContract.parser}.
            </small>
          </details>
        {/if}
        <div class="controls">
          <label>
            Gruppo
            <SearchableNodeSelect
              id="signed-triad-group"
              bind:value={signedTriadGroup}
              options={searchableGroupOptions}
              ariaLabel="Cerca un gruppo per le triadi firmate"
              placeholder="Tutti i nodi"
              disabledDescriptionId={running ? "analysis-in-progress-status" : undefined}
              disabled={running}
              on:change={clearSignedTriadResults}
            />
          </label>
          <button type="button" class="run" on:click={runSignedTriads} aria-describedby={signedTriadActionDescriptionIds} disabled={running || !signedTriadRequirementsAvailable}>
            {running && activeAnalysisKind === "signedTriads" ? "Classificazione in corso…" : "Classifica le triadi"}
          </button>
          <details class="scenario-comparison-options" open={signedTriadScenarioComparison !== null || pendingScenarioComparison === "signedTriads"}>
            <summary>
              <span>Confronto tra scenari</span>
              <span class="scenario-comparison-status">{provenanceScenarioCount === 0 ? "non configurato" : `${provenanceScenarioCount} ${provenanceScenarioCount === 1 ? "scenario" : "scenari"}`}</span>
            </summary>
            <div class="scenario-comparison-body">
              {#if provenanceScenarioCount > 0}
                <button type="button" class="run scenario-run" class:running={pendingScenarioComparison === "signedTriads"} on:click={compareSignedTriadScenarios} aria-describedby={signedTriadScenarioDescriptionIds} disabled={running || !signedTriadScenarioComparisonAvailable}>
                  {pendingScenarioComparison === "signedTriads" ? "Confronto in corso…" : "Confronta le triadi tra scenari"}
                </button>
                {#if !signedTriadScenarioComparisonAvailable}
                  <small id="signed-triad-scenario-readiness" class="field-note scenario-readiness-note" role="status" aria-live="polite">{signedTriadScenarioComparisonRequirementReason}</small>
                  <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Apri Dati e configurazione scenari</button>
                {/if}
              {:else}
                <small class="field-note scenario-readiness-note">Definisci almeno due scenari per confrontare le triadi.</small>
                <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Configura scenari</button>
              {/if}
            </div>
          </details>
        </div>
        <div id="signed-triad-readiness" class="readiness" role="status">
          <strong>{signedTriadRequirementsAvailable ? "Prerequisiti disponibili" : "Prerequisiti non soddisfatti"}</strong>
          <span>{graphNodesCount} nodi · {graphEdgesCount} archi visibili</span>
          {#if signedTriadRequirementReasons.length > 0}
            <div class="readiness-reasons">
              <ProgressiveList items={signedTriadRequirementReasons} label="prerequisiti delle triadi" let:item>
                <div>{item}</div>
              </ProgressiveList>
            </div>
            <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Apri Dati e mappatura</button>
          {/if}
        </div>
        <small>I record paralleli concordi contano come una diade; record discordanti o segni mancanti impediscono il calcolo.</small>
        <details class="triad-record-details">
          <summary>Dettagli su record e proiezione</summary>
          <p>I record concordi conservano tutti gli ID sorgente. I cappi sono esclusi dai triangoli e i filtri correnti definiscono il grafo esaminato.</p>
        </details>

        {#if signedTriadError}
          <AnalysisErrorMessage message={signedTriadError} />
        {/if}
        {#if signedTriadHasRun}
          <div class="summary" role="status">
            <strong>{signedTriadSummary.completeTriadCount}</strong> triadi complete · {signedTriadSummary.balancedTriadCount} bilanciate · {signedTriadSummary.unbalancedTriadCount} non bilanciate · quota bilanciata:
            {#if signedTriadSummary.balancedShare === null}
              n/d
            {:else}
              {formatItalianNumber(signedTriadSummary.balancedShare * 100, 1)}%
            {/if}
            <small>La quota è calcolata solo sui triangoli completi classificati nella proiezione corrente.</small>
            {#if signedTriadTimeMs !== undefined}<span> · {formatItalianNumber(signedTriadTimeMs, 1)} ms</span>{/if}
            {#if signedTriadResults.length === 0}<p>La proiezione corrente non contiene triangoli completi.</p>{/if}
          </div>
        {/if}
        {#if signedTriadHasRun && !signedTriadError && signedTriadResults.length === 0}
          <div class="signed-triad-next-step">
            <p>Se ti aspettavi triadi, controlla i filtri correnti e la mappatura di polarità e tipi di arco.</p>
            <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Rivedi Dati e mappatura</button>
          </div>
        {/if}
        {#if signedTriadResults.length > 0}
          <div class="results-heading">
            <strong>Triadi classificate per polarità</strong>
            <button type="button" on:click={exportSignedTriads}>Esporta CSV</button>
          </div>
          {#if signedTriadFocusedKey}
            <div class="signed-triad-focus-status" role="status">
              Focus 3D attivo: nodi e collegamenti fuori dalla triade selezionata sono nascosti solo nella vista; dati e risultati restano invariati.
              <button type="button" on:click={clearSignedTriadFocus}>Mostra rete completa</button>
            </div>
          {/if}
          <ul class="results">
            {#each visibleSignedTriads as triad, index (`${triad.nodeIds.join("|")}-${index}`)}
              <li class="signed-triad-item">
                <button type="button" class="match signed-triad-match" aria-pressed={selectedSignedTriadKey === signedTriadResultKey(triad)} on:click={() => highlightSignedTriadResult(triad)}>
                  <strong>{index + 1}. {triad.balanced ? "Bilanciata" : "Non bilanciata"} · {triad.negativeDyadCount} dyadi negative</strong>
                  <span>{triad.nodeIds.map(signedTriadNodeDisplay).join(" · ")}</span>
                  {#each triad.dyads as dyad}
                    {@const evidenceKey = signedTriadDyadEvidenceKey(triad.nodeIds, "current", dyad)}
                    {@const visibleEdgeRecords = visibleSignedTriadEdgeRecords(evidenceKey, dyad.edgeRecords)}
                    <span>{signedTriadNodeDisplay(dyad.sourceNodeId)} — {dyad.polarity} — {signedTriadNodeDisplay(dyad.targetNodeId)}: {visibleEdgeRecords.map((record) => record.id).join(", ")}</span>
                  {/each}
                </button>
                <button
                  type="button"
                  class="signed-triad-focus"
                  class:active={signedTriadFocusedKey !== "" && signedTriadFocusedKey === triad.nodeIds.join("\u0000")}
                  aria-pressed={signedTriadFocusedKey !== "" && signedTriadFocusedKey === triad.nodeIds.join("\u0000")}
                  on:click={() => signedTriadFocusedKey !== "" && signedTriadFocusedKey === triad.nodeIds.join("\u0000")
                    ? clearSignedTriadFocus()
                    : focusSignedTriad(triad)}
                >
                  {signedTriadFocusedKey !== "" && signedTriadFocusedKey === triad.nodeIds.join("\u0000")
                    ? "Ripristina rete in 3D"
                    : "Isola triade in 3D"}
                </button>
                {#each triad.dyads as dyad}
                  {@const evidenceKey = signedTriadDyadEvidenceKey(triad.nodeIds, "current", dyad)}
                  {@const visibleEdgeRecords = visibleSignedTriadEdgeRecords(evidenceKey, dyad.edgeRecords)}
                  <ResultListPager
                    total={dyad.edgeRecords.length}
                    visible={visibleEdgeRecords.length}
                    pageSize={scenarioDetailPageSize}
                    label="record d'arco della relazione"
                    showMore={() => showMoreSignedTriadEdgeRecords(evidenceKey)}
                  />
                {/each}
              </li>
            {/each}
          </ul>
          <ResultListPager
            total={signedTriadResults.length}
            visible={visibleSignedTriads.length}
            pageSize={100}
            label="triadi"
            showMore={() => visibleSignedTriadLimit += 100}
          />
          <small>Seleziona una triade per evidenziare i suoi tre nodi e i record che sostengono ciascuna dyade. L’esportazione include tutti i risultati, anche quelli oltre l’elenco visibile.</small>
        {/if}

        {#if signedTriadScenarioComparisonProgress}
          <div class="status" role="status">{signedTriadScenarioComparisonProgress}</div>
        {/if}
        {#if signedTriadScenarioComparisonError}
          <AnalysisErrorMessage message={signedTriadScenarioComparisonError} />
        {/if}
        {#if signedTriadScenarioComparison}
          <section class="signed-triad-scenario-comparison" aria-label="Stabilità delle triadi firmate tra scenari">
            <div class="summary" role="status">
              <strong>{stableBalancedScenarioTriadCount}</strong> bilanciate in tutti gli scenari ·
              <strong>{stableUnbalancedScenarioTriadCount}</strong> non bilanciate in tutti gli scenari ·
              <strong>{variableScenarioTriadCount}</strong> con esito variabile<br />
              {signedTriadScenarioComparison.scenarios.length} scenari confrontati ·
              {signedTriadScenarioComparison.memberships.length} triadi classificate in almeno uno scenario
              {#if signedTriadScenarioComparisonTimeMs !== undefined}<span> · {formatItalianNumber(signedTriadScenarioComparisonTimeMs, 1)} ms</span>{/if}
            </div>
            <GraphFilterSummary
              types={signedTriadScenarioComparison.queryScope.viewFilters.types}
              groups={signedTriadScenarioComparison.queryScope.viewFilters.groups}
              degreeFilters={signedTriadScenarioComparison.queryScope.viewFilters.degreeFilters}
            />
            <div class="results-heading">
              <strong>Stabilità e classificazioni per scenario</strong>
              <button type="button" on:click={exportSignedTriadScenarioComparison}>Esporta CSV</button>
            </div>
            <div class="signed-triad-world-summaries" aria-label="Riepilogo bilanciamento per scenario">
              {#each visibleSignedTriadScenarioSummaries as scenario (scenario.scenarioId)}
                <div class="signed-triad-world-summary">
                  <strong>{scenario.scenarioLabel}</strong>
                  <span>{scenario.classifiedTriads} triangoli completi · {scenario.balancedTriads} bilanciati · {scenario.unbalancedTriads} non bilanciati</span>
                  <span>Quota bilanciata:
                    {#if scenario.balancedShare === null}
                      n/d
                    {:else}
                      {formatItalianNumber(scenario.balancedShare * 100, 1)}%
                    {/if}
                  </span>
                  <span>{scenario.commonTriads} triangoli classificati in tutti gli scenari · quota bilanciata sul nucleo comune:
                    {#if scenario.balancedCommonShare === null}
                      n/d
                    {:else}
                      {formatItalianNumber(scenario.balancedCommonShare * 100, 1)}%
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
            <ResultListPager
              total={signedTriadScenarioComparison.scenarios.length}
              visible={visibleSignedTriadScenarioSummaries.length}
              pageSize={scenarioDetailPageSize}
              label="riepiloghi di scenario"
              showMore={() => visibleSignedTriadScenarioSummaryLimit += scenarioDetailPageSize}
            />
            <small>“Non classificata” non significa “non bilanciata”.</small>
            {#if signedTriadScenarioComparison.memberships.length === 0}
              <div class="signed-triad-next-step">
                <p>Nessuna triade completa è stata classificata in alcuno scenario.</p>
                <small>Se il risultato è inatteso, rivedi tipi e polarità degli archi, scenari e filtri in Dati.</small>
                <button type="button" class="readiness-action" on:click={() => dispatch("openData")}>Rivedi tipi, polarità e scenari in Dati</button>
              </div>
            {:else}
              <ul class="results signed-triad-scenario-results">
                {#each visibleSignedTriadScenarioMemberships as membership (membership.nodeIds.join("\u0000"))}
                  {@const visibleWorlds = visibleSignedTriadWorlds(membership)}
                  <li class="signed-triad-scenario-item">
                    <strong>{signedTriadStabilityLabel(membership.stability)}</strong>
                    <span>{membership.nodeIds.map(signedTriadNodeDisplay).join(" · ")}</span>
                    <details>
                      <summary>Esito e relazioni presenti per scenario</summary>
                      <ul>
                        {#each visibleWorlds as world (world.scenarioId)}
                          <li>
                            <strong>{world.scenarioLabel}: {signedTriadWorldStatusLabel(world.classification)}</strong>
                            {#if world.evidence}
                              <div class="signed-triad-world-evidence">
                                {#each world.evidence.dyads as dyad}
                                  {@const evidenceKey = signedTriadDyadEvidenceKey(membership.nodeIds, world.scenarioId, dyad)}
                                  {@const visibleEdgeRecords = visibleSignedTriadEdgeRecords(evidenceKey, dyad.edgeRecords)}
                                  <div class="signed-triad-dyad-evidence">
                                    <span>{signedTriadNodeDisplay(dyad.sourceNodeId)} — {dyad.polarity} — {signedTriadNodeDisplay(dyad.targetNodeId)}: {visibleEdgeRecords.map((record) => record.id).join(", ")}</span>
                                    <ResultListPager
                                      total={dyad.edgeRecords.length}
                                      visible={visibleEdgeRecords.length}
                                      pageSize={scenarioDetailPageSize}
                                      label="record d'arco della relazione"
                                      showMore={() => showMoreSignedTriadEdgeRecords(evidenceKey)}
                                    />
                                  </div>
                                {/each}
                              </div>
                              <button
                                type="button"
                                class="inspect-signed-triad-scenario"
                                aria-describedby={running ? "analysis-in-progress-status" : undefined}
                                disabled={running}
                                on:click={() => inspectSignedTriadScenarioWitness(world.scenarioId, world.evidence)}
                              >
                                Mostra questa triade nello scenario
                              </button>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                      <ResultListPager
                        total={membership.worlds.length}
                        visible={visibleWorlds.length}
                        pageSize={scenarioDetailPageSize}
                        label="scenari per questa triade"
                        showMore={() => showMoreSignedTriadWorlds(membership)}
                      />
                    </details>
                  </li>
                {/each}
              </ul>
              <ResultListPager
                total={signedTriadScenarioComparison.memberships.length}
                visible={visibleSignedTriadScenarioMemberships.length}
                pageSize={100}
                label="triadi"
                showMore={() => visibleSignedTriadScenarioLimit += 100}
              />
            {/if}
            <small>Le quote descrivono gli scenari configurati, non probabilità o affidabilità delle fonti.</small>
            <details class="scenario-interpretation">
              <summary>Come leggere quote e classificazioni</summary>
              <p>
                La prima quota usa i triangoli completi classificati in ciascuno scenario. La quota sul nucleo comune usa soltanto gli stessi ID di triade, classificati in tutti gli scenari; n/d indica un'intersezione vuota. Le triadi assenti dall'unione osservata restano non classificate.
                Una triade è confrontata tramite i tre ID sorgente indipendentemente dall'ordine. “Non classificata” indica che lo scenario non ha prodotto una classificazione per quella tripla. Sono elencate solo le triadi classificate in almeno uno scenario. L'esito presuppone che gli scenari configurati includano tutti i casi da considerare.
              </p>
            </details>
          </section>
        {/if}
      </section>
    {/if}
  </section>
{/if}

<style>
  .motif-panel {
    position: absolute;
    top: var(--solver-top);
    right: var(--solver-right);
    z-index: var(--solver-z);
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: var(--solver-width);
    max-height: var(--solver-max-height);
    overflow: auto;
    box-sizing: border-box;
    padding: var(--solver-padding);
    border-radius: var(--solver-radius);
    background: var(--solver-bg);
    box-shadow: var(--solver-shadow);
    color: #0f172a;
    font: 13px/1.45 Arial, Helvetica, sans-serif;
  }

  header,
  .results-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  h3,
  header p,
  .summary p {
    margin: 0;
  }

  .induced-edge-types {
    margin-top: 5px;
    color: #475569;
  }

  .induced-edge-types summary {
    cursor: pointer;
    font-size: 12px;
  }

  .induced-edge-type {
    display: block;
    margin-top: 4px;
  }

  header p,
  small {
    color: #475569;
  }

  .motif-configuration-note {
    margin: 0;
    color: #64748b;
    font-size: 11px;
    line-height: 1.35;
  }

  .close {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 22px;
  }

  .controls {
    display: grid;
    gap: 8px;
  }

  .scenario-comparison-options {
    grid-column: 1 / -1;
    display: grid;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #dbe3ed;
    border-radius: 8px;
    background: #f8fafc;
  }

  .scenario-comparison-options > summary {
    display: flex;
    min-height: 28px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: #334155;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    list-style-position: inside;
  }

  .scenario-comparison-options > summary:focus-visible {
    outline: 2px solid #0284c7;
    outline-offset: 2px;
    border-radius: 4px;
  }

  .scenario-comparison-status {
    color: #64748b;
    font-size: 10px;
    font-weight: 550;
  }

  .scenario-comparison-body {
    display: grid;
    gap: 8px;
  }

  .scenario-readiness-note {
    display: block;
    margin: 0;
    padding: 6px 8px;
    border-radius: 6px;
    background: #fff7e6;
    color: #75542d;
  }

  .signed-triad-section {
    display: grid;
    gap: 9px;
    padding-top: 12px;
    border-top: 1px solid #cbd5e1;
  }

  .signed-triad-scenario-comparison {
    display: grid;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid #cbd5e1;
  }

  .signed-triad-scenario-item {
    display: grid;
    gap: 5px;
    min-width: 0;
    padding: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
    overflow-wrap: anywhere;
  }

  .signed-triad-world-summaries {
    display: grid;
    gap: 5px;
  }

  .signed-triad-world-summary {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding: 7px;
    border: 1px solid #cbd5e1;
    border-radius: 5px;
    background: #f8fafc;
    overflow-wrap: anywhere;
  }

  .signed-triad-scenario-item details > ul {
    display: grid;
    gap: 5px;
    margin: 5px 0 0;
    padding-left: 18px;
  }

  .signed-triad-scenario-item details summary {
    cursor: pointer;
    color: #334155;
  }

  .signed-triad-world-evidence {
    display: grid;
    gap: 3px;
    margin-top: 3px;
  }

  .signed-triad-dyad-evidence > span {
    display: block;
    overflow-wrap: anywhere;
  }

  .inspect-signed-triad-scenario {
    justify-self: start;
    margin-top: 4px;
    padding: 4px 6px;
    border: 1px solid #a5b4fc;
    border-radius: 4px;
    background: #fff;
    color: #1e3a8a;
    cursor: pointer;
  }

  .signed-triad-contract {
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #f8fafc;
  }

  .signed-triad-contract summary {
    cursor: pointer;
    font-weight: 650;
  }

  .signed-triad-contract p {
    margin: 5px 0;
  }

  .signed-triad-contract small {
    color: #475569;
  }

  .signed-triad-heading h4 {
    margin: 0 0 3px;
  }

  .signed-triad-heading small,
  .signed-triad-section > small {
    color: #475569;
  }

  .signed-triad-match {
    background: #f0fdf4;
  }

  .signed-triad-item {
    display: grid;
    gap: 4px;
  }

  .signed-triad-focus,
  .signed-triad-focus-status button {
    justify-self: start;
    padding: 5px 8px;
    border: 1px solid #94a3b8;
    border-radius: 5px;
    background: #f8fafc;
    color: #0f172a;
    cursor: pointer;
  }

  .signed-triad-focus.active {
    border-color: #7c3aed;
    background: #ede9fe;
  }

  .signed-triad-focus-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
    padding: 7px;
    border-radius: 5px;
    background: #f5f3ff;
    color: #4c1d95;
  }

  label {
    display: grid;
    grid-template-columns: 90px 1fr;
    align-items: center;
    gap: 8px;
  }

  button {
    font: inherit;
  }

  .run {
    min-height: 36px;
    padding: 7px 10px;
    border: 1px solid #1e645d;
    border-radius: 8px;
    background: #1e645d;
    color: #fff;
    font-weight: 650;
    cursor: pointer;
  }

  .run:hover:not(:disabled) {
    border-color: #174f49;
    background: #174f49;
  }

  .run.scenario-run {
    border-color: #9abbb5;
    background: #fff;
    color: #174d47;
  }

  .scenario-run {
    min-height: 36px;
    padding: 7px 10px;
    border: 1px solid #9abbb5;
    border-radius: 8px;
    background: #fff;
    color: #174d47;
    cursor: pointer;
  }

  .scenario-run:hover:not(:disabled) {
    border-color: #1e645d;
    background: #eff7f5;
  }

  .scenario-run.running:disabled {
    background: #e6f1ef;
    color: #174d47;
    opacity: 1;
  }

  .results-heading button {
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
    color: #0f172a;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .readiness {
    display: grid;
    gap: 3px;
    padding: 8px;
    border-radius: 6px;
    background: #f1f5f9;
  }

  .empty-motif-configuration p { margin: 0; }

  .readiness span {
    color: #475569;
  }

  .readiness-reasons {
    display: grid;
    gap: 3px;
    max-height: 140px;
    overflow: auto;
    overflow-wrap: anywhere;
  }

  .configured-constraint-list {
    display: grid;
    gap: 4px;
    color: #475569;
    font-size: 0.82rem;
  }

  .readiness-action {
    justify-self: start;
    min-height: 30px;
    padding: 5px 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #fff;
    color: #0f172a;
    font: inherit;
    font-weight: 650;
  }

  .signed-triad-next-step {
    display: grid;
    justify-items: start;
    gap: 7px;
    margin: 8px 0;
    padding: 9px;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    background: #fff;
  }

  .signed-triad-next-step p {
    margin: 0;
    color: #475569;
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .readiness-action:focus-visible {
    outline: 3px solid #0284c7;
    outline-offset: 2px;
  }

  .summary {
    padding: 9px;
    border-radius: 7px;
    background: #eff6ff;
  }

  .results {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .near-match-controls {
    display: grid;
    gap: 5px;
    padding: 8px;
    border-radius: 6px;
    background: #fefce8;
  }

  .counterfactual-controls {
    display: grid;
    gap: 5px;
    padding: 8px;
    border-radius: 6px;
    background: #f0fdf4;
  }

  .counterfactual-controls button {
    justify-self: start;
    padding: 6px 8px;
  }

  .near-match-controls button {
    justify-self: start;
    padding: 6px 8px;
  }

  .near-matches {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .results > li,
  .near-match {
    overflow: hidden;
    border: 1px solid #dbe3ee;
    border-radius: 7px;
    background: #fff;
  }

  .match {
    display: grid;
    gap: 3px;
    width: 100%;
    padding: 8px;
    border: 0;
    border-radius: 5px;
    background: #eef2ff;
    color: inherit;
    text-align: left;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .scenario-membership {
    cursor: default;
  }

  .world-witnesses {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 3px;
  }

  .world-witnesses button {
    padding: 4px 6px;
    border: 1px solid #a5b4fc;
    border-radius: 4px;
    background: #fff;
    color: #1e3a8a;
    cursor: pointer;
  }

  .role-assignment-details {
    min-width: 0;
    font-size: 0.82rem;
  }

  .role-assignment-details > summary {
    width: fit-content;
    cursor: pointer;
    font-weight: 600;
  }

  .scenario-interpretation {
    color: #475569;
    font-size: 0.78rem;
  }

  .scenario-interpretation > summary {
    width: fit-content;
    cursor: pointer;
    font-weight: 600;
  }

  .scenario-interpretation > summary:focus-visible {
    outline: 2px solid #176b80;
    outline-offset: 2px;
    border-radius: 3px;
  }

  .scenario-interpretation > p {
    margin: 5px 0 0;
  }

  .instance-interpretation {
    color: #475569;
    font-size: 0.78rem;
  }

  .instance-interpretation > summary {
    width: fit-content;
    cursor: pointer;
    font-weight: 600;
  }

  .instance-interpretation > summary:focus-visible {
    outline: 2px solid #176b80;
    outline-offset: 2px;
    border-radius: 3px;
  }

  .instance-interpretation > p {
    margin: 5px 0 0;
  }

  .triad-record-details {
    color: #475569;
    font-size: 0.78rem;
  }

  .triad-record-details > summary {
    width: fit-content;
    cursor: pointer;
    font-weight: 600;
  }

  .triad-record-details > summary:focus-visible {
    outline: 2px solid #176b80;
    outline-offset: 2px;
    border-radius: 3px;
  }

  .triad-record-details > p {
    margin: 5px 0 0;
  }

  .counterfactual-evidence-details {
    color: #475569;
    font-size: 0.78rem;
  }

  .counterfactual-evidence-details > summary {
    width: fit-content;
    cursor: pointer;
    font-weight: 600;
  }

  .counterfactual-evidence-details > summary:focus-visible {
    outline: 2px solid #176b80;
    outline-offset: 2px;
    border-radius: 3px;
  }

  .counterfactual-evidence-details > p {
    margin: 5px 0 0;
  }

  .role-assignment-list {
    display: grid;
    gap: 3px;
    max-height: 140px;
    overflow: auto;
    padding: 5px 0;
    overflow-wrap: anywhere;
  }

  .match:hover {
    background: #e0e7ff;
  }

  .match[aria-pressed="true"] {
    background: #ccfbf1;
    outline: 2px solid #0f766e;
    outline-offset: -2px;
  }

  .result-evidence {
    margin: 0 8px 7px;
    color: #334155;
    font-size: 0.78rem;
  }

  .result-evidence summary {
    width: fit-content;
    color: #334155;
    cursor: pointer;
    font-weight: 600;
  }

  .result-evidence summary:focus-visible {
    outline: 2px solid #176b80;
    outline-offset: 2px;
  }

  .edge-record-evidence {
    margin: 3px 0 2px 12px;
    color: #475569;
  }

  .edge-record-evidence summary {
    width: fit-content;
    cursor: pointer;
  }

  .edge-record-evidence code {
    overflow-wrap: anywhere;
  }

  .result-evidence-content {
    display: grid;
    gap: 4px;
    margin-top: 7px;
    padding: 8px;
    border-radius: 5px;
    background: #f8fafc;
    overflow-wrap: anywhere;
  }

  @media (max-width: 1280px) {
    .motif-panel {
      right: 12px;
      width: min(var(--solver-width), calc(100vw - 24px));
      top: calc(var(--toolbar-top) + var(--toolbar-height, 180px) + 10px);
      max-height: calc(100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px - var(--mobile-status-reserve, 48px));
    }
  }
</style>
