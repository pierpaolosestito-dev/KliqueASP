import assert from "node:assert/strict";
import dataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import graphConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import test from "node:test";
import { searchMaximumSPlexByBranchAndBound } from "./helpers/splexReference.mjs";
import {
  buildAspFactsFromGraph,
  checkGraphTaskRequirements,
  getGraphEndpointId,
  getGraphTaskRequirements,
  normalizeGraphData,
  normalizeGraphId
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildConnectedComponentsProgram,
  buildWeaklyConnectedComponentsProgram,
  buildStronglyConnectedComponentsProgram,
  buildModularityFacts,
  buildEdgeProvenanceByIdentity,
  buildEdgeProvenanceBySourceId,
  buildEdgeSourceIdentityByIdentity,
  summarizeEdgeProvenance,
  buildMaximumModularityProgram,
  buildExperimentalIncrementalModularityProgram,
  buildExperimentalModularityEquivalenceProgram,
  buildMinimumEdgeSeparatorFacts,
  buildMinimumEdgeSeparatorProgram,
  buildMinimumCostEdgeSeparatorProgram,
  buildKCoreProgram,
  buildKCorePeelingRoundProgram,
  buildKCorePeelingRoundFacts,
  computeKCorePeelingRoundCount,
  computeKCoreNumbers,
  getKCoreInducedEdgeIdentities,
  buildPathEdgeFacts,
  mapDominatingSetSupportPairsToRecords,
  buildMinimumHopPathProgram,
  buildBoundedPathNoRouteProgram,
  buildTypedPathProgram,
  buildTypedPathNoRouteProgram,
  buildMinimumDominatingSetProgram,
  buildMinimumNodeSeparatorProgram,
  buildMinimumCostNodeSeparatorProgram,
  buildMaximumKPlexProgram,
  buildMaximalKPlexProgram,
  buildMaximalKPlexCertificateProgram,
  buildGreedyMaximalKPlexWitness,
  getMaximumKPlexCardinalityUpperBound,
  getStructuralSolverOptions,
  formatPathLengthBound,
  searchMaximumKPlexWithAsp,
  normalizeKPlexTimeoutResult,
  parseWitnessComponents,
  parseWitnessWeakComponents,
  parseWitnessStrongComponents,
  parseWitnessDominatingSetExplanations,
  parseWitnessKCoreExplanations,
  parseWitnessKCorePeelingRound,
  parseWitnessKPlexExplanations,
  parseWitnessMaximalKPlexExplanations,
  mapKCoreSupportPairsToRecords,
  mapKCorePeelingStepsToRecords,
  mapModularityContributionsToRecords,
  parseWitnessModularityPartitions,
  parseWitnessMinimumHopPath,
  parseWitnessMinimumHopPathWitness,
  parseBoundedPathNoRouteCertificate,
  parseWitnessTypedPath,
  parseTypedPathNoRouteCertificate,
  parseWitnessRemovedNodeSetExplanations,
  parseWitnessRemovedEdgeSetExplanations,
  parseWitnessRemovedNodeSets,
  parseWitnessRemovedEdgeSets,
  parseWitnessNodeSets,
  selectMaximumNodeSets,
  selectMaximumModularityPartitions,
  selectMinimumEdgeSets,
  selectMinimumCostEdgeSets,
  selectMinimumCostNodeSets,
  selectMinimumNodeSets,
  validateCommunityConfiguration,
  resolveCommunityAttributeBounds
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { formatScaledDecimal } from "../src/lib/kliqueasp/graph/exactDecimal.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const optimizationOptions = ["--opt-mode=optN"];
let runnerPromise;

function getRunner() {
  runnerPromise ??= createClingoWasmRunner();
  return runnerPromise;
}

async function runKCorePeelingRoundQueries({
  runner,
  graph,
  reverseIndex,
  candidateNodeIds,
  k,
  group = "",
  direction = "undirected",
  directedMode
}) {
  const indexByNodeId = new Map(Object.entries(reverseIndex).map(([index, nodeId]) => [nodeId, Number(index)]));
  const groupsByNodeIndex = new Map();
  for (const node of graph.nodes) {
    const index = indexByNodeId.get(node.id);
    if (index !== undefined) {
      groupsByNodeIndex.set(index, Array.isArray(node.analysis?.groups) ? node.analysis.groups : []);
    }
  }
  const edgeIndexPairs = graph.links.flatMap((link) => {
    const source = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.source)));
    const target = indexByNodeId.get(normalizeGraphId(getGraphEndpointId(link.target)));
    return source === undefined || target === undefined ? [] : [[source, target]];
  });
  const activeNodeIds = new Set(candidateNodeIds);
  const peeling = [];
  for (let round = 1; round <= candidateNodeIds.length + 1; round += 1) {
    const activeNodeIndices = [...activeNodeIds].map((nodeId) => indexByNodeId.get(nodeId));
    const roundFacts = buildKCorePeelingRoundFacts(
      activeNodeIndices,
      edgeIndexPairs,
      groupsByNodeIndex,
      direction
    );
    const program = `${roundFacts}\n\n${buildKCorePeelingRoundProgram(
      k,
      activeNodeIndices,
      group,
      direction,
      directedMode
    )}\n`;
    const result = await runner.run(program);
    assert.equal(result.Result, "SATISFIABLE", `peeling round=${round}, k=${k}, mode=${directedMode ?? direction}`);
    const steps = parseWitnessKCorePeelingRound(result.Call?.[0]?.Witnesses, reverseIndex, round);
    assert.ok(steps, `missing ASP witness for peeling round=${round}`);
    if (steps.length === 0) return { coreNodeIds: [...activeNodeIds].sort(), peeling };
    for (const step of steps) {
      assert.ok(activeNodeIds.has(step.nodeId), `ASP removed inactive node ${step.nodeId}`);
      assert.ok(!peeling.some((previous) => previous.nodeId === step.nodeId), `ASP removed ${step.nodeId} twice`);
      peeling.push(step);
      activeNodeIds.delete(step.nodeId);
    }
  }
  throw new Error(`peeling did not reach a fixpoint after ${candidateNodeIds.length} rounds`);
}

function normalizeSets(nodeSets) {
  return nodeSets.map((nodeSet) => [...nodeSet].sort()).sort((left, right) =>
    left.join("|").localeCompare(right.join("|"))
  );
}

function setSignature(values) {
  return [...values].sort().join("\u0000");
}

test("la provenienza opzionale segue l'identit\u00e0 stabile degli archi testimoni", () => {
  const links = [
    { source: "a", target: "b", sourceId: "ab-1", analysis: { provenance: "archivio, fascicolo 7" } },
    { source: "b", target: "a", sourceId: "ab-2", analysis: { provenance: 12 } },
    { source: "c", target: "d", sourceId: "cd", analysis: { provenance: "  " } },
    { source: "e", target: "f", sourceId: "ef", analysis: { provenance: { title: "non scalare" } } },
    { source: "x", target: "y", analysis: { provenance: "legacy source" } },
    { source: "m", target: "n", sourceId: "mn", analysis: { provenance: Number.POSITIVE_INFINITY } }
  ];

  assert.deepEqual(buildEdgeProvenanceByIdentity(links), {
    "source:ab-1": "archivio, fascicolo 7",
    "source:ab-2": "12",
    "pair:x\u0000y": "legacy source"
  });
  const edgeSourceIdentityById = buildEdgeSourceIdentityByIdentity([
    links[0],
    { source: "g", target: "h", sourceId: "local_7", sourceIdGenerated: true },
    { source: "legacy-b", target: "legacy-a" }
  ]);
  assert.deepEqual(edgeSourceIdentityById, {
    "source:ab-1": { sourceId: "ab-1" },
    "source:local_7": { generatedRecordKey: "local_7" },
    "pair:legacy_a\u0000legacy_b": { legacyEndpointPair: ["legacy_b", "legacy_a"] }
  });
  const bySourceId = buildEdgeProvenanceBySourceId(links);
  assert.deepEqual(bySourceId, {
    "ab-1": "archivio, fascicolo 7",
    "ab-2": "12"
  });
  assert.equal(
    summarizeEdgeProvenance(["ab-1", "missing", "ab-1", "ab-2"], bySourceId),
    "ab-1: archivio, fascicolo 7 | ab-2: 12"
  );
  const multiSource = buildEdgeProvenanceBySourceId([
    { source: "a", target: "b", sourceId: "ab-multi", analysis: { provenance: ["archive-z", "archive-a", "archive-z"] } }
  ]);
  assert.deepEqual(multiSource, { "ab-multi": '["archive-a","archive-z"]' });
  assert.equal(summarizeEdgeProvenance(["ab-multi"], multiSource), 'ab-multi: ["archive-a","archive-z"]');
});

function computeReachableSide(nodeIds, edgeRecords, start, removedNodeIds = [], removedEdgeIds = [], direction = "undirected") {
  const removedNodes = new Set(removedNodeIds);
  const removedEdges = new Set(removedEdgeIds);
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const edge of edgeRecords) {
    if (edge.edgeId && removedEdges.has(edge.edgeId)) continue;
    if (removedNodes.has(edge.source) || removedNodes.has(edge.target)) continue;
    neighbors.get(edge.source)?.add(edge.target);
    if (direction === "undirected") neighbors.get(edge.target)?.add(edge.source);
  }
  const reached = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of neighbors.get(current) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return [...reached].sort();
}

function enumerateDirectedMinimumNodeSeparators(nodeIds, edgeRecords, start, goal) {
  const candidates = nodeIds.filter((nodeId) => nodeId !== start && nodeId !== goal);
  let minimumSize = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let mask = 0; mask < 2 ** candidates.length; mask += 1) {
    const removed = candidates.filter((_, index) => (mask & (1 << index)) !== 0);
    if (computeReachableSide(nodeIds, edgeRecords, start, removed, [], "directed").includes(goal)) continue;
    if (removed.length < minimumSize) {
      minimumSize = removed.length;
      solutions.length = 0;
    }
    if (removed.length === minimumSize) solutions.push(removed);
  }
  return Number.isFinite(minimumSize) ? solutions : null;
}

function enumerateDirectedMinimumEdgeSeparators(nodeIds, edgeRecords, start, goal) {
  let minimumSize = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let mask = 0; mask < 2 ** edgeRecords.length; mask += 1) {
    const removed = edgeRecords
      .filter((_, index) => (mask & (1 << index)) !== 0)
      .map((edge) => edge.edgeId);
    if (computeReachableSide(nodeIds, edgeRecords, start, [], removed, "directed").includes(goal)) continue;
    if (removed.length < minimumSize) {
      minimumSize = removed.length;
      solutions.length = 0;
    }
    if (removed.length === minimumSize) solutions.push(removed);
  }
  return Number.isFinite(minimumSize) ? solutions : null;
}

function normalizePartitions(partitions) {
  return partitions
    .map((partition) => partition.map((community) => [...community].sort().join(",")).sort().join("|"))
    .sort();
}

function enumerateSetPartitions(items) {
  const partitions = [];
  const visit = (index, communities) => {
    if (index === items.length) {
      partitions.push(communities.map((community) => [...community]));
      return;
    }
    const item = items[index];
    for (const community of communities) {
      community.push(item);
      visit(index + 1, communities);
      community.pop();
    }
    communities.push([item]);
    visit(index + 1, communities);
    communities.pop();
  };
  visit(0, []);
  return partitions;
}

function computeModularityScore(nodeIds, edges, partition, resolutionNumerator = 1, resolutionDenominator = 1) {
  const edgeCount = edges.length;
  if (edgeCount === 0) return null;
  const communityByNode = new Map(partition.flatMap((community) => community.map((node) => [node, community])));
  const degreeByNode = new Map(nodeIds.map((node) => [node, 0]));
  for (const [source, target] of edges) {
    degreeByNode.set(source, (degreeByNode.get(source) ?? 0) + 1);
    degreeByNode.set(target, (degreeByNode.get(target) ?? 0) + 1);
  }
  return partition.reduce((score, community) => {
    const members = new Set(community);
    const internalEdges = edges.filter(([source, target]) => members.has(source) && members.has(target)).length;
    const volume = community.reduce((sum, node) => sum + (degreeByNode.get(node) ?? 0), 0);
    return score + 4 * edgeCount * resolutionDenominator * internalEdges - resolutionNumerator * volume * volume;
  }, 0);
}

function enumerateMaximumModularityPartitions(nodeIds, edges, resolutionNumerator = 1, resolutionDenominator = 1) {
  let maximumScore = Number.NEGATIVE_INFINITY;
  const partitions = [];
  for (const partition of enumerateSetPartitions(nodeIds)) {
    const score = computeModularityScore(nodeIds, edges, partition, resolutionNumerator, resolutionDenominator);
    if (score > maximumScore) {
      maximumScore = score;
      partitions.length = 0;
    }
    if (score === maximumScore) partitions.push(partition);
  }
  return { maximumScore, partitions };
}

function computeWeightedModularityScore(nodeIds, edges, partition, resolutionNumerator = 1, resolutionDenominator = 1) {
  const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0);
  if (totalWeight === 0) return null;
  const communityByNode = new Map(partition.flatMap((community) => community.map((node) => [node, community])));
  const degreeByNode = new Map(nodeIds.map((node) => [node, 0]));
  for (const edge of edges) {
    degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + edge.weight);
    degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + edge.weight);
  }
  return partition.reduce((score, community) => {
    const members = new Set(community);
    const internalWeight = edges.reduce((sum, edge) =>
      members.has(edge.source) && members.has(edge.target) ? sum + edge.weight : sum, 0);
    const volume = community.reduce((sum, node) => sum + (degreeByNode.get(node) ?? 0), 0);
    return score + 4 * totalWeight * resolutionDenominator * internalWeight - resolutionNumerator * volume * volume;
  }, 0);
}

function enumerateMaximumWeightedModularityPartitions(nodeIds, edges, resolutionNumerator = 1, resolutionDenominator = 1) {
  let maximumScore = Number.NEGATIVE_INFINITY;
  const partitions = [];
  for (const partition of enumerateSetPartitions(nodeIds)) {
    const score = computeWeightedModularityScore(nodeIds, edges, partition, resolutionNumerator, resolutionDenominator);
    if (score > maximumScore) {
      maximumScore = score;
      partitions.length = 0;
    }
    if (score === maximumScore) partitions.push(partition);
  }
  return { maximumScore, partitions };
}

function enumerateMaximumSPlexes(nodeIds, undirectedPairs, s) {
  const adjacent = new Set();
  for (const [source, target] of undirectedPairs) {
    adjacent.add(`${source}\u0000${target}`);
    adjacent.add(`${target}\u0000${source}`);
  }

  let maximumSize = -1;
  const results = [];
  for (let mask = 0; mask < 2 ** nodeIds.length; mask += 1) {
    const subset = nodeIds.filter((_, index) => (mask & (1 << index)) !== 0);
    const isValid = subset.every((node) =>
      subset.filter((other) => other !== node && !adjacent.has(`${node}\u0000${other}`)).length < s
    );
    if (!isValid) continue;
    if (subset.length > maximumSize) {
      maximumSize = subset.length;
      results.length = 0;
    }
    if (subset.length === maximumSize) results.push(subset);
  }
  return results;
}

function enumerateMaximalSPlexes(nodeIds, undirectedPairs, s) {
  const adjacent = new Set();
  for (const [source, target] of undirectedPairs) {
    adjacent.add(`${source}\u0000${target}`);
    adjacent.add(`${target}\u0000${source}`);
  }
  const isValid = (subset) => subset.every((node) =>
    subset.filter((other) => other !== node && !adjacent.has(`${node}\u0000${other}`)).length < s
  );
  const validSubsets = [];
  for (let mask = 0; mask < 2 ** nodeIds.length; mask += 1) {
    const subset = nodeIds.filter((_, index) => (mask & (1 << index)) !== 0);
    if (isValid(subset)) validSubsets.push(subset);
  }
  return validSubsets.filter((subset) => !validSubsets.some((superset) =>
    superset.length > subset.length && subset.every((node) => superset.includes(node))
  ));
}

function assertMaximalKPlexCertificate(explanations, nodeIds, undirectedPairs, s) {
  const adjacent = new Set(undirectedPairs.flatMap(([source, target]) => [
    `${source}\u0000${target}`,
    `${target}\u0000${source}`
  ]));

  for (const explanation of explanations) {
    const selected = new Set(explanation.nodeIds);
    const candidates = nodeIds.filter((nodeId) => !selected.has(nodeId));
    assert.deepEqual([...explanation.candidateNodeIds].sort(), [...candidates].sort());

    for (const candidateNodeId of candidates) {
      const blockers = explanation.blockers.filter((blocker) => blocker.candidateNodeId === candidateNodeId);
      assert.ok(blockers.length > 0, `${candidateNodeId} deve avere almeno un certificato di non-estendibilità`);
      assert.equal(blockers.length, 1, `${candidateNodeId} deve avere un certificato compatto e deterministico`);
      for (const blocker of blockers) {
        if (blocker.reason === "candidate_degree") {
          const missingDegree = explanation.nodeIds.filter((nodeId) =>
            !adjacent.has(`${candidateNodeId}\u0000${nodeId}`)
          ).length;
          assert.equal(blocker.candidateMissingDegree, missingDegree);
          assert.ok(missingDegree >= s);
        } else {
          assert.ok(selected.has(blocker.blockingNodeId));
          assert.equal(adjacent.has(`${candidateNodeId}\u0000${blocker.blockingNodeId}`), false);
          const blockingDegree = explanation.nodeIds.filter((nodeId) =>
            nodeId !== blocker.blockingNodeId && !adjacent.has(`${blocker.blockingNodeId}\u0000${nodeId}`)
          ).length;
          assert.equal(blocker.blockingNodeMissingDegree, blockingDegree);
          assert.equal(blockingDegree, s - 1);
        }
      }
    }
    assert.ok(explanation.blockers.every((blocker) => candidates.includes(blocker.candidateNodeId)));
  }
}

function computeKCoreByPeeling(nodeIds, undirectedPairs, k) {
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const [source, target] of undirectedPairs) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  const active = new Set(nodeIds);
  while (true) {
    const removed = [...active].filter((node) =>
      [...(neighbors.get(node) ?? [])].filter((neighbor) => active.has(neighbor)).length < k
    );
    if (removed.length === 0) break;
    for (const node of removed) active.delete(node);
  }
  return [...active].sort();
}

function computeKCorePeelingRounds(nodeIds, undirectedPairs, k, candidateNodeIds = nodeIds) {
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const [source, target] of undirectedPairs) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  const active = new Set(candidateNodeIds);
  const peeling = [];
  for (let round = 1; round <= candidateNodeIds.length; round += 1) {
    const removedThisRound = [...active].filter((nodeId) =>
      [...(neighbors.get(nodeId) ?? [])].filter((neighborId) => active.has(neighborId)).length < k
    ).sort();
    if (removedThisRound.length === 0) break;
    for (const nodeId of removedThisRound) {
      const survivingNeighborIds = [...(neighbors.get(nodeId) ?? [])]
        .filter((neighborId) => active.has(neighborId))
        .sort();
      peeling.push({ nodeId, round, survivingNeighborIds });
    }
    for (const nodeId of removedThisRound) active.delete(nodeId);
  }
  return { coreNodeIds: [...active].sort(), peeling };
}

function computeDirectedKCoreByPeeling(nodeIds, directedPairs, k, mode) {
  const arcSet = new Set(directedPairs.map(([source, target]) => `${source}\u0000${target}`));
  const neighbors = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  for (const nodeId of nodeIds) {
    for (const otherId of nodeIds) {
      if (nodeId === otherId) continue;
      const hasForward = arcSet.has(`${nodeId}\u0000${otherId}`);
      const hasReverse = arcSet.has(`${otherId}\u0000${nodeId}`);
      const connected = mode === "in"
        ? hasReverse
        : mode === "out"
          ? hasForward
          : hasForward && hasReverse;
      if (connected) neighbors.get(nodeId).add(otherId);
    }
  }
  const active = new Set(nodeIds);
  while (true) {
    const removed = [...active].filter((nodeId) =>
      [...(neighbors.get(nodeId) ?? [])].filter((neighborId) => active.has(neighborId)).length < k
    );
    if (removed.length === 0) break;
    for (const nodeId of removed) active.delete(nodeId);
  }
  return [...active].sort();
}

function computeDirectedKCorePeelingRoundCount(nodeIds, directedPairs, k, mode) {
  const arcSet = new Set(directedPairs.map(([source, target]) => `${source}\u0000${target}`));
  const neighbors = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  for (const nodeId of nodeIds) {
    for (const otherId of nodeIds) {
      if (nodeId === otherId) continue;
      const hasForward = arcSet.has(`${nodeId}\u0000${otherId}`);
      const hasReverse = arcSet.has(`${otherId}\u0000${nodeId}`);
      const connected = mode === "in"
        ? hasReverse
        : mode === "out"
          ? hasForward
          : hasForward && hasReverse;
      if (connected) neighbors.get(nodeId).add(otherId);
    }
  }

  const active = new Set(nodeIds);
  let rounds = 0;
  while (true) {
    const removed = [...active].filter((nodeId) =>
      [...(neighbors.get(nodeId) ?? [])].filter((neighborId) => active.has(neighborId)).length < k
    );
    if (removed.length === 0) return rounds;
    rounds += 1;
    for (const nodeId of removed) active.delete(nodeId);
  }
}

function computeDirectedKCorePeelingRounds(nodeIds, directedPairs, k, mode) {
  const arcSet = new Set(directedPairs.map(([source, target]) => `${source}\u0000${target}`));
  const neighbors = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  for (const nodeId of nodeIds) {
    for (const otherId of nodeIds) {
      if (nodeId === otherId) continue;
      const hasForward = arcSet.has(`${nodeId}\u0000${otherId}`);
      const hasReverse = arcSet.has(`${otherId}\u0000${nodeId}`);
      const connected = mode === "in" ? hasReverse : mode === "out" ? hasForward : hasForward && hasReverse;
      if (connected) neighbors.get(nodeId).add(otherId);
    }
  }
  const active = new Set(nodeIds);
  const peeling = [];
  for (let round = 1; round <= nodeIds.length; round += 1) {
    const removed = [...active].filter((nodeId) =>
      [...(neighbors.get(nodeId) ?? [])].filter((neighborId) => active.has(neighborId)).length < k
    ).sort();
    if (removed.length === 0) break;
    for (const nodeId of removed) {
      peeling.push({
        nodeId,
        round,
        survivingNeighborIds: [...(neighbors.get(nodeId) ?? [])]
          .filter((neighborId) => active.has(neighborId))
          .sort()
      });
    }
    for (const nodeId of removed) active.delete(nodeId);
  }
  return { coreNodeIds: [...active].sort(), peeling };
}

