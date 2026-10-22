import assert from "node:assert/strict";
import test from "node:test";
import {
  isEdgeSeparator,
  minimumCostEdgeSeparatorByDinic
} from "../scripts/lib/weighted-edge-separator-reference.mjs";

function bruteForceMinimumCostEdgeCut(nodes, edges, costs, sourceId, targetId, direction = "undirected") {
  let bestCost = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 2 ** edges.length; mask += 1) {
    const removed = new Set(edges.filter((_, index) => (mask & (1 << index)) !== 0).map(({ id }) => id));
    const adjacency = new Map(nodes.map(({ id }) => [id, []]));
    for (const edge of edges) {
      if (removed.has(edge.id)) continue;
      adjacency.get(edge.source).push(edge.target);
      if (direction === "undirected") adjacency.get(edge.target).push(edge.source);
    }
    const visited = new Set([sourceId]);
    const queue = [sourceId];
    for (let head = 0; head < queue.length; head += 1) {
      for (const neighbor of adjacency.get(queue[head])) {
        if (visited.has(neighbor)) continue;
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

test("Dinic pesato sugli archi coincide con enumerazione esaustiva su tutti i grafi semplici a quattro nodi", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({ id }));
  const possiblePairs = nodes.flatMap(({ id: source }, left) =>
    nodes.slice(left + 1).map(({ id: target }) => ({ source, target }))
  );

  for (let graphMask = 0; graphMask < 2 ** possiblePairs.length; graphMask += 1) {
    const edges = possiblePairs
      .filter((_, index) => (graphMask & (1 << index)) !== 0)
      .map((edge, index) => ({ ...edge, id: `edge_${index}` }));
    const costs = new Map(edges.map(({ id }, index) => [id, 1 + ((graphMask * 7 + index * 5) % 13)]));
    for (let left = 0; left < nodes.length; left += 1) {
      for (let right = left + 1; right < nodes.length; right += 1) {
        const sourceId = nodes[left].id;
        const targetId = nodes[right].id;
        assert.equal(
          minimumCostEdgeSeparatorByDinic(nodes, edges, costs, sourceId, targetId),
          bruteForceMinimumCostEdgeCut(nodes, edges, costs, sourceId, targetId),
          `graph=${graphMask}, terminals=${sourceId},${targetId}`
        );
      }
    }
  }
});

test("Dinic pesato sugli archi rispetta direzione e identità separata degli archi paralleli", () => {
  const nodes = ["s", "a", "b", "t"].map((id) => ({ id }));
  const edges = [
    { id: "sa", source: "s", target: "a" },
    { id: "at", source: "a", target: "t" },
    { id: "tb", source: "t", target: "b" },
    { id: "bs", source: "b", target: "s" }
  ];
  const costs = new Map([["sa", 5], ["at", 3], ["tb", 2], ["bs", 4]]);

  assert.equal(minimumCostEdgeSeparatorByDinic(nodes, edges, costs, "s", "t", "directed"), 3);
  assert.equal(minimumCostEdgeSeparatorByDinic(nodes, edges, costs, "s", "t", "undirected"), 5);

  const parallel = [
    { id: "cheap", source: "s", target: "a" },
    { id: "costly", source: "s", target: "a" },
    { id: "finish", source: "a", target: "t" }
  ];
  const parallelCosts = new Map([["cheap", 2], ["costly", 3], ["finish", 9]]);
  const parallelNodes = ["s", "a", "t"].map((id) => ({ id }));
  assert.equal(minimumCostEdgeSeparatorByDinic(parallelNodes, parallel, parallelCosts, "s", "t"), 5);
  assert.equal(isEdgeSeparator(parallelNodes, parallel, ["cheap"], "s", "t"), false);
  assert.equal(isEdgeSeparator(parallelNodes, parallel, ["cheap", "costly"], "s", "t"), true);
});

test("Dinic pesato sugli archi tratta proiezioni disconnesse e input malformati", () => {
  const nodes = [{ id: "s" }, { id: "a" }, { id: "t" }];
  assert.equal(minimumCostEdgeSeparatorByDinic(nodes, [], new Map(), "s", "t"), 0);
  assert.equal(isEdgeSeparator(nodes, [], [], "s", "t"), true);
  assert.throws(() => minimumCostEdgeSeparatorByDinic(nodes, [{ id: "e", source: "s", target: "a" }], new Map(), "s", "t"), /positive safe integer/);
  assert.throws(() => minimumCostEdgeSeparatorByDinic(nodes, [], new Map(), "s", "s"), /distinct/);
});
