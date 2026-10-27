import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommunityPairMembershipPrograms,
  buildMaximumModularityProgram,
  buildModularityFacts,
  getStructuralSolverOptions,
  parseWitnessModularityPartitions,
  selectMaximumModularityPartitions
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { classifyCommunityPairOptimumMembership } from "../src/lib/kliqueasp/graph/communityOptimumStability.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

function enumeratePartitions(nodeCount) {
  const labels = Array(nodeCount).fill(0);
  const partitions = [];

  function visit(index, maximumLabel) {
    if (index === nodeCount) {
      const communities = new Map();
      labels.forEach((label, node) => {
        const community = communities.get(label) ?? [];
        community.push(node + 1);
        communities.set(label, community);
      });
      partitions.push([...communities.values()]);
      return;
    }
    for (let label = 0; label <= maximumLabel + 1; label += 1) {
      labels[index] = label;
      visit(index + 1, Math.max(maximumLabel, label));
    }
  }

  visit(1, 0);
  return partitions;
}

function scorePartition(partition, edges, nodeCount, resolutionNumerator = 1, resolutionDenominator = 1) {
  const totalWeight = edges.reduce((sum, edge) => sum + (edge[2] ?? 1), 0);
  const degree = Array(nodeCount + 1).fill(0);
  for (const [source, target, weight = 1] of edges) {
    degree[source] += weight;
    degree[target] += weight;
  }
  return partition.reduce((sum, community) => {
    const members = new Set(community);
    const internalWeight = edges.reduce((weightSum, [source, target, weight = 1]) =>
      members.has(source) && members.has(target) ? weightSum + weight : weightSum, 0);
    const volume = community.reduce((value, node) => value + degree[node], 0);
    return sum + 4 * totalWeight * resolutionDenominator * internalWeight - resolutionNumerator * volume * volume;
  }, 0);
}

function satisfiesCommunityConstraints(partition, { mustLinkPairs = [], cannotLinkPairs = [], minCount, maxCount }) {
  const communityByNode = new Map(partition.flatMap((community) => community.map((node) => [node, community])));
  return partition.length >= (minCount ?? 0) && partition.length <= (maxCount ?? Infinity) &&
    mustLinkPairs.every(([left, right]) => communityByNode.get(left) === communityByNode.get(right)) &&
    cannotLinkPairs.every(([left, right]) => communityByNode.get(left) !== communityByNode.get(right));
}

function getMaximumScore(partitions, score) {
  return partitions.length === 0 ? null : Math.max(...partitions.map(score));
}

