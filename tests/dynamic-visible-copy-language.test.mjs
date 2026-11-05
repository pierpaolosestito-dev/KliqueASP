import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGraph2DIncompleteAnalysisSummary,
  buildGraph2DInfeasibleAnalysisSummary,
  buildGraph2DOptimizationCompletionLabel,
  buildGraph2DScenarioComparisonCompletionLabel,
  buildGraph2DStructuralCompletionLabel,
  buildGraph2DTemporalNoRouteDiagnosticSummary
} from "../src/lib/kliqueasp/graph/graph2DAnalysisOutcome.ts";
import {
  GRAPH_CAPABILITY_LABELS,
  GRAPH_TASK_CONTRACTS,
  getTaskEnumerationDescription
} from "../src/lib/kliqueasp/graph/graphTaskContracts.ts";
import { buildGraph2DCliqueResultLabel } from "../src/lib/kliqueasp/graph/graph2DCliqueSummary.ts";
import { buildGraph2DStructuralResultLabel } from "../src/lib/kliqueasp/graph/graph2DStructuralSummary.ts";
import {
  buildGraph2DAnalysisSummary,
  describeActiveGraph2DLabelOverlaps,
  describeGraph2DLabelOverlaps
} from "../src/lib/kliqueasp/graph/graph2dExport.ts";
import { presentAnalysisError } from "../src/lib/kliqueasp/graph/analysisErrorPresentation.ts";
import {
  describeCliqueAnalysisMenuBlocker,
  describeCommunityCountBlocker,
  describeCommunityPairActionBlocker,
  describeDirectedKCoreModeBlocker,
  describeMissingRepairAttributeMappings,
  describeNeighborhoodRadiusBlocker,
  describeStructuralCounterfactualBlocker,
  describeStructuralEndpointBlocker,
  describeStructuralParameterBlocker,
  describeTypedPathCounterfactualBlocker,
  describeTypedPathStepAdditionBlocker
} from "../src/lib/kliqueasp/graph/analysisReadiness.ts";
import { getCliqueTaskLabel, getCliqueTaskQuestion } from "../src/lib/kliqueasp/graph/cliqueTaskCopy.ts";
import { GraphJsonTextParseError } from "../src/lib/kliqueasp/graph/graphJsonText.ts";
import { formatGraphDiagnostic } from "../src/lib/kliqueasp/graph/graphInputValidation.ts";
import { getGraphSearchSuggestionLabel } from "../src/lib/kliqueasp/graph/graphNodeSearch.ts";
import { formatGraphDisplayLinkTooltip } from "../src/lib/kliqueasp/graph/graphVisualization.ts";
import { buildGraphWitnessStatus } from "../src/lib/kliqueasp/graph/graphWitnessStatus.ts";
import { getIntegrityViolationLabel } from "../src/lib/kliqueasp/graph/integrityViolationLabels.ts";
import { describeKPlexMissingTieAllowance } from "../src/lib/kliqueasp/graph/kplexMissingTieSummary.ts";
import { describeNonAdjacencyScope } from "../src/lib/kliqueasp/graph/nonAdjacencyScope.ts";
import { buildIntegrityViolationVisualization } from "../src/lib/kliqueasp/graph/integrityVisualization.ts";
import { getStructuralTaskQuestion } from "../src/lib/kliqueasp/graph/structuralTaskQuestion.ts";

const untranslatedCopy = /\b(?:asp|clingo|solver|answer\s+set|why-not|witness|membership|near-match|walk|round|mapping|pattern|core\s+number|export|upload|download|search|loading|retry|cancel|settings|source|target|reset|clear|close|previous|next|success|failure|input|output)\b/i;

const graphTasks = [
  "kPlex", "maximalKPlex", "kCore", "components", "weakComponents", "strongComponents",
  "path", "typedPath", "dominatingSet", "minimumNodeSeparator", "minimumCostNodeSeparator",
  "minimumEdgeSeparator", "minimumCostEdgeSeparator", "communities"
];
const integrityViolationKinds = [
  "edge_endpoint_type", "missing_endpoint_node_type", "missing_node_type", "missing_edge_type",
  "node_type_out_of_domain", "edge_type_out_of_domain", "missing_node_attribute", "missing_edge_attribute",
  "node_attribute_out_of_domain", "edge_attribute_out_of_domain", "missing_edge_interval",
  "invalid_edge_interval_value", "invalid_edge_interval", "duplicate_node_attribute", "duplicate_edge_attribute",
  "cardinality_min", "cardinality_max"
];
const allOptimaTasks = new Set([
  "dominatingSet", "minimumNodeSeparator", "minimumCostNodeSeparator",
  "minimumEdgeSeparator", "minimumCostEdgeSeparator", "communities"
]);

