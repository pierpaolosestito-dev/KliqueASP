import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("project downloads announce the requested filename through a live status", async () => {
  const editor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
  const sandbox = await readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8");
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

  assert.match(editor, /export let projectName: string/);
  assert.match(editor, /id="workbench-project-name"[\s\S]*?on:input=\{\(event\) => onProjectNameChange/);
  assert.match(editor, /onDatasetTextChange\(JSON\.stringify\(parsed, null, 2\), file\.name\.replace\(/);
  assert.match(editor, /export let onSaveProject: \(\) => string \| void/);
  assert.match(editor, /function requestProjectExport\(\)[\s\S]*?if \(status\) fileMessage = status;/);
  assert.match(editor, /<button class="secondary-button" type="button" on:click=\{requestProjectExport\}>/);
  assert.doesNotMatch(editor, /\{#if fileMessage\}/);
  assert.match(editor, /class="file-message"[\s\S]{0,140}class:has-message=\{Boolean\(fileMessage\.trim\(\)\)\}[\s\S]{0,100}role="status"[\s\S]{0,60}aria-live="polite"[\s\S]{0,40}aria-atomic="true"[\s\S]{0,80}>\{fileMessage\.trim\(\)\}<\/p>/);
  assert.match(editor, /class="session-status"[\s\S]{0,140}class:has-message=\{Boolean\(sessionStatus\.trim\(\)\)\}[\s\S]{0,100}role="status"[\s\S]{0,60}aria-live="polite"[\s\S]{0,40}aria-atomic="true"[\s\S]{0,80}>\{sessionStatus\.trim\(\)\}<\/p>/);
  assert.match(editor, /\.file-message:not\(\.has-message\),?\s*\.session-status:not\(\.has-message\)|\.session-status:not\(\.has-message\),\s*\.file-message:not\(\.has-message\)/);
  assert.match(sandbox, /buildKliqueAspProject\(JSON\.parse\(configText\), JSON\.parse\(datasetText\), projectName\)/);
  assert.match(sandbox, /onDatasetTextChange: \(value: string, sourceName\?: string\) => \{\s*datasetText = value;\s*if \(sourceName\) projectName = normalizeKliqueAspProjectName\(sourceName\);/);
  assert.match(sandbox, /anchor\.download = createKliqueAspProjectFilename\(projectName\)/);
  assert.match(sandbox, /return `Richiesta di download inviata al browser: \$\{anchor\.download\}`/);
  assert.match(graphApp, /<span class="project-name-control desktop-toolbar-control"[\s\S]*?jsonEditorProps\?\.projectName[\s\S]*?<\/span>/);
  assert.doesNotMatch(graphApp, /class="toolbar-export-status[^\"]*"[^>]*>Modifiche da esportare/);
  assert.doesNotMatch(graphApp, /project-name-control[^>]*on:click/);
  assert.match(graphApp, /jsonEditorProps\?\.projectName\?\.trim\(\) \|\| "Progetto senza nome"/);
});
