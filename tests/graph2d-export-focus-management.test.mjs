import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");
const dialogStart = panel.indexOf("<dialog");
const dialogEnd = panel.indexOf(">", dialogStart);
const dialogMarkup = panel.slice(dialogStart, dialogEnd);
const styles = panel.slice(panel.indexOf("<style>"));

test("2D export opens a native modal dialog and closes it through the owning panel", () => {
  assert.match(dialogMarkup, /use:openModal/);
  assert.match(dialogMarkup, /aria-modal="true"/);
  assert.match(dialogMarkup, /aria-labelledby="graph-export-title"/);
  assert.doesNotMatch(dialogMarkup, /(?:^|\s)open(?:\s|$)/);
  assert.match(panel, /function openModal\(node: HTMLDialogElement\)\s*\{\s*node\.showModal\(\);[\s\S]*?destroy\(\)\s*\{\s*if \(node\.open\) node\.close\(\);/);
  assert.match(dialogMarkup, /on:cancel=\{handleDialogCancel\}/);
  assert.match(panel, /function handleDialogCancel\(event: Event\)\s*\{\s*event\.preventDefault\(\);\s*closeDialog\(\);/);
  assert.match(panel, /function handleDialogKeydown\(event: KeyboardEvent\)[\s\S]*?event\.key === "Escape"[\s\S]*?closeDialog\(\)/);
  assert.match(panel, /event\.shiftKey && \(document\.activeElement === first \|\| document\.activeElement === dialogElement\)[\s\S]*?last\.focus\(\)[\s\S]*?!event\.shiftKey && document\.activeElement === last[\s\S]*?first\.focus\(\)/);
});

test("the native modal preserves its custom backdrop and full-screen mobile layout", () => {
  assert.match(styles, /\.dialog::backdrop\s*\{\s*background:\s*transparent;\s*\}/);
  assert.match(styles, /\.dialog\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*margin:\s*auto;/s);
  assert.match(styles, /@media \(max-width: 800px\)\s*\{[\s\S]*?\.dialog\s*\{[^}]*inset:\s*0;[^}]*width:\s*100vw;[^}]*height:\s*100dvh;[^}]*margin:\s*0;/);
});
