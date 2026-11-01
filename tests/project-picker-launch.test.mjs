import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const graphApp = readFileSync(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const jsonEditor = readFileSync(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");

test("the empty-graph open-project action opens Data before the project picker", () => {
  assert.match(graphApp, /async function openProjectPickerFromEmptyState\(\)\s*\{\s*openDataPanel\(\);\s*await tick\(\);\s*jsonEditorComponent\?\.openProjectPicker\?\.\(\);\s*\}/);
  assert.match(graphApp, /<button type="button" on:click=\{openProjectPickerFromEmptyState\}>Apri un progetto<\/button>/);
  assert.match(graphApp, /bind:this=\{jsonEditorComponent\}/);
});

test("JsonEditor opens the bound project input", () => {
  assert.match(jsonEditor, /export function openProjectPicker\(\)\s*\{\s*projectFileInput\?\.click\(\);\s*\}/);
  assert.match(jsonEditor, /<input type="file" accept="\.json,application\/json" bind:this=\{projectFileInput\} on:change=\{\(event\) => loadJsonFile\(event, "project"\)\}/);
});
