import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const graph2DExportPanel = await readFile(new URL("../src/lib/kliqueasp/components/Graph2DExportPanel.svelte", import.meta.url), "utf8");
const historyPanel = await readFile(new URL("../src/lib/kliqueasp/components/HistoryPanel.svelte", import.meta.url), "utf8");
const timelineSlider = await readFile(new URL("../src/lib/kliqueasp/components/TimelineSlider.svelte", import.meta.url), "utf8");

test("switching between data and analysis keeps one work panel open", () => {
  const closeStart = graphApp.indexOf("function closeAnalysisPanels()");
  const dataStart = graphApp.indexOf("function openDataPanel(");
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

test("short mobile viewports retain a scrollable analysis panel while yielding timeline reserve", () => {
  assert.match(graphApp, /@media \(max-width: 900px\)\s*\{[\s\S]*?\.app-root\s*\{\s*--mobile-analysis-panel-timeline-reserve: min\(\s*var\(--mobile-filter-timeline-reserve, 0px\),\s*max\(0px, calc\(100dvh - var\(--toolbar-height, 48px\) - 244px\)\)\s*\);\s*\}/);
  assert.match(graphApp, /bottom: calc\(12px \+ var\(--mobile-analysis-panel-timeline-reserve, var\(--mobile-filter-timeline-reserve, 0px\)\)\);/);
  assert.match(graphApp, /max-height: calc\(100dvh - var\(--toolbar-height, 48px\) - 88px - var\(--mobile-analysis-panel-timeline-reserve, var\(--mobile-filter-timeline-reserve, 0px\)\)\);/);
});

test("very short mobile viewports separate toolbar status, legend, history, and timeline", () => {
  assert.match(graphApp, /@media \(max-width: 600px\) and \(max-height: 420px\)\s*\{\s*\.app-root \{\s*--mobile-status-reserve:\s*0px;\s*\}\s*\.graph-status-bar \{\s*max-width:\s*min\(780px, calc\(100vw - 166px\)\);\s*\}\s*\.graph-visualization-note \{\s*left:\s*8px;\s*right:\s*auto;\s*top:\s*calc\(var\(--toolbar-top, 10px\) \+ var\(--toolbar-height, 48px\) \+ 52px\);\s*bottom:\s*auto;/);
  assert.match(graphApp, /\.graph-visualization-note \{[^}]*max-height:\s*min\(70px, calc\(100dvh - var\(--toolbar-top, 10px\) - var\(--toolbar-height, 48px\) - 52px - 128px\)\);/s);
  assert.match(graphApp, /:global\(\.app-root \.scene-container \.scene-nav-info\) \{ display:\s*none; \}/);
  assert.match(graphApp, /\.graph-capabilities \{ display:\s*none; \}/);
  assert.match(historyPanel, /@media \(max-width: 600px\) and \(max-height: 420px\)[\s\S]*?max-height: min\(60vh, calc\(100dvh - var\(--toolbar-top, 10px\) - var\(--toolbar-height, 48px\) - 24px - 108px\)\);/);
  assert.match(historyPanel, /@media \(max-width: 600px\) and \(max-height: 420px\)[\s\S]*?\.history-panel \{[^}]*right:\s*0;[^}]*left:\s*auto;/);
  assert.match(timelineSlider, /@media \(max-width: 600px\) and \(max-height: 420px\) \{\s*\.timeline-container \{ bottom: var\(--tl-bottom\); \}\s*\}/);
  assert.doesNotMatch(graphApp, /class="workspace-navigation"/);
});

test("the 3D canvas reserves the timeline footprint at desktop and mobile widths", () => {
  assert.match(graphApp, /class:timeline-enabled=\{timelineControlEnabled && showTimelineControl\}/);
  assert.match(graphApp, /@media \(min-width: 601px\)\s*\{\s*\.app-root\.timeline-enabled \.graph\s*\{\s*height: calc\(100vh - var\(--desktop-timeline-reserve, 0px\)\);/);
  assert.match(graphApp, /@media \(max-width: 600px\)\s*\{\s*\.app-root\.timeline-enabled \.graph\s*\{\s*height: calc\(100vh - var\(--mobile-filter-timeline-reserve, 0px\)\);/);
});

test("the graph workspace background continues behind the timeline reserve", () => {
  assert.match(graphApp, /--graph-background: \{GRAPH_CONFIG\.graph\.backgroundColor\};/);
  assert.match(graphApp, /\.app-root\s*\{[^}]*background: var\(--graph-background, #050816\);/s);
});

test("the desktop graph legend clears the reserved timeline area", () => {
  assert.match(graphApp, /@media \(min-width: 601px\)\s*\{[\s\S]*?\.app-root\.timeline-enabled \.graph-visualization-note\s*\{\s*bottom: calc\(12px \+ var\(--desktop-timeline-reserve, 0px\)\);/);
});

test("the mobile 2D export keeps download actions outside its scrollable preview body", () => {
  const style = graph2DExportPanel.slice(graph2DExportPanel.indexOf("<style>"));
  assert.match(graph2DExportPanel, /<div class="body">[\s\S]*?<div class="preview-wrap">[\s\S]*?<\/div>\s*<\/div>\s*<footer class="dialog-footer">/);
  assert.match(graph2DExportPanel, /<button[^>]*>Scarica SVG<\/button>/);
  assert.match(graph2DExportPanel, /<button[^>]*>\s*\{downloading \? "Creo PNG/);
  assert.match(style, /\.dialog\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s);
  assert.match(style, /\.body\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/);
  assert.match(style, /@media \(max-width: 800px\)\s*\{[\s\S]*?\.body\s*\{[^}]*grid-template-rows:\s*minmax\(220px, 34dvh\) minmax\(0, 1fr\);[^}]*overflow:\s*hidden;[\s\S]*?\.controls\s*\{[^}]*grid-row:\s*2;[^}]*overflow-y:\s*auto;[\s\S]*?\.preview-wrap\s*\{[^}]*grid-row:\s*1;/);
  assert.match(style, /@media \(max-width: 800px\) and \(max-height: 520px\)\s*\{\s*\.body\s*\{[^}]*grid-template-rows:\s*auto minmax\(240px, 1fr\);[^}]*overflow:\s*auto;/);
  assert.match(style, /@media \(max-width: 800px\) and \(max-height: 520px\)\s*\{[\s\S]*?\.controls\s*\{[^}]*grid-row:\s*auto;[^}]*overflow:\s*visible;[\s\S]*?\.preview-wrap\s*\{[^}]*grid-row:\s*auto;/);
});

test("the mobile graph legend and history occupy separate columns above the timeline", () => {
  assert.match(graphApp, /\.graph-visualization-note\s*\{[^}]*bottom:\s*calc\(12px \+ max\(var\(--mobile-status-reserve, 48px\), var\(--mobile-filter-timeline-reserve, 0px\)\)\);[^}]*width:\s*min\(220px, calc\(58vw - 32px\)\);[^}]*max-width:\s*none;[^}]*overflow:\s*auto;/s);
  assert.match(historyPanel, /@media \(max-width: 600px\)\s*\{\s*\.history-panel\s*\{\s*bottom:\s*calc\(var\(--history-bottom\) \+ max\(var\(--mobile-status-reserve, 48px\), var\(--mobile-filter-timeline-reserve, 0px\)\)\);\s*width:\s*min\(150px, calc\(42vw - 18px\)\);\s*max-width:\s*none;/);
});

test("desktop history moves above the visible timeline reserve", () => {
  assert.match(historyPanel, /\.history-panel\s*\{[^}]*bottom:\s*calc\(var\(--history-bottom\) \+ max\(var\(--mobile-status-reserve, 48px\), var\(--desktop-timeline-reserve, 0px\)\)\);/s);
  assert.match(graphApp, /--desktop-timeline-reserve:\s*\{timelineControlEnabled && showTimelineControl \? "132px" : "0px"\};/);
});

test("short mobile viewports place history beside the status and above the graph note", () => {
  assert.match(historyPanel, /@media \(max-width: 600px\) and \(max-height: 420px\)\s*\{\s*\.history-panel\s*\{\s*top:\s*calc\(var\(--toolbar-top, 10px\) \+ var\(--toolbar-height, 48px\) \+ 4px\);\s*right:\s*0;\s*bottom:\s*auto;\s*left:\s*auto;\s*width:\s*min\(142px, calc\(100vw - 8px\)\);\s*max-height:\s*min\(60vh, calc\(100dvh - var\(--toolbar-top, 10px\) - var\(--toolbar-height, 48px\) - 24px - 108px\)\);/);
  assert.match(graphApp, /@media \(max-width: 600px\) and \(max-height: 420px\)\s*\{[\s\S]*?\.graph-visualization-note\s*\{\s*left:\s*8px;\s*right:\s*auto;\s*top:\s*calc\(var\(--toolbar-top, 10px\) \+ var\(--toolbar-height, 48px\) \+ 52px\);\s*bottom:\s*auto;\s*width:\s*min\(154px, calc\(100vw - 166px\)\);\s*max-height:\s*min\(70px, calc\(100dvh - var\(--toolbar-top, 10px\) - var\(--toolbar-height, 48px\) - 52px - 128px\)\);/);
});

test("the mobile navigation hint sits beside the case-study action instead of under it", () => {
  assert.match(graphApp, /@media \(max-width: 600px\)[\s\S]*?:global\(\.app-root \.scene-container \.scene-nav-info\)\s*\{[^}]*left:\s*8px;[^}]*right:\s*auto;[^}]*max-width:\s*min\(240px, calc\(100vw - 160px\)\);[^}]*transform:\s*none;[^}]*white-space:\s*normal;/);
  assert.match(graphApp, /:global\(\.app-root \.scene-container \.scene-nav-info\)\s*\{[^}]*top: calc\(var\(--toolbar-top\) \+ var\(--toolbar-height, 48px\) \+ var\(--mobile-status-reserve, 48px\) \+ 5px\);/);
});

test("the tablet navigation hint clears the graph legend above the timeline", () => {
  assert.match(graphApp, /@media \(min-width: 601px\) and \(max-width: 1023px\)\s*\{[\s\S]*?:global\(\.app-root \.scene-container \.scene-nav-info\)\s*\{[^}]*top: calc\(var\(--toolbar-top\) \+ var\(--toolbar-height, 48px\) \+ var\(--mobile-status-reserve, 48px\) \+ 5px\);[^}]*bottom: auto;[^}]*left: 8px;[^}]*max-width: min\(240px, calc\(100vw - 160px\)\);/);
});

test("the case-study return action lives in the responsive toolbar", () => {
  assert.match(graphApp, /<a class="toolbar-button desktop-toolbar-control workspace-toolbar-action" href=\{workspaceNavigationHref\}[^>]*>I miei dati<\/a>/);
  assert.match(graphApp, /<a class="workspace-route-action" href=\{workspaceNavigationHref\}>Analizza i tuoi dati<\/a>/);
  assert.match(graphApp, /\.toolbar > \.desktop-toolbar-control \{ display: none; \}/);
  assert.match(graphApp, /\.toolbar \.mobile-toolbar-more \.workspace-route-action \{ display: block; \}/);
  assert.doesNotMatch(graphApp, /class="workspace-navigation"/);
  assert.match(graphApp, /\.graph-status-bar \{ left: 8px; max-width: min\(780px, calc\(100vw - 150px\)\);/);
});

test("mobile toolbar menus open below the graph status and stay inside short viewports", () => {
  assert.match(graphApp, /\.toolbar > \.toolbar-menu:not\(\.mobile-toolbar-more\) > \.menu-content,\s*\.toolbar > \.mobile-toolbar-more > \.menu-content\s*\{\s*position: fixed;\s*top: calc\(var\(--toolbar-top\) \+ var\(--toolbar-height, 48px\) \+ 44px\);\s*right: 12px;\s*left: auto;\s*max-height: min\(72dvh, calc\(100dvh - var\(--toolbar-top\) - var\(--toolbar-height, 48px\) - 62px\)\);/);
  assert.match(graphApp, /\.graph-status-bar \{ top: calc\(var\(--toolbar-top\) \+ var\(--toolbar-height, 48px\) \+ 5px\);/);
  assert.doesNotMatch(graphApp, /\.toolbar details:first-of-type \.menu-content\s*\{\s*position: fixed;\s*top: calc\(var\(--toolbar-top\) \+ 47px\)/);
});
