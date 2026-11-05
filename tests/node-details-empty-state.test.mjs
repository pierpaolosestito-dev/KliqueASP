import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { hasNodeDetailContent } from "../src/lib/kliqueasp/graph/nodeDetails.ts";

const infoPanel = await readFile(new URL("../src/lib/kliqueasp/components/InfoPanel.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("detects visible detail content for custom nodes, psychology nodes, and image failures", () => {
  assert.equal(hasNodeDetailContent({ details: null, genericDetailCount: 0 }), false);
  assert.equal(hasNodeDetailContent({ details: { tipo: "organization" }, genericDetailCount: 0 }), false);
  assert.equal(hasNodeDetailContent({ details: { tipo: "organization" }, genericDetailCount: 1 }), true);
  assert.equal(hasNodeDetailContent({ details: { tipo: "person", roles: [] }, genericDetailCount: 0 }), false);
  assert.equal(hasNodeDetailContent({
    details: { tipo: "person", roles: [{ professione: "Psicologa" }] },
    genericDetailCount: 0
  }), true);
  assert.equal(hasNodeDetailContent({ details: { tipo: "place", citta: "Roma" }, genericDetailCount: 0 }), true);
  assert.equal(hasNodeDetailContent({
    details: { tipo: "place", immagine_url: "missing.png" },
    genericDetailCount: 0,
    failedImageUrl: "missing.png"
  }), false);
  assert.equal(hasNodeDetailContent({
    details: { tipo: "place", immagine_url: "place.png" },
    genericDetailCount: 0,
    resolveImageUrl: (url) => `/assets/${url}`
  }), true);
});

test("empty node details explain the missing content and link to data mapping", () => {
  assert.match(infoPanel, /hasNodeDetailContent\(\{/);
  assert.match(infoPanel, /\{#if !hasVisibleNodeDetails\}/);
  assert.match(infoPanel, /Questo nodo non ha attributi di dettaglio valorizzati/);
  assert.match(infoPanel, /I dati di dettaglio per questo nodo non sono presenti nel progetto/);
  assert.match(infoPanel, /Puoi associare altri campi del nodo in Dati e configurazione/);
  assert.match(infoPanel, />Configura campi in Dati<\/button>/);
  assert.doesNotMatch(infoPanel, /Nessun dettaglio disponibile\./);
  assert.match(graphApp, /<InfoPanel[\s\S]*?onOpenData=\{openDataPanel\}/);
});

test("opening data from the node details dialog closes it before transferring focus", () => {
  assert.match(infoPanel, /function dismissModal\(restoreFocus: boolean\)/);
  assert.match(infoPanel, /async function openDataFromNodeDetails\(\)\s*\{\s*dismissModal\(false\);\s*await tick\(\);\s*onOpenData\(\);/);
});