function computeConnectedComponents(nodeIds, undirectedPairs) {
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const [source, target] of undirectedPairs) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  const unseen = new Set(nodeIds);
  const components = [];
  while (unseen.size > 0) {
    const start = unseen.values().next().value;
    const stack = [start];
    const component = [];
    unseen.delete(start);
    while (stack.length > 0) {
      const node = stack.pop();
      component.push(node);
      for (const neighbor of neighbors.get(node) ?? []) {
        if (!unseen.delete(neighbor)) continue;
        stack.push(neighbor);
      }
    }
    components.push(component);
  }
  return normalizeSets(components);
}

function computeStronglyConnectedComponents(nodeIds, directedPairs) {
  const outgoing = new Map(nodeIds.map((id) => [id, new Set()]));
  const incoming = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const [source, target] of directedPairs) {
    outgoing.get(source)?.add(target);
    incoming.get(target)?.add(source);
  }
  const visited = new Set();
  const order = [];
  const visitForward = (start) => {
    const stack = [[start, false]];
    while (stack.length) {
      const [node, exiting] = stack.pop();
      if (exiting) {
        order.push(node);
        continue;
      }
      if (visited.has(node)) continue;
      visited.add(node);
      stack.push([node, true]);
      for (const next of outgoing.get(node) ?? []) {
        if (!visited.has(next)) stack.push([next, false]);
      }
    }
  };
  for (const node of nodeIds) if (!visited.has(node)) visitForward(node);
  visited.clear();
  const components = [];
  for (const start of order.reverse()) {
    if (visited.has(start)) continue;
    const component = [];
    const stack = [start];
    visited.add(start);
    while (stack.length) {
      const node = stack.pop();
      component.push(node);
      for (const next of incoming.get(node) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
    components.push(component);
  }
  return normalizeSets(components);
}

function enumerateMinimumDominatingSets(nodeIds, undirectedPairs, candidateNodeIds = nodeIds, targetNodeIds = nodeIds) {
  const adjacent = new Set();
  for (const [source, target] of undirectedPairs) {
    adjacent.add(`${source}\u0000${target}`);
    adjacent.add(`${target}\u0000${source}`);
  }
  let minimumSize = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let mask = 0; mask < 2 ** candidateNodeIds.length; mask += 1) {
    const chosen = candidateNodeIds.filter((_, index) => (mask & (1 << index)) !== 0);
    const coversTargets = targetNodeIds.every((target) =>
      chosen.includes(target) || chosen.some((candidate) => adjacent.has(`${candidate}\u0000${target}`))
    );
    if (!coversTargets) continue;
    if (chosen.length < minimumSize) {
      minimumSize = chosen.length;
      solutions.length = 0;
    }
    if (chosen.length === minimumSize) solutions.push(chosen);
  }
  return solutions;
}

function enumerateMinimumNodeSeparators(nodeIds, undirectedPairs, start, goal, removableNodeIds = nodeIds) {
  const candidates = removableNodeIds.filter((id) => id !== start && id !== goal);
  let minimumSize = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let mask = 0; mask < 2 ** candidates.length; mask += 1) {
    const removed = candidates.filter((_, index) => (mask & (1 << index)) !== 0);
    const active = new Set(nodeIds.filter((id) => !removed.includes(id)));
    const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
    for (const [source, target] of undirectedPairs) {
      neighbors.get(source)?.add(target);
      neighbors.get(target)?.add(source);
    }
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const next of neighbors.get(current) ?? []) {
        if (!active.has(next) || seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    if (seen.has(goal)) continue;
    if (removed.length < minimumSize) {
      minimumSize = removed.length;
      solutions.length = 0;
    }
    if (removed.length === minimumSize) solutions.push(removed);
  }
  return Number.isFinite(minimumSize) ? solutions : null;
}

function enumerateMinimumCostNodeSeparators(nodeIds, undirectedPairs, removalCosts, start, goal, removableNodeIds = nodeIds) {
  const candidates = removableNodeIds.filter((id) => id !== start && id !== goal);
  let minimumCost = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let mask = 0; mask < 2 ** candidates.length; mask += 1) {
    const removed = candidates.filter((_, index) => (mask & (1 << index)) !== 0);
    const active = new Set(nodeIds.filter((id) => !removed.includes(id)));
    const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
    for (const [source, target] of undirectedPairs) {
      neighbors.get(source)?.add(target);
      neighbors.get(target)?.add(source);
    }
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const next of neighbors.get(current) ?? []) {
        if (!active.has(next) || seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    if (seen.has(goal)) continue;
    const cost = removed.reduce((sum, id) => sum + removalCosts[id], 0);
    if (cost < minimumCost) {
      minimumCost = cost;
      solutions.length = 0;
    }
    if (cost === minimumCost) solutions.push(removed);
  }
  return Number.isFinite(minimumCost) ? { cost: minimumCost, solutions } : null;
}

function enumerateMinimumEdgeSeparators(nodeIds, undirectedPairs, edgeIdentities, start, goal) {
  let minimumSize = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let mask = 0; mask < 2 ** undirectedPairs.length; mask += 1) {
    const removed = undirectedPairs
      .map((_, index) => index)
      .filter((index) => (mask & (1 << index)) !== 0);
    const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
    undirectedPairs.forEach(([source, target], index) => {
      if (removed.includes(index)) return;
      neighbors.get(source)?.add(target);
      neighbors.get(target)?.add(source);
    });
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const next of neighbors.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    if (seen.has(goal)) continue;
    if (removed.length < minimumSize) {
      minimumSize = removed.length;
      solutions.length = 0;
    }
    if (removed.length === minimumSize) {
      solutions.push(removed.map((index) => edgeIdentities[index]));
    }
  }
  return Number.isFinite(minimumSize) ? solutions : null;
}

function enumerateMinimumCostEdgeSeparators(nodeIds, undirectedPairs, edgeIdentities, costs, start, goal) {
  let minimumCost = Number.POSITIVE_INFINITY;
  const solutions = [];
  for (let mask = 0; mask < 2 ** undirectedPairs.length; mask += 1) {
    const removed = undirectedPairs
      .map((_, index) => index)
      .filter((index) => (mask & (1 << index)) !== 0);
    const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
    undirectedPairs.forEach(([source, target], index) => {
      if (removed.includes(index)) return;
      neighbors.get(source)?.add(target);
      neighbors.get(target)?.add(source);
    });
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const next of neighbors.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    if (seen.has(goal)) continue;
    const cost = removed.reduce((sum, index) => sum + costs[index], 0);
    if (cost < minimumCost) {
      minimumCost = cost;
      solutions.length = 0;
    }
    if (cost === minimumCost) solutions.push(removed.map((index) => edgeIdentities[index]));
  }
  return Number.isFinite(minimumCost) ? { cost: minimumCost, solutions } : null;
}

function computeShortestPath(nodeIds, undirectedPairs, start, goal) {
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const [source, target] of undirectedPairs) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  const queue = [[start]];
  const visited = new Set([start]);
  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    if (current === goal) return path;
    for (const neighbor of neighbors.get(current) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      queue.push([...path, neighbor]);
    }
  }
  return null;
}

function computeReachableByDepth(nodeIds, undirectedPairs, start, maximumDepth) {
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const [source, target] of undirectedPairs) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  const distance = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    const nextDistance = distance.get(current) + 1;
    for (const next of neighbors.get(current) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, nextDistance);
      queue.push(next);
    }
  }
  return Array.from({ length: maximumDepth + 1 }, (_, depth) => ({
    depth,
    nodeIds: [...distance.entries()]
      .filter(([, nodeDepth]) => nodeDepth <= depth)
      .map(([nodeId]) => nodeId)
      .sort()
  }));
}

test("k-plex massimo ASP coincide con il riferimento esaustivo su una fixture non-clique", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const pairs = [["a", "b"], ["a", "c"], ["b", "c"], ["b", "d"], ["c", "d"]];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: pairs.map(([source, target]) => ({ source, target }))
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const runner = await getRunner();

  for (const s of [1, 2]) {
    const result = await runner.run(`${facts.trim()}\n\n${buildMaximumKPlexProgram(s)}\n`, optimizationOptions);
    assert.equal(result.Result, "OPTIMUM FOUND");
    const actual = selectMaximumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, reverseIndex));
    const expected = enumerateMaximumSPlexes(nodeIds, pairs, s);
    assert.deepEqual(normalizeSets(actual), normalizeSets(expected), `s=${s}`);

    const singleResult = await runner.run(
      `${facts.trim()}\n\n${buildMaximumKPlexProgram(s)}\n`,
      getStructuralSolverOptions("kPlex")
    );
    assert.equal(singleResult.Result, "OPTIMUM FOUND");
    const single = selectMaximumNodeSets(parseWitnessNodeSets(singleResult.Call?.[0]?.Witnesses, reverseIndex));
    assert.equal(single.length, 1, `s=${s}: la modalità singola espone un solo ottimo`);
    assert.ok(normalizeSets(expected).some((solution) =>
      JSON.stringify(solution) === JSON.stringify([...single[0]].sort())
    ), `s=${s}: la soluzione singola deve essere ottima`);
  }
});

test("ricerca ASP del massimo k-plex coincide con il riferimento su tutti i grafi semplici a quattro nodi", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possiblePairs = nodeIds.flatMap((source, index) => nodeIds.slice(index + 1).map((target) => [source, target]));
  const runner = await getRunner();

  for (let mask = 0; mask < 64; mask += 1) {
    const pairs = possiblePairs.filter((_, index) => mask & (1 << index));
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, reverseIndex } = buildAspFactsFromGraph(graph);

    for (const s of [1, 2, 3]) {
      const expected = enumerateMaximumSPlexes(nodeIds, pairs, s);
      const search = await searchMaximumKPlexWithAsp(s, nodeIds, graph.links, "", false, (program, modelLimit) =>
        runner.run(`${facts.trim()}\n\n${program}\n`, [], modelLimit)
      );
      assert.equal(search.complete, true, `mask=${mask}, s=${s}`);
      assert.equal(search.maximumSize, expected[0]?.length ?? 0, `mask=${mask}, s=${s}`);
      if (search.maximumSize > 0) {
        const actual = parseWitnessKPlexExplanations(search.result?.Call?.[0]?.Witnesses, reverseIndex);
        assert.equal(actual.length, 1, `mask=${mask}, s=${s}: la ricerca senza enumerazione restituisce un solo testimone`);
        assert.equal(actual[0].nodeIds.length, search.maximumSize, `mask=${mask}, s=${s}: il testimone ha cardinalità massima`);
        assert.ok(expected.some((solution) => JSON.stringify([...solution].sort()) === JSON.stringify([...actual[0].nodeIds].sort())));
      }
    }
  }
});

test("k-plex massimali ASP coincide con l'enumerazione indipendente su tutti i grafi semplici a quattro nodi", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possiblePairs = nodeIds.flatMap((source, index) => nodeIds.slice(index + 1).map((target) => [source, target]));
  const runner = await getRunner();

  for (let mask = 0; mask < 64; mask += 1) {
    const pairs = possiblePairs.filter((_, index) => mask & (1 << index));
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, reverseIndex } = buildAspFactsFromGraph(graph);

    for (const s of [1, 2, 3]) {
      const result = await runner.run(
        `${facts.trim()}\n\n${buildMaximalKPlexProgram(s)}\n`,
        [],
        0
      );
      assert.equal(result.Result, "SATISFIABLE", `mask=${mask}, s=${s}`);
      const explanations = parseWitnessMaximalKPlexExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
      const actual = explanations.map((item) => item.nodeIds);
      const expected = enumerateMaximalSPlexes(nodeIds, pairs, s);
      assert.deepEqual(normalizeSets(actual), normalizeSets(expected), `mask=${mask}, s=${s}`);
      assertMaximalKPlexCertificate(explanations, nodeIds, pairs, s);

      for (const nodeSet of actual) {
        assert.ok(nodeSet.length > 0, `mask=${mask}, s=${s}: un dominio non vuoto non ha un massimale vuoto`);
        if (s === 1) {
          assert.ok(nodeSet.every((node, index) => nodeSet.slice(index + 1).every((other) =>
            pairs.some(([source, target]) => source === node && target === other || source === other && target === node)
          )), `mask=${mask}: ogni massimale s=1 deve essere una clique`);
        }
      }

      const single = await runner.run(
        `${facts.trim()}\n\n${buildMaximalKPlexProgram(s)}\n`,
        [],
        1
      );
      assert.equal(single.Result, "SATISFIABLE", `singolo mask=${mask}, s=${s}`);
      const singleModels = parseWitnessMaximalKPlexExplanations(single.Call?.[0]?.Witnesses, reverseIndex);
      assert.equal(singleModels.length, 1, `singolo mask=${mask}, s=${s}`);
      assert.ok(expected.some((solution) => JSON.stringify([...solution].sort()) === JSON.stringify([...singleModels[0].nodeIds].sort())));
      assertMaximalKPlexCertificate(singleModels, nodeIds, pairs, s);
    }
  }
});

test("la costruzione greedy di un k-plex massimale e il certificato ASP coincidono col riferimento esaustivo su tutte le topologie a quattro nodi", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possiblePairs = nodeIds.flatMap((source, index) => nodeIds.slice(index + 1).map((target) => [source, target]));
  const runner = await getRunner();

  for (let mask = 0; mask < 64; mask += 1) {
    const pairs = possiblePairs.filter((_, index) => mask & (1 << index));
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, reverseIndex, indexByNodeId } = buildAspFactsFromGraph(graph);

    for (const s of [1, 2, 3]) {
      const selected = buildGreedyMaximalKPlexWitness(s, nodeIds, pairs.map(([source, target]) => ({ source, target })));
      const expectedMaximalSets = enumerateMaximalSPlexes(nodeIds, pairs, s);
      assert.ok(expectedMaximalSets.some((nodeSet) => JSON.stringify([...nodeSet].sort()) === JSON.stringify([...selected].sort())),
        `mask=${mask}, s=${s}: la costruzione deve produrre un insieme s-plex massimale`);
      const result = await runner.run(
        `${facts.trim()}\n${selected.map((id) => `in(${indexByNodeId.get(id)}).`).join("\n")}\n\n${buildMaximalKPlexCertificateProgram(s)}\n`,
        [],
        1
      );
      assert.equal(result.Result, "SATISFIABLE", `mask=${mask}, s=${s}`);
      const explanations = parseWitnessMaximalKPlexExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
      assert.equal(explanations.length, 1, `mask=${mask}, s=${s}: un certificato ASP`);
      assert.deepEqual([...explanations[0].nodeIds].sort(), [...selected].sort(), `mask=${mask}, s=${s}`);
      assertMaximalKPlexCertificate(explanations, nodeIds, pairs, s);
    }
  }
});

test("la costruzione greedy del k-plex rispetta il dominio candidato di un gruppo", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const pairs = [["a", "b"], ["a", "c"], ["b", "c"], ["c", "d"]];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: pairs.map(([source, target]) => ({ source, target }))
  });
  const { facts, reverseIndex, indexByNodeId } = buildAspFactsFromGraph(graph);
  const selected = buildGreedyMaximalKPlexWitness(1, ["a", "b"], graph.links);
  const groupFacts = ["a", "b"].map((id) => `group(${indexByNodeId.get(id)},"candidate").`).join("\n");
  const selectedFacts = selected.map((id) => `in(${indexByNodeId.get(id)}).`).join("\n");
  const runner = await getRunner();
  const result = await runner.run(
    `${facts.trim()}\n${groupFacts}\n${selectedFacts}\n\n${buildMaximalKPlexCertificateProgram(1, "candidate")}\n`,
    [],
    1
  );

  assert.deepEqual(selected, ["a", "b"]);
  assert.equal(result.Result, "SATISFIABLE");
  const explanations = parseWitnessMaximalKPlexExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
  assert.deepEqual(explanations[0]?.nodeIds, ["a", "b"]);
  assert.deepEqual(explanations[0]?.candidateNodeIds, []);
});

test("il testimone massimale s=2 sul grafo psicologico è costruito fuori solver e certificato da ASP", async () => {
  const graph = normalizeGraphData(dataset);
  const { facts, reverseIndex, indexByNodeId } = buildAspFactsFromGraph(graph);
  const nodeIds = graph.nodes.map((node) => node.id);
  const selected = buildGreedyMaximalKPlexWitness(2, nodeIds, graph.links);
  const selectedFacts = selected.map((id) => `in(${indexByNodeId.get(id)}).`).join("\n");
  const runner = await getRunner();
  const result = await runner.run(
    `${facts.trim()}\n${selectedFacts}\n\n${buildMaximalKPlexCertificateProgram(2)}\n`,
    [],
    1
  );

  assert.equal(result.Result, "SATISFIABLE");
  const explanations = parseWitnessMaximalKPlexExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
  assert.equal(explanations.length, 1);
  assert.deepEqual([...explanations[0].nodeIds].sort(), [...selected].sort());
  assertMaximalKPlexCertificate(explanations, nodeIds, graph.links.map((link) => [link.source, link.target]), 2);
});

test("i nodi fuori gruppo non possono estendere un k-plex massimale e il task non usa opzioni di ottimizzazione", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const pairs = [["a", "b"], ["a", "c"], ["b", "c"], ["c", "d"]];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: pairs.map(([source, target]) => ({ source, target }))
  });
  const { facts, reverseIndex, indexByNodeId } = buildAspFactsFromGraph(graph);
  const groupFacts = ["a", "b"].map((id) => `group(${indexByNodeId.get(id)},"candidate").`).join("\n");
  const runner = await getRunner();
  const result = await runner.run(
    `${facts.trim()}\n${groupFacts}\n\n${buildMaximalKPlexProgram(1, "candidate")}\n`,
    [],
    0
  );

  assert.equal(result.Result, "SATISFIABLE");
  const actual = parseWitnessKPlexExplanations(result.Call?.[0]?.Witnesses, reverseIndex).map((item) => item.nodeIds);
  assert.deepEqual(normalizeSets(actual), [["a", "b"]]);
  const maximalExplanations = parseWitnessMaximalKPlexExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
  assert.deepEqual(maximalExplanations[0]?.candidateNodeIds, []);
  assert.deepEqual(maximalExplanations[0]?.blockers, []);
  assert.deepEqual(getStructuralSolverOptions("maximalKPlex"), []);
  assert.deepEqual(getStructuralSolverOptions("maximalKPlex", true), []);
  assert.throws(() => buildMaximalKPlexProgram(0), RangeError);
  assert.throws(() => buildMaximalKPlexProgram(1.5), RangeError);
});

test("il massimo k-plex psicologico s=3 coincide con ASP e riferimento branch-and-bound indipendente", async () => {
  const graph = normalizeGraphData(dataset);
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const nodeIds = graph.nodes.map((node) => node.id);
  const upperBound = getMaximumKPlexCardinalityUpperBound(3, nodeIds, graph.links);
  assert.equal(upperBound, 8);

  const runner = await getRunner();
  const search = await searchMaximumKPlexWithAsp(3, nodeIds, graph.links, "", false, (program, modelLimit) =>
    runner.run(`${facts.trim()}\n\n${program}\n`, [], modelLimit)
  );

  assert.equal(search.complete, true);
  assert.equal(search.maximumSize, 7);
  assert.equal(search.queryCount, 4);
  assert.equal(search.solverStatus, "OPTIMUM FOUND");
  assert.equal(search.result?.Result, "SATISFIABLE");

  const reference = searchMaximumSPlexByBranchAndBound(nodeIds, graph.links, 3, {
    timeLimitMs: 30000,
    maxSearchStates: 50_000_000
  });
  assert.equal(reference.complete, true, JSON.stringify(reference));
  assert.equal(reference.size, search.maximumSize);
  assert.equal(reference.size, 7);
  const referenceAdjacency = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  for (const { source, target } of graph.links) {
    referenceAdjacency.get(source)?.add(target);
    referenceAdjacency.get(target)?.add(source);
  }
  for (const nodeId of reference.nodeIds) {
    const missing = reference.nodeIds.filter((otherId) =>
      otherId !== nodeId && !referenceAdjacency.get(nodeId)?.has(otherId)
    );
    assert.ok(missing.length <= 2, `${nodeId} has ${missing.length} non-neighbors in the independent witness`);
  }

  const [witness] = parseWitnessKPlexExplanations(search.result?.Call?.[0]?.Witnesses, reverseIndex);
  assert.ok(witness);
  assert.equal(witness.nodeIds.length, 7);

  const expectedMissingPairs = [];
  for (let first = 0; first < witness.nodeIds.length; first += 1) {
    for (let second = first + 1; second < witness.nodeIds.length; second += 1) {
      const a = witness.nodeIds[first];
      const b = witness.nodeIds[second];
      const adjacent = graph.links.some((edge) =>
        (String(edge.source) === a && String(edge.target) === b) ||
        (String(edge.source) === b && String(edge.target) === a)
      );
      if (!adjacent) expectedMissingPairs.push([a, b]);
    }
  }
  expectedMissingPairs.sort((left, right) => `${left[0]}|${left[1]}`.localeCompare(`${right[0]}|${right[1]}`));
  assert.deepEqual(witness.missingTiePairs, expectedMissingPairs);
  const missingByNode = new Map(witness.nodeIds.map((nodeId) => [nodeId, 0]));
  for (const [a, b] of witness.missingTiePairs) {
    missingByNode.set(a, (missingByNode.get(a) ?? 0) + 1);
    missingByNode.set(b, (missingByNode.get(b) ?? 0) + 1);
  }
  assert.ok([...missingByNode.values()].every((count) => count <= 2));
});

test("i massimi k-plex psicologici s=4–9 coincidono col riferimento branch-and-bound indipendente", async () => {
  const graph = normalizeGraphData(dataset);
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const nodeIds = graph.nodes.map((node) => node.id);
  const runner = await getRunner();
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  for (const { source, target } of graph.links) {
    adjacency.get(source)?.add(target);
    adjacency.get(target)?.add(source);
  }

  for (const { s, expectedSize } of [
    { s: 4, expectedSize: 8 },
    { s: 5, expectedSize: 9 },
    { s: 6, expectedSize: 10 },
    { s: 7, expectedSize: 11 },
    { s: 8, expectedSize: 12 },
    { s: 9, expectedSize: 13 }
  ]) {
    const search = await searchMaximumKPlexWithAsp(s, nodeIds, graph.links, "", false, (program, modelLimit) =>
      runner.run(`${facts.trim()}\n\n${program}\n`, [], modelLimit)
    );
    const reference = searchMaximumSPlexByBranchAndBound(nodeIds, graph.links, s, {
      timeLimitMs: s >= 8 ? 90000 : 30000,
      maxSearchStates: 50_000_000
    });

    assert.equal(search.complete, true, `ASP s=${s}`);
    assert.equal(search.maximumSize, expectedSize, `ASP s=${s}`);
    assert.equal(search.solverStatus, "OPTIMUM FOUND", `ASP s=${s}`);
    assert.equal(reference.complete, true, `riferimento s=${s}: ${JSON.stringify(reference)}`);
    assert.equal(reference.size, expectedSize, `riferimento s=${s}`);

    const [witness] = parseWitnessKPlexExplanations(search.result?.Call?.[0]?.Witnesses, reverseIndex);
    assert.ok(witness, `witness ASP s=${s}`);
    for (const nodeSet of [reference.nodeIds, witness.nodeIds]) {
      assert.equal(nodeSet.length, expectedSize, `dimensione witness s=${s}`);
      for (const nodeId of nodeSet) {
        const nonNeighbors = nodeSet.filter((otherId) => otherId !== nodeId && !adjacency.get(nodeId)?.has(otherId));
        assert.ok(nonNeighbors.length <= s - 1, `${nodeId} has ${nonNeighbors.length} non-neighbors in an s=${s} witness`);
      }
    }
  }
});

