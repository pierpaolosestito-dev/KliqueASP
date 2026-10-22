import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildMaximumModularityProgram,
  buildExperimentalModularityThresholdProgram,
  buildModularityFacts,
  getStructuralSolverOptions,
  parseWitnessModularityPartitions
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import {
  buildModularityIncumbentBound,
  buildModularityIncumbentHeuristic,
  buildGreedyModularityIncumbent,
  scorePartition
} from "../scripts/modularityGreedyIncumbent.mjs";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import { adjustedRandIndex, findLouvainModularityBaseline } from "../scripts/modularityLouvainBaseline.mjs";
import { findGraphologyLouvainBaseline } from "../scripts/modularityGraphologyBaseline.mjs";

function enumeratePartitions(nodeIds) {
  const result = [];
  const visit = (index, groups) => {
    if (index === nodeIds.length) {
      result.push(groups.map((group) => [...group]));
      return;
    }
    const nodeId = nodeIds[index];
    for (const group of groups) {
      group.push(nodeId);
      visit(index + 1, groups);
      group.pop();
    }
    groups.push([nodeId]);
    visit(index + 1, groups);
    groups.pop();
  };
  visit(0, []);
  return result;
}

test("l'incumbent greedy di modularità è valido, deterministico e non supera l'ottimo su tutti i grafi a quattro nodi", () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possibleEdges = [];
  for (let left = 0; left < nodeIds.length; left += 1) {
    for (let right = left + 1; right < nodeIds.length; right += 1) {
      possibleEdges.push({ source: nodeIds[left], target: nodeIds[right] });
    }
  }
  const partitions = enumeratePartitions(nodeIds);

  for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
    const edges = possibleEdges.filter((_, index) => (mask & (1 << index)) !== 0);
    const incumbent = buildGreedyModularityIncumbent(nodeIds, edges);
    const assigned = incumbent.communities.flat().sort();
    const exactMaximum = Math.max(...partitions.map((partition) => scorePartition(nodeIds, edges, partition)));

    assert.deepEqual(assigned, [...nodeIds].sort(), `grafo=${mask}`);
    assert.equal(new Set(assigned).size, nodeIds.length, `grafo=${mask}`);
    assert.equal(incumbent.scaledScore, scorePartition(nodeIds, edges, incumbent.communities), `grafo=${mask}`);
    assert.ok(incumbent.scaledScore <= exactMaximum, `grafo=${mask}`);
    assert.deepEqual(buildGreedyModularityIncumbent(nodeIds, edges), incumbent, `grafo=${mask} must be deterministic`);
  }
});

test("l'incumbent di modularità tratta archi paralleli come peso topologico aggregato", () => {
  const nodeIds = ["left", "right", "isolated"];
  const edges = [
    { source: "left", target: "right" },
    { source: "left", target: "right" }
  ];
  const incumbent = buildGreedyModularityIncumbent(nodeIds, edges);

  assert.equal(incumbent.scaledScore, 0);
  assert.equal(new Set(incumbent.communities.flat()).size, nodeIds.length);
  assert.throws(() => buildGreedyModularityIncumbent(["a"], [{ source: "a", target: "a" }]), /self-loops/);
  assert.throws(() => buildModularityIncumbentBound(Number.NaN), /safe integer/);
  assert.throws(() => scorePartition(nodeIds, [{ source: "left", target: "outside" }], incumbent.communities), /outside nodeIds/);
});

test("la baseline Louvain e deterministica, valida e non rivendica ottimalita su tutti i grafi a quattro nodi", () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possibleEdges = [];
  for (let left = 0; left < nodeIds.length; left += 1) {
    for (let right = left + 1; right < nodeIds.length; right += 1) {
      possibleEdges.push({ source: nodeIds[left], target: nodeIds[right] });
    }
  }
  const partitions = enumeratePartitions(nodeIds);

  for (let edgeMask = 0; edgeMask < 1 << possibleEdges.length; edgeMask += 1) {
    const edges = possibleEdges.filter((_, index) => (edgeMask & (1 << index)) !== 0);
    const result = findLouvainModularityBaseline(nodeIds, edges, { restarts: 4, seed: 29 });
    const exactMaximum = Math.max(...partitions.map((partition) => scorePartition(nodeIds, edges, partition)));
    const assigned = result.communities.flat();

    assert.equal(new Set(assigned).size, nodeIds.length, `nodi univoci, grafo=${edgeMask}`);
    assert.deepEqual([...assigned].sort(), [...nodeIds].sort(), `copertura, grafo=${edgeMask}`);
    assert.equal(result.scaledScore, scorePartition(nodeIds, edges, result.communities), `score, grafo=${edgeMask}`);
    assert.ok(result.scaledScore <= exactMaximum, `limite dell'oracolo, grafo=${edgeMask}`);
    assert.equal(result.optimalityProven, false, `euristica senza prova, grafo=${edgeMask}`);
    assert.deepEqual(
      findLouvainModularityBaseline(nodeIds, edges, { restarts: 4, seed: 29 }),
      result,
      `determinismo, grafo=${edgeMask}`
    );
  }
});

