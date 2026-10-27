import test from "node:test";
import assert from "node:assert/strict";
import {
  createTypedMotifCountPartitionPlan,
  resolveTypedMotifCountPartitionDomain,
  resolveTypedMotifCountPartitionDomainForSemantics,
  resolveTypedMotifCountPartitionSettings,
  runTypedMotifCountPartitions
} from "../src/lib/kliqueasp/graph/motifCountTask.ts";

function aggregate(count, result = "SATISFIABLE", more = "no") {
  return {
    Result: result,
    Models: { More: more },
    Call: [{ Witnesses: [{ Value: [`motif_count(${count})`] }] }]
  };
}

test("motif count partition settings are opt-in, bounded, and default their total budget", () => {
  assert.deepEqual(resolveTypedMotifCountPartitionSettings(undefined), { enabled: false });
  assert.deepEqual(resolveTypedMotifCountPartitionSettings({ partitionSize: 8 }), {
    enabled: true,
    settings: { partitionSize: 8, maxDurationMs: 1_800_000 }
  });
  assert.deepEqual(resolveTypedMotifCountPartitionSettings({ partitionSize: 12, maxDurationMs: 900_000 }), {
    enabled: true,
    settings: { partitionSize: 12, maxDurationMs: 900_000 }
  });
  assert.match(resolveTypedMotifCountPartitionSettings(null).error, /deve essere un oggetto/);
  assert.match(resolveTypedMotifCountPartitionSettings({ partitionSize: 0 }).error, /partitionSize/);
  assert.match(resolveTypedMotifCountPartitionSettings({ partitionSize: 17 }).error, /partitionSize/);
  assert.match(resolveTypedMotifCountPartitionSettings({ partitionSize: 8, maxDurationMs: 999 }).error, /maxDurationMs/);
  assert.match(resolveTypedMotifCountPartitionSettings({ partitionSize: 8, maxDurationMs: "10000" }).error, /maxDurationMs/);
  assert.match(resolveTypedMotifCountPartitionSettings({ partitionSize: 8, maxDurationMs: 1_800_001 }).error, /maxDurationMs/);
});

test("motif count plan is disjoint, exhaustive, 1-based, and respects its batch limit", () => {
  assert.deepEqual(createTypedMotifCountPartitionPlan(0, 8), []);
  assert.deepEqual(createTypedMotifCountPartitionPlan(1, 8), [[1]]);
  assert.deepEqual(createTypedMotifCountPartitionPlan(17, 8), [[1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11, 12, 13, 14, 15, 16], [17]]);
  assert.throws(() => createTypedMotifCountPartitionPlan(-1, 8), /itemCount/);
  assert.throws(() => createTypedMotifCountPartitionPlan(2.5, 8), /itemCount/);
  assert.throws(() => createTypedMotifCountPartitionPlan(1, 17), /partitionSize/);

  const plan = createTypedMotifCountPartitionPlan(9_827, 12);
  assert.equal(plan.length, 819);
  assert.ok(plan.every((partition) => partition.length > 0 && partition.length <= 12));
  assert.deepEqual(plan.flat(), Array.from({ length: 9_827 }, (_, index) => index + 1));
});

test("motif count chooses a disjoint partition key for each counting semantics", () => {
  assert.equal(resolveTypedMotifCountPartitionDomain({}), "firstRoleNode");
  assert.equal(resolveTypedMotifCountPartitionDomain({ temporal: { semantics: "coValid" } }), "firstRoleNode");
  assert.equal(resolveTypedMotifCountPartitionDomain({ temporal: { semantics: "orderedByStart" } }), "firstPatternEdge");
  assert.equal(resolveTypedMotifCountPartitionDomainForSemantics(undefined), "firstRoleNode");
  assert.equal(resolveTypedMotifCountPartitionDomainForSemantics("coValid"), "firstRoleNode");
  assert.equal(resolveTypedMotifCountPartitionDomainForSemantics("orderedByStart"), "firstPatternEdge");
});

test("partitioned motif count sums only complete single-model aggregates and reports progress", async () => {
  const seenPartitions = [];
  const seenProgress = [];
  const timeouts = [];
  const result = await runTypedMotifCountPartitions({
    edgeCount: 5,
    roleNodeCount: 4,
    partitionDomain: "firstPatternEdge",
    settings: { partitionSize: 2, maxDurationMs: 20_000 },
    perPartitionTimeoutMs: 15_000,
    now: () => 0,
    onProgress: (progress) => seenProgress.push(progress),
    runPartition: async (indexes, timeoutMs) => {
      seenPartitions.push([...indexes]);
      timeouts.push(timeoutMs);
      return aggregate(indexes.length * 3);
    }
  });

  assert.deepEqual(result, { status: "complete", count: "15", partitionCount: 3 });
  assert.deepEqual(seenPartitions, [[1, 2], [3, 4], [5]]);
  assert.deepEqual(timeouts, [15_000, 15_000, 15_000]);
  assert.deepEqual(seenProgress, [
    { completed: 0, total: 3, partitionDomain: "firstPatternEdge", indexRange: [1, 2] },
    { completed: 1, total: 3, partitionDomain: "firstPatternEdge", indexRange: [3, 4] },
    { completed: 2, total: 3, partitionDomain: "firstPatternEdge", indexRange: [5, 5] },
    { completed: 3, total: 3, partitionDomain: "firstPatternEdge", indexRange: [5, 5] }
  ]);
});

