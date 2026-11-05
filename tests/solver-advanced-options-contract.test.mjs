import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");

test("secondary clique-list controls are grouped under closed-by-default advanced options", () => {
  const controlsStart = panel.indexOf('<div class="solver-controls">');
  const advancedStart = panel.indexOf('<details class="solver-advanced-options">', controlsStart);
  const advancedEnd = panel.indexOf("</details>", advancedStart);
  assert.notEqual(controlsStart, -1);
  assert.notEqual(advancedStart, -1);
  assert.notEqual(advancedEnd, -1);

  const primaryControls = panel.slice(controlsStart, advancedStart);
  const advancedOptions = panel.slice(advancedStart, advancedEnd + "</details>".length);
  assert.match(primaryControls, /Gruppo da analizzare/);
  assert.match(primaryControls, /Taglia minima/);
  assert.match(primaryControls, /Mostra solo le clique massime/);
  assert.match(advancedOptions, /<summary>Altre opzioni<\/summary>/);
  assert.doesNotMatch(advancedOptions, /<details[^>]*\bopen(?:\s|=|>)/);
  assert.match(advancedOptions, /Numero iniziale per taglia/);
  assert.match(advancedOptions, /il calcolo non cambia/);
  assert.match(advancedOptions, /Consenti di sfogliare l'intero elenco/);
  assert.match(advancedOptions, /dell'elenco corrente senza rilanciare l'analisi/);
});

test("clique-list exploration remains paginated when full browsing is enabled", () => {
  assert.match(panel, /\{#if showAll\}[\s\S]*?<ResultListPager[\s\S]*?showMore=\{\(\) => showMoreCliques\(group\.size\)\}[\s\S]*?\{\/if\}/);
});
