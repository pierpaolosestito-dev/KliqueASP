export type GraphDisplayLink = {
  source: unknown;
  target: unknown;
  sourceId?: unknown;
  sourceIdGenerated?: boolean;
  type?: unknown;
  analysis?: Record<string, unknown>;
  [key: string]: unknown;
};

export interface GraphEdgeTypeLegendEntry {
  type: string;
  color: string;
}

export interface GraphNodeTypeLegendEntry {
  type: string;
  label: string;
  color: string;
}

export interface GraphNodeTypeSummaryEntry {
  type: string;
  label: string;
  count: number;
}

export type GraphDisplayNode = {
  type?: unknown;
  analysis?: Record<string, unknown>;
  [key: string]: unknown;
};

export type GraphDisplayIdentity = (link: GraphDisplayLink) => string;
export type NeighborhoodDirection = "weak" | "outgoing" | "incoming";

export interface GraphNeighborhoodFocusOptions {
  maxHops: number;
  direction: NeighborhoodDirection;
  defaultGraphDirection?: "directed" | "undirected";
}

export type AggregatedGraphDisplayLink = GraphDisplayLink & {
  visualRecordCount: number;
  visualSourceIds: string[];
  visualSourceEdgeIdentities: string[];
};

export type GraphDisplayLinkCurve = {
  curvature: number;
  rotation: number;
};

function endpointId(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" || typeof id === "number") return String(id);
  }
  return "";
}

/**
 * Gives parallel records stable, separate lanes in the 3D renderer without
 * adding presentation metadata to the graph data or its edge identities.
 */
export function buildGraphDisplayLinkCurves(
  links: readonly GraphDisplayLink[]
): WeakMap<GraphDisplayLink, GraphDisplayLinkCurve> {
  const groups = new Map<string, Array<{ link: GraphDisplayLink; source: string; target: string }>>();
  for (const link of links) {
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (!source || !target) continue;
    const key = JSON.stringify([source, target].sort());
    const group = groups.get(key) ?? [];
    group.push({ link, source, target });
    groups.set(key, group);
  }

  const curves = new WeakMap<GraphDisplayLink, GraphDisplayLinkCurve>();
  for (const group of groups.values()) {
    if (group[0].source === group[0].target) {
      group.forEach(({ link }, index) => curves.set(link, {
        curvature: 0.45,
        rotation: group.length === 1 ? 0 : (2 * Math.PI * index) / group.length
      }));
      continue;
    }

    const maximumLane = Math.max(0.5, (group.length - 1) / 2);
    group.forEach(({ link, source, target }, index) => {
      const canonicalLane = (index - (group.length - 1) / 2) / maximumLane;
      const canonicalDirection = source <= target ? 1 : -1;
      curves.set(link, {
        curvature: canonicalLane * canonicalDirection * 0.28,
        rotation: 0
      });
    });
  }
  return curves;
}

/** Returns the mapped relation label without assigning it a domain meaning. */
export function getGraphDisplayEdgeType(link: GraphDisplayLink): string | null {
  const analysisType = link.analysis?.type;
  if (typeof analysisType === "string" && analysisType.trim() !== "") return analysisType.trim();
  return typeof link.type === "string" && link.type.trim() !== "" ? link.type.trim() : null;
}

/** Looks up an explicitly configured color using an own JSON key only. */
export function getGraphDisplayEdgeTypeColor(
  link: GraphDisplayLink,
  colorsByType: unknown
): string | null {
  const type = getGraphDisplayEdgeType(link);
  if (!type || !colorsByType || typeof colorsByType !== "object" || Array.isArray(colorsByType) ||
    !Object.prototype.hasOwnProperty.call(colorsByType, type)) return null;
  const color = (colorsByType as Record<string, unknown>)[type];
  return typeof color === "string" && color.trim() !== "" ? color.trim() : null;
}

/** Uses the renderer's default line color when no relation color is configured. */
export function getGraphDisplayLinkColor(
  link: GraphDisplayLink,
  colorsByType: unknown,
  fallbackColor = "#ffffff"
): string {
  return getGraphDisplayEdgeTypeColor(link, colorsByType) ?? fallbackColor;
}

/** Builds a legend from relation types present in the current display projection. */
export function getGraphDisplayEdgeTypeLegend(
  links: readonly GraphDisplayLink[],
  colorsByType: unknown
): GraphEdgeTypeLegendEntry[] {
  const types = new Set(links.map(getGraphDisplayEdgeType).filter((type): type is string => type !== null));
  return [...types]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((type) => {
      const color = getGraphDisplayEdgeTypeColor({ source: "", target: "", analysis: { type } }, colorsByType);
      return color ? [{ type, color }] : [];
    });
}

