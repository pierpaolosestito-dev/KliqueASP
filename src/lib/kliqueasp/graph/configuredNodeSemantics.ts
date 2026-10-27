export type DeclaredNodeTypeConfig = Record<string, unknown>;

/**
 * Looks up node semantics only in the graph's own config. Presentation
 * defaults are intentionally kept out of data mappings and graph projection.
 */
export function getDeclaredNodeTypeConfig(
  nodeTypes: unknown,
  nodeType: unknown
): DeclaredNodeTypeConfig | null {
  if (typeof nodeType !== "string" || !nodeTypes || typeof nodeTypes !== "object" || Array.isArray(nodeTypes)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(nodeTypes, nodeType)) return null;

  const typeConfig = (nodeTypes as Record<string, unknown>)[nodeType];
  return typeConfig && typeof typeConfig === "object" && !Array.isArray(typeConfig)
    ? typeConfig as DeclaredNodeTypeConfig
    : null;
}

export function getDeclaredNodeTimelineConfig(
  nodeTypes: unknown,
  nodeType: unknown
): { startField: string; endField: string } | null {
  const timeline = getDeclaredNodeTypeConfig(nodeTypes, nodeType)?.timeline;
  if (!timeline || typeof timeline !== "object" || Array.isArray(timeline)) return null;

  const mapping = timeline as Record<string, unknown>;
  if (typeof mapping.startField !== "string" || !mapping.startField ||
      typeof mapping.endField !== "string" || !mapping.endField) {
    return null;
  }

  return { startField: mapping.startField, endField: mapping.endField };
}

export function isDeclaredNodeAlwaysVisible(nodeTypes: unknown, nodeType: unknown): boolean {
  return getDeclaredNodeTypeConfig(nodeTypes, nodeType)?.alwaysVisible === true;
}
