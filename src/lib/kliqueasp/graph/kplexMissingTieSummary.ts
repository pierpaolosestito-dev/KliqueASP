/** Describes the per-node missing-tie bound for an s-plex in user-facing Italian. */
export function describeKPlexMissingTieAllowance(s: number): string {
  if (!Number.isSafeInteger(s) || s < 1) {
    throw new RangeError("Il parametro s del k-plex deve essere un intero positivo.");
  }

  const missingTieLimit = s - 1;
  if (missingTieLimit === 0) {
    return "Ogni membro deve essere collegato a tutti gli altri membri.";
  }

  const noun = missingTieLimit === 1 ? "collegamento mancante" : "collegamenti mancanti";
  return `Ogni membro può avere al massimo ${missingTieLimit} ${noun} con gli altri membri.`;
}
