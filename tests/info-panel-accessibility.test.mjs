import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const infoPanel = await readFile(new URL("../src/lib/kliqueasp/components/InfoPanel.svelte", import.meta.url), "utf8");

test("node details dialog has an accessible name and close control", () => {
  assert.match(infoPanel, /role="dialog"\s+aria-modal="true"\s+aria-labelledby="node-details-title"/);
  assert.match(infoPanel, /id="node-details-title">\s*Dettagli del nodo \{selectedNode\.label\}/);
  assert.match(infoPanel, /aria-label=\{`Chiudi dettagli di \$\{selectedNode\.label\}`\}/);
});

test("opening node details focuses the dialog and closing restores its trigger", () => {
  assert.match(infoPanel, /function openModal\(event: MouseEvent\)[\s\S]*?modalTrigger = event\.currentTarget as HTMLButtonElement[\s\S]*?showModal = true/);
  assert.match(infoPanel, /function focusOnMount\(node: HTMLElement\)[\s\S]*?node\.focus\(\)/);
  assert.match(infoPanel, /use:focusOnMount/);
  assert.match(infoPanel, /void tick\(\)\.then\(\(\) => \{\s*if \(trigger\?\.isConnected\) trigger\.focus\(\);\s*\}\)/);
});

test("Escape closes node details and Tab stays inside the dialog", () => {
  assert.match(infoPanel, /if \(e\.key === "Escape"\) \{\s*e\.preventDefault\(\);\s*closeModal\(\);/);
  assert.match(infoPanel, /if \(e\.key !== "Tab" \|\| !modalElement\) return/);
  assert.match(infoPanel, /e\.shiftKey && \(activeElement === first \|\| activeElement === modalElement\)[\s\S]*?last\.focus\(\)/);
  assert.match(infoPanel, /!e\.shiftKey && \(activeElement === last \|\| activeElement === modalElement\)[\s\S]*?first\.focus\(\)/);
});

test("node title uses valid heading structure and explicit keyboard focus", () => {
  assert.match(infoPanel, /<h3 class="info-title">\s*<button class="title-btn"[^>]*>\{selectedNode\.label\}<\/button>\s*<\/h3>/);
  assert.doesNotMatch(infoPanel, /<button[^>]*>\s*<h3/);
  assert.match(infoPanel, /\.title-btn:focus-visible,[\s\S]*?\.modal-close:focus-visible/);
});