test("la baseline Louvain conserva archi paralleli, cappi e nodi isolati nella valutazione", () => {
  const nodeIds = ["a", "b", "c", "isolated"];
  const edges = [
    { source: "a", target: "a" },
    { source: "a", target: "b" },
    { source: "a", target: "b" },
    { source: "b", target: "c" }
  ];
  const result = findLouvainModularityBaseline(nodeIds, edges, { restarts: 6, seed: 7 });

  assert.equal(new Set(result.communities.flat()).size, nodeIds.length);
  assert.equal(result.scaledScore, scorePartition(nodeIds, edges, result.communities));
  assert.equal(result.modularity, result.scaledScore / (4 * edges.length ** 2));
  assert.equal(result.optimalityProven, false);
  assert.throws(() => findLouvainModularityBaseline([], []), /non-empty array/);
  assert.throws(() => findLouvainModularityBaseline(nodeIds, [{ source: "a", target: "missing" }]), /outside nodeIds/);
  assert.throws(() => findLouvainModularityBaseline(nodeIds, edges, { restarts: 0 }), /restarts/);
});

test("l'Adjusted Rand Index misura concordanza di partizioni, non solo di punteggio", () => {
  const nodeIds = ["a", "b", "c", "d"];
  const partitions = enumeratePartitions(nodeIds);
  const same = [["a", "b"], ["c", "d"]];
  const crossing = [["a", "c"], ["b", "d"]];

  assert.equal(adjustedRandIndex(nodeIds, same, [["d", "c"], ["b", "a"]]), 1);
  assert.ok(Math.abs(adjustedRandIndex(nodeIds, same, crossing) + 0.5) < 1e-12);
  assert.equal(adjustedRandIndex(nodeIds, [["a"], ["b"], ["c"], ["d"]], [["a", "b", "c", "d"]]), 0);
  for (const left of partitions) {
    assert.equal(adjustedRandIndex(nodeIds, left, left), 1);
    for (const right of partitions) {
      const score = adjustedRandIndex(nodeIds, left, right);
      assert.ok(score >= -1 && score <= 1);
      assert.equal(score, adjustedRandIndex(nodeIds, right, left));
    }
  }

  assert.throws(() => adjustedRandIndex(nodeIds, [["a", "b"]], same), /every node exactly once/);
  assert.throws(() => adjustedRandIndex(nodeIds, [["a", "a"], ["b", "c", "d"]], same), /duplicate node/);
});

test("Graphology Louvain coincide con lo scorer indipendente ed è valido su tutti i grafi a quattro nodi", () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possibleEdges = [];
  for (let left = 0; left < nodeIds.length; left += 1) {
    for (let right = left + 1; right < nodeIds.length; right += 1) {
      possibleEdges.push({ source: nodeIds[left], target: nodeIds[right] });
    }
  }
  const partitions = enumeratePartitions(nodeIds);

  for (let edgeMask = 0; edgeMask < 1 << possibleEdges.length; edgeMask += 1) {
    const edges = possibleEdges.filter((_, index) => (edgeMask & (1 << index)) !== 0);
    const result = findGraphologyLouvainBaseline(nodeIds, edges, { restarts: 4, seed: 29 });
    const exactMaximum = Math.max(...partitions.map((partition) => scorePartition(nodeIds, edges, partition)));
    assert.equal(new Set(result.communities.flat()).size, nodeIds.length, `copertura, grafo=${edgeMask}`);
    assert.equal(result.scaledScore, scorePartition(nodeIds, edges, result.communities), `score, grafo=${edgeMask}`);
    assert.ok(result.scaledScore <= exactMaximum, `limite dell'oracolo, grafo=${edgeMask}`);
    assert.equal(result.optimalityProven, false, `euristica, grafo=${edgeMask}`);
    assert.equal(result.implementation, "graphology-communities-louvain@2.0.2");
  }
});

