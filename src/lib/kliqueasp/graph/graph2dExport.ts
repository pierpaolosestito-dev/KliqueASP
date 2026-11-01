import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force-3d";
import { getStructuralEdgeIdentity } from "./structuralTasks.ts";

export type Graph2DLinkInput = {
  source: unknown;
  target: unknown;
  sourceId?: unknown;
  sourceIdGenerated?: boolean;
  type?: unknown;
  hypothetical?: boolean;
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

export type Graph2DScene = {
  width: number;
  height: number;
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    color: string;
    x: number;
    y: number;
    selected: boolean;
    annotation: string;
    communityId: string;
  }>;
  links: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    color: string;
    annotation: Graph2DEdgeAnnotation | null;
    directed: boolean;
    selected: boolean;
    hypothetical: boolean;
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
  resultLabel?: string;
  completionLabel?: string;
};

/** Formats the observed scope consistently in the preview and in generated SVG files. */
export function formatGraph2DSceneCountSummary(
  nodeCount: number,
  observedEdgeCount: number,
  proposedEdgeCount = 0
): string {
  const nodes = Number.isFinite(nodeCount) ? Math.max(0, Math.trunc(nodeCount)) : 0;
  const observedEdges = Number.isFinite(observedEdgeCount) ? Math.max(0, Math.trunc(observedEdgeCount)) : 0;
  const proposedEdges = Number.isFinite(proposedEdgeCount) ? Math.max(0, Math.trunc(proposedEdgeCount)) : 0;
  const nodeSummary = `${nodes} ${nodes === 1 ? "nodo" : "nodi"}`;
  const observedEdgeSummary = `${observedEdges} ${observedEdges === 1 ? "arco osservato" : "archi osservati"}`;
  if (proposedEdges === 0) {
    return `${nodeSummary} · ${observedEdges} ${observedEdges === 1 ? "arco" : "archi"}`;
  }
  return `${nodeSummary} · ${observedEdgeSummary} · ${proposedEdges} ${proposedEdges === 1 ? "proposta" : "proposte"}`;
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
    ? "Conteggio aggregato · nessun witness singolo"
    : "Nessun witness selezionato";
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
  if (type && colors && typeof colors === "object" && !Array.isArray(colors) &&
    Object.prototype.hasOwnProperty.call(colors, type)) {
    const color = (colors as Record<string, unknown>)[type];
    if (typeof color === "string" && /^#[\da-f]{3,8}$/i.test(color.trim())) return color.trim();
  }
  return "#75859a";
}

function mappedString(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" || typeof item === "number" ? String(item) : "";
}

function getNodeColor(id: string, selected: boolean, colors: unknown): string {
  const color = mappedString(colors, id);
  if (color && /^#[\da-f]{3,8}$/i.test(color.trim())) return color.trim();
  return selected ? "#f59e0b" : "#2f8f83";
}

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

function renderGraph2DNodeLabel(
  node: Graph2DScene["nodes"][number],
  labelText: string,
  radius: number,
  width: number
): string {
  const layout = getGraph2DNodeLabelLayout(node, labelText, radius, width);
  return '<text x="' + layout.x + '" y="' + layout.y + '" text-anchor="' + layout.anchor + '" fill="#172033" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke" font-size="11" font-family="Inter, system-ui, sans-serif"><title>' + escapeXml(labelText) + "</title>" + escapeXml(layout.visibleLabel) + "</text>";
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
    if (!highlightedEdges.has(getStructuralEdgeIdentity(link)) && !hypothetical) continue;
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

function validateDimension(value: number, fallback: number, name: string): number {
  const resolved = Number.isFinite(value) ? Math.round(value) : fallback;
  if (resolved < 240 || resolved > 8192) {
    throw new RangeError(name + " deve essere compreso fra 240 e 8192 pixel.");
  }
  return resolved;
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
  const highlightedNodes = new Set(options.highlightedNodeIds ?? []);
  const highlightedEdges = new Set(options.highlightedEdgeIds ?? []);
  const mode = options.mode ?? "projection";
  const selectedEndpoints = new Set([...highlightedNodes].filter((id) => nodeById.has(id)));
  for (const item of visibleLinks) {
    if (!highlightedEdges.has(getStructuralEdgeIdentity(item.link)) && item.link.hypothetical !== true && item.link.analysis?.hypothetical !== true) continue;
    selectedEndpoints.add(item.source);
    selectedEndpoints.add(item.target);
  }

  const selectedLinks = visibleLinks.filter((item) =>
    highlightedEdges.has(getStructuralEdgeIdentity(item.link)) || item.link.hypothetical === true || item.link.analysis?.hypothetical === true
  );
  const witnessNodes = (mode === "witness" ? [...selectedEndpoints] : [...nodeById.keys()])
    .sort((left, right) => left.localeCompare(right));
  const includedNodeIds = new Set(witnessNodes);
  let includedLinks = mode === "witness"
    ? selectedLinks.length > 0
      ? selectedLinks
      : visibleLinks.filter((item) => includedNodeIds.has(item.source) && includedNodeIds.has(item.target))
    : visibleLinks;
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
  const scale = positions.length > 1
    ? Math.min(
      availableWidth / Math.max(1, maxX - minX),
      availableHeight / Math.max(1, maxY - minY)
    )
    : 1;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const placedById = new Map(positions.map((point) => [point.id, {
    x: width / 2 + (point.x - centerX) * scale,
    y: marginTop + availableHeight / 2 + (point.y - centerY) * scale
  }]));

  return {
    width,
    height,
    nodes: witnessNodes.flatMap((id) => {
      const input = nodeById.get(id)!;
      const position = placedById.get(id);
      if (!position) return [];
      return [{
        id,
        label: String(input.label ?? id),
        type: String(input.analysis?.type ?? input.type ?? ""),
        color: getNodeColor(id, highlightedNodes.has(id), options.nodeColors),
        ...position,
        selected: highlightedNodes.has(id),
        annotation: mappedString(options.nodeAnnotations, id),
        communityId: mappedString(options.communityByNodeId, id)
      }];
    }),
    links: includedLinks.map((item) => {
      const edgeIdentity = getStructuralEdgeIdentity(item.link);
      const declaredDirection = item.link.analysis?.direction;
      const hypothetical = item.link.hypothetical === true || item.link.analysis?.hypothetical === true;
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
            ...(candidateAnnotation.dashPattern === "dashed" || candidateAnnotation.dashPattern === "dotted"
              ? { dashPattern: candidateAnnotation.dashPattern }
              : {})
          }
        : null;
      return {
        id: String(item.link.sourceId ?? item.link.analysis?.id ?? "edge-" + (item.index + 1)),
        source: item.source,
        target: item.target,
        type: getLinkType(item.link),
        color: annotation?.color ?? getLinkColor(item.link, options.edgeColors),
        annotation,
        directed: declaredDirection === "directed" ||
          (declaredDirection !== "undirected" && options.graphDirection === "directed"),
        selected: highlightedEdges.has(edgeIdentity) || hypothetical,
        hypothetical,
        contextOnly: inducedContextOnly
      };
    })
  };
}

export function buildGraph2DSvg(scene: Graph2DScene, options: Graph2DSvgOptions = {}): string {
  const showLabels = options.showLabels ?? scene.nodes.length <= 120;
  const showNodeIds = options.showNodeIds ?? false;
  const background = options.transparentBackground
    ? ""
    : '<rect width="' + scene.width + '" height="' + scene.height + '" fill="#f8fafc"/>';
  const title = options.title?.trim() || "Vista 2D del grafo";
  const scope = options.scopeLabel?.trim() ?? "";
  const titleY = 34;
  const scopeY = 57;
  const nodePositions = new Map(scene.nodes.map((node) => [node.id, node]));
  const relationCounts = new Map<string, number>();
  const relationGroups = new Map<string, number[]>();
  const hypotheticalLinkCount = scene.links.filter((link) => link.hypothetical).length;
  const contextLinkCount = scene.links.filter((link) => link.contextOnly).length;
  for (const [index, link] of scene.links.entries()) {
    const pair = link.directed ? link.source + "\u0000" + link.target : [link.source, link.target].sort().join("\u0000");
    const indexes = relationGroups.get(pair) ?? [];
    indexes.push(index);
    relationGroups.set(pair, indexes);
    if (link.type) relationCounts.set(link.type, (relationCounts.get(link.type) ?? 0) + 1);
  }
  const relationOffsets = new Map<number, number>();
  for (const indexes of relationGroups.values()) {
    indexes.forEach((index, position) => relationOffsets.set(index, (position - (indexes.length - 1) / 2) * 10));
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
    const offset = relationOffsets.get(index) ?? 0;
    const cx = (sx + tx) / 2 - dy / length * offset;
    const cy = (sy + ty) / 2 + dx / length * offset;
    const path = link.source === link.target
      ? "M " + (sx - 6) + " " + (sy - 6) + " C " + (sx - 35) + " " + (sy - 45) + ", " + (sx + 35) + " " + (sy - 45) + ", " + (sx + 6) + " " + (sy - 6)
      : offset === 0
        ? "M " + sx + " " + sy + " L " + tx + " " + ty
        : "M " + sx + " " + sy + " Q " + cx + " " + cy + " " + tx + " " + ty;
    const edgeTitle = [link.annotation?.label, link.annotation?.description, link.type, link.id].filter(Boolean).join(" · ") || "Arco";
    const dashPattern = link.hypothetical ? "7 5"
      : link.contextOnly ? "2 4"
        : link.annotation?.dashPattern === "dotted" ? "2 4"
        : link.annotation?.dashPattern === "dashed" ? "5 4"
          : "";
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
  const legendTypes = [...relationCounts.keys()];
  const shownTypes = legendTypes.slice(0, 8);
  const omittedTypes = legendTypes.length - shownTypes.length;
  const edgeAnnotationLegend = [...new Map(scene.links.flatMap((link) => link.annotation
    ? [[link.annotation.label, link.annotation] as const]
    : [])).values()];
  const annotationLegendHeight = edgeAnnotationLegend.length ? 18 + edgeAnnotationLegend.length * 21 : 0;
  const legendHeight = 28 + shownTypes.length * 21 + (omittedTypes > 0 ? 21 : 0) +
    (hypotheticalLinkCount > 0 ? 24 : 0) + (contextLinkCount > 0 ? 24 : 0) + annotationLegendHeight;
  const allCommunityLegend = options.communityLegend ?? [];
  const communityLegend = allCommunityLegend.slice(0, 8);
  const omittedCommunities = allCommunityLegend.length - communityLegend.length;
  const communityLegendHeight = communityLegend.length
    ? 28 + (communityLegend.length + (omittedCommunities > 0 ? 1 : 0)) * 21
    : 0;
  const resultCaption = [options.resultLabel?.trim(), options.completionLabel?.trim()]
    .filter(Boolean)
    .join(" · ");
  const annotationLegendTop = 37 + shownTypes.length * 21 + (omittedTypes > 0 ? 21 : 0) +
    (hypotheticalLinkCount > 0 ? 24 : 0) + (contextLinkCount > 0 ? 24 : 0);
  const legend = options.showLegend && (relationCounts.size > 0 || hypotheticalLinkCount > 0 || edgeAnnotationLegend.length > 0)
    ? '<g transform="translate(' + (scene.width - 224) + ', ' + (scene.height - legendHeight - 20) + ')"><rect width="202" height="' + legendHeight + '" rx="9" fill="#ffffff" fill-opacity="0.94" stroke="#d8e0ea"/><text x="12" y="19" fill="#475569" font-size="11" font-weight="700" font-family="Inter, system-ui, sans-serif">RELAZIONI</text>' +
      shownTypes.map((type, index) => {
        const color = scene.links.find((link) => link.type === type)?.color ?? "#75859a";
        return '<g transform="translate(12, ' + (37 + index * 21) + ')"><line x1="0" y1="0" x2="17" y2="0" stroke="' + escapeXml(color) + '" stroke-width="2.5"/><text x="24" y="4" fill="#334155" font-size="11" font-family="Inter, system-ui, sans-serif">' + escapeXml(type) + "</text></g>";
      }).join("") +
      (omittedTypes > 0 ? '<text x="12" y="' + (37 + shownTypes.length * 21) + '" fill="#64748b" font-size="10" font-family="Inter, system-ui, sans-serif">Altri tipi: ' + omittedTypes + "</text>" : "") +
      (hypotheticalLinkCount > 0 ? '<g transform="translate(12, ' + (37 + shownTypes.length * 21 + (omittedTypes > 0 ? 21 : 0)) + ')"><line x1="0" y1="0" x2="17" y2="0" stroke="#334155" stroke-width="2.5" stroke-dasharray="5 4"/><text x="24" y="4" fill="#334155" font-size="11" font-family="Inter, system-ui, sans-serif">Proposta ipotetica</text></g>' : "") +
      (contextLinkCount > 0 ? '<g transform="translate(12, ' + (37 + shownTypes.length * 21 + (omittedTypes > 0 ? 21 : 0) + (hypotheticalLinkCount > 0 ? 24 : 0)) + ')"><line x1="0" y1="0" x2="17" y2="0" stroke="#475569" stroke-width="2" stroke-dasharray="2 4"/><text x="24" y="4" fill="#334155" font-size="11" font-family="Inter, system-ui, sans-serif">Contesto osservato</text></g>' : "") +
      (edgeAnnotationLegend.length > 0
        ? '<text x="12" y="' + (annotationLegendTop + 10) + '" fill="#475569" font-size="9" font-weight="700" letter-spacing=".08em" font-family="Inter, system-ui, sans-serif">ANNOTAZIONI</text>' +
          edgeAnnotationLegend.map((annotation, index) => {
            const pattern = annotation.dashPattern === "dotted" ? ' stroke-dasharray="2 4"'
              : annotation.dashPattern === "dashed" ? ' stroke-dasharray="5 4"' : "";
            return '<g transform="translate(12, ' + (annotationLegendTop + 24 + index * 21) + ')"><line x1="0" y1="0" x2="17" y2="0" stroke="' + escapeXml(annotation.color ?? "#334155") + '" stroke-width="2.5"' + pattern + '/><text x="24" y="4" fill="#334155" font-size="11" font-family="Inter, system-ui, sans-serif">' + escapeXml(annotation.label) + '</text></g>';
          }).join("")
        : "") +
      "</g>"
    : "";
  const communityLegendSvg = options.showLegend && communityLegend.length > 0
    ? '<g transform="translate(22, ' + (scene.height - communityLegendHeight - 20) + ')"><rect width="214" height="' + communityLegendHeight + '" rx="9" fill="#ffffff" fill-opacity="0.94" stroke="#d8e0ea"/><text x="12" y="19" fill="#475569" font-size="11" font-weight="700" font-family="Inter, system-ui, sans-serif">COMUNITÀ</text>' +
      communityLegend.map((item, index) => '<g transform="translate(12, ' + (37 + index * 21) + ')"><circle cx="6" cy="-2" r="5" fill="' + escapeXml(item.color) + '"/><text x="18" y="2" fill="#334155" font-size="11" font-family="Inter, system-ui, sans-serif">' + escapeXml(item.label) + '</text></g>').join("") +
      (omittedCommunities > 0 ? '<text x="12" y="' + (37 + communityLegend.length * 21) + '" fill="#64748b" font-size="10" font-family="Inter, system-ui, sans-serif">Altre comunità: ' + omittedCommunities + "</text>" : "") +
      '</g>'
    : "";
  const observedLinkCount = scene.links.length - hypotheticalLinkCount;
  const countText = formatGraph2DSceneCountSummary(scene.nodes.length, observedLinkCount, hypotheticalLinkCount);
  const scopeElement = scope
    ? '<text x="28" y="' + scopeY + '" fill="#64748b" font-size="11" font-family="Inter, system-ui, sans-serif">' + escapeXml(scope) + "</text>"
    : "";
  const contextCaption = contextLinkCount > 0
    ? '<text x="28" y="' + (scope ? 96 : 78) + '" fill="#475569" font-size="10" font-family="Inter, system-ui, sans-serif">Puntinate: relazioni osservate</text><text x="28" y="' + (scope ? 108 : 90) + '" fill="#475569" font-size="10" font-family="Inter, system-ui, sans-serif">contesto, non evidenza dell\'analisi</text>'
    : "";

  const hypotheticalDescription = hypotheticalLinkCount ? hypotheticalLinkCount + " archi ipotetici tratteggiati; non appartengono al grafo osservato" : "";
  const contextDescription = contextLinkCount
    ? contextLinkCount + " relazioni osservate nel sottografo indotto; non fanno parte dell'evidenza restituita dall'analisi"
    : "";
  const annotationDescriptions = [...new Set([
    ...scene.nodes.flatMap((node) => node.annotation.trim() ? [node.annotation.trim()] : []),
    ...scene.links.flatMap((link) => link.annotation?.description?.trim() ? [link.annotation.description.trim()] : [])
  ])];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + scene.width + '" height="' + scene.height + '" viewBox="0 0 ' + scene.width + " " + scene.height + '" role="img" aria-labelledby="graph-title graph-description"><title id="graph-title">' + escapeXml(title) + '</title><desc id="graph-description">' + escapeXml([scope, resultCaption, countText, hypotheticalDescription, contextDescription, ...annotationDescriptions].filter(Boolean).join(" · ")) + "</desc>" + background +
    '<defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill="#64748b"/></marker></defs>' +
    '<text x="28" y="' + titleY + '" fill="#0f172a" font-size="20" font-weight="700" font-family="Inter, system-ui, sans-serif">' + escapeXml(title) + "</text>" + scopeElement +
    (resultCaption ? '<text x="28" y="' + (scope ? 77 : 59) + '" fill="#334155" font-size="11" font-weight="650" font-family="Inter, system-ui, sans-serif">' + escapeXml(resultCaption) + "</text>" : "") +
    contextCaption +
    '<text x="' + (scene.width - 28) + '" y="' + titleY + '" text-anchor="end" fill="#64748b" font-size="11" font-family="Inter, system-ui, sans-serif">' + escapeXml(countText) + "</text>" +
    "<g>" + links + "</g><g>" + nodes + "</g>" + legend + communityLegendSvg + "</svg>";
}
