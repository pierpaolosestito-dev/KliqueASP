import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const jsonEditor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
const codeEditor = await readFile(new URL("../src/lib/kliqueasp/components/JsonCodeEditor.svelte", import.meta.url), "utf8");

test("configuration and graph data use the same labeled JSON editor while preserving mapping callbacks", () => {
  assert.equal((jsonEditor.match(/<JsonCodeEditor\s/g) ?? []).length, 2);
  assert.match(jsonEditor, /<label for="graph-config">Configurazione JSON<\/label>[\s\S]*?<JsonCodeEditor[\s\S]*?id="graph-config"[\s\S]*?onValueChange=\{onConfigTextChange\}/);
  assert.match(jsonEditor, /<JsonCodeEditor[\s\S]*?id="graph-config"[\s\S]*?ariaLabel="Configurazione JSON"/);
  assert.match(jsonEditor, /<label for="graph-dataset">Dati del grafo \(JSON\)<\/label>[\s\S]*?<JsonCodeEditor[\s\S]*?id="graph-dataset"[\s\S]*?ariaLabel="Dati del grafo \(JSON\)"[\s\S]*?onValueChange=\{onDatasetTextChange\}/);
  assert.doesNotMatch(jsonEditor, /<textarea\s/);
});

test("highlighting stays out of the accessibility tree and native textarea errors remain associated", () => {
  assert.match(codeEditor, /<pre[^>]*aria-hidden="true"[^>]*role="presentation"/);
  assert.match(codeEditor, /<textarea[\s\S]*?\{id\}[\s\S]*?aria-label=\{ariaLabel\}[\s\S]*?aria-invalid=\{invalid \? "true" : undefined\}[\s\S]*?aria-describedby=\{describedBy\}/);
  assert.match(codeEditor, /on:scroll=\{syncHighlightScroll\}/);
  assert.match(codeEditor, /@media \(forced-colors: active\)/);
  assert.match(codeEditor, /-webkit-text-fill-color: CanvasText/);
  assert.match(codeEditor, /highlightingEnabled = shouldHighlightJson\(value\)/);
  assert.match(codeEditor, /hidden=\{!highlightingEnabled\}/);
});

test("JSON token colors keep readable contrast against the editor background", () => {
  const luminance = (hex) => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const background = luminance("#020617");
  const colors = [...codeEditor.matchAll(/json-token-[\w-]+\)\s*\{\s*color:\s*(#[0-9a-f]{6})/gi)]
    .map((match) => match[1]);

  assert.equal(colors.length, 5);
  for (const color of colors) {
    const foreground = luminance(color);
    const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    assert.ok(contrast >= 4.5, `${color} should have at least 4.5:1 contrast`);
  }
});