/** Builds a legend for node types that are both present and styled in the current projection. */
export function getGraphDisplayNodeTypeLegend(
  nodes: readonly GraphDisplayNode[],
  stylesByType: unknown
): GraphNodeTypeLegendEntry[] {
  if (!Array.isArray(nodes) || !stylesByType || typeof stylesByType !== "object" || Array.isArray(stylesByType)) {
    return [];
  }

  const styles = stylesByType as Record<string, unknown>;
  const entries = new Map<string, GraphNodeTypeLegendEntry>();
  for (const node of nodes) {
    const analysisType = node?.analysis?.type;
    const rawType = typeof analysisType === "string" && analysisType.trim() !== ""
      ? analysisType.trim()
      : node?.type;
    const hasType = typeof rawType === "string" && rawType.trim() !== "";
    const type = hasType ? String(rawType).trim() : "default";
    const configuredStyle = Object.prototype.hasOwnProperty.call(styles, type) ? styles[type] : undefined;
    const inheritedDefaultStyle = type !== "default" && Object.prototype.hasOwnProperty.call(styles, "default")
      ? styles.default
      : undefined;
    const style = configuredStyle && typeof configuredStyle === "object" && !Array.isArray(configuredStyle)
      ? configuredStyle as Record<string, unknown>
      : undefined;
    const defaultStyle = inheritedDefaultStyle && typeof inheritedDefaultStyle === "object" && !Array.isArray(inheritedDefaultStyle)
      ? inheritedDefaultStyle as Record<string, unknown>
      : undefined;
    const configuredColor = typeof style?.color === "string" ? style.color.trim() : "";
    const defaultColor = typeof defaultStyle?.color === "string" ? defaultStyle.color.trim() : "";
    const color = configuredColor || defaultColor;
    if (!color || entries.has(type)) continue;
    entries.set(type, { type, label: hasType ? type : "Senza tipo", color });
  }

  return [...entries.values()].sort((left, right) => left.label.localeCompare(right.label));
}

/** Counts node types in the current projection, including types without a configured color. */
export function getGraphNodeTypeSummary(nodes: readonly GraphDisplayNode[]): GraphNodeTypeSummaryEntry[] {
  const counts = new Map<string, number>();
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const analysisType = node?.analysis?.type;
    const rawType = typeof analysisType === "string" && analysisType.trim() !== ""
      ? analysisType.trim()
      : node?.type;
    const type = typeof rawType === "string" && rawType.trim() !== "" ? rawType.trim() : "default";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => ({
      type,
      label: type === "default" ? "Senza tipo" : type,
      count
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "it"));
}

/** Plain-text tooltip content for a typed display edge. */
export function formatGraphDisplayEdgeTypeTooltip(
  link: GraphDisplayLink,
  defaultDirection: "directed" | "undirected" = "undirected"
): string {
  const source = endpointId(link.source);
  const target = endpointId(link.target);
  const direction = link.analysis?.direction === "directed" ||
    (link.analysis?.direction !== "undirected" && defaultDirection === "directed")
    ? "directed"
    : "undirected";
  const relation = getGraphDisplayEdgeType(link);
  const id = link.sourceId ?? link.analysis?.id;
  const endpoints = source && target
    ? `${source} ${direction === "directed" ? "→" : "—"} ${target}`
    : "estremi non disponibili";
  return [
    relation ? `Tipo: ${relation}` : "Arco",
    endpoints,
    id === undefined || id === null || String(id) === "" ? "" : `ID: ${String(id)}`
  ].filter(Boolean).join("; ");
}

/** Returns the nodes within an exact hop radius for a display-only focus. */
export function getGraphNeighborhoodNodeIds(
  nodeIds: readonly string[],
  links: readonly GraphDisplayLink[],
  rootNodeId: string,
  options: GraphNeighborhoodFocusOptions
): Set<string> {
  if (!Array.isArray(nodeIds) || nodeIds.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(nodeIds).size !== nodeIds.length) {
    throw new TypeError("Il dominio nodi deve contenere ID stringa univoci e non vuoti.");
  }
  if (!Array.isArray(links)) throw new TypeError("Gli archi del vicinato devono essere un array.");
  if (!nodeIds.includes(rootNodeId)) throw new RangeError("Il nodo radice non appartiene al dominio visibile.");
  if (!Number.isSafeInteger(options?.maxHops) || options.maxHops < 0) {
    throw new RangeError("maxHops deve essere un intero non negativo sicuro.");
  }
  if (!["weak", "outgoing", "incoming"].includes(options.direction)) {
    throw new RangeError("La direzione del vicinato non è supportata.");
  }
  const defaultDirection = options.defaultGraphDirection ?? "undirected";
  if (defaultDirection !== "directed" && defaultDirection !== "undirected") {
    throw new RangeError("defaultGraphDirection deve essere directed o undirected.");
  }

  const domain = new Set(nodeIds);
  const adjacency = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  const addArc = (from: string, to: string) => adjacency.get(from)?.add(to);

  for (const link of links) {
    if (!link || typeof link !== "object") throw new TypeError("Il grafo contiene un arco non valido.");
    const source = endpointId(link.source);
    const target = endpointId(link.target);
    if (!domain.has(source) || !domain.has(target)) continue;
    const edgeDirection = link.analysis?.direction;
    const directed = edgeDirection === "directed" ||
      (edgeDirection !== "undirected" && defaultDirection === "directed");

    if (options.direction === "weak" || !directed) {
      addArc(source, target);
      addArc(target, source);
    } else if (options.direction === "outgoing") {
      addArc(source, target);
    } else {
      addArc(target, source);
    }
  }

  const visited = new Set<string>([rootNodeId]);
  let frontier = [rootNodeId];
  for (let hop = 0; hop < options.maxHops && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const nodeId of frontier) {
      for (const neighborId of adjacency.get(nodeId) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        next.push(neighborId);
      }
    }
    frontier = next;
  }
  return visited;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => [key, stableValue((value as Record<string, unknown>)[key])])
  );
}

