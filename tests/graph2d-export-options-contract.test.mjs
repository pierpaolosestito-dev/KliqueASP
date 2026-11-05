import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("common graph export choices stay visible while custom dimensions are secondary", () => {
  const controlsStart = panel.indexOf('<aside class="controls"');
  const advancedStart = panel.indexOf('<details class="advanced-export-options">', controlsStart);
  const advancedEnd = panel.indexOf("</details>", advancedStart);
  assert.notEqual(controlsStart, -1);
  assert.notEqual(advancedStart, -1);
  assert.notEqual(advancedEnd, -1);

  const visibleControls = panel.slice(controlsStart, advancedStart);
  const advancedOptions = panel.slice(advancedStart, advancedEnd + "</details>".length);
  assert.match(visibleControls, /Proiezione completa/);
  assert.match(visibleControls, /Solo risultato selezionato/);
  assert.match(visibleControls, /<legend>Visualizzazione<\/legend>/);
  assert.match(visibleControls, /Zoom anteprima/);
  assert.match(visibleControls, /Sfondo trasparente/);
  assert.match(advancedOptions, /<summary>Altre opzioni<\/summary>/);
  assert.doesNotMatch(advancedOptions, /<details[^>]*\bopen(?:\s|=|>)/);
  assert.match(advancedOptions, /Dimensioni personalizzate/);
  assert.match(advancedOptions, /bind:value=\{width\}/);
  assert.match(advancedOptions, /bind:value=\{height\}/);
  assert.match(advancedOptions, /step="1" bind:value=\{width\} aria-invalid=\{widthBlocker/);
  assert.match(advancedOptions, /step="1" bind:value=\{height\} aria-invalid=\{heightBlocker/);
});

test("custom export dimensions continue to reach the generated image", () => {
  assert.match(panel, /width: resolvedWidth,\s*height: resolvedHeight,/);
  assert.match(panel, /canvas\.width = image\.naturalWidth \|\| scene\?\.width \|\| resolvedWidth \|\| 1280/);
  assert.match(panel, /canvas\.height = image\.naturalHeight \|\| scene\?\.height \|\| resolvedHeight \|\| 820/);
  assert.match(panel, /svgOutputSizeLabel = svgOutputDimensions/);
});

test("invalid custom dimensions suspend the preview and disable both exports with linked guidance", () => {
  assert.match(panel, /scene = open && \(!exportTooLarge \|\| isSampledProjectionPreview\) && resolvedWidth !== null && resolvedHeight !== null/);
  assert.match(panel, /dimensionBlocker = \[widthBlocker, heightBlocker\]/);
  assert.match(panel, /id="graph2d-export-dimensions-blocker"[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?aria-atomic="true"[\s\S]*?>\{dimensionBlocker\}<\/small>/);
  assert.match(panel, /Correggi le dimensioni dell’immagine/);
  assert.match(panel, /disabled=\{!svg \|\| exportTooLarge \|\| Boolean\(dimensionBlocker\)\}/);
  assert.match(panel, /aria-describedby=\{exportBlockerDescriptionIds\}/);
});

test("configured node type colors reach the 2D preview and its SVG legend", () => {
  assert.match(graphApp, /nodeTypeStyles=\{GRAPH_CONFIG\.nodeTypes\}/);
  assert.match(panel, /export let nodeTypeStyles: unknown = \{\}/);
  assert.match(panel, /edgeColors,\s*nodeTypeStyles,\s*nodeColors:/);
});
