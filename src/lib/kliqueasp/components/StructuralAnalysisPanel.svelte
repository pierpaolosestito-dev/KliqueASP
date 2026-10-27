<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { csvCell, downloadCsvText } from "../csvExport";
  import StructuralCompletionCounterfactualPanel from "./StructuralCompletionCounterfactualPanel.svelte";
  import TypedPathCounterfactualPanel from "./TypedPathCounterfactualPanel.svelte";
  import { buildCompactKCoreWitnessCsv, buildDominatingSetInfeasibilityCsv, buildDominatingSetWitnessCsv, buildKCoreWitnessCsv, buildKPlexMaximumMembershipDiagnosisCsv, buildKPlexWitnessCsv, buildModularityCertificateCsv, buildProvenanceScenarioDominatingSetInfeasibilityCsv, buildSeparatorCertificateCsv, buildTypedPathTemporalNoRouteCsv } from "../graph/structuralCsvExport.ts";
  import { buildCommunityCoassignmentCsv, buildCommunityPairMembershipCsv, getCommunityPairObjectiveLosses, summarizeCommunityCoassignment, type CommunityCoassignmentSummary, type CommunityPairOptimumMembership } from "../graph/communityOptimumStability.ts";
  import { buildCommunityConstraintDiagnosisCsv, type CommunityConstraintDiagnosis, type CommunityConstraintRelaxationSpec } from "../graph/communityConstraintDiagnosis.ts";
  import { buildCommunityTopologyCounterfactualCsv, type CommunityTopologyCounterfactualResult, type CommunityTopologyEdgeEdit } from "../graph/communityTopologyCounterfactual.ts";
  import {
    summarizeMaximumKPlexMembershipAcrossOptima,
    type KPlexMaximumMembershipDiagnosis,
    type KPlexMaximumMembershipOptimaSummary
  } from "../graph/kplexMembershipDiagnosis.ts";
  import {
    MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES,
    buildKPlexMaximumMembershipCounterfactualCsv,
    type KPlexMaximumMembershipCounterfactualSearchOutcome
  } from "../graph/kplexMembershipCounterfactual.ts";
  import WorkerMemoryReadout from "./WorkerMemoryReadout.svelte";
  import { getOwnRecordValue } from "../graph/recordUtils";
  import { getGraphTaskContract, getTaskEnumerationDescription } from "../graph/graphTaskContracts";
  import { getStructuralResultPressedState } from "../graph/structuralResultSelection";
  import {
    buildProvenanceScenarioComponentsCsv,
    buildProvenanceScenarioDominatingSetCsv,
    buildProvenanceScenarioKCoreCsv,
    buildProvenanceScenarioKPlexCsv,
    type ProvenanceScenarioComponentComparison,
    type ProvenanceScenarioComponentTask,
    type ProvenanceScenarioDominatingSetComparison,
    type ProvenanceScenarioKCoreComparison,
    type ProvenanceScenarioKPlexComparison
  } from "../graph/provenanceScenarioAnalysis";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