test("il limite di grado interno del k-plex ignora cappi e archi paralleli", async () => {
  const nodeIds = ["a", "b", "c", "isolated"];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: [
      { source: "a", target: "b" },
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "isolated", target: "isolated" }
    ]
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const runner = await getRunner();
  const search = await searchMaximumKPlexWithAsp(2, nodeIds, graph.links, "", false, (program, modelLimit) =>
    runner.run(`${facts.trim()}\n\n${program}\n`, [], modelLimit)
  );

  assert.equal(search.complete, true);
  assert.equal(search.maximumSize, 3);
  const [witness] = parseWitnessKPlexExplanations(search.result?.Call?.[0]?.Witnesses, reverseIndex);
  assert.deepEqual([...witness.nodeIds].sort(), ["a", "b", "c"]);
});

test("enumerazione k-plex ASP restituisce tutti e soli gli ottimi alla cardinalità provata", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const pairs = [["a", "b"], ["b", "c"], ["c", "d"]];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: pairs.map(([source, target]) => ({ source, target }))
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const expected = enumerateMaximumSPlexes(nodeIds, pairs, 2);
  const runner = await getRunner();
  const search = await searchMaximumKPlexWithAsp(2, nodeIds, graph.links, "", true, (program, modelLimit) =>
    runner.run(`${facts.trim()}\n\n${program}\n`, [], modelLimit)
  );

  assert.equal(search.complete, true);
  assert.equal(search.maximumSize, 3);
  assert.equal(search.result?.Result, "SATISFIABLE");
  const actual = parseWitnessKPlexExplanations(search.result?.Call?.[0]?.Witnesses, reverseIndex);
  assert.deepEqual(normalizeSets(actual.map((item) => item.nodeIds)), normalizeSets(expected));
  for (const explanation of actual) {
    assert.equal(explanation.missingTiePairs.length, 1);
  }
});

test("ricerca k-plex interrotta non restituisce il miglior testimone come se fosse ottimo", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const edges = nodeIds.flatMap((source, index) => nodeIds.slice(index + 1).map((target) => ({ source, target })));
  let queryCount = 0;
  const search = await searchMaximumKPlexWithAsp(2, nodeIds, edges, "", false, async () => {
    queryCount += 1;
    return { Result: queryCount === 1 ? "SATISFIABLE" : "TIMEOUT" };
  });

  assert.equal(search.complete, false);
  assert.equal(search.maximumSize, 2);
  assert.equal(search.queryCount, 2);
  assert.equal(search.solverStatus, "TIMEOUT");
  assert.equal(search.result, undefined);
});

test("la ricerca k-plex non dichiara l'ottimo se ASP non trova neppure un singoletto valido", async () => {
  const nodeIds = ["a", "b"];
  const search = await searchMaximumKPlexWithAsp(2, nodeIds, [], "", false, async () => ({ Result: "UNSATISFIABLE" }));

  assert.equal(search.complete, false);
  assert.equal(search.maximumSize, 0);
  assert.equal(search.solverStatus, "UNSATISFIABLE");
  assert.equal(search.result, undefined);
});

test("la ricerca k-plex rispetta il gruppo selezionato anche se i nodi esterni aumentano i gradi", async () => {
  const nodeIds = ["a", "b", "c", "external"];
  const pairs = [["a", "b"], ["a", "external"], ["b", "external"], ["c", "external"]];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: pairs.map(([source, target]) => ({ source, target }))
  });
  const { facts, reverseIndex, indexByNodeId } = buildAspFactsFromGraph(graph);
  const groupFacts = ["a", "b", "c"].map((id) => `group(${indexByNodeId.get(id)},"candidate").`).join("\n");
  const objectEndpointLinks = graph.links.map((link) => ({
    ...link,
    source: { id: String(link.source) },
    target: { id: String(link.target) }
  }));
  const expected = enumerateMaximumSPlexes(["a", "b", "c"], [["a", "b"]], 1);
  const runner = await getRunner();
  const search = await searchMaximumKPlexWithAsp(1, ["a", "b", "c"], objectEndpointLinks, "candidate", false, (program, modelLimit) =>
    runner.run(`${facts.trim()}\n${groupFacts}\n\n${program}\n`, [], modelLimit)
  );

  assert.equal(search.complete, true);
  assert.equal(search.maximumSize, 2);
  const actual = parseWitnessKPlexExplanations(search.result?.Call?.[0]?.Witnesses, reverseIndex);
  assert.deepEqual(normalizeSets(actual.map((item) => item.nodeIds)), normalizeSets(expected));
  assert.ok(actual.every((item) => item.nodeIds.every((id) => ["a", "b", "c"].includes(id))));
});

test("k-core ASP coincide con il peeling indipendente e gestisce il core vuoto", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const pairs = [["a", "b"], ["a", "c"], ["b", "c"], ["b", "d"], ["c", "d"]];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: pairs.map(([source, target]) => ({ source, target }))
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const runner = await getRunner();

  for (const k of [1, 2, 3]) {
    const result = await runner.run(`${facts.trim()}\n\n${buildKCoreProgram(k)}\n`, optimizationOptions);
    assert.equal(result.Result, "OPTIMUM FOUND");
    const actual = selectMaximumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, reverseIndex));
    const expected = computeKCoreByPeeling(nodeIds, pairs, k);
    assert.deepEqual(normalizeSets(actual), [expected], `k=${k}`);
  }
});

test("i fatti del round k-core contengono solo dominio attivo e archi indotti senza duplicati", () => {
  const groupsByNodeIndex = new Map([
    [1, ["candidate"]],
    [2, ["candidate"]],
    [3, ["outside"]]
  ]);
  const edges = [[1, 2], [1, 2], [2, 1], [2, 3], [3, 3]];
  const active = [2, 1, 2];

  assert.equal(
    buildKCorePeelingRoundFacts(active, edges, groupsByNodeIndex, "directed"),
    [
      "node(1).",
      "node(2).",
      'group(1,"candidate").',
      'group(2,"candidate").',
      "edge(1,2).",
      "edge(2,1)."
    ].join("\n")
  );
  assert.equal(
    buildKCorePeelingRoundFacts(active, edges, groupsByNodeIndex, "undirected"),
    [
      "node(1).",
      "node(2).",
      'group(1,"candidate").',
      'group(2,"candidate").',
      "edge(1,2).",
      "edge(2,1)."
    ].join("\n")
  );
  assert.throws(() => buildKCorePeelingRoundFacts([-1], edges), /non negativi/);
  assert.throws(() => buildKCorePeelingRoundFacts([1], [[1, Number.NaN]]), /coppie di indici/);
});

test("il k-core ASP coincide col peeling indipendente sul grafo psicologico", async () => {
  const graph = normalizeGraphData(dataset, graphConfig);
  const start = Number(graphConfig.timeline.start);
  const end = Number(graphConfig.timeline.end);
  const nodes = graph.nodes.filter((node) => {
    const timeline = graphConfig.nodeTypes?.[node.type]?.timeline;
    if (!timeline) return true;
    const from = Number(node.data?.[timeline.startField] ?? 0);
    const to = Number(node.data?.[timeline.endField] ?? 9999);
    return from <= end && to >= start;
  });
  const ids = new Set(nodes.map((node) => node.id));
  const links = graph.links.filter((link) => ids.has(link.source) && ids.has(link.target));
  const projection = { ...graph, nodes, links };
  const { facts, reverseIndex } = buildAspFactsFromGraph(projection);
  const coreNumbers = computeKCoreNumbers(
    nodes.map((node) => node.id),
    links.map((link) => ({ source: link.source, target: link.target }))
  );
  const runner = await getRunner();

  assert.equal(nodes.length, 335);
  assert.equal(links.length, 989);
  for (const k of [2, 3]) {
    const result = await runner.run(`${facts.trim()}\n\n${buildKCoreProgram(k)}\n`, getStructuralSolverOptions("kCore"));
    assert.equal(result.Result, "OPTIMUM FOUND");
    const models = selectMaximumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, reverseIndex));
    const expected = computeKCoreByPeeling(nodes.map((node) => node.id), links.map((link) => [link.source, link.target]), k);
    assert.deepEqual(normalizeSets(models[0] ? [models[0]] : []), [expected], `k=${k}`);
    const profileCore = nodes.map((node) => node.id).filter((nodeId) => (coreNumbers.get(nodeId) ?? -1) >= k).sort();
    assert.deepEqual(profileCore, expected, `profilo core number per k=${k}`);
    const roundLimit = computeKCorePeelingRoundCount(nodes.map((node) => node.id), links, k);
    assert.equal(roundLimit, k === 2 ? 2 : 3);
    const explainedResult = await runner.run(
      `${facts.trim()}\n\n${buildKCoreProgram(k, "", true, "undirected", undefined, roundLimit)}\n`,
      getStructuralSolverOptions("kCore")
    );
    assert.equal(explainedResult.Result, "OPTIMUM FOUND");
    const explanation = parseWitnessKCoreExplanations(explainedResult.Call?.[0]?.Witnesses, reverseIndex)[0];
    const independentPeeling = computeKCorePeelingRounds(
      nodes.map((node) => node.id),
      links.map((link) => [link.source, link.target]),
      k
    );
    assert.deepEqual(explanation.peeling, independentPeeling.peeling, `peeling ASP psicologico, k=${k}`);
    const iterativePeeling = await runKCorePeelingRoundQueries({
      runner,
      graph: projection,
      reverseIndex,
      candidateNodeIds: nodes.map((node) => node.id),
      k
    });
    assert.deepEqual(iterativePeeling.coreNodeIds, expected, `core ASP per round psicologico, k=${k}`);
    assert.deepEqual(iterativePeeling.peeling, independentPeeling.peeling, `round ASP per round psicologico, k=${k}`);
  }
});

test("il peeling ASP rispetta il gruppo candidato e non spiega nodi fuori dominio", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", groupFields: ["$.group"] },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", group: "candidate" },
      { id: "b", group: "candidate" },
      { id: "c", group: "candidate" },
      { id: "leaf", group: "candidate" },
      { id: "outside", group: "other" }
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "a" },
      { source: "a", target: "leaf" },
      { source: "b", target: "outside" }
    ]
  }, config);
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const result = await (await getRunner()).run(
    `${facts.trim()}\n\n${buildKCoreProgram(
      2,
      "candidate",
      true,
      "undirected",
      undefined,
      computeKCorePeelingRoundCount(["a", "b", "c", "leaf"], graph.links, 2)
    )}\n`,
    getStructuralSolverOptions("kCore")
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  const explanation = parseWitnessKCoreExplanations(result.Call?.[0]?.Witnesses, reverseIndex)[0];
  assert.deepEqual(normalizeSets([explanation.nodeIds]), [["a", "b", "c"]]);
  assert.deepEqual(explanation.peeling, [{ nodeId: "leaf", round: 1, survivingNeighborIds: ["a"] }]);
  assert.ok(!explanation.peeling.some((step) => step.nodeId === "outside"));
  const iterativePeeling = await runKCorePeelingRoundQueries({
    runner: await getRunner(),
    graph,
    reverseIndex,
    candidateNodeIds: ["a", "b", "c", "leaf"],
    k: 2,
    group: "candidate"
  });
  assert.deepEqual(iterativePeeling.coreNodeIds, ["a", "b", "c"]);
  assert.deepEqual(iterativePeeling.peeling, explanation.peeling);
});

test("il profilo dei core number coincide con il peeling indipendente su grafi non orientati e diretti", () => {
  const nodeIds = ["a", "b", "c"];
  const undirectedPairs = [["a", "b"], ["a", "c"], ["b", "c"]];
  for (let mask = 0; mask < 2 ** undirectedPairs.length; mask += 1) {
    const pairs = undirectedPairs.filter((_, index) => (mask & (1 << index)) !== 0);
    const coreNumbers = computeKCoreNumbers(nodeIds, pairs.map(([source, target]) => ({ source, target })));
    for (let k = 1; k <= nodeIds.length; k += 1) {
      const actual = nodeIds.filter((nodeId) => (coreNumbers.get(nodeId) ?? -1) >= k).sort();
      assert.deepEqual(actual, computeKCoreByPeeling(nodeIds, pairs, k), `undirected mask=${mask}, k=${k}`);
      const independentPeeling = computeKCorePeelingRounds(nodeIds, pairs, k);
      const rounds = independentPeeling.peeling.reduce((maximum, step) => Math.max(maximum, step.round), 0);
      assert.equal(
        computeKCorePeelingRoundCount(nodeIds, pairs.map(([source, target]) => ({ source, target })), k),
        rounds,
        `undirected peeling rounds mask=${mask}, k=${k}`
      );
    }
  }

  const possibleArcs = nodeIds.flatMap((source) => nodeIds
    .filter((target) => target !== source)
    .map((target) => [source, target]));
  for (let mask = 0; mask < 2 ** possibleArcs.length; mask += 1) {
    const arcs = possibleArcs.filter((_, index) => (mask & (1 << index)) !== 0);
    const links = arcs.map(([source, target]) => ({ source, target }));
    for (const mode of ["in", "out", "mutual"]) {
      const coreNumbers = computeKCoreNumbers(nodeIds, links, "directed", mode);
      for (let k = 1; k <= nodeIds.length; k += 1) {
        const actual = nodeIds.filter((nodeId) => (coreNumbers.get(nodeId) ?? -1) >= k).sort();
        assert.deepEqual(actual, computeDirectedKCoreByPeeling(nodeIds, arcs, k, mode), `directed mask=${mask}, mode=${mode}, k=${k}`);
        assert.equal(
          computeKCorePeelingRoundCount(nodeIds, links, k, "directed", mode),
          computeDirectedKCorePeelingRoundCount(nodeIds, arcs, k, mode),
          `directed peeling rounds mask=${mask}, mode=${mode}, k=${k}`
        );
      }
    }
  }

  const candidateNumbers = computeKCoreNumbers(["a", "b"], [
    { source: "a", target: "a" },
    { source: "a", target: "b" },
    { source: "a", target: "b" },
    { source: "b", target: "outside" }
  ]);
  assert.deepEqual([...candidateNumbers.entries()].sort(), [["a", 1], ["b", 1]],
    "cappi ignorati, archi paralleli contati una volta e nodi fuori dal dominio candidato esclusi");

  const internalLinks = [
    { source: "a", target: "b", sourceId: "ab" },
    { source: "a", target: "b", sourceId: "ab-parallel" },
    { source: "b", target: "a", sourceId: "ba" },
    { source: "a", target: "a", sourceId: "loop" },
    { source: "a", target: "outside", sourceId: "external" }
  ];
  assert.deepEqual(getKCoreInducedEdgeIdentities(["a", "b"], internalLinks), [
    "source:ab", "source:ab-parallel", "source:ba"
  ], "il 3D evidenzia tutti i record interni e non cappi o archi fuori dominio");
  assert.deepEqual(getKCoreInducedEdgeIdentities(["a", "b"], internalLinks, "directed", "mutual"), [
    "source:ab", "source:ab-parallel", "source:ba"
  ], "in modalita reciproca si evidenziano i record di entrambe le direzioni soltanto se la coppia è reciproca");
  assert.deepEqual(getKCoreInducedEdgeIdentities(["a", "b"], [
    { source: "a", target: "b", sourceId: "ab" }
  ], "directed", "mutual"), [], "un arco diretto isolato non sostiene una relazione reciproca");
  assert.throws(() => computeKCoreNumbers(nodeIds, [], "directed"), /richiede una semantica esplicita/);
  assert.throws(() => computeKCoreNumbers(nodeIds, [], "undirected", "in"), /soltanto ai grafi diretti/);
});

test("i tre k-core direzionali ASP coincidono col peeling indipendente su tutti i 64 digrafi loopless a tre nodi", async () => {
  const nodeIds = ["a", "b", "c"];
  const possibleArcs = nodeIds.flatMap((source) => nodeIds
    .filter((target) => target !== source)
    .map((target) => [source, target]));
  const directedConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        sourceField: "$.source",
        targetField: "$.target",
        direction: "directed"
      }
    }
  };
  const runner = await getRunner();

  for (let mask = 0; mask < 2 ** possibleArcs.length; mask += 1) {
    const directedPairs = possibleArcs.filter((_, index) => (mask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: directedPairs.map(([source, target]) => ({ source, target }))
    }, directedConfig);
    const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
    for (const mode of ["in", "out", "mutual"]) {
      for (const k of [0, 1, 2, 3]) {
        const result = await runner.run(
          `${facts.trim()}\n\n${buildKCoreProgram(k, "", false, "directed", mode)}\n`,
          optimizationOptions
        );
        assert.equal(result.Result, "OPTIMUM FOUND", `mask=${mask}, mode=${mode}, k=${k}`);
        const actual = selectMaximumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, reverseIndex));
        const expected = computeDirectedKCoreByPeeling(nodeIds, directedPairs, k, mode);
        assert.deepEqual(normalizeSets(actual), [expected], `mask=${mask}, mode=${mode}, k=${k}`);
        const iterativePeeling = await runKCorePeelingRoundQueries({
          runner,
          graph,
          reverseIndex,
          candidateNodeIds: nodeIds,
          k,
          direction: "directed",
          directedMode: mode
        });
        const expectedPeeling = computeDirectedKCorePeelingRounds(nodeIds, directedPairs, k, mode);
        assert.deepEqual(iterativePeeling.coreNodeIds, expectedPeeling.coreNodeIds,
          `core round ASP mask=${mask}, mode=${mode}, k=${k}`);
        assert.deepEqual(iterativePeeling.peeling, expectedPeeling.peeling,
          `peeling round ASP mask=${mask}, mode=${mode}, k=${k}`);
      }
    }
  }
});

test("i supporti e il peeling del k-core diretto conservano il verso dei record sorgente", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const edges = [
    { id: "ab", source: "a", target: "b" },
    { id: "ba", source: "b", target: "a" },
    { id: "bc", source: "b", target: "c" },
    { id: "cb", source: "c", target: "b" },
    { id: "db", source: "d", target: "b" }
  ];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "directed",
        identity: "multigraph"
      }
    }
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const runner = await getRunner();
  const expectedEdgesByMode = {
    in: { a: ["ba"], b: [], c: ["bc"], d: [] },
    out: { a: ["ab"], b: [], c: ["cb"], d: ["db"] },
    mutual: { a: ["ab", "ba"], b: [], c: ["bc", "cb"], d: [] }
  };
  const expectedCoreEdgesByMode = {
    in: { a: ["ba"], b: ["ab", "cb"], c: ["bc"], d: [] },
    out: { a: ["ab"], b: ["ba", "bc"], c: ["cb"], d: ["db"] },
    mutual: { a: ["ab", "ba"], b: ["ab", "ba", "bc", "cb"], c: ["bc", "cb"], d: [] }
  };

  for (const mode of ["in", "out", "mutual"]) {
    const coreResult = await runner.run(
      `${facts.trim()}\n\n${buildKCoreProgram(
        1,
        "",
        true,
        "directed",
        mode,
        computeKCorePeelingRoundCount(nodeIds, graph.links, 1, "directed", mode)
      )}\n`,
      getStructuralSolverOptions("kCore")
    );
    assert.equal(coreResult.Result, "OPTIMUM FOUND", `${mode}, k=1`);
    const coreExplanation = parseWitnessKCoreExplanations(coreResult.Call?.[0]?.Witnesses, reverseIndex)[0];
    const mappedCore = mapKCoreSupportPairsToRecords(coreExplanation.supportPairs, graph.links, mode);
    for (const nodeId of nodeIds) {
      const actualIds = [...new Set(mappedCore
        .filter((pair) => pair.sourceNodeId === nodeId)
        .flatMap((pair) => pair.supportingRecords.map((record) => record.edgeId)))].sort();
      assert.deepEqual(actualIds, (expectedCoreEdgesByMode[mode]?.[nodeId] ?? []).sort(), `${mode}, core node=${nodeId}`);
    }

    const result = await runner.run(
      `${facts.trim()}\n\n${buildKCoreProgram(
        2,
        "",
        true,
        "directed",
        mode,
        computeKCorePeelingRoundCount(nodeIds, graph.links, 2, "directed", mode)
      )}\n`,
      getStructuralSolverOptions("kCore")
    );
    assert.equal(result.Result, "OPTIMUM FOUND", mode);
    const explanation = parseWitnessKCoreExplanations(result.Call?.[0]?.Witnesses, reverseIndex)[0];
    assert.deepEqual(explanation.nodeIds, [], `${mode}: k=2 svuota il core`);
    const mappedPeeling = mapKCorePeelingStepsToRecords(explanation.peeling, graph.links, mode);
    for (const nodeId of nodeIds) {
      const actualIds = [...new Set(mappedPeeling
        .filter((step) => step.nodeId === nodeId)
        .flatMap((step) => step.supportingPairs.flatMap((pair) => pair.supportingRecords.map((record) => record.edgeId))))]
        .sort();
      assert.deepEqual(actualIds, expectedEdgesByMode[mode][nodeId].sort(), `${mode}, nodo=${nodeId}`);
    }
  }

  assert.throws(() => buildKCoreProgram(1, "", false, "directed"), /richiede una semantica esplicita/);
  assert.throws(() => buildKCoreProgram(1, "", false, "undirected", "in"), /soltanto ai grafi diretti/);
  assert.throws(() => buildKCoreProgram(1, "", true, "undirected", undefined, -1), RangeError);
  assert.throws(() => buildKCoreProgram(1, "", true, "undirected", undefined, 1.5), RangeError);
  assert.throws(() => buildKCoreProgram(1, "", false, "undirected", undefined, 0), /soltanto quando/);
});

