import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKliqueAspProject,
  createKliqueAspProjectFilename,
  DEFAULT_KLIQUEASP_PROJECT_NAME,
  normalizeKliqueAspProjectName,
  parseKliqueAspProject,
  validateGraphDataset
} from "../src/lib/kliqueasp/graph/projectFile.ts";

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

test("project names round-trip while older unnamed project files remain valid", () => {
  const named = buildKliqueAspProject({}, { nodes: [], edges: [] }, "Rete psicologi");
  assert.equal(named.name, "Rete psicologi");
  assert.equal(parseKliqueAspProject(named).name, "Rete psicologi");

  const legacy = parseKliqueAspProject({
    format: "kliqueasp-project",
    version: 1,
    metadata: { source: "external-tool" },
    graphConfig: {},
    graphData: { nodes: [], edges: [] }
  });
  assert.equal(legacy.name, undefined);
  assert.equal("name" in legacy, false);
  assert.deepEqual(legacy.metadata, { source: "external-tool" });
});

test("project names are bounded, normalized and safe in portable filenames", () => {
  assert.equal(normalizeKliqueAspProjectName("  Rete\n   psicologi  "), "Rete psicologi");
  assert.equal(normalizeKliqueAspProjectName("\u0000\u0007"), DEFAULT_KLIQUEASP_PROJECT_NAME);
  assert.equal(normalizeKliqueAspProjectName("x".repeat(120)).length, 100);
  assert.equal(createKliqueAspProjectFilename("Psicologi: Italia / rete?", new Date("2026-11-03T12:00:00Z")), "kliqueasp-psicologi-italia-rete-2026-11-03.json");
  assert.equal(createKliqueAspProjectFilename("東京", new Date("2026-11-03T12:00:00Z")), "kliqueasp-progetto-2026-11-03.json");
});

test("project and dataset validation report unsupported JSON shapes", () => {
  assert.throws(() => validateGraphDataset({ nodes: [] }), /edges.*links/);
  assert.throws(() => buildKliqueAspProject([], { nodes: [], edges: [] }), /configurazione/);
  assert.throws(() => parseKliqueAspProject({ format: "other", version: 1 }), /Formato progetto/);
  assert.throws(() => parseKliqueAspProject({ format: "kliqueasp-project", version: 1, graphConfig: {}, graphData: {} }), /nodes/);
});
