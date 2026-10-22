import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { buildTypedPathProgram } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

function makeLayeredGraph(depth, branchingFactor, requestedNodeCount = 0) {
  const nodes = [{ id: "start" }, { id: "goal" }];
  const edges = [];
  const layers = Array.from({ length: depth }, (_, layerIndex) =>
    Array.from({ length: branchingFactor }, (_, nodeIndex) => {
      const id = `layer_${layerIndex + 1}_${nodeIndex + 1}`;
      nodes.push({ id });
      return id;
    })
  );

  let edgeIndex = 0;
  const addLayerEdges = (sources, targets) => {
    for (const source of sources) {
      for (const target of targets) {
        edgeIndex += 1;
        edges.push({ id: `path_edge_${edgeIndex}`, source, target, type: "relation" });
      }
    }
  };
  addLayerEdges(["start"], layers[0]);
  for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
    addLayerEdges(layers[layerIndex], layers[layerIndex + 1]);
  }
  addLayerEdges(layers.at(-1), ["goal"]);
  while (nodes.length < requestedNodeCount) {
    nodes.push({ id: `isolated_${nodes.length + 1}` });
  }
  return { nodes, edges };
}

test("il profilo typed-path enumera tutti i cammini, scala il dominio e segnala i limiti", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "directed",
        identity: "multigraph"
      }
    }
  };
  const graph = normalizeGraphData(makeLayeredGraph(3, 2), config);
  const facts = buildAspFactsFromGraph(graph);
  const program = `${facts.facts}\n${buildTypedPathProgram({
    startNode: facts.indexByNodeId.get("start"),
    goalNode: facts.indexByNodeId.get("goal"),
    edgeTypeSequence: Array(4).fill("relation"),
    direction: "directed"
  })}`;
  const runner = await createClingoWasmRunner({ captureWasmMemory: true });
  const memoryBeforeSolve = runner.getWasmLinearMemoryStats();
  assert.ok(memoryBeforeSolve.currentBytes > 0, "il worker WASM deve esporre la memoria lineare iniziale");

  const complete = await runner.run(program, ["--stats=2"], 0);
  assert.equal(complete.Result, "SATISFIABLE");
  assert.deepEqual(complete.Models, { Number: 8, More: "no" });
  assert.ok(Number(complete.Time.Total) >= Number(complete.Time.Solve));
  assert.ok(complete.Stats.LP.Atoms > 0);
  assert.ok(complete.Stats.LP.Rules.Original > 0);
  assert.equal(Number.isFinite(Number(complete.Stats.Core.Choices)), true);
  const memoryAfterSolve = runner.getWasmLinearMemoryStats();
  assert.ok(memoryAfterSolve.peakBytes >= memoryBeforeSolve.currentBytes);
  assert.ok(memoryAfterSolve.currentBytes > 0);
  assert.equal(memoryAfterSolve.peakBytes % 65536, 0, "la memoria WASM cresce a pagine da 64 KiB");
  const limited = await runner.run(program, ["--stats=2"], 3);
  assert.equal(limited.Result, "SATISFIABLE");
  assert.equal(limited.Models.Number, 3);
  assert.equal(limited.Models.More, "yes", "il profilo non deve presentare un'enumerazione troncata come completa");

  const extendedGraph = normalizeGraphData(makeLayeredGraph(3, 2, 100), config);
  const extendedFacts = buildAspFactsFromGraph(extendedGraph);
  const extendedProgram = `${extendedFacts.facts}\n${buildTypedPathProgram({
    startNode: extendedFacts.indexByNodeId.get("start"),
    goalNode: extendedFacts.indexByNodeId.get("goal"),
    edgeTypeSequence: Array(4).fill("relation"),
    direction: "directed"
  })}`;
  const extendedDomain = await runner.run(extendedProgram, ["--stats=2"], 0);
  assert.equal(extendedGraph.nodes.length, 100);
  assert.equal(extendedDomain.Result, "SATISFIABLE");
  assert.deepEqual(extendedDomain.Models, { Number: 8, More: "no" });
  assert.ok(extendedDomain.Stats.LP.Atoms > complete.Stats.LP.Atoms);

  const grownMemory = runner.growWasmLinearMemoryForTesting();
  assert.equal(grownMemory.currentBytes, memoryAfterSolve.currentBytes + 65536);
  assert.equal(grownMemory.peakBytes, grownMemory.currentBytes, "il contatore intercetta una crescita lineare reale");
});

test("il benchmark isolato registra il picco RSS del processo che include worker harness e WASM", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-typed-path-enumeration.mjs", import.meta.url));
  const child = spawnSync(process.execPath, [
    "--experimental-strip-types",
    scriptPath,
    "--case",
    JSON.stringify({ profile: "memory-test", depth: 3, branchingFactor: 2, requestedNodeCount: 100, repetitions: 1, warmupRuns: 0 })
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30000
  });

  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  const measurement = JSON.parse(child.stdout);
  assert.equal(measurement.complete, true);
  assert.equal(measurement.enumeratedModels, 8);
  assert.ok(measurement.nodeProcessMemory.baselineResidentSetBytes > 0);
  assert.ok(measurement.nodeProcessMemory.maxResidentSetBeforeRunsBytes >= measurement.nodeProcessMemory.baselineResidentSetBytes);
  assert.ok(measurement.nodeProcessMemory.peakResidentSetBytes >= measurement.nodeProcessMemory.maxResidentSetBeforeRunsBytes);
  assert.equal(measurement.nodeProcessMemory.warmupRuns, 0);
  assert.equal(measurement.nodeProcessMemory.measuredRuns, 1);
  assert.equal(measurement.nodeProcessMemory.peakResidentSetBytes % 1024, 0);
});
