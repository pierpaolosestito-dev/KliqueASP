import assert from "node:assert/strict";
import test from "node:test";
import { projectVisibleNodeIds } from "../src/lib/kliqueasp/graph/visibleNodeProjection.ts";

const nodes = [
  { id: "anchor", type: "person", start: 5, end: 10, group: "A" },
  { id: "context-a", type: "person", group: "A" },
  { id: "context-b", type: "person", group: "B" },
  { id: "always", type: "system", group: "A", alwaysVisible: true },
  { id: "filtered", type: "hidden", group: "A" }
];

const linksA = [
  { source: "anchor", target: "context-a" },
  { source: "anchor", target: "filtered" }
];
const linksB = [{ source: "anchor", target: "context-b" }];

function project(links, overrides = {}) {
  return projectVisibleNodeIds({
    nodes,
    links,
    mode: "graph-aware",
    currentStart: 6,
    currentEnd: 6,
    getNodeId: (node) => node.id,
    getLinkEndpoints: (link) => [link.source, link.target],
    getTimelineInterval: (node) => Number.isFinite(node.start) && Number.isFinite(node.end)
      ? { start: node.start, end: node.end }
      : null,
    isAlwaysVisible: (node) => node.alwaysVisible === true,
    passesTypeFilter: (node) => node.type !== "hidden",
    passesGroupFilter: () => true,
    passesTimeline: (node) => node.start === undefined || (node.start <= 6 && node.end >= 6),
    ...overrides
  });
}

test("graph-aware scenario projections expand the same temporal cohort through scenario-specific edges", () => {
  assert.deepEqual([...project(linksA)].sort(), ["always", "anchor", "context-a"]);
  assert.deepEqual([...project(linksB)].sort(), ["always", "anchor", "context-b"]);
});

test("type and group filters apply after expansion, while always-visible nodes remain included", () => {
  const visible = project(linksA, {
    passesGroupFilter: (node) => node.group === "A"
  });
  assert.deepEqual([...visible].sort(), ["always", "anchor", "context-a"]);
});

test("graph-aware fallback preserves the existing simple timeline behavior when expansion is empty", () => {
  const visible = project([], {
    getTimelineInterval: () => null,
    isAlwaysVisible: () => false,
    passesGroupFilter: (node) => node.id === "context-a" || node.id === "always"
  });
  assert.deepEqual([...visible].sort(), ["always", "context-a"]);
});

test("simple mode uses time and view filters but does not expand through links", () => {
  const visibleA = project(linksA, {
    mode: "simple",
    passesGroupFilter: (node) => node.group === "A"
  });
  const visibleB = project(linksB, {
    mode: "simple",
    passesGroupFilter: (node) => node.group === "A"
  });
  assert.deepEqual([...visibleA].sort(), ["always", "anchor", "context-a"]);
  assert.deepEqual([...visibleB].sort(), [...visibleA].sort());
});
