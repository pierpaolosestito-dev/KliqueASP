export type GraphMotionSettings = {
  warmupTicks: number;
  cooldownTicks: number;
  cooldownTime: number;
};

const DEFAULT_GRAPH_MOTION: GraphMotionSettings = {
  warmupTicks: 0,
  cooldownTicks: Number.POSITIVE_INFINITY,
  cooldownTime: 15_000
};

const REDUCED_GRAPH_MOTION: GraphMotionSettings = {
  warmupTicks: 80,
  cooldownTicks: 1,
  cooldownTime: 1
};

/** Starts larger networks farther away so they stay in view while the 3D layout settles. */
export function getInitialGraphCameraDistance(nodeCount: number): number {
  const safeNodeCount = Number.isFinite(nodeCount) ? Math.max(0, Math.trunc(nodeCount)) : 0;
  return Math.round(180 * Math.sqrt(Math.max(8, safeNodeCount) / 8));
}

/** Zooms underfilled projected graphs modestly without overriding zoomToFit for wide layouts. */
export function getGraphFitZoomFactor(maxAbsScreenX: number, maxAbsScreenY: number): number {
  if (!Number.isFinite(maxAbsScreenX) || !Number.isFinite(maxAbsScreenY)) return 1;
  const furthestProjectedNode = Math.max(Math.abs(maxAbsScreenX), Math.abs(maxAbsScreenY));
  if (furthestProjectedNode <= 0) return 1;

  // Keep projected node centers inside 68% of the viewport, leaving room for
  // labels and the toolbar. Limit the correction because perspective changes
  // as the camera moves closer to nodes at different depths.
  const targetExtent = 0.68;
  const maximumZoomFactor = 1.25;
  return Math.min(maximumZoomFactor, Math.max(1, targetExtent / furthestProjectedNode));
}

/** Settles the 3D layout before rendering when the user asks for less motion. */
export function getGraphMotionSettings(reducedMotion: boolean, nodeCount = 0): GraphMotionSettings {
  if (!reducedMotion) return { ...DEFAULT_GRAPH_MOTION };
  const safeNodeCount = Number.isFinite(nodeCount) ? Math.max(0, Math.trunc(nodeCount)) : 0;
  const warmupTicks = Math.min(30, Math.max(12, Math.ceil(Math.log2(safeNodeCount + 1) * 3)));
  return { ...REDUCED_GRAPH_MOTION, warmupTicks };
}

/** Removes camera tweening while leaving ordinary users' configured durations unchanged. */
export function getGraphTransitionDuration(durationMs: number, reducedMotion: boolean): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("La durata della transizione deve essere un numero finito non negativo.");
  }
  return reducedMotion ? 0 : durationMs;
}
