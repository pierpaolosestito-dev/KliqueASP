<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { csvCell, downloadCsvText } from "../csvExport";
  import WorkerMemoryReadout from "./WorkerMemoryReadout.svelte";
  import ContextualCliquePanel from "./ContextualCliquePanel.svelte";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
  import type { GraphContextualCliqueConfig, GraphJsonScalar, GraphMotifTemplate } from "../graph/graphModel";
  import type { ContextualCliqueResult } from "../graph/contextualCliqueTask";
  import type { TypedMotifMatch, TypedMotifNearMatch, TypedMotifCounterfactual } from "../graph/motifTask";
  import {
    resolveTypedMotifCountPartitionDomainForSemantics,
    type TypedMotifCountPartitionProgress
  } from "../graph/motifCountTask";
  import { summarizeSignedTriads, type SignedTriadResult } from "../graph/signedTriadTask";
  import { buildSignedTriadCsv } from "../graph/signedTriadCsvExport";
  import {
    buildSignedTriadScenarioCsv,
    type SignedTriadScenarioComparison,
    type SignedTriadScenarioStability
  } from "../graph/signedTriadScenarioAnalysis";
  import { summarizeEdgeProvenance } from "../graph/structuralTasks";
  import { getOwnRecordValue } from "../graph/recordUtils";
  import { getGraphTaskContract, getTaskEnumerationDescription } from "../graph/graphTaskContracts";
  import {
    buildProvenanceScenarioMotifCsv,
    type ProvenanceMotifScenarioComparison
  } from "../graph/motifScenarioAnalysis";

  export let open = false;
  export let running = false;
  export let error = "";
  export let hasRun = false;
  export let templates: GraphMotifTemplate[] = [];
  export let selectedTemplateIndex = "0";
  export let selectedGroup = "";
  export let availableGroups: string[] = [];
  export let matches: TypedMotifMatch[] = [];
  export let scenarioComparisonAvailable = false;
  export let scenarioComparisonProgress = "";
  export let scenarioComparisonError = "";
  export let scenarioComparison: ProvenanceMotifScenarioComparison | null = null;
  export let scenarioComparisonTimeMs: number | undefined;
  export let motifCount: string | undefined = undefined;
  export let motifCountHasRun = false;
  export let motifCountError = "";
  export let motifCountTimeMs: number | undefined;
  export let motifCountPartitionCount: number | undefined;
  export let motifCountPartitionSize: number | undefined;
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

  let visibleLimit = 100;
  let visibleScenarioMembershipLimit = 100;
  let visibleSignedTriadLimit = 100;
  let visibleSignedTriadScenarioLimit = 100;
  const dispatch = createEventDispatcher();
  const signedTriadContract = getGraphTaskContract("signedTriads");
  $: selectedTemplate = templates[Number(selectedTemplateIndex)];
  $: visibleMatches = matches.slice(0, visibleLimit);
  $: visibleSignedTriads = signedTriadResults.slice(0, visibleSignedTriadLimit);
  $: signedTriadSummary = summarizeSignedTriads(signedTriadResults);
  $: visibleSignedTriadScenarioMemberships = signedTriadScenarioComparison?.memberships.slice(0, visibleSignedTriadScenarioLimit) ?? [];
  $: stableBalancedScenarioTriadCount = signedTriadScenarioComparison?.memberships.filter((entry) => entry.stability === "stable-balanced").length ?? 0;
  $: stableUnbalancedScenarioTriadCount = signedTriadScenarioComparison?.memberships.filter((entry) => entry.stability === "stable-unbalanced").length ?? 0;
  $: variableScenarioTriadCount = (signedTriadScenarioComparison?.memberships.length ?? 0) - stableBalancedScenarioTriadCount - stableUnbalancedScenarioTriadCount;
  $: scenarioComparisonCautiousCount = scenarioComparison?.memberships.filter((entry) => entry.status === "brave-and-cautious").length ?? 0;
  $: scenarioComparisonBraveOnlyCount = scenarioComparison?.memberships.filter((entry) => entry.status === "brave-only").length ?? 0;
  $: selectedTemporalSemantics = selectedTemplate?.temporal?.semantics;
  $: selectedCountPartitionDomain = resolveTypedMotifCountPartitionDomainForSemantics(selectedTemporalSemantics);
  $: selectedStrictTemporalOrder = selectedTemplate?.temporal?.semantics === "orderedByStart" &&
    selectedTemplate.temporal.strict === true;
  $: selectedIsTemporal = selectedTemporalSemantics !== undefined;
  $: selectedInducedEdgeTypes = selectedTemplate?.inducedEdgeTypes ?? [];
  $: selectedHasAbsenceConditions = Boolean(selectedTemplate?.absentEdges?.length || selectedInducedEdgeTypes.length);
  $: selectedHasInducedConditions = selectedInducedEdgeTypes.length > 0;
  $: selectedAbsenceSemanticsUnsupported = selectedHasAbsenceConditions && selectedIsTemporal;
  $: selectedRequirementsAvailable = requirementsAvailable &&
    (!selectedIsTemporal || temporalRequirementsAvailable) && !selectedAbsenceSemanticsUnsupported;
  $: selectedRequirementReasons = !requirementsAvailable
    ? requirementReasons
    : selectedAbsenceSemanticsUnsupported
      ? ["I vincoli di assenza sono disponibili solo per template statici; i template temporali richiedono una semantica esplicita di assenza nel tempo."]
    : selectedIsTemporal && !temporalRequirementsAvailable
      ? temporalRequirementReasons
      : [];

  function displayMappedTime(value: number): string {
    if (Math.abs(value) < 100_000_000_000) return String(value);
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
  }

  function formatAttributeConstraints(attributes?: Record<string, GraphJsonScalar>): string {
    if (!attributes) return "";
    return Object.entries(attributes).map(([alias, value]) => `${alias}=${JSON.stringify(value)}`).join(", ");
  }

  function provenanceForEdges(edgeIds: string[]): string {
    return summarizeEdgeProvenance(edgeIds, edgeProvenanceBySourceId);
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
    dispatch("run", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function compareScenarios() {
    visibleScenarioMembershipLimit = 100;
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
    dispatch("runSignedTriads", { group: signedTriadGroup });
  }

  function compareSignedTriadScenarios() {
    visibleSignedTriadScenarioLimit = 100;
    dispatch("compareSignedTriadScenarios", { group: signedTriadGroup });
  }

  function clearSignedTriadResults() {
    visibleSignedTriadLimit = 100;
    dispatch("clearSignedTriads");
  }

  function focusSignedTriad(triad: SignedTriadResult) {
    dispatch("focusSignedTriad", triad);
  }

  function clearSignedTriadFocus() {
    dispatch("clearSignedTriadFocus");
  }

  function signedTriadNodeDisplay(nodeId: string): string {
    return `${nodeLabelByNodeId(nodeId)} (${sourceIdByNodeId[nodeId] ?? nodeId})`;
  }

  function nodeLabelByNodeId(nodeId: string): string {
    return nodeLabelById[nodeId] ?? nodeId;
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
    dispatch("diagnose", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function proposeCounterfactual() {
    visibleLimit = 100;
    dispatch("counterfactual", {
      templateIndex: Number(selectedTemplateIndex),
      group: selectedGroup
    });
  }

  function clearResults() {
    dispatch("clear");
  }

  function exportResults() {
    if (!matches.length) return;
    const rows: unknown[][] = [["motif_id", "time_value", "maximum_span", "role_assignments", "supporting_edges", "supporting_edge_provenance", "closed_world_scope", "induced_edge_types", "required_absences", "structured_witness_json"]];
    for (const match of matches) {
      rows.push([
        match.templateId,
        match.timeValue === undefined ? "" : displayMappedTime(match.timeValue),
        match.maximumSpan ? `${match.maximumSpan.value} ${match.maximumSpan.unit}` : "",
        Object.entries(match.roles).map(([role, node]) => `${role}=${node.sourceId}`).join(" | "),
        match.supportingEdges.map((edge) => {
          const edgeIds = edge.edgeIds.map((edgeId) => edge.startTimeValue === undefined
            ? edgeId
            : `${edgeId}@${displayMappedTime(edge.startTimeValue)}`);
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
        match.temporalEvidence?.timeValue === undefined ? "" : displayMappedTime(match.temporalEvidence.timeValue),
        match.temporalEvidence?.unavailablePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | ") ?? "",
        match.temporalEvidence?.inactivePatterns.map((pattern) => `${pattern.sourceRole}-${pattern.edgeType}-${pattern.targetRole}`).join(" | ") ?? "",
        match.temporalEvidence?.orderViolations.map((pair) => `${pair.firstIndex}->${pair.secondIndex}`).join(" | ") ?? "",
        match.temporalEvidence?.supportingEdges.map((edge) => {
          const records = edge.edgeIds.map((edgeId) => edge.startTimeValue === undefined
            ? edgeId
            : `${edgeId}@${displayMappedTime(edge.startTimeValue)}`);
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
          `${edge.id}: ${displayMappedTime(edge.validity!.from)}..${displayMappedTime(edge.validity!.to)}`
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
  <section class="motif-panel" aria-label="Analisi di motivi e triadi ASP">
    <header>
      <div>
        <h3>{templates.length > 0 ? signedTriadsEnabled ? "Motivi e triadi · ASP" : "Motivi relazionali · ASP" : "Triadi firmate · ASP"}</h3>
        {#if templates.length > 0}
          <p>
            {selectedHasInducedConditions
            ? `Le relazioni richieste devono esistere; il motivo è indotto rispetto ai tipi ${selectedInducedEdgeTypes.join(", ")} sulla proiezione filtrata. Il focus grafico non restringe i dati analizzati.`
            : selectedHasAbsenceConditions
            ? "Le relazioni richieste devono esistere e quelle elencate come assenti si valutano sotto mondo chiuso sulla proiezione filtrata. Il focus grafico non restringe i dati analizzati."
            : selectedTemporalSemantics === "coValid"
            ? "Gli archi testimoni condividono un istante di validità."
            : selectedTemporalSemantics === "orderedByStart"
              ? `Confronta gli inizi di validità nell’ordine degli archi dichiarato${selectedStrictTemporalOrder ? ", in modo stretto" : ", consentendo parità"}.`
              : "Assegnamenti dei ruoli e archi testimoni sulla proiezione filtrata corrente; il focus grafico modifica solo la vista."}
          </p>
        {/if}
      </div>
      <button type="button" class="close" aria-label="Chiudi" on:click={() => dispatch("close")}>×</button>
    </header>

    <WorkerMemoryReadout stats={workerWasmMemoryStats} {clingoTiming} showClingoTiming={showClingoTiming} {clingoStats} showClingoStats={showClingoStats} />

    {#if templates.length > 0}
    <div class="controls">
      <label>
        Template
        <select bind:value={selectedTemplateIndex} disabled={running || templates.length === 0} on:change={clearResults}>
          {#each templates as template, index (`${index}-${template.id}`)}
            <option value={String(index)}>{template.label ?? template.id}</option>
          {/each}
        </select>
      </label>
      <label>
        Gruppo
        <select bind:value={selectedGroup} disabled={running} on:change={clearResults}>
          <option value="">Tutti i nodi</option>
          {#each availableGroups as group}
            <option value={group}>{group}</option>
          {/each}
        </select>
      </label>
      <button type="button" class="run" on:click={run} disabled={running || !selectedTemplate || !selectedRequirementsAvailable}>
        {running ? "Solver in esecuzione…" : "Esegui motivo"}
      </button>
      <button type="button" on:click={count} disabled={running || !selectedTemplate || !selectedRequirementsAvailable}>
        {motifCountPartitionSize ? "Conta in partizioni" : "Conta istanze"}
      </button>
      {#if scenarioComparisonAvailable}
        <button type="button" on:click={compareScenarios} disabled={running || !selectedTemplate || !selectedRequirementsAvailable}>
          Confronta istanze sui mondi
        </button>
      {/if}
    </div>

    <div class="readiness" role="status">
      <strong>{selectedRequirementsAvailable ? "Prerequisiti disponibili" : "Prerequisiti dati mancanti"}</strong>
      <span>{graphNodesCount} nodi · {graphEdgesCount} archi visibili</span>
      {#if selectedRequirementReasons.length > 0}
        <ul>{#each selectedRequirementReasons as reason}<li>{reason}</li>{/each}</ul>
      {/if}
      {#if selectedTemplate?.edges.some((edge) => edge.attributes)}
        <span>Filtri esatti sugli attributi mappati degli archi:</span>
        <ul>
          {#each selectedTemplate.edges.filter((edge) => edge.attributes) as edge}
            <li>{edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {formatAttributeConstraints(edge.attributes)}</li>
          {/each}
        </ul>
      {/if}
      {#if selectedTemplate && Object.values(selectedTemplate.roles).some((role) => role.attributes)}
        <span>Filtri esatti sugli attributi mappati dei nodi:</span>
        <ul>
          {#each Object.entries(selectedTemplate.roles).filter(([, role]) => role.attributes) as [role, roleConfig]}
            <li>{role}: {formatAttributeConstraints(roleConfig.attributes)}</li>
          {/each}
        </ul>
      {/if}
    </div>

    {#if selectedHasAbsenceConditions}
      <div class="readiness" role="note">
        <strong>Ipotesi di mondo chiuso dichiarata nel template</strong>
        <span>
          Le assenze si riferiscono solo alla proiezione filtrata corrente. Il template dichiara completi i dati per queste relazioni tipizzate; i filtri attivi possono quindi cambiare il risultato. Il focus grafico non restringe i dati analizzati.
          {#if selectedHasInducedConditions} Per i tipi indotti ogni coppia di ruoli viene controllata nella direzione del grafo (incluse le relazioni verso sé stessi); tipi non elencati sono ignorati, salvo gli archi positivi esplicitamente richiesti.{/if}
        </span>
      </div>
    {/if}

    {#if !hasRun && !error}
      <small>
        {selectedTemporalSemantics === "orderedByStart"
          ? "Il task restituisce ogni sequenza valida di archi testimoni; la stessa assegnazione dei ruoli può produrre più sequenze se esistono archi paralleli."
          : "Il task cerca tutte le assegnazioni compatibili."}
        Template e gruppi provengono dalla configurazione; su grafi grandi il numero di modelli può crescere rapidamente.
      </small>
    {/if}

    <small>
      Il conteggio aggregato restituisce il numero esatto senza materializzare i singoli testimoni; non produce elementi da evidenziare. Anche il conteggio può richiedere molte risorse su grafi densi.
    </small>

    {#if motifCountPartitionSize}
      <small>
        {#if selectedCountPartitionDomain === "firstPatternEdge"}
          La configurazione divide il conteggio in blocchi da {motifCountPartitionSize} record del primo arco. Il conteggio distingue le sequenze temporali di record; il risultato appare solo dopo la verifica di tutte le partizioni.
        {:else}
          La configurazione divide il conteggio in blocchi da {motifCountPartitionSize} nodi assegnabili al primo ruolo. Così i diversi record di supporto della stessa assegnazione restano nella stessa partizione.
        {/if}
        Il budget totale è {motifCountMaxDurationMs?.toLocaleString("it-IT")} ms.
      </small>
    {/if}

    {#if motifCountProgress}
      <div class="readiness">
        <div role="progressbar" aria-label="Avanzamento del conteggio dei motivi"
          aria-valuemin="0" aria-valuemax={motifCountProgress.total} aria-valuenow={motifCountProgress.completed}>
          <strong>{motifCountProgress.completed}/{motifCountProgress.total} partizioni completate</strong>
          {#if motifCountProgress.completed < motifCountProgress.total}
            <span>
              {motifCountProgress.partitionDomain === "firstPatternEdge" ? "Record ASP del primo arco" : "Nodi ASP del primo ruolo"}:
              {motifCountProgress.indexRange[0]}–{motifCountProgress.indexRange[1]}
            </span>
          {/if}
        </div>
        {#if motifCountProgress.completed < motifCountProgress.total}
          <button type="button" on:click={() => dispatch("cancelCount")} disabled={!running || motifCountNotice.startsWith("Annullamento")}>
            {motifCountNotice.startsWith("Annullamento") ? "Annullamento in corso…" : "Interrompi conteggio"}
          </button>
        {/if}
      </div>
    {/if}

    {#if motifCountNotice}
      <div class="readiness" role="status">{motifCountNotice}</div>
    {/if}

    {#if motifCountError}
      <div class="error" role="alert">{motifCountError}</div>
    {/if}

    {#if motifCountHasRun && motifCount !== undefined}
      <div class="summary" role="status">
        <strong>{motifCount}</strong>
        {selectedTemporalSemantics === "orderedByStart"
          ? motifCount === "1" ? " sequenza temporale valida" : " sequenze temporali valide"
          : motifCount === "1" ? " istanza del template" : " istanze del template"}
        {#if motifCountPartitionCount !== undefined}
          {motifCountPartitionCount === 0 ? " · nessun record da partizionare" : ` · ${motifCountPartitionCount} partizioni ASP complete`}
        {/if}
        {#if motifCountTimeMs !== undefined}<span> · {motifCountTimeMs.toFixed(1)} ms</span>{/if}
        <p>Conteggio esatto per il template e la proiezione visibile correnti. I singoli assegnamenti e archi testimoni non sono stati restituiti; i totali di partizioni incomplete non vengono mostrati.</p>
      </div>
    {/if}

    {#if error}
      <div class="error" role="alert">{error}</div>
    {/if}

    {#if scenarioComparisonProgress}
      <div class="readiness" role="status">{scenarioComparisonProgress}</div>
    {/if}
    {#if scenarioComparisonError}
      <div class="error" role="alert">{scenarioComparisonError}</div>
    {/if}
    {#if scenarioComparison}
      <div class="summary" role="status" aria-label="Confronto di membership dei motivi sui mondi finiti">
        <strong>{scenarioComparison.memberships.length}</strong>
        {scenarioComparison.memberships.length === 1 ? " assegnamento di ruoli distinto" : " assegnamenti di ruoli distinti"}
        · {scenarioComparisonCautiousCount} brave-and-cautious · {scenarioComparisonBraveOnlyCount} brave-only
        {#if scenarioComparisonTimeMs !== undefined}<span> · {scenarioComparisonTimeMs.toFixed(1)} ms di solving complessivi</span>{/if}
        <div class="results-heading">
          <strong>Membership per assegnamento dei ruoli</strong>
          <button type="button" on:click={exportScenarioComparison}>Esporta CSV</button>
        </div>
        <div class="readiness">
          {#each scenarioComparison.scenarios as scenario}
            <span>{scenario.scenarioLabel}: {scenario.distinctRoleAssignments} {scenario.distinctRoleAssignments === 1 ? "assegnamento" : "assegnamenti"} · {scenario.nodesCount} nodi · {scenario.linksCount} {scenario.linksCount === 1 ? "arco" : "archi"} · enumerazione completa · {scenario.timeMs.toFixed(1)} ms</span>
          {/each}
        </div>
        <div class="readiness">
          <strong>Contesto della query</strong>
          <span>Gruppo ASP: {scenarioComparison.queryScope.selectedGroup || "tutti i nodi"} · direzione: {scenarioComparison.queryScope.graphDirection}</span>
          <span>Finestra: {scenarioComparison.queryScope.timelineWindow || "non attiva"} · confidenza minima: {scenarioComparison.queryScope.minimumEdgeConfidence ?? "non applicata"}</span>
          <span>Filtri vista — tipi: {scenarioComparison.queryScope.viewFilters.types.join(", ") || "tutti"} · gruppi: {scenarioComparison.queryScope.viewFilters.groups.join(", ") || "tutti"}</span>
        </div>
        {#if scenarioComparison.memberships.length > 0}
          <ul class="results">
            {#each scenarioComparison.memberships.slice(0, visibleScenarioMembershipLimit) as membership, index}
              <li class="match scenario-membership">
                <strong>{index + 1}. {membership.status === "brave-and-cautious" ? "Brave e cautious" : "Brave-only"}</strong>
                {#each scenarioComparison.roleNames as role}
                  <span>{role}: {membership.roleAssignments[role]}</span>
                {/each}
                <span>Presente in {membership.scenariosPresent}/{membership.totalScenarios} mondi: {membership.scenarioIds.join(", ")}</span>
                <div class="world-witnesses">
                  {#each membership.evidenceByScenario as evidence}
                    <button type="button" on:click={() => inspectScenarioMatch(evidence.scenarioId, evidence.match)}>
                      Mostra un testimone in {evidence.scenarioLabel}
                    </button>
                  {/each}
                </div>
              </li>
            {/each}
          </ul>
          {#if scenarioComparison.memberships.length > visibleScenarioMembershipLimit}
            <button type="button" class="show-more" on:click={() => visibleScenarioMembershipLimit += 100}>
              Mostra altri 100 ({scenarioComparison.memberships.length - visibleScenarioMembershipLimit} restanti)
            </button>
          {/if}
        {:else}
          <p>Nessuna assegnazione di ruoli soddisfa il template in alcuno degli scenari dichiarati.</p>
        {/if}
        <small>
          L’identità dell’istanza è l’assegnamento ordinato di tutti i ruoli, inclusi quelli di contesto, agli ID sorgente dei nodi. Archi testimoni o tempi diversi possono sostenere la stessa istanza nei diversi mondi; il confronto non afferma che persista lo stesso arco o lo stesso istante. I pulsanti aprono la proiezione del mondo e mostrano un suo testimone ASP.
          {#if selectedHasAbsenceConditions} I vincoli di assenza e di indotto sono rivalutati separatamente sulla proiezione chiusa di ciascun mondo.{/if}
          Brave significa presente in almeno un mondo, cautious in tutti quelli dichiarati. L’aggregato appare solo dopo che clingo ha completato l’enumerazione in ciascun mondo; un timeout elimina l’intero confronto. Questa lettura assume che la lista finita sia esaustiva e non assegna probabilità ai mondi. Ogni motivo viene valutato sulla propria proiezione, mantenendo gruppo, filtri, soglia di confidenza e finestra correnti.
        </small>
      </div>
    {/if}

    {#if hasRun && matches.length === 0 && !error}
      <div class="near-match-controls">
        <button type="button" on:click={diagnose} disabled={running || !selectedRequirementsAvailable}>
          {running ? "Solver in esecuzione…" : selectedIsTemporal ? "Analizza la struttura più vicina" : "Spiega il mancato match"}
        </button>
        <small>
          Cerca un assegnamento che riempie il maggior numero di ruoli e poi minimizza i vincoli strutturali violati.
          È una query combinatoria separata e può richiedere tempo su grafi grandi.
          {#if selectedIsTemporal}
            {#if selectedTemporalSemantics === "coValid"}
              A parità strutturale sceglie l’istante che rende temporalmente attivi più pattern; distingue pattern senza intervalli validi da quelli inattivi all’istante scelto.
            {:else}
              A parità strutturale sceglie i record con meno inversioni tra inizi consecutivi; distingue pattern senza intervalli validi.
            {/if}
          {:else}
            A parità di ruoli assegnati minimizza insieme le relazioni richieste senza testimone e gli archi presenti che violano un vincolo di assenza.
          {/if}
        </small>
      </div>
    {/if}

    {#if hasRun && matches.length === 0 && !error && counterfactualEnabled}
      <div class="counterfactual-controls">
        <button type="button" on:click={proposeCounterfactual} disabled={running || !selectedRequirementsAvailable}>
          {running ? "Solver in esecuzione…" : "Cerca aggiunte ipotetiche minime"}
        </button>
        <small>
          Valuta solo i {counterfactualCandidateCount} archi esplicitamente configurati con costo positivo.
          La proposta non viene applicata al grafo; il costo ordina gli scenari dichiarati e non esprime probabilità o causalità.
          {#if selectedIsTemporal} Ogni candidato deve dichiarare un intervallo di validità.{/if}
        </small>
      </div>
    {/if}

    {#if counterfactualError}
      <div class="error" role="alert">{counterfactualError}</div>
    {/if}

    {#if counterfactualHasRun}
      <div class="summary" role="status">
        {#if counterfactuals.length > 0}
          <strong>{counterfactuals.length}</strong> proposta{counterfactuals.length === 1 ? " ottima" : " ottime"} a costo minimo
        {:else}
          Nessuna combinazione dei candidati configurati completa il motivo.
        {/if}
        {#if counterfactualTimeMs !== undefined}<span> · {counterfactualTimeMs.toFixed(1)} ms</span>{/if}
        {#if counterfactualExcludedCandidateCount > 0}
          <p>{counterfactualExcludedCandidateCount} candidati esclusi perché fuori dalla proiezione visibile o dal gruppo selezionato.</p>
        {/if}
      </div>
    {/if}

    {#if counterfactuals.length > 0}
      <div class="results-heading">
        <strong>Proposte ipotetiche · costo totale {counterfactuals[0].totalCost}</strong>
        <button type="button" on:click={exportCounterfactuals}>Esporta CSV</button>
      </div>
      <ul class="results">
        {#each counterfactuals as proposal, index}
          <li>
            <button type="button" class="match" on:click={() => dispatch("highlightCounterfactual", proposal)}>
              <strong>{index + 1}. {proposal.label} · costo {proposal.totalCost}</strong>
              {#each Object.entries(proposal.match.roles) as [role, node]}
                <span>{role}: {node.sourceId}</span>
                {#if node.requiredAttributes}<span>Attributi richiesti per {role}: {formatAttributeConstraints(node.requiredAttributes)}</span>{/if}
              {/each}
              {#each proposal.addedEdges as edge}
                <span>
                  {#if formatAttributeConstraints(edge.attributes)}Attributi ipotizzati: {formatAttributeConstraints(edge.attributes)} · {/if}
                  Aggiunta ipotetica {edge.id}: {edge.sourceNodeId} —{edge.edgeType}→ {edge.targetNodeId} · costo {edge.cost} · relazioni {edge.patternIndexes.join(", ")}
                  {#if edge.validity} · validità {displayMappedTime(edge.validity.from)}–{displayMappedTime(edge.validity.to)}{/if}
                </span>
              {/each}
              {#each proposal.match.supportingEdges.filter((edge) => edge.edgeIds.length > 0) as edge}
                <span>
                  {#if formatAttributeConstraints(edge.attributes)}Attributi richiesti: {formatAttributeConstraints(edge.attributes)} · {/if}
                  Supporto osservato {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {edge.edgeIds.join(", ")}
                  {#if provenanceForEdges(edge.edgeIds)} · fonte dichiarata: {provenanceForEdges(edge.edgeIds)}{/if}
                </span>
              {/each}
              {#each proposal.match.absenceConditions ?? [] as edge}
                <span>Assenza verificata sotto mondo chiuso sulla proiezione visibile: {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}</span>
              {/each}
            </button>
          </li>
        {/each}
      </ul>
      <small>
        L'evidenziazione mostra nodi e archi osservati che sostengono il motivo; gli archi ipotetici restano separati e non entrano nella vista del grafo.
        L'ottimalità vale solo rispetto ai candidati, ai costi, al template e alla proiezione corrente.
      </small>
    {/if}

    {#if nearMatchError}
      <div class="error" role="alert">{nearMatchError}</div>
    {/if}

    {#if hasRun && !error}
      <div class="summary" role="status">
        <strong>{matches.length}</strong>
        {selectedTemporalSemantics === "orderedByStart"
          ? matches.length === 1 ? " sequenza testimone" : " sequenze testimone"
          : matches.length === 1 ? " istanza del template" : " istanze del template"}
        {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
        {#if matches.length === 0}
          <p>
            {selectedTemporalSemantics === "orderedByStart"
              ? "Nessuna sequenza di archi testimoni rispetta l’ordine degli inizi di validità richiesto."
              : selectedTemporalSemantics === "coValid"
                ? "Nessuna assegnazione ha tutti gli archi testimoni attivi nello stesso istante."
                : "Nessuna assegnazione soddisfa tipi e relazioni del template."}
          </p>
        {/if}
      </div>
    {/if}

    {#if matches.length > 0}
      <div class="results-heading">
        <strong>Ruoli e archi testimoni</strong>
        <button type="button" on:click={exportResults}>Esporta CSV</button>
      </div>
      <ul class="results">
        {#each visibleMatches as match, index}
          <li>
            <button type="button" class="match" on:click={() => dispatch("highlight", match)}>
              <strong>{index + 1}. {match.label}</strong>
              {#if match.timeValue !== undefined}<span>Istante comune di validità: {displayMappedTime(match.timeValue)}</span>{/if}
              {#if match.maximumSpan}<span>Durata massima fra il primo e l'ultimo inizio: {match.maximumSpan.value} {match.maximumSpan.unit}</span>{/if}
              {#each Object.entries(match.roles) as [role, node]}
                <span>{role}: {node.sourceId}</span>
                {#if node.requiredAttributes}<span>Attributi richiesti per {role}: {formatAttributeConstraints(node.requiredAttributes)}</span>{/if}
              {/each}
              {#each match.supportingEdges as edge}
                <span>
                  {#if formatAttributeConstraints(edge.attributes)}Attributi richiesti: {formatAttributeConstraints(edge.attributes)} · {/if}
                  {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {edge.edgeIds.join(", ")}
                  {#if provenanceForEdges(edge.edgeIds)} · fonte dichiarata: {provenanceForEdges(edge.edgeIds)}{/if}
                  {#if edge.startTimeValue !== undefined} · inizio {displayMappedTime(edge.startTimeValue)}{/if}
                </span>
              {/each}
              {#each match.absenceConditions ?? [] as edge}
                <span>Assenza verificata sotto mondo chiuso sulla proiezione visibile: {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}</span>
              {/each}
            </button>
          </li>
        {/each}
      </ul>
      {#if matches.length > visibleMatches.length}
        <button type="button" class="show-more" on:click={() => visibleLimit += 100}>
          Mostra altri 100 ({matches.length - visibleMatches.length} restanti)
        </button>
      {/if}
      <small>
        Il testimone è verificabile: assegna nodi distinti ai ruoli e mostra almeno un record d’arco per ogni relazione richiesta.
        {#if selectedHasAbsenceConditions} Le assenze dichiarate valgono sotto mondo chiuso sulla proiezione visibile e presuppongono dati completi per i tipi indicati.{/if}
        Per co-validità mostra anche l’istante comune; per l’ordine temporale mostra il record e l’inizio di validità usati per ogni passo.
        Tipi e intervalli seguono il mapping/template: il certificato prova compatibilità strutturale, non causalità o verità storica.
      </small>
    {/if}

    {#if nearMatchHasRun && nearMatches.length > 0}
      <div class="summary" role="status">
        <strong>{nearMatches.length}</strong> near-match {nearMatches[0].temporalEvidence ? "temporale" : "strutturale"} {nearMatches.length === 1 ? "ottimo" : "ottimi"}
        {#if nearMatchTimeMs !== undefined}<span> · {nearMatchTimeMs.toFixed(1)} ms</span>{/if}
        {#if nearMatches[0].temporalEvidence}
          <p>Prima si massimizzano i ruoli assegnati, poi le relazioni esistenti; infine si riducono le incompatibilità temporali. In caso di pari merito il solver mostra un risultato ottimo.</p>
        {:else}
          <p>Prima si massimizza il numero di ruoli assegnati; poi si minimizza il numero totale di relazioni richieste mancanti e di vincoli di assenza violati. In caso di pari merito il solver mostra un risultato ottimo.</p>
        {/if}
      </div>
      <div class="results-heading">
        <strong>{nearMatches[0].temporalEvidence ? "Diagnostica why-not temporale" : "Diagnostica why-not strutturale"}</strong>
        <button type="button" on:click={exportNearMatches}>Esporta CSV</button>
      </div>
      <ul class="near-matches">
        {#each nearMatches as nearMatch, index}
          <li class="near-match">
            <button type="button" class="match" on:click={() => dispatch("highlightNearMatch", nearMatch)}>
              <strong>{index + 1}. {nearMatch.label}</strong>
              <span>Ruoli assegnati: {Object.keys(nearMatch.roles).length} / {Object.keys(selectedTemplate?.roles ?? {}).length} · relazioni mancanti: {nearMatch.missingPatterns.length} · assenze violate: {nearMatch.violatedAbsencePatterns.length}</span>
              {#each Object.entries(nearMatch.roles) as [role, node]}
                <span>{role}: {node.sourceId}</span>
                {#if node.requiredAttributes}<span>Attributi richiesti per {role}: {formatAttributeConstraints(node.requiredAttributes)}</span>{/if}
              {/each}
              {#each nearMatch.missingRoles as role}
                <span>Nessun candidato per il ruolo nella proiezione visibile corrente: {role}</span>
                {#if selectedTemplate?.roles[role]?.attributes}
                  <span>Filtri richiesti per {role}: {formatAttributeConstraints(selectedTemplate.roles[role].attributes)}</span>
                {/if}
              {/each}
              {#each nearMatch.missingPatterns as pattern}
                {#if formatAttributeConstraints(pattern.attributes)}<span>Filtri richiesti: {formatAttributeConstraints(pattern.attributes)}</span>{/if}
                <span>Relazione non trovata nella proiezione visibile corrente: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
              {/each}
              {#each nearMatch.unresolvedPatterns as pattern}
                {#if formatAttributeConstraints(pattern.attributes)}<span>Filtri richiesti: {formatAttributeConstraints(pattern.attributes)}</span>{/if}
                <span>Relazione non valutabile perché manca un ruolo: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
              {/each}
              {#each nearMatch.violatedAbsencePatterns as pattern}
                <span>
                  Relazione presente ma dichiarata assente: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}: {pattern.edgeIds.join(", ")}
                  {#if provenanceForEdges(pattern.edgeIds)} · fonte dichiarata: {provenanceForEdges(pattern.edgeIds)}{/if}
                </span>
              {/each}
              {#each nearMatch.unresolvedAbsencePatterns as pattern}
                <span>Assenza non valutabile perché manca un ruolo: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
              {/each}
              {#each nearMatch.supportingEdges.filter((edge) => edge.edgeIds.length > 0) as edge}
                <span>
                  {#if formatAttributeConstraints(edge.attributes)}Attributi richiesti: {formatAttributeConstraints(edge.attributes)} · {/if}
                  Relazione presente: {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {edge.edgeIds.join(", ")}
                  {#if provenanceForEdges(edge.edgeIds)} · fonte dichiarata: {provenanceForEdges(edge.edgeIds)}{/if}
                </span>
              {/each}
              {#if nearMatch.temporalEvidence}
                {#if nearMatch.temporalEvidence.maximumSpan}
                  <span>
                    Finestra massima {nearMatch.temporalEvidence.maximumSpan.value} {nearMatch.temporalEvidence.maximumSpan.unit}:
                    {nearMatch.temporalEvidence.spanViolation ? "superata" : "rispettata"}
                  </span>
                {/if}
                {#if nearMatch.temporalEvidence.timeValue !== undefined}
                  <span>Istante scelto che massimizza i pattern co-validi: {displayMappedTime(nearMatch.temporalEvidence.timeValue)}</span>
                {/if}
                {#each nearMatch.temporalEvidence.unavailablePatterns as pattern}
                  <span>Intervallo temporale assente o non valido: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
                {/each}
                {#each nearMatch.temporalEvidence.inactivePatterns as pattern}
                  <span>Nessun record attivo all’istante scelto: {pattern.sourceRole} —{pattern.edgeType}→ {pattern.targetRole}</span>
                {/each}
                {#each nearMatch.temporalEvidence.orderViolations as pair}
                  <span>Ordine invertito tra pattern {pair.firstIndex} e {pair.secondIndex}</span>
                {/each}
                {#each nearMatch.temporalEvidence.supportingEdges.filter((edge) => edge.edgeIds.length > 0) as edge}
                  <span>
                    Supporto temporale {edge.sourceRole} —{edge.edgeType}→ {edge.targetRole}: {edge.edgeIds.join(", ")}
                    {#if provenanceForEdges(edge.edgeIds)} · fonte dichiarata: {provenanceForEdges(edge.edgeIds)}{/if}
                    {#if edge.startTimeValue !== undefined} · inizio {displayMappedTime(edge.startTimeValue)}{/if}
                  </span>
                {/each}
              {/if}
            </button>
          </li>
        {/each}
      </ul>
      <small>
        È una spiegazione strutturale ordinata dal criterio dichiarato: non propone di aggiungere archi e non attribuisce loro significato causale.
        {#if nearMatches[0].temporalEvidence}
          Per co-validità il tempo è scelto fra gli estremi degli intervalli mappati; per l’ordine i testimoni riducono le inversioni consecutive. L’ottimo temporale è una spiegazione del template, non un intervento causale.
        {/if}
      </small>
    {/if}
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
        on:highlight={(event) => dispatch("highlightContextualClique", event.detail)}
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
            <summary>Semantica e witness ASP</summary>
            <p>{signedTriadContract.querySemantics}</p>
            <small>
              {getTaskEnumerationDescription("signedTriads")} · encoding: {signedTriadContract.aspEncoding} v{signedTriadContract.encodingVersion} ·
              input: {signedTriadContract.inputPredicates.join(", ")} · witness: {signedTriadContract.witnessPredicates.join(", ")} ·
              parser: {signedTriadContract.parser}.
            </small>
          </details>
        {/if}
        <div class="controls">
          <label>
            Gruppo
            <select bind:value={signedTriadGroup} disabled={running} on:change={clearSignedTriadResults}>
              <option value="">Tutti i nodi</option>
              {#each availableGroups as group}
                <option value={group}>{group}</option>
              {/each}
            </select>
          </label>
          <button type="button" class="run" on:click={runSignedTriads} disabled={running || !signedTriadRequirementsAvailable}>
            {running ? "Solver in esecuzione…" : "Classifica le triadi"}
          </button>
          {#if signedTriadScenarioComparisonAvailable}
            <button type="button" class="run scenario-run" on:click={compareSignedTriadScenarios} disabled={running}>
              Confronta gli scenari dichiarati esaustivi
            </button>
          {/if}
        </div>
        <div class="readiness" role="status">
          <strong>{signedTriadRequirementsAvailable ? "Prerequisiti disponibili" : "Prerequisiti non soddisfatti"}</strong>
          <span>{graphNodesCount} nodi · {graphEdgesCount} archi visibili</span>
          {#if signedTriadRequirementReasons.length > 0}
            <ul>{#each signedTriadRequirementReasons as reason}<li>{reason}</li>{/each}</ul>
          {/if}
        </div>
        <small>
          I record paralleli concordi sono una sola dyade con tutti gli ID sorgente nel testimone. Record paralleli discordanti o segni mancanti bloccano l’analisi. I cappi sono esclusi dai triangoli; i filtri correnti definiscono il grafo esaminato.
        </small>

        {#if signedTriadError}
          <div class="error" role="alert">{signedTriadError}</div>
        {/if}
        {#if signedTriadHasRun}
          <div class="summary" role="status">
            <strong>{signedTriadSummary.completeTriadCount}</strong> triadi complete · {signedTriadSummary.balancedTriadCount} bilanciate · {signedTriadSummary.unbalancedTriadCount} non bilanciate · quota bilanciata:
            {#if signedTriadSummary.balancedShare === null}
              n/d
            {:else}
              {(signedTriadSummary.balancedShare * 100).toFixed(1)}%
            {/if}
            <small>La quota è calcolata solo sui triangoli completi classificati nella proiezione corrente.</small>
            {#if signedTriadTimeMs !== undefined}<span> · {signedTriadTimeMs.toFixed(1)} ms</span>{/if}
            {#if signedTriadResults.length === 0}<p>La proiezione corrente non contiene triangoli completi.</p>{/if}
          </div>
        {/if}
        {#if signedTriadResults.length > 0}
          <div class="results-heading">
            <strong>Triadi e polarità testimoni</strong>
            <button type="button" on:click={exportSignedTriads}>Esporta CSV</button>
          </div>
          {#if signedTriadFocusedKey}
            <div class="signed-triad-focus-status" role="status">
              Focus 3D attivo: nodi e collegamenti fuori dal testimone sono nascosti solo nella vista; dati e risultati restano invariati.
              <button type="button" on:click={clearSignedTriadFocus}>Mostra rete completa</button>
            </div>
          {/if}
          <ul class="results">
            {#each visibleSignedTriads as triad, index (`${triad.nodeIds.join("|")}-${index}`)}
              <li class="signed-triad-item">
                <button type="button" class="match signed-triad-match" on:click={() => dispatch("highlightSignedTriad", triad)}>
                  <strong>{index + 1}. {triad.balanced ? "Bilanciata" : "Non bilanciata"} · {triad.negativeDyadCount} dyadi negative</strong>
                  <span>{triad.nodeIds.map(signedTriadNodeDisplay).join(" · ")}</span>
                  {#each triad.dyads as dyad}
                    <span>{sourceIdByNodeId[dyad.sourceNodeId] ?? dyad.sourceNodeId} — {dyad.polarity} — {sourceIdByNodeId[dyad.targetNodeId] ?? dyad.targetNodeId}: {dyad.edgeRecords.map((record) => record.id).join(", ")}</span>
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
                    : "Isola testimone in 3D"}
                </button>
              </li>
            {/each}
          </ul>
          {#if signedTriadResults.length > visibleSignedTriads.length}
            <button type="button" class="show-more" on:click={() => visibleSignedTriadLimit += 100}>
              Mostra altre 100 ({signedTriadResults.length - visibleSignedTriads.length} restanti)
            </button>
          {/if}
          <small>Seleziona una triade per evidenziare i suoi tre nodi e i record che sostengono ciascuna dyade. L’esportazione include tutti i risultati, anche quelli oltre l’elenco visibile.</small>
        {/if}

        {#if signedTriadScenarioComparisonProgress}
          <div class="status" role="status">{signedTriadScenarioComparisonProgress}</div>
        {/if}
        {#if signedTriadScenarioComparisonError}
          <div class="error" role="alert">{signedTriadScenarioComparisonError}</div>
        {/if}
        {#if signedTriadScenarioComparison}
          <section class="signed-triad-scenario-comparison" aria-label="Stabilità delle triadi firmate tra scenari">
            <div class="summary" role="status">
              <strong>{stableBalancedScenarioTriadCount}</strong> bilanciate in tutti i mondi ·
              <strong>{stableUnbalancedScenarioTriadCount}</strong> non bilanciate in tutti i mondi ·
              <strong>{variableScenarioTriadCount}</strong> con esito variabile<br />
              {signedTriadScenarioComparison.scenarios.length} mondi finiti esaustivi ·
              {signedTriadScenarioComparison.memberships.length} triadi classificate in almeno un mondo
              {#if signedTriadScenarioComparisonTimeMs !== undefined}<span> · {signedTriadScenarioComparisonTimeMs.toFixed(1)} ms di solver</span>{/if}
            </div>
            <div class="results-heading">
              <strong>Stabilità e classificazioni per mondo</strong>
              <button type="button" on:click={exportSignedTriadScenarioComparison}>Esporta CSV</button>
            </div>
            <div class="signed-triad-world-summaries" aria-label="Riepilogo bilanciamento per mondo">
              {#each signedTriadScenarioComparison.scenarios as scenario (scenario.scenarioId)}
                <div class="signed-triad-world-summary">
                  <strong>{scenario.scenarioLabel}</strong>
                  <span>{scenario.classifiedTriads} triangoli completi · {scenario.balancedTriads} bilanciati · {scenario.unbalancedTriads} non bilanciati</span>
                  <span>Quota bilanciata:
                    {#if scenario.balancedShare === null}
                      n/d
                    {:else}
                      {(scenario.balancedShare * 100).toFixed(1)}%
                    {/if}
                  </span>
                  <span>{scenario.commonTriads} triangoli classificati in tutti i mondi · quota bilanciata sul nucleo comune:
                    {#if scenario.balancedCommonShare === null}
                      n/d
                    {:else}
                      {(scenario.balancedCommonShare * 100).toFixed(1)}%
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
            <small>
              La prima quota usa i triangoli completi classificati in quel mondo. La quota sul nucleo comune usa soltanto gli stessi ID di triade, classificati in tutti i mondi; n/d indica un'intersezione vuota. Le triadi assenti dall'unione osservata restano non classificate, non sbilanciate.
            </small>
            {#if signedTriadScenarioComparison.memberships.length === 0}
              <p>Nessuna triade completa è stata classificata in alcuno scenario.</p>
            {:else}
              <ul class="results signed-triad-scenario-results">
                {#each visibleSignedTriadScenarioMemberships as membership (membership.nodeIds.join("\u0000"))}
                  <li class="signed-triad-scenario-item">
                    <strong>{signedTriadStabilityLabel(membership.stability)}</strong>
                    <span>{membership.nodeIds.map(signedTriadNodeDisplay).join(" · ")}</span>
                    <details>
                      <summary>Esito e testimoni per scenario</summary>
                      <ul>
                        {#each membership.worlds as world (world.scenarioId)}
                          <li>
                            <strong>{world.scenarioLabel}: {signedTriadWorldStatusLabel(world.classification)}</strong>
                            {#if world.evidence}
                              <small>
                                {#each world.evidence.dyads as dyad, dyadIndex}
                                  {#if dyadIndex > 0} · {/if}
                                  {sourceIdByNodeId[dyad.sourceNodeId] ?? dyad.sourceNodeId} — {dyad.polarity} — {sourceIdByNodeId[dyad.targetNodeId] ?? dyad.targetNodeId}
                                  [{dyad.edgeRecords.map((record) => record.id).join(", ")}]
                                {/each}
                              </small>
                              <button
                                type="button"
                                class="inspect-signed-triad-scenario"
                                on:click={() => inspectSignedTriadScenarioWitness(world.scenarioId, world.evidence)}
                              >
                                Mostra questa triade nel mondo
                              </button>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    </details>
                  </li>
                {/each}
              </ul>
              {#if signedTriadScenarioComparison.memberships.length > visibleSignedTriadScenarioMemberships.length}
                <button type="button" class="show-more" on:click={() => visibleSignedTriadScenarioLimit += 100}>
                  Mostra altre 100 ({signedTriadScenarioComparison.memberships.length - visibleSignedTriadScenarioMemberships.length} restanti)
                </button>
              {/if}
            {/if}
            <small>
              Una triade è confrontata tramite i tre ID sorgente indipendentemente dall'ordine. “Non classificata” indica che lo scenario non ha prodotto una classificazione per quella tripla; non equivale a “non bilanciata”. Sono elencate solo le triadi classificate in almeno uno scenario. L'esito è condizionato all'assunzione configurata che i mondi siano esaustivi; non rappresenta probabilità o affidabilità delle fonti.
            </small>
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
    font: 13px/1.45 system-ui, sans-serif;
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

  header p,
  small {
    color: #475569;
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

  .signed-triad-scenario-item details small {
    display: block;
    margin-top: 2px;
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

  select,
  button {
    font: inherit;
  }

  select {
    min-width: 0;
    padding: 5px 7px;
  }

  .run,
  .results-heading button,
  .show-more {
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

  .error {
    padding: 8px;
    border-radius: 6px;
    background: #fef2f2;
    color: #991b1b;
  }

  .readiness {
    display: grid;
    gap: 3px;
    padding: 8px;
    border-radius: 6px;
    background: #f1f5f9;
  }

  .readiness span,
  .readiness ul {
    color: #475569;
  }

  .readiness ul {
    margin: 2px 0 0;
    padding-left: 18px;
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

  .match:hover {
    background: #e0e7ff;
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