test("insieme dominante minimo ASP coincide con enumerazione esaustiva su tutti i grafi a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const pairs = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
    const result = await runner.run(
      `${facts.trim()}\n\n${buildMinimumDominatingSetProgram()}\n`,
      getStructuralSolverOptions("dominatingSet", true)
    );
    assert.equal(result.Result, "OPTIMUM FOUND", `grafo=${graphMask}`);
    const actual = selectMinimumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, reverseIndex));
    const expected = enumerateMinimumDominatingSets(nodeIds, pairs);
    assert.deepEqual(normalizeSets(actual), normalizeSets(expected), `grafo=${graphMask}`);

    const explanations = parseWitnessDominatingSetExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
    const minimumExplanations = explanations.filter((item) => item.nodeIds.length === expected[0]?.length);
    assert.deepEqual(normalizeSets(minimumExplanations.map((item) => item.nodeIds)), normalizeSets(expected));
    for (const explanation of minimumExplanations) {
      const expectedCoveragePairs = [];
      for (const targetId of nodeIds) {
        for (const coveringNodeId of [...explanation.nodeIds].sort()) {
          const adjacent = pairs.some(([source, target]) =>
            (source === targetId && target === coveringNodeId) ||
            (source === coveringNodeId && target === targetId)
          );
          if (targetId === coveringNodeId || adjacent) expectedCoveragePairs.push([targetId, coveringNodeId]);
        }
      }
      assert.deepEqual(explanation.coveragePairs, expectedCoveragePairs, `copertura ASP, grafo=${graphMask}`);
    }
  }
});

test("l'insieme dominante distingue i candidati dai nodi obiettivo e segnala i casi impossibili", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", groupFields: ["$.group"] },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "hub", group: "candidates" },
      { id: "left", group: "targets" },
      { id: "right", group: "targets" }
    ],
    edges: [
      { id: "hub-left-a", source: "hub", target: "left" },
      { id: "hub-left-b", source: "hub", target: "left" },
      { source: "hub", target: "right" }
    ]
  }, config);
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const runner = await getRunner();
  const result = await runner.run(
    `${facts.trim()}\n\n${buildMinimumDominatingSetProgram("candidates", "targets")}\n`,
    getStructuralSolverOptions("dominatingSet")
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  assert.deepEqual(
    selectMinimumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, reverseIndex)),
    [["hub"]]
  );
  const explanation = parseWitnessDominatingSetExplanations(result.Call?.[0]?.Witnesses, reverseIndex)
    .find((item) => item.nodeIds.length === 1);
  assert.deepEqual(explanation?.coveragePairs, [["left", "hub"], ["right", "hub"]]);
  const mappedCoverage = mapDominatingSetSupportPairsToRecords(explanation?.coveragePairs ?? [], graph.links);
  assert.deepEqual(
    mappedCoverage.find((item) => item.targetNodeId === "left")?.supportingRecords.map((record) => record.edgeId).sort(),
    ["hub-left-a", "hub-left-b"]
  );
  assert.equal(mappedCoverage.find((item) => item.targetNodeId === "right")?.supportingRecords[0]?.edgeIdGenerated, true);

  const impossibleGraph = normalizeGraphData({
    nodes: [{ id: "candidate", group: "candidates" }, { id: "target", group: "targets" }],
    edges: []
  }, config);
  const impossibleFacts = buildAspFactsFromGraph(impossibleGraph).facts;
  const impossible = await runner.run(
    `${impossibleFacts.trim()}\n\n${buildMinimumDominatingSetProgram("candidates", "targets")}\n`
  );
  assert.equal(impossible.Result, "UNSATISFIABLE");
});

test("il parser dell'insieme dominante ignora gli eventi Lower di clingo senza answer set", () => {
  const explanations = parseWitnessDominatingSetExplanations([
    { Lower: [1] },
    { Lower: [69] },
    { Value: ["in(1)", "dominated_by(2,1)"] }
  ], { 1: "candidate", 2: "target" });
  assert.deepEqual(explanations, [{
    nodeIds: ["candidate"],
    coveragePairs: [["target", "candidate"]]
  }]);
  assert.deepEqual(selectMinimumNodeSets(explanations.map((item) => item.nodeIds)), [["candidate"]]);
});

test("i separatori minimi ASP coincidono con brute force su ogni grafo a 4 nodi e coppia di terminali", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const terminalPairs = possiblePairs;
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const pairs = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);

    for (const [start, goal] of terminalPairs) {
      const expected = enumerateMinimumNodeSeparators(nodeIds, pairs, start, goal);
      const result = await runner.run(
        `${facts.trim()}\n\n${buildMinimumNodeSeparatorProgram(indexByNodeId.get(start), indexByNodeId.get(goal))}\n`,
        getStructuralSolverOptions("minimumNodeSeparator", true)
      );
      if (expected === null) {
        assert.equal(result.Result, "UNSATISFIABLE", `grafo=${graphMask}, terminali=${start},${goal}`);
        continue;
      }
      assert.equal(result.Result, "OPTIMUM FOUND", `grafo=${graphMask}, terminali=${start},${goal}`);
      const explanations = parseWitnessRemovedNodeSetExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
      const actual = selectMinimumNodeSets(explanations.map((item) => item.removedIds));
      assert.deepEqual(normalizeSets(actual), normalizeSets(expected), `grafo=${graphMask}, terminali=${start},${goal}`);
      assert.ok(actual.every((set) => !set.includes(start) && !set.includes(goal)), "i terminali sono sempre protetti");
      const optimumKeys = new Set(actual.map(setSignature));
      for (const explanation of explanations.filter((item) => optimumKeys.has(setSignature(item.removedIds)))) {
        assert.deepEqual(
          explanation.reachableNodeIds,
          computeReachableSide(nodeIds, pairs.map(([source, target]) => ({ source, target })), start, explanation.removedIds),
          `certificato lato nodo grafo=${graphMask}, terminali=${start},${goal}`
        );
        assert.ok(!explanation.reachableNodeIds.includes(goal), "il terminale finale resta fuori dal lato raggiungibile");
      }
    }
  }
});

test("i separatori di nodi e archi seguono la direzione e coincidono con brute force su tutti i digrafi semplici a 3 nodi", async () => {
  const nodeIds = ["0", "1", "2"];
  const possibleArcs = nodeIds.flatMap((source) => nodeIds
    .filter((target) => target !== source)
    .map((target) => [source, target]));
  const directedConfig = {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "directed",
        identity: "multigraph"
      }
    }
  };
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possibleArcs.length; graphMask += 1) {
    const arcs = possibleArcs
      .map(([source, target], index) => ({ id: `arc_${index}`, source, target, index }))
      .filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: arcs.map(({ id, source, target }) => ({ id, source, target }))
    }, directedConfig);
    const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
    const edgeFacts = buildMinimumEdgeSeparatorFacts(graph.links, indexByNodeId);
    const edgeRecords = graph.links.map((edge, index) => ({
      source: edge.source,
      target: edge.target,
      edgeId: edgeFacts.reverseEdgeIndex[index + 1]
    }));
    assert.equal(graph.valid, true, `grafo diretto=${graphMask}`);
    assert.equal(graph.direction, "directed");

    for (const start of nodeIds) {
      for (const goal of nodeIds) {
        if (start === goal) continue;
        const nodeExpected = enumerateDirectedMinimumNodeSeparators(nodeIds, edgeRecords, start, goal);
        const nodeResult = await runner.run(
          `${facts.trim()}\n\n${buildMinimumNodeSeparatorProgram(indexByNodeId.get(start), indexByNodeId.get(goal))}\n`,
          getStructuralSolverOptions("minimumNodeSeparator", true)
        );
        if (nodeExpected === null) {
          assert.equal(nodeResult.Result, "UNSATISFIABLE", `separatore nodi grafo=${graphMask}, ${start}->${goal}`);
        } else {
          assert.equal(nodeResult.Result, "OPTIMUM FOUND", `separatore nodi grafo=${graphMask}, ${start}->${goal}`);
          const explanations = parseWitnessRemovedNodeSetExplanations(nodeResult.Call?.[0]?.Witnesses, reverseIndex);
          const actual = selectMinimumNodeSets(explanations.map((item) => item.removedIds));
          assert.deepEqual(normalizeSets(actual), normalizeSets(nodeExpected), `nodi grafo=${graphMask}, ${start}->${goal}`);
          const optimumKeys = new Set(actual.map(setSignature));
          for (const explanation of explanations.filter((item) => optimumKeys.has(setSignature(item.removedIds)))) {
            assert.deepEqual(
              explanation.reachableNodeIds,
              computeReachableSide(nodeIds, edgeRecords, start, explanation.removedIds, [], "directed"),
              `certificato raggiungibilità diretta grafo=${graphMask}, ${start}->${goal}`
            );
          }
        }

        const edgeExpected = enumerateDirectedMinimumEdgeSeparators(nodeIds, edgeRecords, start, goal);
        const edgeResult = await runner.run(
          `${facts.trim()}\n${edgeFacts.facts.trim()}\n${buildMinimumEdgeSeparatorProgram(
            indexByNodeId.get(start), indexByNodeId.get(goal), "directed"
          )}\n`,
          getStructuralSolverOptions("minimumEdgeSeparator", true)
        );
        assert.equal(
          edgeResult.Result,
          arcs.length === 0 ? "SATISFIABLE" : "OPTIMUM FOUND",
          `separatore archi grafo=${graphMask}, ${start}->${goal}`
        );
        const edgeExplanations = parseWitnessRemovedEdgeSetExplanations(
          edgeResult.Call?.[0]?.Witnesses,
          edgeFacts.reverseEdgeIndex,
          reverseIndex
        );
        const edgeActual = selectMinimumEdgeSets(edgeExplanations.map((item) => item.removedIds));
        assert.deepEqual(normalizeSets(edgeActual), normalizeSets(edgeExpected), `archi grafo=${graphMask}, ${start}->${goal}`);
        const optimumEdgeKeys = new Set(edgeActual.map(setSignature));
        for (const explanation of edgeExplanations.filter((item) => optimumEdgeKeys.has(setSignature(item.removedIds)))) {
          assert.deepEqual(
            explanation.reachableNodeIds,
            computeReachableSide(nodeIds, edgeRecords, start, [], explanation.removedIds, "directed"),
            `certificato taglio diretto grafo=${graphMask}, ${start}->${goal}`
          );
        }
      }
    }
  }
});

test("i separatori diretti a costo minimo seguono gli archi dichiarati", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", removalCostField: "$.cut_cost" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "directed",
        identity: "multigraph",
        removalCostField: "$.cut_cost"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", cut_cost: 13 },
      { id: "a", cut_cost: 4 },
      { id: "g", cut_cost: 17 },
      { id: "b", cut_cost: 9 }
    ],
    edges: [
      { id: "sa", source: "s", target: "a", cut_cost: 2 },
      { id: "ag", source: "a", target: "g", cut_cost: 3 },
      { id: "gb", source: "g", target: "b", cut_cost: 5 },
      { id: "bs", source: "b", target: "s", cut_cost: 7 }
    ]
  }, config);
  const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
  const edgeFacts = buildMinimumEdgeSeparatorFacts(graph.links, indexByNodeId);
  const runner = await getRunner();
  const directedRequirements = [
    ...(getGraphTaskRequirements("minimumCostNodeSeparator") ?? []),
    "directedEdges"
  ];
  assert.equal(graph.valid, true);
  assert.equal(graph.capabilities.nodeRemovalCosts.available, true);
  assert.equal(graph.capabilities.edgeRemovalCosts.available, true);
  assert.equal(checkGraphTaskRequirements(graph.capabilities, directedRequirements).available, true);

  const nodeResult = await runner.run(
    `${facts.trim()}\n\n${buildMinimumCostNodeSeparatorProgram(indexByNodeId.get("s"), indexByNodeId.get("g"))}\n`,
    getStructuralSolverOptions("minimumCostNodeSeparator", true)
  );
  assert.equal(nodeResult.Result, "OPTIMUM FOUND");
  const nodeExplanations = parseWitnessRemovedNodeSetExplanations(nodeResult.Call?.[0]?.Witnesses, reverseIndex);
  const nodeCosts = Object.fromEntries(graph.nodes.map((node) => [node.id, node.analysis.removalCost]));
  const nodeCuts = selectMinimumCostNodeSets(nodeExplanations.map((item) => item.removedIds), nodeCosts);
  assert.deepEqual(normalizeSets(nodeCuts), [["a"]]);
  assert.equal(nodeCuts[0].reduce((sum, id) => sum + nodeCosts[id], 0), 4);
  assert.deepEqual(nodeExplanations.find((item) => setSignature(item.removedIds) === setSignature(["a"]))?.reachableNodeIds, ["s"]);

  const edgeResult = await runner.run(
    `${facts.trim()}\n${edgeFacts.facts.trim()}\n${buildMinimumCostEdgeSeparatorProgram(
      indexByNodeId.get("s"), indexByNodeId.get("g"), "directed"
    )}\n`,
    getStructuralSolverOptions("minimumCostEdgeSeparator", true)
  );
  assert.equal(edgeResult.Result, "OPTIMUM FOUND");
  const edgeExplanations = parseWitnessRemovedEdgeSetExplanations(
    edgeResult.Call?.[0]?.Witnesses,
    edgeFacts.reverseEdgeIndex,
    reverseIndex
  );
  const edgeCuts = selectMinimumCostEdgeSets(
    edgeExplanations.map((item) => item.removedIds),
    edgeFacts.removalCostByEdgeId
  );
  assert.deepEqual(normalizeSets(edgeCuts), [["source:sa"]]);
  assert.equal(edgeCuts[0].reduce((sum, id) => sum + edgeFacts.removalCostByEdgeId[id], 0), 2);
  assert.deepEqual(edgeExplanations.find((item) => setSignature(item.removedIds) === setSignature(["source:sa"]))?.reachableNodeIds, ["s"]);
});

test("il separatore rispetta il gruppo rimovibile e l'ASP protegge i terminali", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", groupFields: ["$.group"] },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "start", group: "endpoints" },
      { id: "middle", group: "removable" },
      { id: "goal", group: "endpoints" }
    ],
    edges: [{ source: "start", target: "middle" }, { source: "middle", target: "goal" }]
  }, config);
  const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
  const runner = await getRunner();
  const result = await runner.run(
    `${facts.trim()}\n\n${buildMinimumNodeSeparatorProgram(indexByNodeId.get("start"), indexByNodeId.get("goal"), "removable")}\n`,
    getStructuralSolverOptions("minimumNodeSeparator")
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  assert.deepEqual(
    selectMinimumNodeSets(parseWitnessRemovedNodeSets(result.Call?.[0]?.Witnesses, reverseIndex)),
    [["middle"]]
  );
  assert.throws(() => buildMinimumNodeSeparatorProgram(1, 1), /devono essere distinti/);
});

test("il separatore pesato rispetta gruppo, costi e topologie in confronto esaustivo", async () => {
  const nodeIds = ["s", "a", "b", "t"];
  const topologies = [
    { name: "path", pairs: [["s", "a"], ["a", "b"], ["b", "t"]] },
    { name: "star", pairs: [["s", "a"], ["s", "b"], ["s", "t"]] },
    { name: "cycle", pairs: [["s", "a"], ["a", "b"], ["b", "t"], ["t", "s"]] },
    { name: "disconnected", pairs: [["s", "a"], ["b", "t"]] },
    { name: "diamond", pairs: [["s", "a"], ["a", "t"], ["s", "b"], ["b", "t"]] },
    { name: "complete", pairs: [["s", "a"], ["s", "b"], ["s", "t"], ["a", "b"], ["a", "t"], ["b", "t"]] }
  ];
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: {
        idField: "$.id",
        groupFields: ["$.group"],
        removalCostField: "$.cut_cost"
      },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  };
  const runner = await getRunner();

  for (const [topologyIndex, topology] of topologies.entries()) {
    for (let groupMask = 0; groupMask < 2 ** nodeIds.length; groupMask += 1) {
      const costs = Object.fromEntries(nodeIds.map((id, index) => [id, ((topologyIndex * 3 + groupMask + index * 2) % 7) + 1]));
      const removableNodeIds = nodeIds.filter((_, index) => (groupMask & (1 << index)) !== 0);
      const graph = normalizeGraphData({
        nodes: nodeIds.map((id, index) => ({
          id,
          group: removableNodeIds.includes(id) ? "candidate" : "fixed",
          cut_cost: costs[id]
        })),
        edges: topology.pairs.map(([source, target]) => ({ source, target }))
      }, config);
      const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);

      assert.equal(graph.valid, true, `${topology.name}, gruppo=${groupMask}`);
      assert.equal(graph.capabilities.nodeRemovalCosts.available, true, `${topology.name}, gruppo=${groupMask}`);
      for (let first = 0; first < nodeIds.length; first += 1) {
        for (let second = first + 1; second < nodeIds.length; second += 1) {
          const start = nodeIds[first];
          const goal = nodeIds[second];
          const expected = enumerateMinimumCostNodeSeparators(
            nodeIds,
            topology.pairs,
            costs,
            start,
            goal,
            removableNodeIds
          );
          const result = await runner.run(
            `${facts.trim()}\n\n${buildMinimumCostNodeSeparatorProgram(
              indexByNodeId.get(start),
              indexByNodeId.get(goal),
              "candidate"
            )}\n`,
            getStructuralSolverOptions("minimumCostNodeSeparator", true)
          );
          const label = `topologia=${topology.name}, gruppo=${groupMask}, terminali=${start},${goal}`;

          if (expected === null) {
            assert.equal(result.Result, "UNSATISFIABLE", label);
            continue;
          }
          const hasRemovableNonTerminal = removableNodeIds.some((id) => id !== start && id !== goal);
          if (!hasRemovableNonTerminal && normalizeSets(expected.solutions).length === 1 && expected.solutions[0].length === 0) {
            assert.ok(["SATISFIABLE", "OPTIMUM FOUND"].includes(result.Result), label);
          } else {
            assert.equal(result.Result, "OPTIMUM FOUND", label);
          }
          const explanations = parseWitnessRemovedNodeSetExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
          const actual = selectMinimumCostNodeSets(explanations.map((item) => item.removedIds), costs);
          assert.deepEqual(normalizeSets(actual), normalizeSets(expected.solutions), label);
          for (const removedNodeIds of actual) {
            assert.ok(removedNodeIds.every((id) => removableNodeIds.includes(id)), `${label}: solo nodi del gruppo sono rimovibili`);
            assert.ok(!removedNodeIds.includes(start) && !removedNodeIds.includes(goal), `${label}: i terminali sono protetti`);
            assert.equal(removedNodeIds.reduce((sum, id) => sum + costs[id], 0), expected.cost, `${label}: costo ottimo`);
          }
          const optimumKeys = new Set(actual.map(setSignature));
          for (const explanation of explanations.filter((item) => optimumKeys.has(setSignature(item.removedIds)))) {
            assert.deepEqual(
              explanation.reachableNodeIds,
              computeReachableSide(nodeIds, topology.pairs.map(([source, target]) => ({ source, target })), start, explanation.removedIds),
              `${label}: certificato lato sorgente`
            );
            assert.ok(!explanation.reachableNodeIds.includes(goal), `${label}: il goal non resta raggiungibile`);
          }
        }
      }
    }
  }
});

test("il separatore di nodi a costo minimo ASP coincide con brute force su tutti i grafi a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", removalCostField: "$.cut_cost" },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  };
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const pairs = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const removalCosts = Object.fromEntries(nodeIds.map((id, index) => [id, ((graphMask + index * 2) % 7) + 1]));
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id, cut_cost: removalCosts[id] })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    }, config);
    const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);

    assert.equal(graph.valid, true);
    assert.equal(graph.capabilities.nodeRemovalCosts.available, true);
    for (let first = 0; first < nodeIds.length; first += 1) {
      for (let second = first + 1; second < nodeIds.length; second += 1) {
        const start = nodeIds[first];
        const goal = nodeIds[second];
        const expected = enumerateMinimumCostNodeSeparators(nodeIds, pairs, removalCosts, start, goal);
        const result = await runner.run(
          `${facts.trim()}\n\n${buildMinimumCostNodeSeparatorProgram(indexByNodeId.get(start), indexByNodeId.get(goal))}\n`,
          getStructuralSolverOptions("minimumCostNodeSeparator", true)
        );
        if (expected === null) {
          assert.equal(result.Result, "UNSATISFIABLE", `grafo=${graphMask}, terminali=${start},${goal}`);
          continue;
        }
        assert.equal(result.Result, "OPTIMUM FOUND", `grafo=${graphMask}, terminali=${start},${goal}`);
        const explanations = parseWitnessRemovedNodeSetExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
        const actual = selectMinimumCostNodeSets(explanations.map((item) => item.removedIds), removalCosts);
        assert.deepEqual(normalizeSets(actual), normalizeSets(expected.solutions), `grafo=${graphMask}, terminali=${start},${goal}`);
        const optimumKeys = new Set(actual.map(setSignature));
        for (const explanation of explanations.filter((item) => optimumKeys.has(setSignature(item.removedIds)))) {
          assert.deepEqual(
            explanation.reachableNodeIds,
            computeReachableSide(nodeIds, pairs.map(([source, target]) => ({ source, target })), start, explanation.removedIds),
            `certificato lato nodo pesato grafo=${graphMask}, terminali=${start},${goal}`
          );
          assert.ok(!explanation.reachableNodeIds.includes(goal), "il terminale finale resta fuori dal lato raggiungibile");
        }
        for (const nodeSet of actual) {
          const actualCost = nodeSet.reduce((sum, id) => sum + removalCosts[id], 0);
          assert.equal(actualCost, expected.cost, `costo grafo=${graphMask}, terminali=${start},${goal}`);
          assert.ok(!nodeSet.includes(start) && !nodeSet.includes(goal), "i terminali restano protetti");
        }
      }
    }
  }

  const legacyGraph = normalizeGraphData({
    nodes: [{ id: "start" }, { id: "middle" }, { id: "goal" }],
    edges: [{ source: "start", target: "middle" }, { source: "middle", target: "goal" }]
  });
  const legacyFacts = buildAspFactsFromGraph(legacyGraph);
  const missingCost = await runner.run(
    `${legacyFacts.facts}\n${buildMinimumCostNodeSeparatorProgram(legacyFacts.indexByNodeId.get("start"), legacyFacts.indexByNodeId.get("goal"))}`
  );
  assert.equal(missingCost.Result, "UNSATISFIABLE", "un costo assente non deve diventare un costo zero implicito");
});

