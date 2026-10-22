/**
 * Deterministic multi-start local search used only to produce a feasible
 * lower bound for exact modularity benchmarks. It never claims optimality.
 */
export function buildGreedyModularityIncumbent(nodeIds, edges) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0 || new Set(nodeIds).size !== nodeIds.length) {
    throw new TypeError("nodeIds must be a non-empty array of unique IDs");
  }
  if (!Array.isArray(edges)) throw new TypeError("edges must be an array");

  const nodeOrder = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, new Map()]));
  const degree = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
  for (const [index, edge] of edges.entries()) {
    const { source, target } = edge ?? {};
    if (!nodeOrder.has(source) || !nodeOrder.has(target)) {
      throw new RangeError(`edge ${index + 1} has an endpoint outside nodeIds`);
    }
    if (source === target) {
      throw new RangeError("self-loops are not supported by the local incumbent search");
    }
    adjacency.get(source).set(target, (adjacency.get(source).get(target) ?? 0) + 1);
    adjacency.get(target).set(source, (adjacency.get(target).get(source) ?? 0) + 1);
    degree.set(source, degree.get(source) + 1);
    degree.set(target, degree.get(target) + 1);
  }

  const edgeCount = edges.length;
  if (!Number.isSafeInteger(4 * edgeCount * edgeCount)) {
    throw new RangeError("scaled modularity score exceeds the exact integer range");
  }
  if (edgeCount === 0) {
    return {
      communities: nodeIds.map((nodeId) => [nodeId]),
      scaledScore: 0,
      starts: 1,
      moves: 0,
      passes: 0
    };
  }

  const indices = nodeIds.map((_, index) => index);
  const degreeDescending = [...indices].sort((left, right) =>
    degree.get(nodeIds[right]) - degree.get(nodeIds[left]) || left - right
  );
  const degreeAscending = [...degreeDescending].reverse();
  const orderCandidates = [
    indices,
    [...indices].reverse(),
    degreeDescending,
    degreeAscending
  ];
  for (let slot = 1; slot < 8; slot += 1) {
    const offset = Math.floor((slot * indices.length) / 8);
    if (offset === 0 || offset >= indices.length) continue;
    orderCandidates.push([...degreeDescending.slice(offset), ...degreeDescending.slice(0, offset)]);
    orderCandidates.push([...degreeAscending.slice(offset), ...degreeAscending.slice(0, offset)]);
  }
  const seenOrders = new Set();
  const orders = orderCandidates.filter((order) => {
    const key = order.join(",");
    if (seenOrders.has(key)) return false;
    seenOrders.add(key);
    return true;
  }).map((order) => order.map((index) => nodeIds[index]));

  let best = null;
  for (const order of orders) {
    const membership = new Map();
    const membersByCommunity = new Map();
    const volumeByCommunity = new Map();
    let nextCommunityId = 0;

    const addSingleton = (nodeId) => {
      const communityId = nextCommunityId++;
      membership.set(nodeId, communityId);
      membersByCommunity.set(communityId, new Set([nodeId]));
      volumeByCommunity.set(communityId, degree.get(nodeId));
    };
    const addToCommunity = (nodeId, communityId) => {
      membersByCommunity.get(communityId).add(nodeId);
      membership.set(nodeId, communityId);
      volumeByCommunity.set(communityId, volumeByCommunity.get(communityId) + degree.get(nodeId));
    };
    for (const nodeId of nodeIds) addSingleton(nodeId);

    let moves = 0;
    let passes = 0;
    for (; passes < 100; passes += 1) {
      let movedThisPass = false;
      for (const nodeId of order) {
        const oldCommunityId = membership.get(nodeId);
        const oldMembers = membersByCommunity.get(oldCommunityId);
        const oldSize = oldMembers.size;
        oldMembers.delete(nodeId);
        membership.delete(nodeId);
        if (oldSize === 1) {
          membersByCommunity.delete(oldCommunityId);
          volumeByCommunity.delete(oldCommunityId);
        } else {
          volumeByCommunity.set(oldCommunityId, volumeByCommunity.get(oldCommunityId) - degree.get(nodeId));
        }

        const edgeWeightByCommunity = new Map();
        for (const [neighbor, weight] of adjacency.get(nodeId)) {
          const communityId = membership.get(neighbor);
          if (communityId === undefined) continue;
          edgeWeightByCommunity.set(communityId, (edgeWeightByCommunity.get(communityId) ?? 0) + weight);
        }

        const gainFor = (communityId, edgeWeight) =>
          4 * edgeCount * edgeWeight - 2 * degree.get(nodeId) * volumeByCommunity.get(communityId);
        const currentGain = oldSize > 1
          ? gainFor(oldCommunityId, edgeWeightByCommunity.get(oldCommunityId) ?? 0)
          : 0;
        let bestGain = 0;
        let bestCommunityId;
        let bestRepresentativeIndex = Number.POSITIVE_INFINITY;
        for (const [communityId, edgeWeight] of edgeWeightByCommunity) {
          const gain = gainFor(communityId, edgeWeight);
          const representativeIndex = Math.min(...[...membersByCommunity.get(communityId)]
            .map((member) => nodeOrder.get(member)));
          if (gain > bestGain || (gain === bestGain && gain > 0 && representativeIndex < bestRepresentativeIndex)) {
            bestGain = gain;
            bestCommunityId = communityId;
            bestRepresentativeIndex = representativeIndex;
          }
        }

        if (bestGain > currentGain) {
          if (bestCommunityId === undefined) addSingleton(nodeId);
          else addToCommunity(nodeId, bestCommunityId);
          movedThisPass = true;
          moves += 1;
        } else if (oldSize > 1) {
          addToCommunity(nodeId, oldCommunityId);
        } else {
          addSingleton(nodeId);
        }
      }
      if (!movedThisPass) {
        passes += 1;
        break;
      }
    }

    const communities = [...membersByCommunity.values()]
      .map((members) => [...members].sort((left, right) => nodeOrder.get(left) - nodeOrder.get(right)))
      .sort((left, right) => nodeOrder.get(left[0]) - nodeOrder.get(right[0]));
    const scaledScore = scorePartition(nodeIds, edges, communities);
    if (!best || scaledScore > best.scaledScore) {
      best = { communities, scaledScore, moves, passes };
    }
  }

  return { ...best, starts: orders.length };
}

