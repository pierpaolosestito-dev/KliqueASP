/** Returns the next active suggestion index for an arrow-key navigation step. */
export function getNextGraphSearchSuggestionIndex(
  currentIndex: number,
  suggestionCount: number,
  direction: -1 | 1
): number {
  if (!Number.isSafeInteger(suggestionCount) || suggestionCount <= 0) return -1;
  if (!Number.isSafeInteger(currentIndex) || currentIndex < 0 || currentIndex >= suggestionCount) {
    return direction === 1 ? 0 : suggestionCount - 1;
  }
  return (currentIndex + direction + suggestionCount) % suggestionCount;
}

export function getGraphSearchSuggestionId(index: number): string | undefined {
  return Number.isSafeInteger(index) && index >= 0
    ? `graph-node-search-option-${index}`
    : undefined;
}

export type GraphNodeSearchCandidate = {
  id: string;
  label: string;
  normalizedId?: string;
  normalizedLabel?: string;
};

export function normalizeGraphNodeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

/** Scores a normalized query against the label and source ID. */
export function getGraphNodeSearchMatchScore(candidate: GraphNodeSearchCandidate, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;

  const label = candidate.normalizedLabel ?? candidate.label.toLowerCase();
  const id = candidate.normalizedId ?? candidate.id.toLowerCase();
  if (id === normalizedQuery) return 8;
  if (label === normalizedQuery) return 7;
  if (label.startsWith(normalizedQuery)) return 6;
  if (id.startsWith(normalizedQuery)) return 5;
  if (label.includes(` ${normalizedQuery}`)) return 4;
  if (label.includes(normalizedQuery)) return 3;
  if (id.includes(normalizedQuery)) return 2;
  return 0;
}

/** Adds the source ID to a suggestion when it helps distinguish a graph node. */
export function getGraphSearchSuggestionLabel(candidate: GraphNodeSearchCandidate): string {
  const id = candidate.id.trim();
  const label = candidate.label.trim();
  if (!label) return id;
  return id && id !== label ? `${label} · ${id}` : label;
}
