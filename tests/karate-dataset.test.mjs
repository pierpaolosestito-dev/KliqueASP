import assert from "node:assert/strict";
import graphConfig from "../src/lib/kliqueasp/data/examples/karate-club.config.json" with { type: "json" };
import dataset from "../src/lib/kliqueasp/data/examples/karate-club.json" with { type: "json" };
import test from "node:test";
import { normalizeGraphData, buildAspFactsFromGraph } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMaximumKPlexProgram,
  buildKCoreProgram,
  getStructuralSolverOptions,
  parseWitnessNodeSets,
  parseWitnessKPlexExplanations,
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

test("il k-core ASP sul dataset indipendente coincide con il peeling iterativo", async () => {
  const graph = normalizeKarateGraph();
  const base = buildAspFactsFromGraph(graph);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(
    `${base.facts.trim()}\n\n${buildKCoreProgram(3)}\n`,
    getStructuralSolverOptions("kCore")
  );
  const actual = selectMaximumNodeSets(
    parseWitnessNodeSets(result.Call?.[0]?.Witnesses, base.reverseIndex)
  );
  const expected = peelKCore(graph.nodes.map((node) => node.id), graph.links, 3);

  assert.equal(result.Result, "OPTIMUM FOUND");
  assert.equal(actual.length, 1);
  assert.deepEqual(actual[0].sort(), expected);
  assert.equal(actual[0].length, 22);
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

test("i massimi k-plex ASP s=4–9 sul dataset indipendente coincidono col branch-and-bound", async () => {
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
    { s: 9, expectedSize: 12 }
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
