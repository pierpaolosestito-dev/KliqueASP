import assert from "node:assert/strict";
import graphConfig from "../src/lib/kliqueasp/data/examples/karate-club.config.json" with { type: "json" };
import dataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import test from "node:test";
import { normalizeGraphData, buildAspFactsFromGraph } from "../src/lib/kliqueasp/graph/graphModel.ts";
import { getGraphNeighborhoodNodeIds } from "../src/lib/kliqueasp/graph/graphVisualization.ts";
import {
  buildMaximumKPlexProgram,
  buildKCoreProgram,
  buildKCoreMembershipCompletionCounterfactualProgram,
  computeKCoreNumbers,
  getKCoreMembershipCounterfactualSolverOptions,
  getStructuralSolverOptions,
  parseWitnessNodeSets,
  parseWitnessKPlexExplanations,
  solveKCoreMembershipCompletionWhyNotByRounds,
  searchMaximumKPlexWithAsp,
  selectMaximumNodeSets
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import {
  maximumSPlexByBranchAndBound,
  searchMaximumSPlexByBranchAndBound
} from "./helpers/splexReference.mjs";

function normalizeKarateGraph() {
  return normalizeGraphData(dataset, graphConfig);
}

test("il focus display-only è data-driven anche sul Karate Club e non sostituisce la proiezione ASP", () => {
  const graph = normalizeKarateGraph();
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const originalLinks = graph.links;
  const expectedByRadius = [
    { radius: 1, nodes: 17, edges: 34 },
    { radius: 2, nodes: 26, edges: 59 },
    { radius: 3, nodes: 34, edges: 78 }
  ];

  for (const expected of expectedByRadius) {
    const focusedNodeIds = getGraphNeighborhoodNodeIds(
      graph.nodes.map((node) => String(node.id)),
      graph.links,
      "0",
      { maxHops: expected.radius, direction: "weak", defaultGraphDirection: graph.direction }
    );
    const focusedLinks = graph.links.filter((link) =>
      focusedNodeIds.has(String(link.source)) && focusedNodeIds.has(String(link.target))
    );

    assert.equal(focusedNodeIds.size, expected.nodes, `raggio ${expected.radius}: nodi raggiunti`);
    assert.equal(focusedLinks.length, expected.edges, `raggio ${expected.radius}: archi indotti`);
  }

  assert.equal(graph.nodes.length, 34);
  assert.equal(graph.links.length, 78);
  assert.equal(graph.links, originalLinks, "il focus non sostituisce né muta gli archi usati dall'analisi");
});

function peelKCore(nodeIds, links, k) {
  const active = new Set(nodeIds);
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const { source, target } of links) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...active]) {
      const degree = [...(neighbors.get(id) ?? [])].filter((neighbor) => active.has(neighbor)).length;
      if (degree < k) {
        active.delete(id);
        changed = true;
      }
    }
  }
  return [...active].sort();
}

function peelKCoreRounds(nodeIds, links, k) {
  const active = new Set(nodeIds);
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const { source, target } of links) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }

  const peeling = [];
  for (let round = 1; round <= nodeIds.length; round += 1) {
    const wave = [...active].filter((id) =>
      [...(neighbors.get(id) ?? [])].filter((neighbor) => active.has(neighbor)).length < k
    ).sort((left, right) => Number(left) - Number(right));
    if (wave.length === 0) break;
    for (const id of wave) {
      peeling.push({
        nodeId: id,
        round,
        survivingNeighborIds: [...(neighbors.get(id) ?? [])]
          .filter((neighbor) => active.has(neighbor))
          .sort((left, right) => Number(left) - Number(right))
      });
    }
    for (const id of wave) active.delete(id);
  }
  return { peeling, remaining: [...active].sort() };
}

