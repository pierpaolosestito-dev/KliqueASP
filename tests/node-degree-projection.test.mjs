import assert from "node:assert/strict";
import test from "node:test";
import { filterNodeIdsByDegree } from "../src/lib/kliqueasp/graph/nodeDegreeProjection.ts";

const nodes = ["source-only", "sink-only", "through", "isolated"].map((id) => ({ id }));
const directedLinks = [
  { source: "source-only", target: "through" },
  { source: "through", target: "sink-only" }
];
const getNodeId = (node) => node.id;
const getEndpoints = (link) => [link.source, link.target];
const filters = { excludeIsolated: false, excludeWithoutIncoming: false, excludeWithoutOutgoing: false };

test("the undirected isolate filter removes only nodes with no incident record", () => {
  const visible = filterNodeIdsByDegree(nodes, directedLinks, {
    ...filters,
    direction: "undirected",
    excludeIsolated: true,
    getNodeId,
    getLinkEndpoints: getEndpoints
  });
  assert.deepEqual([...visible].sort(), ["sink-only", "source-only", "through"]);
});

test("directed in-degree and out-degree exclusions distinguish sources, sinks, and through-nodes", () => {
  const withoutSources = filterNodeIdsByDegree(nodes, directedLinks, {
    ...filters,
    direction: "directed",
    excludeWithoutIncoming: true,
    getNodeId,
    getLinkEndpoints: getEndpoints
  });
  assert.deepEqual([...withoutSources].sort(), ["sink-only", "through"]);

  const withoutSinks = filterNodeIdsByDegree(nodes, directedLinks, {
    ...filters,
    direction: "directed",
    excludeWithoutOutgoing: true,
    getNodeId,
    getLinkEndpoints: getEndpoints
  });
  assert.deepEqual([...withoutSinks].sort(), ["source-only", "through"]);

  const withBothDirections = filterNodeIdsByDegree(nodes, directedLinks, {
    ...filters,
    direction: "directed",
    excludeWithoutIncoming: true,
    excludeWithoutOutgoing: true,
    getNodeId,
    getLinkEndpoints: getEndpoints
  });
  assert.deepEqual([...withBothDirections], ["through"]);
});

test("degrees are measured inside the candidate projection and keep self-loop nodes non-isolated", () => {
  const visible = filterNodeIdsByDegree(nodes, [
    { source: "source-only", target: "isolated" },
    { source: "through", target: "through" }
  ], {
    ...filters,
    direction: "directed",
    excludeIsolated: true,
    getNodeId,
    getLinkEndpoints: getEndpoints
  });
  assert.deepEqual([...visible].sort(), ["isolated", "source-only", "through"]);

  const induced = filterNodeIdsByDegree(
    nodes.filter(({ id }) => id !== "isolated"),
    [{ source: "source-only", target: "isolated" }],
    {
      ...filters,
      direction: "undirected",
      excludeIsolated: true,
      getNodeId,
      getLinkEndpoints: getEndpoints
    }
  );
  assert.deepEqual([...induced], [], "an edge to a node outside the projection does not keep the candidate visible");
});
