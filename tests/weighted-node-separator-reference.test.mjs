import assert from "node:assert/strict";
import test from "node:test";
import { isNodeSeparator, minimumCostNodeSeparatorByDinic } from "../scripts/lib/weighted-node-separator-reference.mjs";

function bruteForceMinimumCostSeparator(nodes, edges, costs, sourceId, targetId) {
  const candidates = nodes.map(({ id }) => id).filter((id) => id !== sourceId && id !== targetId);
  const adjacency = new Map(nodes.map(({ id }) => [id, []]));
  for (const { source, target } of edges) {
    adjacency.get(source).push(target);
    adjacency.get(target).push(source);
  }

  let bestCost = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 2 ** candidates.length; mask += 1) {
    const removed = new Set(candidates.filter((_, index) => (mask & (1 << index)) !== 0));
    const visited = new Set([sourceId]);
    const queue = [sourceId];
    for (let head = 0; head < queue.length; head += 1) {
      for (const neighbor of adjacency.get(queue[head])) {
        if (removed.has(neighbor) || visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    if (visited.has(targetId)) continue;
    const cost = [...removed].reduce((sum, id) => sum + costs.get(id), 0);
    bestCost = Math.min(bestCost, cost);
  }
  return Number.isFinite(bestCost) ? bestCost : null;
}

test("Dinic pesato coincide con l'enumerazione indipendente su tutti i grafi semplici non orientati a quattro nodi", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id }));
  const possibleEdges = nodes.flatMap(({ id: source }, left) =>
    nodes.slice(left + 1).map(({ id: target }) => ({ source, target }))
  );

  for (let graphMask = 0; graphMask < 2 ** possibleEdges.length; graphMask += 1) {
    const edges = possibleEdges.filter((_, index) => (graphMask & (1 << index)) !== 0);
    const costs = new Map(nodes.map(({ id }, index) => [id, 1 + ((graphMask * 5 + index * 3) % 11)]));
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const sourceId = nodes[left].id;
        const targetId = nodes[right].id;
        assert.equal(
          minimumCostNodeSeparatorByDinic(nodes, edges, costs, sourceId, targetId),
          bruteForceMinimumCostSeparator(nodes, edges, costs, sourceId, targetId),
          `graph=${graphMask}, terminals=${sourceId},${targetId}`
        );
      }
    }
  }
});

test("Dinic pesato rispetta la direzione e tratta gli archi diretti terminale-terminale come non separabili", () => {
  const nodes = ["s", "a", "b", "t"].map((id) => ({ id }));
  const costs = new Map([["a", 5], ["b", 2]]);
  const edges = [
    { source: "s", target: "a" },
    { source: "a", target: "t" },
    { source: "t", target: "b" },
    { source: "b", target: "s" }
  ];

  assert.equal(minimumCostNodeSeparatorByDinic(nodes, edges, costs, "s", "t", "directed"), 5);
  assert.equal(minimumCostNodeSeparatorByDinic(nodes, [{ source: "s", target: "t" }], costs, "s", "t"), null);
  assert.equal(minimumCostNodeSeparatorByDinic(nodes, [], costs, "s", "t"), 0);
});

test("Dinic pesato rifiuta costi e terminali che non rispettano il contratto", () => {
  const nodes = [{ id: "s" }, { id: "a" }, { id: "t" }];
  const edges = [{ source: "s", target: "a" }, { source: "a", target: "t" }];

  assert.throws(() => minimumCostNodeSeparatorByDinic(nodes, edges, new Map(), "s", "t"), /positive safe integer/);
  assert.throws(() => minimumCostNodeSeparatorByDinic(nodes, edges, new Map([["a", 0]]), "s", "t"), /positive safe integer/);
  assert.throws(() => minimumCostNodeSeparatorByDinic(nodes, edges, new Map([["a", 1]]), "s", "s"), /distinct/);
});

test("la verifica indipendente del separatore controlla raggiungibilità e terminali protetti", () => {
  const nodes = ["s", "a", "b", "t"].map((id) => ({ id }));
  const edges = [
    { source: "s", target: "a" },
    { source: "a", target: "t" },
    { source: "s", target: "b" },
    { source: "b", target: "t" }
  ];

  assert.equal(isNodeSeparator(nodes, edges, ["a", "b"], "s", "t"), true);
  assert.equal(isNodeSeparator(nodes, edges, ["a"], "s", "t"), false);
  assert.equal(isNodeSeparator(nodes, edges, ["s", "a", "b"], "s", "t"), false);
});
