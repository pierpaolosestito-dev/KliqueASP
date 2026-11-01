import { getGraphEndpointId, normalizeGraphData, normalizeGraphId, type GraphDiagnostic } from "./graphModel.ts";
import { validateGraphDataset } from "./projectFile.ts";

export type GraphInputInspection = {
  status: "ready" | "warning" | "error";
  nodeCount: number | null;
  edgeCount: number | null;
  direction: "directed" | "undirected" | null;
  nodeTypeCount: number | null;
  edgeTypeCount: number | null;
  mappedAttributeCount: number | null;
  errorCount: number;
  warningCount: number;
  diagnostics: GraphDiagnostic[];
  previewNodes: Array<{ id: string; label: string; type: string }>;
  previewLinks: Array<{ id: string; source: string; target: string; type: string; directed: boolean }>;
};

export type GraphInputPreview = {
  nodes: GraphInputInspection["previewNodes"];
  links: GraphInputInspection["previewLinks"];
  totalNodeCount: number;
  totalMappedLinkCount: number;
  datasetEdgeCount: number;
  sampleLinkCount: number;
};

function evenlySample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  if (limit <= 1) return items.length ? [items[0]] : [];
  return Array.from({ length: limit }, (_, index) =>
    items[Math.round(index * (items.length - 1) / (limit - 1))]
  );
}

function normalizePreviewLimit(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback;
}

/** Builds a bounded, deterministic induced-subgraph preview without suggesting it is complete. */
export function buildGraphInputPreview(
  nodes: GraphInputInspection["previewNodes"],
  links: GraphInputInspection["previewLinks"],
  datasetEdgeCount: number,
  maxNodes = 80,
  maxLinks = 500
): GraphInputPreview {
  const nodeLimit = normalizePreviewLimit(maxNodes, 80);
  const linkLimit = normalizePreviewLimit(maxLinks, 500);
  const sampledNodes = evenlySample(nodes, nodeLimit);
  const sampledNodeIds = new Set(sampledNodes.map((node) => node.id));
  const sampleLinks = links.filter((link) => sampledNodeIds.has(link.source) && sampledNodeIds.has(link.target));
  return {
    nodes: sampledNodes,
    links: evenlySample(sampleLinks, linkLimit),
    totalNodeCount: nodes.length,
    totalMappedLinkCount: links.length,
    datasetEdgeCount,
    sampleLinkCount: sampleLinks.length
  };
}

export function formatGraphDiagnostic(diagnostic: GraphDiagnostic): string {
  if (diagnostic.recordIndex === undefined || /\b(?:nodo|arco)\s+\d+/i.test(diagnostic.message)) {
    return diagnostic.message;
  }
  const code = diagnostic.code.toLowerCase();
  const recordType = code.includes("node") ? "nodo" : code.includes("edge") ? "arco" : "record";
  return `${recordType} ${diagnostic.recordIndex + 1}: ${diagnostic.message}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failedInspection(code: string, message: string): GraphInputInspection {
  return {
    status: "error",
    nodeCount: null,
    edgeCount: null,
    direction: null,
    nodeTypeCount: null,
    edgeTypeCount: null,
    mappedAttributeCount: null,
    errorCount: 1,
    warningCount: 0,
    diagnostics: [{ code, severity: "error", message }],
    previewNodes: [],
    previewLinks: []
  };
}

/** Performs the same graph normalization used by the app against the editor draft. */
export function inspectGraphInput(configText: string, datasetText: string): GraphInputInspection {
  let config: unknown;
  try {
    config = JSON.parse(configText);
  } catch (error) {
    return failedInspection(
      "invalid-config-json",
      `Configurazione JSON non valida: ${error instanceof Error ? error.message : "controlla la sintassi"}`
    );
  }
  if (!isRecord(config)) {
    return failedInspection("invalid-config-root", "La configurazione JSON deve essere un oggetto.");
  }

  let dataset: unknown;
  try {
    dataset = JSON.parse(datasetText);
  } catch (error) {
    return failedInspection(
      "invalid-dataset-json",
      `Dataset JSON non valido: ${error instanceof Error ? error.message : "controlla la sintassi"}`
    );
  }

  try {
    validateGraphDataset(dataset);
  } catch (error) {
    return failedInspection(
      "invalid-dataset-shape",
      error instanceof Error ? error.message : "Il dataset non ha la struttura richiesta."
    );
  }

  const graph = normalizeGraphData(dataset, config);
  const diagnostics = graph.diagnostics;
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warningCount = diagnostics.length - errorCount;
  const graphMapping = isRecord(config.graphMapping) ? config.graphMapping : {};
  const nodeMapping = isRecord(graphMapping.node) ? graphMapping.node : {};
  const edgeMapping = isRecord(graphMapping.edge) ? graphMapping.edge : {};
  const nodeAttributes = isRecord(nodeMapping.attributes) ? Object.keys(nodeMapping.attributes).length : 0;
  const edgeAttributes = isRecord(edgeMapping.attributes) ? Object.keys(edgeMapping.attributes).length : 0;
  const previewNodes = errorCount === 0
    ? graph.nodes.map((node) => ({
        id: String(node.id),
        label: String(node.label ?? node.id),
        type: String(node.type ?? "")
      }))
    : [];
  const validPreviewNodeIds = new Set(previewNodes.map((node) => node.id));
  const previewLinks = errorCount === 0
    ? graph.links.flatMap((link, index) => {
        const source = normalizeGraphId(getGraphEndpointId(link.source));
        const target = normalizeGraphId(getGraphEndpointId(link.target));
        if (!source || !target || !validPreviewNodeIds.has(source) || !validPreviewNodeIds.has(target)) return [];
        return [{
          id: String(link.sourceId ?? link.analysis?.id ?? `arco-${index + 1}`),
          source,
          target,
          type: String(link.analysis?.type ?? link.type ?? ""),
          directed: link.analysis?.direction === "directed" || graph.direction === "directed"
        }];
      })
    : [];
  return {
    status: errorCount ? "error" : warningCount ? "warning" : "ready",
    nodeCount: dataset.nodes.length,
    edgeCount: Array.isArray(dataset.edges) ? dataset.edges.length : dataset.links?.length ?? 0,
    direction: graph.direction,
    nodeTypeCount: new Set(graph.nodes.map((node) => String(node.type ?? "").trim()).filter(Boolean)).size,
    edgeTypeCount: new Set(graph.links.map((link) => String(link.analysis?.type ?? link.type ?? "").trim()).filter(Boolean)).size,
    mappedAttributeCount: nodeAttributes + edgeAttributes,
    errorCount,
    warningCount,
    diagnostics,
    previewNodes,
    previewLinks
  };
}
