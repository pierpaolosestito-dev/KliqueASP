import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { adjustedRandIndex } from "../scripts/modularityLouvainBaseline.mjs";
import {
  buildModularityRestartSeedSchedule,
  createModularitySeedSequence,
  summarizeModularitySeedStability
} from "../scripts/modularitySeedStability.mjs";

test("master-seed sequence is deterministic, unique, and bounded to unsigned 32-bit values", () => {
  const first = createModularitySeedSequence(8, 20261022, 16);
  assert.deepEqual(first, createModularitySeedSequence(8, 20261022, 16));
  assert.equal(new Set(first).size, 8);
  assert.ok(first.every((seed) => Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff));
  const restartStreams = buildModularityRestartSeedSchedule(first, 16).flat();
  assert.equal(restartStreams.length, 128);
  assert.equal(new Set(restartStreams).size, restartStreams.length);
  assert.throws(() => buildModularityRestartSeedSchedule([1, 1], 2), /unique unsigned/);
  assert.throws(() => buildModularityRestartSeedSchedule([0, 0x61c88647], 2), /overlap/);
  assert.throws(() => createModularitySeedSequence(0), /between 1 and 10000/);
  assert.throws(() => createModularitySeedSequence(2, -1), /unsigned 32-bit/);
});

test("seed-stability summary ignores community labels and reports selected-partition ARI", () => {
  const nodeIds = ["a", "b", "c", "d"];
  const runs = [
    { seed: 10, scaledScore: 12, elapsedWallMs: 4, communities: [["a", "b"], ["c", "d"]] },
    { seed: 11, scaledScore: 10, elapsedWallMs: 6, communities: [["d", "c"], ["b", "a"]] },
    { seed: 12, scaledScore: 8, elapsedWallMs: 8, communities: [["a", "b"], ["c"], ["d"]] }
  ];
  const summary = summarizeModularitySeedStability(nodeIds, runs, adjustedRandIndex);
  assert.equal(summary.distinctMasterSeeds, 3);
  assert.equal(summary.distinctSelectedPartitions, 2);
  assert.deepEqual(summary.scoreRange, { minimum: 8, median: 10, maximum: 12 });
  assert.deepEqual(summary.communityCountRange, { minimum: 2, median: 2, maximum: 3 });
  assert.deepEqual(summary.runtimeMsRange, { minimum: 4, median: 6, maximum: 8, mean: 6 });
  assert.equal(summary.selectedPartitionStability.pairwiseComparisons, 3);
  assert.ok(summary.selectedPartitionStability.minimum > 0);
  assert.ok(summary.selectedPartitionStability.maximum <= 1);
  assert.match(summary.interpretation, /do not establish optimality/);
});

test("single-run seed stability has no fabricated ARI value", () => {
  const summary = summarizeModularitySeedStability(
    ["a", "b"],
    [{ seed: 0, scaledScore: -2, elapsedWallMs: 0, communities: [["a", "b"]] }],
    adjustedRandIndex
  );
  assert.equal(summary.selectedPartitionStability.pairwiseComparisons, 0);
  assert.equal(summary.selectedPartitionStability.mean, null);
  assert.equal(summary.selectedPartitionStability.minimum, null);
  assert.equal(summary.selectedPartitionStability.maximum, null);
});

test("seed-stability summary rejects malformed partitions and scores", () => {
  const score = () => 1;
  assert.throws(() => summarizeModularitySeedStability(
    ["a", "b"], [{ seed: 1, scaledScore: 1, elapsedWallMs: 1, communities: [["a"], ["a"]] }], score
  ), /assign every candidate node exactly once/);
  assert.throws(() => summarizeModularitySeedStability(
    ["a", "b", "c", "d"], [{
      seed: 1,
      scaledScore: 1,
      elapsedWallMs: 1,
      communities: [["a", "b"], ["c", "d"]]
    }, {
      seed: 2,
      scaledScore: 0,
      elapsedWallMs: 1,
      communities: [["a"], ["b"], ["c"], ["d"]]
    }], () => 2
  ), /outside \[-1, 1\]/);
  assert.throws(() => summarizeModularitySeedStability(
    ["a"], [{ seed: 1, scaledScore: 1, elapsedWallMs: -1, communities: [["a"]] }], score
  ), /elapsedWallMs/);
});

test("seed-stability benchmark reports independently checked heuristic runs reproducibly", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-modularity-seed-stability.mjs", import.meta.url));
  const child = spawnSync(process.execPath, [
    "--experimental-strip-types",
    scriptPath,
    "karate",
    "--replicates=2",
    "--restarts=2",
    "--base-seed=20261022"
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30000
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);
  assert.deepEqual(report.seeds, createModularitySeedSequence(2, 20261022, 2));
  assert.equal(report.distinctRestartSeedsAcrossReplicates, 4);
  assert.equal(report.datasets.length, 1);
  assert.equal(report.datasets[0].dataset, "Zachary Karate Club (topology only)");
  assert.equal(report.datasets[0].results.length, 2);
  for (const result of report.datasets[0].results) {
    assert.equal(result.optimalityProven, false);
    assert.equal(result.runs.length, 2);
    assert.equal(result.summary.selectedPartitionStability.pairwiseComparisons, 1);
    assert.equal(result.summary.distinctMasterSeeds, 2);
  }
});

test("seed-resolution benchmark pairs master seeds without comparing Q across different objectives", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-modularity-seed-resolution.mjs", import.meta.url));
  const child = spawnSync(process.execPath, [
    "--experimental-strip-types",
    scriptPath,
    "karate",
    "--replicates=2",
    "--restarts=2",
    "--base-seed=20261022"
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30000
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);
  assert.equal(report.optimalityProven, false);
  assert.equal(report.distinctInternalRestartSeedsPerResolution, 4);
  assert.deepEqual(report.resolutions.map(({ rational }) => rational), ["1/2", "1", "3/2", "2"]);
  assert.equal(report.datasets.length, 1);
  assert.equal(report.datasets[0].results.length, 2);
  for (const algorithm of report.datasets[0].results) {
    assert.equal(algorithm.optimalityProven, false);
    assert.equal(algorithm.byResolution.length, 4);
    assert.equal(algorithm.crossResolutionAgreement.length, 6);
    assert.ok(algorithm.byResolution.every((result) => result.runs.length === 2));
    assert.ok(algorithm.byResolution.every((result) => result.summary.selectedPartitionStability.pairwiseComparisons === 1));
    assert.ok(algorithm.crossResolutionAgreement.every((comparison) =>
      comparison.pairedAgreement.pairedMasterSeeds === 2));
    assert.ok(algorithm.crossResolutionAgreement.every((comparison) =>
      !Object.hasOwn(comparison, "modularityDifference")));
  }
});
