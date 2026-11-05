import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url),
  "utf8"
);

test("disabled structural runs explain invalid numeric parameters beside the input", () => {
  assert.match(component, /aria-invalid=\{parameterBlocker \? "true" : undefined\}/);
  assert.match(component, /aria-describedby=\{parameterBlocker && !running \? "structural-parameter-blocker" : undefined\}/);
  assert.match(component, /id="structural-parameter-blocker" class="field-note field-error" role="status" aria-live="polite">\{parameterBlocker\}/);
  assert.match(component, /\{#if parameterBlocker && !running\}/);
});

test("both community count controls identify their invalid interval", () => {
  const communityInputs = component.slice(component.indexOf('class="community-count-field"'), component.indexOf("<small class=\"field-note\">0 significa"));
  assert.equal((communityInputs.match(/aria-invalid=\{communityCountBlocker \? "true" : undefined\}/g) ?? []).length, 2);
  assert.equal((communityInputs.match(/aria-describedby=\{communityCountBlocker && !running \? "community-count-blocker" : undefined\}/g) ?? []).length, 2);
  assert.match(component, /id="community-count-blocker" class="field-note field-error" role="status" aria-live="polite">\{communityCountBlocker\}/);
});

test("directed k-core explains its required degree semantic and connects it to the run action", () => {
  assert.match(component, /aria-invalid=\{kCoreModeBlocker \? "true" : undefined\}/);
  assert.match(component, /aria-describedby=\{kCoreModeBlocker && !running \? "k-core-mode-blocker" : undefined\}/);
  assert.match(component, /id="k-core-mode-blocker" class="field-note field-error" role="status" aria-live="polite">\{kCoreModeBlocker\}/);
  assert.match(component, /kCoreModeBlocker && !running \? "k-core-mode-blocker"/);
  assert.match(component, /id="structural-task-readiness" class="task-readiness-card"/);
  assert.match(component, /!taskRequirementsAvailable \? "structural-task-readiness"/);
});
