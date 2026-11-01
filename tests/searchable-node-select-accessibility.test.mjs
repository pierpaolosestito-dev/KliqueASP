import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const select = await readFile(new URL("../src/lib/kliqueasp/components/SearchableNodeSelect.svelte", import.meta.url), "utf8");

test("node selector exposes the combobox state and active option to assistive technology", () => {
  assert.match(select, /role="combobox"/);
  assert.match(select, /aria-label=\{ariaLabel\}/);
  assert.match(select, /aria-expanded=\{open\}/);
  assert.match(select, /aria-controls=\{open && matchingOptions\.length > 0 \? listboxId : undefined\}/);
  assert.match(select, /aria-activedescendant=\{activeOptionId\}/);
  assert.match(select, /\$: activeOptionId = open && activeIndex >= 0[\s\S]*?`\$\{id\}-option-\$\{activeIndex\}`/);
  assert.match(select, /id=\{`\$\{id\}-option-\$\{index\}`\}/);
});

test("node selector options use listbox semantics and keyboard selection", () => {
  assert.match(select, /role="listbox" aria-label=\{`Risultati per \$\{ariaLabel\}`\}/);
  assert.match(select, /role="option"/);
  assert.match(select, /aria-selected=\{option\.value === value\}/);
  assert.match(select, /aria-disabled=\{option\.disabled \?\? false\}/);
  assert.match(select, /event\.key === "ArrowDown"/);
  assert.match(select, /event\.key === "ArrowUp"/);
  assert.match(select, /event\.key === "Enter" && open/);
  assert.match(select, /event\.key === "Escape" && open/);
  assert.match(select, /on:mousedown\|preventDefault/);
});

test("node selector announces result counts and empty searches without duplicate live regions", () => {
  assert.match(select, /class="visually-hidden" aria-live="polite" aria-atomic="true"/);
  assert.match(select, /\$: resultAnnouncement = open[\s\S]*?describeSearchableNodeResults\(query, matchingOptions\.length, visibleOptions\.length\)/);
  assert.match(select, /<p class="visually-hidden" aria-live="polite" aria-atomic="true">\{resultAnnouncement\}<\/p>/);
  assert.doesNotMatch(select, /\{#if open\}\s*<p class="visually-hidden"/,
    "the live region should exist before it receives an announcement");
  assert.match(select, /<p class="empty-options">/);
  assert.match(select, /Nessun nodo corrisponde alla ricerca/);
  assert.doesNotMatch(select, /<p class="empty-options" role="status">/);
});

test("node selector offers keyboard-reachable pagination", () => {
  assert.match(select, /<button class="show-more" type="button"/);
  assert.match(select, /on:click=\{showMore\}/);
});

test("node selector scrolls the active descendant into the visible listbox area", () => {
  assert.match(select, /function revealActiveOption\(\)[\s\S]*?void tick\(\)\.then/);
  assert.match(select, /visibleListTop = listBounds\.top \+ listbox\.clientTop \+ 1/);
  assert.match(select, /visibleListBottom = visibleListTop \+ listbox\.clientHeight - 2/);
  assert.match(select, /listbox\.scrollTop \+= getActiveNodeOptionScrollAdjustment\(/);
  assert.match(select, /activeOption\.scrollIntoView\(\{ block: "nearest" \}\)/);
  const keydown = select.slice(select.indexOf("function handleKeydown"), select.indexOf("function handleBlur"));
  assert.match(keydown, /event\.key === "ArrowDown"[\s\S]*?revealActiveOption\(\)/);
  assert.match(keydown, /event\.key === "ArrowUp"[\s\S]*?revealActiveOption\(\)/);
});
