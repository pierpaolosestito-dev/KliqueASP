import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const nodeDirectory = await readFile(new URL("../src/lib/kliqueasp/components/GraphNodeDirectory.svelte", import.meta.url), "utf8");

test("the compact mobile toolbar keeps analysis and search directly reachable", () => {
  const toolbar = graphApp.slice(graphApp.indexOf("<!-- TOOLBAR -->"), graphApp.indexOf("<div class=\"graph-status-bar\""));
  assert.match(toolbar, /<details class="toolbar-menu" bind:this=\{analysisMenuElement\}>/);
  assert.match(toolbar, /aria-label="Cerca un nodo per nome o ID"/);
  assert.match(toolbar, /class="toolbar-button search-action"[^>]*aria-label="Cerca"/);
  assert.match(toolbar, /class="toolbar-menu mobile-toolbar-more"/);
});

test("mobile toolbar hides secondary desktop controls and stays on one row", () => {
  assert.match(graphApp, /@media \(max-width: 900px\)\s*\{\s*\.toolbar\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;/s);
  assert.match(graphApp, /\.toolbar > \.desktop-toolbar-control\s*\{\s*display:\s*none;/);
  assert.match(graphApp, /\.toolbar > \.mobile-toolbar-more\s*\{\s*display:\s*block;[^}]*order:\s*4;/s);
  assert.match(graphApp, /\.toolbar > \.search-wrap\s*\{[^}]*order:\s*2;/s);
  assert.match(graphApp, /\.toolbar > \.search-action\s*\{[^}]*order:\s*3;/s);
});

test("desktop toolbar sizes to its controls while the mobile toolbar keeps its full row", () => {
  assert.match(graphApp, /\.toolbar\s*\{\s*position:\s*absolute;\s*top:\s*var\(--toolbar-top\);\s*left:\s*var\(--toolbar-left\);\s*right:\s*auto;\s*width:\s*max-content;\s*max-width:\s*calc\(100vw - var\(--toolbar-left\) - 24px\);/);
  assert.match(graphApp, /\.toolbar\s*\{\s*right:\s*auto;\s*width:\s*max-content;\s*max-width:\s*calc\(100vw - var\(--toolbar-left\) - 24px\);\s*min-height:\s*48px;\s*box-sizing:\s*border-box;\s*flex-wrap:\s*nowrap;/);
  assert.match(graphApp, /\.app-root\.with-json-editor \.toolbar\s*\{\s*left:\s*calc\(var\(--toolbar-left\) \+ 432px\);\s*right:\s*auto;\s*width:\s*max-content;\s*max-width:\s*calc\(100vw - var\(--toolbar-left\) - 456px\);/);
  assert.match(graphApp, /@media \(max-width: 1280px\)\s*\{\s*\.toolbar\s*\{\s*right:\s*auto;\s*width:\s*max-content;\s*max-width:\s*calc\(100vw - var\(--toolbar-left\) - 20px\);[^}]*flex-wrap:\s*nowrap;/);
  assert.match(graphApp, /\.app-root\.with-json-editor \.toolbar\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.match(graphApp, /@media \(max-width: 900px\)[\s\S]*?\.toolbar\s*\{\s*right:\s*8px;\s*left:\s*8px;\s*width:\s*auto;\s*max-width:\s*none;\s*display:\s*flex;\s*flex-wrap:\s*nowrap;/);
});

test("the mobile overflow retains data, projection, view, result, and 2D export actions", () => {
  const mobileMenuStart = graphApp.indexOf("<details class=\"toolbar-menu mobile-toolbar-more\"");
  const mobileMenuEnd = graphApp.indexOf("\n  </details>\n</div>\n\n<div class=\"graph-status-bar\"", mobileMenuStart);
  const mobileMenu = graphApp.slice(mobileMenuStart, mobileMenuEnd);
  assert.notEqual(mobileMenuStart, -1);
  assert.notEqual(mobileMenuEnd, -1);
  for (const label of ["Dati e mappatura", "Esempi disponibili", "Nodi ·", "Proiezione", "Vista", "Cancella risultati correnti", "Esporta 2D"]) {
    assert.ok(mobileMenu.includes(label), `mobile menu should include ${label}`);
  }
  assert.match(mobileMenu, /on:click=\{openDataPanelFromMobileMenu\}/);
  assert.match(mobileMenu, /on:click=\{openGraph2DExportFromMobileMenu\}/);
  assert.match(graphApp, /function openGraph2DExportFromMobileMenu\(\)[\s\S]*?mobileViewMenuElement\.open = false;[\s\S]*?showGraph2DExportPanel = true;/);
});

test("desktop and mobile node directories use separate accessible search input IDs", () => {
  assert.match(nodeDirectory, /export let searchInputId = "graph-node-directory-search"/);
  assert.match(nodeDirectory, /<label for=\{searchInputId\}>/);
  assert.match(nodeDirectory, /id=\{searchInputId\}/);
  assert.match(graphApp, /searchInputId="mobile-graph-node-directory-search"/);
});

test("mobile toolbar actions return focus to a visible toolbar control", () => {
  assert.match(graphApp, /function closeToolbarMenusAndRestoreFocus\(\)[\s\S]*?document\.querySelector<HTMLElement>\('\.toolbar input\[aria-label="Cerca un nodo per nome o ID"\]'\)\?[\s\S]*?focus\(\)/);
  assert.match(graphApp, /function toggleProjectionControlsFromToolbar\(\)[\s\S]*?document\.querySelector<HTMLElement>\('\.toolbar input\[aria-label="Cerca un nodo per nome o ID"\]'\)\?\.focus\(\)/);
  assert.match(graphApp, /function clearAnalysisResultsFromToolbar\(\)[\s\S]*?document\.querySelector<HTMLElement>\('\.toolbar input\[aria-label="Cerca un nodo per nome o ID"\]'\)/);
  assert.match(graphApp, /function openDataPanel\(\)[\s\S]*?closeToolbarMenus\(\)/);
  assert.match(graphApp, /function openDataPanelFromMobileMenu\(\)[\s\S]*?mobileMoreMenuElement\?\.querySelector\("summary"\)/);
  const mobileViewStart = graphApp.indexOf('<details class="toolbar-menu mobile-view-menu"');
  const mobileViewEnd = graphApp.indexOf('</details>', mobileViewStart);
  assert.doesNotMatch(graphApp.slice(mobileViewStart, mobileViewEnd), /GraphNodeDirectory|Nodi ·/);
  assert.match(graphApp, /<details class="toolbar-menu examples-toolbar-menu desktop-toolbar-control">/);
  assert.match(graphApp, /class="toolbar-example-link" href=\{example\.href\} target="_blank" rel="noopener"/);
  assert.match(graphApp, /\.menu-chevron\s*\{\s*display:\s*inline-block;[^}]*border-right:[^}]*border-bottom:/);
  assert.doesNotMatch(graphApp, /class="menu-chevron"[^>]*>⌄/);
  assert.doesNotMatch(graphApp, /I nomi vicini si alternano/);
});