test("Graphology Louvain mantiene la semantica di record paralleli, cappi e nodi isolati", () => {
  const nodeIds = ["a", "b", "c", "isolated"];
  const edges = [
    { source: "a", target: "a" },
    { source: "a", target: "b" },
    { source: "a", target: "b" },
    { source: "b", target: "c" }
  ];
  const result = findGraphologyLouvainBaseline(nodeIds, edges, { restarts: 6, seed: 7 });

  assert.equal(result.scaledScore, scorePartition(nodeIds, edges, result.communities));
  assert.equal(Math.abs(result.modularity - result.reportedModularity) < 1e-9, true);
  assert.equal(result.optimalityProven, false);
  assert.throws(() => findGraphologyLouvainBaseline(nodeIds, [{ source: "a", target: "missing" }]), /outside nodeIds/);
});

test("la modularità razionale applica esattamente la risoluzione gamma", () => {
  const nodeIds = ["a", "b", "c"];
  const triangle = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "a", target: "c" }
  ];
  const oneCommunity = [["a", "b", "c"]];
  const singletonCommunities = [["a"], ["b"], ["c"]];

  assert.equal(scorePartition(nodeIds, triangle, oneCommunity, { numerator: 1, denominator: 2 }), 36);
  assert.equal(scorePartition(nodeIds, triangle, singletonCommunities, { numerator: 1, denominator: 2 }), -12);
  assert.equal(scorePartition(nodeIds, triangle, oneCommunity, { numerator: 2, denominator: 1 }), -36);
  assert.equal(scorePartition(nodeIds, triangle, singletonCommunities, { numerator: 2, denominator: 1 }), -24);
  assert.throws(() => scorePartition(nodeIds, triangle, oneCommunity, { numerator: 0, denominator: 1 }), /positive rational/);
  assert.throws(() => scorePartition(nodeIds, triangle, oneCommunity, { numerator: 1, denominator: 0 }), /positive rational/);
});

test("Louvain locale applica la risoluzione razionale e resta entro l'ottimo enumerato su tutti i grafi a quattro nodi", () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possibleEdges = [];
  for (let left = 0; left < nodeIds.length; left += 1) {
    for (let right = left + 1; right < nodeIds.length; right += 1) {
      possibleEdges.push({ source: nodeIds[left], target: nodeIds[right] });
    }
  }
  const partitions = enumeratePartitions(nodeIds);
  const resolutions = [
    { numerator: 1, denominator: 2 },
    { numerator: 3, denominator: 2 },
    { numerator: 2, denominator: 1 }
  ];

  for (let edgeMask = 0; edgeMask < 1 << possibleEdges.length; edgeMask += 1) {
    const edges = possibleEdges.filter((_, index) => (edgeMask & (1 << index)) !== 0);
    for (const resolution of resolutions) {
      const options = { restarts: 4, seed: 47, resolution };
      const result = findLouvainModularityBaseline(nodeIds, edges, options);
      const exactMaximum = Math.max(...partitions.map((partition) =>
        scorePartition(nodeIds, edges, partition, resolution)));
      assert.equal(result.scaledScore, scorePartition(nodeIds, edges, result.communities, resolution));
      assert.ok(result.scaledScore <= exactMaximum, `limite esatto, grafo=${edgeMask}, gamma=${resolution.numerator}/${resolution.denominator}`);
      assert.deepEqual(result.resolution, resolution);
      assert.equal(result.optimalityProven, false);
      if (edges.length > 0) {
        assert.equal(result.modularity, result.scaledScore / (4 * edges.length ** 2 * resolution.denominator));
      }
      assert.deepEqual(findLouvainModularityBaseline(nodeIds, edges, options), result);
    }
  }
  assert.throws(() => findLouvainModularityBaseline(nodeIds, possibleEdges, {
    resolution: { numerator: 0, denominator: 1 }
  }), /positive rational/);
});

