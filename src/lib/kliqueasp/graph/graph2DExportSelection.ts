/** Parse the user-facing, one-based partition number into a zero-based index. */
export function parseGraph2DPartitionNumber(value: unknown, partitionCount: number): number | null {
  if (!Number.isSafeInteger(partitionCount) || partitionCount <= 0) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const oneBasedIndex = Number(value);
  if (!Number.isSafeInteger(oneBasedIndex) || oneBasedIndex < 1 || oneBasedIndex > partitionCount) return null;
  return oneBasedIndex - 1;
}

/** Keep the selected partition index valid as available partitions change. */
export function clampGraph2DPartitionIndex(index: number, partitionCount: number): number {
  if (!Number.isSafeInteger(partitionCount) || partitionCount <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(partitionCount - 1, Math.max(0, Math.trunc(index)));
}

/** Do not reopen a witness-only export when the current analysis has no selected witness. */
export function resolveGraph2DModeOnOpen(
  mode: "projection" | "witness",
  hasWitness: boolean
): "projection" | "witness" {
  return mode === "witness" && !hasWitness ? "projection" : mode;
}
