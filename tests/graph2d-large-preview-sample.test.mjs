import assert from "node:assert/strict";
import test from "node:test";
import { sampleGraph2DProjectionPreview } from "../src/lib/kliqueasp/graph/graph2dExport.ts";

const nodes = Array.from({ length: 20 }, (_, index) => ({ id: `node-${index}` }));
const links = Array.from({ length: 90 }, (_, index) => ({
  source: `node-${index % nodes.length}`,
  target: `node-${(index * 7 + 3) % nodes.length}`,
  sourceId: `rating-${index}`
}));

test("large projection preview sampling is deterministic and stays within its display budget", () => {
  const options = { maxNodes: 8, maxEdges: 12 };
  const first = sampleGraph2DProjectionPreview(nodes, links, options);
  const second = sampleGraph2DProjectionPreview(nodes, links, options);

  assert.equal(first.totalNodeCount, 20);
  assert.equal(first.totalEdgeCount, 90);
  assert.ok(first.nodes.length <= options.maxNodes);
  assert.ok(first.links.length <= options.maxEdges);
  assert.deepEqual(first.nodes.map(({ id }) => id), second.nodes.map(({ id }) => id));
  assert.deepEqual(first.links.map(({ sourceId }) => sourceId), second.links.map(({ sourceId }) => sourceId));
  const sampledIds = new Set(first.nodes.map(({ id }) => id));
  assert.ok(first.links.every(({ source, target }) => sampledIds.has(source) && sampledIds.has(target)));
});

test("highlighted nodes and source records are retained when the sample budget permits", () => {
  const firstLinkId = `source:${String(links[0].sourceId)}`;
  const firstLink = links[0];
  const sample = sampleGraph2DProjectionPreview(nodes, links, {
    maxNodes: 4,
    maxEdges: 4,
    highlightedNodeIds: ["node-19"],
    highlightedEdgeIds: [firstLinkId]
  });

  const nodeIds = new Set(sample.nodes.map(({ id }) => id));
  assert.ok(nodeIds.has("node-19"));
  assert.ok(nodeIds.has(firstLink.source));
  assert.ok(nodeIds.has(firstLink.target));
  assert.ok(sample.links.some(({ sourceId }) => `source:${sourceId}` === firstLinkId));
});

test("absence markers are not counted or drawn as observed projection records", () => {
  const sample = sampleGraph2DProjectionPreview(nodes.slice(0, 2), [
    { source: "node-0", target: "node-1", sourceId: "observed" },
    { source: "node-0", target: "node-1", sourceId: "absence", absence: true }
  ]);
  assert.equal(sample.totalEdgeCount, 1);
  assert.deepEqual(sample.links.map(({ sourceId }) => sourceId), ["observed"]);
});
