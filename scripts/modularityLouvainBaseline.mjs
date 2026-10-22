import { scorePartition } from "./modularityGreedyIncumbent.mjs";

function validatePositiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function makeRandom(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function shuffledIndexes(length, random) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [indexes[index], indexes[other]] = [indexes[other], indexes[index]];
  }
  return indexes;
}

function buildLevelGraph(nodeCount, edges) {
  const adjacency = Array.from({ length: nodeCount }, () => new Map());
  const degree = Array(nodeCount).fill(0);
  let totalWeight = 0;

  for (const edge of edges) {
    const { source, target, weight } = edge;
    totalWeight += weight;
    degree[source] += weight;
    degree[target] += weight;
    adjacency[source].set(target, (adjacency[source].get(target) ?? 0) + weight);
    if (source !== target) {
      adjacency[target].set(source, (adjacency[target].get(source) ?? 0) + weight);
    }
  }

  return { nodeCount, edges, adjacency, degree, totalWeight };
}

/** One Louvain local-moving phase on the current weighted quotient graph. */
function moveNodes(graph, random, maxPasses, resolution) {
  const membership = Array.from({ length: graph.nodeCount }, (_, index) => index);
  const members = new Map(membership.map((community) => [community, new Set([community])]));
  const volume = new Map(membership.map((community, node) => [community, graph.degree[node]]));
  const minimumMember = new Map(membership.map((community) => [community, community]));
  let nextCommunityId = graph.nodeCount;
  let moves = 0;
  let passes = 0;

  for (; passes < maxPasses; passes += 1) {
    let movedInPass = false;
    for (const node of shuffledIndexes(graph.nodeCount, random)) {
      const oldCommunity = membership[node];
      const oldVolume = volume.get(oldCommunity) ?? 0;
      const nodeDegree = graph.degree[node];
      const edgeWeightByCommunity = new Map();

      for (const [neighbor, weight] of graph.adjacency[node]) {
        if (neighbor === node) continue;
        const neighborCommunity = membership[neighbor];
        edgeWeightByCommunity.set(
          neighborCommunity,
          (edgeWeightByCommunity.get(neighborCommunity) ?? 0) + weight
        );
      }

      const currentInternalWeight = edgeWeightByCommunity.get(oldCommunity) ?? 0;
      const candidates = [...edgeWeightByCommunity.keys()]
        .filter((community) => community !== oldCommunity)
        .sort((left, right) => minimumMember.get(left) - minimumMember.get(right));
      let bestGain = 0;
      let bestCommunity;
      let bestRepresentative = Number.POSITIVE_INFINITY;

      for (const targetCommunity of candidates) {
        const targetVolume = volume.get(targetCommunity) ?? 0;
        const targetInternalWeight = edgeWeightByCommunity.get(targetCommunity) ?? 0;
        const gain = 4 * graph.totalWeight * resolution.denominator *
          (targetInternalWeight - currentInternalWeight) -
          2 * resolution.numerator * nodeDegree * (targetVolume - oldVolume + nodeDegree);
        if (!Number.isSafeInteger(gain)) throw new RangeError("modularity move gain exceeds the exact integer range");
        const representative = minimumMember.get(targetCommunity) ?? Number.POSITIVE_INFINITY;
        if (gain > bestGain || (gain === bestGain && gain > 0 && representative < bestRepresentative)) {
          bestGain = gain;
          bestCommunity = targetCommunity;
          bestRepresentative = representative;
        }
      }

      // Moving to a fresh singleton is a distinct candidate; it can improve a
      // partition when the current community contributes less than the null model.
      const singletonGain = -4 * graph.totalWeight * resolution.denominator * currentInternalWeight +
        2 * resolution.numerator * oldVolume * nodeDegree -
        2 * resolution.numerator * nodeDegree * nodeDegree;
      if (!Number.isSafeInteger(singletonGain)) {
        throw new RangeError("modularity move gain exceeds the exact integer range");
      }
      if (singletonGain > bestGain ||
        (singletonGain === bestGain && singletonGain > 0 && node < bestRepresentative)) {
        bestGain = singletonGain;
        bestCommunity = undefined;
        bestRepresentative = node;
      }

      if (bestGain <= 0) continue;

      const oldMembers = members.get(oldCommunity);
      oldMembers.delete(node);
      volume.set(oldCommunity, oldVolume - nodeDegree);
      if (oldMembers.size === 0) {
        members.delete(oldCommunity);
        volume.delete(oldCommunity);
        minimumMember.delete(oldCommunity);
      } else {
        let representative = Number.POSITIVE_INFINITY;
        for (const member of oldMembers) representative = Math.min(representative, member);
        minimumMember.set(oldCommunity, representative);
      }

      let targetCommunity = bestCommunity;
      if (targetCommunity === undefined) {
        targetCommunity = nextCommunityId;
        nextCommunityId += 1;
        members.set(targetCommunity, new Set());
        volume.set(targetCommunity, 0);
        minimumMember.set(targetCommunity, node);
      }
      members.get(targetCommunity).add(node);
      volume.set(targetCommunity, (volume.get(targetCommunity) ?? 0) + nodeDegree);
      minimumMember.set(targetCommunity, Math.min(minimumMember.get(targetCommunity), node));
      membership[node] = targetCommunity;
      moves += 1;
      movedInPass = true;
    }

    if (!movedInPass) {
      passes += 1;
      break;
    }
  }

  const communities = [...members.values()]
    .map((community) => [...community].sort((left, right) => left - right))
    .sort((left, right) => left[0] - right[0]);
  return { communities, moves, passes };
}