function exhaustiveMaximumSPlexSize(nodeIds, links, s) {
  const neighbors = new Map(nodeIds.map((id) => [id, new Set()]));
  for (const { source, target } of links) {
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  let bestSize = 0;
  for (let mask = 0; mask < 2 ** nodeIds.length; mask += 1) {
    const members = nodeIds.filter((_, index) => (mask & (1 << index)) !== 0);
    if (members.length <= bestSize) continue;
    const valid = members.every((id) =>
      members.filter((other) => other !== id && !neighbors.get(id)?.has(other)).length <= s - 1
    );
    if (valid) bestSize = members.length;
  }
  return bestSize;
}

test("il riferimento branch-and-bound per s-plex coincide con enumerazione esaustiva sui grafi a 4 nodi", () => {
  const nodeIds = ["0", "1", "2", "3"];
  const possibleEdges = [];
  for (let source = 0; source < nodeIds.length; source += 1) {
    for (let target = source + 1; target < nodeIds.length; target += 1) {
      possibleEdges.push({ source: nodeIds[source], target: nodeIds[target] });
    }
  }

  for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
    const links = possibleEdges.filter((_, index) => (mask & (1 << index)) !== 0);
    for (const s of [1, 2]) {
      assert.equal(
        maximumSPlexByBranchAndBound(nodeIds, links, s),
        exhaustiveMaximumSPlexSize(nodeIds, links, s),
        `s=${s}, grafo=${mask}`
      );
    }
  }
});

test("il riferimento s-plex segnala esplicitamente una ricerca interrotta senza provare l'ottimo", () => {
  const result = searchMaximumSPlexByBranchAndBound(["a", "b", "c"], [], 2, { maxSearchStates: 1 });

  assert.equal(result.complete, false);
  assert.equal(result.exploredStates, 1);
  assert.throws(() => maximumSPlexByBranchAndBound(["a", "b", "c"], [], 2, { maxSearchStates: 1 }));
});

test("il riferimento s-plex controlla il timeout prima di espandere uno stato", () => {
  const result = searchMaximumSPlexByBranchAndBound(["a", "b", "c"], [], 2, {
    timeLimitMs: Number.MIN_VALUE
  });

  assert.equal(result.complete, false);
  assert.equal(result.exploredStates, 1);
});

test("Karate Club si mappa nello schema v2 senza perdere la struttura semplice non orientata", () => {
  const graph = normalizeKarateGraph();

  assert.equal(dataset.metadata.nodeCount, 34);
  assert.equal(dataset.metadata.undirectedEdgeCount, 78);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.length, 34);
  assert.equal(graph.links.length, 78);
  assert.equal(graph.direction, "undirected");
  assert.equal(graph.identity, "simple");
  assert.equal(graph.capabilities.undirectedAdjacency.available, true);
  assert.equal(graph.capabilities.edgeTypes.available, false, "the fixture does not invent relation types");
  assert.deepEqual(
    [...new Set(graph.nodes.map((node) => node.analysis?.attributes?.club))].sort(),
    ["Mr. Hi", "Officer"]
  );
  const undirectedPairKeys = dataset.edges.map(({ source, target }) =>
    source < target ? `${source}:${target}` : `${target}:${source}`
  );
  assert.equal(new Set(undirectedPairKeys).size, 78, "every stored edge is a distinct undirected pair");
});

test("la decomposizione k-core ASP sul dataset indipendente coincide col profilo di peeling", async () => {
  const graph = normalizeKarateGraph();
  const base = buildAspFactsFromGraph(graph);
  const nodeIds = graph.nodes.map((node) => node.id);
  const coreNumbers = computeKCoreNumbers(nodeIds, graph.links);
  const maximumCoreNumber = Math.max(...coreNumbers.values());
  assert.ok(maximumCoreNumber >= 3, "Karate Club deve contenere livelli k-core distinti");
  const runner = await createClingoWasmRunner();
  for (let k = 1; k <= maximumCoreNumber; k += 1) {
    const result = await runner.run(
      `${base.facts.trim()}\n\n${buildKCoreProgram(k)}\n`,
      getStructuralSolverOptions("kCore")
    );
    const actual = selectMaximumNodeSets(
      parseWitnessNodeSets(result.Call?.[0]?.Witnesses, base.reverseIndex)
    );
    const expectedByPeeling = peelKCore(nodeIds, graph.links, k);
    const expectedByCoreNumber = nodeIds.filter((nodeId) => (coreNumbers.get(nodeId) ?? -1) >= k).sort();

    assert.equal(result.Result, "OPTIMUM FOUND", `k=${k}`);
    assert.equal(actual.length, 1, `un solo k-core massimo per k=${k}`);
    assert.deepEqual(actual[0].sort(), expectedByPeeling, `peeling di riferimento, k=${k}`);
    assert.deepEqual(actual[0].sort(), expectedByCoreNumber, `profilo dei core number, k=${k}`);
    if (k === 3) assert.equal(actual[0].length, 22);
  }
});

