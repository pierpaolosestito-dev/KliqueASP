<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { base } from "$app/paths";
  import * as THREE from "three";
  import { forceManyBody, forceCenter, forceLink, forceCollide } from "d3-force-3d";
  import TimelineSlider from "./components/TimelineSlider.svelte";
  import ResultListPager from "./components/ResultListPager.svelte";
  import { deepMergeConfig } from "./config/deepMergeConfig";
  import InfoPanel from "./components/InfoPanel.svelte";
  import HistoryPanel from "./components/HistoryPanel.svelte";
  import SolverPanel from "./components/SolverPanel.svelte";
  import StructuralAnalysisPanel from "./components/StructuralAnalysisPanel.svelte";
  import IntegrityPanel from "./components/IntegrityPanel.svelte";
  import MotifAnalysisPanel from "./components/MotifAnalysisPanel.svelte";
  import Graph2DExportPanel from "./components/Graph2DExportPanel.svelte";
  import DownloadAnnouncement from "./components/DownloadAnnouncement.svelte";
  import {
    buildGraph2DAnalysisSummary,
    buildGraph2DHypotheticalEdgeAnnotations,
    buildGraph2DHypotheticalLinks,
    type Graph2DEdgeAnnotation,
    type Graph2DLinkInput,
    type Graph2DNodeInput
  } from "./graph/graph2dExport.ts";
  import { buildGraph2DCliqueResultLabel } from "./graph/graph2DCliqueSummary.ts";
  import {
    buildGraph2DOptimizationCompletionLabel,
    buildGraph2DStructuralCompletionLabel,
    buildGraph2DScenarioComparisonCompletionLabel,
    buildGraph2DInfeasibleAnalysisSummary,
    buildGraph2DIncompleteAnalysisSummary,
    getGraph2DActiveAnalysisError,
    selectGraph2DPanelSummary
  } from "./graph/graph2DAnalysisOutcome.ts";
  import { buildGraph2DStructuralResultLabel } from "./graph/graph2DStructuralSummary.ts";
  import { buildGraph2DDominatingSetCoverageOverlay } from "./graph/graph2DDominatingSet.ts";
  import { buildGraphWitnessStatus } from "./graph/graphWitnessStatus.ts";
  import { getGraphLinkOpacity } from "./graph/graphLinkOpacity.ts";
  import { getGraphMotionSettings, getGraphTransitionDuration, getInitialGraphCameraDistance } from "./graph/graphMotion.ts";
  import { getNonOverlappingGraphNodeLabelIds } from "./graph/nodeLabelLayout.ts";
  import ProvenanceScenarioAnalysisPanel from "./components/ProvenanceScenarioAnalysisPanel.svelte";
  import {
    getClingoInvocationOptions,
    parseClingoInvocationStats,
    parseClingoInvocationTiming,
    type ClingoInvocationStats,
    type ClingoInvocationTiming,
    type WorkerWasmMemoryStats
  } from "./workerDiagnostics";
  import {
    clingoWorkerClient,
    getClingoWasmProgramSizeError,
    type ClingoWorkerLease
  } from "./clingoWorkerClient";
  import {
    filterLinksByMinimumConfidence,
    parseMinimumConfidenceThreshold
  } from "./graph/confidenceProjection";
  import {
    filterLinksByProvenanceScenario,
    normalizeProvenanceReferences
  } from "./graph/provenance";
  import { projectVisibleNodeIds } from "./graph/visibleNodeProjection";
  import {
    formatGraphDisplayEdgeTypeTooltip,
    formatGraphDisplayLinkTooltip,
    getGraphDisplayEdgeTypeLegend,
    getGraphDisplayLinkColor,
    getGraphNeighborhoodNodeIds,
    graphDisplayLinkMatchesIdentities,
    prepareGraphDisplayLinks,
    type AggregatedGraphDisplayLink,
    type GraphDisplayLink,
    type NeighborhoodDirection
  } from "./graph/graphVisualization";
  import {
    filterLinksByTemporalWindow,
    isTimelineControlAvailable
  } from "./graph/temporalProjection";
  import {
    getDeclaredNodeTimelineConfig,
    getDeclaredNodeTypeConfig,
    isDeclaredNodeAlwaysVisible
  } from "./graph/configuredNodeSemantics";
  import { normalizeNodeTypeConfigStyles } from "./graph/nodeTypeConfig";
  import { summarizeAnalysisReadiness } from "./graph/analysisReadiness";
  import { buildIntegrityViolationVisualization } from "./graph/integrityVisualization.ts";
  import { buildIntegrityRepairVisualization } from "./graph/integrityRepairVisualization.ts";
  import {
    filterWorkbenchHistoryForNodeIds,
    MAX_WORKBENCH_ANALYSIS_ARCHIVE_CHARS,
    MAX_WORKBENCH_HISTORY_ENTRIES,
    MAX_WORKBENCH_ANALYSIS_ARCHIVE_ENTRIES,
    type WorkbenchAnalysisArchiveEntry,
    type WorkbenchAnalysisArchiveSnapshot,
    type WorkbenchAnalysisSessionSnapshot,
    type WorkbenchHistoryEntry
  } from "./graph/workbenchSession.ts";
  import {
    getGraphTaskContract,
    resolveCliqueMode,
    resolveTaskEnumeration,
    GRAPH_CAPABILITY_IDS,
    GRAPH_CAPABILITY_LABELS
  } from "./graph/graphTaskContracts";
  import {
    getRemainingSolverBudgetMs,
    resolveSolverTaskTimeoutMs,
    runWithRemainingSolverBudget
  } from "./graph/solverBudget";
  import {
    summarizeProvenanceScenarioMaximumCliques,
    summarizeProvenanceScenarioMaximumKPlexes,
    summarizeProvenanceScenarioKCores,
    summarizeProvenanceScenarioComponents,
    summarizeProvenanceScenarioDominatingSets,
    buildProvenanceScenarioDominatingSetCsv,
    type ProvenanceScenarioCliqueComparison,
    type ProvenanceScenarioKPlexComparison,
    type ProvenanceScenarioKCoreComparison,
    type ProvenanceScenarioComponentComparison,
    type ProvenanceScenarioComponentTask,
    type ProvenanceScenarioDominatingSetComparison,
    type ScenarioMaximumCliqueInput,
    type ScenarioMaximumKPlexInput
  } from "./graph/provenanceScenarioAnalysis";
  import {
    buildAspFactsFromGraph,
    buildCliqueProgram,
    checkNodeRemovalCostCapabilityForCandidates,
    checkGraphTaskRequirements,
    createAspTemporalEncoding,
    getGraphTaskRequirements,
    getCliqueModeOptions,
    getGraphEndpointId,
    normalizeGraphData,
    normalizeGraphId,
    normalizeGraphLabel,
    DEFAULT_EDGE_CONFIDENCE_RANGE,
    parseWitnessCliqueResults,
    parseWitnessCliques,
    selectMaximumCliques,
    type CliqueMode,
    type CliqueSupportingEdge,
    type GraphCapabilities,
    type GraphDiagnostic,
    type GraphIntegrityConstraints,
    type GraphContextualCliqueConfig,
    type GraphMotifTemplate,
    type GraphTemporalMetricUnit,
    type AspTemporalEncoding
  } from "./graph/graphModel";
  import {
    buildCliqueRequiredNodeConstraint,
    parseCliqueMaximumMembershipDiagnosis,
    type CliqueMaximumMembershipDiagnosis,
    type CliqueMembershipEdgeRecord
  } from "./graph/cliqueMembershipDiagnosis";
  import {
    buildKPlexRequiredNodeConstraint,
    parseKPlexMaximumMembershipDiagnosis,
    type KPlexMaximumMembershipDiagnosis
  } from "./graph/kplexMembershipDiagnosis";
  import {
    MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES,
    searchMinimumCostKPlexMaximumMembershipCounterfactual,
    type KPlexMaximumMembershipCounterfactualSearchOutcome
  } from "./graph/kplexMembershipCounterfactual";
  import {
    buildCommunityConstraintRelaxationProgram,
    parseCommunityConstraintDiagnosisResult,
    type CommunityConstraintDiagnosis,
    type CommunityConstraintRelaxationSpec
  } from "./graph/communityConstraintDiagnosis";
  import {
    classifyCommunityPairOptimumMembership,
    type CommunityPairOptimumMembership
  } from "./graph/communityOptimumStability";
  import {
    searchMinimumCostCommunityTopologyCounterfactual,
    type CommunityTopologyCounterfactualResult,
    type CommunityTopologyEdgeEdit
  } from "./graph/communityTopologyCounterfactual";
  import { buildCommunityTopologyGraph2DOverlay } from "./graph/communityTopologyGraph2D.ts";
  import {
    buildMinimumIntegrityRepairProgram,
    buildGraphIntegrityProgram,
    validateGraphIntegrityAttributeMappings,
    parseIntegrityRepairProposal,
    parseIntegrityViolations,
    type IntegrityRepairProposal,
    type IntegrityViolation
  } from "./graph/integrityTask";
  import {
    buildTypedMotifCountProgram,
    buildTypedMotifProgram,
    buildTypedMotifNearMatchProgram,
    buildTypedMotifTemporalNearMatchProgram,
    buildTypedMotifCompletionCounterfactualProgram,
    parseTypedMotifMatches,
    parseTypedMotifCount,
    parseTypedMotifNearMatches,
    parseTypedMotifCompletionCounterfactuals,
    type TypedMotifMatch,
    type TypedMotifNearMatch,
    type TypedMotifEdgeAdditionCandidate,
    type TypedMotifCounterfactual
  } from "./graph/motifTask";
  import {
    resolveTypedMotifCountPartitionDomain,
    resolveTypedMotifCountPartitionSettings,
    runTypedMotifCountPartitions,
    type TypedMotifCountPartitionProgress
  } from "./graph/motifCountTask";
  import {
    summarizeProvenanceScenarioMotifs,
    type ProvenanceMotifScenarioComparison,
    type ProvenanceMotifScenarioInput
  } from "./graph/motifScenarioAnalysis";
  import {
    buildSignedTriadProgram,
    parseSignedTriadResults,
    prepareSignedTriads,
    type SignedTriadPreparation,
    type SignedTriadResult
  } from "./graph/signedTriadTask";
  import {
    buildContextualCliqueIncidenceIndex,
    buildContextualCliqueProgram,
    parseContextualCliqueResults,
    validateContextualCliqueConfig,
    type ContextualCliqueResult
  } from "./graph/contextualCliqueTask";
  import { buildContextualCliqueGraph2DOverlay } from "./graph/contextualCliqueGraph2D";
  import {
    summarizeSignedTriadScenarios,
    type SignedTriadScenarioComparison,
    type SignedTriadScenarioInput
  } from "./graph/signedTriadScenarioAnalysis";
  import {
    buildConnectedComponentsProgram,
    buildWeaklyConnectedComponentsProgram,
    buildStronglyConnectedComponentsProgram,
    buildBoundedPathNoRouteProgram,
    buildKCoreProgram,
    buildKCorePeelingRoundProgram,
    buildKCorePeelingRoundFacts,
    computeKCoreNumbers,
    searchMaximumKPlexWithAsp,
    normalizeKPlexTimeoutResult,
    buildMinimumHopPathProgram,
    formatPathLengthBound,
    buildTypedPathProgram,
    buildTypedPathNoRouteProgram,
    buildTypedPathTemporalNoRouteProgram,
    buildTypedPathCompletionCounterfactualProgram,
    buildTypedPathCompletionWhyNotProgram,
    buildTypedPathTemporalCompletionWhyNotProgram,
    buildMinimumDominatingSetProgram,
    buildDominatingSetFeasibilityProgram,
    buildMinimumNodeSeparatorProgram,
    buildMinimumCostNodeSeparatorProgram,
    buildMinimumEdgeSeparatorFacts,
    buildEdgeProvenanceByIdentity,
    buildEdgeSourceIdentityByIdentity,
    buildEdgeProvenanceBySourceId,
    buildPathEdgeFacts,
    mapKCoreSupportPairsToRecords,
    mapKCorePeelingStepsToRecords,
    getKCoreInducedEdgeIdentities,
    mapDominatingSetSupportPairsToRecords,
    mapModularityContributionsToRecords,
    buildEdgeProvenanceReferencesBySourceId,
    buildMinimumEdgeSeparatorProgram,
    buildMinimumCostEdgeSeparatorProgram,
    buildMaximumKPlexProgram,
    buildMaximalKPlexProgram,
    buildMaximalKPlexCertificateProgram,
    buildGreedyMaximalKPlexWitness,
    buildKPlexCompletionCounterfactualProgram,
    buildKPlexCompletionWhyNotProgram,
    buildKCoreCompletionCounterfactualProgram,
    buildKCoreCompletionWhyNotProgram,
    buildKCoreMembershipCompletionCounterfactualProgram,
    solveKCoreMembershipCompletionWhyNotByRounds,
    parseKPlexCompletionCounterfactuals,
    parseKPlexCompletionWhyNot,
    parseKCoreCompletionCounterfactuals,
    parseKCoreCompletionWhyNot,
    parseKCoreMembershipCompletionCounterfactuals,
    validateKPlexCompletionCandidates,
    buildModularityFacts,
    solveModularityByPositiveWeightComponents,
    buildMaximumModularityProgram,
    buildCommunityPairMembershipPrograms,
    MAX_PAIRWISE_MODULARITY_CANDIDATES,
    validateCommunityConfiguration,
    resolveCommunityAttributeBounds,
    getStructuralEdgeIdentity,
    getStructuralSolverOptions,
    hasCompleteModelEnumeration,
    hasCompleteOptimalModelEnumeration,
    hasCompleteKCoreScenarioResult,
    getStructuralCounterfactualSolverOptions,
    getKCoreMembershipCounterfactualSolverOptions,
    parseWitnessComponents,
    parseWitnessWeakComponents,
    parseWitnessStrongComponents,
    parseWitnessDominatingSetExplanations,
    parseDominatingSetFeasibilityCertificate,
    verifyDominatingSetFeasibilityCertificate,
    parseWitnessKCoreExplanations,
    parseWitnessKCorePeelingRound,
    parseWitnessKPlexExplanations,
    parseWitnessMaximalKPlexExplanations,
    parseWitnessMinimumHopPathWitness,
    parseBoundedPathNoRouteCertificate,
    parseWitnessTypedPath,
    parseWitnessTemporalTypedPath,
    parseTypedPathNoRouteCertificate,
    parseTypedPathTemporalNoRouteCertificate,
    parseTypedPathCompletionCounterfactuals,
    parseTypedPathCompletionWhyNotCertificate,
    parseTypedPathTemporalCompletionWhyNotCertificate,
    mergeTypedPathEdgeTypes,
    parseWitnessRemovedNodeSetExplanations,
    parseWitnessRemovedEdgeSetExplanations,
    parseWitnessModularityPartitions,
    parseWitnessNodeSets,
    selectMaximumNodeSets,
    selectMaximumModularityPartitions,
    selectMinimumEdgeSets,
    selectMinimumCostEdgeSets,
    selectMinimumNodeSets,
    selectMinimumCostNodeSets,
    type StructuralTask,
    type DirectedKCoreMode,
    type KCoreSupportingPair,
    type KCorePeelingStep,
    type KCorePeelingCertificate,
    type DominatingSetCoverageWitness,
    type ModularityPartition,
    type ParsedModularityPartition,
    type ModularityCommunityOptions,
    type MinimumHopPathMinimalityCertificate,
    type BoundedPathNoRouteCertificate,
    type TypedPathNoRouteCertificate,
    type TypedPathTemporalNoRouteCertificate,
    type TypedPathOptions,
    type TypedPathTemporalEdgeRecord,
    type TypedPathTemporalSemantics,
    type TypedPathTemporalResult,
    type TypedPathCounterfactualProposal,
    type TypedPathCounterfactualWhyNot,
    type KPlexCompletionCandidate,
    type KPlexCompletionProposal,
    type KPlexCompletionWhyNot,
    type KCoreCompletionWhyNot,
    type KCoreMembershipCompletionWhyNot,
    type KCoreMembershipCompletionProposal,
    type MaximalKPlexWitnessExplanation,
    type StructuralEdgeCompletionCandidate
  } from "./graph/structuralTasks";
  import { deriveCommunityAttributeBoundCounts } from "./graph/communityAttributeCounts";

  export let graphConfig: any = {};
  export let graphData: any = {
    nodes: [],
    edges: []
  };
  export let forceEasterEgg: boolean = false;
  export let nodeLabelsVisible: boolean = true;
  let nodeLabelLayoutVisibleIds: Set<string> | null = null;
  let nodeLabelLayoutInterval: ReturnType<typeof setInterval> | null = null;
  let hoveredGraphNodeId: string | null = null;
  export let initialHistory: WorkbenchHistoryEntry[] = [];
  export let onHistoryChange: (entries: WorkbenchHistoryEntry[]) => void = () => {};
  export let sessionGraphKey = "";
  export let sessionRestored = false;
  export let initialAnalysisSession: WorkbenchAnalysisSessionSnapshot | null = null;
  export let onAnalysisSessionChange: (snapshot: WorkbenchAnalysisSessionSnapshot | null) => void = () => {};
  export let initialAnalysisArchive: WorkbenchAnalysisArchiveSnapshot | null = null;
  export let onAnalysisArchiveChange: (snapshot: WorkbenchAnalysisArchiveSnapshot | null) => void = () => {};
  let lastCapturedAnalysisSession: WorkbenchAnalysisSessionSnapshot | null = null;
  let analysisArchiveEntries: WorkbenchAnalysisArchiveEntry[] = initialAnalysisArchive?.graphKey === sessionGraphKey
    ? initialAnalysisArchive.entries.map((entry) => ({
        ...entry,
        label: analysisArchiveLabel(entry.state as Record<string, any>)
      }))
    : [];
  let activeAnalysisId: string | null = null;
  let activeAnalysisCreatedAt: string | null = null;
  const initialHistorySnapshot = initialHistory.slice();

  export let JsonEditor: any = null;
  export let jsonEditorProps: any = {};
  let jsonEditorComponent: { openProjectPicker?: () => void } | null = null;
  // ---------------------------------------------------------------------------
  // DEFAULT CONFIG
  // ---------------------------------------------------------------------------
  // Questo fallback permette all'app di funzionare anche se graph.config.json
  // è vuoto oppure contiene solo i mapping essenziali del dataset, ad esempio:
  //
  // {
  //   "nodeTypes": {
  //     "actor": {
  //       "timeline": {
  //         "startField": "$.data.active_from",
  //         "endField": "$.data.active_to"
  //       },
  //       "group": "$.data.affiliations[*].group"
  //     }
  //   }
  // }
  // ---------------------------------------------------------------------------

  const DEFAULT_GRAPH_CONFIG: any = {
    graph: {
      backgroundColor: "#050816",
      nodeOpacity: 0.95,
      linkOpacity: 0.4,
      linkWidth: 0.4
    },

    forces: {
      charge: -60,
      linkDistance: 70,
      linkStrength: 0.5
    },

    colors: {
      root: "#facc15",
      neighbor: "#60a5fa",
      preview: "#7dd3fc",
      default: "#334155",
      clique: "#7dd3fc"
    },

    node: {
      iconSize: 14,
      ring: {
        innerRadius: 0.65,
        outerRadius: 0.85,
        segments: 32,
        scale: 8
      },
      label: {
        font: "22px sans-serif",
        scale: [14, 6],
        offsetY: -10
      }
    },

    features: {
      filters: true,
      timeline: false,
      labelVisibilityToggle: true
    },

    timeline: {
      debounceMs: 140,
      start: 1776,
      end: 2017,
      mode: "simple"
    },

    solver: {
      enabled: true,
      // "maximal": clique non estendibili (default)
      // "all":     tutte le clique, incluse le sotto-clique (--opt-mode=enum)
      // "maximum": solo le clique di cardinalità massima (--opt-mode=optN)
      cliqueMode: "maximal",
      taskTimeoutMs: 20000,
      diagnostics: {
        aspTiming: false,
        aspStats: false
      },
      features: {
        groupFilter: true,
        minSize: true,
        topPerSize: true,
        onlyMaximum: true,
        showAll: true,
        filterBySelectedNode: true,
        downloadCSV: true,
        histogram: true,
        stats: true,
        selectedAnalysis: true
      }
    },

    ui: {
      timeline: {
        bottom: 20,
        width: "min(800px, 90vw)",
        padding: "16px 24px",
        borderRadius: 16,
        background: "rgba(255,255,255,0.9)",
        blur: 8,
        shadow: "0 10px 30px rgba(0,0,0,0.15)",
        zIndex: 25,

        label: {
          gap: 12,
          fontSize: 18,
          fontWeight: 600,
          marginBottom: 12
        },

        slider: {
          height: 40,
          trackHeight: 6,
          trackRadius: 6,
          trackColor: "#cbd5f5",
          thumbSize: 18,
          thumbColor: "#0ea5e9",
          thumbBorder: "2px solid white"
        }
      },

      infoPanel: {
        top: 10,
        right: 10,
        width: 260,
        maxHeight: 340,
        padding: 12,
        borderRadius: 8,
        background: "rgba(255,255,255,0.9)",
        zIndex: 10,

        title: {
          fontSize: 16
        },

        modal: {
          backdrop: "rgba(2,6,23,0.6)",
          zIndex: 999,

          cardWidth: "min(720px, 92vw)",
          cardMaxHeight: "85vh",
          cardBg: "#ffffff",
          cardRadius: 12,

          headerFontSize: 20,
          headerBorder: "1px solid rgba(0,0,0,0.1)",

          bodyPadding: 16,
          lineHeight: 1.6,

          footerPadding: "12px 16px",

          closeBg: "rgba(0,0,0,0.05)",
          closeColor: "#0f172a"
        }
      },

      solverPanel: {
        top: 20,
        right: 20,
        width: 420,
        maxHeight: "85vh",
        padding: 18,
        borderRadius: 14,
        background: "rgba(255,255,255,0.95)",
        shadow: "0 20px 40px rgba(0,0,0,0.15)",
        zIndex: 50,
        fontSize: 13,

        header: {
          titleSize: 16,
          closeColor: "#0f172a"
        },

        meta: {
          opacity: 0.85,
          gap: 4
        },

        selectedAnalysis: {
          background: "rgba(99,102,241,0.15)",
          padding: 10,
          radius: 8,
          marginTop: 10
        },

        controls: {
          gap: 6,
          marginTop: 14,
          marginBottom: 14,
          inputWidth: 70
        },

        cliques: {
          marginTop: 14,
          groupGap: 12,
          titleSize: 14,

          item: {
            padding: "6px 8px",
            marginBottom: 4,
            background: "rgba(14,165,233,0.15)",
            hover: "rgba(14,165,233,0.3)",
            radius: 6,
            fontSize: 12
          },

          badge: {
            bg: "#facc15",
            color: "#000",
            fontSize: 10,
            padding: "2px 4px",
            radius: 4
          }
        }
      },

      historyPanel: {
        left: 10,
        bottom: 10,
        maxWidth: "min(560px, 92vw)",
        padding: 10,
        borderRadius: 8,
        background: "rgba(255,255,255,0.95)",
        zIndex: 15,
        fontSize: 13,
        textColor: "#0f172a",

        header: {
          marginBottom: 8
        },

        clearButton: {
          background: "rgba(0,0,0,0.06)",
          radius: 6,
          size: 28
        },

        crumbs: {
          gap: 6
        },

        crumb: {
          background: "rgba(14,165,233,0.12)",
          hover: "rgba(14,165,233,0.22)",
          padding: "4px 8px",
          radius: 999,
          maxWidth: 220
        },

        separator: {
          opacity: 0.6
        }
      },

      body: {
        background: "#f8fafc",
        textColor: "#0f172a",
        fontFamily: "system-ui, sans-serif"
      },

      toolbar: {
        spacing: 8,
        padding: "8px 10px",
        borderRadius: 8,
        top: 10,
        left: 10,
        background: "rgba(255, 255, 255, 0.9)",
        zIndex: 30
      },

      search: {
        width: 320,
        maxWidth: "56vw"
      },

      zoom: {
        gap: 4,
        marginLeft: 6
      },

      filterCard: {
        top: 64,
        left: 10,
        padding: 10,
        borderRadius: 8,
        fontSize: 13,
        background: "rgba(255, 255, 255, 0.9)",
        zIndex: 10,
        maxWidth: 280,
        maxHeight: "55vh"
      },

      autocomplete: {
        itemPadding: "6px 10px",
        fontSize: 13,
        background: "#ffffff",
        borderRadius: 8,
        shadow: "0 10px 24px rgba(0, 0, 0, 0.15)",
        zIndex: 20,
        offsetY: 6
      },

      filters: {
        titleColor: "#0284c7",
        accentColor: "#0ea5e9"
      }
    },

    filters: {
      enabled: true,
      types: true,
      groups: true
    },

    nodeTypes: {
      highlight: {
        root: "#facc15",
        neighbor: "#60a5fa",
        preview: "#7dd3fc",
        clique: "#7dd3fc"
      },

      default: {
        color: "#334155",
        icon: "assets/PsychologyHistoryGraph/icon.png"
      },

      person: {
        color: "#38bdf8",
        icon: "assets/PsychologyHistoryGraph/icon.png",
        category: "temporal",
        timeline: {
          startField: "anno_nascita",
          endField: "anno_morte"
        },
        group: "roles[].group"
      },

      place: {
        color: "#22c55e",
        icon: "assets/PsychologyHistoryGraph/icon.png",
        category: "spatial",
        alwaysVisible: true
      }
    }
  };

  // ---------------------------------------------------------------------------
  // ALIAS LEGACY
  // ---------------------------------------------------------------------------
  // Prima del rename "macroArea" -> "group" il config usava altre chiavi.
  // Le traduciamo nelle chiavi correnti, senza sovrascrivere quelle nuove,
  // così i config già pubblicati (es. results/jsons/graph.config.json)
  // continuano a funzionare.
  // ---------------------------------------------------------------------------
  function applyLegacyConfigAliases(raw: any): any {
    if (!raw || typeof raw !== "object") return {};

    const cfg = JSON.parse(JSON.stringify(raw));

    for (const typeCfg of Object.values(cfg.nodeTypes ?? {}) as any[]) {
      if (typeCfg && typeof typeCfg === "object" && typeCfg.group === undefined && typeCfg.macroAreaField !== undefined) {
        typeCfg.group = typeCfg.macroAreaField;
      }
    }

    if (cfg.filters && cfg.filters.groups === undefined && cfg.filters.macroAreas !== undefined) {
      cfg.filters.groups = cfg.filters.macroAreas;
    }

    const solverFeatures = cfg.solver?.features;
    if (solverFeatures && solverFeatures.groupFilter === undefined && solverFeatures.macroFilter !== undefined) {
      solverFeatures.groupFilter = solverFeatures.macroFilter;
    }

    return cfg;
  }

  const RAW_CONFIG: any = applyLegacyConfigAliases(graphConfig);

  function hasOwnPath(obj: any, path: string): boolean {
    const parts = path.split(".");
    let cur = obj;

    for (const p of parts) {
      if (!cur || typeof cur !== "object" || !Object.prototype.hasOwnProperty.call(cur, p)) {
        return false;
      }
      cur = cur[p];
    }

    return true;
  }

  const GRAPH_CONFIG: any = deepMergeConfig(
    DEFAULT_GRAPH_CONFIG,
    RAW_CONFIG
  );

  GRAPH_CONFIG.nodeTypes = normalizeNodeTypeConfigStyles(GRAPH_CONFIG.nodeTypes);

  const UI = GRAPH_CONFIG.ui;
  const solverEnabled = GRAPH_CONFIG.solver?.enabled !== false;
  const showClingoTimingDiagnostics = GRAPH_CONFIG.solver?.diagnostics?.aspTiming === true;
  const showClingoSolverStatsDiagnostics = GRAPH_CONFIG.solver?.diagnostics?.aspStats === true;
  const labelVisibilityToggleEnabled = GRAPH_CONFIG.features?.labelVisibilityToggle === true;
  const aggregateParallelEdgesForDisplay = GRAPH_CONFIG.features?.aggregateParallelEdgesForDisplay === true;
  const edgeTypeColors = GRAPH_CONFIG.colors?.edgeTypes;
  const edgeTypeColorsConfigured = edgeTypeColors !== null && typeof edgeTypeColors === "object" &&
    !Array.isArray(edgeTypeColors) && Object.keys(edgeTypeColors).length > 0;
  // Adatta la rete al canvas per impostazione predefinita; le configurazioni
  // possono disabilitare esplicitamente il comportamento con `false`.
  const fitGraphToViewEnabled = GRAPH_CONFIG.features?.fitGraphToView !== false;
  const graphViewFitPadding = 32;
  // zoomToFit targets the full canvas, including the area covered by the toolbar.
  // Move the camera back slightly so topmost nodes and labels remain visible below it.
  const graphViewFitScale = 1.1;
  const integrityConfigured = Object.prototype.hasOwnProperty.call(RAW_CONFIG, "graphIntegrity");
  const motifTemplates: GraphMotifTemplate[] = Array.isArray(GRAPH_CONFIG.graphAnalysis?.motifs)
    ? GRAPH_CONFIG.graphAnalysis.motifs
    : [];
  const motifCountPartitionSettings = resolveTypedMotifCountPartitionSettings(
    GRAPH_CONFIG.graphAnalysis?.motifCount
  );
  const motifTemporalMetricUnits = [...new Set(motifTemplates.flatMap((template) => {
    const temporal = template.temporal;
    return temporal && "maximumSpan" in temporal && temporal.maximumSpan
      ? [temporal.maximumSpan.unit]
      : [];
  }))];
  const numericTimeUnit: GraphTemporalMetricUnit | undefined =
    GRAPH_CONFIG.graphMapping?.edge?.validity?.numericUnit;
  const signedTriadConfig = GRAPH_CONFIG.graphAnalysis?.signedTriads;
  const contextualCliqueConfig = GRAPH_CONFIG.graphAnalysis?.contextualClique as GraphContextualCliqueConfig | undefined;
  const provenanceScenarioConfig = GRAPH_CONFIG.graphAnalysis?.provenanceScenarios;
  const provenanceScenarios = (provenanceScenarioConfig?.unattributedEdges === "include" ||
    provenanceScenarioConfig?.unattributedEdges === "exclude") && Array.isArray(provenanceScenarioConfig?.scenarios)
    ? provenanceScenarioConfig.scenarios.filter((scenario: any) =>
      scenario && typeof scenario.id === "string" && scenario.id.trim() &&
      Array.isArray(scenario.sources) && normalizeProvenanceReferences(scenario.sources)?.length
    )
    : [];
  const motifCounterfactualEdgeAdditions = GRAPH_CONFIG.graphAnalysis?.counterfactuals?.edgeAdditions;
  const motifCounterfactualsConfigured = motifCounterfactualEdgeAdditions !== undefined;
  const configuredCommunityConstraints = GRAPH_CONFIG.graphAnalysis?.communities;
  const communityConfigurationError = validateCommunityConfiguration(
    configuredCommunityConstraints,
    new Set(Object.keys(GRAPH_CONFIG.graphMapping?.node?.attributes ?? {}))
  );
  const communityConstraintPairCount =
    (Array.isArray(configuredCommunityConstraints?.mustLink) ? configuredCommunityConstraints.mustLink.length : 0) +
    (Array.isArray(configuredCommunityConstraints?.cannotLink) ? configuredCommunityConstraints.cannotLink.length : 0);
  const communityAttributeBoundCount = Array.isArray(configuredCommunityConstraints?.attributeBounds)
    ? configuredCommunityConstraints.attributeBounds.length
    : 0;
  const repairSuggestionsConfigured =
    (Array.isArray(GRAPH_CONFIG.graphIntegrity?.repairSuggestions?.removableEdges) &&
      GRAPH_CONFIG.graphIntegrity.repairSuggestions.removableEdges.length > 0) ||
    (Array.isArray(GRAPH_CONFIG.graphIntegrity?.repairSuggestions?.nodeAttributeValues) &&
      GRAPH_CONFIG.graphIntegrity.repairSuggestions.nodeAttributeValues.length > 0) ||
    (Array.isArray(GRAPH_CONFIG.graphIntegrity?.repairSuggestions?.edgeAttributeValues) &&
      GRAPH_CONFIG.graphIntegrity.repairSuggestions.edgeAttributeValues.length > 0) ||
    (Array.isArray(GRAPH_CONFIG.graphIntegrity?.repairSuggestions?.nodeAttributeReplacements) &&
      GRAPH_CONFIG.graphIntegrity.repairSuggestions.nodeAttributeReplacements.length > 0) ||
    (Array.isArray(GRAPH_CONFIG.graphIntegrity?.repairSuggestions?.edgeAttributeReplacements) &&
      GRAPH_CONFIG.graphIntegrity.repairSuggestions.edgeAttributeReplacements.length > 0) ||
    (Array.isArray(GRAPH_CONFIG.graphIntegrity?.repairSuggestions?.nodeTypeReplacements) &&
      GRAPH_CONFIG.graphIntegrity.repairSuggestions.nodeTypeReplacements.length > 0) ||
    (Array.isArray(GRAPH_CONFIG.graphIntegrity?.repairSuggestions?.edgeTypeReplacements) &&
      GRAPH_CONFIG.graphIntegrity.repairSuggestions.edgeTypeReplacements.length > 0) ||
    (Array.isArray(GRAPH_CONFIG.graphIntegrity?.repairSuggestions?.edgeIntervalReplacements) &&
      GRAPH_CONFIG.graphIntegrity.repairSuggestions.edgeIntervalReplacements.length > 0);

  let container: HTMLDivElement;
  let graph3D: any;
  let reducedMotionPreference = false;
  let motionPreferenceQuery: MediaQueryList | null = null;
  let motionPreferenceChangeHandler: (() => void) | null = null;
  let graphLayoutRunning = false;
  let fitOnEngineStop = false;
  let graphResizeObserver: ResizeObserver | null = null;
  let toolbarElement: HTMLDivElement;
  let toolbarResizeObserver: ResizeObserver | null = null;
  let toolbarHeight = 0;
  let clingoWorker: Worker | null = null;
  let clingoWorkerLease: ClingoWorkerLease | null = null;
  let clingoWorkerStatus: "initializing" | "ready" | "error" = "initializing";
  let workerWasmMemoryStats: WorkerWasmMemoryStats | null = null;
  let clingoInvocationTiming: ClingoInvocationTiming | null = null;
  let clingoInvocationStats: ClingoInvocationStats | null = null;

  // ---------------- STATE ----------------
  let data: any = null;
  $: graphEdgeTypeLegend = getGraphDisplayEdgeTypeLegend(data?.links ?? [], edgeTypeColors);
  const GRAPH_EDGE_TYPE_LEGEND_PAGE_SIZE = 16;
  let previousGraphEdgeTypeLegend: typeof graphEdgeTypeLegend | null = null;
  let visibleGraphEdgeTypeLimit = GRAPH_EDGE_TYPE_LEGEND_PAGE_SIZE;
  $: if (graphEdgeTypeLegend !== previousGraphEdgeTypeLegend) {
    previousGraphEdgeTypeLegend = graphEdgeTypeLegend;
    visibleGraphEdgeTypeLimit = GRAPH_EDGE_TYPE_LEGEND_PAGE_SIZE;
  }
  $: visibleGraphEdgeTypeEntries = graphEdgeTypeLegend.slice(0, visibleGraphEdgeTypeLimit);
  let graphDisplayLinkCount = 0;
  let originalData: any = null;
  let graphDiagnostics: GraphDiagnostic[] = [];
  let graphDirection: "undirected" | "directed" = "undirected";
  let graphSchemaVersion = 1;
  let graphCapabilities: GraphCapabilities = {};
  let timelineControlEnabled = false;
  $: timelineControlEnabled = isTimelineControlAvailable(
    GRAPH_CONFIG.features?.timeline === true,
    Boolean(originalData?.nodes?.some((node: any) => hasTimelineConfig(node))),
    graphCapabilities.edgeIntervals?.available === true
  );
  $: cliqueDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("clique") ?? []
  );
  $: kPlexDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("kPlex") ?? []
  );
  $: kCoreDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("kCore", graphDirection) ?? []
  );
  $: componentsDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("connectedComponents") ?? []
  );
  $: strongComponentsDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("strongComponents") ?? []
  );
  $: weakComponentsDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("weakComponents") ?? []
  );
  $: dominatingSetDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("dominatingSet") ?? []
  );
  $: nodeSeparatorDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("minimumNodeSeparator") ?? []
  );
  $: costNodeSeparatorScopedCapabilities = {
    ...graphCapabilities,
    nodeRemovalCosts: checkNodeRemovalCostCapabilityForCandidates(
      graphCapabilities.nodeRemovalCosts,
      data?.nodes ?? [],
      selectedStructuralGroup,
      [selectedPathStartId, selectedPathGoalId],
      extractGroups
    )
  };
  $: costNodeSeparatorDataReadiness = checkGraphTaskRequirements(
    costNodeSeparatorScopedCapabilities,
    getGraphTaskRequirements("minimumCostNodeSeparator") ?? []
  );
  $: edgeSeparatorDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("minimumEdgeSeparator") ?? []
  );
  $: costEdgeSeparatorDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskRequirements("minimumCostEdgeSeparator") ?? []
  );
  $: communitiesDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskContract("communities", {
      useEdgeWeights: configuredCommunityConstraints?.useEdgeWeights === true
    })?.requiredCapabilities.slice() ?? []
  );
  $: integrityDataReadiness = (() => {
    const reasons: string[] = [];
    const constraints = GRAPH_CONFIG.graphIntegrity;
    if (graphSchemaVersion !== 2) {
      reasons.push("La verifica richiede schemaVersion: 2 e mapping semantici espliciti.");
    }
    if (!integrityConfigured) {
      reasons.push("Dichiara regole graphIntegrity nella configurazione.");
    } else if (!constraints || typeof constraints !== "object" || Array.isArray(constraints)) {
      reasons.push("graphIntegrity deve essere un oggetto di configurazione valido.");
    } else {
      const ruleKeys = [
        "requireNodeTypes", "requireEdgeTypes", "allowedNodeTypes", "allowedEdgeTypes",
        "requiredEdgeIntervals", "edgeTypeDomains", "requiredNodeAttributes",
        "requiredEdgeAttributes", "uniqueNodeAttributes", "uniqueEdgeAttributes",
        "nodeAttributeDomains", "edgeAttributeDomains", "cardinalities"
      ];
      const hasRules = ruleKeys.some((key) => {
        const value = (constraints as Record<string, unknown>)[key];
        return typeof value === "boolean" ? value : Array.isArray(value) && value.length > 0;
      });
      if (!hasRules) reasons.push("Aggiungi almeno una regola a graphIntegrity.");
      try {
        validateGraphIntegrityAttributeMappings(
          constraints,
          new Set(Object.keys(GRAPH_CONFIG.graphMapping?.node?.attributes ?? {})),
          new Set(Object.keys(GRAPH_CONFIG.graphMapping?.edge?.attributes ?? {}))
        );
      } catch (error) {
        reasons.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!originalData?.nodes?.length) reasons.push("Il grafo importato deve contenere almeno un nodo.");
    reasons.push(...graphDiagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message));
    const uniqueReasons = [...new Set(reasons)];
    return { available: uniqueReasons.length === 0, reasons: uniqueReasons };
  })();
  $: typedPathStaticRequirements = getGraphTaskContract("typedPath", {
    direction: graphDirection,
    temporalSemantics: "static"
  })?.requiredCapabilities.slice() ?? [];
  $: typedPathTemporalRequirements = getGraphTaskContract("typedPath", {
    direction: graphDirection,
    temporalSemantics: "coValid"
  })?.requiredCapabilities.filter((capability) => !typedPathStaticRequirements.includes(capability)) ?? [];
  $: typedPathDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    typedPathStaticRequirements
  );
  $: typedPathTemporalDataReadiness = checkGraphTaskRequirements(graphCapabilities, typedPathTemporalRequirements);
  $: typedMotifDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskContract("typedMotif", { direction: graphDirection })?.requiredCapabilities.slice() ?? []
  );
  $: temporalMotifDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskContract("temporalMotif", { direction: graphDirection })?.requiredCapabilities.slice() ?? []
  );
  $: contextualCliqueDataReadiness = checkGraphTaskRequirements(
    graphCapabilities,
    getGraphTaskContract("contextualClique", { direction: graphDirection })?.requiredCapabilities.slice() ?? []
  );
  $: contextualCliqueTypeReadiness = (() => {
    if (!contextualCliqueConfig) return { missing: [] as string[], reasons: [] as string[] };
    let validatedConfig: ReturnType<typeof validateContextualCliqueConfig>;
    try {
      validatedConfig = validateContextualCliqueConfig(contextualCliqueConfig);
    } catch (error) {
      return {
        missing: ["invalid-config"],
        reasons: [error instanceof Error ? error.message : "La configurazione del gruppo contestuale non è valida."]
      };
    }
    const nodeTypes = new Set((data?.nodes ?? []).map((node: any) => node.analysis?.type).filter((type: unknown): type is string => typeof type === "string"));
    const edgeTypes = new Set((data?.links ?? []).map((link: any) => link.analysis?.type).filter((type: unknown): type is string => typeof type === "string"));
    const missingFocus = validatedConfig.focusNodeTypes.filter((type) => !nodeTypes.has(type));
    const missingContext = validatedConfig.contextNodeTypes.filter((type) => !nodeTypes.has(type));
    const missingEdges = validatedConfig.edgeTypes.filter((type) => !edgeTypes.has(type));
    const reasons = [
      ...(missingFocus.length ? [`Tipi di nodo focali assenti dalla proiezione: ${missingFocus.join(", ")}.`] : []),
      ...(missingContext.length ? [`Tipi di nodo di contesto assenti dalla proiezione: ${missingContext.join(", ")}.`] : []),
      ...(missingEdges.length ? [`Tipi di arco assenti dalla proiezione: ${missingEdges.join(", ")}.`] : [])
    ];
    return { missing: [...missingFocus, ...missingContext, ...missingEdges], reasons };
  })();
  $: contextualCliqueRequirementReasons = [
    ...(graphDirection !== "undirected" ? ["Questa query richiede una direzione del grafo esplicitamente non orientata."] : []),
    ...contextualCliqueDataReadiness.reasons,
    ...contextualCliqueTypeReadiness.reasons,
    ...(graphDiagnostics.find((diagnostic) => diagnostic.severity === "error")?.message
      ? [graphDiagnostics.find((diagnostic) => diagnostic.severity === "error")!.message]
      : [])
  ];
  $: contextualCliqueAvailable = Boolean(contextualCliqueConfig) &&
    graphDirection === "undirected" && contextualCliqueDataReadiness.available &&
    contextualCliqueTypeReadiness.missing.length === 0 &&
    !graphDiagnostics.some((diagnostic) => diagnostic.severity === "error");
  $: structuralTaskReadiness = (() => {
    const contract = getGraphTaskContract(structuralTask, {
      direction: graphDirection,
      temporalSemantics: structuralPathTemporalSemantics,
      useEdgeWeights: configuredCommunityConstraints?.useEdgeWeights === true
    });
    if (!contract) return { available: true, reasons: [] as string[] };

    const capabilities = structuralTask === "minimumCostNodeSeparator"
      ? costNodeSeparatorScopedCapabilities
      : graphCapabilities;
    const readiness = checkGraphTaskRequirements(capabilities, contract.requiredCapabilities.slice());
    const blockingDiagnostics = graphDiagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message);
    const configurationErrors = structuralTask === "communities" && communityConfigurationError
      ? [communityConfigurationError]
      : [];
    const reasons = [...readiness.reasons, ...configurationErrors, ...blockingDiagnostics];
    return { available: readiness.available && reasons.length === 0, reasons };
  })();
  $: motifAnalysisButtonLabel = [
    ...(motifTemplates.length > 0 ? ["Motivi tipizzati"] : []),
    ...(signedTriadConfig ? ["triadi firmate"] : []),
    ...(contextualCliqueConfig ? ["gruppi contestuali"] : [])
  ].join(", ") + " ASP";
  $: signedTriadPreparation = prepareSignedTriads(
    signedTriadConfig,
    graphSchemaVersion,
    graphDirection,
    data?.nodes ?? [],
    data?.links ?? [],
    new Set(Object.keys(GRAPH_CONFIG.graphMapping?.edge?.attributes ?? {})),
    extractGroups,
    selectedSignedTriadGroup,
    typeof GRAPH_CONFIG.graphMapping?.edge?.typeField === "string" && GRAPH_CONFIG.graphMapping.edge.typeField.trim() !== ""
  ) as SignedTriadPreparation;
  $: capabilityRows = GRAPH_CAPABILITY_IDS.map((key) => [key, GRAPH_CAPABILITY_LABELS[key]] as const);
  $: analysisTaskRows = (() => {
    const rows: Array<{ label: string; available: boolean; reasons: string[] }> = [
      { label: "Clique massima", available: cliqueDataReadiness.available, reasons: cliqueDataReadiness.reasons },
      { label: "k-plex massimo", available: kPlexDataReadiness.available, reasons: kPlexDataReadiness.reasons },
      { label: "k-plex massimali", available: kPlexDataReadiness.available, reasons: kPlexDataReadiness.reasons },
      { label: "k-core", available: kCoreDataReadiness.available, reasons: kCoreDataReadiness.reasons },
      { label: "Insieme dominante", available: dominatingSetDataReadiness.available, reasons: dominatingSetDataReadiness.reasons },
      { label: "Separatore di nodi", available: nodeSeparatorDataReadiness.available, reasons: nodeSeparatorDataReadiness.reasons },
      { label: "Separatore di nodi a costo minimo", available: costNodeSeparatorDataReadiness.available, reasons: costNodeSeparatorDataReadiness.reasons },
      { label: "Taglio di archi", available: edgeSeparatorDataReadiness.available, reasons: edgeSeparatorDataReadiness.reasons },
      { label: "Taglio di archi a costo minimo", available: costEdgeSeparatorDataReadiness.available, reasons: costEdgeSeparatorDataReadiness.reasons },
      { label: "Comunità per modularità", available: communitiesDataReadiness.available, reasons: communitiesDataReadiness.reasons },
      { label: "Controllo di integrità", available: integrityDataReadiness.available, reasons: integrityDataReadiness.reasons }
    ];

    if (graphDirection === "directed") {
      rows.push(
        { label: "Componenti debolmente connesse", available: weakComponentsDataReadiness.available, reasons: weakComponentsDataReadiness.reasons },
        { label: "Componenti fortemente connesse", available: strongComponentsDataReadiness.available, reasons: strongComponentsDataReadiness.reasons }
      );
    } else {
      rows.push({ label: "Componenti connesse", available: componentsDataReadiness.available, reasons: componentsDataReadiness.reasons });
    }

    if (motifTemplates.length > 0) rows.push({ label: "Motivi tipizzati", available: typedMotifDataReadiness.available, reasons: typedMotifDataReadiness.reasons });
    if (motifTemplates.some((template) => template.temporal)) rows.push({ label: "Motivi temporali", available: temporalMotifDataReadiness.available, reasons: temporalMotifDataReadiness.reasons });
    if (signedTriadConfig) rows.push({ label: "Triadi firmate", available: signedTriadPreparation.available, reasons: signedTriadPreparation.reasons });
    if (contextualCliqueConfig) rows.push({ label: "Gruppo contestuale", available: contextualCliqueAvailable, reasons: contextualCliqueRequirementReasons });
    return rows;
  })();
  $: structuralMenuReadiness = summarizeAnalysisReadiness(analysisTaskRows.filter((row) => [
    "k-plex massimo", "k-plex massimali", "k-core", "Insieme dominante",
    "Separatore di nodi", "Separatore di nodi a costo minimo", "Taglio di archi",
    "Taglio di archi a costo minimo", "Comunità per modularità", "Componenti connesse",
    "Componenti debolmente connesse", "Componenti fortemente connesse"
  ].includes(row.label)));
  $: motifMenuReadiness = summarizeAnalysisReadiness(analysisTaskRows.filter((row) => [
    "Motivi tipizzati", "Motivi temporali", "Triadi firmate", "Gruppo contestuale"
  ].includes(row.label)));
  $: integrityRepairDataReadiness = (() => {
    const reasons = [...integrityDataReadiness.reasons];
    if (!repairSuggestionsConfigured) {
      reasons.push("Aggiungi almeno un'azione candidata in graphIntegrity.repairSuggestions.");
    } else {
      const suggestions = GRAPH_CONFIG.graphIntegrity?.repairSuggestions;
      const mapping = GRAPH_CONFIG.graphMapping;
      if (suggestions?.nodeTypeReplacements?.length && !mapping?.node?.typeField) {
        reasons.push("Le sostituzioni di tipo nodo richiedono graphMapping.node.typeField.");
      }
      if (suggestions?.edgeTypeReplacements?.length && !mapping?.edge?.typeField) {
        reasons.push("Le sostituzioni di tipo arco richiedono graphMapping.edge.typeField.");
      }
      if (suggestions?.edgeIntervalReplacements?.length &&
        (!mapping?.edge?.validity?.fromField || !mapping?.edge?.validity?.toField)) {
        reasons.push("Le sostituzioni d'intervallo richiedono i campi di validità degli archi.");
      }
      const mappedNodeAttributes = new Set(Object.keys(mapping?.node?.attributes ?? {}));
      const mappedEdgeAttributes = new Set(Object.keys(mapping?.edge?.attributes ?? {}));
      const nodeAttributeCandidates = [
        ...(suggestions?.nodeAttributeValues ?? []),
        ...(suggestions?.nodeAttributeReplacements ?? [])
      ];
      const edgeAttributeCandidates = [
        ...(suggestions?.edgeAttributeValues ?? []),
        ...(suggestions?.edgeAttributeReplacements ?? [])
      ];
      const missingNodeAttributes = [...new Set(nodeAttributeCandidates
        .map((candidate) => candidate.attribute)
        .filter((attribute) => typeof attribute === "string" && !mappedNodeAttributes.has(attribute)))];
      const missingEdgeAttributes = [...new Set(edgeAttributeCandidates
        .map((candidate) => candidate.attribute)
        .filter((attribute) => typeof attribute === "string" && !mappedEdgeAttributes.has(attribute)))];
      if (missingNodeAttributes.length) reasons.push(`Mappa gli attributi dei nodi usati dalle riparazioni: ${missingNodeAttributes.join(", " )}.`);
      if (missingEdgeAttributes.length) reasons.push(`Mappa gli attributi degli archi usati dalle riparazioni: ${missingEdgeAttributes.join(", " )}.`);
    }
    const uniqueReasons = [...new Set(reasons)];
    return { available: uniqueReasons.length === 0, reasons: uniqueReasons };
  })();
  let query = "";
  let currentStart = GRAPH_CONFIG.timeline.start;
  let currentEnd = GRAPH_CONFIG.timeline.end;
  let timelineTimeout: any = null;

  let rootSelectedId: string | null = null;
  let selectedId: string | null = null;
  let selectedNode: any = null;
  let selectedDetails: any = null;

  let neighborMap: Map<string, Set<string>> = new Map();
  let highlightedNeighbors = new Set<string>();
  let cliqueNodes = new Set<string>();
  let highlightedEdgeIds = new Set<string>();
  let focusedSignedTriadEdgeIds: Set<string> | null = null;
  let focusedSignedTriadKey = "";
  let neighborhoodFocusNodeIds: Set<string> | null = null;
  let neighborhoodFocusInfo: {
    rootNodeId: string;
    maxHops: number;
    direction: NeighborhoodDirection;
    nodeCount: number;
    recordCount: number;
    renderedLinkCount: number;
  } | null = null;

  function getCliqueSignature(nodeIds: string[]): string {
    return [...nodeIds].sort().join("\u0000");
  }

  function getNodeSetSignature(nodeIds: string[]): string {
    return [...nodeIds].sort().join("\u0000");
  }

  function getDominatingSetCoverageOverlay(nodeIds: string[], targetNodeId?: string) {
    const allCoverage = structuralDominatingSetSupportBySetKey[getNodeSetSignature(nodeIds)] ?? [];
    const coverage = targetNodeId
      ? allCoverage.filter((item) => item.targetNodeId === targetNodeId)
      : allCoverage;
    const labels = Object.fromEntries((data?.nodes ?? []).map((node: any) => [
      String(node.id),
      String(node.label ?? node.name ?? node.id)
    ]));
    return buildGraph2DDominatingSetCoverageOverlay(nodeIds, coverage, labels);
  }

  // ---------------- EASTER EGG STATE ----------------
  let easterEggMode = false;

  // ---------------- SOLVER STATE ----------------
  let showSolverPanel = false;
  let showStructuralPanel = false;
  let showIntegrityPanel = false;
  let showMotifPanel = false;
  let showProvenanceScenarioAnalysisPanel = false;
  let lastAnalysisPanel: "clique" | "structural" | "integrity" | "motif" | "provenance" | null = null;
  let showGraph2DExportPanel = false;
  let graph2DNodeAnnotations: Record<string, string> = {};
  let graph2DEdgeAnnotations: Record<string, Graph2DEdgeAnnotation> = {};
  let graph2DHypotheticalLinks: Graph2DLinkInput[] = [];
  let graph2DOverlayResultLabel = "";
  let graph2DOverlayCompletionLabel = "";
  let lastGraph2DAnalysisKind = "";
  let showProjectionControls = false;
  $: provenanceCliqueComparisonBlocker = provenanceScenarios.length < 2
    ? "Dichiara almeno due scenari per confrontare le clique massime."
    : graphDirection === "directed"
      ? "Il confronto delle clique richiede un grafo non orientato."
      : graphDiagnostics.find((diagnostic) => diagnostic.severity === "error")?.message ??
        (!originalData || !Array.isArray(originalData.nodes) || originalData.nodes.length === 0
          ? "Il grafo di origine non contiene nodi candidati."
          : clingoWorkerStatus !== "ready"
            ? clingoWorkerStatus === "error" ? "Motore di analisi non disponibile." : "Motore di analisi in avvio."
            : "");
  let analysisMenuElement: HTMLDetailsElement;
  let viewMenuElement: HTMLDetailsElement;
  $: activeProjectionLabels = [
    ...(selectedTypes.size ? [`${selectedTypes.size} tipi`] : []),
    ...(selectedGroupsFilter.size ? [`${selectedGroupsFilter.size} gruppi`] : []),
    ...(minimumEdgeConfidence !== getDefaultEdgeConfidenceThreshold() ? ["confidenza"] : []),
    ...(selectedProvenanceScenarioId ? ["scenario"] : []),
    ...(timelineControlEnabled && (currentStart !== GRAPH_CONFIG.timeline.start || currentEnd !== GRAPH_CONFIG.timeline.end) ? ["periodo"] : [])
  ];
  $: analysisResultsAvailable = Boolean(
    lastAnalysisPanel || solverStats.completionLabel || solverStats.timeMs !== undefined || solverError || maximumCliques.length || allCliques.length ||
    structuralStats || structuralOutcomeMessage || structuralError ||
    integrityHasRun || integrityError || integrityRepairError || integrityRepairProposal ||
    motifHasRun || motifError || motifCountHasRun || motifCountError || motifNearMatchHasRun || motifNearMatchError ||
    motifCounterfactualHasRun || motifCounterfactualError || motifScenarioComparison || motifScenarioComparisonError ||
    signedTriadHasRun || signedTriadError || signedTriadScenarioComparison || signedTriadScenarioComparisonError ||
    contextualCliqueHasRun || contextualCliqueError || provenanceScenarioComparison || provenanceScenarioAnalysisError ||
    provenanceKCoreScenarioComparison || provenanceKCoreScenarioComparisonError ||
    provenanceKPlexScenarioComparison || provenanceKPlexScenarioComparisonError ||
    provenanceComponentScenarioComparison || provenanceComponentScenarioComparisonError ||
    provenanceDominatingSetScenarioComparison || provenanceDominatingSetScenarioComparisonError
  );
  $: graph2DScopeLabel = activeProjectionLabels.length
    ? `Proiezione corrente · ${activeProjectionLabels.join(", ")}`
    : "Proiezione completa del dataset";
  let solverRunning = false;
  $: graph2DActiveAnalysisError = getGraph2DActiveAnalysisError(
    showSolverPanel ? "clique"
      : showStructuralPanel ? "structural"
        : showIntegrityPanel ? "integrity"
          : showMotifPanel ? "motif"
            : showProvenanceScenarioAnalysisPanel ? "provenance" : null,
    lastGraph2DAnalysisKind,
    {
      clique: solverError,
      structural: structuralError,
      integrity: integrityError,
      motif: motifError,
      motifCount: motifCountError || (lastGraph2DAnalysisKind === "motifCount" ? motifCountNotice : ""),
      motifCounterfactual: motifCounterfactualError,
      motifNearMatch: motifNearMatchError,
      motifScenarioComparison: motifScenarioComparisonError,
      signedTriads: signedTriadError,
      signedTriadScenarioComparison: signedTriadScenarioComparisonError,
      contextualClique: contextualCliqueError,
      provenanceClique: provenanceScenarioAnalysisError,
      provenanceKCore: provenanceKCoreScenarioComparisonError,
      provenanceKPlex: provenanceKPlexScenarioComparisonError,
      provenanceComponent: provenanceComponentScenarioComparisonError,
      provenanceDominatingSet: provenanceDominatingSetScenarioComparisonError
    }
  );
  $: graph2DIncompleteSummary = buildGraph2DIncompleteAnalysisSummary(
    graph2DActiveAnalysisError,
    graph2DOverlayCompletionLabel.startsWith("Infeasibilità provata ·")
  );
  $: graph2DAggregateSummary = (() => {
    if (showIntegrityPanel && lastGraph2DAnalysisKind === "integrity" && integrityHasRun) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Integrità del grafo",
        resultSummary: `${integrityResults.length} violazioni rilevate`,
        completionLabel: `Enumerazione completa · ${integrityResults.length} violazioni`,
        kind: "aggregate"
      });
    }
    if (showMotifPanel && lastGraph2DAnalysisKind === "motifCount" && motifCountHasRun && motifCount !== undefined) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: motifTemplates[Number(selectedMotifTemplateIndex)]?.label ?? "Motivo tipizzato",
        resultSummary: `${motifCount} istanze`,
        completionLabel: "Conteggio completo",
        kind: "aggregate"
      });
    }
    if (showMotifPanel && lastGraph2DAnalysisKind === "motifCounterfactual" && motifCounterfactualHasRun) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Completamento del motivo",
        resultSummary: motifCounterfactuals.length
          ? `${motifCounterfactuals.length} proposte minime`
          : "nessun completamento fra i candidati autorizzati",
        completionLabel: motifCounterfactuals.length ? "Ottimo di costo provato" : "Infeasibilità provata sui candidati",
        kind: motifCounterfactuals.length ? "collection" : "aggregate"
      });
    }
    if (showMotifPanel && lastGraph2DAnalysisKind === "motifNearMatch" && motifNearMatchHasRun) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Corrispondenza di motivo più vicina",
        resultSummary: `${motifNearMatches.length} proposte ottime`,
        completionLabel: "Ottimo lessicografico provato",
        kind: "collection"
      });
    }
    if (showMotifPanel && lastGraph2DAnalysisKind === "signedTriads" && signedTriadHasRun) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Triadi firmate",
        resultSummary: `${signedTriadResults.length} triadi classificate`,
        completionLabel: `Enumerazione completa · ${signedTriadResults.length} triadi`,
        kind: "collection"
      });
    }
    if (showMotifPanel && lastGraph2DAnalysisKind === "contextualClique" && contextualCliqueHasRun) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Gruppi contestuali",
        resultSummary: contextualCliqueResults.length
          ? `${contextualCliqueResults.length} gruppi ottimi`
          : "nessun gruppo ammissibile",
        completionLabel: buildGraph2DOptimizationCompletionLabel({
          optimizationProven: contextualCliqueHasRun,
          hasSolution: contextualCliqueResults.length > 0,
          enumerateAllOptima: contextualCliqueEnumerateAllOptima,
          allOptimaEnumerationComplete: contextualCliqueHasRun
        }),
        kind: contextualCliqueResults.length ? "collection" : "aggregate"
      });
    }
    if (showMotifPanel && lastGraph2DAnalysisKind === "typedMotif" && motifHasRun) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: motifTemplates[Number(selectedMotifTemplateIndex)]?.label ?? "Motivo tipizzato",
        resultSummary: `${motifMatches.length} istanze`,
        completionLabel: `Enumerazione completa · ${motifMatches.length} istanze`,
        kind: "collection"
      });
    }
    if (showMotifPanel && lastGraph2DAnalysisKind === "motifScenarioComparison" && motifScenarioComparison) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: `${motifScenarioComparison.templateLabel} · scenari`,
        resultSummary: `${motifScenarioComparison.memberships.length} istanze in almeno uno scenario`,
        completionLabel: `Confronto completo · ${motifScenarioComparison.scenarios.length} scenari`,
        kind: "aggregate"
      });
    }
    if (showMotifPanel && lastGraph2DAnalysisKind === "signedTriadScenarioComparison" && signedTriadScenarioComparison) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Triadi firmate · scenari",
        resultSummary: `${signedTriadScenarioComparison.memberships.length} triadi classificate in almeno uno scenario`,
        completionLabel: `Confronto completo · ${signedTriadScenarioComparison.scenarios.length} scenari`,
        kind: "aggregate"
      });
    }
    if (showProvenanceScenarioAnalysisPanel && lastGraph2DAnalysisKind === "provenanceClique" && provenanceScenarioComparison) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Clique massime · scenari",
        resultSummary: `${provenanceScenarioComparison.memberships.length} nodi con presenza valutata`,
        completionLabel: `Enumerazione completa · ${provenanceScenarioComparison.totalOptimalAnswerSetCount} ottimi in ${provenanceScenarioComparison.scenarioCount} scenari`,
        kind: "aggregate"
      });
    }
    if (showStructuralPanel && lastGraph2DAnalysisKind === "provenanceKCore" && provenanceKCoreScenarioComparison) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "k-core · scenari",
        resultSummary: `${provenanceKCoreScenarioComparison.memberships.length} nodi confrontati`,
        completionLabel: `Confronto completo · ${provenanceKCoreScenarioComparison.scenarioCount} scenari`,
        kind: "aggregate"
      });
    }
    if (showStructuralPanel && lastGraph2DAnalysisKind === "provenanceKPlex" && provenanceKPlexScenarioComparison) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "k-plex massimi · scenari",
        resultSummary: `${provenanceKPlexScenarioComparison.memberships.length} nodi confrontati`,
        completionLabel: `Enumerazione completa · ${provenanceKPlexScenarioComparison.totalOptimalAnswerSetCount} ottimi in ${provenanceKPlexScenarioComparison.scenarioCount} scenari`,
        kind: "aggregate"
      });
    }
    if (showStructuralPanel && lastGraph2DAnalysisKind === "provenanceComponent" && provenanceComponentScenarioComparison) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Componenti · scenari",
        resultSummary: `${provenanceComponentScenarioComparison.memberships.length} nodi confrontati`,
        completionLabel: `Confronto completo · ${provenanceComponentScenarioComparison.scenarioCount} scenari`,
        kind: "aggregate"
      });
    }
    if (showStructuralPanel && lastGraph2DAnalysisKind === "provenanceDominatingSet" && provenanceDominatingSetScenarioComparison) {
      return buildGraph2DAnalysisSummary({
        analysisLabel: "Coperture minime · scenari",
        resultSummary: `${provenanceDominatingSetScenarioComparison.memberships.length} nodi confrontati`,
        completionLabel: `Confronto completo · ${provenanceDominatingSetScenarioComparison.scenarioCount} scenari`,
        kind: "aggregate"
      });
    }
    return null;
  })();
  $: graph2DCliqueSummaryLabel = showSolverPanel && solverStats.completionLabel && !solverError && !solverRunning
    ? buildGraph2DCliqueResultLabel({
        mode: solverStats.cliqueMode,
        highlightedNodeCount: cliqueNodes.size,
        resultCount: solverStats.totalCliques,
        group: solverStats.selectedGroup
      })
    : null;
  $: graph2DPanelSummary = selectGraph2DPanelSummary({
    panel: showSolverPanel ? "clique"
      : showStructuralPanel ? "structural"
        : showIntegrityPanel ? "integrity"
          : showMotifPanel ? "motif"
            : showProvenanceScenarioAnalysisPanel ? "provenance" : null,
    incomplete: graph2DIncompleteSummary,
    overlay: graph2DOverlayResultLabel
      ? { resultLabel: graph2DOverlayResultLabel, completionLabel: graph2DOverlayCompletionLabel }
      : null,
    aggregate: graph2DAggregateSummary,
    clique: graph2DCliqueSummaryLabel
      ? { resultLabel: graph2DCliqueSummaryLabel, completionLabel: solverStats.completionLabel }
      : null,
    structural: structuralStats
      ? {
          resultLabel: buildGraph2DStructuralResultLabel({
            task: structuralStats.task,
            parameter: structuralStats.parameter,
            highlightedNodeCount: cliqueNodes.size,
            highlightedEdgeCount: highlightedEdgeIds.size,
            group: selectedStructuralGroup,
            targetGroup: selectedStructuralTargetGroup,
            minimumCutCost: structuralStats.minimumCutCost,
            minimumNodeRemovalCost: structuralStats.minimumNodeRemovalCost,
            hasKCoreProfile: Boolean(structuralKCoreNumbers),
            communityCount: structuralCommunityPartitions[Math.max(0, graph2DCommunityPartitionIndex)]?.communities.length ?? 0,
            communityPartitionIndex: graph2DCommunityPartitionIndex,
            communityIndex: graph2DCommunityIndex
          }) ?? "",
          completionLabel: structuralStats.completionLabel ?? ""
        }
      : null,
    hasHighlightedElements: cliqueNodes.size > 0 || highlightedEdgeIds.size > 0
  });
  $: graph2DResultLabel = graph2DPanelSummary.resultLabel;
  $: graph2DCompletionLabel = graph2DPanelSummary.completionLabel ?? "";
  let solverError = "";
  let provenanceScenarioAnalysisError = "";
  let provenanceScenarioAnalysisProgress = "";
  let provenanceScenarioComparison: ProvenanceScenarioCliqueComparison | null = null;
  let provenanceScenarioSelectedGroup = "";
  let provenanceScenarioConfidenceThreshold: number | null = null;
  let provenanceScenarioTimelineWindow = "";
  let provenanceScenarioViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  let provenanceKCoreScenarioComparison: ProvenanceScenarioKCoreComparison | null = null;
  let provenanceKCoreScenarioComparisonProgress = "";
  let provenanceKCoreScenarioComparisonError = "";
  let provenanceKCoreScenarioSelectedGroup = "";
  let provenanceKCoreScenarioConfidenceThreshold: number | null = null;
  let provenanceKCoreScenarioTimelineWindow = "";
  let provenanceKCoreScenarioViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  let provenanceKPlexScenarioComparison: ProvenanceScenarioKPlexComparison | null = null;
  let provenanceKPlexScenarioComparisonProgress = "";
  let provenanceKPlexScenarioComparisonError = "";
  let provenanceKPlexScenarioSelectedGroup = "";
  let provenanceKPlexScenarioConfidenceThreshold: number | null = null;
  let provenanceKPlexScenarioTimelineWindow = "";
  let provenanceKPlexScenarioViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  let provenanceComponentScenarioComparison: ProvenanceScenarioComponentComparison | null = null;
  let provenanceComponentScenarioComparisonProgress = "";
  let provenanceComponentScenarioComparisonError = "";
  let provenanceComponentScenarioSelectedGroup = "";
  let provenanceComponentScenarioTargetNodeId = "";
  let provenanceComponentScenarioConfidenceThreshold: number | null = null;
  let provenanceComponentScenarioTimelineWindow = "";
  let provenanceComponentScenarioViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  let provenanceDominatingSetScenarioComparison: ProvenanceScenarioDominatingSetComparison | null = null;
  let provenanceDominatingSetScenarioComparisonProgress = "";
  let provenanceDominatingSetScenarioComparisonError = "";
  let provenanceDominatingSetScenarioCandidateGroup = "";
  let provenanceDominatingSetScenarioTargetGroup = "";
  let provenanceDominatingSetScenarioConfidenceThreshold: number | null = null;
  let provenanceDominatingSetScenarioTimelineWindow = "";
  let provenanceDominatingSetScenarioViewFilters: { types: string[]; groups: string[] } = { types: [], groups: [] };
  let provenanceDominatingSetScenarioWhyNot: {
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
  let structuralError = "";
  let structuralOutcomeMessage = "";
  let structuralTask: StructuralTask = "kPlex";
  let graph2DCommunityPartitionIndex = -1;
  let graph2DCommunityIndex = -1;
  let structuralParameter = 2;
  let structuralKCoreMode: DirectedKCoreMode | "" = "";
  let structuralIncludeKCoreNumbers = false;
  let structuralKCoreNumbers: Record<string, number> | null = null;
  let structuralKCoreProfileTimeMs: number | undefined;
  let structuralEnumerateAllOptima = false;
  let structuralEnumerateAllMaximalKPlex = false;
  let selectedStructuralGroup = "";
  let selectedStructuralTargetGroup = "";
  let structuralResults: string[][] = [];
  let structuralKPlexCounterfactuals: KPlexCompletionProposal[] = [];
  let structuralKPlexCounterfactualWhyNot: KPlexCompletionWhyNot | null = null;
  let structuralKPlexCounterfactualWhyNotMessage = "";
  let structuralKPlexCounterfactualHasRun = false;
  let structuralKPlexCounterfactualError = "";
  let structuralKPlexCounterfactualTimeMs: number | undefined;
  let structuralKPlexCounterfactualExcludedCandidateCount = 0;
  let structuralKCoreCounterfactuals: KPlexCompletionProposal[] = [];
  let structuralKCoreCounterfactualWhyNot: KCoreCompletionWhyNot | null = null;
  let structuralKCoreCounterfactualWhyNotMessage = "";
  let structuralKCoreCounterfactualHasRun = false;
  let structuralKCoreCounterfactualError = "";
  let structuralKCoreCounterfactualTimeMs: number | undefined;
  let structuralKCoreCounterfactualExcludedCandidateCount = 0;
  let structuralKCoreMembershipCounterfactuals: KCoreMembershipCompletionProposal[] = [];
  let structuralKCoreMembershipCounterfactualWhyNot: KCoreMembershipCompletionWhyNot | null = null;
  let structuralKCoreMembershipCounterfactualWhyNotMessage = "";
  let structuralKCoreMembershipCounterfactualHasRun = false;
  let structuralKCoreMembershipCounterfactualError = "";
  let structuralKCoreMembershipCounterfactualTimeMs: number | undefined;
  let structuralKCoreMembershipCounterfactualExcludedCandidateCount = 0;
  let structuralKPlexMissingPairsBySetKey: Record<string, Array<[string, string]>> = {};
  let structuralKPlexMaximalityBySetKey: Record<string, MaximalKPlexWitnessExplanation> = {};
  let structuralKPlexMembershipDiagnosis: KPlexMaximumMembershipDiagnosis | null = null;
  let structuralKPlexMembershipDiagnosisTargetNodeId = "";
  let structuralKPlexMembershipDiagnosisRunning = false;
  let structuralKPlexMembershipDiagnosisError = "";
  let structuralKPlexMembershipDiagnosisTimeMs: number | undefined;
  let structuralKPlexMembershipCounterfactual: KPlexMaximumMembershipCounterfactualSearchOutcome | null = null;
  let structuralKPlexMembershipCounterfactualRunning = false;
  let structuralKPlexMembershipCounterfactualError = "";
  let structuralKPlexMembershipCounterfactualTimeMs: number | undefined;
  let structuralKPlexMembershipCounterfactualCandidateCount = 0;
  let structuralKPlexMembershipCounterfactualRequestId = 0;
  let structuralKCoreSupportBySetKey: Record<string, KCoreSupportingPair[]> = {};
  let structuralKCorePeelingBySetKey: Record<string, KCorePeelingCertificate[]> = {};
  let structuralExplainKCoreExclusions = false;
  let structuralExplainCommunityContributions = false;
  let structuralExplainPathMinimality = false;
  let structuralExplainTypedPathNoRoute = false;
  let structuralDominatingSetSupportBySetKey: Record<string, DominatingSetCoverageWitness[]> = {};
  let structuralDominatingSetUncoverableTargetNodeIds: string[] = [];
  let structuralSeparatorReachableBySetKey: Record<string, string[]> = {};
  let structuralPathEdgeTypeSequence: string[] = [];
  let structuralPathEdgeIdsByStep: string[][] = [];
  let structuralPathTemporalSemantics: "static" | TypedPathTemporalSemantics = "static";
  let structuralPathStrictTemporalOrder = false;
  let structuralPathCommonTimeValue: number | undefined;
  let structuralPathStartTimeValuesByStep: number[] = [];
  let structuralPathMinimality: MinimumHopPathMinimalityCertificate | undefined;
  let structuralPathNoRouteCertificate: BoundedPathNoRouteCertificate | undefined;
  let structuralTypedPathNoRouteCertificate: TypedPathNoRouteCertificate | TypedPathTemporalNoRouteCertificate | undefined;
  let structuralTypedPathCounterfactuals: TypedPathCounterfactualProposal[] = [];
  let structuralTypedPathCounterfactualWhyNot: TypedPathCounterfactualWhyNot | undefined;
  let structuralTypedPathCounterfactualWhyNotError = "";
  let structuralTypedPathCounterfactualHasRun = false;
  let structuralTypedPathCounterfactualError = "";
  let structuralTypedPathCounterfactualTimeMs: number | undefined;
  let structuralTypedPathCounterfactualExcludedCandidateCount = 0;
  let structuralCommunityPartitions: ModularityPartition[] = [];
  let structuralCommunityPairMembership: CommunityPairOptimumMembership | null = null;
  let structuralCommunityPairMembershipError = "";
  let structuralCommunityPairMembershipRunning = false;
  let structuralCommunityPairMembershipTimeMs: number | undefined;
  let structuralCommunityTopologyCounterfactual: CommunityTopologyCounterfactualResult | null = null;
  let structuralCommunityTopologyCounterfactualError = "";
  let structuralCommunityTopologyCounterfactualRunning = false;
  let structuralCommunityTopologyCounterfactualTimeMs: number | undefined;
  let communityPairMembershipContext: {
    baseFacts: string;
    graphFacts: string;
    options: ModularityCommunityOptions;
    reverseIndex: Record<number, string>;
    indexByNodeId: Map<string, number>;
    candidateNodeIds: Set<string>;
    globalScaledScore: number;
    communityEdgeRecords: Array<{
      identity: string;
      sourceNodeId: string;
      targetNodeId: string;
      sourceIndex: number;
      targetIndex: number;
      sourceId?: string;
      sourceIdGenerated: boolean;
      weight?: number | string;
    }>;
    candidateIndexes: number[];
    resolution: number;
  } | null = null;
  let structuralCommunityConstraintDiagnoses: CommunityConstraintDiagnosis[] = [];
  let structuralCommunityConstraintDiagnosisError = "";
  let structuralCommunityConstraintDiagnosesAllEnumerated = false;
  let structuralExplainCommunityInfeasibility = false;
  let structuralCommunityMinCount = Number.isInteger(configuredCommunityConstraints?.minCount)
    ? configuredCommunityConstraints.minCount
    : 0;
  let structuralCommunityMaxCount = Number.isInteger(configuredCommunityConstraints?.maxCount)
    ? configuredCommunityConstraints.maxCount
    : 0;
  let structuralEdgeSourceIdById: Record<string, string> = {};
  let structuralEdgeSourceIdentityById: Record<string, { sourceId?: string; generatedRecordKey?: string; legacyEndpointPair?: [string, string] }> = {};
  let structuralEdgeProvenanceById: Record<string, string> = {};
  let edgeProvenanceBySourceId: Record<string, string> = {};
  let edgeProvenanceReferencesBySourceId: Record<string, string[]> = {};
  $: structuralEdgeProvenanceById = buildEdgeProvenanceByIdentity(originalData?.links ?? []);
  $: structuralEdgeSourceIdentityById = buildEdgeSourceIdentityByIdentity(originalData?.links ?? []);
  $: edgeProvenanceBySourceId = buildEdgeProvenanceBySourceId(originalData?.links ?? []);
  $: edgeProvenanceReferencesBySourceId = buildEdgeProvenanceReferencesBySourceId(originalData?.links ?? []);
  let integrityError = "";
  let integrityResults: IntegrityViolation[] = [];
  let integrityHasRun = false;
  let integrityTimeMs: number | undefined;
  let integrityRepairRunning = false;
  let integrityRepairError = "";
  let integrityRepairProposal: IntegrityRepairProposal | null = null;
  let selectedMotifTemplateIndex = "0";
  let selectedMotifGroup = "";
  let selectedSignedTriadGroup = "";
  let contextualCliqueGroup = "";
  let contextualCliqueEnumerateAllOptima = false;
  let contextualCliqueResults: ContextualCliqueResult[] = [];
  let contextualCliqueHasRun = false;
  let contextualCliqueError = "";
  let contextualCliqueTimeMs: number | undefined;
  let signedTriadResults: SignedTriadResult[] = [];
  let signedTriadHasRun = false;
  let signedTriadError = "";
  let signedTriadTimeMs: number | undefined;
  let signedTriadScenarioComparison: SignedTriadScenarioComparison | null = null;
  let signedTriadScenarioComparisonError = "";
  let signedTriadScenarioComparisonProgress = "";
  let signedTriadScenarioComparisonTimeMs: number | undefined;
  let motifError = "";
  let motifMatches: TypedMotifMatch[] = [];
  let motifHasRun = false;
  let motifTimeMs: number | undefined;
  let motifScenarioComparison: ProvenanceMotifScenarioComparison | null = null;
  let motifScenarioComparisonError = "";
  let motifScenarioComparisonProgress = "";
  let motifScenarioComparisonTimeMs: number | undefined;
  let motifCount: string | undefined;
  let motifCountHasRun = false;
  let motifCountError = "";
  let motifCountTimeMs: number | undefined;
  let motifCountPartitionCount: number | undefined;
  let motifCountProgress: TypedMotifCountPartitionProgress | undefined;
  let motifCountNotice = "";
  let motifCountAbortController: AbortController | undefined;
  let motifNearMatches: TypedMotifNearMatch[] = [];
  let motifNearMatchHasRun = false;
  let motifNearMatchError = "";
  let motifNearMatchTimeMs: number | undefined;
  let motifCounterfactuals: TypedMotifCounterfactual[] = [];
  let motifCounterfactualHasRun = false;
  let motifCounterfactualError = "";
  let motifCounterfactualTimeMs: number | undefined;
  let motifCounterfactualExcludedCandidateCount = 0;
  let structuralStats: {
    task: StructuralTask;
    parameter: number;
    timeMs?: number;
    nodesCount?: number;
    linksCount?: number;
    targetCount?: number;
    targetGroup?: string;
    modularity?: number;
    modularityResolution?: string;
    modularityResolutionNumerator?: number;
    modularityResolutionDenominator?: number;
    communityCount?: number;
    edgeCount?: number;
    scaledTotalEdgeWeight?: number;
    displayTotalEdgeWeight?: string;
    edgeWeightScaleFactor?: number;
    weightedModularity?: boolean;
    minimumCutCost?: number;
    minimumNodeRemovalCost?: number;
    completionLabel?: string;
  } | null = null;

  let maximumCliques: string[][] = [];
  let maximumCliqueMembershipCliques: string[][] = [];
  let allCliques: string[][] = [];
  let cliqueSupportingEdgesByKey: Record<string, CliqueSupportingEdge[]> = {};
  let cliqueMembershipDiagnosis: CliqueMaximumMembershipDiagnosis | null = null;
  let cliqueMembershipDiagnosisTargetNodeId: string | null = null;
  let cliqueMembershipDiagnosisRunning = false;
  let cliqueMembershipDiagnosisError = "";

  let solverStats = {
    totalCliques: 0,
    maxSize: 0,
    histogram: new Map<number, number>(),
    timeMs: undefined as number | undefined,
    nodesCount: undefined as number | undefined,
    linksCount: undefined as number | undefined,
    periodLabel: undefined as string | undefined,
    cliqueMode: undefined as string | undefined,
    completionLabel: undefined as string | undefined,
    selectedGroup: ""
  };

  let minCliqueSize = 3;
  let topPerSize = 5;

  // ---------------- FILTERS ----------------
  const filtersEnabled =
    GRAPH_CONFIG.features?.filters !== false &&
    GRAPH_CONFIG.filters?.enabled !== false;
  const typeFiltersEnabled = GRAPH_CONFIG.filters?.types ?? true;
  const groupFiltersEnabled = GRAPH_CONFIG.filters?.groups ?? false;
  const groupFilterPageSize = 15;

  let availableTypes: string[] = [];
  let availableGroups: string[] = [];
  let groupFilterSearch = "";
  let visibleGroupFilterLimit = groupFilterPageSize;
  let previousAvailableGroups = availableGroups;
  let previousGroupFilterSearch = groupFilterSearch;
  $: if (availableGroups !== previousAvailableGroups) {
    previousAvailableGroups = availableGroups;
    groupFilterSearch = "";
    visibleGroupFilterLimit = groupFilterPageSize;
  }
  $: if (groupFilterSearch !== previousGroupFilterSearch) {
    previousGroupFilterSearch = groupFilterSearch;
    visibleGroupFilterLimit = groupFilterPageSize;
  }
  $: matchingGroupFilters = availableGroups.filter((group) =>
    group.toLowerCase().includes(groupFilterSearch.trim().toLowerCase())
  );
  $: visibleGroupFilters = matchingGroupFilters.slice(0, visibleGroupFilterLimit);
  let selectedPathStartId = "";
  let selectedPathGoalId = "";
  $: selectedStructuralGroupNodeCount = selectedStructuralGroup
    ? (data?.nodes ?? []).filter((node: any) => extractGroups(node).includes(selectedStructuralGroup)).length
    : undefined;
  $: typedPathCandidateNodeIds = new Set((data?.nodes ?? [])
    .filter((node: any) => !selectedStructuralGroup || extractGroups(node).includes(selectedStructuralGroup))
    .map((node: any) => normalizeGraphId(node.id)));
  $: availableStructuralEdgeTypes = mergeTypedPathEdgeTypes((data?.links ?? [])
    .filter((link: any) => typedPathCandidateNodeIds.has(normalizeGraphId(getGraphEndpointId(link.source))) &&
      typedPathCandidateNodeIds.has(normalizeGraphId(getGraphEndpointId(link.target))))
    .map((link: any) => link.analysis?.type),
    Array.isArray(motifCounterfactualEdgeAdditions)
      ? motifCounterfactualEdgeAdditions.map((candidate: any) => candidate?.edgeType)
      : []
  );
  $: availablePathNodes = (data?.nodes ?? []).map((node: any) => ({
    id: node.id,
    label: node.label ?? node.id
  }));
  $: availableKPlexMembershipNodes = (data?.nodes ?? [])
    .filter((node: any) => !selectedStructuralGroup || extractGroups(node).includes(selectedStructuralGroup))
    .map((node: any) => ({ id: String(node.id), label: String(node.label ?? node.id) }));
  $: sourceIdByNodeId = Object.fromEntries((originalData?.nodes ?? []).map((node: any) => [
    node.id,
    String(node.sourceId ?? node.id)
  ]));

  let selectedTypes = new Set<string>();
  let selectedGroupsFilter = new Set<string>();
  let minimumEdgeConfidence = 0;
  let confidenceExcludedLinkCount = 0;
  let selectedProvenanceScenarioId = "";
  let provenanceExcludedLinkCount = 0;

  // ---------------- SOLVER GROUP FILTER ----------------
  let selectedGroup: string = "";

  // ---------------- HELPERS ----------------
  function atomize(s: string) {
    return normalizeGraphId(s);
  }

  function normalizeName(s: string) {
    return normalizeGraphLabel(s);
  }

  function getLinkEndId(end: any): string {
    return getGraphEndpointId(end) as string;
  }

  function getNodeById(id: string, nodes = data?.nodes ?? []): any | null {
    return nodes.find((n: any) => n.id === id) ?? null;
  }

  function buildUiDetails(node: any) {
    if (!node) return null;

    return {
      tipo: node.type ?? "unknown",
      titolo: node.label,
      ...node.data
    };
  }

  function updateSelectedDetails(id: string) {
    const node = getNodeById(id);
    selectedDetails = buildUiDetails(node);
  }

  // ---------------------------------------------------------------------------
  // JSONPATH-LIKE FIELD EXTRACTION
  // ---------------------------------------------------------------------------
  // Supporta una forma leggera di JSONPath sufficiente per i mapping del grafo:
  //
  // - "roles[].group"
  // - "roles[*].group"
  // - "data.roles[].group"
  // - "$.data.roles[*].group"
  //
  // Se il path non inizia con "$" o "data.", viene interpretato come relativo
  // a node.data. Quindi "roles[].group" equivale a
  // "$.data.roles[*].group".
  // ---------------------------------------------------------------------------

  function normalizeJsonPathExpression(path: string): string {
    let expr = (path ?? "").trim();

    if (!expr) return "";

    if (expr.startsWith("$.")) {
      expr = expr.slice(2);
    } else if (expr.startsWith("$")) {
      expr = expr.slice(1).replace(/^\./, "");
    } else if (!expr.startsWith("data.")) {
      expr = `data.${expr}`;
    }

    expr = expr
      .replace(/\[\*\]/g, "[]")
      .replace(/\[\]/g, "[]");

    return expr;
  }

  function jsonPathValues(root: any, path: string): any[] {
    const expr = normalizeJsonPathExpression(path);
    if (!expr) return [];

    const segments = expr.split(".").filter(Boolean);
    let current: any[] = [root];

    for (const rawSegment of segments) {
      const isArrayExpansion = rawSegment.endsWith("[]");
      const key = isArrayExpansion
        ? rawSegment.slice(0, -2)
        : rawSegment;

      const next: any[] = [];

      for (const item of current) {
        if (item == null) continue;

        const value = item[key];

        if (isArrayExpansion) {
          if (Array.isArray(value)) {
            next.push(...value);
          }
        } else {
          if (Array.isArray(value)) {
            next.push(...value);
          } else if (value !== undefined && value !== null) {
            next.push(value);
          }
        }
      }

      current = next;
    }

    return current
      .flat(Infinity)
      .filter((v) => v !== undefined && v !== null);
  }

  function getTimelineValue(node: any, fieldOrPath: string, fallback: number): number {
    if (!fieldOrPath) return fallback;

    const direct = node.data?.[fieldOrPath];
    if (direct !== undefined && direct !== null) {
      const n = Number(direct);
      return Number.isFinite(n) ? n : fallback;
    }

    const values = jsonPathValues(node, fieldOrPath);
    const first = values[0];

    if (first === undefined || first === null) return fallback;

    const n = Number(first);
    return Number.isFinite(n) ? n : fallback;
  }

  function hasTimelineConfig(node: any): boolean {
    return getDeclaredNodeTimelineConfig(RAW_CONFIG.nodeTypes, node?.type) !== null;
  }

  function getNodeTimelineConfig(node: any) {
    return getDeclaredNodeTimelineConfig(RAW_CONFIG.nodeTypes, node?.type);
  }

  function getMappedEdgeTemporalInterval(link: any) {
    const validity = link?.analysis?.validity;
    const start = Number(validity?.from);
    const end = Number(validity?.to);
    return Number.isFinite(start) && Number.isFinite(end) && start <= end
      ? { start, end }
      : null;
  }

  function getTimelineQualifiedLinks(links: any[]) {
    if (GRAPH_CONFIG.features?.timeline !== true || graphCapabilities.edgeIntervals?.available !== true) {
      return links;
    }
    return filterLinksByTemporalWindow(links, getMappedEdgeTemporalInterval, currentStart, currentEnd);
  }

  function isTemporalNode(node: any): boolean {
    const config = getDeclaredNodeTypeConfig(RAW_CONFIG.nodeTypes, node?.type);

    // Compatibilità con il vecchio config completo:
    // category: "temporal" continua a funzionare.
    if (config?.category === "temporal") return true;

    // Compatibilità con il config minimale:
    // se un tipo dichiara una timeline, è trattato come temporale.
    return hasTimelineConfig(node);
  }

  function updateTimelineBoundsFromDataIfNeeded() {
    const userProvidedStart = hasOwnPath(RAW_CONFIG, "timeline.start");
    const userProvidedEnd = hasOwnPath(RAW_CONFIG, "timeline.end");

    // Se l'utente ha specificato esplicitamente start/end, non li tocchiamo.
    if (userProvidedStart && userProvidedEnd) return;

    if (!originalData?.nodes?.length && graphCapabilities.edgeIntervals?.available !== true) return;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const node of originalData?.nodes ?? []) {
      const timelineConfig = getNodeTimelineConfig(node);
      if (!timelineConfig) continue;

      const start = getTimelineValue(node, timelineConfig.startField, Number.NaN);
      const end = getTimelineValue(node, timelineConfig.endField, Number.NaN);

      if (Number.isFinite(start)) min = Math.min(min, start);
      if (Number.isFinite(end)) max = Math.max(max, end);
    }

    if (graphCapabilities.edgeIntervals?.available === true) {
      for (const link of originalData?.links ?? []) {
        const interval = getMappedEdgeTemporalInterval(link);
        if (!interval) continue;
        min = Math.min(min, interval.start);
        max = Math.max(max, interval.end);
      }
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) return;

    if (!userProvidedStart) GRAPH_CONFIG.timeline.start = min;
    if (!userProvidedEnd) GRAPH_CONFIG.timeline.end = max;

    currentStart = GRAPH_CONFIG.timeline.start;
    currentEnd = GRAPH_CONFIG.timeline.end;
  }

  // ---------------- DATASET ----------------
  function computeDynamicFilters() {
    if (!originalData?.nodes) {
      availableTypes = [];
      availableGroups = [];
      return;
    }

    const typeSet = new Set<string>();
    const groupSet = new Set<string>();

    for (const node of originalData.nodes) {
      if (node.type) typeSet.add(node.type);

      const groups = extractGroups(node);
      groups.forEach(g => groupSet.add(g));
    }

    availableTypes = Array.from(typeSet).sort();
    availableGroups = Array.from(groupSet).sort();
  }

  function getKliqueAspEasterEggGraph() {
    const raw = "KLIQUEASP";

    const nodes: any[] = [];
    const edges: any[] = [];

    const spacingX = 24;
    const spacingY = 16;
    const startX = -((raw.length - 1) * spacingX) / 2;

    raw.split("").forEach((char, i) => {
      const id = `kliqueasp_${i}_${char.toLowerCase()}`;
      const x = startX + i * spacingX;

      nodes.push({
        id,
        label: char,
        type: "logo",
        fx: x,
        fy: 0,
        fz: 0,
        data: {
          description: "KliqueASP easter egg node",
          letter: char
        }
      });

      if (i > 0) {
        edges.push({
          source: `kliqueasp_${i - 1}_${raw[i - 1].toLowerCase()}`,
          target: id,
          type: "logo_link"
        });
      }
    });

    nodes.push({
      id: "kliqueasp_core",
      label: "ASP",
      type: "logo",
      fx: 0,
      fy: -spacingY,
      fz: 0,
      data: {
        description: "Reasoning core"
      }
    });

    for (const node of nodes) {
      if (node.id !== "kliqueasp_core") {
        edges.push({
          source: "kliqueasp_core",
          target: node.id,
          type: "reasoning_link"
        });
      }
    }

    return {
      nodes,
      edges
    };
  }

  function nodePassesTypeFilters(node: any) {
    if (!typeFiltersEnabled || selectedTypes.size === 0) return true;
    return selectedTypes.has(node.type);
  }

  function extractGroups(node: any): string[] {
    const config = getDeclaredNodeTypeConfig(RAW_CONFIG.nodeTypes, node?.type);

    const configuredGroups = typeof config?.group === "string" && config.group
      ? jsonPathValues(node, config.group)
      .map((value) => String(value).trim())
      .filter(Boolean)
      : [];
    const mappedGroups = Array.isArray(node.analysis?.groups)
      ? node.analysis.groups.map((value: unknown) => String(value).trim()).filter(Boolean)
      : [];

    return [...new Set([...configuredGroups, ...mappedGroups])];
  }

  $: visibleAnalysisGroups = Array.from(new Set<string>(
    (data?.nodes ?? []).flatMap((node: any): string[] => extractGroups(node))
  )).sort();
  $: if (selectedGroup && !visibleAnalysisGroups.includes(selectedGroup)) selectedGroup = "";

  function resolveCommunityConstraintPairs(
    configuredPairs: unknown,
    constraintName: string,
    candidateNodes: any[],
    indexByNodeId: Map<string, number>
  ): Array<[number, number]> {
    if (configuredPairs === undefined) return [];
    if (!Array.isArray(configuredPairs)) {
      throw new Error(`graphAnalysis.communities.${constraintName} deve essere un array di coppie di ID nodo.`);
    }
    return configuredPairs.map((pair, index) => {
      if (!Array.isArray(pair) || pair.length !== 2) {
        throw new Error(`graphAnalysis.communities.${constraintName}[${index}] deve contenere due ID nodo.`);
      }
      const resolveNode = (rawId: unknown) => {
        const requestedId = String(rawId ?? "");
        return candidateNodes.find((node) => String(node.sourceId ?? "") === requestedId) ??
          candidateNodes.find((node) => String(node.id) === requestedId) ??
          candidateNodes.find((node) => node.id === normalizeGraphId(requestedId));
      };
      const left = resolveNode(pair[0]);
      const right = resolveNode(pair[1]);
      const leftIndex = left ? indexByNodeId.get(left.id) : undefined;
      const rightIndex = right ? indexByNodeId.get(right.id) : undefined;
      if (!leftIndex || !rightIndex) {
        throw new Error(`graphAnalysis.communities.${constraintName}[${index}] fa riferimento a nodi assenti dalla proiezione visibile o dal gruppo selezionato.`);
      }
      if (leftIndex === rightIndex) {
        throw new Error(`graphAnalysis.communities.${constraintName}[${index}] deve riferirsi a due nodi distinti.`);
      }
      return [leftIndex, rightIndex];
    });
  }

  function nodePassesGroupFilters(node: any) {
    if (!groupFiltersEnabled || selectedGroupsFilter.size === 0) return true;

    return extractGroups(node).some((g) =>
      selectedGroupsFilter.has(g)
    );
  }

  function nodePassesTimeline(node: any) {
    const timelineConfig = getNodeTimelineConfig(node);

    if (!timelineConfig) return true;

    const start = getTimelineValue(
      node,
      timelineConfig.startField,
      0
    );

    const end = getTimelineValue(
      node,
      timelineConfig.endField,
      9999
    );

    return start <= currentEnd && end >= currentStart;
  }

  function clearAnalysisResultsForProjectionChange() {
    onAnalysisSessionChange(null);
    lastCapturedAnalysisSession = null;
    lastAnalysisPanel = null;
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    solverError = "";
    lastGraph2DAnalysisKind = "";
    cliqueMembershipDiagnosis = null;
    cliqueMembershipDiagnosisTargetNodeId = null;
    cliqueMembershipDiagnosisRunning = false;
    cliqueMembershipDiagnosisError = "";
    provenanceScenarioAnalysisError = "";
    provenanceScenarioAnalysisProgress = "";
    provenanceScenarioComparison = null;
    provenanceScenarioSelectedGroup = "";
    provenanceScenarioConfidenceThreshold = null;
    provenanceScenarioTimelineWindow = "";
    provenanceScenarioViewFilters = { types: [], groups: [] };
    clearProvenanceKCoreScenarioComparison();
    clearProvenanceKPlexScenarioComparison();
    clearProvenanceComponentScenarioComparison();
    clearProvenanceDominatingSetScenarioComparison();
    maximumCliques = [];
    maximumCliqueMembershipCliques = [];
    allCliques = [];
    cliqueSupportingEdgesByKey = {};
    solverStats = {
      totalCliques: 0,
      maxSize: 0,
      histogram: new Map<number, number>(),
      timeMs: undefined,
      nodesCount: undefined,
      linksCount: undefined,
      periodLabel: undefined,
      cliqueMode: undefined,
      completionLabel: undefined,
      selectedGroup: ""
    };
    cliqueNodes = new Set();
    highlightedEdgeIds = new Set();
    focusedSignedTriadEdgeIds = null;
    focusedSignedTriadKey = "";
    clearStructuralTaskResult();
    integrityResults = [];
    integrityHasRun = false;
    integrityError = "";
    integrityTimeMs = undefined;
    integrityRepairError = "";
    integrityRepairProposal = null;
    clearMotifAnalysis();
    clearSignedTriadAnalysis();
  }

  function clearAnalysisResultsFromToolbar() {
    if (solverRunning || !analysisResultsAvailable) return;
    clearAnalysisResultsForProjectionChange();
    closeToolbarMenus();
    refreshLinkVisuals();
    refreshNodeVisuals();
    viewMenuElement?.querySelector("summary")?.focus();
  }

  function getEdgeConfidenceRange() {
    return graphCapabilities.edgeConfidence?.range ?? DEFAULT_EDGE_CONFIDENCE_RANGE;
  }

  function getDefaultEdgeConfidenceThreshold() {
    return getEdgeConfidenceRange().min;
  }

  function getEdgeConfidenceStep() {
    const range = getEdgeConfidenceRange();
    const step = (range.max - range.min) / 100;
    return Number.isFinite(step) && step > 0 ? step : "any";
  }

  function setMinimumEdgeConfidence(rawValue: unknown, inputElement?: HTMLInputElement) {
    const restoreCurrentValue = () => {
      if (inputElement) inputElement.value = String(minimumEdgeConfidence);
    };
    if (solverRunning || graphCapabilities.edgeConfidence?.available !== true) {
      restoreCurrentValue();
      return;
    }

    const next = parseMinimumConfidenceThreshold(rawValue, getEdgeConfidenceRange());
    if (next === null) {
      restoreCurrentValue();
      return;
    }
    if (inputElement) inputElement.value = String(next);
    if (next === minimumEdgeConfidence) return;

    clearAnalysisResultsForProjectionChange();
    minimumEdgeConfidence = next;
    recomputeGraphData();
    refreshLinkVisuals();
  }

  function setProvenanceScenario(rawValue: unknown) {
    if (solverRunning) return;
    const next = typeof rawValue === "string" &&
      (rawValue === "" || provenanceScenarios.some((scenario: any) => scenario.id === rawValue))
      ? rawValue
      : "";
    if (next === selectedProvenanceScenarioId) return;

    clearAnalysisResultsForProjectionChange();
    selectedProvenanceScenarioId = next;
    recomputeGraphData();
    refreshLinkVisuals();
  }

  function getProvenanceProjectedData() {
    if (!originalData) return null;
    const selectedScenario = provenanceScenarios.find(
      (scenario: any) => scenario.id === selectedProvenanceScenarioId
    );
    const links: any[] = filterLinksByProvenanceScenario(
      originalData.links,
      selectedScenario
        ? {
          sources: selectedScenario.sources,
          unattributedEdges: provenanceScenarioConfig.unattributedEdges,
          referenceMatching: provenanceScenarioConfig.referenceMatching ?? "any"
        }
        : undefined
    );
    provenanceExcludedLinkCount = originalData.links.length - links.length;
    return { ...originalData, links };
  }

  function projectVisibleNodeIdsForLinks(links: any[]) {
    if (!originalData) return new Set<string>();

    const timelineConfig = GRAPH_CONFIG.timeline ?? {};
    const mode = easterEggMode ? "simple" : (timelineConfig.mode ?? "simple");
    const timelineQualifiedLinks = getTimelineQualifiedLinks(links);

    return projectVisibleNodeIds({
      nodes: originalData.nodes,
      links: timelineQualifiedLinks,
      mode,
      currentStart,
      currentEnd,
      getNodeId: (node: any) => String(node.id),
      getLinkEndpoints: (link: any) => [getLinkEndId(link.source), getLinkEndId(link.target)],
      getTimelineInterval: (node: any) => {
        if (!isTemporalNode(node)) return null;
        const config = getNodeTimelineConfig(node);
        if (!config) return null;
        return {
          start: getTimelineValue(node, config.startField, 0),
          end: getTimelineValue(node, config.endField, 9999)
        };
      },
      isAlwaysVisible: (node: any) => isDeclaredNodeAlwaysVisible(RAW_CONFIG.nodeTypes, node?.type),
      passesTypeFilter: nodePassesTypeFilters,
      passesGroupFilter: nodePassesGroupFilters,
      passesTimeline: nodePassesTimeline
    });
  }

  function getScenarioViewFilterSnapshot() {
    return {
      types: [...selectedTypes].sort(),
      groups: [...selectedGroupsFilter].sort()
    };
  }

  function refreshRenderedGraphData() {
    const focusNodeIds = neighborhoodFocusNodeIds;
    const displayNodes = focusNodeIds === null
      ? data.nodes
      : data.nodes.filter((node: any) => focusNodeIds.has(String(node.id)));
    const recordLinks = focusNodeIds === null
      ? data.links
      : data.links.filter((link: any) => focusNodeIds.has(String(getLinkEndId(link.source))) &&
        focusNodeIds.has(String(getLinkEndId(link.target))));
    const displayLinks = aggregateParallelEdgesForDisplay
      ? prepareGraphDisplayLinks(recordLinks, {
        aggregateParallelEdges: true,
        defaultDirection: data.direction === "directed" ? "directed" : "undirected",
        getIdentity: (link: GraphDisplayLink) => getStructuralEdgeIdentity(link)
      })
      : recordLinks;

    graphDisplayLinkCount = displayLinks.length;
    if (neighborhoodFocusInfo) {
      neighborhoodFocusInfo = {
        ...neighborhoodFocusInfo,
        nodeCount: displayNodes.length,
        recordCount: recordLinks.length,
        renderedLinkCount: displayLinks.length
      };
    }
    graph3D?.linkOpacity(getGraphLinkOpacity({
      configuredOpacity: GRAPH_CONFIG.graph.linkOpacity,
      nodeCount: displayNodes.length,
      linkCount: displayLinks.length,
      directed: data.direction === "directed",
      hasHighlightedLinks: highlightedEdgeIds.size > 0
    }));
    const motionSettings = getGraphMotionSettings(reducedMotionPreference, displayNodes.length);
    graph3D
      ?.warmupTicks(motionSettings.warmupTicks)
      .cooldownTicks(motionSettings.cooldownTicks)
      .cooldownTime(motionSettings.cooldownTime);
    graph3D?.graphData({ ...data, nodes: displayNodes, links: displayLinks });
  }

  function recomputeGraphData() {
    if (!originalData) return;
    // The focus is derived from the current projection and is only a display filter.
    neighborhoodFocusNodeIds = null;
    neighborhoodFocusInfo = null;
    communityPairMembershipContext = null;
    structuralCommunityPairMembership = null;
    structuralCommunityPairMembershipError = "";
    structuralCommunityPairMembershipTimeMs = undefined;
    structuralCommunityTopologyCounterfactual = null;
    structuralCommunityTopologyCounterfactualError = "";
    structuralCommunityTopologyCounterfactualRunning = false;
    structuralCommunityTopologyCounterfactualTimeMs = undefined;

    const provenanceProjectedData = getProvenanceProjectedData();
    const sourceQualifiedLinks: any[] = provenanceProjectedData?.links ?? [];
    const timelineQualifiedLinks = getTimelineQualifiedLinks(sourceQualifiedLinks);

    const confidenceRange = getEdgeConfidenceRange();
    const confidenceThreshold = graphCapabilities.edgeConfidence?.available === true
      ? minimumEdgeConfidence
      : null;
    const confidenceQualifiedLinks = filterLinksByMinimumConfidence(
      timelineQualifiedLinks,
      confidenceThreshold,
      confidenceRange
    );

    const visibleNodes = projectVisibleNodeIdsForLinks(confidenceQualifiedLinks);

    // =========================================================
    // 🔹 LINK FILTERING
    // =========================================================
    const linksInsideVisibleNodes = timelineQualifiedLinks.filter((l: any) => {
      const s = getLinkEndId(l.source);
      const t = getLinkEndId(l.target);
      return visibleNodes.has(s) && visibleNodes.has(t);
    });
    const filteredLinks = filterLinksByMinimumConfidence(linksInsideVisibleNodes, confidenceThreshold, confidenceRange);
    confidenceExcludedLinkCount = linksInsideVisibleNodes.length - filteredLinks.length;

    const filteredNodes = originalData.nodes.filter((n: any) =>
      visibleNodes.has(n.id)
    );

    data = {
      nodes: filteredNodes,
      links: filteredLinks,
      schemaVersion: originalData.schemaVersion,
      direction: originalData.direction,
      identity: originalData.identity,
      capabilities: originalData.capabilities
    };

    // =========================================================
    // 🔹 rebuild neighbor map
    // =========================================================
    buildNeighborMap();

    // =========================================================
    // 🔹 reset selection se non più valida
    // =========================================================
    if (selectedId && !visibleNodes.has(selectedId)) {
      selectedId = null;
      rootSelectedId = null;
      selectedNode = null;
      selectedDetails = null;
      highlightedNeighbors = new Set();
    }

    // =========================================================
    // 🔹 update graph
    // =========================================================
    refreshRenderedGraphData();
    refreshNodeVisuals();
  }

  function loadDataset() {
    clearGraph2DOverlay();
    currentStart = GRAPH_CONFIG.timeline.start;
    currentEnd = GRAPH_CONFIG.timeline.end;
    minimumEdgeConfidence = 0;
    confidenceExcludedLinkCount = 0;
    selectedProvenanceScenarioId = "";
    provenanceExcludedLinkCount = 0;

    rootSelectedId = null;
    selectedId = null;
    selectedNode = null;
    selectedDetails = null;
    highlightedNeighbors = new Set();
    cliqueNodes = new Set();
    highlightedEdgeIds = new Set();
    focusedSignedTriadEdgeIds = null;
    focusedSignedTriadKey = "";
    clearHistory();

    let graph = graphData;

    if (forceEasterEgg) {
      console.info("🥚 Loading the explicitly requested KliqueASP easter egg graph.");
      easterEggMode = true;
      graph = getKliqueAspEasterEggGraph();
    } else {
      easterEggMode = false;
    }

    const normalizedGraph = normalizeGraphData(graph, RAW_CONFIG);
    graphDiagnostics = normalizedGraph.diagnostics;
    graphDirection = normalizedGraph.direction;
    graphSchemaVersion = normalizedGraph.schemaVersion;
    graphCapabilities = normalizedGraph.capabilities;
    minimumEdgeConfidence = getDefaultEdgeConfidenceThreshold();
    structuralResults = [];
    structuralPathEdgeTypeSequence = [];
    structuralPathEdgeIdsByStep = [];
    structuralPathTemporalSemantics = "static";
    structuralPathStrictTemporalOrder = false;
    structuralPathCommonTimeValue = undefined;
    structuralPathStartTimeValuesByStep = [];
    structuralPathMinimality = undefined;
    structuralPathNoRouteCertificate = undefined;
    structuralTypedPathNoRouteCertificate = undefined;
    structuralCommunityPartitions = [];
    graph2DCommunityPartitionIndex = -1;
    graph2DCommunityIndex = -1;
    communityPairMembershipContext = null;
    structuralCommunityPairMembership = null;
    structuralCommunityPairMembershipError = "";
    structuralCommunityPairMembershipRunning = false;
    structuralCommunityPairMembershipTimeMs = undefined;
    structuralCommunityTopologyCounterfactual = null;
    structuralCommunityTopologyCounterfactualError = "";
    structuralCommunityTopologyCounterfactualRunning = false;
    structuralCommunityTopologyCounterfactualTimeMs = undefined;
    structuralCommunityConstraintDiagnoses = [];
    structuralCommunityConstraintDiagnosisError = "";
    structuralCommunityConstraintDiagnosesAllEnumerated = false;
    structuralError = "";
    structuralStats = null;
    selectedStructuralGroup = "";
    selectedStructuralTargetGroup = "";
    selectedPathStartId = "";
    selectedPathGoalId = "";
    integrityResults = [];
    integrityHasRun = false;
    integrityError = "";
    integrityTimeMs = undefined;
    integrityRepairError = "";
    integrityRepairProposal = null;
    motifCountAbortController?.abort();
    motifMatches = [];
    motifHasRun = false;
    motifError = "";
    motifTimeMs = undefined;
    motifCount = undefined;
    motifCountHasRun = false;
    motifCountError = "";
    motifCountTimeMs = undefined;
    motifCountPartitionCount = undefined;
    motifCountProgress = undefined;
    motifCountNotice = "";
    motifCountAbortController = undefined;
    motifNearMatches = [];
    motifNearMatchHasRun = false;
    motifNearMatchError = "";
    motifNearMatchTimeMs = undefined;
    resetMotifCounterfactual();
    clearSignedTriadAnalysis();
    if (!normalizedGraph.valid) {
      console.error("[GRAPH] Input or mapping validation failed:", graphDiagnostics);
    }

    originalData = {
      nodes: normalizedGraph.nodes,
      links: normalizedGraph.links,
      schemaVersion: normalizedGraph.schemaVersion,
      direction: normalizedGraph.direction,
      identity: normalizedGraph.identity,
      capabilities: normalizedGraph.capabilities
    };
    restoreInitialHistoryForGraph();

    updateTimelineBoundsFromDataIfNeeded();
    buildSearchIndexFromNodes(originalData.nodes);
    computeDynamicFilters();
    fitOnEngineStop = fitGraphToViewEnabled;
    recomputeGraphData();

    graph3D?.cameraPosition(
      { x: 0, y: 0, z: getInitialGraphCameraDistance(originalData.nodes.length) },
      { x: 0, y: 0, z: 0 },
      graphTransitionDuration(800)
    );
  }

  function activeAnalysisPanel(): "clique" | "structural" | "integrity" | "motif" | "provenance" | null {
    if (showSolverPanel) return "clique";
    if (showStructuralPanel) return "structural";
    if (showIntegrityPanel) return "integrity";
    if (showMotifPanel) return "motif";
    if (showProvenanceScenarioAnalysisPanel) return "provenance";
    return null;
  }

  function captureAnalysisSessionState(): Record<string, unknown> {
    const panel = activeAnalysisPanel();
    const resultPanel = panel ?? lastAnalysisPanel;
    const state: Record<string, unknown> = {
      panel,
      resultPanel,
      lastGraph2DAnalysisKind,
      projection: {
        types: [...selectedTypes],
        groups: [...selectedGroupsFilter],
        minimumEdgeConfidence,
        provenanceScenarioId: selectedProvenanceScenarioId,
        start: currentStart,
        end: currentEnd
      },
      focus: {
        selectedNodeId: selectedId,
        showNodeDetails: selectedNode !== null,
        nodeIds: [...cliqueNodes],
        edgeIds: [...highlightedEdgeIds]
      },
      clique: {
        maximumCliques,
        maximumCliqueMembershipCliques,
        allCliques,
        supportingEdgesByClique: cliqueSupportingEdgesByKey,
        stats: { ...solverStats, histogram: [...solverStats.histogram.entries()] },
        error: solverError,
        minSize: minCliqueSize,
        topPerSize,
        selectedGroup,
        membershipDiagnosis: cliqueMembershipDiagnosis,
        membershipDiagnosisTargetNodeId: cliqueMembershipDiagnosisTargetNodeId,
        membershipDiagnosisError: cliqueMembershipDiagnosisError
      },
      structural: {
        task: structuralTask,
        parameter: structuralParameter,
        kCoreMode: structuralKCoreMode,
        includeKCoreNumbers: structuralIncludeKCoreNumbers,
        enumerateAllOptima: structuralEnumerateAllOptima,
        enumerateAllMaximalKPlex: structuralEnumerateAllMaximalKPlex,
        group: selectedStructuralGroup,
        targetGroup: selectedStructuralTargetGroup,
        results: structuralResults,
        stats: structuralStats,
        error: structuralError,
        kCoreNumbers: structuralKCoreNumbers,
        kCoreProfileTimeMs: structuralKCoreProfileTimeMs,
        communityPartitions: structuralCommunityPartitions,
        communityPairMembership: structuralCommunityPairMembership,
        communityPairMembershipError: structuralCommunityPairMembershipError,
        communityPairMembershipTimeMs: structuralCommunityPairMembershipTimeMs,
        communityTopologyCounterfactual: structuralCommunityTopologyCounterfactual,
        communityTopologyCounterfactualError: structuralCommunityTopologyCounterfactualError,
        communityTopologyCounterfactualTimeMs: structuralCommunityTopologyCounterfactualTimeMs,
        communityConstraintDiagnoses: structuralCommunityConstraintDiagnoses,
        communityConstraintDiagnosisError: structuralCommunityConstraintDiagnosisError,
        communityConstraintDiagnosesAllEnumerated: structuralCommunityConstraintDiagnosesAllEnumerated,
        kPlexCounterfactuals: structuralKPlexCounterfactuals,
        kPlexCounterfactualWhyNot: structuralKPlexCounterfactualWhyNot,
        kPlexCounterfactualWhyNotMessage: structuralKPlexCounterfactualWhyNotMessage,
        kPlexCounterfactualHasRun: structuralKPlexCounterfactualHasRun,
        kPlexCounterfactualError: structuralKPlexCounterfactualError,
        kPlexCounterfactualTimeMs: structuralKPlexCounterfactualTimeMs,
        kPlexCounterfactualExcludedCandidateCount: structuralKPlexCounterfactualExcludedCandidateCount,
        kCoreCounterfactuals: structuralKCoreCounterfactuals,
        kCoreCounterfactualWhyNot: structuralKCoreCounterfactualWhyNot,
        kCoreCounterfactualWhyNotMessage: structuralKCoreCounterfactualWhyNotMessage,
        kCoreCounterfactualHasRun: structuralKCoreCounterfactualHasRun,
        kCoreCounterfactualError: structuralKCoreCounterfactualError,
        kCoreCounterfactualTimeMs: structuralKCoreCounterfactualTimeMs,
        kCoreCounterfactualExcludedCandidateCount: structuralKCoreCounterfactualExcludedCandidateCount,
        kCoreMembershipCounterfactuals: structuralKCoreMembershipCounterfactuals,
        kCoreMembershipCounterfactualWhyNot: structuralKCoreMembershipCounterfactualWhyNot,
        kCoreMembershipCounterfactualWhyNotMessage: structuralKCoreMembershipCounterfactualWhyNotMessage,
        kCoreMembershipCounterfactualHasRun: structuralKCoreMembershipCounterfactualHasRun,
        kCoreMembershipCounterfactualError: structuralKCoreMembershipCounterfactualError,
        kCoreMembershipCounterfactualTimeMs: structuralKCoreMembershipCounterfactualTimeMs,
        kCoreMembershipCounterfactualExcludedCandidateCount: structuralKCoreMembershipCounterfactualExcludedCandidateCount,
        kPlexMissingPairsBySetKey: structuralKPlexMissingPairsBySetKey,
        kPlexMaximalityBySetKey: structuralKPlexMaximalityBySetKey,
        kPlexMembershipDiagnosis: structuralKPlexMembershipDiagnosis,
        kPlexMembershipDiagnosisTargetNodeId: structuralKPlexMembershipDiagnosisTargetNodeId,
        kPlexMembershipDiagnosisError: structuralKPlexMembershipDiagnosisError,
        kPlexMembershipDiagnosisTimeMs: structuralKPlexMembershipDiagnosisTimeMs,
        kPlexMembershipCounterfactual: structuralKPlexMembershipCounterfactual,
        kPlexMembershipCounterfactualError: structuralKPlexMembershipCounterfactualError,
        kPlexMembershipCounterfactualTimeMs: structuralKPlexMembershipCounterfactualTimeMs,
        kPlexMembershipCounterfactualCandidateCount: structuralKPlexMembershipCounterfactualCandidateCount,
        kCoreSupportBySetKey: structuralKCoreSupportBySetKey,
        kCorePeelingBySetKey: structuralKCorePeelingBySetKey,
        explainKCoreExclusions: structuralExplainKCoreExclusions,
        explainCommunityContributions: structuralExplainCommunityContributions,
        explainPathMinimality: structuralExplainPathMinimality,
        explainTypedPathNoRoute: structuralExplainTypedPathNoRoute,
        dominatingSetSupportBySetKey: structuralDominatingSetSupportBySetKey,
        dominatingSetUncoverableTargetNodeIds: structuralDominatingSetUncoverableTargetNodeIds,
        separatorReachableBySetKey: structuralSeparatorReachableBySetKey,
        pathEdgeTypeSequence: structuralPathEdgeTypeSequence,
        pathEdgeIdsByStep: structuralPathEdgeIdsByStep,
        pathTemporalSemantics: structuralPathTemporalSemantics,
        pathStrictTemporalOrder: structuralPathStrictTemporalOrder,
        pathCommonTimeValue: structuralPathCommonTimeValue,
        pathStartTimeValuesByStep: structuralPathStartTimeValuesByStep,
        pathMinimality: structuralPathMinimality,
        pathNoRouteCertificate: structuralPathNoRouteCertificate,
        typedPathNoRouteCertificate: structuralTypedPathNoRouteCertificate,
        typedPathCounterfactuals: structuralTypedPathCounterfactuals,
        typedPathCounterfactualWhyNot: structuralTypedPathCounterfactualWhyNot,
        typedPathCounterfactualWhyNotError: structuralTypedPathCounterfactualWhyNotError,
        typedPathCounterfactualHasRun: structuralTypedPathCounterfactualHasRun,
        typedPathCounterfactualError: structuralTypedPathCounterfactualError,
        typedPathCounterfactualTimeMs: structuralTypedPathCounterfactualTimeMs,
        typedPathCounterfactualExcludedCandidateCount: structuralTypedPathCounterfactualExcludedCandidateCount,
        selectedPathStartId,
        selectedPathGoalId
      },
      integrity: {
        results: integrityResults,
        hasRun: integrityHasRun,
        timeMs: integrityTimeMs,
        error: integrityError,
        repairProposal: integrityRepairProposal,
        repairError: integrityRepairError
      },
      motif: {
        selectedTemplateIndex: selectedMotifTemplateIndex,
        selectedGroup: selectedMotifGroup,
        error: motifError,
        matches: motifMatches,
        hasRun: motifHasRun,
        timeMs: motifTimeMs,
        count: motifCount,
        countHasRun: motifCountHasRun,
        countError: motifCountError,
        countNotice: motifCountNotice,
        countTimeMs: motifCountTimeMs,
        countPartitionCount: motifCountPartitionCount,
        scenarioComparison: motifScenarioComparison,
        scenarioComparisonError: motifScenarioComparisonError,
        scenarioComparisonTimeMs: motifScenarioComparisonTimeMs,
        nearMatches: motifNearMatches,
        nearMatchHasRun: motifNearMatchHasRun,
        nearMatchError: motifNearMatchError,
        nearMatchTimeMs: motifNearMatchTimeMs,
        counterfactuals: motifCounterfactuals,
        counterfactualHasRun: motifCounterfactualHasRun,
        counterfactualError: motifCounterfactualError,
        counterfactualTimeMs: motifCounterfactualTimeMs,
        counterfactualExcludedCandidateCount: motifCounterfactualExcludedCandidateCount,
        signedTriadGroup: selectedSignedTriadGroup,
        signedTriadResults,
        signedTriadHasRun,
        signedTriadError,
        signedTriadTimeMs,
        signedTriadScenarioComparison,
        signedTriadScenarioComparisonError,
        signedTriadScenarioComparisonTimeMs,
        signedTriadFocusedKey: focusedSignedTriadKey,
        contextualCliqueGroup,
        contextualCliqueEnumerateAllOptima,
        contextualCliqueResults,
        contextualCliqueHasRun,
        contextualCliqueError,
        contextualCliqueTimeMs,
        lastGraph2DAnalysisKind
      },
      provenance: {
        cliqueComparison: provenanceScenarioComparison,
        cliqueComparisonError: provenanceScenarioAnalysisError,
        cliqueSelectedGroup: provenanceScenarioSelectedGroup,
        cliqueConfidenceThreshold: provenanceScenarioConfidenceThreshold,
        cliqueTimelineWindow: provenanceScenarioTimelineWindow,
        cliqueViewFilters: provenanceScenarioViewFilters,
        kCoreComparison: provenanceKCoreScenarioComparison,
        kCoreComparisonError: provenanceKCoreScenarioComparisonError,
        kCoreSelectedGroup: provenanceKCoreScenarioSelectedGroup,
        kCoreConfidenceThreshold: provenanceKCoreScenarioConfidenceThreshold,
        kCoreTimelineWindow: provenanceKCoreScenarioTimelineWindow,
        kCoreViewFilters: provenanceKCoreScenarioViewFilters,
        kPlexComparison: provenanceKPlexScenarioComparison,
        kPlexComparisonError: provenanceKPlexScenarioComparisonError,
        kPlexSelectedGroup: provenanceKPlexScenarioSelectedGroup,
        kPlexConfidenceThreshold: provenanceKPlexScenarioConfidenceThreshold,
        kPlexTimelineWindow: provenanceKPlexScenarioTimelineWindow,
        kPlexViewFilters: provenanceKPlexScenarioViewFilters,
        componentComparison: provenanceComponentScenarioComparison,
        componentComparisonError: provenanceComponentScenarioComparisonError,
        componentSelectedGroup: provenanceComponentScenarioSelectedGroup,
        componentTargetNodeId: provenanceComponentScenarioTargetNodeId,
        componentConfidenceThreshold: provenanceComponentScenarioConfidenceThreshold,
        componentTimelineWindow: provenanceComponentScenarioTimelineWindow,
        componentViewFilters: provenanceComponentScenarioViewFilters,
        dominatingSetComparison: provenanceDominatingSetScenarioComparison,
        dominatingSetComparisonError: provenanceDominatingSetScenarioComparisonError,
        dominatingSetCandidateGroup: provenanceDominatingSetScenarioCandidateGroup,
        dominatingSetTargetGroup: provenanceDominatingSetScenarioTargetGroup,
        dominatingSetConfidenceThreshold: provenanceDominatingSetScenarioConfidenceThreshold,
        dominatingSetTimelineWindow: provenanceDominatingSetScenarioTimelineWindow,
        dominatingSetViewFilters: provenanceDominatingSetScenarioViewFilters,
        dominatingSetWhyNot: provenanceDominatingSetScenarioWhyNot
      },
      graph2D: {
        nodeAnnotations: graph2DNodeAnnotations,
        edgeAnnotations: graph2DEdgeAnnotations,
        hypotheticalLinks: graph2DHypotheticalLinks,
        overlayResultLabel: graph2DOverlayResultLabel,
        overlayCompletionLabel: graph2DOverlayCompletionLabel,
        communityPartitionIndex: graph2DCommunityPartitionIndex,
        communityIndex: graph2DCommunityIndex
      }
    };
    if (resultPanel !== "clique") delete state.clique;
    if (resultPanel !== "structural") delete state.structural;
    if (resultPanel !== "integrity") delete state.integrity;
    if (resultPanel !== "motif") delete state.motif;
    if (!["provenance", "structural", "motif"].includes(String(resultPanel))) delete state.provenance;
    return JSON.parse(JSON.stringify(state));
  }

  function createAnalysisArchiveId(): string {
    const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    return `analysis-${Date.now().toString(36)}-${randomId}`;
  }

  function analysisArchiveLabel(state: Record<string, any>): string {
    const panel = state.resultPanel ?? state.panel;
    if (panel === "clique") {
      const group = state.clique?.selectedGroup;
      return typeof group === "string" && group ? `Clique massima · ${group}` : "Clique massima";
    }
    if (panel === "structural") {
      const task = state.structural?.task;
      const taskLabels: Record<string, string> = {
        kPlex: "k-plex massimo",
        maximalKPlex: "k-plex massimali",
        kCore: "k-core",
        components: "componenti connesse",
        weakComponents: "componenti debolmente connesse",
        strongComponents: "componenti fortemente connesse",
        path: "cammino minimo",
        typedPath: "cammino tipizzato",
        dominatingSet: "insieme dominante",
        minimumNodeSeparator: "separatore minimo di nodi",
        minimumCostNodeSeparator: "separatore di nodi a costo minimo",
        minimumEdgeSeparator: "taglio minimo di archi",
        minimumCostEdgeSeparator: "taglio di archi a costo minimo",
        communities: "comunità per modularità"
      };
      const label = typeof task === "string" && task
        ? taskLabels[task] ?? task.replaceAll(/[-_]/g, " ")
        : "analisi strutturale";
      const parameter = Number(state.structural?.parameter);
      const parameterLabel = Number.isFinite(parameter) && (task === "kPlex" || task === "maximalKPlex")
        ? ` · s=${parameter}`
        : Number.isFinite(parameter) && task === "kCore"
          ? ` · k=${parameter}`
          : "";
      return `${label}${parameterLabel}`;
    }
    if (panel === "integrity") return "Verifica d’integrità";
    if (panel === "motif") {
      if (state.motif?.signedTriadHasRun) return "Triadi firmate";
      if (state.motif?.contextualCliqueHasRun) return "Clique contestuale";
      const template = state.motif?.selectedTemplateIndex;
      return Number.isInteger(template) ? `Motivo relazionale · configurazione ${template + 1}` : "Motivi relazionali";
    }
    if (panel === "provenance") return "Confronto di provenienza";
    return "Analisi del grafo";
  }

  function analysisStateHasResult(state: Record<string, any>): boolean {
    const panel = state.resultPanel ?? state.panel;
    if (panel === "clique") {
      return (Array.isArray(state.clique?.maximumCliques) && state.clique.maximumCliques.length > 0) ||
        Number.isFinite(state.clique?.stats?.timeMs) || Boolean(state.clique?.error);
    }
    if (panel === "structural") {
      return (Array.isArray(state.structural?.results) && state.structural.results.length > 0) ||
        Boolean(state.structural?.stats) || Boolean(state.structural?.error);
    }
    if (panel === "integrity") {
      return state.integrity?.hasRun === true || Boolean(state.integrity?.error) || Boolean(state.integrity?.repairProposal);
    }
    if (panel === "motif") {
      const motif = state.motif ?? {};
      return [
        motif.hasRun, motif.countHasRun, motif.nearMatchHasRun, motif.counterfactualHasRun,
        motif.signedTriadHasRun, motif.contextualCliqueHasRun
      ].some(Boolean) || Boolean(motif.error || motif.countError || motif.nearMatchError || motif.counterfactualError || motif.signedTriadError || motif.contextualCliqueError);
    }
    if (panel === "provenance") {
      const provenance = state.provenance ?? {};
      return Object.entries(provenance).some(([key, value]) =>
        /(comparison|error|counterfactual|whynot)/i.test(key) && value !== null && value !== undefined &&
        value !== "" && (!Array.isArray(value) || value.length > 0)
      );
    }
    return false;
  }

  function analysisArchiveEntry(snapshot: WorkbenchAnalysisSessionSnapshot | null): WorkbenchAnalysisArchiveEntry | null {
    if (!snapshot || snapshot.graphKey !== sessionGraphKey || !snapshot.state || typeof snapshot.state !== "object") return null;
    const state = snapshot.state as Record<string, any>;
    if (!analysisStateHasResult(state)) return null;
    const savedAt = typeof state.analysisCreatedAt === "string" && Number.isFinite(Date.parse(state.analysisCreatedAt))
      ? state.analysisCreatedAt
      : new Date().toISOString();
    const id = typeof state.analysisId === "string" && state.analysisId ? state.analysisId : createAnalysisArchiveId();
    return {
      id,
      label: analysisArchiveLabel(state),
      savedAt,
      state: { ...state, analysisId: id, analysisCreatedAt: savedAt }
    };
  }

  function publishAnalysisArchive(entries: WorkbenchAnalysisArchiveEntry[]) {
    const seen = new Set<string>();
    const boundedEntries: WorkbenchAnalysisArchiveEntry[] = [];
    let usedChars = 0;
    for (const entry of entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (boundedEntries.length >= MAX_WORKBENCH_ANALYSIS_ARCHIVE_ENTRIES) break;
      const entryChars = JSON.stringify(entry).length;
      if (usedChars + entryChars > MAX_WORKBENCH_ANALYSIS_ARCHIVE_CHARS) continue;
      boundedEntries.push(entry);
      usedChars += entryChars;
    }
    analysisArchiveEntries = boundedEntries;
    onAnalysisArchiveChange(analysisArchiveEntries.length > 0
      ? { version: 1, graphKey: sessionGraphKey, entries: analysisArchiveEntries }
      : null);
  }

  function persistCurrentAnalysisSession(selectionOnly = false, archivePrevious = false) {
    if (!originalData || !sessionGraphKey) return;
    try {
      lastAnalysisPanel = activeAnalysisPanel() ?? lastAnalysisPanel;
      if (selectionOnly && lastCapturedAnalysisSession?.graphKey === sessionGraphKey) {
        const previousState = lastCapturedAnalysisSession.state;
        const previousFocus = previousState.focus && typeof previousState.focus === "object" && !Array.isArray(previousState.focus)
          ? previousState.focus as Record<string, unknown>
          : {};
        lastCapturedAnalysisSession = {
          ...lastCapturedAnalysisSession,
          state: {
            ...previousState,
            focus: {
              ...previousFocus,
              selectedNodeId: selectedId,
              showNodeDetails: selectedNode !== null,
              nodeIds: [...cliqueNodes],
              edgeIds: [...highlightedEdgeIds]
            }
          }
        };
        onAnalysisSessionChange(lastCapturedAnalysisSession);
        return;
      }
      const previousEntry = archivePrevious ? analysisArchiveEntry(lastCapturedAnalysisSession) : null;
      if (previousEntry) {
        publishAnalysisArchive([
          previousEntry,
          ...analysisArchiveEntries.filter((entry) => entry.id !== previousEntry.id)
        ]);
      }
      const state = captureAnalysisSessionState();
      const hasResult = analysisStateHasResult(state);
      if (archivePrevious || (hasResult && !activeAnalysisId)) {
        activeAnalysisId = hasResult ? createAnalysisArchiveId() : null;
        activeAnalysisCreatedAt = hasResult ? new Date().toISOString() : null;
      } else if (!hasResult) {
        activeAnalysisId = null;
        activeAnalysisCreatedAt = null;
      }
      if (activeAnalysisId) state.analysisId = activeAnalysisId;
      if (activeAnalysisCreatedAt) state.analysisCreatedAt = activeAnalysisCreatedAt;
      const snapshot: WorkbenchAnalysisSessionSnapshot = {
        version: 1,
        graphKey: sessionGraphKey,
        state
      };
      lastCapturedAnalysisSession = snapshot;
      onAnalysisSessionChange(snapshot);
    } catch (error) {
      console.warn("[SESSION] L'analisi corrente non può essere salvata:", error);
    }
  }

  function restoreAnalysisSession(snapshot = initialAnalysisSession) {
    if (!snapshot || snapshot.graphKey !== sessionGraphKey || !originalData) return;
    lastCapturedAnalysisSession = snapshot;
    const state = snapshot.state as Record<string, any>;
    activeAnalysisId = typeof state.analysisId === "string" && state.analysisId ? state.analysisId : null;
    activeAnalysisCreatedAt = typeof state.analysisCreatedAt === "string" && Number.isFinite(Date.parse(state.analysisCreatedAt))
      ? state.analysisCreatedAt
      : null;
    const existingNodeIds = new Set<string>((originalData.nodes ?? []).map((node: any) => String(node.id)));
    const validNodeSet = (value: unknown): string[] | null => {
      if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && existingNodeIds.has(id))) return null;
      return [...value];
    };
    const validNodeSets = (value: unknown): string[][] | null => {
      if (!Array.isArray(value)) return null;
      const sets = value.map(validNodeSet);
      return sets.every((set) => set !== null) ? sets as string[][] : null;
    };
    const isRecord = (value: unknown): value is Record<string, any> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value);
    const panel = ["clique", "structural", "integrity", "motif", "provenance"].includes(state.panel)
      ? state.panel
      : null;
    const resultPanel = ["clique", "structural", "integrity", "motif", "provenance"].includes(state.resultPanel)
      ? state.resultPanel
      : panel;
    lastGraph2DAnalysisKind = typeof state.lastGraph2DAnalysisKind === "string" ? state.lastGraph2DAnalysisKind : "";

    if (isRecord(state.projection)) {
      selectedTypes = new Set(Array.isArray(state.projection.types)
        ? state.projection.types.filter((type: unknown) => typeof type === "string" && availableTypes.includes(type))
        : []);
      selectedGroupsFilter = new Set(Array.isArray(state.projection.groups)
        ? state.projection.groups.filter((group: unknown) => typeof group === "string" && availableGroups.includes(group))
        : []);
      const confidenceRange = getEdgeConfidenceRange();
      const confidence = Number(state.projection.minimumEdgeConfidence);
      minimumEdgeConfidence = graphCapabilities.edgeConfidence?.available === true && Number.isFinite(confidence)
        ? Math.max(confidenceRange.min, Math.min(confidenceRange.max, confidence))
        : getDefaultEdgeConfidenceThreshold();
      const scenarioId = state.projection.provenanceScenarioId;
      selectedProvenanceScenarioId = typeof scenarioId === "string" &&
        provenanceScenarios.some((scenario: any) => scenario.id === scenarioId)
        ? scenarioId
        : "";
      const start = Number(state.projection.start);
      const end = Number(state.projection.end);
      if (timelineControlEnabled && Number.isFinite(start) && Number.isFinite(end) && start <= end) {
        currentStart = start;
        currentEnd = end;
      }
      recomputeGraphData();
    }

    if (isRecord(state.clique)) {
      const clique = state.clique;
      const savedMaximumCliques = validNodeSets(clique.maximumCliques);
      const membershipCliques = validNodeSets(clique.maximumCliqueMembershipCliques);
      const savedAllCliques = validNodeSets(clique.allCliques);
      if (savedMaximumCliques) {
        maximumCliques = savedMaximumCliques;
        maximumCliqueMembershipCliques = membershipCliques ?? savedMaximumCliques;
        allCliques = savedAllCliques ?? savedMaximumCliques;
      }
      if (isRecord(clique.supportingEdgesByClique)) cliqueSupportingEdgesByKey = clique.supportingEdgesByClique;
      if (isRecord(clique.stats)) {
        const histogram = Array.isArray(clique.stats.histogram)
          ? clique.stats.histogram.filter((entry: unknown) => Array.isArray(entry) && entry.length === 2 &&
            Number.isInteger(entry[0]) && entry[0] >= 0 && Number.isInteger(entry[1]) && entry[1] >= 0)
          : [];
        solverStats = {
          totalCliques: Number.isFinite(clique.stats.totalCliques) ? clique.stats.totalCliques : 0,
          maxSize: Number.isFinite(clique.stats.maxSize) ? clique.stats.maxSize : 0,
          histogram: new Map(histogram as Array<[number, number]>),
          timeMs: Number.isFinite(clique.stats.timeMs) ? clique.stats.timeMs : undefined,
          nodesCount: Number.isFinite(clique.stats.nodesCount) ? clique.stats.nodesCount : undefined,
          linksCount: Number.isFinite(clique.stats.linksCount) ? clique.stats.linksCount : undefined,
          periodLabel: typeof clique.stats.periodLabel === "string" ? clique.stats.periodLabel : undefined,
          cliqueMode: typeof clique.stats.cliqueMode === "string" ? clique.stats.cliqueMode : undefined,
          completionLabel: typeof clique.stats.completionLabel === "string" ? clique.stats.completionLabel : undefined,
          selectedGroup: typeof clique.stats.selectedGroup === "string" ? clique.stats.selectedGroup : ""
        };
      }
      solverError = typeof clique.error === "string" ? clique.error : "";
      minCliqueSize = Number.isInteger(clique.minSize) ? clique.minSize : minCliqueSize;
      topPerSize = Number.isInteger(clique.topPerSize) ? clique.topPerSize : topPerSize;
      selectedGroup = typeof clique.selectedGroup === "string" && availableGroups.includes(clique.selectedGroup) ? clique.selectedGroup : "";
      if (isRecord(clique.membershipDiagnosis)) cliqueMembershipDiagnosis = clique.membershipDiagnosis as any;
      cliqueMembershipDiagnosisTargetNodeId = typeof clique.membershipDiagnosisTargetNodeId === "string" && existingNodeIds.has(clique.membershipDiagnosisTargetNodeId)
        ? clique.membershipDiagnosisTargetNodeId
        : null;
      cliqueMembershipDiagnosisError = typeof clique.membershipDiagnosisError === "string" ? clique.membershipDiagnosisError : "";
    }

    if (isRecord(state.structural)) {
      const structural = state.structural;
      const tasks: StructuralTask[] = ["kPlex", "maximalKPlex", "kCore", "components", "weakComponents", "strongComponents", "path", "typedPath", "dominatingSet", "minimumNodeSeparator", "minimumCostNodeSeparator", "minimumEdgeSeparator", "minimumCostEdgeSeparator", "communities"];
      if (tasks.includes(structural.task)) structuralTask = structural.task;
      if (Number.isInteger(structural.parameter)) structuralParameter = structural.parameter;
      if (["", "in", "out", "mutual"].includes(structural.kCoreMode)) structuralKCoreMode = structural.kCoreMode;
      structuralIncludeKCoreNumbers = structural.includeKCoreNumbers === true;
      structuralEnumerateAllOptima = structural.enumerateAllOptima === true;
      structuralEnumerateAllMaximalKPlex = structural.enumerateAllMaximalKPlex === true;
      selectedStructuralGroup = typeof structural.group === "string" && availableGroups.includes(structural.group) ? structural.group : "";
      selectedStructuralTargetGroup = typeof structural.targetGroup === "string" && availableGroups.includes(structural.targetGroup) ? structural.targetGroup : "";
      structuralResults = validNodeSets(structural.results) ?? [];
      if (isRecord(structural.stats) && tasks.includes(structural.stats.task)) {
        const restoredStats = { ...structural.stats };
        if (restoredStats.task === "kPlex" && structuralResults.length > 0) {
          restoredStats.completionLabel = buildGraph2DOptimizationCompletionLabel({
            optimizationProven: true,
            hasSolution: true,
            enumerateAllOptima: structural.enumerateAllOptima === true,
            allOptimaEnumerationComplete: structural.enumerateAllOptima === true
          });
        } else if (restoredStats.task === "kCore") {
          restoredStats.completionLabel = buildGraph2DStructuralCompletionLabel({
            task: "kCore",
            resultStatus: "OPTIMUM FOUND",
            completeModelEnumeration: false,
            hasSolution: true,
            enumerateAllOptima: false
          });
        } else if (restoredStats.task === "components" || restoredStats.task === "weakComponents" ||
          restoredStats.task === "strongComponents") {
          restoredStats.completionLabel = buildGraph2DStructuralCompletionLabel({
            task: restoredStats.task as StructuralTask,
            resultStatus: "SATISFIABLE",
            completeModelEnumeration: true,
            hasSolution: true,
            enumerateAllOptima: false
          });
        } else if (structuralResults.length > 0 &&
          (restoredStats.task === "maximalKPlex" || restoredStats.task === "path" || restoredStats.task === "typedPath")) {
          restoredStats.completionLabel = buildGraph2DStructuralCompletionLabel({
            task: restoredStats.task as StructuralTask,
            resultStatus: "SATISFIABLE",
            completeModelEnumeration: structural.enumerateAllMaximalKPlex === true,
            hasSolution: true,
            enumerateAllOptima: structural.enumerateAllOptima === true,
            enumerateAllMaximalKPlex: structural.enumerateAllMaximalKPlex === true
          });
        }
        structuralStats = restoredStats as any;
      }
      structuralError = typeof structural.error === "string" ? structural.error : "";
      structuralKCoreNumbers = isRecord(structural.kCoreNumbers) ? structural.kCoreNumbers : null;
      structuralKCoreProfileTimeMs = Number.isFinite(structural.kCoreProfileTimeMs) ? structural.kCoreProfileTimeMs : undefined;
      structuralCommunityPartitions = Array.isArray(structural.communityPartitions) ? structural.communityPartitions : [];
      structuralCommunityPairMembership = isRecord(structural.communityPairMembership) ? structural.communityPairMembership as any : null;
      structuralCommunityPairMembershipError = typeof structural.communityPairMembershipError === "string" ? structural.communityPairMembershipError : "";
      structuralCommunityPairMembershipTimeMs = Number.isFinite(structural.communityPairMembershipTimeMs) ? structural.communityPairMembershipTimeMs : undefined;
      structuralCommunityTopologyCounterfactual = isRecord(structural.communityTopologyCounterfactual) ? structural.communityTopologyCounterfactual as any : null;
      structuralCommunityTopologyCounterfactualError = typeof structural.communityTopologyCounterfactualError === "string" ? structural.communityTopologyCounterfactualError : "";
      structuralCommunityTopologyCounterfactualTimeMs = Number.isFinite(structural.communityTopologyCounterfactualTimeMs) ? structural.communityTopologyCounterfactualTimeMs : undefined;
      structuralCommunityConstraintDiagnoses = Array.isArray(structural.communityConstraintDiagnoses) ? structural.communityConstraintDiagnoses : [];
      structuralCommunityConstraintDiagnosisError = typeof structural.communityConstraintDiagnosisError === "string" ? structural.communityConstraintDiagnosisError : "";
      structuralCommunityConstraintDiagnosesAllEnumerated = structural.communityConstraintDiagnosesAllEnumerated === true;
      structuralKPlexCounterfactuals = Array.isArray(structural.kPlexCounterfactuals) ? structural.kPlexCounterfactuals : [];
      structuralKPlexCounterfactualWhyNot = isRecord(structural.kPlexCounterfactualWhyNot) ? structural.kPlexCounterfactualWhyNot as any : null;
      structuralKPlexCounterfactualWhyNotMessage = typeof structural.kPlexCounterfactualWhyNotMessage === "string" ? structural.kPlexCounterfactualWhyNotMessage : "";
      structuralKPlexCounterfactualHasRun = structural.kPlexCounterfactualHasRun === true;
      structuralKPlexCounterfactualError = typeof structural.kPlexCounterfactualError === "string" ? structural.kPlexCounterfactualError : "";
      structuralKPlexCounterfactualTimeMs = Number.isFinite(structural.kPlexCounterfactualTimeMs) ? structural.kPlexCounterfactualTimeMs : undefined;
      structuralKPlexCounterfactualExcludedCandidateCount = Number.isInteger(structural.kPlexCounterfactualExcludedCandidateCount) ? structural.kPlexCounterfactualExcludedCandidateCount : 0;
      structuralKCoreCounterfactuals = Array.isArray(structural.kCoreCounterfactuals) ? structural.kCoreCounterfactuals : [];
      structuralKCoreCounterfactualWhyNot = isRecord(structural.kCoreCounterfactualWhyNot) ? structural.kCoreCounterfactualWhyNot as any : null;
      structuralKCoreCounterfactualWhyNotMessage = typeof structural.kCoreCounterfactualWhyNotMessage === "string" ? structural.kCoreCounterfactualWhyNotMessage : "";
      structuralKCoreCounterfactualHasRun = structural.kCoreCounterfactualHasRun === true;
      structuralKCoreCounterfactualError = typeof structural.kCoreCounterfactualError === "string" ? structural.kCoreCounterfactualError : "";
      structuralKCoreCounterfactualTimeMs = Number.isFinite(structural.kCoreCounterfactualTimeMs) ? structural.kCoreCounterfactualTimeMs : undefined;
      structuralKCoreCounterfactualExcludedCandidateCount = Number.isInteger(structural.kCoreCounterfactualExcludedCandidateCount) ? structural.kCoreCounterfactualExcludedCandidateCount : 0;
      structuralKCoreMembershipCounterfactuals = Array.isArray(structural.kCoreMembershipCounterfactuals) ? structural.kCoreMembershipCounterfactuals : [];
      structuralKCoreMembershipCounterfactualWhyNot = isRecord(structural.kCoreMembershipCounterfactualWhyNot) ? structural.kCoreMembershipCounterfactualWhyNot as any : null;
      structuralKCoreMembershipCounterfactualWhyNotMessage = typeof structural.kCoreMembershipCounterfactualWhyNotMessage === "string" ? structural.kCoreMembershipCounterfactualWhyNotMessage : "";
      structuralKCoreMembershipCounterfactualHasRun = structural.kCoreMembershipCounterfactualHasRun === true;
      structuralKCoreMembershipCounterfactualError = typeof structural.kCoreMembershipCounterfactualError === "string" ? structural.kCoreMembershipCounterfactualError : "";
      structuralKCoreMembershipCounterfactualTimeMs = Number.isFinite(structural.kCoreMembershipCounterfactualTimeMs) ? structural.kCoreMembershipCounterfactualTimeMs : undefined;
      structuralKCoreMembershipCounterfactualExcludedCandidateCount = Number.isInteger(structural.kCoreMembershipCounterfactualExcludedCandidateCount) ? structural.kCoreMembershipCounterfactualExcludedCandidateCount : 0;
      structuralKPlexMissingPairsBySetKey = isRecord(structural.kPlexMissingPairsBySetKey) ? structural.kPlexMissingPairsBySetKey : {};
      structuralKPlexMaximalityBySetKey = isRecord(structural.kPlexMaximalityBySetKey) ? structural.kPlexMaximalityBySetKey : {};
      structuralKPlexMembershipDiagnosis = isRecord(structural.kPlexMembershipDiagnosis) ? structural.kPlexMembershipDiagnosis as any : null;
      structuralKPlexMembershipDiagnosisTargetNodeId = typeof structural.kPlexMembershipDiagnosisTargetNodeId === "string" && existingNodeIds.has(structural.kPlexMembershipDiagnosisTargetNodeId) ? structural.kPlexMembershipDiagnosisTargetNodeId : "";
      structuralKPlexMembershipDiagnosisError = typeof structural.kPlexMembershipDiagnosisError === "string" ? structural.kPlexMembershipDiagnosisError : "";
      structuralKPlexMembershipDiagnosisTimeMs = Number.isFinite(structural.kPlexMembershipDiagnosisTimeMs) ? structural.kPlexMembershipDiagnosisTimeMs : undefined;
      structuralKPlexMembershipCounterfactual = isRecord(structural.kPlexMembershipCounterfactual) ? structural.kPlexMembershipCounterfactual as any : null;
      structuralKPlexMembershipCounterfactualError = typeof structural.kPlexMembershipCounterfactualError === "string" ? structural.kPlexMembershipCounterfactualError : "";
      structuralKPlexMembershipCounterfactualTimeMs = Number.isFinite(structural.kPlexMembershipCounterfactualTimeMs) ? structural.kPlexMembershipCounterfactualTimeMs : undefined;
      structuralKPlexMembershipCounterfactualCandidateCount = Number.isInteger(structural.kPlexMembershipCounterfactualCandidateCount) ? structural.kPlexMembershipCounterfactualCandidateCount : 0;
      structuralKCoreSupportBySetKey = isRecord(structural.kCoreSupportBySetKey) ? structural.kCoreSupportBySetKey : {};
      structuralKCorePeelingBySetKey = isRecord(structural.kCorePeelingBySetKey) ? structural.kCorePeelingBySetKey : {};
      structuralExplainKCoreExclusions = structural.explainKCoreExclusions === true;
      structuralExplainCommunityContributions = structural.explainCommunityContributions === true;
      structuralExplainPathMinimality = structural.explainPathMinimality === true;
      structuralExplainTypedPathNoRoute = structural.explainTypedPathNoRoute === true;
      structuralDominatingSetSupportBySetKey = isRecord(structural.dominatingSetSupportBySetKey) ? structural.dominatingSetSupportBySetKey : {};
      structuralDominatingSetUncoverableTargetNodeIds = validNodeSet(structural.dominatingSetUncoverableTargetNodeIds) ?? [];
      structuralSeparatorReachableBySetKey = isRecord(structural.separatorReachableBySetKey) ? structural.separatorReachableBySetKey : {};
      structuralPathEdgeTypeSequence = Array.isArray(structural.pathEdgeTypeSequence) ? structural.pathEdgeTypeSequence.filter((value: unknown) => typeof value === "string") : [];
      structuralPathEdgeIdsByStep = Array.isArray(structural.pathEdgeIdsByStep) ? structural.pathEdgeIdsByStep : [];
      structuralPathTemporalSemantics = ["static", "commonTime", "orderedByStart"].includes(structural.pathTemporalSemantics) ? structural.pathTemporalSemantics : "static";
      structuralPathStrictTemporalOrder = structural.pathStrictTemporalOrder === true;
      structuralPathCommonTimeValue = Number.isFinite(structural.pathCommonTimeValue) ? structural.pathCommonTimeValue : undefined;
      structuralPathStartTimeValuesByStep = Array.isArray(structural.pathStartTimeValuesByStep) ? structural.pathStartTimeValuesByStep : [];
      structuralPathMinimality = isRecord(structural.pathMinimality) ? structural.pathMinimality as any : undefined;
      structuralPathNoRouteCertificate = isRecord(structural.pathNoRouteCertificate) ? structural.pathNoRouteCertificate as any : undefined;
      structuralTypedPathNoRouteCertificate = isRecord(structural.typedPathNoRouteCertificate) ? structural.typedPathNoRouteCertificate as any : undefined;
      structuralTypedPathCounterfactuals = Array.isArray(structural.typedPathCounterfactuals) ? structural.typedPathCounterfactuals : [];
      structuralTypedPathCounterfactualWhyNot = isRecord(structural.typedPathCounterfactualWhyNot) ? structural.typedPathCounterfactualWhyNot as any : undefined;
      structuralTypedPathCounterfactualWhyNotError = typeof structural.typedPathCounterfactualWhyNotError === "string" ? structural.typedPathCounterfactualWhyNotError : "";
      structuralTypedPathCounterfactualHasRun = structural.typedPathCounterfactualHasRun === true;
      structuralTypedPathCounterfactualError = typeof structural.typedPathCounterfactualError === "string" ? structural.typedPathCounterfactualError : "";
      structuralTypedPathCounterfactualTimeMs = Number.isFinite(structural.typedPathCounterfactualTimeMs) ? structural.typedPathCounterfactualTimeMs : undefined;
      structuralTypedPathCounterfactualExcludedCandidateCount = Number.isInteger(structural.typedPathCounterfactualExcludedCandidateCount) ? structural.typedPathCounterfactualExcludedCandidateCount : 0;
      selectedPathStartId = typeof structural.selectedPathStartId === "string" && existingNodeIds.has(structural.selectedPathStartId) ? structural.selectedPathStartId : "";
      selectedPathGoalId = typeof structural.selectedPathGoalId === "string" && existingNodeIds.has(structural.selectedPathGoalId) ? structural.selectedPathGoalId : "";
    }

    if (isRecord(state.integrity)) {
      integrityResults = Array.isArray(state.integrity.results) ? state.integrity.results : [];
      integrityHasRun = state.integrity.hasRun === true;
      integrityTimeMs = Number.isFinite(state.integrity.timeMs) ? state.integrity.timeMs : undefined;
      integrityError = typeof state.integrity.error === "string" ? state.integrity.error : "";
      integrityRepairProposal = isRecord(state.integrity.repairProposal) ? state.integrity.repairProposal as any : null;
      integrityRepairError = typeof state.integrity.repairError === "string" ? state.integrity.repairError : "";
    }

    if (isRecord(state.motif)) {
      const motif = state.motif;
      selectedMotifTemplateIndex = typeof motif.selectedTemplateIndex === "string" && motifTemplates[Number(motif.selectedTemplateIndex)] ? motif.selectedTemplateIndex : "0";
      selectedMotifGroup = typeof motif.selectedGroup === "string" && availableGroups.includes(motif.selectedGroup) ? motif.selectedGroup : "";
      motifError = typeof motif.error === "string" ? motif.error : "";
      motifMatches = Array.isArray(motif.matches) ? motif.matches : [];
      motifHasRun = motif.hasRun === true;
      motifTimeMs = Number.isFinite(motif.timeMs) ? motif.timeMs : undefined;
      motifCount = typeof motif.count === "string" ? motif.count : undefined;
      motifCountHasRun = motif.countHasRun === true;
      motifCountError = typeof motif.countError === "string" ? motif.countError : "";
      motifCountNotice = typeof motif.countNotice === "string" ? motif.countNotice : "";
      motifCountTimeMs = Number.isFinite(motif.countTimeMs) ? motif.countTimeMs : undefined;
      motifCountPartitionCount = Number.isInteger(motif.countPartitionCount) ? motif.countPartitionCount : undefined;
      motifScenarioComparison = isRecord(motif.scenarioComparison) ? motif.scenarioComparison as any : null;
      motifScenarioComparisonError = typeof motif.scenarioComparisonError === "string" ? motif.scenarioComparisonError : "";
      motifScenarioComparisonTimeMs = Number.isFinite(motif.scenarioComparisonTimeMs) ? motif.scenarioComparisonTimeMs : undefined;
      motifNearMatches = Array.isArray(motif.nearMatches) ? motif.nearMatches : [];
      motifNearMatchHasRun = motif.nearMatchHasRun === true;
      motifNearMatchError = typeof motif.nearMatchError === "string" ? motif.nearMatchError : "";
      motifNearMatchTimeMs = Number.isFinite(motif.nearMatchTimeMs) ? motif.nearMatchTimeMs : undefined;
      motifCounterfactuals = Array.isArray(motif.counterfactuals) ? motif.counterfactuals : [];
      motifCounterfactualHasRun = motif.counterfactualHasRun === true;
      motifCounterfactualError = typeof motif.counterfactualError === "string" ? motif.counterfactualError : "";
      motifCounterfactualTimeMs = Number.isFinite(motif.counterfactualTimeMs) ? motif.counterfactualTimeMs : undefined;
      motifCounterfactualExcludedCandidateCount = Number.isInteger(motif.counterfactualExcludedCandidateCount) ? motif.counterfactualExcludedCandidateCount : 0;
      selectedSignedTriadGroup = typeof motif.signedTriadGroup === "string" && availableGroups.includes(motif.signedTriadGroup) ? motif.signedTriadGroup : "";
      signedTriadResults = Array.isArray(motif.signedTriadResults) ? motif.signedTriadResults : [];
      signedTriadHasRun = motif.signedTriadHasRun === true;
      signedTriadError = typeof motif.signedTriadError === "string" ? motif.signedTriadError : "";
      signedTriadTimeMs = Number.isFinite(motif.signedTriadTimeMs) ? motif.signedTriadTimeMs : undefined;
      signedTriadScenarioComparison = isRecord(motif.signedTriadScenarioComparison) ? motif.signedTriadScenarioComparison as any : null;
      signedTriadScenarioComparisonError = typeof motif.signedTriadScenarioComparisonError === "string" ? motif.signedTriadScenarioComparisonError : "";
      signedTriadScenarioComparisonTimeMs = Number.isFinite(motif.signedTriadScenarioComparisonTimeMs) ? motif.signedTriadScenarioComparisonTimeMs : undefined;
      focusedSignedTriadKey = typeof motif.signedTriadFocusedKey === "string" ? motif.signedTriadFocusedKey : "";
      contextualCliqueGroup = typeof motif.contextualCliqueGroup === "string" && availableGroups.includes(motif.contextualCliqueGroup) ? motif.contextualCliqueGroup : "";
      contextualCliqueEnumerateAllOptima = motif.contextualCliqueEnumerateAllOptima === true;
      contextualCliqueResults = Array.isArray(motif.contextualCliqueResults) ? motif.contextualCliqueResults : [];
      contextualCliqueHasRun = motif.contextualCliqueHasRun === true;
      contextualCliqueError = typeof motif.contextualCliqueError === "string" ? motif.contextualCliqueError : "";
      contextualCliqueTimeMs = Number.isFinite(motif.contextualCliqueTimeMs) ? motif.contextualCliqueTimeMs : undefined;
      lastGraph2DAnalysisKind = typeof motif.lastGraph2DAnalysisKind === "string" ? motif.lastGraph2DAnalysisKind : "";
    }

    if (isRecord(state.provenance)) {
      const provenance = state.provenance;
      provenanceScenarioComparison = isRecord(provenance.cliqueComparison) ? provenance.cliqueComparison as any : null;
      provenanceScenarioAnalysisError = typeof provenance.cliqueComparisonError === "string" ? provenance.cliqueComparisonError : "";
      provenanceScenarioSelectedGroup = typeof provenance.cliqueSelectedGroup === "string" ? provenance.cliqueSelectedGroup : "";
      provenanceScenarioConfidenceThreshold = Number.isFinite(provenance.cliqueConfidenceThreshold) ? provenance.cliqueConfidenceThreshold : null;
      provenanceScenarioTimelineWindow = typeof provenance.cliqueTimelineWindow === "string" ? provenance.cliqueTimelineWindow : "";
      provenanceScenarioViewFilters = (isRecord(provenance.cliqueViewFilters) ? provenance.cliqueViewFilters : { types: [], groups: [] }) as any;
      provenanceKCoreScenarioComparison = isRecord(provenance.kCoreComparison) ? provenance.kCoreComparison as any : null;
      provenanceKCoreScenarioComparisonError = typeof provenance.kCoreComparisonError === "string" ? provenance.kCoreComparisonError : "";
      provenanceKCoreScenarioSelectedGroup = typeof provenance.kCoreSelectedGroup === "string" ? provenance.kCoreSelectedGroup : "";
      provenanceKCoreScenarioConfidenceThreshold = Number.isFinite(provenance.kCoreConfidenceThreshold) ? provenance.kCoreConfidenceThreshold : null;
      provenanceKCoreScenarioTimelineWindow = typeof provenance.kCoreTimelineWindow === "string" ? provenance.kCoreTimelineWindow : "";
      provenanceKCoreScenarioViewFilters = (isRecord(provenance.kCoreViewFilters) ? provenance.kCoreViewFilters : { types: [], groups: [] }) as any;
      provenanceKPlexScenarioComparison = isRecord(provenance.kPlexComparison) ? provenance.kPlexComparison as any : null;
      provenanceKPlexScenarioComparisonError = typeof provenance.kPlexComparisonError === "string" ? provenance.kPlexComparisonError : "";
      provenanceKPlexScenarioSelectedGroup = typeof provenance.kPlexSelectedGroup === "string" ? provenance.kPlexSelectedGroup : "";
      provenanceKPlexScenarioConfidenceThreshold = Number.isFinite(provenance.kPlexConfidenceThreshold) ? provenance.kPlexConfidenceThreshold : null;
      provenanceKPlexScenarioTimelineWindow = typeof provenance.kPlexTimelineWindow === "string" ? provenance.kPlexTimelineWindow : "";
      provenanceKPlexScenarioViewFilters = (isRecord(provenance.kPlexViewFilters) ? provenance.kPlexViewFilters : { types: [], groups: [] }) as any;
      provenanceComponentScenarioComparison = isRecord(provenance.componentComparison) ? provenance.componentComparison as any : null;
      provenanceComponentScenarioComparisonError = typeof provenance.componentComparisonError === "string" ? provenance.componentComparisonError : "";
      provenanceComponentScenarioSelectedGroup = typeof provenance.componentSelectedGroup === "string" ? provenance.componentSelectedGroup : "";
      provenanceComponentScenarioTargetNodeId = typeof provenance.componentTargetNodeId === "string" && existingNodeIds.has(provenance.componentTargetNodeId) ? provenance.componentTargetNodeId : "";
      provenanceComponentScenarioConfidenceThreshold = Number.isFinite(provenance.componentConfidenceThreshold) ? provenance.componentConfidenceThreshold : null;
      provenanceComponentScenarioTimelineWindow = typeof provenance.componentTimelineWindow === "string" ? provenance.componentTimelineWindow : "";
      provenanceComponentScenarioViewFilters = (isRecord(provenance.componentViewFilters) ? provenance.componentViewFilters : { types: [], groups: [] }) as any;
      provenanceDominatingSetScenarioComparison = isRecord(provenance.dominatingSetComparison) ? provenance.dominatingSetComparison as any : null;
      provenanceDominatingSetScenarioComparisonError = typeof provenance.dominatingSetComparisonError === "string" ? provenance.dominatingSetComparisonError : "";
      provenanceDominatingSetScenarioCandidateGroup = typeof provenance.dominatingSetCandidateGroup === "string" ? provenance.dominatingSetCandidateGroup : "";
      provenanceDominatingSetScenarioTargetGroup = typeof provenance.dominatingSetTargetGroup === "string" ? provenance.dominatingSetTargetGroup : "";
      provenanceDominatingSetScenarioConfidenceThreshold = Number.isFinite(provenance.dominatingSetConfidenceThreshold) ? provenance.dominatingSetConfidenceThreshold : null;
      provenanceDominatingSetScenarioTimelineWindow = typeof provenance.dominatingSetTimelineWindow === "string" ? provenance.dominatingSetTimelineWindow : "";
      provenanceDominatingSetScenarioViewFilters = (isRecord(provenance.dominatingSetViewFilters) ? provenance.dominatingSetViewFilters : { types: [], groups: [] }) as any;
      provenanceDominatingSetScenarioWhyNot = isRecord(provenance.dominatingSetWhyNot) ? provenance.dominatingSetWhyNot as any : null;
    }

    if (isRecord(state.graph2D)) {
      graph2DNodeAnnotations = isRecord(state.graph2D.nodeAnnotations) ? state.graph2D.nodeAnnotations : {};
      graph2DEdgeAnnotations = isRecord(state.graph2D.edgeAnnotations) ? state.graph2D.edgeAnnotations : {};
      graph2DHypotheticalLinks = Array.isArray(state.graph2D.hypotheticalLinks) ? state.graph2D.hypotheticalLinks : [];
      graph2DOverlayResultLabel = typeof state.graph2D.overlayResultLabel === "string" ? state.graph2D.overlayResultLabel : "";
      graph2DOverlayCompletionLabel = typeof state.graph2D.overlayCompletionLabel === "string" ? state.graph2D.overlayCompletionLabel : "";
      graph2DCommunityPartitionIndex = Number.isInteger(state.graph2D.communityPartitionIndex) ? state.graph2D.communityPartitionIndex : -1;
      graph2DCommunityIndex = Number.isInteger(state.graph2D.communityIndex) ? state.graph2D.communityIndex : -1;
    }

    const focus = isRecord(state.focus) ? state.focus : {};
    const nodeIds = validNodeSet(focus.nodeIds) ?? [];
    const edgeIds = new Set((originalData.links ?? []).map((link: any) => getStructuralEdgeIdentity(link)));
    const selectedEdgeIds = Array.isArray(focus.edgeIds)
      ? focus.edgeIds.filter((id: unknown) => typeof id === "string" && edgeIds.has(id))
      : [];
    cliqueNodes = new Set(nodeIds);
    highlightedEdgeIds = new Set(selectedEdgeIds);
    const selectedNodeId = focus.selectedNodeId;
    if (typeof selectedNodeId === "string" && existingNodeIds.has(selectedNodeId)) {
      selectedId = selectedNodeId;
      rootSelectedId = selectedNodeId;
      if (focus.showNodeDetails !== false) {
        selectedNode = getNodeById(selectedNodeId, originalData.nodes);
        selectedDetails = buildUiDetails(selectedNode);
      } else {
        selectedNode = null;
        selectedDetails = null;
      }
    }
    showSolverPanel = panel === "clique";
    showStructuralPanel = panel === "structural";
    showIntegrityPanel = panel === "integrity";
    showMotifPanel = panel === "motif";
    showProvenanceScenarioAnalysisPanel = panel === "provenance";
    lastAnalysisPanel = resultPanel;
    refreshLinkVisuals();
    refreshNodeVisuals();
  }

  function restoreArchivedAnalysis(id: string) {
    const archivedIndex = analysisArchiveEntries.findIndex((entry) => entry.id === id);
    if (archivedIndex < 0) return;
    const archived = analysisArchiveEntries[archivedIndex];
    const currentEntry = analysisArchiveEntry(lastCapturedAnalysisSession);
    const nextEntries = analysisArchiveEntries.filter((entry) => entry.id !== id);
    if (currentEntry && currentEntry.id !== archived.id) nextEntries.unshift(currentEntry);
    publishAnalysisArchive(nextEntries);
    activeAnalysisId = archived.id;
    activeAnalysisCreatedAt = archived.savedAt;
    const archivedState = {
      ...archived.state,
      panel: archived.state.resultPanel ?? archived.state.panel,
      analysisId: archived.id,
      analysisCreatedAt: archived.savedAt
    };
    const snapshot: WorkbenchAnalysisSessionSnapshot = {
      version: 1,
      graphKey: sessionGraphKey,
      state: archivedState
    };
    restoreAnalysisSession(snapshot);
    persistCurrentAnalysisSession();
  }

  function clearAnalysisArchive() {
    publishAnalysisArchive([]);
  }

  // ---------------- HISTORY ----------------
  let history: WorkbenchHistoryEntry[] = [];
  let historyRestoredForGraph = false;

  function updateHistory(entries: WorkbenchHistoryEntry[]) {
    history = entries.slice(-MAX_WORKBENCH_HISTORY_ENTRIES);
    onHistoryChange(history);
  }

  function restoreInitialHistoryForGraph() {
    if (historyRestoredForGraph) return;
    const nodeIds = new Set<string>((originalData?.nodes ?? []).map((node: any) => String(node.id)));
    history = filterWorkbenchHistoryForNodeIds(initialHistorySnapshot, nodeIds);
    historyRestoredForGraph = true;
    onHistoryChange(history);
  }

  function startHistory(id: string, label: string) {
    updateHistory([{ id, label }]);
  }

  function pushHistory(id: string, label: string) {
    if (history[history.length - 1]?.id === id) return;
    updateHistory([...history, { id, label }]);
  }

  function truncateHistoryTo(id: string) {
    const idx = history.findIndex(h => h.id === id);
    if (idx >= 0) updateHistory(history.slice(0, idx + 1));
  }

  function clearHistory() {
    if (!historyRestoredForGraph) {
      history = [];
      return;
    }
    updateHistory([]);
  }

  // ---------------- AUTOCOMPLETE ----------------
  let searchIndex: { id: string; label: string; norm: string }[] = [];
  let suggestions: { id: string; label: string }[] = [];
  let showSuggestions = false;
  let searchMessage = "";

  function buildSearchIndexFromNodes(nodes: any[]) {
    searchIndex = nodes.map((n) => ({
      id: n.id,
      label: n.label,
      norm: n.label.toLowerCase(),
    }));

    suggestions = [];
    showSuggestions = false;
  }

  function rankCandidates(q: string) {
    const text = q.trim().toLowerCase();
    if (text.length < 2) {
      suggestions = [];
      showSuggestions = false;
      return;
    }

    const ranked = searchIndex
      .map((item) => {
        let score = 0;
        if (item.norm.startsWith(text)) score += 3;
        else if (item.norm.includes(` ${text}`)) score += 2;
        else if (item.norm.includes(text)) score += 1;
        return { id: item.id, label: item.label, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.label.length - b.label.length)
      .slice(0, 7)
      .map(({ id, label }) => ({ id, label }));

    suggestions = ranked;
    showSuggestions = ranked.length > 0;
  }

  function chooseSuggestion(s: { id: string; label: string }) {
    query = s.label;
    showSuggestions = false;
    selectSearchResult(getNodeById(s.id, originalData?.nodes ?? []));
  }

  // ---------------- NODE STYLE ----------------
  function getNodeType(node: any): string {
    return node.type || "default";
  }

  function getNodeStyle(node: any) {
    const type = getNodeType(node);
    const defaultStyle = GRAPH_CONFIG.nodeTypes.default ?? {};
    const typeStyle = GRAPH_CONFIG.nodeTypes[type] ?? {};

    return {
      ...defaultStyle,
      ...typeStyle
    };
  }

  // I colori di highlight possono arrivare da nodeTypes.highlight oppure dal
  // blocco "colors" del config; i valori espliciti dell'utente vincono sui default.
  const H = {
    ...DEFAULT_GRAPH_CONFIG.nodeTypes.highlight,
    ...(RAW_CONFIG.colors ?? {}),
    ...(RAW_CONFIG.nodeTypes?.highlight ?? {})
  };

  const colorAccessor = (n: any) => {
    // Clique highlight attivo
    if (cliqueNodes.size > 0) {
      if (cliqueNodes.has(n.id)) return H.clique;
      return GRAPH_CONFIG.colors?.default ?? "#334155";
    }

    // Stato normale
    if (!selectedId) {
      return getNodeStyle(n).color ?? GRAPH_CONFIG.colors?.default ?? "#334155";
    }

    if (n.id === selectedId) return H.root;
    if (highlightedNeighbors.has(n.id)) return H.preview;
    if (neighborMap.get(selectedId)?.has(n.id)) return H.neighbor;

    return getNodeStyle(n).color ?? GRAPH_CONFIG.colors?.default ?? "#334155";
  };

  function opacityForNode(nodeId: string) {
    // Se è attivo un highlight di clique,
    // i nodi della clique restano pieni, tutti gli altri vengono spenti.
    if (cliqueNodes.size > 0) {
      return cliqueNodes.has(nodeId) ? 1 : 0.12;
    }

    // Comportamento normale basato sulla selezione del nodo
    if (!selectedId) return 1;
    if (nodeId === selectedId) return 1;
    if (highlightedNeighbors.has(nodeId)) return 1;
    if (neighborMap.get(selectedId)?.has(nodeId)) return 0.95;

    return 0.22;
  }

  function isGraphDisplayNodeVisible(node: any): boolean {
    if (focusedSignedTriadEdgeIds !== null) return cliqueNodes.has(String(node.id));
    return neighborhoodFocusNodeIds === null || neighborhoodFocusNodeIds.has(String(node.id));
  }

  function isGraphDisplayLinkVisible(link: any): boolean {
    if (focusedSignedTriadEdgeIds !== null) {
      return graphDisplayLinkMatchesIdentities(
        link as GraphDisplayLink,
        focusedSignedTriadEdgeIds,
        (edge: GraphDisplayLink) => getStructuralEdgeIdentity(edge)
      );
    }
    if (neighborhoodFocusNodeIds === null) return true;
    const sourceId = String(getLinkEndId(link.source));
    const targetId = String(getLinkEndId(link.target));
    return neighborhoodFocusNodeIds.has(sourceId) && neighborhoodFocusNodeIds.has(targetId);
  }

  function getDisplayLinkColor(link: any): string {
    if (highlightedEdgeIds.size > 0) {
      return graphDisplayLinkMatchesIdentities(
        link as GraphDisplayLink,
        highlightedEdgeIds,
        (edge: GraphDisplayLink) => getStructuralEdgeIdentity(edge)
      ) ? H.clique : "#334155";
    }
    return getGraphDisplayLinkColor(link as GraphDisplayLink, edgeTypeColors);
  }

  function getDisplayLinkLabel(link: any): HTMLElement {
    const label = document.createElement("span");
    const typeDetails = formatGraphDisplayEdgeTypeTooltip(
      link as GraphDisplayLink,
      data?.direction === "directed" ? "directed" : "undirected"
    );
    if (aggregateParallelEdgesForDisplay) {
      const aggregateDetails = formatGraphDisplayLinkTooltip(link as AggregatedGraphDisplayLink);
      label.textContent = edgeTypeColorsConfigured
        ? `${typeDetails}; ${aggregateDetails}`
        : aggregateDetails;
    } else {
      label.textContent = typeDetails;
    }
    return label;
  }

  function refreshLinkVisuals() {
    if (!graph3D) return;
    if (focusedSignedTriadEdgeIds !== null && (
      focusedSignedTriadKey === "" ||
      focusedSignedTriadEdgeIds.size !== highlightedEdgeIds.size ||
      [...focusedSignedTriadEdgeIds].some((edgeId) => !highlightedEdgeIds.has(edgeId))
    )) {
      focusedSignedTriadEdgeIds = null;
      focusedSignedTriadKey = "";
    }
    const displayedNodeCount = neighborhoodFocusInfo?.nodeCount ?? data?.nodes?.length ?? 0;
    const displayedLinkCount = neighborhoodFocusInfo ? graphDisplayLinkCount : data?.links?.length ?? 0;
    graph3D
      .nodeVisibility(isGraphDisplayNodeVisible)
      .linkVisibility(isGraphDisplayLinkVisible)
      .linkColor(getDisplayLinkColor)
      .linkOpacity(getGraphLinkOpacity({
        configuredOpacity: GRAPH_CONFIG.graph.linkOpacity,
        nodeCount: displayedNodeCount,
        linkCount: displayedLinkCount,
        directed: data?.direction === "directed",
        hasHighlightedLinks: highlightedEdgeIds.size > 0
      }))
      .linkWidth((link: any) => {
        const baseWidth = Number(GRAPH_CONFIG.graph.linkWidth) || 0.4;
        if (highlightedEdgeIds.size === 0) return baseWidth;
        return graphDisplayLinkMatchesIdentities(link, highlightedEdgeIds, (edge: GraphDisplayLink) => getStructuralEdgeIdentity(edge))
          ? Math.max(baseWidth * 4, 1.5)
          : Math.max(baseWidth * 0.5, 0.2);
      });
  }

  // ---------------- ICON + RING ----------------
  const AUTO_FALLBACK_PALETTE = [
    "#38bdf8",
    "#22c55e",
    "#f59e0b",
    "#a78bfa",
    "#ef4444",
    "#14b8a6",
    "#f97316",
    "#e879f9",
    "#84cc16",
    "#06b6d4"
  ];

  function hashString(value: string): number {
    let h = 0;

    for (let i = 0; i < value.length; i++) {
      h = ((h << 5) - h) + value.charCodeAt(i);
      h |= 0;
    }

    return Math.abs(h);
  }

  function getDeterministicFallbackColor(node: any): string {
    const type = getNodeType(node);
    const typeStyle = GRAPH_CONFIG.nodeTypes?.[type];

    if (typeStyle?.color) return typeStyle.color;

    const key = `${node.type ?? "default"}:${node.label ?? node.id ?? ""}`;

    return AUTO_FALLBACK_PALETTE[
      hashString(key) % AUTO_FALLBACK_PALETTE.length
    ];
  }

  function getConfiguredNodeIcon(node: any): string | null {
    const type = getNodeType(node);

    if (type === "logo") return null;

    const rawTypeIcon = RAW_CONFIG?.nodeTypes?.[type]?.icon;
    if (rawTypeIcon !== undefined) return rawTypeIcon;

    const defaultKnownTypeIcon = DEFAULT_GRAPH_CONFIG?.nodeTypes?.[type]?.icon;
    if (defaultKnownTypeIcon !== undefined && type !== "default") {
      return defaultKnownTypeIcon;
    }

    const rawDefaultIcon = RAW_CONFIG?.nodeTypes?.default?.icon;
    if (rawDefaultIcon !== undefined) return rawDefaultIcon;

    return null;
  }

  // Path delle icone che hanno fallito il caricamento: per questi nodi si usa
  // la pallina di fallback invece di uno sprite vuoto.
  const failedIconPaths = new Set<string>();

  function getExplicitNodeIcon(node: any): string | null {
    const path = normalizeAssetPath(getConfiguredNodeIcon(node));
    if (!path || failedIconPaths.has(path)) return null;
    return path;
  }

  const textureLoader = new THREE.TextureLoader();
  const textureCache = new Map<string, THREE.Texture>();

  function normalizeAssetPath(path: string | undefined | null): string | null {
    if (!path || typeof path !== "string") return null;

    const value = path.trim();
    if (!value) return null;

    // URL assoluti esterni, data URL e blob URL restano invariati
    if (/^(https?:\/\/|data:image\/|blob:)/i.test(value)) {
      return value;
    }

    // Path locali: sono relativi alla cartella static/ e vanno serviti sotto
    // il base path dell'app ("" in dev, "/KliqueASP" su GitHub Pages).
    const relative = value.replace(/^\/+/, "");
    const baseNoSlash = base.replace(/^\/+/, "");

    // Compatibilità con config che includono già il base path
    // (es. "KliqueASP/assets/...").
    if (baseNoSlash && relative.startsWith(`${baseNoSlash}/`)) {
      return `/${relative}`;
    }

    return `${base}/${relative}`;
  }

  function getTexture(safePath: string) {
    if (!textureCache.has(safePath)) {
      const tex = textureLoader.load(
        safePath,
        undefined,
        undefined,
        (err) => {
          console.warn("❌ Texture non caricabile:", safePath, err);
          failedIconPaths.add(safePath);
          textureCache.delete(safePath);
          rebuildNodeObjects();
        }
      );

      tex.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(safePath, tex);
    }

    return textureCache.get(safePath) ?? null;
  }

  const R = GRAPH_CONFIG.node.ring;
  const ringGeometry = new THREE.RingGeometry(R.innerRadius, R.outerRadius, R.segments);

  // Geometrie condivise della pallina di fallback.
  const ballGlowGeometry = new THREE.SphereGeometry(4.1, 24, 24);
  const ballCoreGeometry = new THREE.SphereGeometry(2.65, 32, 32);
  const ballHighlightGeometry = new THREE.SphereGeometry(0.75, 16, 16);

  function makeIconSprite(tex: THREE.Texture, size = 14) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthWrite: false
      })
    );

    sprite.scale.set(size, size, 1);
    return sprite;
  }

  function makeFallbackNodeBall(node: any) {
    const group = new THREE.Group();
    const color = new THREE.Color(getDeterministicFallbackColor(node));

    const glow = new THREE.Mesh(
      ballGlowGeometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false
      })
    );

    const core = new THREE.Mesh(
      ballCoreGeometry,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true
      })
    );

    const highlight = new THREE.Mesh(
      ballHighlightGeometry,
      new THREE.MeshBasicMaterial({
        color: "#ffffff",
        transparent: true,
        depthWrite: false
      })
    );

    highlight.position.set(-0.85, 0.95, 1.9);

    group.add(glow);
    group.add(core);
    group.add(highlight);

    return { group, glow, core, highlight };
  }

  function makeRing() {
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    const s = GRAPH_CONFIG.node.ring.scale;
    ring.scale.set(s, s, s);
    return ring;
  }

  // Le texture delle label dipendono solo dal testo: le riusiamo.
  const labelTextureCache = new Map<string, THREE.CanvasTexture>();

  function getLabelTexture(text: string) {
    let texture = labelTextureCache.get(text);
    if (texture) return texture;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const L = GRAPH_CONFIG.node.label;

    ctx.font = L.font;
    canvas.width = ctx.measureText(text).width + 20;
    canvas.height = 36;

    ctx.font = L.font;
    ctx.fillStyle = "white";
    ctx.fillText(text, 10, 26);

    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    labelTextureCache.set(text, texture);

    return texture;
  }

  function refreshNodeLabelLayout() {
    if (!graph3D || !nodeLabelsVisible || !Array.isArray(data?.nodes)) return;
    const viewportHeight = graph3D.height();
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;

    const camera: any = graph3D.camera();
    const fieldOfView = Number(camera?.getEffectiveFOV?.() ?? camera?.fov ?? 50);
    const worldHeightAtUnitDistance = 2 * Math.tan((fieldOfView * Math.PI) / 360);
    const labelScale = GRAPH_CONFIG.node.label.scale;
    const labelWidth = Number(labelScale?.[0]) || 12;
    const labelHeight = Number(labelScale?.[1]) || 5;
    const candidates = (graph3D.graphData()?.nodes ?? data.nodes)
      .filter((node: any) => isGraphDisplayNodeVisible(node))
      .filter((node: any) => [node.x, node.y, node.z].every((coordinate) => Number.isFinite(Number(coordinate))))
      .map((node: any) => {
        const labelY = Number(node.y) + (Number(GRAPH_CONFIG.node.label.offsetY) || 0);
        const screen = graph3D.graph2ScreenCoords(Number(node.x), labelY, Number(node.z));
        const distance = Math.max(1, Math.hypot(
          Number(camera?.position?.x ?? 0) - Number(node.x),
          Number(camera?.position?.y ?? 0) - labelY,
          Number(camera?.position?.z ?? 0) - Number(node.z)
        ));
        const pixelsPerWorldUnit = viewportHeight / (distance * worldHeightAtUnitDistance);
        const nodeId = String(node.id);
        const degree = neighborMap.get(nodeId)?.size ?? 0;
        const priority = (nodeId === selectedId ? 1_000_000 : 0) +
          (nodeId === hoveredGraphNodeId ? 500_000 : 0) + degree;

        return {
          id: nodeId,
          x: screen.x,
          y: screen.y,
          width: labelWidth * pixelsPerWorldUnit * 1.15,
          height: labelHeight * pixelsPerWorldUnit * 1.2,
          priority
        };
      });

    const visibleIds = getNonOverlappingGraphNodeLabelIds(candidates, 7);
    const previousIds = nodeLabelLayoutVisibleIds;
    if (previousIds && previousIds.size === visibleIds.size && [...previousIds].every((id) => visibleIds.has(id))) return;

    nodeLabelLayoutVisibleIds = visibleIds;
    for (const node of data.nodes) {
      const label = node.__threeObj?.userData?.kq?.label;
      if (label) label.visible = nodeLabelsVisible && visibleIds.has(String(node.id));
    }
  }

  function makeLabel(text: string) {
    const L = GRAPH_CONFIG.node.label;

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getLabelTexture(text),
        transparent: true,
        depthWrite: false
      })
    );

    sprite.scale.set(L.scale[0], L.scale[1], 1);
    return sprite;
  }

  function makeNodeObject(node: any) {
    const group = new THREE.Group();

    const iconPath = getExplicitNodeIcon(node);
    const tex = iconPath ? getTexture(iconPath) : null;

    let icon: THREE.Sprite | null = null;
    let ball: ReturnType<typeof makeFallbackNodeBall> | null = null;

    // 🔹 ICONA se disponibile/configurata
    if (tex) {
      icon = makeIconSprite(tex, GRAPH_CONFIG.node.iconSize);
      group.add(icon);
    } else {
      // 🔹 fallback visiva node-like: pallina 3D pulita, senza iniziali
      ball = makeFallbackNodeBall(node);
      group.add(ball.group);
    }

    // 🔹 ring sempre
    const ring = makeRing();
    group.add(ring);

    // 🔹 label
    const label = makeLabel(node.label);
    label.position.y = GRAPH_CONFIG.node.label.offsetY;
    group.add(label);

    group.userData.kq = { icon, ball, ring, label };
    applyNodeVisual(node, group);

    return group;
  }

  // Aggiorna colore/opacità di un oggetto già creato, senza ricostruirlo.
  function applyNodeVisual(node: any, obj: any) {
    const kq = obj?.userData?.kq;
    if (!kq) return;

    const o = opacityForNode(node.id);

    kq.ring.material.color.set(colorAccessor(node));
    kq.ring.material.opacity = Math.min(0.95, o);

    if (kq.icon) kq.icon.material.opacity = o;

    if (kq.ball) {
      kq.ball.glow.material.opacity = Math.min(0.18, o * 0.18);
      kq.ball.core.material.opacity = Math.min(1, o);
      kq.ball.highlight.material.opacity = Math.min(0.55, o * 0.55);
    }

    kq.label.visible = nodeLabelsVisible && (
      nodeLabelLayoutVisibleIds === null || nodeLabelLayoutVisibleIds.has(String(node.id))
    );
    kq.label.material.opacity = Math.max(0.18, o);
  }

  function refreshNodeVisuals() {
    for (const node of data?.nodes ?? []) {
      applyNodeVisual(node, node.__threeObj);
    }
  }

  function closeToolbarMenus() {
    if (analysisMenuElement) analysisMenuElement.open = false;
    if (viewMenuElement) viewMenuElement.open = false;
  }

  function closeAnalysisPanels() {
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
  }

  function openDataPanel() {
    closeToolbarMenus();
    closeAnalysisPanels();
    jsonEditorProps?.onOpen?.();
  }

  async function openProjectPickerFromEmptyState() {
    openDataPanel();
    await tick();
    jsonEditorComponent?.openProjectPicker?.();
  }

  function openAnalysisPanel(panel: "clique" | "structural" | "integrity" | "motif" | "provenance") {
    const previousPanel = activeAnalysisPanel();
    if (previousPanel && previousPanel !== panel && analysisStateHasResult(lastCapturedAnalysisSession?.state ?? {})) {
      persistCurrentAnalysisSession(false, true);
    }
    clearGraph2DOverlay();
    showSolverPanel = panel === "clique";
    showStructuralPanel = panel === "structural";
    showIntegrityPanel = panel === "integrity";
    showMotifPanel = panel === "motif";
    showProvenanceScenarioAnalysisPanel = panel === "provenance";
    jsonEditorProps?.onClose?.();
    if (panel === "structural") {
      structuralError = "";
      lastGraph2DAnalysisKind = "structural";
    }
    if (panel === "integrity") integrityError = "";
    if (panel === "motif") motifError = "";
    if (panel === "provenance") lastGraph2DAnalysisKind = "provenanceClique";
    closeToolbarMenus();
    persistCurrentAnalysisSession();
  }

  function closeAnalysisPanel(panel: "clique" | "structural" | "integrity" | "motif" | "provenance") {
    if (panel === "clique") showSolverPanel = false;
    if (panel === "structural") showStructuralPanel = false;
    if (panel === "integrity") showIntegrityPanel = false;
    if (panel === "motif") showMotifPanel = false;
    if (panel === "provenance") showProvenanceScenarioAnalysisPanel = false;
    persistCurrentAnalysisSession();
  }

  function launchMaximumCliqueOrRestart() {
    clearGraph2DOverlay();
    closeToolbarMenus();
    if (clingoWorkerStatus === "error") restartClingoWorker();
    else runMaximumClique();
  }

  function toggleNodeLabels() {
    nodeLabelsVisible = !nodeLabelsVisible;
    refreshNodeVisuals();
    if (nodeLabelsVisible) refreshNodeLabelLayout();
  }

  // Ricostruzione completa (solo quando cambia la scelta icona/fallback).
  function rebuildNodeObjects() {
    graph3D?.nodeThreeObject((node: any) => makeNodeObject(node));
  }

  // ---------------- GRAPH HELPERS ----------------
  function buildNeighborMap() {
    neighborMap = new Map();

    data.links.forEach((l: any) => {
      const s = getLinkEndId(l.source);
      const t = getLinkEndId(l.target);

      if (!neighborMap.has(s)) neighborMap.set(s, new Set());
      if (!neighborMap.has(t)) neighborMap.set(t, new Set());

      neighborMap.get(s)!.add(t);
      neighborMap.get(t)!.add(s);
    });
  }

  // ---------------- FILTER ACTIONS ----------------
  function toggleTypeFilter(type: string, checked: boolean) {
    if (solverRunning) return;
    const next = new Set(selectedTypes);
    if (checked) next.add(type);
    else next.delete(type);
    if (next.size === selectedTypes.size && [...next].every((value) => selectedTypes.has(value))) return;
    clearAnalysisResultsForProjectionChange();
    selectedTypes = next;
    recomputeGraphData();
    refreshLinkVisuals();
  }

  function toggleGroupFilter(group: string, checked: boolean) {
    if (solverRunning) return;
    const next = new Set(selectedGroupsFilter);
    if (checked) next.add(group);
    else next.delete(group);
    if (next.size === selectedGroupsFilter.size && [...next].every((value) => selectedGroupsFilter.has(value))) return;
    clearAnalysisResultsForProjectionChange();
    selectedGroupsFilter = next;
    recomputeGraphData();
    refreshLinkVisuals();
  }

  // ---------------- TIMELINE ----------------
  function applyTimelineFilter() {
    if (solverRunning || !originalData) return;
    clearAnalysisResultsForProjectionChange();
    console.log("[TL] applyTimelineFilter", {
      currentStart,
      currentEnd,
      nodes: originalData?.nodes?.length
    });

    recomputeGraphData();
    refreshLinkVisuals();

    console.log("[TL] filteredNodes:", data.nodes.length);
    console.log("[TL] filteredLinks:", data.links.length);
  }

  // ---------------- INTERACTIONS ----------------
  function focusNode(id: string) {
    const node = data.nodes.find((n: any) => n.id === id);

    console.log("🎯 FOCUS NODE:", node);

    if (!node) {
      console.warn("❌ Nodo non presente nel grafo filtrato");
      return;
    }

    console.log("📍 POS:", node.x, node.y, node.z);

    if (node.x == null) {
      console.warn("❌ Nodo SENZA coordinate (simulation non pronta)");
      return;
    }

    graph3D.cameraPosition(
      { x: node.x * 2, y: node.y * 2, z: node.z * 2 + 40 },
      { x: node.x, y: node.y, z: node.z },
      graphTransitionDuration(900)
    );
  }

  function selectNode(id: string) {
    const node = data.nodes.find((n: any) => n.id === id);
    if (!node) return;

    const degree = neighborMap.get(id)?.size ?? 0;

    selectedNode = { ...node, degree };
    updateSelectedDetails(id);
  }

  function focusGraphNeighborhood(rootNodeId: string, maxHops: number, direction: NeighborhoodDirection) {
    const visibleNodeIds = data.nodes.map((node: any) => String(node.id));
    const focusNodeIds = getGraphNeighborhoodNodeIds(
      visibleNodeIds,
      data.links,
      rootNodeId,
      { maxHops, direction, defaultGraphDirection: graphDirection }
    );
    neighborhoodFocusNodeIds = focusNodeIds;
    neighborhoodFocusInfo = {
      rootNodeId,
      maxHops,
      direction,
      nodeCount: focusNodeIds.size,
      recordCount: 0,
      renderedLinkCount: 0
    };
    focusedSignedTriadEdgeIds = null;
    focusedSignedTriadKey = "";
    refreshRenderedGraphData();
    refreshLinkVisuals();
    graph3D?.zoomToFit(graphTransitionDuration(500), 100, (node: any) => focusNodeIds.has(String(node.id)));
  }

  function clearGraphNeighborhoodFocus() {
    if (neighborhoodFocusNodeIds === null) return;
    neighborhoodFocusNodeIds = null;
    neighborhoodFocusInfo = null;
    refreshRenderedGraphData();
    refreshLinkVisuals();
    graph3D?.zoomToFit(graphTransitionDuration(500), 100);
  }

  function viewNeighbor(id: string) {
    highlightedNeighbors = new Set([id]);
    focusNode(id);
    selectNode(id);
    refreshNodeVisuals();
  }

  function commitNeighbor(id: string, label: string = "") {
    rootSelectedId = id;
    selectedId = id;
    highlightedNeighbors = new Set();

    const node = getNodeById(id);
    pushHistory(id, node?.label ?? label ?? id);

    focusNode(id);
    selectNode(id);
    refreshNodeVisuals();
  }

  function backToRoot() {
    if (!rootSelectedId) return;
    highlightedNeighbors = new Set();
    focusNode(rootSelectedId);
    selectNode(rootSelectedId);
    refreshNodeVisuals();
  }

  // Seleziona id come nuovo nodo radice (click, ricerca, history, clique).
  function selectRoot(id: string, historyMode: "start" | "truncate" = "start", moveCameraToNode = true) {
    const node = getNodeById(id);
    if (!node) return;

    rootSelectedId = id;
    selectedId = id;
    highlightedNeighbors = new Set();

    if (historyMode === "start") startHistory(node.id, node.label);
    else truncateHistoryTo(id);

    if (moveCameraToNode) focusNode(id);
    selectNode(id);
    refreshNodeVisuals();
    persistCurrentAnalysisSession(true);
  }

  function selectWitnessRoot(nodeIds: string[]) {
    const visibleNodeIds = [...new Set(nodeIds.map(String))].filter((id) => getNodeById(id));
    const rootId = visibleNodeIds[0];
    if (!rootId) return;

    selectRoot(rootId, "start", false);
    // Selecting an analysis witness should keep the analysis panel in control;
    // the node details card would otherwise sit underneath it on the same side.
    selectedNode = null;
    selectedDetails = null;
    persistCurrentAnalysisSession(true);
    if (visibleNodeIds.length > 1) {
      const witnessNodeIds = new Set(visibleNodeIds);
      graph3D?.zoomToFit(
        graphTransitionDuration(500),
        graphViewFitPadding,
        (node: any) => witnessNodeIds.has(String(node.id))
      );
    } else {
      focusNode(rootId);
    }
  }

  function selectSearchResult(node: any) {
    if (!node) {
      searchMessage = "Nessun nodo trovato";
      return;
    }

    // Un nodo nascosto da filtri/timeline non può essere selezionato:
    // lo segnaliamo invece di lasciare una selezione invisibile.
    if (!getNodeById(node.id)) {
      searchMessage = `"${node.label}" è nascosto dai filtri o dalla timeline correnti`;
      return;
    }

    searchMessage = "";
    selectRoot(node.id);
  }

  function searchNode(q: string) {
    const text = q.trim().toLowerCase();
    if (!text || !originalData) return;

    // Priorità: match esatto > prefisso > sottostringa; a parità, nodi visibili.
    const rank = (n: any) => {
      const label = n.label.toLowerCase();
      const score = label === text ? 3 : label.startsWith(text) ? 2 : label.includes(text) ? 1 : 0;
      return score * 2 + (getNodeById(n.id) ? 1 : 0);
    };

    let best: any = null;
    let bestScore = 0;

    for (const n of originalData.nodes) {
      const score = rank(n);
      if (score > bestScore) {
        best = n;
        bestScore = score;
      }
    }

    selectSearchResult(bestScore >= 2 ? best : null);
  }

  function resetView() {
    const projectionChanged = selectedTypes.size > 0 || selectedGroupsFilter.size > 0 ||
      minimumEdgeConfidence !== getDefaultEdgeConfidenceThreshold() || currentStart !== GRAPH_CONFIG.timeline.start ||
      currentEnd !== GRAPH_CONFIG.timeline.end || selectedProvenanceScenarioId !== "";
    if (projectionChanged) clearAnalysisResultsForProjectionChange();

    rootSelectedId = null;
    selectedId = null;
    selectedNode = null;
    selectedDetails = null;
    highlightedNeighbors = new Set();
    cliqueNodes = new Set();
    highlightedEdgeIds = new Set();
    suggestions = [];
    showSuggestions = false;
    searchMessage = "";

    selectedTypes = new Set();
    selectedGroupsFilter = new Set();
    minimumEdgeConfidence = getDefaultEdgeConfidenceThreshold();
    selectedProvenanceScenarioId = "";

    currentStart = GRAPH_CONFIG.timeline.start;
    currentEnd = GRAPH_CONFIG.timeline.end;

    recomputeGraphData();
    refreshLinkVisuals();
    refreshNodeVisuals();
    graph3D.cameraPosition(
      { x: 0, y: 0, z: getInitialGraphCameraDistance(originalData.nodes.length) },
      { x: 0, y: 0, z: 0 },
      graphTransitionDuration(800)
    );
    persistCurrentAnalysisSession();
  }

  function clearClique() {
    cliqueNodes = new Set();
    highlightedEdgeIds = new Set();
    refreshLinkVisuals();
    refreshNodeVisuals();
    persistCurrentAnalysisSession(true);
  }

  function zoomIn() {
    const cam = graph3D.camera();
    graph3D.cameraPosition(
      { x: cam.position.x, y: cam.position.y, z: cam.position.length() * 0.75 },
      undefined,
      graphTransitionDuration(300)
    );
  }

  function zoomOut() {
    const cam = graph3D.camera();
    graph3D.cameraPosition(
      { x: cam.position.x, y: cam.position.y, z: cam.position.length() * 1.3 },
      undefined,
      graphTransitionDuration(300)
    );
  }

  function graphTransitionDuration(durationMs: number): number {
    return getGraphTransitionDuration(durationMs, reducedMotionPreference);
  }

  function fitGraphToView() {
    if (!graph3D) return;
    graph3D.zoomToFit(graphTransitionDuration(0), graphViewFitPadding);
    if (data?.nodes?.length) {
      const cameraPosition = graph3D.camera().position;
      graph3D.cameraPosition(
        {
          x: cameraPosition.x * graphViewFitScale,
          y: cameraPosition.y * graphViewFitScale,
          z: cameraPosition.z * graphViewFitScale
        },
        { x: 0, y: 0, z: 0 },
        graphTransitionDuration(500)
      );
    }
    fitOnEngineStop = graphLayoutRunning;
  }

  // ---------------- ASP ----------------
  // Modalità di enumerazione (solver.cliqueMode):
  // - "maximal": tutte le clique massimali (non estendibili) -> default
  // - "all":     tutte le clique, incluse le sotto-clique (--opt-mode=enum);
  //              è il comportamento con cui sono stati prodotti i CSV in results/
  // - "maximum": solo le clique di cardinalità massima (--opt-mode=optN)
  // Il registro del contratto decide quali valori di solver.cliqueMode sono validi.
  function getCliqueMode(): CliqueMode {
    return resolveCliqueMode(GRAPH_CONFIG.solver?.cliqueMode);
  }

  function buildAppAspFactsFromGraph(
    graphInput: unknown,
    additionalTemporalValues: readonly unknown[] = [],
    options: { includeRawTemporalValues?: boolean } = {}
  ) {
    return buildAspFactsFromGraph(graphInput, extractGroups, {
      compact: true,
      includeEdgeProvenance: false,
      additionalTemporalValues,
      temporalMetricUnits: motifTemporalMetricUnits,
      numericTimeUnit,
      ...options
    });
  }

  function buildAspFactsFromCurrentData(additionalTemporalValues: readonly unknown[] = []) {
    if (!data) return {
      facts: "",
      reverseIndex: {},
      reverseSourceIndex: {},
      reverseEdgeIndex: {},
      reverseGeneratedEdgeIndex: {},
      indexByNodeId: new Map<string, number>(),
      temporalEncoding: createAspTemporalEncoding(additionalTemporalValues, numericTimeUnit)
    };
    const { facts, reverseIndex, reverseSourceIndex, reverseEdgeIndex, indexByNodeId, temporalEncoding } =
      buildAppAspFactsFromGraph(data, additionalTemporalValues);
    return { facts, reverseIndex, reverseSourceIndex, reverseEdgeIndex, indexByNodeId, temporalEncoding };
  }

  async function runProvenanceScenarioCliqueComparison() {
    if (solverRunning || !clingoWorker) return;

    closeToolbarMenus();
    clearGraphAnalysisFocus();
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = true;
    lastGraph2DAnalysisKind = "provenanceClique";
    provenanceScenarioAnalysisError = "";
    provenanceScenarioAnalysisProgress = "";
    provenanceScenarioComparison = null;
    provenanceScenarioSelectedGroup = "";
    provenanceScenarioConfidenceThreshold = null;
    provenanceScenarioTimelineWindow = "";
    provenanceScenarioViewFilters = { types: [], groups: [] };

    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      provenanceScenarioAnalysisError = blockingDiagnostic.message;
      return;
    }
    if (graphDirection !== "undirected") {
      provenanceScenarioAnalysisError = "Il confronto delle clique richiede un grafo non orientato.";
      return;
    }
    if (!originalData || !Array.isArray(originalData.nodes) || originalData.nodes.length === 0) {
      provenanceScenarioAnalysisError = "Il grafo di origine non contiene nodi candidati da confrontare.";
      return;
    }
    if (provenanceScenarios.length < 2) {
      provenanceScenarioAnalysisError = "Dichiara almeno due scenari di provenienza per confrontare le clique massime.";
      return;
    }

    const confidenceRange = getEdgeConfidenceRange();
    const confidenceThreshold = graphCapabilities.edgeConfidence?.available === true
      ? minimumEdgeConfidence
      : null;
    const scenarioInputs: ScenarioMaximumCliqueInput[] = [];
    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    let activeScenarioLabel = "";

    solverRunning = true;
    try {
      for (let index = 0; index < provenanceScenarios.length; index += 1) {
        const scenario = provenanceScenarios[index];
        activeScenarioLabel = String(scenario.label ?? scenario.id);
        provenanceScenarioAnalysisProgress = `Scenario ${index + 1}/${provenanceScenarios.length}: ${activeScenarioLabel}`;

        const sourceLinks = filterLinksByProvenanceScenario(originalData.links ?? [], {
          sources: scenario.sources,
          unattributedEdges: provenanceScenarioConfig.unattributedEdges,
          referenceMatching: provenanceScenarioConfig.referenceMatching ?? "any"
        });
        const confidenceQualifiedLinks = filterLinksByMinimumConfidence(
          sourceLinks,
          confidenceThreshold,
          confidenceRange
        );
        const timelineQualifiedLinks = getTimelineQualifiedLinks(confidenceQualifiedLinks);
        const scenarioVisibleNodeIds = projectVisibleNodeIdsForLinks(timelineQualifiedLinks);
        const candidateNodes = originalData.nodes.filter((node: any) =>
          scenarioVisibleNodeIds.has(String(node.id))
        );
        const eligibleNodes = selectedGroup
          ? candidateNodes.filter((node: any) => extractGroups(node).includes(selectedGroup))
          : candidateNodes;
        if (eligibleNodes.length === 0) {
          throw new Error(selectedGroup
            ? `Il gruppo '${selectedGroup}' non contiene nodi visibili in questo scenario con la finestra temporale e i filtri correnti.`
            : "Questo scenario non produce nodi visibili con la finestra temporale e i filtri correnti.");
        }

        const candidateNodeIds = new Set(candidateNodes.map((node: any) => normalizeGraphId(node.id)));
        const scenarioLinks = timelineQualifiedLinks.filter((link: any) =>
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.source))) &&
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.target)))
        );
        const graphForScenario = {
          ...originalData,
          nodes: candidateNodes,
          links: scenarioLinks
        };
        const { facts, reverseIndex } = buildAppAspFactsFromGraph(graphForScenario);
        const program = buildCliqueProgram("maximum", selectedGroup);
        const fullProgram = `${facts.trim()}\n\n${program.trim()}\n`;
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`è scaduto il limite complessivo di ${timeoutMs} ms`);
        const startedAt = performance.now();
        const result = await callClingo(fullProgram, getCliqueModeOptions("maximum"), remainingMs);
        const timeMs = performance.now() - startedAt;

        if (result?.Result === "ERROR") {
          throw new Error(result.Error || "clingo ha restituito un errore");
        }
        if (!hasCompleteOptimalModelEnumeration(result)) {
          throw new Error(`clingo non ha provato e completato l'enumerazione di tutti gli ottimi (${result?.Result ?? "risposta vuota"})`);
        }

        const witnessedCliques = parseWitnessCliques(result?.Call?.[0]?.Witnesses, reverseIndex, 1);
        const maximumCliques = selectMaximumCliques(witnessedCliques);
        if (maximumCliques.length === 0) {
          throw new Error("clingo non ha restituito witness di clique ottime completi");
        }

        scenarioInputs.push({
          scenarioId: scenario.id,
          scenarioLabel: scenario.label ?? scenario.id,
          nodesCount: candidateNodes.length,
          linksCount: scenarioLinks.length,
          timeMs,
          candidateNodeIds: eligibleNodes.map((node: any) => String(node.id)),
          maximumCliques
        });
      }

      provenanceScenarioComparison = summarizeProvenanceScenarioMaximumCliques(
        scenarioInputs,
        provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds"
          ? "finite-exhaustive-worlds"
          : "declared-projections"
      );
      provenanceScenarioSelectedGroup = selectedGroup;
      provenanceScenarioConfidenceThreshold = confidenceThreshold;
      provenanceScenarioTimelineWindow = timelineControlEnabled
        ? `${currentStart}–${currentEnd}`
        : "";
      provenanceScenarioViewFilters = getScenarioViewFilterSnapshot();
    } catch (error) {
      provenanceScenarioComparison = null;
      const message = error instanceof Error ? error.message : String(error);
      provenanceScenarioAnalysisError =
        `Confronto interrotto nello scenario '${activeScenarioLabel}'. Nessun risultato parziale è stato presentato. ${message}`;
    } finally {
      solverRunning = false;
      provenanceScenarioAnalysisProgress = "";
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function runProvenanceScenarioKCoreComparison(request: {
    k: number;
    degreeMode: "undirected" | DirectedKCoreMode;
    group: string;
  }) {
    if (solverRunning || !clingoWorker) return;

    showSolverPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showStructuralPanel = true;
    lastGraph2DAnalysisKind = "provenanceKCore";
    clearStructuralTaskResult();
    clearGraph2DOverlay();
    provenanceKCoreScenarioComparisonError = "";
    provenanceKCoreScenarioComparisonProgress = "";
    provenanceKCoreScenarioComparison = null;

    if (!Number.isSafeInteger(request.k) || request.k < 0) {
      provenanceKCoreScenarioComparisonError = "Il valore k deve essere un intero non negativo.";
      return;
    }
    if (provenanceScenarios.length < 2) {
      provenanceKCoreScenarioComparisonError = "Il confronto richiede almeno due scenari di provenienza dichiarati.";
      return;
    }
    const requiredCapabilities = getGraphTaskRequirements("kCore", graphDirection) ?? [];
    const requirements = checkGraphTaskRequirements(graphCapabilities, requiredCapabilities);
    if (!requirements.available) {
      provenanceKCoreScenarioComparisonError = requirements.reasons.join("; ");
      return;
    }
    if (graphDirection === "directed" && request.degreeMode !== "in" &&
      request.degreeMode !== "out" && request.degreeMode !== "mutual") {
      provenanceKCoreScenarioComparisonError = "Per un grafo diretto scegli esplicitamente il grado entrante, uscente o mutuo.";
      return;
    }
    if (graphDirection === "undirected" && request.degreeMode !== "undirected") {
      provenanceKCoreScenarioComparisonError = "Un grafo non orientato richiede la modalità k-core non orientata.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      provenanceKCoreScenarioComparisonError = blockingDiagnostic.message;
      return;
    }
    if (!originalData?.nodes?.length) {
      provenanceKCoreScenarioComparisonError = "Il grafo di origine non contiene nodi candidati da confrontare.";
      return;
    }

    const confidenceRange = getEdgeConfidenceRange();
    const confidenceThreshold = graphCapabilities.edgeConfidence?.available === true
      ? minimumEdgeConfidence
      : null;
    const scenarioInputs: Array<{
      scenarioId: string;
      scenarioLabel: string;
      nodesCount: number;
      linksCount: number;
      timeMs: number;
      candidateNodeIds: string[];
      coreNodeIds: string[];
    }> = [];
    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    let activeScenarioLabel = "";

    solverRunning = true;
    try {
      for (let index = 0; index < provenanceScenarios.length; index += 1) {
        const scenario = provenanceScenarios[index];
        activeScenarioLabel = String(scenario.label ?? scenario.id);
        provenanceKCoreScenarioComparisonProgress = `Scenario ${index + 1}/${provenanceScenarios.length}: ${activeScenarioLabel}`;

        const sourceLinks = filterLinksByProvenanceScenario(originalData.links ?? [], {
          sources: scenario.sources,
          unattributedEdges: provenanceScenarioConfig.unattributedEdges,
          referenceMatching: provenanceScenarioConfig.referenceMatching ?? "any"
        });
        const confidenceQualifiedLinks = filterLinksByMinimumConfidence(
          sourceLinks,
          confidenceThreshold,
          confidenceRange
        );
        const timelineQualifiedLinks = getTimelineQualifiedLinks(confidenceQualifiedLinks);
        const scenarioVisibleNodeIds = projectVisibleNodeIdsForLinks(timelineQualifiedLinks);
        const candidateNodes = originalData.nodes.filter((node: any) =>
          scenarioVisibleNodeIds.has(String(node.id))
        );
        const eligibleNodes = request.group
          ? candidateNodes.filter((node: any) => extractGroups(node).includes(request.group))
          : candidateNodes;
        const candidateNodeIds = new Set(candidateNodes.map((node: any) => normalizeGraphId(node.id)));
        const scenarioLinks = timelineQualifiedLinks.filter((link: any) =>
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.source))) &&
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.target)))
        );
        const graphForScenario = {
          ...originalData,
          nodes: candidateNodes,
          links: scenarioLinks
        };
        const { facts, reverseIndex } = buildAppAspFactsFromGraph(graphForScenario);
        const program = `${facts.trim()}\n\n${buildKCoreProgram(
          request.k,
          request.group,
          false,
          graphDirection,
          graphDirection === "directed" ? request.degreeMode as DirectedKCoreMode : undefined
        )}\n`;
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`è scaduto il limite complessivo di ${timeoutMs} ms`);
        const startedAt = performance.now();
        const result = await callClingo(program, getStructuralSolverOptions("kCore"), remainingMs);
        const timeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          throw new Error(result.Error || "clingo ha restituito un errore");
        }
        if (!hasCompleteKCoreScenarioResult(result, eligibleNodes.length)) {
          throw new Error(`clingo non ha provato e completato l'enumerazione dell'ottimo del k-core; stato: ${result?.Result ?? "risposta vuota"}`);
        }
        const maximumCoreSets = selectMaximumNodeSets(
          parseWitnessNodeSets(result?.Call?.[0]?.Witnesses, reverseIndex)
        );
        if (maximumCoreSets.length !== 1) {
          throw new Error("Il solver non ha restituito il testimone unico atteso per il k-core.");
        }
        scenarioInputs.push({
          scenarioId: scenario.id,
          scenarioLabel: scenario.label ?? scenario.id,
          nodesCount: candidateNodes.length,
          linksCount: scenarioLinks.length,
          timeMs,
          candidateNodeIds: eligibleNodes.map((node: any) => String(node.id)),
          coreNodeIds: maximumCoreSets[0]
        });
      }

      provenanceKCoreScenarioComparison = summarizeProvenanceScenarioKCores(
        scenarioInputs,
        request.k,
        request.degreeMode,
        provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds"
          ? "finite-exhaustive-worlds"
          : "declared-projections"
      );
      provenanceKCoreScenarioSelectedGroup = request.group;
      provenanceKCoreScenarioConfidenceThreshold = confidenceThreshold;
      provenanceKCoreScenarioTimelineWindow = timelineControlEnabled
        ? `${currentStart}–${currentEnd}`
        : "";
      provenanceKCoreScenarioViewFilters = getScenarioViewFilterSnapshot();
    } catch (error) {
      provenanceKCoreScenarioComparison = null;
      const message = error instanceof Error ? error.message : String(error);
      provenanceKCoreScenarioComparisonError =
        `Confronto interrotto nello scenario '${activeScenarioLabel}'. Nessun risultato parziale è stato presentato. ${message}`;
    } finally {
      solverRunning = false;
      provenanceKCoreScenarioComparisonProgress = "";
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function runProvenanceScenarioKPlexComparison(request: {
    s: number;
    group: string;
    enumerateAllOptima: boolean;
  }) {
    if (solverRunning || !clingoWorker) return;

    showSolverPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showStructuralPanel = true;
    lastGraph2DAnalysisKind = "provenanceKPlex";
    clearStructuralTaskResult();
    clearGraph2DOverlay();
    provenanceKPlexScenarioComparisonError = "";
    provenanceKPlexScenarioComparisonProgress = "";
    provenanceKPlexScenarioComparison = null;

    if (!Number.isSafeInteger(request.s) || request.s < 1) {
      provenanceKPlexScenarioComparisonError = "Il valore s deve essere un intero maggiore o uguale a 1.";
      return;
    }
    if (request.enumerateAllOptima !== true) {
      provenanceKPlexScenarioComparisonError = "Per confrontare la membership occorre enumerare tutti i k-plex di cardinalità massima.";
      return;
    }
    if (provenanceScenarios.length < 2) {
      provenanceKPlexScenarioComparisonError = "Il confronto richiede almeno due scenari di provenienza dichiarati.";
      return;
    }
    const requirements = checkGraphTaskRequirements(
      graphCapabilities,
      getGraphTaskRequirements("kPlex") ?? []
    );
    if (!requirements.available) {
      provenanceKPlexScenarioComparisonError = requirements.reasons.join("; ");
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      provenanceKPlexScenarioComparisonError = blockingDiagnostic.message;
      return;
    }
    if (!originalData?.nodes?.length) {
      provenanceKPlexScenarioComparisonError = "Il grafo di origine non contiene nodi candidati da confrontare.";
      return;
    }

    const confidenceRange = getEdgeConfidenceRange();
    const confidenceThreshold = graphCapabilities.edgeConfidence?.available === true
      ? minimumEdgeConfidence
      : null;
    const scenarioInputs: ScenarioMaximumKPlexInput[] = [];
    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    let activeScenarioLabel = "";

    solverRunning = true;
    try {
      for (let index = 0; index < provenanceScenarios.length; index += 1) {
        const scenario = provenanceScenarios[index];
        activeScenarioLabel = String(scenario.label ?? scenario.id);
        provenanceKPlexScenarioComparisonProgress = `Scenario ${index + 1}/${provenanceScenarios.length}: ${activeScenarioLabel}`;

        const sourceLinks = filterLinksByProvenanceScenario(originalData.links ?? [], {
          sources: scenario.sources,
          unattributedEdges: provenanceScenarioConfig.unattributedEdges,
          referenceMatching: provenanceScenarioConfig.referenceMatching ?? "any"
        });
        const confidenceQualifiedLinks = filterLinksByMinimumConfidence(
          sourceLinks,
          confidenceThreshold,
          confidenceRange
        );
        const timelineQualifiedLinks = getTimelineQualifiedLinks(confidenceQualifiedLinks);
        const scenarioVisibleNodeIds = projectVisibleNodeIdsForLinks(timelineQualifiedLinks);
        const candidateNodes = originalData.nodes.filter((node: any) =>
          scenarioVisibleNodeIds.has(String(node.id))
        );
        const eligibleNodes = request.group
          ? candidateNodes.filter((node: any) => extractGroups(node).includes(request.group))
          : candidateNodes;
        if (eligibleNodes.length === 0) {
          throw new Error(request.group
            ? `Il gruppo '${request.group}' non contiene nodi visibili nello scenario con la finestra temporale e i filtri correnti.`
            : "Lo scenario non produce nodi visibili con la finestra temporale e i filtri correnti.");
        }

        const candidateNodeIds = new Set(candidateNodes.map((node: any) => normalizeGraphId(node.id)));
        const scenarioLinks = timelineQualifiedLinks.filter((link: any) =>
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.source))) &&
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.target)))
        );
        const graphForScenario = {
          ...originalData,
          nodes: candidateNodes,
          links: scenarioLinks
        };
        const { facts, reverseIndex } = buildAppAspFactsFromGraph(graphForScenario);
        if (!facts.trim()) {
          throw new Error("Non sono stati generati fatti ASP dalla proiezione dello scenario.");
        }

        const startedAt = performance.now();
        const search = await searchMaximumKPlexWithAsp(
          request.s,
          eligibleNodes.map((node: any) => String(node.id)),
          scenarioLinks.map((link: any) => ({ source: link.source, target: link.target })),
          request.group,
          true,
          async (plexProgram, modelLimit) => {
            const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
            if (remainingMs <= 0) return { Result: "TIMEOUT" };
            const fullProgram = `${facts.trim()}\n\n${plexProgram.trim()}\n`;
            return normalizeKPlexTimeoutResult(
              await callClingo(fullProgram, [], remainingMs, modelLimit)
            );
          }
        );
        const timeMs = performance.now() - startedAt;
        if (!search.complete || !search.result || search.maximumSize < 1) {
          throw new Error(`clingo non ha provato il massimo k-plex entro il budget complessivo; stato: ${search.solverStatus ?? "nessun witness"}`);
        }
        const result = search.result as {
          Models?: { More?: string };
          Call?: Array<{ Witnesses?: unknown }>;
        } | undefined;
        if (result?.Models?.More !== "no") {
          throw new Error("clingo non conferma che l'enumerazione di tutti i k-plex ottimi sia completa");
        }
        const maximumKPlexes = selectMaximumNodeSets(
          parseWitnessKPlexExplanations(result.Call?.[0]?.Witnesses, reverseIndex)
            .map((witness) => witness.nodeIds)
        );
        if (maximumKPlexes.length === 0 || maximumKPlexes.some((nodeIds) => nodeIds.length !== search.maximumSize)) {
          throw new Error("La prova ASP non contiene tutti i witness del k-plex alla cardinalità massima attesa.");
        }

        scenarioInputs.push({
          scenarioId: scenario.id,
          scenarioLabel: scenario.label ?? scenario.id,
          nodesCount: candidateNodes.length,
          linksCount: scenarioLinks.length,
          timeMs,
          candidateNodeIds: eligibleNodes.map((node: any) => String(node.id)),
          maximumKPlexes
        });
      }

      provenanceKPlexScenarioComparison = summarizeProvenanceScenarioMaximumKPlexes(
        scenarioInputs,
        request.s,
        provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds"
          ? "finite-exhaustive-worlds"
          : "declared-projections"
      );
      provenanceKPlexScenarioSelectedGroup = request.group;
      provenanceKPlexScenarioConfidenceThreshold = confidenceThreshold;
      provenanceKPlexScenarioTimelineWindow = timelineControlEnabled
        ? `${currentStart}–${currentEnd}`
        : "";
      provenanceKPlexScenarioViewFilters = getScenarioViewFilterSnapshot();
    } catch (error) {
      provenanceKPlexScenarioComparison = null;
      const message = error instanceof Error ? error.message : String(error);
      provenanceKPlexScenarioComparisonError =
        `Confronto interrotto nello scenario '${activeScenarioLabel}'. Nessun risultato parziale è stato presentato. ${message}`;
    } finally {
      solverRunning = false;
      provenanceKPlexScenarioComparisonProgress = "";
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function runProvenanceScenarioComponentComparison(request: {
    task: ProvenanceScenarioComponentTask;
    targetNodeId: string;
    group: string;
  }) {
    if (solverRunning || !clingoWorker) return;

    showSolverPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showStructuralPanel = true;
    lastGraph2DAnalysisKind = "provenanceComponent";
    clearStructuralTaskResult();
    clearGraph2DOverlay();
    provenanceComponentScenarioComparisonError = "";
    provenanceComponentScenarioComparisonProgress = "";
    provenanceComponentScenarioComparison = null;

    const allowedTasks: ProvenanceScenarioComponentTask[] = ["components", "weakComponents", "strongComponents"];
    if (!allowedTasks.includes(request.task)) {
      provenanceComponentScenarioComparisonError = "Il confronto richiede un task di componenti valido.";
      return;
    }
    const targetNodeId = typeof request.targetNodeId === "string" ? normalizeGraphId(request.targetNodeId) : "";
    if (!targetNodeId || !originalData?.nodes?.some((node: any) => normalizeGraphId(String(node.id)) === targetNodeId)) {
      provenanceComponentScenarioComparisonError = "Scegli un nodo di riferimento presente nel grafo importato.";
      return;
    }
    if (provenanceScenarios.length < 2) {
      provenanceComponentScenarioComparisonError = "Il confronto richiede almeno due scenari di provenienza dichiarati.";
      return;
    }

    const requirementName = request.task === "components" ? "connectedComponents" : request.task;
    const requirements = checkGraphTaskRequirements(
      graphCapabilities,
      getGraphTaskRequirements(requirementName) ?? []
    );
    if (!requirements.available) {
      provenanceComponentScenarioComparisonError = requirements.reasons.join("; ");
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      provenanceComponentScenarioComparisonError = blockingDiagnostic.message;
      return;
    }
    if (!originalData?.nodes?.length) {
      provenanceComponentScenarioComparisonError = "Il grafo di origine non contiene nodi da confrontare.";
      return;
    }

    const confidenceRange = getEdgeConfidenceRange();
    const confidenceThreshold = graphCapabilities.edgeConfidence?.available === true
      ? minimumEdgeConfidence
      : null;
    const scenarioInputs: Array<{
      scenarioId: string;
      scenarioLabel: string;
      projectedNodeCount: number;
      linksCount: number;
      timeMs: number;
      candidateNodeIds: string[];
      components: string[][];
    }> = [];
    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    let activeScenarioLabel = "";

    solverRunning = true;
    try {
      for (let index = 0; index < provenanceScenarios.length; index += 1) {
        const scenario = provenanceScenarios[index];
        activeScenarioLabel = String(scenario.label ?? scenario.id);
        provenanceComponentScenarioComparisonProgress =
          `Scenario ${index + 1}/${provenanceScenarios.length}: ${activeScenarioLabel}`;

        const sourceLinks = filterLinksByProvenanceScenario(originalData.links ?? [], {
          sources: scenario.sources,
          unattributedEdges: provenanceScenarioConfig.unattributedEdges,
          referenceMatching: provenanceScenarioConfig.referenceMatching ?? "any"
        });
        const confidenceQualifiedLinks = filterLinksByMinimumConfidence(
          sourceLinks,
          confidenceThreshold,
          confidenceRange
        );
        const timelineQualifiedLinks = getTimelineQualifiedLinks(confidenceQualifiedLinks);
        const scenarioVisibleNodeIds = projectVisibleNodeIdsForLinks(timelineQualifiedLinks);
        const projectedNodes = originalData.nodes.filter((node: any) =>
          scenarioVisibleNodeIds.has(String(node.id))
        );
        const eligibleNodes = request.group
          ? projectedNodes.filter((node: any) => extractGroups(node).includes(request.group))
          : projectedNodes;
        const projectedNodeIds = new Set(projectedNodes.map((node: any) => normalizeGraphId(node.id)));
        const scenarioLinks = timelineQualifiedLinks.filter((link: any) =>
          projectedNodeIds.has(normalizeGraphId(getLinkEndId(link.source))) &&
          projectedNodeIds.has(normalizeGraphId(getLinkEndId(link.target)))
        );
        const graphForScenario = {
          ...originalData,
          nodes: projectedNodes,
          links: scenarioLinks
        };
        const { facts, reverseIndex } = buildAppAspFactsFromGraph(graphForScenario);
        const program = request.task === "components"
          ? buildConnectedComponentsProgram(request.group)
          : request.task === "weakComponents"
            ? buildWeaklyConnectedComponentsProgram(request.group)
            : buildStronglyConnectedComponentsProgram(request.group);
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`è scaduto il limite complessivo di ${timeoutMs} ms`);
        const startedAt = performance.now();
        const result = await callClingo(
          `${facts.trim()}\n\n${program}\n`,
          getStructuralSolverOptions(request.task),
          remainingMs
        );
        const timeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          throw new Error(result.Error || "clingo ha restituito un errore");
        }
        if (result?.Result !== "SATISFIABLE" || !hasCompleteModelEnumeration(result)) {
          throw new Error(`clingo non ha completato l'enumerazione della partizione; stato: ${result?.Result ?? "risposta vuota"}`);
        }
        const witnesses = result?.Call?.[0]?.Witnesses;
        const components = request.task === "components"
          ? parseWitnessComponents(witnesses, reverseIndex)
          : request.task === "weakComponents"
            ? parseWitnessWeakComponents(witnesses, reverseIndex)
            : parseWitnessStrongComponents(witnesses, reverseIndex);
        scenarioInputs.push({
          scenarioId: scenario.id,
          scenarioLabel: scenario.label ?? scenario.id,
          projectedNodeCount: projectedNodes.length,
          linksCount: scenarioLinks.length,
          timeMs,
          candidateNodeIds: eligibleNodes.map((node: any) => String(node.id)),
          components
        });
      }

      provenanceComponentScenarioComparison = summarizeProvenanceScenarioComponents(
        scenarioInputs,
        request.task,
        targetNodeId,
        provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds"
          ? "finite-exhaustive-worlds"
          : "declared-projections"
      );
      provenanceComponentScenarioSelectedGroup = request.group;
      provenanceComponentScenarioTargetNodeId = targetNodeId;
      provenanceComponentScenarioConfidenceThreshold = confidenceThreshold;
      provenanceComponentScenarioTimelineWindow = timelineControlEnabled
        ? `${currentStart}–${currentEnd}`
        : "";
      provenanceComponentScenarioViewFilters = getScenarioViewFilterSnapshot();
    } catch (error) {
      provenanceComponentScenarioComparison = null;
      const message = error instanceof Error ? error.message : String(error);
      provenanceComponentScenarioComparisonError =
        `Confronto interrotto nello scenario '${activeScenarioLabel}'. Nessun risultato parziale è stato presentato. ${message}`;
    } finally {
      solverRunning = false;
      provenanceComponentScenarioComparisonProgress = "";
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function runProvenanceScenarioDominatingSetComparison(request: {
    candidateGroup: string;
    targetGroup: string;
  }) {
    if (solverRunning || !clingoWorker) return;

    showSolverPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showStructuralPanel = true;
    lastGraph2DAnalysisKind = "provenanceDominatingSet";
    clearStructuralTaskResult();
    clearGraph2DOverlay();
    provenanceDominatingSetScenarioComparisonError = "";
    provenanceDominatingSetScenarioComparisonProgress = "";
    provenanceDominatingSetScenarioComparison = null;
    provenanceDominatingSetScenarioWhyNot = null;

    if (provenanceScenarios.length < 2) {
      provenanceDominatingSetScenarioComparisonError = "Il confronto richiede almeno due scenari di provenienza dichiarati.";
      return;
    }
    const requirements = checkGraphTaskRequirements(
      graphCapabilities,
      getGraphTaskRequirements("dominatingSet") ?? []
    );
    if (!requirements.available) {
      provenanceDominatingSetScenarioComparisonError = requirements.reasons.join("; ");
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      provenanceDominatingSetScenarioComparisonError = blockingDiagnostic.message;
      return;
    }
    if (!originalData?.nodes?.length) {
      provenanceDominatingSetScenarioComparisonError = "Il grafo di origine non contiene nodi da confrontare.";
      return;
    }

    const candidateGroup = typeof request.candidateGroup === "string" ? request.candidateGroup : "";
    const targetGroup = typeof request.targetGroup === "string" ? request.targetGroup : "";
    const confidenceRange = getEdgeConfidenceRange();
    const confidenceThreshold = graphCapabilities.edgeConfidence?.available === true
      ? minimumEdgeConfidence
      : null;
    const scenarioInputs: Array<{
      scenarioId: string;
      scenarioLabel: string;
      projectedNodeCount: number;
      projectedNodeIds: string[];
      candidateNodeIds: string[];
      targetNodeIds: string[];
      linksCount: number;
      timeMs: number;
      minimumDominatingSets: string[][];
    }> = [];
    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    let activeScenarioLabel = "";

    solverRunning = true;
    try {
      for (let index = 0; index < provenanceScenarios.length; index += 1) {
        const scenario = provenanceScenarios[index];
        activeScenarioLabel = String(scenario.label ?? scenario.id);
        provenanceDominatingSetScenarioComparisonProgress =
          `Scenario ${index + 1}/${provenanceScenarios.length}: ${activeScenarioLabel}`;

        const sourceLinks = filterLinksByProvenanceScenario(originalData.links ?? [], {
          sources: scenario.sources,
          unattributedEdges: provenanceScenarioConfig.unattributedEdges,
          referenceMatching: provenanceScenarioConfig.referenceMatching ?? "any"
        });
        const confidenceQualifiedLinks = filterLinksByMinimumConfidence(
          sourceLinks,
          confidenceThreshold,
          confidenceRange
        );
        const timelineQualifiedLinks = getTimelineQualifiedLinks(confidenceQualifiedLinks);
        const scenarioVisibleNodeIds = projectVisibleNodeIdsForLinks(timelineQualifiedLinks);
        const projectedNodes = originalData.nodes.filter((node: any) =>
          scenarioVisibleNodeIds.has(String(node.id))
        );
        const projectedNodeIds = new Set(projectedNodes.map((node: any) => normalizeGraphId(node.id)));
        const scenarioLinks = timelineQualifiedLinks.filter((link: any) =>
          projectedNodeIds.has(normalizeGraphId(getLinkEndId(link.source))) &&
          projectedNodeIds.has(normalizeGraphId(getLinkEndId(link.target)))
        );
        const candidateNodes = candidateGroup
          ? projectedNodes.filter((node: any) => extractGroups(node).includes(candidateGroup))
          : projectedNodes;
        const targetNodes = targetGroup
          ? projectedNodes.filter((node: any) => extractGroups(node).includes(targetGroup))
          : projectedNodes;
        const graphForScenario = { ...originalData, nodes: projectedNodes, links: scenarioLinks };
        const { facts, reverseIndex } = buildAppAspFactsFromGraph(graphForScenario);
        const program = buildMinimumDominatingSetProgram(candidateGroup, targetGroup);
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`è scaduto il limite complessivo di ${timeoutMs} ms`);
        const startedAt = performance.now();
        const result = await callClingo(
          `${facts.trim()}\n\n${program}\n`,
          getStructuralSolverOptions("dominatingSet", true),
          remainingMs
        );
        const timeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          throw new Error(result.Error || "clingo ha restituito un errore");
        }
        if (result?.Result === "UNSATISFIABLE") {
          const remainingWhyNotMs = getRemainingSolverBudgetMs(deadline, performance.now());
          if (remainingWhyNotMs <= 0) {
            throw new Error("la copertura è impossibile, ma il budget condiviso è terminato prima del certificato why-not");
          }
          const whyNotProgram = buildDominatingSetFeasibilityProgram(candidateGroup, targetGroup);
          const whyNotResult = await callClingo(
            `${facts.trim()}\n\n${whyNotProgram}\n`,
            [],
            remainingWhyNotMs
          );
          if (whyNotResult?.Result !== "SATISFIABLE") {
            throw new Error(`la copertura è impossibile, ma il certificato why-not non è stato completato (${whyNotResult?.Result ?? "risposta vuota"})`);
          }
          const certificate = parseDominatingSetFeasibilityCertificate(
            whyNotResult?.Call?.[0]?.Witnesses,
            reverseIndex
          );
          if (!certificate) {
            throw new Error("la copertura è impossibile, ma il solver non ha restituito un certificato why-not interpretabile");
          }

          const expectedUncoverableTargetIds = verifyDominatingSetFeasibilityCertificate(
            certificate,
            candidateNodes.map((node: any) => String(normalizeGraphId(node.id))),
            targetNodes.map((node: any) => String(normalizeGraphId(node.id))),
            scenarioLinks.map((link: any) => [
              String(normalizeGraphId(getLinkEndId(link.source))),
              String(normalizeGraphId(getLinkEndId(link.target)))
            ] as [string, string])
          );
          if (!expectedUncoverableTargetIds) {
            throw new Error("il certificato why-not ASP non coincide con il controllo indipendente dello scenario ed è stato scartato");
          }

          provenanceDominatingSetScenarioWhyNot = {
            scenarioId: String(scenario.id),
            scenarioLabel: activeScenarioLabel,
            scenarioSources: Array.isArray(scenario.sources) ? scenario.sources.map(String) : [],
            uncoverableTargetNodeIds: expectedUncoverableTargetIds,
            candidateGroup,
            targetGroup,
            confidenceThreshold,
            timelineWindow: timelineControlEnabled ? `${currentStart}–${currentEnd}` : "",
            viewFilters: getScenarioViewFilterSnapshot()
          };
          throw new Error(`la combinazione di candidati e nodi obiettivo non ammette una copertura completa; ${expectedUncoverableTargetIds.length} target non sono copribili nello scenario`);
        }
        if (result?.Result !== "OPTIMUM FOUND") {
          throw new Error(`clingo non ha provato tutti gli ottimi; stato: ${result?.Result ?? "risposta vuota"}`);
        }
        if (result?.Models?.More !== "no") {
          throw new Error("l'enumerazione degli insiemi dominanti ottimi è incompleta");
        }
        const explanations = parseWitnessDominatingSetExplanations(result?.Call?.[0]?.Witnesses, reverseIndex);
        const minimumDominatingSets = selectMinimumNodeSets(explanations.map(({ nodeIds }) => nodeIds));
        if (minimumDominatingSets.length === 0) {
          throw new Error("clingo non ha restituito witness di copertura ottima interpretabili");
        }

        const candidateNodeIds = new Set<string>(candidateNodes.map((node: any) => normalizeGraphId(node.id)));
        const targetNodeIds = new Set<string>(targetNodes.map((node: any) => normalizeGraphId(node.id)));
        const scenarioLinkPairs = scenarioLinks.map((link: any) => [
          normalizeGraphId(getLinkEndId(link.source)),
          normalizeGraphId(getLinkEndId(link.target))
        ] as [string, string]);
        const areAdjacent = (left: string, right: string) => scenarioLinkPairs.some(([source, target]) =>
          (source === left && target === right) || (source === right && target === left)
        );
        for (const explanation of explanations) {
          const selected = new Set(explanation.nodeIds);
          if ([...selected].some((nodeId) => !candidateNodeIds.has(nodeId))) {
            throw new Error("un witness ASP contiene nodi fuori dal dominio candidato");
          }
          const coveredTargets = new Set<string>();
          for (const [targetId, coveringId] of explanation.coveragePairs) {
            if (!targetNodeIds.has(targetId) || !selected.has(coveringId) ||
              (targetId !== coveringId && !areAdjacent(targetId, coveringId))) {
              throw new Error("un witness ASP contiene una coppia di copertura non valida nella proiezione");
            }
            coveredTargets.add(targetId);
          }
          if (coveredTargets.size !== targetNodeIds.size ||
            [...targetNodeIds].some((nodeId) => !coveredTargets.has(nodeId))) {
            throw new Error("un witness ASP non copre esattamente tutti i nodi obiettivo");
          }
        }

        scenarioInputs.push({
          scenarioId: scenario.id,
          scenarioLabel: scenario.label ?? scenario.id,
          projectedNodeCount: projectedNodes.length,
          projectedNodeIds: projectedNodes.map((node: any) => normalizeGraphId(node.id)),
          candidateNodeIds: candidateNodes.map((node: any) => normalizeGraphId(node.id)),
          targetNodeIds: targetNodes.map((node: any) => normalizeGraphId(node.id)),
          linksCount: scenarioLinks.length,
          timeMs,
          minimumDominatingSets
        });
      }

      provenanceDominatingSetScenarioComparison = summarizeProvenanceScenarioDominatingSets(
        scenarioInputs,
        candidateGroup,
        targetGroup,
        provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds"
          ? "finite-exhaustive-worlds"
          : "declared-projections"
      );
      provenanceDominatingSetScenarioCandidateGroup = candidateGroup;
      provenanceDominatingSetScenarioTargetGroup = targetGroup;
      provenanceDominatingSetScenarioConfidenceThreshold = confidenceThreshold;
      provenanceDominatingSetScenarioTimelineWindow = timelineControlEnabled
        ? `${currentStart}–${currentEnd}`
        : "";
      provenanceDominatingSetScenarioViewFilters = getScenarioViewFilterSnapshot();
    } catch (error) {
      provenanceDominatingSetScenarioComparison = null;
      const message = error instanceof Error ? error.message : String(error);
      provenanceDominatingSetScenarioComparisonError =
        `Confronto interrotto nello scenario '${activeScenarioLabel}'. Nessun risultato parziale è stato presentato. ${message}`;
    } finally {
      solverRunning = false;
      provenanceDominatingSetScenarioComparisonProgress = "";
      persistCurrentAnalysisSession(false, true);
    }
  }

  function initializeClingoWorker() {
    if (!solverEnabled) return;
    clingoWorkerLease?.release();
    clingoWorkerLease = clingoWorkerClient.acquire(
      `${base}/clingo/clingo-memory.worker.js`,
      `${base}/clingo/clingo.wasm`,
      (status) => {
        clingoWorkerStatus = status;
      }
    );
    clingoWorker = clingoWorkerLease.worker;
  }

  function restartClingoWorker() {
    clingoInvocationTiming = null;
    clingoInvocationStats = null;
    if (!clingoWorkerLease) {
      initializeClingoWorker();
      return;
    }
    clingoWorkerLease.restart();
    clingoWorker = clingoWorkerLease.worker;
  }

  // Invia un programma al worker e attende il risultato JSON di clingo.
  // Le task combinatorie usano un limite esterno che può terminare il worker WASM.
  function callClingo(
    program: string,
    options: string[],
    timeoutMs = 0,
    modelLimit = 0,
    signal?: AbortSignal
  ): Promise<any> {
    if (signal?.aborted) return Promise.resolve({ Result: "CANCELLED" });
    if (showClingoTimingDiagnostics) clingoInvocationTiming = null;
    if (showClingoSolverStatsDiagnostics) clingoInvocationStats = null;
    const programSizeError = getClingoWasmProgramSizeError(program);
    if (programSizeError) {
      return Promise.resolve({ Result: "ERROR", Error: programSizeError });
    }
    return new Promise((resolve) => {
      const worker = clingoWorkerLease?.worker ?? clingoWorker;
      const readiness = clingoWorkerLease?.readiness;
      if (!worker) {
        resolve({ Result: "ERROR", Error: "Clingo worker non inizializzato." });
        return;
      }
      if (!readiness) {
        resolve({ Result: "ERROR", Error: "Clingo worker non inizializzato." });
        return;
      }

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        signal?.removeEventListener("abort", onAbort);
        if (timeoutHandle) clearTimeout(timeoutHandle);
      };
      const finish = (result: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const postRunRequest = () => {
        if (settled) return;
        if (clingoWorker !== worker || !readiness.isReady()) {
          finish({ Result: "ERROR", Error: "Clingo worker non pronto o inizializzazione fallita." });
          return;
        }
        try {
          worker.postMessage({
            type: "run",
            args: [program, modelLimit, getClingoInvocationOptions(options, showClingoSolverStatsDiagnostics)]
          });
        } catch (error) {
          finish({
            Result: "ERROR",
            Error: error instanceof Error ? error.message : String(error)
          });
        }
      };

      const onMessage = (e: MessageEvent) => {
        const msg = e.data;

        // La risposta a "init" è null: non è il risultato di questo run.
        if (!msg || typeof msg !== "object" || !("Result" in msg)) return;

        clingoInvocationTiming = showClingoTimingDiagnostics
          ? parseClingoInvocationTiming(msg)
          : null;
        clingoInvocationStats = showClingoSolverStatsDiagnostics
          ? parseClingoInvocationStats(msg)
          : null;

        const reportedMemory = msg.KliqueDiagnostics?.wasmLinearMemory;
        workerWasmMemoryStats = reportedMemory &&
          Number.isSafeInteger(reportedMemory.currentBytes) && reportedMemory.currentBytes >= 0 &&
          Number.isSafeInteger(reportedMemory.peakBytes) && reportedMemory.peakBytes >= reportedMemory.currentBytes &&
          typeof reportedMemory.peakReliable === "boolean"
          ? {
              currentBytes: reportedMemory.currentBytes,
              peakBytes: reportedMemory.peakBytes,
              peakReliable: reportedMemory.peakReliable
            }
          : null;

        finish(msg);
        if (msg.Result === "ERROR" && clingoWorker === worker) {
          // A WASM trap can arrive as a normal ERROR result without a Worker error event.
          restartClingoWorker();
        }
      };

      const onError = (e: ErrorEvent) => {
        finish({ Result: "ERROR", Error: e.message || "Clingo worker error" });
        if (clingoWorker === worker) {
          restartClingoWorker();
        }
      };

      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (clingoWorker === worker) restartClingoWorker();
        resolve({ Result: "CANCELLED" });
      };

      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }

      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          if (clingoWorker === worker) {
            restartClingoWorker();
          }
          resolve({
            Result: "ERROR",
            Error: `Tempo massimo superato (${Math.ceil(timeoutMs / 1000)} s): il calcolo è stato interrotto prima del risultato completo. Riduci il grafo o aumenta il limite di tempo nelle opzioni avanzate.`
          });
        }, timeoutMs);
      }

      void readiness.waitUntilSettled().then(postRunRequest);
    });
  }

  async function runMaximumClique() {
    if (solverRunning || !clingoWorker) return;
    clearGraph2DOverlay();
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    clearStructuralTaskResult();
    solverStats = { ...solverStats, completionLabel: undefined };

    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      solverError = blockingDiagnostic.message;
      showSolverPanel = true;
      return;
    }

    highlightedEdgeIds = new Set();
    cliqueSupportingEdgesByKey = {};
    refreshLinkVisuals();

    if (graphDirection === "directed") {
      solverError = "La ricerca di clique attuale richiede un grafo non orientato. Dichiarare una proiezione non orientata esplicita prima di avviare il solver.";
      showSolverPanel = true;
      return;
    }

    if (!data || !data.nodes?.length) {
      console.warn("⚠️ No visible nodes. Aborting clique computation.");
      return;
    }

    if (selectedGroup && !data.nodes.some((node: any) => extractGroups(node).includes(selectedGroup))) {
      solverError = "Il gruppo selezionato non contiene nodi nella proiezione corrente. Modifica i filtri della proiezione o scegli un gruppo visibile.";
      showSolverPanel = true;
      return;
    }

    const { facts, reverseIndex, reverseSourceIndex, reverseEdgeIndex, reverseGeneratedEdgeIndex } = buildAspFactsFromCurrentData();

    if (!facts.trim()) {
      console.warn("⚠️ No facts generated. Aborting.");
      return;
    }

    const mode = getCliqueMode();
    const explainCliqueSupports = GRAPH_CONFIG.solver?.explainCliqueSupports === true;
    const program = buildCliqueProgram(mode, selectedGroup, {
      enabled: explainCliqueSupports,
      includeEdgeRecords: graphSchemaVersion === 2
    });
    const fullProgram = facts.trim() + "\n\n" + program.trim() + "\n";
    const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);

    cliqueMembershipDiagnosis = null;
    cliqueMembershipDiagnosisTargetNodeId = null;
    cliqueMembershipDiagnosisError = "";
    solverRunning = true;
    solverError = "";

    const t0 = performance.now();
    const result = await callClingo(fullProgram, getCliqueModeOptions(mode), taskTimeoutMs);
    const t1 = performance.now();

    solverRunning = false;

    const enumerationComplete = mode === "maximum"
      ? hasCompleteOptimalModelEnumeration(result)
      : hasCompleteModelEnumeration(result);
    if (!enumerationComplete) {
      const status = result?.Result ?? "risposta vuota";
      const modelCompleteness = result?.Models?.More === "yes"
        ? "clingo segnala altri modelli non restituiti"
        : "clingo non conferma l'esaurimento dei modelli";
      solverError = result?.Result === "ERROR"
        ? result.Error || "Errore clingo"
        : mode === "maximum"
          ? `La ricerca delle clique massime non è completa (${status}; ${modelCompleteness}). Non vengono mostrati risultati parziali come elenco degli ottimi.`
          : `L'enumerazione delle clique non è completa (${status}; ${modelCompleteness}). Non vengono mostrati risultati parziali.`;
      maximumCliques = [];
      maximumCliqueMembershipCliques = [];
      allCliques = [];
      cliqueSupportingEdgesByKey = {};
      solverStats = {
        totalCliques: 0,
        maxSize: 0,
        histogram: new Map<number, number>(),
        timeMs: t1 - t0,
        nodesCount: data.nodes.length,
        linksCount: data.links.length,
        periodLabel: timelineControlEnabled ? `${currentStart}–${currentEnd}` : undefined,
        cliqueMode: mode,
        completionLabel: undefined,
        selectedGroup
      };
      cliqueNodes = new Set();
      refreshNodeVisuals();
      showSolverPanel = true;
      persistCurrentAnalysisSession(false, true);
      return;
    }

    let foundCliques: string[][] = [];
    let allCliqueWitnesses: string[][] = [];

    if (result?.Result === "ERROR") {
      console.error("❌ CLINGO ERROR:", result.Error);
      solverError = result.Error || "Clingo error";
    } else if (!explainCliqueSupports) {
      allCliqueWitnesses = parseWitnessCliques(result?.Call?.[0]?.Witnesses, reverseIndex, 1);
      foundCliques = allCliqueWitnesses.filter((clique) => clique.length >= 3);
    } else {
      const cliqueResults = parseWitnessCliqueResults(
        result?.Call?.[0]?.Witnesses,
        reverseIndex,
        reverseSourceIndex,
        reverseEdgeIndex,
        reverseGeneratedEdgeIndex,
        1
      );
      allCliqueWitnesses = cliqueResults.map((clique) => clique.nodeIds);
      foundCliques = allCliqueWitnesses.filter((clique) => clique.length >= 3);
      cliqueSupportingEdgesByKey = Object.fromEntries(cliqueResults.map((clique) => [
        getCliqueSignature(clique.nodeIds),
        clique.supportingEdges
      ]));
    }

    allCliqueWitnesses.sort((a, b) => b.length - a.length);
    foundCliques.sort((a, b) => b.length - a.length);
    const maxCliqueMembership = selectMaximumCliques(allCliqueWitnesses);
    const maxCliques = selectMaximumCliques(foundCliques);
    const maxSize = maxCliqueMembership[0]?.length ?? 0;

    // In modalità "maximum" clingo stampa anche i modelli intermedi non ottimi.
    if (mode === "maximum") {
      foundCliques = maxCliques;
    }

    const hist = new Map<number, number>();
    for (const c of foundCliques) {
      hist.set(c.length, (hist.get(c.length) ?? 0) + 1);
    }

    console.log(
      `🟢 [CLIQUE] mode=${mode}${selectedGroup ? ` group=${selectedGroup}` : ""}: ` +
      `${foundCliques.length} cliques, max size ${maxSize}, ${(t1 - t0).toFixed(1)} ms`
    );

    maximumCliques = maxCliques;
    maximumCliqueMembershipCliques = maxCliqueMembership;
    allCliques = foundCliques;

    solverStats = {
      totalCliques: foundCliques.length,
      maxSize,
      histogram: hist,
      timeMs: t1 - t0,
      nodesCount: data.nodes.length,
      linksCount: data.links.length,
      periodLabel: timelineControlEnabled ? `${currentStart}–${currentEnd}` : undefined,
      cliqueMode: mode,
      completionLabel: mode === "maximum"
        ? "Ottimo provato · tutte le clique massime enumerate"
        : mode === "maximal"
          ? "Enumerazione completa · clique massimali"
          : "Enumerazione completa · tutte le clique",
      selectedGroup
    };

    showSolverPanel = true;
    clearGraphNeighborhoodFocus();
    cliqueNodes = new Set(maxCliques[0] ?? []);
    refreshNodeVisuals();
    persistCurrentAnalysisSession(false, true);
  }

  async function explainMaximumCliqueMembership(targetNodeId: string) {
    if (solverRunning || !clingoWorker || !data || !targetNodeId || solverStats.maxSize < 1) return;
    clearGraph2DOverlay();
    cliqueMembershipDiagnosisTargetNodeId = targetNodeId;
    cliqueMembershipDiagnosis = null;
    cliqueMembershipDiagnosisError = "";
    if (graphDirection === "directed") {
      cliqueMembershipDiagnosisError = "La diagnosi di clique richiede una proiezione non orientata.";
      return;
    }

    const analyzedGroup = solverStats.selectedGroup;
    const asp = buildAspFactsFromCurrentData();
    const targetIndex = asp.indexByNodeId.get(targetNodeId);
    const candidateNodeIds = data.nodes
      .filter((node: any) => !analyzedGroup || extractGroups(node).includes(analyzedGroup))
      .map((node: any) => String(node.id));
    if (targetIndex === undefined || !candidateNodeIds.includes(targetNodeId)) {
      cliqueMembershipDiagnosisError = "Il nodo selezionato non appartiene al gruppo analizzato.";
      return;
    }

    const edgeRecords: CliqueMembershipEdgeRecord[] = data.links.flatMap((link: any) => {
      const sourceNodeId = normalizeGraphId(getGraphEndpointId(link.source));
      const targetNodeId = normalizeGraphId(getGraphEndpointId(link.target));
      if (!candidateNodeIds.includes(sourceNodeId) || !candidateNodeIds.includes(targetNodeId)) return [];
      const edgeId = String(link.sourceId ?? link.analysis?.id ?? "").trim();
      return [{
        sourceNodeId,
        targetNodeId,
        ...(edgeId ? { edgeId } : {}),
        ...(edgeId && link.sourceIdGenerated === true ? { edgeIdGenerated: true } : {})
      }];
    });

    const program = [
      asp.facts.trim(),
      buildCliqueProgram("maximum", analyzedGroup),
      buildCliqueRequiredNodeConstraint(targetIndex)
    ].filter(Boolean).join("\n\n") + "\n";

    cliqueMembershipDiagnosisRunning = true;
    solverRunning = true;
    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    try {
      const result = await callClingo(program, ["--opt-mode=opt"], timeoutMs);
      if (result?.Result === "ERROR") {
        throw new Error(result.Error || "Errore clingo durante la diagnosi della clique.");
      }
      cliqueMembershipDiagnosis = parseCliqueMaximumMembershipDiagnosis(result, {
        reverseIndex: asp.reverseIndex,
        candidateNodeIds,
        edgeRecords,
        targetNodeId,
        globalMaximumSize: solverStats.maxSize
      });
    } catch (error) {
      cliqueMembershipDiagnosisError = error instanceof Error
        ? error.message
        : "La diagnosi ASP della clique non è disponibile.";
    } finally {
      cliqueMembershipDiagnosisRunning = false;
      solverRunning = false;
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function explainMaximumKPlexMembership(targetNodeId: string) {
    if (solverRunning || !clingoWorker || !data || structuralStats?.task !== "kPlex" ||
      structuralResults.length === 0 || !targetNodeId) return;

    clearGraph2DOverlay();
    structuralKPlexMembershipDiagnosis = null;
    structuralKPlexMembershipDiagnosisTargetNodeId = targetNodeId;
    structuralKPlexMembershipDiagnosisError = "";
    structuralKPlexMembershipDiagnosisTimeMs = undefined;

    if (graphDirection !== "undirected") {
      structuralKPlexMembershipDiagnosisError = "La diagnosi dei k-plex massimi richiede una proiezione non orientata.";
      return;
    }
    if (!Number.isSafeInteger(structuralParameter) || structuralParameter < 1) {
      structuralKPlexMembershipDiagnosisError = "Il parametro s del k-plex non è valido.";
      return;
    }

    const candidateNodeIds = data.nodes
      .filter((node: any) => !selectedStructuralGroup || extractGroups(node).includes(selectedStructuralGroup))
      .map((node: any) => String(node.id));
    if (!candidateNodeIds.includes(targetNodeId)) {
      structuralKPlexMembershipDiagnosisError = "Il nodo selezionato non appartiene alla proiezione o al gruppo analizzato.";
      return;
    }

    const asp = buildAspFactsFromCurrentData();
    const targetIndex = asp.indexByNodeId.get(targetNodeId);
    const globalMaximumSize = Math.max(...structuralResults.map((nodeIds) => nodeIds.length));
    if (targetIndex === undefined || globalMaximumSize < 1 || structuralStats.parameter !== structuralParameter) {
      structuralKPlexMembershipDiagnosisError = "Il risultato massimo corrente non corrisponde ai criteri selezionati.";
      return;
    }
    const candidateSet = new Set(candidateNodeIds);
    const edgeRecords = data.links.flatMap((link: any) => {
      const sourceNodeId = normalizeGraphId(getGraphEndpointId(link.source));
      const targetNodeId = normalizeGraphId(getGraphEndpointId(link.target));
      return candidateSet.has(sourceNodeId) && candidateSet.has(targetNodeId)
        ? [{ sourceNodeId, targetNodeId }]
        : [];
    });
    const program = [
      asp.facts.trim(),
      buildMaximumKPlexProgram(structuralParameter, selectedStructuralGroup),
      buildKPlexRequiredNodeConstraint(targetIndex)
    ].filter(Boolean).join("\n\n") + "\n";

    const startedAt = performance.now();
    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    structuralKPlexMembershipDiagnosisRunning = true;
    solverRunning = true;
    try {
      const result = await callClingo(program, ["--opt-mode=opt"], timeoutMs);
      if (result?.Result === "ERROR") {
        throw new Error(result.Error || "Errore clingo durante la diagnosi della membership k-plex.");
      }
      structuralKPlexMembershipDiagnosis = parseKPlexMaximumMembershipDiagnosis(result, {
        reverseIndex: asp.reverseIndex,
        candidateNodeIds,
        edgeRecords,
        targetNodeId,
        s: structuralParameter,
        globalMaximumSize
      });
      structuralKPlexMembershipDiagnosisTimeMs = performance.now() - startedAt;
    } catch (error) {
      structuralKPlexMembershipDiagnosisError = error instanceof Error
        ? error.message
        : "La diagnosi ASP della membership k-plex non è disponibile.";
    } finally {
      structuralKPlexMembershipDiagnosisRunning = false;
      solverRunning = false;
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function searchKPlexMaximumMembershipCounterfactual(targetNodeId: string) {
    if (solverRunning || !clingoWorker || !data || structuralStats?.task !== "kPlex" || !targetNodeId) return;
    clearGraph2DOverlay();
    const requestId = ++structuralKPlexMembershipCounterfactualRequestId;
    const requestedParameter = structuralParameter;
    const requestedGroup = selectedStructuralGroup;
    structuralKPlexMembershipCounterfactual = null;
    structuralKPlexMembershipCounterfactualError = "";
    structuralKPlexMembershipCounterfactualTimeMs = undefined;
    structuralKPlexMembershipCounterfactualCandidateCount = 0;

    if (graphDirection !== "undirected") {
      structuralKPlexMembershipCounterfactualError = "Il controfattuale di membership richiede una proiezione non orientata.";
      return;
    }
    if (!Number.isSafeInteger(structuralParameter) || structuralParameter < 1 ||
      structuralStats.parameter !== structuralParameter) {
      structuralKPlexMembershipCounterfactualError = "Il parametro s del k-plex non corrisponde all'analisi corrente.";
      return;
    }
    if (!Array.isArray(motifCounterfactualEdgeAdditions) || motifCounterfactualEdgeAdditions.length === 0) {
      structuralKPlexMembershipCounterfactualError = "Dichiara gli archi e i costi possibili in graphAnalysis.counterfactuals.edgeAdditions.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      structuralKPlexMembershipCounterfactualError = blockingDiagnostic.message;
      return;
    }

    const candidateNodeIds = data.nodes
      .filter((node: any) => !selectedStructuralGroup || extractGroups(node).includes(selectedStructuralGroup))
      .map((node: any) => String(node.id));
    if (!candidateNodeIds.includes(targetNodeId)) {
      structuralKPlexMembershipCounterfactualError = "Il nodo selezionato non appartiene alla proiezione o al gruppo analizzato.";
      return;
    }

    structuralKPlexMembershipCounterfactualRunning = true;
    solverRunning = true;
    const startedAt = performance.now();
    try {
      const { facts, reverseEdgeIndex, reverseIndex, indexByNodeId } = buildAspFactsFromCurrentData();
      if (!facts.trim()) throw new Error("La proiezione corrente non ha prodotto fatti ASP.");
      const targetIndex = indexByNodeId.get(targetNodeId);
      if (targetIndex === undefined) throw new Error("Il nodo target non è mappabile nell'indice ASP.");
      const { candidatesForCohort, excludedCandidateCount } = resolveStructuralCounterfactualCandidates(
        candidateNodeIds,
        reverseEdgeIndex,
        indexByNodeId
      );
      structuralKPlexMembershipCounterfactualCandidateCount = candidatesForCohort.length;
      if (candidatesForCohort.length > MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES) {
        throw new RangeError(
          `Sono eleggibili ${candidatesForCohort.length} archi candidati (${excludedCandidateCount} esclusi dalla proiezione); il limite esatto corrente è ${MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES}. Riduci edgeAdditions o filtri il grafo.`
        );
      }

      const candidateSet = new Set(candidateNodeIds);
      const observedEdgeRecords = (data.links as any[]).flatMap((link) => {
        const sourceNodeId = normalizeGraphId(getGraphEndpointId(link.source));
        const targetNodeId = normalizeGraphId(getGraphEndpointId(link.target));
        return candidateSet.has(sourceNodeId) && candidateSet.has(targetNodeId)
          ? [{ sourceNodeId, targetNodeId }]
          : [];
      });
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      const deadline = performance.now() + taskTimeoutMs;
      const runWithinBudget = async (program: string, options: string[] = []) => {
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) {
          throw new Error(`è scaduto il budget complessivo di ${taskTimeoutMs} ms; il risultato parziale è stato scartato.`);
        }
        const result = await callClingo(program, options, remainingMs);
        if (result?.Result === "ERROR") throw new Error(result.Error || "Errore del worker clingo.");
        if (result?.Result === "CANCELLED" || result?.Result === "UNKNOWN") {
          throw new Error(`il solver si è interrotto nello stato ${result.Result}; nessun risultato parziale è stato conservato.`);
        }
        return result;
      };

      const outcome = await searchMinimumCostKPlexMaximumMembershipCounterfactual({
        s: requestedParameter,
        targetNodeId,
        candidates: candidatesForCohort,
        solveSelection: (program) => runWithinBudget(program, ["--opt-mode=opt"]),
        evaluateGraph: async (selectedCandidates) => {
          const additionFacts = selectedCandidates.flatMap(({ sourceNode, targetNode }) => [
            `edge(${sourceNode},${targetNode}).`,
            `edge(${targetNode},${sourceNode}).`
          ]).join("\n");
          const graphFacts = [facts.trim(), additionFacts].filter(Boolean).join("\n\n");
          const maximumProgram = buildMaximumKPlexProgram(requestedParameter, requestedGroup);
          const globalResult = await runWithinBudget(`${graphFacts}\n\n${maximumProgram}\n`, ["--opt-mode=opt"]);
          const targetResult = await runWithinBudget(
            `${graphFacts}\n\n${maximumProgram}\n${buildKPlexRequiredNodeConstraint(targetIndex)}\n`,
            ["--opt-mode=opt"]
          );
          return {
            globalResult,
            targetResult,
            reverseIndex,
            candidateNodeIds,
            edgeRecords: [
              ...observedEdgeRecords,
              ...selectedCandidates.map(({ sourceNodeId, targetNodeId: targetEndpointId }) => ({
                sourceNodeId,
                targetNodeId: targetEndpointId
              }))
            ]
          };
        }
      });
      if (requestId === structuralKPlexMembershipCounterfactualRequestId) {
        structuralKPlexMembershipCounterfactual = outcome;
        structuralKPlexMembershipCounterfactualTimeMs = performance.now() - startedAt;
      }
    } catch (error) {
      if (requestId === structuralKPlexMembershipCounterfactualRequestId) {
        structuralKPlexMembershipCounterfactual = null;
        structuralKPlexMembershipCounterfactualError = error instanceof Error
          ? error.message
          : "La ricerca ASP del controfattuale di membership non è disponibile.";
        structuralKPlexMembershipCounterfactualTimeMs = performance.now() - startedAt;
      }
    } finally {
      if (requestId === structuralKPlexMembershipCounterfactualRequestId) {
        structuralKPlexMembershipCounterfactualRunning = false;
      }
      solverRunning = false;
      persistCurrentAnalysisSession(false, true);
    }
  }

  function clearStructuralTaskResult() {
    clearProvenanceKCoreScenarioComparison();
    clearProvenanceKPlexScenarioComparison();
    clearProvenanceComponentScenarioComparison();
    structuralError = "";
    structuralOutcomeMessage = "";
    structuralResults = [];
    clearKPlexCounterfactual();
    clearKCoreCounterfactual();
    clearKCoreMembershipCounterfactual();
    clearTypedPathCounterfactual();
    structuralKPlexMissingPairsBySetKey = {};
    structuralKPlexMaximalityBySetKey = {};
    structuralKPlexMembershipDiagnosisTargetNodeId = "";
    structuralKCoreSupportBySetKey = {};
    structuralKCorePeelingBySetKey = {};
    structuralKCoreNumbers = null;
    structuralKCoreProfileTimeMs = undefined;
    structuralDominatingSetSupportBySetKey = {};
    structuralDominatingSetUncoverableTargetNodeIds = [];
    structuralSeparatorReachableBySetKey = {};
    structuralPathEdgeIdsByStep = [];
    structuralPathCommonTimeValue = undefined;
    structuralPathStartTimeValuesByStep = [];
    structuralPathMinimality = undefined;
    structuralPathNoRouteCertificate = undefined;
    structuralTypedPathNoRouteCertificate = undefined;
    structuralCommunityPartitions = [];
    structuralCommunityTopologyCounterfactual = null;
    structuralCommunityTopologyCounterfactualError = "";
    structuralCommunityTopologyCounterfactualRunning = false;
    structuralCommunityTopologyCounterfactualTimeMs = undefined;
    structuralCommunityConstraintDiagnoses = [];
    structuralCommunityConstraintDiagnosisError = "";
    structuralCommunityConstraintDiagnosesAllEnumerated = false;
    structuralEdgeSourceIdById = {};
    structuralEdgeSourceIdentityById = buildEdgeSourceIdentityByIdentity(originalData?.links ?? []);
    structuralStats = null;
    highlightedEdgeIds = new Set();
    cliqueNodes = new Set();
    clearKPlexMaximumMembershipDiagnosis();
    refreshLinkVisuals();
    refreshNodeVisuals();
  }

  function clearKPlexMaximumMembershipDiagnosis() {
    structuralKPlexMembershipCounterfactualRequestId += 1;
    structuralKPlexMembershipDiagnosis = null;
    structuralKPlexMembershipDiagnosisRunning = false;
    structuralKPlexMembershipDiagnosisError = "";
    structuralKPlexMembershipDiagnosisTimeMs = undefined;
    structuralKPlexMembershipCounterfactual = null;
    structuralKPlexMembershipCounterfactualRunning = false;
    structuralKPlexMembershipCounterfactualError = "";
    structuralKPlexMembershipCounterfactualTimeMs = undefined;
    structuralKPlexMembershipCounterfactualCandidateCount = 0;
  }

  function clearProvenanceKCoreScenarioComparison() {
    provenanceKCoreScenarioComparison = null;
    provenanceKCoreScenarioComparisonProgress = "";
    provenanceKCoreScenarioComparisonError = "";
    provenanceKCoreScenarioSelectedGroup = "";
    provenanceKCoreScenarioConfidenceThreshold = null;
    provenanceKCoreScenarioTimelineWindow = "";
    provenanceKCoreScenarioViewFilters = { types: [], groups: [] };
  }

  function clearProvenanceKPlexScenarioComparison() {
    provenanceKPlexScenarioComparison = null;
    provenanceKPlexScenarioComparisonProgress = "";
    provenanceKPlexScenarioComparisonError = "";
    provenanceKPlexScenarioSelectedGroup = "";
    provenanceKPlexScenarioConfidenceThreshold = null;
    provenanceKPlexScenarioTimelineWindow = "";
    provenanceKPlexScenarioViewFilters = { types: [], groups: [] };
  }

  function clearProvenanceComponentScenarioComparison() {
    provenanceComponentScenarioComparison = null;
    provenanceComponentScenarioComparisonProgress = "";
    provenanceComponentScenarioComparisonError = "";
    provenanceComponentScenarioSelectedGroup = "";
    provenanceComponentScenarioConfidenceThreshold = null;
    provenanceComponentScenarioTimelineWindow = "";
    provenanceComponentScenarioViewFilters = { types: [], groups: [] };
  }

  function clearProvenanceDominatingSetScenarioComparison() {
    provenanceDominatingSetScenarioComparison = null;
    provenanceDominatingSetScenarioComparisonProgress = "";
    provenanceDominatingSetScenarioComparisonError = "";
    provenanceDominatingSetScenarioWhyNot = null;
    provenanceDominatingSetScenarioCandidateGroup = "";
    provenanceDominatingSetScenarioTargetGroup = "";
    provenanceDominatingSetScenarioConfidenceThreshold = null;
    provenanceDominatingSetScenarioTimelineWindow = "";
    provenanceDominatingSetScenarioViewFilters = { types: [], groups: [] };
  }

  function clearKPlexCounterfactual() {
    structuralKPlexCounterfactuals = [];
    structuralKPlexCounterfactualWhyNot = null;
    structuralKPlexCounterfactualWhyNotMessage = "";
    structuralKPlexCounterfactualHasRun = false;
    structuralKPlexCounterfactualError = "";
    structuralKPlexCounterfactualTimeMs = undefined;
    structuralKPlexCounterfactualExcludedCandidateCount = 0;
  }

  function clearKCoreCounterfactual() {
    structuralKCoreCounterfactuals = [];
    structuralKCoreCounterfactualWhyNot = null;
    structuralKCoreCounterfactualWhyNotMessage = "";
    structuralKCoreCounterfactualHasRun = false;
    structuralKCoreCounterfactualError = "";
    structuralKCoreCounterfactualTimeMs = undefined;
    structuralKCoreCounterfactualExcludedCandidateCount = 0;
  }

  function clearKCoreMembershipCounterfactual() {
    structuralKCoreMembershipCounterfactuals = [];
    structuralKCoreMembershipCounterfactualWhyNot = null;
    structuralKCoreMembershipCounterfactualWhyNotMessage = "";
    structuralKCoreMembershipCounterfactualHasRun = false;
    structuralKCoreMembershipCounterfactualError = "";
    structuralKCoreMembershipCounterfactualTimeMs = undefined;
    structuralKCoreMembershipCounterfactualExcludedCandidateCount = 0;
  }

  function clearTypedPathCounterfactual() {
    structuralTypedPathCounterfactuals = [];
    structuralTypedPathCounterfactualWhyNot = undefined;
    structuralTypedPathCounterfactualWhyNotError = "";
    structuralTypedPathCounterfactualHasRun = false;
    structuralTypedPathCounterfactualError = "";
    structuralTypedPathCounterfactualTimeMs = undefined;
    structuralTypedPathCounterfactualExcludedCandidateCount = 0;
  }

  function resolveStructuralCounterfactualCandidates(
    cohortNodeIds: string[],
    reverseEdgeIndex: Record<number, string>,
    indexByNodeId: Map<string, number>
  ): { candidatesForCohort: StructuralEdgeCompletionCandidate[]; excludedCandidateCount: number } {
    if (!Array.isArray(motifCounterfactualEdgeAdditions)) {
      throw new TypeError("Configura graphAnalysis.counterfactuals.edgeAdditions con candidati e costi espliciti.");
    }
    if (motifCounterfactualEdgeAdditions.length === 0) {
      throw new TypeError("La configurazione edgeAdditions non contiene candidati.");
    }
    const actualEdgeIds = new Set<string>((originalData.links as any[]).map((link) =>
      String(link.sourceId ?? link.analysis?.id ?? "").trim()
    ).filter(Boolean));
    const resolveConfiguredNode = (value: unknown, path: string) => {
      if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
        throw new TypeError(`${path} deve indicare un ID nodo stringa o numerico.`);
      }
      const requestedId = String(value).trim();
      const exact = (originalData.nodes as any[]).filter((node) =>
        String(node.sourceId ?? "") === requestedId || String(node.id) === requestedId
      );
      const matches = exact.length > 0
        ? exact
        : (originalData.nodes as any[]).filter((node) => node.id === normalizeGraphId(requestedId));
      const unique = [...new Map(matches.map((node) => [node.id, node])).values()];
      if (unique.length === 0) throw new TypeError(`${path} fa riferimento a un nodo inesistente: '${requestedId}'.`);
      if (unique.length > 1) throw new TypeError(`${path} e ambiguo: '${requestedId}' identifica piu nodi.`);
      return unique[0];
    };

    const firstSyntheticRecord = Math.max(0, ...Object.keys(reverseEdgeIndex).map(Number)) + 1;
    const configuredIds = new Set<string>();
    const resolved = motifCounterfactualEdgeAdditions.map((candidate: any, index: number) => {
      if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
        throw new TypeError(`edgeAdditions[${index}] deve essere un oggetto.`);
      }
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      if (!id) throw new TypeError(`edgeAdditions[${index}].id deve essere una stringa non vuota.`);
      if (configuredIds.has(id)) throw new TypeError(`edgeAdditions contiene l'ID duplicato '${id}'.`);
      if (actualEdgeIds.has(id)) throw new TypeError(`L'ID candidato '${id}' e gia usato da un arco osservato.`);
      configuredIds.add(id);
      const source = resolveConfiguredNode(candidate.sourceNodeId, `edgeAdditions[${index}].sourceNodeId`);
      const target = resolveConfiguredNode(candidate.targetNodeId, `edgeAdditions[${index}].targetNodeId`);
      if (source.id === target.id) throw new TypeError(`edgeAdditions[${index}] non puo essere un cappio.`);
      return { candidate, id, source, target, recordIndex: firstSyntheticRecord + index };
    });
    const candidates = validateKPlexCompletionCandidates(resolved.map(({ candidate, id, source, target, recordIndex }) => ({
      ...candidate,
      id,
      sourceNodeId: String(source.id),
      targetNodeId: String(target.id),
      sourceNode: 1,
      targetNode: 2,
      recordIndex
    })));

    const cohort = new Set(cohortNodeIds);
    const visible = new Set<string>((data.nodes as any[]).map((node) => String(node.id)));
    const nodePairKey = (source: string, target: string) => [source, target].sort().join("\u0000");
    const observedPairs = new Set<string>();
    for (const link of data.links as any[]) {
      const source = normalizeGraphId(getGraphEndpointId(link.source));
      const target = normalizeGraphId(getGraphEndpointId(link.target));
      if (source && target && source !== target) observedPairs.add(nodePairKey(source, target));
    }
    let excludedCandidateCount = 0;
    const candidatesForCohort: StructuralEdgeCompletionCandidate[] = [];
    for (const [index, entry] of resolved.entries()) {
      const sourceId = String(entry.source.id);
      const targetId = String(entry.target.id);
      if (!visible.has(sourceId) || !visible.has(targetId) || !cohort.has(sourceId) || !cohort.has(targetId) ||
        observedPairs.has(nodePairKey(sourceId, targetId))) {
        excludedCandidateCount += 1;
        continue;
      }
      const sourceNode = indexByNodeId.get(sourceId);
      const targetNode = indexByNodeId.get(targetId);
      if (sourceNode === undefined || targetNode === undefined) {
        excludedCandidateCount += 1;
        continue;
      }
      candidatesForCohort.push({ ...candidates[index], sourceNode, targetNode });
    }
    return { candidatesForCohort, excludedCandidateCount };
  }

  async function runTypedPathCounterfactual(request: {
    startNodeId: string;
    goalNodeId: string;
    edgeTypeSequence: string[];
    group: string;
    enumerateAllOptima?: boolean;
    temporalSemantics?: "static" | TypedPathTemporalSemantics;
    strictTemporalOrder?: boolean;
  }) {
    if (solverRunning || !clingoWorker) return;
    clearGraph2DOverlay();
    clearTypedPathCounterfactual();
    if (!typedPathDataReadiness.available) {
      structuralTypedPathCounterfactualError = typedPathDataReadiness.reasons.join("; ");
      return;
    }
    if (!Array.isArray(motifCounterfactualEdgeAdditions) || motifCounterfactualEdgeAdditions.length === 0) {
      structuralTypedPathCounterfactualError = "Configura graphAnalysis.counterfactuals.edgeAdditions con candidati e costi espliciti.";
      return;
    }
    if (!request.startNodeId || !request.goalNodeId || request.startNodeId === request.goalNodeId ||
      !Array.isArray(request.edgeTypeSequence) || request.edgeTypeSequence.length === 0 ||
      request.edgeTypeSequence.some((type) => typeof type !== "string" || type.trim() === "")) {
      structuralTypedPathCounterfactualError = "Scegli due terminali distinti e una sequenza non vuota di tipi d'arco.";
      return;
    }
    if (request.edgeTypeSequence.length > 100 || request.edgeTypeSequence.some((type) =>
      !availableStructuralEdgeTypes.includes(type.trim()))) {
      structuralTypedPathCounterfactualError = "La sequenza deve contenere al massimo 100 passi e usare tipi d'arco disponibili nella proiezione.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      structuralTypedPathCounterfactualError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length || !originalData?.nodes?.length) {
      structuralTypedPathCounterfactualError = "La proiezione corrente non contiene nodi da analizzare.";
      return;
    }

    const temporalSemantics = request.temporalSemantics ?? "static";
    if (temporalSemantics !== "static" && temporalSemantics !== "coValid" && temporalSemantics !== "orderedByStart") {
      structuralTypedPathCounterfactualError = "Scegli una semantica temporale valida per il cammino.";
      return;
    }
    if (temporalSemantics !== "static" && !typedPathTemporalDataReadiness.available) {
      structuralTypedPathCounterfactualError = typedPathTemporalDataReadiness.reasons.join("; ");
      return;
    }

    try {
      const candidateTemporalValues = temporalSemantics === "static" || !Array.isArray(motifCounterfactualEdgeAdditions)
        ? []
        : motifCounterfactualEdgeAdditions.flatMap((candidate: any) => [
          candidate?.validity?.from,
          candidate?.validity?.to
        ]);
      const { facts, reverseIndex, reverseEdgeIndex, indexByNodeId, temporalEncoding } =
        buildAspFactsFromCurrentData(candidateTemporalValues);
      if (!facts.trim()) throw new Error("Non sono stati generati fatti ASP dalla proiezione corrente.");
      const visibleNodeIds = new Set<string>((data.nodes as any[]).map((node) => String(node.id)));
      const nodesInGroup = new Set<string>((data.nodes as any[])
        .filter((node) => !request.group || extractGroups(node).includes(request.group))
        .map((node) => String(node.id)));
      if (!nodesInGroup.has(request.startNodeId) || !nodesInGroup.has(request.goalNodeId)) {
        throw new Error("I terminali selezionati devono appartenere al gruppo candidato scelto per il cammino.");
      }
      if (request.edgeTypeSequence.length + 1 > nodesInGroup.size) {
        throw new Error("La sequenza richiede più nodi distinti di quanti ne contiene il gruppo selezionato.");
      }
      const actualEdgeIds = new Set<string>((originalData.links as any[]).map((link) =>
        String(link.sourceId ?? link.analysis?.id ?? "").trim()
      ).filter(Boolean));
      const resolveConfiguredNode = (value: unknown, path: string) => {
        if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
          throw new TypeError(`${path} deve indicare un ID nodo stringa o numerico.`);
        }
        const requestedId = String(value).trim();
        const exact = (originalData.nodes as any[]).filter((node) =>
          String(node.sourceId ?? "") === requestedId || String(node.id) === requestedId
        );
        const matches = exact.length > 0
          ? exact
          : (originalData.nodes as any[]).filter((node) => node.id === normalizeGraphId(requestedId));
        const unique = [...new Map(matches.map((node) => [node.id, node])).values()];
        if (unique.length === 0) throw new TypeError(`${path} fa riferimento a un nodo inesistente: '${requestedId}'.`);
        if (unique.length > 1) throw new TypeError(`${path} è ambiguo: '${requestedId}' identifica più nodi.`);
        return unique[0];
      };

      const firstSyntheticRecord = Math.max(0, ...Object.keys(reverseEdgeIndex).map(Number)) + 1;
      const candidateIds = new Set<string>();
      const resolved = motifCounterfactualEdgeAdditions.map((candidate: any, index: number) => {
        if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
          throw new TypeError(`edgeAdditions[${index}] deve essere un oggetto.`);
        }
        const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
        if (!id) throw new TypeError(`edgeAdditions[${index}].id deve essere una stringa non vuota.`);
        if (candidateIds.has(id)) throw new TypeError(`edgeAdditions contiene l'ID duplicato '${id}'.`);
        if (actualEdgeIds.has(id)) throw new TypeError(`L'ID candidato '${id}' è già usato da un arco osservato.`);
        candidateIds.add(id);
        const source = resolveConfiguredNode(candidate.sourceNodeId, `edgeAdditions[${index}].sourceNodeId`);
        const target = resolveConfiguredNode(candidate.targetNodeId, `edgeAdditions[${index}].targetNodeId`);
        if (source.id === target.id) throw new TypeError(`edgeAdditions[${index}] non può essere un cappio.`);
        return { candidate, id, source, target, recordIndex: firstSyntheticRecord + index };
      });
      const validationCandidates = resolved.map(({ candidate, id, source, target, recordIndex }) => ({
        ...candidate,
        id,
        sourceNodeId: String(source.sourceId ?? source.id),
        targetNodeId: String(target.sourceId ?? target.id),
        sourceNode: 1,
        targetNode: 2,
        recordIndex
      }));
      const validated = validateKPlexCompletionCandidates(validationCandidates);
      const typedPathOptions = {
        startNode: indexByNodeId.get(request.startNodeId) ?? 1,
        goalNode: indexByNodeId.get(request.goalNodeId) ?? 2,
        edgeTypeSequence: request.edgeTypeSequence,
        direction: graphDirection,
        group: request.group,
        ...(temporalSemantics !== "static" ? { temporalSemantics } : {}),
        ...(temporalSemantics === "orderedByStart"
          ? { strictTemporalOrder: request.strictTemporalOrder === true }
          : {})
      };
      buildTypedPathCompletionCounterfactualProgram(typedPathOptions, validationCandidates, temporalEncoding);

      const nodePairKey = (source: string, target: string) => graphDirection === "undirected"
        ? [source, target].sort().join("\u0000")
        : `${source}\u0000${target}`;
      const observedTypedEdges = new Set<string>();
      for (const link of data.links as any[]) {
        const source = normalizeGraphId(getGraphEndpointId(link.source));
        const target = normalizeGraphId(getGraphEndpointId(link.target));
        const type = typeof link.analysis?.type === "string" ? link.analysis.type.trim() : "";
        if (source && target && source !== target && type) observedTypedEdges.add(`${type}\u0000${nodePairKey(source, target)}`);
      }
      let excludedCandidateCount = 0;
      const candidates = resolved.flatMap(({ candidate, id, source, target, recordIndex }, index) => {
        const sourceId = String(source.id);
        const targetId = String(target.id);
        const edgeType = String(candidate.edgeType).trim();
        const sourceNode = indexByNodeId.get(sourceId);
        const targetNode = indexByNodeId.get(targetId);
        const edgeAlreadyObserved = observedTypedEdges.has(`${edgeType}\u0000${nodePairKey(sourceId, targetId)}`);
        if (!visibleNodeIds.has(sourceId) || !nodesInGroup.has(sourceId) || !visibleNodeIds.has(targetId) ||
          !nodesInGroup.has(targetId) || !request.edgeTypeSequence.some((type) => type.trim() === edgeType) ||
          temporalSemantics === "static" && edgeAlreadyObserved || sourceNode === undefined || targetNode === undefined) {
          excludedCandidateCount += 1;
          return [];
        }
        return [{
          ...validated[index],
          ...(temporalSemantics !== "static" && candidate.validity !== undefined
            ? { validity: candidate.validity }
            : {}),
          sourceNode,
          targetNode,
          recordIndex
        }];
      });
      structuralTypedPathCounterfactualExcludedCandidateCount = excludedCandidateCount;

      const compiled = buildTypedPathCompletionCounterfactualProgram(typedPathOptions, candidates, temporalEncoding);
      const edgeIdentityFacts = buildMinimumEdgeSeparatorFacts(
        data.links,
        indexByNodeId,
        new Map<string, string>((data.nodes as any[]).map((node) => [String(node.id), String(node.label ?? node.id)]))
      );
      structuralEdgeSourceIdById = edgeIdentityFacts.displayIdByEdgeId;
      const observedEdges = (data.links as any[]).flatMap((link, index) => {
        const source = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.source)));
        const target = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.target)));
        const edgeType = typeof link.analysis?.type === "string" ? link.analysis.type.trim() : "";
        return source && target && edgeType
          ? [{ recordIndex: index + 1, sourceNode: source, targetNode: target, edgeType }]
          : [];
      });
      const temporalEdgeRecords: TypedPathTemporalEdgeRecord[] = temporalSemantics === "static" ? [] :
        (data.links as any[]).flatMap((link, index) => {
          const sourceNode = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.source)));
          const targetNode = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.target)));
          const validityFrom = temporalEncoding.encode(link.analysis?.validity?.from);
          const validityTo = temporalEncoding.encode(link.analysis?.validity?.to);
          if (!sourceNode || !targetNode || validityFrom === null || validityTo === null) return [];
          return [{
            recordIndex: index + 1,
            sourceNode,
            targetNode,
            edgeType: String(link.analysis?.type ?? ""),
            validityFrom,
            validityTo
          }];
        });
      const fullProgram = `${facts.trim()}\n\n${compiled.program}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      const deadline = performance.now() + taskTimeoutMs;
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`è scaduto il limite complessivo di ${taskTimeoutMs} ms`);
        const result = await callClingo(
          fullProgram,
          getStructuralCounterfactualSolverOptions(request.enumerateAllOptima === true),
          remainingMs
        );
        structuralTypedPathCounterfactualTimeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          structuralTypedPathCounterfactualError = result.Error || "Errore del worker clingo.";
          return;
        }
        if (request.enumerateAllOptima === true && result?.Result !== "UNSATISFIABLE" &&
          !hasCompleteModelEnumeration(result)) {
          structuralTypedPathCounterfactualError = "clingo non conferma che tutte le proposte ottime siano state enumerate; il risultato parziale è stato scartato.";
          return;
        }
        if (result?.Result === "UNSATISFIABLE") {
          structuralTypedPathCounterfactualHasRun = true;
          try {
            const whyNot = temporalSemantics === "static"
              ? buildTypedPathCompletionWhyNotProgram(typedPathOptions, compiled.candidates)
              : buildTypedPathTemporalCompletionWhyNotProgram(
                typedPathOptions as TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics },
                candidates,
                temporalEncoding
              );
            const whyNotProgram = `${facts.trim()}\n\n${whyNot.program}\n`;
            const whyNotBudgetMs = getRemainingSolverBudgetMs(deadline, performance.now());
            if (whyNotBudgetMs <= 0) {
              structuralTypedPathCounterfactualWhyNotError = `Il budget complessivo di ${taskTimeoutMs} ms è esaurito prima della diagnosi dei prefissi.`;
            } else {
              const whyNotResult = await callClingo(
                whyNotProgram,
                temporalSemantics === "static" ? [] : getStructuralCounterfactualSolverOptions(),
                whyNotBudgetMs
              );
              structuralTypedPathCounterfactualTimeMs = performance.now() - startedAt;
              if (temporalSemantics === "static" && whyNotResult?.Result === "SATISFIABLE" ||
                temporalSemantics !== "static" && whyNotResult?.Result === "OPTIMUM FOUND") {
                structuralTypedPathCounterfactualWhyNot = temporalSemantics === "static"
                  ? parseTypedPathCompletionWhyNotCertificate(
                    whyNotResult?.Call?.[0]?.Witnesses,
                    typedPathOptions,
                    whyNot.candidates,
                    observedEdges,
                    [...nodesInGroup],
                    reverseIndex
                  ) ?? undefined
                  : parseTypedPathTemporalCompletionWhyNotCertificate(
                    whyNotResult?.Call?.[0]?.Witnesses,
                    typedPathOptions as TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics },
                    whyNot.candidates,
                    temporalEdgeRecords,
                    [...nodesInGroup],
                    reverseIndex,
                    edgeIdentityFacts.reverseEdgeIndex,
                    temporalEncoding.decode
                  ) ?? undefined;
                if (!structuralTypedPathCounterfactualWhyNot) {
                  structuralTypedPathCounterfactualWhyNotError = "Il witness ASP dei prefissi non coincide con il ricalcolo indipendente.";
                }
              } else {
                const failureDetail = typeof whyNotResult?.Error === "string" ? whyNotResult.Error.trim() : "";
                structuralTypedPathCounterfactualWhyNotError =
                  `La diagnosi why-not non è stata completata (${whyNotResult?.Result ?? "risposta vuota"})${failureDetail ? `: ${failureDetail}` : "."}`;
              }
            }
          } catch (whyNotError) {
            structuralTypedPathCounterfactualWhyNotError =
              `La diagnosi why-not non è disponibile: ${whyNotError instanceof Error ? whyNotError.message : String(whyNotError)}`;
          }
          return;
        }
        const emptyCandidateFeasibility = compiled.candidates.length === 0 && result?.Result === "SATISFIABLE";
        if (result?.Result !== "OPTIMUM FOUND" && !emptyCandidateFeasibility) {
          structuralTypedPathCounterfactualError = `Il solver non ha provato una proposta ottima (${result?.Result ?? "risposta vuota"}).`;
          return;
        }
        structuralTypedPathCounterfactuals = parseTypedPathCompletionCounterfactuals(
          result?.Call?.[0]?.Witnesses,
          typedPathOptions,
          compiled.candidates,
          observedEdges,
          reverseIndex,
          edgeIdentityFacts.reverseEdgeIndex,
          temporalSemantics === "static" ? undefined : {
            edgeRecords: temporalEdgeRecords,
            decodeTemporalValue: temporalEncoding.decode
          }
        );
        if (structuralTypedPathCounterfactuals.length === 0) {
          structuralTypedPathCounterfactualError = "Il solver ha trovato un ottimo, ma il witness del cammino non ha superato la verifica.";
          return;
        }
        structuralTypedPathCounterfactualHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      structuralTypedPathCounterfactualError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function runKPlexCompletionCounterfactual(request: {
    targetS: number;
    cohortNodeIds: string[];
    enumerateAllOptima?: boolean;
  }) {
    if (solverRunning || !clingoWorker) return;
    clearGraph2DOverlay();
    clearKPlexCounterfactual();
    if (graphDirection !== "undirected") {
      structuralKPlexCounterfactualError = "Il completamento k-plex richiede la proiezione non orientata.";
      return;
    }
    if (!Number.isSafeInteger(request.targetS) || request.targetS < 1) {
      structuralKPlexCounterfactualError = "Il valore target s deve essere un intero positivo sicuro.";
      return;
    }
    if (!Array.isArray(motifCounterfactualEdgeAdditions)) {
      structuralKPlexCounterfactualError = "Configura graphAnalysis.counterfactuals.edgeAdditions con candidati e costi espliciti.";
      return;
    }
    if (motifCounterfactualEdgeAdditions.length === 0) {
      structuralKPlexCounterfactualError = "La configurazione edgeAdditions non contiene candidati.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      structuralKPlexCounterfactualError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length || !originalData?.nodes?.length) {
      structuralKPlexCounterfactualError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }
    if (!Array.isArray(request.cohortNodeIds)) {
      structuralKPlexCounterfactualError = "Il testimone k-plex deve essere una lista di nodi.";
      return;
    }
    const cohortNodeIds = [...new Set(request.cohortNodeIds.map(String))];
    if (cohortNodeIds.length === 0 || cohortNodeIds.length !== request.cohortNodeIds.length) {
      structuralKPlexCounterfactualError = "Seleziona un testimone k-plex non vuoto e privo di nodi duplicati.";
      return;
    }
    const visibleNodeIds = new Set<string>((data.nodes as any[]).map((node) => String(node.id)));
    if (cohortNodeIds.some((nodeId) => !visibleNodeIds.has(nodeId))) {
      structuralKPlexCounterfactualError = "Il testimone selezionato non appartiene piu alla proiezione visibile corrente.";
      return;
    }

    try {
      const { facts, reverseEdgeIndex, indexByNodeId } = buildAspFactsFromCurrentData();
      if (!facts.trim()) {
        structuralKPlexCounterfactualError = "Non sono stati generati fatti ASP dalla proiezione visibile corrente.";
        return;
      }
      const cohortNodeIndices = cohortNodeIds.map((nodeId) => indexByNodeId.get(nodeId));
      if (cohortNodeIndices.some((index) => index === undefined)) {
        structuralKPlexCounterfactualError = "Non tutti i nodi del testimone sono mappabili in ASP.";
        return;
      }

      const { candidatesForCohort, excludedCandidateCount } = resolveStructuralCounterfactualCandidates(
        cohortNodeIds,
        reverseEdgeIndex,
        indexByNodeId
      );
      structuralKPlexCounterfactualExcludedCandidateCount = excludedCandidateCount;
      const compiled = buildKPlexCompletionCounterfactualProgram(
        request.targetS,
        cohortNodeIndices as number[],
        candidatesForCohort
      );
      const fullProgram = `${facts.trim()}\n\n${compiled.program}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      const deadline = performance.now() + taskTimeoutMs;
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`e scaduto il limite complessivo di ${taskTimeoutMs} ms`);
        const result = await callClingo(
          fullProgram,
          getStructuralSolverOptions("kPlex", request.enumerateAllOptima === true),
          remainingMs
        );
        if (result?.Result === "ERROR") {
          structuralKPlexCounterfactualError = result.Error || "Errore del worker clingo.";
          return;
        }
        if (request.enumerateAllOptima === true && result?.Result !== "UNSATISFIABLE" &&
          !hasCompleteModelEnumeration(result)) {
          structuralKPlexCounterfactualError = "clingo non conferma che tutti i completamenti ottimi siano stati enumerati; il risultato parziale è stato scartato.";
          return;
        }
        if (result?.Result === "UNSATISFIABLE") {
          structuralKPlexCounterfactualHasRun = true;
          const whyNotRemainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
          if (whyNotRemainingMs <= 0) {
            structuralKPlexCounterfactualWhyNotMessage = "Il solver ha provato l'infeasibilita, ma il budget complessivo e terminato prima di completare il certificato why-not.";
          } else {
            try {
              const diagnostic = buildKPlexCompletionWhyNotProgram(
                request.targetS,
                cohortNodeIndices as number[],
                candidatesForCohort
              );
              const diagnosticResult = await callClingo(
                `${facts.trim()}\n\n${diagnostic.program}\n`,
                [],
                whyNotRemainingMs
              );
              if (diagnosticResult?.Result !== "SATISFIABLE" || diagnosticResult?.Models?.More !== "no") {
                structuralKPlexCounterfactualWhyNotMessage = diagnosticResult?.Result === "ERROR"
                  ? `Il solver ha provato l'infeasibilita, ma non ha completato il certificato why-not: ${diagnosticResult.Error || "errore del worker clingo"}`
                  : `Il solver ha provato l'infeasibilita, ma la query why-not non ha restituito un answer set completo (${diagnosticResult?.Result ?? "risposta vuota"}).`;
              } else {
                const observedEdges = (data.links as any[]).flatMap((link) => {
                  const sourceNode = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.source)));
                  const targetNode = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.target)));
                  return sourceNode !== undefined && targetNode !== undefined
                    ? [{ sourceNode, targetNode }]
                    : [];
                });
                const nodeIdByIndex = new Map<number, string>(
                  [...indexByNodeId.entries()].map(([nodeId, nodeIndex]) => [nodeIndex, nodeId])
                );
                structuralKPlexCounterfactualWhyNot = parseKPlexCompletionWhyNot(
                  diagnosticResult?.Call?.[0]?.Witnesses,
                  request.targetS,
                  cohortNodeIndices as number[],
                  observedEdges,
                  diagnostic.candidates,
                  nodeIdByIndex
                );
              }
            } catch (error) {
              structuralKPlexCounterfactualWhyNotMessage = error instanceof Error
                ? `Il solver ha provato l'infeasibilita, ma il certificato why-not non ha superato la verifica: ${error.message}`
                : `Il solver ha provato l'infeasibilita, ma il certificato why-not non ha superato la verifica: ${String(error)}`;
            }
          }
          structuralKPlexCounterfactualTimeMs = performance.now() - startedAt;
          return;
        }
        structuralKPlexCounterfactualTimeMs = performance.now() - startedAt;
        const emptyCandidateOptimum = result?.Result === "SATISFIABLE" && compiled.candidates.length === 0;
        if (result?.Result !== "OPTIMUM FOUND" && !emptyCandidateOptimum) {
          structuralKPlexCounterfactualError = `Il solver non ha provato una proposta ottima (${result?.Result ?? "risposta vuota"}).`;
          return;
        }
        structuralKPlexCounterfactuals = parseKPlexCompletionCounterfactuals(
          result?.Call?.[0]?.Witnesses,
          compiled.candidates
        );
        if (structuralKPlexCounterfactuals.length === 0) {
          structuralKPlexCounterfactualError = "Il solver ha trovato un ottimo, ma il testimone non e stato mappato in modo verificabile.";
          return;
        }
        structuralKPlexCounterfactualHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      structuralKPlexCounterfactualError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function runKCoreCompletionCounterfactual(request: {
    targetK: number;
    cohortNodeIds: string[];
    enumerateAllOptima?: boolean;
  }) {
    if (solverRunning || !clingoWorker) return;
    clearGraph2DOverlay();
    clearKCoreCounterfactual();
    if (graphDirection !== "undirected") {
      structuralKCoreCounterfactualError = "Il completamento k-core e definito qui solo per la proiezione non orientata.";
      return;
    }
    if (!Number.isSafeInteger(request.targetK) || request.targetK < Number(structuralParameter)) {
      structuralKCoreCounterfactualError = `Il valore target k deve essere un intero sicuro maggiore o uguale a ${structuralParameter}.`;
      return;
    }
    if (!Array.isArray(motifCounterfactualEdgeAdditions) || motifCounterfactualEdgeAdditions.length === 0) {
      structuralKCoreCounterfactualError = "Configura graphAnalysis.counterfactuals.edgeAdditions con candidati e costi espliciti.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      structuralKCoreCounterfactualError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length || !originalData?.nodes?.length) {
      structuralKCoreCounterfactualError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }
    if (!Array.isArray(request.cohortNodeIds)) {
      structuralKCoreCounterfactualError = "Il testimone k-core deve essere una lista di nodi.";
      return;
    }
    const cohortNodeIds = [...new Set(request.cohortNodeIds.map(String))];
    if (cohortNodeIds.length === 0 || cohortNodeIds.length !== request.cohortNodeIds.length) {
      structuralKCoreCounterfactualError = "Seleziona un testimone k-core non vuoto e privo di nodi duplicati.";
      return;
    }
    const visibleNodeIds = new Set<string>((data.nodes as any[]).map((node) => String(node.id)));
    if (cohortNodeIds.some((nodeId) => !visibleNodeIds.has(nodeId))) {
      structuralKCoreCounterfactualError = "Il testimone selezionato non appartiene piu alla proiezione visibile corrente.";
      return;
    }

    try {
      const { facts, reverseEdgeIndex, indexByNodeId } = buildAspFactsFromCurrentData();
      if (!facts.trim()) {
        structuralKCoreCounterfactualError = "Non sono stati generati fatti ASP dalla proiezione visibile corrente.";
        return;
      }
      const cohortNodeIndices = cohortNodeIds.map((nodeId) => indexByNodeId.get(nodeId));
      if (cohortNodeIndices.some((index) => index === undefined)) {
        structuralKCoreCounterfactualError = "Non tutti i nodi del testimone sono mappabili in ASP.";
        return;
      }
      const { candidatesForCohort, excludedCandidateCount } = resolveStructuralCounterfactualCandidates(
        cohortNodeIds,
        reverseEdgeIndex,
        indexByNodeId
      );
      structuralKCoreCounterfactualExcludedCandidateCount = excludedCandidateCount;
      const compiled = buildKCoreCompletionCounterfactualProgram(
        request.targetK,
        cohortNodeIndices as number[],
        candidatesForCohort
      );
      const fullProgram = `${facts.trim()}\n\n${compiled.program}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      const deadline = performance.now() + taskTimeoutMs;
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`e scaduto il limite complessivo di ${taskTimeoutMs} ms`);
        const result = await callClingo(
          fullProgram,
          getStructuralCounterfactualSolverOptions(request.enumerateAllOptima === true),
          remainingMs
        );
        if (result?.Result === "ERROR") {
          structuralKCoreCounterfactualError = result.Error || "Errore del worker clingo.";
          structuralKCoreCounterfactualTimeMs = performance.now() - startedAt;
          return;
        }
        if (request.enumerateAllOptima === true && result?.Result !== "UNSATISFIABLE" &&
          !hasCompleteModelEnumeration(result)) {
          structuralKCoreCounterfactualError = "clingo non conferma che tutti i completamenti ottimi del k-core siano stati enumerati; il risultato parziale è stato scartato.";
          structuralKCoreCounterfactualTimeMs = performance.now() - startedAt;
          return;
        }
        if (result?.Result === "UNSATISFIABLE") {
          structuralKCoreCounterfactualHasRun = true;
          const whyNotRemainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
          if (whyNotRemainingMs <= 0) {
            structuralKCoreCounterfactualWhyNotMessage = "Il solver ha provato l'infeasibilita, ma il budget complessivo e terminato prima di completare il certificato why-not.";
          } else {
            try {
              const diagnostic = buildKCoreCompletionWhyNotProgram(
                request.targetK,
                cohortNodeIndices as number[],
                candidatesForCohort
              );
              const diagnosticResult = await callClingo(
                `${facts.trim()}\n\n${diagnostic.program}\n`,
                [],
                whyNotRemainingMs
              );
              if (diagnosticResult?.Result !== "SATISFIABLE" || diagnosticResult?.Models?.More !== "no") {
                structuralKCoreCounterfactualWhyNotMessage = diagnosticResult?.Result === "ERROR"
                  ? `Il solver ha provato l'infeasibilita, ma non ha completato il certificato why-not: ${diagnosticResult.Error || "errore del worker clingo"}`
                  : `Il solver ha provato l'infeasibilita, ma la query why-not non ha restituito un answer set completo (${diagnosticResult?.Result ?? "risposta vuota"}).`;
              } else {
                const observedEdges = (data.links as any[]).flatMap((link) => {
                  const sourceNode = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.source)));
                  const targetNode = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.target)));
                  return sourceNode !== undefined && targetNode !== undefined
                    ? [{ sourceNode, targetNode }]
                    : [];
                });
                const nodeIdByIndex = new Map<number, string>(
                  [...indexByNodeId.entries()].map(([nodeId, nodeIndex]) => [nodeIndex, nodeId])
                );
                structuralKCoreCounterfactualWhyNot = parseKCoreCompletionWhyNot(
                  diagnosticResult?.Call?.[0]?.Witnesses,
                  request.targetK,
                  cohortNodeIndices as number[],
                  observedEdges,
                  diagnostic.candidates,
                  nodeIdByIndex
                );
              }
            } catch (error) {
              structuralKCoreCounterfactualWhyNotMessage = error instanceof Error
                ? `Il solver ha provato l'infeasibilita, ma il certificato why-not non ha superato la verifica: ${error.message}`
                : `Il solver ha provato l'infeasibilita, ma il certificato why-not non ha superato la verifica: ${String(error)}`;
            }
          }
          structuralKCoreCounterfactualTimeMs = performance.now() - startedAt;
          return;
        }
        structuralKCoreCounterfactualTimeMs = performance.now() - startedAt;
        const emptyCandidateOptimum = result?.Result === "SATISFIABLE" && compiled.candidates.length === 0;
        if (result?.Result !== "OPTIMUM FOUND" && !emptyCandidateOptimum) {
          structuralKCoreCounterfactualError = `Il solver non ha provato una proposta ottima (${result?.Result ?? "risposta vuota"}).`;
          return;
        }
        structuralKCoreCounterfactuals = parseKCoreCompletionCounterfactuals(
          result?.Call?.[0]?.Witnesses,
          compiled.candidates
        );
        if (structuralKCoreCounterfactuals.length === 0) {
          structuralKCoreCounterfactualError = "Il solver ha trovato un ottimo, ma il testimone non e stato mappato in modo verificabile.";
          return;
        }
        structuralKCoreCounterfactualHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      structuralKCoreCounterfactualError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function runKCoreMembershipCompletionCounterfactual(request: {
    targetK: number;
    targetNodeId: string;
    candidateNodeIds: string[];
    enumerateAllOptima?: boolean;
  }) {
    if (solverRunning || !clingoWorker) return;
    clearGraph2DOverlay();
    clearKCoreMembershipCounterfactual();
    if (graphDirection !== "undirected") {
      structuralKCoreMembershipCounterfactualError = "L'appartenenza controfattuale al k-core richiede una proiezione non orientata.";
      return;
    }
    if (!Number.isSafeInteger(request.targetK) || request.targetK < Number(structuralParameter)) {
      structuralKCoreMembershipCounterfactualError = `La soglia target k deve essere un intero sicuro maggiore o uguale a ${structuralParameter}.`;
      return;
    }
    if (!Array.isArray(motifCounterfactualEdgeAdditions) || motifCounterfactualEdgeAdditions.length === 0) {
      structuralKCoreMembershipCounterfactualError = "Configura graphAnalysis.counterfactuals.edgeAdditions con candidati e costi espliciti.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      structuralKCoreMembershipCounterfactualError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length || !originalData?.nodes?.length) {
      structuralKCoreMembershipCounterfactualError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }
    if (!Array.isArray(request.candidateNodeIds)) {
      structuralKCoreMembershipCounterfactualError = "Il dominio candidato deve essere una lista di nodi.";
      return;
    }
    const candidateNodeIds = [...new Set(request.candidateNodeIds.map(String))];
    if (candidateNodeIds.length === 0 || candidateNodeIds.length !== request.candidateNodeIds.length) {
      structuralKCoreMembershipCounterfactualError = "Il dominio candidato deve contenere nodi visibili univoci.";
      return;
    }
    const visibleNodeIds = new Set<string>((data.nodes as any[]).map((node) => String(node.id)));
    if (candidateNodeIds.some((nodeId) => !visibleNodeIds.has(nodeId))) {
      structuralKCoreMembershipCounterfactualError = "Il dominio candidato non appartiene piu alla proiezione visibile corrente.";
      return;
    }
    const targetNodeId = String(request.targetNodeId ?? "");
    if (!candidateNodeIds.includes(targetNodeId)) {
      structuralKCoreMembershipCounterfactualError = "Seleziona un nodo obiettivo appartenente al dominio candidato corrente.";
      return;
    }

    try {
      const { facts, reverseEdgeIndex, indexByNodeId } = buildAspFactsFromCurrentData();
      if (!facts.trim()) {
        structuralKCoreMembershipCounterfactualError = "Non sono stati generati fatti ASP dalla proiezione visibile corrente.";
        return;
      }
      const candidateNodeIndices = candidateNodeIds.map((nodeId) => indexByNodeId.get(nodeId));
      const targetNodeIndex = indexByNodeId.get(targetNodeId);
      if (targetNodeIndex === undefined || candidateNodeIndices.some((index) => index === undefined)) {
        structuralKCoreMembershipCounterfactualError = "Il nodo obiettivo o il dominio candidato non sono interamente mappabili in ASP.";
        return;
      }
      const { candidatesForCohort, excludedCandidateCount } = resolveStructuralCounterfactualCandidates(
        candidateNodeIds,
        reverseEdgeIndex,
        indexByNodeId
      );
      structuralKCoreMembershipCounterfactualExcludedCandidateCount = excludedCandidateCount;
      const compiled = buildKCoreMembershipCompletionCounterfactualProgram(
        request.targetK,
        targetNodeIndex,
        candidateNodeIndices as number[],
        candidatesForCohort
      );
      const nodeIdByIndex = new Map([...indexByNodeId].map(([nodeId, index]) => [index, nodeId]));
      const fullProgram = `${facts.trim()}\n\n${compiled.program}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      const deadline = performance.now() + taskTimeoutMs;
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`e scaduto il limite complessivo di ${taskTimeoutMs} ms`);
        const result = await callClingo(
          fullProgram,
          getKCoreMembershipCounterfactualSolverOptions(request.enumerateAllOptima === true),
          remainingMs
        );
        if (result?.Result === "ERROR") {
          structuralKCoreMembershipCounterfactualError = result.Error || "Errore del worker clingo.";
          structuralKCoreMembershipCounterfactualTimeMs = performance.now() - startedAt;
          return;
        }
        if (request.enumerateAllOptima === true && result?.Result !== "UNSATISFIABLE" &&
          !hasCompleteModelEnumeration(result)) {
          structuralKCoreMembershipCounterfactualError = "clingo non conferma che tutte le proposte ottime di membership siano state enumerate; il risultato parziale è stato scartato.";
          structuralKCoreMembershipCounterfactualTimeMs = performance.now() - startedAt;
          return;
        }
        if (result?.Result === "UNSATISFIABLE") {
          structuralKCoreMembershipCounterfactualHasRun = true;
          const whyNotRemainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
          if (whyNotRemainingMs <= 0) {
            structuralKCoreMembershipCounterfactualWhyNotMessage = "Il solver ha provato l'infattibilita, ma il budget complessivo e terminato prima di completare il certificato why-not.";
          } else {
            try {
              const observedEdges = (data.links as any[]).flatMap((link) => {
                const sourceNode = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.source)));
                const targetNode = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.target)));
                return sourceNode !== undefined && targetNode !== undefined
                  ? [{ sourceNode, targetNode }]
                  : [];
              });
              structuralKCoreMembershipCounterfactualWhyNot = await solveKCoreMembershipCompletionWhyNotByRounds(
                request.targetK,
                targetNodeIndex,
                candidateNodeIndices as number[],
                observedEdges,
                candidatesForCohort,
                nodeIdByIndex,
                async (roundProgram) => {
                  const remainingRoundMs = getRemainingSolverBudgetMs(deadline, performance.now());
                  if (remainingRoundMs <= 0) {
                    throw new Error(`e scaduto il limite complessivo di ${taskTimeoutMs} ms`);
                  }
                  return await callClingo(roundProgram, [], remainingRoundMs);
                },
                { stopAfterTargetRemoval: true, maxRoundsPerQuery: 4, adaptiveBatching: true }
              );
            } catch (error) {
              structuralKCoreMembershipCounterfactualWhyNotMessage = error instanceof Error
              ? `Il solver ha provato l'infattibilita, ma il certificato why-not non e stato completato o verificato: ${error.message}`
              : `Il solver ha provato l'infattibilita, ma il certificato why-not non e stato completato o verificato: ${String(error)}`;
            }
          }
          structuralKCoreMembershipCounterfactualTimeMs = performance.now() - startedAt;
          return;
        }
        structuralKCoreMembershipCounterfactualTimeMs = performance.now() - startedAt;
        const emptyCandidateOptimum = result?.Result === "SATISFIABLE" && compiled.candidates.length === 0;
        if (result?.Result !== "OPTIMUM FOUND" && !emptyCandidateOptimum) {
          structuralKCoreMembershipCounterfactualError = `Il solver non ha provato un completamento ottimo (${result?.Result ?? "risposta vuota"}).`;
          return;
        }
        structuralKCoreMembershipCounterfactuals = parseKCoreMembershipCompletionCounterfactuals(
          result?.Call?.[0]?.Witnesses,
          compiled.candidates,
          nodeIdByIndex,
          targetNodeId
        );
        if (structuralKCoreMembershipCounterfactuals.length === 0) {
          structuralKCoreMembershipCounterfactualError = "Il solver ha trovato un ottimo, ma il witness di appartenenza al k-core non e stato mappato in modo verificabile.";
          return;
        }
        structuralKCoreMembershipCounterfactualHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      structuralKCoreMembershipCounterfactualError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function runStructuralAnalysis(request: {
    task: StructuralTask;
    parameter: number;
    kCoreMode?: DirectedKCoreMode | "";
    includeKCoreNumbers?: boolean;
    group: string;
    pathEdgeTypeSequence?: string[];
    pathTemporalSemantics?: "static" | TypedPathTemporalSemantics;
    strictTemporalOrder?: boolean;
    enumerateAllOptima?: boolean;
    enumerateAllMaximalKPlex?: boolean;
    startNodeId?: string;
    goalNodeId?: string;
    targetGroup?: string;
    minimumCommunityCount?: number;
    maximumCommunityCount?: number;
    explainKCoreExclusions?: boolean;
    explainCommunityContributions?: boolean;
    explainCommunityInfeasibility?: boolean;
    explainPathMinimality?: boolean;
    explainTypedPathNoRoute?: boolean;
  }) {
    if (solverRunning || !clingoWorker) return;
    showSolverPanel = false;
    showIntegrityPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showStructuralPanel = true;
    lastGraph2DAnalysisKind = "structural";
    clearStructuralTaskResult();
    clearGraph2DOverlay();

    const taskContract = getGraphTaskContract(request.task, {
      direction: graphDirection,
      temporalSemantics: request.pathTemporalSemantics ?? "static",
      useEdgeWeights: request.task === "communities" && configuredCommunityConstraints?.useEdgeWeights === true
    });
    if (!taskContract) {
      structuralError = `Il task '${request.task}' non ha un contratto registrato.`;
      return;
    }
    const enumeration = resolveTaskEnumeration(request.task, {
      enumerateAllOptima: request.enumerateAllOptima,
      enumerateAllMaximalKPlex: request.enumerateAllMaximalKPlex
    });
    if (!enumeration) {
      structuralError = `La modalit\u00e0 di enumerazione richiesta per '${request.task}' non \u00e8 dichiarata nel contratto ASP.`;
      return;
    }
    const requiredCapabilities = taskContract.requiredCapabilities.slice();
    const capabilitiesForRequest = request.task === "minimumCostNodeSeparator"
      ? {
          ...graphCapabilities,
          nodeRemovalCosts: checkNodeRemovalCostCapabilityForCandidates(
            graphCapabilities.nodeRemovalCosts,
            data?.nodes ?? [],
            request.group,
            [request.startNodeId, request.goalNodeId],
            extractGroups
          )
        }
      : graphCapabilities;
    const requirements = checkGraphTaskRequirements(capabilitiesForRequest, requiredCapabilities);
    if (!requirements.available) {
      structuralError = requirements.reasons.join("; ");
      return;
    }

    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      structuralError = blockingDiagnostic.message;
      return;
    }
    if (!data || !data.nodes?.length) {
      structuralError = "La proiezione corrente non contiene nodi visibili.";
      return;
    }
    if ((request.task === "kPlex" || request.task === "maximalKPlex") && request.group &&
      !data.nodes.some((node: any) => extractGroups(node).includes(request.group))) {
      structuralError = "Il gruppo selezionato non contiene nodi nella proiezione visibile corrente.";
      return;
    }
    const kPlexTask = request.task === "kPlex" || request.task === "maximalKPlex";
    const parameterizedTask = kPlexTask || request.task === "kCore" || request.task === "path";
    if (parameterizedTask &&
      (!Number.isInteger(request.parameter) || request.parameter < (kPlexTask ? 1 : 0))) {
      structuralError = kPlexTask
        ? "Il parametro s del k-plex deve essere un intero maggiore o uguale a 1."
        : "Il parametro k del k-core deve essere un intero maggiore o uguale a 0.";
      return;
    }
    if (request.task === "kCore" && graphDirection === "directed" &&
      request.kCoreMode !== "in" && request.kCoreMode !== "out" && request.kCoreMode !== "mutual") {
      structuralError = "Per il k-core diretto scegli esplicitamente grado entrante, uscente o vicinanza reciproca.";
      return;
    }

    const { facts, reverseIndex, indexByNodeId, temporalEncoding } = buildAspFactsFromCurrentData();
    if (!facts.trim()) {
      structuralError = "Non sono stati generati fatti ASP dalla proiezione corrente.";
      return;
    }

    const edgeSeparatorTask = request.task === "minimumEdgeSeparator" || request.task === "minimumCostEdgeSeparator";
    const nodeSeparatorTask = request.task === "minimumNodeSeparator" || request.task === "minimumCostNodeSeparator";
    const terminalTask = request.task === "path" || request.task === "typedPath" || nodeSeparatorTask || edgeSeparatorTask;
    const startIndex = terminalTask && request.startNodeId
      ? indexByNodeId.get(request.startNodeId)
      : undefined;
    const goalIndex = terminalTask && request.goalNodeId
      ? indexByNodeId.get(request.goalNodeId)
      : undefined;
    if (terminalTask && (!startIndex || !goalIndex)) {
      structuralError = "Scegli due nodi presenti nella proiezione visibile corrente.";
      return;
    }
    if (request.task === "path" && request.group) {
      const candidateIds = new Set(data.nodes
        .filter((node: any) => extractGroups(node).includes(request.group))
        .map((node: any) => node.id));
      if (!candidateIds.has(request.startNodeId) || !candidateIds.has(request.goalNodeId)) {
        structuralError = "I terminali selezionati devono appartenere al gruppo candidato scelto per il cammino.";
        return;
      }
    }
    if ((request.task === "typedPath" || nodeSeparatorTask || edgeSeparatorTask) && startIndex === goalIndex) {
      structuralError = request.task === "typedPath"
        ? "Scegli nodi iniziale e finale distinti per il cammino tipizzato."
        : "Scegli due nodi terminali distinti da separare.";
      return;
    }
    const edgeSeparatorFacts = edgeSeparatorTask
      ? buildMinimumEdgeSeparatorFacts(
        data.links,
        indexByNodeId,
        new Map(data.nodes.map((node: any) => [node.id, String(node.label ?? node.id)]))
      )
      : null;
    const typedPathEdgeIdentityFacts = request.task === "typedPath"
      ? buildMinimumEdgeSeparatorFacts(
        data.links,
        indexByNodeId,
        new Map(data.nodes.map((node: any) => [node.id, String(node.label ?? node.id)]))
      )
      : null;
    let communityEdgeLinks: any[] = [];
    let communityEdgeRecords: NonNullable<typeof communityPairMembershipContext>["communityEdgeRecords"] = [];
    let communityEdgeIdentityFacts: ReturnType<typeof buildMinimumEdgeSeparatorFacts> | null = null;
    const pathEdgeWitnessFacts = request.task === "path"
      ? buildPathEdgeFacts(
        data.links,
        indexByNodeId,
        new Map<string, string>(data.nodes.map((node: any) => [
          String(node.id),
          String(node.label ?? node.id)
        ] as [string, string]))
      )
      : null;
    let typedPathProgram = "";
    let temporalTypedPathEdgeRecords: TypedPathTemporalEdgeRecord[] = [];
    if (request.task === "typedPath") {
      try {
        const edgeTypeSequence = request.pathEdgeTypeSequence ?? [];
        const pathCandidateNodes = request.group
          ? data.nodes.filter((node: any) => extractGroups(node).includes(request.group))
          : data.nodes;
        const pathCandidateNodeIds = new Set(pathCandidateNodes.map((node: any) => node.id));
        if (!pathCandidateNodeIds.has(request.startNodeId) || !pathCandidateNodeIds.has(request.goalNodeId)) {
          throw new Error("I nodi iniziale e finale devono appartenere al gruppo selezionato.");
        }
        if (edgeTypeSequence.length + 1 > pathCandidateNodes.length && request.explainTypedPathNoRoute !== true) {
          throw new Error("La sequenza richiede piu nodi distinti di quanti ne contiene il gruppo selezionato.");
        }
        if (edgeTypeSequence.some((edgeType) => !availableStructuralEdgeTypes.includes(edgeType))) {
          throw new Error("Ogni passo del cammino deve usare un tipo d'arco disponibile nella proiezione corrente.");
        }
        const temporalSemantics = request.pathTemporalSemantics ?? "static";
        if (temporalSemantics !== "static") {
          let recordIndex = 0;
          for (const link of data.links) {
            const sourceId = normalizeGraphId(getGraphEndpointId(link.source));
            const targetId = normalizeGraphId(getGraphEndpointId(link.target));
            const sourceNode = indexByNodeId.get(sourceId);
            const targetNode = indexByNodeId.get(targetId);
            if (!sourceNode || !targetNode) continue;
            recordIndex += 1;
            const validityFrom = temporalEncoding.encode(link.analysis?.validity?.from);
            const validityTo = temporalEncoding.encode(link.analysis?.validity?.to);
            if (validityFrom === null || validityTo === null) {
              throw new Error("Ogni arco della proiezione deve avere un intervallo temporale valido e mappato.");
            }
            temporalTypedPathEdgeRecords.push({
              recordIndex,
              sourceNode,
              targetNode,
              edgeType: String(link.analysis?.type ?? ""),
              validityFrom,
              validityTo
            });
          }
        }
        typedPathProgram = buildTypedPathProgram({
          startNode: startIndex!,
          goalNode: goalIndex!,
          edgeTypeSequence,
          direction: graphDirection,
          group: request.group,
          ...(temporalSemantics !== "static" ? { temporalSemantics } : {}),
          ...(temporalSemantics === "orderedByStart"
            ? { strictTemporalOrder: request.strictTemporalOrder === true }
            : {})
        });
      } catch (error) {
        structuralError = error instanceof Error ? error.message : String(error);
        return;
      }
    }
    let communityFacts: ReturnType<typeof buildModularityFacts> | null = null;
    let factoredCommunityPartitions: ParsedModularityPartition[] | null = null;
    let communityPairwiseObjectiveFacts = "";
    let communityComponentFacts = "";
    let communityProgram = "";
    let communityConstraintDiagnosisProgram = "";
    let communityConstraintDiagnosisSpecs: CommunityConstraintRelaxationSpec[] = [];
    let communityOptions: ModularityCommunityOptions | null = null;
    let communityDomainCount = 0;
    let communityCandidateNodes: any[] = [];
    let communityCandidateIndexes: number[] = [];
    let communityCandidateReverseIndex: Record<number, string> = {};
    if (request.task === "communities") {
      try {
        if (communityConfigurationError) throw new Error(communityConfigurationError);
        const requestedMinimum = request.minimumCommunityCount ?? 0;
        const requestedMaximum = request.maximumCommunityCount ?? 0;
        if (!Number.isInteger(requestedMinimum) || requestedMinimum < 0 ||
          !Number.isInteger(requestedMaximum) || requestedMaximum < 0) {
          throw new Error("Il numero minimo e massimo di comunità deve essere un intero non negativo.");
        }
        if (requestedMinimum > 0 && requestedMaximum > 0 && requestedMinimum > requestedMaximum) {
          throw new Error("Il numero minimo di comunità non può essere maggiore del massimo.");
        }
        const candidateNodes = request.group
          ? data.nodes.filter((node: any) => extractGroups(node).includes(request.group))
          : data.nodes;
        communityCandidateNodes = candidateNodes;
        if (candidateNodes.length === 0) {
          structuralError = "Il gruppo selezionato non contiene nodi candidati nella proiezione visibile.";
          return;
        }
        const candidateNodeIds = new Set(candidateNodes.map((node: any) => node.id));
        const candidateIndexes: number[] = [];
        for (const node of candidateNodes) {
          const candidateIndex = indexByNodeId.get(node.id);
          if (candidateIndex !== undefined) candidateIndexes.push(candidateIndex);
        }
        communityCandidateIndexes = [...candidateIndexes];
        const candidateReverseIndex: Record<number, string> = {};
        for (const candidateIndex of candidateIndexes) {
          const candidateId = (reverseIndex as Record<number, string>)[candidateIndex];
          if (candidateId) candidateReverseIndex[candidateIndex] = candidateId;
        }
        communityCandidateReverseIndex = candidateReverseIndex;
        communityEdgeLinks = [];
        communityEdgeRecords = [];
        const communityEdges = data.links.flatMap((link: any) => {
          const sourceId = normalizeGraphId(getGraphEndpointId(link.source));
          const targetId = normalizeGraphId(getGraphEndpointId(link.target));
          if (!candidateNodeIds.has(sourceId) || !candidateNodeIds.has(targetId)) return [];
          const source = indexByNodeId.get(sourceId);
          const target = indexByNodeId.get(targetId);
          if (source !== undefined && target !== undefined) {
            const mappedSourceId = link.sourceId ?? link.analysis?.id;
            communityEdgeRecords.push({
              identity: getStructuralEdgeIdentity(link),
              sourceNodeId: sourceId,
              targetNodeId: targetId,
              sourceIndex: source,
              targetIndex: target,
              ...(mappedSourceId === undefined || mappedSourceId === null ? {} : { sourceId: String(mappedSourceId) }),
              sourceIdGenerated: link.sourceIdGenerated === true,
              ...(configuredCommunityConstraints?.useEdgeWeights === true
                ? { weight: link.analysis?.weight as number | string }
                : {})
            });
          }
          if (source && target && request.explainCommunityContributions === true) communityEdgeLinks.push(link);
          return source && target ? [{
            source,
            target,
            ...(configuredCommunityConstraints?.useEdgeWeights === true
              ? { weight: link.analysis?.weight as number | string }
              : {})
          }] : [];
        });
        communityFacts = buildModularityFacts(candidateIndexes, communityEdges, {
          weighted: configuredCommunityConstraints?.useEdgeWeights === true,
          resolution: configuredCommunityConstraints?.resolution ?? 1,
          includePairwiseObjective: candidateIndexes.length <= MAX_PAIRWISE_MODULARITY_CANDIDATES
        });
        communityPairwiseObjectiveFacts = communityFacts.pairwiseObjectiveFacts ?? "";
        if (request.explainCommunityContributions === true) {
          communityEdgeIdentityFacts = buildMinimumEdgeSeparatorFacts(
            communityEdgeLinks,
            indexByNodeId,
            new Map<string, string>(data.nodes.map((node: any) => [
              String(node.id),
              String(node.label ?? node.id)
            ] as [string, string]))
          );
          structuralEdgeSourceIdById = communityEdgeIdentityFacts.displayIdByEdgeId;
        }
        communityDomainCount = communityFacts.candidateCount;
        if (communityFacts.edgeCount === 0) {
          structuralError = "La modularità non è definita per una proiezione senza archi; seleziona un gruppo con almeno un arco.";
          return;
        }
        if (communityFacts.totalWeight === 0) {
          structuralError = "La modularità pesata non è definita quando il peso totale della proiezione selezionata è zero.";
          return;
        }

        const mustLinkPairs = resolveCommunityConstraintPairs(
          configuredCommunityConstraints?.mustLink,
          "mustLink",
          candidateNodes,
          indexByNodeId
        );
        const cannotLinkPairs = resolveCommunityConstraintPairs(
          configuredCommunityConstraints?.cannotLink,
          "cannotLink",
          candidateNodes,
          indexByNodeId
        );
        const attributeBounds = resolveCommunityAttributeBounds(
          configuredCommunityConstraints?.attributeBounds,
          candidateNodes,
          indexByNodeId,
          request.explainCommunityInfeasibility === true,
          request.explainCommunityInfeasibility === true
        );
        const minCount = requestedMinimum > 0
          ? requestedMinimum
          : undefined;
        const maxCount = requestedMaximum > 0
          ? requestedMaximum
          : undefined;
        // With gamma > 0, merging positive-volume communities from disconnected
        // components strictly lowers modularity; global constraints can require that merge.
        const separateDisconnectedComponents = communityFacts.connectedComponentCount > 1 &&
          minCount === undefined &&
          maxCount === undefined &&
          mustLinkPairs.length === 0 &&
          cannotLinkPairs.length === 0 &&
          attributeBounds.length === 0;
        if (separateDisconnectedComponents) {
          communityComponentFacts = communityFacts.connectedComponentFacts;
        }
        communityOptions = {
          weighted: configuredCommunityConstraints?.useEdgeWeights === true,
          separateDisconnectedComponents,
          minCount,
          maxCount,
          mustLinkPairs,
          cannotLinkPairs,
          attributeBounds,
          includeContributions: request.explainCommunityContributions === true,
          ...(communityPairwiseObjectiveFacts && communityFacts.pairwiseObjectiveOffset !== undefined
            ? { pairwiseObjectiveOffset: communityFacts.pairwiseObjectiveOffset }
            : {})
        };
        communityProgram = buildMaximumModularityProgram(communityOptions);
        if (request.explainCommunityInfeasibility === true) {
          const builtDiagnosis = buildCommunityConstraintRelaxationProgram({
            ...communityOptions,
            diagnosisCosts: configuredCommunityConstraints?.diagnosisCosts
          });
          communityConstraintDiagnosisProgram = builtDiagnosis.program;
          communityConstraintDiagnosisSpecs = builtDiagnosis.constraints;
        }
      } catch (error) {
        structuralError = error instanceof Error ? error.message : String(error);
        return;
      }
    }
    const greedyMaximalKPlexFacts = request.task === "maximalKPlex" && request.enumerateAllMaximalKPlex !== true
      ? buildGreedyMaximalKPlexWitness(
        request.parameter,
        (request.group
          ? data.nodes.filter((node: any) => extractGroups(node).includes(request.group))
          : data.nodes
        ).map((node: any) => String(node.id)),
        data.links
      ).map((nodeId) => {
        const nodeIndex = indexByNodeId.get(nodeId);
        return nodeIndex === undefined ? "" : `in(${nodeIndex}).`;
      }).filter(Boolean).join("\n")
      : "";
    const program = request.task === "kPlex"
      ? ""
      : request.task === "maximalKPlex"
        ? request.enumerateAllMaximalKPlex === true
          ? buildMaximalKPlexProgram(request.parameter, request.group)
          : [greedyMaximalKPlexFacts, buildMaximalKPlexCertificateProgram(request.parameter, request.group)]
            .filter(Boolean).join("\n\n")
      : request.task === "kCore"
        ? buildKCoreProgram(
          request.parameter,
          request.group,
          false,
          graphDirection,
          graphDirection === "directed" ? request.kCoreMode as DirectedKCoreMode : undefined
        )
        : request.task === "components"
          ? buildConnectedComponentsProgram(request.group)
          : request.task === "weakComponents"
            ? buildWeaklyConnectedComponentsProgram(request.group)
          : request.task === "strongComponents"
            ? buildStronglyConnectedComponentsProgram(request.group)
          : request.task === "dominatingSet"
            ? buildMinimumDominatingSetProgram(request.group, request.targetGroup)
              : request.task === "minimumNodeSeparator"
              ? buildMinimumNodeSeparatorProgram(startIndex!, goalIndex!, request.group)
                : request.task === "minimumCostNodeSeparator"
                  ? buildMinimumCostNodeSeparatorProgram(startIndex!, goalIndex!, request.group)
              : request.task === "minimumEdgeSeparator"
                ? buildMinimumEdgeSeparatorProgram(startIndex!, goalIndex!, graphDirection)
                : request.task === "minimumCostEdgeSeparator"
                  ? buildMinimumCostEdgeSeparatorProgram(startIndex!, goalIndex!, graphDirection)
                : request.task === "communities"
                  ? communityProgram
                  : request.task === "typedPath"
                    ? typedPathProgram
                : buildMinimumHopPathProgram(
                  startIndex!, goalIndex!, request.parameter, request.group, graphDirection,
                  request.explainPathMinimality === true
                );
    const fullProgram = [facts.trim(), edgeSeparatorFacts?.facts.trim(), pathEdgeWitnessFacts?.facts.trim(), communityFacts?.facts.trim(), communityComponentFacts.trim(), communityPairwiseObjectiveFacts.trim(), program.trim()].filter(Boolean).join("\n\n") + "\n";
    const solverOptions = getStructuralSolverOptions(request.task, request.enumerateAllOptima);
    const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    solverRunning = true;
    const startedAt = performance.now();
    const deadline = startedAt + taskTimeoutMs;
    const runClingoWithinTaskBudget = (
      program: string,
      options: string[],
      modelLimit = 0
    ) => runWithRemainingSolverBudget(
      deadline,
      performance.now(),
      {
        Result: "ERROR",
        Error: `Tempo massimo superato (${taskTimeoutMs} ms): il budget del task è esaurito.`
      },
      (remainingMs) => callClingo(program, options, remainingMs, modelLimit)
    );
    let iterativeKCorePeeling: KCorePeelingStep[] | null = null;

    try {
      let result: any;
      let kPlexSearchComplete = false;
      let kPlexMaximumSize: number | undefined;
      if (request.task === "kPlex") {
        const candidateNodes = request.group
          ? data.nodes.filter((node: any) => extractGroups(node).includes(request.group))
          : data.nodes;
        const search = await searchMaximumKPlexWithAsp(
          request.parameter,
          candidateNodes.map((node: any) => String(node.id)),
          data.links,
          request.group,
          request.enumerateAllOptima === true,
          async (plexProgram, modelLimit) => {
            const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
            if (remainingMs === 0) return { Result: "TIMEOUT" };
            const queryProgram = [facts.trim(), plexProgram.trim()].filter(Boolean).join("\n\n") + "\n";
            return normalizeKPlexTimeoutResult(
              await callClingo(queryProgram, [], remainingMs, modelLimit)
            );
          }
        );
        if (!search.complete || !search.result || search.maximumSize < 1) {
          structuralError = `Il solver non ha provato la cardinalità massima del k-plex entro il limite complessivo (${taskTimeoutMs} ms); stato: ${search.solverStatus ?? "nessun testimone"}. Non viene mostrato un risultato parziale come ottimo.`;
          return;
        }
        result = search.result;
        kPlexSearchComplete = true;
        kPlexMaximumSize = search.maximumSize;
      } else if (request.task === "communities" && communityFacts && communityOptions &&
        communityFacts.candidateCount > MAX_PAIRWISE_MODULARITY_CANDIDATES &&
        communityOptions?.minCount === undefined && communityOptions?.maxCount === undefined &&
        (communityOptions?.mustLinkPairs?.length ?? 0) === 0 &&
        (communityOptions?.cannotLinkPairs?.length ?? 0) === 0 &&
        (communityOptions?.attributeBounds?.length ?? 0) === 0) {
        const factored = await solveModularityByPositiveWeightComponents(
          communityFacts,
          communityCandidateReverseIndex,
          {
            enumerateAllOptima: request.enumerateAllOptima === true,
            includeContributions: communityOptions.includeContributions,
            solve: (componentProgram, componentSolverOptions) =>
              runClingoWithinTaskBudget(componentProgram, componentSolverOptions)
          }
        );
        if (factored) {
          factoredCommunityPartitions = factored.partitions;
          result = factored.result;
        } else {
          result = await runClingoWithinTaskBudget(fullProgram, solverOptions);
        }

      } else {
        result = await runClingoWithinTaskBudget(
          fullProgram,
          solverOptions,
          (request.task === "typedPath" || request.task === "path")
            ? 1
            : request.task === "maximalKPlex"
              ? request.enumerateAllMaximalKPlex === true ? 0 : 1
              : 0
        );
      }
      if (result?.Result === "ERROR") {
        structuralError = result.Error || "Errore del worker clingo.";
        return;
      }
      if (request.enumerateAllOptima === true && result?.Result !== "UNSATISFIABLE" &&
        !(request.task === "communities"
          ? hasCompleteOptimalModelEnumeration(result)
          : hasCompleteModelEnumeration(result))) {
        structuralError = request.task === "communities"
          ? "L'ottimo della modularità è stato provato, ma clingo non conferma che tutti gli ottimi siano stati enumerati. Il riepilogo di co-appartenenza non è disponibile."
          : "clingo non conferma che tutti gli ottimi richiesti siano stati enumerati; il risultato parziale è stato scartato.";
        return;
      }
      if (request.task === "maximalKPlex" && request.enumerateAllMaximalKPlex === true &&
        (result?.Result !== "SATISFIABLE" || !hasCompleteModelEnumeration(result))) {
        structuralError = `clingo non conferma che tutti i k-plex massimali siano stati enumerati (${result?.Result ?? "risposta vuota"}); l'elenco parziale è stato scartato.`;
        return;
      }
      if (request.task === "kCore" && request.explainKCoreExclusions === true) {
        if (result?.Result !== "OPTIMUM FOUND") {
          structuralError = `Il solver non ha provato il k-core prima di generare il certificato di peeling; stato: ${result?.Result ?? "risposta vuota"}.`;
          return;
        }
        const coreNodeIds = selectMaximumNodeSets(
          parseWitnessKCoreExplanations(result?.Call?.[0]?.Witnesses, reverseIndex).map((item) => item.nodeIds)
        )[0];
        if (!coreNodeIds) {
          structuralError = "Il solver non ha restituito un witness leggibile del k-core per verificare il certificato di peeling.";
          return;
        }
        const candidateNodes = request.group
          ? data.nodes.filter((node: any) => extractGroups(node).includes(request.group))
          : data.nodes;
        const activeNodeIds = new Set<string>(candidateNodes.map((node: any) => String(node.id)));
        const sortedCoreNodeIds = [...coreNodeIds].sort((left, right) => left.localeCompare(right));
        const peelingGroupsByIndex = new Map<number, string[]>();
        for (const node of data.nodes) {
          const nodeIndex = indexByNodeId.get(String(node.id));
          if (nodeIndex !== undefined) peelingGroupsByIndex.set(nodeIndex, extractGroups(node));
        }
        const peelingEdgeIndexPairs: Array<[number, number]> = [];
        for (const link of data.links) {
          const sourceIndex = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.source)));
          const targetIndex = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.target)));
          if (sourceIndex !== undefined && targetIndex !== undefined) {
            peelingEdgeIndexPairs.push([sourceIndex, targetIndex]);
          }
        }
        const peelingSteps: KCorePeelingStep[] = [];
        let round = 0;
        while (true) {
          const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
          if (remainingMs <= 0) {
            structuralError = `Tempo massimo superato durante il certificato ASP di peeling (${taskTimeoutMs} ms complessivi); il risultato non è completo.`;
            return;
          }
          const activeNodeIndices = [...activeNodeIds].map((nodeId) => indexByNodeId.get(nodeId));
          if (activeNodeIndices.some((index) => index === undefined)) {
            structuralError = "Il dominio attivo del peeling non coincide con gli indici ASP della proiezione corrente.";
            return;
          }
          const roundProgram = buildKCorePeelingRoundProgram(
            request.parameter,
            activeNodeIndices as number[],
            request.group,
            graphDirection,
            graphDirection === "directed" ? request.kCoreMode as DirectedKCoreMode : undefined
          );
          const roundFacts = buildKCorePeelingRoundFacts(
            activeNodeIndices as number[],
            peelingEdgeIndexPairs,
            peelingGroupsByIndex,
            graphDirection
          );
          const roundResult = await callClingo(
            `${roundFacts}\n\n${roundProgram}\n`,
            [],
            remainingMs
          );
          if (roundResult?.Result === "ERROR") {
            structuralError = `Il certificato ASP di peeling non è stato completato: ${roundResult.Error || "errore del worker clingo"}`;
            return;
          }
          if (roundResult?.Result !== "SATISFIABLE") {
            structuralError = `Il certificato ASP di peeling ha restituito ${roundResult?.Result ?? "una risposta vuota"}.`;
            return;
          }
          round += 1;
          const roundSteps = parseWitnessKCorePeelingRound(
            roundResult?.Call?.[0]?.Witnesses,
            reverseIndex,
            round
          );
          if (!roundSteps) {
            structuralError = `Il solver non ha restituito un witness leggibile per il round ${round} di peeling.`;
            return;
          }
          if (roundSteps.length === 0) break;
          const activeAtRoundStart = new Set(activeNodeIds);
          for (const step of roundSteps) {
            if (!activeAtRoundStart.has(step.nodeId) || step.survivingNeighborIds.some((neighborId) => !activeAtRoundStart.has(neighborId))) {
              structuralError = `Il witness ASP del round ${round} include nodi fuori dal dominio attivo.`;
              return;
            }
            if (step.survivingNeighborIds.length >= request.parameter) {
              structuralError = `Il witness ASP del round ${round} non giustifica l'esclusione di ${step.nodeId} con il grado richiesto.`;
              return;
            }
            peelingSteps.push(step);
          }
          for (const step of roundSteps) activeNodeIds.delete(step.nodeId);
          if (round > candidateNodes.length) {
            structuralError = "Il certificato ASP di peeling non ha raggiunto un punto fisso entro il numero di nodi candidati.";
            return;
          }
        }
        if ([...activeNodeIds].sort((left, right) => left.localeCompare(right)).join("\u0000") !== sortedCoreNodeIds.join("\u0000")) {
          structuralError = "Il core derivato dai round ASP non coincide con il k-core ottimo della query principale.";
          return;
        }
        iterativeKCorePeeling = peelingSteps;
      }
      const elapsed = performance.now() - startedAt;
      if ((request.task === "components" || request.task === "weakComponents" || request.task === "strongComponents") && result?.Result !== "SATISFIABLE") {
        structuralError = `Il solver non ha restituito una partizione: ${result?.Result ?? "risposta vuota"}.`;
        return;
      }
      if (request.task === "path" && result?.Result === "UNSATISFIABLE") {
        structuralOutcomeMessage = `Nessun cammino semplice collega i nodi scelti entro ${formatPathLengthBound(request.parameter)} nella proiezione e nel gruppo selezionati.`;
        setGraph2DProvenInfeasibility("Cammino minimo", "nessun cammino soddisfa i terminali e il limite di lunghezza");
        if (request.explainPathMinimality === true) {
          const noRouteProgram = buildBoundedPathNoRouteProgram(
            startIndex!, goalIndex!, request.parameter, request.group, graphDirection
          );
          const noRouteResult = await runClingoWithinTaskBudget(
            [facts.trim(), pathEdgeWitnessFacts?.facts.trim(), noRouteProgram.trim()].filter(Boolean).join("\n\n") + "\n",
            []
          );
          if (noRouteResult?.Result === "SATISFIABLE") {
            const certificate = parseBoundedPathNoRouteCertificate(
              noRouteResult?.Call?.[0]?.Witnesses,
              reverseIndex,
              request.parameter,
              request.goalNodeId ?? ""
            );
            if (certificate) {
              structuralPathNoRouteCertificate = certificate;
            } else {
              structuralError = "Il cammino è impossibile, ma la diagnosi non è stata verificata: non è stato restituito un certificato completo della raggiungibilità limitata.";
            }
          } else {
            const failureDetail = typeof noRouteResult?.Error === "string" ? noRouteResult.Error.trim() : "";
            structuralError = `Il cammino è impossibile, ma la diagnosi non è stata verificata: il certificato di raggiungibilità limitata non è stato completato (${noRouteResult?.Result ?? "risposta vuota"})${failureDetail ? `: ${failureDetail}` : "."}`;
          }
        }
        return;
      }
      if (request.task === "typedPath" && result?.Result === "UNSATISFIABLE") {
        structuralOutcomeMessage = request.pathTemporalSemantics === "coValid"
          ? "Nessun cammino semplice rispetta la sequenza tipizzata con tutti gli archi validi nello stesso istante."
          : request.pathTemporalSemantics === "orderedByStart"
            ? `Nessun cammino semplice rispetta la sequenza tipizzata con inizi di validità ${request.strictTemporalOrder === true ? "strettamente crescenti" : "non decrescenti"}.`
            : "Nessun cammino semplice collega i nodi scelti rispettando la sequenza esatta dei tipi d'arco nella proiezione e nel gruppo selezionati.";
        setGraph2DProvenInfeasibility("Cammino tipizzato", "nessun cammino soddisfa i terminali e i vincoli configurati");
        if (request.explainTypedPathNoRoute === true) {
          const edgeTypeSequence = request.pathEdgeTypeSequence ?? [];
          const temporalSemantics = request.pathTemporalSemantics ?? "static";
          const noRouteOptions = {
            startNode: startIndex!,
            goalNode: goalIndex!,
            edgeTypeSequence,
            direction: graphDirection,
            group: request.group
          };
          if (temporalSemantics === "static") {
            const noRouteProgram = buildTypedPathNoRouteProgram(noRouteOptions);
            const noRouteResult = await runClingoWithinTaskBudget(
              `${facts.trim()}\n\n${noRouteProgram}\n`,
              []
            );
            if (noRouteResult?.Result === "SATISFIABLE") {
              structuralTypedPathNoRouteCertificate = parseTypedPathNoRouteCertificate(
                noRouteResult?.Call?.[0]?.Witnesses,
                reverseIndex,
                edgeTypeSequence
              ) ?? undefined;
              if (!structuralTypedPathNoRouteCertificate) {
                structuralError = "Il cammino è impossibile, ma la diagnosi non è stata verificata: non è stato restituito un certificato completo dei prefissi raggiungibili.";
              }
            } else {
              const failureDetail = typeof noRouteResult?.Error === "string" ? noRouteResult.Error.trim() : "";
              structuralError = `Il cammino è impossibile, ma la diagnosi non è stata verificata: il certificato dei prefissi raggiungibili non è stato completato (${noRouteResult?.Result ?? "risposta vuota"})${failureDetail ? `: ${failureDetail}` : "."}`;
            }
          } else {
            const temporalOptions = {
              ...noRouteOptions,
              temporalSemantics,
              ...(temporalSemantics === "orderedByStart"
                ? { strictTemporalOrder: request.strictTemporalOrder === true }
                : {})
            } as TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics };
            const noRouteProgram = buildTypedPathTemporalNoRouteProgram(temporalOptions);
            const noRouteResult = await runClingoWithinTaskBudget(
              `${facts.trim()}\n\n${noRouteProgram}\n`,
              getStructuralCounterfactualSolverOptions(),
              0
            );
            if (noRouteResult?.Result === "OPTIMUM FOUND") {
              const candidateNodeIds = (request.group
                ? data.nodes.filter((node: any) => extractGroups(node).includes(request.group))
                : data.nodes).map((node: any) => String(node.id));
              structuralTypedPathNoRouteCertificate = parseTypedPathTemporalNoRouteCertificate(
                noRouteResult?.Call?.[0]?.Witnesses,
                temporalOptions,
                temporalTypedPathEdgeRecords,
                candidateNodeIds,
                reverseIndex,
                typedPathEdgeIdentityFacts?.reverseEdgeIndex ?? {},
                temporalEncoding.decode
              ) ?? undefined;
              if (!structuralTypedPathNoRouteCertificate) {
                structuralError = "Il cammino è impossibile, ma la diagnosi non è stata verificata: il certificato temporale non coincide con il controllo indipendente della raggiungibilità.";
              }
            } else {
              const failureDetail = typeof noRouteResult?.Error === "string" ? noRouteResult.Error.trim() : "";
              structuralError = `Il cammino è impossibile, ma la diagnosi non è stata verificata: il certificato temporale non è stato completato (${noRouteResult?.Result ?? "risposta vuota"})${failureDetail ? `: ${failureDetail}` : "."}`;
            }
          }
        }
        return;
      }
      if (request.task === "dominatingSet" && result?.Result === "UNSATISFIABLE") {
        structuralError = "";
        structuralOutcomeMessage = "Nessun insieme dei candidati selezionati copre tutti i nodi obiettivo.";
        setGraph2DProvenInfeasibility(
          "Copertura minima",
          "nessun insieme di nodi candidato copre tutti i nodi obiettivo selezionati"
        );
        const feasibilityProgram = buildDominatingSetFeasibilityProgram(
          request.group,
          request.targetGroup ?? ""
        );
        const feasibilityResult = await runClingoWithinTaskBudget(
          `${facts.trim()}\n\n${feasibilityProgram}\n`,
          []
        );
        if (feasibilityResult?.Result !== "SATISFIABLE") {
          const failureDetail = typeof feasibilityResult?.Error === "string"
            ? feasibilityResult.Error.trim()
            : "";
          structuralError = `La copertura è impossibile, ma la diagnosi dei target non è stata verificata: il certificato why-not non è stato completato (${feasibilityResult?.Result ?? "risposta vuota"})${failureDetail ? `: ${failureDetail}` : "."}`;
          return;
        }

        const certificate = parseDominatingSetFeasibilityCertificate(
          feasibilityResult?.Call?.[0]?.Witnesses,
          reverseIndex
        );
        if (!certificate) {
          structuralError = "La copertura è impossibile, ma la diagnosi dei target non è stata verificata: il solver non ha restituito un certificato why-not interpretabile.";
          return;
        }

        const candidateIds: string[] = data.nodes
          .filter((node: any) => !request.group || extractGroups(node).includes(request.group))
          .map((node: any) => String(normalizeGraphId(node.id)));
        const targetIds: string[] = data.nodes
          .filter((node: any) => !request.targetGroup || extractGroups(node).includes(request.targetGroup))
          .map((node: any) => String(normalizeGraphId(node.id)));
        const expectedUncoverableIds = verifyDominatingSetFeasibilityCertificate(
          certificate,
          candidateIds,
          targetIds,
          data.links.map((link: any) => [
            String(normalizeGraphId(getLinkEndId(link.source))),
            String(normalizeGraphId(getLinkEndId(link.target)))
          ] as [string, string])
        );
        if (!expectedUncoverableIds) {
          structuralError = "La copertura è impossibile, ma la diagnosi dei target non è stata verificata: il certificato ASP non coincide con il controllo indipendente sulla proiezione corrente ed è stato scartato.";
          return;
        }

        structuralDominatingSetUncoverableTargetNodeIds = expectedUncoverableIds;
        setGraph2DProvenInfeasibility("Copertura minima", "il certificato why-not è verificato sulla proiezione corrente");
        return;
      }
      if (request.task === "minimumNodeSeparator" && result?.Result === "UNSATISFIABLE") {
        structuralOutcomeMessage = "Non esiste un separatore usando soltanto i nodi rimovibili selezionati; per esempio, un arco diretto tra i terminali non può essere interrotto rimuovendo nodi intermedi.";
        setGraph2DProvenInfeasibility("Separatore di nodi", "nessun insieme consentito separa i terminali");
        return;
      }
      if (request.task === "minimumCostNodeSeparator" && result?.Result === "UNSATISFIABLE") {
        structuralOutcomeMessage = "Non esiste un separatore di nodi con i costi e il gruppo rimovibile configurati; un arco diretto tra terminali protetti non può essere interrotto.";
        setGraph2DProvenInfeasibility("Separatore di nodi a costo minimo", "nessun insieme consentito separa i terminali");
        return;
      }
      if (request.task === "communities" && result?.Result === "UNSATISFIABLE") {
        structuralOutcomeMessage = "I vincoli di comunità configurati non ammettono una partizione del gruppo selezionato.";
        setGraph2DProvenInfeasibility("Comunità", "i vincoli configurati non ammettono una partizione");
        if (request.explainCommunityInfeasibility !== true) return;
        if (!communityConstraintDiagnosisProgram || communityConstraintDiagnosisSpecs.length === 0) {
          structuralCommunityConstraintDiagnosisError = "Non ci sono vincoli di configurazione rilassabili nella query: controlla proiezione, attributi e prerequisiti del task.";
          return;
        }
        const diagnosisProgram = [communityFacts?.facts.trim(), communityConstraintDiagnosisProgram]
          .filter(Boolean)
          .join("\n\n") + "\n";
        const diagnosisResult = await runClingoWithinTaskBudget(
          diagnosisProgram,
          getStructuralSolverOptions("communities", request.enumerateAllOptima === true),
          0
        );
        if (diagnosisResult?.Result !== "OPTIMUM FOUND") {
          structuralCommunityConstraintDiagnosisError = diagnosisResult?.Error ??
            `La diagnosi non ha provato il minimo rilassamento entro il budget residuo (${diagnosisResult?.Result ?? "risposta vuota"}).`;
          return;
        }
        try {
          structuralCommunityConstraintDiagnoses = parseCommunityConstraintDiagnosisResult(
            diagnosisResult,
            communityCandidateReverseIndex,
            communityConstraintDiagnosisSpecs,
            { requireAllOptima: request.enumerateAllOptima === true }
          );
          if (structuralCommunityConstraintDiagnoses.length === 0) {
            structuralCommunityConstraintDiagnosisError = "Il solver non ha restituito una diagnosi minima verificabile.";
          } else {
            structuralCommunityConstraintDiagnosesAllEnumerated = request.enumerateAllOptima === true;
          }
        } catch (error) {
          structuralCommunityConstraintDiagnosisError = error instanceof Error ? error.message : String(error);
        }
        return;
      }
      const emptyEdgeCutIsTrivial = edgeSeparatorTask &&
        Object.keys(edgeSeparatorFacts?.reverseEdgeIndex ?? {}).length === 0 &&
        result?.Result === "SATISFIABLE";
      const typedPathHasWitness = request.task === "typedPath" && result?.Result === "SATISFIABLE";
      const shortestPathHasWitness = request.task === "path" && result?.Result === "SATISFIABLE";
      const kPlexHasWitness = request.task === "kPlex" && kPlexSearchComplete && result?.Result === "SATISFIABLE";
      const maximalKPlexHasWitness = request.task === "maximalKPlex" && result?.Result === "SATISFIABLE";
      const componentTask = request.task === "components" || request.task === "weakComponents" || request.task === "strongComponents";
      if (!componentTask && !shortestPathHasWitness && !typedPathHasWitness && !kPlexHasWitness && !maximalKPlexHasWitness && !String(result?.Result ?? "").includes("OPTIMUM") && !emptyEdgeCutIsTrivial) {
        structuralError = request.task === "maximalKPlex"
          ? request.enumerateAllMaximalKPlex === true
            ? `Il solver non ha completato l'enumerazione dei k-plex massimali per inclusione: ${result?.Result ?? "risposta vuota"}.`
            : `Il solver non ha certificato il testimone massimale costruito dalla strategia greedy: ${result?.Result ?? "risposta vuota"}.`
          : `Il solver non ha provato un optimum: ${result?.Result ?? "risposta vuota"}.`;
        return;
      }

      if (request.task === "components") {
        structuralResults = parseWitnessComponents(result?.Call?.[0]?.Witnesses, reverseIndex);
      } else if (request.task === "weakComponents") {
        structuralResults = parseWitnessWeakComponents(result?.Call?.[0]?.Witnesses, reverseIndex);
      } else if (request.task === "strongComponents") {
        structuralResults = parseWitnessStrongComponents(result?.Call?.[0]?.Witnesses, reverseIndex);
      } else if (request.task === "path") {
        const path = parseWitnessMinimumHopPathWitness(
          result?.Call?.[0]?.Witnesses,
          reverseIndex,
          pathEdgeWitnessFacts?.reverseEdgeIndex ?? {},
          true
        );
        if (!path) {
          structuralError = "Il solver non ha restituito un cammino leggibile con record testimone per ogni passo.";
          return;
        }
        if (request.explainPathMinimality === true && !path.minimalityCertificate) {
          structuralError = "Il solver non ha restituito il certificato ASP di minimalità richiesto.";
          return;
        }
        structuralResults = [path.nodeIds];
        structuralPathEdgeIdsByStep = path.edgeIdsByStep;
        structuralPathMinimality = path.minimalityCertificate;
        structuralEdgeSourceIdById = pathEdgeWitnessFacts?.displayIdByEdgeId ?? {};
      } else if (request.task === "typedPath") {
        const typedPath = request.pathTemporalSemantics && request.pathTemporalSemantics !== "static"
          ? parseWitnessTemporalTypedPath(
            result?.Call?.[0]?.Witnesses,
            reverseIndex,
            typedPathEdgeIdentityFacts?.reverseEdgeIndex ?? {},
            temporalTypedPathEdgeRecords,
            {
              startNode: startIndex!,
              goalNode: goalIndex!,
              edgeTypeSequence: request.pathEdgeTypeSequence ?? [],
              direction: graphDirection,
              group: request.group,
              temporalSemantics: request.pathTemporalSemantics,
              ...(request.pathTemporalSemantics === "orderedByStart"
                ? { strictTemporalOrder: request.strictTemporalOrder === true }
                : {})
            },
            temporalEncoding.decode
          )
          : parseWitnessTypedPath(
            result?.Call?.[0]?.Witnesses,
            reverseIndex,
            typedPathEdgeIdentityFacts?.reverseEdgeIndex ?? {},
            request.pathEdgeTypeSequence?.length ?? 0
          );
        if (!typedPath) {
          structuralError = "Il solver non ha restituito un cammino tipizzato leggibile e verificabile per ogni passo e semantica selezionati.";
          return;
        }
        structuralResults = [typedPath.nodeIds];
        structuralPathEdgeIdsByStep = typedPath.edgeIdsByStep;
        structuralPathTemporalSemantics = request.pathTemporalSemantics ?? "static";
        if (request.pathTemporalSemantics && request.pathTemporalSemantics !== "static") {
          const temporalPath = typedPath as TypedPathTemporalResult;
          structuralPathCommonTimeValue = temporalPath.commonTimeValue;
          structuralPathStartTimeValuesByStep = temporalPath.startTimeValuesByStep ?? [];
        }
        structuralEdgeSourceIdById = typedPathEdgeIdentityFacts?.displayIdByEdgeId ?? {};
      } else if (request.task === "dominatingSet") {
        const explanations = parseWitnessDominatingSetExplanations(
          result?.Call?.[0]?.Witnesses,
          reverseIndex
        );
        structuralResults = selectMinimumNodeSets(explanations.map((item) => item.nodeIds));
        const selectedKeys = new Set(structuralResults.map(getNodeSetSignature));
        structuralDominatingSetSupportBySetKey = Object.fromEntries(explanations
          .filter((item) => selectedKeys.has(getNodeSetSignature(item.nodeIds)))
          .map((item) => [
            getNodeSetSignature(item.nodeIds),
            mapDominatingSetSupportPairsToRecords(item.coveragePairs, data.links)
          ]));
      } else if (nodeSeparatorTask) {
        const explanations = parseWitnessRemovedNodeSetExplanations(result?.Call?.[0]?.Witnesses, reverseIndex);
        const removedNodeWitnesses = explanations.map((item) => item.removedIds);
        const removalCostByNodeId = Object.fromEntries(data.nodes.flatMap((node: any) => {
          const cost = Number(node.analysis?.removalCost);
          return Number.isSafeInteger(cost) && cost > 0 ? [[node.id, cost]] : [];
        }));
        structuralResults = request.task === "minimumCostNodeSeparator"
          ? selectMinimumCostNodeSets(removedNodeWitnesses, removalCostByNodeId)
          : selectMinimumNodeSets(removedNodeWitnesses);
        const optimalKeys = new Set(structuralResults.map(getNodeSetSignature));
        structuralSeparatorReachableBySetKey = Object.fromEntries(explanations
          .filter((item) => optimalKeys.has(getNodeSetSignature(item.removedIds)))
          .map((item) => [getNodeSetSignature(item.removedIds), item.reachableNodeIds]));
      } else if (edgeSeparatorTask) {
        const explanations = parseWitnessRemovedEdgeSetExplanations(
          result?.Call?.[0]?.Witnesses,
          edgeSeparatorFacts?.reverseEdgeIndex ?? {},
          reverseIndex
        );
        const removedEdgeWitnesses = explanations.map((item) => item.removedIds);
        structuralResults = request.task === "minimumCostEdgeSeparator"
          ? selectMinimumCostEdgeSets(removedEdgeWitnesses, edgeSeparatorFacts?.removalCostByEdgeId ?? {})
          : selectMinimumEdgeSets(removedEdgeWitnesses);
        const optimalKeys = new Set(structuralResults.map(getNodeSetSignature));
        structuralSeparatorReachableBySetKey = Object.fromEntries(explanations
          .filter((item) => optimalKeys.has(getNodeSetSignature(item.removedIds)))
          .map((item) => [getNodeSetSignature(item.removedIds), item.reachableNodeIds]));
        structuralEdgeSourceIdById = edgeSeparatorFacts?.displayIdByEdgeId ?? {};
      } else if (request.task === "communities") {
        if (result?.Result === "UNSATISFIABLE") {
          structuralError = communityAttributeBoundCount > 0
            ? "Nessuna partizione soddisfa tutti i vincoli di comunità configurati sulla proiezione candidata."
            : "Nessuna partizione soddisfa i vincoli di comunità configurati.";
          return;
        }
        structuralCommunityPartitions = deriveCommunityAttributeBoundCounts(
          selectMaximumModularityPartitions(
            factoredCommunityPartitions ??
              parseWitnessModularityPartitions(result?.Call?.[0]?.Witnesses, reverseIndex)
          ),
          communityCandidateNodes,
          configuredCommunityConstraints?.attributeBounds
        );
        if (request.explainCommunityContributions === true && communityEdgeIdentityFacts) {
          structuralCommunityPartitions = structuralCommunityPartitions.map((partition) => ({
            ...partition,
            communityContributions: mapModularityContributionsToRecords(
              partition.communityContributions ?? [],
              communityEdgeLinks
            )
          }));
          structuralEdgeSourceIdById = communityEdgeIdentityFacts.displayIdByEdgeId;
        }
        if (structuralCommunityPartitions.length === 0) {
          structuralError = "Il solver non ha restituito una partizione comunitaria leggibile.";
          return;
        }
        if (result?.Result === "OPTIMUM FOUND" && communityFacts && communityOptions) {
          communityPairMembershipContext = {
            baseFacts: [
              facts.trim(),
              communityFacts.facts.trim(),
              communityComponentFacts.trim(),
              communityPairwiseObjectiveFacts.trim()
            ].filter(Boolean).join("\n\n") + "\n",
            graphFacts: facts.trim(),
            options: communityOptions,
            reverseIndex: communityCandidateReverseIndex,
            indexByNodeId: new Map(communityCandidateNodes.flatMap((node: any) => {
              const nodeId = String(node.id);
              const index = indexByNodeId.get(nodeId);
              return index === undefined ? [] : [[nodeId, index] as [string, number]];
            })),
            candidateNodeIds: new Set(communityCandidateNodes.map((node: any) => String(node.id))),
            globalScaledScore: structuralCommunityPartitions[0].scaledScore,
            communityEdgeRecords: [...communityEdgeRecords],
            candidateIndexes: [...communityCandidateIndexes],
            resolution: configuredCommunityConstraints?.resolution ?? 1
          };
        }
      } else if (request.task === "kPlex" || request.task === "maximalKPlex") {
        const maximalExplanations = request.task === "maximalKPlex"
          ? parseWitnessMaximalKPlexExplanations(result?.Call?.[0]?.Witnesses, reverseIndex)
          : [];
        const explanations = request.task === "maximalKPlex"
          ? maximalExplanations
          : parseWitnessKPlexExplanations(result?.Call?.[0]?.Witnesses, reverseIndex);
        if (request.task === "kPlex") {
          structuralResults = selectMaximumNodeSets(explanations.map((item) => item.nodeIds));
          if (structuralResults.length === 0 || structuralResults.some((nodeIds) => nodeIds.length !== kPlexMaximumSize)) {
            structuralError = "La prova ASP della cardinalità massima non contiene un testimone completo della taglia attesa.";
            return;
          }
        } else {
          structuralResults = explanations
            .map((item) => item.nodeIds)
            .sort((left, right) => getNodeSetSignature(left).localeCompare(getNodeSetSignature(right)));
          if (structuralResults.length === 0 || structuralResults.some((nodeIds) => nodeIds.length === 0)) {
            structuralError = "Il solver non ha restituito k-plex massimali leggibili nel dominio candidato.";
            return;
          }
        }
        const selectedKeys = new Set(structuralResults.map(getNodeSetSignature));
        structuralKPlexMissingPairsBySetKey = Object.fromEntries(explanations
          .filter((item) => selectedKeys.has(getNodeSetSignature(item.nodeIds)))
          .map((item) => [getNodeSetSignature(item.nodeIds), item.missingTiePairs]));
        structuralKPlexMaximalityBySetKey = Object.fromEntries(maximalExplanations
          .filter((item) => selectedKeys.has(getNodeSetSignature(item.nodeIds)))
          .map((item) => [getNodeSetSignature(item.nodeIds), item]));
      } else if (request.task === "kCore") {
        const explanations = parseWitnessKCoreExplanations(
          result?.Call?.[0]?.Witnesses,
          reverseIndex
        );
        structuralResults = selectMaximumNodeSets(explanations.map((item) => item.nodeIds));
        const selectedKeys = new Set(structuralResults.map(getNodeSetSignature));
        structuralKCoreSupportBySetKey = Object.fromEntries(explanations
          .filter((item) => selectedKeys.has(getNodeSetSignature(item.nodeIds)))
          .map((item) => [
            getNodeSetSignature(item.nodeIds),
            mapKCoreSupportPairsToRecords(
              item.supportPairs,
              data.links,
              graphDirection === "directed" ? request.kCoreMode as DirectedKCoreMode : "undirected"
            )
          ]));
        structuralKCorePeelingBySetKey = request.explainKCoreExclusions === true
          ? Object.fromEntries(explanations
            .filter((item) => selectedKeys.has(getNodeSetSignature(item.nodeIds)))
            .map((item) => [
              getNodeSetSignature(item.nodeIds),
              mapKCorePeelingStepsToRecords(
                iterativeKCorePeeling ?? item.peeling,
                data.links,
                graphDirection === "directed" ? request.kCoreMode as DirectedKCoreMode : "undirected"
              )
            ]))
          : {};
        if (request.includeKCoreNumbers === true) {
          const profileNodes = data.nodes.filter((node: any) =>
            !request.group || extractGroups(node).includes(request.group)
          );
          const profileStartedAt = performance.now();
          structuralKCoreNumbers = Object.fromEntries(computeKCoreNumbers(
            profileNodes.map((node: any) => String(node.id)),
            data.links,
            graphDirection,
            graphDirection === "directed" ? request.kCoreMode as DirectedKCoreMode : undefined
          ));
          structuralKCoreProfileTimeMs = performance.now() - profileStartedAt;
        }
        const labels = new Map<string, string>(data.nodes.map((node: any) => [
          String(node.id),
          String(node.label ?? node.id)
        ] as [string, string]));
        structuralEdgeSourceIdById = buildMinimumEdgeSeparatorFacts(
          data.links,
          indexByNodeId,
          labels
        ).displayIdByEdgeId;
      } else {
        structuralResults = selectMaximumNodeSets(parseWitnessNodeSets(result?.Call?.[0]?.Witnesses, reverseIndex));
      }
      structuralStats = {
        task: request.task,
        parameter: request.parameter,
        timeMs: elapsed,
        completionLabel: buildGraph2DStructuralCompletionLabel({
          task: request.task,
          resultStatus: result?.Result,
          completeModelEnumeration: hasCompleteModelEnumeration(result),
          maximumKPlexSearchComplete: kPlexSearchComplete,
          hasSolution: structuralResults.length > 0,
          enumerateAllOptima: request.enumerateAllOptima === true,
          enumerateAllMaximalKPlex: request.enumerateAllMaximalKPlex === true
        }),
        nodesCount: request.task === "communities" ? communityDomainCount : data.nodes.length,
        linksCount: request.task === "communities" ? communityFacts?.edgeCount ?? 0 : data.links.length,
        targetCount: request.task === "dominatingSet"
          ? request.targetGroup
            ? data.nodes.filter((node: any) => extractGroups(node).includes(request.targetGroup ?? "")).length
            : data.nodes.length
          : undefined,
        targetGroup: request.targetGroup,
        modularity: request.task === "communities" && communityFacts
          ? structuralCommunityPartitions[0].scaledScore /
            (4 * communityFacts.totalWeight * communityFacts.totalWeight * communityFacts.resolutionDenominator)
          : undefined,
        modularityResolution: request.task === "communities" ? communityFacts?.displayResolution : undefined,
        modularityResolutionNumerator: request.task === "communities" ? communityFacts?.resolutionNumerator : undefined,
        modularityResolutionDenominator: request.task === "communities" ? communityFacts?.resolutionDenominator : undefined,
        communityCount: request.task === "communities" ? structuralCommunityPartitions[0]?.communities.length : undefined,
        edgeCount: request.task === "communities" ? communityFacts?.edgeCount : undefined,
        scaledTotalEdgeWeight: request.task === "communities" ? communityFacts?.totalWeight : undefined,
        displayTotalEdgeWeight: request.task === "communities" ? communityFacts?.displayTotalWeight : undefined,
        edgeWeightScaleFactor: request.task === "communities" ? communityFacts?.weightScaleFactor : undefined,
        weightedModularity: request.task === "communities" ? communityFacts?.weighted : undefined,
        minimumCutCost: request.task === "minimumCostEdgeSeparator"
          ? (structuralResults[0] ?? []).reduce(
            (sum, edgeId) => sum + (edgeSeparatorFacts?.removalCostByEdgeId[edgeId] ?? 0),
            0
          )
          : undefined,
        minimumNodeRemovalCost: request.task === "minimumCostNodeSeparator"
          ? (structuralResults[0] ?? []).reduce((sum, nodeId) => {
            const node = data.nodes.find((candidate: any) => candidate.id === nodeId);
            return sum + Number(node?.analysis?.removalCost ?? 0);
          }, 0)
          : undefined
      };
      clearGraphNeighborhoodFocus();
      clearGraph2DOverlay();
      const firstWitnessIds = structuralResults[0] ?? [];
      if (request.task === "minimumNodeSeparator" || request.task === "minimumCostNodeSeparator") {
        graph2DNodeAnnotations = Object.fromEntries(firstWitnessIds.map((nodeId) => [
          nodeId,
          "Nodo rimosso · separatore"
        ]));
      } else if (request.task === "minimumEdgeSeparator" || request.task === "minimumCostEdgeSeparator") {
        graph2DEdgeAnnotations = Object.fromEntries(firstWitnessIds.map((edgeId) => [
          edgeId,
          { label: "Arco rimosso", color: "#b4233c", dashPattern: "dotted" }
        ]));
      }
      if (edgeSeparatorTask) {
        highlightedEdgeIds = new Set(structuralResults[0] ?? []);
        cliqueNodes = new Set();
        refreshLinkVisuals();
      } else if (request.task === "path" || request.task === "typedPath") {
        highlightedEdgeIds = new Set(structuralPathEdgeIdsByStep.flat());
        cliqueNodes = new Set(structuralResults[0] ?? []);
        refreshLinkVisuals();
      } else if (request.task === "communities") {
        highlightedEdgeIds = new Set();
        cliqueNodes = new Set();
        refreshLinkVisuals();
      } else {
        const dominatingSetOverlay = request.task === "dominatingSet"
          ? getDominatingSetCoverageOverlay(firstWitnessIds)
          : null;
        highlightedEdgeIds = new Set(dominatingSetOverlay?.edgeIds ?? []);
        if (dominatingSetOverlay) graph2DEdgeAnnotations = dominatingSetOverlay.edgeAnnotations;
        cliqueNodes = new Set(structuralResults[0] ?? []);
        refreshLinkVisuals();
      }
      refreshNodeVisuals();
    } catch (error) {
      structuralError = error instanceof Error ? error.message : String(error);
    } finally {
      solverRunning = false;
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function probeCommunityPairOptimumMembership(pair: [string, string]) {
    if (solverRunning || !clingoWorker) return;
    clearGraph2DOverlay();
    structuralCommunityPairMembership = null;
    structuralCommunityPairMembershipError = "";
    structuralCommunityPairMembershipTimeMs = undefined;
    const context = communityPairMembershipContext;
    if (!context) {
      structuralCommunityPairMembershipError = "Ricalcola prima la modularità: l'ottimo di riferimento non è più disponibile per la proiezione corrente.";
      return;
    }
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((nodeId) => typeof nodeId !== "string" || !nodeId)) {
      structuralCommunityPairMembershipError = "Scegli due nodi candidati distinti.";
      return;
    }
    const [leftNodeId, rightNodeId] = pair;
    if (leftNodeId === rightNodeId) {
      structuralCommunityPairMembershipError = "Scegli due nodi diversi.";
      return;
    }
    if (!context.candidateNodeIds.has(leftNodeId) || !context.candidateNodeIds.has(rightNodeId)) {
      structuralCommunityPairMembershipError = "Entrambi i nodi devono appartenere al dominio candidato dell'analisi di modularità.";
      return;
    }
    const leftNode = context.indexByNodeId.get(leftNodeId);
    const rightNode = context.indexByNodeId.get(rightNodeId);
    if (leftNode === undefined || rightNode === undefined) {
      structuralCommunityPairMembershipError = "La coppia selezionata non è mappabile nel dominio ASP corrente.";
      return;
    }

    try {
      const programs = buildCommunityPairMembershipPrograms(context.options, [leftNode, rightNode]);
      const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      const deadline = performance.now() + timeoutMs;
      const startedAt = performance.now();
      solverRunning = true;
      structuralCommunityPairMembershipRunning = true;
      const probe = async (kind: "together" | "separate", program: string): Promise<number | null> => {
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`budget complessivo esaurito prima della query ${kind === "together" ? "must-link" : "cannot-link"}`);
        const result = await callClingo(
          `${context.baseFacts}\n${program}\n`,
          getStructuralSolverOptions("communities"),
          remainingMs
        );
        if (result?.Result === "ERROR") {
          throw new Error(result.Error || `Errore del worker clingo nella query ${kind}.`);
        }
        if (result?.Result === "UNSATISFIABLE") return null;
        if (result?.Result !== "OPTIMUM FOUND") {
          throw new Error(`clingo non ha provato l'ottimo della query ${kind === "together" ? "must-link" : "cannot-link"} (${result?.Result ?? "risposta vuota"}).`);
        }
        const optimumPartitions = selectMaximumModularityPartitions(
          parseWitnessModularityPartitions(result?.Call?.[0]?.Witnesses, context.reverseIndex)
        );
        if (optimumPartitions.length === 0) {
      throw new Error(`La query ${kind} non ha restituito un punteggio di modularità leggibile.`);
        }
        const selectedPartition = optimumPartitions[0];
        const pairIsTogether = selectedPartition.communities.some((community) =>
          community.includes(leftNodeId) && community.includes(rightNodeId)
        );
        if ((kind === "together" && !pairIsTogether) || (kind === "separate" && pairIsTogether)) {
          throw new Error(`Il witness ottimo della query ${kind} non rispetta il vincolo di coppia richiesto.`);
        }
        return selectedPartition.scaledScore;
      };
      const togetherScore = await probe("together", programs.together);
      const separateScore = await probe("separate", programs.separate);
      structuralCommunityPairMembership = classifyCommunityPairOptimumMembership(
        pair,
        context.globalScaledScore,
        togetherScore,
        separateScore
      );
      structuralCommunityPairMembershipTimeMs = performance.now() - startedAt;
    } catch (error) {
      structuralCommunityPairMembershipError = error instanceof Error
        ? `Classificazione scartata: ${error.message}`
        : `Classificazione scartata: ${String(error)}`;
      structuralCommunityPairMembershipTimeMs = undefined;
    } finally {
      structuralCommunityPairMembershipRunning = false;
      solverRunning = false;
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function runCommunityTopologyCounterfactual(request: {
    pair: [string, string];
    relation: "always" | "sometimes" | "never";
  }) {
    if (solverRunning || !clingoWorker) return;
    clearGraph2DOverlay();
    structuralCommunityTopologyCounterfactual = null;
    structuralCommunityTopologyCounterfactualError = "";
    structuralCommunityTopologyCounterfactualTimeMs = undefined;
    const context = communityPairMembershipContext;
    if (!context) {
      structuralCommunityTopologyCounterfactualError = "Ricalcola prima la modularità sulla proiezione corrente.";
      return;
    }
    if (!Array.isArray(request?.pair) || request.pair.length !== 2 ||
      request.pair.some((nodeId) => typeof nodeId !== "string" || !nodeId) ||
      request.pair[0] === request.pair[1] ||
      !["always", "sometimes", "never"].includes(request.relation)) {
      structuralCommunityTopologyCounterfactualError = "Seleziona una coppia distinta e una relazione obiettivo valida.";
      return;
    }
    if (request.pair.some((nodeId) => !context.candidateNodeIds.has(nodeId))) {
      structuralCommunityTopologyCounterfactualError = "La coppia deve appartenere al dominio candidato dell'analisi corrente.";
      return;
    }

    const configuredEdits = configuredCommunityConstraints?.topologyCounterfactuals?.edgeEdits ?? [];
    const projectedNodeBySourceId = new Map<string, string>();
    for (const node of originalData?.nodes ?? []) {
      const nodeId = String(node.id);
      if (!context.candidateNodeIds.has(nodeId)) continue;
      const sourceId = normalizeGraphId(node.sourceId ?? node.id);
      if (projectedNodeBySourceId.has(sourceId) && projectedNodeBySourceId.get(sourceId) !== nodeId) {
        structuralCommunityTopologyCounterfactualError = `L'ID sorgente nodo '${sourceId}' non identifica un nodo univoco nella proiezione.`;
        return;
      }
      projectedNodeBySourceId.set(sourceId, nodeId);
    }

    const availableEdits: CommunityTopologyEdgeEdit[] = [];
    const removedEdgeByEditId = new Map<string, string>();
    const addedEndpointByEditId = new Map<string, [string, string]>();
    for (const edit of configuredEdits as CommunityTopologyEdgeEdit[]) {
      if (edit.action === "add") {
        const sourceNodeId = projectedNodeBySourceId.get(normalizeGraphId(edit.sourceNodeId));
        const targetNodeId = projectedNodeBySourceId.get(normalizeGraphId(edit.targetNodeId));
        if (!sourceNodeId || !targetNodeId) continue;
        availableEdits.push(edit);
        addedEndpointByEditId.set(edit.id, [sourceNodeId, targetNodeId]);
        continue;
      }
      const matchingRecords = context.communityEdgeRecords.filter((edge) =>
        edge.sourceIdGenerated !== true && edge.sourceId === String(edit.edgeId)
      );
      if (matchingRecords.length !== 1) continue;
      availableEdits.push(edit);
      removedEdgeByEditId.set(edit.id, matchingRecords[0].identity);
    }
    if (availableEdits.length === 0) {
      structuralCommunityTopologyCounterfactualError = "Nessun edge edit configurato è applicabile al gruppo e alla proiezione visibile correnti.";
      return;
    }

    const pairIndexes = request.pair.map((nodeId) => context.indexByNodeId.get(nodeId));
    if (pairIndexes.some((index) => index === undefined)) {
      structuralCommunityTopologyCounterfactualError = "La coppia selezionata non è mappabile nel dominio ASP corrente.";
      return;
    }

    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    const startedAt = performance.now();
    solverRunning = true;
    structuralCommunityTopologyCounterfactualRunning = true;
    const runAsp = async (program: string, options: string[], phase: string) => {
      const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
      if (remainingMs <= 0) throw new Error(`budget complessivo esaurito prima della fase ${phase}`);
      const result = await callClingo(program, options, remainingMs);
      if (result?.Result === "ERROR") throw new Error(result.Error || `Errore del worker clingo nella fase ${phase}.`);
      return result;
    };

    try {
      const outcome = await searchMinimumCostCommunityTopologyCounterfactual({
        edits: availableEdits,
        nodeIds: request.pair,
        requestedRelation: request.relation,
        solveSelection: async (selectionProgram) => {
          const result = await runAsp(
            selectionProgram,
            getStructuralCounterfactualSolverOptions(),
            "selezione degli edit"
          );
          return result;
        },
        evaluateGraph: async (editIndexes) => {
          const removedIdentities = new Set(editIndexes.flatMap((editIndex) => {
            const edit = availableEdits[editIndex];
            const edgeIdentity = removedEdgeByEditId.get(edit.id);
            return edgeIdentity ? [edgeIdentity] : [];
          }));
          const edgeRecords = context.communityEdgeRecords
            .filter((edge) => !removedIdentities.has(edge.identity))
            .map((edge) => ({
              source: edge.sourceIndex,
              target: edge.targetIndex,
              ...(context.options.weighted ? { weight: edge.weight } : {})
            }));
          for (const editIndex of editIndexes) {
            const edit = availableEdits[editIndex];
            if (edit.action !== "add") continue;
            const endpoints = addedEndpointByEditId.get(edit.id);
            if (!endpoints) throw new Error(`Endpoint mancanti per l'edit '${edit.id}'.`);
            const source = context.indexByNodeId.get(endpoints[0]);
            const target = context.indexByNodeId.get(endpoints[1]);
            if (source === undefined || target === undefined) throw new Error(`Endpoint non mappabili per l'edit '${edit.id}'.`);
            edgeRecords.push({
              source,
              target,
              ...(context.options.weighted ? { weight: edit.weight } : {})
            });
          }
          const modularityFacts = buildModularityFacts(context.candidateIndexes, edgeRecords, {
            weighted: context.options.weighted === true,
            resolution: context.resolution,
            includePairwiseObjective: context.candidateIndexes.length <= MAX_PAIRWISE_MODULARITY_CANDIDATES
          });
          if (modularityFacts.edgeCount === 0 || modularityFacts.totalWeight === 0) return null;

          const {
            pairwiseObjectiveOffset: _basePairwiseObjectiveOffset,
            separateDisconnectedComponents: _baseComponentPruning,
            includeContributions: _baseContributions,
            ...semanticOptions
          } = context.options;
          const options: ModularityCommunityOptions = {
            ...semanticOptions,
            weighted: modularityFacts.weighted,
            includeContributions: false,
            ...(modularityFacts.pairwiseObjectiveFacts && modularityFacts.pairwiseObjectiveOffset !== undefined
              ? { pairwiseObjectiveOffset: modularityFacts.pairwiseObjectiveOffset }
              : {})
          };
          const programs = buildCommunityPairMembershipPrograms(
            options,
            pairIndexes as [number, number]
          );
          const factsForVariant = [
            context.graphFacts,
            modularityFacts.facts.trim(),
            modularityFacts.pairwiseObjectiveFacts?.trim() ?? ""
          ].filter(Boolean).join("\n\n");
          const probe = async (kind: "together" | "separate", program: string): Promise<number | null> => {
            const result = await runAsp(
              `${factsForVariant}\n\n${program}\n`,
              getStructuralSolverOptions("communities"),
              `ottimo ${kind === "together" ? "must-link" : "cannot-link"}`
            );
            if (result?.Result === "UNSATISFIABLE") return null;
            if (result?.Result !== "OPTIMUM FOUND") {
              throw new Error(`clingo non ha provato l'ottimo ${kind === "together" ? "must-link" : "cannot-link"} (${result?.Result ?? "risposta vuota"}).`);
            }
            const optima = selectMaximumModularityPartitions(
              parseWitnessModularityPartitions(result?.Call?.[0]?.Witnesses, context.reverseIndex)
            );
            if (optima.length === 0) throw new Error(`Punteggio dell'ottimo ${kind} mancante o illeggibile.`);
            const witnessHasRequiredRelation = optima[0].communities.some((community) =>
              community.includes(request.pair[0]) && community.includes(request.pair[1])
            );
            if ((kind === "together" && !witnessHasRequiredRelation) ||
              (kind === "separate" && witnessHasRequiredRelation)) {
              throw new Error(`Il witness ottimo ${kind} non rispetta il vincolo interrogato.`);
            }
            return optima[0].scaledScore;
          };
          const togetherScaledScore = await probe("together", programs.together);
          const separateScaledScore = await probe("separate", programs.separate);
          if (togetherScaledScore === null && separateScaledScore === null) return null;
          const modularityDenominator = 4n * BigInt(modularityFacts.totalWeight) ** 2n * BigInt(modularityFacts.resolutionDenominator);
          return {
            togetherScaledScore,
            separateScaledScore,
            modularityDenominator: String(modularityDenominator)
          };
        }
      });
      if (outcome.status === "not-found") {
        structuralCommunityTopologyCounterfactualError = `Nessun sottoinsieme dei ${outcome.candidateCount} candidati raggiunge la relazione richiesta dopo ${outcome.testedEditSets} grafi modificati esaminati; la ricerca è completa.`;
        return;
      }
      structuralCommunityTopologyCounterfactual = outcome.result;
      structuralCommunityTopologyCounterfactualTimeMs = performance.now() - startedAt;
    } catch (error) {
      structuralCommunityTopologyCounterfactualError = error instanceof Error
        ? `Ricerca senza certificato di minimo: ${error.message}`
        : `Ricerca senza certificato di minimo: ${String(error)}`;
      structuralCommunityTopologyCounterfactualTimeMs = undefined;
    } finally {
      structuralCommunityTopologyCounterfactualRunning = false;
      solverRunning = false;
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function runIntegrityAnalysis() {
    if (solverRunning || !clingoWorker) return;
    lastGraph2DAnalysisKind = "integrity";
    clearGraphAnalysisFocus();
    showSolverPanel = false;
    showStructuralPanel = false;
    showMotifPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showIntegrityPanel = true;
    integrityError = "";
    integrityResults = [];
    integrityHasRun = false;
    integrityRepairError = "";
    integrityRepairProposal = null;

    if (graphSchemaVersion !== 2) {
      integrityError = "La diagnosi ASP richiede schemaVersion: 2 e mapping semantici espliciti.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      integrityError = blockingDiagnostic.message;
      return;
    }
    if (!originalData?.nodes?.length) {
      integrityError = "Il grafo importato non contiene nodi da verificare.";
      return;
    }

    try {
      const provenanceProjectedData = getProvenanceProjectedData();
      const { facts, reverseSourceIndex, reverseEdgeIndex, temporalEncoding } =
        buildAppAspFactsFromGraph(provenanceProjectedData);
      if (!facts.trim()) {
        integrityError = "Non sono stati generati fatti ASP dal grafo importato.";
        return;
      }
      const constraints = GRAPH_CONFIG.graphIntegrity as GraphIntegrityConstraints;
      validateGraphIntegrityAttributeMappings(
        constraints,
        new Set(Object.keys(GRAPH_CONFIG.graphMapping?.node?.attributes ?? {})),
        new Set(Object.keys(GRAPH_CONFIG.graphMapping?.edge?.attributes ?? {}))
      );
      const program = `${facts.trim()}\n\n${buildGraphIntegrityProgram(constraints, graphDirection)}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const result = await callClingo(program, [], taskTimeoutMs);
        integrityTimeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          integrityError = result.Error || "Errore del worker clingo.";
          return;
        }
        if (result?.Result !== "UNSATISFIABLE" && !hasCompleteModelEnumeration(result)) {
          integrityError = `clingo non conferma che l'enumerazione delle violazioni sia completa (${result?.Result ?? "risposta vuota"}).`;
          return;
        }
        if (!["SATISFIABLE", "OPTIMUM FOUND"].includes(String(result?.Result))) {
          integrityError = `Il solver non ha restituito un modello diagnostico: ${result?.Result ?? "risposta vuota"}.`;
          return;
        }
        integrityResults = parseIntegrityViolations(
          result?.Call?.[0]?.Witnesses,
          reverseSourceIndex,
          reverseEdgeIndex,
          temporalEncoding.decode
        );
        integrityHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      integrityError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function runTypedMotifAnalysis(request: { templateIndex: number; group: string }) {
    if (solverRunning || !clingoWorker) return;
    lastGraph2DAnalysisKind = "typedMotif";
    clearGraphAnalysisFocus();
    clearMotifScenarioAnalysis();
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showMotifPanel = true;
    motifError = "";
    motifMatches = [];
    motifHasRun = false;
    motifTimeMs = undefined;
    motifCount = undefined;
    motifCountHasRun = false;
    motifCountError = "";
    motifCountTimeMs = undefined;
    motifCountPartitionCount = undefined;
    motifCountProgress = undefined;
    motifCountNotice = "";
    motifCountAbortController = undefined;
    motifNearMatches = [];
    motifNearMatchHasRun = false;
    motifNearMatchError = "";
    motifNearMatchTimeMs = undefined;
    resetMotifCounterfactual();

    if (!Number.isInteger(request.templateIndex) || !motifTemplates[request.templateIndex]) {
      motifError = "Il motivo selezionato non è disponibile. Scegline uno in Dati → Configurazione.";
      return;
    }
    if (!typedMotifDataReadiness.available) {
      motifError = typedMotifDataReadiness.reasons.join("; ");
      return;
    }
    if (motifTemplates[request.templateIndex].temporal &&
      !temporalMotifDataReadiness.available) {
      motifError = temporalMotifDataReadiness.reasons.join("; ");
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      motifError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length) {
      motifError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }

    try {
      const { facts, reverseIndex, reverseSourceIndex, reverseEdgeIndex, temporalEncoding } = buildAspFactsFromCurrentData();
      if (!facts.trim()) {
        motifError = "Non sono stati generati fatti ASP dalla proiezione visibile corrente.";
        return;
      }
      const template = buildTypedMotifProgram(
        motifTemplates[request.templateIndex],
        graphDirection,
        request.group,
        false,
        false,
        temporalEncoding
      );
      const fullProgram = `${facts.trim()}\n\n${template.program}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const result = await callClingo(fullProgram, [], taskTimeoutMs);
        motifTimeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          motifError = result.Error || "Errore del worker clingo.";
          return;
        }
        if (result?.Result === "UNSATISFIABLE") {
          motifMatches = [];
          motifHasRun = true;
          return;
        }
        if (result?.Result !== "SATISFIABLE" || !hasCompleteModelEnumeration(result)) {
          motifError = `Il solver non ha completato l'enumerazione: ${result?.Result ?? "risposta vuota"}.`;
          return;
        }
        motifMatches = parseTypedMotifMatches(
          result?.Call?.[0]?.Witnesses,
          template,
          reverseIndex,
          reverseSourceIndex,
          reverseEdgeIndex,
          new Set(),
          temporalEncoding.decode
        );
        motifHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      motifError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function compareProvenanceScenarioMotifs(request: { templateIndex: number; group: string }) {
    if (solverRunning || !clingoWorker) return;
    clearMotifAnalysis();
    motifScenarioComparison = null;
    motifScenarioComparisonError = "";
    motifScenarioComparisonProgress = "";
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showMotifPanel = true;
    lastGraph2DAnalysisKind = "motifScenarioComparison";

    if (provenanceScenarioConfig?.worldAssumption !== "finite-exhaustive-worlds") {
      motifScenarioComparisonError = "Per confrontare gli scenari, dichiarali come insieme finito ed esaustivo nella configurazione della rete.";
      return;
    }
    if (!Array.isArray(provenanceScenarios) || provenanceScenarios.length === 0) {
      motifScenarioComparisonError = "La configurazione non dichiara scenari di provenienza validi.";
      return;
    }
    if (!Number.isInteger(request.templateIndex) || !motifTemplates[request.templateIndex]) {
      motifScenarioComparisonError = "Il motivo selezionato non è disponibile. Scegline uno in Dati → Configurazione.";
      return;
    }
    const templateInput = motifTemplates[request.templateIndex];
    if (!typedMotifDataReadiness.available) {
      motifScenarioComparisonError = typedMotifDataReadiness.reasons.join("; ");
      return;
    }
    if (templateInput.temporal && !temporalMotifDataReadiness.available) {
      motifScenarioComparisonError = temporalMotifDataReadiness.reasons.join("; ");
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      motifScenarioComparisonError = blockingDiagnostic.message;
      return;
    }
    if (!originalData?.nodes?.length) {
      motifScenarioComparisonError = "Il grafo di origine non contiene nodi da confrontare.";
      return;
    }
    const sourceGraph = originalData;
    const confidenceRange = getEdgeConfidenceRange();
    const confidenceThreshold = graphCapabilities.edgeConfidence?.available === true
      ? minimumEdgeConfidence
      : null;

    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    const scenarioInputs: ProvenanceMotifScenarioInput[] = [];
    let activeScenarioLabel = "";
    let totalTimeMs = 0;
    solverRunning = true;
    try {
      for (let index = 0; index < provenanceScenarios.length; index += 1) {
        const scenario = provenanceScenarios[index];
        activeScenarioLabel = String(scenario.label ?? scenario.id);
        motifScenarioComparisonProgress = `Scenario ${index + 1}/${provenanceScenarios.length}: ${activeScenarioLabel}`;
        const sourceLinks = filterLinksByProvenanceScenario(sourceGraph.links ?? [], {
          sources: scenario.sources,
          unattributedEdges: provenanceScenarioConfig.unattributedEdges,
          referenceMatching: provenanceScenarioConfig.referenceMatching ?? "any"
        });
        const confidenceQualifiedLinks = filterLinksByMinimumConfidence(
          sourceLinks,
          confidenceThreshold,
          confidenceRange
        );
        const timelineQualifiedLinks = getTimelineQualifiedLinks(confidenceQualifiedLinks);
        const scenarioVisibleNodeIds = projectVisibleNodeIdsForLinks(timelineQualifiedLinks);
        const candidateNodes = sourceGraph.nodes.filter((node: any) =>
          scenarioVisibleNodeIds.has(String(node.id))
        );
        const candidateNodeIds = new Set(candidateNodes.map((node: any) => normalizeGraphId(node.id)));
        const scenarioLinks = timelineQualifiedLinks.filter((link: any) =>
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.source))) &&
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.target)))
        );
        const graphForScenario = { ...sourceGraph, nodes: candidateNodes, links: scenarioLinks };
        const { facts, reverseIndex, reverseSourceIndex, reverseEdgeIndex, temporalEncoding } =
          buildAppAspFactsFromGraph(graphForScenario);
        const compiledTemplate = buildTypedMotifProgram(
          templateInput,
          graphDirection,
          request.group,
          false,
          false,
          temporalEncoding
        );
        const fullProgram = `${facts.trim()}\n\n${compiledTemplate.program}\n`;
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`è scaduto il limite complessivo di ${timeoutMs} ms`);
        const startedAt = performance.now();
        const result = await callClingo(fullProgram, [], remainingMs);
        const timeMs = performance.now() - startedAt;
        totalTimeMs += timeMs;
        if (result?.Result === "ERROR") throw new Error(result.Error || "clingo ha restituito un errore");
        let matches: TypedMotifMatch[] = [];
        if (result?.Result !== "UNSATISFIABLE") {
          if (result?.Result !== "SATISFIABLE" || !hasCompleteModelEnumeration(result)) {
            throw new Error(`clingo non ha completato l'enumerazione del motivo (${result?.Result ?? "risposta vuota"})`);
          }
          matches = parseTypedMotifMatches(
            result?.Call?.[0]?.Witnesses,
            compiledTemplate,
            reverseIndex,
            reverseSourceIndex,
            reverseEdgeIndex,
            new Set(),
            temporalEncoding.decode
          );
        }
        scenarioInputs.push({
          scenarioId: scenario.id,
          scenarioLabel: scenario.label ?? scenario.id,
          nodesCount: candidateNodes.length,
          linksCount: scenarioLinks.length,
          timeMs,
          enumerationComplete: true,
          matches
        });
      }

      motifScenarioComparison = summarizeProvenanceScenarioMotifs(
        templateInput.id,
        templateInput.label ?? templateInput.id,
        Object.keys(templateInput.roles),
        scenarioInputs,
        {
          selectedGroup: request.group,
          graphDirection,
          timelineWindow: timelineControlEnabled ? `${currentStart}–${currentEnd}` : "",
          minimumEdgeConfidence: confidenceThreshold,
          viewFilters: getScenarioViewFilterSnapshot()
        }
      );
      motifScenarioComparisonTimeMs = totalTimeMs;
    } catch (error) {
      motifScenarioComparison = null;
      const message = error instanceof Error ? error.message : String(error);
      motifScenarioComparisonError = `Confronto interrotto nello scenario '${activeScenarioLabel}'. Nessun risultato parziale è stato presentato. ${message}`;
    } finally {
      solverRunning = false;
      motifScenarioComparisonProgress = "";
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function countTypedMotifMatches(request: { templateIndex: number; group: string }) {
    if (solverRunning || !clingoWorker) return;
    lastGraph2DAnalysisKind = "motifCount";
    clearGraphAnalysisFocus();
    clearMotifScenarioAnalysis();
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showMotifPanel = true;
    motifError = "";
    motifMatches = [];
    motifHasRun = false;
    motifTimeMs = undefined;
    motifCount = undefined;
    motifCountHasRun = false;
    motifCountError = "";
    motifCountTimeMs = undefined;
    motifCountPartitionCount = undefined;
    motifCountProgress = undefined;
    motifCountNotice = "";
    motifCountAbortController = undefined;
    motifNearMatches = [];
    motifNearMatchHasRun = false;
    motifNearMatchError = "";
    motifNearMatchTimeMs = undefined;
    resetMotifCounterfactual();

    if (!Number.isInteger(request.templateIndex) || !motifTemplates[request.templateIndex]) {
      motifCountError = "Il motivo selezionato non è disponibile. Scegline uno in Dati → Configurazione.";
      return;
    }
    const selectedTemplate = motifTemplates[request.templateIndex];
    const motifCountContract = getGraphTaskContract("motifCount", {
      direction: graphDirection,
      temporalSemantics: selectedTemplate.temporal?.semantics ?? "static"
    });
    const motifCountRequirements = checkGraphTaskRequirements(
      graphCapabilities,
      motifCountContract?.requiredCapabilities.slice() ?? []
    );
    if (!motifCountContract || !motifCountRequirements.available) {
      motifCountError = motifCountRequirements.reasons.join("; ") || "Il conteggio dei motivi non ha un contratto ASP valido.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      motifCountError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length) {
      motifCountError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }
    if (!motifCountPartitionSettings.enabled && motifCountPartitionSettings.error) {
      motifCountError = motifCountPartitionSettings.error;
      return;
    }

    try {
      const { facts, temporalEncoding } = buildAspFactsFromCurrentData();
      if (!facts.trim()) {
        motifCountError = "Non sono stati generati fatti ASP dalla proiezione visibile corrente.";
        return;
      }
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      solverRunning = true;
      const startedAt = performance.now();
      try {
        if (motifCountPartitionSettings.enabled) {
          const controller = new AbortController();
          motifCountAbortController = controller;
          const partitionDomain = resolveTypedMotifCountPartitionDomain(selectedTemplate);
          const partitioned = await runTypedMotifCountPartitions({
            edgeCount: data.links?.length ?? 0,
            roleNodeCount: data.nodes.length,
            partitionDomain,
            settings: motifCountPartitionSettings.settings,
            perPartitionTimeoutMs: taskTimeoutMs,
            signal: controller.signal,
            onProgress: (progress) => {
              motifCountProgress = progress;
            },
            runPartition: async (partitionIndexes, timeoutMs, signal) => {
              const counted = buildTypedMotifCountProgram(
                selectedTemplate,
                graphDirection,
                request.group,
                {
                  temporalEncoding,
                  ...(partitionDomain === "firstPatternEdge"
                    ? { firstPatternEdgeIndexes: partitionIndexes }
                    : { firstRoleNodeIndexes: partitionIndexes })
                }
              );
              const fullProgram = `${facts.trim()}\n\n${counted.program}\n`;
              return callClingo(fullProgram, [], timeoutMs, 1, signal);
            }
          });
          motifCountTimeMs = performance.now() - startedAt;
          if (partitioned.status === "complete") {
            motifCount = partitioned.count;
            motifCountPartitionCount = partitioned.partitionCount;
            motifCountHasRun = true;
          } else if (partitioned.status === "cancelled") {
            motifCountNotice = "Conteggio annullato; il totale parziale non è stato pubblicato.";
          } else if (partitioned.status === "timeout") {
            motifCountError = `Tempo massimo di ${motifCountPartitionSettings.settings.maxDurationMs.toLocaleString("it-IT")} ms raggiunto dopo ${partitioned.completedPartitions}/${partitioned.partitionCount} passaggi; non mostro un totale parziale.`;
          } else {
            motifCountError = partitioned.message;
          }
        } else {
          const counted = buildTypedMotifCountProgram(
            selectedTemplate,
            graphDirection,
            request.group,
            { temporalEncoding }
          );
          const fullProgram = `${facts.trim()}\n\n${counted.program}\n`;
          const result = await callClingo(fullProgram, [], taskTimeoutMs, 1);
          motifCountTimeMs = performance.now() - startedAt;
          if (result?.Result === "ERROR") {
            motifCountError = result.Error || "Errore del worker clingo.";
            return;
          }
          if (result?.Result !== "SATISFIABLE" || result?.Models?.More !== "no") {
            motifCountError = `Il solver non ha restituito un conteggio aggregato completo: ${result?.Result ?? "risposta vuota"}.`;
            return;
          }
          const count = parseTypedMotifCount(result?.Call?.[0]?.Witnesses);
          if (count === undefined) {
            motifCountError = "Il solver non ha restituito un singolo valore di conteggio valido.";
            return;
          }
          motifCount = count;
          motifCountHasRun = true;
        }
      } finally {
        solverRunning = false;
        motifCountProgress = undefined;
        motifCountAbortController = undefined;
      }
    } catch (error) {
      solverRunning = false;
      motifCountProgress = undefined;
      motifCountAbortController = undefined;
      motifCountError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  function cancelTypedMotifCount() {
    if (!motifCountAbortController) return;
    motifCountNotice = "Annullamento in corso; il totale parziale verrà scartato.";
    motifCountAbortController.abort();
  }

  async function runSignedTriadAnalysis(request: { group: string }) {
    if (solverRunning || !clingoWorker) return;
    lastGraph2DAnalysisKind = "signedTriads";
    clearGraphAnalysisFocus();
    clearSignedTriadScenarioAnalysis();
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showMotifPanel = true;
    signedTriadError = "";
    signedTriadResults = [];
    signedTriadHasRun = false;
    signedTriadTimeMs = undefined;
    selectedSignedTriadGroup = request.group;

    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      signedTriadError = blockingDiagnostic.message;
      return;
    }
    const readiness = prepareSignedTriads(
      signedTriadConfig,
      graphSchemaVersion,
      graphDirection,
      data?.nodes ?? [],
      data?.links ?? [],
      new Set(Object.keys(GRAPH_CONFIG.graphMapping?.edge?.attributes ?? {})),
      extractGroups,
      request.group,
      typeof GRAPH_CONFIG.graphMapping?.edge?.typeField === "string" && GRAPH_CONFIG.graphMapping.edge.typeField.trim() !== ""
    );
    if (!readiness.available) {
      signedTriadError = readiness.reasons.join(" ");
      return;
    }
    if (!data?.nodes?.length) {
      signedTriadError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }

    try {
      const { facts, reverseIndex } = buildAspFactsFromCurrentData();
      if (!facts.trim()) {
        signedTriadError = "Non sono stati generati fatti ASP dalla proiezione visibile corrente.";
        return;
      }
      const program = `${facts.trim()}\n\n${buildSignedTriadProgram(readiness)}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const result = await callClingo(program, [], taskTimeoutMs);
        signedTriadTimeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          signedTriadError = result.Error || "Errore del worker clingo.";
          return;
        }
        if (result?.Result !== "SATISFIABLE") {
          signedTriadError = `Il solver non ha completato la classificazione: ${result?.Result ?? "risposta vuota"}.`;
          return;
        }
        if (!hasCompleteModelEnumeration(result)) {
          signedTriadError = "clingo non conferma che tutte le triadi siano state classificate; il risultato parziale è stato scartato.";
          return;
        }
        signedTriadResults = parseSignedTriadResults(
          result?.Call?.[0]?.Witnesses,
          reverseIndex,
          readiness.dyads
        );
        signedTriadHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      signedTriadError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function compareSignedTriadScenarios(request: { group: string }) {
    if (solverRunning || !clingoWorker) return;
    clearSignedTriadAnalysis();
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showMotifPanel = true;
    lastGraph2DAnalysisKind = "signedTriadScenarioComparison";
    selectedSignedTriadGroup = request.group;

    if (!signedTriadConfig) {
      signedTriadScenarioComparisonError = "graphAnalysis.signedTriads non è configurato.";
      return;
    }
    if (provenanceScenarioConfig?.worldAssumption !== "finite-exhaustive-worlds") {
      signedTriadScenarioComparisonError = "Per confrontare le triadi, dichiara gli scenari come insieme finito ed esaustivo nella configurazione della rete.";
      return;
    }
    if (!Array.isArray(provenanceScenarios) || provenanceScenarios.length < 2) {
      signedTriadScenarioComparisonError = "Configura almeno due scenari di provenienza validi.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      signedTriadScenarioComparisonError = blockingDiagnostic.message;
      return;
    }
    if (!originalData?.nodes) {
      signedTriadScenarioComparisonError = "Il grafo di origine non è disponibile.";
      return;
    }

    const sourceGraph = originalData;
    const confidenceRange = getEdgeConfidenceRange();
    const confidenceThreshold = graphCapabilities.edgeConfidence?.available === true
      ? minimumEdgeConfidence
      : null;
    const timeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
    const deadline = performance.now() + timeoutMs;
    const scenarioInputs: SignedTriadScenarioInput[] = [];
    let activeScenarioLabel = "";
    let totalTimeMs = 0;
    solverRunning = true;
    try {
      for (let index = 0; index < provenanceScenarios.length; index += 1) {
        const scenario = provenanceScenarios[index];
        activeScenarioLabel = String(scenario.label ?? scenario.id);
        signedTriadScenarioComparisonProgress = `Scenario ${index + 1}/${provenanceScenarios.length}: ${activeScenarioLabel}`;
        const sourceLinks = filterLinksByProvenanceScenario(sourceGraph.links ?? [], {
          sources: scenario.sources,
          unattributedEdges: provenanceScenarioConfig.unattributedEdges,
          referenceMatching: provenanceScenarioConfig.referenceMatching ?? "any"
        });
        const confidenceQualifiedLinks = filterLinksByMinimumConfidence(
          sourceLinks,
          confidenceThreshold,
          confidenceRange
        );
        const timelineQualifiedLinks = getTimelineQualifiedLinks(confidenceQualifiedLinks);
        const scenarioVisibleNodeIds = projectVisibleNodeIdsForLinks(timelineQualifiedLinks);
        const candidateNodes = sourceGraph.nodes.filter((node: any) =>
          scenarioVisibleNodeIds.has(String(node.id))
        );
        const candidateNodeIds = new Set(candidateNodes.map((node: any) => normalizeGraphId(node.id)));
        const scenarioLinks = timelineQualifiedLinks.filter((link: any) =>
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.source))) &&
          candidateNodeIds.has(normalizeGraphId(getLinkEndId(link.target)))
        );

        const candidateGroupNodes = request.group
          ? candidateNodes.filter((node: any) => extractGroups(node).map((group) => String(group).trim()).includes(request.group))
          : candidateNodes;
        if (candidateNodes.length === 0 || candidateGroupNodes.length === 0) {
          scenarioInputs.push({
            scenarioId: scenario.id,
            scenarioLabel: scenario.label ?? scenario.id,
            nodesCount: candidateNodes.length,
            linksCount: scenarioLinks.length,
            timeMs: 0,
            enumerationComplete: true,
            triads: []
          });
          continue;
        }

        const graphForScenario = { ...sourceGraph, nodes: candidateNodes, links: scenarioLinks };
        const preparation = prepareSignedTriads(
          signedTriadConfig,
          graphForScenario.schemaVersion,
          graphForScenario.direction,
          graphForScenario.nodes,
          graphForScenario.links,
          new Set(Object.keys(GRAPH_CONFIG.graphMapping?.edge?.attributes ?? {})),
          extractGroups,
          request.group,
          typeof GRAPH_CONFIG.graphMapping?.edge?.typeField === "string" && GRAPH_CONFIG.graphMapping.edge.typeField.trim() !== ""
        );
        if (!preparation.available) {
          throw new Error(preparation.reasons.join(" "));
        }
        const { facts, reverseIndex } = buildAppAspFactsFromGraph(graphForScenario);
        if (!facts.trim()) throw new Error("Non sono stati generati fatti ASP per lo scenario.");
        const remainingMs = getRemainingSolverBudgetMs(deadline, performance.now());
        if (remainingMs <= 0) throw new Error(`è scaduto il limite complessivo di ${timeoutMs} ms`);
        const startedAt = performance.now();
        const result = await callClingo(
          `${facts.trim()}\n\n${buildSignedTriadProgram(preparation)}\n`,
          [],
          remainingMs
        );
        const timeMs = performance.now() - startedAt;
        totalTimeMs += timeMs;
        if (result?.Result === "ERROR") throw new Error(result.Error || "clingo ha restituito un errore");
        if (result?.Result !== "SATISFIABLE" || !hasCompleteModelEnumeration(result)) {
          throw new Error(`clingo non ha completato la classificazione nello scenario '${activeScenarioLabel}' (${result?.Result ?? "risposta vuota"}).`);
        }
        scenarioInputs.push({
          scenarioId: scenario.id,
          scenarioLabel: scenario.label ?? scenario.id,
          nodesCount: candidateNodes.length,
          linksCount: scenarioLinks.length,
          timeMs,
          enumerationComplete: true,
          triads: parseSignedTriadResults(
            result?.Call?.[0]?.Witnesses,
            reverseIndex,
            preparation.dyads
          )
        });
      }

      signedTriadScenarioComparison = summarizeSignedTriadScenarios(scenarioInputs, {
        attribute: signedTriadConfig.attribute,
        positiveValues: signedTriadConfig.positiveValues,
        negativeValues: signedTriadConfig.negativeValues,
        edgeTypes: Array.isArray(signedTriadConfig.edgeTypes) ? signedTriadConfig.edgeTypes : [],
        selectedGroup: request.group,
        timelineWindow: timelineControlEnabled ? `${currentStart}–${currentEnd}` : "",
        minimumEdgeConfidence: confidenceThreshold,
        viewFilters: getScenarioViewFilterSnapshot()
      });
      signedTriadScenarioComparisonTimeMs = totalTimeMs;
    } catch (error) {
      signedTriadScenarioComparison = null;
      const message = error instanceof Error ? error.message : String(error);
      signedTriadScenarioComparisonError = `Confronto interrotto nello scenario '${activeScenarioLabel}'. Nessun risultato parziale è stato presentato. ${message}`;
    } finally {
      solverRunning = false;
      signedTriadScenarioComparisonProgress = "";
      persistCurrentAnalysisSession(false, true);
    }
  }

  async function runTypedMotifNearMatch(request: { templateIndex: number; group: string }) {
    if (solverRunning || !clingoWorker) return;
    lastGraph2DAnalysisKind = "motifNearMatch";
    clearGraphAnalysisFocus();
    clearMotifScenarioAnalysis();
    motifNearMatches = [];
    motifNearMatchHasRun = false;
    motifNearMatchError = "";
    motifNearMatchTimeMs = undefined;
    if (!Number.isInteger(request.templateIndex) || !motifTemplates[request.templateIndex]) {
      motifNearMatchError = "Il motivo selezionato non è disponibile. Scegline uno in Dati → Configurazione.";
      return;
    }
    const selectedTemplate = motifTemplates[request.templateIndex];
    const nearMatchContract = getGraphTaskContract("typedMotifNearMatch", {
      direction: graphDirection,
      temporalSemantics: selectedTemplate.temporal?.semantics ?? "static"
    });
    const nearMatchRequirements = checkGraphTaskRequirements(
      graphCapabilities,
      nearMatchContract?.requiredCapabilities.slice() ?? []
    );
    if (!nearMatchContract || !nearMatchRequirements.available) {
      motifNearMatchError = nearMatchRequirements.reasons.join("; ") || "Il near-match non ha un contratto ASP valido.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      motifNearMatchError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length) {
      motifNearMatchError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }
    try {
      const { facts, reverseIndex, reverseSourceIndex, reverseEdgeIndex, temporalEncoding } = buildAspFactsFromCurrentData();
      if (!facts.trim()) {
        motifNearMatchError = "Non sono stati generati fatti ASP dalla proiezione visibile corrente.";
        return;
      }
      const template = selectedTemplate.temporal
        ? buildTypedMotifTemporalNearMatchProgram(selectedTemplate, graphDirection, request.group, temporalEncoding)
        : buildTypedMotifNearMatchProgram(selectedTemplate, graphDirection, request.group, temporalEncoding);
      const fullProgram = `${facts.trim()}\n\n${template.program}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const result = await callClingo(fullProgram, ["--opt-mode=opt"], taskTimeoutMs);
        motifNearMatchTimeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          motifNearMatchError = result.Error || "Errore del worker clingo.";
          return;
        }
        if (result?.Result !== "OPTIMUM FOUND") {
          motifNearMatchError = `La diagnostica non ha provato un near-match ottimo (${result?.Result ?? "risposta vuota"}).`;
          return;
        }
        motifNearMatches = parseTypedMotifNearMatches(
          result?.Call?.[0]?.Witnesses,
          template,
          reverseIndex,
          reverseSourceIndex,
          reverseEdgeIndex,
          temporalEncoding.decode
        );
        if (motifNearMatches.length === 0) {
          motifNearMatchError = "Il solver non ha restituito un near-match leggibile.";
          return;
        }
        motifNearMatchHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      motifNearMatchError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  async function runTypedMotifCompletionCounterfactual(request: { templateIndex: number; group: string }) {
    if (solverRunning || !clingoWorker) return;
    lastGraph2DAnalysisKind = "motifCounterfactual";
    clearGraphAnalysisFocus();
    clearMotifScenarioAnalysis();
    resetMotifCounterfactual();
    if (!motifHasRun || motifMatches.length > 0) {
      motifCounterfactualError = "Esegui prima il motivo selezionato e verifica che non abbia istanze.";
      return;
    }
    if (!Number.isInteger(request.templateIndex) || !motifTemplates[request.templateIndex]) {
      motifCounterfactualError = "Il motivo selezionato non è disponibile. Scegline uno in Dati → Configurazione.";
      return;
    }
    if (!motifCounterfactualsConfigured) {
      motifCounterfactualError = "Configura graphAnalysis.counterfactuals.edgeAdditions con candidati e costi espliciti.";
      return;
    }
    const templateInput = motifTemplates[request.templateIndex];
    const completionContract = getGraphTaskContract("motifCompletionCounterfactual", {
      direction: graphDirection,
      temporalSemantics: templateInput.temporal?.semantics ?? "static"
    });
    const completionRequirements = checkGraphTaskRequirements(
      graphCapabilities,
      completionContract?.requiredCapabilities.slice() ?? []
    );
    if (!completionContract || !completionRequirements.available) {
      motifCounterfactualError = completionRequirements.reasons.join("; ") || "Il controfattuale del motivo non ha un contratto ASP valido.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      motifCounterfactualError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length || !originalData?.nodes?.length) {
      motifCounterfactualError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }

    try {
      if (!Array.isArray(motifCounterfactualEdgeAdditions)) {
        throw new TypeError("graphAnalysis.counterfactuals.edgeAdditions deve essere un array.");
      }
      const additionalTemporalValues = templateInput.temporal
        ? motifCounterfactualEdgeAdditions.flatMap((candidate: any) => [
          candidate?.validity?.from,
          candidate?.validity?.to
        ])
        : [];
      const { facts, reverseIndex, reverseSourceIndex, reverseEdgeIndex, indexByNodeId, temporalEncoding } =
        buildAspFactsFromCurrentData(additionalTemporalValues);
      if (!facts.trim()) {
        motifCounterfactualError = "Non sono stati generati fatti ASP dalla proiezione visibile corrente.";
        return;
      }

      const candidateIds = new Set<string>();
      const actualEdgeIds = new Set<string>((originalData.links ?? []).map((link: any) =>
        String(link.sourceId ?? link.analysis?.id ?? "").trim()
      ).filter(Boolean));
      const visibleNodeIds = new Set<string>((data.nodes ?? []).map((node: any) => node.id));
      const visibleInRequestedGroup = (node: any) =>
        visibleNodeIds.has(node.id) && (!request.group || extractGroups(node).includes(request.group));
      const resolveConfiguredNode = (value: unknown, path: string) => {
        if ((typeof value !== "string" && typeof value !== "number") || String(value).trim() === "") {
          throw new TypeError(`${path} deve indicare un ID nodo stringa o numerico.`);
        }
        const requestedId = String(value).trim();
        const exact = (originalData.nodes as any[]).filter((node) =>
          String(node.sourceId ?? "") === requestedId || String(node.id) === requestedId
        );
        const matches = exact.length > 0
          ? exact
          : (originalData.nodes as any[]).filter((node) => node.id === normalizeGraphId(requestedId));
        const unique = [...new Map(matches.map((node) => [node.id, node])).values()];
        if (unique.length === 0) throw new TypeError(`${path} fa riferimento a un nodo inesistente: '${requestedId}'.`);
        if (unique.length > 1) throw new TypeError(`${path} è ambiguo: '${requestedId}' identifica più nodi.`);
        return unique[0];
      };

      let excludedCandidateCount = 0;
      const firstSyntheticRecord = Math.max(0, ...Object.keys(reverseEdgeIndex).map(Number)) + 1;
      const resolvedCandidates = motifCounterfactualEdgeAdditions.map((candidate: any, index: number) => {
        if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
          throw new TypeError(`edgeAdditions[${index}] deve essere un oggetto.`);
        }
        const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
        if (!id) throw new TypeError(`edgeAdditions[${index}].id deve essere una stringa non vuota.`);
        if (candidateIds.has(id)) throw new TypeError(`edgeAdditions contiene l'ID duplicato '${id}'.`);
        if (actualEdgeIds.has(id)) throw new TypeError(`L'ID candidato '${id}' è già usato da un arco osservato.`);
        candidateIds.add(id);

        const source = resolveConfiguredNode(candidate.sourceNodeId, `edgeAdditions[${index}].sourceNodeId`);
        const target = resolveConfiguredNode(candidate.targetNodeId, `edgeAdditions[${index}].targetNodeId`);
        if (source.id === target.id) throw new TypeError(`edgeAdditions[${index}] non può essere un cappio.`);
        return { candidate, id, source, target, recordIndex: firstSyntheticRecord + index };
      });
      // Validate every configured candidate, including those outside the current view, so
      // projection filtering cannot hide malformed costs, types, IDs, or temporal intervals.
      const validationCandidates = resolvedCandidates.map(({ candidate, id, source, target, recordIndex }) => ({
        ...candidate,
        id,
        sourceNodeId: String(source.sourceId ?? source.id),
        targetNodeId: String(target.sourceId ?? target.id),
        sourceNode: 1,
        targetNode: 2,
        recordIndex
      }));
      buildTypedMotifCompletionCounterfactualProgram(
        templateInput,
        graphDirection,
        request.group,
        validationCandidates,
        temporalEncoding
      );

      const candidates = resolvedCandidates.map(({ candidate, id, source, target, recordIndex }) => {
        if (!visibleInRequestedGroup(source) || !visibleInRequestedGroup(target)) {
          excludedCandidateCount += 1;
          motifCounterfactualExcludedCandidateCount = excludedCandidateCount;
          return null;
        }
        const sourceNode = indexByNodeId.get(source.id);
        const targetNode = indexByNodeId.get(target.id);
        if (!sourceNode || !targetNode) {
          excludedCandidateCount += 1;
          motifCounterfactualExcludedCandidateCount = excludedCandidateCount;
          return null;
        }
        return {
          ...candidate,
          id,
          sourceNodeId: String(source.sourceId ?? source.id),
          targetNodeId: String(target.sourceId ?? target.id),
          sourceNode,
          targetNode,
          recordIndex
        };
      }).filter((candidate: unknown) => candidate !== null);
      motifCounterfactualExcludedCandidateCount = excludedCandidateCount;
      if (candidates.length === 0) {
        motifCounterfactualError = excludedCandidateCount > 0
          ? "Tutti i candidati autorizzati sono fuori dalla proiezione visibile o dal gruppo selezionato."
          : "Non ci sono archi candidati utilizzabili nella configurazione.";
        return;
      }

      const compiled = buildTypedMotifCompletionCounterfactualProgram(
        templateInput,
        graphDirection,
        request.group,
        candidates,
        temporalEncoding
      );
      const fullProgram = `${facts.trim()}\n\n${compiled.program}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const result = await callClingo(fullProgram, ["--opt-mode=opt"], taskTimeoutMs);
        motifCounterfactualTimeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          motifCounterfactualError = result.Error || "Errore del worker clingo.";
          return;
        }
        if (result?.Result === "UNSATISFIABLE") {
          motifCounterfactualHasRun = true;
          return;
        }
        if (result?.Result !== "OPTIMUM FOUND") {
          motifCounterfactualError = `Il solver non ha provato una proposta ottima (${result?.Result ?? "risposta vuota"}).`;
          return;
        }
        motifCounterfactuals = parseTypedMotifCompletionCounterfactuals(
          result?.Call?.[0]?.Witnesses,
          compiled.template,
          compiled.candidates,
          reverseIndex,
          reverseSourceIndex,
          reverseEdgeIndex,
          temporalEncoding.decode
        );
        if (motifCounterfactuals.length === 0) {
          motifCounterfactualError = "Il solver ha trovato un ottimo, ma il testimone non è stato mappato in modo verificabile.";
          return;
        }
        motifCounterfactualHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      motifCounterfactualError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  function resetMotifCounterfactual() {
    motifCounterfactuals = [];
    motifCounterfactualHasRun = false;
    motifCounterfactualError = "";
    motifCounterfactualTimeMs = undefined;
    motifCounterfactualExcludedCandidateCount = 0;
  }

  function clearMotifAnalysis() {
    clearGraph2DOverlay();
    motifMatches = [];
    motifHasRun = false;
    motifError = "";
    motifTimeMs = undefined;
    motifCount = undefined;
    motifCountHasRun = false;
    motifCountError = "";
    motifCountTimeMs = undefined;
    motifCountPartitionCount = undefined;
    motifCountProgress = undefined;
    motifCountNotice = "";
    motifCountAbortController = undefined;
    motifNearMatches = [];
    motifNearMatchHasRun = false;
    motifNearMatchError = "";
    motifNearMatchTimeMs = undefined;
    clearMotifScenarioAnalysis();
    resetMotifCounterfactual();
    clearContextualCliqueAnalysis();
  }

  function clearMotifScenarioAnalysis() {
    motifScenarioComparison = null;
    motifScenarioComparisonError = "";
    motifScenarioComparisonProgress = "";
    motifScenarioComparisonTimeMs = undefined;
  }

  function clearSignedTriadAnalysis() {
    clearGraph2DOverlay();
    const wasFocused = focusedSignedTriadEdgeIds !== null;
    signedTriadResults = [];
    signedTriadHasRun = false;
    signedTriadError = "";
    signedTriadTimeMs = undefined;
    clearSignedTriadScenarioAnalysis();
    focusedSignedTriadEdgeIds = null;
    focusedSignedTriadKey = "";
    refreshLinkVisuals();
    refreshNodeVisuals();
    if (wasFocused) graph3D?.zoomToFit(graphTransitionDuration(500), 100);
  }

  function clearSignedTriadScenarioAnalysis() {
    signedTriadScenarioComparison = null;
    signedTriadScenarioComparisonError = "";
    signedTriadScenarioComparisonProgress = "";
    signedTriadScenarioComparisonTimeMs = undefined;
  }

  function clearContextualCliqueAnalysis() {
    contextualCliqueResults = [];
    contextualCliqueHasRun = false;
    contextualCliqueError = "";
    contextualCliqueTimeMs = undefined;
  }

  function clearContextualCliqueResultAndFocus() {
    clearContextualCliqueAnalysis();
    clearGraphAnalysisFocus();
  }

  async function runContextualClique(request: { selectedGroup: string; enumerateAllOptima: boolean }) {
    if (solverRunning) return;
    lastGraph2DAnalysisKind = "contextualClique";
    clearGraphAnalysisFocus();
    clearContextualCliqueAnalysis();
    showSolverPanel = false;
    showStructuralPanel = false;
    showIntegrityPanel = false;
    showProvenanceScenarioAnalysisPanel = false;
    showMotifPanel = true;
    contextualCliqueGroup = typeof request?.selectedGroup === "string" ? request.selectedGroup : "";
    contextualCliqueEnumerateAllOptima = request?.enumerateAllOptima === true;

    if (!contextualCliqueConfig) {
      contextualCliqueError = "graphAnalysis.contextualClique non è configurato.";
      return;
    }
    if (!clingoWorker) {
      contextualCliqueError = "Il worker clingo non è disponibile.";
      return;
    }
    if (!contextualCliqueAvailable) {
      contextualCliqueError = contextualCliqueRequirementReasons.join(" ") || "I prerequisiti del task non sono soddisfatti.";
      return;
    }
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      contextualCliqueError = blockingDiagnostic.message;
      return;
    }
    if (!data?.nodes?.length) {
      contextualCliqueError = "La proiezione visibile corrente non contiene nodi da analizzare.";
      return;
    }

    try {
      const enumeration = resolveTaskEnumeration("contextualClique", {
        enumerateAllOptima: contextualCliqueEnumerateAllOptima
      });
      if (!enumeration) throw new Error("Il contratto del task non definisce un protocollo di enumerazione.");
      const { facts, reverseIndex, reverseSourceIndex, indexByNodeId } = buildAspFactsFromCurrentData();
      if (!facts.trim()) throw new Error("Non sono stati generati fatti ASP dalla proiezione visibile corrente.");

      const program = buildContextualCliqueProgram(contextualCliqueConfig, graphDirection, {
        selectedGroup: contextualCliqueGroup
      });
      const incidenceIndex = buildContextualCliqueIncidenceIndex(data, contextualCliqueConfig, indexByNodeId);
      const fullProgram = `${facts.trim()}\n\n${program}\n`;
      const options = [enumeration === "all-maximum" ? "--opt-mode=optN" : "--opt-mode=opt"];
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      solverRunning = true;
      const startedAt = performance.now();
      try {
        const result = await callClingo(fullProgram, options, taskTimeoutMs);
        contextualCliqueTimeMs = performance.now() - startedAt;
        if (result?.Result === "ERROR") {
          contextualCliqueError = result.Error || "Errore del worker clingo.";
          return;
        }
        if (result?.Result === "UNSATISFIABLE") {
          contextualCliqueResults = [];
          contextualCliqueHasRun = true;
          return;
        }
        if (!hasCompleteOptimalModelEnumeration(result)) {
          contextualCliqueError = `clingo non ha provato l'ottimo e completato l'enumerazione richiesta (${result?.Result ?? "risposta vuota"}).`;
          return;
        }
        const parsed = parseContextualCliqueResults(
          result?.Call?.[0]?.Witnesses,
          reverseIndex,
          reverseSourceIndex,
          incidenceIndex,
          contextualCliqueConfig.minimumSize ?? 3
        );
        if (parsed.length === 0) {
          contextualCliqueError = "clingo ha provato un ottimo, ma il witness non contiene supporti contestuali verificabili; i risultati sono stati scartati.";
          return;
        }
        const optimumSize = parsed[0].nodeIds.length;
        if (parsed.some((group) => group.nodeIds.length !== optimumSize)) {
          contextualCliqueError = "clingo ha restituito gruppi di cardinalità diverse nella stessa enumerazione degli ottimi; i risultati sono stati scartati.";
          return;
        }
        contextualCliqueResults = parsed;
        contextualCliqueHasRun = true;
      } finally {
        solverRunning = false;
      }
    } catch (error) {
      solverRunning = false;
      contextualCliqueResults = [];
      contextualCliqueError = error instanceof Error ? error.message : String(error);
    }
    persistCurrentAnalysisSession(false, true);
  }

  function highlightContextualClique(result: ContextualCliqueResult) {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const overlay = buildContextualCliqueGraph2DOverlay(result, data?.links ?? []);
    const nodeIds = new Set(overlay.nodeIds);
    highlightedEdgeIds = overlay.edgeIds;
    graph2DNodeAnnotations = overlay.nodeAnnotations;
    graph2DEdgeAnnotations = overlay.edgeAnnotations;
    graph2DOverlayResultLabel = overlay.resultLabel;
    graph2DOverlayCompletionLabel = contextualCliqueEnumerateAllOptima
      ? "Ottimo provato · enumerazione degli ottimi completa"
      : "Ottimo provato";
    showGraph2DExportPanel = true;
    refreshLinkVisuals();
    cliqueNodes = nodeIds;
    selectWitnessRoot([...nodeIds]);
    refreshNodeVisuals();
  }

  function showSignedTriadInGraph(triad: SignedTriadResult, isolateOtherEdges = false, completionLabel?: string) {
    const edgeIdentities = new Set(triad.dyads.flatMap((dyad) =>
      dyad.edgeRecords.map((record) => getStructuralEdgeIdentity({
        source: "",
        target: "",
        sourceId: record.id
      }))
    ));
    neighborhoodFocusNodeIds = null;
    neighborhoodFocusInfo = null;
    focusedSignedTriadEdgeIds = isolateOtherEdges ? edgeIdentities : null;
    focusedSignedTriadKey = isolateOtherEdges ? triad.nodeIds.join("\u0000") : "";
    refreshRenderedGraphData();
    cliqueNodes = new Set(triad.nodeIds);
    highlightedEdgeIds = edgeIdentities;
    graph2DNodeAnnotations = Object.fromEntries(triad.nodeIds.map((nodeId, index) => [
      nodeId,
      `Nodo ${index + 1} · ${triad.balanced ? "triade bilanciata" : "triade non bilanciata"}`
    ]));
    graph2DEdgeAnnotations = Object.fromEntries(triad.dyads.flatMap((dyad) => dyad.edgeRecords.map((record) => [
      `source:${record.id}`,
      dyad.polarity === "positive"
        ? { label: "Positiva", color: "#16834a" }
        : { label: "Negativa", color: "#b4233c", dashPattern: "dashed" }
    ])));
    graph2DHypotheticalLinks = [];
    graph2DOverlayResultLabel = triad.balanced
      ? "Triade firmata bilanciata · nodi e polarità evidenziati"
      : "Triade firmata non bilanciata · nodi e polarità evidenziati";
    graph2DOverlayCompletionLabel = completionLabel ?? `Enumerazione completa · ${signedTriadResults.length} triadi classificate`;
    refreshLinkVisuals();
    selectWitnessRoot(triad.nodeIds);
    refreshNodeVisuals();
  }

  function clearSignedTriadGraphFocus() {
    focusedSignedTriadEdgeIds = null;
    focusedSignedTriadKey = "";
    refreshLinkVisuals();
    refreshNodeVisuals();
    graph3D?.zoomToFit(graphTransitionDuration(500), 100);
  }

  function highlightTypedMotifCounterfactual(counterfactual: TypedMotifCounterfactual) {
    highlightTypedMotif(counterfactual.match);
    const addedEdges = counterfactual.addedEdges.map((edge) => ({
      ...edge,
      description: edge.patternIndexes.length
        ? `Relazioni richieste dal motivo: ${edge.patternIndexes.join(", ")}`
        : "Relazione richiesta dal motivo"
    }));
    graph2DHypotheticalLinks = buildGraph2DHypotheticalLinks("typed-motif", addedEdges, graphDirection);
    graph2DEdgeAnnotations = buildGraph2DHypotheticalEdgeAnnotations("typed-motif", addedEdges);
    graph2DOverlayResultLabel = `Controfattuale di motivo · ${counterfactual.label} · costo totale ${counterfactual.totalCost}`;
    graph2DOverlayCompletionLabel = "Ottimo di costo provato";
    showGraph2DExportPanel = true;
  }

  function clearGraph2DOverlay() {
    graph2DNodeAnnotations = {};
    graph2DEdgeAnnotations = {};
    graph2DHypotheticalLinks = [];
    graph2DOverlayResultLabel = "";
    graph2DOverlayCompletionLabel = "";
    graph2DCommunityPartitionIndex = -1;
    graph2DCommunityIndex = -1;
  }

  function setGraph2DProvenInfeasibility(analysisLabel: string, reason: string) {
    clearGraph2DOverlay();
    const summary = buildGraph2DInfeasibleAnalysisSummary(analysisLabel, reason);
    graph2DOverlayResultLabel = summary.resultLabel;
    graph2DOverlayCompletionLabel = summary.completionLabel;
  }

  function clearGraphAnalysisFocus() {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    highlightedEdgeIds = new Set();
    cliqueNodes = new Set();
    refreshLinkVisuals();
    refreshNodeVisuals();
  }

  function highlightTypedMotif(match: TypedMotifMatch, completionLabel?: string) {
    clearGraphNeighborhoodFocus();
    highlightedEdgeIds = new Set(match.supportingEdges.flatMap((edge) => edge.edgeIds));
    refreshLinkVisuals();
    cliqueNodes = new Set(match.nodeIds);
    graph2DNodeAnnotations = Object.fromEntries(Object.entries(match.roles).map(([role, assignment]) => [
      assignment.nodeId,
      `Ruolo ${role}`
    ]));
    graph2DEdgeAnnotations = {};
    graph2DOverlayCompletionLabel = "";
    graph2DHypotheticalLinks = [];
    graph2DOverlayResultLabel = "Motivo tipizzato · ruoli sui nodi";
    if (completionLabel) {
      graph2DOverlayCompletionLabel = completionLabel;
    } else if (motifHasRun) {
      graph2DOverlayCompletionLabel = `Enumerazione completa · ${motifMatches.length} istanze`;
    }
    selectWitnessRoot(match.nodeIds);
    refreshNodeVisuals();
  }

  function inspectProvenanceMotifWitness(request: { scenarioId: string; match: TypedMotifMatch }) {
    if (solverRunning || !request || !provenanceScenarios.some((scenario: any) => scenario.id === request.scenarioId) ||
      !request.match || !Array.isArray(request.match.supportingEdges)) return;
    setProvenanceScenario(request.scenarioId);
    showMotifPanel = false;
    highlightTypedMotif(request.match, buildGraph2DScenarioComparisonCompletionLabel({
      analysisLabel: "scenari",
      scenarioCount: motifScenarioComparison?.scenarios.length ?? 0,
      error: motifScenarioComparisonError
    }));
  }

  function inspectSignedTriadScenarioWitness(request: { scenarioId: string; triad: SignedTriadResult }) {
    if (solverRunning || !request || !provenanceScenarios.some((scenario: any) => scenario.id === request.scenarioId) ||
      !request.triad || !Array.isArray(request.triad.dyads) || request.triad.dyads.length !== 3) return;
    setProvenanceScenario(request.scenarioId);
    showMotifPanel = false;
    showSignedTriadInGraph(request.triad, false, buildGraph2DScenarioComparisonCompletionLabel({
      analysisLabel: "scenari",
      scenarioCount: signedTriadScenarioComparison?.scenarios.length ?? 0,
      error: signedTriadScenarioComparisonError
    }));
  }

  function highlightTypedMotifNearMatch(match: TypedMotifNearMatch) {
    clearGraphNeighborhoodFocus();
    const nodeIds = Object.values(match.roles).map((role) => role.nodeId);
    highlightedEdgeIds = new Set([
      ...match.supportingEdges.flatMap((edge) => edge.edgeIds),
      ...match.violatedAbsencePatterns.flatMap((pattern) => pattern.edgeIds)
    ]);
    refreshLinkVisuals();
    cliqueNodes = new Set(nodeIds);
    graph2DNodeAnnotations = Object.fromEntries(Object.entries(match.roles).map(([role, assignment]) => [
      assignment.nodeId,
      `Ruolo ${role}`
    ]));
    graph2DEdgeAnnotations = {};
    graph2DOverlayCompletionLabel = "";
    graph2DHypotheticalLinks = match.missingPatterns.flatMap((pattern) => {
      const source = match.roles[pattern.sourceRole]?.nodeId;
      const target = match.roles[pattern.targetRole]?.nodeId;
      if (!source || !target) return [];
      const id = `hypothetical:${match.templateId}:${pattern.index}:${source}:${target}`;
      return [{
        source,
        target,
        sourceId: id,
        type: pattern.edgeType,
        hypothetical: true,
        analysis: { id, type: pattern.edgeType, direction: graphDirection, hypothetical: true }
      }];
    });
    graph2DOverlayResultLabel = graph2DHypotheticalLinks.length
      ? "Motivo incompleto · linee tratteggiate = relazioni mancanti"
      : "Motivo quasi corrispondente · ruoli sui nodi";
    graph2DOverlayCompletionLabel = "Ottimo lessicografico provato";
    selectWitnessRoot(nodeIds);
    refreshNodeVisuals();
  }

  function highlightIntegrityViolation(violation: IntegrityViolation) {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const sourceNodes = Array.isArray(originalData?.nodes) ? originalData.nodes : [];
    const sourceLinks = Array.isArray(originalData?.links) ? originalData.links : [];
    const visualization = buildIntegrityViolationVisualization(violation, sourceNodes, sourceLinks, edgeProvenanceBySourceId);
    graph2DNodeAnnotations = visualization.nodeAnnotations;
    graph2DEdgeAnnotations = visualization.edgeAnnotations;
    graph2DOverlayResultLabel = visualization.resultLabel;
    graph2DOverlayCompletionLabel = `Enumerazione completa · ${integrityResults.length} violazioni`;
    highlightedEdgeIds = new Set(visualization.edgeIds);
    refreshLinkVisuals();
    const nodeIds = visualization.nodeIds;
    cliqueNodes = new Set(nodeIds);
    selectWitnessRoot(nodeIds);
    refreshNodeVisuals();
  }

  function highlightIntegrityRepairProposal(proposal: IntegrityRepairProposal) {
    if (!proposal) return;
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const visualization = buildIntegrityRepairVisualization(
      proposal,
      data?.nodes ?? [],
      data?.links ?? [],
      edgeProvenanceBySourceId
    );
    graph2DNodeAnnotations = visualization.nodeAnnotations;
    graph2DEdgeAnnotations = visualization.edgeAnnotations;
    graph2DOverlayResultLabel = visualization.resultLabel;
    graph2DOverlayCompletionLabel = visualization.completionLabel;
    highlightedEdgeIds = new Set(visualization.edgeIds);
    cliqueNodes = new Set(visualization.nodeIds);
    selectWitnessRoot(visualization.nodeIds);
    refreshLinkVisuals();
    refreshNodeVisuals();
    showGraph2DExportPanel = true;
  }

  function highlightStructuralCounterfactual(request: {
    proposal: { totalCost: number; addedEdges?: Array<{ id: string; sourceNodeId: string; targetNodeId: string; edgeType?: string; cost?: number }>; path?: { edgeIdsByStep?: string[][] } };
    nodeIds: string[];
    title: string;
  }) {
    if (!request || !Array.isArray(request.nodeIds)) return;
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const nodeIds = [...new Set(request.nodeIds.map(String))].filter((nodeId) => getNodeById(nodeId));
    const addedEdges = Array.isArray(request.proposal?.addedEdges) ? request.proposal.addedEdges : [];
    const analysisId = request.title.toLowerCase().includes("cammino") ? "typed-path" : "structural-completion";
    graph2DHypotheticalLinks = buildGraph2DHypotheticalLinks(analysisId, addedEdges, graphDirection);
    graph2DEdgeAnnotations = buildGraph2DHypotheticalEdgeAnnotations(analysisId, addedEdges);
    const pathEdgeIds = request.proposal?.path?.edgeIdsByStep?.flat() ?? [];
    for (const edgeId of pathEdgeIds) {
      graph2DEdgeAnnotations[edgeId] = { label: "Arco osservato del cammino", color: "#2563eb" };
    }
    graph2DNodeAnnotations = Object.fromEntries(nodeIds.map((nodeId, index) => [
      nodeId,
      request.title.toLowerCase().includes("cammino") ? `Passo ${index + 1} del cammino` : "Nodo del testimone controfattuale"
    ]));
    graph2DOverlayResultLabel = `${request.title} · costo minimo ${request.proposal.totalCost}`;
    graph2DOverlayCompletionLabel = "Ottimo di costo provato";
    highlightedEdgeIds = new Set(pathEdgeIds);
    cliqueNodes = new Set(nodeIds);
    selectWitnessRoot(nodeIds);
    refreshLinkVisuals();
    refreshNodeVisuals();
    showGraph2DExportPanel = true;
  }

  function highlightCommunityTopologyCounterfactual(result: CommunityTopologyCounterfactualResult) {
    if (!result || !Array.isArray(result.selectedEdits) || !Array.isArray(result.nodeIds)) return;
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const overlay = buildCommunityTopologyGraph2DOverlay(
      result,
      (data?.nodes ?? []) as Graph2DNodeInput[],
      (data?.links ?? []) as Graph2DLinkInput[]
    );
    graph2DHypotheticalLinks = overlay.hypotheticalLinks;
    graph2DEdgeAnnotations = overlay.edgeAnnotations;
    graph2DNodeAnnotations = overlay.nodeAnnotations;
    graph2DOverlayResultLabel = overlay.resultLabel;
    graph2DOverlayCompletionLabel = overlay.completionLabel;
    highlightedEdgeIds = overlay.edgeIds;
    cliqueNodes = new Set(overlay.nodeIds);
    selectWitnessRoot(overlay.nodeIds);
    refreshLinkVisuals();
    refreshNodeVisuals();
    showGraph2DExportPanel = true;
  }
  async function runIntegrityRepair() {
    if (solverRunning || !clingoWorker || !integrityHasRun || integrityResults.length === 0) return;
    clearGraph2DOverlay();
    integrityRepairError = "";
    integrityRepairProposal = null;
    const blockingDiagnostic = graphDiagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (blockingDiagnostic) {
      integrityRepairError = blockingDiagnostic.message;
      return;
    }

    try {
      const repairSuggestions = GRAPH_CONFIG.graphIntegrity?.repairSuggestions;
      const edgeIntervalReplacements = Array.isArray(repairSuggestions?.edgeIntervalReplacements)
        ? repairSuggestions.edgeIntervalReplacements
        : [];
      const additionalTemporalValues = edgeIntervalReplacements.flatMap((candidate: any) => [
        candidate?.expectedFrom,
        candidate?.expectedTo,
        candidate?.from,
        candidate?.to
      ]);
      const provenanceProjectedData = getProvenanceProjectedData();
      const { facts, reverseEdgeIndex, reverseSourceIndex, indexByNodeId, temporalEncoding } =
        buildAppAspFactsFromGraph(provenanceProjectedData, additionalTemporalValues, {
          includeRawTemporalValues: edgeIntervalReplacements.length > 0
        });
      if (repairSuggestions?.nodeTypeReplacements?.length && !GRAPH_CONFIG.graphMapping?.node?.typeField) {
        throw new TypeError("Le sostituzioni di tipo nodo richiedono graphMapping.node.typeField");
      }
      if (repairSuggestions?.edgeTypeReplacements?.length && !GRAPH_CONFIG.graphMapping?.edge?.typeField) {
        throw new TypeError("Le sostituzioni di tipo arco richiedono graphMapping.edge.typeField");
      }
      if (repairSuggestions?.edgeIntervalReplacements?.length &&
        (!GRAPH_CONFIG.graphMapping?.edge?.validity?.fromField || !GRAPH_CONFIG.graphMapping?.edge?.validity?.toField)) {
        throw new TypeError("Le sostituzioni d'intervallo richiedono graphMapping.edge.validity.fromField e toField");
      }
      validateGraphIntegrityAttributeMappings(
        GRAPH_CONFIG.graphIntegrity as GraphIntegrityConstraints,
        new Set(Object.keys(GRAPH_CONFIG.graphMapping?.node?.attributes ?? {})),
        new Set(Object.keys(GRAPH_CONFIG.graphMapping?.edge?.attributes ?? {}))
      );
      const {
        program,
        costByEdgeId,
        attributeCandidateById,
        edgeAttributeCandidateById,
        nodeAttributeReplacementById,
        edgeAttributeReplacementById,
        nodeTypeReplacementById,
        edgeTypeReplacementById,
        edgeIntervalReplacementById
      } = buildMinimumIntegrityRepairProgram(
        GRAPH_CONFIG.graphIntegrity as GraphIntegrityConstraints,
        graphDirection,
        reverseEdgeIndex,
        indexByNodeId,
        reverseSourceIndex,
        new Set(Object.keys(GRAPH_CONFIG.graphMapping?.node?.attributes ?? {})),
        new Set(Object.keys(GRAPH_CONFIG.graphMapping?.edge?.attributes ?? {})),
        temporalEncoding
      );
      const fullProgram = `${facts.trim()}\n\n${program.trim()}\n`;
      const taskTimeoutMs = resolveSolverTaskTimeoutMs(GRAPH_CONFIG.solver?.taskTimeoutMs);
      solverRunning = true;
      integrityRepairRunning = true;
      const result = await callClingo(fullProgram, ["--opt-mode=opt"], taskTimeoutMs);
      if (result?.Result === "ERROR") {
        integrityRepairError = result.Error || "Errore del worker clingo.";
        return;
      }
      if (result?.Result === "UNSATISFIABLE") {
        integrityRepairError = "Nessuna riparazione è possibile usando soltanto le azioni autorizzate e i vincoli attuali.";
        return;
      }
      if (result?.Result !== "OPTIMUM FOUND") {
        integrityRepairError = `Il solver non ha provato una proposta minima: ${result?.Result ?? "risposta vuota"}.`;
        return;
      }
      integrityRepairProposal = parseIntegrityRepairProposal(
        result?.Call?.[0]?.Witnesses,
        reverseEdgeIndex,
        costByEdgeId,
        attributeCandidateById,
        edgeAttributeCandidateById,
        nodeAttributeReplacementById,
        edgeAttributeReplacementById,
        nodeTypeReplacementById,
        edgeTypeReplacementById,
        edgeIntervalReplacementById
      );
      if (!integrityRepairProposal) {
        integrityRepairError = "Il solver non ha restituito una proposta di riparazione leggibile.";
      }
    } catch (error) {
      integrityRepairError = error instanceof Error ? error.message : String(error);
    } finally {
      solverRunning = false;
      integrityRepairRunning = false;
      persistCurrentAnalysisSession(false, true);
    }
  }

  // ---------------- LIFECYCLE ----------------
  let destroyed = false;

  onMount(() => {
    if (!sessionRestored && GRAPH_CONFIG.features?.nodeLabelsVisibleByDefault !== undefined) {
      nodeLabelsVisible = GRAPH_CONFIG.features.nodeLabelsVisibleByDefault !== false;
    }
    motionPreferenceQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    motionPreferenceChangeHandler = () => {
      reducedMotionPreference = motionPreferenceQuery?.matches === true;
      const motionSettings = getGraphMotionSettings(reducedMotionPreference, data?.nodes?.length ?? 0);
      graph3D
        ?.warmupTicks(motionSettings.warmupTicks)
        .cooldownTicks(motionSettings.cooldownTicks)
        .cooldownTime(motionSettings.cooldownTime);
    };
    motionPreferenceChangeHandler();
    motionPreferenceQuery?.addEventListener("change", motionPreferenceChangeHandler);

    toolbarHeight = toolbarElement?.offsetHeight ?? 0;
    toolbarResizeObserver = new ResizeObserver(() => {
      toolbarHeight = toolbarElement?.offsetHeight ?? 0;
    });
    if (toolbarElement) toolbarResizeObserver.observe(toolbarElement);

    (async () => {
      const ForceGraph3D = (await import("3d-force-graph")).default;

      // Il componente può essere smontato prima che l'import termini
      // (es. "Apply JSON" ripetuto nella Sandbox).
      if (destroyed) return;

      if (solverEnabled) initializeClingoWorker();

      const motionSettings = getGraphMotionSettings(reducedMotionPreference, data?.nodes?.length ?? 0);
      graph3D = new ForceGraph3D(container)
        .nodeId("id")
        .nodeLabel("label")
        .nodeVisibility(isGraphDisplayNodeVisible)
        .backgroundColor(GRAPH_CONFIG.graph.backgroundColor)
        .nodeOpacity(GRAPH_CONFIG.graph.nodeOpacity)
        .linkOpacity(GRAPH_CONFIG.graph.linkOpacity)
        .linkVisibility(isGraphDisplayLinkVisible)
        .linkColor(getDisplayLinkColor)
        .linkWidth((link: any) => {
          const baseWidth = Number(GRAPH_CONFIG.graph.linkWidth) || 0.4;
          if (highlightedEdgeIds.size === 0) return baseWidth;
          return graphDisplayLinkMatchesIdentities(link, highlightedEdgeIds, (edge: GraphDisplayLink) => getStructuralEdgeIdentity(edge))
            ? Math.max(baseWidth * 4, 1.5)
            : Math.max(baseWidth * 0.5, 0.2);
        })
        .linkDirectionalArrowLength((link: any) =>
          link.analysis?.direction === "directed" ? 4 : 0
        )
        .linkDirectionalArrowRelPos(0.96)
        .warmupTicks(motionSettings.warmupTicks)
        .cooldownTicks(motionSettings.cooldownTicks)
        .cooldownTime(motionSettings.cooldownTime);

      const graphNavigationInfo = container.querySelector<HTMLElement>(".scene-nav-info");
      if (graphNavigationInfo) {
        graphNavigationInfo.textContent = "Trascina per ruotare · Usa Vista per lo zoom";
        graphNavigationInfo.lang = "it";
      }

      if (aggregateParallelEdgesForDisplay || edgeTypeColorsConfigured) {
        graph3D.linkLabel(getDisplayLinkLabel);
      }

      graphResizeObserver = new ResizeObserver(() => {
        if (!graph3D || !container) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (width > 0 && height > 0) graph3D.width(width).height(height);
      });
      graphResizeObserver.observe(container);

      graph3D.nodeThreeObjectExtend(false);
      rebuildNodeObjects();

      graph3D.onNodeClick((node: any) => {
        showSuggestions = false;
        selectRoot(node.id);
      });
      graph3D.onNodeHover((node: any) => {
        hoveredGraphNodeId = node ? String(node.id) : null;
        refreshNodeLabelLayout();
      });
      nodeLabelLayoutInterval = setInterval(refreshNodeLabelLayout, 160);

      const F = GRAPH_CONFIG.forces;
      graph3D
        .forceEngine("d3")
        .d3Force("charge", forceManyBody().strength(F.charge))
        .d3Force("center", forceCenter())
        .d3Force("link", forceLink().distance(F.linkDistance).strength(F.linkStrength));

      const nodeCollisionRadius = Number(F.nodeCollisionRadius);
      if (Number.isFinite(nodeCollisionRadius) && nodeCollisionRadius > 0) {
        graph3D.d3Force(
          "collision",
          forceCollide(nodeCollisionRadius).strength(1).iterations(2)
        );
      }

      if (fitGraphToViewEnabled) {
        graph3D
          .onEngineTick(() => {
            graphLayoutRunning = true;
          })
          .onEngineStop(() => {
            graphLayoutRunning = false;
            if (fitOnEngineStop) {
              fitOnEngineStop = false;
              fitGraphToView();
            }
          });
      }

      loadDataset();
      restoreAnalysisSession();
    })();
  });

  onDestroy(() => {
    destroyed = true;
    if (motionPreferenceQuery && motionPreferenceChangeHandler) {
      motionPreferenceQuery.removeEventListener("change", motionPreferenceChangeHandler);
    }
    graphResizeObserver?.disconnect();
    toolbarResizeObserver?.disconnect();
    if (nodeLabelLayoutInterval !== null) clearInterval(nodeLabelLayoutInterval);
    nodeLabelLayoutInterval = null;
    graph3D?._destructor?.();
    clingoWorkerLease?.release();
    clingoWorkerLease = null;
    clingoWorker = null;
  });
</script>

<div
  class:with-json-editor={JsonEditor && jsonEditorProps?.open}
  class:projection-controls-open={showProjectionControls}
  class:analysis-panel-open={Boolean(activeAnalysisPanel())}
  class:timeline-enabled={timelineControlEnabled}
  class="app-root"
  style="
  --info-top: {UI.infoPanel.top}px;
--info-right: {UI.infoPanel.right}px;
--info-width: {UI.infoPanel.width}px;
--info-max-height: {UI.infoPanel.maxHeight}px;
--info-padding: {UI.infoPanel.padding}px;
--info-radius: {UI.infoPanel.borderRadius}px;
--info-bg: {UI.infoPanel.background};
--info-z: {UI.infoPanel.zIndex};

--info-title-size: {UI.infoPanel.title.fontSize}px;

--modal-backdrop: {UI.infoPanel.modal.backdrop};
--modal-z: {UI.infoPanel.modal.zIndex};

--modal-card-width: {UI.infoPanel.modal.cardWidth};
--modal-card-max-height: {UI.infoPanel.modal.cardMaxHeight};
--modal-card-bg: {UI.infoPanel.modal.cardBg};
--modal-card-radius: {UI.infoPanel.modal.cardRadius}px;

--modal-header-size: {UI.infoPanel.modal.headerFontSize}px;
--modal-header-border: {UI.infoPanel.modal.headerBorder};

--modal-body-padding: {UI.infoPanel.modal.bodyPadding}px;
--modal-line-height: {UI.infoPanel.modal.lineHeight};

--modal-footer-padding: {UI.infoPanel.modal.footerPadding};

--modal-close-bg: {UI.infoPanel.modal.closeBg};
--modal-close-color: {UI.infoPanel.modal.closeColor};
--solver-top: {UI.solverPanel.top}px;
--solver-right: {UI.solverPanel.right}px;
--solver-width: {UI.solverPanel.width}px;
--solver-max-height: {UI.solverPanel.maxHeight};
--mobile-status-reserve: 48px;
--mobile-filter-timeline-reserve: {timelineControlEnabled ? "176px" : "0px"};
--desktop-timeline-reserve: {timelineControlEnabled ? "132px" : "0px"};
--solver-padding: {UI.solverPanel.padding}px;
--solver-radius: {UI.solverPanel.borderRadius}px;
--solver-bg: {UI.solverPanel.background};
--solver-shadow: {UI.solverPanel.shadow};
--solver-z: {UI.solverPanel.zIndex};
--solver-font-size: {UI.solverPanel.fontSize}px;

--solver-close-color: {UI.solverPanel.header.closeColor};

--solver-meta-opacity: {UI.solverPanel.meta.opacity};
--solver-meta-gap: {UI.solverPanel.meta.gap}px;

--solver-selected-bg: {UI.solverPanel.selectedAnalysis.background};
--solver-selected-padding: {UI.solverPanel.selectedAnalysis.padding}px;
--solver-selected-radius: {UI.solverPanel.selectedAnalysis.radius}px;
--solver-selected-mt: {UI.solverPanel.selectedAnalysis.marginTop}px;

--solver-controls-gap: {UI.solverPanel.controls.gap}px;
--solver-controls-mt: {UI.solverPanel.controls.marginTop}px;
--solver-controls-mb: {UI.solverPanel.controls.marginBottom}px;
--solver-input-width: {UI.solverPanel.controls.inputWidth}px;

--solver-cliques-mt: {UI.solverPanel.cliques.marginTop}px;
--solver-group-gap: {UI.solverPanel.cliques.groupGap}px;

--solver-item-padding: {UI.solverPanel.cliques.item.padding};
--solver-item-mb: {UI.solverPanel.cliques.item.marginBottom}px;
--solver-item-bg: {UI.solverPanel.cliques.item.background};
--solver-item-hover: {UI.solverPanel.cliques.item.hover};
--solver-item-radius: {UI.solverPanel.cliques.item.radius}px;
--solver-item-font: {UI.solverPanel.cliques.item.fontSize}px;

--solver-badge-bg: {UI.solverPanel.cliques.badge.bg};
--solver-badge-color: {UI.solverPanel.cliques.badge.color};
--solver-badge-font: {UI.solverPanel.cliques.badge.fontSize}px;
--solver-badge-padding: {UI.solverPanel.cliques.badge.padding};
--solver-badge-radius: {UI.solverPanel.cliques.badge.radius}px;
--history-left: {UI.historyPanel.left}px;
--history-bottom: {UI.historyPanel.bottom}px;
--history-max-width: {UI.historyPanel.maxWidth};
--history-padding: {UI.historyPanel.padding}px;
--history-radius: {UI.historyPanel.borderRadius}px;
--history-bg: {UI.historyPanel.background};
--history-z: {UI.historyPanel.zIndex};
--history-font: {UI.historyPanel.fontSize}px;
--history-color: {UI.historyPanel.textColor};

--history-header-mb: {UI.historyPanel.header.marginBottom}px;

--history-clear-bg: {UI.historyPanel.clearButton.background};
--history-clear-radius: {UI.historyPanel.clearButton.radius}px;
--history-clear-size: {UI.historyPanel.clearButton.size}px;

--history-gap: {UI.historyPanel.crumbs.gap}px;

--history-crumb-bg: {UI.historyPanel.crumb.background};
--history-crumb-hover: {UI.historyPanel.crumb.hover};
--history-crumb-padding: {UI.historyPanel.crumb.padding};
--history-crumb-radius: {UI.historyPanel.crumb.radius}px;
--history-crumb-max: {UI.historyPanel.crumb.maxWidth}px;

--history-sep-opacity: {UI.historyPanel.separator.opacity};
  --body-bg: {UI.body.background};
--body-color: {UI.body.textColor};
--body-font: {UI.body.fontFamily};

--toolbar-bg: {UI.toolbar.background};
--toolbar-z: {UI.toolbar.zIndex};

--zoom-margin-left: {UI.zoom.marginLeft}px;

--filter-bg: {UI.filterCard.background};
--filter-z: {UI.filterCard.zIndex};
--filter-max-width: {UI.filterCard.maxWidth}px;
--filter-max-height: {UI.filterCard.maxHeight};

--autocomplete-bg: {UI.autocomplete.background};
--autocomplete-radius: {UI.autocomplete.borderRadius}px;
--autocomplete-shadow: {UI.autocomplete.shadow};
--autocomplete-z: {UI.autocomplete.zIndex};
--autocomplete-offset-y: {UI.autocomplete.offsetY}px;
    --toolbar-top: {UI.toolbar.top}px;
    --toolbar-left: {UI.toolbar.left}px;
--toolbar-height: {toolbarHeight}px;
    --toolbar-gap: {UI.toolbar.spacing}px;
    --toolbar-padding: {UI.toolbar.padding};
    --toolbar-radius: {UI.toolbar.borderRadius}px;

    --search-width: {UI.search.width}px;
    --search-max-width: {UI.search.maxWidth};

    --zoom-gap: {UI.zoom.gap}px;

    --filter-top: {UI.filterCard.top}px;
    --filter-left: {UI.filterCard.left}px;
    --filter-padding: {UI.filterCard.padding}px;
    --filter-radius: {UI.filterCard.borderRadius}px;
    --filter-font-size: {UI.filterCard.fontSize}px;

    --autocomplete-item-padding: {UI.autocomplete.itemPadding};
    --autocomplete-font-size: {UI.autocomplete.fontSize}px;
  "
>
  {#if graphDiagnostics.length > 0}
    <div
      class="graph-data-diagnostics"
      class:error={graphDiagnostics.some((diagnostic) => diagnostic.severity === "error")}
      role="alert"
      aria-live="polite"
    >
      <strong>Verifica del grafo</strong>
      <ul>
        {#each graphDiagnostics as diagnostic}
          <li>{diagnostic.message}</li>
        {/each}
      </ul>
      {#if JsonEditor}
        <button class="diagnostics-action" type="button" on:click={openDataPanel}>Apri Dati e mapping</button>
      {/if}
    </div>
  {/if}

  <details class="graph-capabilities">
    <summary>Analisi disponibili</summary>
    <div class="capability-content">
      <p>Le analisi qui sotto dipendono dai campi riconosciuti in questo grafo. Per aggiungere un campo mancante, apri <strong>Dati</strong> e aggiorna la mappatura.</p>
      <ul class="analysis-readiness-list" aria-label="Stato dei prerequisiti per analisi">
        {#each analysisTaskRows as row (row.label)}
          <li class:available={row.available}>
            <strong>{row.label}</strong>
            <span>{row.available ? "Pronta" : "Da configurare"}</span>
            {#if !row.available && row.reasons.length > 0}<small>{row.reasons.join(" ")}</small>{/if}
          </li>
        {/each}
      </ul>
      {#if analysisTaskRows.some((row) => !row.available) && JsonEditor}
        <button class="diagnostics-action" type="button" on:click={openDataPanel}>Apri Dati e mapping</button>
      {/if}
      <ul class="capability-list">
        {#each capabilityRows as [key, label]}
          {@const status = graphCapabilities[key]}
          <li class:available={status?.available}>
            <span>{label}: {status?.available ? "disponibile" : "non disponibile"}</span>
            {#if !status?.available && status?.reason}
              <small>{status.reason}</small>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="future-task-readiness">
        <p>Motivi tipizzati: {typedMotifDataReadiness.available ? "campi necessari disponibili" : "serve mappare i campi indicati"}</p>
        {#if !typedMotifDataReadiness.available}
          <ul class="task-readiness">
            {#each typedMotifDataReadiness.reasons as reason}<li>{reason}</li>{/each}
          </ul>
        {/if}
        <p>Motivi temporali: {temporalMotifDataReadiness.available ? "campi necessari disponibili" : "serve mappare intervalli temporali validi"}</p>
        {#if !temporalMotifDataReadiness.available}
          <ul class="task-readiness">
            {#each temporalMotifDataReadiness.reasons as reason}<li>{reason}</li>{/each}
          </ul>
        {/if}
      </div>
    </div>
  </details>

  {#if JsonEditor}
    <svelte:component
      this={JsonEditor}
      bind:this={jsonEditorComponent}
      {...jsonEditorProps}
    />
  {/if}
  <div bind:this={container} class="graph"></div>

  {#if JsonEditor && (data?.nodes?.length ?? 0) === 0}
    <section class="empty-graph-state" aria-labelledby="empty-graph-title">
      <div class="empty-graph-card">
        <p class="empty-graph-eyebrow">KLIQUEASP · ANALISI DI RETI</p>
        <h1 id="empty-graph-title">Apri una rete per iniziare</h1>
        <p>Carica un dataset JSON o un progetto, controlla i campi riconosciuti e applica il grafo quando è pronto.</p>
        <div class="empty-graph-actions">
          <button type="button" class="empty-graph-primary" on:click={openDataPanel}>Carica i miei dati</button>
          <button type="button" on:click={openProjectPickerFromEmptyState}>Apri un progetto</button>
          {#if jsonEditorProps?.onReset}
            <button type="button" class="empty-graph-example" on:click={() => jsonEditorProps.onReset()}>Prova un esempio</button>
          {/if}
        </div>
        <small>Il mapping rapido riconosce gli ID e gli estremi più comuni. Le opzioni avanzate restano disponibili nel pannello Dati.</small>
      </div>
    </section>
  {/if}

  {#if aggregateParallelEdgesForDisplay || edgeTypeColorsConfigured || neighborhoodFocusInfo}
    <div class="graph-visualization-note" role="status" aria-live="polite">
      {#if neighborhoodFocusInfo}
        {#if neighborhoodFocusInfo.nodeCount >= (data?.nodes?.length ?? 0)}
          Il focus include tutti i {neighborhoodFocusInfo.nodeCount} nodi filtrati: nessun nodo escluso. {neighborhoodFocusInfo.recordCount} record in {neighborhoodFocusInfo.renderedLinkCount} linee. Analisi ed export usano l'intera proiezione filtrata.
        {:else}
          Vicinato isolato: {neighborhoodFocusInfo.recordCount} record in {neighborhoodFocusInfo.renderedLinkCount} linee, su {data?.links?.length ?? 0} record filtrati. Analisi ed export usano l'intera proiezione filtrata.
        {/if}
      {:else if aggregateParallelEdgesForDisplay}
        Vista aggregata: {data?.links?.length ?? 0} record di contatto in {graphDisplayLinkCount} linee. Le analisi mantengono i record distinti; passa su una linea per vedere gli ID.
      {:else}
        I colori degli archi seguono i tipi di relazione dichiarati nella legenda.
      {/if}
      {#if graphEdgeTypeLegend.length > 0}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (the scrollable legend must accept keyboard focus so users can scroll it) -->
        <ul class="graph-edge-type-legend" aria-label="Legenda dei tipi di arco" tabindex="0">
          {#each visibleGraphEdgeTypeEntries as entry (entry.type)}
            <li>
              <span class="graph-edge-type-swatch" style={`background-color: ${entry.color};`}></span>
              <span>{entry.type}</span>
            </li>
          {/each}
        </ul>
        <ResultListPager
          total={graphEdgeTypeLegend.length}
          visible={visibleGraphEdgeTypeEntries.length}
          pageSize={GRAPH_EDGE_TYPE_LEGEND_PAGE_SIZE}
          label="tipi di arco"
          showMore={() => visibleGraphEdgeTypeLimit += GRAPH_EDGE_TYPE_LEGEND_PAGE_SIZE}
        />
      {/if}
    </div>
  {/if}

<!-- TOOLBAR -->
<div bind:this={toolbarElement} class="toolbar">
  {#if JsonEditor}
    <button class="toolbar-button" type="button" on:click={openDataPanel} title="Carica dati, apri un progetto o modifica il mapping">
      Dati
    </button>
    {#if jsonEditorProps?.projectDirty}
      <span class="toolbar-export-status" role="status" title="La sessione è salvata nel browser. Esporta il progetto per creare un file riapribile.">Modifiche da esportare</span>
    {/if}
  {/if}

  {#if solverEnabled}
    <details class="toolbar-menu" bind:this={analysisMenuElement}>
      <summary aria-labelledby="analysis-menu-label"><span id="analysis-menu-label">Analisi</span> <span class="menu-chevron" aria-hidden="true">⌄</span></summary>
      <div class="menu-content" role="group" aria-label="Scegli un'analisi">
        <div class="menu-group">
          <span>Gruppi densi</span>
          <button type="button" class="menu-primary" aria-labelledby="analysis-clique-label" disabled={solverRunning || clingoWorkerStatus === "initializing" || (clingoWorkerStatus !== "error" && !cliqueDataReadiness.available)} on:click={launchMaximumCliqueOrRestart}>
            <span id="analysis-clique-label">{solverRunning ? "Calcolo in corso…" : clingoWorkerStatus === "error" ? "Riavvia analisi" : "Clique massima"}</span>
          </button>
          {#if !cliqueDataReadiness.available && clingoWorkerStatus !== "error"}
            <p class="menu-requirement">{cliqueDataReadiness.reasons.join(" ")}</p>
            {#if JsonEditor}
              <button type="button" class="menu-data-action" aria-label="Apri Dati e mapping" on:click={openDataPanel}>Apri Dati e mapping</button>
            {/if}
          {:else if clingoWorkerStatus !== "error"}
            <p class="menu-readiness available">Prerequisiti disponibili</p>
          {/if}
          <button type="button" aria-label="k-plex, k-core e struttura…" disabled={solverRunning} on:click={() => openAnalysisPanel("structural")}>
            k-plex, k-core e struttura…
          </button>
          <p class="menu-readiness" class:available={structuralMenuReadiness.blockedCount === 0} class:blocked={structuralMenuReadiness.blockedCount > 0}>
            {structuralMenuReadiness.availableCount}/{structuralMenuReadiness.totalCount} analisi pronte
            {#if structuralMenuReadiness.blockedCount > 0} · {structuralMenuReadiness.blockedCount} da configurare{/if}
          </p>
          {#if structuralMenuReadiness.blockedCount > 0}
            <details class="menu-blockers">
              <summary aria-label="Requisiti mancanti">Requisiti mancanti</summary>
              <ul>
                {#each structuralMenuReadiness.blockedTasks as task (task.label)}
                  <li><strong>{task.label}</strong><span>{task.reasons.join(" ") || "Controlla i parametri nel pannello."}</span></li>
                {/each}
              </ul>
            </details>
            {#if JsonEditor}
              <button type="button" class="menu-data-action" aria-label="Apri Dati e mapping" on:click={openDataPanel}>Apri Dati e mapping</button>
            {/if}
          {/if}
        </div>
        {#if motifTemplates.length > 0 || signedTriadConfig || contextualCliqueConfig}
          <div class="menu-group">
            <span>Motivi e relazioni</span>
            <button type="button" aria-label="Motivi, triadi e gruppi contestuali…" disabled={solverRunning} on:click={() => openAnalysisPanel("motif")}>
              Motivi, triadi e gruppi contestuali…
            </button>
            <p class="menu-readiness" class:available={motifMenuReadiness.blockedCount === 0} class:blocked={motifMenuReadiness.blockedCount > 0}>
              {motifMenuReadiness.availableCount}/{motifMenuReadiness.totalCount} analisi pronte
              {#if motifMenuReadiness.blockedCount > 0} · {motifMenuReadiness.blockedCount} da configurare{/if}
            </p>
            {#if motifMenuReadiness.blockedCount > 0}
              <details class="menu-blockers">
              <summary aria-label="Requisiti mancanti">Requisiti mancanti</summary>
                <ul>
                  {#each motifMenuReadiness.blockedTasks as task (task.label)}
                    <li><strong>{task.label}</strong><span>{task.reasons.join(" ") || "Controlla i parametri nel pannello."}</span></li>
                  {/each}
                </ul>
              </details>
              {#if JsonEditor}
              <button type="button" class="menu-data-action" aria-label="Apri Dati e mapping" on:click={openDataPanel}>Apri Dati e mapping</button>
              {/if}
            {/if}
          </div>
        {/if}
        {#if integrityConfigured}
          <div class="menu-group">
            <span>Qualità dei dati</span>
            <button type="button" aria-label="Verifica e riparazione…" disabled={solverRunning} on:click={() => openAnalysisPanel("integrity")}>
              Verifica e riparazione…
            </button>
            <p class="menu-readiness" class:available={integrityDataReadiness.available} class:blocked={!integrityDataReadiness.available}>
              Verifica: {integrityDataReadiness.available ? "pronta" : "da configurare"}
            </p>
            {#if !integrityDataReadiness.available}
              <p class="menu-requirement">{integrityDataReadiness.reasons[0]}</p>
            {/if}
            <p class="menu-readiness" class:available={integrityRepairDataReadiness.available} class:blocked={!integrityRepairDataReadiness.available}>
              Riparazione: {integrityRepairDataReadiness.available ? "configurata; dopo la verifica delle violazioni" : "da configurare"}
            </p>
            {#if !integrityRepairDataReadiness.available}
              <details class="menu-blockers">
              <summary aria-label="Requisiti per la riparazione">Requisiti per la riparazione</summary>
                <ul>{#each integrityRepairDataReadiness.reasons as reason}<li><span>{reason}</span></li>{/each}</ul>
              </details>
              {#if JsonEditor}
              <button type="button" class="menu-data-action" aria-label="Apri Dati e mapping" on:click={openDataPanel}>Apri Dati e mapping</button>
              {/if}
            {/if}
          </div>
        {/if}
        {#if provenanceScenarios.length > 0}
          <div class="menu-group">
            <span>Scenari</span>
            <button
              type="button"
              aria-label={solverRunning && lastGraph2DAnalysisKind === "provenanceClique" ? "Confronto in corso…" : "Confronta clique massime"}
              disabled={solverRunning || provenanceCliqueComparisonBlocker !== ""}
              class:running={solverRunning && lastGraph2DAnalysisKind === "provenanceClique"}
              on:click={runProvenanceScenarioCliqueComparison}
            >
              {solverRunning && lastGraph2DAnalysisKind === "provenanceClique" ? "Confronto in corso…" : "Confronta clique massime"}
            </button>
            {#if provenanceCliqueComparisonBlocker && provenanceScenarios.length > 1}
              <p class="menu-requirement">{provenanceCliqueComparisonBlocker}</p>
            {/if}
            <p class="menu-readiness" class:available={provenanceScenarios.length > 1} class:blocked={provenanceScenarios.length < 2}>
              {provenanceScenarios.length} scenari dichiarati · {provenanceScenarios.length > 1 ? "confronti strutturali pronti" : "aggiungi un secondo scenario per confrontare"}
            </p>
            <p class="menu-readiness" class:available={provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds"} class:blocked={provenanceScenarioConfig?.worldAssumption !== "finite-exhaustive-worlds"}>
              Presenza in tutti i risultati: {provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds" ? "tutti gli scenari sono inclusi" : "indica se gli scenari elencati sono tutti quelli da considerare"}
            </p>
            {#if (provenanceScenarioConfig?.worldAssumption !== "finite-exhaustive-worlds" || provenanceScenarios.length < 2) && JsonEditor}
              <button type="button" class="menu-data-action" aria-label="Apri Dati e configurazione scenari" on:click={openDataPanel}>Apri Dati e configurazione scenari</button>
            {/if}
          </div>
        {:else if JsonEditor}
          <div class="menu-group">
            <span>Scenari</span>
            <p class="menu-readiness blocked">Configura scenari per confrontare la rete tra proiezioni dichiarate.</p>
            <button type="button" class="menu-data-action" aria-label="Configura scenari" on:click={openDataPanel}>Configura scenari</button>
          </div>
        {/if}
      </div>
    </details>
    {#if clingoWorkerStatus === "error"}
      <span class="solver-worker-status" role="status">Motore di analisi non disponibile</span>
    {/if}
  {/if}

  {#if filtersEnabled || provenanceScenarios.length > 0}
    <button class="toolbar-button" class:active={showProjectionControls} type="button" aria-expanded={showProjectionControls} on:click={() => { closeToolbarMenus(); showProjectionControls = !showProjectionControls; }}>
      Proiezione{#if activeProjectionLabels.length}<span class="active-count">{activeProjectionLabels.length}</span>{/if}
    </button>
  {/if}

  <div class="search-wrap">
    <input
      type="text"
      aria-label="Cerca un nodo"
      placeholder="Cerca un nodo…"
      bind:value={query}
      on:input={() => {
        searchMessage = "";
        rankCandidates(query);
      }}
      on:keydown={(e) => {
        if (e.key === "Enter") {
          showSuggestions = false;
          searchNode(query);
        }
        if (e.key === "Escape") showSuggestions = false;
      }}
      on:focus={() => suggestions.length > 0 && query.trim().length >= 2 && (showSuggestions = true)}
      on:blur={() => setTimeout(() => (showSuggestions = false), 120)}
    />

    {#if showSuggestions}
      <div class="autocomplete">
        {#each suggestions as s (s.id)}
          <button
            type="button"
            class="autocomplete-item"
            on:mousedown|preventDefault
            on:click={() => chooseSuggestion(s)}
          >{s.label}</button>
        {/each}
      </div>
    {:else if searchMessage}
      <div class="search-message" role="status">{searchMessage}</div>
    {/if}
  </div>

  <button class="toolbar-button search-action" type="button" on:click={() => { closeToolbarMenus(); showSuggestions = false; searchNode(query); }}>Cerca</button>

  <details class="toolbar-menu" bind:this={viewMenuElement}>
    <summary>Vista <span class="menu-chevron" aria-hidden="true">⌄</span></summary>
    <div class="menu-content view-menu" role="group" aria-label="Controlli della vista">
      {#if labelVisibilityToggleEnabled}
        <button type="button" on:click={() => { toggleNodeLabels(); closeToolbarMenus(); }}>{nodeLabelsVisible ? "Nascondi etichette" : "Mostra etichette"}</button>
        <p class="label-layout-hint">I nomi vicini si alternano per evitare sovrapposizioni; avvicina la vista o seleziona un nodo per leggerne altri.</p>
      {/if}
      {#if fitGraphToViewEnabled}
        <button type="button" on:click={() => { fitGraphToView(); closeToolbarMenus(); }}>Adatta alla rete</button>
      {/if}
      <div class="zoom-menu-row" aria-label="Zoom">
        <button type="button" aria-label="Riduci zoom" on:click={() => { zoomOut(); closeToolbarMenus(); }}>−</button>
        <span>Zoom</span>
        <button type="button" aria-label="Aumenta zoom" on:click={() => { zoomIn(); closeToolbarMenus(); }}>+</button>
      </div>
      {#if cliqueNodes.size || highlightedEdgeIds.size}
        <button type="button" on:click={() => { clearClique(); closeToolbarMenus(); }}>Rimuovi evidenziazione</button>
      {/if}
      {#if analysisResultsAvailable}
        <button
          type="button"
          disabled={solverRunning}
          title="Cancella i risultati correnti e mantiene rete, filtri, vista e cronologia."
          on:click={clearAnalysisResultsFromToolbar}
        >Cancella risultati correnti</button>
      {/if}
      <button type="button" on:click={() => { resetView(); closeToolbarMenus(); }}>Reimposta filtri e vista</button>
    </div>
  </details>

  <button class="toolbar-button export-action" type="button" on:click={() => { closeToolbarMenus(); showGraph2DExportPanel = true; }}>Esporta 2D</button>
</div>

<div class="graph-status-bar" role="status" aria-live="polite">
  <span><strong>{data?.nodes?.length ?? 0}</strong> nodi</span>
  <span><strong>{data?.links?.length ?? 0}</strong> archi</span>
  {#if activeProjectionLabels.length}
    <span class="projection-state"><span class="status-dot"></span>Proiezione · {activeProjectionLabels.join(", ")}</span>
  {:else}
    <span class="projection-state">Rete completa</span>
  {/if}
  {#if cliqueNodes.size > 0 || highlightedEdgeIds.size > 0}
    <span class="witness-state">{buildGraphWitnessStatus(cliqueNodes.size, highlightedEdgeIds.size)}</span>
  {/if}
</div>

{#if showProjectionControls && (filtersEnabled || provenanceScenarios.length > 0)}
  <div class="filter-card">
    <strong>Proiezione</strong>

    {#if filtersEnabled}

    {#if typeFiltersEnabled}
      <div class="filter-section">
        <span class="filter-title">Tipi di nodo</span>
        {#each availableTypes as type}
          <label>
            <input
              type="checkbox"
              checked={selectedTypes.has(type)}
              disabled={solverRunning}
              on:change={(e) => toggleTypeFilter(type, (e.currentTarget as HTMLInputElement).checked)}
            />
            {type}
          </label>
        {/each}
      </div>
    {/if}

    {#if groupFiltersEnabled}
      <div class="filter-section">
        <span class="filter-title">Gruppi</span>
        {#if availableGroups.length > 0}
          <label class="group-filter-search-label">
            <input
              class="group-filter-search"
              type="search"
              bind:value={groupFilterSearch}
              aria-label="Cerca un gruppo nel filtro della proiezione"
              placeholder="Cerca gruppo…"
              disabled={solverRunning}
            />
          </label>
          <div class="group-filter-list">
            {#each visibleGroupFilters as group (group)}
              <label>
                <input
                  type="checkbox"
                  checked={selectedGroupsFilter.has(group)}
                  disabled={solverRunning}
                  on:change={(e) => toggleGroupFilter(group, (e.currentTarget as HTMLInputElement).checked)}
                />
                {group}
              </label>
            {/each}
            {#if matchingGroupFilters.length === 0}
              <small>Nessun gruppo corrisponde alla ricerca.</small>
            {/if}
          </div>
          <ResultListPager
            total={matchingGroupFilters.length}
            visible={visibleGroupFilters.length}
            pageSize={groupFilterPageSize}
            label="gruppi disponibili"
            showMore={() => visibleGroupFilterLimit += groupFilterPageSize}
          />
        {:else}
          <small>Nessun gruppo disponibile nel grafo.</small>
        {/if}
      </div>
    {/if}

    {#if graphCapabilities.edgeConfidence?.available}
      <div class="filter-section confidence-filter">
        <label class="filter-title" for="edge-confidence-threshold">Soglia minima di confidenza</label>
        <div class="confidence-filter-control">
          <input
            id="edge-confidence-threshold"
            type="range"
            min={getEdgeConfidenceRange().min}
            max={getEdgeConfidenceRange().max}
            step={getEdgeConfidenceStep()}
            value={minimumEdgeConfidence}
            disabled={solverRunning}
            aria-describedby="edge-confidence-help"
            on:change={(event) => setMinimumEdgeConfidence((event.currentTarget as HTMLInputElement).value)}
          />
          <label class="confidence-exact-threshold" for="edge-confidence-threshold-exact">
            Valore
            <input
              id="edge-confidence-threshold-exact"
              type="number"
              min={getEdgeConfidenceRange().min}
              max={getEdgeConfidenceRange().max}
              step="any"
              value={minimumEdgeConfidence}
              disabled={solverRunning}
              aria-label="Valore esatto della soglia minima di confidenza"
              aria-describedby="edge-confidence-help"
              on:change={(event) => setMinimumEdgeConfidence(
                (event.currentTarget as HTMLInputElement).value,
                event.currentTarget as HTMLInputElement
              )}
            />
          </label>
        </div>
        <small id="edge-confidence-help">
          Include archi con valore mappato ≥ soglia; i nodi visibili restano nel grafo anche se isolati.
          Il valore non viene interpretato come probabilità.
        </small>
        <small>{confidenceExcludedLinkCount} archi esclusi dalla proiezione corrente.</small>
        <small>Modificare la soglia rimuove i risultati precedenti: riesegui l'analisi sulla nuova proiezione.</small>
      </div>
    {/if}

    {/if}

    {#if provenanceScenarios.length > 0}
      <div class="filter-section provenance-scenario-section">
        <label class="filter-title" for="provenance-scenario">Scenario di provenienza</label>
        <select
          id="provenance-scenario"
          value={selectedProvenanceScenarioId}
          disabled={solverRunning}
          aria-describedby="provenance-scenario-help"
          on:change={(event) => setProvenanceScenario((event.currentTarget as HTMLSelectElement).value)}
        >
          <option value="">Tutte le fonti (nessuna proiezione)</option>
          {#each provenanceScenarios as scenario (scenario.id)}
            <option value={scenario.id}>{scenario.label ?? scenario.id}</option>
          {/each}
        </select>
        <small id="provenance-scenario-help">
          {provenanceScenarioConfig.referenceMatching === "all"
            ? "Un arco è incluso solo se tutti i riferimenti appartengono allo scenario."
            : "Un arco con più riferimenti è incluso se almeno uno appartiene allo scenario."}
          Gli archi senza fonte sono
          {provenanceScenarioConfig.unattributedEdges === "include" ? " inclusi." : " esclusi."}
        </small>
        <small>{provenanceExcludedLinkCount} archi esclusi dallo scenario selezionato.</small>
        <small>Cambiare scenario aggiorna la rete analizzata e rimuove i risultati precedenti.</small>
        {#if solverEnabled}
          <button
            type="button"
            class="provenance-analysis-run"
            class:running={solverRunning}
            disabled={solverRunning || clingoWorkerStatus !== "ready" || graphDirection === "directed" || !originalData?.nodes?.length}
            on:click={runProvenanceScenarioCliqueComparison}
          >
            {solverRunning && lastGraph2DAnalysisKind === "provenanceClique" ? "Confronto in corso…" : "Confronta clique massime"}
          </button>
          <small>
            Confronta la clique massima in ogni scenario usando la stessa finestra temporale, gli stessi filtri e la soglia di confidenza. Il limite di calcolo è condiviso; se il tempo scade, il confronto si interrompe senza mostrare risultati parziali.
          </small>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<InfoPanel
  {selectedNode}
  {selectedDetails}
  {rootSelectedId}
  directedGraph={graphDirection === "directed"}
  neighborhoodFocus={neighborhoodFocusInfo}
  totalGraphNodeCount={data?.nodes?.length ?? 0}
  onFocusNeighborhood={focusGraphNeighborhood}
  onClearNeighborhoodFocus={clearGraphNeighborhoodFocus}
  neighborIds={
  Array.from(neighborMap.get(rootSelectedId ?? "") ?? [])
    .map(id => {
      const node = getNodeById(id);
      return {
        id,
        label: node?.label ?? id
      };
    })
}
  {highlightedNeighbors}
  onBackToRoot={backToRoot}
  onViewNeighbor={viewNeighbor}
  onCommitNeighbor={(id) => {
  const node = getNodeById(id);
  commitNeighbor(id, node?.label ?? id);
}}
/>

<HistoryPanel
  {history}
  analysisArchive={analysisArchiveEntries}
  onClear={clearHistory}
  onClearAnalysisArchive={clearAnalysisArchive}
  onRestoreAnalysis={restoreArchivedAnalysis}
  onJumpTo={(id) => selectRoot(id, "truncate")}
/>

{#if timelineControlEnabled}
<TimelineSlider
  uiConfig={UI.timeline}
  min={GRAPH_CONFIG.timeline.start}
  max={GRAPH_CONFIG.timeline.end}
  start={currentStart}
  end={currentEnd}
  disabled={solverRunning}
  on:change={(e) => {
    currentStart = e.detail.start;
    currentEnd = e.detail.end;

    clearTimeout(timelineTimeout);
    timelineTimeout = setTimeout(() => {
      applyTimelineFilter();
      graph3D?.d3ReheatSimulation?.();
    }, GRAPH_CONFIG.timeline.debounceMs);
  }}
/>
{/if}

{#if solverEnabled}
<SolverPanel
  config={GRAPH_CONFIG.solver}
  open={showSolverPanel}
  running={solverRunning}
  stats={solverStats}
  error={solverError}
  maximumCliques={maximumCliques}
  maximumCliquesForMembership={maximumCliqueMembershipCliques}
  allCliques={allCliques}
  supportingEdgesByClique={cliqueSupportingEdgesByKey}
  {edgeProvenanceBySourceId}
  {edgeProvenanceReferencesBySourceId}
  {workerWasmMemoryStats}
  clingoTiming={clingoInvocationTiming}
  showClingoTiming={showClingoTimingDiagnostics}
  clingoStats={clingoInvocationStats}
  showClingoStats={showClingoSolverStatsDiagnostics}
  selectedNodeId={selectedId}
  {sourceIdByNodeId}
  {cliqueMembershipDiagnosis}
  {cliqueMembershipDiagnosisTargetNodeId}
  {cliqueMembershipDiagnosisRunning}
  {cliqueMembershipDiagnosisError}
  bind:minSize={minCliqueSize}
  bind:topPerSize={topPerSize}
  bind:selectedGroup
  availableGroups={visibleAnalysisGroups}
  on:close={() => closeAnalysisPanel("clique")}
  on:rerun={() => runMaximumClique()}
  on:diagnoseMaximumMembership={(e) => explainMaximumCliqueMembership(String(e.detail ?? ""))}
  on:highlight={(e) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const clique = e.detail as string[];

    const supportingEdges = cliqueSupportingEdgesByKey[getCliqueSignature(clique)] ?? [];
    highlightedEdgeIds = new Set(supportingEdges.map((edge) => getStructuralEdgeIdentity({
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      sourceId: edge.edgeId
    })));
    refreshLinkVisuals();
    cliqueNodes = new Set(clique);

    selectWitnessRoot(clique);

    refreshNodeVisuals();
  }}
  on:highlightMembershipWitness={(e) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const diagnosis = e.detail as CliqueMaximumMembershipDiagnosis;
    highlightedEdgeIds = new Set(diagnosis.supportingEdges.map((edge) => getStructuralEdgeIdentity({
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      ...(edge.edgeId ? { sourceId: edge.edgeId } : {})
    })));
    refreshLinkVisuals();
    cliqueNodes = new Set(diagnosis.witnessNodeIds);
    selectWitnessRoot(diagnosis.witnessNodeIds);
    refreshNodeVisuals();
  }}
/>

<ProvenanceScenarioAnalysisPanel
  open={showProvenanceScenarioAnalysisPanel}
  running={solverRunning}
  progress={provenanceScenarioAnalysisProgress}
  error={provenanceScenarioAnalysisError}
  comparison={provenanceScenarioComparison}
  nodeLabels={Object.fromEntries((data?.nodes ?? []).map((node: any) => [node.id, node.label ?? node.id]))}
  selectedGroup={provenanceScenarioSelectedGroup}
  confidenceThreshold={provenanceScenarioConfidenceThreshold}
  timelineWindow={provenanceScenarioTimelineWindow}
  viewFilters={provenanceScenarioViewFilters}
  on:close={() => closeAnalysisPanel("provenance")}
  on:highlight={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const nodeIds = event.detail as string[];
    highlightedEdgeIds = new Set();
    cliqueNodes = new Set(nodeIds);
    refreshLinkVisuals();
    selectWitnessRoot(nodeIds);
    refreshNodeVisuals();
  }}
/>

<StructuralAnalysisPanel
  open={showStructuralPanel}
  running={solverRunning}
  error={structuralError}
  outcomeMessage={structuralOutcomeMessage}
  bind:task={structuralTask}
  bind:parameter={structuralParameter}
  bind:kCoreMode={structuralKCoreMode}
  bind:includeKCoreNumbers={structuralIncludeKCoreNumbers}
  bind:enumerateAllOptima={structuralEnumerateAllOptima}
  bind:enumerateAllMaximalKPlex={structuralEnumerateAllMaximalKPlex}
  bind:explainCommunityContributions={structuralExplainCommunityContributions}
  bind:explainCommunityInfeasibility={structuralExplainCommunityInfeasibility}
  bind:minimumCommunityCount={structuralCommunityMinCount}
  bind:maximumCommunityCount={structuralCommunityMaxCount}
  bind:selectedGroup={selectedStructuralGroup}
  bind:selectedTargetGroup={selectedStructuralTargetGroup}
  bind:startNodeId={selectedPathStartId}
  bind:goalNodeId={selectedPathGoalId}
  bind:pathEdgeTypeSequence={structuralPathEdgeTypeSequence}
  bind:pathTemporalSemantics={structuralPathTemporalSemantics}
  bind:pathStrictTemporalOrder={structuralPathStrictTemporalOrder}
  {availableGroups}
  availableNodes={availablePathNodes}
  componentScenarioNodes={(originalData?.nodes ?? []).map((node: any) => ({
    id: String(node.id),
    label: String(node.label ?? node.id)
  }))}
  bind:componentScenarioTargetNodeId={provenanceComponentScenarioTargetNodeId}
  connectedComponentsAvailable={graphCapabilities.undirectedAdjacency?.available === true}
  nodeLabelById={Object.fromEntries((originalData?.nodes ?? []).map((node: any) => [String(node.id), String(node.label ?? node.id)]))}
  provenanceScenarioCount={provenanceScenarios.length}
  provenanceKCoreComparison={provenanceKCoreScenarioComparison}
  provenanceKCoreComparisonRunning={solverRunning && provenanceKCoreScenarioComparisonProgress !== ""}
  provenanceKCoreComparisonProgress={provenanceKCoreScenarioComparisonProgress}
  provenanceKCoreComparisonError={provenanceKCoreScenarioComparisonError}
  provenanceKCoreSelectedGroup={provenanceKCoreScenarioSelectedGroup}
  provenanceKCoreConfidenceThreshold={provenanceKCoreScenarioConfidenceThreshold}
  provenanceKCoreTimelineWindow={provenanceKCoreScenarioTimelineWindow}
  provenanceKCoreViewFilters={provenanceKCoreScenarioViewFilters}
  provenanceKPlexComparison={provenanceKPlexScenarioComparison}
  provenanceKPlexComparisonRunning={solverRunning && provenanceKPlexScenarioComparisonProgress !== ""}
  provenanceKPlexComparisonProgress={provenanceKPlexScenarioComparisonProgress}
  provenanceKPlexComparisonError={provenanceKPlexScenarioComparisonError}
  provenanceKPlexSelectedGroup={provenanceKPlexScenarioSelectedGroup}
  provenanceKPlexConfidenceThreshold={provenanceKPlexScenarioConfidenceThreshold}
  provenanceKPlexTimelineWindow={provenanceKPlexScenarioTimelineWindow}
  provenanceKPlexViewFilters={provenanceKPlexScenarioViewFilters}
  provenanceComponentComparison={provenanceComponentScenarioComparison}
  provenanceComponentComparisonRunning={solverRunning && provenanceComponentScenarioComparisonProgress !== ""}
  provenanceComponentComparisonProgress={provenanceComponentScenarioComparisonProgress}
  provenanceComponentComparisonError={provenanceComponentScenarioComparisonError}
  provenanceComponentSelectedGroup={provenanceComponentScenarioSelectedGroup}
  provenanceComponentConfidenceThreshold={provenanceComponentScenarioConfidenceThreshold}
  provenanceComponentTimelineWindow={provenanceComponentScenarioTimelineWindow}
  provenanceComponentViewFilters={provenanceComponentScenarioViewFilters}
  provenanceDominatingSetComparison={provenanceDominatingSetScenarioComparison}
  provenanceDominatingSetComparisonRunning={solverRunning && provenanceDominatingSetScenarioComparisonProgress !== ""}
  provenanceDominatingSetComparisonProgress={provenanceDominatingSetScenarioComparisonProgress}
  provenanceDominatingSetComparisonError={provenanceDominatingSetScenarioComparisonError}
  provenanceDominatingSetScenarioWhyNot={provenanceDominatingSetScenarioWhyNot}
  provenanceDominatingSetCandidateGroup={provenanceDominatingSetScenarioCandidateGroup}
  provenanceDominatingSetTargetGroup={provenanceDominatingSetScenarioTargetGroup}
  provenanceDominatingSetConfidenceThreshold={provenanceDominatingSetScenarioConfidenceThreshold}
  provenanceDominatingSetTimelineWindow={provenanceDominatingSetScenarioTimelineWindow}
  provenanceDominatingSetViewFilters={provenanceDominatingSetScenarioViewFilters}
  directedGraph={graphDirection === "directed"}
  weakComponentsAvailable={weakComponentsDataReadiness.available}
  strongComponentsAvailable={strongComponentsDataReadiness.available}
  weakComponentsRequirementReasons={weakComponentsDataReadiness.reasons}
  strongComponentsRequirementReasons={strongComponentsDataReadiness.reasons}
  taskRequirementsAvailable={structuralTaskReadiness.available}
  taskRequirementReasons={structuralTaskReadiness.reasons}
  availableEdgeTypes={availableStructuralEdgeTypes}
  typedPathRequirementsAvailable={typedPathDataReadiness.available}
  typedPathTemporalRequirementsAvailable={typedPathTemporalDataReadiness.available}
  typedPathTemporalRequirementReasons={typedPathTemporalDataReadiness.reasons}
  costEdgeSeparatorRequirementsAvailable={costEdgeSeparatorDataReadiness.available}
  costNodeSeparatorRequirementsAvailable={costNodeSeparatorDataReadiness.available}
  {sourceIdByNodeId}
  sourceIdByEdgeId={structuralEdgeSourceIdById}
  edgeSourceIdentityById={structuralEdgeSourceIdentityById}
  edgeProvenanceById={structuralEdgeProvenanceById}
  {edgeProvenanceReferencesBySourceId}
  resultSets={structuralResults}
  kPlexMembershipNodes={availableKPlexMembershipNodes}
  bind:kPlexMembershipTargetNodeId={structuralKPlexMembershipDiagnosisTargetNodeId}
  kPlexMembershipDiagnosis={structuralKPlexMembershipDiagnosis}
  kPlexMembershipDiagnosisRunning={structuralKPlexMembershipDiagnosisRunning}
  kPlexMembershipDiagnosisError={structuralKPlexMembershipDiagnosisError}
  kPlexMembershipDiagnosisTimeMs={structuralKPlexMembershipDiagnosisTimeMs}
  kPlexMembershipCounterfactualEnabled={Array.isArray(motifCounterfactualEdgeAdditions) && motifCounterfactualEdgeAdditions.length > 0}
  kPlexMembershipCounterfactualConfiguredCount={Array.isArray(motifCounterfactualEdgeAdditions) ? motifCounterfactualEdgeAdditions.length : 0}
  kPlexMembershipCounterfactualCandidateCount={structuralKPlexMembershipCounterfactualCandidateCount}
  kPlexMembershipCounterfactual={structuralKPlexMembershipCounterfactual}
  kPlexMembershipCounterfactualRunning={structuralKPlexMembershipCounterfactualRunning}
  kPlexMembershipCounterfactualError={structuralKPlexMembershipCounterfactualError}
  kPlexMembershipCounterfactualTimeMs={structuralKPlexMembershipCounterfactualTimeMs}
  separatorReachableBySet={structuralSeparatorReachableBySetKey}
  kPlexMissingPairsBySet={structuralKPlexMissingPairsBySetKey}
  kPlexMaximalityBySet={structuralKPlexMaximalityBySetKey}
  kPlexCounterfactualEnabled={Array.isArray(motifCounterfactualEdgeAdditions) && motifCounterfactualEdgeAdditions.length > 0}
  kPlexCounterfactualCandidateCount={Array.isArray(motifCounterfactualEdgeAdditions) ? motifCounterfactualEdgeAdditions.length : 0}
  kPlexCounterfactualProposals={structuralKPlexCounterfactuals}
  kPlexCounterfactualWhyNot={structuralKPlexCounterfactualWhyNot}
  kPlexCounterfactualWhyNotMessage={structuralKPlexCounterfactualWhyNotMessage}
  kPlexCounterfactualHasRun={structuralKPlexCounterfactualHasRun}
  kPlexCounterfactualError={structuralKPlexCounterfactualError}
  kPlexCounterfactualTimeMs={structuralKPlexCounterfactualTimeMs}
  kPlexCounterfactualExcludedCandidateCount={structuralKPlexCounterfactualExcludedCandidateCount}
  kCoreCounterfactualEnabled={Array.isArray(motifCounterfactualEdgeAdditions) && motifCounterfactualEdgeAdditions.length > 0}
  kCoreCounterfactualUnavailableReason={graphDirection === "directed" ? "Il controfattuale del k-core e definito qui solo per grafi non orientati." : ""}
  kCoreCounterfactualCandidateCount={Array.isArray(motifCounterfactualEdgeAdditions) ? motifCounterfactualEdgeAdditions.length : 0}
  kCoreCounterfactualProposals={structuralKCoreCounterfactuals}
  kCoreCounterfactualWhyNot={structuralKCoreCounterfactualWhyNot}
  kCoreCounterfactualWhyNotMessage={structuralKCoreCounterfactualWhyNotMessage}
  kCoreCounterfactualHasRun={structuralKCoreCounterfactualHasRun}
  kCoreCounterfactualError={structuralKCoreCounterfactualError}
  kCoreCounterfactualTimeMs={structuralKCoreCounterfactualTimeMs}
  kCoreCounterfactualExcludedCandidateCount={structuralKCoreCounterfactualExcludedCandidateCount}
  kCoreMembershipCandidateNodeIds={[...typedPathCandidateNodeIds].map(String)}
  kCoreMembershipCounterfactualProposals={structuralKCoreMembershipCounterfactuals}
  kCoreMembershipCounterfactualWhyNot={structuralKCoreMembershipCounterfactualWhyNot}
  kCoreMembershipCounterfactualWhyNotMessage={structuralKCoreMembershipCounterfactualWhyNotMessage}
  kCoreMembershipCounterfactualHasRun={structuralKCoreMembershipCounterfactualHasRun}
  kCoreMembershipCounterfactualError={structuralKCoreMembershipCounterfactualError}
  kCoreMembershipCounterfactualTimeMs={structuralKCoreMembershipCounterfactualTimeMs}
  kCoreMembershipCounterfactualExcludedCandidateCount={structuralKCoreMembershipCounterfactualExcludedCandidateCount}
  kCoreSupportBySet={structuralKCoreSupportBySetKey}
  kCorePeelingBySet={structuralKCorePeelingBySetKey}
  kCoreNumbers={structuralKCoreNumbers}
  kCoreProfileTimeMs={structuralKCoreProfileTimeMs}
  bind:explainKCoreExclusions={structuralExplainKCoreExclusions}
  dominatingSetSupportBySet={structuralDominatingSetSupportBySetKey}
  dominatingSetUncoverableTargetNodeIds={structuralDominatingSetUncoverableTargetNodeIds}
  communityPartitions={structuralCommunityPartitions}
  communityPairMembershipEnabled={communityPairMembershipContext !== null}
  communityPairMembershipResult={structuralCommunityPairMembership}
  communityPairMembershipError={structuralCommunityPairMembershipError}
  communityPairMembershipRunning={structuralCommunityPairMembershipRunning}
  communityPairMembershipTimeMs={structuralCommunityPairMembershipTimeMs}
  communityTopologyCounterfactualEnabled={communityPairMembershipContext !== null &&
    (configuredCommunityConstraints?.topologyCounterfactuals?.edgeEdits?.length ?? 0) > 0}
  communityTopologyEdgeEdits={configuredCommunityConstraints?.topologyCounterfactuals?.edgeEdits ?? []}
  communityTopologyCounterfactualResult={structuralCommunityTopologyCounterfactual}
  communityTopologyCounterfactualError={structuralCommunityTopologyCounterfactualError}
  communityTopologyCounterfactualRunning={structuralCommunityTopologyCounterfactualRunning}
  communityTopologyCounterfactualTimeMs={structuralCommunityTopologyCounterfactualTimeMs}
  communityConstraintDiagnoses={structuralCommunityConstraintDiagnoses}
  communityConstraintDiagnosisError={structuralCommunityConstraintDiagnosisError}
  communityConstraintDiagnosesAllEnumerated={structuralCommunityConstraintDiagnosesAllEnumerated}
  pathEdgeIdsByStep={structuralPathEdgeIdsByStep}
  pathCommonTimeValue={structuralPathCommonTimeValue}
  pathStartTimeValuesByStep={structuralPathStartTimeValuesByStep}
  pathMinimality={structuralPathMinimality}
  pathNoRouteCertificate={structuralPathNoRouteCertificate}
  typedPathNoRouteCertificate={structuralTypedPathNoRouteCertificate}
  typedPathCounterfactualEnabled={Array.isArray(motifCounterfactualEdgeAdditions) && motifCounterfactualEdgeAdditions.length > 0}
  typedPathCounterfactualRequirementReasons={typedPathDataReadiness.available ? [] : typedPathDataReadiness.reasons}
  typedPathCounterfactualCandidateCount={Array.isArray(motifCounterfactualEdgeAdditions) ? motifCounterfactualEdgeAdditions.length : 0}
  typedPathCounterfactualExcludedCandidateCount={structuralTypedPathCounterfactualExcludedCandidateCount}
  typedPathCounterfactualProposals={structuralTypedPathCounterfactuals}
  typedPathCounterfactualWhyNot={structuralTypedPathCounterfactualWhyNot}
  typedPathCounterfactualWhyNotError={structuralTypedPathCounterfactualWhyNotError}
  typedPathCounterfactualHasRun={structuralTypedPathCounterfactualHasRun}
  typedPathCounterfactualError={structuralTypedPathCounterfactualError}
  typedPathCounterfactualTimeMs={structuralTypedPathCounterfactualTimeMs}
  bind:explainPathMinimality={structuralExplainPathMinimality}
  bind:explainTypedPathNoRoute={structuralExplainTypedPathNoRoute}
  modularity={structuralStats?.modularity}
  communityScaledTotalWeight={structuralStats?.scaledTotalEdgeWeight}
  communityDisplayTotalWeight={structuralStats?.displayTotalEdgeWeight}
  communityWeightScaleFactor={structuralStats?.edgeWeightScaleFactor}
  communityUsesEdgeWeights={configuredCommunityConstraints?.useEdgeWeights === true}
  communityResolution={configuredCommunityConstraints?.resolution ?? 1}
  communityResolutionNumerator={structuralStats?.modularityResolutionNumerator ?? 1}
  communityResolutionDenominator={structuralStats?.modularityResolutionDenominator ?? 1}
  configuredCommunityPairCount={communityConstraintPairCount}
  configuredCommunityAttributeBoundCount={communityAttributeBoundCount}
  {communityConfigurationError}
  timeMs={structuralStats?.timeMs}
  graphNodesCount={data?.nodes?.length ?? 0}
  graphLinksCount={data?.links?.length ?? 0}
  selectedGroupNodeCount={selectedStructuralGroupNodeCount}
  {workerWasmMemoryStats}
  clingoTiming={clingoInvocationTiming}
  showClingoTiming={showClingoTimingDiagnostics}
  clingoStats={clingoInvocationStats}
  showClingoStats={showClingoSolverStatsDiagnostics}
  coverageTargetCount={structuralStats?.targetCount}
  minimumCutCost={structuralStats?.minimumCutCost}
  minimumNodeRemovalCost={structuralStats?.minimumNodeRemovalCost}
  on:run={(event) => runStructuralAnalysis(event.detail)}
  on:probeCommunityPairMembership={(event) => probeCommunityPairOptimumMembership(event.detail)}
  on:searchCommunityTopologyCounterfactual={(event) => runCommunityTopologyCounterfactual(event.detail)}
  on:highlightCommunityTopologyCounterfactual={(event) => highlightCommunityTopologyCounterfactual(event.detail as CommunityTopologyCounterfactualResult)}
  on:clearCommunityPairMembership={() => {
    structuralCommunityPairMembership = null;
    structuralCommunityPairMembershipError = "";
    structuralCommunityPairMembershipTimeMs = undefined;
    structuralCommunityTopologyCounterfactual = null;
    structuralCommunityTopologyCounterfactualError = "";
    structuralCommunityTopologyCounterfactualTimeMs = undefined;
  }}
  on:compareScenarios={(event) => runProvenanceScenarioKCoreComparison(event.detail)}
  on:compareKPlexScenarios={(event) => runProvenanceScenarioKPlexComparison(event.detail)}
  on:compareComponentScenarios={(event) => runProvenanceScenarioComponentComparison(event.detail)}
  on:compareDominatingSetScenarios={(event) => runProvenanceScenarioDominatingSetComparison(event.detail)}
  on:kPlexCompletion={(event) => runKPlexCompletionCounterfactual(event.detail)}
  on:kPlexCohortChange={clearKPlexCounterfactual}
  on:diagnoseKPlexMaximumMembership={(event) => explainMaximumKPlexMembership(String(event.detail ?? ""))}
  on:searchKPlexMaximumMembershipCounterfactual={(event) => searchKPlexMaximumMembershipCounterfactual(String(event.detail ?? ""))}
  on:clearKPlexMembershipDiagnosis={clearKPlexMaximumMembershipDiagnosis}
  on:kCoreCompletion={(event) => runKCoreCompletionCounterfactual(event.detail)}
  on:kCoreCohortChange={clearKCoreCounterfactual}
  on:kCoreMembershipCompletion={(event) => runKCoreMembershipCompletionCounterfactual(event.detail)}
  on:kCoreMembershipCriteriaChange={clearKCoreMembershipCounterfactual}
  on:typedPathCompletion={(event) => runTypedPathCounterfactual(event.detail)}
  on:typedPathCompletionCriteriaChange={clearTypedPathCounterfactual}
  on:criteriaChange={() => {
    clearStructuralTaskResult();
    clearGraph2DOverlay();
  }}
  on:close={() => closeAnalysisPanel("structural")}
  on:openData={() => {
    openDataPanel();
  }}
  on:highlight={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const selectedNodes = event.detail as string[];
    if (structuralTask === "minimumNodeSeparator" || structuralTask === "minimumCostNodeSeparator") {
      graph2DNodeAnnotations = Object.fromEntries(selectedNodes.map((nodeId) => [
        nodeId,
        "Nodo rimosso · separatore"
      ]));
    }
    const dominatingSetOverlay = structuralTask === "dominatingSet"
      ? getDominatingSetCoverageOverlay(selectedNodes)
      : null;
    highlightedEdgeIds = new Set(dominatingSetOverlay?.edgeIds ?? []);
    if (dominatingSetOverlay) graph2DEdgeAnnotations = dominatingSetOverlay.edgeAnnotations;
    refreshLinkVisuals();
    cliqueNodes = new Set(selectedNodes);
    selectWitnessRoot(selectedNodes);
    refreshNodeVisuals();
  }}
  on:highlightCounterfactual={(event) => highlightStructuralCounterfactual(event.detail)}
  on:highlightEdges={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const selectedEdges = event.detail as string[];
    if (structuralTask === "minimumEdgeSeparator" || structuralTask === "minimumCostEdgeSeparator") {
      graph2DEdgeAnnotations = Object.fromEntries(selectedEdges.map((edgeId) => [
        edgeId,
        { label: "Arco rimosso", color: "#b4233c", dashPattern: "dotted" }
      ]));
    }
    highlightedEdgeIds = new Set(selectedEdges);
    cliqueNodes = new Set();
    const endpointNodeIds = (data?.links ?? [])
      .filter((link: any) => selectedEdges.includes(getStructuralEdgeIdentity(link)))
      .flatMap((link: any) => [getLinkEndId(link.source), getLinkEndId(link.target)]);
    selectWitnessRoot(endpointNodeIds);
    refreshLinkVisuals();
    refreshNodeVisuals();
  }}
  on:highlightSeparatorSide={(event) => {
    clearGraphNeighborhoodFocus();
    const reachableNodes = event.detail as string[];
    clearGraph2DOverlay();
    graph2DNodeAnnotations = Object.fromEntries(reachableNodes.map((nodeId) => [nodeId, "Lato raggiungibile dal terminale iniziale"]));
    graph2DOverlayResultLabel = "Lato sorgente raggiungibile dopo la rimozione";
    graph2DOverlayCompletionLabel = structuralStats?.completionLabel ?? "";
    highlightedEdgeIds = new Set();
    cliqueNodes = new Set(reachableNodes);
    refreshLinkVisuals();
    selectWitnessRoot(reachableNodes);
    refreshNodeVisuals();
  }}
  on:highlightCommunity={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const witness = event.detail as { nodeIds: string[]; edgeIds: string[]; partitionIndex?: number; communityIndex?: number };
    graph2DCommunityPartitionIndex = witness.partitionIndex ?? 0;
    graph2DCommunityIndex = witness.communityIndex ?? -1;
    cliqueNodes = new Set(witness.nodeIds);
    highlightedEdgeIds = new Set(witness.edgeIds);
    refreshLinkVisuals();
    selectWitnessRoot(witness.nodeIds);
    refreshNodeVisuals();
  }}
  on:highlightKCore={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const witness = event.detail as { nodeIds: string[]; edgeIds: string[] };
    cliqueNodes = new Set(witness.nodeIds);
    highlightedEdgeIds = new Set(witness.edgeIds);
    refreshLinkVisuals();
    refreshNodeVisuals();
  }}
  on:highlightKCoreProfile={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const nodeIds = event.detail as string[];
    const directedMode = structuralKCoreMode === "in" || structuralKCoreMode === "out" || structuralKCoreMode === "mutual"
      ? structuralKCoreMode as DirectedKCoreMode
      : undefined;
    cliqueNodes = new Set(nodeIds);
    highlightedEdgeIds = new Set(graphDirection === "directed"
      ? directedMode
        ? getKCoreInducedEdgeIdentities(nodeIds, data.links, "directed", directedMode)
        : []
      : getKCoreInducedEdgeIdentities(nodeIds, data.links, "undirected"));
    refreshLinkVisuals();
    selectWitnessRoot(nodeIds);
    refreshNodeVisuals();
  }}
  on:highlightKCorePeeling={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const witness = event.detail as { nodeIds: string[]; edgeIds: string[] };
    cliqueNodes = new Set(witness.nodeIds);
    highlightedEdgeIds = new Set(witness.edgeIds);
    selectWitnessRoot(witness.nodeIds);
    refreshLinkVisuals();
    refreshNodeVisuals();
  }}
  on:highlightDominatingSet={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const witness = event.detail as { nodeIds: string[]; targetNodeId?: string };
    cliqueNodes = new Set(witness.nodeIds);
    const coverageOverlay = getDominatingSetCoverageOverlay(witness.nodeIds, witness.targetNodeId);
    highlightedEdgeIds = new Set(coverageOverlay.edgeIds);
    graph2DEdgeAnnotations = coverageOverlay.edgeAnnotations;
    if (witness.targetNodeId) {
      const targetLabel = String(data?.nodes?.find((node: any) => String(node.id) === witness.targetNodeId)?.label ?? witness.targetNodeId);
      graph2DOverlayResultLabel = `Copertura di ${targetLabel} · ${witness.nodeIds.length} ${witness.nodeIds.length === 1 ? "nodo selezionato" : "nodi selezionati"} · ${coverageOverlay.edgeIds.length} ${coverageOverlay.edgeIds.length === 1 ? "arco di supporto" : "archi di supporto"}`;
      graph2DOverlayCompletionLabel = structuralStats?.completionLabel ?? "";
    }
    refreshLinkVisuals();
    selectWitnessRoot(witness.nodeIds);
    refreshNodeVisuals();
  }}
  on:highlightTypedPath={(event) => {
    clearGraphNeighborhoodFocus();
    clearGraph2DOverlay();
    const path = event.detail as { nodeIds: string[]; edgeIds: string[] };
    highlightedEdgeIds = new Set(path.edgeIds);
    cliqueNodes = new Set(path.nodeIds);
    selectWitnessRoot(path.nodeIds);
    refreshLinkVisuals();
    refreshNodeVisuals();
  }}
/>

<IntegrityPanel
  open={showIntegrityPanel}
  running={solverRunning}
  requirementsAvailable={integrityDataReadiness.available}
  requirementReasons={integrityDataReadiness.reasons}
  onOpenData={openDataPanel}
  error={integrityError}
  hasRun={integrityHasRun}
  violations={integrityResults}
  timeMs={integrityTimeMs}
  {workerWasmMemoryStats}
  clingoTiming={clingoInvocationTiming}
  showClingoTiming={showClingoTimingDiagnostics}
  clingoStats={clingoInvocationStats}
  showClingoStats={showClingoSolverStatsDiagnostics}
  repairEnabled={repairSuggestionsConfigured}
  repairRequirementsAvailable={integrityRepairDataReadiness.available}
  repairRequirementReasons={integrityRepairDataReadiness.reasons}
  repairRunning={integrityRepairRunning}
  repairError={integrityRepairError}
  repairProposal={integrityRepairProposal}
  {edgeProvenanceBySourceId}
  {edgeProvenanceReferencesBySourceId}
  on:run={runIntegrityAnalysis}
  on:repair={runIntegrityRepair}
  on:highlightRepairProposal={(event) => highlightIntegrityRepairProposal(event.detail as IntegrityRepairProposal)}
  on:close={() => closeAnalysisPanel("integrity")}
  on:highlight={(event) => highlightIntegrityViolation(event.detail as IntegrityViolation)}
/>

{#if motifTemplates.length > 0 || signedTriadConfig || contextualCliqueConfig}
<MotifAnalysisPanel
  open={showMotifPanel}
  activeAnalysisKind={lastGraph2DAnalysisKind}
  running={solverRunning}
  error={motifError}
  hasRun={motifHasRun}
  templates={motifTemplates}
  bind:selectedTemplateIndex={selectedMotifTemplateIndex}
  bind:selectedGroup={selectedMotifGroup}
  {availableGroups}
  matches={motifMatches}
  scenarioComparisonAvailable={provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds" && provenanceScenarios.length > 0}
  provenanceScenarioCount={provenanceScenarios.length}
  scenarioComparisonRequirementReason={provenanceScenarioConfig?.worldAssumption !== "finite-exhaustive-worlds"
    ? "Nel pannello Dati, indica che gli scenari elencati sono tutti quelli da considerare."
    : "Seleziona un motivo disponibile e controlla i requisiti dei dati sopra."}
  scenarioComparison={motifScenarioComparison}
  scenarioComparisonError={motifScenarioComparisonError}
  scenarioComparisonProgress={motifScenarioComparisonProgress}
  scenarioComparisonTimeMs={motifScenarioComparisonTimeMs}
  nearMatches={motifNearMatches}
  nearMatchHasRun={motifNearMatchHasRun}
  nearMatchError={motifNearMatchError}
  nearMatchTimeMs={motifNearMatchTimeMs}
  counterfactualEnabled={motifCounterfactualsConfigured}
  counterfactuals={motifCounterfactuals}
  counterfactualHasRun={motifCounterfactualHasRun}
  counterfactualError={motifCounterfactualError}
  counterfactualTimeMs={motifCounterfactualTimeMs}
  counterfactualExcludedCandidateCount={motifCounterfactualExcludedCandidateCount}
  counterfactualCandidateCount={motifCounterfactualEdgeAdditions?.length ?? 0}
  {edgeProvenanceBySourceId}
  {edgeProvenanceReferencesBySourceId}
  signedTriadsEnabled={Boolean(signedTriadConfig)}
  signedTriadAttribute={signedTriadConfig?.attribute ?? ""}
  signedTriadPositiveValues={Array.isArray(signedTriadConfig?.positiveValues) ? signedTriadConfig.positiveValues : []}
  signedTriadNegativeValues={Array.isArray(signedTriadConfig?.negativeValues) ? signedTriadConfig.negativeValues : []}
  signedTriadEdgeTypes={Array.isArray(signedTriadConfig?.edgeTypes) ? signedTriadConfig.edgeTypes : []}
  signedTriadRequirementsAvailable={signedTriadPreparation.available}
  signedTriadRequirementReasons={signedTriadPreparation.reasons}
  bind:signedTriadGroup={selectedSignedTriadGroup}
  signedTriadResults={signedTriadResults}
  signedTriadHasRun={signedTriadHasRun}
  signedTriadError={signedTriadError}
  signedTriadTimeMs={signedTriadTimeMs}
  signedTriadFocusedKey={focusedSignedTriadKey}
  signedTriadScenarioComparisonAvailable={Boolean(signedTriadConfig) && provenanceScenarioConfig?.worldAssumption === "finite-exhaustive-worlds" && provenanceScenarios.length > 1}
  signedTriadScenarioComparisonRequirementReason={provenanceScenarioConfig?.worldAssumption !== "finite-exhaustive-worlds"
    ? "Nel pannello Dati, indica che gli scenari elencati sono tutti quelli da considerare."
    : "Il confronto delle triadi richiede almeno due scenari dichiarati."}
  {signedTriadScenarioComparison}
  signedTriadScenarioComparisonError={signedTriadScenarioComparisonError}
  signedTriadScenarioComparisonProgress={signedTriadScenarioComparisonProgress}
  signedTriadScenarioComparisonTimeMs={signedTriadScenarioComparisonTimeMs}
  contextualCliqueConfig={contextualCliqueConfig}
  contextualCliqueAvailable={contextualCliqueAvailable}
  contextualCliqueRequirementReasons={contextualCliqueRequirementReasons}
  bind:contextualCliqueGroup
  bind:contextualCliqueEnumerateAllOptima
  contextualCliqueResults={contextualCliqueResults}
  contextualCliqueHasRun={contextualCliqueHasRun}
  contextualCliqueError={contextualCliqueError}
  contextualCliqueTimeMs={contextualCliqueTimeMs}
  {sourceIdByNodeId}
  nodeLabelById={Object.fromEntries((originalData?.nodes ?? []).map((node: any) => [String(node.id), String(node.label ?? node.id)]))}
  timeMs={motifTimeMs}
  {motifCount}
  motifCountHasRun={motifCountHasRun}
  motifCountError={motifCountError}
  motifCountTimeMs={motifCountTimeMs}
  motifCountMaxDurationMs={motifCountPartitionSettings.enabled ? motifCountPartitionSettings.settings.maxDurationMs : undefined}
  {motifCountProgress}
  {motifCountNotice}
  {workerWasmMemoryStats}
  clingoTiming={clingoInvocationTiming}
  showClingoTiming={showClingoTimingDiagnostics}
  clingoStats={clingoInvocationStats}
  showClingoStats={showClingoSolverStatsDiagnostics}
  requirementsAvailable={typedMotifDataReadiness.available}
  requirementReasons={typedMotifDataReadiness.reasons}
  temporalRequirementsAvailable={temporalMotifDataReadiness.available}
  temporalRequirementReasons={temporalMotifDataReadiness.reasons}
  graphNodesCount={data?.nodes?.length ?? 0}
  graphEdgesCount={data?.links?.length ?? 0}
  on:run={(event) => runTypedMotifAnalysis(event.detail)}
  on:compareScenarios={(event) => compareProvenanceScenarioMotifs(event.detail)}
  on:inspectScenarioMatch={(event) => inspectProvenanceMotifWitness(event.detail)}
  on:count={(event) => countTypedMotifMatches(event.detail)}
  on:cancelCount={cancelTypedMotifCount}
  on:diagnose={(event) => runTypedMotifNearMatch(event.detail)}
  on:counterfactual={(event) => runTypedMotifCompletionCounterfactual(event.detail)}
  on:clear={clearMotifAnalysis}
  on:close={() => closeAnalysisPanel("motif")}
  on:openData={() => {
    openDataPanel();
  }}
  on:highlight={(event) => highlightTypedMotif(event.detail as TypedMotifMatch)}
  on:highlightNearMatch={(event) => highlightTypedMotifNearMatch(event.detail as TypedMotifNearMatch)}
  on:highlightCounterfactual={(event) => highlightTypedMotifCounterfactual(event.detail as TypedMotifCounterfactual)}
  on:runSignedTriads={(event) => runSignedTriadAnalysis(event.detail)}
  on:compareSignedTriadScenarios={(event) => compareSignedTriadScenarios(event.detail)}
  on:inspectSignedTriadScenarioWitness={(event) => inspectSignedTriadScenarioWitness(event.detail)}
  on:clearSignedTriads={clearSignedTriadAnalysis}
  on:highlightSignedTriad={(event) => showSignedTriadInGraph(event.detail as SignedTriadResult)}
  on:focusSignedTriad={(event) => showSignedTriadInGraph(event.detail as SignedTriadResult, true)}
  on:clearSignedTriadFocus={clearSignedTriadGraphFocus}
  on:runContextualClique={(event) => runContextualClique(event.detail)}
  on:clearContextualClique={clearContextualCliqueResultAndFocus}
  on:highlightContextualClique={(event) => highlightContextualClique(event.detail as ContextualCliqueResult)}
/>
{/if}
{/if}
<Graph2DExportPanel
  open={showGraph2DExportPanel}
  nodes={data?.nodes ?? []}
  links={[...(data?.links ?? []), ...graph2DHypotheticalLinks]}
  highlightedNodeIds={[...cliqueNodes]}
  highlightedEdgeIds={[...highlightedEdgeIds]}
  nodeAnnotations={graph2DNodeAnnotations}
  edgeAnnotations={graph2DEdgeAnnotations}
  communityPartitions={!graph2DOverlayResultLabel && showStructuralPanel && structuralStats?.task === "communities" ? structuralCommunityPartitions.map((partition) => partition.communities) : []}
  highlightedCommunityPartitionIndex={graph2DCommunityPartitionIndex}
  coreNumbers={!graph2DOverlayResultLabel && showStructuralPanel && structuralStats?.task === "kCore" ? structuralKCoreNumbers : null}
  orderedNodeIds={!graph2DOverlayResultLabel && showStructuralPanel && (structuralStats?.task === "path" || structuralStats?.task === "typedPath") ? structuralResults[0] ?? [] : []}
  resultLabel={graph2DResultLabel}
  completionLabel={graph2DCompletionLabel}
  resultKind={graph2DPanelSummary.kind}
  {graphDirection}
  edgeColors={edgeTypeColors}
  scopeLabel={graph2DScopeLabel}
  onClose={() => showGraph2DExportPanel = false}
/>
<DownloadAnnouncement />
</div>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: var(--body-bg);
    font-family: var(--body-font);
    color: var(--body-color);
  }

  .graph {
    width: 100vw;
    height: 100vh;
  }

  :global(.app-root .scene-container .scene-nav-info) {
    left: 0;
    right: 0;
    width: fit-content;
    max-width: calc(100vw - 24px);
    box-sizing: border-box;
    margin: 0 auto;
    padding: 5px 9px;
    transform: none;
    border: 1px solid rgba(203, 213, 225, 0.4);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.94);
    color: #f8fafc;
    opacity: 1;
  }

  @media (min-width: 601px) {
    .app-root.timeline-enabled .graph {
      height: calc(100vh - var(--desktop-timeline-reserve, 0px));
    }
  }

  @media (max-width: 600px) {
    .app-root.timeline-enabled .graph {
      height: calc(100vh - var(--mobile-filter-timeline-reserve, 0px));
    }
  }

  .graph-visualization-note {
    position: fixed;
    right: 12px;
    bottom: 12px;
    z-index: 32;
    max-width: min(520px, calc(100vw - 24px));
    box-sizing: border-box;
    padding: 8px 11px;
    border: 1px solid rgba(148, 163, 184, 0.8);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.95);
    color: #0f172a;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.16);
    font: 12px/1.4 system-ui, sans-serif;
  }

  .graph-edge-type-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    max-height: 96px;
    overflow-y: auto;
    margin: 6px 0 0;
    padding: 6px 0 0;
    border-top: 1px solid rgba(148, 163, 184, 0.45);
    list-style: none;
  }

  .graph-edge-type-legend li {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .graph-edge-type-swatch {
    flex: 0 0 10px;
    width: 10px;
    height: 10px;
    border: 1px solid rgba(15, 23, 42, 0.4);
    border-radius: 50%;
  }

  @media (max-width: 600px) {
    :global(.app-root .scene-container .scene-nav-info) {
      top: calc(var(--toolbar-top) + var(--toolbar-height, 48px) + 40px);
      bottom: auto;
    }

    .graph-visualization-note {
      left: auto;
      right: 12px;
      bottom: calc(12px + max(var(--mobile-status-reserve, 48px), var(--mobile-filter-timeline-reserve, 0px)));
      width: calc(50vw - 18px);
      max-width: none;
      max-height: min(42vh, 300px);
      overflow: auto;
      box-sizing: border-box;
      padding: 8px 9px;
    }
  }

  .graph-data-diagnostics {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    /* Le diagnosi sono informative: devono restare visibili senza bloccare toolbar e pannelli. */
    z-index: 5;
    width: min(760px, calc(100vw - 32px));
    max-height: 30vh;
    overflow: auto;
    box-sizing: border-box;
    padding: 12px 16px;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    background: rgba(255, 251, 235, 0.97);
    color: #78350f;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
    font: 13px/1.45 system-ui, sans-serif;
  }

  .graph-data-diagnostics.error {
    border-color: #f87171;
    background: rgba(254, 242, 242, 0.98);
    color: #7f1d1d;
  }

  .graph-data-diagnostics ul {
    margin: 6px 0 0;
    padding-left: 20px;
  }

  .diagnostics-action {
    margin-top: 9px;
    min-height: 32px;
    padding: 6px 10px;
    border: 1px solid currentColor;
    border-radius: 7px;
    background: #fff;
    color: inherit;
    font: 650 12px/1 system-ui, sans-serif;
    cursor: pointer;
  }

  .diagnostics-action:focus-visible {
    outline: 3px solid rgba(20, 126, 113, .35);
    outline-offset: 2px;
  }

  .graph-capabilities {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 35;
    width: min(380px, calc(100vw - 24px));
    color: #0f172a;
    font: 12px/1.4 system-ui, sans-serif;
  }

  .graph-capabilities summary {
    width: fit-content;
    max-width: 100%;
    padding: 8px 11px;
    border: 1px solid rgba(148, 163, 184, 0.8);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.16);
    cursor: pointer;
    font-weight: 650;
    list-style-position: inside;
  }

  .capability-content {
    max-height: min(60vh, 480px);
    overflow: auto;
    margin-top: 6px;
    padding: 10px 12px;
    border: 1px solid rgba(148, 163, 184, 0.8);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.97);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2);
  }

  .capability-content p {
    margin: 0 0 8px;
  }

  .analysis-readiness-list {
    display: grid;
    gap: 6px;
    margin: 8px 0;
    padding: 0;
    list-style: none;
  }

  .analysis-readiness-list > li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 3px 8px;
    padding: 7px 8px;
    border: 1px solid #f0d6a8;
    border-radius: 7px;
    background: #fffbeb;
    font-size: 11px;
  }

  .analysis-readiness-list > li.available {
    border-color: #b8dccb;
    background: #f0fdf4;
  }

  .analysis-readiness-list strong { color: #243244; }
  .analysis-readiness-list span { color: #8a4b13; font-weight: 700; }
  .analysis-readiness-list .available span { color: #166534; }
  .analysis-readiness-list small { grid-column: 1 / -1; color: #66543a; line-height: 1.4; }

  .capability-list,
  .task-readiness {
    margin: 0;
    padding-left: 18px;
  }

  .capability-list > li {
    margin: 6px 0;
  }

  .capability-list > li.available > span {
    color: #166534;
  }

  .capability-list small {
    display: block;
    color: #64748b;
  }

  .future-task-readiness {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
  }

  .toolbar {
    position: absolute;
    top: var(--toolbar-top);
    left: var(--toolbar-left);
    display: flex;
    gap: var(--toolbar-gap);
    align-items: center;
    background: var(--toolbar-bg);
    padding: var(--toolbar-padding);
    border-radius: var(--toolbar-radius);
    z-index: var(--toolbar-z);
  }

  .toolbar:has(.toolbar-menu[open]) {
    z-index: 80;
  }

  .search-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-wrap input {
    width: var(--search-width);
    max-width: var(--search-max-width);
  }

  .autocomplete {
    position: absolute;
    top: calc(100% + var(--autocomplete-offset-y));
    left: 0;
    width: var(--search-width);
    max-width: var(--search-max-width);
    background: var(--autocomplete-bg);
    border-radius: var(--autocomplete-radius);
    overflow: hidden;
    z-index: var(--autocomplete-z);
    box-shadow: var(--autocomplete-shadow);
  }

  .autocomplete-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 0;
    color: inherit;
    font-family: inherit;
    padding: var(--autocomplete-item-padding);
    cursor: pointer;
    font-size: var(--autocomplete-font-size);
    line-height: 1.2;
    border-top: 1px solid rgba(148, 163, 184, 0.08);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .autocomplete-item:first-child {
    border-top: none;
  }

  .autocomplete-item:hover,
  .autocomplete-item:focus-visible {
    background: var(--autocomplete-hover, rgba(56, 189, 248, 0.2));
  }

  .search-message {
    position: absolute;
    top: calc(100% + var(--autocomplete-offset-y));
    left: 0;
    width: var(--search-width);
    max-width: var(--search-max-width);
    box-sizing: border-box;
    padding: var(--autocomplete-item-padding);
    font-size: var(--autocomplete-font-size);
    background: var(--autocomplete-bg);
    border-radius: var(--autocomplete-radius);
    box-shadow: var(--autocomplete-shadow);
    z-index: var(--autocomplete-z);
  }

  .filter-card {
    position: absolute;
    top: var(--filter-top);
    left: var(--filter-left);
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--filter-bg);
    padding: var(--filter-padding);
    border-radius: var(--filter-radius);
    z-index: var(--filter-z);
    font-size: var(--filter-font-size);
    max-width: var(--filter-max-width);
    max-height: var(--filter-max-height);
    overflow-y: auto;
  }

  .filter-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .filter-title {
    font-weight: 600;
    color: var(--filter-title-color, #7dd3fc);
  }

  .group-filter-search-label { cursor: text !important; }
  .group-filter-search {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: 5px 7px;
    border: 1px solid rgba(148, 163, 184, 0.65);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.96);
    color: #0f172a;
    font: inherit;
  }

  .group-filter-list {
    display: grid;
    max-height: 15rem;
    overflow: auto;
    gap: 5px;
  }

  .group-filter-list > label { overflow-wrap: anywhere; }

  .filter-card label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .filter-card input[type="checkbox"] {
    accent-color: var(--filter-accent-color, #38bdf8);
  }

  .provenance-scenario-section select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    padding: 5px 7px;
    border: 1px solid rgba(148, 163, 184, 0.65);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.96);
    color: #0f172a;
    font: inherit;
  }

  .provenance-scenario-section small {
    color: var(--text-muted, #536171);
    font-size: 0.78em;
    line-height: 1.35;
  }

  .provenance-analysis-run {
    width: 100%;
    min-height: 36px;
    padding: 8px 11px;
    border: 1px solid #1e645d;
    border-radius: 8px;
    background: #1e645d;
    color: #fff;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }

  .provenance-analysis-run:hover:not(:disabled) {
    border-color: #174d47;
    background: #174d47;
  }

  .provenance-analysis-run:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .provenance-analysis-run.running:disabled { cursor: wait; }

  .confidence-filter-control {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .confidence-filter-control input[type="range"] {
    flex: 1;
    min-width: 0;
    accent-color: var(--filter-accent-color, #38bdf8);
  }

  .confidence-exact-threshold {
    flex: 0 0 auto;
    gap: 5px;
    color: var(--text-muted, #536171);
    font-size: 0.78em;
    white-space: nowrap;
  }

  .confidence-exact-threshold input[type="number"] {
    box-sizing: border-box;
    width: 9ch;
    min-width: 0;
    padding: 4px 5px;
    border: 1px solid rgba(148, 163, 184, 0.65);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.92);
    color: #0f172a;
    font: inherit;
    font-variant-numeric: tabular-nums;
  }

  .confidence-filter small {
    color: var(--text-muted, #536171);
    font-size: 0.78em;
    line-height: 1.35;
  }

  @media (min-width: 901px) {
    .app-root.analysis-panel-open:not(.with-json-editor) .graph {
      width: max(0px, calc(100vw - 464px));
    }
  }

  .app-root.with-json-editor .graph {
    margin-left: 420px;
    width: calc(100vw - 420px);
  }

  .app-root.with-json-editor .toolbar {
    left: calc(var(--toolbar-left) + 420px);
  }

  .app-root.with-json-editor .filter-card {
    left: calc(var(--filter-left) + 420px);
  }

  @media (max-width: 900px) {
    .app-root.analysis-panel-open .graph {
      margin-left: 0;
      width: 100vw;
    }

    .app-root.with-json-editor .graph {
      margin-left: 0;
      width: 100vw;
    }

    .app-root.with-json-editor .toolbar {
      left: var(--toolbar-left);
      display: none;
    }

    .app-root.with-json-editor .filter-card {
      left: var(--filter-left);
    }
  }

  @media (max-width: 1280px) {
    .toolbar {
      right: auto;
      width: min(800px, calc(100vw - 20px));
      max-width: calc(100vw - 20px);
      box-sizing: border-box;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      align-items: stretch;
    }

    .toolbar > button {
      min-width: 0;
      white-space: normal;
    }

    .toolbar .search-wrap {
      grid-column: span 2;
      min-width: 0;
    }

    .toolbar .search-wrap input {
      width: 100%;
      max-width: none;
      box-sizing: border-box;
    }

    .filter-card {
      top: calc(var(--toolbar-top) + var(--toolbar-height, 180px) + 10px);
      max-height: min(
        var(--filter-max-height),
        calc(
          100vh - var(--toolbar-height, 180px) - var(--toolbar-top) - 20px -
          var(--mobile-status-reserve, 48px) - var(--mobile-filter-timeline-reserve, 0px)
        )
      );
    }
  }

  @media (min-width: 901px) and (max-width: 1280px) {
    .app-root.with-json-editor .toolbar {
      width: min(800px, calc(100vw - 440px));
      max-width: min(800px, calc(100vw - 440px));
    }
  }

  @media (max-width: 600px) {
    .toolbar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .toolbar .search-wrap {
      grid-column: 1 / -1;
    }
  }

  .app-root {
    position: relative;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    font-family: var(--body-font, system-ui, sans-serif);
    --toolbar-top: 12px;
    --toolbar-left: 12px;
  }

  .empty-graph-state {
    position: absolute;
    inset: 108px 18px 54px;
    z-index: 20;
    display: grid;
    place-items: center;
    pointer-events: none;
  }

  .empty-graph-card {
    width: min(620px, 100%);
    box-sizing: border-box;
    padding: clamp(22px, 4vw, 38px);
    border: 1px solid #dbe4ec;
    border-radius: 18px;
    background: rgba(255, 255, 255, .97);
    box-shadow: 0 20px 60px rgba(15, 23, 42, .18);
    color: #172033;
    pointer-events: auto;
  }

  .empty-graph-eyebrow {
    margin: 0 0 10px;
    color: #54736e;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .14em;
  }

  .empty-graph-card h1 {
    margin: 0;
    color: #172033;
    font-size: clamp(22px, 3vw, 31px);
    line-height: 1.15;
  }

  .empty-graph-card > p:not(.empty-graph-eyebrow) {
    max-width: 48ch;
    margin: 10px 0 0;
    color: #536273;
    font-size: 14px;
    line-height: 1.55;
  }

  .empty-graph-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 22px;
  }

  .empty-graph-actions button {
    min-height: 40px;
    padding: 9px 13px;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    background: #fff;
    color: #263548;
    font: 650 12px/1.2 system-ui, sans-serif;
    cursor: pointer;
  }

  .empty-graph-actions .empty-graph-primary {
    border-color: #1d6a61;
    background: #1d6a61;
    color: #fff;
  }

  .empty-graph-actions .empty-graph-primary:hover { background: #185b53; }
  .empty-graph-actions .empty-graph-example { background: #f4f8f7; }
  .empty-graph-actions button:focus-visible { outline: 3px solid #0284c7; outline-offset: 3px; }

  .empty-graph-card > small {
    display: block;
    margin-top: 18px;
    color: #66758a;
    font-size: 11px;
    line-height: 1.5;
  }

  .toolbar {
    right: 12px;
    width: auto;
    max-width: none;
    min-height: 48px;
    box-sizing: border-box;
    flex-wrap: wrap;
    gap: 7px;
    padding: 7px;
    border: 1px solid rgba(203, 213, 225, .88);
    border-radius: 12px;
    background: rgba(255, 255, 255, .94);
    box-shadow: 0 7px 24px rgba(15, 23, 42, .12);
    backdrop-filter: blur(14px);
  }

  .toolbar button,
  .toolbar summary {
    color: #253449;
    font: 600 12px/1.1 system-ui, sans-serif;
  }

  .toolbar .toolbar-button,
  .toolbar-menu > summary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 36px;
    box-sizing: border-box;
    padding: 8px 11px;
    border: 1px solid #d8e0e9;
    border-radius: 9px;
    background: #fff;
    cursor: pointer;
    white-space: nowrap;
    list-style: none;
    transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
  }

  .toolbar-menu > summary::-webkit-details-marker { display: none; }
  .toolbar .toolbar-button:hover,
  .toolbar-menu > summary:hover { border-color: #9db9b4; background: #f7fbfa; }
  .toolbar .toolbar-button.active,
  .toolbar-menu[open] > summary { border-color: #8db8b0; background: #edf7f5; color: #155d55; }
  .toolbar .toolbar-button:focus-visible,
  .toolbar-menu > summary:focus-visible,
  .toolbar-menu button:focus-visible,
  .toolbar .search-wrap input:focus-visible { outline: 3px solid rgba(20, 126, 113, .25); outline-offset: 2px; }
  .menu-chevron { color: #718096; font-size: 14px; font-weight: 500; }
  .active-count { display: inline-grid; min-width: 17px; height: 17px; place-items: center; padding: 0 3px; border-radius: 999px; background: #d6ebe7; color: #175c55; font-size: 10px; }

  .toolbar-menu { position: relative; }
  .toolbar-menu:not([open]) > .menu-content { display: none; }
  .toolbar-menu .menu-content {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 70;
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 264px;
    max-height: min(72vh, 560px);
    overflow: auto;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid #dbe3ec;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 14px 38px rgba(15, 23, 42, .18);
  }

  .toolbar-menu .menu-group { display: flex; flex-direction: column; gap: 3px; padding: 5px 0 8px; border-bottom: 1px solid #edf1f5; }
  .toolbar-menu .menu-group:last-child { padding-bottom: 3px; border-bottom: 0; }
  .toolbar-menu .menu-group > span { padding: 4px 8px; color: #7b8796; font: 700 9px/1.2 system-ui, sans-serif; letter-spacing: .09em; text-transform: uppercase; }
  .toolbar-menu .menu-requirement { margin: 0; padding: 6px 9px; color: #75542d; font: 10px/1.4 system-ui, sans-serif; }
  .toolbar-menu .menu-readiness { margin: 0; padding: 4px 9px; color: #596779; font: 11px/1.4 system-ui, sans-serif; }
  .toolbar-menu .menu-readiness.available { color: #176458; }
  .toolbar-menu .menu-readiness.blocked { color: #75542d; }
  .toolbar-menu .menu-blockers { margin: 2px 8px; padding: 5px 7px; border: 1px solid #e6ebf0; border-radius: 7px; background: #fafbfd; color: #526173; font: 11px/1.4 system-ui, sans-serif; }
  .toolbar-menu .menu-blockers summary { cursor: pointer; color: #536174; font-weight: 650; }
  .toolbar-menu .menu-blockers ul { display: grid; gap: 6px; margin: 7px 0 2px; padding: 0 0 0 15px; }
  .toolbar-menu .menu-blockers li strong,
  .toolbar-menu .menu-blockers li span { display: block; }
  .toolbar-menu .menu-blockers li strong { color: #334155; }
  .toolbar-menu .menu-group > button.menu-data-action { padding: 6px 9px; color: #155d55; font-size: 10px; font-weight: 700; }
  .toolbar-menu .menu-content > button,
  .toolbar-menu .menu-group > button {
    display: block;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: #334155;
    cursor: pointer;
    font: 550 12px/1.25 system-ui, sans-serif;
    text-align: left;
  }
  .toolbar-menu .menu-content button:hover:not(:disabled) { background: #f1f6f5; color: #155d55; }
  .toolbar-menu .menu-content button:disabled { color: #94a3b8; cursor: not-allowed; }
  .toolbar-menu .menu-group > button.menu-primary { background: #1d6a61; color: #fff; font-weight: 700; }
  .toolbar-menu .menu-group > button.menu-primary:hover:not(:disabled) { background: #185b53; color: #fff; }
  .toolbar-menu .menu-group > button.menu-primary:disabled { background: #dbe5e3; color: #72827f; }
  .toolbar-menu .view-menu { width: 220px; }
  .toolbar-menu .label-layout-hint { margin: 2px 10px 8px; color: #64748b; font-size: 10px; line-height: 1.4; }
  .toolbar-menu .zoom-menu-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; color: #64748b; font-size: 11px; }
  .toolbar-menu .zoom-menu-row button { display: grid; width: 32px; height: 30px; place-items: center; border: 1px solid #d8e0e9; border-radius: 7px; background: #fff; font-size: 17px; cursor: pointer; }
  .toolbar .search-wrap { flex: 1 1 190px; min-width: 150px; max-width: 290px; }
  .toolbar .search-wrap input { width: 100%; max-width: none; min-height: 36px; box-sizing: border-box; padding: 8px 11px; border: 1px solid #d8e0e9; border-radius: 9px; background: #fff; color: #172033; font: 12px/1.2 system-ui, sans-serif; }
  .toolbar .search-action { min-width: 56px; }
  .toolbar .export-action { border-color: #1d6a61; background: #1d6a61; color: #fff; }
  .toolbar .export-action:hover { border-color: #185b53; background: #185b53; color: #fff; }
  .toolbar-export-status { padding: 5px 8px; border: 1px solid #f3d49a; border-radius: 999px; background: #fff8e8; color: #87520b; font: 650 10px/1.15 system-ui, sans-serif; white-space: nowrap; }
  .solver-worker-status { padding: 4px 7px; border-radius: 6px; background: #fff3ed; color: #9a3412; font-size: 10px; }

  .graph-status-bar {
    position: absolute;
    top: calc(var(--toolbar-top) + var(--toolbar-height, 48px) + 7px);
    left: 16px;
    z-index: 28;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px 13px;
    max-width: min(780px, calc(100vw - 32px));
    box-sizing: border-box;
    padding: 6px 10px;
    border: 1px solid rgba(203, 213, 225, .84);
    border-radius: 8px;
    background: rgba(255, 255, 255, .88);
    color: #334155;
    box-shadow: 0 3px 12px rgba(15, 23, 42, .07);
    font: 10px/1.3 system-ui, sans-serif;
    pointer-events: none;
  }
  .graph-status-bar strong { color: #26384c; font-weight: 750; }
  .graph-status-bar .projection-state { padding-left: 9px; border-left: 1px solid #d7dfe8; }
  .status-dot { display: inline-block; width: 6px; height: 6px; margin: 0 5px 1px 0; border-radius: 50%; background: #cf8731; }
  .witness-state { color: #85510b; }
  .filter-card { top: calc(var(--toolbar-top) + var(--toolbar-height, 48px) + 39px); left: 12px; border: 1px solid rgba(203, 213, 225, .9); border-radius: 12px; background: rgba(255, 255, 255, .96); color: #263449; box-shadow: 0 12px 34px rgba(15, 23, 42, .14); backdrop-filter: blur(10px); }

  .app-root.with-json-editor .toolbar { left: calc(var(--toolbar-left) + 432px); right: 12px; width: auto; max-width: none; }
  .app-root.with-json-editor .graph-status-bar { left: 438px; }

  @media (max-width: 1280px) {
    .toolbar { right: 10px; width: auto; max-width: none; display: flex; grid-template-columns: none; align-items: center; }
    .toolbar > button { min-width: 0; white-space: nowrap; }
    .toolbar .search-wrap { flex: 1 1 180px; min-width: 140px; max-width: 250px; grid-column: auto; }
    .toolbar .search-wrap input { width: 100%; max-width: none; }
  }

  @media (max-width: 900px) {
    .toolbar { right: 8px; left: 8px; gap: 6px; padding: 6px; }
    .toolbar .search-wrap { flex: 1 1 100%; max-width: none; order: 20; }
    .toolbar .search-action { order: 21; }
    .graph-status-bar { left: 8px; max-width: calc(100vw - 16px); gap: 5px 9px; }
    .filter-card { top: calc(var(--toolbar-top) + var(--toolbar-height, 48px) + 39px); left: 8px; max-width: min(360px, calc(100vw - 16px)); max-height: min(55vh, calc(100dvh - var(--toolbar-height, 48px) - 95px)); }
    .app-root.with-json-editor .toolbar { display: none; }
    .app-root.with-json-editor .graph-status-bar { display: none; }
  }

  @media (max-width: 520px) {
    .empty-graph-state { inset: calc(var(--toolbar-top) + 54px) 10px 28px; }
    .empty-graph-actions { display: grid; grid-template-columns: 1fr; margin-top: 17px; }
    .empty-graph-actions button { width: 100%; }
    .toolbar { gap: 5px; }
    .toolbar .toolbar-button, .toolbar-menu > summary { min-height: 34px; padding: 7px 9px; font-size: 11px; }
    .toolbar .search-wrap { min-width: 120px; }
    .toolbar .menu-content { width: min(264px, calc(100vw - 24px)); }
    .toolbar details:first-of-type .menu-content {
      position: fixed;
      top: calc(var(--toolbar-top) + 47px);
      right: 12px;
      left: auto;
    }
    .graph-status-bar { top: calc(var(--toolbar-top) + var(--toolbar-height, 48px) + 5px); padding: 5px 8px; }
  }

  .app-root :global(.solver-panel),
  .app-root :global(.structural-panel),
  .app-root :global(.integrity-panel),
  .app-root :global(.motif-panel),
  .app-root :global(.scenario-comparison-panel) {
    top: calc(var(--toolbar-top) + var(--toolbar-height, 48px) + 42px);
    right: 12px;
    width: min(440px, calc(100vw - 24px));
    max-height: calc(100dvh - var(--toolbar-height, 48px) - 78px - var(--desktop-timeline-reserve, 0px));
    box-sizing: border-box;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid #d7e0e9;
    border-radius: 14px;
    background: rgba(255, 255, 255, .98);
    box-shadow: 0 18px 52px rgba(15, 23, 42, .19);
    color: #172033;
  }

  @media (max-width: 900px) {
    .app-root.projection-controls-open :global(.solver-panel),
    .app-root.projection-controls-open :global(.structural-panel),
    .app-root.projection-controls-open :global(.integrity-panel),
    .app-root.projection-controls-open :global(.motif-panel),
    .app-root.projection-controls-open :global(.scenario-comparison-panel) {
      display: none !important;
    }

    .app-root :global(.solver-panel),
    .app-root :global(.structural-panel),
    .app-root :global(.integrity-panel),
    .app-root :global(.motif-panel),
    .app-root :global(.scenario-comparison-panel) {
      top: auto;
      right: 8px;
      bottom: calc(12px + var(--mobile-filter-timeline-reserve, 0px));
      left: 8px;
      width: auto;
      max-height: calc(100dvh - var(--toolbar-height, 48px) - 88px - var(--mobile-filter-timeline-reserve, 0px));
      border-radius: 14px 14px 8px 8px;
    }
  }
</style>
