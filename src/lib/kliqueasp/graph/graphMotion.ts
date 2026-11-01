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
  return Math.round(220 * Math.sqrt(Math.max(8, safeNodeCount) / 8));
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