test("le query ASP di co-appartenenza distinguono sempre, talvolta e mai sugli ottimi esatti", async () => {
  const nodeIds = ["1", "2", "3", "4"];
  const possibleEdges = [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
  const allPartitions = enumeratePartitions(nodeIds.length);
  const runner = await createClingoWasmRunner();
  const reverseIndex = Object.fromEntries(nodeIds.map((nodeId, index) => [index + 1, nodeId]));

  for (let graphMask = 1; graphMask < 2 ** possibleEdges.length; graphMask += 1) {
    const edges = possibleEdges.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const modularityFacts = buildModularityFacts(
      [1, 2, 3, 4],
      edges.map(([source, target]) => ({ source, target })),
      { includePairwiseObjective: true }
    );
    const baseOptions = {
      separateDisconnectedComponents: modularityFacts.connectedComponentCount > 1,
      ...(modularityFacts.pairwiseObjectiveOffset !== undefined
        ? { pairwiseObjectiveOffset: modularityFacts.pairwiseObjectiveOffset }
        : {})
    };
    const modularityInput = [
      modularityFacts.facts,
      modularityFacts.connectedComponentFacts,
      modularityFacts.pairwiseObjectiveFacts
    ].filter(Boolean).join("\n");
    const baseResult = await runner.run(
      `${modularityInput}\n\n${buildMaximumModularityProgram(baseOptions)}\n`,
      getStructuralSolverOptions("communities")
    );
    assert.equal(baseResult.Result, "OPTIMUM FOUND", `ottimo globale grafo=${graphMask}`);
    const basePartitions = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(baseResult.Call?.[0]?.Witnesses, reverseIndex)
    );
    assert.ok(basePartitions.length > 0, `punteggio globale grafo=${graphMask}`);
    const globalScore = basePartitions[0].scaledScore;

    const expectedGlobalScore = getMaximumScore(allPartitions, (partition) => scorePartition(partition, edges, nodeIds.length));
    assert.equal(globalScore, expectedGlobalScore, `punteggio indipendente grafo=${graphMask}`);

    for (const [leftIndex, left] of nodeIds.entries()) {
      for (const right of nodeIds.slice(leftIndex + 1)) {
        const leftNode = Number(left);
        const rightNode = Number(right);
        const togetherExpected = getMaximumScore(
          allPartitions.filter((partition) => partition.some((community) => community.includes(leftNode) && community.includes(rightNode))),
          (partition) => scorePartition(partition, edges, nodeIds.length)
        );
        const separateExpected = getMaximumScore(
          allPartitions.filter((partition) => !partition.some((community) => community.includes(leftNode) && community.includes(rightNode))),
          (partition) => scorePartition(partition, edges, nodeIds.length)
        );
        const programs = buildCommunityPairMembershipPrograms(baseOptions, [leftNode, rightNode]);
        const togetherResult = await runner.run(
          `${modularityInput}\n\n${programs.together}\n`,
          getStructuralSolverOptions("communities")
        );
        const separateResult = await runner.run(
          `${modularityInput}\n\n${programs.separate}\n`,
          getStructuralSolverOptions("communities")
        );
        const togetherPartitions = togetherResult.Result === "UNSATISFIABLE"
          ? []
          : selectMaximumModularityPartitions(
            parseWitnessModularityPartitions(togetherResult.Call?.[0]?.Witnesses, reverseIndex)
          );
        const separatePartitions = separateResult.Result === "UNSATISFIABLE"
          ? []
          : selectMaximumModularityPartitions(
            parseWitnessModularityPartitions(separateResult.Call?.[0]?.Witnesses, reverseIndex)
          );
        assert.ok(togetherResult.Result === "UNSATISFIABLE" || togetherResult.Result === "OPTIMUM FOUND",
          `stato must-link grafo=${graphMask}, coppia=${left}-${right}`);
        assert.ok(separateResult.Result === "UNSATISFIABLE" || separateResult.Result === "OPTIMUM FOUND",
          `stato cannot-link grafo=${graphMask}, coppia=${left}-${right}`);
        assert.equal(togetherPartitions[0]?.scaledScore ?? null, togetherExpected,
          `ottimo must-link grafo=${graphMask}, coppia=${left}-${right}`);
        assert.equal(separatePartitions[0]?.scaledScore ?? null, separateExpected,
          `ottimo cannot-link grafo=${graphMask}, coppia=${left}-${right}`);
        assert.ok(togetherPartitions[0].communities.some((community) =>
          community.includes(left) && community.includes(right)
        ), `witness must-link grafo=${graphMask}, coppia=${left}-${right}`);
        assert.ok(!separatePartitions[0].communities.some((community) =>
          community.includes(left) && community.includes(right)
        ), `witness cannot-link grafo=${graphMask}, coppia=${left}-${right}`);

        const expectedRelation = togetherExpected === globalScore
          ? separateExpected === globalScore ? "sometimes" : "always"
          : "never";
        assert.deepEqual(classifyCommunityPairOptimumMembership(
          [left, right],
          globalScore,
          togetherPartitions[0]?.scaledScore ?? null,
          separatePartitions[0]?.scaledScore ?? null
        ), {
          nodeIds: [left, right],
          relation: expectedRelation,
          globalScaledScore: globalScore,
          togetherScaledScore: togetherExpected,
          separateScaledScore: separateExpected
        }, `classificazione grafo=${graphMask}, coppia=${left}-${right}`);
      }
    }
  }
});

