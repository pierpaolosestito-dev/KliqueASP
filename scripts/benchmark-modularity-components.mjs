import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  buildMaximumModularityProgram,
  buildModularityFacts,
  getStructuralSolverOptions,
  parseWitnessModularityPartitions,
  selectMaximumModularityPartitions
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const timeoutMs = 20_000;
const stress = process.argv.includes("--stress");
const syntheticGraph = { componentCount: stress ? 5 : 3, componentSize: 4 };

function buildInputGraph({ componentCount, componentSize }) {
  const nodes = Array.from({ length: componentCount * componentSize }, (_, index) => `n${index + 1}`);
  const edges = [];
  for (let component = 0; component < componentCount; component += 1) {
    for (let left = 0; left < componentSize; left += 1) {
      for (let right = left + 1; right < componentSize; right += 1) {
        edges.push({
          source: nodes[component * componentSize + left],
          target: nodes[component * componentSize + right]
        });
      }
    }
  }
  return { nodes, edges };
}

function evaluatePartition(nodes, edges, communities) {
  const assigned = communities.flat();
  if (assigned.length !== nodes.length || new Set(assigned).size !== nodes.length ||
    nodes.some((node) => !assigned.includes(node))) return { valid: false, score: null };
  const degree = new Map(nodes.map((node) => [node, 0]));
  for (const edge of edges) {
    degree.set(edge.source, degree.get(edge.source) + 1);
    degree.set(edge.target, degree.get(edge.target) + 1);
  }
  const score = communities.reduce((total, community) => {
    const members = new Set(community);
    const internalEdges = edges.filter((edge) => members.has(edge.source) && members.has(edge.target)).length;
    const volume = community.reduce((sum, node) => sum + degree.get(node), 0);
    return total + 4 * edges.length * internalEdges - volume ** 2;
  }, 0);
  return { valid: true, score };
}

async function runEncoding(separateDisconnectedComponents) {
  const { nodes, edges } = buildInputGraph(syntheticGraph);
  const indexByNode = new Map(nodes.map((node, index) => [node, index + 1]));
  const reverseIndex = Object.fromEntries(nodes.map((node, index) => [index + 1, node]));
  const facts = buildModularityFacts(
    nodes.map((node) => indexByNode.get(node)),
    edges.map((edge) => ({ source: indexByNode.get(edge.source), target: indexByNode.get(edge.target) })),
    { includePairwiseObjective: nodes.length <= 18 }
  );
  const program = [
    facts.facts.trim(),
    ...(separateDisconnectedComponents ? [facts.connectedComponentFacts.trim()] : []),
    ...(facts.pairwiseObjectiveFacts ? [facts.pairwiseObjectiveFacts.trim()] : []),
    buildMaximumModularityProgram({
      ...(facts.pairwiseObjectiveOffset !== undefined
        ? { pairwiseObjectiveOffset: facts.pairwiseObjectiveOffset }
        : {}),
      separateDisconnectedComponents
    })
  ].join("\n\n");
  const runner = await createClingoWasmRunner();
  const startedAt = performance.now();
  const result = await runner.run(program, ["--stats=2", ...getStructuralSolverOptions("communities", true)]);
  const elapsedWallMs = performance.now() - startedAt;
  const partitions = selectMaximumModularityPartitions(
    parseWitnessModularityPartitions(result?.Call?.[0]?.Witnesses, reverseIndex)
  );
  const independentlyScored = partitions[0]
    ? evaluatePartition(nodes, edges, partitions[0].communities)
    : { valid: false, score: null };
  const valid = result?.Result === "OPTIMUM FOUND" && independentlyScored.valid &&
    independentlyScored.score === partitions[0]?.scaledScore;

  return {
    encoding: separateDisconnectedComponents ? "component-separation" : "aggregate-baseline",
    solverStatus: result?.Result ?? "NO_RESULT",
    optimumProven: result?.Result === "OPTIMUM FOUND",
    partitionCount: partitions.length,
    scaledScore: partitions[0]?.scaledScore ?? null,
    independentlyComputedScaledScore: independentlyScored.score,
    elapsedWallMs: Number(elapsedWallMs.toFixed(2)),
    clingoTimeMs: result?.Time?.Total === undefined ? null : Number((Number(result.Time.Total) * 1000).toFixed(2)),
    groundAtoms: result?.Stats?.LP?.Atoms ?? null,
    groundRules: result?.Stats?.LP?.Rules?.Final ?? null,
    valid
  };
}

async function runChild(separateDisconnectedComponents) {
  const child = spawn(process.execPath, [
    "--experimental-strip-types",
    fileURLToPath(import.meta.url),
    "--child",
    String(separateDisconnectedComponents),
    ...(stress ? ["--stress"] : [])
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, timeoutMs);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  if (timedOut) return { solverStatus: "TIMEOUT", optimumProven: false, valid: false, timeoutMs };
  if (exitCode !== 0) throw new Error(`Il benchmark figlio è terminato con ${exitCode}: ${stderr || stdout}`);
  return JSON.parse(stdout.trim());
}

if (process.argv[2] === "--child") {
  const result = await runEncoding(process.argv[3] === "true");
  console.log(JSON.stringify(result));
  if (!result.valid) process.exitCode = 1;
} else {
  const results = [];
  for (const separateDisconnectedComponents of [false, true]) {
    results.push(await runChild(separateDisconnectedComponents));
  }
  console.log(JSON.stringify({
    graph: `${syntheticGraph.componentCount} disjoint K4 components`,
    nodes: syntheticGraph.componentCount * syntheticGraph.componentSize,
    edges: syntheticGraph.componentCount * syntheticGraph.componentSize * (syntheticGraph.componentSize - 1) / 2,
    timeoutMs,
    results,
    comparison: results[0].solverStatus === "TIMEOUT"
      ? "baseline-timeout; no direct optimum comparison"
      : results.every((result) => result.optimumProven && result.valid) &&
        results[0].scaledScore === results[1].scaledScore
        ? "same proven optimum"
        : "comparison inconclusive or inconsistent"
  }, null, 2));
  if (!results[1].valid || (results[0].solverStatus !== "TIMEOUT" &&
    (!results[0].valid || results[0].scaledScore !== results[1].scaledScore))) {
    process.exitCode = 1;
  }
}
