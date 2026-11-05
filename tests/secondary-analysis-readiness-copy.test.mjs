import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [info, contextual] = await Promise.all([
  readFile(new URL("../src/lib/kliqueasp/components/InfoPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8")
]);

test("invalid neighborhood radius explains its graph-dependent range beside the blocked control", () => {
  assert.match(info, /describeNeighborhoodRadiusBlocker\(\{[\s\S]*?radius: neighborhoodRadius,[\s\S]*?maximum: maximumNeighborhoodRadius/);
  assert.match(info, /aria-invalid=\{neighborhoodRadiusBlocker \? "true" : undefined\}/);
  assert.match(info, /aria-describedby=\{neighborhoodRadiusBlocker \? "neighborhood-radius-blocker" : undefined\}/);
  assert.match(info, /id="neighborhood-radius-blocker" class="field-error" role="status" aria-live="polite">\{neighborhoodRadiusBlocker\}/);
  assert.match(info, /disabled=\{!neighborhoodRadiusIsValid\}/);
});

test("contextual-clique action references the existing prerequisite summary", () => {
  assert.match(contextual, /id="contextual-clique-readiness" class="readiness" role="status"/);
  assert.match(contextual, /actionDescriptionIds = \[[\s\S]*?running \? "analysis-in-progress-status" : ""[\s\S]*?!available \|\| !config \? "contextual-clique-readiness"/);
  assert.match(contextual, /aria-describedby=\{actionDescriptionIds\} disabled=\{running \|\| !available \|\| !config\}/);
  assert.match(contextual, /disabledDescriptionId=\{running \? "analysis-in-progress-status" : undefined\}/);
  assert.match(contextual, /aria-describedby=\{running \? "contextual-clique-enumeration-help analysis-in-progress-status" : "contextual-clique-enumeration-help"\} disabled=\{running\}/);
});
