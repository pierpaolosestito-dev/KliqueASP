import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("resetting the sample graph requires a clear inline confirmation before replacing user data", () => {
  assert.match(editor, /on:click=\{requestResetConfirmation\}[\s\S]*?Ripristina esempio iniziale/);
  assert.match(editor, /Dataset e configurazione saranno sostituiti con l'esempio iniziale\. Esporta il progetto per conservarne una copia\./);
  assert.match(editor, /<button[^>]*on:click=\{confirmResetExample\}[^>]*>Sostituisci con l'esempio<\/button>/);

  const confirmStart = editor.indexOf("async function confirmResetExample()");
  const confirmEnd = editor.indexOf("\n  }", confirmStart);
  const confirmFunction = editor.slice(confirmStart, confirmEnd);
  assert.match(confirmFunction, /showResetConfirmation = false;/);
  assert.match(confirmFunction, /onReset\(\);/);
  assert.match(confirmFunction, /resetExampleButton\?\.focus\(\)/);
});

test("the reset confirmation can be dismissed by button or Escape and returns keyboard focus", () => {
  assert.match(editor, /Annulla<\/button>/);
  assert.match(editor, /function handleResetConfirmationKeydown\(event: KeyboardEvent\)[\s\S]*?event\.key !== "Escape"[\s\S]*?cancelResetConfirmation\(\)/);
  assert.equal((editor.match(/on:keydown=\{handleResetConfirmationKeydown\}/g) ?? []).length, 2);
  assert.match(editor, /async function cancelResetConfirmation\(\)[\s\S]*?resetExampleButton\?\.focus\(\)/);
  assert.match(editor, /aria-labelledby="reset-example-title"[\s\S]*aria-describedby="reset-example-description"/);
});

test("the empty-graph onboarding can still load the starter example directly", () => {
  assert.match(graphApp, /\{#if JsonEditor && \(data\?\.nodes\?\.length \?\? 0\) === 0\}[\s\S]*?on:click=\{\(\) => jsonEditorProps\.onReset\(\)\}>Prova un esempio/);
});