test("Graphology e lo scorer indipendente coincidono per gamma razionali su tutti i grafi a quattro nodi", () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possibleEdges = [];
  for (let left = 0; left < nodeIds.length; left += 1) {
    for (let right = left + 1; right < nodeIds.length; right += 1) {
      possibleEdges.push({ source: nodeIds[left], target: nodeIds[right] });
    }
  }
  const partitions = enumeratePartitions(nodeIds);
  const resolutions = [
    { numerator: 1, denominator: 2 },
    { numerator: 3, denominator: 2 }
  ];

  for (let edgeMask = 0; edgeMask < 1 << possibleEdges.length; edgeMask += 1) {
    const edges = possibleEdges.filter((_, index) => (edgeMask & (1 << index)) !== 0);
    for (const resolution of resolutions) {
      const result = findGraphologyLouvainBaseline(nodeIds, edges, { restarts: 3, seed: 47, resolution });
      const exactMaximum = Math.max(...partitions.map((partition) =>
        scorePartition(nodeIds, edges, partition, resolution)));
      assert.equal(result.scaledScore, scorePartition(nodeIds, edges, result.communities, resolution));
      assert.ok(result.scaledScore <= exactMaximum, `limite esatto, grafo=${edgeMask}, gamma=${resolution.numerator}/${resolution.denominator}`);
      assert.equal(result.optimalityProven, false);
      if (edges.length > 0) assert.ok(Math.abs(result.modularity - result.reportedModularity) < 1e-9);
    }
  }
});

test("il confronto riproducibile fra greedy e due Louvain copre il caso studio e i grafi indipendenti", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-modularity-baselines.mjs", import.meta.url));
  const child = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath, "all"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000
  });

  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);
  assert.equal(report.louvainRestarts, 32);
  assert.equal(report.purpose, "heuristic comparison only; results are not optimality proofs");
  assert.deepEqual(report.datasets.map((dataset) => dataset.nodes), [335, 32, 34]);
  assert.deepEqual(report.datasets.map((dataset) => dataset.results[1].scaledScore), [2189250, 10646, 10216]);
  assert.deepEqual(report.datasets.map((dataset) => dataset.results[2].scaledScore), [2194022, 10218, 10216]);

  for (const dataset of report.datasets) {
    assert.equal(dataset.results.length, 3);
    assert.equal(dataset.results.every((result) => result.independentlyScored), true, dataset.dataset);
    assert.equal(dataset.results.every((result) => result.optimalityProven === false), true, dataset.dataset);
    assert.equal(dataset.comparison.louvainScoreAtLeastLocalGreedy, true, dataset.dataset);
    assert.equal(dataset.results[2].algorithm, "Graphology Louvain multi-start");
    assert.equal(dataset.results[2].implementation, "graphology-communities-louvain@2.0.2");
    assert.equal(dataset.results[2].libraryModularityMatched, true, dataset.dataset);
    const stability = dataset.results[2].partitionStability;
    assert.equal(stability.pairwiseComparisons, 496, dataset.dataset);
    assert.ok(stability.minimum <= stability.mean && stability.mean <= stability.maximum, dataset.dataset);
    assert.ok(dataset.results[1].distinctPartitions >= 1, dataset.dataset);
  }
});

test("lo sweep gamma riporta obiettivi separati, modularità verificata e stabilità delle partizioni", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-modularity-resolution.mjs", import.meta.url));
  const child = spawnSync(process.execPath, ["--experimental-strip-types", scriptPath, "all"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30_000
  });

  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);
  assert.equal(report.optimalityProven, false);
  assert.deepEqual(report.resolutions.map((resolution) => resolution.rational), ["1/2", "1", "3/2", "2"]);
  assert.equal(report.datasets.length, 3);
  for (const dataset of report.datasets) {
    assert.equal(dataset.results.length, 4, dataset.dataset);
    assert.equal(dataset.crossResolutionAgreement.length, 6, dataset.dataset);
    assert.ok(dataset.results.every((result) => result.pairwiseComparisons === 496), dataset.dataset);
    assert.ok(dataset.results.every((result) => result.distinctPartitions >= 1), dataset.dataset);
  }
  assert.deepEqual(report.datasets.map((dataset) => dataset.results[1].scaledScore), [2194022, 10218, 10216]);
});

test("un seed Graphology è un suggerimento di ricerca ASP verificabile, non una prova di ottimalità", async () => {
  const nodeIds = ["a", "b", "c"];
  const edges = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "a", target: "c" }
  ];
  const graphology = findGraphologyLouvainBaseline(nodeIds, edges, { restarts: 4, seed: 23 });
  const indexByNodeId = new Map(nodeIds.map((nodeId, index) => [nodeId, index + 1]));
  const heuristic = buildModularityIncumbentHeuristic(indexByNodeId, graphology.communities);
  const facts = buildModularityFacts(
    nodeIds.map((nodeId) => indexByNodeId.get(nodeId)),
    edges.map((edge) => ({ source: indexByNodeId.get(edge.source), target: indexByNodeId.get(edge.target) }))
  ).facts;
  const runner = await createClingoWasmRunner();
  const result = await runner.run(
    `${facts}\n${buildMaximumModularityProgram()}\n${heuristic}`,
    getStructuralSolverOptions("communities")
  );
  const witness = parseWitnessModularityPartitions(result?.Call?.[0]?.Witnesses, { 1: "a", 2: "b", 3: "c" })[0];

  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.ok(witness);
  assert.equal(witness.scaledScore, scorePartition(nodeIds, edges, witness.communities));
  assert.equal(graphology.optimalityProven, false);
});

