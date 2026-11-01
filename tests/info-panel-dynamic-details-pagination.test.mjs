import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/InfoPanel.svelte", import.meta.url), "utf8");

test("node metadata and professional roles are progressively disclosed for user supplied graphs", () => {
  assert.match(panel, /import ProgressiveList from "\.\/ProgressiveList\.svelte"/);
  assert.match(panel, /\$: genericDetails = getGenericDetails\(selectedDetails\)/);
  assert.match(panel, /<ProgressiveList items=\{selectedDetails\.roles\} resetKey=\{selectedDetails\} label="ambiti professionali"/);
  assert.equal([...panel.matchAll(/<ProgressiveList items=\{genericDetails\} resetKey=\{selectedDetails\} label="campi aggiuntivi"/g)].length, 3,
    "person, place, and generic node records should use the same progressive field list");
  assert.doesNotMatch(panel, /\{#each getGenericDetails\(selectedDetails\)/);
  assert.doesNotMatch(panel, /\{#each selectedDetails\.roles as role\}/);
});