import type { BoundedPathNoRouteCertificate, DirectedKCoreMode, DominatingSetCoverageWitness, KPlexCompletionProposal, KPlexCompletionWhyNot, KCoreCompletionWhyNot, KCoreMembershipCompletionWhyNot, KCoreMembershipCompletionProposal, StructuralEdgeCompletionProposal, KCorePeelingCertificate, KCoreSupportingPair, MinimumHopPathMinimalityCertificate, ModularityPartition, StructuralTask, TypedPathNoRouteCertificate, TypedPathTemporalNoRouteCertificate, TypedPathCounterfactualProposal, TypedPathCounterfactualWhyNot, TypedPathTemporalSemantics } from "../graph/structuralTasks";
  import type { MaximalKPlexWitnessExplanation } from "../graph/structuralTasks";

  export let open = false;
  export let running = false;
  export let error = "";
  export let task: StructuralTask = "kPlex";
  export let directedGraph = false;
  export let kCoreMode: DirectedKCoreMode | "" = "";
  export let weakComponentsAvailable = false;
  export let strongComponentsAvailable = false;
  export let weakComponentsRequirementReasons: string[] = [];
  export let strongComponentsRequirementReasons: string[] = [];
  export let parameter = 2;
  export let enumerateAllOptima = false;
  export let enumerateAllMaximalKPlex = false;
  export let includeKCoreNumbers = false;
  export let explainKCoreExclusions = false;
  export let kCoreNumbers: Record<string, number> | null = null;
  export let kCoreProfileTimeMs: number | undefined;
  export let explainCommunityContributions = false;
  export let explainCommunityInfeasibility = false;
  export let explainPathMinimality = false;
  export let explainTypedPathNoRoute = false;
  export let minimumCommunityCount = 0;
  export let maximumCommunityCount = 0;
  export let communityPartitions: ModularityPartition[] = [];
  export let communityPairMembershipEnabled = false;
  export let communityPairMembershipResult: CommunityPairOptimumMembership | null = null;
  export let communityPairMembershipError = "";
  export let communityPairMembershipRunning = false;
  export let communityPairMembershipTimeMs: number | undefined;
  export let communityTopologyCounterfactualEnabled = false;
  export let communityTopologyEdgeEdits: CommunityTopologyEdgeEdit[] = [];
  export let communityTopologyCounterfactualResult: CommunityTopologyCounterfactualResult | null = null;
  export let communityTopologyCounterfactualError = "";
  export let communityTopologyCounterfactualRunning = false;
  export let communityTopologyCounterfactualTimeMs: number | undefined;
  export let communityConstraintDiagnoses: CommunityConstraintDiagnosis[] = [];
  export let communityConstraintDiagnosisError = "";
  export let communityConstraintDiagnosesAllEnumerated = false;
  export let modularity: number | undefined;
  export let communityScaledTotalWeight: number | undefined;
  export let communityDisplayTotalWeight: string | undefined;
  export let communityWeightScaleFactor = 1;
  export let communityUsesEdgeWeights = false;
  export let communityResolution: number | string = 1;
  export let communityResolutionNumerator = 1;
  export let communityResolutionDenominator = 1;
  export let configuredCommunityPairCount = 0;
  export let configuredCommunityAttributeBoundCount = 0;
  export let communityConfigurationError = "";
  export let pathEdgeTypeSequence: string[] = [];
  export let pathTemporalSemantics: "static" | TypedPathTemporalSemantics = "static";
  export let pathStrictTemporalOrder = false;
  export let availableEdgeTypes: string[] = [];
  export let typedPathRequirementsAvailable = false;
  export let typedPathRequirementReasons: string[] = [];
  export let typedPathTemporalRequirementsAvailable = false;
  export let typedPathTemporalRequirementReasons: string[] = [];
  export let costEdgeSeparatorRequirementsAvailable = false;
  export let costEdgeSeparatorRequirementReasons: string[] = [];
  export let costNodeSeparatorRequirementsAvailable = false;
  export let costNodeSeparatorRequirementReasons: string[] = [];
  export let pathEdgeIdsByStep: string[][] = [];
  export let pathCommonTimeValue: number | undefined;
  export let pathStartTimeValuesByStep: number[] = [];
  export let pathMinimality: MinimumHopPathMinimalityCertificate | undefined;
  export let pathNoRouteCertificate: BoundedPathNoRouteCertificate | undefined;
  export let typedPathNoRouteCertificate: TypedPathNoRouteCertificate | TypedPathTemporalNoRouteCertificate | undefined;
  export let typedPathCounterfactualEnabled = false;
  export let typedPathCounterfactualRequirementReasons: string[] = [];
  export let typedPathCounterfactualCandidateCount = 0;
  export let typedPathCounterfactualExcludedCandidateCount = 0;
  export let typedPathCounterfactualProposals: TypedPathCounterfactualProposal[] = [];
  export let typedPathCounterfactualHasRun = false;
  export let typedPathCounterfactualError = "";
  export let typedPathCounterfactualTimeMs: number | undefined;
  export let typedPathCounterfactualWhyNot: TypedPathCounterfactualWhyNot | undefined;
  export let typedPathCounterfactualWhyNotError = "";
  export let selectedGroup = "";
  export let selectedTargetGroup = "";
  export let availableGroups: string[] = [];
  export let availableNodes: Array<{ id: string; label: string }> = [];
  export let nodeLabelById: Record<string, string> = {};
  export let sourceIdByNodeId: Record<string, string> = {};
  export let sourceIdByEdgeId: Record<string, string> = {};
  export let edgeSourceIdentityById: Record<string, { sourceId?: string; generatedRecordKey?: string; legacyEndpointPair?: [string, string] }> = {};
  export let edgeProvenanceById: Record<string, string> = {};
  export let edgeProvenanceReferencesBySourceId: Record<string, string[]> = {};
  export let startNodeId = "";
  export let goalNodeId = "";
  export let resultSets: string[][] = [];
  export let kPlexMembershipNodes: Array<{ id: string; label: string }> = [];
  export let kPlexMembershipTargetNodeId = "";
  export let kPlexMembershipDiagnosis: KPlexMaximumMembershipDiagnosis | null = null;
  export let kPlexMembershipDiagnosisRunning = false;
  export let kPlexMembershipDiagnosisError = "";
  export let kPlexMembershipDiagnosisTimeMs: number | undefined;
  export let kPlexMembershipCounterfactualEnabled = false;
  export let kPlexMembershipCounterfactualConfiguredCount = 0;
  export let kPlexMembershipCounterfactualCandidateCount = 0;
  export let kPlexMembershipCounterfactual: KPlexMaximumMembershipCounterfactualSearchOutcome | null = null;
  export let kPlexMembershipCounterfactualRunning = false;
  export let kPlexMembershipCounterfactualError = "";
  export let kPlexMembershipCounterfactualTimeMs: number | undefined;
  let kPlexMembershipAcrossOptima: KPlexMaximumMembershipOptimaSummary | null = null;
  let kPlexMembershipAcrossOptimaError = "";
  let kPlexMembershipEnumerationConflict = false;
  export let kPlexMissingPairsBySet: Record<string, Array<[string, string]>> = {};
  export let kPlexMaximalityBySet: Record<string, MaximalKPlexWitnessExplanation> = {};
  export let kPlexCounterfactualEnabled = false;
  export let kPlexCounterfactualCandidateCount = 0;
  export let kPlexCounterfactualProposals: KPlexCompletionProposal[] = [];
  export let kPlexCounterfactualWhyNot: KPlexCompletionWhyNot | null = null;
  export let kPlexCounterfactualWhyNotMessage = "";
  export let kPlexCounterfactualHasRun = false;
  export let kPlexCounterfactualError = "";
  export let kPlexCounterfactualTimeMs: number | undefined;
  export let kPlexCounterfactualExcludedCandidateCount = 0;
  export let kCoreCounterfactualEnabled = false;
  export let kCoreCounterfactualUnavailableReason = "";
  export let kCoreCounterfactualCandidateCount = 0;
  export let kCoreCounterfactualProposals: KPlexCompletionProposal[] = [];
  export let kCoreCounterfactualWhyNot: KCoreCompletionWhyNot | null = null;
  export let kCoreCounterfactualWhyNotMessage = "";
  export let kCoreCounterfactualHasRun = false;
  export let kCoreCounterfactualError = "";
  export let kCoreCounterfactualTimeMs: number | undefined;
  export let kCoreCounterfactualExcludedCandidateCount = 0;
  export let kCoreMembershipCandidateNodeIds: string[] = [];
  export let kCoreMembershipCounterfactualProposals: KCoreMembershipCompletionProposal[] = [];
  export let kCoreMembershipCounterfactualWhyNot: KCoreMembershipCompletionWhyNot | null = null;
  export let kCoreMembershipCounterfactualWhyNotMessage = "";
  export let kCoreMembershipCounterfactualHasRun = false;
  export let kCoreMembershipCounterfactualError = "";
  export let kCoreMembershipCounterfactualTimeMs: number | undefined;
  export let kCoreMembershipCounterfactualExcludedCandidateCount = 0;
  export let kCoreSupportBySet: Record<string, KCoreSupportingPair[]> = {};
  export let kCorePeelingBySet: Record<string, KCorePeelingCertificate[]> = {};
  export let dominatingSetSupportBySet: Record<string, DominatingSetCoverageWitness[]> = {};
  export let dominatingSetUncoverableTargetNodeIds: string[] = [];
  export let separatorReachableBySet: Record<string, string[]> = {};
  export let timeMs: number | undefined;
  export let graphNodesCount: number | undefined;
  export let graphLinksCount: number | undefined;
  export let selectedGroupNodeCount: number | undefined;
  export let coverageTargetCount: number | undefined;
  export let minimumCutCost: number | undefined;
  export let minimumNodeRemovalCost: number | undefined;
  export let workerWasmMemoryStats: WorkerWasmMemoryStats | null = null;
  export let clingoTiming: ClingoInvocationTiming | null = null;
  export let showClingoTiming: boolean = false;
  export let clingoStats: ClingoInvocationStats | null = null;
  export let showClingoStats: boolean = false;
  export let provenanceScenarioCount = 0;
  export let provenanceKCoreComparison: ProvenanceScenarioKCoreComparison | null = null;
  export let provenanceKCoreComparisonRunning = false;
  export let provenanceKCoreComparisonProgress = "";
  export let provenanceKCoreComparisonError = "";
  export let provenanceKCoreSelectedGroup = "";
  export let provenanceKCoreConfidenceThreshold: number | null = null;
  export let provenanceKCoreTimelineWindow = "";
  export let provenanceKCoreViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  export let provenanceKPlexComparison: ProvenanceScenarioKPlexComparison | null = null;
  export let provenanceKPlexComparisonRunning = false;
  export let provenanceKPlexComparisonProgress = "";
  export let provenanceKPlexComparisonError = "";
  export let provenanceKPlexSelectedGroup = "";
  export let provenanceKPlexConfidenceThreshold: number | null = null;
  export let provenanceKPlexTimelineWindow = "";
  export let provenanceKPlexViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  export let componentScenarioNodes: Array<{ id: string; label: string }> = [];
  export let componentScenarioTargetNodeId = "";
  export let connectedComponentsAvailable = false;
  export let provenanceComponentComparison: ProvenanceScenarioComponentComparison | null = null;
  export let provenanceComponentComparisonRunning = false;
  export let provenanceComponentComparisonProgress = "";
  export let provenanceComponentComparisonError = "";
  export let provenanceComponentSelectedGroup = "";
  export let provenanceComponentConfidenceThreshold: number | null = null;
  export let provenanceComponentTimelineWindow = "";
  export let provenanceComponentViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  export let provenanceDominatingSetComparison: ProvenanceScenarioDominatingSetComparison | null = null;
  export let provenanceDominatingSetComparisonRunning = false;
  export let provenanceDominatingSetComparisonProgress = "";
  export let provenanceDominatingSetComparisonError = "";
  export let provenanceDominatingSetCandidateGroup = "";
  export let provenanceDominatingSetTargetGroup = "";
  export let provenanceDominatingSetConfidenceThreshold: number | null = null;
  export let provenanceDominatingSetTimelineWindow = "";
  export let provenanceDominatingSetViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  $: provenanceKCoreBraveOnlyCount = provenanceKCoreComparison?.memberships.filter(
    (membership) => membership.scenarioSupportCount > 0 && !membership.stableAcrossEveryScenario
  ).length ?? 0;
  $: provenanceKCoreNotBraveCount = provenanceKCoreComparison?.memberships.filter(
    (membership) => membership.scenarioSupportCount === 0
  ).length ?? 0;
  $: provenanceKPlexBraveOnlyCount = provenanceKPlexComparison?.memberships.filter(
    (membership) => membership.optimalAnswerSetCount > 0 && !membership.stableAcrossEveryOptimalAnswerSet
  ).length ?? 0;
  $: provenanceKPlexNotBraveCount = provenanceKPlexComparison?.memberships.filter(
    (membership) => membership.optimalAnswerSetCount === 0
  ).length ?? 0;
  $: provenanceDominatingSetBraveOnlyCount = provenanceDominatingSetComparison?.memberships.filter(
    (membership) => membership.selectedMinimumSetCount > 0 && !membership.selectedInEveryScenarioMinimumSet
  ).length ?? 0;
  $: provenanceDominatingSetNotBraveCount = provenanceDominatingSetComparison?.memberships.filter(
    (membership) => membership.selectedMinimumSetCount === 0
  ).length ?? 0;
  $: provenanceComponentBraveOnlyCount = provenanceComponentComparison?.memberships.filter(
    (membership) => membership.sameComponentScenarioCount > 0 && !membership.sameComponentInEveryDeclaredScenario
  ).length ?? 0;
  $: provenanceComponentNotBraveCount = provenanceComponentComparison?.memberships.filter(
    (membership) => membership.sameComponentScenarioCount === 0 && membership.comparableScenarioCount > 0
  ).length ?? 0;
  $: provenanceComponentUndefinedCount = provenanceComponentComparison?.memberships.filter(
    (membership) => membership.comparableScenarioCount === 0
  ).length ?? 0;
  export let provenanceDominatingSetScenarioWhyNot: {
    scenarioId: string;
    scenarioLabel: string;
    scenarioSources: string[];
    uncoverableTargetNodeIds: string[];
    candidateGroup: string;
    targetGroup: string;
    confidenceThreshold: number | null;
    timelineWindow: string;
    viewFilters: { types: string[]; groups: string[] };
  } | null = null;

  let selectedKplexSignature = "";
  let kPlexCompletionTargetS = 1;
  let kCoreCompletionTarget = 3;
  let kCoreCompletionEnumerateAllOptima = false;
  let kCoreMembershipCompletionTarget = Number(parameter);
  let kCoreMembershipTargetNodeId = "";
  let selectedKcoreSignature = "";
  let selectedKcoreNodeId = "";
  let selectedDominatingSignature = "";
  let selectedDominatingTargetId = "";
  let selectedSeparatorSignature = "";
  let selectedCommunityStabilityNodeId = "";
  let selectedCommunityPairLeftNodeId = "";
  let selectedCommunityPairRightNodeId = "";
  let selectedCommunityTopologyTarget: "always" | "sometimes" | "never" = "always";
  let communityStabilityError = "";
  let communityCoassignmentSummary: CommunityCoassignmentSummary | null = null;
  let previousKCoreSourceParameter = Number(parameter);
  let previousKCoreMembershipSourceParameter = Number(parameter);
  let previousKCoreMembershipCandidateDomain = "";

  $: if (componentScenarioTargetNodeId &&
    !componentScenarioNodes.some((node) => node.id === componentScenarioTargetNodeId)) {
    componentScenarioTargetNodeId = "";
  }

  const dispatch = createEventDispatcher();
  $: if (task === "kCore" && Number.isSafeInteger(Number(parameter)) &&
    Number(parameter) !== previousKCoreSourceParameter) {
    previousKCoreSourceParameter = Number(parameter);
    kCoreCompletionTarget = Number(parameter) + 1;
  }
  $: kCoreMembershipNodeOptions = availableNodes.filter((node) =>
    kCoreMembershipCandidateNodeIds.includes(String(node.id))
  );
  $: if (task === "kCore" && kCoreMembershipNodeOptions.length > 0 &&
    !kCoreMembershipNodeOptions.some((node) => node.id === kCoreMembershipTargetNodeId)) {
    kCoreMembershipTargetNodeId = kCoreMembershipNodeOptions[0].id;
    dispatch("kCoreMembershipCriteriaChange");
  }
  $: kCoreMembershipCandidateDomain = kCoreMembershipCandidateNodeIds.map(String).sort().join("\u0000");
  $: if (task === "kCore" && kCoreMembershipCandidateDomain !== previousKCoreMembershipCandidateDomain) {
    previousKCoreMembershipCandidateDomain = kCoreMembershipCandidateDomain;
    dispatch("kCoreMembershipCriteriaChange");
  }
  $: if (task === "kCore" && Number.isSafeInteger(Number(parameter)) &&
    Number(parameter) !== previousKCoreMembershipSourceParameter) {
    previousKCoreMembershipSourceParameter = Number(parameter);
    kCoreMembershipCompletionTarget = Number(parameter);
    dispatch("kCoreMembershipCriteriaChange");
  }

  function countForm(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
  }

  $: selectedGroupAppliesToTask = task !== "minimumEdgeSeparator" && task !== "minimumCostEdgeSeparator";

  function edgeProvenanceSummary(edgeIds: string[]): string {
    return edgeIds.flatMap((edgeId) => {
      const provenance = edgeProvenanceById[edgeId];
      const identity = edgeSourceIdentityById[edgeId];
      const label = identity?.sourceId ?? (identity?.generatedRecordKey
        ? `chiave locale generata: ${identity.generatedRecordKey}`
        : sourceIdByEdgeId[edgeId] ?? edgeId);
      return provenance ? [`${label}: ${provenance}`] : [];
    }).join(" | ");
  }

  function structuredEdgeEvidence(edgeIds: string[]) {
    return edgeIds.map((edgeId) => {
      const identity = edgeSourceIdentityById[edgeId];
      const sourceId = identity?.sourceId ?? sourceIdByEdgeId[edgeId] ?? edgeId;
      const generatedRecordKey = identity?.generatedRecordKey;
      return generatedRecordKey
        ? { generated_record_key: generatedRecordKey, provenance_references: [] }
        : identity?.legacyEndpointPair
          ? { legacy_endpoint_pair: identity.legacyEndpointPair.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId), provenance_references: [] }
        : { edge_id: sourceId, provenance_references: getOwnRecordValue<string[]>(edgeProvenanceReferencesBySourceId, sourceId) ?? [] };
    });
  }

  function structuredEdgeId(edgeId: string): string | undefined {
    const identity = edgeSourceIdentityById[edgeId];
    if (identity?.legacyEndpointPair) return undefined;
    return identity?.sourceId ?? identity?.generatedRecordKey ?? sourceIdByEdgeId[edgeId] ?? edgeId;
  }

  function structuredEdgeIds(edgeIds: string[]): string[] {
    return edgeIds.flatMap((edgeId) => {
      const id = structuredEdgeId(edgeId);
      return id === undefined ? [] : [id];
    });
  }

  function edgeRecordDescription(record: { edgeIdentity: string; edgeId?: string; edgeIdGenerated: boolean }): string {
    const label = record.edgeId
      ? `${record.edgeIdGenerated ? "chiave locale" : "ID sorgente"} ${record.edgeId}`
      : sourceIdByEdgeId[record.edgeIdentity] ?? "estremi legacy";
    const provenance = edgeProvenanceById[record.edgeIdentity];
    return provenance ? `${label} (fonte dichiarata: ${provenance})` : label;
  }

  let previousQuerySignature = "";
  $: {
    const querySignature = JSON.stringify([
      task,
      parameter,
      kCoreMode,
      includeKCoreNumbers,
      enumerateAllOptima,
      enumerateAllMaximalKPlex,
      explainKCoreExclusions,
      explainCommunityContributions,
      explainCommunityInfeasibility,
      explainPathMinimality,
      explainTypedPathNoRoute,
      pathTemporalSemantics,
      pathStrictTemporalOrder,
      selectedGroup,
      selectedTargetGroup,
      startNodeId,
      goalNodeId,
      pathEdgeTypeSequence,
      minimumCommunityCount,
      maximumCommunityCount,
      communityUsesEdgeWeights,
      communityResolution,
      componentScenarioTargetNodeId
    ]);
    if (previousQuerySignature && querySignature !== previousQuerySignature) {
      dispatch("criteriaChange");
    }
    previousQuerySignature = querySignature;
  }

  $: taskLabel = task === "kPlex"
    ? "k-plex massimo"
    : task === "maximalKPlex"
      ? "k-plex massimali per inclusione"
    : task === "kCore"
      ? "k-core"
      : task === "components"
        ? "componenti connesse"
        : task === "weakComponents"
          ? "componenti debolmente connesse"
        : task === "strongComponents"
          ? "componenti fortemente connesse"
        : task === "dominatingSet"
          ? "insieme dominante minimo"
          : task === "minimumNodeSeparator"
            ? "separatore minimo di nodi"
            : task === "minimumCostNodeSeparator"
              ? "separatore di nodi a costo minimo"
            : task === "minimumEdgeSeparator"
              ? "taglio minimo di archi"
              : task === "minimumCostEdgeSeparator"
                ? "taglio a costo minimo di archi"
              : task === "communities"
                ? "comunità modulari"
                : task === "typedPath"
                  ? "cammino con sequenza tipizzata"
                : "cammino minimo";
  $: taskContract = getGraphTaskContract(task, {
    direction: directedGraph ? "directed" : "undirected",
    temporalSemantics: pathTemporalSemantics,
    useEdgeWeights: task === "communities" && communityUsesEdgeWeights
  });
  $: taskEnumerationDescription = getTaskEnumerationDescription(task, {
    enumerateAllOptima,
    enumerateAllMaximalKPlex
  });
  $: parameterLabel = task === "kPlex" || task === "maximalKPlex" ? "s" : task === "kCore" ? "k" : "max archi";
  $: kCoreNeighborLabel = !directedGraph
    ? "vicini"
    : kCoreMode === "in"
      ? "predecessori"
      : kCoreMode === "out"
        ? "successori"
        : kCoreMode === "mutual"
          ? "vicini reciproci"
          : "vicini";
  $: kCoreNeighborSingularLabel = !directedGraph
    ? "vicino"
    : kCoreMode === "in"
      ? "predecessore"
      : kCoreMode === "out"
        ? "successore"
        : kCoreMode === "mutual"
          ? "vicino reciproco"
          : "vicino";
  $: emptyKcorePeeling = kCorePeelingBySet[""] ?? [];
  $: kCoreProfileLevels = Object.entries(kCoreNumbers ?? {}).reduce<Array<{ coreNumber: number; nodeIds: string[] }>>(
    (levels, [nodeId, coreNumber]) => {
      let level = levels.find((item) => item.coreNumber === coreNumber);
      if (!level) {
        level = { coreNumber, nodeIds: [] };
        levels.push(level);
      }
      level.nodeIds.push(nodeId);
      return levels;
    },
    []
  ).sort((left, right) => left.coreNumber - right.coreNumber);
  $: parameterizedTask = task === "kPlex" || task === "maximalKPlex" || task === "kCore" || task === "path";
  $: invalidParameter = parameterizedTask &&
    (!Number.isInteger(Number(parameter)) || Number(parameter) < (task === "kPlex" || task === "maximalKPlex" ? 1 : 0) || (task === "path" && Number(parameter) > 100));
  $: invalidKCoreMode = task === "kCore" && directedGraph &&
    kCoreMode !== "in" && kCoreMode !== "out" && kCoreMode !== "mutual";
  $: invalidCommunityCounts = task === "communities" && (
    !Number.isInteger(Number(minimumCommunityCount)) ||
    !Number.isInteger(Number(maximumCommunityCount)) ||
    Number(minimumCommunityCount) < 0 || Number(maximumCommunityCount) < 0 ||
    (Number(minimumCommunityCount) > 0 && Number(maximumCommunityCount) > 0 && Number(minimumCommunityCount) > Number(maximumCommunityCount))
  );
  $: invalidTypedPath = task === "typedPath" && (
    !typedPathRequirementsAvailable ||
    (pathTemporalSemantics !== "static" && !typedPathTemporalRequirementsAvailable) ||
    pathEdgeTypeSequence.length === 0 ||
    pathEdgeTypeSequence.some((edgeType) => !availableEdgeTypes.includes(edgeType))
  );
  $: resultSize = resultSets[0]?.length ?? 0;
  $: if (task === "kPlex" && resultSets.length > 0 &&
    !kPlexMembershipNodes.some((node) => node.id === kPlexMembershipTargetNodeId)) {
    kPlexMembershipTargetNodeId = kPlexMembershipNodes[0]?.id ?? "";
  }
  $: {
    kPlexMembershipAcrossOptima = null;
    kPlexMembershipAcrossOptimaError = "";
    if (task === "kPlex" && enumerateAllOptima && resultSets.length > 0) {
      try {
        kPlexMembershipAcrossOptima = summarizeMaximumKPlexMembershipAcrossOptima(
          kPlexMembershipTargetNodeId,
          resultSets,
          {
            candidateNodeIds: kPlexMembershipNodes.map((node) => node.id),
            globalMaximumSize: resultSets[0]?.length ?? 0
          }
        );
      } catch (error) {
        kPlexMembershipAcrossOptimaError = error instanceof Error
          ? error.message
          : "L'enumerazione dei k-plex massimi non è verificabile.";
      }
    }
    kPlexMembershipEnumerationConflict = Boolean(
      kPlexMembershipDiagnosis && kPlexMembershipAcrossOptima &&
      (kPlexMembershipDiagnosis.outcome === "included-in-maximum") !==
        (kPlexMembershipAcrossOptima.targetOptimalKplexes > 0)
    );
  }
  $: communityStabilityNodeIds = [...new Set(communityPartitions.flatMap((partition) => partition.communities.flat()))]
    .sort((left, right) => left.localeCompare(right));
  $: communityPairObjectiveLosses = communityPairMembershipResult
    ? getCommunityPairObjectiveLosses(communityPairMembershipResult)
    : null;
  $: if (communityStabilityNodeIds.length > 0 && !communityStabilityNodeIds.includes(selectedCommunityStabilityNodeId)) {
    selectedCommunityStabilityNodeId = communityStabilityNodeIds[0];
  }
  $: if (communityStabilityNodeIds.length > 0 && !communityStabilityNodeIds.includes(selectedCommunityPairLeftNodeId)) {
    selectedCommunityPairLeftNodeId = communityStabilityNodeIds[0];
  }
  $: if (communityStabilityNodeIds.length > 1 &&
    (!communityStabilityNodeIds.includes(selectedCommunityPairRightNodeId) ||
      selectedCommunityPairRightNodeId === selectedCommunityPairLeftNodeId)) {
    selectedCommunityPairRightNodeId = communityStabilityNodeIds.find((nodeId) => nodeId !== selectedCommunityPairLeftNodeId) ?? "";
  }
  $: {
    communityStabilityError = "";
    communityCoassignmentSummary = null;
    if (task === "communities" && enumerateAllOptima && communityPartitions.length > 0 && selectedCommunityStabilityNodeId) {
      try {
        communityCoassignmentSummary = summarizeCommunityCoassignment(communityPartitions, selectedCommunityStabilityNodeId);
      } catch (error) {
        communityStabilityError = error instanceof Error ? error.message : "Impossibile calcolare il riepilogo di co-appartenenza.";
      }
    }
  }
  $: selectedKplexMissingPairs = kPlexMissingPairsBySet[selectedKplexSignature] ?? [];
  $: selectedKplexMaximality = kPlexMaximalityBySet[selectedKplexSignature];
  $: selectedKcoreSupportPairs = kCoreSupportBySet[selectedKcoreSignature] ?? [];
  $: selectedKcorePeeling = kCorePeelingBySet[selectedKcoreSignature] ?? [];
  $: selectedKcoreNodePairs = selectedKcoreSupportPairs.filter((pair) =>
    directedGraph && kCoreMode !== ""
      ? pair.sourceNodeId === selectedKcoreNodeId
      : pair.sourceNodeId === selectedKcoreNodeId || pair.targetNodeId === selectedKcoreNodeId
  );
  $: selectedKcoreNeighborIds = selectedKcoreNodePairs.map((pair) =>
    directedGraph && kCoreMode !== ""
      ? pair.targetNodeId
      : pair.sourceNodeId === selectedKcoreNodeId ? pair.targetNodeId : pair.sourceNodeId
  );
  $: selectedDominatingCoverage = dominatingSetSupportBySet[selectedDominatingSignature] ?? [];
  $: selectedDominatingTargetIds = [...new Set(selectedDominatingCoverage.map((item) => item.targetNodeId))].sort();
  $: selectedDominatingTargetCoverage = selectedDominatingCoverage.filter((item) =>
    item.targetNodeId === selectedDominatingTargetId
  );
  $: separatorTask = task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" ||
    task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator";
  $: defaultSeparatorSignature = resultSets.length > 0 ? nodeSetSignature(resultSets[0]) : "";
  $: activeSeparatorSignature = selectedSeparatorSignature || defaultSeparatorSignature;
  $: selectedSeparatorReachable = separatorReachableBySet[activeSeparatorSignature] ?? [];

  function nodeSetSignature(nodeIds: string[]): string {
    return [...nodeIds].sort().join("\u0000");
  }

  function highlightNodeSet(nodeIds: string[]) {
    const nextKplexSignature = task === "kPlex" || task === "maximalKPlex" ? nodeSetSignature(nodeIds) : "";
    if (nextKplexSignature !== selectedKplexSignature) dispatch("kPlexCohortChange");
    selectedKplexSignature = nextKplexSignature;
    const nextKcoreSignature = task === "kCore" ? nodeSetSignature(nodeIds) : "";
    if (nextKcoreSignature !== selectedKcoreSignature) dispatch("kCoreCohortChange");
    selectedKcoreSignature = nextKcoreSignature;
    selectedDominatingSignature = task === "dominatingSet" ? nodeSetSignature(nodeIds) : "";
    if (task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator") {
      selectedSeparatorSignature = nodeSetSignature(nodeIds);
    }
    if (task === "dominatingSet") {
      const signature = selectedDominatingSignature;
      const coverage = dominatingSetSupportBySet[signature] ?? [];
      selectedDominatingTargetId = [...new Set(coverage.map((item) => item.targetNodeId))].sort()[0] ?? "";
      const edgeIds = coverage
        .filter((item) => item.targetNodeId === selectedDominatingTargetId)
        .flatMap((item) => item.supportingRecords.map((record) => record.edgeIdentity));
      dispatch("highlightDominatingSet", { nodeIds, edgeIds });
      return;
    }
    if (task === "kCore") {
      selectedKcoreNodeId = nodeIds[0] ?? "";
      const supportingEdgeIds = (kCoreSupportBySet[selectedKcoreSignature] ?? []).flatMap((pair) =>
        pair.supportingRecords.map((record) => record.edgeIdentity)
      );
      dispatch("highlightKCore", { nodeIds, edgeIds: supportingEdgeIds });
      return;
    }
    dispatch("highlight", nodeIds);
  }

  function highlightEdgeSeparatorSet(edgeIds: string[]) {
    selectedSeparatorSignature = nodeSetSignature(edgeIds);
    dispatch("highlightEdges", edgeIds);
  }

  function requestRun() {
    selectedKplexSignature = "";
    selectedKcoreSignature = "";
    selectedKcoreNodeId = "";
    selectedDominatingSignature = "";
    selectedDominatingTargetId = "";
    selectedSeparatorSignature = "";
    dispatch("run", {
      task,
      parameter: Number(parameter),
      kCoreMode,
      includeKCoreNumbers,
      group: selectedGroupAppliesToTask ? selectedGroup : "",
      targetGroup: selectedTargetGroup,
      enumerateAllOptima,
      enumerateAllMaximalKPlex,
      explainKCoreExclusions,
      explainCommunityContributions,
      explainCommunityInfeasibility,
      explainPathMinimality,
      explainTypedPathNoRoute,
      startNodeId,
      goalNodeId,
      pathEdgeTypeSequence: [...pathEdgeTypeSequence],
      pathTemporalSemantics,
      strictTemporalOrder: pathStrictTemporalOrder,
      minimumCommunityCount: Number(minimumCommunityCount),
      maximumCommunityCount: Number(maximumCommunityCount)
    });
  }

  function requestCommunityPairMembership() {
    if (!selectedCommunityPairLeftNodeId || !selectedCommunityPairRightNodeId ||
      selectedCommunityPairLeftNodeId === selectedCommunityPairRightNodeId) return;
    dispatch("probeCommunityPairMembership", [selectedCommunityPairLeftNodeId, selectedCommunityPairRightNodeId]);
  }

  function clearCommunityPairMembershipResult() {
    dispatch("clearCommunityPairMembership");
  }

  function requestScenarioKCoreComparison() {
    dispatch("compareScenarios", {
      k: Number(parameter),
      degreeMode: directedGraph ? kCoreMode : "undirected",
      group: selectedGroupAppliesToTask ? selectedGroup : ""
    });
  }

  function requestScenarioKPlexComparison() {
    dispatch("compareKPlexScenarios", {
      s: Number(parameter),
      group: selectedGroupAppliesToTask ? selectedGroup : "",
      enumerateAllOptima
    });
  }

  function requestScenarioComponentComparison() {
    dispatch("compareComponentScenarios", {
      task: task as ProvenanceScenarioComponentTask,
      targetNodeId: componentScenarioTargetNodeId,
      group: selectedGroupAppliesToTask ? selectedGroup : ""
    });
  }

  function requestScenarioDominatingSetComparison() {
    dispatch("compareDominatingSetScenarios", {
      candidateGroup: selectedGroupAppliesToTask ? selectedGroup : "",
      targetGroup: selectedTargetGroup
    });
  }

  function exportScenarioKCoreComparison() {
    if (!provenanceKCoreComparison) return;
    downloadCsvText(
      "kcore_provenance_scenario_stability.csv",
      buildProvenanceScenarioKCoreCsv(
        provenanceKCoreComparison,
        nodeLabelById,
        provenanceKCoreSelectedGroup,
        provenanceKCoreConfidenceThreshold,
        provenanceKCoreTimelineWindow,
        provenanceKCoreViewFilters
      )
    );
  }

  function exportScenarioKPlexComparison() {
    if (!provenanceKPlexComparison) return;
    downloadCsvText(
      "kplex_provenance_scenario_stability.csv",
      buildProvenanceScenarioKPlexCsv(
        provenanceKPlexComparison,
        nodeLabelById,
        provenanceKPlexSelectedGroup,
        provenanceKPlexConfidenceThreshold,
        provenanceKPlexTimelineWindow,
        provenanceKPlexViewFilters
      )
    );
  }

  function exportScenarioComponentComparison() {
    if (!provenanceComponentComparison) return;
    downloadCsvText(
      `${provenanceComponentComparison.task}_provenance_scenario_components.csv`,
      buildProvenanceScenarioComponentsCsv(
        provenanceComponentComparison,
        nodeLabelById,
        provenanceComponentSelectedGroup,
        provenanceComponentConfidenceThreshold,
        provenanceComponentTimelineWindow,
        provenanceComponentViewFilters
      )
    );
  }

  function exportScenarioDominatingSetComparison() {
    if (!provenanceDominatingSetComparison) return;
    downloadCsvText(
      "dominating_set_provenance_scenario_comparison.csv",
      buildProvenanceScenarioDominatingSetCsv(
        provenanceDominatingSetComparison,
        nodeLabelById,
        provenanceDominatingSetConfidenceThreshold,
        provenanceDominatingSetTimelineWindow,
        provenanceDominatingSetViewFilters
      )
    );
  }

  function exportScenarioDominatingSetWhyNot() {
    if (!provenanceDominatingSetScenarioWhyNot) return;
    downloadCsvText(
      "dominating_set_provenance_scenario_why_not.csv",
      buildProvenanceScenarioDominatingSetInfeasibilityCsv({
        ...provenanceDominatingSetScenarioWhyNot,
        sourceIdByNodeId,
        nodeLabels: nodeLabelById
      })
    );
  }

  function exportResults() {
    if (task === "typedPath") {
      if (!resultSets[0] || pathEdgeIdsByStep.length !== pathEdgeTypeSequence.length) return;
      if (pathTemporalSemantics !== "static") {
        const rows = ["step,edge_type,from_node,to_node,temporal_semantics,common_time_value,step_start_time_value,supporting_edge_ids,supporting_edge_provenance,structured_witness_json"];
        pathEdgeTypeSequence.forEach((edgeType, index) => {
          const sourceNode = sourceIdByNodeId[resultSets[0][index]] ?? resultSets[0][index];
          const targetNode = sourceIdByNodeId[resultSets[0][index + 1]] ?? resultSets[0][index + 1];
          const startTimeValue = pathStartTimeValuesByStep[index];
          const edgeIds = structuredEdgeIds(pathEdgeIdsByStep[index]);
          rows.push([
            index + 1,
            edgeType,
            sourceNode,
            targetNode,
            pathTemporalSemantics,
            pathCommonTimeValue ?? "",
            startTimeValue ?? "",
            edgeIds.join(" | "),
            edgeProvenanceSummary(pathEdgeIdsByStep[index]),
            JSON.stringify({
              step: index + 1,
              edge_type: edgeType,
              from_node: sourceNode,
              to_node: targetNode,
              temporal_semantics: pathTemporalSemantics,
              ...(pathCommonTimeValue !== undefined ? { common_time_value: pathCommonTimeValue } : {}),
              ...(startTimeValue !== undefined ? { step_start_time_value: startTimeValue } : {}),
              supporting_edge_ids: edgeIds,
              supporting_edge_evidence: structuredEdgeEvidence(pathEdgeIdsByStep[index])
            })
          ].map(csvCell).join(","));
        });
        downloadCsvText("typed_path_temporal.csv", rows.join("\n"));
        return;
      }
      const rows = ["step,edge_type,from_node,to_node,supporting_edge_ids,supporting_edge_provenance,structured_witness_json"];
      pathEdgeTypeSequence.forEach((edgeType, index) => {
        rows.push([
          index + 1,
          edgeType,
          sourceIdByNodeId[resultSets[0][index]] ?? resultSets[0][index],
          sourceIdByNodeId[resultSets[0][index + 1]] ?? resultSets[0][index + 1],
            structuredEdgeIds(pathEdgeIdsByStep[index]).join(" | "),
          edgeProvenanceSummary(pathEdgeIdsByStep[index]),
          JSON.stringify({
            step: index + 1,
            edge_type: edgeType,
            from_node: sourceIdByNodeId[resultSets[0][index]] ?? resultSets[0][index],
            to_node: sourceIdByNodeId[resultSets[0][index + 1]] ?? resultSets[0][index + 1],
            supporting_edge_ids: structuredEdgeIds(pathEdgeIdsByStep[index]),
            supporting_edge_evidence: structuredEdgeEvidence(pathEdgeIdsByStep[index])
          })
        ].map(csvCell).join(","));
      });
      downloadCsvText("typed_path.csv", rows.join("\n"));
      return;
    }
    if (task === "communities") {
      if (!communityPartitions.length) return;
      const hasNonDefaultResolution = communityResolutionNumerator !== communityResolutionDenominator;
      const rows = [hasNonDefaultResolution
        ? "solution,community,size,nodes,modularity_Q_gamma,structured_witness_json,resolution_gamma,resolution_numerator_p,resolution_denominator_q"
        : "solution,community,size,nodes,modularity,structured_witness_json"];
      communityPartitions.forEach((partition, partitionIndex) => {
        partition.communities.forEach((community, communityIndex) => {
          rows.push([
            partitionIndex + 1,
            communityIndex + 1,
            community.length,
            community.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId).join(" | "),
            modularity?.toFixed(6) ?? "",
            JSON.stringify({
              node_ids: community.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId),
              ...(hasNonDefaultResolution
                ? { modularity_resolution: {
                  gamma: communityResolution,
                  numerator: communityResolutionNumerator,
                  denominator: communityResolutionDenominator
                } }
                : {}),
              attribute_bound_counts: communityAttributeBoundsFor(community, partition).map((bound) => ({
                community_id: sourceIdByNodeId[bound.communityId] ?? bound.communityId,
                attribute: bound.attribute,
                value: bound.value,
                count: bound.count,
                ...(bound.minimum !== undefined ? { minimum_per_community: bound.minimum } : {}),
                ...(bound.maximum !== undefined ? { maximum_per_community: bound.maximum } : {})
              }))
            }),
            ...(hasNonDefaultResolution
              ? [communityResolution, communityResolutionNumerator, communityResolutionDenominator]
              : [])
          ].map(csvCell).join(","));
        });
      });
      downloadCsvText("modularity_communities.csv", rows.join("\n"));
      return;
    }
    if (!resultSets.length) return;
    const edgeTask = task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator";
    const costAwareTask = task === "minimumCostEdgeSeparator" || task === "minimumCostNodeSeparator";
    const kPlexTask = task === "kPlex" || task === "maximalKPlex";
    const rows = [kPlexTask
      ? "task,parameter,plex_semantics,eligible_group,size,nodes"
      : edgeTask
      ? task === "minimumCostEdgeSeparator"
        ? "task,parameter,eligible_group,target_group,size,total_removal_cost,edges,edge_provenance"
        : "task,parameter,eligible_group,target_group,size,edges,edge_provenance"
      : task === "kCore"
        ? "task,parameter,k_core_mode,eligible_group,size,nodes"
      : costAwareTask
        ? "task,parameter,eligible_group,target_group,size,total_removal_cost,nodes"
        : "task,parameter,eligible_group,target_group,size,nodes"];
    rows[0] += ",structured_witness_json";
    for (const nodeSet of resultSets) {
      const taskParameter = parameterizedTask ? parameter : "";
      const sourceIds = nodeSet.map((id) => edgeTask
        ? sourceIdByEdgeId[id] ?? id
        : sourceIdByNodeId[id] ?? id);
      const row = kPlexTask
        ? [task, taskParameter, task === "kPlex" ? "maximum_cardinality" : "inclusion_maximal", selectedGroup, nodeSet.length, sourceIds.join(" | ")]
        : task === "kCore"
          ? [task, taskParameter, directedGraph ? kCoreMode : "undirected", selectedGroup, nodeSet.length, sourceIds.join(" | ")]
        : [task, taskParameter, selectedGroup, task === "dominatingSet" ? selectedTargetGroup : "", nodeSet.length,
          ...(task === "minimumCostEdgeSeparator" ? [minimumCutCost ?? ""] : []),
          ...(task === "minimumCostNodeSeparator" ? [minimumNodeRemovalCost ?? ""] : []),
          sourceIds.join(" | ")];
      if (edgeTask) row.push(edgeProvenanceSummary(nodeSet));
      row.push(JSON.stringify({
        element_ids: sourceIds,
        ...(edgeTask ? { supporting_edge_evidence: structuredEdgeEvidence(nodeSet) } : {})
      }));
      rows.push(row.map(csvCell).join(","));
    }
    downloadCsvText(task === "components"
      ? "connected_components.csv"
      : task === "weakComponents"
        ? "weakly_connected_components.csv"
      : task === "strongComponents"
        ? "strongly_connected_components.csv"
      : task === "path"
        ? `shortest_path_max_${parameter}_edges.csv`
        : task === "dominatingSet"
          ? "minimum_dominating_set.csv"
          : task === "minimumNodeSeparator"
            ? "minimum_node_separator.csv"
            : task === "minimumCostNodeSeparator"
              ? "minimum_cost_node_separator.csv"
            : task === "minimumEdgeSeparator"
              ? "minimum_edge_separator.csv"
              : task === "minimumCostEdgeSeparator"
                ? "minimum_cost_edge_separator.csv"
            : `${task === "kPlex" ? "maximum_k_plex" : task === "maximalKPlex" ? "maximal_k_plex" : "k_core"}_${parameter}.csv`, rows.join("\n"));
  }

  function exportSeparatorCertificate() {
    if (!separatorTask || resultSets.length === 0) return;
    const edgeTask = task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator";
    const witnesses = resultSets.map((removedIds) => ({
      removedIds,
      reachableNodeIds: separatorReachableBySet[nodeSetSignature(removedIds)] ?? []
    }));
    const csv = buildSeparatorCertificateCsv({
      task,
      startTerminalId: startNodeId,
      goalTerminalId: goalNodeId,
      witnesses,
      edgeTask,
      sourceIdByNodeId,
      sourceIdByEdgeId,
      edgeProvenanceSummary,
      structuredEdgeEvidence
    });
    downloadCsvText(`${task}_certificate.csv`, csv);
  }

  function highlightSeparatorReachableSide() {
    if (selectedSeparatorReachable.length > 0) {
      dispatch("highlightSeparatorSide", selectedSeparatorReachable);
    }
  }

  function highlightKCorePeelingStep(step: KCorePeelingCertificate) {
    const edgeIds = step.supportingPairs.flatMap((pair) =>
      pair.supportingRecords.map((record) => record.edgeIdentity)
    );
    dispatch("highlightKCorePeeling", {
      nodeIds: [step.nodeId, ...step.survivingNeighborIds],
      edgeIds
    });
  }

  function getKCoreNodeIdsAtThreshold(threshold: number): string[] {
    return Object.entries(kCoreNumbers ?? {})
      .filter(([, coreNumber]) => coreNumber >= threshold)
      .map(([nodeId]) => nodeId);
  }

  function highlightKCoreProfile(threshold: number) {
    const nodeIds = getKCoreNodeIdsAtThreshold(threshold);
    selectedKcoreSignature = "";
    selectedKcoreNodeId = "";
    dispatch("highlightKCoreProfile", nodeIds);
  }

  function highlightCommunity(community: string[], partition: ModularityPartition) {
    const contribution = partition.communityContributions?.find((item) => community.includes(item.communityId));
    dispatch("highlightCommunity", {
      nodeIds: community,
      edgeIds: contribution?.supportingEdgeIds ?? []
    });
  }

  function communityAttributeBoundsFor(community: string[], partition: ModularityPartition) {
    return (partition.attributeBoundCounts ?? []).filter((bound) => community.includes(bound.communityId));
  }

  function exportCommunityCertificate(partition: ModularityPartition, partitionIndex: number) {
    if (!partition.communityContributions) return;
    downloadCsvText(`modularity_certificate_partition_${partitionIndex + 1}.csv`, buildModularityCertificateCsv({
      partition,
      resolution: communityResolution,
      resolutionNumerator: communityResolutionNumerator,
      resolutionDenominator: communityResolutionDenominator,
      usesEdgeWeights: communityUsesEdgeWeights,
      totalEdgeCount: graphLinksCount ?? 0,
      totalScaledWeight: communityScaledTotalWeight ?? 0,
      displayTotalWeight: communityDisplayTotalWeight,
      weightScaleFactor: communityWeightScaleFactor,
      sourceIdByNodeId,
      sourceIdByEdgeId,
      edgeProvenanceSummary,
      structuredEdgeEvidence
    }));
  }

  function exportCommunityCoassignment() {
    if (!communityCoassignmentSummary) return;
    downloadCsvText("modularity_optimum_coassignment.csv", buildCommunityCoassignmentCsv({
      summary: communityCoassignmentSummary,
      sourceIdByNodeId,
      nodeLabels: nodeLabelById,
      selectedGroup: selectedGroup || "Tutti i nodi",
      resolution: communityResolution,
      resolutionNumerator: communityResolutionNumerator,
      resolutionDenominator: communityResolutionDenominator,
      weighted: communityUsesEdgeWeights
    }));
  }

  function exportCommunityPairMembership() {
    if (!communityPairMembershipResult) return;
    downloadCsvText("modularity_pair_optimum_membership.csv", buildCommunityPairMembershipCsv({
      result: communityPairMembershipResult,
      sourceIdByNodeId,
      nodeLabels: nodeLabelById,
      selectedGroup: selectedGroup || "Tutti i nodi",
      resolution: communityResolution,
      resolutionNumerator: communityResolutionNumerator,
      resolutionDenominator: communityResolutionDenominator,
      weighted: communityUsesEdgeWeights
    }));
  }

  function requestCommunityTopologyCounterfactual() {
    if (!selectedCommunityPairLeftNodeId || !selectedCommunityPairRightNodeId ||
      selectedCommunityPairLeftNodeId === selectedCommunityPairRightNodeId) return;
    dispatch("searchCommunityTopologyCounterfactual", {
      pair: [selectedCommunityPairLeftNodeId, selectedCommunityPairRightNodeId],
      relation: selectedCommunityTopologyTarget
    });
  }

  function exportCommunityTopologyCounterfactual() {
    if (!communityTopologyCounterfactualResult) return;
    downloadCsvText("modularity_pair_topology_counterfactual.csv", buildCommunityTopologyCounterfactualCsv({
      result: communityTopologyCounterfactualResult,
      sourceIdByNodeId,
      nodeLabels: nodeLabelById,
      selectedGroup: selectedGroup || "Tutti i nodi",
      resolution: communityResolution,
      weighted: communityUsesEdgeWeights
    }));
  }

  function communityConstraintNodeLabel(nodeId: string): string {
    const label = nodeLabelById[nodeId] ?? nodeId;
    const sourceId = sourceIdByNodeId[nodeId] ?? nodeId;
    return label === sourceId ? sourceId : `${label} (${sourceId})`;
  }

  function communityConstraintLabel(constraint: CommunityConstraintRelaxationSpec): string {
    if (constraint.kind === "minimumCommunityCount") return `Numero minimo di comunità: ${constraint.count}`;
    if (constraint.kind === "maximumCommunityCount") return `Numero massimo di comunità: ${constraint.count}`;
    if (constraint.kind === "mustLink" || constraint.kind === "cannotLink") {
      const pair = constraint.nodeIds ?? [];
      const relationship = constraint.kind === "mustLink" ? "must-link" : "cannot-link";
      return `${relationship}: ${pair.map(communityConstraintNodeLabel).join(" ↔ ") || constraint.pair.join(" ↔ ")}`;
    }
    if (constraint.kind !== "attributeBound") return "Vincolo di comunità";
    return `Composizione per ${constraint.attributeName ?? "attributo"}=${JSON.stringify(constraint.attributeValue)}${constraint.minPerCommunity !== undefined ? `, minimo ${constraint.minPerCommunity}` : ""}${constraint.maxPerCommunity !== undefined ? `, massimo ${constraint.maxPerCommunity}` : ""} nodi per comunità`;
  }

  function exportCommunityConstraintDiagnoses() {
    if (communityConstraintDiagnoses.length === 0) return;
    downloadCsvText("modularity_constraint_diagnosis.csv", buildCommunityConstraintDiagnosisCsv({
      diagnoses: communityConstraintDiagnoses,
      sourceIdByNodeId,
      nodeLabels: nodeLabelById,
      selectedGroup: selectedGroup || "Tutti i nodi"
    }));
  }

  function exportKPlexMaximumMembershipDiagnosis() {
    if (!kPlexMembershipDiagnosis || kPlexMembershipAcrossOptimaError || kPlexMembershipEnumerationConflict) return;
    downloadCsvText("maximum_k_plex_membership_diagnosis.csv", buildKPlexMaximumMembershipDiagnosisCsv(
      {
        ...kPlexMembershipDiagnosis,
        ...(enumerateAllOptima && kPlexMembershipAcrossOptima
          ? { optimalMembershipSummary: kPlexMembershipAcrossOptima }
          : {})
      },
      sourceIdByNodeId,
      selectedGroup
    ));
  }

  function exportKPlexMaximumMembershipCounterfactual() {
    if (kPlexMembershipCounterfactual?.status !== "found") return;
    downloadCsvText("maximum_k_plex_membership_counterfactual.csv", buildKPlexMaximumMembershipCounterfactualCsv({
      result: kPlexMembershipCounterfactual.result,
      sourceIdByNodeId,
      selectedGroup
    }));
  }

  function exportPathWitnessCSV() {
    const path = resultSets[0];
    if (!path || pathEdgeIdsByStep.length !== path.length - 1) return;
    const rows = [["step", "from_node", "to_node", "supporting_edge_records", "supporting_edge_provenance", "structured_witness_json"].map(csvCell).join(",")];
    pathEdgeIdsByStep.forEach((edgeIds, step) => {
      rows.push([
        step + 1,
        sourceIdByNodeId[path[step]] ?? path[step],
        sourceIdByNodeId[path[step + 1]] ?? path[step + 1],
        edgeIds.map((edgeId) => sourceIdByEdgeId[edgeId] ?? edgeId).join(" | "),
        edgeProvenanceSummary(edgeIds),
        JSON.stringify({
          supporting_edge_ids: structuredEdgeIds(edgeIds),
          supporting_edge_evidence: structuredEdgeEvidence(edgeIds)
        })
      ].map(csvCell).join(","));
    });
    downloadCsvText("shortest_path_witnesses.csv", rows.join("\n"));
  }

  function exportPathMinimalityCSV() {
    if (!pathMinimality) return;
    const rows = [["path_length", "reachable_with_at_most", "node_id"].map(csvCell).join(",")];
    for (const layer of pathMinimality.reachableByDepth) {
      for (const nodeId of layer.nodeIds) {
        rows.push([
          pathMinimality.pathLength,
          layer.depth,
          sourceIdByNodeId[nodeId] ?? nodeId
        ].map(csvCell).join(","));
      }
    }
    if (pathMinimality.pathLength === 0) rows.push([0, -1, "no shorter nonnegative path"].map(csvCell).join(","));
    downloadCsvText("shortest_path_minimality_certificate.csv", rows.join("\n"));
  }

  function exportPathNoRouteCSV() {
    if (!pathNoRouteCertificate) return;
    const rows = [["maximum_path_length", "reachable_with_at_most", "node_id"].map(csvCell).join(",")];
    for (const layer of pathNoRouteCertificate.reachableByDepth) {
      for (const nodeId of layer.nodeIds) {
        rows.push([
          pathNoRouteCertificate.maximumLength,
          layer.depth,
          sourceIdByNodeId[nodeId] ?? nodeId
        ].map(csvCell).join(","));
      }
    }
    downloadCsvText("bounded_path_why_not_certificate.csv", rows.join("\n"));
  }

  function exportTypedPathNoRouteCSV() {
    if (!typedPathNoRouteCertificate) return;
    if ("temporalSemantics" in typedPathNoRouteCertificate) {
      const csv = buildTypedPathTemporalNoRouteCsv({
        certificate: typedPathNoRouteCertificate,
        startNodeId,
        goalNodeId,
        selectedGroup,
        sourceIdByNodeId,
        sourceIdByEdgeId
      });
      downloadCsvText("typed_path_temporal_why_not_certificate.csv", csv);
      return;
    }
    const rows = [[
      "prefix_length", "next_edge_type", "reachable_node_ids", "goal_reachable_as_walk", "structured_witness_json"
    ].map(csvCell).join(",")];
    for (const layer of typedPathNoRouteCertificate.reachableByStep) {
      rows.push([
        layer.step,
        layer.step === 0 ? "" : typedPathNoRouteCertificate.edgeTypeSequence[layer.step - 1],
        layer.nodeIds.map((id) => sourceIdByNodeId[id] ?? id).join(" | "),
        typedPathNoRouteCertificate.goalReachableAsWalk,
        JSON.stringify({ reachable_node_ids: layer.nodeIds.map((id) => sourceIdByNodeId[id] ?? id) })
      ].map(csvCell).join(","));
    }
    downloadCsvText("typed_path_why_not_certificate.csv", rows.join("\n"));
  }

  function highlightTypedPathNoRouteWitness() {
    if (!typedPathNoRouteCertificate || !("temporalSemantics" in typedPathNoRouteCertificate)) return;
    dispatch("highlightTypedPath", {
      nodeIds: typedPathNoRouteCertificate.walk.nodeIds,
      edgeIds: typedPathNoRouteCertificate.walk.edgeIdsByStep.flat()
    });
  }

  function highlightDominatingTarget(event: Event) {
    if (!selectedDominatingSignature) return;
    selectedDominatingTargetId = (event.currentTarget as HTMLSelectElement).value;
    const nodeIds = selectedDominatingSignature.split("\u0000");
    const coverage = (dominatingSetSupportBySet[selectedDominatingSignature] ?? [])
      .filter((item) => item.targetNodeId === selectedDominatingTargetId);
    const edgeIds = coverage.flatMap((item) =>
      item.supportingRecords.map((record) => record.edgeIdentity)
    );
    dispatch("highlightDominatingSet", { nodeIds, edgeIds });
  }

  function exportDominatingSetExplanation() {
    if (!selectedDominatingSignature) return;
    const coverage = dominatingSetSupportBySet[selectedDominatingSignature] ?? [];
    const csv = buildDominatingSetWitnessCsv({
      coverage,
      sourceIdByNodeId,
      edgeProvenanceSummary,
      structuredEdgeEvidence
    });
    downloadCsvText("dominating_set_witnesses.csv", csv);
  }

  function exportDominatingSetWhyNot() {
    if (dominatingSetUncoverableTargetNodeIds.length === 0) return;
    const csv = buildDominatingSetInfeasibilityCsv({
      uncoverableTargetNodeIds: dominatingSetUncoverableTargetNodeIds,
      sourceIdByNodeId,
      nodeLabels: nodeLabelById,
      candidateGroup: selectedGroup,
      targetGroup: selectedTargetGroup
    });
    downloadCsvText("dominating_set_why_not.csv", csv);
  }

  function exportKplexExplanation() {
    if (!selectedKplexSignature) return;
    const nodes = selectedKplexSignature.split("\u0000");
    const semantics = task === "maximalKPlex" ? "inclusion_maximal" : "maximum_cardinality";
    const maximality = selectedKplexMaximality;
    if (semantics === "inclusion_maximal" && !maximality) return;
    const csv = buildKPlexWitnessCsv({
      semantics,
      explanation: {
        nodeIds: nodes,
        missingTiePairs: selectedKplexMissingPairs
      },
      sourceIdByNodeId,
      ...(maximality ? { maximality } : {})
    });
    downloadCsvText(`${task === "maximalKPlex" ? "maximal" : "maximum"}_k_plex_witnesses.csv`, csv);
  }

  function exportKCoreNumbers() {
    if (!kCoreNumbers) return;
    const rows = [["node_id", "core_number", "k_core_mode", "eligible_group"].map(csvCell).join(",")];
    for (const [nodeId, coreNumber] of Object.entries(kCoreNumbers)
      .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))) {
      rows.push([
        sourceIdByNodeId[nodeId] ?? nodeId,
        coreNumber,
        directedGraph ? kCoreMode : "undirected",
        selectedGroup
      ].map(csvCell).join(","));
    }
    downloadCsvText("k_core_numbers.csv", rows.join("\n"));
  }

  function exportKcoreExplanation() {
    if (!selectedKcoreSignature) return;
    const nodes = selectedKcoreSignature.split("\u0000");
    const supportPairs = kCoreSupportBySet[selectedKcoreSignature] ?? [];
    const csv = buildKCoreWitnessCsv({
      nodeIds: nodes,
      supportPairs,
      directedGraph,
      kCoreMode,
      requiredK: parameter,
      sourceIdByNodeId,
      edgeProvenanceSummary,
      structuredEdgeEvidence
    });
    downloadCsvText("k_core_witnesses.csv", csv);
  }

  function exportCompactKcoreExplanation() {
    if (!selectedKcoreSignature) return;
    const nodes = selectedKcoreSignature.split("\u0000");
    const csv = buildCompactKCoreWitnessCsv({
      nodeIds: nodes,
      supportPairs: kCoreSupportBySet[selectedKcoreSignature] ?? [],
      directedGraph,
      kCoreMode,
      requiredK: parameter,
      sourceIdByNodeId,
      edgeProvenanceSummary,
      structuredEdgeEvidence
    });
    downloadCsvText("k_core_witnesses_v2.csv", csv);
  }

  function exportKcorePeelingExplanation() {
    if (!Object.prototype.hasOwnProperty.call(kCorePeelingBySet, selectedKcoreSignature) ||
      (selectedKcorePeeling.length === 0 && selectedKcoreSignature !== "")) return;
    const peeling = selectedKcoreSignature === "" ? emptyKcorePeeling : selectedKcorePeeling;
    const rows = [[
      "excluded_node", "peel_round", "k_core_mode", "required_k", "degree_before_removal", "surviving_neighbors",
      "source_edge_ids", "source_edge_provenance", "generated_record_keys", "legacy_endpoint_pairs", "structured_witness_json"
    ].map(csvCell).join(",")];
    for (const step of peeling) {
      const records = step.supportingPairs.flatMap((pair) => pair.supportingRecords);
      const legacyPairs = step.supportingPairs
        .filter((pair) => pair.supportingRecords.length === 0 || pair.supportingRecords.some((record) => !record.edgeId))
        .map((pair) => `${sourceIdByNodeId[pair.sourceNodeId] ?? pair.sourceNodeId} — ${sourceIdByNodeId[pair.targetNodeId] ?? pair.targetNodeId}`);
      rows.push([
        sourceIdByNodeId[step.nodeId] ?? step.nodeId,
        step.round,
        directedGraph ? kCoreMode : "undirected",
        parameter,
        step.survivingNeighborIds.length,
        step.survivingNeighborIds.map((id) => sourceIdByNodeId[id] ?? id).join(" | "),
        [...new Set(records.filter((record) => record.edgeId && !record.edgeIdGenerated).map((record) => record.edgeId!))].join(" | "),
        edgeProvenanceSummary(records.map((record) => record.edgeIdentity)),
        [...new Set(records.filter((record) => record.edgeId && record.edgeIdGenerated).map((record) => record.edgeId!))].join(" | "),
        [...new Set(legacyPairs)].join(" | "),
        JSON.stringify({
          surviving_neighbor_ids: step.survivingNeighborIds.map((id) => sourceIdByNodeId[id] ?? id),
          source_edge_ids: [...new Set(records.filter((record) => record.edgeId && !record.edgeIdGenerated).map((record) => record.edgeId!))],
          generated_record_keys: [...new Set(records.filter((record) => record.edgeId && record.edgeIdGenerated).map((record) => record.edgeId!))],
          legacy_endpoint_pairs: step.supportingPairs
            .filter((pair) => pair.supportingRecords.length === 0 || pair.supportingRecords.some((record) => !record.edgeId))
            .map((pair) => [sourceIdByNodeId[pair.sourceNodeId] ?? pair.sourceNodeId, sourceIdByNodeId[pair.targetNodeId] ?? pair.targetNodeId]),
          supporting_edge_evidence: structuredEdgeEvidence(records.map((record) => record.edgeIdentity))
        })
      ].map(csvCell).join(","));
    }
    downloadCsvText(`k_core_${parameter}_peeling_witnesses.csv`, rows.join("\n"));
  }

  function addPathTypeStep() {
    if (pathEdgeTypeSequence.length >= 100) return;
    pathEdgeTypeSequence = [...pathEdgeTypeSequence, availableEdgeTypes[0] ?? ""];
  }

  function updatePathTypeStep(index: number, event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    pathEdgeTypeSequence = pathEdgeTypeSequence.map((edgeType, step) => step === index ? value : edgeType);
  }

  function removePathTypeStep(index: number) {
    pathEdgeTypeSequence = pathEdgeTypeSequence.filter((_, step) => step !== index);
  }

  function displayMappedTime(value: number): string {
    if (Math.abs(value) < 100_000_000_000) return String(value);
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
  }