function aggregateGraph(graph, communities) {
  const communityByNode = Array(graph.nodeCount);
  communities.forEach((community, communityIndex) => {
    for (const node of community) communityByNode[node] = communityIndex;
  });

  const weightByPair = new Map();
  for (const edge of graph.edges) {
    let source = communityByNode[edge.source];
    let target = communityByNode[edge.target];
    if (source > target) [source, target] = [target, source];
    const key = `${source}:${target}`;
    weightByPair.set(key, (weightByPair.get(key) ?? 0) + edge.weight);
  }
  const edges = [...weightByPair].map(([key, weight]) => {
    const separator = key.indexOf(":");
    return {
      source: Number(key.slice(0, separator)),
      target: Number(key.slice(separator + 1)),
      weight
    };
  });
  return buildLevelGraph(communities.length, edges);
}

function canonicalizeCommunities(communities, nodeIds) {
  return communities
    .map((community) => [...community].sort((left, right) => left - right).map((index) => nodeIds[index]))
    .sort((left, right) => nodeIds.indexOf(left[0]) - nodeIds.indexOf(right[0]));
}

function partitionKey(communities, nodeOrder) {
  return communities.map((community) => community
    .map((nodeId) => nodeOrder.get(nodeId))
    .sort((left, right) => left - right)
    .join(","))
    .sort()
    .join("|");
}

/** Adjusted Rand Index for two complete partitions over the same node domain. */
export function adjustedRandIndex(nodeIds, leftCommunities, rightCommunities) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0 || new Set(nodeIds).size !== nodeIds.length) {
    throw new TypeError("nodeIds must be a non-empty array of unique IDs");
  }

  const nodeSet = new Set(nodeIds);
  const labelsFor = (communities, name) => {
    if (!Array.isArray(communities) || communities.length === 0 ||
      communities.some((community) => !Array.isArray(community) || community.length === 0)) {
      throw new TypeError(`${name} must be a non-empty partition`);
    }
    const labels = new Map();
    communities.forEach((community, communityIndex) => {
      for (const nodeId of community) {
        if (!nodeSet.has(nodeId)) throw new TypeError(`${name} contains an unknown node: ${nodeId}`);
        if (labels.has(nodeId)) throw new TypeError(`${name} contains a duplicate node: ${nodeId}`);
        labels.set(nodeId, communityIndex);
      }
    });
    if (labels.size !== nodeIds.length || nodeIds.some((nodeId) => !labels.has(nodeId))) {
      throw new TypeError(`${name} must assign every node exactly once`);
    }
    return labels;
  };

  const leftLabels = labelsFor(leftCommunities, "left partition");
  const rightLabels = labelsFor(rightCommunities, "right partition");
  const chooseTwo = (count) => count * (count - 1) / 2;
  const leftSizes = new Map();
  const rightSizes = new Map();
  const leftToRightCounts = new Map();

  for (const nodeId of nodeIds) {
    const left = leftLabels.get(nodeId);
    const right = rightLabels.get(nodeId);
    leftSizes.set(left, (leftSizes.get(left) ?? 0) + 1);
    rightSizes.set(right, (rightSizes.get(right) ?? 0) + 1);
    const byRight = leftToRightCounts.get(left) ?? new Map();
    byRight.set(right, (byRight.get(right) ?? 0) + 1);
    leftToRightCounts.set(left, byRight);
  }

  const pairCount = chooseTwo(nodeIds.length);
  if (pairCount === 0) return 1;
  const sameInBoth = [...leftToRightCounts.values()]
    .flatMap((byRight) => [...byRight.values()])
    .reduce((sum, count) => sum + chooseTwo(count), 0);
  const sameLeft = [...leftSizes.values()].reduce((sum, count) => sum + chooseTwo(count), 0);
  const sameRight = [...rightSizes.values()].reduce((sum, count) => sum + chooseTwo(count), 0);
  const expected = sameLeft * sameRight / pairCount;
  const maximum = (sameLeft + sameRight) / 2;
  const denominator = maximum - expected;
  if (denominator === 0) return 1;
  const score = (sameInBoth - expected) / denominator;
  return Math.max(-1, Math.min(1, score));
}