function displayGroupKey(link: GraphDisplayLink, defaultDirection: "directed" | "undirected"): string {
  const direction = link.analysis?.direction === "directed" ? "directed"
    : link.analysis?.direction === "undirected" ? "undirected"
      : defaultDirection;
  let source = endpointId(link.source);
  let target = endpointId(link.target);
  if (direction === "undirected" && source.localeCompare(target) > 0) {
    [source, target] = [target, source];
  }

  const analysis = Object.fromEntries(
    Object.entries(link.analysis ?? {})
      .filter(([key]) => !["id", "validity", "provenance"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
  );
  const extraFields = Object.fromEntries(
    Object.entries(link)
      .filter(([key]) => !["source", "target", "sourceId", "sourceIdGenerated", "analysis"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
  );

  return JSON.stringify(stableValue({ direction, source, target, analysis, extraFields }));
}

/**
 * Copies links for the renderer and optionally combines parallel visual records.
 * The caller's links are never modified; use only after projection filters have run.
 */
export function prepareGraphDisplayLinks<T extends GraphDisplayLink>(
  links: T[],
  options: {
    aggregateParallelEdges: boolean;
    defaultDirection?: "directed" | "undirected";
    getIdentity: GraphDisplayIdentity;
  }
): Array<T | AggregatedGraphDisplayLink> {
  if (!options.aggregateParallelEdges) return links;

  const defaultDirection = options.defaultDirection ?? "undirected";
  const groups = new Map<string, T[]>();
  for (const link of links) {
    const key = displayGroupKey(link, defaultDirection);
    const group = groups.get(key);
    if (group) group.push(link);
    else groups.set(key, [link]);
  }

  return [...groups.values()].map((group) => {
    const representative = group[0];
    const visualSourceIds = group.map((link) => {
      const sourceId = link.sourceId ?? link.analysis?.id;
      return sourceId === undefined || sourceId === null ? "" : String(sourceId);
    });
    return {
      ...representative,
      visualRecordCount: group.length,
      visualSourceIds,
      visualSourceEdgeIdentities: [...new Set(group.map(options.getIdentity))]
    };
  });
}

export function getGraphDisplayEdgeIdentities(
  link: GraphDisplayLink,
  getIdentity: GraphDisplayIdentity
): string[] {
  const aggregate = link as Partial<AggregatedGraphDisplayLink>;
  return Array.isArray(aggregate.visualSourceEdgeIdentities)
    ? aggregate.visualSourceEdgeIdentities
    : [getIdentity(link)];
}

export function graphDisplayLinkMatchesIdentities(
  link: GraphDisplayLink,
  identities: Set<string>,
  getIdentity: GraphDisplayIdentity
): boolean {
  return getGraphDisplayEdgeIdentities(link, getIdentity).some((identity) => identities.has(identity));
}

export function formatGraphDisplayLinkTooltip(link: AggregatedGraphDisplayLink, visibleSourceIdLimit = 5): string {
  const sourceIds = link.visualSourceIds.filter(Boolean);
  if (link.visualRecordCount < 2) {
    return sourceIds.length > 0
      ? `1 record di contatto; ID: ${sourceIds[0]}.`
      : "1 record di contatto; ID non disponibile.";
  }
  if (sourceIds.length === 0) {
    return `${link.visualRecordCount} record distinti aggregati solo nella vista.`;
  }
  const preview = sourceIds.slice(0, visibleSourceIdLimit).join(", ");
  const omittedCount = sourceIds.length - visibleSourceIdLimit;
  return `${link.visualRecordCount} record di contatto aggregati solo nella vista; ID: ${preview}${omittedCount > 0 ? `, altri ${omittedCount}` : ""}.`;
}
