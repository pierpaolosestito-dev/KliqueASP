export interface GraphLinkOpacityInput {
  configuredOpacity: unknown;
  nodeCount: number;
  linkCount: number;
  directed?: boolean;
  hasHighlightedLinks?: boolean;
}

/** Reduces visual clutter on dense graphs while preserving the configured opacity elsewhere. */
export function getGraphLinkOpacity({
  configuredOpacity,
  nodeCount,
  linkCount,
  directed = false,
  hasHighlightedLinks = false
}: GraphLinkOpacityInput): number {
  const configured = typeof configuredOpacity === "number" && Number.isFinite(configuredOpacity)
    ? Math.max(0, Math.min(1, configuredOpacity))
    : 0.4;
  if (configured === 0 || hasHighlightedLinks || !Number.isFinite(nodeCount) || nodeCount < 2 ||
    !Number.isFinite(linkCount) || linkCount <= 0) {
    return configured;
  }

  const maximumLinks = directed ? nodeCount * (nodeCount - 1) : nodeCount * (nodeCount - 1) / 2;
  const density = Math.max(0, Math.min(1, linkCount / maximumLinks));
  const opacityFactor = density >= 0.7 ? 0.35
    : density >= 0.35 ? 0.55
      : density >= 0.15 ? 0.75
        : 1;
  return Math.min(configured, Math.max(0.08, configured * opacityFactor));
}
