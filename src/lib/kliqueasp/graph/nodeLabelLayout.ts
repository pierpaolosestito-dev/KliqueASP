export type GraphNodeLabelCandidate = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority?: number;
};

export type GraphNodeLabelSize = {
  width: number;
  height: number;
  scaleFactor: number;
};

/** Keeps static graph labels readable at overview scale while preserving each texture's aspect ratio. */
export function getReadableGraphNodeLabelSize(
  configuredWidth: number,
  configuredHeight: number,
  textureAspect: number,
  pixelsPerWorldUnit: number,
  minimumScreenHeight = 16,
  maximumScaleFactor = 8
): GraphNodeLabelSize {
  const safeHeight = Number.isFinite(configuredHeight) && configuredHeight > 0 ? configuredHeight : 5;
  const safeWidth = Number.isFinite(configuredWidth) && configuredWidth > 0 ? configuredWidth : 12;
  const safeAspect = Number.isFinite(textureAspect) && textureAspect > 0
    ? textureAspect
    : safeWidth / safeHeight;
  const safePixelsPerWorldUnit = Number.isFinite(pixelsPerWorldUnit) && pixelsPerWorldUnit > 0
    ? pixelsPerWorldUnit
    : 0;
  const safeMinimumScreenHeight = Number.isFinite(minimumScreenHeight) && minimumScreenHeight > 0
    ? minimumScreenHeight
    : 16;
  const safeMaximumScaleFactor = Number.isFinite(maximumScaleFactor) && maximumScaleFactor >= 1
    ? maximumScaleFactor
    : 8;
  const width = Math.max(safeWidth, safeHeight * safeAspect);
  const scaleFactor = safePixelsPerWorldUnit > 0
    ? Math.max(1, Math.min(
      safeMaximumScaleFactor,
      safeMinimumScreenHeight / (safeHeight * safePixelsPerWorldUnit)
    ))
    : 1;

  return {
    width: width * scaleFactor,
    height: safeHeight * scaleFactor,
    scaleFactor
  };
}

/** Chooses a stable subset of graph labels whose screen-space boxes do not collide. */
export function getNonOverlappingGraphNodeLabelIds(
  candidates: GraphNodeLabelCandidate[],
  minimumGap = 6,
  bucketSize = 48,
  reservedAreas: GraphNodeLabelCandidate[] = []
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
  const safeReservedAreas = reservedAreas.filter((area) =>
    Number.isFinite(area.x) && Number.isFinite(area.y) &&
    Number.isFinite(area.width) && area.width > 0 &&
    Number.isFinite(area.height) && area.height > 0
  );

  for (const candidate of ordered) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);

    const halfWidth = (candidate.width + safeGap) / 2;
    const halfHeight = (candidate.height + safeGap) / 2;
    const minCellX = Math.floor((candidate.x - halfWidth) / safeBucketSize);
    const maxCellX = Math.floor((candidate.x + halfWidth) / safeBucketSize);
    const minCellY = Math.floor((candidate.y - halfHeight) / safeBucketSize);
    const maxCellY = Math.floor((candidate.y + halfHeight) / safeBucketSize);
    let overlaps = safeReservedAreas.some((area) =>
      Math.abs(candidate.x - area.x) < (candidate.width + area.width) / 2 + safeGap &&
      Math.abs(candidate.y - area.y) < (candidate.height + area.height) / 2 + safeGap
    );

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
