import { performance } from "node:perf_hooks";
import psychologyDataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import psychologyConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import karateDataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import karateConfig from "../src/lib/kliqueasp/data/examples/karate-club.config.json" with { type: "json" };
import { normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { adjustedRandIndex } from "./modularityLouvainBaseline.mjs";
import { findGraphologyLouvainBaseline } from "./modularityGraphologyBaseline.mjs";

const datasets = [
  { key: "psychology", name: "Psychology History Graph", dataset: psychologyDataset, config: psychologyConfig },
  { key: "davis", name: "Davis Southern Women", dataset: davisDataset, config: {} },
  { key: "karate", name: "Zachary Karate Club (topology only)", dataset: karateDataset, config: karateConfig }
];
const resolutions = [
  { numerator: 1, denominator: 2 },
  { numerator: 1, denominator: 1 },
  { numerator: 3, denominator: 2 },
  { numerator: 2, denominator: 1 }
];
const restarts = 32;
const seed = 20261022;

function formatResolution({ numerator, denominator }) {
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
}

function independentScore(nodeIds, edges, communities, resolution) {
  const nodeSet = new Set(nodeIds);
  const assigned = communities.flat();
  if (assigned.length !== nodeIds.length || new Set(assigned).size !== nodeIds.length ||
    assigned.some((nodeId) => !nodeSet.has(nodeId))) {
    throw new Error("Graphology returned a partition that does not cover each node exactly once");
  }

  const degree = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
  for (const edge of edges) {
    if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) {
      throw new Error("benchmark edge has an endpoint outside nodeIds");
    }
    degree.set(edge.source, degree.get(edge.source) + 1);
    degree.set(edge.target, degree.get(edge.target) + 1);
  }

  let score = 0;
  const contributions = communities.map((community) => {
    const members = new Set(community);
    const internal = edges.reduce((count, edge) =>
      count + (members.has(edge.source) && members.has(edge.target) ? 1 : 0), 0);
    const volume = community.reduce((sum, nodeId) => sum + degree.get(nodeId), 0);
    return 4 * edges.length * resolution.denominator * internal -
      resolution.numerator * volume ** 2;
  });
  score = contributions.reduce((sum, contribution) => sum + contribution, 0);
  if (!Number.isSafeInteger(score)) throw new RangeError("independent modularity score exceeds the safe integer range");
  return score;
}

function summarizeStability(nodeIds, partitions) {
  const keys = partitions.map((communities) => communities
    .map((community) => community.map((nodeId) => nodeIds.indexOf(nodeId)).sort((a, b) => a - b).join(","))
    .sort()
    .join("|"));
  const similarities = [];
  for (let left = 0; left < partitions.length; left += 1) {
    for (let right = left + 1; right < partitions.length; right += 1) {
      similarities.push(adjustedRandIndex(nodeIds, partitions[left], partitions[right]));
    }
  }
  return {
    distinctPartitions: new Set(keys).size,
    pairwiseComparisons: similarities.length,
    meanAdjustedRandIndex: Number((similarities.reduce((sum, value) => sum + value, 0) / similarities.length).toFixed(6)),
    minimumAdjustedRandIndex: Number(Math.min(...similarities).toFixed(6)),
    maximumAdjustedRandIndex: Number(Math.max(...similarities).toFixed(6))
  };
}

function runDataset(item) {
  const graph = normalizeGraphData(item.dataset, item.config);
  if (!graph.valid || graph.direction !== "undirected" || graph.links.length === 0) {
    throw new Error(`${item.name}: sweep requires a valid undirected graph with edges`);
  }
  const nodeIds = graph.nodes.map((node) => node.id);
  const byResolution = resolutions.map((resolution) => {
    const startedAt = performance.now();
    const result = findGraphologyLouvainBaseline(nodeIds, graph.links, { restarts, seed, resolution });
    const elapsedWallMs = performance.now() - startedAt;
    const scaledScore = independentScore(nodeIds, graph.links, result.communities, resolution);
    if (scaledScore !== result.scaledScore) {
      throw new Error(`${item.name} γ=${formatResolution(resolution)}: independent score mismatch`);
    }
    const modularity = scaledScore / (4 * graph.links.length ** 2 * resolution.denominator);
    if (Math.abs(modularity - result.modularity) > 1e-12 ||
      Math.abs(modularity - result.reportedModularity) > 1e-9) {
      throw new Error(`${item.name} γ=${formatResolution(resolution)}: independent modularity mismatch`);
    }
    return {
      resolution,
      resolutionLabel: formatResolution(resolution),
      scaledScore,
      modularity: Number(modularity.toFixed(9)),
      communityCount: result.communities.length,
      communitySizes: result.communities.map((community) => community.length),
      elapsedWallMs: Number(elapsedWallMs.toFixed(2)),
      restarts,
      scoreRangeAcrossRestarts: [Math.min(...result.restartScores), Math.max(...result.restartScores)],
      ...summarizeStability(nodeIds, result.restartCommunities),
      communities: result.communities
    };
  });

  const crossResolutionAgreement = [];
  for (let left = 0; left < byResolution.length; left += 1) {
    for (let right = left + 1; right < byResolution.length; right += 1) {
      crossResolutionAgreement.push({
        left: byResolution[left].resolutionLabel,
        right: byResolution[right].resolutionLabel,
        adjustedRandIndex: Number(adjustedRandIndex(
          nodeIds,
          byResolution[left].communities,
          byResolution[right].communities
        ).toFixed(6))
      });
    }
  }

  return {
    dataset: item.name,
    nodes: graph.nodes.length,
    undirectedEdgeRecords: graph.links.length,
    results: byResolution.map(({ communities: _communities, ...result }) => result),
    crossResolutionAgreement
  };
}

const requested = process.argv[2] ?? "all";
const selected = requested === "all" ? datasets : datasets.filter((item) => item.key === requested);
if (selected.length === 0) throw new Error(`Unknown dataset: ${requested}; use psychology, davis, karate, or all`);

console.log(JSON.stringify({
  baseline: "graphology-communities-louvain@2.0.2",
  seed,
  restarts,
  resolutions: resolutions.map((resolution) => ({
    rational: formatResolution(resolution),
    decimal: resolution.numerator / resolution.denominator
  })),
  interpretation: "each gamma defines a different objective; compare its Q only within that gamma; ARI records partition changes",
  optimalityProven: false,
  datasets: selected.map(runDataset)
}, null, 2));
