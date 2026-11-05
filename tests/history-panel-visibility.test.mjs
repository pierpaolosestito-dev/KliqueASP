import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const historyPanel = await readFile(new URL("../src/lib/kliqueasp/components/HistoryPanel.svelte", import.meta.url), "utf8");

test("the history panel can be hidden without clearing its saved entries", () => {
  assert.match(historyPanel, /aria-label="Nascondi pannello cronologia" on:click=\{onDismiss\}/);
  assert.equal((historyPanel.match(/aria-label="Nascondi pannello cronologia"/g) ?? []).length, 1);
  assert.match(historyPanel, /history\.length > 0 \? "Cronologia di navigazione" : "Analisi precedenti/);
  assert.doesNotMatch(historyPanel, /on:click=\{onClear\}/);
  assert.match(graphApp, /<div id="history-panel" hidden=\{!showHistoryPanel\}>\s*<HistoryPanel/);

  const toggle = graphApp.slice(graphApp.indexOf("function toggleHistoryPanel()"), graphApp.indexOf("function dismissHistoryPanel()"));
  const dismiss = graphApp.slice(graphApp.indexOf("function dismissHistoryPanel()"), graphApp.indexOf("function clearHistoryFromViewMenu()"));
  assert.match(toggle, /showHistoryPanel = !showHistoryPanel/);
  assert.doesNotMatch(toggle, /clearHistory\(/);
  assert.match(dismiss, /showHistoryPanel = false/);
  assert.doesNotMatch(dismiss, /clearHistory\(/);
});

test("desktop and mobile view menus can reopen the panel and clear navigation separately", () => {
  const menuToggles = graphApp.match(/aria-expanded=\{showHistoryPanel\} aria-controls="history-panel" on:click=\{toggleHistoryPanel\}/g) ?? [];
  assert.equal(menuToggles.length, 2);
  assert.equal((graphApp.match(/on:click=\{clearHistoryFromViewMenu\}>Svuota cronologia<\/button>/g) ?? []).length, 2);
  assert.match(graphApp, /<HistoryPanel[\s\S]*?onDismiss=\{dismissHistoryPanel\}/);
  assert.match(graphApp, /function clearHistoryFromViewMenu\(\)\s*\{\s*clearHistory\(\);\s*closeToolbarMenusAndRestoreFocus\(\);\s*\}/);
});