</script>

{#if open}
  <section class="structural-panel" aria-label="Analisi strutturali ASP">
    <header>
      <div>
        <h3>Analisi strutturali ASP</h3>
        <p>Strutture, cammini tipizzati, copertura, comunità e tagli sulla proiezione filtrata dai controlli attivi; il focus temporaneo del nodo modifica solo la vista.</p>
      </div>
      <button type="button" class="close" aria-label="Chiudi" on:click={() => dispatch("close")}>×</button>
    </header>

    <fieldset class="task-controls" disabled={running}>
      <label class="analysis-task-label">
        Analisi
        <select bind:value={task}>
          <option value="kPlex">k-plex di cardinalità massima</option>
          <option value="maximalKPlex">k-plex massimali per inclusione</option>
          <option value="kCore">k-core</option>
          <option value="components">Componenti connesse</option>
          {#if directedGraph}
            <option value="weakComponents" disabled={!weakComponentsAvailable}>Componenti debolmente connesse</option>
            <option value="strongComponents" disabled={!strongComponentsAvailable}>Componenti fortemente connesse</option>
          {/if}
          <option value="path">Cammino minimo vincolato</option>
          <option value="typedPath">Cammino con sequenza di tipi d'arco</option>
          <option value="dominatingSet">Insieme dominante minimo</option>
          <option value="minimumNodeSeparator">Separatore minimo di nodi</option>
          <option value="minimumCostNodeSeparator">Separatore di nodi a costo minimo</option>
          <option value="minimumEdgeSeparator">Taglio minimo di archi</option>
          <option value="minimumCostEdgeSeparator">Taglio a costo minimo di archi</option>
          <option value="communities">Comunità per modularità</option>
        </select>
      </label>
      {#if taskContract}
        <details class="task-contract">
          <summary>Semantica e contratto del risultato</summary>
          <p>{taskContract.querySemantics}</p>
          <p><strong>Enumerazione:</strong> {taskEnumerationDescription}.</p>
          <p><strong>Predicati ASP di input:</strong> {taskContract.inputPredicates.join(", ")} (unione delle modalità; alcuni sono condizionali).</p>
          <p><strong>Atomi del witness ASP:</strong> {taskContract.witnessPredicates.join(", ")}.</p>
          <p><strong>Campi interpretati:</strong> {taskContract.resultFields.join(", ")}.</p>
          <small>Encoding ASP `{taskContract.aspEncoding}` v{taskContract.encodingVersion}; parser `{taskContract.parser}`.</small>
          {#each taskContract.supportingQueries ?? [] as supportingQuery}
            <hr />
            <p><strong>Query ausiliaria ASP: {supportingQuery.id}</strong></p>
            <p>{supportingQuery.querySemantics}</p>
            <p><strong>Enumerazione:</strong> {supportingQuery.supportedEnumeration.join(" / ")}.</p>
            <p><strong>Input:</strong> {supportingQuery.inputPredicates.join(", ")}.</p>
            <p><strong>Witness:</strong> {supportingQuery.witnessPredicates.join(", ")}.</p>
            <p><strong>Campi interpretati:</strong> {supportingQuery.resultFields.join(", ")}.</p>
            <small>Encoding ASP `{supportingQuery.aspEncoding}` v{supportingQuery.encodingVersion}; parser `{supportingQuery.parser}`. {supportingQuery.visualization}</small>
          {/each}
        </details>
      {/if}
      {#if directedGraph && (!weakComponentsAvailable || !strongComponentsAvailable)}
        <ul class="task-readiness">
          {#each [...new Set([...weakComponentsRequirementReasons, ...strongComponentsRequirementReasons])] as reason}<li>{reason}</li>{/each}
        </ul>
      {/if}
      {#if parameterizedTask}
        <label>
          {parameterLabel}
          <input
            type="number"
            bind:value={parameter}
            min={task === "kPlex" || task === "maximalKPlex" ? 1 : 0}
            max={task === "path" ? 100 : undefined}
            step="1"
            required
          />
        </label>
      {/if}
      {#if task === "path" || task === "typedPath" || task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" || task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator"}
        <label>
          Da
          <select bind:value={startNodeId} required>
            <option value="" disabled>Scegli il nodo iniziale</option>
            {#each availableNodes as node (node.id)}
              <option value={node.id}>{node.label}</option>
            {/each}
          </select>
        </label>
        <label>
          A
          <select bind:value={goalNodeId} required>
            <option value="" disabled>Scegli il nodo finale</option>
            {#each availableNodes as node (node.id)}
              <option value={node.id}>{node.label}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if task === "typedPath"}
        <div class="path-type-sequence">
          <strong>Sequenza ordinata dei tipi d'arco</strong>
          {#each pathEdgeTypeSequence as edgeType, index}
            <div class="path-type-step">
              <label>
                Passo {index + 1}
                <select value={edgeType} on:change={(event) => updatePathTypeStep(index, event)}>
                  <option value="">Scegli un tipo</option>
                  {#each availableEdgeTypes as availableType}
                    <option value={availableType}>{availableType}</option>
                  {/each}
                </select>
              </label>
              <button type="button" on:click={() => removePathTypeStep(index)}>Rimuovi</button>
            </div>
          {/each}
          <button type="button" on:click={addPathTypeStep} disabled={availableEdgeTypes.length === 0 || pathEdgeTypeSequence.length >= 100}>Aggiungi passo</button>
          <small>Ogni passo usa esattamente il tipo scelto nell'ordine indicato. Il cammino è semplice e limitato a 100 archi; sui grafi diretti si rispetta il verso.</small>
          {#if !typedPathRequirementsAvailable}
            <ul class="task-readiness">
              {#each typedPathRequirementReasons as reason}<li>{reason}</li>{/each}
            </ul>
          {/if}
          <label>
            Semantica temporale
            <select bind:value={pathTemporalSemantics}>
              <option value="static">Statica (predefinita)</option>
              <option value="coValid">Tutti gli archi validi allo stesso istante</option>
              <option value="orderedByStart">Inizi di validità in ordine</option>
            </select>
          </label>
          {#if pathTemporalSemantics === "coValid"}
            <small>Gli intervalli sono chiusi: il cammino deve esistere insieme a un istante comune. Il risultato riporta il primo istante comune e tutti i record d'arco attivi in quell'istante.</small>
          {:else if pathTemporalSemantics === "orderedByStart"}
            <small>Ogni passo sceglie un record d'arco; l'inizio della sua validità non deve precedere quello del passo seguente. Gli intervalli non devono sovrapporsi.</small>
            <label class="checkbox-label">
              <span>Ordine stretto</span>
              <span><input type="checkbox" bind:checked={pathStrictTemporalOrder} /> Richiedi inizi strettamente crescenti</span>
            </label>
          {/if}
          {#if pathTemporalSemantics !== "static" && !typedPathTemporalRequirementsAvailable}
            <ul class="task-readiness">
              {#each typedPathTemporalRequirementReasons as reason}<li>{reason}</li>{/each}
            </ul>
          {/if}
        </div>
      {/if}
      {#if task === "path"}
        <label class="checkbox-label">
          <span>Spiegazioni</span>
          <span><input type="checkbox" bind:checked={explainPathMinimality} /> Certifica minimalità e assenza entro il limite</span>
        </label>
        {#if explainPathMinimality}
          <small class="field-note">Se trova un cammino, mostra la raggiungibilità fino a L−1; se non ne trova entro il limite, esegue una query ASP separata fino al limite scelto. Può aumentare tempo e memoria.</small>
        {/if}
      {/if}
      {#if task === "typedPath"}
        <label class="checkbox-label">
          <span>Spiegazioni</span>
          <span><input type="checkbox" bind:checked={explainTypedPathNoRoute} /> Mostra perché non c'è un cammino tipizzato</span>
        </label>
        {#if explainTypedPathNoRoute}
          {#if pathTemporalSemantics === "static"}
            <small class="field-note">Se la ricerca del cammino semplice fallisce, una query ASP mostra i nodi raggiungibili dopo ogni prefisso e distingue un prefisso bloccato da un typed walk che raggiunge la meta solo rivisitando nodi.</small>
          {:else}
            <small class="field-note">Se il cammino semplice fallisce, una query ASP trova il temporal walk più lungo che rispetta questa semantica e mostra il vincolo che ne blocca l'estensione, oppure le visite ripetute che impediscono un cammino semplice. Usa lo stesso budget del task.</small>
          {/if}
        {/if}
        {#if pathTemporalSemantics === "static"}
          <TypedPathCounterfactualPanel
            running={running}
            enabled={typedPathCounterfactualEnabled}
            requirementReasons={typedPathCounterfactualRequirementReasons}
            temporalSemantics={pathTemporalSemantics}
            strictTemporalOrder={pathStrictTemporalOrder}
            candidateCount={typedPathCounterfactualCandidateCount}
            excludedCandidateCount={typedPathCounterfactualExcludedCandidateCount}
            proposals={typedPathCounterfactualProposals}
            hasRun={typedPathCounterfactualHasRun}
            error={typedPathCounterfactualError}
            timeMs={typedPathCounterfactualTimeMs}
            whyNot={typedPathCounterfactualWhyNot}
            whyNotError={typedPathCounterfactualWhyNotError}
            edgeTypeSequence={pathEdgeTypeSequence}
            {startNodeId}
            {goalNodeId}
            selectedGroup={selectedGroup}
            {sourceIdByNodeId}
            {sourceIdByEdgeId}
            {nodeLabelById}
            on:run={(event) => dispatch("typedPathCompletion", event.detail)}
            on:criteriaChange={() => dispatch("typedPathCompletionCriteriaChange")}
            on:highlight={(event) => dispatch("highlight", event.detail)}
          />
        {:else}
          <small class="field-note">La diagnosi temporale considera solo gli archi osservati; il controfattuale temporale usa separatamente gli intervalli e i costi dichiarati per gli archi candidati.</small>
          <TypedPathCounterfactualPanel
            running={running}
            enabled={typedPathCounterfactualEnabled}
            requirementReasons={!typedPathTemporalRequirementsAvailable
              ? typedPathTemporalRequirementReasons
              : typedPathCounterfactualRequirementReasons}
            temporalSemantics={pathTemporalSemantics}
            strictTemporalOrder={pathStrictTemporalOrder}
            candidateCount={typedPathCounterfactualCandidateCount}
            excludedCandidateCount={typedPathCounterfactualExcludedCandidateCount}
            proposals={typedPathCounterfactualProposals}
            hasRun={typedPathCounterfactualHasRun}
            error={typedPathCounterfactualError}
            timeMs={typedPathCounterfactualTimeMs}
            whyNot={undefined}
            whyNotError=""
            edgeTypeSequence={pathEdgeTypeSequence}
            {startNodeId}
            {goalNodeId}
            selectedGroup={selectedGroup}
            {sourceIdByNodeId}
            {sourceIdByEdgeId}
            {nodeLabelById}
            on:run={(event) => dispatch("typedPathCompletion", event.detail)}
            on:criteriaChange={() => dispatch("typedPathCompletionCriteriaChange")}
            on:highlight={(event) => dispatch("highlight", event.detail)}
          />
        {/if}
      {/if}
      {#if task === "minimumCostEdgeSeparator" && !costEdgeSeparatorRequirementsAvailable}
        <ul class="task-readiness">
          {#each costEdgeSeparatorRequirementReasons as reason}<li>{reason}</li>{/each}
        </ul>
      {/if}
      {#if task === "minimumCostNodeSeparator" && !costNodeSeparatorRequirementsAvailable}
        <ul class="task-readiness">
          {#each costNodeSeparatorRequirementReasons as reason}<li>{reason}</li>{/each}
        </ul>
      {/if}
      {#if task !== "minimumEdgeSeparator" && task !== "minimumCostEdgeSeparator"}
        <label>
        {task === "dominatingSet" ? "Gruppo candidati" : task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" ? "Gruppo rimovibile" : "Gruppo"}
        <select bind:value={selectedGroup}>
          <option value="">Tutti i nodi</option>
          {#each availableGroups as group}
            <option value={group}>{group}</option>
          {/each}
        </select>
        </label>
      {/if}
      {#if provenanceScenarioCount > 1 && (task === "components" || task === "weakComponents" || task === "strongComponents")}
        <label>
          Nodo di riferimento per il confronto
          <select bind:value={componentScenarioTargetNodeId} required>
            <option value="" disabled>Scegli un nodo</option>
            {#each componentScenarioNodes as node (node.id)}
              <option value={node.id}>{node.label} · {node.id}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if task === "dominatingSet"}
        <label>
          Nodi obiettivo
          <select bind:value={selectedTargetGroup}>
            <option value="">Tutti i nodi visibili</option>
            {#each availableGroups as group}
              <option value={group}>{group}</option>
            {/each}
          </select>
        </label>
      {/if}
      {#if task === "minimumNodeSeparator"}
        <small class="field-note">Il gruppo selezionato limita i nodi rimovibili; i due terminali restano protetti. {directedGraph ? "I cammini seguono gli archi nel verso dichiarato." : "I legami sono non orientati."}</small>
      {/if}
      {#if task === "minimumCostNodeSeparator"}
        <small class="field-note">Minimizza la somma dei costi di rimozione: il campo deve contenere un intero positivo per ogni nodo candidato che può essere rimosso. I terminali protetti non richiedono un costo e la somma deve restare entro il limite sicuro; il costo è distinto dagli attributi descrittivi. {directedGraph ? "I cammini seguono gli archi nel verso dichiarato." : "I legami sono non orientati."}</small>
      {/if}
      {#if task === "minimumEdgeSeparator"}
        <small class="field-note">Il task rimuove il minor numero di record d'arco. {directedGraph ? "I cammini seguono il verso dichiarato." : "Ogni record non orientato si può attraversare in entrambi i versi."} Gli archi paralleli contano come record distinti; il peso non viene interpretato come costo di rimozione.</small>
      {/if}
      {#if task === "minimumCostEdgeSeparator"}
        <small class="field-note">Minimizza la somma di graphMapping.edge.removalCostField, che deve mappare un intero positivo per ogni arco. Il campo resta distinto dal peso relazionale. {directedGraph ? "I cammini seguono il verso dichiarato." : "Ogni record non orientato si può attraversare in entrambi i versi."}</small>
      {/if}
      {#if task === "communities"}
        <label>
          Numero minimo di comunità
          <input type="number" min="0" step="1" bind:value={minimumCommunityCount} />
        </label>
        <label>
          Numero massimo di comunità
          <input type="number" min="0" step="1" bind:value={maximumCommunityCount} />
        </label>
        <small class="field-note">0 significa nessun limite. Vincoli configurati must-link/cannot-link: {configuredCommunityPairCount}. {communityUsesEdgeWeights ? "Modularità pesata con i valori mappati sugli archi." : "Modularità non pesata."} Gli archi devono essere non orientati.</small>
        {#if configuredCommunityAttributeBoundCount > 0}
          <small class="field-note">Limiti di composizione attivi per attributo: {configuredCommunityAttributeBoundCount}. Ogni vincolo conta il valore mappato nella singola comunità; i valori mancanti non contano.</small>
        {/if}
        <label class="checkbox-label">
          <span>Spiegazioni</span>
          <span><input type="checkbox" bind:checked={explainCommunityContributions} /> Scomponi il contributo di ogni comunità</span>
        </label>
        {#if explainCommunityContributions}
          <small class="field-note">Mostra archi interni, volume e contributo intero per comunità; il risultato spiega il punteggio della partizione, non la sua interpretazione nel dominio.</small>
        {/if}
        <label class="checkbox-label">
          <span>Infeasibilità</span>
          <span><input type="checkbox" bind:checked={explainCommunityInfeasibility} /> Diagnosi minima dei vincoli</span>
        </label>
        {#if explainCommunityInfeasibility}
          <small class="field-note">Solo se i vincoli non ammettono partizioni, una seconda query ASP cerca il minor numero di regole da sospendere. Mantiene fissi grafo e dati; ogni alternativa è una proposta non applicata. “Tutti gli ottimi” enumera anche le diagnosi equivalenti.</small>
        {/if}
      {/if}
      {#if task === "kCore"}
        {#if directedGraph}
          <label>
            Semantica del k-core diretto
            <select bind:value={kCoreMode} required>
              <option value="" disabled>Scegli la semantica</option>
              <option value="in">Grado entrante</option>
              <option value="out">Grado uscente</option>
              <option value="mutual">Vicini reciproci</option>
            </select>
          </label>
          <small class="field-note">
            Entrante conta i predecessori, uscente i successori; reciproco conta un vicino solo se esistono entrambi gli archi.
          </small>
        {/if}
        <label class="checkbox-label">
          <span>Profilo</span>
          <span><input type="checkbox" bind:checked={includeKCoreNumbers} /> Core number per ogni nodo</span>
        </label>
        {#if includeKCoreNumbers}
          <small class="field-note">Il core number è la massima soglia k a cui il nodo appartiene. Il profilo usa peeling standard indipendente da ASP, sulla proiezione visibile e sul gruppo selezionato; la query ASP a soglia e i suoi testimoni restano separati.</small>
        {/if}
        <label class="checkbox-label">
          <span>Spiegazioni</span>
          <span><input type="checkbox" bind:checked={explainKCoreExclusions} /> Peeling ASP per i nodi esclusi</span>
        </label>
        {#if explainKCoreExclusions}
          <small class="field-note">Clingo prova il k-core e poi deriva un round sincrono per query ASP, con i vicini ancora attivi di ogni nodo rimosso. Il punto fisso deve coincidere col core provato; il costo dipende dal numero di round.</small>
        {/if}
      {/if}
      {#if task === "kPlex" || task === "dominatingSet" || task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" || task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator" || task === "communities"}
        <label class="checkbox-label">
          <span>Enumerazione</span>
          <span><input type="checkbox" bind:checked={enumerateAllOptima} /> Tutti gli ottimi (può richiedere molto tempo)</span>
        </label>
      {/if}
      {#if task === "maximalKPlex"}
        <label class="checkbox-label">
          <span>Enumerazione</span>
          <span><input type="checkbox" bind:checked={enumerateAllMaximalKPlex} /> Tutti i modelli massimali (può richiedere molto tempo)</span>
        </label>
        <small class="field-note">Ogni modello soddisfa il k-plex e non ammette l'aggiunta di un altro nodo candidato. La cardinalità non viene massimizzata.</small>
      {/if}
      <button type="button" class="run" on:click={requestRun} disabled={running || invalidParameter || invalidKCoreMode || invalidCommunityCounts || invalidTypedPath || (task === "minimumCostNodeSeparator" && !costNodeSeparatorRequirementsAvailable) || (task === "minimumCostEdgeSeparator" && !costEdgeSeparatorRequirementsAvailable) || (task === "communities" && Boolean(communityConfigurationError)) || ((task === "path" || task === "typedPath" || task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" || task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator") && (!startNodeId || !goalNodeId || ((task === "typedPath" || task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" || task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator") && startNodeId === goalNodeId)))}>
        {running ? "Solver in esecuzione…" : `Esegui ${taskLabel}`}
      </button>
      {#if task === "kCore" && provenanceScenarioCount > 1}
        <button
          type="button"
          class="run scenario-run"
          on:click={requestScenarioKCoreComparison}
          disabled={running || invalidParameter || invalidKCoreMode}
        >
          Confronta il k-core su tutti gli scenari
        </button>
        <small class="field-note">Esegue lo stesso k, gruppo e semantica direzionale su ogni scenario dichiarato; usa anche i filtri, la timeline e la soglia di confidenza correnti.</small>
      {/if}
      {#if task === "kPlex" && provenanceScenarioCount > 1}
        <button
          type="button"
          class="run scenario-run"
          on:click={requestScenarioKPlexComparison}
          disabled={running || invalidParameter || !enumerateAllOptima}
        >
          Confronta i k-plex massimi su tutti gli scenari
        </button>
        <small class="field-note">Richiede “Tutti gli ottimi”: enumera ogni k-plex di cardinalità massima per scenario, con gli stessi s, gruppo, filtri, timeline e soglia di confidenza. Può essere costoso; il budget totale è condiviso.</small>
      {/if}
      {#if provenanceScenarioCount > 1 && (task === "components" || task === "weakComponents" || task === "strongComponents")}
        <button
          type="button"
          class="run scenario-run"
          on:click={requestScenarioComponentComparison}
          disabled={running || !componentScenarioTargetNodeId ||
            (task === "components" && !connectedComponentsAvailable) ||
            (task === "weakComponents" && !weakComponentsAvailable) ||
            (task === "strongComponents" && !strongComponentsAvailable)}
        >
          Confronta la componente del nodo in tutti gli scenari
        </button>
        <small class="field-note">Clingo calcola la partizione ASP con la stessa direzione, gruppo, filtri, timeline e soglia di confidenza. Un nodo non eleggibile in uno scenario resta distinto da un nodo presente ma separato.</small>
      {/if}
      {#if task === "dominatingSet" && provenanceScenarioCount > 1}
        <button
          type="button"
          class="run scenario-run"
          on:click={requestScenarioDominatingSetComparison}
          disabled={running || !enumerateAllOptima}
        >
          Confronta le coperture minime su tutti gli scenari
        </button>
        <small class="field-note">Richiede “Tutti gli ottimi”: enumera ogni insieme dominante minimo per scenario, con gli stessi gruppi candidati e obiettivo, filtri, timeline e soglia di confidenza. Se manca una copertura in uno scenario o l’enumerazione non termina, non mostra confronti parziali. Un target group vuoto in uno scenario ha copertura vacua di taglia zero.</small>
      {/if}
    </fieldset>

    {#if task === "kCore"}
      <StructuralCompletionCounterfactualPanel
        title="Appartenenza controfattuale a un k-core"
        bind:target={kCoreMembershipCompletionTarget}
        bind:targetNodeId={kCoreMembershipTargetNodeId}
        targetNodeSelection={true}
        targetNodeFieldLabel="Nodo obiettivo"
        targetNodeOptions={kCoreMembershipNodeOptions}
        running={running}
        contextText="Cerca il costo minimo di archi ipotetici che rende questo nodo membro di un k-core, scegliendo il witness nel dominio candidato corrente."
        targetLabel="Soglia target k"
        minimumTarget={Number(parameter)}
        maximumTarget={undefined}
        targetHelp={`Il witness e un sottoinsieme verificabile di nodi in cui ogni nodo ha almeno k vicini distinti. Per default k coincide con la soglia dell'analisi corrente. Gli archi aggiunti devono essere esplicitamente configurati; direzione, tipo e validity non cambiano questa query non orientata e statica.`}
        unavailableReason={kCoreCounterfactualUnavailableReason}
        candidateEnabled={kCoreCounterfactualEnabled && !directedGraph}
        candidateCount={kCoreCounterfactualCandidateCount}
        proposals={kCoreMembershipCounterfactualProposals}
        kCoreMembershipWhyNot={kCoreMembershipCounterfactualWhyNot}
        kCoreMembershipWhyNotMessage={kCoreMembershipCounterfactualWhyNotMessage}
        hasRun={kCoreMembershipCounterfactualHasRun}
        error={kCoreMembershipCounterfactualError}
        timeMs={kCoreMembershipCounterfactualTimeMs}
        excludedCandidateCount={kCoreMembershipCounterfactualExcludedCandidateCount}
        cohortNodeIds={kCoreMembershipCandidateNodeIds}
        sourceIdByNodeId={sourceIdByNodeId}
        showEnumeration={true}
        on:criteriaChange={() => dispatch("kCoreMembershipCriteriaChange")}
        on:run={(event) => dispatch("kCoreMembershipCompletion", {
          targetK: event.detail.target,
          targetNodeId: event.detail.targetNodeId,
          candidateNodeIds: event.detail.cohortNodeIds,
          enumerateAllOptima: event.detail.enumerateAllOptima
        })}
        on:highlight={(event) => dispatch("highlight", event.detail)}
      />
    {/if}

    {#if error}
      <div class="error" role="alert">{error}</div>
    {/if}
    {#if task === "dominatingSet" && dominatingSetUncoverableTargetNodeIds.length > 0}
      <section class="dominating-explanation" aria-label="Certificato why-not della copertura">
        <strong>Perché la copertura è impossibile</strong>
        <p>ASP ha individuato target che nessun nodo candidato ammesso copre tramite selezione o adiacenza nella proiezione non orientata corrente.</p>
        <ul>
          {#each dominatingSetUncoverableTargetNodeIds as nodeId (nodeId)}
            <li>
              <button type="button" on:click={() => dispatch("highlight", [nodeId])}>
                {nodeLabelById[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId}
              </button>
            </li>
          {/each}
        </ul>
        <button type="button" on:click={exportDominatingSetWhyNot}>Esporta certificato why-not CSV</button>
        <small>Il certificato descrive un limite strutturale dei gruppi e degli archi selezionati; non suggerisce modifiche ai dati.</small>
      </section>
    {/if}
    {#if provenanceKCoreComparisonRunning}
      <div class="scenario-status" role="status">{provenanceKCoreComparisonProgress || "Calcolo del k-core negli scenari dichiarati…"}</div>
    {/if}
    {#if provenanceKCoreComparisonError}
      <div class="error" role="alert">{provenanceKCoreComparisonError}</div>
    {/if}
    {#if provenanceKCoreComparison}
      <section class="scenario-comparison" aria-label="Stabilità del k-core tra scenari di provenienza">
        <div class="scenario-summary" role="status">
          {#if provenanceKCoreComparison.worldAssumption === "finite-exhaustive-worlds"}
            <strong>{provenanceKCoreComparison.stableNodeIds.length}</strong> membership cautious ·
            <strong>{provenanceKCoreBraveOnlyCount}</strong> brave-only ·
            <strong>{provenanceKCoreNotBraveCount}</strong> not-brave ·
          {:else}
            <strong>{provenanceKCoreComparison.stableNodeIds.length}</strong> nodi presenti in tutti gli scenari ·
            <strong>{provenanceKCoreBraveOnlyCount}</strong> presenti ma non universali ·
            <strong>{provenanceKCoreNotBraveCount}</strong> candidati mai selezionati ·
          {/if}
          {provenanceKCoreComparison.scenarioCount} scenari · k={provenanceKCoreComparison.k}
          {#if provenanceKCoreComparison.degreeMode !== "undirected"}
            · grado {provenanceKCoreComparison.degreeMode === "in" ? "entrante" : provenanceKCoreComparison.degreeMode === "out" ? "uscente" : "mutuo"}
          {/if}
        </div>
        <div class="scenario-list">
          {#each provenanceKCoreComparison.scenarios as scenario (scenario.scenarioId)}
            <div class="scenario-row">
              <strong>{scenario.scenarioLabel}</strong>
              <span>{scenario.nodesCount} nodi proiettati · {scenario.candidateNodeCount} candidati · {scenario.linksCount} archi · core {scenario.coreSize}</span>
              <small>{scenario.timeMs.toFixed(1)} ms</small>
            </div>
          {/each}
        </div>
        <small class="scenario-semantics">
          Gruppo: {provenanceKCoreSelectedGroup || "tutti"} · confidenza minima: {provenanceKCoreConfidenceThreshold ?? "non attiva"}
          {#if provenanceKCoreTimelineWindow} · finestra: {provenanceKCoreTimelineWindow}{/if}
          · tipi vista: {provenanceKCoreViewFilters.types.length ? provenanceKCoreViewFilters.types.join(", ") : "tutti"}
          · gruppi vista: {provenanceKCoreViewFilters.groups.length ? provenanceKCoreViewFilters.groups.join(", ") : "tutti"}
        </small>
        <div class="scenario-membership-heading">
          <strong>{provenanceKCoreComparison.worldAssumption === "finite-exhaustive-worlds" ? "Membership brave nei k-core" : "Membership nei k-core"}</strong>
          <button type="button" on:click={exportScenarioKCoreComparison}>Esporta CSV</button>
        </div>
        {#if provenanceKCoreComparison.memberships.length === 0}
          <p class="empty">Nessun nodo compare nel k-core di uno scenario.</p>
        {:else}
          <ul class="scenario-memberships">
            {#each provenanceKCoreComparison.memberships as membership (membership.nodeId)}
              <li>
                <button type="button" class:stable={membership.stableAcrossEveryScenario} on:click={() => dispatch("highlight", [membership.nodeId])}>
                  <span>{nodeLabelById[membership.nodeId] ?? membership.nodeId}</span>
                  <small>ID: {membership.nodeId}</small>
                  <span>Nel dominio: {membership.candidateScenarioSupportCount}/{provenanceKCoreComparison.scenarioCount} · nel core: {membership.scenarioSupportCount}/{provenanceKCoreComparison.scenarioCount}</span>
                  <strong>{provenanceKCoreComparison.worldAssumption === "finite-exhaustive-worlds"
                    ? membership.stableAcrossEveryScenario
                      ? "Cautious: presente in ogni mondo"
                      : membership.scenarioSupportCount === 0
                        ? "Not brave: candidato ma fuori da ogni k-core"
                        : "Brave-only: presente in almeno un mondo"
                    : membership.stableAcrossEveryScenario
                      ? "Presente in tutti gli scenari"
                      : membership.scenarioSupportCount === 0
                        ? "Mai selezionato nel k-core"
                        : membership.stableAcrossEveryEligibleScenario
                          ? "Presente ogni volta che è eleggibile"
                          : "Presente solo in alcuni scenari"}</strong>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <small class="scenario-semantics">{provenanceKCoreComparison.worldAssumption === "finite-exhaustive-worlds"
          ? "Il k-core è unico in ogni mondo: brave indica la membership in almeno un k-core; cautious la membership in tutti. I candidati mai appartenenti a un k-core restano visibili come not-brave; i nodi fuori da tutti i domini candidati non fanno parte della query. La membership in tutti i mondi richiede eleggibilità e presenza nel core in ciascuno. Il risultato è condizionato all'assunzione di esaustività della lista e non attribuisce probabilità o affidabilità alle fonti."
          : "Il k-core è unico per ogni proiezione. “Presente in tutti” indica l’intersezione dei k-core degli scenari configurati; “mai selezionato” identifica i candidati assenti da tutti i core. “Nel dominio” separa eleggibilità e membership; “presente ogni volta che è eleggibile” distingue una membership condizionale dall’assenza in altri scenari. È un confronto deterministico, non una probabilità né una conclusione epistemica."}</small>
      </section>
    {/if}
    {#if provenanceKPlexComparisonRunning}
      <div class="scenario-status" role="status">{provenanceKPlexComparisonProgress || "Calcolo dei k-plex massimi negli scenari dichiarati…"}</div>
    {/if}
    {#if provenanceKPlexComparisonError}
      <div class="error" role="alert">{provenanceKPlexComparisonError}</div>
    {/if}
    {#if provenanceKPlexComparison}
      <section class="scenario-comparison" aria-label="Stabilità dei k-plex massimi tra scenari di provenienza">
        <div class="scenario-summary" role="status">
          {#if provenanceKPlexComparison.worldAssumption === "finite-exhaustive-worlds"}
            <strong>{provenanceKPlexComparison.stableNodeIds.length}</strong> cautious ·
            <strong>{provenanceKPlexBraveOnlyCount}</strong> brave-only ·
            <strong>{provenanceKPlexNotBraveCount}</strong> mai brave ·
          {:else}
            <strong>{provenanceKPlexComparison.stableNodeIds.length}</strong> candidati presenti in tutti gli ottimi ·
            <strong>{provenanceKPlexComparison.nonUniversalNodeIds.length}</strong> non universali ·
          {/if}
          {provenanceKPlexComparison.scenarioCount} scenari · s={provenanceKPlexComparison.s} ·
          {provenanceKPlexComparison.totalOptimalAnswerSetCount} witness ottimi
        </div>
        <div class="scenario-list">
          {#each provenanceKPlexComparison.scenarios as scenario (scenario.scenarioId)}
            <div class="scenario-row">
              <strong>{scenario.scenarioLabel}</strong>
              <span>{scenario.nodesCount} nodi visibili · {scenario.candidateNodeCount} candidati · {scenario.linksCount} archi · massimo {scenario.maximumKPlexSize} ({scenario.maximumKPlexCount} witness)</span>
              <small>{scenario.timeMs.toFixed(1)} ms</small>
            </div>
          {/each}
        </div>
        <small class="scenario-semantics">
          Gruppo: {provenanceKPlexSelectedGroup || "tutti"} · confidenza minima: {provenanceKPlexConfidenceThreshold ?? "non attiva"}
          {#if provenanceKPlexTimelineWindow} · finestra: {provenanceKPlexTimelineWindow}{/if}
          · tipi vista: {provenanceKPlexViewFilters.types.length ? provenanceKPlexViewFilters.types.join(", ") : "tutti"}
          · gruppi vista: {provenanceKPlexViewFilters.groups.length ? provenanceKPlexViewFilters.groups.join(", ") : "tutti"}
        </small>
        <div class="scenario-membership-heading">
          <strong>{provenanceKPlexComparison.worldAssumption === "finite-exhaustive-worlds" ? "Membership brave nei k-plex massimi" : "Membership nei k-plex massimi"}</strong>
          <button type="button" on:click={exportScenarioKPlexComparison}>Esporta CSV</button>
        </div>
        {#if provenanceKPlexComparison.memberships.length === 0}
          <p class="empty">Nessun nodo candidato negli scenari confrontati.</p>
        {:else}
          <ul class="scenario-memberships">
            {#each provenanceKPlexComparison.memberships as membership (membership.nodeId)}
              <li>
                <button
                  type="button"
                  class:stable={membership.stableAcrossEveryOptimalAnswerSet}
                  on:click={() => dispatch("highlight", [membership.nodeId])}
                >
                  <span>{nodeLabelById[membership.nodeId] ?? membership.nodeId}</span>
                  <small>ID: {membership.nodeId}</small>
                  <span>Nel dominio: {membership.candidateScenarioSupportCount}/{provenanceKPlexComparison.scenarioCount} · in scenari ottimi: {membership.scenarioSupportCount}/{provenanceKPlexComparison.scenarioCount} · answer set: {membership.optimalAnswerSetCount}/{membership.totalOptimalAnswerSetCount}</span>
                  <strong>{provenanceKPlexComparison.worldAssumption === "finite-exhaustive-worlds"
                    ? membership.stableAcrossEveryOptimalAnswerSet
                      ? "Cautious: presente in ogni ottimo di ogni mondo"
                      : membership.optimalAnswerSetCount === 0
                        ? "Non brave: assente da ogni k-plex massimo"
                        : "Brave-only: presente in almeno un ottimo"
                    : membership.stableAcrossEveryOptimalAnswerSet
                      ? "Presente in tutti gli ottimi"
                      : membership.optimalAnswerSetCount === 0 ? "Mai selezionato" : "Non in tutti gli ottimi"}</strong>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <small class="scenario-semantics">{provenanceKPlexComparison.worldAssumption === "finite-exhaustive-worlds"
          ? "Per ogni mondo sono enumerate tutte le soluzioni di cardinalità massima. Brave indica la membership in almeno un k-plex massimo; cautious la membership in tutti gli ottimi di tutti i mondi, inclusi i pareggi. “Mai brave” identifica candidati che non appartengono a nessun massimo. L'interpretazione dipende dall'assunzione dell'analista che i mondi dichiarati siano esaustivi; non assegna probabilità o affidabilità alle fonti. Un'enumerazione incompleta sopprime l'intero risultato."
          : "Per ogni scenario sono enumerate tutte le soluzioni di cardinalità massima. “Presente in tutti gli ottimi” significa membership in ogni witness massimo di ogni scenario dichiarato; “Mai selezionato” identifica candidati che non appartengono a nessun ottimo. Il conteggio dei witness non è una probabilità. Se un’enumerazione non termina o non è completa, il confronto non mostra risultati parziali."}</small>
      </section>
    {/if}
    {#if provenanceComponentComparisonRunning}
      <div class="scenario-status" role="status">{provenanceComponentComparisonProgress || "Calcolo delle componenti ASP negli scenari dichiarati…"}</div>
    {/if}
    {#if provenanceComponentComparisonError}
      <div class="error" role="alert">{provenanceComponentComparisonError}</div>
    {/if}
    {#if provenanceComponentComparison}
      <section class="scenario-comparison" aria-label="Stabilità della componente tra scenari di provenienza">
        <div class="scenario-summary" role="status">
          Nodo di riferimento: <strong>{nodeLabelById[provenanceComponentComparison.targetNodeId] ?? provenanceComponentComparison.targetNodeId}</strong> ·
          eleggibile in <strong>{provenanceComponentComparison.targetEligibleScenarioCount}/{provenanceComponentComparison.scenarioCount}</strong> scenari ·
          {#if provenanceComponentComparison.worldAssumption === "finite-exhaustive-worlds"}
            membership cautious: <strong>{provenanceComponentComparison.universallySameComponentNodeIds.length}</strong> · brave-only: <strong>{provenanceComponentBraveOnlyCount}</strong> · non brave: <strong>{provenanceComponentNotBraveCount}</strong> · non definita: <strong>{provenanceComponentUndefinedCount}</strong>
          {:else}
            stessa componente in tutti gli scenari: <strong>{provenanceComponentComparison.universallySameComponentNodeIds.length}</strong> nodi ·
            stabile nei soli scenari comparabili: <strong>{provenanceComponentComparison.conditionallySameComponentNodeIds.length}</strong>
          {/if}
        </div>
        <div class="scenario-list">
          {#each provenanceComponentComparison.scenarios as scenario (scenario.scenarioId)}
            <div class="scenario-row">
              <strong>{scenario.scenarioLabel}</strong>
              <span>{scenario.projectedNodeCount} nodi proiettati · {scenario.candidateNodeCount} candidati · {scenario.linksCount} archi · {scenario.componentCount} componenti</span>
              <span>{scenario.targetEligible ? `Nodo di riferimento nella componente di taglia ${scenario.targetComponentSize}` : "Nodo di riferimento non eleggibile nella proiezione/gruppo"}</span>
              <small>{scenario.timeMs.toFixed(1)} ms</small>
            </div>
          {/each}
        </div>
        <small class="scenario-semantics">
          Task ASP: {provenanceComponentComparison.task === "components" ? "componenti connesse non orientate" : provenanceComponentComparison.task === "weakComponents" ? "componenti debolmente connesse" : "componenti fortemente connesse"} ·
          gruppo: {provenanceComponentSelectedGroup || "tutti"} · confidenza minima: {provenanceComponentConfidenceThreshold ?? "non attiva"}
          {#if provenanceComponentTimelineWindow} · finestra: {provenanceComponentTimelineWindow}{/if}
          · tipi vista: {provenanceComponentViewFilters.types.length ? provenanceComponentViewFilters.types.join(", ") : "tutti"}
          · gruppi vista: {provenanceComponentViewFilters.groups.length ? provenanceComponentViewFilters.groups.join(", ") : "tutti"}
        </small>
        <div class="scenario-membership-heading">
          <strong>{provenanceComponentComparison.worldAssumption === "finite-exhaustive-worlds" ? "Membership brave nella componente di riferimento" : "Nodi rispetto alla componente di riferimento"}</strong>
          <button type="button" on:click={exportScenarioComponentComparison}>Esporta CSV</button>
        </div>
        {#if provenanceComponentComparison.memberships.length === 0}
          <p class="empty">Non ci sono altri nodi candidati negli scenari confrontati.</p>
        {:else}
          <ul class="scenario-memberships">
            {#each provenanceComponentComparison.memberships as membership (membership.nodeId)}
              <li>
                <button
                  type="button"
                  class:stable={membership.sameComponentInEveryDeclaredScenario}
                  on:click={() => dispatch("highlight", [membership.nodeId])}
                >
                  <span>{nodeLabelById[membership.nodeId] ?? membership.nodeId}</span>
                  <small>ID: {membership.nodeId}</small>
                  <span>Nel dominio: {membership.candidateScenarioCount}/{provenanceComponentComparison.scenarioCount} · confrontabile: {membership.comparableScenarioCount}/{provenanceComponentComparison.scenarioCount} · stessa componente: {membership.sameComponentScenarioCount}/{membership.comparableScenarioCount}</span>
                  <strong>{provenanceComponentComparison.worldAssumption === "finite-exhaustive-worlds"
                    ? membership.sameComponentInEveryDeclaredScenario
                      ? "Cautious: stessa componente in ogni mondo"
                      : membership.sameComponentScenarioCount > 0
                        ? "Brave-only: stessa componente in almeno un mondo"
                        : membership.comparableScenarioCount === 0
                          ? "Non definita: nessun mondo comparabile"
                          : "Non brave: nessuna membership positiva"
                    : membership.sameComponentInEveryDeclaredScenario
                      ? "Stessa componente in ogni scenario"
                      : membership.sameComponentInEveryComparableScenario
                        ? "Stessa componente quando entrambi eleggibili"
                        : membership.comparableScenarioCount === 0
                          ? "Nessuno scenario confrontabile"
                          : membership.sameComponentScenarioCount === 0
                            ? "Mai nella stessa componente"
                            : "Componente variabile"}</strong>
                  {#if membership.separateComponentScenarioIds.length > 0}
                    <small>In componenti diverse: {membership.separateComponentScenarioIds.join(", ")}</small>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <small class="scenario-semantics">{provenanceComponentComparison.worldAssumption === "finite-exhaustive-worlds"
          ? "Brave significa che esiste almeno un mondo comparabile in cui il riferimento e il nodo sono candidati e condividono la componente; cautious richiede questa membership in ogni mondo. Se il riferimento non è eleggibile in un mondo, la relazione è indefinita lì e non viene descritta come disconnessione; i mondi senza alcuna eleggibilità congiunta sono contati a parte. Il risultato è condizionato all'assunzione di esaustività della lista e non assegna probabilità alle fonti."
          : "Il confronto usa solo scenari di fonte esplicitamente dichiarati e una partizione ASP completata per ciascuno. “Confrontabile” richiede che entrambi i nodi siano candidati in quello scenario; un nodo assente, escluso dai filtri o fuori dal gruppo non viene contato come separato. “In ogni scenario” richiede eleggibilità congiunta in tutti gli scenari. I conteggi sono deterministici, non probabilità, affidabilità o semantica brave/skeptical."}</small>
      </section>
    {/if}
    {#if provenanceDominatingSetComparisonRunning}
      <div class="scenario-status" role="status">{provenanceDominatingSetComparisonProgress || "Calcolo ASP delle coperture minime negli scenari dichiarati…"}</div>
    {/if}
    {#if provenanceDominatingSetComparisonError}
      <div class="error" role="alert">{provenanceDominatingSetComparisonError}</div>
    {/if}
    {#if provenanceDominatingSetScenarioWhyNot}
      <section class="dominating-explanation" aria-label="Certificato why-not dello scenario">
        <strong>Target non copribili nello scenario: {provenanceDominatingSetScenarioWhyNot.scenarioLabel}</strong>
        <p>ASP ha verificato che nessun nodo del gruppo candidato copre questi target nello scenario di provenienza selezionato.</p>
        <ul>
          {#each provenanceDominatingSetScenarioWhyNot.uncoverableTargetNodeIds as nodeId (nodeId)}
            <li>
              <button type="button" on:click={() => dispatch("highlight", [nodeId])}>
                {nodeLabelById[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId}
              </button>
            </li>
          {/each}
        </ul>
        <small>
          Scenario ID: {provenanceDominatingSetScenarioWhyNot.scenarioId} · fonti: {provenanceDominatingSetScenarioWhyNot.scenarioSources.join(", ") || "nessuna dichiarata"} · candidati: {provenanceDominatingSetScenarioWhyNot.candidateGroup || "tutti"} · target: {provenanceDominatingSetScenarioWhyNot.targetGroup || "tutti"}
          {#if provenanceDominatingSetScenarioWhyNot.confidenceThreshold !== null} · confidenza minima: {provenanceDominatingSetScenarioWhyNot.confidenceThreshold}{/if}
          {#if provenanceDominatingSetScenarioWhyNot.timelineWindow} · finestra: {provenanceDominatingSetScenarioWhyNot.timelineWindow}{/if}
        </small>
        <button type="button" on:click={exportScenarioDominatingSetWhyNot}>Esporta why-not dello scenario CSV</button>
        <small>La comparazione complessiva resta scartata; questo certificato descrive soltanto il motivo verificato dello scenario che ha bloccato il confronto.</small>
      </section>
    {/if}
    {#if provenanceDominatingSetComparison}
      <section class="scenario-comparison" aria-label="Confronto delle coperture minime tra scenari di provenienza">
        <div class="scenario-summary" role="status">
          Scenari: <strong>{provenanceDominatingSetComparison.scenarioCount}</strong> ·
          dimensione minima per scenario: <strong>{provenanceDominatingSetComparison.scenarios.map((scenario) => scenario.minimumSetSize).join(", ")}</strong> ·
          {#if provenanceDominatingSetComparison.worldAssumption === "finite-exhaustive-worlds"}
            membership cautious: <strong>{provenanceDominatingSetComparison.universallySelectedNodeIds.length}</strong> ·
            brave-only: <strong>{provenanceDominatingSetBraveOnlyCount}</strong> · non brave: <strong>{provenanceDominatingSetNotBraveCount}</strong> ·
          {:else}
            nodi selezionati in ogni ottimo di ogni scenario: <strong>{provenanceDominatingSetComparison.universallySelectedNodeIds.length}</strong> ·
          {/if}
          ottimi enumerati: <strong>{provenanceDominatingSetComparison.totalMinimumSetCount}</strong>
        </div>
        <div class="scenario-list">
          {#each provenanceDominatingSetComparison.scenarios as scenario (scenario.scenarioId)}
            <div class="scenario-row">
              <strong>{scenario.scenarioLabel}</strong>
              <span>{scenario.projectedNodeCount} nodi proiettati · {scenario.candidateNodeCount} candidati · {scenario.targetNodeCount} target · {scenario.linksCount} archi</span>
              <span>{scenario.targetNodeCount === 0 ? "Nessun target: copertura vacua" : `Coperture minime: ${scenario.minimumSetCount} di taglia ${scenario.minimumSetSize}`}</span>
              <small>{scenario.timeMs.toFixed(1)} ms</small>
            </div>
          {/each}
        </div>
        <small class="scenario-semantics">
          Gruppo candidati: {provenanceDominatingSetCandidateGroup || "tutti"} · gruppo target: {provenanceDominatingSetTargetGroup || "tutti"} · confidenza minima: {provenanceDominatingSetConfidenceThreshold ?? "non attiva"}
          {#if provenanceDominatingSetTimelineWindow} · finestra: {provenanceDominatingSetTimelineWindow}{/if}
          · tipi vista: {provenanceDominatingSetViewFilters.types.length ? provenanceDominatingSetViewFilters.types.join(", ") : "tutti"}
          · gruppi vista: {provenanceDominatingSetViewFilters.groups.length ? provenanceDominatingSetViewFilters.groups.join(", ") : "tutti"}
        </small>
        <div class="scenario-membership-heading">
          <strong>{provenanceDominatingSetComparison.worldAssumption === "finite-exhaustive-worlds" ? "Membership brave nelle coperture minime" : "Membership nelle coperture ottime"}</strong>
          <button type="button" on:click={exportScenarioDominatingSetComparison}>Esporta CSV</button>
        </div>
        {#if provenanceDominatingSetComparison.memberships.length === 0}
          <p class="empty">Non ci sono nodi eleggibili come candidati in almeno uno scenario.</p>
        {:else}
          <ul class="scenario-memberships">
            {#each provenanceDominatingSetComparison.memberships as membership (membership.nodeId)}
              <li>
                <button
                  type="button"
                  class:stable={membership.selectedInEveryScenarioMinimumSet}
                  on:click={() => dispatch("highlight", [membership.nodeId])}
                >
                  <span>{nodeLabelById[membership.nodeId] ?? membership.nodeId}</span>
                  <small>ID: {membership.nodeId}</small>
                  <span>Candidato: {membership.candidateScenarioCount}/{provenanceDominatingSetComparison.scenarioCount} scenari · selezionato: {membership.selectedMinimumSetCount}/{membership.totalComparableMinimumSetCount} ottimi confrontabili</span>
                  <strong>{provenanceDominatingSetComparison.worldAssumption === "finite-exhaustive-worlds"
                    ? membership.selectedInEveryScenarioMinimumSet
                      ? "Cautious: presente in ogni copertura minima di ogni mondo"
                      : membership.selectedMinimumSetCount === 0
                        ? "Non brave: non selezionato in alcuna copertura minima"
                        : "Brave-only: presente in almeno una copertura minima"
                    : membership.selectedInEveryScenarioMinimumSet
                      ? "In ogni copertura minima di ogni scenario"
                      : membership.selectedInEveryComparableMinimumSet
                        ? "In ogni copertura minima quando candidato"
                        : membership.selectedMinimumSetCount === 0
                          ? "Mai selezionato in una copertura minima"
                          : "Selezione variabile tra coperture minime"}</strong>
                  {#if membership.optimalScenarioIds.length > 0}
                    <small>Presente in almeno un ottimo: {membership.optimalScenarioIds.join(", ")}</small>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <small class="scenario-semantics">{provenanceDominatingSetComparison.worldAssumption === "finite-exhaustive-worlds"
          ? "Il confronto richiede tutte le coperture minime complete per ogni mondo: brave indica la selezione in almeno un ottimo di almeno un mondo; cautious richiede la selezione in tutte le coperture minime di tutti i mondi. Un nodo non candidato in un mondo non vi appartiene; “non brave” indica zero supporti. Se un mondo non ha una copertura fattibile o l'enumerazione è incompleta, non viene presentato alcun risultato. Questa lettura è condizionata all'assunzione di esaustività dell'analista e non assegna probabilità alle fonti."
          : "“In ogni scenario” richiede che il nodo sia candidato in tutti gli scenari e appartenga a ogni insieme dominante minimo enumerato. “Quando candidato” esclude gli scenari in cui il gruppo o la proiezione non lo rendono selezionabile. I conteggi sono membership strutturali deterministiche, non probabilità, importanza o raccomandazioni. Ogni witness è verificato contro candidati, target e archi dello scenario; se un task è incompleto o non ottimo, il confronto complessivo viene scartato."}</small>
      </section>
    {/if}
    {#if task === "path" && pathNoRouteCertificate}
      <div class="path-minimality-explanation" aria-live="polite">
        <strong>Perché non esiste un cammino entro {pathNoRouteCertificate.maximumLength} {countForm(pathNoRouteCertificate.maximumLength, "arco", "archi")}</strong>
        <p>La destinazione non è raggiungibile dalla sorgente entro il limite nella proiezione e nel gruppo selezionati.</p>
        <details>
          <summary>Nodi raggiungibili per ciascun limite</summary>
          <ol>
            {#each pathNoRouteCertificate.reachableByDepth as layer}
              <li>≤ {layer.depth}: {layer.nodeIds.map((id) => sourceIdByNodeId[id] ?? id).join(", ")}</li>
            {/each}
          </ol>
        </details>
        <small>La chiusura di raggiungibilità è calcolata da ASP sui nodi ammessi, rispettando il verso dichiarato e il limite massimo.</small>
        <button type="button" on:click={exportPathNoRouteCSV}>Esporta certificato why-not CSV</button>
      </div>
    {/if}
    {#if task === "typedPath" && typedPathNoRouteCertificate}
      <div class="path-minimality-explanation" aria-live="polite">
        {#if "temporalSemantics" in typedPathNoRouteCertificate}
          <strong>Perché non esiste il cammino temporale tipizzato semplice</strong>
          {#if typedPathNoRouteCertificate.goalReachableAsWalk}
            <p>Una walk temporale completa raggiunge la meta rivisitando i nodi {typedPathNoRouteCertificate.repeatedNodeIds.map((id) => sourceIdByNodeId[id] ?? id).join(", ")}. La query ASP ha provato che non esiste un cammino semplice con la stessa semantica.</p>
          {:else if typedPathNoRouteCertificate.firstBlockedStep !== undefined}
            <p>La walk temporale di massima lunghezza copre {typedPathNoRouteCertificate.maximumPrefixLength} passi; il passo {typedPathNoRouteCertificate.firstBlockedStep} ({typedPathNoRouteCertificate.edgeTypeSequence[typedPathNoRouteCertificate.firstBlockedStep - 1]}) non si estende sotto i vincoli temporali selezionati.</p>
          {:else}
            <p>La sequenza completa è percorribile come walk temporale, ma non raggiunge il terminale finale {sourceIdByNodeId[goalNodeId] ?? goalNodeId}.</p>
          {/if}
          {#if typedPathNoRouteCertificate.temporalSemantics === "coValid" && typedPathNoRouteCertificate.commonTimeValue !== undefined}
            <p>Istante comune del witness: {displayMappedTime(typedPathNoRouteCertificate.commonTimeValue)}.</p>
          {:else if typedPathNoRouteCertificate.temporalSemantics === "orderedByStart"}
            <p>Inizi di validità nel witness: {(typedPathNoRouteCertificate.startTimeValuesByStep ?? []).map(displayMappedTime).join(" → ") || "nessun passo"}.</p>
          {/if}
          <ol>
            {#each typedPathNoRouteCertificate.walk.edgeIdsByStep as edgeIds, step}
              <li>{nodeLabelById[typedPathNoRouteCertificate.walk.nodeIds[step]] ?? sourceIdByNodeId[typedPathNoRouteCertificate.walk.nodeIds[step]] ?? typedPathNoRouteCertificate.walk.nodeIds[step]} → {nodeLabelById[typedPathNoRouteCertificate.walk.nodeIds[step + 1]] ?? sourceIdByNodeId[typedPathNoRouteCertificate.walk.nodeIds[step + 1]] ?? typedPathNoRouteCertificate.walk.nodeIds[step + 1]} · {typedPathNoRouteCertificate.edgeTypeSequence[step]} · {edgeIds.map((id) => sourceIdByEdgeId[id] ?? id).join(", ")}</li>
            {/each}
          </ol>
          <small>È una spiegazione del massimo temporal walk nella proiezione, nella direzione, nel gruppo e nella semantica dichiarati. Gli intervalli non rappresentano necessariamente date di eventi.</small>
          <button type="button" on:click={highlightTypedPathNoRouteWitness}>Evidenzia il witness temporale nel grafo</button>
        {:else}
          <strong>Perché non esiste il cammino tipizzato semplice</strong>
          {#if typedPathNoRouteCertificate.goalReachableAsWalk}
            <p>La sequenza raggiunge il terminale finale se si ammettono ripetizioni. Poiché la query del cammino semplice è risultata insoddisfacibile, ogni typed walk che collega questi terminali deve rivisitare almeno un nodo.</p>
          {:else if typedPathNoRouteCertificate.firstEmptyStep !== undefined}
            <p>Nessun nodo è raggiungibile dopo il passo {typedPathNoRouteCertificate.firstEmptyStep} ({typedPathNoRouteCertificate.edgeTypeSequence[typedPathNoRouteCertificate.firstEmptyStep - 1]}). I livelli precedenti mostrano i prefissi percorribili.</p>
          {:else}
            <p>La sequenza non raggiunge il terminale finale; l’ultimo livello mostra dove termina la raggiungibilità per prefissi.</p>
          {/if}
          <details>
            <summary>Nodi raggiungibili dopo ogni prefisso</summary>
            <ol>
              {#each typedPathNoRouteCertificate.reachableByStep as layer}
                <li>
                  {layer.step === 0 ? "Inizio" : `Dopo il passo ${layer.step} (${typedPathNoRouteCertificate.edgeTypeSequence[layer.step - 1]})`}: {layer.nodeIds.map((id) => sourceIdByNodeId[id] ?? id).join(", ") || "nessun nodo"}
                </li>
              {/each}
            </ol>
          </details>
          <small>La query ricorsiva ASP segue i tipi nell’ordine dichiarato, il verso del grafo e il gruppo candidato; permette ripetizioni solo per diagnosticare se la semplicità è l’unico ostacolo.</small>
        {/if}
        <button type="button" on:click={exportTypedPathNoRouteCSV}>Esporta certificato why-not CSV</button>
      </div>
    {/if}
    {#if task === "communities" && communityConfigurationError}
      <div class="error" role="alert">{communityConfigurationError}</div>
    {/if}
    {#if task === "communities" && (communityConstraintDiagnoses.length > 0 || communityConstraintDiagnosisError)}
      <section class="community-constraint-diagnosis" aria-labelledby="community-diagnosis-title">
        <h3 id="community-diagnosis-title">Diagnosi ASP dei vincoli di comunità</h3>
        <p>La query ha mantenuto invariati grafo, proiezione e attributi. Ogni elemento elencato è una regola di configurazione che si dovrebbe ipoteticamente sospendere; nessuna modifica è applicata. ASP minimizza il costo totale dichiarato per categoria di regola (1 se non configurato). È un rilassamento a costo minimo, non un unsat core e non un giudizio su quale regola sia errata.</p>
        {#if communityConstraintDiagnosisError}
          <div class="error" role="alert">Diagnosi non disponibile: {communityConstraintDiagnosisError}</div>
        {/if}
        {#if communityConstraintDiagnoses.length > 0}
          <small>{communityConstraintDiagnosesAllEnumerated ? "Sono enumerate tutte le diagnosi minime a parità di costo totale configurato." : "È mostrata una diagnosi a costo minimo; possono esistere alternative equivalenti. Attiva Tutti gli ottimi per enumerarle."}</small>
          {#each communityConstraintDiagnoses as diagnosis, diagnosisIndex}
            <div class="community-constraint-diagnosis-item">
              <strong>Alternativa {diagnosisIndex + 1} · costo totale {diagnosis.relaxationCost} · sospendere {diagnosis.relaxedConstraintCount} {countForm(diagnosis.relaxedConstraintCount, "regola", "regole")}</strong>
              <ul>
                {#each diagnosis.relaxedConstraints as constraint (constraint.id)}
                  <li>
                    {#if (constraint.nodeIds ?? []).length > 0}
                      <button type="button" on:click={() => dispatch("highlight", constraint.nodeIds ?? [])}>{communityConstraintLabel(constraint)} (costo {constraint.relaxationCost})</button>
                    {:else}
                      {communityConstraintLabel(constraint)} (costo {constraint.relaxationCost})
                    {/if}
                  </li>
                {/each}
              </ul>
              <details>
                <summary>Partizione fattibile di esempio dopo la sospensione</summary>
                <ol>
                  {#each diagnosis.partition.communities as community, communityIndex}
                    <li><button type="button" on:click={() => dispatch("highlight", community)}>Comunità {communityIndex + 1}: {community.map(communityConstraintNodeLabel).join(", ")}</button></li>
                  {/each}
                </ol>
              </details>
            </div>
          {/each}
          <button type="button" on:click={exportCommunityConstraintDiagnoses}>Esporta diagnosi CSV</button>
          <small>La diagnosi riguarda esclusivamente i vincoli dichiarati e l’esistenza di una partizione. Non valuta la correttezza dei vincoli nel dominio e non è una raccomandazione di modifica.</small>
        {/if}
      </section>
    {/if}

    {#if resultSets.length > 0 || (task === "communities" && communityPartitions.length > 0)}
      <div class="summary">
        {#if task === "communities"}
          <strong>{communityPartitions.length}</strong> {countForm(communityPartitions.length, "partizione ottima", "partizioni ottime")} ·
          <strong>Qγ = {modularity?.toFixed(4) ?? "n/d"}</strong>
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          <small>{communityPartitions[0]?.communities.length ?? 0} comunità sulla proiezione non orientata di {graphNodesCount ?? 0} {countForm(graphNodesCount ?? 0, "nodo", "nodi")} e {graphLinksCount ?? 0} {countForm(graphLinksCount ?? 0, "arco", "archi")}.</small>
          <small>Massimizzazione esatta della modularità con γ={communityResolution} {communityResolutionNumerator}/{communityResolutionDenominator}, {communityUsesEdgeWeights ? "pesata con i valori mappati sugli archi" : "non pesata"}; l'enumerazione può restituire molti pareggi.</small>
          <small>{enumerateAllOptima ? "Sono enumerate tutte le partizioni ottime." : "È mostrata una partizione ottima."}</small>
        {:else if task === "typedPath"}
          <strong>Cammino di {pathEdgeTypeSequence.length} {countForm(pathEdgeTypeSequence.length, "arco", "archi")}</strong>
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          {#if pathTemporalSemantics === "static"}
            <small>Sequenza esatta: {pathEdgeTypeSequence.join(" → ")}. La lista indica i record d'arco che possono testimoniare ogni passo tra i nodi restituiti.</small>
          {:else if pathTemporalSemantics === "coValid"}
            <small>Sequenza esatta: {pathEdgeTypeSequence.join(" → ")}. Tutti gli archi sono validi insieme dal primo istante comune: {pathCommonTimeValue !== undefined ? displayMappedTime(pathCommonTimeValue) : "non disponibile"}.</small>
          {:else}
            <small>Sequenza esatta: {pathEdgeTypeSequence.join(" → ")}. Gli inizi di validità dei record scelti sono {pathStrictTemporalOrder ? "strettamente crescenti" : "non decrescenti"}.</small>
          {/if}
        {:else if task === "components"}
          <strong>{resultSets.length}</strong> {countForm(resultSets.length, "componente connessa", "componenti connesse")}
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          <small>Partizione del grafo indotto non orientato; ogni gruppo contiene i nodi raggiungibili tra loro.</small>
        {:else if task === "weakComponents"}
          <strong>{resultSets.length}</strong> {countForm(resultSets.length, "componente debolmente connessa", "componenti debolmente connesse")}
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          <small>Partizione del grafo diretto ottenuta ignorando il verso degli archi; ogni gruppo è connesso sul grafo sottostante.</small>
        {:else if task === "strongComponents"}
          <strong>{resultSets.length}</strong> {countForm(resultSets.length, "componente fortemente connessa", "componenti fortemente connesse")}
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          <small>Partizione per raggiungibilità reciproca nel grafo diretto indotto; all'interno di ogni gruppo ogni nodo raggiunge tutti gli altri seguendo gli archi dichiarati.</small>
        {:else if task === "path"}
          <strong>Cammino di {Math.max(0, resultSize - 1)} {countForm(Math.max(0, resultSize - 1), "arco", "archi")}</strong>
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          <small>Un cammino semplice di lunghezza minima tra i nodi scelti, entro il limite di {parameter} {countForm(parameter, "arco", "archi")}. In caso di pari merito ne mostra uno{explainPathMinimality ? "; il certificato ASP di minimalità è incluso" : ""}.</small>
        {:else if task === "dominatingSet"}
          <strong>{resultSets.length}</strong> {countForm(resultSets.length, "soluzione minima", "soluzioni minime")} ·
          <strong>{resultSize}</strong> {countForm(resultSize, "nodo selezionato", "nodi selezionati")}
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          <small>L'insieme domina {coverageTargetCount ?? 0} {countForm(coverageTargetCount ?? 0, "nodo visibile", "nodi visibili")}{selectedTargetGroup ? ` del gruppo ${selectedTargetGroup}` : ""}; candidati: {selectedGroup || "tutti i nodi"}.</small>
          <small>{enumerateAllOptima ? "Sono enumerate tutte le soluzioni minime." : "È mostrata una soluzione minima."}</small>
        {:else if task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator"}
          <strong>{resultSets.length}</strong> {countForm(resultSets.length, "separatore minimo", "separatori minimi")} ·
          <strong>{resultSize}</strong> {countForm(resultSize, "nodo rimosso", "nodi rimossi")}
          {#if task === "minimumCostNodeSeparator"}<strong> · costo totale {minimumNodeRemovalCost ?? "n/d"}</strong>{/if}
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          <small>{task === "minimumCostNodeSeparator" ? `Minimizza la somma dei costi di rimozione mappati; dominio candidati: ${selectedGroup ? `gruppo ${selectedGroup}` : "tutti i nodi visibili"}. I terminali restano protetti. ${directedGraph ? "La raggiungibilità segue il verso degli archi." : "La proiezione è non orientata."}` : `Minimizza il numero di nodi rimossi; dominio candidati: ${selectedGroup ? `gruppo ${selectedGroup}` : "tutti i nodi visibili"}. I terminali restano protetti. ${directedGraph ? "La raggiungibilità segue il verso degli archi." : "La proiezione è non orientata."}`}</small>
          <small>{enumerateAllOptima ? "Sono enumerate tutte le soluzioni minime." : "È mostrata una soluzione minima."}</small>
        {:else if task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator"}
          <strong>{resultSets.length}</strong> {countForm(resultSets.length, "taglio minimo", "tagli minimi")} ·
          <strong>{resultSize}</strong> {countForm(resultSize, "arco rimosso", "archi rimossi")}
          {#if task === "minimumCostEdgeSeparator"}<strong> · costo totale {minimumCutCost ?? "n/d"}</strong>{/if}
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          <small>{task === "minimumCostEdgeSeparator" ? `Il costo è la somma dei costi di rimozione mappati; la cardinalità degli archi è secondaria. ${directedGraph ? "La raggiungibilità segue il verso degli archi." : "Ogni record d'arco si percorre in entrambi i versi."}` : `Il taglio separa i terminali rimuovendo il minor numero di record d'arco dalla proiezione ${directedGraph ? "diretta corrente, seguendo il verso degli archi" : "non orientata corrente"}.`}</small>
          <small>{enumerateAllOptima ? "Sono enumerate tutte le soluzioni minime." : "È mostrata una soluzione minima."}</small>
        {:else}
          <strong>{resultSets.length}</strong> {countForm(resultSets.length, task === "maximalKPlex" ? "k-plex massimale" : "soluzione ottima", task === "maximalKPlex" ? "k-plex massimali" : "soluzioni ottime")} ·
          <strong>{resultSize}</strong> {countForm(resultSize, "nodo", "nodi")}
          {#if timeMs !== undefined}<span> · {timeMs.toFixed(1)} ms</span>{/if}
          {#if task === "kPlex"}
            <small>Ogni membro può non essere adiacente a non più di {Math.max(0, Number(parameter) - 1)} membri del gruppo.</small>
            <small>{enumerateAllOptima ? "Sono enumerate tutte le soluzioni di cardinalità massima." : "È mostrata una soluzione di cardinalità massima."}</small>
          {:else if task === "maximalKPlex"}
            <small>Ogni membro può non essere adiacente a non più di {Math.max(0, Number(parameter) - 1)} membri del gruppo.</small>
            <small>Il testimone è massimale per inclusione: nessun altro nodo candidato può essere aggiunto mantenendo la proprietà. Questo non garantisce la cardinalità massima.</small>
            {#if enumerateAllMaximalKPlex}
              <small>Sono enumerati tutti i k-plex massimali per inclusione.</small>
            {:else}
              <small>Il singolo testimone è proposto da una costruzione greedy deterministica e verificato da clingo con un certificato di validità e massimalità. È un risultato euristico, non il k-plex di cardinalità massima; l'ordine dei nodi può influire sulla scelta.</small>
            {/if}
          {:else}
            <small>Ogni membro ha almeno {parameter} {countForm(parameter, kCoreNeighborSingularLabel, kCoreNeighborLabel)} {countForm(parameter, "interno", "interni")}; il k-core è il sottografo indotto massimo che soddisfa il vincolo.</small>
          {/if}
        {/if}
        {#if graphNodesCount !== undefined && graphLinksCount !== undefined}
          <div>Proiezione: {graphNodesCount} {countForm(graphNodesCount, "nodo", "nodi")}, {graphLinksCount} {countForm(graphLinksCount, "arco", "archi")}</div>
        {/if}
        {#if selectedGroup && selectedGroupAppliesToTask}
          <div>Filtro gruppo: {selectedGroup} · {selectedGroupNodeCount ?? 0} {countForm(selectedGroupNodeCount ?? 0, "nodo visibile", "nodi visibili")}</div>
        {/if}
        {#if task === "kCore" && includeKCoreNumbers && kCoreNumbers}
          <details class="kcore-profile">
            <summary>Core number {Object.keys(kCoreNumbers).length === 1 ? "del nodo candidato" : `dei ${Object.keys(kCoreNumbers).length} nodi candidati`}{#if kCoreProfileTimeMs !== undefined} · {kCoreProfileTimeMs.toFixed(1)} ms{/if}</summary>
            <small>Peeling standard indipendente da clingo. {#if directedGraph}Nel digrafo, il profilo usa la semantica {kCoreMode === "in" ? "entrante" : kCoreMode === "out" ? "uscente" : "reciproca"} selezionata.{:else}Nel grafo non orientato, il profilo usa i vicini non orientati.{/if}</small>
            {#each kCoreProfileLevels as level}
              <div class="kcore-profile-level">
                <div class="kcore-profile-level-heading">
                  <strong>Core number {level.coreNumber} · {level.nodeIds.length} {countForm(level.nodeIds.length, "nodo", "nodi")}</strong>
                  <button type="button" on:click={() => highlightKCoreProfile(level.coreNumber)}>
                    Evidenzia {level.coreNumber}-core ({getKCoreNodeIdsAtThreshold(level.coreNumber).length} {countForm(getKCoreNodeIdsAtThreshold(level.coreNumber).length, "nodo", "nodi")})
                  </button>
                </div>
                <span>{level.nodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId).join(", ") || "nessun nodo"}</span>
              </div>
            {/each}
            <button type="button" on:click={exportKCoreNumbers}>Esporta core number CSV</button>
          </details>
        {/if}
        <WorkerMemoryReadout stats={workerWasmMemoryStats} {clingoTiming} showClingoTiming={showClingoTiming} {clingoStats} showClingoStats={showClingoStats} />
      </div>

      {#if task === "kPlex"}
        <section class="kplex-membership-diagnosis" aria-labelledby="kplex-membership-diagnosis-title">
          <h3 id="kplex-membership-diagnosis-title">Membership nei k-plex massimi</h3>
          <p>Per il nodo scelto, ASP prova la taglia massima di un k-plex che lo contiene e la confronta con l'ottimo globale corrente, mantenendo fissi s, proiezione e gruppo. Un gap zero prova che il nodo appartiene ad almeno un ottimo; un gap positivo prova che non compare in nessun k-plex ottimo. La query vincolata non enumera tutti gli ottimi globali; quando l'opzione “Tutti gli ottimi” è attiva, il riepilogo quantifica inoltre la membership sull'intera enumerazione completata.</p>
          {#if kPlexMembershipNodes.length > 0}
            <label>
              Nodo da spiegare
              <select bind:value={kPlexMembershipTargetNodeId} on:change={() => dispatch("clearKPlexMembershipDiagnosis")}>
                {#each kPlexMembershipNodes as node (node.id)}
                  <option value={node.id}>{node.label} ({sourceIdByNodeId[node.id] ?? node.id})</option>
                {/each}
              </select>
            </label>
            <button
              type="button"
              class="run"
              on:click={() => dispatch("diagnoseKPlexMaximumMembership", kPlexMembershipTargetNodeId)}
              disabled={running || kPlexMembershipDiagnosisRunning || resultSets.length === 0 || !kPlexMembershipTargetNodeId}
            >
              {kPlexMembershipDiagnosisRunning ? "Verifica ASP della membership…" : "Spiega la membership"}
            </button>
          {:else}
            <small>Nessun nodo appartiene al dominio candidato del gruppo corrente.</small>
          {/if}
          {#if kPlexMembershipDiagnosisError}
            <div class="error" role="alert">Diagnosi non disponibile: {kPlexMembershipDiagnosisError}</div>
          {/if}
          {#if kPlexMembershipDiagnosis && kPlexMembershipDiagnosis.targetNodeId === kPlexMembershipTargetNodeId}
            <div class="membership-diagnosis-result" role="status" aria-live="polite">
              {#if kPlexMembershipAcrossOptimaError}
                <div class="error" role="alert">Membership non classificata: {kPlexMembershipAcrossOptimaError}</div>
              {:else if kPlexMembershipEnumerationConflict}
                <div class="error" role="alert">L'enumerazione degli ottimi e la query ASP vincolata non concordano; non mostro una conclusione di membership.</div>
              {:else}
                <strong>{#if enumerateAllOptima && kPlexMembershipAcrossOptima}
                  {#if kPlexMembershipAcrossOptima.status === "all"}
                    Il nodo compare in tutti i k-plex massimi.
                  {:else if kPlexMembershipAcrossOptima.status === "some"}
                    Il nodo compare solo in una parte dei k-plex massimi.
                  {:else}
                    Il nodo non compare in alcun k-plex massimo.
                  {/if}
                {:else if kPlexMembershipDiagnosis.outcome === "included-in-maximum"}
                  Il nodo compare in almeno un k-plex di cardinalità massima.
                {:else}
                  Il nodo non compare in alcun k-plex di cardinalità massima.
                {/if}</strong>
                {#if enumerateAllOptima && kPlexMembershipAcrossOptima}
                  <span>Membership: {kPlexMembershipAcrossOptima.targetOptimalKplexes}/{kPlexMembershipAcrossOptima.totalOptimalKplexes} ottimi enumerati; il conteggio è strutturale, non probabilistico.</span>
                {/if}
                <span>Ottimo globale: {kPlexMembershipDiagnosis.globalMaximumSize} nodi · massimo con il target: {kPlexMembershipDiagnosis.maximumContainingSize} · gap: {kPlexMembershipDiagnosis.sizeGap}{#if kPlexMembershipDiagnosisTimeMs !== undefined} · {kPlexMembershipDiagnosisTimeMs.toFixed(1)} ms{/if}</span>
                <button type="button" on:click={() => dispatch("highlight", kPlexMembershipDiagnosis?.witnessNodeIds ?? [])}>
                  Evidenzia witness ({kPlexMembershipDiagnosis.witnessNodeIds.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId).join(", ")})
                </button>
                {#if kPlexMembershipDiagnosis.missingPairs.length > 0}
                  <small>Coppie non adiacenti ammesse nel witness, con al massimo {Math.max(0, parameter - 1)} mancanti per membro:</small>
                  <ul>
                    {#each kPlexMembershipDiagnosis.missingPairs as [left, right]}
                      <li>{sourceIdByNodeId[left] ?? left} — {sourceIdByNodeId[right] ?? right}</li>
                    {/each}
                  </ul>
                {:else}
                  <small>Il witness non contiene coppie mancanti: è una clique.</small>
                {/if}
                <button type="button" on:click={exportKPlexMaximumMembershipDiagnosis}>Esporta diagnosi CSV</button>
              {/if}
            </div>
          {/if}
          <section class="kplex-membership-counterfactual" aria-labelledby="kplex-membership-counterfactual-title">
            <h4 id="kplex-membership-counterfactual-title">Quali aggiunte renderebbero il nodo parte di un k-plex massimo?</h4>
            <p>La ricerca valuta solo gli archi aggiuntivi dichiarati in <code>graphAnalysis.counterfactuals.edgeAdditions</code>. Per ogni insieme prova sia l'ottimo globale sia l'ottimo con il nodo forzato sullo stesso grafo modificato; accetta il primo caso in cui le cardinalità coincidono. Le modifiche sono ipotetiche: non vengono applicate ai dati.</p>
            {#if kPlexMembershipCounterfactualEnabled}
              <small>{kPlexMembershipCounterfactualConfiguredCount} archi dichiarati; al massimo {MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES} candidati eleggibili per ricerca, dopo filtri e gruppo.</small>
              {#if kPlexMembershipCounterfactualTimeMs !== undefined}
                <small>Ultima proiezione valutata: {kPlexMembershipCounterfactualCandidateCount} candidati eleggibili.</small>
              {/if}
              <button
                type="button"
                class="run"
                on:click={() => dispatch("searchKPlexMaximumMembershipCounterfactual", kPlexMembershipTargetNodeId)}
                disabled={running || kPlexMembershipCounterfactualRunning || resultSets.length === 0 || !kPlexMembershipTargetNodeId}
              >
                {kPlexMembershipCounterfactualRunning ? "Valutazione dei grafi ipotetici…" : "Cerca aggiunte minime"}
              </button>
            {:else}
              <small>Funzione opzionale: dichiara candidati e costi in <code>graphAnalysis.counterfactuals.edgeAdditions</code> per abilitarla.</small>
            {/if}
            {#if kPlexMembershipCounterfactualError}
              <div class="error" role="alert">Ricerca non disponibile: {kPlexMembershipCounterfactualError}</div>
            {/if}
            {#if kPlexMembershipCounterfactual?.status === "found"}
              {@const counterfactual = kPlexMembershipCounterfactual.result}
              <div class="membership-diagnosis-result" role="status" aria-live="polite">
                {#if counterfactual.selectedEdges.length === 0}
                  <strong>Non serve alcuna aggiunta: il nodo appartiene già a un k-plex massimo.</strong>
                {:else}
                  <strong>Il costo minimo trovato è {counterfactual.totalCost}; il nodo entra in un k-plex massimo di {counterfactual.globalMaximumSize} nodi.</strong>
                {/if}
                <span>Ottimo globale e massimo con target: {counterfactual.globalMaximumSize} e {counterfactual.maximumContainingSize}. Sottoinsiemi candidati valutati: {counterfactual.testedCandidateSets}/{counterfactual.candidateCount === 0 ? 1 : 2 ** counterfactual.candidateCount}{#if kPlexMembershipCounterfactualTimeMs !== undefined} · {kPlexMembershipCounterfactualTimeMs.toFixed(1)} ms{/if}</span>
                {#if counterfactual.selectedEdges.length > 0}
                  <h5>Aggiunte candidate selezionate</h5>
                  <ul>
                    {#each counterfactual.selectedEdges as edge (edge.id)}
                      <li>{sourceIdByNodeId[edge.sourceNodeId] ?? edge.sourceNodeId} — {sourceIdByNodeId[edge.targetNodeId] ?? edge.targetNodeId} · {edge.edgeType} · costo {edge.cost}</li>
                    {/each}
                  </ul>
                {/if}
                <button type="button" on:click={() => dispatch("highlight", [...new Set([
                  ...counterfactual.witnessNodeIds,
                  ...counterfactual.selectedEdges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId])
                ])])}>
                  Evidenzia witness e nodi coinvolti
                </button>
                <button type="button" on:click={exportKPlexMaximumMembershipCounterfactual}>Esporta controfattuale CSV</button>
                <small>La vista 3D evidenzia i nodi, ma conserva la topologia osservata; gli archi aggiunti sono mostrati qui come ipotesi. Il risultato vale solo per questo insieme finito di candidati, questa proiezione, s e gruppo.</small>
              </div>
            {:else if kPlexMembershipCounterfactual?.status === "not-found"}
              <div class="membership-diagnosis-result" role="status" aria-live="polite">
                <strong>Nessun insieme tra i candidati dichiarati rende il nodo parte di un k-plex massimo.</strong>
                <span>Combinazioni provate: {kPlexMembershipCounterfactual.testedCandidateSets}; archi eleggibili: {kPlexMembershipCounterfactual.candidateCount}{#if kPlexMembershipCounterfactualTimeMs !== undefined} · {kPlexMembershipCounterfactualTimeMs.toFixed(1)} ms{/if}</span>
              </div>
            {/if}
          </section>
          <small>Il confronto riguarda la proiezione filtrata dai controlli attivi e il dominio candidato selezionato; il focus temporaneo del nodo modifica solo la vista. È una spiegazione strutturale, non una causa sociale o storica.</small>
        </section>
      {/if}

      {#if task === "communities"}
        <div class="results">
          <div class="results-heading">
            <strong>Partizioni ottime e comunità</strong>
            <button type="button" on:click={exportResults}>Esporta CSV</button>
          </div>
          {#if enumerateAllOptima && communityPartitions.length > 0}
            <section class="community-optimum-stability" aria-labelledby="community-stability-title">
              <h3 id="community-stability-title">Stabilità di co-appartenenza</h3>
              <p>Confronto esatto fra le {communityPartitions.length} partizioni ottime enumerate per la proiezione, la risoluzione e i vincoli correnti. I conteggi non sono probabilità e non descrivono incertezza sui dati o causalità.</p>
              {#if communityStabilityError}
                <div class="error" role="alert">Il riepilogo non è disponibile: {communityStabilityError}</div>
              {:else if communityCoassignmentSummary}
                <label class="community-stability-node">
                  Nodo di riferimento
                  <select bind:value={selectedCommunityStabilityNodeId}>
                    {#each communityStabilityNodeIds as nodeId}
                      <option value={nodeId}>{nodeLabelById[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId} ({sourceIdByNodeId[nodeId] ?? nodeId})</option>
                    {/each}
                  </select>
                </label>
                {#if communityCoassignmentSummary.entries.length === 0}
                  <small>Il dominio contiene un solo nodo, quindi non ci sono altri nodi da confrontare.</small>
                {:else}
                  <details>
                    <summary>Sempre nella stessa comunità ({communityCoassignmentSummary.entries.filter((entry) => entry.relation === "always").length})</summary>
                    <ul>
                      {#each communityCoassignmentSummary.entries.filter((entry) => entry.relation === "always") as entry}
                        <li>{nodeLabelById[entry.nodeId] ?? sourceIdByNodeId[entry.nodeId] ?? entry.nodeId} ({sourceIdByNodeId[entry.nodeId] ?? entry.nodeId}) · {entry.sameCommunityOptima}/{entry.totalOptima}</li>
                      {:else}
                        <li>Nessun nodo.</li>
                      {/each}
                    </ul>
                  </details>
                  <details>
                    <summary>Talvolta nella stessa comunità ({communityCoassignmentSummary.entries.filter((entry) => entry.relation === "sometimes").length})</summary>
                    <ul>
                      {#each communityCoassignmentSummary.entries.filter((entry) => entry.relation === "sometimes") as entry}
                        <li>{nodeLabelById[entry.nodeId] ?? sourceIdByNodeId[entry.nodeId] ?? entry.nodeId} ({sourceIdByNodeId[entry.nodeId] ?? entry.nodeId}) · {entry.sameCommunityOptima}/{entry.totalOptima}</li>
                      {:else}
                        <li>Nessun nodo.</li>
                      {/each}
                    </ul>
                  </details>
                  <details>
                    <summary>Mai nella stessa comunità ({communityCoassignmentSummary.entries.filter((entry) => entry.relation === "never").length})</summary>
                    <ul>
                      {#each communityCoassignmentSummary.entries.filter((entry) => entry.relation === "never") as entry}
                        <li>{nodeLabelById[entry.nodeId] ?? sourceIdByNodeId[entry.nodeId] ?? entry.nodeId} ({sourceIdByNodeId[entry.nodeId] ?? entry.nodeId}) · {entry.sameCommunityOptima}/{entry.totalOptima}</li>
                      {:else}
                        <li>Nessun nodo.</li>
                      {/each}
                    </ul>
                  </details>
                {/if}
                <button type="button" on:click={exportCommunityCoassignment}>Esporta co-appartenenza CSV</button>
              {/if}
            </section>

          {/if}
          {#if communityPartitions.length > 0}
            <section class="community-optimum-stability" aria-labelledby="community-pair-membership-title">
              <h3 id="community-pair-membership-title">Co-appartenenza di una coppia negli ottimi</h3>
              <p>Due query ASP verificano se la coppia compare insieme e separata in una partizione globalmente ottima. Non serve enumerare tutti gli ottimi; si usano la stessa proiezione, risoluzione e vincoli della modularità appena calcolata.</p>
              <div class="community-pair-controls">
                <label>
                  Primo nodo
                  <select bind:value={selectedCommunityPairLeftNodeId} on:change={clearCommunityPairMembershipResult} disabled={communityTopologyCounterfactualRunning}>
                    {#each communityStabilityNodeIds as nodeId (nodeId)}
                      <option value={nodeId}>{nodeLabelById[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId} ({sourceIdByNodeId[nodeId] ?? nodeId})</option>
                    {/each}
                  </select>
                </label>
                <label>
                  Secondo nodo
                  <select bind:value={selectedCommunityPairRightNodeId} on:change={clearCommunityPairMembershipResult} disabled={communityTopologyCounterfactualRunning}>
                    {#each communityStabilityNodeIds as nodeId (nodeId)}
                      <option value={nodeId} disabled={nodeId === selectedCommunityPairLeftNodeId}>{nodeLabelById[nodeId] ?? sourceIdByNodeId[nodeId] ?? nodeId} ({sourceIdByNodeId[nodeId] ?? nodeId})</option>
                    {/each}
                  </select>
                </label>
                <button
                  type="button"
                  on:click={requestCommunityPairMembership}
                  disabled={running || communityPairMembershipRunning || !communityPairMembershipEnabled ||
                    !selectedCommunityPairLeftNodeId || !selectedCommunityPairRightNodeId ||
                    selectedCommunityPairLeftNodeId === selectedCommunityPairRightNodeId}
                >
                  Verifica la coppia con ASP
                </button>
              </div>
              {#if !communityPairMembershipEnabled}
                <small class="field-note">Ricalcola la modularità sulla proiezione corrente per abilitare la verifica.</small>
              {/if}
              {#if communityPairMembershipRunning}
                <div class="scenario-status" role="status">Clingo confronta gli ottimi con vincolo must-link e cannot-link usando il budget del task.</div>
              {/if}
              {#if communityPairMembershipError}
                <div class="error" role="alert">{communityPairMembershipError}</div>
              {/if}
              {#if communityPairMembershipResult}
                <div class="scenario-summary" role="status">
                  {#if communityPairMembershipResult.relation === "always"}
                    {nodeLabelById[communityPairMembershipResult.nodeIds[0]] ?? sourceIdByNodeId[communityPairMembershipResult.nodeIds[0]] ?? communityPairMembershipResult.nodeIds[0]} e {nodeLabelById[communityPairMembershipResult.nodeIds[1]] ?? sourceIdByNodeId[communityPairMembershipResult.nodeIds[1]] ?? communityPairMembershipResult.nodeIds[1]} sono nella stessa comunità in ogni ottimo.
                  {:else if communityPairMembershipResult.relation === "sometimes"}
                    La coppia {nodeLabelById[communityPairMembershipResult.nodeIds[0]] ?? sourceIdByNodeId[communityPairMembershipResult.nodeIds[0]] ?? communityPairMembershipResult.nodeIds[0]} e {nodeLabelById[communityPairMembershipResult.nodeIds[1]] ?? sourceIdByNodeId[communityPairMembershipResult.nodeIds[1]] ?? communityPairMembershipResult.nodeIds[1]} è insieme in alcuni ottimi e separata in altri.
                  {:else}
                    La coppia {nodeLabelById[communityPairMembershipResult.nodeIds[0]] ?? sourceIdByNodeId[communityPairMembershipResult.nodeIds[0]] ?? communityPairMembershipResult.nodeIds[0]} e {nodeLabelById[communityPairMembershipResult.nodeIds[1]] ?? sourceIdByNodeId[communityPairMembershipResult.nodeIds[1]] ?? communityPairMembershipResult.nodeIds[1]} è separata in ogni ottimo.
                  {/if}
                  <p class="field-note">
                    Obiettivo ottimo globale (scala intera ASP): {communityPairMembershipResult.globalScaledScore}.
                    Must-link: {#if communityPairMembershipResult.togetherScaledScore === null}infeasible{:else}{communityPairMembershipResult.togetherScaledScore} (scarto {communityPairObjectiveLosses?.togetherScaledLoss ?? "n/d"}){/if}.
                    Cannot-link: {#if communityPairMembershipResult.separateScaledScore === null}infeasible{:else}{communityPairMembershipResult.separateScaledScore} (scarto {communityPairObjectiveLosses?.separateScaledLoss ?? "n/d"}){/if}.
                  </p>
                  {#if communityPairMembershipTimeMs !== undefined}<span> · {communityPairMembershipTimeMs.toFixed(1)} ms</span>{/if}
                </div>
                <small class="field-note">Gli scarti sono differenze esatte dell'obiettivo intero per la stessa proiezione, risoluzione e vincoli. Descrivono la sensibilità all'imposizione del vincolo sulla coppia; non sono costi d'intervento, probabilità o causalità.</small>
                <button type="button" on:click={exportCommunityPairMembership}>Esporta verifica della coppia CSV</button>
              {/if}
            </section>
            {#if communityTopologyEdgeEdits.length > 0}
              <section class="community-topology-counterfactual" aria-labelledby="community-topology-counterfactual-title">
                <h3 id="community-topology-counterfactual-title">Edit topologici ipotetici per la coppia</h3>
                <p>
                  Cerca fra i candidati edge edit configurati nel JSON e prova la relazione richiesta negli ottimi esatti del grafo modificato.
                  Il costo degli edit è separato dal punteggio di modularità; la ricerca non modifica il grafo.
                </p>
                <div class="community-pair-controls">
                  <label>
                    Relazione obiettivo
                    <select bind:value={selectedCommunityTopologyTarget} on:change={clearCommunityPairMembershipResult} disabled={communityTopologyCounterfactualRunning}>
                      <option value="always">Sempre insieme in ogni ottimo</option>
                      <option value="sometimes">Insieme in alcuni ottimi</option>
                      <option value="never">Separati in ogni ottimo</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    on:click={requestCommunityTopologyCounterfactual}
                    disabled={running || communityTopologyCounterfactualRunning || !communityTopologyCounterfactualEnabled ||
                      !selectedCommunityPairLeftNodeId || !selectedCommunityPairRightNodeId ||
                      selectedCommunityPairLeftNodeId === selectedCommunityPairRightNodeId}
                  >
                    Cerca il costo minimo con ASP
                  </button>
                </div>
                {#if communityTopologyCounterfactualRunning}
                  <div class="scenario-status" role="status">Clingo cerca gli edit per costo crescente e prova due ottimi modulari per ciascun grafo, entro il budget condiviso.</div>
                {/if}
                {#if communityTopologyCounterfactualError}
                  <div class="error" role="alert">{communityTopologyCounterfactualError}</div>
                {/if}
                {#if communityTopologyCounterfactualResult}
                  {@const result = communityTopologyCounterfactualResult}
                  <div class="community-topology-result" role="status">
                    {#if result.selectedEdits.length === 0}
                      La relazione richiesta vale già nel grafo corrente: non serve alcun edit (costo 0).
                    {:else}
                      Relazione verificata: <strong>{result.relation === "always" ? "sempre insieme" : result.relation === "sometimes" ? "insieme in alcuni ottimi" : "sempre separati"}</strong> con costo totale {result.totalEditCost}.
                    {/if}
                    <small class="field-note">
                      Minimo fra {result.candidateCount} candidati configurati applicabili, dopo {result.testedEditSets} grafi provati.
                      Il punteggio di modularità è {result.globalScaledScore} / {result.modularityDenominator} come frazione esatta Qγ; i punteggi insieme/separati sono
                      {result.togetherScaledScore ?? "infeasible"} / {result.separateScaledScore ?? "infeasible"}.
                      {#if communityTopologyCounterfactualTimeMs !== undefined} · {communityTopologyCounterfactualTimeMs.toFixed(1)} ms{/if}
                    </small>
                    {#if result.selectedEdits.length > 0}
                      <ul>
                        {#each result.selectedEdits as edit (edit.id)}
                          <li>
                            <strong>{edit.id}</strong> · costo {edit.cost} ·
                            {#if edit.action === "add"}
                              aggiunge {edit.sourceNodeId} — {edit.targetNodeId}{communityUsesEdgeWeights ? ` (peso ${edit.weight})` : ""}
                            {:else}
                              rimuove il record arco {edit.edgeId}
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                    <small class="field-note">Il risultato restituisce una soluzione fra eventuali minimi a pari costo. I candidati sono ipotesi configurate; l’esito non è una raccomandazione relazionale o causale.</small>
                  </div>
                  <button type="button" on:click={exportCommunityTopologyCounterfactual}>Esporta il controfattuale CSV</button>
                {/if}
              </section>
            {/if}
          {/if}
          {#each communityPartitions as partition, partitionIndex}
            <div class="community-partition">
              <strong>Partizione {partitionIndex + 1} · {partition.communities.length} comunità</strong>
              {#each partition.communities as community, communityIndex}
                <button type="button" class="result" on:click={() => highlightCommunity(community, partition)}>
                  <span>{communityIndex + 1}. {community.map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId).join(", ")}</span>
                  <span class="size">{community.length}</span>
                </button>
                {#each communityAttributeBoundsFor(community, partition) as bound}
                  <small class="field-note">{bound.attribute}={JSON.stringify(bound.value)}: {bound.count} nodi{bound.minimum !== undefined ? ` (min ${bound.minimum})` : ""}{bound.maximum !== undefined ? ` (max ${bound.maximum})` : ""}</small>
                {/each}
              {/each}
              {#if explainCommunityContributions && partition.communityContributions}
                <div class="community-explanation" aria-live="polite">
                  <small>Per ogni comunità C, il contributo intero è 4·M·q·{communityUsesEdgeWeights ? "Lw(C)" : "L(C)"} − p·{communityUsesEdgeWeights ? "Dw(C)" : "D(C)"}², con γ=p/q={communityResolutionNumerator}/{communityResolutionDenominator}. {#if communityUsesEdgeWeights}Per il calcolo ASP, le quantità sono espresse in unità 1/{communityWeightScaleFactor}; M_s={communityScaledTotalWeight ?? 0}, corrispondente al totale reale M={communityDisplayTotalWeight ?? communityScaledTotalWeight ?? 0}.{:else}M={communityScaledTotalWeight ?? graphLinksCount ?? 0}.{/if} La somma è {partition.scaledScore} e Qγ = {partition.scaledScore} / (4·{communityUsesEdgeWeights ? "M_s" : "M"}²·q).</small>
                  <ul>
                    {#each partition.communityContributions as contribution}
                      {@const members = partition.communities.find((community) => community.includes(contribution.communityId)) ?? []}
                      <li>
                        <button type="button" on:click={() => highlightCommunity(members, partition)}>
                          {sourceIdByNodeId[contribution.communityId] ?? contribution.communityId}: {communityUsesEdgeWeights ? `peso interno scalato=${contribution.internalEdgeWeight}, volume pesato scalato=${contribution.volume}${communityWeightScaleFactor > 1 ? ` (unità 1/${communityWeightScaleFactor})` : ""}` : `l=${contribution.internalEdgeCount}, d=${contribution.volume}`}, contributo={contribution.scaledContribution}
                        </button>
                        <details>
                          <summary>{contribution.internalEdgeCount} record d'arco interni</summary>
                          {#if (contribution.supportingEdgeIds ?? []).length > 0}
                            <ul>
                              {#each contribution.supportingEdgeIds ?? [] as edgeId}
                                <li>
                                  {sourceIdByEdgeId[edgeId] ?? edgeId}
                                  {#if edgeProvenanceById[edgeId]}<small> — fonte dichiarata: {edgeProvenanceById[edgeId]}</small>{/if}
                                </li>
                              {/each}
                            </ul>
                          {:else}
                            <small>Nessun ID di record visibile per questa comunità.</small>
                          {/if}
                        </details>
                      </li>
                    {/each}
                  </ul>
                  <button type="button" on:click={() => exportCommunityCertificate(partition, partitionIndex)}>Esporta certificato CSV</button>
                </div>
              {/if}
              {#if explainCommunityContributions && !partition.communityContributions}
                <small>Il certificato non era attivo quando è stata calcolata questa partizione. Esegui di nuovo l'analisi con l'opzione attiva.</small>
              {/if}
            </div>
          {/each}
        </div>
      {:else if resultSets[0].length === 0}
        <p class="empty">{task === "dominatingSet" ? "Non ci sono nodi selezionati: il dominio obiettivo è vuoto." : task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" ? "I terminali erano già disconnessi: non occorre rimuovere nodi." : task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator" ? "I terminali erano già disconnessi: non occorre rimuovere archi." : task === "kCore" ? "Il k-core è vuoto per questa soglia." : "Il solver non ha restituito nodi nel testimone."}</p>
        {#if task === "kCore" && explainKCoreExclusions}
          <div class="kcore-peeling" aria-live="polite">
            <strong>Peeling ASP dei nodi fuori dal {parameter}-core</strong>
            <p>In ogni round sincrono si rimuovono i nodi candidati con meno di {parameter} {countForm(parameter, kCoreNeighborSingularLabel, kCoreNeighborLabel)} ancora attivi. L'ordine e i vicini elencati coincidono con il peeling indipendente.</p>
            {#if !Object.prototype.hasOwnProperty.call(kCorePeelingBySet, "")}
              <small>Per questo risultato non è stato richiesto il certificato. Esegui di nuovo il k-core con l'opzione attiva.</small>
            {:else if emptyKcorePeeling.length > 0}
              <ol>
                {#each emptyKcorePeeling as step}
                  <li>
                    <button type="button" on:click={() => highlightKCorePeelingStep(step)}>
                      Round {step.round}: {sourceIdByNodeId[step.nodeId] ?? step.nodeId} ({step.survivingNeighborIds.length} &lt; {parameter})
                    </button>
                    {#if step.survivingNeighborIds.length > 0}
                      <ul>
                        {#each step.supportingPairs as pair}
                          {@const neighborId = pair.sourceNodeId === step.nodeId ? pair.targetNodeId : pair.sourceNodeId}
                          <li>
                            {sourceIdByNodeId[neighborId] ?? neighborId}: {#if pair.supportingRecords.length > 0}
                              {#each pair.supportingRecords as record, recordIndex}{recordIndex > 0 ? ", " : ""}{edgeRecordDescription(record)}{/each}
                            {:else}
                              adiacenza senza record sorgente risolto
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <small>Nessun vicino distinto era ancora attivo.</small>
                    {/if}
                  </li>
                {/each}
              </ol>
              <button type="button" on:click={exportKcorePeelingExplanation}>Esporta peeling CSV</button>
            {:else}
              <small>Il certificato non contiene round di rimozione nel dominio candidato.</small>
            {/if}
          </div>
        {/if}
        {#if separatorTask && selectedSeparatorReachable.length > 0}
          <div class="separator-explanation" aria-live="polite">
            <strong>Lato raggiungibile dal terminale iniziale</strong>
            <p>{sourceIdByNodeId[startNodeId] ?? startNodeId} raggiunge i nodi elencati; il terminale finale {sourceIdByNodeId[goalNodeId] ?? goalNodeId} resta fuori da questo lato.</p>
            <ul>
              {#each selectedSeparatorReachable as nodeId}
                <li>{sourceIdByNodeId[nodeId] ?? nodeId}</li>
              {/each}
            </ul>
            <small>Il lato è calcolato dall'ASP dopo le rimozioni. La separazione si controlla da questa partizione; l'ottimalità è stabilita dall'obiettivo ASP.</small>
            <button type="button" on:click={highlightSeparatorReachableSide}>Evidenzia lato sorgente</button>
            <button type="button" on:click={exportSeparatorCertificate}>Esporta certificato CSV</button>
          </div>
        {/if}
      {:else}
        <div class="results">
          <div class="results-heading">
            <strong>{task === "kPlex" ? "k-plex di cardinalità massima" : task === "maximalKPlex" ? "k-plex massimali per inclusione" : task === "kCore" ? "Nodi del k-core" : task === "components" ? "Nodi per componente" : task === "weakComponents" ? "Nodi per componente debolmente connessa" : task === "strongComponents" ? "Nodi per componente fortemente connessa" : task === "dominatingSet" ? "Nodi selezionati" : task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" ? "Nodi rimossi" : task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator" ? "Archi rimossi" : task === "typedPath" ? "Cammino e passi tipizzati" : "Cammino minimo"}</strong>
            <button type="button" on:click={exportResults}>Esporta CSV</button>
            {#if task === "path"}
              <button type="button" on:click={exportPathWitnessCSV}>Esporta archi testimoni CSV</button>
            {/if}
            {#if separatorTask}
              <button type="button" on:click={exportSeparatorCertificate}>Esporta certificato CSV</button>
            {/if}
          </div>
          {#each resultSets as nodeSet, index}
            {@const resultSignature = nodeSetSignature(nodeSet)}
            {@const resultPressed = getStructuralResultPressedState(task, resultSignature, {
              activeSeparatorSignature,
              selectedDominatingSignature,
              selectedKcoreSignature,
              selectedKplexSignature
            })}
            <button type="button" class="result" aria-pressed={resultPressed} on:click={() => task === "typedPath" || task === "path"
              ? dispatch("highlightTypedPath", { nodeIds: nodeSet, edgeIds: pathEdgeIdsByStep.flat() })
              : task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator" ? highlightEdgeSeparatorSet(nodeSet) : highlightNodeSet(nodeSet)}>
              <span>{index + 1}. {task === "typedPath"
                ? nodeSet.map((id) => sourceIdByNodeId[id] ?? id).join(" → ")
                : nodeSet.map((id) => task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator"
                  ? sourceIdByEdgeId[id] ?? id
                  : sourceIdByNodeId[id] ?? id).join(", ")}</span>
              <span class="size">{nodeSet.length}</span>
            </button>
            {#if (task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator") && edgeProvenanceSummary(nodeSet)}
              <small>Fonti dichiarate: {edgeProvenanceSummary(nodeSet)}</small>
            {/if}
            {#if task === "typedPath"}
              <ol class="path-edge-witnesses">
                {#each pathEdgeTypeSequence as edgeType, step}
                  <li>
                    {edgeType}: {(pathEdgeIdsByStep[step] ?? []).map((edgeId) => sourceIdByEdgeId[edgeId] ?? edgeId).join(", ")}
                    {#if pathTemporalSemantics === "orderedByStart" && pathStartTimeValuesByStep[step] !== undefined}
                      <small> · inizio validità: {displayMappedTime(pathStartTimeValuesByStep[step])}</small>
                    {/if}
                    {#if edgeProvenanceSummary(pathEdgeIdsByStep[step] ?? [])}<small> · fonte dichiarata: {edgeProvenanceSummary(pathEdgeIdsByStep[step] ?? [])}</small>{/if}
                  </li>
                {/each}
              </ol>
            {:else if task === "path"}
              <ol class="path-edge-witnesses">
                {#each pathEdgeIdsByStep as edgeIds, step}
                  <li>
                    {sourceIdByNodeId[nodeSet[step]] ?? nodeSet[step]} → {sourceIdByNodeId[nodeSet[step + 1]] ?? nodeSet[step + 1]}: {edgeIds.map((edgeId) => sourceIdByEdgeId[edgeId] ?? edgeId).join(", ")}
                    {#if edgeProvenanceSummary(edgeIds)}<small> · fonte dichiarata: {edgeProvenanceSummary(edgeIds)}</small>{/if}
                  </li>
                {/each}
              </ol>
            {/if}
            {#if task === "path" && pathMinimality}
              <div class="path-minimality-explanation" aria-live="polite">
                <strong>Certificato ASP di minimalità</strong>
                {#if pathMinimality.pathLength === 0}
                  <p>Il cammino ha lunghezza zero; non esistono cammini di lunghezza non negativa inferiore.</p>
                {:else}
                  <p>La destinazione non è raggiungibile dalla sorgente con al più {pathMinimality.pathLength - 1} {countForm(pathMinimality.pathLength - 1, "arco", "archi")} nella proiezione e nel gruppo selezionati.</p>
                  <details>
                    <summary>Insiemi raggiungibili per ciascun limite</summary>
                    <ol>
                      {#each pathMinimality.reachableByDepth as layer}
                        <li>≤ {layer.depth}: {layer.nodeIds.map((id) => sourceIdByNodeId[id] ?? id).join(", ")}</li>
                      {/each}
                    </ol>
                  </details>
                {/if}
                <small>La chiusura mostra perché non esiste una soluzione più corta; il cammino e i suoi record d'arco mostrano che la lunghezza restituita è realizzabile.</small>
                <button type="button" on:click={exportPathMinimalityCSV}>Esporta certificato CSV</button>
              </div>
            {/if}
          {/each}
          {#if separatorTask && selectedSeparatorReachable.length > 0}
            <div class="separator-explanation" aria-live="polite">
              <strong>Lato raggiungibile dal terminale iniziale</strong>
              <p>{sourceIdByNodeId[startNodeId] ?? startNodeId} raggiunge i nodi elencati; il terminale finale {sourceIdByNodeId[goalNodeId] ?? goalNodeId} resta fuori da questo lato.</p>
              <ul>
                {#each selectedSeparatorReachable as nodeId}
                  <li>{sourceIdByNodeId[nodeId] ?? nodeId}</li>
                {/each}
              </ul>
              <small>Il lato è calcolato dall'ASP dopo le rimozioni. Per un taglio di archi, ogni record che attraversa i due lati deve essere rimosso; per un separatore di nodi, ogni arco attraversante deve toccare un nodo rimosso. Questo certificato controlla la separazione; l'ottimalità deriva dall'obiettivo ASP.</small>
              <button type="button" on:click={highlightSeparatorReachableSide}>Evidenzia lato sorgente</button>
            </div>
          {/if}
          {#if (task === "kPlex" || task === "maximalKPlex") && selectedKplexSignature}
            <div class="kplex-explanation" aria-live="polite">
              <strong>Certificato del {parameter}-plex</strong>
              {#if task === "maximalKPlex"}
                <p>Nessun nodo del dominio candidato esterno può essere aggiunto mantenendo la proprietà; la massimalità per inclusione non afferma che questo sia il k-plex più grande.</p>
                {#if selectedKplexMaximality}
                  {#if selectedKplexMaximality.candidateNodeIds.length > 0}
                    <strong>Perché non si può aggiungere ciascun candidato</strong>
                    <ul>
                      {#each selectedKplexMaximality.candidateNodeIds as candidateNodeId}
                        <li>
                          <strong>{sourceIdByNodeId[candidateNodeId] ?? candidateNodeId}</strong>
                          <ul>
                            {#each selectedKplexMaximality.blockers.filter((blocker) => blocker.candidateNodeId === candidateNodeId) as blocker}
                              {#if blocker.reason === "candidate_degree"}
                                <li>ha {blocker.candidateMissingDegree} non-vicini nel gruppo selezionato (servirebbero meno di {parameter}).</li>
                              {:else}
                                <li>non è adiacente a {sourceIdByNodeId[blocker.blockingNodeId] ?? blocker.blockingNodeId}, che ha già {blocker.blockingNodeMissingDegree} non-vicini (il limite è {Math.max(0, Number(parameter) - 1)}).</li>
                              {/if}
                            {/each}
                          </ul>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <small>Non ci sono altri nodi eleggibili nel dominio di ricerca: la massimalità vale rispetto a questo dominio.</small>
                  {/if}
                {/if}
              {/if}
              <p>Le coppie seguenti non sono adiacenti; ogni nodo compare in non più di {Math.max(0, Number(parameter) - 1)} coppie.</p>
              {#if selectedKplexMissingPairs.length > 0}
                <ul>
                  {#each selectedKplexMissingPairs as [first, second]}
                    <li>{sourceIdByNodeId[first] ?? first} — {sourceIdByNodeId[second] ?? second}</li>
                  {/each}
                </ul>
              {:else}
                <small>Non ci sono coppie mancanti: questa soluzione è una clique.</small>
              {/if}
              <button type="button" disabled={task === "maximalKPlex" && !selectedKplexMaximality} on:click={exportKplexExplanation}>Esporta spiegazione CSV</button>
              <StructuralCompletionCounterfactualPanel
                bind:target={kPlexCompletionTargetS}
                running={running}
                contextText={`Fissa i nodi di questa soluzione e cerca archi ipotetici per renderla un t-plex.`}
                targetLabel="Valore target t"
                minimumTarget={1}
                maximumTarget={Number(parameter)}
                targetHelp={`La soluzione corrente e un ${parameter}-plex; il target deve stare tra 1 e ${parameter}. Entrambi gli estremi di ogni candidato devono appartenere al testimone. Il tipo e descrittivo e gli intervalli validity non sono interpretati da questa query statica.`}
                unavailableReason={directedGraph ? "Il completamento k-plex richiede una proiezione non orientata." : ""}
                candidateEnabled={kPlexCounterfactualEnabled && !directedGraph}
                candidateCount={kPlexCounterfactualCandidateCount}
                proposals={kPlexCounterfactualProposals}
                whyNot={kPlexCounterfactualWhyNot}
                whyNotMessage={kPlexCounterfactualWhyNotMessage}
                hasRun={kPlexCounterfactualHasRun}
                error={kPlexCounterfactualError}
                timeMs={kPlexCounterfactualTimeMs}
                excludedCandidateCount={kPlexCounterfactualExcludedCandidateCount}
                cohortNodeIds={selectedKplexSignature.split("\u0000")}
                sourceIdByNodeId={sourceIdByNodeId}
                enumerateAllOptima={task === "kPlex" && enumerateAllOptima}
                showEnumeration={true}
                on:criteriaChange={() => dispatch("kPlexCohortChange")}
                on:run={(event) => dispatch("kPlexCompletion", { targetS: event.detail.target, cohortNodeIds: event.detail.cohortNodeIds, enumerateAllOptima: event.detail.enumerateAllOptima })}
                on:highlight={(event) => dispatch("highlight", event.detail)}
              />
            </div>
          {/if}
          {#if task === "kCore" && selectedKcoreSignature}
            <div class="kcore-explanation" aria-live="polite">
              <strong>Certificato di grado per il {parameter}-core</strong>
              <label>
                Nodo da verificare
                <select bind:value={selectedKcoreNodeId}>
                  {#each (resultSets.find((set) => nodeSetSignature(set) === selectedKcoreSignature) ?? []) as nodeId}
                    <option value={nodeId}>{sourceIdByNodeId[nodeId] ?? nodeId}</option>
                  {/each}
                </select>
              </label>
              {#if Number(parameter) === 0}
                <p>Con k=0 il vincolo di grado è soddisfatto da ogni nodo candidato; il solver seleziona tutto il dominio per massimizzare la cardinalità.</p>
              {:else}
                <p>Il nodo ha {selectedKcoreNeighborIds.length} {countForm(selectedKcoreNeighborIds.length, kCoreNeighborSingularLabel, kCoreNeighborLabel)} {countForm(selectedKcoreNeighborIds.length, "distinto", "distinti")} nel core; il requisito è almeno {parameter}.</p>
              {/if}
              {#if selectedKcoreNeighborIds.length > 0}
                <ul>
                  {#each selectedKcoreNodePairs as pair}
                    {@const neighborId = pair.sourceNodeId === selectedKcoreNodeId ? pair.targetNodeId : pair.sourceNodeId}
                    <li>
                      {sourceIdByNodeId[neighborId] ?? neighborId}: {#if pair.supportingRecords.length > 0}
                        {#each pair.supportingRecords as record, recordIndex}{recordIndex > 0 ? ", " : ""}{edgeRecordDescription(record)}{/each}
                      {:else}
                        coppia attestata dall’ASP, record sorgente non risolto
                      {/if}
                    </li>
                  {/each}
                </ul>
              {:else}
                <small>Questo nodo non ha vicini nel risultato; è valido solo con k=0.</small>
              {/if}
              <small>La testimonianza verifica il vincolo di grado per il nodo selezionato. {explainKCoreExclusions ? "Il certificato di peeling spiega separatamente le esclusioni nel dominio candidato." : "Per default non viene calcolata una spiegazione dei nodi esclusi."} Non è una spiegazione causale degli archi.</small>
              <button type="button" on:click={exportKcoreExplanation}>Esporta certificato CSV</button>
              <button type="button" on:click={exportCompactKcoreExplanation}>Esporta CSV compatto (v2)</button>
              <small>Il formato v2 registra la membership del core una sola volta; il CSV precedente resta disponibile nel formato storico.</small>
              {#if explainKCoreExclusions}
                <div class="kcore-peeling" aria-live="polite">
                  <strong>Peeling ASP dei nodi fuori dal {parameter}-core</strong>
                  <p>In ogni round sincrono si rimuovono i nodi candidati con meno di {parameter} {countForm(parameter, kCoreNeighborSingularLabel, kCoreNeighborLabel)} ancora attivi. L'ordine e i vicini elencati coincidono con il peeling indipendente.</p>
                  {#if !Object.prototype.hasOwnProperty.call(kCorePeelingBySet, selectedKcoreSignature)}
                    <small>Per questo risultato non è stato richiesto il certificato. Esegui di nuovo il k-core con l'opzione attiva.</small>
                  {:else if selectedKcorePeeling.length > 0}
                    <ol>
                      {#each selectedKcorePeeling as step}
                        <li>
                          <button type="button" on:click={() => highlightKCorePeelingStep(step)}>
                            Round {step.round}: {sourceIdByNodeId[step.nodeId] ?? step.nodeId} ({step.survivingNeighborIds.length} &lt; {parameter})
                          </button>
                          {#if step.survivingNeighborIds.length > 0}
                            <ul>
                              {#each step.supportingPairs as pair}
                                {@const neighborId = pair.sourceNodeId === step.nodeId ? pair.targetNodeId : pair.sourceNodeId}
                                <li>
                                  {sourceIdByNodeId[neighborId] ?? neighborId}: {#if pair.supportingRecords.length > 0}
                                    {#each pair.supportingRecords as record, recordIndex}{recordIndex > 0 ? ", " : ""}{edgeRecordDescription(record)}{/each}
                                  {:else}
                                    adiacenza senza record sorgente risolto
                                  {/if}
                                </li>
                              {/each}
                            </ul>
                          {:else}
                            <small>Nessun vicino distinto era ancora attivo.</small>
                          {/if}
                        </li>
                      {/each}
                    </ol>
                    <button type="button" on:click={exportKcorePeelingExplanation}>Esporta peeling CSV</button>
                  {:else}
                    <small>Tutti i nodi candidati appartengono al core; non ci sono esclusioni da spiegare.</small>
                  {/if}
                </div>
              {/if}
              <StructuralCompletionCounterfactualPanel
                title="Completamento controfattuale del k-core"
                bind:target={kCoreCompletionTarget}
                bind:enumerateAllOptima={kCoreCompletionEnumerateAllOptima}
                running={running}
                contextText="Fissa i nodi di questo testimone e cerca archi ipotetici per portare ogni grado interno alla soglia target k."
                targetLabel="Soglia target k"
                minimumTarget={Number(parameter)}
                maximumTarget={undefined}
                targetHelp={`La soglia target deve essere almeno ${parameter}. Il testimone resta fisso e ogni nodo deve avere almeno k vicini distinti al suo interno. Gli estremi dei candidati devono appartenere al testimone; il tipo e descrittivo e gli intervalli validity non sono interpretati da questa query statica.`}
                unavailableReason={kCoreCounterfactualUnavailableReason}
                candidateEnabled={kCoreCounterfactualEnabled && !directedGraph}
                candidateCount={kCoreCounterfactualCandidateCount}
                proposals={kCoreCounterfactualProposals}
                kCoreWhyNot={kCoreCounterfactualWhyNot}
                kCoreWhyNotMessage={kCoreCounterfactualWhyNotMessage}
                hasRun={kCoreCounterfactualHasRun}
                error={kCoreCounterfactualError}
                timeMs={kCoreCounterfactualTimeMs}
                excludedCandidateCount={kCoreCounterfactualExcludedCandidateCount}
                cohortNodeIds={selectedKcoreSignature.split("\u0000")}
                sourceIdByNodeId={sourceIdByNodeId}
                showEnumeration={true}
                on:criteriaChange={() => dispatch("kCoreCohortChange")}
                on:run={(event) => dispatch("kCoreCompletion", { targetK: event.detail.target, cohortNodeIds: event.detail.cohortNodeIds, enumerateAllOptima: event.detail.enumerateAllOptima })}
                on:highlight={(event) => dispatch("highlight", event.detail)}
              />
            </div>
          {/if}
          {#if task === "dominatingSet" && selectedDominatingSignature}
            <div class="dominating-explanation" aria-live="polite">
              <strong>Copertura del target selezionato</strong>
              <label>
                Nodo obiettivo
                <select bind:value={selectedDominatingTargetId} on:change={highlightDominatingTarget}>
                  {#each selectedDominatingTargetIds as targetId}
                    <option value={targetId}>{sourceIdByNodeId[targetId] ?? targetId}</option>
                  {/each}
                </select>
              </label>
              <ul>
                {#each selectedDominatingTargetCoverage as item}
                  <li>
                    {#if item.targetNodeId === item.coveringNodeId}
                      Coperto da se stesso perché è selezionato.
                    {:else}
                      Coperto dal nodo selezionato {sourceIdByNodeId[item.coveringNodeId] ?? item.coveringNodeId} tramite
                      {#if item.supportingRecords.length > 0}
                        {#each item.supportingRecords as record, recordIndex}{recordIndex > 0 ? ", " : ""}{edgeRecordDescription(record)}{/each}.
                      {:else}
                        un'adiacenza senza record sorgente risolto.
                      {/if}
                    {/if}
                  </li>
                {/each}
              </ul>
              <small>Il certificato mostra perché il target è coperto. La minimalità della cardinalità è stabilita dall'ottimizzazione ASP, non da questo elenco.</small>
              <button type="button" on:click={exportDominatingSetExplanation}>Esporta certificato CSV</button>
            </div>
          {/if}
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .structural-panel {
    position: absolute;
    top: var(--solver-top);
    right: var(--solver-right);
    z-index: var(--solver-z);
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  header p {
    margin: 0;
  }

  header p,
  .summary small {
    display: block;
    color: #475569;
  }

  .close {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 22px;
  }

  .task-controls {
    display: grid;
    gap: 8px;
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .task-contract {
    padding: 7px 9px;
    border: 1px solid #dbe3ee;
    border-radius: 6px;
    background: #f8fafc;
    color: #334155;
    font-size: 0.82rem;
    line-height: 1.35;
  }

  .task-contract summary {
    cursor: pointer;
    font-weight: 600;
  }

  .task-contract p {
    margin: 6px 0 0;
  }

  .task-contract small {
    display: block;
    margin-top: 6px;
    overflow-wrap: anywhere;
  }

  label {
    display: grid;
    grid-template-columns: 90px 1fr;
    align-items: center;
    gap: 8px;
  }

  .checkbox-label {
    grid-template-columns: 90px 1fr;
  }

  input,
  select,
  button {
    font: inherit;
  }

  input,
  select {
    min-width: 0;
    padding: 5px 7px;
  }

  .run,
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

  .error {
    padding: 8px;
    border-radius: 6px;
    background: #fef2f2;
    color: #991b1b;
  }

  .summary {
    padding: 9px;
    border-radius: 7px;
    background: #eff6ff;
  }

  .summary small {
    margin-top: 5px;
  }

  .scenario-status,
  .scenario-summary,
  .scenario-comparison {
    display: grid;
    gap: 7px;
    padding: 8px;
    border-radius: 6px;
    background: #f1f5f9;
  }

  .scenario-summary {
    display: block;
    background: #eff6ff;
  }

  .scenario-run {
    margin-top: 2px;
  }

  .scenario-list,
  .scenario-memberships {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .scenario-row,
  .scenario-memberships button {
    display: grid;
    gap: 2px;
    width: 100%;
    box-sizing: border-box;
    padding: 6px;
    border-radius: 5px;
    background: #ffffff;
  }

  .scenario-membership-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .scenario-membership-heading button,
  .scenario-memberships button {
    border: 0;
    color: inherit;
    text-align: left;
    font: inherit;
  }

  .scenario-membership-heading button {
    padding: 5px 7px;
    border-radius: 5px;
    background: #e2e8f0;
    cursor: pointer;
  }

  .scenario-memberships button {
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .scenario-memberships button:hover {
    background: #e0f2fe;
  }

  .scenario-memberships button.stable {
    background: #dcfce7;
  }

  .scenario-semantics {
    color: #475569;
    overflow-wrap: anywhere;
  }

  .results {
    display: grid;
    gap: 6px;
  }

  .community-partition,
  .community-explanation {
    display: grid;
    gap: 6px;
    padding: 8px;
    border-radius: 6px;
    background: #f1f5f9;
  }

  .community-optimum-stability {
    display: grid;
    gap: 7px;
    min-width: 0;
    padding: 10px;
    border: 1px solid #94a3b8;
    border-radius: 6px;
    background: #f8fafc;
  }

  .community-topology-counterfactual,
  .community-topology-result {
    display: grid;
    gap: 7px;
    min-width: 0;
    padding: 10px;
    border: 1px solid #7c8ca3;
    border-radius: 6px;
    background: #f8fafc;
    overflow-wrap: anywhere;
  }

  .community-topology-counterfactual h3,
  .community-topology-counterfactual p {
    margin: 0;
  }

  .community-topology-counterfactual ul {
    max-height: 160px;
    margin: 4px 0 0;
    overflow: auto;
    padding-left: 22px;
  }

  .community-constraint-diagnosis {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: 10px;
    border: 1px solid #c0841a;
    border-radius: 6px;
    background: #fffbeb;
  }

  .community-constraint-diagnosis h3,
  .community-constraint-diagnosis p {
    margin: 0;
  }

  .community-constraint-diagnosis p,
  .community-constraint-diagnosis li {
    overflow-wrap: anywhere;
  }

  .community-constraint-diagnosis ul,
  .community-constraint-diagnosis ol {
    max-height: 180px;
    margin: 4px 0;
    overflow: auto;
    padding-left: 22px;
  }

  .community-constraint-diagnosis-item {
    display: grid;
    gap: 5px;
    min-width: 0;
    padding: 8px;
    border-radius: 5px;
    background: #ffffff;
  }

  .community-constraint-diagnosis-item button {
    justify-self: start;
    max-width: 100%;
    padding: 4px 6px;
    text-align: left;
    overflow-wrap: anywhere;
  }

  .community-constraint-diagnosis-item details {
    overflow-wrap: anywhere;
  }

  .community-optimum-stability h3,
  .community-optimum-stability p {
    margin: 0;
  }

  .community-optimum-stability p,
  .community-optimum-stability li {
    overflow-wrap: anywhere;
  }

  .community-optimum-stability ul {
    max-height: 160px;
    margin: 4px 0 0;
    overflow: auto;
    padding-left: 22px;
  }

  .community-stability-node {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .community-pair-controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    align-items: end;
    gap: 8px;
    min-width: 0;
  }

  .community-pair-controls label {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .community-pair-controls button {
    justify-self: start;
    max-width: 100%;
  }

  .community-explanation ul {
    max-height: 200px;
    margin: 0;
    overflow: auto;
    padding-left: 22px;
  }

  .community-explanation button {
    justify-self: start;
    padding: 6px 8px;
  }

  .kcore-profile {
    display: grid;
    gap: 6px;
    margin-top: 8px;
  }

  .kcore-profile-level {
    display: grid;
    gap: 3px;
    padding: 6px;
    border-radius: 5px;
    background: #ffffff;
  }

  .kcore-profile-level-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .kcore-profile-level-heading button {
    padding: 4px 7px;
    font-size: 0.85em;
  }

  .kcore-profile-level span {
    overflow-wrap: anywhere;
  }

  .community-explanation details {
    overflow-wrap: anywhere;
  }

  .path-type-sequence {
    display: grid;
    gap: 7px;
    padding: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f8fafc;
  }

  .path-type-step {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 7px;
  }

  .path-type-step button {
    padding: 4px 7px;
  }

  .path-type-sequence small,
  .path-edge-witnesses {
    color: #475569;
  }

  .path-edge-witnesses {
    margin: 0;
    padding-left: 28px;
    overflow-wrap: anywhere;
  }

  .kplex-explanation,
  .kcore-explanation,
  .dominating-explanation,
  .separator-explanation,
  .path-minimality-explanation,
  .kcore-peeling {
    display: grid;
    gap: 5px;
    padding: 8px;
    border-radius: 6px;
    background: #f1f5f9;
  }

  .kplex-explanation p,
  .kplex-explanation ul,
  .kcore-explanation p,
  .kcore-explanation ul,
  .dominating-explanation ul,
  .separator-explanation p,
  .separator-explanation ul,
  .path-minimality-explanation p,
  .path-minimality-explanation ol,
  .kcore-peeling p,
  .kcore-peeling ol {
    margin: 0;
  }

  .kplex-explanation ul,
  .kcore-explanation ul {
    max-height: 160px;
    overflow: auto;
    padding-left: 22px;
  }

  .dominating-explanation ul {
    max-height: 160px;
    overflow: auto;
    padding-left: 22px;
  }

  .separator-explanation ul {
    max-height: 160px;
    overflow: auto;
    padding-left: 22px;
  }

  .path-minimality-explanation ol {
    max-height: 200px;
    overflow: auto;
    padding-left: 22px;
    overflow-wrap: anywhere;
  }

  .kcore-peeling ol {
    max-height: 220px;
    overflow: auto;
    padding-left: 24px;
  }

  .kcore-peeling li > ul {
    padding-left: 18px;
  }

  .kplex-explanation button,
  .kcore-explanation button,
  .dominating-explanation button,
  .separator-explanation button,
  .path-minimality-explanation button,
  .kcore-peeling button {
    justify-self: start;
    padding: 6px 8px;
  }

  .kplex-membership-diagnosis {
    display: grid;
    gap: 8px;
    margin: 12px 0;
    padding: 10px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
  }

  .kplex-membership-diagnosis h3,
  .kplex-membership-diagnosis p {
    margin: 0;
  }

  .membership-diagnosis-result {
    display: grid;
    gap: 6px;
  }

  .membership-diagnosis-result ul {
    max-height: 140px;
    overflow: auto;
    margin: 0;
    padding-left: 22px;
    overflow-wrap: anywhere;
  }

  .result {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 7px;
    border: 0;
    border-radius: 5px;
    background: #e0f2fe;
    color: inherit;
    text-align: left;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  .result:hover {
    background: #bae6fd;
  }

  .size {
    flex: none;
    font-weight: 650;
  }

  .empty {
    margin: 0;
    color: #475569;
  }

  @media (max-width: 1280px) {
    .structural-panel {
      right: 12px;
      width: min(var(--solver-width), calc(100vw - 24px));
      top: calc(var(--toolbar-top) + var(--toolbar-height, 180px) + 10px);
      max-height: calc(100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px - var(--mobile-status-reserve, 48px));
    }
  }

  @media (max-width: 360px) {
    .analysis-task-label {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