test("il bound ASP ammette un incumbent fattibile e respinge una soglia oltre l'ottimo", async () => {
  const facts = buildModularityFacts([1, 2, 3], [
    { source: 1, target: 2 },
    { source: 2, target: 3 },
    { source: 1, target: 3 }
  ]).facts;
  const objective = buildMaximumModularityProgram();
  const runner = await createClingoWasmRunner();
  const solverOptions = getStructuralSolverOptions("communities");
  const feasible = await runner.run(`${facts}\n${objective}\n${buildModularityIncumbentBound(0)}`, solverOptions);
  assert.equal(feasible.Result, "OPTIMUM FOUND", feasible.Error ?? JSON.stringify(feasible));

  const impossible = await runner.run(`${facts}\n${objective}\n${buildModularityIncumbentBound(1)}`, solverOptions);
  assert.equal(impossible.Result, "UNSATISFIABLE", impossible.Error ?? JSON.stringify(impossible));

  const nodeIds = ["a", "b", "c"];
  const edges = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "a", target: "c" }
  ];
  const seed = buildGreedyModularityIncumbent(nodeIds, edges);
  const heuristic = buildModularityIncumbentHeuristic(new Map(nodeIds.map((nodeId, index) => [nodeId, index + 1])), seed.communities);
  const guided = await runner.run(`${facts}\n${objective}\n${heuristic}`, solverOptions);
  assert.equal(guided.Result, "OPTIMUM FOUND", guided.Error ?? JSON.stringify(guided));
});

test("la ricerca ASP per soglia chiude esattamente optimum e UNSAT sul punteggio successivo", async () => {
  const nodeIds = ["a", "b", "c", "d"];
  const possibleEdges = [];
  for (let left = 0; left < nodeIds.length; left += 1) {
    for (let right = left + 1; right < nodeIds.length; right += 1) {
      possibleEdges.push({ source: nodeIds[left], target: nodeIds[right] });
    }
  }
  const partitions = enumeratePartitions(nodeIds);
  const indexByNodeId = new Map(nodeIds.map((nodeId, index) => [nodeId, index + 1]));
  const reverseIndex = Object.fromEntries(nodeIds.map((nodeId, index) => [index + 1, nodeId]));
  const runner = await createClingoWasmRunner();

  for (let edgeMask = 0; edgeMask < 1 << possibleEdges.length; edgeMask += 1) {
    const edges = possibleEdges.filter((_, index) => (edgeMask & (1 << index)) !== 0);
    const optimum = Math.max(...partitions.map((partition) => scorePartition(nodeIds, edges, partition)));
    const facts = buildModularityFacts(
      nodeIds.map((nodeId) => indexByNodeId.get(nodeId)),
      edges.map((edge) => ({ source: indexByNodeId.get(edge.source), target: indexByNodeId.get(edge.target) }))
    ).facts;
    const feasible = await runner.run(
      `${facts}\n${buildExperimentalModularityThresholdProgram(optimum)}`,
      ["--stats=2"],
      1
    );
    assert.equal(feasible.Result, "SATISFIABLE", `soglia ottima, grafo=${edgeMask}: ${feasible.Error ?? JSON.stringify(feasible)}`);
    const witness = parseWitnessModularityPartitions(feasible.Call?.[0]?.Witnesses, reverseIndex)[0];
    assert.ok(witness, `partition_score/1 del testimone, grafo=${edgeMask}`);
    assert.equal(witness.scaledScore, optimum, `punteggio ASP, grafo=${edgeMask}`);
    assert.equal(scorePartition(nodeIds, edges, witness.communities), optimum, `punteggio indipendente, grafo=${edgeMask}`);

    const impossible = await runner.run(
      `${facts}\n${buildExperimentalModularityThresholdProgram(optimum + 1)}`,
      ["--stats=2"],
      1
    );
    assert.equal(impossible.Result, "UNSATISFIABLE", `soglia oltre ottimo, grafo=${edgeMask}: ${impossible.Error ?? JSON.stringify(impossible)}`);
  }
});

