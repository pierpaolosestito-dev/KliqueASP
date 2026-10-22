import { performance } from "node:perf_hooks";
import psychologyDataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import psychologyConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import karateDataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import karateConfig from "../src/lib/kliqueasp/data/examples/karate-club.config.json" with { type: "json" };
import { normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildGreedyModularityIncumbent, scorePartition } from "./modularityGreedyIncumbent.mjs";
import { adjustedRandIndex, findLouvainModularityBaseline } from "./modularityLouvainBaseline.mjs";
import { findGraphologyLouvainBaseline } from "./modularityGraphologyBaseline.mjs";

const datasets = [
  { key: "psychology", name: "Psychology History Graph", dataset: psychologyDataset, config: psychologyConfig },
  { key: "davis", name: "Davis Southern Women", dataset: davisDataset, config: {} },
  { key: "karate", name: "Zachary Karate Club (topology only)", dataset: karateDataset, config: karateConfig }
];
const restarts = 32;
const seed = 20261022;

function summarize(graph, algorithm, result, elapsedWallMs) {
  const nodeIds = graph.nodes.map((node) => node.id);
  const nodeOrder = new Map(nodeIds.map((nodeId, index) => [nodeId, index]));
  const independentlyScored = scorePartition(nodeIds, graph.links, result.communities);
  const expectedModularity = independentlyScored / (4 * graph.links.length ** 2);
  const scoreMatches = independentlyScored === result.scaledScore;
  if (!scoreMatches) throw new Error(`${algorithm}: witness score differs from the independent formula`);

  const partitionKeys = result.restartCommunities?.map((communities) => communities
    .map((community) => community.map((nodeId) => nodeOrder.get(nodeId))
      .sort((left, right) => left - right)
      .join(","))
    .sort()
    .join("|")) ?? [];
  const ariScores = [];
  for (let left = 0; left < (result.restartCommunities?.length ?? 0); left += 1) {
    for (let right = left + 1; right < result.restartCommunities.length; right += 1) {
      ariScores.push(adjustedRandIndex(nodeIds, result.restartCommunities[left], result.restartCommunities[right]));
    }
  }
  const sortedAriScores = [...ariScores].sort((left, right) => left - right);
  const meanAri = ariScores.length > 0
    ? ariScores.reduce((sum, score) => sum + score, 0) / ariScores.length
    : null;
  const medianAri = sortedAriScores.length > 0
    ? (sortedAriScores[Math.floor((sortedAriScores.length - 1) / 2)] +
      sortedAriScores[Math.ceil((sortedAriScores.length - 1) / 2)]) / 2
    : null;

  return {
    algorithm,
    scaledScore: result.scaledScore,
    modularity: Number(expectedModularity.toFixed(9)),
    communityCount: result.communities.length,
    communitySizes: result.communities.map((community) => community.length),
    elapsedWallMs: Number(elapsedWallMs.toFixed(2)),
    independentlyScored: scoreMatches,
    optimalityProven: false,
    ...(result.restartScores ? {
      restarts: result.restarts,
      scoreRangeAcrossRestarts: [Math.min(...result.restartScores), Math.max(...result.restartScores)],
      distinctRestartScores: new Set(result.restartScores).size,
      distinctPartitions: new Set(partitionKeys).size,
      partitionStability: {
        metric: "Adjusted Rand Index across restart pairs",
        pairwiseComparisons: ariScores.length,
        mean: meanAri === null ? null : Number(meanAri.toFixed(6)),
        median: medianAri === null ? null : Number(medianAri.toFixed(6)),
        minimum: sortedAriScores.length === 0 ? null : Number(sortedAriScores[0].toFixed(6)),
        maximum: sortedAriScores.length === 0 ? null : Number(sortedAriScores.at(-1).toFixed(6)),
        interpretation: "heuristic seed sensitivity; restart scores are not independent samples"
      },
      selectedRestart: result.chosenRestart,
      levels: result.levels,
      moves: result.moves,
      ...(result.implementation ? {
        implementation: result.implementation,
        libraryModularityMatched: Math.abs(result.modularity - result.reportedModularity) < 1e-9
      } : {})
    } : {
      starts: result.starts,
      moves: result.moves,
      passes: result.passes
    })
  };
}

function runDataset(item) {
  const graph = normalizeGraphData(item.dataset, item.config);
  if (!graph.valid || graph.direction !== "undirected" || graph.links.length === 0) {
    throw new Error(`${item.name}: benchmark requires a valid undirected graph with edges`);
  }
  const nodeIds = graph.nodes.map((node) => node.id);
  const greedyStartedAt = performance.now();
  const greedy = buildGreedyModularityIncumbent(nodeIds, graph.links);
  const greedyResult = summarize(graph, "multi-start local greedy", greedy, performance.now() - greedyStartedAt);
  const louvainStartedAt = performance.now();
  const louvain = findLouvainModularityBaseline(nodeIds, graph.links, { restarts, seed });
  const louvainResult = summarize(graph, "Louvain multi-start", louvain, performance.now() - louvainStartedAt);
  const graphologyStartedAt = performance.now();
  const graphology = findGraphologyLouvainBaseline(nodeIds, graph.links, { restarts, seed });
  const graphologyResult = summarize(graph, "Graphology Louvain multi-start", graphology, performance.now() - graphologyStartedAt);
  const scaledDifference = louvain.scaledScore - greedy.scaledScore;
  const graphologyGreedyDifference = graphology.scaledScore - greedy.scaledScore;
  const graphologyLouvainDifference = graphology.scaledScore - louvain.scaledScore;

  return {
    dataset: item.name,
    nodes: graph.nodes.length,
    undirectedEdgeRecords: graph.links.length,
    comparison: {
      scoreDifferenceScaled: scaledDifference,
      modularityDifference: Number((scaledDifference / (4 * graph.links.length ** 2)).toFixed(9)),
      louvainScoreAtLeastLocalGreedy: scaledDifference >= 0,
      graphologyDifferenceFromLocalGreedyScaled: graphologyGreedyDifference,
      graphologyDifferenceFromLocalLouvainScaled: graphologyLouvainDifference,
      graphologyScoreAtLeastLocalGreedy: graphologyGreedyDifference >= 0
    },
    results: [greedyResult, louvainResult, graphologyResult]
  };
}

const requested = process.argv[2] ?? "all";
const selected = requested === "all" ? datasets : datasets.filter((item) => item.key === requested);
if (selected.length === 0) {
  throw new Error(`Unknown dataset: ${requested}; use psychology, davis, karate, or all`);
}

console.log(JSON.stringify({
  baseline: "local and Graphology implementations of the Louvain multilevel local modularity heuristic",
  reference: "https://doi.org/10.1088/1742-5468/2008/10/P10008",
  purpose: "heuristic comparison only; results are not optimality proofs",
  modularity: "unweighted Newman-Girvan, gamma=1; parallel records and self-loops follow KliqueASP semantics",
  louvainRestarts: restarts,
  seed,
  datasets: selected.map(runDataset)
}, null, 2));
