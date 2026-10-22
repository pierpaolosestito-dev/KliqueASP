import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import karateDataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import karateConfig from "../src/lib/kliqueasp/data/examples/karate-club.config.json" with { type: "json" };
import { normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { searchMaximumSPlexByBranchAndBound } from "../tests/helpers/splexReference.mjs";

const projectRoot = process.cwd();
const aspRunnerPath = fileURLToPath(new URL("./run-psychology-kplex-asp.mjs", import.meta.url));
const args = process.argv.slice(2);
const budgetArguments = args.filter((argument) => argument.startsWith("--budget-ms="));
if (budgetArguments.length > 1) throw new TypeError("specify --budget-ms only once");
const budgetMs = budgetArguments.length === 0 ? 30000 : Number(budgetArguments[0].slice("--budget-ms=".length));
if (!Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 2147483647) {
  throw new RangeError("--budget-ms must be an integer from 1 to 2147483647");
}
const childTimeoutMs = budgetMs;
const solverArgs = args.filter((argument) => !argument.startsWith("--budget-ms="));
const numericArguments = solverArgs.filter((argument) => /^\d+$/.test(argument));
const s = Number(numericArguments.at(-1) ?? 2);
if (!Number.isSafeInteger(s) || s < 1) throw new RangeError("s must be a positive safe integer");
const aspOnly = solverArgs.includes("--asp-only");
const datasetId = solverArgs.includes("--karate") ? "karate" : "psychology";
const selectedStrategies = solverArgs.filter((argument) =>
  !/^\d+$/.test(argument) && argument !== "--asp-only" && argument !== "--karate"
);
const graph = datasetId === "karate"
  ? normalizeGraphData(karateDataset, karateConfig)
  : normalizeGraphData(dataset);
if (!graph.valid || graph.direction !== "undirected") {
  throw new Error(`${datasetId} graph cannot be used for the undirected k-plex comparison: ${JSON.stringify(graph.diagnostics)}`);
}

const nodeIds = graph.nodes.map((node) => node.id);
const reference = aspOnly ? null : searchMaximumSPlexByBranchAndBound(nodeIds, graph.links, s, {
  timeLimitMs: budgetMs,
  maxSearchStates: 50_000_000
});
console.log(JSON.stringify(reference
  ? {
    stage: "specialized-exact-reference",
    algorithm: "multi-start greedy incumbent plus branch-and-bound with selected-vertex degree upper bounds",
      dataset: datasetId,
    nodes: graph.nodes.length,
    undirectedEdges: graph.links.length,
    s,
    budgetMs,
    complete: reference.complete,
    optimumSize: reference.complete ? reference.size : null,
    incumbentSize: reference.size,
    exploredStates: reference.exploredStates,
    elapsedMs: Number(reference.elapsedMs.toFixed(2)),
    witnessNodeIds: reference.complete ? reference.nodeIds : undefined
  }
  : { stage: "specialized-exact-reference", dataset: datasetId, s, skipped: true, reason: "ASP-only benchmark requested" }, null, 2));

if (!aspOnly && !reference.complete) {
  console.log(`ASP comparison skipped: the independent reference did not prove optimality within its ${budgetMs}-ms budget.`);
  process.exitCode = 2;
} else {
  async function runAspStrategy(strategy) {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["--experimental-strip-types", aspRunnerPath, strategy, String(s), datasetId], {
        cwd: projectRoot,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, childTimeoutMs);
      child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
      child.once("error", reject);
      child.once("close", (exitCode, signal) => {
        clearTimeout(timer);
        resolve({ strategy, timedOut, exitCode, signal, stdout, stderr });
      });
    });
  }

  for (const strategy of selectedStrategies.length > 0 ? selectedStrategies : ["opt", "usc"]) {
    const asp = await runAspStrategy(strategy);
    const summary = {
      stage: "asp-comparison",
      dataset: datasetId,
      strategy: asp.strategy,
      s,
      budgetMs: childTimeoutMs,
      status: asp.timedOut ? "TIMEOUT" : asp.exitCode === 0 ? "COMPLETED" : `EXIT_${asp.exitCode}`,
      aspProvedOptimal: asp.stdout.includes('"optimumFound": true'),
      decisionFeasible: asp.stdout.includes('"decisionFeasible": true') ? true
        : asp.stdout.includes('"decisionFeasible": false') ? false : undefined,
      matchesIndependentReference: asp.stdout.includes('"optimumFound": true')
        ? reference?.complete ? asp.stdout.includes(`"optimumSize": ${reference.size}`) : null
        : asp.stdout.includes('"decisionFeasible": true')
          ? reference?.complete ? reference.size >= Number(strategy.slice("atleast".length)) : null
          : asp.stdout.includes('"decisionFeasible": false')
            ? reference?.complete ? reference.size < Number(strategy.slice("atleast".length)) : null
            : null,
      report: asp.stdout.trim() || undefined,
      errorOutput: asp.stderr.trim() || undefined
    };
    console.log(JSON.stringify(summary, null, 2));
  }
}
