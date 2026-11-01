import test from "node:test";
import assert from "node:assert/strict";
import { getGraphLinkOpacity } from "../src/lib/kliqueasp/graph/graphLinkOpacity.ts";

test("sparse graphs retain the configured link opacity", () => {
  assert.equal(getGraphLinkOpacity({ configuredOpacity: 0.4, nodeCount: 40, linkCount: 20 }), 0.4);
});

test("dense undirected graphs reduce line opacity", () => {
  assert.ok(Math.abs(getGraphLinkOpacity({ configuredOpacity: 0.4, nodeCount: 40, linkCount: 760 }) - 0.14) < 1e-9);
});

test("density uses the directed edge capacity when the graph is directed", () => {
  assert.ok(Math.abs(getGraphLinkOpacity({ configuredOpacity: 0.4, nodeCount: 40, linkCount: 760, directed: true }) - 0.22) < 1e-9);
});

test("highlighted links restore the configured opacity", () => {
  assert.equal(getGraphLinkOpacity({
    configuredOpacity: 0.4,
    nodeCount: 40,
    linkCount: 760,
    hasHighlightedLinks: true
  }), 0.4);
});

test("opacity is bounded and a zero setting remains invisible", () => {
  assert.equal(getGraphLinkOpacity({ configuredOpacity: 3, nodeCount: 2, linkCount: 1 }), 0.35);
  assert.equal(getGraphLinkOpacity({ configuredOpacity: 0, nodeCount: 40, linkCount: 760 }), 0);
  assert.equal(getGraphLinkOpacity({ configuredOpacity: Number.NaN, nodeCount: 2, linkCount: 0 }), 0.4);
});
