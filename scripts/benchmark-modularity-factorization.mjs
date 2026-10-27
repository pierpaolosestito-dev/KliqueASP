import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  buildMaximumModularityProgram,
  buildModularityFacts,
  getStructuralSolverOptions,
  MAX_FACTORED_MODULARITY_OPTIMA,
  parseWitnessModularityPartitions,
  selectMaximumModularityPartitions,
  solveModularityByPositiveWeightComponents
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const timeoutMs = 20_000;
const requestedCounts = process.argv.find((argument) => argument.startsWith("--components="))
  ?.slice("--components=".length)
  .split(",")
  .map(Number);
const componentCounts = requestedCounts?.length
  ? requestedCounts
  : process.argv.includes("--stress") ? [10] : [5, 8];

function buildGraph(componentCount) {
  const nodes = Array.from({ length: componentCount * 4 }, (_, index) => `n${index + 1}`);
  const edges = [];
  for (let component = 0; component < componentCount; component += 1) {
    const first = component * 4;
    edges.push(
      { source: nodes[first], target: nodes[first + 1] },
      { source: nodes[first + 1], target: nodes[first + 2] },
      { source: nodes[first + 2], target: nodes[first + 3] },
      { source: nodes[first + 3], target: nodes[first] }
    );
  }
  return { nodes, edges };
}

function scorePartition(nodes, edges, communities, resolution) {
  const degree = new Map(nodes.map((node) => [node, 0]));
  for (const edge of edges) {
    degree.set(edge.source, degree.get(edge.source) + 1);
    degree.set(edge.target, degree.get(edge.target) + 1);
  }
  return communities.reduce((total, community) => {
    const members = new Set(community);
    const internalEdges = edges.filter((edge) => members.has(edge.source) && members.has(edge.target)).length;
    const volume = community.reduce((sum, node) => sum + degree.get(node), 0);
    return total + 4 * edges.length * internalEdges - resolution * volume ** 2;
  }, 0);
}

function signature(partition) {
  return partition.communities
    .map((community) => [...community].sort().join("\u0000"))
    .sort()
    .join("\u0001");
}

function signaturesDigest(partitions) {
  const signatures = partitions.map(signature).sort();
  return createHash("sha256").update(signatures.join("\n")).digest("hex");
}

async function runAggregate(componentCount) {
  const { nodes, edges } = buildGraph(componentCount);
  const indexes = new Map(nodes.map((node, index) => [node, index + 1]));
  const reverseIndex = Object.fromEntries(nodes.map((node, index) => [index + 1, node]));
  const facts = buildModularityFacts(
    nodes.map((node) => indexes.get(node)),
    edges.map(({ source, target }) => ({ source: indexes.get(source), target: indexes.get(target) })),
    { resolution: componentCount, includePairwiseObjective: false }
  );
  const program = `${facts.facts.trim()}\n\n${buildMaximumModularityProgram()}\n`;
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const startedAt = performance.now();
  const result = await runner.run(program, ["--stats=2", ...getStructuralSolverOptions("communities", true)]);
  const partitions = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result?.Call?.[0]?.Witnesses, reverseIndex)
  );
  const valid = result?.Result === "OPTIMUM FOUND" && result?.Models?.More === "no" &&
    partitions.length > 0 && partitions.every((partition) =>
      partition.scaledScore === scorePartition(nodes, edges, partition.communities, componentCount));
  return {
    mode: "aggregate",
    status: result?.Result ?? "NO_RESULT",
    complete: result?.Models?.More === "no",
    optimumCount: partitions.length,
    scaledScore: partitions[0]?.scaledScore ?? null,
    elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
    clingoMs: Number.isFinite(Number(result?.Time?.Total))
      ? Number((Number(result.Time.Total) * 1000).toFixed(2))
      : null,
    groundAtoms: result?.Stats?.LP?.Atoms ?? null,
    wasmLinearMemory: runner.getWasmLinearMemoryStats(),
    signaturesDigest: signaturesDigest(partitions),
    valid
  };
}

