import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(
  new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url),
  "utf8"
);

test("Escape closes the focused toolbar disclosure before compact-panel handling", () => {
  const helperStart = graphApp.indexOf("function closeOpenToolbarMenuOnEscape(");
  const helperEnd = graphApp.indexOf("\n  function handleAnalysisPanelKeydown(", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "gestore Escape dei menu toolbar non trovato");

  const helper = graphApp.slice(helperStart, helperEnd);
  assert.match(helper, /event\.key !== "Escape"/);
  assert.match(helper, /event\.defaultPrevented/);
  assert.match(helper, /event\.target\.closest\("dialog\[open\]"\)/);
  assert.match(helper, /event\.target\.closest<HTMLDetailsElement>\("details\[open\]"\)/);
  assert.match(helper, /toolbarElement\.contains\(event\.target\) && !focusedMenu/);
  assert.match(helper, /toolbarElement\.querySelectorAll<HTMLDetailsElement>\("details\[open\]"\)/);
  assert.match(helper, /menu\.open = false/);
  assert.match(helper, /menu\.querySelector<HTMLElement>\(":scope > summary"\)\?\.focus\(\{ preventScroll: true \}\)/);

  const keydownStart = graphApp.indexOf("function handleAnalysisPanelKeydown(");
  const keydownEnd = graphApp.indexOf("\n  }", keydownStart);
  const keydown = graphApp.slice(keydownStart, keydownEnd);
  assert.match(keydown, /if \(closeOpenToolbarMenuOnEscape\(event\)\) return;\s*if \(!compactAnalysisViewport\) return;/);
});

