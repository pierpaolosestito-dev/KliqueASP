import { performance } from "node:perf_hooks";
import dataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import karateDataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import karateConfig from "../src/lib/kliqueasp/data/examples/karate-club.config.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildKPlexAtLeastProgram,
  buildMaximumKPlexProgram,
  getStructuralSolverOptions,
  parseWitnessNodeSets,
  searchMaximumKPlexWithAsp,
  selectMaximumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

const graph = normalizeGraphData(dataset);
const strategy = process.argv[2] ?? "opt";
const s = Number(process.argv[3] ?? 2);
const datasetId = process.argv[4] ?? "psychology";
const selectedGraph = datasetId === "karate"
  ? normalizeGraphData(karateDataset, karateConfig)
  : datasetId === "psychology"
    ? graph
    : undefined;
if (!selectedGraph) throw new RangeError(`Unknown k-plex benchmark dataset: ${datasetId}`);
if (!Number.isSafeInteger(s) || s < 1) throw new RangeError("s must be a positive safe integer");
const targetSize = strategy.startsWith("atleast") ? Number(strategy.slice("atleast".length)) : null;
const strategyOptions = {
  opt: getStructuralSolverOptions("kPlex"),
  usc: [...getStructuralSolverOptions("kPlex"), "--opt-strategy=usc"]
}[strategy];
const isDecision = Number.isSafeInteger(targetSize) && targetSize > 0;
const isSearch = strategy === "search";
if (!strategyOptions && !isDecision && !isSearch) {
  throw new RangeError(`Unknown k-plex optimization strategy: ${strategy}`);
}
if (!selectedGraph.valid || selectedGraph.direction !== "undirected") {
  throw new Error(`${datasetId} graph cannot be used for the undirected k-plex comparison: ${JSON.stringify(selectedGraph.diagnostics)}`);
}
const facts = buildAspFactsFromGraph(selectedGraph);
const runner = await createClingoWasmRunner();
console.log(JSON.stringify({ stage: "asp-started", dataset: datasetId, strategy, s, nodes: selectedGraph.nodes.length, edges: selectedGraph.links.length }));
const startedAt = performance.now();
let result;
let searchSummary;
if (isSearch) {
  searchSummary = await searchMaximumKPlexWithAsp(s, selectedGraph.nodes.map((node) => node.id), selectedGraph.links, "", false,
    (program, modelLimit) => runner.run(`${facts.facts.trim()}\n\n${program}\n`, [], modelLimit)
  );
  result = searchSummary.result;
} else {
  const program = `${facts.facts.trim()}\n\n${isDecision ? buildKPlexAtLeastProgram(s, targetSize) : buildMaximumKPlexProgram(s)}\n`;
  result = await runner.run(program, strategyOptions ?? [], isDecision ? 1 : 0);
}
const elapsedMs = performance.now() - startedAt;
const optimumSets = selectMaximumNodeSets(parseWitnessNodeSets(
  result?.Call?.[0]?.Witnesses,
  facts.reverseIndex
));
const optimumFound = isSearch
  ? searchSummary?.complete === true && searchSummary.maximumSize > 0
  : result?.Result === "OPTIMUM FOUND";
const decisionFeasible = isDecision && result?.Result === "SATISFIABLE";
console.log(JSON.stringify({
  stage: "asp-finished",
  dataset: datasetId,
  strategy,
  s,
  solver: result?.Solver,
  status: isSearch ? searchSummary?.solverStatus : result?.Result,
  optimumFound,
  ...(isDecision ? { targetSize, decisionFeasible } : {}),
  ...(isSearch ? { queryCount: searchSummary?.queryCount } : {}),
  optimumSize: optimumFound ? isSearch ? searchSummary.maximumSize : optimumSets[0]?.length : null,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  witnessNodeIds: optimumFound ? optimumSets[0] : undefined
}, null, 2));
if ((!isDecision && !optimumFound)
  || (isDecision && !["SATISFIABLE", "UNSATISFIABLE"].includes(result?.Result))) {
  process.exitCode = 2;
}
