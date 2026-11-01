import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8");

test("large counterfactual target domains use the searchable, progressively rendered node picker", () => {
  assert.match(panel, /import SearchableNodeSelect from "\.\/SearchableNodeSelect\.svelte"/);
  assert.match(panel, /searchableTargetNodeOptions = targetNodeOptions\.map/);
  assert.match(panel, /<SearchableNodeSelect[\s\S]*?options=\{searchableTargetNodeOptions\}/);
  assert.match(panel, /ariaLabel=\{targetNodeFieldLabel\}/);
  assert.match(panel, /on:change=\{\(\) => dispatch\("criteriaChange"\)\}/);
  assert.match(panel, /disabled=\{running\}/);
  assert.doesNotMatch(panel, /\{#each targetNodeOptions as option\}/,
    "a graph with many eligible nodes should not create a native option element for every node at once");
});