test("il taglio minimo di archi ASP coincide con brute force su tutti i grafi a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const pairs = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
    const cutEdges = buildMinimumEdgeSeparatorFacts(
      graph.links,
      indexByNodeId,
      new Map(graph.nodes.map((node) => [node.id, node.label]))
    );

    for (let first = 0; first < nodeIds.length; first += 1) {
      for (let second = first + 1; second < nodeIds.length; second += 1) {
        const start = nodeIds[first];
        const goal = nodeIds[second];
        const identities = pairs.map((_, index) => cutEdges.reverseEdgeIndex[index + 1]);
        const expected = enumerateMinimumEdgeSeparators(nodeIds, pairs, identities, start, goal);
        const result = await runner.run(
          `${facts.trim()}\n\n${cutEdges.facts.trim()}\n\n${buildMinimumEdgeSeparatorProgram(indexByNodeId.get(start), indexByNodeId.get(goal))}\n`,
          getStructuralSolverOptions("minimumEdgeSeparator", true)
        );
        const hasNoRemovableEdges = pairs.length === 0;
        assert.equal(
          result.Result,
          hasNoRemovableEdges ? "SATISFIABLE" : "OPTIMUM FOUND",
          `grafo=${graphMask}, terminali=${start},${goal}`
        );
        const explanations = parseWitnessRemovedEdgeSetExplanations(
          result.Call?.[0]?.Witnesses,
          cutEdges.reverseEdgeIndex,
          reverseIndex
        );
        const actual = selectMinimumEdgeSets(explanations.map((item) => item.removedIds));
        assert.deepEqual(normalizeSets(actual), normalizeSets(expected), `grafo=${graphMask}, terminali=${start},${goal}`);
        const optimumKeys = new Set(actual.map(setSignature));
        const edgeRecords = pairs.map(([source, target], index) => ({ source, target, edgeId: identities[index] }));
        for (const explanation of explanations.filter((item) => optimumKeys.has(setSignature(item.removedIds)))) {
          assert.deepEqual(
            explanation.reachableNodeIds,
            computeReachableSide(nodeIds, edgeRecords, start, [], explanation.removedIds),
            `certificato lato arco grafo=${graphMask}, terminali=${start},${goal}`
          );
          assert.ok(!explanation.reachableNodeIds.includes(goal), "il terminale finale resta fuori dal lato raggiungibile");
        }
      }
    }
  }
});

test("il taglio a costo minimo ASP coincide con brute force su tutti i grafi a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        removalCostField: "$.cut_cost"
      }
    }
  };
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const pairs = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const costs = pairs.map((_, index) => ((graphMask + index * 3) % 7) + 1);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target], index) => ({
        id: `edge-${index}`,
        source,
        target,
        cut_cost: costs[index]
      }))
    }, config);
    const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
    const cutEdges = buildMinimumEdgeSeparatorFacts(graph.links, indexByNodeId);

    assert.equal(graph.valid, true);
    assert.equal(graph.capabilities.edgeRemovalCosts.available, pairs.length > 0);
    for (let first = 0; first < nodeIds.length; first += 1) {
      for (let second = first + 1; second < nodeIds.length; second += 1) {
        const start = nodeIds[first];
        const goal = nodeIds[second];
        const identities = pairs.map((_, index) => cutEdges.reverseEdgeIndex[index + 1]);
        const expected = enumerateMinimumCostEdgeSeparators(
          nodeIds,
          pairs,
          identities,
          costs,
          start,
          goal
        );
        const result = await runner.run(
          `${facts.trim()}\n\n${cutEdges.facts.trim()}\n\n${buildMinimumCostEdgeSeparatorProgram(indexByNodeId.get(start), indexByNodeId.get(goal))}\n`,
          getStructuralSolverOptions("minimumCostEdgeSeparator", true)
        );
        assert.equal(
          result.Result,
          pairs.length === 0 ? "SATISFIABLE" : "OPTIMUM FOUND",
          `grafo=${graphMask}, terminali=${start},${goal}`
        );
        const explanations = parseWitnessRemovedEdgeSetExplanations(
          result.Call?.[0]?.Witnesses,
          cutEdges.reverseEdgeIndex,
          reverseIndex
        );
        const actual = selectMinimumCostEdgeSets(
          explanations.map((item) => item.removedIds),
          cutEdges.removalCostByEdgeId
        );
        for (const edgeSet of actual) {
          const actualCost = edgeSet.reduce((sum, identity) => sum + cutEdges.removalCostByEdgeId[identity], 0);
          assert.equal(actualCost, expected.cost, `costo grafo=${graphMask}, terminali=${start},${goal}`);
        }
        assert.deepEqual(normalizeSets(actual), normalizeSets(expected.solutions), `grafo=${graphMask}, terminali=${start},${goal}`);
        const optimumKeys = new Set(actual.map(setSignature));
        const edgeRecords = pairs.map(([source, target], index) => ({ source, target, edgeId: identities[index] }));
        for (const explanation of explanations.filter((item) => optimumKeys.has(setSignature(item.removedIds)))) {
          assert.deepEqual(
            explanation.reachableNodeIds,
            computeReachableSide(nodeIds, edgeRecords, start, [], explanation.removedIds),
            `certificato lato arco pesato grafo=${graphMask}, terminali=${start},${goal}`
          );
          assert.ok(!explanation.reachableNodeIds.includes(goal), "il terminale finale resta fuori dal lato raggiungibile");
        }
      }
    }
  }

  const legacyGraph = normalizeGraphData({
    nodes: [{ id: "start" }, { id: "goal" }],
    edges: [{ source: "start", target: "goal" }]
  });
  const legacyFacts = buildAspFactsFromGraph(legacyGraph);
  const legacyCutEdges = buildMinimumEdgeSeparatorFacts(legacyGraph.links, legacyFacts.indexByNodeId);
  const missingCost = await runner.run(
    `${legacyFacts.facts}\n${legacyCutEdges.facts}\n${buildMinimumCostEdgeSeparatorProgram(legacyFacts.indexByNodeId.get("start"), legacyFacts.indexByNodeId.get("goal"))}`
  );
  assert.equal(missingCost.Result, "UNSATISFIABLE", "il costo mancante non deve diventare un costo zero implicito");
});

test("il taglio d'arco considera record paralleli distinti e restituisce gli ID sorgente", async () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "start" }, { id: "goal" }],
    edges: [
      { id: "parallel-a", source: "start", target: "goal" },
      { id: "parallel-b", source: "goal", target: "start" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  });
  const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
  const cutEdges = buildMinimumEdgeSeparatorFacts(graph.links, indexByNodeId);
  const runner = await getRunner();
  const result = await runner.run(
    `${facts.trim()}\n\n${cutEdges.facts.trim()}\n\n${buildMinimumEdgeSeparatorProgram(indexByNodeId.get("start"), indexByNodeId.get("goal"))}\n`,
    getStructuralSolverOptions("minimumEdgeSeparator", true)
  );

  assert.equal(graph.valid, true);
  assert.equal(result.Result, "OPTIMUM FOUND");
  const explanations = parseWitnessRemovedEdgeSetExplanations(
    result.Call?.[0]?.Witnesses,
    cutEdges.reverseEdgeIndex,
    reverseIndex
  );
  assert.deepEqual(
    selectMinimumEdgeSets(explanations.map((item) => item.removedIds)),
    [["source:parallel-a", "source:parallel-b"]]
  );
  assert.deepEqual(explanations[0]?.reachableNodeIds, ["start"]);
  assert.deepEqual(cutEdges.displayIdByEdgeId, {
    "source:parallel-a": "parallel-a",
    "source:parallel-b": "parallel-b"
  });
  assert.deepEqual(
    checkGraphTaskRequirements(graph.capabilities, getGraphTaskRequirements("minimumEdgeSeparator")),
    { available: true, missing: [], reasons: [] }
  );
  assert.throws(() => buildMinimumEdgeSeparatorProgram(1, 1), /devono essere distinti/);

  const directedGraph = normalizeGraphData({
    nodes: [{ id: "start" }, { id: "goal" }],
    edges: [{ id: "one-way", source: "start", target: "goal" }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "directed",
        identity: "multigraph"
      }
    }
  });
  assert.equal(
    checkGraphTaskRequirements(directedGraph.capabilities, [
      ...(getGraphTaskRequirements("minimumEdgeSeparator") ?? []),
      "directedEdges"
    ]).available,
    true,
    "un grafo diretto deve rendere disponibile il taglio che segue gli archi dichiarati"
  );
});

test("la modularità ASP coincide con la massimizzazione esaustiva su tutti i grafi a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const runner = await getRunner();

  for (let graphMask = 1; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const edges = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: edges.map(([source, target]) => ({ source, target }))
    });
    const base = buildAspFactsFromGraph(graph);
    const modularityEdges = graph.links.map((link) => ({
      source: base.indexByNodeId.get(link.source),
      target: base.indexByNodeId.get(link.target)
    }));
    const modularityFacts = buildModularityFacts(
      graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
      modularityEdges
    );
    const result = await runner.run(
      `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram()}\n`,
      getStructuralSolverOptions("communities", true)
    );

    assert.equal(result.Result, "OPTIMUM FOUND", `grafo=${graphMask}`);
    const actual = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    const expected = enumerateMaximumModularityPartitions(nodeIds, edges);
    assert.equal(actual.length > 0, true, `il parser deve restituire una partizione per grafo=${graphMask}`);
    assert.equal(actual[0].scaledScore, expected.maximumScore, `punteggio modularità grafo=${graphMask}`);
    assert.deepEqual(
      normalizePartitions(actual.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `partizioni ottime grafo=${graphMask}`
    );

    const pairwiseFacts = buildModularityFacts(
      graph.nodes.map((node) => base.indexByNodeId.get(node.id)).reverse(),
      modularityEdges,
      { includePairwiseObjective: true }
    );
    assert.equal(Number.isSafeInteger(pairwiseFacts.pairwiseObjectiveOffset), true, `offset pairwise grafo=${graphMask}`);
    assert.ok(pairwiseFacts.pairwiseObjectiveFacts);
    const pairwiseResult = await runner.run(
      `${base.facts.trim()}\n\n${pairwiseFacts.facts.trim()}\n\n${pairwiseFacts.pairwiseObjectiveFacts.trim()}\n\n${buildMaximumModularityProgram({ pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset })}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(pairwiseResult.Result, "OPTIMUM FOUND", `obiettivo pairwise grafo=${graphMask}`);
    const pairwise = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(pairwiseResult.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    assert.equal(pairwise[0]?.scaledScore, expected.maximumScore, `punteggio pairwise grafo=${graphMask}`);
    assert.deepEqual(
      normalizePartitions(pairwise.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `partizioni pairwise grafo=${graphMask}`
    );

    const equivalenceResult = await runner.run(
      `${base.facts.trim()}\n\n${pairwiseFacts.facts.trim()}\n\n${pairwiseFacts.pairwiseObjectiveFacts.trim()}\n\n${buildExperimentalModularityEquivalenceProgram({ pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset })}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(equivalenceResult.Result, "OPTIMUM FOUND", `encoding equivalence grafo=${graphMask}: ${JSON.stringify(equivalenceResult)}`);
    const equivalence = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(equivalenceResult.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    assert.equal(equivalence[0]?.scaledScore, expected.maximumScore, `punteggio equivalence grafo=${graphMask}`);
    assert.deepEqual(
      normalizePartitions(equivalence.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `partizioni equivalence grafo=${graphMask}`
    );

    const incrementalResult = await runner.run(
      `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildExperimentalIncrementalModularityProgram()}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(incrementalResult.Result, "OPTIMUM FOUND", `encoding incrementale grafo=${graphMask}`);
    const incremental = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(incrementalResult.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    assert.equal(incremental[0]?.scaledScore, expected.maximumScore, `punteggio incrementale grafo=${graphMask}`);
    assert.deepEqual(
      normalizePartitions(incremental.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `partizioni incrementali grafo=${graphMask}`
    );

    assert.doesNotMatch(buildMaximumModularityProgram(), /#show internal_edge\/2/);
    const explainedResult = await runner.run(
      `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram({ includeContributions: true })}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(explainedResult.Result, "OPTIMUM FOUND", `spiegazione grafo=${graphMask}`);
    const explained = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(explainedResult.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    assert.deepEqual(
      normalizePartitions(explained.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `partizioni con spiegazione grafo=${graphMask}`
    );
    for (const partition of explained) {
      assert.ok(partition.communityContributions);
      let contributionTotal = 0;
      for (const contribution of partition.communityContributions) {
        const members = new Set(partition.communities.find((community) => community.includes(contribution.communityId)) ?? []);
        const expectedEdgeIndexes = graph.links.flatMap((link, index) =>
          members.has(link.source) && members.has(link.target) ? [index + 1] : []
        );
        const degree = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
        for (const link of graph.links) {
          if (degree.has(link.source)) degree.set(link.source, degree.get(link.source) + 1);
          if (degree.has(link.target)) degree.set(link.target, degree.get(link.target) + 1);
        }
        const expectedVolume = [...members].reduce((sum, nodeId) => sum + (degree.get(nodeId) ?? 0), 0);
        const expectedScore = 4 * graph.links.length * expectedEdgeIndexes.length - expectedVolume * expectedVolume;
        assert.equal(contribution.internalEdgeCount, expectedEdgeIndexes.length, `l_C grafo=${graphMask}`);
        assert.equal(contribution.internalEdgeWeight, expectedEdgeIndexes.length, `peso interno l_C grafo=${graphMask}`);
        assert.equal(contribution.volume, expectedVolume, `d_C grafo=${graphMask}`);
        assert.equal(contribution.scaledContribution, expectedScore, `contributo grafo=${graphMask}`);
        assert.deepEqual(contribution.edgeIndexes, expectedEdgeIndexes, `archi interni grafo=${graphMask}`);
        contributionTotal += contribution.scaledContribution;
      }
      assert.equal(contributionTotal, partition.scaledScore, `somma dei contributi grafo=${graphMask}`);
      const mappedContributions = mapModularityContributionsToRecords(partition.communityContributions, graph.links);
      assert.ok(mappedContributions.every((item) => item.supportingEdgeIds?.length === item.edgeIndexes.length));
    }
  }
});

test("la modularità con pruning dei nodi a volume positivo coincide con l'enumerazione su tutti i grafi a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const edges = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: edges.map(([source, target]) => ({ source, target }))
    });
    const base = buildAspFactsFromGraph(graph);
    const modularityFacts = buildModularityFacts(
      graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
      graph.links.map((link) => ({
        source: base.indexByNodeId.get(link.source),
        target: base.indexByNodeId.get(link.target)
      }))
    );
    const result = await runner.run(
      `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram({ enforceConnectedPositiveVolumeCommunities: true })}\n`,
      getStructuralSolverOptions("communities", true)
    );
    const expected = edges.length === 0
      ? { maximumScore: 0, partitions: enumerateSetPartitions(nodeIds) }
      : enumerateMaximumModularityPartitions(nodeIds, edges);
    assert.equal(result.Result, "OPTIMUM FOUND", `grafo=${graphMask}: ${result.Error ?? ""}`);
    const actual = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    assert.equal(actual[0]?.scaledScore, expected.maximumScore, `punteggio, grafo=${graphMask}`);
    assert.deepEqual(
      normalizePartitions(actual.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `tutte le partizioni ottime, grafo=${graphMask}`
    );
  }
  for (const constraint of [
    { minCount: 1 },
    { maxCount: 2 },
    { mustLinkPairs: [[1, 2]] },
    { cannotLinkPairs: [[1, 2]] },
    { attributeBounds: [{ nodeIndexes: [1], minPerCommunity: 1 }] }
  ]) {
    assert.throws(() => buildMaximumModularityProgram({
      enforceConnectedPositiveVolumeCommunities: true,
      ...constraint
    }), /senza vincoli globali/);
  }
});