test("static and co-valid counts can batch by the first role node", async () => {
  const seen = [];
  const result = await runTypedMotifCountPartitions({
    edgeCount: 9,
    roleNodeCount: 5,
    partitionDomain: "firstRoleNode",
    settings: { partitionSize: 2, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 5_000,
    now: () => 0,
    runPartition: async (indexes) => {
      seen.push([...indexes]);
      return aggregate(indexes.length);
    }
  });

  assert.deepEqual(result, { status: "complete", count: "5", partitionCount: 3 });
  assert.deepEqual(seen, [[1, 2], [3, 4], [5]]);
});

test("partitioned motif counts sum decimal results exactly beyond Number.MAX_SAFE_INTEGER", async () => {
  const partialCounts = ["9007199254740991", "2"];
  const result = await runTypedMotifCountPartitions({
    edgeCount: 2,
    roleNodeCount: 2,
    partitionDomain: "firstPatternEdge",
    settings: { partitionSize: 1, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 5_000,
    now: () => 0,
    runPartition: async (indexes) => aggregate(partialCounts[indexes[0] - 1])
  });

  assert.deepEqual(result, {
    status: "complete",
    count: "9007199254740993",
    partitionCount: 2
  });
});

test("partitioned motif count returns zero for an edgeless graph without a 0/0 progress state", async () => {
  const seenProgress = [];
  let calls = 0;
  const result = await runTypedMotifCountPartitions({
    edgeCount: 0,
    roleNodeCount: 3,
    partitionDomain: "firstRoleNode",
    settings: { partitionSize: 8, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 5_000,
    now: () => 0,
    onProgress: (progress) => seenProgress.push(progress),
    runPartition: async () => {
      calls += 1;
      return aggregate(99);
    }
  });

  assert.deepEqual(result, { status: "complete", count: "0", partitionCount: 0 });
  assert.equal(calls, 0);
  assert.deepEqual(seenProgress, []);
});

test("partitioned motif count refuses incomplete, malformed, or failed partition models", async () => {
  const incomplete = await runTypedMotifCountPartitions({
    edgeCount: 3,
    roleNodeCount: 3,
    partitionDomain: "firstPatternEdge",
    settings: { partitionSize: 2, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 5_000,
    now: () => 0,
    runPartition: async () => aggregate(4, "SATISFIABLE", "yes")
  });
  assert.equal(incomplete.status, "error");
  assert.equal(incomplete.completedPartitions, 0);
  assert.equal("count" in incomplete, false);

  const malformed = await runTypedMotifCountPartitions({
    edgeCount: 1,
    roleNodeCount: 3,
    partitionDomain: "firstPatternEdge",
    settings: { partitionSize: 1, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 5_000,
    now: () => 0,
    runPartition: async () => ({ Result: "SATISFIABLE", Models: { More: "no" }, Call: [{ Witnesses: [] }] })
  });
  assert.equal(malformed.status, "error");
  assert.equal("count" in malformed, false);

  const solverError = await runTypedMotifCountPartitions({
    edgeCount: 1,
    roleNodeCount: 3,
    partitionDomain: "firstPatternEdge",
    settings: { partitionSize: 1, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 5_000,
    now: () => 0,
    runPartition: async () => ({ Result: "ERROR", Error: "worker failed" })
  });
  assert.deepEqual(solverError, {
    status: "error",
    message: "worker failed",
    completedPartitions: 0,
    partitionCount: 1
  });
});

test("partitioned motif count discards its subtotal on cancellation or the overall deadline", async () => {
  const controller = new AbortController();
  const cancelResult = await runTypedMotifCountPartitions({
    edgeCount: 5,
    roleNodeCount: 3,
    partitionDomain: "firstPatternEdge",
    settings: { partitionSize: 2, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 5_000,
    now: () => 0,
    signal: controller.signal,
    runPartition: async (_indexes, _timeout, signal) => {
      controller.abort();
      assert.equal(signal, controller.signal);
      return { Result: "CANCELLED" };
    }
  });
  assert.deepEqual(cancelResult, { status: "cancelled", completedPartitions: 0, partitionCount: 3 });

  let now = 0;
  let calls = 0;
  const timeoutResult = await runTypedMotifCountPartitions({
    edgeCount: 4,
    roleNodeCount: 3,
    partitionDomain: "firstPatternEdge",
    settings: { partitionSize: 2, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 8_000,
    now: () => now,
    runPartition: async (_indexes, timeoutMs) => {
      calls += 1;
      assert.equal(timeoutMs, 8_000);
      now = 10_000;
      return aggregate(10);
    }
  });
  assert.deepEqual(timeoutResult, { status: "timeout", completedPartitions: 0, partitionCount: 2 });
  assert.equal(calls, 1);
  assert.equal("count" in timeoutResult, false);

  const finalPartitionTimeout = await runTypedMotifCountPartitions({
    edgeCount: 2,
    roleNodeCount: 3,
    partitionDomain: "firstPatternEdge",
    settings: { partitionSize: 1, maxDurationMs: 10_000 },
    perPartitionTimeoutMs: 8_000,
    now: (() => {
      const times = [0, 0, 0, 0, 10_000];
      let read = 0;
      return () => times[read++] ?? 10_000;
    })(),
    runPartition: async () => aggregate(5)
  });
  assert.deepEqual(finalPartitionTimeout, { status: "timeout", completedPartitions: 1, partitionCount: 2 });
  assert.equal("count" in finalPartitionTimeout, false);
});
