<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { csvCell, downloadCsvText } from "../csvExport";
  import StructuralCompletionCounterfactualPanel from "./StructuralCompletionCounterfactualPanel.svelte";
  import { buildCompactKCoreWitnessCsv, buildDominatingSetWitnessCsv, buildKCoreWitnessCsv, buildKPlexWitnessCsv, buildModularityCertificateCsv, buildSeparatorCertificateCsv } from "../graph/structuralCsvExport.ts";
  import WorkerMemoryReadout from "./WorkerMemoryReadout.svelte";
  import {
    buildProvenanceScenarioKCoreCsv,
    buildProvenanceScenarioKPlexCsv,
    type ProvenanceScenarioKCoreComparison,
    type ProvenanceScenarioKPlexComparison
  } from "../graph/provenanceScenarioAnalysis";
  import type { ClingoInvocationStats, ClingoInvocationTiming, WorkerWasmMemoryStats } from "../workerDiagnostics";
  import type { BoundedPathNoRouteCertificate, DirectedKCoreMode, DominatingSetCoverageWitness, KPlexCompletionProposal, KCoreMembershipCompletionProposal, StructuralEdgeCompletionProposal, KCorePeelingCertificate, KCoreSupportingPair, MinimumHopPathMinimalityCertificate, ModularityPartition, StructuralTask, TypedPathNoRouteCertificate } from "../graph/structuralTasks";
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
  export let explainPathMinimality = false;
  export let explainTypedPathNoRoute = false;
  export let minimumCommunityCount = 0;
  export let maximumCommunityCount = 0;
  export let communityPartitions: ModularityPartition[] = [];
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
  export let availableEdgeTypes: string[] = [];
  export let typedPathRequirementsAvailable = false;
  export let typedPathRequirementReasons: string[] = [];
  export let costEdgeSeparatorRequirementsAvailable = false;
  export let costEdgeSeparatorRequirementReasons: string[] = [];
  export let costNodeSeparatorRequirementsAvailable = false;
  export let costNodeSeparatorRequirementReasons: string[] = [];
  export let pathEdgeIdsByStep: string[][] = [];
  export let pathMinimality: MinimumHopPathMinimalityCertificate | undefined;
  export let pathNoRouteCertificate: BoundedPathNoRouteCertificate | undefined;
  export let typedPathNoRouteCertificate: TypedPathNoRouteCertificate | undefined;
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
  export let kPlexMissingPairsBySet: Record<string, Array<[string, string]>> = {};
  export let kPlexMaximalityBySet: Record<string, MaximalKPlexWitnessExplanation> = {};
  export let kPlexCounterfactualEnabled = false;
  export let kPlexCounterfactualCandidateCount = 0;
  export let kPlexCounterfactualProposals: KPlexCompletionProposal[] = [];
  export let kPlexCounterfactualHasRun = false;
  export let kPlexCounterfactualError = "";
  export let kPlexCounterfactualTimeMs: number | undefined;
  export let kPlexCounterfactualExcludedCandidateCount = 0;
  export let kCoreCounterfactualEnabled = false;
  export let kCoreCounterfactualUnavailableReason = "";
  export let kCoreCounterfactualCandidateCount = 0;
  export let kCoreCounterfactualProposals: KPlexCompletionProposal[] = [];
  export let kCoreCounterfactualHasRun = false;
  export let kCoreCounterfactualError = "";
  export let kCoreCounterfactualTimeMs: number | undefined;
  export let kCoreCounterfactualExcludedCandidateCount = 0;
  export let kCoreMembershipCandidateNodeIds: string[] = [];
  export let kCoreMembershipCounterfactualProposals: KCoreMembershipCompletionProposal[] = [];
  export let kCoreMembershipCounterfactualHasRun = false;
  export let kCoreMembershipCounterfactualError = "";
  export let kCoreMembershipCounterfactualTimeMs: number | undefined;
  export let kCoreMembershipCounterfactualExcludedCandidateCount = 0;
  export let kCoreSupportBySet: Record<string, KCoreSupportingPair[]> = {};
  export let kCorePeelingBySet: Record<string, KCorePeelingCertificate[]> = {};
  export let dominatingSetSupportBySet: Record<string, DominatingSetCoverageWitness[]> = {};
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
  let previousKCoreSourceParameter = Number(parameter);
  let previousKCoreMembershipSourceParameter = Number(parameter);
  let previousKCoreMembershipCandidateDomain = "";

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
        : { edge_id: sourceId, provenance_references: edgeProvenanceReferencesBySourceId[sourceId] ?? [] };
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
      explainPathMinimality,
      explainTypedPathNoRoute,
      selectedGroup,
      selectedTargetGroup,
      startNodeId,
      goalNodeId,
      pathEdgeTypeSequence,
      minimumCommunityCount,
      maximumCommunityCount,
      communityUsesEdgeWeights,
      communityResolution
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
    pathEdgeTypeSequence.length === 0 ||
    pathEdgeTypeSequence.some((edgeType) => !availableEdgeTypes.includes(edgeType))
  );
  $: resultSize = resultSets[0]?.length ?? 0;
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
      explainPathMinimality,
      explainTypedPathNoRoute,
      startNodeId,
      goalNodeId,
      pathEdgeTypeSequence: [...pathEdgeTypeSequence],
      minimumCommunityCount: Number(minimumCommunityCount),
      maximumCommunityCount: Number(maximumCommunityCount)
    });
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

  function exportResults() {
    if (task === "typedPath") {
      if (!resultSets[0] || pathEdgeIdsByStep.length !== pathEdgeTypeSequence.length) return;
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
</script>

{#if open}
  <section class="structural-panel" aria-label="Analisi strutturali ASP">
    <header>
      <div>
        <h3>Analisi strutturali ASP</h3>
        <p>Strutture, cammini tipizzati, copertura, comunità e tagli sulla proiezione visibile corrente.</p>
      </div>
      <button type="button" class="close" aria-label="Chiudi" on:click={() => dispatch("close")}>×</button>
    </header>

    <fieldset class="task-controls" disabled={running}>
      <label>
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
          <span><input type="checkbox" bind:checked={explainTypedPathNoRoute} /> Mostra perché non c’è un cammino tipizzato</span>
        </label>
        {#if explainTypedPathNoRoute}
          <small class="field-note">Se la ricerca del cammino semplice fallisce, una seconda query ASP mostra i nodi raggiungibili dopo ogni prefisso. Distingue un prefisso bloccato da un typed walk che raggiunge la meta solo rivisitando nodi.</small>
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
    {#if provenanceKCoreComparisonRunning}
      <div class="scenario-status" role="status">{provenanceKCoreComparisonProgress || "Calcolo del k-core negli scenari dichiarati…"}</div>
    {/if}
    {#if provenanceKCoreComparisonError}
      <div class="error" role="alert">{provenanceKCoreComparisonError}</div>
    {/if}
    {#if provenanceKCoreComparison}
      <section class="scenario-comparison" aria-label="Stabilità del k-core tra scenari di provenienza">
        <div class="scenario-summary" role="status">
          <strong>{provenanceKCoreComparison.stableNodeIds.length}</strong> nodi presenti in tutti gli scenari ·
          <strong>{provenanceKCoreComparison.nonUniversalNodeIds.length}</strong> presenti in almeno uno ·
          {provenanceKCoreComparison.scenarioCount} scenari · k={provenanceKCoreComparison.k}
          {#if provenanceKCoreComparison.degreeMode !== "undirected"}
            · grado {provenanceKCoreComparison.degreeMode === "in" ? "entrante" : provenanceKCoreComparison.degreeMode === "out" ? "uscente" : "mutuo"}
          {/if}
        </div>
        <div class="scenario-list">
          {#each provenanceKCoreComparison.scenarios as scenario (scenario.scenarioId)}
            <div class="scenario-row">
              <strong>{scenario.scenarioLabel}</strong>
              <span>{scenario.nodesCount} nodi candidati · {scenario.linksCount} archi · core {scenario.coreSize}</span>
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
          <strong>Membership nei k-core</strong>
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
                  <strong>{membership.stableAcrossEveryScenario ? "Presente in tutti" : "Non universale"}</strong>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <small class="scenario-semantics">Il k-core è unico per ogni proiezione. “Presente in tutti” indica l’intersezione dei k-core degli scenari configurati; “non universale” indica presenza solo in alcuni. “Nel dominio” separa i nodi eleggibili dalla loro appartenenza al core. I nodi assenti da tutti i core sono omessi. È un confronto deterministico, non una probabilità né una conclusione epistemica.</small>
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
          <strong>{provenanceKPlexComparison.stableNodeIds.length}</strong> candidati presenti in tutti gli ottimi ·
          <strong>{provenanceKPlexComparison.nonUniversalNodeIds.length}</strong> non universali ·
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
          <strong>Membership nei k-plex massimi</strong>
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
                  <strong>{membership.stableAcrossEveryOptimalAnswerSet ? "Presente in tutti gli ottimi" : membership.optimalAnswerSetCount === 0 ? "Mai selezionato" : "Non in tutti gli ottimi"}</strong>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <small class="scenario-semantics">Per ogni scenario sono enumerate tutte le soluzioni di cardinalità massima. “Presente in tutti gli ottimi” significa membership in ogni witness massimo di ogni scenario dichiarato; “Mai selezionato” identifica candidati che non appartengono a nessun ottimo. Il conteggio dei witness non è una probabilità. Se un’enumerazione non termina o non è completa, il confronto non mostra risultati parziali.</small>
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
        <button type="button" on:click={exportTypedPathNoRouteCSV}>Esporta certificato why-not CSV</button>
      </div>
    {/if}
    {#if task === "communities" && communityConfigurationError}
      <div class="error" role="alert">{communityConfigurationError}</div>
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
          <small>Sequenza esatta: {pathEdgeTypeSequence.join(" → ")}. La lista indica i record d'arco che possono testimoniare ogni passo tra i nodi restituiti.</small>
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

      {#if task === "communities"}
        <div class="results">
          <div class="results-heading">
            <strong>Partizioni ottime e comunità</strong>
            <button type="button" on:click={exportResults}>Esporta CSV</button>
          </div>
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
            <button type="button" class="result" aria-pressed={separatorTask && nodeSetSignature(nodeSet) === activeSeparatorSignature} on:click={() => task === "typedPath" || task === "path"
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
      max-height: calc(100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px);
    }
  }
</style>