test("la modularità con risoluzione razionale coincide con l'enumerazione su tutti i grafi a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const resolution = 1.5;
  const resolutionNumerator = 3;
  const resolutionDenominator = 2;
  const runner = await getRunner();
  let resolutionChangesAnOptimum = false;

  for (let graphMask = 1; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const edges = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: edges.map(([source, target]) => ({ source, target }))
    });
    const base = buildAspFactsFromGraph(graph);
    const modularityEdges = graph.links.map((link) => ({
      source: base.indexByNodeId.get(link.source),
      target: base.indexByNodeId.get(link.target)
    }));
    const expected = enumerateMaximumModularityPartitions(nodeIds, edges, resolutionNumerator, resolutionDenominator);
    const baseline = enumerateMaximumModularityPartitions(nodeIds, edges);
    if (normalizePartitions(expected.partitions).join("|") !== normalizePartitions(baseline.partitions).join("|")) {
      resolutionChangesAnOptimum = true;
    }
    const facts = buildModularityFacts(
      graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
      modularityEdges,
      { resolution }
    );
    assert.equal(facts.resolutionNumerator, resolutionNumerator);
    assert.equal(facts.resolutionDenominator, resolutionDenominator);
    assert.equal(facts.displayResolution, "1.5");
    const aggregateResult = await runner.run(
      `${base.facts.trim()}\n${facts.facts.trim()}\n${buildMaximumModularityProgram()}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(aggregateResult.Result, "OPTIMUM FOUND", `aggregate, grafo=${graphMask}`);
    const aggregate = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(aggregateResult.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    assert.equal(aggregate[0]?.scaledScore, expected.maximumScore, `punteggio aggregate, grafo=${graphMask}`);
    assert.deepEqual(
      normalizePartitions(aggregate.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `partizioni aggregate, grafo=${graphMask}`
    );

    const pairwiseFacts = buildModularityFacts(
      graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
      modularityEdges,
      { resolution, includePairwiseObjective: true }
    );
    const pairwiseResult = await runner.run(
      `${base.facts.trim()}\n${pairwiseFacts.facts.trim()}\n${pairwiseFacts.pairwiseObjectiveFacts?.trim()}\n${buildMaximumModularityProgram({
        pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset
      })}\n`,
      getStructuralSolverOptions("communities", true)
    );
    assert.equal(pairwiseResult.Result, "OPTIMUM FOUND", `pairwise, grafo=${graphMask}`);
    const pairwise = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(pairwiseResult.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    assert.equal(pairwise[0]?.scaledScore, expected.maximumScore, `punteggio pairwise, grafo=${graphMask}`);
    assert.deepEqual(
      normalizePartitions(pairwise.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `partizioni pairwise, grafo=${graphMask}`
    );
  }
  assert.equal(resolutionChangesAnOptimum, true, "gamma diverso da uno deve poter cambiare la partizione ottima");
  assert.throws(() => buildModularityFacts([1, 2], [{ source: 1, target: 2 }], { resolution: 0 }), /deve essere positiva/);
  assert.throws(() => buildModularityFacts([1, 2], [{ source: 1, target: 2 }], { resolution: "0.00000000000000001" }), /dominio numerico esatto/);
});

test("la modularità pesata ASP coincide con l'enumerazione esatta con loop e record paralleli", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const weightedEdges = [
    { source: "a", target: "b", weight: 8 },
    { source: "a", target: "c", weight: 1 },
    { source: "b", target: "c", weight: 1 },
    { source: "c", target: "d", weight: 8 },
    { source: "a", target: "a", weight: 2 },
    { source: "a", target: "b", weight: 3 },
    { source: "b", target: "d", weight: 0 }
  ];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: weightedEdges.map((edge, index) => ({ ...edge, id: `edge-${index + 1}` }))
  }, {
    schemaVersion: 2,
    graphAnalysis: { communities: { useEdgeWeights: true } },
    graphMapping: {
      edge: {
        idField: "$.id",
        direction: "undirected",
        identity: "multigraph",
        weightField: "$.weight"
      }
    }
  });
  const base = buildAspFactsFromGraph(graph);
  const numericEdges = graph.links.map((link) => ({
    source: base.indexByNodeId.get(link.source),
    target: base.indexByNodeId.get(link.target),
    weight: link.analysis.weight
  }));
  const modularityFacts = buildModularityFacts(
    graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
    numericEdges,
    { weighted: true }
  );
  const runner = await getRunner();
  const result = await runner.run(
    `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram({ weighted: true, includeContributions: true })}\n`,
    getStructuralSolverOptions("communities", true)
  );

  assert.equal(graph.valid, true);
  assert.equal(graph.capabilities.modularityWeights.available, true);
  assert.equal(modularityFacts.edgeCount, 7);
  assert.equal(modularityFacts.totalWeight, 23);
  assert.equal(modularityFacts.weightScaleFactor, 1);
  assert.equal(modularityFacts.displayTotalWeight, "23");
  assert.equal(modularityFacts.weighted, true);
  assert.equal(result.Result, "OPTIMUM FOUND");
  const actual = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  const expected = enumerateMaximumWeightedModularityPartitions(nodeIds, weightedEdges);
  assert.equal(actual[0].scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(actual.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );

  const connectedResult = await runner.run(
    `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram({ weighted: true, enforceConnectedPositiveVolumeCommunities: true })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(connectedResult.Result, "OPTIMUM FOUND");
  const connected = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(connectedResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(connected[0]?.scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(connected.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );

  const incrementalResult = await runner.run(
    `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildExperimentalIncrementalModularityProgram({ weighted: true, includeContributions: true })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const incremental = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(incrementalResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(incrementalResult.Result, "OPTIMUM FOUND");
  assert.equal(incremental[0]?.scaledScore, expected.maximumScore);
  const optimalIncrementWitness = incrementalResult.Call?.[0]?.Witnesses?.find((witness) =>
    Number(witness.Costs?.[0]) === -expected.maximumScore
  );
  assert.ok(optimalIncrementWitness, "deve esserci un witness con il punteggio ottimo provato");
  const incrementAtoms = optimalIncrementWitness.Value?.filter((atom) =>
    /^community_increment\(\d+,\d+,-?\d+\)$/.test(atom)
  ) ?? [];
  assert.equal(incrementAtoms.length, nodeIds.length);
  assert.equal(incrementAtoms.reduce((sum, atom) => sum + Number(atom.match(/,(-?\d+)\)$/)?.[1]), 0), expected.maximumScore);
  for (const partition of actual) {
    for (const contribution of partition.communityContributions ?? []) {
      const members = new Set(partition.communities.find((community) => community.includes(contribution.communityId)) ?? []);
      const expectedInternalEdges = weightedEdges.filter((edge) => members.has(edge.source) && members.has(edge.target));
      assert.equal(contribution.internalEdgeCount, expectedInternalEdges.length);
      assert.equal(contribution.internalEdgeWeight, expectedInternalEdges.reduce((sum, edge) => sum + edge.weight, 0));
    }
  }

  const pairwiseFacts = buildModularityFacts(
    graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
    numericEdges,
    { weighted: true, includePairwiseObjective: true }
  );
  assert.ok(pairwiseFacts.pairwiseObjectiveFacts);
  const pairwiseResult = await runner.run(
    `${base.facts.trim()}\n\n${pairwiseFacts.facts.trim()}\n\n${pairwiseFacts.pairwiseObjectiveFacts.trim()}\n\n${buildMaximumModularityProgram({
      weighted: true,
      includeContributions: true,
      pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(pairwiseResult.Result, "OPTIMUM FOUND");
  const pairwise = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(pairwiseResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(pairwise[0]?.scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(pairwise.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );

  const equivalenceResult = await runner.run(
    `${base.facts.trim()}\n\n${pairwiseFacts.facts.trim()}\n\n${pairwiseFacts.pairwiseObjectiveFacts.trim()}\n\n${buildExperimentalModularityEquivalenceProgram({
      weighted: true,
      pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const equivalence = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(equivalenceResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(equivalenceResult.Result, "OPTIMUM FOUND");
  assert.equal(equivalence[0]?.scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(equivalence.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );

  const resolvedWeightedFacts = buildModularityFacts(
    graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
    numericEdges,
    { weighted: true, resolution: 0.5, includePairwiseObjective: true }
  );
  assert.equal(resolvedWeightedFacts.resolutionNumerator, 1);
  assert.equal(resolvedWeightedFacts.resolutionDenominator, 2);
  const resolvedWeightedExpected = enumerateMaximumWeightedModularityPartitions(nodeIds, weightedEdges, 1, 2);
  const resolvedWeightedResult = await runner.run(
    `${base.facts.trim()}\n${resolvedWeightedFacts.facts.trim()}\n${buildMaximumModularityProgram({ weighted: true, includeContributions: true })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(resolvedWeightedResult.Result, "OPTIMUM FOUND");
  const resolvedWeighted = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(resolvedWeightedResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(resolvedWeighted[0]?.scaledScore, resolvedWeightedExpected.maximumScore);
  assert.deepEqual(
    normalizePartitions(resolvedWeighted.map((partition) => partition.communities)),
    normalizePartitions(resolvedWeightedExpected.partitions)
  );
  const resolvedIncrementalResult = await runner.run(
    `${base.facts.trim()}\n${resolvedWeightedFacts.facts.trim()}\n${buildExperimentalIncrementalModularityProgram({ weighted: true })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const resolvedIncremental = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(resolvedIncrementalResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(resolvedIncrementalResult.Result, "OPTIMUM FOUND");
  assert.equal(resolvedIncremental[0]?.scaledScore, resolvedWeightedExpected.maximumScore);
  assert.deepEqual(
    normalizePartitions(resolvedIncremental.map((partition) => partition.communities)),
    normalizePartitions(resolvedWeightedExpected.partitions)
  );
  const resolvedPairwiseResult = await runner.run(
    `${base.facts.trim()}\n${resolvedWeightedFacts.facts.trim()}\n${resolvedWeightedFacts.pairwiseObjectiveFacts?.trim()}\n${buildMaximumModularityProgram({
      weighted: true,
      includeContributions: true,
      pairwiseObjectiveOffset: resolvedWeightedFacts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(resolvedPairwiseResult.Result, "OPTIMUM FOUND");
  const resolvedPairwise = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(resolvedPairwiseResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(resolvedPairwise[0]?.scaledScore, resolvedWeightedExpected.maximumScore);
  assert.deepEqual(
    normalizePartitions(resolvedPairwise.map((partition) => partition.communities)),
    normalizePartitions(resolvedWeightedExpected.partitions)
  );

  const legacyFacts = buildModularityFacts(
    graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
    numericEdges
  );
  assert.equal(legacyFacts.weighted, false);
  assert.equal(legacyFacts.totalWeight, weightedEdges.length, "la modalita predefinita tratta ogni record come peso uno");
  assert.doesNotMatch(legacyFacts.facts, /modularity_edge_weight/);
  assert.doesNotMatch(buildMaximumModularityProgram(), /community_internal_weight/);
  assert.doesNotMatch(buildMaximumModularityProgram(), /partition_score/);
  assert.throws(() => buildModularityFacts([1, 2], [{ source: 1, target: 2, weight: -1 }], { weighted: true }), /non negativo/);
  const fractionalFacts = buildModularityFacts(
    [1, 2],
    [{ source: 1, target: 2, weight: 0.5 }],
    { weighted: true }
  );
  assert.equal(fractionalFacts.weightScaleFactor, 2);
  assert.equal(fractionalFacts.totalWeight, 1);
  assert.match(fractionalFacts.facts, /modularity_edge_weight\(1,1\)\./);
  assert.throws(() => buildModularityFacts([1, 2], [{ source: 1, target: 2, weight: 0 }], { weighted: true }), /totale positivo/);
  assert.throws(() => buildModularityFacts([1, 2], [{ source: 1, target: 2, weight: 50_000_000 }], { weighted: true }), /dominio numerico esatto/);
  assert.throws(() => buildModularityFacts([1, 2], [{ source: 1, target: 2, weight: "0.00000000000000001" }], { weighted: true }), /dominio numerico esatto/);
  assert.equal(validateCommunityConfiguration({ useEdgeWeights: true }), "");
  assert.match(validateCommunityConfiguration({ useEdgeWeights: "yes" }), /booleano/);
});

test("pairwise and incremental modularity respect sparse and unordered candidates", async () => {
  const candidates = [9, 3, 7];
  const edges = [{ source: 3, target: 7 }, { source: 7, target: 9 }];
  const reverseIndex = { 3: "a", 7: "b", 9: "c" };
  const facts = buildModularityFacts(candidates, edges, { includePairwiseObjective: true });
  const runner = await getRunner();
  const result = await runner.run(
    `${facts.facts.trim()}\n\n${facts.pairwiseObjectiveFacts.trim()}\n\n${buildMaximumModularityProgram({
      pairwiseObjectiveOffset: facts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const actual = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, reverseIndex)
  );
  const expected = enumerateMaximumModularityPartitions(["a", "b", "c"], [["a", "b"], ["b", "c"]]);

  assert.equal(result.Result, "OPTIMUM FOUND");
  assert.equal(actual[0]?.scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(actual.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );

  const incrementalResult = await runner.run(
    `${facts.facts.trim()}\n\n${buildExperimentalIncrementalModularityProgram()}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const incremental = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(incrementalResult.Call?.[0]?.Witnesses, reverseIndex)
  );
  assert.equal(incrementalResult.Result, "OPTIMUM FOUND");
  assert.equal(incremental[0]?.scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(incremental.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );
});
test("la modularità pesata decimal-normalizzata conserva esattamente tutti gli ottimi", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const decimalEdges = [
    { source: "a", target: "b", weight: 0.05 },
    { source: "b", target: "c", weight: 1.25 },
    { source: "c", target: "d", weight: 0.75 },
    { source: "d", target: "a", weight: 0.5 },
    { source: "a", target: "c", weight: "0.125" }
  ];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: decimalEdges.map((edge, index) => ({ ...edge, id: `decimal-${index + 1}` }))
  }, {
    schemaVersion: 2,
    graphAnalysis: { communities: { useEdgeWeights: true } },
    graphMapping: {
      edge: {
        idField: "$.id",
        direction: "undirected",
        identity: "multigraph",
        weightField: "$.weight"
      }
    }
  });
  const base = buildAspFactsFromGraph(graph);
  const modularityEdges = graph.links.map((link) => ({
    source: base.indexByNodeId.get(link.source),
    target: base.indexByNodeId.get(link.target),
    weight: link.analysis.weight
  }));
  const facts = buildModularityFacts(
    graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
    modularityEdges,
    { weighted: true }
  );

  assert.equal(graph.valid, true);
  assert.equal(graph.capabilities.modularityWeights.available, true);
  assert.equal(facts.weightScaleFactor, 40);
  assert.equal(facts.totalWeight, 107);
  assert.equal(facts.displayTotalWeight, "2.675");
  assert.match(facts.facts, /modularity_edge_weight\(5,5\)\./);

  const runner = await getRunner();
  const result = await runner.run(
    `${base.facts.trim()}\n\n${facts.facts.trim()}\n\n${buildMaximumModularityProgram({ weighted: true })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const scaledReferenceEdges = decimalEdges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    weight: Math.round(Number(edge.weight) * facts.weightScaleFactor)
  }));
  const expected = enumerateMaximumWeightedModularityPartitions(nodeIds, scaledReferenceEdges);
  const actual = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, base.reverseIndex)
  );

  assert.equal(result.Result, "OPTIMUM FOUND");
  assert.equal(actual[0].scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(actual.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );

  const incrementalResult = await runner.run(
    `${base.facts.trim()}\n\n${facts.facts.trim()}\n\n${buildExperimentalIncrementalModularityProgram({ weighted: true })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const incremental = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(incrementalResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(incrementalResult.Result, "OPTIMUM FOUND");
  assert.equal(incremental[0]?.scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(incremental.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );

  const pairwiseFacts = buildModularityFacts(
    graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
    modularityEdges,
    { weighted: true, includePairwiseObjective: true }
  );
  const pairwiseResult = await runner.run(
    `${base.facts.trim()}\n\n${pairwiseFacts.facts.trim()}\n\n${pairwiseFacts.pairwiseObjectiveFacts.trim()}\n\n${buildMaximumModularityProgram({
      weighted: true,
      pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const pairwise = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(pairwiseResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(pairwiseResult.Result, "OPTIMUM FOUND");
  assert.equal(pairwise[0]?.scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(pairwise.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );
  const equivalenceResult = await runner.run(
    `${base.facts.trim()}\n\n${pairwiseFacts.facts.trim()}\n\n${pairwiseFacts.pairwiseObjectiveFacts.trim()}\n\n${buildExperimentalModularityEquivalenceProgram({
      weighted: true,
      pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const equivalence = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(equivalenceResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(equivalenceResult.Result, "OPTIMUM FOUND");
  assert.equal(equivalence[0]?.scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(equivalence.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );
});

test("la formattazione delle quantità scalate è decimale esatta", () => {
  assert.equal(formatScaledDecimal(7, 40), "0.175");
  assert.equal(formatScaledDecimal(107, 40), "2.675");
  assert.equal(formatScaledDecimal(3, 2), "1.5");
  assert.equal(formatScaledDecimal(0, 40), "0");
  assert.throws(() => formatScaledDecimal(1.5, 2), /interi sicuri/);
});

test("le comunità rispettano cardinalità, must-link, cannot-link e conservano i record paralleli", async () => {
  const nodes = ["a", "b", "c", "d"];
  const edges = [["a", "b"], ["b", "c"], ["c", "d"], ["d", "a"]];
  const graph = normalizeGraphData({
    nodes: nodes.map((id) => ({ id })),
    edges: [...edges.map(([source, target]) => ({ source, target })), { source: "a", target: "b" }, { source: "c", target: "d" }]
  }, {
    schemaVersion: 2,
    graphMapping: { edge: { identity: "multigraph", direction: "undirected" } }
  });
  const base = buildAspFactsFromGraph(graph);
  const numericEdges = graph.links.map((link) => ({
    source: base.indexByNodeId.get(link.source),
    target: base.indexByNodeId.get(link.target)
  }));
  const modularityFacts = buildModularityFacts(
    graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
    numericEdges
  );
  const [a, b, c] = nodes.map((id) => base.indexByNodeId.get(id));
  const options = {
    minCount: 2,
    maxCount: 2,
    mustLinkPairs: [[a, c]],
    cannotLinkPairs: [[b, c]],
    includeContributions: true
  };
  const runner = await getRunner();
  const result = await runner.run(
    `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram(options)}\n`,
    getStructuralSolverOptions("communities", true)
  );

  assert.equal(graph.valid, true);
  assert.equal(modularityFacts.edgeCount, 6, "il multigrafo conta ogni record parallelo nel modello nullo");
  assert.equal(result.Result, "OPTIMUM FOUND");
  const actual = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  const expectedPartition = [["a", "c", "d"], ["b"]];
  assert.deepEqual(normalizePartitions(actual.map((partition) => partition.communities)), [
    normalizePartitions([expectedPartition])[0]
  ]);
  const multiGraphEdges = [...edges, ["a", "b"], ["c", "d"]];
  assert.equal(actual[0].scaledScore, computeModularityScore(nodes, multiGraphEdges, expectedPartition));

  const pairwiseFacts = buildModularityFacts(
    graph.nodes.map((node) => base.indexByNodeId.get(node.id)),
    numericEdges,
    { includePairwiseObjective: true }
  );
  const pairwiseResult = await runner.run(
    `${base.facts.trim()}\n\n${pairwiseFacts.facts.trim()}\n\n${pairwiseFacts.pairwiseObjectiveFacts.trim()}\n\n${buildMaximumModularityProgram({
      ...options,
      pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(pairwiseResult.Result, "OPTIMUM FOUND");
  const pairwise = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(pairwiseResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(pairwise[0]?.scaledScore, computeModularityScore(nodes, multiGraphEdges, expectedPartition));
  assert.deepEqual(normalizePartitions(pairwise.map((partition) => partition.communities)), [
    normalizePartitions([expectedPartition])[0]
  ]);
  const equivalenceResult = await runner.run(
    `${base.facts.trim()}\n\n${pairwiseFacts.facts.trim()}\n\n${pairwiseFacts.pairwiseObjectiveFacts.trim()}\n\n${buildExperimentalModularityEquivalenceProgram({
      ...options,
      pairwiseObjectiveOffset: pairwiseFacts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(equivalenceResult.Result, "OPTIMUM FOUND");
  const equivalence = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(equivalenceResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(equivalence[0]?.scaledScore, computeModularityScore(nodes, multiGraphEdges, expectedPartition));
  assert.deepEqual(normalizePartitions(equivalence.map((partition) => partition.communities)), [
    normalizePartitions([expectedPartition])[0]
  ]);
  const incrementalResult = await runner.run(
    `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildExperimentalIncrementalModularityProgram(options)}\n`,
    getStructuralSolverOptions("communities", true)
  );
  const incremental = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(incrementalResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(incrementalResult.Result, "OPTIMUM FOUND");
  assert.equal(incremental[0]?.scaledScore, computeModularityScore(nodes, multiGraphEdges, expectedPartition));
  assert.deepEqual(normalizePartitions(incremental.map((partition) => partition.communities)), [
    normalizePartitions([expectedPartition])[0]
  ]);
  const mappedContributions = mapModularityContributionsToRecords(actual[0].communityContributions ?? [], graph.links);
  const acdContribution = mappedContributions.find((item) => ["a", "c", "d"].includes(item.communityId));
  assert.ok(acdContribution);
  assert.equal(acdContribution.internalEdgeCount, 3, "le due copie c-d e il record d-a sono archi interni distinti");
  assert.equal(acdContribution.edgeIndexes.length, 3);
  assert.equal(acdContribution.supportingEdgeIds?.length, 3);
  assert.equal(new Set(acdContribution.supportingEdgeIds).size, 3, "ogni record multigrafo mantiene una chiave distinta");

  const emptyFacts = buildModularityFacts([1, 2], []);
  assert.equal(emptyFacts.edgeCount, 0, "l'app deve trattare separatamente modularità non definita per m=0");
  assert.throws(() => buildMaximumModularityProgram({ minCount: 3, maxCount: 2 }), /minCount/);
  assert.throws(() => buildMaximumModularityProgram({ mustLinkPairs: [[1, 1]] }), /due nodi distinti/);
});

test("community configuration rejects malformed counts and node pairs", () => {
  assert.equal(validateCommunityConfiguration(undefined), "");
  assert.equal(validateCommunityConfiguration({
    minCount: 2,
    maxCount: 4,
    mustLink: [["a", "b"]],
    cannotLink: [[3, 4]],
    resolution: 1.5
  }), "");
  assert.match(validateCommunityConfiguration(null), /oggetto JSON/);
  assert.match(validateCommunityConfiguration({ minCount: 1.5 }), /minCount/);
  assert.match(validateCommunityConfiguration({ minCount: 3, maxCount: 2 }), /maxCount/);
  assert.match(validateCommunityConfiguration({ resolution: 0 }), /numero finito positivo/);
  assert.match(validateCommunityConfiguration({ resolution: "1.5" }), /numero finito positivo/);
  assert.match(validateCommunityConfiguration({ resolution: 1e-17 }), /dominio numerico esatto/);
  assert.match(validateCommunityConfiguration({ mustLink: [["a", {}]] }), /mustLink\[0\]/);
  assert.equal(validateCommunityConfiguration({ attributeBounds: [{
    attribute: "role",
    value: "clinician",
    minPerCommunity: 1,
    maxPerCommunity: 3
  }] }, new Set(["role"])), "");
  assert.match(validateCommunityConfiguration({ attributeBounds: [{
    attribute: "unknown",
    value: "clinician",
    minPerCommunity: 1
  }] }, new Set(["role"])), /non è definito in graphMapping\.node\.attributes/);
  assert.match(validateCommunityConfiguration({ attributeBounds: [{ attribute: "role", minPerCommunity: 1 }] }), /value deve essere/);
  assert.match(validateCommunityConfiguration({ attributeBounds: [{ attribute: "role", value: "x", minPerCommunity: 0, maxPerCommunity: 0 }] }), /almeno un limite positivo/);
  assert.match(validateCommunityConfiguration({ attributeBounds: [{ attribute: "role", value: "x", minPerCommunity: 3, maxPerCommunity: 2 }] }), /non deve superare/);
  assert.match(validateCommunityConfiguration({ attributeBounds: [{ attribute: "role", value: null, minPerCommunity: 1 }] }), /value deve essere/);
  assert.match(validateCommunityConfiguration({ attributeBounds: [
    { attribute: "role", value: "x", minPerCommunity: 1 },
    { attribute: "role", value: "x", maxPerCommunity: 2 }
  ] }), /non deve ripetere/);
  assert.throws(() => buildExperimentalModularityEquivalenceProgram(), /pairwiseObjectiveOffset/);
  assert.throws(() => buildExperimentalModularityEquivalenceProgram({
    pairwiseObjectiveOffset: 0,
    minCount: 3,
    maxCount: 2
  }), /minCount/);
});

test("community attribute bounds preserve JSON value types and candidate scope", () => {
  const candidateNodes = [
    { id: "numeric", analysis: { attributes: { role: 1 } } },
    { id: "string", analysis: { attributes: { role: "1" } } },
    { id: "boolean", analysis: { attributes: { role: true } } }
  ];
  const indexes = new Map([
    ["numeric", 2],
    ["string", 4],
    ["boolean", 6],
    ["outside-candidate-domain", 8]
  ]);
  const bounds = resolveCommunityAttributeBounds([
    { attribute: "role", value: 1, minPerCommunity: 1, maxPerCommunity: 1 },
    { attribute: "role", value: "1", minPerCommunity: 1, maxPerCommunity: 1 },
    { attribute: "role", value: true, minPerCommunity: 1, maxPerCommunity: 1 }
  ], candidateNodes, indexes);

  assert.deepEqual(bounds, [
    { nodeIndexes: [2], minPerCommunity: 1, maxPerCommunity: 1 },
    { nodeIndexes: [4], minPerCommunity: 1, maxPerCommunity: 1 },
    { nodeIndexes: [6], minPerCommunity: 1, maxPerCommunity: 1 }
  ]);
  assert.throws(() => resolveCommunityAttributeBounds([
    { attribute: "role", value: "missing", minPerCommunity: 1 }
  ], candidateNodes, indexes), /proiezione candidata ne contiene 0/);
  assert.throws(() => resolveCommunityAttributeBounds([
    { attribute: "role", value: 1, maxPerCommunity: 1 }
  ], candidateNodes, new Map()), /non indicizzati per ASP/);
});

test("i limiti categoriali per comunità coincidono con l'enumerazione indipendente e con l'encoding pairwise", async () => {
  const nodeRecords = [
    { id: "a", category: "primary" },
    { id: "b", category: "primary" },
    { id: "c", category: "secondary" },
    { id: "d", category: "secondary" }
  ];
  const edges = [["a", "b"], ["b", "d"], ["d", "c"], ["c", "a"]];
  const graph = normalizeGraphData({
    nodes: nodeRecords,
    edges: edges.map(([source, target]) => ({ source, target }))
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", attributes: { category: "$.category" } },
      edge: { sourceField: "$.source", targetField: "$.target", identity: "multigraph", direction: "undirected" }
    }
  });
  const base = buildAspFactsFromGraph(graph);
  const nodeIds = nodeRecords.map((node) => node.id);
  const numericEdges = graph.links.map((link) => ({
    source: base.indexByNodeId.get(link.source),
    target: base.indexByNodeId.get(link.target)
  }));
  const candidates = nodeIds.map((id) => base.indexByNodeId.get(id));
  const modularityFacts = buildModularityFacts(candidates, numericEdges, { includePairwiseObjective: true });
  const primaryIndexes = nodeRecords
    .filter((node) => node.category === "primary")
    .map((node) => base.indexByNodeId.get(node.id));
  const options = {
    attributeBounds: [{ nodeIndexes: primaryIndexes, minPerCommunity: 1, maxPerCommunity: 1 }]
  };
  const feasibleReference = enumerateSetPartitions(nodeIds).filter((partition) =>
    partition.every((community) => community.filter((id) => nodeRecords.find((node) => node.id === id)?.category === "primary").length === 1)
  );
  let bestScore = Number.NEGATIVE_INFINITY;
  const bestPartitions = [];
  for (const partition of feasibleReference) {
    const score = computeModularityScore(nodeIds, edges, partition);
    if (score > bestScore) {
      bestScore = score;
      bestPartitions.length = 0;
    }
    if (score === bestScore) bestPartitions.push(partition);
  }
  const runner = await getRunner();
  const result = await runner.run(
    `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram(options)}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(result.Result, "OPTIMUM FOUND");
  const actual = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(actual[0]?.scaledScore, bestScore);
  assert.deepEqual(normalizePartitions(actual.map((partition) => partition.communities)), normalizePartitions(bestPartitions));
  assert.ok(actual.every((partition) => partition.communities.every((community) =>
    community.filter((id) => nodeRecords.find((node) => node.id === id)?.category === "primary").length === 1
  )));

  const pairwiseResult = await runner.run(
    `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${modularityFacts.pairwiseObjectiveFacts.trim()}\n\n${buildExperimentalModularityEquivalenceProgram({
      ...options,
      pairwiseObjectiveOffset: modularityFacts.pairwiseObjectiveOffset
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(pairwiseResult.Result, "OPTIMUM FOUND");
  const pairwise = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(pairwiseResult.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  assert.equal(pairwise[0]?.scaledScore, bestScore);
  assert.deepEqual(normalizePartitions(pairwise.map((partition) => partition.communities)), normalizePartitions(bestPartitions));

  const impossibleResult = await runner.run(
    `${base.facts.trim()}\n\n${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram({
      attributeBounds: [{ nodeIndexes: [], minPerCommunity: 1 }]
    })}\n`,
    getStructuralSolverOptions("communities", true)
  );
  assert.equal(impossibleResult.Result, "UNSATISFIABLE", "un valore senza candidati non va ignorato come se il limite fosse soddisfatto");
});

test("modularity communities require an explicitly usable undirected projection", () => {
  const graphInput = {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ id: "ab", source: "a", target: "b" }]
  };
  const undirected = normalizeGraphData(graphInput, {
    schemaVersion: 2,
    graphMapping: { edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target", direction: "undirected" } }
  });
  const directed = normalizeGraphData(graphInput, {
    schemaVersion: 2,
    graphMapping: { edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target", direction: "directed" } }
  });

  assert.equal(checkGraphTaskRequirements(
    undirected.capabilities,
    getGraphTaskRequirements("communities")
  ).available, true);
  const directedRequirements = checkGraphTaskRequirements(
    directed.capabilities,
    getGraphTaskRequirements("communities")
  );
  assert.equal(directedRequirements.available, false);
  assert.match(directedRequirements.reasons.join(" "), /mapping corrente dichiara archi diretti/);
});

test("la separazione ASP delle componenti conserva punteggio e tutti gli ottimi, anche con isolati e pesi nulli", async () => {
  const cases = [
    {
      name: "unweighted with isolate",
      nodeIds: ["a", "b", "c", "d", "isolate"],
      edges: [
        { source: "a", target: "b" },
        { source: "c", target: "d" }
      ],
      weighted: false
    },
    {
      name: "weighted with zero-volume component",
      nodeIds: ["a", "b", "c", "d", "zero-a", "zero-b"],
      edges: [
        { source: "a", target: "b", weight: 2 },
        { source: "c", target: "d", weight: 3 },
        { source: "zero-a", target: "zero-b", weight: 0 }
      ],
      weighted: true
    }
  ];
  const runner = await getRunner();

  for (const item of cases) {
    const indexByNodeId = new Map(item.nodeIds.map((nodeId, index) => [nodeId, index + 1]));
    const reverseIndex = Object.fromEntries(item.nodeIds.map((nodeId, index) => [index + 1, nodeId]));
    const numericEdges = item.edges.map((edge) => ({
      source: indexByNodeId.get(edge.source),
      target: indexByNodeId.get(edge.target),
      ...(item.weighted ? { weight: edge.weight } : {})
    }));
    const facts = buildModularityFacts(
      item.nodeIds.map((nodeId) => indexByNodeId.get(nodeId)),
      numericEdges,
      { weighted: item.weighted, includePairwiseObjective: true }
    );
    assert.equal(facts.connectedComponentCount, 3, item.name);
    assert.equal(
      facts.connectedComponentFacts.trim().split("\n").length,
      item.nodeIds.length,
      item.name
    );

    const run = async (separateDisconnectedComponents) => {
      const program = [
        facts.facts.trim(),
        ...(separateDisconnectedComponents ? [facts.connectedComponentFacts.trim()] : []),
        facts.pairwiseObjectiveFacts.trim(),
        buildMaximumModularityProgram({
          weighted: item.weighted,
          pairwiseObjectiveOffset: facts.pairwiseObjectiveOffset,
          separateDisconnectedComponents
        })
      ].join("\n\n");
      const result = await runner.run(program, getStructuralSolverOptions("communities", true));
      assert.equal(result.Result, "OPTIMUM FOUND", `${item.name}, separate=${separateDisconnectedComponents}`);
      return selectMaximumModularityPartitions(
        parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, reverseIndex)
      );
    };

    const baseline = await run(false);
    const separated = await run(true);
    const expected = item.weighted
      ? enumerateMaximumWeightedModularityPartitions(item.nodeIds, item.edges)
      : enumerateMaximumModularityPartitions(
          item.nodeIds,
          item.edges.map((edge) => [edge.source, edge.target])
        );
    assert.equal(baseline[0]?.scaledScore, expected.maximumScore, item.name);
    assert.equal(separated[0]?.scaledScore, expected.maximumScore, item.name);
    assert.deepEqual(
      normalizePartitions(separated.map((partition) => partition.communities)),
      normalizePartitions(expected.partitions),
      `${item.name}: le partizioni ottime, incluse quelle che differiscono solo nell'assegnazione dei nodi di volume zero, devono restare tutte`
    );
    assert.deepEqual(
      normalizePartitions(separated.map((partition) => partition.communities)),
      normalizePartitions(baseline.map((partition) => partition.communities)),
      `${item.name}: la separazione non deve perdere ottimi rispetto alla baseline`
    );
  }
});

test("la separazione delle componenti rifiuta i vincoli globali che possono imporre fusioni", () => {
  assert.throws(() => buildMaximumModularityProgram({ separateDisconnectedComponents: true, minCount: 2 }), /senza vincoli globali/);
  assert.throws(() => buildMaximumModularityProgram({ separateDisconnectedComponents: true, maxCount: 2 }), /senza vincoli globali/);
  assert.throws(() => buildMaximumModularityProgram({ separateDisconnectedComponents: true, mustLinkPairs: [[1, 2]] }), /senza vincoli globali/);
  assert.throws(() => buildMaximumModularityProgram({ separateDisconnectedComponents: true, cannotLinkPairs: [[1, 2]] }), /senza vincoli globali/);
  assert.throws(() => buildMaximumModularityProgram({
    separateDisconnectedComponents: true,
    attributeBounds: [{ nodeIndexes: [1], minPerCommunity: 1 }]
  }), /senza vincoli globali/);
  assert.throws(() => buildMaximumModularityProgram({ separateDisconnectedComponents: "yes" }), /booleano/);
});

test("modularity counts each self-loop twice in degree and once as an edge", async () => {
  const nodeIds = ["a", "b", "c"];
  const indexByNodeId = new Map(nodeIds.map((nodeId, index) => [nodeId, index + 1]));
  const reverseIndex = Object.fromEntries(nodeIds.map((nodeId, index) => [index + 1, nodeId]));
  const edgePairs = [["a", "a"], ["a", "b"], ["a", "b"]];
  const modularityFacts = buildModularityFacts(
    nodeIds.map((nodeId) => indexByNodeId.get(nodeId)),
    edgePairs.map(([source, target]) => ({
      source: indexByNodeId.get(source),
      target: indexByNodeId.get(target)
    }))
  );
  const runner = await getRunner();
  const result = await runner.run(
    `${modularityFacts.facts.trim()}\n\n${buildMaximumModularityProgram()}\n`,
    getStructuralSolverOptions("communities", true)
  );

  assert.equal(modularityFacts.edgeCount, 3);
  assert.match(modularityFacts.facts, /modularity_degree\(1,4\)\./, "loop adds two degree units, in addition to the two parallel edges");
  assert.match(modularityFacts.facts, /modularity_degree\(2,2\)\./);
  assert.equal(result.Result, "OPTIMUM FOUND");
  const actual = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, reverseIndex)
  );
  const expected = enumerateMaximumModularityPartitions(nodeIds, edgePairs);
  assert.equal(actual[0].scaledScore, expected.maximumScore);
  assert.deepEqual(
    normalizePartitions(actual.map((partition) => partition.communities)),
    normalizePartitions(expected.partitions)
  );

});

test("le componenti connesse ASP coincidono con BFS su tutti i grafi non orientati a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const pairs = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
    const result = await runner.run(`${facts.trim()}\n\n${buildConnectedComponentsProgram()}\n`);
    assert.equal(result.Result, "SATISFIABLE", `grafo=${graphMask}`);
    const actual = parseWitnessComponents(result.Call?.[0]?.Witnesses, reverseIndex);
    assert.deepEqual(normalizeSets(actual), computeConnectedComponents(nodeIds, pairs), `grafo=${graphMask}`);
  }
});

test("le componenti deboli e forti ASP coincidono con i riferimenti su tutti i digrafi semplici a 3 nodi", async () => {
  const nodeIds = ["0", "1", "2"];
  const possibleArcs = nodeIds.flatMap((source) => nodeIds
    .filter((target) => target !== source)
    .map((target) => [source, target]));
  const directedConfig = {
    schemaVersion: 2,
    graphMapping: {
      edge: { sourceField: "$.source", targetField: "$.target", direction: "directed" }
    }
  };
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possibleArcs.length; graphMask += 1) {
    const arcs = possibleArcs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: arcs.map(([source, target]) => ({ source, target }))
    }, directedConfig);
    const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
    const result = await runner.run(`${facts.trim()}\n\n${buildStronglyConnectedComponentsProgram()}\n`);
    assert.equal(result.Result, "SATISFIABLE", `grafo diretto=${graphMask}`);
    const actual = parseWitnessStrongComponents(result.Call?.[0]?.Witnesses, reverseIndex);
    assert.deepEqual(actual, computeStronglyConnectedComponents(nodeIds, arcs), `grafo diretto=${graphMask}`);

    const weakResult = await runner.run(`${facts.trim()}\n\n${buildWeaklyConnectedComponentsProgram()}\n`);
    assert.equal(weakResult.Result, "SATISFIABLE", `grafo debole=${graphMask}`);
    assert.deepEqual(
      parseWitnessWeakComponents(weakResult.Call?.[0]?.Witnesses, reverseIndex),
      computeConnectedComponents(nodeIds, arcs),
      `componenti deboli=${graphMask}`
    );
  }
});

test("le SCC rispettano il gruppo candidato e i soli archi orientati", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", group: "inside" },
      { id: "b", group: "inside" },
      { id: "outside", group: "other" }
    ],
    edges: [
      { source: "a", target: "outside" },
      { source: "outside", target: "b" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { groupFields: ["$.group"] },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "directed" }
    }
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const runner = await getRunner();
  const result = await runner.run(`${facts.trim()}\n\n${buildStronglyConnectedComponentsProgram("inside")}\n`);
  const weakResult = await runner.run(`${facts.trim()}\n\n${buildWeaklyConnectedComponentsProgram("inside")}\n`);

  assert.equal(graph.valid, true);
  assert.equal(result.Result, "SATISFIABLE");
  assert.deepEqual(
    parseWitnessStrongComponents(result.Call?.[0]?.Witnesses, reverseIndex),
    [["a"], ["b"]]
  );
  assert.equal(weakResult.Result, "SATISFIABLE");
  assert.deepEqual(
    parseWitnessWeakComponents(weakResult.Call?.[0]?.Witnesses, reverseIndex),
    [["a"], ["b"]]
  );
  assert.deepEqual(
    checkGraphTaskRequirements(graph.capabilities, getGraphTaskRequirements("strongComponents")),
    { available: true, missing: [], reasons: [] }
  );
  assert.deepEqual(
    checkGraphTaskRequirements(graph.capabilities, getGraphTaskRequirements("weakComponents")),
    { available: true, missing: [], reasons: [] }
  );
  const undirectedGraph = normalizeGraphData({ nodes: [{ id: "a" }], edges: [] }, {
    schemaVersion: 2,
    graphMapping: {
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  });
  assert.equal(
    checkGraphTaskRequirements(undirectedGraph.capabilities, getGraphTaskRequirements("weakComponents")).available,
    false,
    "i task di connettività diretta devono richiedere un mapping dichiarato come diretto"
  );
  assert.equal(
    checkGraphTaskRequirements(undirectedGraph.capabilities, getGraphTaskRequirements("strongComponents")).available,
    false
  );
});

test("i cammini ASP restituiscono un cammino minimo corretto per tutte le coppie sui 64 grafi a 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const pairs = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
    const pathEdgeFacts = buildPathEdgeFacts(graph.links, indexByNodeId);
    const pathFacts = `${facts.trim()}\n\n${pathEdgeFacts.facts.trim()}`;

    for (const start of nodeIds) {
      for (const goal of nodeIds) {
        const expected = computeShortestPath(nodeIds, pairs, start, goal);
        const result = await runner.run(
          `${pathFacts}\n\n${buildMinimumHopPathProgram(indexByNodeId.get(start), indexByNodeId.get(goal), 3, "", "undirected", true)}\n`,
          getStructuralSolverOptions("path"),
          1
        );
        if (!expected) {
          assert.equal(result.Result, "UNSATISFIABLE", `grafo=${graphMask}, ${start}->${goal}`);
          const noRouteResult = await runner.run(
            `${pathFacts}\n\n${buildBoundedPathNoRouteProgram(indexByNodeId.get(start), indexByNodeId.get(goal), 3)}\n`
          );
          assert.equal(noRouteResult.Result, "SATISFIABLE", `certificato no-route grafo=${graphMask}, ${start}->${goal}`);
          const noRouteCertificate = parseBoundedPathNoRouteCertificate(
            noRouteResult.Call?.[0]?.Witnesses,
            reverseIndex,
            3,
            goal
          );
          assert.ok(noRouteCertificate, `certificato why-not leggibile grafo=${graphMask}, ${start}->${goal}`);
          assert.deepEqual(
            noRouteCertificate.reachableByDepth,
            computeReachableByDepth(nodeIds, pairs, start, 3),
            `certificato why-not coincide con BFS grafo=${graphMask}, ${start}->${goal}`
          );
          continue;
        }
        assert.equal(result.Result, "SATISFIABLE", `grafo=${graphMask}, ${start}->${goal}`);
        const actual = parseWitnessMinimumHopPathWitness(
          result.Call?.[0]?.Witnesses,
          reverseIndex,
          pathEdgeFacts.reverseEdgeIndex,
          true
        );
        assert.ok(actual, `percorso assente nel modello: grafo=${graphMask}, ${start}->${goal}`);
        assert.equal(actual.nodeIds[0], start);
        assert.equal(actual.nodeIds.at(-1), goal);
        assert.equal(actual.nodeIds.length, expected.length, `non minimo: grafo=${graphMask}, ${start}->${goal}`);
        assert.equal(new Set(actual.nodeIds).size, actual.nodeIds.length, "il cammino deve essere semplice");
        assert.deepEqual(parseWitnessMinimumHopPath(result.Call?.[0]?.Witnesses, reverseIndex), actual.nodeIds);
        assert.equal(actual.edgeIdsByStep.length, actual.nodeIds.length - 1);
        assert.equal(actual.minimalityCertificate?.pathLength, expected.length - 1);
        const expectedShorterReachability = expected.length === 1
          ? []
          : computeReachableByDepth(nodeIds, pairs, start, expected.length - 2);
        assert.deepEqual(
          actual.minimalityCertificate?.reachableByDepth,
          expectedShorterReachability,
          `certificato di raggiungibilità per lunghezze inferiori, grafo=${graphMask}, ${start}->${goal}`
        );
        assert.ok(expectedShorterReachability.every((layer) => !layer.nodeIds.includes(goal)));
        for (let index = 0; index < actual.nodeIds.length - 1; index += 1) {
          const edge = [actual.nodeIds[index], actual.nodeIds[index + 1]].sort();
          assert.ok(pairs.some(([source, target]) => [source, target].sort().join("|") === edge.join("|")));
          assert.ok(actual.edgeIdsByStep[index].length > 0, "ogni passo deve avere almeno un record testimone");
          assert.ok(actual.edgeIdsByStep[index].every((edgeId) =>
            pathEdgeFacts.displayIdByEdgeId[edgeId]?.startsWith("coppia legacy:")
          ));
        }
      }
    }
  }
});

test("il certificato opt-in dimostra l'assenza di percorsi entro una lunghezza inferiore", async () => {
  const nodeIds = ["s", "a", "b", "g"];
  const edges = [["s", "a"], ["a", "g"], ["s", "b"], ["b", "a"]];
  const graph = normalizeGraphData({
    nodes: nodeIds.map((id) => ({ id })),
    edges: edges.map(([source, target]) => ({ source, target }))
  });
  const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
  const pathFacts = buildPathEdgeFacts(graph.links, indexByNodeId);
  const baselineProgram = buildMinimumHopPathProgram(indexByNodeId.get("s"), indexByNodeId.get("g"), 3);
  assert.doesNotMatch(baselineProgram, /path_minimality_certificate|path_shorter_reachable/);

  const explainedProgram = buildMinimumHopPathProgram(
    indexByNodeId.get("s"), indexByNodeId.get("g"), 3, "", "undirected", true
  );
  const result = await (await getRunner()).run(`${facts.trim()}\n${pathFacts.facts.trim()}\n${explainedProgram}`,
    getStructuralSolverOptions("path"), 1);
  assert.equal(result.Result, "SATISFIABLE");
  const witness = parseWitnessMinimumHopPathWitness(
    result.Call?.[0]?.Witnesses,
    reverseIndex,
    pathFacts.reverseEdgeIndex,
    true
  );
  assert.ok(witness?.minimalityCertificate);
  assert.equal(witness.minimalityCertificate.pathLength, 2);
  assert.deepEqual(witness.minimalityCertificate.reachableByDepth, [
    { depth: 0, nodeIds: ["s"] },
    { depth: 1, nodeIds: ["a", "b", "s"] }
  ]);
  assert.ok(witness.minimalityCertificate.reachableByDepth.every((layer) => !layer.nodeIds.includes("g")));
});

test("una query di cammino restituisce un solo witness quando esistono pareggi", async () => {
  const graph = normalizeGraphData({
    nodes: ["s", "a", "b", "g"].map((id) => ({ id })),
    edges: [["s", "a"], ["a", "g"], ["s", "b"], ["b", "g"]]
      .map(([source, target]) => ({ source, target }))
  });
  const asp = buildAspFactsFromGraph(graph);
  const pathFacts = buildPathEdgeFacts(graph.links, asp.indexByNodeId);
  const result = await (await getRunner()).run([
    asp.facts.trim(),
    pathFacts.facts.trim(),
    buildMinimumHopPathProgram(asp.indexByNodeId.get("s"), asp.indexByNodeId.get("g"), 2)
  ].filter(Boolean).join("\n\n"), [], 1);
  assert.equal(result.Result, "SATISFIABLE");
  assert.equal(result.Models.Number, 1);
  assert.equal(result.Models.More, "yes", "il limite di modelli interrompe i pareggi dopo un witness");
  const path = parseWitnessMinimumHopPathWitness(
    result.Call?.[0]?.Witnesses,
    asp.reverseIndex,
    pathFacts.reverseEdgeIndex,
    true
  );
  assert.equal(path?.nodeIds.length, 3);
  assert.ok(["a", "b"].includes(path?.nodeIds[1] ?? ""));
});

test("il cammino minimo gestisce il bound zero senza accettare archi", async () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "s" }, { id: "g" }],
    edges: [{ source: "s", target: "g" }]
  });
  const asp = buildAspFactsFromGraph(graph);
  const pathFacts = buildPathEdgeFacts(graph.links, asp.indexByNodeId);
  const runner = await getRunner();
  const sameNode = await runner.run([
    asp.facts.trim(),
    pathFacts.facts.trim(),
    buildMinimumHopPathProgram(asp.indexByNodeId.get("s"), asp.indexByNodeId.get("s"), 0)
  ].filter(Boolean).join("\n\n"));
  assert.equal(sameNode.Result, "SATISFIABLE");
  assert.deepEqual(parseWitnessMinimumHopPathWitness(
    sameNode.Call?.[0]?.Witnesses,
    asp.reverseIndex,
    pathFacts.reverseEdgeIndex,
    true
  )?.nodeIds, ["s"]);

  const differentNodes = await runner.run([
    asp.facts.trim(),
    pathFacts.facts.trim(),
    buildMinimumHopPathProgram(asp.indexByNodeId.get("s"), asp.indexByNodeId.get("g"), 0)
  ].filter(Boolean).join("\n\n"));
  assert.equal(differentNodes.Result, "UNSATISFIABLE");
});

test("il limite del cammino formatta correttamente singolare e plurale", () => {
  assert.equal(formatPathLengthBound(0), "0 archi");
  assert.equal(formatPathLengthBound(1), "1 arco");
  assert.equal(formatPathLengthBound(2), "2 archi");
  assert.throws(() => formatPathLengthBound(-1), RangeError);
  assert.throws(() => formatPathLengthBound(1.5), RangeError);
});

test("il why-not bounded certifica assenza entro il limite e rispetta gruppo e direzione", async () => {
  const directedConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", groupFields: ["$.group"] },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "directed",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", group: "route" },
      { id: "a", group: "route" },
      { id: "b", group: "route" },
      { id: "g", group: "route" },
      { id: "outside", group: "other" }
    ],
    edges: [
      { id: "sa", source: "s", target: "a" },
      { id: "ab", source: "a", target: "b" },
      { id: "bg", source: "b", target: "g" },
      { id: "outside-to-source", source: "outside", target: "s" }
    ]
  }, directedConfig);
  const base = buildAspFactsFromGraph(graph);
  const pathEdges = buildPathEdgeFacts(graph.links, base.indexByNodeId);
  const runner = await getRunner();
  const boundedPath = await runner.run(
    `${base.facts.trim()}\n${pathEdges.facts.trim()}\n${buildMinimumHopPathProgram(
      base.indexByNodeId.get("s"), base.indexByNodeId.get("g"), 2, "route", "directed"
    )}`,
    getStructuralSolverOptions("path"),
    1
  );
  assert.equal(boundedPath.Result, "UNSATISFIABLE", "il cammino valido richiede tre archi, oltre il bound due");

  const noRoute = await runner.run(
    `${base.facts.trim()}\n${pathEdges.facts.trim()}\n${buildBoundedPathNoRouteProgram(
      base.indexByNodeId.get("s"), base.indexByNodeId.get("g"), 2, "route", "directed"
    )}`
  );
  assert.equal(noRoute.Result, "SATISFIABLE");
  const certificate = parseBoundedPathNoRouteCertificate(
    noRoute.Call?.[0]?.Witnesses,
    base.reverseIndex,
    2,
    "g"
  );
  assert.deepEqual(certificate?.reachableByDepth, [
    { depth: 0, nodeIds: ["s"] },
    { depth: 1, nodeIds: ["a", "s"] },
    { depth: 2, nodeIds: ["a", "b", "s"] }
  ]);
  assert.ok(certificate?.reachableByDepth.every((layer) => !layer.nodeIds.includes("g")));
  assert.ok(certificate?.reachableByDepth.every((layer) => !layer.nodeIds.includes("outside")));
});

test("i cammini ASP rispettano la direzione dichiarata e non inventano archi inversi", async () => {
  const directedConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", labelField: "$.label", typeField: "$.type" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "directed",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", label: "A", type: "person" },
      { id: "b", label: "B", type: "person" },
      { id: "c", label: "C", type: "person" },
      { id: "predecessor", label: "Predecessor", type: "person" },
      { id: "d", label: "D", type: "person" }
    ],
    edges: [
      { id: "predecessor-a", source: "predecessor", target: "a", type: "knows" },
      { id: "ab", source: "a", target: "b", type: "knows" },
      { id: "bc", source: "b", target: "c", type: "knows" },
      { id: "bd", source: "b", target: "d", type: "knows" },
      { id: "ac", source: "a", target: "c", type: "knows" },
      { id: "ac-parallel", source: "a", target: "c", type: "knows" },
      { source: "a", target: "c", type: "knows" }
    ]
  }, directedConfig);
  const { facts, indexByNodeId, reverseIndex } = buildAspFactsFromGraph(graph);
  const pathEdgeFacts = buildPathEdgeFacts(graph.links, indexByNodeId);
  const directedPathFacts = `${facts.trim()}\n\n${pathEdgeFacts.facts.trim()}`;
  const runner = await getRunner();
  const forward = await runner.run(
    `${directedPathFacts}\n${buildMinimumHopPathProgram(indexByNodeId.get("a"), indexByNodeId.get("c"), 2, "", "directed")}`,
    getStructuralSolverOptions("path"),
    1
  );
  assert.equal(forward.Result, "SATISFIABLE");
  const forwardPath = parseWitnessMinimumHopPathWitness(
    forward.Call?.[0]?.Witnesses,
    reverseIndex,
    pathEdgeFacts.reverseEdgeIndex,
    true
  );
  assert.deepEqual(forwardPath?.nodeIds, ["a", "c"]);
  const generatedEdgeIdentity = Object.keys(pathEdgeFacts.displayIdByEdgeId)
    .find((edgeId) => pathEdgeFacts.displayIdByEdgeId[edgeId].startsWith("chiave locale generata:"));
  assert.ok(generatedEdgeIdentity);
  assert.deepEqual(
    forwardPath?.edgeIdsByStep[0]?.slice().sort(),
    ["source:ac", "source:ac-parallel", generatedEdgeIdentity].sort()
  );
  const minimality = await runner.run(
    `${directedPathFacts}\n${buildMinimumHopPathProgram(indexByNodeId.get("a"), indexByNodeId.get("d"), 2, "", "directed", true)}`,
    getStructuralSolverOptions("path"),
    1
  );
  const minimalityPath = parseWitnessMinimumHopPathWitness(
    minimality.Call?.[0]?.Witnesses,
    reverseIndex,
    pathEdgeFacts.reverseEdgeIndex,
    true
  );
  assert.equal(minimality.Result, "SATISFIABLE");
  assert.deepEqual(minimalityPath?.nodeIds, ["a", "b", "d"]);
  assert.deepEqual(minimalityPath?.minimalityCertificate?.reachableByDepth, [
    { depth: 0, nodeIds: ["a"] },
    { depth: 1, nodeIds: ["a", "b", "c"] }
  ], "il certificato segue gli archi diretti e non include predecessori raggiungibili solo in senso inverso");
  assert.ok(!minimalityPath?.minimalityCertificate?.reachableByDepth[1].nodeIds.includes("predecessor"));
  assert.ok(pathEdgeFacts.displayIdByEdgeId["source:ac"]?.startsWith("ID sorgente:"));

  const backward = await runner.run(
    `${directedPathFacts}\n${buildMinimumHopPathProgram(indexByNodeId.get("c"), indexByNodeId.get("a"), 2, "", "directed")}`,
    getStructuralSolverOptions("path"),
    1
  );
  assert.equal(backward.Result, "UNSATISFIABLE");
});

test("il cammino tipizzato segue una sequenza ordinata e restituisce gli archi testimoni", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", groupFields: ["$.group"] },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "directed",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "start", group: "route" },
      { id: "middle", group: "route" },
      { id: "goal", group: "route" },
      { id: "detour", group: "other" }
    ],
    edges: [
      { id: "step-a", source: "start", target: "middle", type: "affiliation" },
      { id: "step-b", source: "middle", target: "goal", type: "publication" },
      { id: "wrong-order", source: "start", target: "goal", type: "publication" },
      { id: "reverse-only", source: "detour", target: "middle", type: "affiliation" }
    ]
  }, config);
  const base = buildAspFactsFromGraph(graph);
  const edgeIdentityFacts = buildMinimumEdgeSeparatorFacts(graph.links, base.indexByNodeId);
  const runner = await getRunner();
  const result = await runner.run(
    `${base.facts.trim()}\n\n${buildTypedPathProgram({
      startNode: base.indexByNodeId.get("start"),
      goalNode: base.indexByNodeId.get("goal"),
      edgeTypeSequence: ["affiliation", "publication"],
      direction: "directed",
      group: "route"
    })}\n`,
    getStructuralSolverOptions("typedPath"),
    1
  );

  assert.equal(graph.valid, true);
  assert.equal(checkGraphTaskRequirements(
    graph.capabilities,
    getGraphTaskRequirements("typedPath")
  ).available, true);
  assert.deepEqual(getStructuralSolverOptions("typedPath"), []);
  assert.equal(result.Result, "SATISFIABLE");
  assert.deepEqual(
    parseWitnessTypedPath(
      result.Call?.[0]?.Witnesses,
      base.reverseIndex,
      edgeIdentityFacts.reverseEdgeIndex,
      2
    ),
    {
      nodeIds: ["start", "middle", "goal"],
      edgeIdsByStep: [["source:step-a"], ["source:step-b"]]
    }
  );

  const wrongSequence = await runner.run(
    `${base.facts.trim()}\n\n${buildTypedPathProgram({
      startNode: base.indexByNodeId.get("start"),
      goalNode: base.indexByNodeId.get("goal"),
      edgeTypeSequence: ["publication", "affiliation"],
      direction: "directed"
    })}\n`,
    getStructuralSolverOptions("typedPath"),
    1
  );
  assert.equal(wrongSequence.Result, "UNSATISFIABLE");
  const reverseDirectedPath = await runner.run(
    `${base.facts.trim()}\n\n${buildTypedPathProgram({
      startNode: base.indexByNodeId.get("middle"),
      goalNode: base.indexByNodeId.get("start"),
      edgeTypeSequence: ["affiliation"],
      direction: "directed"
    })}\n`,
    getStructuralSolverOptions("typedPath"),
    1
  );
  assert.equal(reverseDirectedPath.Result, "UNSATISFIABLE", "il cammino diretto non deve invertire un arco tipizzato");
  const undirectedGraph = normalizeGraphData({
    nodes: [{ id: "left" }, { id: "right" }],
    edges: [{ id: "reversed-record", source: "right", target: "left", type: "association" }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  });
  const undirectedBase = buildAspFactsFromGraph(undirectedGraph);
  const undirectedEdgeIndex = buildMinimumEdgeSeparatorFacts(undirectedGraph.links, undirectedBase.indexByNodeId);
  const undirectedResult = await runner.run(
    `${undirectedBase.facts.trim()}\n\n${buildTypedPathProgram({
      startNode: undirectedBase.indexByNodeId.get("left"),
      goalNode: undirectedBase.indexByNodeId.get("right"),
      edgeTypeSequence: ["association"],
      direction: "undirected"
    })}\n`,
    getStructuralSolverOptions("typedPath"),
    1
  );
  assert.equal(undirectedResult.Result, "SATISFIABLE", "un arco non orientato deve poter essere percorso in entrambi i versi");
  assert.deepEqual(
    parseWitnessTypedPath(
      undirectedResult.Call?.[0]?.Witnesses,
      undirectedBase.reverseIndex,
      undirectedEdgeIndex.reverseEdgeIndex,
      1
    ),
    { nodeIds: ["left", "right"], edgeIdsByStep: [["source:reversed-record"]] }
  );
  assert.throws(() => buildTypedPathProgram({
    startNode: 1,
    goalNode: 2,
    edgeTypeSequence: [],
    direction: "undirected"
  }), /almeno un tipo/);
  assert.throws(() => buildTypedPathProgram({
    startNode: 1,
    goalNode: 2,
    edgeTypeSequence: Array(101).fill("relationship"),
    direction: "undirected"
  }), /100 passi/);
});

test("il cammino tipizzato resta indisponibile quando mancano i tipi d'arco mappati", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ source: "a", target: "b", type: "relation" }]
  });
  assert.equal(checkGraphTaskRequirements(
    graph.capabilities,
    getGraphTaskRequirements("typedPath")
  ).available, false);
});

