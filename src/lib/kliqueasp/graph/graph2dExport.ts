import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
import { getStructuralEdgeIdentity, mapSourceEdgeIdsToStructuralIdentities } from "./structuralTasks.ts";
import { describeNonAdjacencyScope } from "./nonAdjacencyScope.ts";

export type Graph2DLinkInput = {
  source: unknown;
  target: unknown;
  sourceId?: unknown;
  sourceIdGenerated?: boolean;
  type?: unknown;
  hypothetical?: boolean;
  /** Marks a missing pair in the analyzed graph; it is never an observed or proposed edge. */
  absence?: boolean;
  absenceDescription?: string;
  analysis?: Record<string, unknown>;
  [key: string]: unknown;
};

export type Graph2DHypotheticalEdgeInput = {
  id: string | number;
  sourceNodeId: string | number;
  targetNodeId: string | number;
  edgeType?: string;
  cost?: number;
  description?: string;
};

export type Graph2DNodeInput = {
  id: unknown;
  label?: unknown;
  type?: unknown;
  analysis?: Record<string, unknown>;
  [key: string]: unknown;
};

export type Graph2DMode = "projection" | "witness";

export type Graph2DEdgeAnnotation = {
  label: string;
  description?: string;
  color?: string;
  dashPattern?: "solid" | "dashed" | "dotted";
};

const GRAPH2D_RELATION_DASH_PATTERNS = [
  "",
  "10 4",
  "4 4",
  "10 3 2 3",
  "3 3 10 3",
  "12 3 4 3 2 3",
  "4 3 12 3 2 3",
  "12 2 3 2 7 2"
] as const;

export type Graph2DPathAnnotations = {
  nodeAnnotations: Record<string, string>;
  edgeAnnotations: Record<string, Graph2DEdgeAnnotation>;
};

/** Builds compact step annotations for a selected path or temporal walk. */
export function buildGraph2DPathAnnotations(
  nodeIds: readonly string[],
  edgeIdsByStep: readonly (readonly string[])[] = []
): Graph2DPathAnnotations {
  const nodeSteps = new Map<string, number[]>();
  nodeIds.forEach((rawId, index) => {
    const id = String(rawId).trim();
    if (!id) return;
    const steps = nodeSteps.get(id) ?? [];
    steps.push(index + 1);
    nodeSteps.set(id, steps);
  });

  const stepLabel = (steps: readonly number[]) =>
    `${steps.length === 1 ? "passo" : "passi"} ${steps.join(", ")} del cammino`;
  const nodeAnnotations = Object.fromEntries([...nodeSteps].map(([id, steps]) => [id, stepLabel(steps)]));
  const edgeSteps = new Map<string, number[]>();
  edgeIdsByStep.forEach((edgeIds, index) => {
    for (const rawId of edgeIds) {
      const id = String(rawId).trim();
      if (!id) continue;
      const steps = edgeSteps.get(id) ?? [];
      if (!steps.includes(index + 1)) steps.push(index + 1);
      edgeSteps.set(id, steps);
    }
  });
  const edgeAnnotations = Object.fromEntries([...edgeSteps].map(([id, steps]) => [id, {
    label: "Arco del cammino",
    description: stepLabel(steps),
    color: "#2563eb"
  }]));

  return { nodeAnnotations, edgeAnnotations };
}

export type Graph2DScene = {
  width: number;
  height: number;
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    color: string;
    /** Non-null only when the displayed fill encodes the node's configured type. */
    nodeTypeColor?: string | null;
    /** True when the selected-node fill is visible instead of a node-group color. */
    selectedColorApplied?: boolean;
    x: number;
    y: number;
    selected: boolean;
    annotation: string;
    nodeGroupId?: string;
    communityId: string;
  }>;
  links: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    color: string;
    relationColor: string;
    annotation: Graph2DEdgeAnnotation | null;
    directed: boolean;
    selected: boolean;
    hypothetical: boolean;
    absence: boolean;
    absenceDescription: string;
    contextOnly: boolean;
  }>;
};

export type Graph2DSceneOptions = {
  mode?: Graph2DMode;
  width?: number;
  height?: number;
  graphDirection?: "directed" | "undirected";
  highlightedNodeIds?: Iterable<string>;
  highlightedEdgeIds?: Iterable<string>;
  edgeColors?: unknown;
  nodeColors?: unknown;
  nodeTypeStyles?: unknown;
  nodeGroupIds?: unknown;
  communityByNodeId?: unknown;
  nodeAnnotations?: unknown;
  edgeAnnotations?: Record<string, Graph2DEdgeAnnotation>;
  seed?: number;
};

export type Graph2DSvgOptions = {
  title?: string;
  scopeLabel?: string;
  showLabels?: boolean;
  showNodeIds?: boolean;
  showLegend?: boolean;
  transparentBackground?: boolean;
  showAnnotations?: boolean;
  communityLegend?: Array<{ id: string; label: string; color: string }>;
  nodeGroupLegend?: {
    title: string;
    items: Array<{ id: string; label: string; color: string }>;
    overflowLabel: string;
  };
  resultLabel?: string;
  completionLabel?: string;
};

export type Graph2DCommunityPresentation = {
  communityByNodeId: Record<string, string>;
  nodeColors: Record<string, string>;
  communityLegend: Array<{ id: string; label: string; color: string }>;
};

export type Graph2DNodeGroupPresentation = {
  groupByNodeId: Record<string, string>;
  nodeColors: Record<string, string>;
  legend: Array<{ id: string; label: string; color: string }>;
};

function graph2DCommunityColor(index: number): string {
  return graph2DPaletteColor(index, 0.62, 0.43);
}

function graph2DRelationTypeColor(index: number): string {
  return graph2DPaletteColor(index, 0.7, 0.34);
}

