/** Normalizes declared source references without assigning trust or evidential semantics. */
export function normalizeProvenanceReferences(value: unknown): string[] | null {
  const values = Array.isArray(value) ? value.flat(Infinity) : [value];
  const references: string[] = [];

  for (const item of values) {
    if (typeof item === "string") {
      const reference = item.trim();
      if (!reference) return null;
      references.push(reference);
      continue;
    }
    if (typeof item === "number" && Number.isFinite(item)) {
      references.push(String(item));
      continue;
    }
    if (typeof item === "boolean") {
      references.push(String(item));
      continue;
    }
    return null;
  }

  return [...new Set(references)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

/** Keeps a single reference readable and encodes multiple references without losing boundaries. */
export function formatProvenanceReferences(value: unknown): string {
  const references = normalizeProvenanceReferences(value);
  if (!references?.length) return "";
  return references.length === 1 ? references[0] : JSON.stringify(references);
}

export interface ProvenanceScenarioFilter {
  sources: unknown[];
  unattributedEdges: "include" | "exclude";
  referenceMatching?: "any" | "all";
}

/**
 * Projects edge records onto one explicit source scenario. Multi-reference
 * records use the configured any/all membership policy; records without a
 * usable source follow the caller's explicit policy.
 */
export function filterLinksByProvenanceScenario<T extends { analysis?: Record<string, unknown> }>(
  links: T[],
  scenario: ProvenanceScenarioFilter | null | undefined
): T[] {
  if (!scenario) return [...links];

  const activeSources = new Set(normalizeProvenanceReferences(scenario.sources) ?? []);
  if (activeSources.size === 0) return [];

  return links.filter((link) => {
    const references = normalizeProvenanceReferences(link.analysis?.provenance);
    if (!references?.length) return scenario.unattributedEdges === "include";
    return scenario.referenceMatching === "all"
      ? references.every((reference) => activeSources.has(reference))
      : references.some((reference) => activeSources.has(reference));
  });
}
