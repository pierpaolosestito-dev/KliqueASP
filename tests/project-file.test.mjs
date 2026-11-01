import test from "node:test";
import assert from "node:assert/strict";
import { buildKliqueAspProject, parseKliqueAspProject, validateGraphDataset } from "../src/lib/kliqueasp/graph/projectFile.ts";

test("project bundle preserves the source graph and configuration", () => {
  const graphConfig = { schemaVersion: 2, graphMapping: { edge: { typeField: "$.kind" } } };
  const graphData = {
    metadata: { name: "typed graph" },
    nodes: [{ id: "a", label: "Alpha", type: "person" }],
    edges: [{ id: "edge-1", source: "a", target: "b", type: "trust" }]
  };
  const project = buildKliqueAspProject(graphConfig, graphData);
  assert.equal(project.format, "kliqueasp-project");
  assert.equal(project.version, 1);
  assert.deepEqual(parseKliqueAspProject(project), project);
  assert.deepEqual(project.graphData, graphData);
});

test("project reader accepts supported links alias without rewriting it", () => {
  const project = {
    format: "kliqueasp-project",
    version: 1,
    graphConfig: {},
    graphData: { nodes: [{ id: 1 }], links: [{ source: 1, target: 1, type: "loop" }] }
  };
  assert.deepEqual(parseKliqueAspProject(project), project);
});

test("project and dataset validation report unsupported JSON shapes", () => {
  assert.throws(() => validateGraphDataset({ nodes: [] }), /edges.*links/);
  assert.throws(() => buildKliqueAspProject([], { nodes: [], edges: [] }), /configurazione/);
  assert.throws(() => parseKliqueAspProject({ format: "other", version: 1 }), /Formato progetto/);
  assert.throws(() => parseKliqueAspProject({ format: "kliqueasp-project", version: 1, graphConfig: {}, graphData: {} }), /nodes/);
});
