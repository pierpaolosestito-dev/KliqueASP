import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [panel, errorMessage] = await Promise.all([
  readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/AnalysisErrorMessage.svelte", import.meta.url), "utf8")
]);

test("2D export failures show actionable Italian copy and keep browser details optional", () => {
  assert.match(panel, /function reportExportError\(format: "SVG" \| "PNG", error: unknown\)/);
  assert.match(panel, /Non è stato possibile creare o avviare il download \$\{format\}\. Prova l'altro formato o riduci le dimensioni dell'immagine\./);
  assert.match(panel, /exportErrorDetail = error instanceof Error \? error\.message : String\(error \?\? "Errore non specificato\."\)/);
  assert.match(panel, /<AnalysisErrorMessage message=\{exportError\} technicalDetails=\{exportErrorDetail\}/);
  assert.match(errorMessage, /export let technicalDetails: string \| undefined = undefined/);
  assert.match(errorMessage, /<summary>Dettagli tecnici<\/summary>[\s\S]*?<pre>\{visibleTechnicalDetails\}<\/pre>/);
});

test("both SVG and PNG download failures use the same presentation", () => {
  assert.match(panel, /function downloadSvg\(\)[\s\S]*?catch \(error\) \{\s*reportExportError\("SVG", error\);/);
  assert.match(panel, /async function downloadPng\(\)[\s\S]*?catch \(error\) \{\s*reportExportError\("PNG", error\);/);
});
