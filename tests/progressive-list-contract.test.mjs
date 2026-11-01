import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../src/lib/kliqueasp/components/ProgressiveList.svelte", import.meta.url), "utf8");

test("progressive lists render bounded slices and expose an accessible show-more control", () => {
  assert.match(component, /export let pageSize = 20/);
  assert.match(component, /items\.slice\(0, visibleLimit\)/);
  assert.match(component, /<slot \{item\} \{index\} \/>/);
  assert.match(component, /total=\{items\.length\}[\s\S]*?visible=\{visibleItems\.length\}/);
  assert.match(component, /function showMore\(\)[\s\S]*?visibleLimit \+= pageSize/);
});

test("progressive limits reset when the owning result changes", () => {
  assert.match(component, /export let resetKey: unknown = items/);
  assert.match(component, /resetKey !== previousResetKey[\s\S]*?visibleLimit = pageSize/);
});
