export type GraphNodeLabelCandidate = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority?: number;
};

/** Chooses a stable subset of graph labels whose screen-space boxes do not collide. */
export function getNonOverlappingGraphNodeLabelIds(
  candidates: GraphNodeLabelCandidate[],
  minimumGap = 6,
  bucketSize = 48
): Set<string> {
  const safeGap = Number.isFinite(minimumGap) ? Math.max(0, minimumGap) : 6;
  const safeBucketSize = Number.isFinite(bucketSize) ? Math.max(16, bucketSize) : 48;
  const ordered = [...candidates].filter((candidate) =>
    typeof candidate.id === "string" && candidate.id.length > 0 &&
    Number.isFinite(candidate.x) && Number.isFinite(candidate.y) &&
    Number.isFinite(candidate.width) && candidate.width > 0 &&
    Number.isFinite(candidate.height) && candidate.height > 0
  ).sort((left, right) => {
    const priorityDifference = (Number(right.priority) || 0) - (Number(left.priority) || 0);
    if (priorityDifference !== 0) return priorityDifference;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  const visibleIds = new Set<string>();
  const seenIds = new Set<string>();
  const acceptedByCell = new Map<string, GraphNodeLabelCandidate[]>();

  for (const candidate of ordered) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);

    const halfWidth = (candidate.width + safeGap) / 2;
    const halfHeight = (candidate.height + safeGap) / 2;
    const minCellX = Math.floor((candidate.x - halfWidth) / safeBucketSize);
    const maxCellX = Math.floor((candidate.x + halfWidth) / safeBucketSize);
    const minCellY = Math.floor((candidate.y - halfHeight) / safeBucketSize);
    const maxCellY = Math.floor((candidate.y + halfHeight) / safeBucketSize);
    let overlaps = false;

    for (let cellX = minCellX; cellX <= maxCellX && !overlaps; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY && !overlaps; cellY += 1) {
        const cellCandidates = acceptedByCell.get(`${cellX}:${cellY}`) ?? [];
        for (const accepted of cellCandidates) {
          if (
            Math.abs(candidate.x - accepted.x) < (candidate.width + accepted.width) / 2 + safeGap &&
            Math.abs(candidate.y - accepted.y) < (candidate.height + accepted.height) / 2 + safeGap
          ) {
            overlaps = true;
            break;
          }
        }
      }
    }

    if (overlaps) continue;

    visibleIds.add(candidate.id);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const cellKey = `${cellX}:${cellY}`;
        const cellCandidates = acceptedByCell.get(cellKey);
        if (cellCandidates) cellCandidates.push(candidate);
        else acceptedByCell.set(cellKey, [candidate]);
      }
    }
  }

  return visibleIds;
}