function runLouvain(nodeIds, edges, seed, maxPassesPerLevel, maxLevels, resolution) {
  let graph = buildLevelGraph(
    nodeIds.length,
    edges.map((edge) => ({ source: edge.sourceIndex, target: edge.targetIndex, weight: 1 }))
  );
  let origins = nodeIds.map((_, index) => [index]);
  let bestCommunities = origins.map((members) => [...members]);
  let bestScore = scorePartition(nodeIds, edges, canonicalizeCommunities(bestCommunities, nodeIds), resolution);
  let levels = 0;
  let moves = 0;
  const random = makeRandom(seed);

  while (levels < maxLevels) {
    const local = moveNodes(graph, random, maxPassesPerLevel, resolution);
    moves += local.moves;
    const originalCommunities = local.communities.map((community) => community.flatMap((node) => origins[node]));
    const normalized = canonicalizeCommunities(originalCommunities, nodeIds);
    const score = scorePartition(nodeIds, edges, normalized, resolution);
    levels += 1;
    if (score > bestScore) {
      bestScore = score;
      bestCommunities = originalCommunities;
    }
    if (local.communities.length >= graph.nodeCount) break;

    graph = aggregateGraph(graph, local.communities);
    origins = local.communities.map((community) => community.flatMap((node) => origins[node]));
  }

  return { communities: canonicalizeCommunities(bestCommunities, nodeIds), scaledScore: bestScore, levels, moves };
}

/**
 * Deterministic multi-start Louvain baseline for unweighted undirected graphs.
 * Parallel edge records count separately; self-loops contribute twice to degree.
 * Exact positive rational resolution is supported. This is a heuristic comparator,
 * never an optimality certificate.
 */
export function findLouvainModularityBaseline(nodeIds, edges, options = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0 || new Set(nodeIds).size !== nodeIds.length) {
    throw new TypeError("nodeIds must be a non-empty array of unique IDs");
  }
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");
  const restarts = options.restarts ?? 8;
  const maxPassesPerLevel = options.maxPassesPerLevel ?? 100;
  const maxLevels = options.maxLevels ?? 100;
  const seed = options.seed ?? 1;
  const resolution = options.resolution ?? { numerator: 1, denominator: 1 };
  validatePositiveInteger("restarts", restarts);
  validatePositiveInteger("maxPassesPerLevel", maxPassesPerLevel);
  validatePositiveInteger("maxLevels", maxLevels);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit safe integer");
  }
  if (!Number.isSafeInteger(resolution?.numerator) || resolution.numerator < 1 ||
    !Number.isSafeInteger(resolution?.denominator) || resolution.denominator < 1) {
    throw new RangeError("resolution must be a positive rational with safe integer terms");
  }

  const indexByNodeId = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
  const normalizedEdges = edges.map((edge, edgeIndex) => {
    const sourceIndex = indexByNodeId.get(edge?.source);
    const targetIndex = indexByNodeId.get(edge?.target);
    if (sourceIndex === undefined || targetIndex === undefined) {
      throw new RangeError(`edge ${edgeIndex + 1} has an endpoint outside nodeIds`);
    }
    return { source: edge.source, target: edge.target, sourceIndex, targetIndex };
  });
  // The independent scorer validates that the exact integer score stays safe.
  scorePartition(nodeIds, normalizedEdges, nodeIds.map((nodeId) => [nodeId]), resolution);

  const nodeOrder = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
  let best;
  const scoresByRestart = [];
  const communitiesByRestart = [];
  for (let restart = 0; restart < restarts; restart += 1) {
    const restartSeed = (seed + Math.imul(restart, 0x9e3779b9)) >>> 0;
    const result = runLouvain(nodeIds, normalizedEdges, restartSeed, maxPassesPerLevel, maxLevels, resolution);
    scoresByRestart.push(result.scaledScore);
    communitiesByRestart.push(result.communities);
    const key = partitionKey(result.communities, nodeOrder);
    if (!best || result.scaledScore > best.scaledScore ||
      (result.scaledScore === best.scaledScore && key < best.key)) {
      best = { ...result, key, restart, seed: restartSeed };
    }
  }

  return {
    communities: best.communities,
    scaledScore: best.scaledScore,
    modularity: edges.length === 0
      ? null
      : best.scaledScore / (4 * edges.length ** 2 * resolution.denominator),
    resolution: { ...resolution },
    restarts,
    chosenRestart: best.restart,
    chosenSeed: best.seed,
    restartScores: scoresByRestart,
    restartCommunities: communitiesByRestart,
    levels: best.levels,
    moves: best.moves,
    optimalityProven: false
  };
}