test("il why-not del cammino tipizzato espone i prefissi e distingue un walk con revisite", async () => {
  const directedConfig = {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "directed",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
    edges: [
      { id: "ab", source: "a", target: "b", type: "x" },
      { id: "ba", source: "b", target: "a", type: "y" },
      { id: "ad", source: "a", target: "d", type: "z" }
    ]
  }, directedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const options = {
    startNode: facts.indexByNodeId.get("a"),
    goalNode: facts.indexByNodeId.get("d"),
    edgeTypeSequence: ["x", "y", "z"],
    direction: "directed"
  };
  const runner = await getRunner();
  const simpleResult = await runner.run(
    `${facts.facts}\n${buildTypedPathProgram(options)}`,
    [],
    1
  );
  assert.equal(simpleResult.Result, "UNSATISFIABLE", "la query principale richiede nodi distinti");
  const walkResult = await runner.run(
    `${facts.facts}\n${buildTypedPathNoRouteProgram(options)}`,
    [],
    1
  );
  assert.equal(walkResult.Result, "SATISFIABLE", walkResult.Error ?? JSON.stringify(walkResult));
  assert.deepEqual(
    parseTypedPathNoRouteCertificate(
      walkResult.Call?.[0]?.Witnesses,
      facts.reverseIndex,
      options.edgeTypeSequence
    ),
    {
      edgeTypeSequence: ["x", "y", "z"],
      reachableByStep: [
        { step: 0, nodeIds: ["a"] },
        { step: 1, nodeIds: ["b"] },
        { step: 2, nodeIds: ["a"] },
        { step: 3, nodeIds: ["d"] }
      ],
      goalReachableAsWalk: true
    }
  );
});