test("il why-not k-core ASP e il batching adattivo si trasferiscono al grafo Karate Club", async () => {
  const graph = normalizeKarateGraph();
  const { facts, reverseIndex } = buildAspFactsFromGraph(graph);
  const indexByNodeId = new Map(Object.entries(reverseIndex).map(([index, id]) => [id, Number(index)]));
  const nodeIdByIndex = new Map(Object.entries(reverseIndex).map(([index, id]) => [Number(index), id]));
  const nodeIds = graph.nodes.map((node) => node.id);
  const candidateNodeIndices = nodeIds.map((nodeId) => indexByNodeId.get(nodeId));
  const k = 4;
  const expected = peelKCoreRounds(nodeIds, graph.links, k);
  assert.ok(expected.peeling.length > 0, "la soglia scelta deve escludere almeno un nodo");
  const targetNodeId = expected.peeling.at(-1).nodeId;
  const targetNodeIndex = indexByNodeId.get(targetNodeId);
  const primary = buildKCoreMembershipCompletionCounterfactualProgram(
    k,
    targetNodeIndex,
    candidateNodeIndices,
    []
  );
  const runner = await createClingoWasmRunner();
  const primaryResult = await runner.run(
    `${facts.trim()}\n\n${primary.program}\n`,
    getKCoreMembershipCounterfactualSolverOptions()
  );
  assert.equal(primaryResult.Result, "UNSATISFIABLE");

  const observedEdges = graph.links.map((link) => ({
    sourceNode: indexByNodeId.get(link.source),
    targetNode: indexByNodeId.get(link.target)
  }));
  let queryCount = 0;
  const certificate = await solveKCoreMembershipCompletionWhyNotByRounds(
    k,
    targetNodeIndex,
    candidateNodeIndices,
    observedEdges,
    [],
    nodeIdByIndex,
    async (program) => {
      queryCount += 1;
      return runner.run(program);
    },
    { stopAfterTargetRemoval: true, maxRoundsPerQuery: 4, adaptiveBatching: true }
  );
  const targetRound = expected.peeling.find((step) => step.nodeId === targetNodeId).round;
  const expectedPrefix = expected.peeling.filter((step) => step.round <= targetRound);
  assert.equal(targetRound, 3, "la fixture Karate k=4 ha una catena di peeling di tre wave");
  const waveCounts = new Map();
  for (const step of expectedPrefix) waveCounts.set(step.round, (waveCounts.get(step.round) ?? 0) + 1);
  const hasParallelWave = [...waveCounts.values()].some((count) => count > 1);

  assert.equal(certificate.peelingScope, "target_prefix");
  assert.equal(certificate.targetNodeId, targetNodeId);
  assert.deepEqual(certificate.peeling, expectedPrefix);
  assert.equal(hasParallelWave, true, "la fixture Karate deve esercitare la scelta adattiva per wave parallele");
  assert.equal(queryCount, 3, "il target al round 3 usa query ASP a round singolo per il peeling ramificato");
  assert.equal(queryCount, hasParallelWave ? targetRound : Math.ceil(targetRound / 4));
});

