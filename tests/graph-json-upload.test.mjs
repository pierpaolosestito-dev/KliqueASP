import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildKliqueAspProject } from "../src/lib/kliqueasp/graph/projectFile.ts";
import { GraphJsonUploadReadError, readGraphJsonUpload } from "../src/lib/kliqueasp/graph/graphJsonUpload.ts";

const jsonEditor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");

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
  await assert.rejects(
    readGraphJsonUpload({ text: async () => { throw new Error("read failed"); } }, "dataset"),
    (error) => {
      assert.ok(error instanceof GraphJsonUploadReadError);
      assert.equal(error.message, "Non è stato possibile leggere il file JSON. Selezionalo di nuovo o verifica che sia accessibile.");
      assert.equal(error.technicalDetails, "read failed");
      return true;
    }
  );
});

test("JSON editor gives malformed uploads an Italian summary and hides parser details on request", () => {
  assert.match(jsonEditor, /error instanceof SyntaxError\) \{\s*fileError = "Il file selezionato non contiene JSON valido\. Correggi la sintassi e riprova\."/);
  assert.match(jsonEditor, /<p role="alert">\{fileError\}<\/p>[\s\S]*?<summary>Dettagli tecnici<\/summary>[\s\S]*?<pre>\{fileErrorDetails\}<\/pre>/);
  assert.match(jsonEditor, /error instanceof GraphJsonUploadReadError/);
});
