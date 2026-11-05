import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../src/routes/+page.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const exportPanel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");

test("home section labels use ordinary Italian casing and restrained tracking", () => {
  assert.match(home, /<p class="eyebrow"><span><\/span> Analisi di rete<\/p>/);
  assert.match(home, /<p class="case-study-eyebrow">Caso di studio<\/p>/);
  assert.match(home, /<p class="case-study-eyebrow">Esempi<\/p>/);
  assert.doesNotMatch(home, /\b(?:CATALOGO|ANALISI DI RETI|CASO STUDIO)\b/);
  assert.match(home, /\.eyebrow \{[^}]*letter-spacing: \.01em/);
  assert.match(home, /\.case-study-eyebrow \{[^}]*letter-spacing: \.01em/);
});

test("workspace labels stay sentence-case and analysis navigation does not simulate all-caps headings", () => {
  assert.match(graphApp, /KliqueASP · Analisi di rete/);
  assert.match(graphApp, /\.toolbar-menu \.menu-group > span \{[^}]*letter-spacing: \.01em/);
  assert.doesNotMatch(graphApp, /\.toolbar-menu \.menu-group > span \{[^}]*text-transform: uppercase/);
  assert.match(exportPanel, /<p class="eyebrow">Esporta in 2D<\/p>/);
  assert.doesNotMatch(exportPanel, /<p class="eyebrow">ESPORTA<\/p>/);
});
