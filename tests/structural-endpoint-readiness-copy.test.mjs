import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url),
  "utf8"
);

test("disabled structural runs expose their endpoint blocker next to the controls", () => {
  const blockerPosition = component.indexOf('id="structural-endpoint-blocker"');
  const runButtonPosition = component.indexOf('class="run"', blockerPosition);
  assert.ok(blockerPosition >= 0 && runButtonPosition > blockerPosition,
    "il motivo deve precedere il comando di esecuzione disabilitato");
  assert.match(component, /role="status" aria-live="polite">\{structuralEndpointBlocker\}/);
  assert.match(component, /structuralEndpointBlocker && !running && taskRequirementsAvailable \? "structural-endpoint-blocker"/);
  const runButtonEnd = component.indexOf(">", runButtonPosition);
  const runButton = component.slice(runButtonPosition, runButtonEnd);
  assert.match(runButton, /aria-describedby=\{structuralRunDescriptionIds\}/);
});