function graph2DPaletteColor(index: number, saturation: number, lightness: number): string {
  const hue = ((index * 137.508 + 218) % 360 + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const segment = hue / 60;
  const second = chroma * (1 - Math.abs(segment % 2 - 1));
  const [red, green, blue] = segment < 1 ? [chroma, second, 0]
    : segment < 2 ? [second, chroma, 0]
      : segment < 3 ? [0, chroma, second]
        : segment < 4 ? [0, second, chroma]
          : segment < 5 ? [second, 0, chroma]
            : [chroma, 0, second];
  const offset = lightness - chroma / 2;
  return "#" + [red, green, blue]
    .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0"))
    .join("");
}

/** Maps a parsed node partition to stable colors, group IDs, and a legend. */
export function buildGraph2DNodeGroupPresentation(
  groups: readonly (readonly string[])[],
  groupLabel: string,
  idPrefix = "g"
): Graph2DNodeGroupPresentation {
  const groupByNodeId = Object.create(null) as Record<string, string>;
  const nodeColors = Object.create(null) as Record<string, string>;
  const legend = groups.map((group, index) => {
    const id = `${idPrefix}${index + 1}`;
    const color = graph2DCommunityColor(index);
    for (const rawNodeId of group) {
      const nodeId = String(rawNodeId).trim();
      if (!nodeId) continue;
      if (!Object.prototype.hasOwnProperty.call(groupByNodeId, nodeId)) {
        groupByNodeId[nodeId] = id;
        nodeColors[nodeId] = color;
      }
    }
    return { id, label: `${groupLabel} ${index + 1}`, color };
  });
  return { groupByNodeId, nodeColors, legend };
}

/** Maps modularity communities with their established IDs and Italian legend labels. */
export function buildGraph2DCommunityPresentation(
  communities: readonly (readonly string[])[]
): Graph2DCommunityPresentation {
  const presentation = buildGraph2DNodeGroupPresentation(communities, "Comunità", "c");
  return {
    communityByNodeId: presentation.groupByNodeId,
    nodeColors: presentation.nodeColors,
    communityLegend: presentation.legend
  };
}

/** Maps a connected-component partition to colors shared by preview and SVG. */
export function buildGraph2DComponentPresentation(
  components: readonly (readonly string[])[],
  componentLabel = "Componente"
): Graph2DNodeGroupPresentation {
  return buildGraph2DNodeGroupPresentation(components, componentLabel, "p");
}

/** Formats the observed scope consistently in the preview and in generated SVG files. */
export function formatGraph2DSceneCountSummary(
  nodeCount: number,
  observedEdgeCount: number,
  proposedEdgeCount = 0,
  absentPairCount = 0
): string {
  const nodes = Number.isFinite(nodeCount) ? Math.max(0, Math.trunc(nodeCount)) : 0;
  const observedEdges = Number.isFinite(observedEdgeCount) ? Math.max(0, Math.trunc(observedEdgeCount)) : 0;
  const proposedEdges = Number.isFinite(proposedEdgeCount) ? Math.max(0, Math.trunc(proposedEdgeCount)) : 0;
  const absentPairs = Number.isFinite(absentPairCount) ? Math.max(0, Math.trunc(absentPairCount)) : 0;
  const nodeSummary = `${nodes} ${nodes === 1 ? "nodo" : "nodi"}`;
  const observedEdgeSummary = `${observedEdges} ${observedEdges === 1 ? "arco osservato" : "archi osservati"}`;
  const proposedEdgeSummary = `${proposedEdges} ${proposedEdges === 1 ? "arco proposto" : "archi proposti"}`;
  const edgeSummary = proposedEdges > 0 || absentPairs > 0
    ? `${observedEdgeSummary}${proposedEdges > 0
      ? ` · ${proposedEdgeSummary}`
      : ""}`
    : `${observedEdges} ${observedEdges === 1 ? "arco" : "archi"}`;
  const absentSummary = absentPairs > 0
    ? `${absentPairs} ${absentPairs === 1 ? "coppia non adiacente" : "coppie non adiacenti"}`
    : "";
  return [nodeSummary, edgeSummary, absentSummary].filter(Boolean).join(" · ");
}

/** Creates display-only markers for non-edges, keeping them distinct from source and proposed edges. */
export function buildGraph2DAbsenceLinks(
  absentPairs: readonly (readonly [string, string])[],
  options: { scope: string; description: string; reservedSourceIds?: Iterable<unknown> }
): Graph2DLinkInput[] {
  const scope = options.scope.trim() || "analysis";
  const description = options.description.trim();
  const reservedIds = new Set([...options.reservedSourceIds ?? []].map(String));
  const seenPairs = new Set<string>();

  return absentPairs.flatMap(([rawFirst, rawSecond]) => {
    const [source, target] = [String(rawFirst).trim(), String(rawSecond).trim()]
      .sort((left, right) => left.localeCompare(right));
    if (!source || !target || source === target) return [];
    const pairKey = JSON.stringify([source, target]);
    if (seenPairs.has(pairKey)) return [];
    seenPairs.add(pairKey);

    const baseId = `graph2d-absence:${scope}:${encodeURIComponent(pairKey)}`;
    let id = baseId;
    let suffix = 1;
    while (reservedIds.has(id)) id = `${baseId}:${suffix++}`;
    reservedIds.add(id);
    return [{
      source,
      target,
      sourceId: id,
      absence: true,
      absenceDescription: description,
      analysis: { id, direction: "undirected", absence: true }
    }];
  });
}

export type Graph2DAnalysisSummary = {
  resultLabel: string;
  completionLabel: string;
  kind?: "aggregate" | "collection";
};

export const GRAPH2D_NODE_TEXT_LIMIT = 500;

export function canShowGraph2DNodeText(nodeCount: number): boolean {
  return Number.isSafeInteger(nodeCount) && nodeCount >= 0 && nodeCount <= GRAPH2D_NODE_TEXT_LIMIT;
}

/** Describes an aggregate or result list without pretending it has a selected witness. */
export function buildGraph2DAnalysisSummary(options: {
  analysisLabel: string;
  resultSummary: string;
  completionLabel: string;
  kind: "aggregate" | "collection";
}): Graph2DAnalysisSummary {
  const analysisLabel = options.analysisLabel.trim();
  const resultSummary = options.resultSummary.trim();
  if (!analysisLabel || !resultSummary) throw new TypeError("L'analisi 2D deve avere un nome e un riepilogo.");
  const witnessStatus = options.kind === "aggregate"
    ? "Conteggio aggregato · nessun testimone singolo"
    : "Nessun testimone selezionato";
  return {
    resultLabel: `${analysisLabel} · ${resultSummary} · ${witnessStatus}`,
    completionLabel: options.completionLabel.trim(),
    kind: options.kind
  };
}

/** Turns a verified counterfactual proposal into display-only links for the 2D preview. */
export function buildGraph2DHypotheticalLinks(
  analysisId: string,
  edges: readonly Graph2DHypotheticalEdgeInput[],
  direction: "directed" | "undirected"
): Graph2DLinkInput[] {
  const scope = analysisId.trim().replace(/[^\da-z_-]+/gi, "-") || "analysis";
  return edges.map((edge) => {
    const id = `hypothetical:${scope}:${String(edge.id)}`;
    return {
      source: String(edge.sourceNodeId),
      target: String(edge.targetNodeId),
      sourceId: id,
      type: typeof edge.edgeType === "string" ? edge.edgeType : "",
      hypothetical: true,
      analysis: { id, type: typeof edge.edgeType === "string" ? edge.edgeType : "", direction, hypothetical: true }
    };
  });
}

/** Adds cost and status details to SVG edge titles and the optional relation legend. */
export function buildGraph2DHypotheticalEdgeAnnotations(
  analysisId: string,
  edges: readonly Graph2DHypotheticalEdgeInput[]
): Record<string, Graph2DEdgeAnnotation> {
  const scope = analysisId.trim().replace(/[^\da-z_-]+/gi, "-") || "analysis";
  return Object.fromEntries(edges.map((edge) => {
    const id = `hypothetical:${scope}:${String(edge.id)}`;
    const details = [
      Number.isFinite(edge.cost) ? `Costo candidato ${edge.cost}` : "Costo candidato non specificato",
      edge.description?.trim()
    ].filter(Boolean).join(" · ");
    return [`source:${id}`, {
      // Keep the legend compact even when a proposal has many different costs.
      // The per-edge cost and any additional evidence remain in the SVG title.
      label: "Costo candidato",
      description: details,
      color: "#7c3aed",
      dashPattern: "dashed"
    }];
  }));
}

/** Keeps counterfactual witnesses anchored to their observed evidence in the source graph. */
export function buildGraph2DCounterfactualEvidenceEdgeIdentities(
  links: readonly Graph2DLinkInput[],
  witnessNodeIds: readonly string[],
  pathEdgeIds?: readonly string[]
): Set<string> {
  if (pathEdgeIds !== undefined) {
    return mapSourceEdgeIdsToStructuralIdentities(pathEdgeIds, [...links]);
  }

  const witnessNodes = new Set(witnessNodeIds.map(stableId).filter(Boolean));
  return new Set(links
    .filter((link) => witnessNodes.has(endpointId(link.source)) && witnessNodes.has(endpointId(link.target)))
    .map((link) => getStructuralEdgeIdentity(link)));
}

const MAX_FORCE_LAYOUT_NODES = 700;

function endpointId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return "";
}

function getLinkType(link: Graph2DLinkInput): string {
  const value = link.analysis?.type ?? link.type;
  return typeof value === "string" ? value.trim() : "";
}

function getLinkColor(link: Graph2DLinkInput, colors: unknown): string {
  const type = getLinkType(link);
  return getConfiguredLinkColor(type, colors) ?? "#75859a";
}

