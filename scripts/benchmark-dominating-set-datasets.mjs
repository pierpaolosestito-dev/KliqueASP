import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import psychologyDataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import psychologyConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import davisDataset from "../src/lib/kliqueasp/data/examples/davis-southern-women.json" with { type: "json" };
import {
  buildAspFactsFromGraph,
  normalizeGraphData
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMinimumDominatingSetProgram,
  getStructuralSolverOptions,
  parseWitnessDominatingSetExplanations,
  selectMinimumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "../tests/helpers/clingoWasm.mjs";

function verifyDominatingSet(graph, nodeIds) {
  const selected = new Set(nodeIds);
  const neighbors = new Map(graph.nodes.map((node) => [node.id, new Set()]));
  for (const edge of graph.links) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  return graph.nodes.every((node) => selected.has(node.id) ||
    [...(neighbors.get(node.id) ?? [])].some((neighbor) => selected.has(neighbor))
  );
}

const allDatasets = [
  { name: "Psychology History Graph", dataset: psychologyDataset, config: psychologyConfig },
  { name: "Davis Southern Women", dataset: davisDataset, config: {} }
];
const datasetKeys = ["psychology", "davis"];

async function runDataset(key) {
  const item = allDatasets.find((candidate) => candidate.name.toLowerCase().startsWith(key));
  if (!item) throw new Error(`Dataset sconosciuto: ${key}; usa psychology, davis o all.`);
  const graph = normalizeGraphData(item.dataset, item.config);
  if (!graph.valid || graph.direction !== "undirected") {
    throw new Error(`${item.name}: normalizzazione non valida: ${JSON.stringify(graph.diagnostics)}`);
  }

  const aspFacts = buildAspFactsFromGraph(graph);
  const program = `${aspFacts.facts}\n${buildMinimumDominatingSetProgram()}\n`;
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  console.log(JSON.stringify({ dataset: item.name, phase: "start", nodes: graph.nodes.length, edges: graph.links.length }));
  const startedAt = performance.now();
  const result = await runner.run(program, ["--stats=2", ...getStructuralSolverOptions("dominatingSet")]);
  const elapsedWallMs = performance.now() - startedAt;
  const explanations = parseWitnessDominatingSetExplanations(
    result?.Call?.[0]?.Witnesses,
    aspFacts.reverseIndex
  );
  const optimumSets = selectMinimumNodeSets(explanations.map((item) => item.nodeIds));
  const witness = optimumSets[0] ?? [];
  const proven = result?.Result === "OPTIMUM FOUND" && witness.length > 0;
  const coverageValid = witness.length > 0 && verifyDominatingSet(graph, witness);
  const memory = runner.getWasmLinearMemoryStats();

  console.log(JSON.stringify({
    dataset: item.name,
    nodes: graph.nodes.length,
    undirectedEdges: graph.links.length,
    aspInputBytes: Buffer.byteLength(program, "utf8"),
    solverStatus: result?.Result ?? "NO_RESULT",
    optimumProven: proven,
    dominatingSetSize: witness.length || null,
    coverageValid,
    elapsedWallMs: Number(elapsedWallMs.toFixed(2)),
    clingoTimeMs: result?.Time
      ? {
          total: Number.isFinite(Number(result.Time.Total))
            ? Number((Number(result.Time.Total) * 1000).toFixed(2))
            : null,
          solve: Number.isFinite(Number(result.Time.Solve))
            ? Number((Number(result.Time.Solve) * 1000).toFixed(2))
            : null
        }
      : null,
    groundAtoms: result?.Stats?.LP?.Atoms ?? null,
    groundRules: result?.Stats?.LP?.Rules?.Final ?? null,
    wasmLinearMemoryBytes: memory,
    valid: proven && coverageValid
  }));

  return proven && coverageValid;
}

const args = process.argv.slice(2);
const childIndex = args.indexOf("--child");
if (childIndex >= 0) {
  const valid = await runDataset(args[childIndex + 1] ?? "");
  if (!valid) process.exitCode = 1;
} else {
  const requestedDataset = args[0] ?? "all";
  const requestedDatasets = requestedDataset === "all" ? datasetKeys : [requestedDataset];
  if (requestedDatasets.some((key) => !datasetKeys.includes(key))) {
    throw new Error(`Dataset sconosciuto: ${requestedDataset}; usa psychology, davis o all.`);
  }

  for (const key of requestedDatasets) {
    let timedOut = false;
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      fileURLToPath(import.meta.url),
      "--child",
      key
    ], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 20_000);
    const exitCode = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    clearTimeout(timeout);

    if (timedOut) {
      console.log(JSON.stringify({
        dataset: key,
        solverStatus: "TIMEOUT",
        optimumProven: false,
        timeoutMs: 20_000,
        valid: false
      }));
      process.exitCode = 1;
    } else if (exitCode !== 0) {
      process.exitCode = 1;
    }
  }
}