test("il why-not del cammino tipizzato rispetta gruppo e direzione in ogni prefisso", async () => {
  const mappedConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { groupFields: ["$.group"] },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "directed",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "start", group: "eligible" },
      { id: "outside", group: "other" },
      { id: "goal", group: "eligible" }
    ],
    edges: [{ id: "excluded-step", source: "start", target: "outside", type: "next" }]
  }, mappedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const options = {
    startNode: facts.indexByNodeId.get("start"),
    goalNode: facts.indexByNodeId.get("goal"),
    edgeTypeSequence: ["next"],
    direction: "directed",
    group: "eligible"
  };
  const runner = await getRunner();
  const result = await runner.run(`${facts.facts}\n${buildTypedPathNoRouteProgram(options)}`, [], 1);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  const certificate = parseTypedPathNoRouteCertificate(
    result.Call?.[0]?.Witnesses,
    facts.reverseIndex,
    options.edgeTypeSequence
  );
  assert.ok(certificate);
  assert.deepEqual(certificate.reachableByStep, [
    { step: 0, nodeIds: ["start"] },
    { step: 1, nodeIds: [] }
  ]);
  assert.equal(certificate.firstEmptyStep, 1);
  assert.equal(certificate.goalReachableAsWalk, false);

  const reverseGraph = normalizeGraphData({
    nodes: [{ id: "start" }, { id: "goal" }],
    edges: [{ id: "reverse", source: "goal", target: "start", type: "next" }]
  }, mappedConfig);
  const reverseFacts = buildAspFactsFromGraph(reverseGraph);
  const reverseOptions = {
    ...options,
    startNode: reverseFacts.indexByNodeId.get("start"),
    goalNode: reverseFacts.indexByNodeId.get("goal"),
    group: ""
  };
  const reverseResult = await runner.run(
    `${reverseFacts.facts}\n${buildTypedPathNoRouteProgram(reverseOptions)}`,
    [],
    1
  );
  assert.equal(reverseResult.Result, "SATISFIABLE", reverseResult.Error ?? JSON.stringify(reverseResult));
  const reverseCertificate = parseTypedPathNoRouteCertificate(
    reverseResult.Call?.[0]?.Witnesses,
    reverseFacts.reverseIndex,
    reverseOptions.edgeTypeSequence
  );
  assert.deepEqual(reverseCertificate?.reachableByStep, [
    { step: 0, nodeIds: ["start"] },
    { step: 1, nodeIds: [] }
  ], "un grafo diretto non deve rendere raggiungibile l'arco inverso");
});

test("k-plex e k-core ASP sono corretti su tutti i grafi semplici non orientati con 4 nodi", async () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possiblePairs = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possiblePairs.push([nodeIds[source], nodeIds[target]]);
    }
  }
  const runner = await getRunner();

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const pairs = possiblePairs.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const graph = normalizeGraphData({
      nodes: nodeIds.map((id) => ({ id })),
      edges: pairs.map(([source, target]) => ({ source, target }))
    });
    const { facts, reverseIndex } = buildAspFactsFromGraph(graph);

    for (const s of [1, 2]) {
      const result = await runner.run(`${facts.trim()}\n\n${buildMaximumKPlexProgram(s)}\n`, optimizationOptions);
      assert.equal(result.Result, "OPTIMUM FOUND", `grafo=${graphMask}, s=${s}`);
      const actual = selectMaximumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, reverseIndex));
      const expected = enumerateMaximumSPlexes(nodeIds, pairs, s);
      assert.deepEqual(normalizeSets(actual), normalizeSets(expected), `grafo=${graphMask}, s=${s}`);

      const explanations = parseWitnessKPlexExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
      const maximumExplanations = explanations.filter((item) => item.nodeIds.length === expected[0]?.length);
      assert.deepEqual(normalizeSets(maximumExplanations.map((item) => item.nodeIds)), normalizeSets(expected));
      for (const explanation of maximumExplanations) {
        const members = [...explanation.nodeIds].sort();
        const expectedMissingPairs = [];
        for (let first = 0; first < members.length; first += 1) {
          for (let second = first + 1; second < members.length; second += 1) {
            const adjacent = pairs.some(([source, target]) =>
              (source === members[first] && target === members[second]) ||
              (source === members[second] && target === members[first])
            );
            if (!adjacent) expectedMissingPairs.push([members[first], members[second]]);
          }
        }
        assert.deepEqual(explanation.missingTiePairs, expectedMissingPairs, `missing ties, grafo=${graphMask}, s=${s}`);
        const missingByNode = new Map(nodeIds.map((id) => [id, 0]));
        for (const [first, second] of explanation.missingTiePairs) {
          missingByNode.set(first, (missingByNode.get(first) ?? 0) + 1);
          missingByNode.set(second, (missingByNode.get(second) ?? 0) + 1);
        }
        assert.ok([...missingByNode.values()].every((count) => count <= s - 1));
      }
    }

    for (const k of [0, 1, 2, 3]) {
      assert.doesNotMatch(buildKCoreProgram(k), /peeled_at|peel_support/);
      const result = await runner.run(`${facts.trim()}\n\n${buildKCoreProgram(k)}\n`, optimizationOptions);
      assert.equal(result.Result, "OPTIMUM FOUND", `grafo=${graphMask}, k=${k}`);
      const actual = selectMaximumNodeSets(parseWitnessNodeSets(result.Call?.[0]?.Witnesses, reverseIndex));
      const expected = computeKCoreByPeeling(nodeIds, pairs, k);
      assert.deepEqual(normalizeSets(actual), [expected], `grafo=${graphMask}, k=${k}`);

      const explanations = parseWitnessKCoreExplanations(result.Call?.[0]?.Witnesses, reverseIndex);
      const maximumExplanations = explanations.filter((item) => item.nodeIds.length === expected.length);
      assert.deepEqual(normalizeSets(maximumExplanations.map((item) => item.nodeIds)), [expected]);
      const explanation = maximumExplanations[0];
      const expectedSupportPairs = pairs.filter(([source, target]) =>
        expected.includes(source) && expected.includes(target)
      );
      assert.deepEqual(explanation.supportPairs, expectedSupportPairs, `support pairs, grafo=${graphMask}, k=${k}`);
      const degreeByNode = new Map(expected.map((nodeId) => [nodeId, 0]));
      for (const [source, target] of explanation.supportPairs) {
        degreeByNode.set(source, (degreeByNode.get(source) ?? 0) + 1);
        degreeByNode.set(target, (degreeByNode.get(target) ?? 0) + 1);
      }
      assert.ok([...degreeByNode.values()].every((degree) => degree >= k), `degree certificate, grafo=${graphMask}, k=${k}`);

      const explainedResult = await runner.run(
        `${facts.trim()}\n\n${buildKCoreProgram(
          k,
          "",
          true,
          "undirected",
          undefined,
          computeKCorePeelingRoundCount(nodeIds, pairs.map(([source, target]) => ({ source, target })), k)
        )}\n`,
        getStructuralSolverOptions("kCore")
      );
      assert.equal(explainedResult.Result, "OPTIMUM FOUND", `peeling ASP grafo=${graphMask}, k=${k}`);
      const peeledCertificate = parseWitnessKCoreExplanations(
        explainedResult.Call?.[0]?.Witnesses,
        reverseIndex
      ).find((item) => item.nodeIds.length === expected.length);
      const expectedPeeling = computeKCorePeelingRounds(nodeIds, pairs, k);
      assert.deepEqual(normalizeSets([peeledCertificate?.nodeIds ?? []]), [expected], `peeling core grafo=${graphMask}, k=${k}`);
      assert.deepEqual(peeledCertificate?.peeling, expectedPeeling.peeling, `peeling rounds grafo=${graphMask}, k=${k}`);
      const iterativePeeling = await runKCorePeelingRoundQueries({
        runner,
        graph,
        reverseIndex,
        candidateNodeIds: nodeIds,
        k
      });
      assert.deepEqual(iterativePeeling.coreNodeIds, expectedPeeling.coreNodeIds,
        `core round ASP grafo=${graphMask}, k=${k}`);
      assert.deepEqual(iterativePeeling.peeling, expectedPeeling.peeling,
        `peeling round ASP grafo=${graphMask}, k=${k}`);
    }
  }
});

test("la testimonianza del k-core conta vicini distinti ma conserva ogni record parallelo per highlight", async () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [
      { id: "ab-1", source: "a", target: "b" },
      { id: "ab-2", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
      { source: "c", target: "a" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  });
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const result = await (await getRunner()).run(
    `${facts.trim()}\n\n${buildKCoreProgram(2)}\n`,
    optimizationOptions
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  const explanation = parseWitnessKCoreExplanations(result.Call?.[0]?.Witnesses, reverseIndex)
    .find((item) => item.nodeIds.length === 3);
  assert.ok(explanation);
  assert.deepEqual(normalizeSets([explanation.nodeIds]), [["a", "b", "c"]]);
  assert.equal(explanation.supportPairs.length, 3, "gli due record a-b valgono un solo vicino per il grado");
  const mappedSupports = mapKCoreSupportPairsToRecords(explanation.supportPairs, graph.links);
  const parallelPair = mappedSupports.find((pair) => pair.sourceNodeId === "a" && pair.targetNodeId === "b");
  assert.deepEqual(
    parallelPair?.supportingRecords.map((record) => record.edgeId).sort(),
    ["ab-1", "ab-2"]
  );
  const generatedPair = mappedSupports.find((pair) => pair.sourceNodeId === "a" && pair.targetNodeId === "c");
  assert.equal(generatedPair?.supportingRecords.length, 1);
  assert.equal(generatedPair?.supportingRecords[0]?.edgeIdGenerated, true);
  assert.ok(mappedSupports.every((pair) => pair.supportingRecords.length > 0));

  const peelingResult = await (await getRunner()).run(
    `${facts.trim()}\n\n${buildKCoreProgram(3, "", true)}\n`,
    getStructuralSolverOptions("kCore")
  );
  assert.equal(peelingResult.Result, "OPTIMUM FOUND");
  const peelingExplanation = parseWitnessKCoreExplanations(peelingResult.Call?.[0]?.Witnesses, reverseIndex)
    .find((item) => item.nodeIds.length === 0);
  assert.ok(peelingExplanation);
  assert.deepEqual(peelingExplanation.peeling.map((step) => step.nodeId).sort(), ["a", "b", "c"]);
  assert.ok(peelingExplanation.peeling.every((step) => step.round === 1 && step.survivingNeighborIds.length === 2));
  const mappedPeeling = mapKCorePeelingStepsToRecords(peelingExplanation.peeling, graph.links);
  const aPeeling = mappedPeeling.find((step) => step.nodeId === "a");
  const aToB = aPeeling?.supportingPairs.find((pair) => pair.sourceNodeId === "a" && pair.targetNodeId === "b");
  assert.deepEqual(aToB?.supportingRecords.map((record) => record.edgeId).sort(), ["ab-1", "ab-2"]);
});

test("i parametri strutturali rifiutano valori non interi o fuori dominio", () => {
  assert.throws(() => buildMaximumKPlexProgram(0), RangeError);
  assert.throws(() => buildMaximumKPlexProgram(1.5), RangeError);
  assert.throws(() => buildKCoreProgram(-1), RangeError);
  assert.throws(() => buildKCoreProgram(2.5), RangeError);
  assert.throws(() => buildMinimumHopPathProgram(1, 2, 101), RangeError);
});

test("il timeout delle query di fattibilità k-plex ha stato TIMEOUT senza mascherare altri errori", () => {
  assert.deepEqual(
    normalizeKPlexTimeoutResult({ Result: "ERROR", Error: "Tempo massimo superato (1000 ms)" }),
    { Result: "TIMEOUT", Error: "Tempo massimo superato (1000 ms)" }
  );
  assert.deepEqual(
    normalizeKPlexTimeoutResult({ Result: "ERROR", Error: "clingo worker failure" }),
    { Result: "ERROR", Error: "clingo worker failure" }
  );
  assert.deepEqual(normalizeKPlexTimeoutResult({ Result: "UNSATISFIABLE" }), { Result: "UNSATISFIABLE" });
});

test("i task strutturali usano le opzioni solver appropriate", () => {
  assert.deepEqual(getStructuralSolverOptions("kPlex"), ["--opt-mode=opt"]);
  assert.deepEqual(getStructuralSolverOptions("kPlex", true), ["--opt-mode=optN"]);
  assert.deepEqual(getStructuralSolverOptions("kCore", true), ["--opt-mode=opt"]);
  assert.deepEqual(getStructuralSolverOptions("communities"), ["--opt-mode=opt"]);
  assert.deepEqual(getStructuralSolverOptions("communities", true), ["--opt-mode=optN"]);
  assert.deepEqual(getStructuralSolverOptions("dominatingSet"), ["--opt-mode=opt", "--opt-strategy=usc"]);
  assert.deepEqual(getStructuralSolverOptions("dominatingSet", true), ["--opt-mode=optN", "--opt-strategy=usc"]);
  assert.deepEqual(getStructuralSolverOptions("minimumEdgeSeparator"), ["--opt-mode=opt"]);
  assert.deepEqual(getStructuralSolverOptions("minimumEdgeSeparator", true), ["--opt-mode=optN"]);
  assert.deepEqual(getStructuralSolverOptions("minimumCostNodeSeparator"), ["--opt-mode=opt"]);
  assert.deepEqual(getStructuralSolverOptions("minimumCostNodeSeparator", true), ["--opt-mode=optN"]);
  assert.deepEqual(getStructuralSolverOptions("minimumCostEdgeSeparator"), ["--opt-mode=opt"]);
  assert.deepEqual(getStructuralSolverOptions("minimumCostEdgeSeparator", true), ["--opt-mode=optN"]);
  assert.deepEqual(getStructuralSolverOptions("components"), []);
  assert.deepEqual(getStructuralSolverOptions("weakComponents"), []);
  assert.deepEqual(getStructuralSolverOptions("strongComponents"), []);
  assert.deepEqual(getStructuralSolverOptions("path"), []);
});
