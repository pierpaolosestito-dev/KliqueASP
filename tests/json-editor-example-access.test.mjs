import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const jsonEditor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");

test("example presets stay inside the scrollable data editor instead of the fixed action footer", () => {
  const bodyStart = jsonEditor.indexOf('<div class="json-editor-body">');
  const footerStart = jsonEditor.indexOf('<div class="json-editor-actions">');
  const examples = jsonEditor.indexOf('<details class="example-list">');

  assert.ok(bodyStart >= 0, "the data editor body should exist");
  assert.ok(footerStart > bodyStart, "the fixed action footer should follow the scrollable body");
  assert.ok(examples > bodyStart && examples < footerStart, "example choices should scroll with the editor body");
  assert.match(jsonEditor, /const workspaceExamples = getGraphExampleCatalog\(base\)\.filter\(\(example\) => example\.opensWorkspaceExample\)/);
  assert.match(jsonEditor, /<summary>Apri un esempio in una nuova scheda<\/summary>/);
  assert.match(jsonEditor, /<a class="example-link" href=\{example\.href\} target="_blank" rel="noopener">/);
  assert.doesNotMatch(jsonEditor, /on:click=\{onLoad(?:Davis|Karate|GahukuGama|TemporalEdges|InVS(?:Full)?)\}/);
  assert.match(jsonEditor, /<div class="project-file-actions" role="group" aria-label="Azioni progetto">[\s\S]*?Nuovo[\s\S]*?Apri progetto[\s\S]*?Esporta progetto/);
  assert.match(jsonEditor, /<div class="source-data-actions" role="group" aria-label="Carica dati e configurazione">[\s\S]*?Carica dataset JSON[\s\S]*?Carica configurazione/);
});
