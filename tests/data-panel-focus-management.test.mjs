import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const jsonEditor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");

test("opening the data panel remembers the activating control before changing view", () => {
  assert.match(graphApp, /let jsonEditorFocusReturnTarget: HTMLElement \| null = null;/);
  assert.match(
    graphApp,
    /function openDataPanel\(\) \{\s*const activeElement = document\.activeElement;\s*jsonEditorFocusReturnTarget = mobileDataPanelFocusReturnTarget \?\? \([\s\S]*?activeElement instanceof HTMLElement && activeElement !== document\.body[\s\S]*?\);\s*mobileDataPanelFocusReturnTarget = null;[\s\S]*?closeToolbarMenus\(\);[\s\S]*?jsonEditorProps\?\.onOpen\?\.\(\);/
  );
  assert.match(graphApp, /function openDataPanelFromMobileMenu\(\)[\s\S]*?mobileMoreMenuElement\?\.querySelector\("summary"\)[\s\S]*?openDataPanel\(\);/);
  assert.match(graphApp, /focusReturnTarget=\{jsonEditorFocusReturnTarget\}/);
});

test("closed details summaries remain valid focus targets while hidden detail content is rejected", () => {
  assert.match(jsonEditor, /function isInsideClosedDetailsContent\(element: HTMLElement\): boolean[\s\S]*?current instanceof HTMLDetailsElement[\s\S]*?const summary = current\.querySelector<HTMLElement>\(":scope > summary"\);[\s\S]*?if \(!summary\?\.contains\(element\)\) return true;/);
  assert.match(jsonEditor, /function isVisibleFocusTarget\(element: HTMLElement \| null\)[\s\S]*?isInsideClosedDetailsContent\(element\)/);
  assert.match(jsonEditor, /function isPanelTabStop\(element: HTMLElement\): boolean[\s\S]*?isInsideClosedDetailsContent\(element\)/);
});

test("data-panel focus restoration waits for custom modal background isolation to clear", () => {
  assert.match(
    jsonEditor,
    /async function restorePanelFocus\(\) \{\s*await tick\(\);\s*\/\/ The app removes `inert` from the background in a MutationObserver after\s*\/\/ this panel closes\.[\s\S]*?await new Promise<void>\(\(resolve\) => setTimeout\(resolve, 0\)\);\s*if \(isVisibleFocusTarget\(focusReturnTarget\)\)/
  );
});

test("the compact data panel has dialog semantics and a programmatically focusable heading", () => {
  assert.match(jsonEditor, /role=\{compactViewport \? "dialog" : "complementary"\}/);
  assert.match(jsonEditor, /aria-modal=\{compactViewport \? "true" : undefined\}/);
  assert.match(jsonEditor, /aria-labelledby="json-editor-heading"/);
  assert.match(jsonEditor, /<h1 id="json-editor-heading" tabindex="-1" bind:this=\{panelHeading\}>Dati e configurazione<\/h1>/);
  assert.match(jsonEditor, /if \(open && !wasOpen\)[\s\S]*?panelHeading\?\.focus\(\{ preventScroll: true \}\)/);
});

test("the mobile data panel contains Tab focus, closes with Escape, and restores or recovers focus", () => {
  assert.match(jsonEditor, /<svelte:window on:keydown=\{handlePanelKeydown\} \/>/);
  assert.match(jsonEditor, /if \(event\.key === "Escape" && !showResetConfirmation\)[\s\S]*?event\.preventDefault\(\);\s*onClose\(\);/);
  assert.match(jsonEditor, /if \(event\.key !== "Tab" \|\| !compactViewport \|\| !panelElement\) return;/);
  assert.match(jsonEditor, /function isPanelTabStop\(element: HTMLElement\): boolean[\s\S]*?return element\.tabIndex >= 0;/);
  assert.match(jsonEditor, /\)\]\.filter\(isPanelTabStop\)/);
  assert.match(jsonEditor, /if \(!panelElement\.contains\(activeElement\)\)[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.shiftKey \? last : first/);
  assert.match(jsonEditor, /event\.shiftKey && \(activeElement === first \|\| activeElement === panelHeading\)/);
  assert.match(jsonEditor, /else if \(!event\.shiftKey && activeElement === last\)/);
  assert.match(jsonEditor, /focusReturnTarget\.focus\(\{ preventScroll: true \}\)/);
  assert.match(jsonEditor, /\.app-root \.toolbar \.toolbar-button:not\(\[disabled\]\)/);
});

test("opening a saved project uses the same post-close focus recovery", () => {
  const projectBranchStart = jsonEditor.indexOf('onLoadProject(parsed)');
  const projectBranchEnd = jsonEditor.indexOf('} catch (error)', projectBranchStart);
  assert.ok(projectBranchStart >= 0 && projectBranchEnd > projectBranchStart);
  const projectBranch = jsonEditor.slice(projectBranchStart, projectBranchEnd);
  assert.match(projectBranch, /announceWorkbenchStatus\(fileMessage\);\s*onClose\(\);\s*void restorePanelFocus\(\);/);
});
