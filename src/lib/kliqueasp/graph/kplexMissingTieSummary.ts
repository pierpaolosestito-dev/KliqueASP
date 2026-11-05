/** Describes the per-node non-adjacency bound for an s-plex in user-facing Italian. */
export function describeKPlexMissingTieAllowance(s: number): string {
  if (!Number.isSafeInteger(s) || s < 1) {
    throw new RangeError("Il parametro s del k-plex deve essere un intero positivo.");
  }

  const missingTieLimit = s - 1;
  if (missingTieLimit === 0) {
    return "Ogni membro deve essere adiacente a tutti gli altri.";
  }

  const noun = missingTieLimit === 1 ? "altro membro non adiacente" : "altri membri non adiacenti";
  return `Ogni membro può avere al massimo ${missingTieLimit} ${noun}.`;
}
