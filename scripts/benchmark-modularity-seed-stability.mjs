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

function parsePositiveInteger(argument, name, fallback, maximum) {
  if (argument === undefined) return fallback;
  const value = Number(argument.slice(argument.indexOf("=") + 1));
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

const args = process.argv.slice(2);
const datasetKey = args.find((argument) => !argument.startsWith("--")) ?? "all";
const replicates = parsePositiveInteger(args.find((argument) => argument.startsWith("--replicates=")), "replicates", 12, 100);
const restarts = parsePositiveInteger(args.find((argument) => argument.startsWith("--restarts=")), "restarts", 16, 1000);
const baseSeedArgument = args.find((argument) => argument.startsWith("--base-seed="));
const baseSeed = baseSeedArgument === undefined ? 20261022 : Number(baseSeedArgument.slice("--base-seed=".length));
if (!Number.isSafeInteger(baseSeed) || baseSeed < 0 || baseSeed > 0xffff_ffff) {
  throw new RangeError("base-seed must be an unsigned 32-bit integer");
}
const unknownArguments = args.filter((argument) =>
  argument.startsWith("--") && !["--replicates", "--restarts", "--base-seed"].some((name) => argument.startsWith(`${name}=`))
);
if (unknownArguments.length > 0) throw new Error(`Unknown option: ${unknownArguments[0]}`);

const selected = datasetKey === "all" ? datasets : datasets.filter((item) => item.key === datasetKey);
if (selected.length === 0) throw new Error(`Unknown dataset: ${datasetKey}; use psychology, davis, karate, or all`);
const seeds = createModularitySeedSequence(replicates, baseSeed, restarts);
const restartSeedSchedule = buildModularityRestartSeedSchedule(seeds, restarts);

function runAlgorithm(graph, algorithm, seed) {
  const nodeIds = graph.nodes.map((node) => node.id);
  const startedAt = performance.now();
  const result = algorithm.run(nodeIds, graph.links, { restarts, seed });
  const elapsedWallMs = performance.now() - startedAt;
  const independentlyScored = scorePartition(nodeIds, graph.links, result.communities);
  if (independentlyScored !== result.scaledScore) {
    throw new Error(`${algorithm.name}: result does not match independent modularity score`);
  }
  return {
    seed,
    scaledScore: result.scaledScore,
    modularity: result.scaledScore / (4 * graph.links.length ** 2),
    communities: result.communities,
    elapsedWallMs
  };
}

function runDataset(item) {
  const graph = normalizeGraphData(item.dataset, item.config);
  if (!graph.valid || graph.direction !== "undirected" || graph.links.length === 0) {
    throw new Error(`${item.name}: stability benchmark requires a valid undirected graph with edges`);
  }
  const nodeIds = graph.nodes.map((node) => node.id);
  const algorithms = [
    { name: "local Louvain", run: findLouvainModularityBaseline },
    { name: "Graphology Louvain", run: findGraphologyLouvainBaseline }
  ];
  const results = algorithms.map((algorithm) => {
    const runs = seeds.map((seed) => runAlgorithm(graph, algorithm, seed));
    const summary = summarizeModularitySeedStability(nodeIds, runs, adjustedRandIndex);
    return {
      algorithm: algorithm.name,
      restartsPerMasterSeed: restarts,
      runs: runs.map(({ seed, scaledScore, modularity, communities, elapsedWallMs }) => ({
        seed,
        scaledScore,
        modularity: Number(modularity.toFixed(9)),
        communityCount: communities.length,
        elapsedWallMs: Number(elapsedWallMs.toFixed(2))
      })),
      summary: {
        ...summary,
        scoreRange: summary.scoreRange,
        modularityRange: Object.fromEntries(Object.entries(summary.scoreRange).map(([key, score]) =>
          [key, Number((score / (4 * graph.links.length ** 2)).toFixed(9))]
        )),
        runtimeMsRange: Object.fromEntries(Object.entries(summary.runtimeMsRange).map(([key, value]) =>
          [key, Number(value.toFixed(2))]
        )),
        selectedPartitionStability: Object.fromEntries(Object.entries(summary.selectedPartitionStability).map(([key, value]) =>
          [key, typeof value === "number" ? Number(value.toFixed(6)) : value]
        ))
      },
      optimalityProven: false
    };
  });
  return {
    dataset: item.name,
    nodes: graph.nodes.length,
    undirectedEdgeRecords: graph.links.length,
    modularity: "unweighted Newman-Girvan, resolution gamma=1",
    results
  };
}

console.log(JSON.stringify({
  purpose: "sensitivity of best-of-restarts heuristic partitions to master seed",
  baseSeed,
  seeds,
  replicates,
  restartsPerMasterSeed: restarts,
  seedSchedule: "master seeds are generated by xorshift32 from baseSeed; internal restart seeds use (masterSeed + restartIndex * 0x9e3779b9) modulo 2^32",
  restartSeedSchedule: "all internal restart seeds are checked for overlap across replicates before solving",
  distinctRestartSeedsAcrossReplicates: new Set(restartSeedSchedule.flat()).size,
  independentScoreCheck: "each selected partition is rescored with KliqueASP's exact integer modularity scorer",
  interpretation: "ARI compares selected heuristic partitions across master seeds; neither scores nor partitions prove an ASP optimum or semantic validity",
  optimalityProven: false,
  datasets: selected.map(runDataset)
}, null, 2));