async function runFactored(componentCount) {
  const { nodes, edges } = buildGraph(componentCount);
  const indexes = new Map(nodes.map((node, index) => [node, index + 1]));
  const reverseIndex = Object.fromEntries(nodes.map((node, index) => [index + 1, node]));
  const facts = buildModularityFacts(
    nodes.map((node) => indexes.get(node)),
    edges.map(({ source, target }) => ({ source: indexes.get(source), target: indexes.get(target) })),
    { resolution: componentCount, includePairwiseObjective: false }
  );
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const queryStats = [];
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  let result = null;
  let limitMessage = null;
  try {
    result = await solveModularityByPositiveWeightComponents(facts, reverseIndex, {
      enumerateAllOptima: true,
      solve: async (program, options) => {
        const queryStartedAt = performance.now();
        const value = await runner.run(program, ["--stats=2", ...options]);
        queryStats.push({
          elapsedMs: performance.now() - queryStartedAt,
          optimumCount: selectMaximumModularityPartitions(
            parseWitnessModularityPartitions(value?.Call?.[0]?.Witnesses, reverseIndex)
          ).length,
          groundAtoms: value?.Stats?.LP?.Atoms ?? 0
        });
        return value;
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("limite di visualizzazione")) {
      limitMessage = error.message;
    } else {
      throw error;
    }
  }
  const elapsedMs = performance.now() - startedAt;
  const partitions = result?.partitions ?? [];
  const localOptimumCounts = queryStats.map(({ optimumCount }) => optimumCount);
  const productFromSolvedComponents = localOptimumCounts.reduce((product, count) => product * count, 1);
  const expectedFullProduct = localOptimumCounts.length > 0 &&
    localOptimumCounts.every((count) => count === localOptimumCounts[0])
    ? localOptimumCounts[0] ** componentCount
    : null;
  const valid = limitMessage !== null
    ? productFromSolvedComponents > MAX_FACTORED_MODULARITY_OPTIMA && partitions.length === 0
    : result?.result?.Result === "OPTIMUM FOUND" &&
      result?.result?.Models?.More === "no" && partitions.length === productFromSolvedComponents &&
      partitions.length > 0 && partitions.every((partition) =>
        partition.scaledScore === scorePartition(nodes, edges, partition.communities, componentCount));
  return {
    mode: "factored",
    status: limitMessage ? "OPTIMUM_PRODUCT_LIMIT" : result?.result?.Result ?? "NO_RESULT",
    complete: !limitMessage && result?.result?.Models?.More === "no",
    componentQueries: queryStats.length,
    totalComponents: componentCount,
    localOptimumCounts,
    productFromSolvedComponents,
    expectedFullProduct,
    ...(limitMessage ? { limitMessage } : {}),
    globalOptimumCount: partitions.length,
    scaledScore: partitions[0]?.scaledScore ?? null,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    solverMs: Number(queryStats.reduce((total, query) => total + query.elapsedMs, 0).toFixed(2)),
    recompositionAndOrchestrationMs: Number((elapsedMs - queryStats.reduce((total, query) => total + query.elapsedMs, 0)).toFixed(2)),
    groundAtomsAcrossQueries: queryStats.reduce((total, query) => total + query.groundAtoms, 0),
    wasmLinearMemory: runner.getWasmLinearMemoryStats(),
    ...(componentCount === 5 ? { signaturesDigest: signaturesDigest(partitions) } : {}),
    heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
    valid
  };
}

async function runChild(mode, componentCount) {
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    fileURLToPath(import.meta.url),
    "--child",
    mode,
    String(componentCount)
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeoutMs);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  if (timedOut) return { mode, status: "TIMEOUT", timeoutMs };
  if (exitCode !== 0) {
    if (stdout.trim()) return { mode, status: "FAILED", output: stdout.trim(), error: stderr.trim() };
    throw new Error(`Benchmark ${mode}/${componentCount} non riuscito: ${stderr}`);
  }
  return JSON.parse(stdout.trim());
}

if (process.argv[2] === "--child") {
  const [, , , mode, countText] = process.argv;
  const count = Number(countText);
  const result = mode === "aggregate" ? await runAggregate(count) : await runFactored(count);
  console.log(JSON.stringify(result));
  if (!result.valid) process.exitCode = 1;
} else {
  const reports = [];
  for (const componentCount of componentCounts) {
    const aggregate = componentCount === 5 ? await runChild("aggregate", componentCount) : null;
    const factored = await runChild("factored", componentCount);
    const sameOptimum = aggregate === null || aggregate.status === "TIMEOUT"
      ? null
      : aggregate.valid && factored.valid && aggregate.scaledScore === factored.scaledScore &&
        aggregate.signaturesDigest === factored.signaturesDigest;
    reports.push({ componentCount, nodes: componentCount * 4, edges: componentCount * 4, aggregate, factored, sameOptimum });
  }
  console.log(JSON.stringify({
    fixture: "disjoint C4 cycles with gamma equal to component count; all optimal partitions enumerated",
    timeoutMs,
    reports,
    note: "The heap delta is measured in the Node worker harness, not in a browser tab."
  }, null, 2));
  if (reports.some(({ factored, sameOptimum }) => !factored.valid || sameOptimum === false)) {
    process.exitCode = 1;
  }
}
