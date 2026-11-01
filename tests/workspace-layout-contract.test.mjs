import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const historyPanel = await readFile(new URL("../src/lib/kliqueasp/components/HistoryPanel.svelte", import.meta.url), "utf8");

test("switching between data and analysis keeps one work panel open", () => {
  const closeStart = graphApp.indexOf("function closeAnalysisPanels()");
  const dataStart = graphApp.indexOf("function openDataPanel()");
  const analysisStart = graphApp.indexOf("function openAnalysisPanel(", dataStart);
  const closePanels = graphApp.slice(closeStart, dataStart);
  const dataPanel = graphApp.slice(dataStart, analysisStart);
  const analysisPanel = graphApp.slice(analysisStart, graphApp.indexOf("function closeAnalysisPanel", analysisStart));

  for (const panelFlag of ["showSolverPanel", "showStructuralPanel", "showIntegrityPanel", "showMotifPanel", "showProvenanceScenarioAnalysisPanel"]) {
    assert.match(closePanels, new RegExp(`${panelFlag} = false`));
  }
  assert.match(dataPanel, /closeAnalysisPanels\(\)/);
  assert.match(dataPanel, /jsonEditorProps\?\.onOpen\?\.\(\)/);
  assert.match(analysisPanel, /jsonEditorProps\?\.onClose\?\.\(\)/);
});

test("desktop analysis panels reserve graph width while mobile panels use the full canvas", () => {
  assert.match(graphApp, /class:analysis-panel-open=\{Boolean\(activeAnalysisPanel\(\)\)\}/);
  assert.match(graphApp, /@media \(min-width: 901px\)[\s\S]*?\.app-root\.analysis-panel-open:not\(\.with-json-editor\) \.graph\s*\{\s*width: max\(0px, calc\(100vw - 464px\)\)/);
  assert.match(graphApp, /@media \(max-width: 900px\)\s*\{[\s\S]*?\.app-root\.analysis-panel-open \.graph\s*\{\s*margin-left: 0;\s*width: 100vw;/);
});

test("the 3D canvas reserves the timeline footprint at desktop and mobile widths", () => {
  assert.match(graphApp, /class:timeline-enabled=\{timelineControlEnabled\}/);
  assert.match(graphApp, /@media \(min-width: 601px\)\s*\{\s*\.app-root\.timeline-enabled \.graph\s*\{\s*height: calc\(100vh - var\(--desktop-timeline-reserve, 0px\)\);/);
  assert.match(graphApp, /@media \(max-width: 600px\)\s*\{\s*\.app-root\.timeline-enabled \.graph\s*\{\s*height: calc\(100vh - var\(--mobile-filter-timeline-reserve, 0px\)\);/);
});

test("the mobile graph legend and history occupy separate columns above the timeline", () => {
  assert.match(graphApp, /\.graph-visualization-note\s*\{[^}]*bottom:\s*calc\(12px \+ max\(var\(--mobile-status-reserve, 48px\), var\(--mobile-filter-timeline-reserve, 0px\)\)\);[^}]*width:\s*calc\(50vw - 18px\);[^}]*max-width:\s*none;[^}]*overflow:\s*auto;/s);
  assert.match(historyPanel, /@media \(max-width: 600px\)\s*\{\s*\.history-panel\s*\{\s*bottom:\s*calc\(var\(--history-bottom\) \+ max\(var\(--mobile-status-reserve, 48px\), var\(--mobile-filter-timeline-reserve, 0px\)\)\);\s*width:\s*calc\(50vw - 18px\);\s*max-width:\s*none;/);
});
