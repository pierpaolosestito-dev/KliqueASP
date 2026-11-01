import test from "node:test";
import assert from "node:assert/strict";
import { buildKliqueAspProject } from "../src/lib/kliqueasp/graph/projectFile.ts";
import { readGraphJsonUpload } from "../src/lib/kliqueasp/graph/graphJsonUpload.ts";

function mockFile(text) {
  return { text: async () => text };
}

test("dataset uploads must be JSON objects with node and edge collections", async () => {
  const dataset = { nodes: [{ id: "a" }], edges: [] };
  assert.deepEqual(await readGraphJsonUpload(mockFile(JSON.stringify(dataset)), "dataset"), dataset);
  await assert.rejects(readGraphJsonUpload(mockFile(JSON.stringify({ nodes: [] })), "dataset"), /array 'nodes' e un array 'edges' o 'links'/);
  await assert.rejects(readGraphJsonUpload(mockFile("[]"), "dataset"), /oggetto/);
});

test("configuration uploads preserve valid JSON objects", async () => {
  const config = { schemaVersion: 2, solver: { taskTimeoutMs: 45_000 } };
  assert.deepEqual(await readGraphJsonUpload(mockFile(JSON.stringify(config)), "config"), config);
  await assert.rejects(readGraphJsonUpload(mockFile("null"), "config"), /oggetto/);
});

test("project uploads validate the project envelope and graph data", async () => {
  const project = buildKliqueAspProject({ solver: { taskTimeoutMs: 30_000 } }, { nodes: [], edges: [] });
  assert.deepEqual(await readGraphJsonUpload(mockFile(JSON.stringify(project)), "project"), project);
  await assert.rejects(readGraphJsonUpload(mockFile(JSON.stringify({ format: "other", version: 1 })), "project"), /Formato progetto non riconosciuto/);
});

test("malformed JSON and read failures stay visible to the caller", async () => {
  await assert.rejects(readGraphJsonUpload(mockFile("{"), "dataset"), SyntaxError);
  await assert.rejects(readGraphJsonUpload({ text: async () => { throw new Error("read failed"); } }, "dataset"), /read failed/);
});
