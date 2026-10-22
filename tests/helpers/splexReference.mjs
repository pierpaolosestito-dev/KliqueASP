/** Exact maximum s-plex reference search used for independent validation. */
export function searchMaximumSPlexByBranchAndBound(nodeIds, links, s, options = {}) {
  if (!Number.isInteger(s) || s < 1) throw new RangeError("s must be a positive integer");
  if (new Set(nodeIds).size !== nodeIds.length) throw new TypeError("node IDs must be unique");
  const maxSearchStates = options.maxSearchStates ?? Number.POSITIVE_INFINITY;
  const timeLimitMs = options.timeLimitMs ?? Number.POSITIVE_INFINITY;
  if (!(maxSearchStates > 0) || !(timeLimitMs > 0)) throw new RangeError("search limits must be positive");

  const startedAt = performance.now();
  const deadline = startedAt + timeLimitMs;
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const { source, target } of links) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }

  let bestNodeIds = [];
  let exploredStates = 0;
  let complete = true;
  const visit = (candidates, selected, missingCounts) => {
    exploredStates += 1;
    if (selected.length > bestNodeIds.length) bestNodeIds = [...selected];
    if (exploredStates >= maxSearchStates ||
      (Number.isFinite(deadline) && performance.now() >= deadline)) {
      complete = false;
      return;
    }
    if (candidates.length === 0 || upperBound(candidates, selected, missingCounts) <= bestNodeIds.length) return;

    let chosenIndex = 0;
    let fewestAdjacentCandidates = Number.POSITIVE_INFINITY;
    candidates.forEach((id, index) => {
      const adjacentCount = candidates.reduce((count, other) =>
        count + (other !== id && neighbors.get(id)?.has(other) ? 1 : 0), 0);
      if (adjacentCount < fewestAdjacentCandidates) {
        fewestAdjacentCandidates = adjacentCount;
        chosenIndex = index;
      }
    });

    const chosen = candidates[chosenIndex];
    const remaining = candidates.filter((_, index) => index !== chosenIndex);
    const nextMissingCounts = [...missingCounts];
    let chosenMissingCount = 0;
    for (let index = 0; index < selected.length; index += 1) {
      if (neighbors.get(selected[index])?.has(chosen)) continue;
      nextMissingCounts[index] += 1;
      chosenMissingCount += 1;
    }
    if (chosenMissingCount <= s - 1) {
      nextMissingCounts.push(chosenMissingCount);
      const compatible = remaining.filter((candidate) => canAdd(candidate, selected, nextMissingCounts));
      visit(compatible, [...selected, chosen], nextMissingCounts);
    }
    if (complete) visit(remaining, selected, missingCounts);
  };

  const canAdd = (candidate, selected, missingCounts) => {
    let candidateMissingCount = 0;
    for (let index = 0; index < selected.length; index += 1) {
      if (neighbors.get(candidate)?.has(selected[index])) continue;
      candidateMissingCount += 1;
      if (candidateMissingCount > s - 1 || missingCounts[index] >= s - 1) return false;
    }
    return true;
  };

  const upperBound = (candidates, selected, missingCounts) => {
    let bound = selected.length + candidates.length;
    for (let index = 0; index < selected.length; index += 1) {
      const nodeId = selected[index];
      let adjacentCandidateCount = 0;
      for (const candidate of candidates) {
        if (neighbors.get(nodeId)?.has(candidate)) adjacentCandidateCount += 1;
      }
      bound = Math.min(
        bound,
        selected.length + adjacentCandidateCount + (s - 1 - missingCounts[index])
      );
    }
    return bound;
  };

  // Seed branch-and-bound with valid, deterministic greedy witnesses. A strong
  // lower bound is especially useful for sparse graphs where most branches can
  // be rejected by the selected-vertex degree bounds only after finding a good
  // incumbent. The seeds affect search order, never the optimality test.
  const nodeOrder = new Map(nodeIds.map((id, index) => [id, index]));
  const nodeDegrees = new Map(nodeIds.map((id) => [
    id,
    nodeIds.reduce((count, other) =>
      count + (other !== id && neighbors.get(id)?.has(other) ? 1 : 0), 0)
  ]));
  const greedyWitness = (root, preferCurrentAdjacency) => {
    const selected = [root];
    const selectedMissingCounts = [0];
    let candidates = nodeIds.filter((id) => id !== root);

    while (candidates.length > 0) {
      if (Number.isFinite(deadline) && performance.now() >= deadline) {
        complete = false;
        return selected;
      }

      const eligible = candidates.filter((candidate) =>
        canAdd(candidate, selected, selectedMissingCounts)
      );
      if (eligible.length === 0) break;

      eligible.sort((left, right) => {
        const leftAdjacent = selected.reduce((count, member) =>
          count + (neighbors.get(left)?.has(member) ? 1 : 0), 0);
        const rightAdjacent = selected.reduce((count, member) =>
          count + (neighbors.get(right)?.has(member) ? 1 : 0), 0);
        const adjacencyDifference = rightAdjacent - leftAdjacent;
        const degreeDifference = (nodeDegrees.get(right) ?? 0) - (nodeDegrees.get(left) ?? 0);
        const orderDifference = (nodeOrder.get(left) ?? 0) - (nodeOrder.get(right) ?? 0);
        return preferCurrentAdjacency
          ? adjacencyDifference || degreeDifference || orderDifference
          : degreeDifference || adjacencyDifference || orderDifference;
      });

      const chosen = eligible[0];
      let chosenMissingCount = 0;
      for (let index = 0; index < selected.length; index += 1) {
        if (neighbors.get(selected[index])?.has(chosen)) continue;
        selectedMissingCounts[index] += 1;
        chosenMissingCount += 1;
      }
      selected.push(chosen);
      selectedMissingCounts.push(chosenMissingCount);
      candidates = candidates.filter((candidate) => candidate !== chosen);
    }

    return selected;
  };

  for (const preferCurrentAdjacency of [true, false]) {
    for (const root of nodeIds) {
      if (!complete || (Number.isFinite(deadline) && performance.now() >= deadline)) {
        complete = false;
        break;
      }
      const witness = greedyWitness(root, preferCurrentAdjacency);
      if (witness.length > bestNodeIds.length) bestNodeIds = witness;
    }
  }

  visit([...nodeIds], [], []);
  return {
    nodeIds: bestNodeIds,
    size: bestNodeIds.length,
    exploredStates,
    complete,
    elapsedMs: performance.now() - startedAt
  };
}

export function maximumSPlexByBranchAndBound(nodeIds, links, s, options = {}) {
  const result = searchMaximumSPlexByBranchAndBound(nodeIds, links, s, options);
  if (!result.complete) throw new Error("s-plex reference search did not prove optimality");
  return result.size;
}