test("la soglia ASP conserva modularità pesata, risoluzione razionale e record paralleli", async () => {
  const nodeIds = [1, 2, 3, 4];
  const edges = [
    { source: 1, target: 2, weight: 2 },
    { source: 1, target: 2, weight: 1 },
    { source: 2, target: 3, weight: 0 },
    { source: 3, target: 3, weight: 2 }
  ];
  const degreeByNode = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
  for (const edge of edges) {
    degreeByNode.set(edge.source, degreeByNode.get(edge.source) + edge.weight);
    degreeByNode.set(edge.target, degreeByNode.get(edge.target) + edge.weight);
  }
  const totalWeight = edges.reduce((sum, edge) => sum + edge.weight, 0);
  const score = (communities) => communities.reduce((total, community) => {
    const members = new Set(community);
    const internalWeight = edges.reduce((sum, edge) =>
      sum + (members.has(edge.source) && members.has(edge.target) ? edge.weight : 0), 0);
    const volume = community.reduce((sum, nodeId) => sum + degreeByNode.get(nodeId), 0);
    return total + 4 * totalWeight * 2 * internalWeight - volume ** 2;
  }, 0);
  const optimum = Math.max(...enumeratePartitions(nodeIds).map(score));
  const facts = buildModularityFacts(nodeIds, edges, { weighted: true, resolution: "0.5" });
  const runner = await createClingoWasmRunner();
  const feasible = await runner.run(
    `${facts.facts}\n${buildExperimentalModularityThresholdProgram(optimum, { weighted: true })}`,
    ["--stats=2"],
    1
  );
  assert.equal(feasible.Result, "SATISFIABLE", feasible.Error ?? JSON.stringify(feasible));
  const witness = parseWitnessModularityPartitions(feasible.Call?.[0]?.Witnesses, Object.fromEntries(nodeIds.map((id) => [id, String(id)])))[0];
  assert.equal(witness?.scaledScore, optimum);
  assert.equal(score(witness.communities.map((community) => community.map(Number))), optimum);

  const impossible = await runner.run(
    `${facts.facts}\n${buildExperimentalModularityThresholdProgram(optimum + 1, { weighted: true })}`,
    ["--stats=2"],
    1
  );
  assert.equal(impossible.Result, "UNSATISFIABLE", impossible.Error ?? JSON.stringify(impossible));
  assert.throws(() => buildExperimentalModularityThresholdProgram(1.5), /intero sicuro/);
  assert.throws(() => buildExperimentalModularityThresholdProgram(0, { weighted: "yes" }), /weighted deve essere booleano/);
});

test("gli encoding sperimentali rifiutano Psychology prima del solver", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-modularity-datasets.mjs", import.meta.url));
  for (const encoding of ["pairwise", "equivalence", "incremental", "incumbent", "seed-heuristic", "graphology-seed", "connected", "threshold-search"]) {
    const child = spawnSync(process.execPath, [
      "--experimental-strip-types",
      scriptPath,
      "psychology",
      "default",
      encoding
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 10000
    });

    assert.equal(child.error, undefined, child.error?.message);
    assert.equal(child.status, 1, child.stderr);
    assert.match(child.stderr, /fino a 50 nodi/);
    assert.doesNotMatch(child.stdout, /"phase":"start"/);
  }
});

test("la sonda di grounding misura un testimone fattibile senza dichiarare l'ottimo", () => {
  const scriptPath = fileURLToPath(new URL("../scripts/benchmark-modularity-datasets.mjs", import.meta.url));
  const child = spawnSync(process.execPath, [
    "--experimental-strip-types",
    scriptPath,
    "davis",
    "default",
    "grounding-probe"
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 30000
  });

  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  const records = child.stdout.split(/\r?\n/).filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
  const result = records.find((record) => record.phase === undefined);
  assert.ok(result);
  assert.equal(result.solverMode, "--opt-mode=ignore");
  assert.equal(result.solverStatus, "SATISFIABLE");
  assert.equal(result.optimumProven, false);
  assert.equal(result.feasibleWitnessOnly, true);
  assert.equal(result.witnessPartitionValid, true);
  assert.ok(Number.isFinite(result.groundAtoms) && result.groundAtoms > 0);
  assert.ok(Number.isFinite(result.groundRulesFinal) && result.groundRulesFinal > 0);
  assert.ok(Number.isFinite(result.elapsedWallMs) && result.elapsedWallMs > 0);
  assert.ok(result.wasmLinearMemoryBytes.peakBytes >= result.wasmLinearMemoryBytes.currentBytes);
});
