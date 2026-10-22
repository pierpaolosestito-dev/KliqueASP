import { performance } from "node:perf_hooks";
import psychologyDataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import psychologyConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import karateDataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import karateConfig from "../src/lib/kliqueasp/data/examples/karate-club.config.json" with { type: "json" };
import { normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { adjustedRandIndex, findLouvainModularityBaseline } from "./modularityLouvainBaseline.mjs";
import { findGraphologyLouvainBaseline } from "./modularityGraphologyBaseline.mjs";
import {
  buildModularityRestartSeedSchedule,
  createModularitySeedSequence,
  summarizeModularitySeedStability
} from "./modularitySeedStability.mjs";
import { scorePartition } from "./modularityGreedyIncumbent.mjs";

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

function parsePositiveInteger(args, name, fallback, maximum) {
  const argument = args.find((value) => value.startsWith(`--${name}=`));
  if (argument === undefined) return fallback;
  const value = Number(argument.slice(argument.indexOf("=") + 1));
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

function formatResolution({ numerator, denominator }) {
  return denominator === 1 ? String(numerator) : `${numerator}/${denominator}`;
}

function summarizeAgreement(nodeIds, leftRuns, rightRuns) {
  const scores = leftRuns.map((left, index) =>
    adjustedRandIndex(nodeIds, left.communities, rightRuns[index].communities));
  return {
    pairedMasterSeeds: scores.length,
    meanAdjustedRandIndex: Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(6)),
    minimumAdjustedRandIndex: Number(Math.min(...scores).toFixed(6)),
    maximumAdjustedRandIndex: Number(Math.max(...scores).toFixed(6)),
    interpretation: "paired partition agreement only; modularity values at different resolutions are different objectives"
  };
}

const args = process.argv.slice(2);
const datasetKey = args.find((argument) => !argument.startsWith("--")) ?? "all";
const replicates = parsePositiveInteger(args, "replicates", 12, 100);
const restarts = parsePositiveInteger(args, "restarts", 16, 1000);
const baseSeedArgument = args.find((argument) => argument.startsWith("--base-seed="));
const baseSeed = baseSeedArgument === undefined ? 20261022 : Number(baseSeedArgument.slice("--base-seed=".length));
if (!Number.isSafeInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xffff_ffff) {
  throw new RangeError("base-seed must be an unsigned 32-bit integer");
}
const unknownArguments = args.filter((argument) =>
  argument.startsWith("--") &&
  !["--replicates", "--restarts", "--base-seed"].some((name) => argument.startsWith(`${name}=`))
);
if (unknownArguments.length > 0) throw new Error(`Unknown option: ${unknownArguments[0]}`);
const selected = datasetKey === "all" ? datasets : datasets.filter((item) => item.key === datasetKey);
if (selected.length === 0) throw new Error(`Unknown dataset: ${datasetKey}; use psychology, davis, karate, or all`);
const seeds = createModularitySeedSequence(replicates, baseSeed, restarts);
const restartSeedSchedule = buildModularityRestartSeedSchedule(seeds, restarts);

function runAlgorithm(graph, algorithm, seed, resolution) {
  const nodeIds = graph.nodes.map((node) => node.id);
  const startedAt = performance.now();
  const result = algorithm.run(nodeIds, graph.links, { restarts, seed, resolution });
  const elapsedWallMs = performance.now() - startedAt;
  const independentlyScored = scorePartition(nodeIds, graph.links, result.communities, resolution);
  if (independentlyScored !== result.scaledScore) {
    throw new Error(`${algorithm.name} γ=${formatResolution(resolution)}: independent score mismatch`);
  }
  if (result.resolution?.numerator !== resolution.numerator ||
    result.resolution?.denominator !== resolution.denominator) {
    throw new Error(`${algorithm.name}: baseline did not preserve the exact rational resolution`);
  }
  return {
    seed,
    scaledScore: result.scaledScore,
    modularity: result.scaledScore / (4 * graph.links.length ** 2 * resolution.denominator),
    communities: result.communities,
    elapsedWallMs
  };
}

function runDataset(item) {
  const graph = normalizeGraphData(item.dataset, item.config);
  if (!graph.valid || graph.direction !== "undirected" || graph.links.length === 0) {
    throw new Error(`${item.name}: seed-resolution benchmark requires a valid undirected graph with edges`);
  }
  const nodeIds = graph.nodes.map((node) => node.id);
  const algorithms = [
    { name: "local Louvain", run: findLouvainModularityBaseline },
    { name: "Graphology Louvain", run: findGraphologyLouvainBaseline }
  ];
  const results = algorithms.map((algorithm) => {
    const runsByResolution = resolutions.map((resolution) => seeds.map((seed) =>
      runAlgorithm(graph, algorithm, seed, resolution)));
    const byResolution = resolutions.map((resolution, index) => {
      const runs = runsByResolution[index];
      const summary = summarizeModularitySeedStability(nodeIds, runs, adjustedRandIndex);
      return {
        gamma: formatResolution(resolution),
        resolution,
        runs: runs.map(({ seed, scaledScore, modularity, communities, elapsedWallMs }) => ({
          seed,
          scaledScore,
          modularity: Number(modularity.toFixed(9)),
          communityCount: communities.length,
          elapsedWallMs: Number(elapsedWallMs.toFixed(2))
        })),
        summary: {
          ...summary,
          modularityRange: Object.fromEntries(Object.entries(summary.scoreRange).map(([key, score]) =>
            [key, Number((score / (4 * graph.links.length ** 2 * resolution.denominator)).toFixed(9))]
          )),
          runtimeMsRange: Object.fromEntries(Object.entries(summary.runtimeMsRange).map(([key, value]) =>
            [key, Number(value.toFixed(2))]
          )),
          selectedPartitionStability: Object.fromEntries(
            Object.entries(summary.selectedPartitionStability).map(([key, value]) =>
              [key, typeof value === "number" ? Number(value.toFixed(6)) : value])
          )
        },
        optimalityProven: false
      };
    });

    const crossResolutionAgreement = [];
    for (let left = 0; left < resolutions.length; left += 1) {
      for (let right = left + 1; right < resolutions.length; right += 1) {
        crossResolutionAgreement.push({
          leftGamma: formatResolution(resolutions[left]),
          rightGamma: formatResolution(resolutions[right]),
          pairedAgreement: summarizeAgreement(nodeIds, runsByResolution[left], runsByResolution[right])
        });
      }
    }
    return {
      algorithm: algorithm.name,
      implementation: algorithm.name === "Graphology Louvain" ? "graphology-communities-louvain@2.0.2" : "local exact-rational Louvain implementation",
      restartsPerMasterSeed: restarts,
      byResolution,
      crossResolutionAgreement,
      optimalityProven: false
    };
  });
  return {
    dataset: item.name,
    nodes: graph.nodes.length,
    undirectedEdgeRecords: graph.links.length,
    results
  };
}

console.log(JSON.stringify({
  purpose: "paired empirical sensitivity to master seed and modularity resolution",
  baseSeed,
  seeds,
  replicates,
  restartsPerMasterSeed: restarts,
  distinctInternalRestartSeedsPerResolution: new Set(restartSeedSchedule.flat()).size,
  resolutions: resolutions.map((resolution) => ({
    rational: formatResolution(resolution),
    numerator: resolution.numerator,
    denominator: resolution.denominator
  })),
  pairing: "the same master seeds and internal restart streams are reused across gamma values; streams are disjoint between master-seed replicates",
  independentScoreCheck: "each selected partition is rescored with KliqueASP's exact integer modularity scorer at the same rational resolution",
  interpretation: "ARI compares paired heuristic partitions; Q is summarized only within each gamma because each resolution defines a different objective",
  optimalityProven: false,
  datasets: selected.map(runDataset)
}, null, 2));