function getEnumerationContext(task, enumeration) {
  if (task === "clique") return { cliqueMode: enumeration };
  if (task === "kPlex" || task === "contextualClique") return { enumerateAllOptima: enumeration === "all-maximum" };
  if (task === "maximalKPlex") return { enumerateAllMaximalKPlex: enumeration === "all-maximal" };
  if (task === "motifCount") return { partitionedCount: enumeration === "complete-disjoint-partition-sum" };
  if (allOptimaTasks.has(task)) return { enumerateAllOptima: enumeration.startsWith("all-") || enumeration === "all-optima" };
  return {};
}

function collectVisibleMessages() {
  const messages = [
    ...Object.values(GRAPH_CAPABILITY_LABELS),
    ...Object.entries(GRAPH_TASK_CONTRACTS).flatMap(([task, contract]) =>
      contract.supportedEnumeration.map((enumeration) =>
        getTaskEnumerationDescription(task, getEnumerationContext(task, enumeration)))) ,
    ...["all", "maximum", "maximal"].flatMap((mode) => [getCliqueTaskLabel(mode), getCliqueTaskQuestion(mode)]),
    ...["all", "maximum", "maximal"].map((mode) => buildGraph2DCliqueResultLabel({
      mode,
      highlightedNodeCount: 3,
      resultCount: 2,
      group: "ricercatori"
    }) ?? ""),
    ...graphTasks.map((task) => getStructuralTaskQuestion({
      task,
      parameter: 2,
      directedGraph: true,
      kCoreMode: "in",
      pathTemporalSemantics: "orderedByStart",
      strictTemporalOrder: true
    })),
    ...graphTasks.map((task) => buildGraph2DStructuralResultLabel({
      task,
      parameter: 2,
      highlightedNodeCount: 3,
      highlightedEdgeCount: 2,
      group: "ricercatori",
      targetGroup: "partecipanti",
      minimumCutCost: 2,
      minimumNodeRemovalCost: 2,
      hasKCoreProfile: false,
      communityCount: 2,
      communityPartitionIndex: 0,
      communityIndex: 0,
      modularity: 0.42,
      modularityResolution: "1",
      weightedModularity: true
    }) ?? ""),
    ...graphTasks.map((task) => buildGraph2DStructuralCompletionLabel({
      task,
      resultStatus: ["components", "weakComponents", "strongComponents", "path", "typedPath", "maximalKPlex"].includes(task)
        ? "SATISFIABLE"
        : "OPTIMUM FOUND",
      completeModelEnumeration: true,
      maximumKPlexSearchComplete: task === "kPlex",
      hasSolution: true,
      enumerateAllOptima: true,
      enumerateAllMaximalKPlex: task === "maximalKPlex"
    })),
    describeCliqueAnalysisMenuBlocker({ workerStatus: "initializing", dataAvailable: false, dataReasons: [] }),
    describeDirectedKCoreModeBlocker({ directed: true, mode: "" }),
    describeNeighborhoodRadiusBlocker({ radius: 0, maximum: 8 }),
    ...["kPlex", "maximalKPlex", "kCore", "path"].map((task) =>
      describeStructuralParameterBlocker({ task, parameter: -1 })),
    describeCommunityCountBlocker({ minimum: 4, maximum: 2 }),
    ...["path", "typedPath", "minimumNodeSeparator", "minimumCostNodeSeparator", "minimumEdgeSeparator", "minimumCostEdgeSeparator"].map((task) =>
      describeStructuralEndpointBlocker({ task, startNodeId: "", goalNodeId: "" })),
    describeTypedPathStepAdditionBlocker({ availableTypeCount: 0, stepCount: 0 }),
    describeCommunityPairActionBlocker({ analysisAvailable: false, action: "membership", leftNodeId: "", rightNodeId: "" }),
    ...describeMissingRepairAttributeMappings({ nodeAttributes: ["specialità"], edgeAttributes: ["relazione"] }),
    formatGraphDiagnostic({ code: "edge-missing", severity: "error", message: "Manca il tipo di relazione.", recordIndex: 0 }),
    formatGraphDiagnostic({ code: "node-missing", severity: "error", message: "Nome non valido.", recordIndex: 1 }),
    formatGraphDiagnostic({ code: "dataset-missing", severity: "error", message: "Controlla il file." , recordIndex: 2 }),
    formatGraphDisplayLinkTooltip({
      source: "alice",
      target: "bruno",
      visualRecordCount: 2,
      visualSourceIds: ["e-1", "e-2"],
      visualSourceEdgeIdentities: ["e-1", "e-2"]
    }),
    formatGraphDisplayLinkTooltip({
      source: "alice", target: "bruno", visualRecordCount: 1,
      visualSourceIds: ["e-1"], visualSourceEdgeIdentities: ["e-1"]
    }),
    formatGraphDisplayLinkTooltip({
      source: "alice", target: "bruno", visualRecordCount: 2,
      visualSourceIds: [], visualSourceEdgeIdentities: []
    }),
    getGraphSearchSuggestionLabel({ id: "nodo-1", label: "Alice" }),
    getGraphSearchSuggestionLabel({ id: "Alice", label: "Alice" }),
    getGraphSearchSuggestionLabel({ id: "nodo-2", label: "" }),
    buildGraphWitnessStatus(3, 2),
    buildGraphWitnessStatus(1, 0),
    buildGraphWitnessStatus(0, 0),
    ...integrityViolationKinds.map((kind) => getIntegrityViolationLabel(kind)),
    describeKPlexMissingTieAllowance(1),
    describeKPlexMissingTieAllowance(2),
    describeNonAdjacencyScope(),
    describeGraph2DLabelOverlaps(2),
    describeActiveGraph2DLabelOverlaps(1),
    buildGraph2DAnalysisSummary({
      analysisLabel: "Motivo",
      resultSummary: "2 istanze",
      completionLabel: "Conteggio completo",
      kind: "aggregate"
    }).resultLabel,
    buildGraph2DAnalysisSummary({
      analysisLabel: "Gruppo denso",
      resultSummary: "3 risultati",
      completionLabel: "Enumerazione completa",
      kind: "collection"
    }).resultLabel,
    buildIntegrityViolationVisualization({
      kind: "cardinality_min",
      subjectId: "",
      nodeIds: [],
      edgeIds: []
    }, [{ id: "nodo-1" }], []).resultLabel,
    describeTypedPathCounterfactualBlocker({ enabled: true, requirementReasons: [], startNodeId: "", goalNodeId: "", edgeTypeSequence: [] }),
    describeStructuralCounterfactualBlocker({
      invalidTarget: true,
      minimumTarget: 1,
      cohortNodeCount: 0,
      targetNodeSelection: true,
      targetNodeCount: 0,
      targetNodeSelected: false
    }),
    ...[
      "Timeout: limite di calcolo raggiunto",
      "Calcolo annullato",
      "Il worker Clingo non è disponibile",
      "Manca il mapping dell'attributo richiesto",
      "Errore interno del solver",
      "graphMapping.edge.validity.numericUnit non configurato",
      "graphMapping.node.attributes richiede un campo",
      "graphMapping.edge.direction non valida",
      "graphMapping.edge.type mancante",
      "TypeError: source is undefined",
      "La copertura è impossibile, ma la diagnosi dei target non è stata verificata",
      "Il cammino è impossibile, ma la diagnosi non è stata verificata"
    ].map((message) => presentAnalysisError(message).message),
    new GraphJsonTextParseError("dataset", new SyntaxError("Unexpected token")).message,
    ...[
      buildGraph2DIncompleteAnalysisSummary("Timeout: solver non completato")?.completionLabel,
      buildGraph2DIncompleteAnalysisSummary("Errore di esecuzione")?.completionLabel,
      buildGraph2DInfeasibleAnalysisSummary("Cammino", "nessun cammino ammissibile").completionLabel,
      buildGraph2DTemporalNoRouteDiagnosticSummary(true).completionLabel,
      buildGraph2DTemporalNoRouteDiagnosticSummary(false).completionLabel,
      buildGraph2DOptimizationCompletionLabel({
        optimizationProven: true,
        hasSolution: true,
        enumerateAllOptima: true,
        allOptimaEnumerationComplete: true
      }),
      buildGraph2DStructuralCompletionLabel({
        task: "minimumNodeSeparator",
        resultStatus: "OPTIMUM FOUND",
        completeModelEnumeration: true,
        hasSolution: true,
        enumerateAllOptima: false
      }),
      buildGraph2DScenarioComparisonCompletionLabel({ analysisLabel: "triadi", scenarioCount: 2 })
    ]
  ];
  return messages.filter((message) => typeof message === "string" && message.trim());
}

test("shared analysis helpers return Italian, graph-readable dynamic interface copy", () => {
  const hits = collectVisibleMessages().filter((message) => untranslatedCopy.test(message));
  assert.deepEqual(hits, [], `testi dinamici da rivedere:\n${hits.join("\n")}`);
});
