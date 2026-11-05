import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const editor = await readFile(
  new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url),
  "utf8"
);

test("JSON validation announces the short state without rereading the diagnostic panel", () => {
  const validation = editor.match(/<section\s+class="input-validation"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.ok(validation, "riquadro di validazione non trovato");
  const sectionOpeningTag = validation.slice(0, validation.indexOf(">") + 1);
  assert.doesNotMatch(sectionOpeningTag, /aria-live=/, "il contenitore dei dettagli non deve annunciare tutto il pannello");

  const liveState = validation.match(/<span\s+[\s\S]*?class="validation-state"[\s\S]*?<\/span>/)?.[0] ?? "";
  assert.ok(liveState, "regione di stato sintetico non trovata");
  assert.match(liveState, /class:has-message=\{Boolean\(draftValidationPending \|\| draftValidation\)\}/);
  assert.match(liveState, /role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"/);
  assert.match(liveState, /Controllo in corso…/);
  assert.match(liveState, /Pronto con avvisi/);
  assert.match(liveState, /Da correggere/);

  assert.match(validation, /formatGraphDiagnostic\(diagnostic\)/,
    "le diagnosi dettagliate restano visibili e navigabili fuori dalla regione live");
  assert.match(editor, /\.validation-state:not\(\.has-message\)/,
    "lo stato vuoto non deve occupare spazio nel layout");
});
