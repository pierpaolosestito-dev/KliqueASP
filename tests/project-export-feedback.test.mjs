import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("project downloads announce the requested filename through a live status", async () => {
  const editor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
  const sandbox = await readFile(new URL("../src/routes/Sandbox/+page.svelte", import.meta.url), "utf8");

  assert.match(editor, /export let onSaveProject: \(\) => string \| void/);
  assert.match(editor, /function requestProjectExport\(\)[\s\S]*?if \(status\) fileMessage = status;/);
  assert.match(editor, /<button class="secondary-button" type="button" on:click=\{requestProjectExport\}>/);
  assert.match(editor, /class="file-message" role="status" aria-live="polite"/);
  assert.match(sandbox, /return `Richiesta di download inviata al browser: \$\{anchor\.download\}`/);
});
