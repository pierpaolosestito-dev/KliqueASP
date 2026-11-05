import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const panels = [
  ["clique", "SolverPanel"],
  ["structural", "StructuralAnalysisPanel"],
  ["integrity", "IntegrityPanel"],
  ["motif", "MotifAnalysisPanel"],
  ["provenance", "ProvenanceScenarioAnalysisPanel"]
];

test("all analysis drawers expose a named modal dialog only when compact", async () => {
  for (const [kind, componentName] of panels) {
    const component = await readFile(
      new URL(`../src/lib/kliqueasp/components/${componentName}.svelte`, import.meta.url),
      "utf8"
    );
    assert.match(component, /export let compactModal = false;/, `${componentName} receives compact mode`);
    assert.match(component, /role=\{compactModal \? "dialog" : undefined\}/);
    assert.match(component, /aria-modal=\{compactModal \? "true" : undefined\}/);
    assert.match(component, /aria-labelledby="[^"]+"/);
    assert.match(component, /tabindex="-1"/);
    assert.match(graphApp, new RegExp(`open=\\{show${kind === "clique" ? "Solver" : kind === "provenance" ? "ProvenanceScenarioAnalysis" : kind[0].toUpperCase() + kind.slice(1)}Panel\\}[\\s\\S]*?compactModal=\\{compactAnalysisViewport\\}`));
  }
});

test("analysis panels focus on open and restore focus after close, with data-panel handoff suppressed", () => {
  assert.match(graphApp, /\$: synchronizeAnalysisPanelFocus\([\s\S]*?showSolverPanel[\s\S]*?showStructuralPanel[\s\S]*?showIntegrityPanel[\s\S]*?showMotifPanel[\s\S]*?showProvenanceScenarioAnalysisPanel[\s\S]*?\);/);
  assert.match(graphApp, /analysisViewportQuery = typeof window\.matchMedia === "function"[\s\S]*?window\.matchMedia\("\(max-width: 900px\)"\)/);
  assert.match(graphApp, /const closedDetails = element\.closest\("details:not\(\[open\]\)"\);\s*if \(closedDetails && element\.parentElement !== closedDetails\) return false;/);
  assert.match(graphApp, /function synchronizeAnalysisPanelFocus\(panel: AnalysisPanelKind \| null\)[\s\S]*?analysisPanelSelectorByKind\[panel\]\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(graphApp, /async function restoreAnalysisPanelFocus\(\)[\s\S]*?await tick\(\);\s*await new Promise<void>\(\(resolve\) => requestAnimationFrame\(\(\) => resolve\(\)\)\);/);
  assert.match(graphApp, /async function restoreAnalysisPanelFocus\(\)[\s\S]*?target\.focus\(\{ preventScroll: true \}\)[\s\S]*?document\.querySelector<HTMLElement>\('\.toolbar summary\[aria-labelledby="analysis-menu-label"\]'\)\s*\?\?\s*analysisMenuElement\?\.querySelector<HTMLElement>\("summary"\)/);
  assert.match(graphApp, /const toolbarRecoveryTarget = \[\.\.\.document\.querySelectorAll<HTMLElement>\([\s\S]*?\.find\(\(element\) => isVisibleAnalysisFocusTarget\(element\)\);\s*toolbarRecoveryTarget\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(graphApp, /function openDataPanel\(\) \{[\s\S]*?suppressAnalysisPanelFocusRestore = activeAnalysisPanel\(\) !== null;[\s\S]*?closeAnalysisPanels\(\)/);
  assert.match(graphApp, /if \(suppressAnalysisPanelFocusRestore\) \{\s*suppressAnalysisPanelFocusRestore = false;\s*analysisPanelFocusReturnTarget = null;/);
});

test("custom modal drawers inert the rest of the page and restore its previous state", () => {
  assert.match(graphApp, /class="app-root"\s+use:isolateModalBackground/);
  assert.match(graphApp, /function isolateModalBackground\(root: HTMLElement\)[\s\S]*?root\.querySelector<HTMLElement>\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
  assert.match(graphApp, /documentForRoot\.querySelector\("dialog:modal"\) !== null/);
  assert.match(graphApp, /for \(const sibling of Array\.from\(parent\.children\)\)[\s\S]*?nextInert\.add\(sibling\)/);
  assert.match(graphApp, /element\.inert = true/);
  assert.match(graphApp, /element\.inert = wasInert/);
});

test("compact analysis panels contain keyboard focus and close on Escape", () => {
  assert.match(graphApp, /<svelte:window on:keydown=\{handleAnalysisPanelKeydown\} \/>/);
  assert.match(graphApp, /function handleAnalysisPanelKeydown\(event: KeyboardEvent\)[\s\S]*?if \(!compactAnalysisViewport\) return;/);
  assert.match(graphApp, /if \(event\.key === "Escape"\) \{\s*event\.preventDefault\(\);\s*closeAnalysisPanel\(panel\);/);
  assert.match(graphApp, /function isVisibleAnalysisTabStop\(element: HTMLElement\): boolean[\s\S]*?return element\.tabIndex >= 0;/);
  assert.match(graphApp, /\)\]\.filter\(isVisibleAnalysisTabStop\)/);
  assert.match(graphApp, /if \(!panelElement\.contains\(activeElement\)\)[\s\S]*?event\.shiftKey \? last : first/);
  assert.match(graphApp, /else if \(activeElement === panelElement\)[\s\S]*?event\.shiftKey \? last : first/);
  assert.match(graphApp, /else if \(event\.shiftKey && activeElement === first\) \{\s*event\.preventDefault\(\);\s*last\.focus\(\);/);
  assert.match(graphApp, /else if \(!event\.shiftKey && activeElement === last\) \{\s*event\.preventDefault\(\);\s*first\.focus\(\);/);
  assert.match(graphApp, /event\.target\.closest\("dialog\[open\]"\)/);
  assert.match(graphApp, /if \(!isVisibleAnalysisFocusTarget\(panelElement\)\) return;/);
});