test("il 2-plex massimo ASP sul dataset indipendente restituisce un ottimo verificabile", async () => {
  const graph = normalizeKarateGraph();
  const base = buildAspFactsFromGraph(graph);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(
    `${base.facts.trim()}\n\n${buildMaximumKPlexProgram(2)}\n`,
    getStructuralSolverOptions("kPlex")
  );
  const sets = selectMaximumNodeSets(
    parseWitnessNodeSets(result.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  const referenceSize = maximumSPlexByBranchAndBound(graph.nodes.map((node) => node.id), graph.links, 2);

  assert.equal(result.Result, "OPTIMUM FOUND");
  assert.equal(sets.length, 1);
  assert.equal(sets[0].length, referenceSize);
  assert.equal(sets[0].length, 6);
  for (const nodeId of sets[0]) {
    const missingNeighbors = sets[0].filter((otherId) => otherId !== nodeId && !graph.links.some((edge) =>
      (edge.source === nodeId && edge.target === otherId) ||
      (edge.source === otherId && edge.target === nodeId)
    ));
    assert.ok(missingNeighbors.length <= 1, `${nodeId} has ${missingNeighbors.length} non-neighbors`);
  }
});

test("il 3-plex massimo ASP sul dataset indipendente coincide con il branch-and-bound", async () => {
  const graph = normalizeKarateGraph();
  const base = buildAspFactsFromGraph(graph);
  const nodeIds = graph.nodes.map((node) => node.id);
  const runner = await createClingoWasmRunner();
  const search = await searchMaximumKPlexWithAsp(3, nodeIds, graph.links, "", false, (program, modelLimit) =>
    runner.run(`${base.facts.trim()}\n\n${program}\n`, [], modelLimit)
  );
  const referenceSize = maximumSPlexByBranchAndBound(nodeIds, graph.links, 3, {
    timeLimitMs: 30000,
    maxSearchStates: 50_000_000
  });

  assert.equal(search.complete, true);
  assert.equal(search.solverStatus, "OPTIMUM FOUND");
  assert.equal(search.maximumSize, referenceSize);
  const [witness] = parseWitnessKPlexExplanations(search.result?.Call?.[0]?.Witnesses, base.reverseIndex);
  assert.ok(witness);
  assert.equal(witness.nodeIds.length, referenceSize);
  const missingByNode = new Map(witness.nodeIds.map((nodeId) => [nodeId, 0]));
  for (const [left, right] of witness.missingTiePairs) {
    missingByNode.set(left, (missingByNode.get(left) ?? 0) + 1);
    missingByNode.set(right, (missingByNode.get(right) ?? 0) + 1);
  }
  assert.ok([...missingByNode.values()].every((count) => count <= 2));
});

test("i massimi k-plex ASP s=4\u201312 sul dataset indipendente coincidono col branch-and-bound", async () => {
  const graph = normalizeKarateGraph();
  const base = buildAspFactsFromGraph(graph);
  const nodeIds = graph.nodes.map((node) => node.id);
  const runner = await createClingoWasmRunner();
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, new Set()]));
  for (const { source, target } of graph.links) {
    adjacency.get(source)?.add(target);
    adjacency.get(target)?.add(source);
  }

  for (const { s, expectedSize } of [
    { s: 4, expectedSize: 8 },
    { s: 5, expectedSize: 9 },
    { s: 6, expectedSize: 10 },
    { s: 7, expectedSize: 10 },
    { s: 8, expectedSize: 11 },
    { s: 9, expectedSize: 12 },
    { s: 10, expectedSize: 13 },
    { s: 11, expectedSize: 14 },
    { s: 12, expectedSize: 15 }
  ]) {
    const search = await searchMaximumKPlexWithAsp(s, nodeIds, graph.links, "", false, (program, modelLimit) =>
      runner.run(`${base.facts.trim()}\n\n${program}\n`, [], modelLimit)
    );
    const reference = searchMaximumSPlexByBranchAndBound(nodeIds, graph.links, s, {
      timeLimitMs: 30000,
      maxSearchStates: 50_000_000
    });

    assert.equal(reference.complete, true, `riferimento s=${s}: ${JSON.stringify(reference)}`);
    assert.equal(reference.size, expectedSize, `riferimento s=${s}`);
    assert.equal(search.complete, true, `ASP s=${s}`);
    assert.equal(search.solverStatus, "OPTIMUM FOUND", `ASP s=${s}`);
    assert.equal(search.maximumSize, reference.size, `ASP s=${s}`);
    const [witness] = parseWitnessKPlexExplanations(search.result?.Call?.[0]?.Witnesses, base.reverseIndex);
    assert.ok(witness, `witness ASP s=${s}`);

    for (const nodeSet of [reference.nodeIds, witness.nodeIds]) {
      assert.equal(nodeSet.length, expectedSize, `dimensione witness s=${s}`);
      for (const nodeId of nodeSet) {
        const nonNeighbors = nodeSet.filter((otherId) => otherId !== nodeId && !adjacency.get(nodeId)?.has(otherId));
        assert.ok(nonNeighbors.length <= s - 1, `${nodeId} has ${nonNeighbors.length} non-neighbors in an s=${s} witness`);
      }
    }
  }
});
