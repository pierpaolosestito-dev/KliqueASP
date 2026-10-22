import { DEFAULT_EDGE_CONFIDENCE_RANGE, type GraphNumericRange } from "./graphModel.ts";

export interface ConfidenceMappedEdge {
  source?: unknown;
  target?: unknown;
  analysis?: { confidence?: unknown } | null;
}

function isValidConfidenceRange(range: GraphNumericRange): boolean {
  return Number.isFinite(range.min) && Number.isFinite(range.max) &&
    range.max > range.min && Number.isFinite(range.max - range.min);
}

/** Returns a finite threshold in the source score range declared by the graph mapping. */
export function parseMinimumConfidenceThreshold(
  value: unknown,
  range: GraphNumericRange = DEFAULT_EDGE_CONFIDENCE_RANGE
): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  return isValidConfidenceRange(range) && Number.isFinite(parsed) &&
    parsed >= range.min && parsed <= range.max
    ? parsed
    : null;
}

function parseMappedConfidence(value: unknown, range: GraphNumericRange): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= range.min && parsed <= range.max ? parsed : null;
}

/**
 * Filters a mapped edge list by an explicitly selected minimum score.
 * A null or source-range minimum threshold preserves every edge, including unmapped legacy records.
 */
export function filterLinksByMinimumConfidence<T extends ConfidenceMappedEdge>(
  links: readonly T[],
  minimumConfidence: number | null,
  range: GraphNumericRange = DEFAULT_EDGE_CONFIDENCE_RANGE
): T[] {
  if (minimumConfidence === null) return [...links];
  if (!isValidConfidenceRange(range) || !Number.isFinite(minimumConfidence) ||
    minimumConfidence < range.min || minimumConfidence > range.max) return [];
  if (minimumConfidence === range.min) return [...links];

  return links.filter((link) => {
    const confidence = parseMappedConfidence(link.analysis?.confidence, range);
    return confidence !== null && confidence >= minimumConfidence;
  });
}
