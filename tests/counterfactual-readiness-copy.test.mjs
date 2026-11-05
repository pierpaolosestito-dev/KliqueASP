import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [structural, typedPath, hint] = await Promise.all([
  readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/CounterfactualConfigHint.svelte", import.meta.url), "utf8")
]);

test("structural completion links invalid target input and disabled execution to their reasons", () => {
  assert.match(structural, /aria-invalid=\{invalidTarget \? "true" : undefined\}/);
  assert.match(structural, /aria-describedby=\{running \? "analysis-in-progress-status" : invalidTarget \? "structural-counterfactual-target-error" : undefined\}/);
  assert.match(structural, /id="structural-counterfactual-target-error" class="readiness-message" role="status" aria-live="polite">\{prerequisiteMessage\}/);
  assert.match(structural, /id="structural-counterfactual-unavailable" role="status" aria-live="polite">\{unavailableReason\}/);
  assert.match(structural, /descriptionId="structural-counterfactual-config"/);
  assert.match(structural, /aria-describedby=\{runBlockerDescriptionIds\}/);
  assert.match(structural, /running \? "analysis-in-progress-status" : ""/);
  assert.match(structural, /!unavailableReason && !candidateEnabled \? "structural-counterfactual-config"/);
});

test("typed-path completion connects its prerequisite, configuration, and query messages to the action", () => {
  assert.match(typedPath, /id="typed-path-counterfactual-requirements" class="requirement-reasons" role="status" aria-live="polite"/);
  assert.match(typedPath, /descriptionId="typed-path-counterfactual-config"/);
  assert.match(typedPath, /id="typed-path-counterfactual-readiness" class="readiness-message" role="status" aria-live="polite">\{prerequisiteMessage\}/);
  assert.match(typedPath, /aria-describedby=\{runBlockerDescriptionId\} disabled=\{running \|\| !enabled \|\| requirementReasons.length > 0 \|\| Boolean\(prerequisiteMessage\)\}/);
  assert.match(typedPath, /requirementReasons.length > 0 \? "typed-path-counterfactual-requirements"/);
  assert.match(typedPath, /!enabled && requirementReasons.length === 0 \? "typed-path-counterfactual-config"/);
});

test("counterfactual configuration hints expose a named status when a caller links them", () => {
  assert.match(hint, /export let descriptionId: string \| undefined = undefined/);
  assert.match(hint, /<small id=\{descriptionId\} role=\{descriptionId \? "status" : undefined\}/);
});