function getConfiguredLinkColor(type: string, colors: unknown): string | null {
  if (type && colors && typeof colors === "object" && !Array.isArray(colors) &&
    Object.prototype.hasOwnProperty.call(colors, type)) {
    const color = (colors as Record<string, unknown>)[type];
    if (typeof color === "string" && /^#[\da-f]{3,8}$/i.test(color.trim())) return color.trim();
  }
  return null;
}

function mappedString(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : "";
}

function getMappedNodeColor(id: string, colors: unknown): string | null {
  const color = mappedString(colors, id).trim();
  return color && /^#[\da-f]{3,8}$/i.test(color) ? color : null;
}

function getConfiguredNodeTypeColor(type: string, stylesByType: unknown): string | null {
  if (!stylesByType || typeof stylesByType !== "object" || Array.isArray(stylesByType)) return null;
  const styles = stylesByType as Record<string, unknown>;
  const configuredStyle = type && Object.prototype.hasOwnProperty.call(styles, type)
    ? styles[type]
    : undefined;
  const defaultStyle = Object.prototype.hasOwnProperty.call(styles, "default")
    ? styles.default
    : undefined;
  const style = configuredStyle && typeof configuredStyle === "object" && !Array.isArray(configuredStyle)
    ? configuredStyle as Record<string, unknown>
    : null;
  const defaultStyleRecord = defaultStyle && typeof defaultStyle === "object" && !Array.isArray(defaultStyle)
    ? defaultStyle as Record<string, unknown>
    : null;
  const configuredColor = typeof style?.color === "string" ? style.color.trim() : "";
  if (configuredColor && /^#[\da-f]{3,8}$/i.test(configuredColor)) return configuredColor;
  const defaultColor = typeof defaultStyleRecord?.color === "string" ? defaultStyleRecord.color.trim() : "";
  return defaultColor && /^#[\da-f]{3,8}$/i.test(defaultColor) ? defaultColor : null;
}

function getNodeColor(
  id: string,
  selected: boolean,
  colors: unknown,
  nodeTypeColor: string | null
): string {
  const nodeColor = getMappedNodeColor(id, colors);
  if (nodeColor) return nodeColor;
  if (selected) return "#f59e0b";
  return nodeTypeColor ?? "#2f8f83";
}

function describeSvgDescriptionList(label: string, values: readonly string[]): string {
  const items = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (items.length === 0) return "";
  const shown = items.slice(0, 8).map((item) => item.length > 80 ? item.slice(0, 79) + "…" : item);
  const omitted = items.length - shown.length;
  return `${label}: ${shown.join(", ")}${omitted > 0 ? `; altri ${omitted}` : ""}`;
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapGraph2DCaption(text: string, width: number, maximumLines: number): string[] {
  if (!text.trim() || maximumLines < 1) return [];
  const maximumCharacters = Math.max(12, Math.floor(Math.max(1, width - 56) / 6.2));
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/u)) {
    const wordCharacters = Array.from(word);
    if (line && Array.from(line).length + 1 + wordCharacters.length <= maximumCharacters) {
      line += ` ${word}`;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    let remainder = wordCharacters;
    while (remainder.length > maximumCharacters) {
      lines.push(remainder.slice(0, maximumCharacters).join(""));
      remainder = remainder.slice(maximumCharacters);
    }
    line = remainder.join("");
  }
  if (line) lines.push(line);
  if (lines.length <= maximumLines) return lines;

  const visibleLines = lines.slice(0, maximumLines);
  const lastLine = Array.from(visibleLines[maximumLines - 1] ?? "");
  visibleLines[maximumLines - 1] = `${lastLine.slice(0, Math.max(0, maximumCharacters - 1)).join("").trimEnd()}…`;
  return visibleLines;
}

type Graph2DNodeLabelLayout = {
  x: number;
  y: number;
  anchor: "start" | "end";
  visibleLabel: string;
  width: number;
};

function getGraph2DNodeLabelLayout(
  node: Graph2DScene["nodes"][number],
  labelText: string,
  radius: number,
  width: number
): Graph2DNodeLabelLayout {
  const fontSize = 11;
  const edgePadding = 14;
  const gap = 4;
  const estimatedWidth = Array.from(labelText).length * fontSize * 0.65;
  const rightX = node.x + radius + gap;
  const leftX = node.x - radius - gap;
  const availableRight = Math.max(0, width - edgePadding - rightX);
  const availableLeft = Math.max(0, leftX - edgePadding);
  const useRight = estimatedWidth <= availableRight || availableRight >= availableLeft;
  const anchor = useRight ? "start" : "end";
  const x = useRight ? rightX : leftX;
  const available = useRight ? availableRight : availableLeft;
  const maximumCharacters = Math.floor(available / (fontSize * 0.65));
  const characters = Array.from(labelText);
  const visibleLabel = characters.length <= maximumCharacters
    ? labelText
    : maximumCharacters > 2
      ? characters.slice(0, maximumCharacters - 1).join("") + "…"
      : maximumCharacters === 2 ? "…" : "";
  return {
    x,
    y: node.y + 3.5,
    anchor,
    visibleLabel,
    width: Array.from(visibleLabel).length * fontSize * 0.65
  };
}

function graph2DNodeLabelText(
  node: Graph2DScene["nodes"][number],
  options: { showLabels: boolean; showNodeIds: boolean; showAnnotations: boolean }
): string {
  return [options.showLabels ? node.label : "", options.showNodeIds ? "ID " + node.id : "", options.showAnnotations ? node.annotation : ""]
    .filter(Boolean)
    .join(" · ");
}

export function countGraph2DNodeLabelOverlaps(
  scene: Graph2DScene,
  options: { showLabels?: boolean; showNodeIds?: boolean; showAnnotations?: boolean } = {}
): number {
  const display = {
    showLabels: options.showLabels ?? true,
    showNodeIds: options.showNodeIds ?? false,
    showAnnotations: options.showAnnotations ?? false
  };
  const bounds = scene.nodes.flatMap((node) => {
    const labelText = graph2DNodeLabelText(node, display);
    if (!labelText) return [];
    const layout = getGraph2DNodeLabelLayout(node, labelText, node.selected ? 9 : 6.5, scene.width);
    if (!layout.visibleLabel) return [];
    const left = layout.anchor === "end" ? layout.x - layout.width : layout.x;
    return [{ left, right: left + layout.width, top: layout.y - 8.5, bottom: layout.y + 4 }];
  });

  let overlaps = 0;
  for (let left = 0; left < bounds.length; left += 1) {
    for (let right = left + 1; right < bounds.length; right += 1) {
      const a = bounds[left];
      const b = bounds[right];
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps += 1;
    }
  }
  return overlaps;
}

export function describeGraph2DLabelOverlaps(count: number): string {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (safeCount === 1) return "una coppia di etichette si sovrapporrebbe";
  return `${safeCount} coppie di etichette si sovrapporrebbero`;
}

export function describeActiveGraph2DLabelOverlaps(count: number): string {
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (safeCount === 1) return "Le etichette attive si sovrappongono in una coppia";
  return `Le etichette attive si sovrappongono in ${safeCount} coppie`;
}

function renderGraph2DNodeLabel(
  node: Graph2DScene["nodes"][number],
  labelText: string,
  radius: number,
  width: number
): string {
  const layout = getGraph2DNodeLabelLayout(node, labelText, radius, width);
  const position = ' x="' + layout.x + '" y="' + layout.y + '" text-anchor="' + layout.anchor + '" font-size="11" font-family="Arial, Helvetica, sans-serif"';
  const visibleLabel = escapeXml(layout.visibleLabel);
  return '<g><text aria-hidden="true"' + position + ' fill="#ffffff" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round">' + visibleLabel + '</text><text' + position + ' fill="#172033"><title>' + escapeXml(labelText) + "</title>" + visibleLabel + "</text></g>";
}

function createRandom(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0 || 1;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function stableId(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Counts the exact nodes and edge records that the selected 2D mode would render. */
export function estimateGraph2DSceneSize(
  nodeInputs: readonly Graph2DNodeInput[],
  linkInputs: readonly Graph2DLinkInput[],
  options: Pick<Graph2DSceneOptions, "mode" | "highlightedNodeIds" | "highlightedEdgeIds"> = {}
): { nodeCount: number; edgeCount: number } {
  const nodeIds = new Set(nodeInputs.map((node) => stableId(node.id)).filter(Boolean));
  const mode = options.mode ?? "projection";
  if (mode === "projection") {
    let edgeCount = 0;
    for (const link of linkInputs) {
      if (link.absence === true || link.analysis?.absence === true) continue;
      if (nodeIds.has(endpointId(link.source)) && nodeIds.has(endpointId(link.target))) edgeCount += 1;
    }
    return { nodeCount: nodeIds.size, edgeCount };
  }

  const includedNodeIds = new Set([...options.highlightedNodeIds ?? []].filter((id) => nodeIds.has(id)));
  const highlightedEdges = new Set(options.highlightedEdgeIds ?? []);
  let selectedEdgeCount = 0;
  for (const link of linkInputs) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    const hypothetical = link.hypothetical === true || link.analysis?.hypothetical === true;
    const absence = link.absence === true || link.analysis?.absence === true;
    if (!highlightedEdges.has(getStructuralEdgeIdentity(link)) && !hypothetical && !absence) continue;
    selectedEdgeCount += 1;
    includedNodeIds.add(source);
    includedNodeIds.add(target);
  }

  if (selectedEdgeCount > 0) return { nodeCount: includedNodeIds.size, edgeCount: selectedEdgeCount };

  let inducedEdgeCount = 0;
  for (const link of linkInputs) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (includedNodeIds.has(source) && includedNodeIds.has(target)) inducedEdgeCount += 1;
  }
  return { nodeCount: includedNodeIds.size, edgeCount: inducedEdgeCount };
}

export type Graph2DProjectionPreviewSample = {
  nodes: Graph2DNodeInput[];
  links: Graph2DLinkInput[];
  totalNodeCount: number;
  totalEdgeCount: number;
};

function stablePreviewHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Selects a deterministic, explicitly lossy overview for large projection previews. */
export function sampleGraph2DProjectionPreview(
  nodeInputs: readonly Graph2DNodeInput[],
  linkInputs: readonly Graph2DLinkInput[],
  options: {
    maxNodes?: number;
    maxEdges?: number;
    highlightedNodeIds?: readonly string[];
    highlightedEdgeIds?: readonly string[];
  } = {}
): Graph2DProjectionPreviewSample {
  const maxNodes = Number.isSafeInteger(options.maxNodes) && Number(options.maxNodes) > 0
    ? Number(options.maxNodes)
    : 2_400;
  const maxEdges = Number.isSafeInteger(options.maxEdges) && Number(options.maxEdges) > 0
    ? Number(options.maxEdges)
    : 10_000;
  const nodeById = new Map<string, Graph2DNodeInput>();
  for (const node of nodeInputs) {
    const id = stableId(node.id);
    if (id && !nodeById.has(id)) nodeById.set(id, node);
  }
  const allNodeIds = new Set(nodeById.keys());
  const allLinks = linkInputs.filter((link) => {
    if (link.absence === true || link.analysis?.absence === true) return false;
    return allNodeIds.has(endpointId(link.source)) && allNodeIds.has(endpointId(link.target));
  });
  const selectedNodeIds = new Set<string>();
  for (const id of options.highlightedNodeIds ?? []) {
    if (allNodeIds.has(id) && selectedNodeIds.size < maxNodes) selectedNodeIds.add(id);
  }
  const highlightedEdges = new Set(options.highlightedEdgeIds ?? []);
  for (const link of allLinks) {
    if (!highlightedEdges.has(getStructuralEdgeIdentity(link))) continue;
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    for (const id of [source, target]) {
      if (selectedNodeIds.size >= maxNodes) break;
      selectedNodeIds.add(id);
    }
  }

  const candidateNodes = [...nodeById.keys()]
    .filter((id) => !selectedNodeIds.has(id))
    .sort((left, right) => stablePreviewHash(left) - stablePreviewHash(right) || left.localeCompare(right));
  for (const id of candidateNodes) {
    if (selectedNodeIds.size >= maxNodes) break;
    selectedNodeIds.add(id);
  }

  const candidateLinks = allLinks.filter((link) =>
    selectedNodeIds.has(endpointId(link.source)) && selectedNodeIds.has(endpointId(link.target))
  );
  const requiredLinks: Graph2DLinkInput[] = [];
  const optionalLinks: Graph2DLinkInput[] = [];
  for (const link of candidateLinks) {
    if (highlightedEdges.has(getStructuralEdgeIdentity(link))) requiredLinks.push(link);
    else optionalLinks.push(link);
  }
  const sampledOptionalLinks = optionalLinks.length <= Math.max(0, maxEdges - requiredLinks.length)
    ? optionalLinks
    : optionalLinks
      .map((link, index) => ({
        link,
        index,
        hash: stablePreviewHash(`${String(getStructuralEdgeIdentity(link))}:${index}`)
      }))
      .sort((left, right) => left.hash - right.hash || left.index - right.index)
      .slice(0, Math.max(0, maxEdges - requiredLinks.length))
      .sort((left, right) => left.index - right.index)
      .map(({ link }) => link);
  const sampledLinks = [...requiredLinks.slice(0, maxEdges), ...sampledOptionalLinks];
  return {
    nodes: nodeInputs.filter((node) => selectedNodeIds.has(stableId(node.id))),
    links: sampledLinks,
    totalNodeCount: allNodeIds.size,
    totalEdgeCount: allLinks.length
  };
}

function validateDimension(value: number, fallback: number, name: string): number {
  const resolved = Number.isFinite(value) ? Math.round(value) : fallback;
  if (resolved < 240 || resolved > 8192) {
    throw new RangeError(name + " deve essere compreso fra 240 e 8192 pixel.");
  }
  return resolved;
}

/** Parses a user-entered export dimension without turning an empty field into zero. */
export function parseGraph2DDimension(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 240 && parsed <= 8192 ? parsed : null;
}

export function buildGraph2DScene(
  nodeInputs: readonly Graph2DNodeInput[],
  linkInputs: readonly Graph2DLinkInput[],
  options: Graph2DSceneOptions = {}
): Graph2DScene {
  const width = validateDimension(options.width ?? 1280, 1280, "La larghezza");
  const height = validateDimension(options.height ?? 820, 820, "L'altezza");
  const nodeById = new Map<string, Graph2DNodeInput>();
  for (const node of nodeInputs) {
    const id = stableId(node.id);
    if (!id || nodeById.has(id)) continue;
    nodeById.set(id, node);
  }

  const visibleLinks = linkInputs.flatMap((link, index) => {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (!source || !target || !nodeById.has(source) || !nodeById.has(target)) return [];
    return [{ link, index, source, target }];
  });
  const compareRelationTypes = (left: string, right: string) =>
    left.localeCompare(right, "it") || (left < right ? -1 : left > right ? 1 : 0);
  const relationTypes = [...new Set(visibleLinks
    .filter((item) => item.link.absence !== true && item.link.analysis?.absence !== true)
    .map((item) => getLinkType(item.link))
    .filter(Boolean))]
    .sort(compareRelationTypes);
  const configuredRelationColors = new Map(relationTypes.map((type) => [type, getConfiguredLinkColor(type, options.edgeColors)]));
  const usedRelationColors = new Set([
    "#75859a",
    ...[...configuredRelationColors.values()].flatMap((color) => color ? [color.toLowerCase()] : [])
  ]);
  const relationTypeColors = new Map<string, string | null>();
  relationTypes.forEach((type, index) => {
    if (index < GRAPH2D_RELATION_DASH_PATTERNS.length) {
      relationTypeColors.set(type, null);
      return;
    }
    const configuredColor = configuredRelationColors.get(type);
    if (configuredColor) {
      relationTypeColors.set(type, configuredColor);
      return;
    }
    let paletteIndex = index - GRAPH2D_RELATION_DASH_PATTERNS.length;
    let color = graph2DRelationTypeColor(paletteIndex);
    while (usedRelationColors.has(color.toLowerCase())) color = graph2DRelationTypeColor(++paletteIndex);
    usedRelationColors.add(color.toLowerCase());
    relationTypeColors.set(type, color);
  });
  const highlightedNodes = new Set(options.highlightedNodeIds ?? []);
  const highlightedEdges = new Set(options.highlightedEdgeIds ?? []);
  const mode = options.mode ?? "projection";
  const selectedEndpoints = new Set([...highlightedNodes].filter((id) => nodeById.has(id)));
  for (const item of visibleLinks) {
    const absence = item.link.absence === true || item.link.analysis?.absence === true;
    if (!highlightedEdges.has(getStructuralEdgeIdentity(item.link)) && item.link.hypothetical !== true &&
      item.link.analysis?.hypothetical !== true && !absence) continue;
    selectedEndpoints.add(item.source);
    selectedEndpoints.add(item.target);
  }

  const selectedLinks = visibleLinks.filter((item) =>
    highlightedEdges.has(getStructuralEdgeIdentity(item.link)) || item.link.hypothetical === true ||
    item.link.analysis?.hypothetical === true || item.link.absence === true || item.link.analysis?.absence === true
  );
  const witnessNodes = (mode === "witness" ? [...selectedEndpoints] : [...nodeById.keys()])
    .sort((left, right) => left.localeCompare(right));
  const includedNodeIds = new Set(witnessNodes);
  let includedLinks = mode === "witness"
    ? selectedLinks.length > 0
      ? selectedLinks
      : visibleLinks.filter((item) => includedNodeIds.has(item.source) && includedNodeIds.has(item.target))
    : visibleLinks.filter((item) => item.link.absence !== true && item.link.analysis?.absence !== true);
  const inducedContextOnly = mode === "witness" && selectedLinks.length === 0;
  if (mode === "witness") {
    includedLinks = includedLinks.filter((item) =>
      includedNodeIds.has(item.source) && includedNodeIds.has(item.target)
    );
  }

  const simulationNodes = witnessNodes.map((id) => ({
    id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    source: nodeById.get(id)!
  }));
  const simulationLinks = includedLinks.map((item) => ({
    source: item.source,
    target: item.target,
    item
  }));

  if (simulationNodes.length > 1 && simulationNodes.length <= MAX_FORCE_LAYOUT_NODES) {
    const simulation = forceSimulation(simulationNodes, 2)
      .randomSource(createRandom(options.seed ?? 7))
      .force("charge", forceManyBody().strength(-105))
      .force("center", forceCenter(0, 0))
      .force("link", forceLink(simulationLinks).id((node: any) => node.id).distance(76).strength(0.72))
      .force("collision", forceCollide(18).iterations(2))
      .stop();
    simulation.tick(Math.min(260, Math.max(120, simulationNodes.length)));
  } else if (simulationNodes.length > MAX_FORCE_LAYOUT_NODES) {
    // Keep large-network export responsive. A stable circular layout is less compact,
    // but avoids hundreds of force iterations over a large node set on the UI thread.
    const radius = Math.max(80, simulationNodes.length * 2.1);
    simulationNodes.forEach((node, index) => {
      const angle = (2 * Math.PI * index) / simulationNodes.length - Math.PI / 2;
      node.x = radius * Math.cos(angle);
      node.y = radius * Math.sin(angle);
    });
  }

  const positions = simulationNodes.map((node) => ({ id: node.id, x: node.x, y: node.y }));
  if (positions.length === 1) positions[0] = { ...positions[0], x: 0, y: 0 };
  const minX = positions.length ? Math.min(...positions.map((point) => point.x)) : 0;
  const maxX = positions.length ? Math.max(...positions.map((point) => point.x)) : 0;
  const minY = positions.length ? Math.min(...positions.map((point) => point.y)) : 0;
  const maxY = positions.length ? Math.max(...positions.map((point) => point.y)) : 0;
  const marginX = Math.min(72, Math.max(30, Math.round(Math.min(width, height) * 0.055)));
  const hasInducedContextEdges = inducedContextOnly && includedLinks.length > 0;
  const marginTop = Math.min(hasInducedContextEdges ? 140 : 100, marginX + (hasInducedContextEdges ? 100 : 50));
  const marginBottom = marginX;
  const availableWidth = width - marginX * 2;
  const availableHeight = height - marginTop - marginBottom;
  const graphWidth = Math.max(1, maxX - minX);
  const graphHeight = Math.max(1, maxY - minY);
  const unrotatedScale = positions.length > 1
    ? Math.min(availableWidth / graphWidth, availableHeight / graphHeight)
    : 1;
  const rotatedScale = positions.length > 1
    ? Math.min(availableWidth / graphHeight, availableHeight / graphWidth)
    : 0;
  // A 90° turn preserves every distance and edge relation while using a wide
  // export canvas more effectively when the force layout happens to be tall.
  const rotateLayout = rotatedScale > unrotatedScale;
  const scale = rotateLayout ? rotatedScale : unrotatedScale;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const placedById = new Map(positions.map((point) => [point.id, {
    x: width / 2 + (rotateLayout ? point.y - centerY : point.x - centerX) * scale,
    y: marginTop + availableHeight / 2 + (rotateLayout ? centerX - point.x : point.y - centerY) * scale
  }]));

  return {
    width,
    height,
    nodes: witnessNodes.flatMap((id) => {
      const input = nodeById.get(id)!;
      const position = placedById.get(id);
      if (!position) return [];
      const type = String(input.analysis?.type ?? input.type ?? "").trim();
      const selected = highlightedNodes.has(id);
      const configuredTypeColor = getConfiguredNodeTypeColor(type, options.nodeTypeStyles);
      const explicitNodeColor = getMappedNodeColor(id, options.nodeColors);
      const nodeTypeColor = !explicitNodeColor && !selected ? configuredTypeColor : null;
      const selectedColorApplied = selected && !explicitNodeColor;
      return [{
        id,
        label: String(input.label ?? id),
        type,
        color: getNodeColor(id, selected, options.nodeColors, configuredTypeColor),
        ...(nodeTypeColor ? { nodeTypeColor } : {}),
        ...(selectedColorApplied ? { selectedColorApplied: true } : {}),
        ...position,
        selected,
        annotation: mappedString(options.nodeAnnotations, id),
        ...(options.nodeGroupIds !== undefined ? { nodeGroupId: mappedString(options.nodeGroupIds, id) } : {}),
        communityId: mappedString(options.communityByNodeId, id) || mappedString(options.nodeGroupIds, id)
      }];
    }),
    links: includedLinks.map((item) => {
      const edgeIdentity = getStructuralEdgeIdentity(item.link);
      const declaredDirection = item.link.analysis?.direction;
      const hypothetical = item.link.hypothetical === true || item.link.analysis?.hypothetical === true;
      const absence = item.link.absence === true || item.link.analysis?.absence === true;
      const candidateAnnotation = options.edgeAnnotations?.[edgeIdentity];
      const annotation = candidateAnnotation && typeof candidateAnnotation.label === "string" && candidateAnnotation.label.trim()
        ? {
            label: candidateAnnotation.label.trim(),
            ...(typeof candidateAnnotation.description === "string" && candidateAnnotation.description.trim()
              ? { description: candidateAnnotation.description.trim() }
              : {}),
            ...(typeof candidateAnnotation.color === "string" && /^#[\da-f]{3,8}$/i.test(candidateAnnotation.color.trim())
              ? { color: candidateAnnotation.color.trim() }
              : {}),
            ...(candidateAnnotation.dashPattern === "solid" || candidateAnnotation.dashPattern === "dashed" || candidateAnnotation.dashPattern === "dotted"
              ? { dashPattern: candidateAnnotation.dashPattern }
              : {})
          }
        : null;
      const relationColor = absence
        ? "#b4233c"
        : relationTypeColors.get(getLinkType(item.link)) ?? getLinkColor(item.link, options.edgeColors);
      return {
        id: String(item.link.sourceId ?? item.link.analysis?.id ?? "edge-" + (item.index + 1)),
        source: item.source,
        target: item.target,
        type: absence ? "" : getLinkType(item.link),
        color: annotation?.color ?? relationColor,
        relationColor,
        annotation,
        directed: declaredDirection === "directed" ||
          (declaredDirection !== "undirected" && options.graphDirection === "directed"),
        selected: highlightedEdges.has(edgeIdentity) || hypothetical || absence,
        hypothetical,
        absence,
        absenceDescription: typeof item.link.absenceDescription === "string" ? item.link.absenceDescription : "",
        contextOnly: inducedContextOnly
      };
    })
  };
}

export function buildGraph2DSvg(scene: Graph2DScene, options: Graph2DSvgOptions = {}): string {
  const showLabels = options.showLabels ?? scene.nodes.length <= 120;
  const showNodeIds = options.showNodeIds ?? false;
  const title = options.title?.trim() || "Vista 2D del grafo";
  const scope = options.scopeLabel?.trim() ?? "";
  const titleY = 34;
  const scopeY = 57;
  const nodePositions = new Map(scene.nodes.map((node) => [node.id, node]));
  const relationCounts = new Map<string, number>();
  const relationGroups = new Map<string, number[]>();
  const hypotheticalLinkCount = scene.links.filter((link) => link.hypothetical).length;
  const absenceLinkCount = scene.links.filter((link) => link.absence).length;
  const contextLinkCount = scene.links.filter((link) => link.contextOnly).length;
  for (const [index, link] of scene.links.entries()) {
    // Group by the unordered endpoint pair so reverse directed edges and
    // parallel undirected records receive separate visual lanes as well.
    const pair = JSON.stringify([link.source, link.target].sort());
    const indexes = relationGroups.get(pair) ?? [];
    indexes.push(index);
    relationGroups.set(pair, indexes);
    if (link.type && !link.absence) relationCounts.set(link.type, (relationCounts.get(link.type) ?? 0) + 1);
  }
  const compareRelationTypes = (left: string, right: string) =>
    left.localeCompare(right, "it") || (left < right ? -1 : left > right ? 1 : 0);
  const legendTypes = [...relationCounts.keys()].sort(compareRelationTypes);
  const relationDashByType = new Map(legendTypes.map((type, index) => [
    type,
    GRAPH2D_RELATION_DASH_PATTERNS[index % GRAPH2D_RELATION_DASH_PATTERNS.length]
  ]));
  const relationOffsets = new Map<number, number>();
  const relationRanks = new Map<number, number>();
  for (const indexes of relationGroups.values()) {
    indexes.forEach((index, position) => {
      relationOffsets.set(index, (position - (indexes.length - 1) / 2) * 10);
      relationRanks.set(index, position);
    });
  }
  const links = scene.links.map((link, index) => {
    const source = nodePositions.get(link.source);
    const target = nodePositions.get(link.target);
    if (!source || !target) return "";
    const sx = source.x;
    const sy = source.y;
    const tx = target.x;
    const ty = target.y;
    const dx = tx - sx;
    const dy = ty - sy;
    const length = Math.max(1, Math.hypot(dx, dy));
    const canonicalOffset = relationOffsets.get(index) ?? 0;
    const canonicalDirection = link.source <= link.target ? 1 : -1;
    const offset = canonicalOffset * canonicalDirection;
    const cx = (sx + tx) / 2 - dy / length * offset;
    const cy = (sy + ty) / 2 + dx / length * offset;
    const loopRank = relationRanks.get(index) ?? 0;
    const loopHeight = 45 + loopRank * 13;
    const loopWidth = 35 + loopRank * 6;
    const path = link.source === link.target
      ? "M " + (sx - 6) + " " + (sy - 6) + " C " + (sx - loopWidth) + " " + (sy - loopHeight) + ", " + (sx + loopWidth) + " " + (sy - loopHeight) + ", " + (sx + 6) + " " + (sy - 6)
      : offset === 0
        ? "M " + sx + " " + sy + " L " + tx + " " + ty
        : "M " + sx + " " + sy + " Q " + cx + " " + cy + " " + tx + " " + ty;
    const edgeTitle = link.absence
      ? [`Coppia non adiacente: ${source.label} — ${target.label}`, link.absenceDescription].filter(Boolean).join(" · ")
      : [link.annotation?.label, link.annotation?.description, link.type, link.id].filter(Boolean).join(" · ") || "Arco";
    const dashPattern = link.absence ? "1 5"
      : link.hypothetical ? "7 5"
      : link.contextOnly ? "2 4"
        : link.annotation?.dashPattern === "dotted" ? "2 4"
        : link.annotation?.dashPattern === "dashed" ? "5 4"
        : link.annotation?.dashPattern === "solid" ? ""
          : link.type ? relationDashByType.get(link.type) ?? "" : "";
    const contextPrefix = link.contextOnly
      ? "Arco osservato nel sottografo; non parte dell'evidenza restituita dall'analisi · "
      : "";
    return '<path d="' + path + '" fill="none" stroke="' + escapeXml(link.color) + '" stroke-width="' + (link.selected ? 3.2 : 1.45) + '" stroke-opacity="' + (link.selected ? 0.96 : 0.66) + '"' + (dashPattern ? ' stroke-dasharray="' + dashPattern + '"' : "") + (link.directed ? ' marker-end="url(#graph-arrow)"' : "") + '><title>' + escapeXml((link.hypothetical ? "Proposta ipotetica · " : "") + contextPrefix + edgeTitle) + "</title></path>";
  }).join("");
  const nodes = scene.nodes.map((node) => {
    const radius = node.selected ? 9 : 6.5;
    const labelText = graph2DNodeLabelText(node, {
      showLabels,
      showNodeIds,
      showAnnotations: options.showAnnotations ?? false
    });
    const label = labelText
      ? renderGraph2DNodeLabel(node, labelText, radius, scene.width)
      : "";
    const typeText = node.type ? " · " + node.type : "";
    const annotationText = options.showAnnotations && node.annotation ? " · " + node.annotation : "";
    return '<g><circle cx="' + node.x + '" cy="' + node.y + '" r="' + radius + '" fill="' + escapeXml(node.color) + '" stroke="' + (node.selected ? "#b45309" : "#ffffff") + '" stroke-width="' + (node.selected ? 3 : 1.8) + '"><title>' + escapeXml(node.label + typeText + annotationText + " · ID " + node.id) + "</title></circle>" + label + "</g>";
  }).join("");
  const nodeTypeLegend = [...new Map(scene.nodes.flatMap((node) => node.nodeTypeColor
    ? [[node.type || "Senza tipo", { label: node.type || "Senza tipo", color: node.nodeTypeColor }] as const]
    : [])).values()].sort((left, right) => left.label.localeCompare(right.label, "it"));
  const shownNodeTypes = nodeTypeLegend.slice(0, 8);
  const omittedNodeTypes = nodeTypeLegend.length - shownNodeTypes.length;
  const selectedNodeFillVisible = scene.nodes.some((node) => node.selectedColorApplied === true);
  const nodeLegendRows = shownNodeTypes.length + (omittedNodeTypes > 0 ? 1 : 0) + (selectedNodeFillVisible ? 1 : 0);
  const nodeLegendHeight = nodeLegendRows > 0 ? 28 + nodeLegendRows * 21 : 0;
  const edgeAnnotationLegend = [...new Map(scene.links.flatMap((link) => link.annotation
    ? [[link.annotation.label, link.annotation] as const]
    : [])).values()];
  const annotationLegendHeight = edgeAnnotationLegend.length ? 18 + edgeAnnotationLegend.length * 21 : 0;
  const hasRelationLegend = relationCounts.size > 0 || hypotheticalLinkCount > 0 || contextLinkCount > 0 || absenceLinkCount > 0 || edgeAnnotationLegend.length > 0;
  const resultCaption = [options.resultLabel?.trim(), options.completionLabel?.trim()]
    .filter(Boolean)
    .join(" · ");
  const naturalCaptionLines = scope ? 2 : 3;
  const captionLineBudget = naturalCaptionLines + Math.min(8, Math.floor(Math.max(0, 8192 - scene.height) / 14));
  const resultCaptionLines = wrapGraph2DCaption(resultCaption, scene.width, captionLineBudget);
  const captionGraphOffset = Math.max(0, resultCaptionLines.length - naturalCaptionLines) * 14;
  const exportSceneHeight = scene.height + captionGraphOffset;
  const useRelationLegendFooter = !!options.showLegend && legendTypes.length > 8 && exportSceneHeight < 8092;
  const relationLegendColumns = useRelationLegendFooter
    ? Math.max(1, Math.min(4, Math.floor((scene.width - 40) / 250)))
    : 1;
  const relationSpecialRows = (hypotheticalLinkCount > 0 ? 1 : 0) + (contextLinkCount > 0 ? 1 : 0) +
    (absenceLinkCount > 0 ? 1 : 0) + (edgeAnnotationLegend.length > 0 ? edgeAnnotationLegend.length + 1 : 0);
  const maxFooterRows = Math.max(0, Math.floor((8192 - exportSceneHeight - 20 - 28 - relationSpecialRows * 24) / 21));
  const maxFooterTypes = useRelationLegendFooter
    ? Math.max(0, maxFooterRows * relationLegendColumns - (legendTypes.length > maxFooterRows * relationLegendColumns ? relationLegendColumns : 0))
    : 8;
  const shownTypes = legendTypes.slice(0, maxFooterTypes);
  const omittedTypes = legendTypes.length - shownTypes.length;
  const relationTypeRows = Math.ceil(shownTypes.length / relationLegendColumns) + (omittedTypes > 0 ? 1 : 0);
  const relationLegendHeight = hasRelationLegend ? 28 + relationTypeRows * 21 +
    (hypotheticalLinkCount > 0 ? 24 : 0) + (contextLinkCount > 0 ? 24 : 0) +
    (absenceLinkCount > 0 ? 24 : 0) + annotationLegendHeight : 0;
  const legendSectionGap = nodeLegendHeight > 0 && relationLegendHeight > 0 && !useRelationLegendFooter ? 10 : 0;
  const relationLegendOffset = useRelationLegendFooter ? 0 : nodeLegendHeight + legendSectionGap;
  const legendHeight = useRelationLegendFooter
    ? nodeLegendHeight
    : nodeLegendHeight + legendSectionGap + relationLegendHeight;
  const nodeGroupLegendOptions = options.nodeGroupLegend;
  const visibleNodeGroupIds = new Set(scene.nodes.map((node) => node.nodeGroupId || node.communityId).filter(Boolean));
  const nodeGroupLegendItems = nodeGroupLegendOptions?.items.filter((item) => visibleNodeGroupIds.has(item.id)) ?? [];
  const shownNodeGroups = nodeGroupLegendItems.slice(0, 8);
  const omittedNodeGroups = nodeGroupLegendItems.length - shownNodeGroups.length;
  const nodeGroupLegendHeight = shownNodeGroups.length
    ? 28 + (shownNodeGroups.length + (omittedNodeGroups > 0 ? 1 : 0)) * 21
    : 0;
  const nodeGroupLegendWidth = Math.max(160, Math.min(250, scene.width - 40));
  const nodeGroupLegendTitleLimit = Math.max(12, Math.floor((nodeGroupLegendWidth - 24) / 6.2));
  const nodeGroupLegendItemLimit = Math.max(12, Math.floor((nodeGroupLegendWidth - 42) / 6.2));
  const nodeGroupLegendY = exportSceneHeight - nodeGroupLegendHeight - 20 -
    (scene.width < 480 && legendHeight > 0 ? legendHeight + 12 : 0);
  const allCommunityLegend = nodeGroupLegendOptions ? [] : options.communityLegend ?? [];
  const communityLegend = allCommunityLegend.slice(0, 8);
  const omittedCommunities = allCommunityLegend.length - communityLegend.length;
  const communityLegendHeight = communityLegend.length
    ? 28 + (communityLegend.length + (omittedCommunities > 0 ? 1 : 0)) * 21
    : 0;
  const relationSpecialLegendRows = (hypotheticalLinkCount > 0 ? 1 : 0) + (contextLinkCount > 0 ? 1 : 0) +
    (absenceLinkCount > 0 ? 1 : 0);
  const relationExtrasTop = relationLegendOffset + 37 + relationTypeRows * 21;
  const annotationLegendTop = relationExtrasTop + relationSpecialLegendRows * 24;
  const nodeLegendSvg = nodeLegendRows > 0
    ? [
        '<text x="12" y="19" fill="#475569" font-size="11" font-weight="700" font-family="Arial, Helvetica, sans-serif">NODI</text>',
        ...shownNodeTypes.map((item, index) => '<g transform="translate(12, ' + (37 + index * 21) + ')"><circle cx="6" cy="-2" r="5" fill="' + escapeXml(item.color) + '"/><text x="18" y="2" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif">' + escapeXml(item.label) + '</text></g>'),
        ...(omittedNodeTypes > 0 ? ['<text x="12" y="' + (37 + shownNodeTypes.length * 21) + '" fill="#64748b" font-size="10" font-family="Arial, Helvetica, sans-serif">Altri tipi di nodo: ' + omittedNodeTypes + '</text>'] : []),
        ...(selectedNodeFillVisible ? ['<g transform="translate(12, ' + (37 + shownNodeTypes.length * 21 + (omittedNodeTypes > 0 ? 21 : 0)) + ')"><circle cx="6" cy="-2" r="5" fill="#f59e0b" stroke="#b45309" stroke-width="1.5"/><text x="18" y="2" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif">Nodo evidenziato</text></g>'] : [])
      ].join("")
    : "";
  const relationLegendSvg = hasRelationLegend
    ? [
        '<text x="12" y="' + (relationLegendOffset + 19) + '" fill="#475569" font-size="11" font-weight="700" font-family="Arial, Helvetica, sans-serif">RELAZIONI</text>',
        ...shownTypes.map((type, index) => {
          const color = scene.links.find((link) => link.type === type)?.relationColor ?? "#75859a";
          const dashPattern = relationDashByType.get(type) ?? "";
          const column = useRelationLegendFooter ? index % relationLegendColumns : 0;
          const row = useRelationLegendFooter ? Math.floor(index / relationLegendColumns) : index;
          const x = 12 + column * ((scene.width - 64) / relationLegendColumns);
          const y = relationLegendOffset + 37 + row * 21;
          const textLimit = useRelationLegendFooter ? Math.max(12, Math.floor(((scene.width - 64) / relationLegendColumns - 45) / 6.2)) : type.length;
          const label = type.length > textLimit ? type.slice(0, textLimit - 1) + "…" : type;
          const fullLabelTitle = label === type ? "" : "<title>" + escapeXml(type) + "</title>";
          return '<g transform="translate(' + x + ', ' + y + ')"><line x1="0" y1="0" x2="28" y2="0" stroke="' + escapeXml(color) + '" stroke-width="2.5"' + (dashPattern ? ' stroke-dasharray="' + dashPattern + '"' : "") + '/><text x="35" y="4" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif">' + fullLabelTitle + escapeXml(label) + '</text></g>';
        }),
        ...(omittedTypes > 0 ? ['<text x="12" y="' + (relationLegendOffset + 37 + Math.ceil(shownTypes.length / relationLegendColumns) * 21) + '" fill="#64748b" font-size="10" font-family="Arial, Helvetica, sans-serif">Altri tipi: ' + omittedTypes + '</text>'] : []),
        ...(hypotheticalLinkCount > 0 ? ['<g transform="translate(12, ' + relationExtrasTop + ')"><line x1="0" y1="0" x2="17" y2="0" stroke="#334155" stroke-width="2.5" stroke-dasharray="5 4"/><text x="24" y="4" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif">Proposta ipotetica</text></g>'] : []),
        ...(contextLinkCount > 0 ? ['<g transform="translate(12, ' + (relationExtrasTop + (hypotheticalLinkCount > 0 ? 24 : 0)) + ')"><line x1="0" y1="0" x2="17" y2="0" stroke="#475569" stroke-width="2" stroke-dasharray="2 4"/><text x="24" y="4" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif">Contesto osservato</text></g>'] : []),
        ...(absenceLinkCount > 0 ? ['<g transform="translate(12, ' + (relationExtrasTop + (hypotheticalLinkCount > 0 ? 24 : 0) + (contextLinkCount > 0 ? 24 : 0)) + ')"><line x1="0" y1="0" x2="17" y2="0" stroke="#b4233c" stroke-width="2.5" stroke-dasharray="1 5"/><text x="24" y="4" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif">Coppie non adiacenti</text></g>'] : []),
        ...(edgeAnnotationLegend.length > 0
          ? [
              '<text x="12" y="' + (annotationLegendTop + 10) + '" fill="#475569" font-size="9" font-weight="700" letter-spacing=".08em" font-family="Arial, Helvetica, sans-serif">ANNOTAZIONI</text>',
              ...edgeAnnotationLegend.map((annotation, index) => {
                const pattern = annotation.dashPattern === "dotted" ? ' stroke-dasharray="2 4"'
                  : annotation.dashPattern === "dashed" ? ' stroke-dasharray="5 4"' : "";
                return '<g transform="translate(12, ' + (annotationLegendTop + 24 + index * 21) + ')"><line x1="0" y1="0" x2="17" y2="0" stroke="' + escapeXml(annotation.color ?? "#334155") + '" stroke-width="2.5"' + pattern + '/><text x="24" y="4" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif">' + escapeXml(annotation.label) + '</text></g>';
              })
            ]
          : [])
      ].join("")
    : "";
  const nodeLegend = options.showLegend && useRelationLegendFooter && nodeLegendHeight > 0
    ? '<g transform="translate(' + (scene.width - 224) + ', ' + (exportSceneHeight - nodeLegendHeight - 20) + ')"><rect width="202" height="' + nodeLegendHeight + '" rx="9" fill="#ffffff" fill-opacity="0.94" stroke="#d8e0ea"/>' + nodeLegendSvg + '</g>'
    : "";
  const relationLegendFooter = options.showLegend && useRelationLegendFooter
    ? '<g transform="translate(20, ' + (exportSceneHeight + 10) + ')"><rect width="' + (scene.width - 40) + '" height="' + relationLegendHeight + '" rx="9" fill="#ffffff" fill-opacity="0.94" stroke="#d8e0ea"/>' + relationLegendSvg + '</g>'
    : "";
  const compactLegend = options.showLegend && !useRelationLegendFooter && legendHeight > 0
    ? '<g transform="translate(' + (scene.width - 224) + ', ' + (exportSceneHeight - legendHeight - 20) + ')"><rect width="202" height="' + legendHeight + '" rx="9" fill="#ffffff" fill-opacity="0.94" stroke="#d8e0ea"/>' + nodeLegendSvg + relationLegendSvg + '</g>'
    : "";
  const legend = compactLegend + nodeLegend + relationLegendFooter;
  const communityLegendSvg = options.showLegend && communityLegend.length > 0
    ? '<g transform="translate(22, ' + (exportSceneHeight - communityLegendHeight - 20) + ')"><rect width="214" height="' + communityLegendHeight + '" rx="9" fill="#ffffff" fill-opacity="0.94" stroke="#d8e0ea"/><text x="12" y="19" fill="#475569" font-size="11" font-weight="700" font-family="Arial, Helvetica, sans-serif">COMUNITÀ</text>' +
      communityLegend.map((item, index) => '<g transform="translate(12, ' + (37 + index * 21) + ')"><circle cx="6" cy="-2" r="5" fill="' + escapeXml(item.color) + '"/><text x="18" y="2" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif">' + escapeXml(item.label) + '</text></g>').join("") +
      (omittedCommunities > 0 ? '<text x="12" y="' + (37 + communityLegend.length * 21) + '" fill="#64748b" font-size="10" font-family="Arial, Helvetica, sans-serif">Altre comunità: ' + omittedCommunities + "</text>" : "") +
      '</g>'
    : "";
  const nodeGroupLegendSvg = options.showLegend && nodeGroupLegendOptions && shownNodeGroups.length > 0
    ? '<g transform="translate(22, ' + nodeGroupLegendY + ')"><rect width="' + nodeGroupLegendWidth + '" height="' + nodeGroupLegendHeight + '" rx="9" fill="#ffffff" fill-opacity="0.94" stroke="#d8e0ea"/><text x="12" y="19" fill="#475569" font-size="11" font-weight="700" font-family="Arial, Helvetica, sans-serif"><title>' + escapeXml(nodeGroupLegendOptions.title) + '</title>' + escapeXml(nodeGroupLegendOptions.title.length > nodeGroupLegendTitleLimit ? nodeGroupLegendOptions.title.slice(0, nodeGroupLegendTitleLimit - 1) + "…" : nodeGroupLegendOptions.title) + '</text>' +
      shownNodeGroups.map((item, index) => {
        const label = item.label.length > nodeGroupLegendItemLimit ? item.label.slice(0, nodeGroupLegendItemLimit - 1) + "…" : item.label;
        return '<g transform="translate(12, ' + (37 + index * 21) + ')"><circle cx="6" cy="-2" r="5" fill="' + escapeXml(item.color) + '"/><text x="18" y="2" fill="#334155" font-size="11" font-family="Arial, Helvetica, sans-serif"><title>' + escapeXml(item.label) + '</title>' + escapeXml(label) + '</text></g>';
      }).join("") +
      (omittedNodeGroups > 0 ? '<text x="12" y="' + (37 + shownNodeGroups.length * 21) + '" fill="#64748b" font-size="10" font-family="Arial, Helvetica, sans-serif">' + escapeXml(nodeGroupLegendOptions.overflowLabel) + ': ' + omittedNodeGroups + "</text>" : "") +
      '</g>'
    : "";
  const observedLinkCount = scene.links.length - hypotheticalLinkCount - absenceLinkCount;
  const countText = formatGraph2DSceneCountSummary(scene.nodes.length, observedLinkCount, hypotheticalLinkCount, absenceLinkCount);
  const scopeElement = scope
    ? '<text x="28" y="' + scopeY + '" fill="#64748b" font-size="11" font-family="Arial, Helvetica, sans-serif">' + escapeXml(scope) + "</text>"
    : "";
  const contextCaption = contextLinkCount > 0
    ? '<text x="28" y="' + ((scope ? 96 : 78) + Math.max(0, resultCaptionLines.length - 1) * 14) + '" fill="#475569" font-size="10" font-family="Arial, Helvetica, sans-serif">Puntinate: relazioni osservate</text><text x="28" y="' + ((scope ? 108 : 90) + Math.max(0, resultCaptionLines.length - 1) * 14) + '" fill="#475569" font-size="10" font-family="Arial, Helvetica, sans-serif">contesto, non evidenza dell\'analisi</text>'
    : "";

  const hypotheticalDescription = hypotheticalLinkCount
    ? hypotheticalLinkCount + (hypotheticalLinkCount === 1
      ? " arco ipotetico tratteggiato; non appartiene al grafo osservato"
      : " archi ipotetici tratteggiati; non appartengono al grafo osservato")
    : "";
  const absenceDescription = absenceLinkCount
    ? absenceLinkCount + " coppie non adiacenti nella proiezione analizzata; marker puntinati, non sono archi osservati o proposte. " + describeNonAdjacencyScope()
    : "";
  const contextDescription = contextLinkCount
    ? contextLinkCount + " relazioni osservate nel sottografo indotto; non fanno parte dell'evidenza restituita dall'analisi"
    : "";
  const allNodeTypes = [...new Set(scene.nodes.map((node) => node.type.trim() || "Senza tipo"))]
    .sort((left, right) => left.localeCompare(right, "it"));
  const nodeTypeDescription = nodeTypeLegend.length > 0
    ? describeSvgDescriptionList("Tipi di nodo codificati per colore", nodeTypeLegend.map((item) => item.label))
    : describeSvgDescriptionList("Tipi di nodo", allNodeTypes);
  const relationTypeDescription = useRelationLegendFooter
    ? [
        "Tipi di relazione codificati con colore e tratto: " + shownTypes.slice(0, 64).join(", "),
        ...(shownTypes.length > 64 ? [`altri ${shownTypes.length - 64} elencati nella legenda`] : []),
        ...(omittedTypes > 0 ? [`${omittedTypes} tipi non mostrati nella legenda per il limite di dimensione`] : [])
      ].filter(Boolean).join("; ")
    : describeSvgDescriptionList("Tipi di relazione codificati con colore e tratto", legendTypes);
  const communityDescription = describeSvgDescriptionList("Comunità colorate", allCommunityLegend.map((item) => item.label));
  const nodeGroupDescription = nodeGroupLegendOptions
    ? describeSvgDescriptionList(nodeGroupLegendOptions.title, nodeGroupLegendItems.map((item) => item.label))
    : "";
  const directedLinkCount = scene.links.filter((link) => link.directed).length;
  const directionDescription = directedLinkCount > 0
    ? `${directedLinkCount} ${directedLinkCount === 1 ? "arco diretto" : "archi diretti"}, rappresentati con frecce.`
    : scene.links.length > 0 ? "Relazioni non orientate." : "";
  const selectedNodeDescription = selectedNodeFillVisible
    ? "I nodi evidenziati sono arancioni."
    : scene.nodes.some((node) => node.selected)
      ? "I nodi evidenziati hanno un contorno scuro."
      : "";
  const annotationDescriptions = [...new Set([
    ...scene.nodes.flatMap((node) => node.annotation.trim() ? [node.annotation.trim()] : []),
    ...scene.links.flatMap((link) => link.annotation?.description?.trim() ? [link.annotation.description.trim()] : [])
  ])];
  const svgHeight = exportSceneHeight + (options.showLegend && useRelationLegendFooter ? relationLegendHeight + 20 : 0);
  const background = options.transparentBackground
    ? ""
    : '<rect width="' + scene.width + '" height="' + svgHeight + '" fill="#f8fafc"/>';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + scene.width + '" height="' + svgHeight + '" viewBox="0 0 ' + scene.width + " " + svgHeight + '" role="img" aria-labelledby="graph-title graph-description"><title id="graph-title">' + escapeXml(title) + '</title><desc id="graph-description">' + escapeXml([scope, resultCaption, countText, nodeTypeDescription, relationTypeDescription, communityDescription, nodeGroupDescription, directionDescription, selectedNodeDescription, hypotheticalDescription, absenceDescription, contextDescription, ...annotationDescriptions].filter(Boolean).join(" · ")) + "</desc>" + background +
    '<defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b"/></marker></defs>' +
    '<text x="28" y="' + titleY + '" fill="#0f172a" font-size="20" font-weight="700" font-family="Arial, Helvetica, sans-serif">' + escapeXml(title) + "</text>" + scopeElement +
    (resultCaptionLines.length > 0
      ? '<text x="28" y="' + (scope ? 77 : 59) + '" fill="#334155" font-size="11" font-weight="650" font-family="Arial, Helvetica, sans-serif"><title>' + escapeXml(resultCaption) + "</title>" +
        resultCaptionLines.map((line, index) => '<tspan x="28" dy="' + (index === 0 ? 0 : 14) + '">' + escapeXml(line) + "</tspan>").join("") + "</text>"
      : "") +
    contextCaption +
    '<text x="' + (scene.width - 28) + '" y="' + titleY + '" text-anchor="end" fill="#64748b" font-size="11" font-family="Arial, Helvetica, sans-serif">' + escapeXml(countText) + "</text>" +
    '<g transform="translate(0, ' + captionGraphOffset + ')"><g>' + links + "</g><g>" + nodes + "</g></g>" + legend + communityLegendSvg + nodeGroupLegendSvg + "</svg>";
}
