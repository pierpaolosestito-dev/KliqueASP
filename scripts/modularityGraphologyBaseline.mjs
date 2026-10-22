import Graph from "graphology";
import louvain from "graphology-communities-louvain";
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

function canonicalKey(communities, indexByNodeId) {
  return communities
    .map((community) => community.map((nodeId) => indexByNodeId.get(nodeId)).sort((a, b) => a - b).join(","))
    .sort()
    .join("|");
}

/**
 * Runs the pinned Graphology Louvain implementation as an independent baseline.
 * Each input edge record has weight 1; parallel records and loops are preserved.
 */
export function findGraphologyLouvainBaseline(nodeIds, edges, options = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0 || new Set(nodeIds).size !== nodeIds.length) {
    throw new TypeError("nodeIds must be a non-empty array of unique IDs");
  }
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");
  const restarts = options.restarts ?? 8;
  const seed = options.seed ?? 1;
  const resolution = options.resolution ?? { numerator: 1, denominator: 1 };
  validatePositiveInteger("restarts", restarts);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("seed must be an unsigned 32-bit safe integer");
  }
  if (!Number.isSafeInteger(resolution?.numerator) || resolution.numerator < 1 ||
    !Number.isSafeInteger(resolution?.denominator) || resolution.denominator < 1) {
    throw new RangeError("resolution must be a positive rational with safe integer terms");
  }
  const libraryResolution = resolution.numerator / resolution.denominator;
  if (!Number.isFinite(libraryResolution) || libraryResolution <= 0) {
    throw new RangeError("resolution must be representable as a positive finite number");
  }

  const indexByNodeId = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
  const graph = new Graph({ type: "undirected", multi: true, allowSelfLoops: true });
  nodeIds.forEach((_, index) => graph.addNode(String(index)));
  edges.forEach((edge, edgeIndex) => {
    const sourceIndex = indexByNodeId.get(edge?.source);
    const targetIndex = indexByNodeId.get(edge?.target);
    if (sourceIndex === undefined || targetIndex === undefined) {
      throw new RangeError(`edge ${edgeIndex + 1} has an endpoint outside nodeIds`);
    }
    graph.addEdgeWithKey(`edge:${edgeIndex}`, String(sourceIndex), String(targetIndex), { weight: 1 });
  });

  const restartScores = [];
  const restartCommunities = [];
  let best;
  for (let restart = 0; restart < restarts; restart += 1) {
    const restartSeed = (seed + Math.imul(restart, 0x9e3779b9)) >>> 0;
    let communities;
    let reportedModularity = null;
    let details;
    if (edges.length === 0) {
      communities = nodeIds.map((nodeId) => [nodeId]);
    } else {
      details = louvain.detailed(graph, {
        getEdgeWeight: "weight",
        resolution: libraryResolution,
        randomWalk: true,
        rng: makeRandom(restartSeed)
      });
      const membersByCommunity = new Map();
      nodeIds.forEach((nodeId, index) => {
        const community = details.communities[String(index)];
        if (community === undefined) throw new Error(`Graphology omitted node ${String(nodeId)}`);
        const members = membersByCommunity.get(community) ?? [];
        members.push(nodeId);
        membersByCommunity.set(community, members);
      });
      communities = [...membersByCommunity.values()];
      reportedModularity = details.modularity;
    }

    const scaledScore = scorePartition(nodeIds, edges, communities, resolution);
    const exactModularity = edges.length === 0
      ? null
      : scaledScore / (4 * edges.length ** 2 * resolution.denominator);
    if (reportedModularity !== null && Math.abs(reportedModularity - exactModularity) > 1e-9) {
      throw new Error(`Graphology modularity ${reportedModularity} differs from the independent score ${exactModularity}`);
    }
    restartScores.push(scaledScore);
    restartCommunities.push(communities);
    const key = canonicalKey(communities, indexByNodeId);
    if (!best || scaledScore > best.scaledScore ||
      (scaledScore === best.scaledScore && key < best.key)) {
      best = {
        communities,
        scaledScore,
        key,
        restart,
        seed: restartSeed,
        reportedModularity,
        levels: details?.dendrogram?.length ?? 0,
        moves: Array.isArray(details?.moves)
          ? details.moves.flat().reduce((sum, moves) => sum + moves, 0)
          : null
      };
    }
  }

  return {
    communities: best.communities,
    scaledScore: best.scaledScore,
    modularity: edges.length === 0
      ? null
      : best.scaledScore / (4 * edges.length ** 2 * resolution.denominator),
    reportedModularity: best.reportedModularity,
    resolution: { ...resolution },
    restarts,
    chosenRestart: best.restart,
    chosenSeed: best.seed,
    restartScores,
    restartCommunities,
    levels: best.levels,
    moves: best.moves,
    optimalityProven: false,
    implementation: "graphology-communities-louvain@2.0.2"
  };
}