export function scorePartition(nodeIds, edges, communities, resolution = {}) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0 || new Set(nodeIds).size !== nodeIds.length) {
    throw new TypeError("nodeIds must be a non-empty array of unique IDs");
  }
  if (!Array.isArray(edges) || !Array.isArray(communities) || communities.length === 0 ||
    communities.some((community) => !Array.isArray(community) || community.length === 0)) {
    throw new TypeError("edges and non-empty communities must be arrays");
  }
  const resolutionNumerator = resolution.numerator ?? 1;
  const resolutionDenominator = resolution.denominator ?? 1;
  if (!Number.isSafeInteger(resolutionNumerator) || resolutionNumerator < 1 ||
    !Number.isSafeInteger(resolutionDenominator) || resolutionDenominator < 1) {
    throw new RangeError("resolution must be a positive rational with safe integer terms");
  }
  const nodeSet = new Set(nodeIds);
  const communityByNode = new Map();
  for (const [communityIndex, community] of communities.entries()) {
    for (const nodeId of community) {
      if (!nodeSet.has(nodeId)) throw new TypeError(`unknown node in partition: ${nodeId}`);
      if (communityByNode.has(nodeId)) throw new TypeError(`duplicate node in partition: ${nodeId}`);
      communityByNode.set(nodeId, communityIndex);
    }
  }
  if (communityByNode.size !== nodeIds.length || nodeIds.some((nodeId) => !communityByNode.has(nodeId))) {
    throw new TypeError("partition must assign every node exactly once");
  }
  const degree = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
  const internalEdges = new Map(communities.map((_, index) => [index, 0]));
  const volume = new Map(communities.map((_, index) => [index, 0]));
  if (!Number.isSafeInteger(4 * edges.length * edges.length * resolutionDenominator)) {
    throw new RangeError("scaled modularity score exceeds the exact integer range");
  }
  for (const [index, edge] of edges.entries()) {
    const { source, target } = edge ?? {};
    if (!nodeSet.has(source) || !nodeSet.has(target)) {
      throw new RangeError(`edge ${index + 1} has an endpoint outside nodeIds`);
    }
    degree.set(source, degree.get(source) + 1);
    degree.set(target, degree.get(target) + 1);
    if (communityByNode.get(source) === communityByNode.get(target)) {
      const communityIndex = communityByNode.get(source);
      internalEdges.set(communityIndex, internalEdges.get(communityIndex) + 1);
    }
  }
  for (const [nodeId, communityIndex] of communityByNode) {
    volume.set(communityIndex, volume.get(communityIndex) + degree.get(nodeId));
  }
  const edgeCount = edges.length;
  return [...volume.keys()].reduce((score, communityIndex) => {
    const contribution = 4 * edgeCount * resolutionDenominator * internalEdges.get(communityIndex) -
      resolutionNumerator * volume.get(communityIndex) ** 2;
    const nextScore = score + contribution;
    if (!Number.isSafeInteger(contribution) || !Number.isSafeInteger(nextScore)) {
      throw new RangeError("scaled modularity score exceeds the exact integer range");
    }
    return nextScore;
  }, 0);
}

export function buildModularityIncumbentBound(scaledScore) {
  if (!Number.isSafeInteger(scaledScore)) {
    throw new RangeError("incumbent modularity score must be a safe integer");
  }
  return [
    `incumbent_score(${scaledScore}).`,
    "partition_score(S) :- S = #sum { Score,C : community_score(C,Score) }.",
    ":- incumbent_score(Bound), partition_score(Score), Score < Bound."
  ].join("\n");
}

export function buildModularityIncumbentHeuristic(nodeIndexById, communities) {
  if (!(nodeIndexById instanceof Map) || !Array.isArray(communities) || communities.length === 0) {
    throw new TypeError("a node index map and non-empty communities are required");
  }
  const seenNodes = new Set();
  const facts = [];
  for (const [communityIndex, community] of communities.entries()) {
    if (!Array.isArray(community) || community.length === 0) {
      throw new TypeError(`community ${communityIndex + 1} must be non-empty`);
    }
    const indexes = community.map((nodeId) => nodeIndexById.get(nodeId));
    if (indexes.some((index) => !Number.isSafeInteger(index) || index < 1)) {
      throw new RangeError(`community ${communityIndex + 1} contains a node without an ASP index`);
    }
    const label = Math.min(...indexes);
    for (const [memberIndex, nodeId] of community.entries()) {
      if (seenNodes.has(nodeId)) throw new TypeError(`duplicate node in partition: ${nodeId}`);
      seenNodes.add(nodeId);
      facts.push(`greedy_member(${indexes[memberIndex]},${label}).`);
    }
  }
  if (seenNodes.size !== nodeIndexById.size) {
    throw new TypeError("communities must assign every indexed node exactly once");
  }
  return [
    ...facts,
    "#heuristic community(V,C) : greedy_member(V,C). [100@1,true]"
  ].join("\n");
}