test("le query preservano pesi, risoluzione e vincoli della comunità nel confronto esatto", async () => {
  const edges = [[1, 2, 2], [2, 3, 1], [3, 4, 3]];
  const constraints = {
    mustLinkPairs: [[1, 3]],
    cannotLinkPairs: [[2, 4]],
    minCount: 2,
    maxCount: 3
  };
  const modularityFacts = buildModularityFacts(
    [1, 2, 3, 4],
    edges.map(([source, target, weight]) => ({ source, target, weight })),
    { weighted: true, resolution: "1.5", includePairwiseObjective: true }
  );
  const options = {
    ...constraints,
    weighted: true,
    includeContributions: true,
    ...(modularityFacts.pairwiseObjectiveOffset !== undefined
      ? { pairwiseObjectiveOffset: modularityFacts.pairwiseObjectiveOffset }
      : {})
  };
  const modularityInput = [
    modularityFacts.facts,
    modularityFacts.connectedComponentFacts,
    modularityFacts.pairwiseObjectiveFacts
  ].filter(Boolean).join("\n");
  const reverseIndex = { 1: "1", 2: "2", 3: "3", 4: "4" };
  const runner = await createClingoWasmRunner();
  const baseResult = await runner.run(
    `${modularityInput}\n\n${buildMaximumModularityProgram(options)}\n`,
    getStructuralSolverOptions("communities")
  );
  assert.equal(baseResult.Result, "OPTIMUM FOUND");
  const baseOptima = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(baseResult.Call?.[0]?.Witnesses, reverseIndex)
  );
  const globalScore = baseOptima[0].scaledScore;
  const eligiblePartitions = enumeratePartitions(4)
    .filter((partition) => satisfiesCommunityConstraints(partition, constraints));
  const scoreWeightedPartition = (partition) => scorePartition(partition, edges, 4, 3, 2);
  assert.equal(globalScore, getMaximumScore(eligiblePartitions, scoreWeightedPartition));

  for (const pair of [[1, 3], [2, 4], [1, 4]]) {
    const [left, right] = pair;
    const togetherExpected = getMaximumScore(
      eligiblePartitions.filter((partition) => partition.some((community) => community.includes(left) && community.includes(right))),
      scoreWeightedPartition
    );
    const separateExpected = getMaximumScore(
      eligiblePartitions.filter((partition) => !partition.some((community) => community.includes(left) && community.includes(right))),
      scoreWeightedPartition
    );
    const programs = buildCommunityPairMembershipPrograms(options, pair);
    const togetherResult = await runner.run(`${modularityInput}\n\n${programs.together}\n`, getStructuralSolverOptions("communities"));
    const separateResult = await runner.run(`${modularityInput}\n\n${programs.separate}\n`, getStructuralSolverOptions("communities"));
    const togetherOptima = togetherResult.Result === "UNSATISFIABLE" ? [] : selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(togetherResult.Call?.[0]?.Witnesses, reverseIndex)
    );
    const separateOptima = separateResult.Result === "UNSATISFIABLE" ? [] : selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(separateResult.Call?.[0]?.Witnesses, reverseIndex)
    );
    assert.equal(togetherOptima[0]?.scaledScore ?? null, togetherExpected);
    assert.equal(separateOptima[0]?.scaledScore ?? null, separateExpected);
    if (togetherOptima[0]) {
      assert.ok(togetherOptima[0].communities.some((community) => community.includes(String(left)) && community.includes(String(right))));
    }
    if (separateOptima[0]) {
      assert.ok(!separateOptima[0].communities.some((community) => community.includes(String(left)) && community.includes(String(right))));
    }
    const expectedRelation = togetherExpected === globalScore
      ? separateExpected === globalScore ? "sometimes" : "always"
      : "never";
    assert.equal(classifyCommunityPairOptimumMembership(
      [String(left), String(right)],
      globalScore,
      togetherOptima[0]?.scaledScore ?? null,
      separateOptima[0]?.scaledScore ?? null
    ).relation, expectedRelation);
  }
});

test("le query di co-appartenenza normalizzano la coppia e mantengono gli altri vincoli semantici", () => {
  const programs = buildCommunityPairMembershipPrograms({
    weighted: true,
    separateDisconnectedComponents: true,
    minCount: 2,
    maxCount: 4,
    mustLinkPairs: [[1, 3]],
    cannotLinkPairs: [[1, 4]],
    includeContributions: true
  }, [4, 2]);

  assert.match(programs.together, /must_link\(2,4\)\./);
  assert.match(programs.together, /must_link\(1,3\)\./);
  assert.match(programs.together, /minimum_community_count\(2\)\./);
  assert.match(programs.together, /maximum_community_count\(4\)\./);
  assert.match(programs.together, /modularity_edge_weight/);
  assert.doesNotMatch(programs.together, /modularity_component/);
  assert.match(programs.separate, /cannot_link\(1,4\)\./);
  assert.match(programs.separate, /cannot_link\(2,4\)\./);
  assert.throws(() => buildCommunityPairMembershipPrograms({}, [1, 1]), /distinti/);
  assert.throws(() => buildCommunityPairMembershipPrograms({}, [0, 2]), /indici ASP positivi/);
  assert.throws(() => buildCommunityPairMembershipPrograms({ enforceConnectedPositiveVolumeCommunities: true }, [1, 2]), /non supportano/);
});

test("la classificazione rifiuta confronti che non possono appartenere a un optimum", () => {
  assert.equal(classifyCommunityPairOptimumMembership(["a", "b"], 10, 10, 8).relation, "always");
  assert.equal(classifyCommunityPairOptimumMembership(["a", "b"], 10, 10, 10).relation, "sometimes");
  assert.equal(classifyCommunityPairOptimumMembership(["a", "b"], 10, 8, 10).relation, "never");
  assert.throws(() => classifyCommunityPairOptimumMembership(["a", "b"], 10, 8, 7), /non concordano/);
  assert.throws(() => classifyCommunityPairOptimumMembership(["a", "b"], 10, 11, 10), /supera il punteggio/);
  assert.throws(() => classifyCommunityPairOptimumMembership(["a", "a"], 10, 10, 10), /distinti/);
});
