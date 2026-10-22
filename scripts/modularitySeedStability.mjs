const restartSeedStride = 0x9e3779b9;

/**
 * Deterministic master-seed schedule. Rejects seeds whose internal restart
 * streams overlap, so each measured heuristic restart has a distinct seed.
 */
export function createModularitySeedSequence(replicates, baseSeed = 20261022, restartsPerReplicate = 1) {
  if (!Number.isSafeInteger(replicates) || replicates < 1 || replicates > 10_000) {
    throw new RangeError("replicates must be an integer between 1 and 10000");
  }
  if (!Number.isSafeInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xffff_ffff) {
    throw new RangeError("baseSeed must be an unsigned 32-bit safe integer");
  }
  if (!Number.isSafeInteger(restartsPerReplicate) || restartsPerReplicate < 1 || restartsPerReplicate > 10_000) {
    throw new RangeError("restartsPerReplicate must be an integer between 1 and 10000");
  }

  let state = baseSeed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  const nextCandidate = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };

  const seeds = [];
  const occupiedRestartSeeds = new Set();
  while (seeds.length < replicates) {
    const candidate = nextCandidate();
    const candidateRestartSeeds = Array.from(
      { length: restartsPerReplicate },
      (_, index) => (candidate + Math.imul(index, restartSeedStride)) >>> 0
    );
    if (candidateRestartSeeds.some((seed) => occupiedRestartSeeds.has(seed))) continue;
    seeds.push(candidate);
    candidateRestartSeeds.forEach((seed) => occupiedRestartSeeds.add(seed));
  }
  return seeds;
}

/** Returns and validates every seed used internally by each algorithm run. */
export function buildModularityRestartSeedSchedule(masterSeeds, restartsPerReplicate) {
  if (!Array.isArray(masterSeeds) || masterSeeds.length === 0 ||
    masterSeeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) ||
    new Set(masterSeeds).size !== masterSeeds.length) {
    throw new TypeError("masterSeeds must be a non-empty array of unique unsigned 32-bit seeds");
  }
  if (!Number.isSafeInteger(restartsPerReplicate) || restartsPerReplicate < 1 || restartsPerReplicate > 10_000) {
    throw new RangeError("restartsPerReplicate must be an integer between 1 and 10000");
  }

  const seen = new Set();
  return masterSeeds.map((masterSeed) => Array.from({ length: restartsPerReplicate }, (_, index) => {
    const restartSeed = (masterSeed + Math.imul(index, restartSeedStride)) >>> 0;
    if (seen.has(restartSeed)) throw new RangeError("restart seed streams overlap across master seeds");
    seen.add(restartSeed);
    return restartSeed;
  }));
}

function validatePartition(nodeIds, communities) {
  if (!Array.isArray(communities) || communities.length === 0 ||
    communities.some((community) => !Array.isArray(community) || community.length === 0)) {
    throw new TypeError("each run must contain a non-empty partition");
  }
  const expected = new Set(nodeIds);
  const assigned = communities.flat();
  if (assigned.length !== nodeIds.length || new Set(assigned).size !== assigned.length ||
    assigned.some((nodeId) => !expected.has(nodeId))) {
    throw new RangeError("each run must assign every candidate node exactly once");
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeValues(values) {
  return {
    minimum: Math.min(...values),
    median: median(values),
    maximum: Math.max(...values)
  };
}

/**
 * Summarizes best-of-restarts results from different master seeds. ARI is
 * computed only across the selected partition from each replicate.
 */
export function summarizeModularitySeedStability(nodeIds, runs, adjustedRandIndex) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0 || new Set(nodeIds).size !== nodeIds.length) {
    throw new TypeError("nodeIds must be a non-empty array of unique IDs");
  }
  if (!Array.isArray(runs) || runs.length === 0) {
    throw new TypeError("runs must contain at least one result");
  }
  if (typeof adjustedRandIndex !== "function") {
    throw new TypeError("adjustedRandIndex must be a function");
  }

  for (const run of runs) {
    if (!Number.isSafeInteger(run?.seed) || run.seed < 0 || run.seed > 0xffff_ffff ||
      !Number.isSafeInteger(run?.scaledScore)) {
      throw new TypeError("each run must provide a valid seed and exact integer score");
    }
    validatePartition(nodeIds, run.communities);
  }

  const nodeIndex = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
  const partitionKeys = runs.map(({ communities }) => communities
    .map((community) => community.map((nodeId) => nodeIndex.get(nodeId)).sort((left, right) => left - right).join(","))
    .sort()
    .join("|"));
  const similarities = [];
  for (let left = 0; left < runs.length; left += 1) {
    for (let right = left + 1; right < runs.length; right += 1) {
      const value = adjustedRandIndex(nodeIds, runs[left].communities, runs[right].communities);
      if (!Number.isFinite(value) || value < -1 || value > 1) {
        throw new RangeError("adjustedRandIndex returned a value outside [-1, 1]");
      }
      similarities.push(value);
    }
  }

  const scores = runs.map(({ scaledScore }) => scaledScore);
  const communityCounts = runs.map(({ communities }) => communities.length);
  const runtimes = runs.map(({ elapsedWallMs }) => elapsedWallMs);
  if (runtimes.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("each run must provide a non-negative elapsedWallMs");
  }

  return {
    replicateCount: runs.length,
    distinctMasterSeeds: new Set(runs.map(({ seed }) => seed)).size,
    distinctSelectedPartitions: new Set(partitionKeys).size,
    scoreRange: summarizeValues(scores),
    communityCountRange: summarizeValues(communityCounts),
    runtimeMsRange: {
      ...summarizeValues(runtimes),
      mean: runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length
    },
    selectedPartitionStability: {
      metric: "Adjusted Rand Index across best-of-restarts partitions from different master seeds",
      pairwiseComparisons: similarities.length,
      mean: similarities.length === 0
        ? null
        : similarities.reduce((sum, value) => sum + value, 0) / similarities.length,
      minimum: similarities.length === 0 ? null : Math.min(...similarities),
      maximum: similarities.length === 0 ? null : Math.max(...similarities)
    },
    interpretation: "empirical heuristic seed sensitivity; replicates are not independent statistical samples and do not establish optimality"
  };
}
