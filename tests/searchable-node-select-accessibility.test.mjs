import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const select = await readFile(new URL("../src/lib/kliqueasp/components/SearchableNodeSelect.svelte", import.meta.url), "utf8");
const fieldSelect = await readFile(new URL("../src/lib/kliqueasp/components/SearchableFieldSelect.svelte", import.meta.url), "utf8");

test("node selector exposes the combobox state and active option to assistive technology", () => {
  assert.match(select, /role="combobox"/);
  assert.match(select, /id=\{id\}/);
  assert.match(select, /aria-label=\{ariaLabel\}/);
  assert.match(select, /aria-expanded=\{open\}/);
  assert.match(select, /aria-controls=\{open && hasSearchableResults && visibleOptions\.length > 0 \? listboxId : undefined\}/);
  assert.match(select, /aria-activedescendant=\{activeOptionId\}/);
  assert.match(select, /\$: activeOptionId = open && hasSearchableResults && activeIndex >= 0[\s\S]*?`\$\{id\}-option-\$\{activeIndex\}`/);
  assert.match(select, /id=\{`\$\{id\}-option-\$\{index\}`\}/);
});

test("field selector forwards required semantics to the shared combobox", () => {
  assert.match(fieldSelect, /export let required = false/);
  assert.match(fieldSelect, /<SearchableNodeSelect[\s\S]*?\{required\}/);
  assert.match(select, /aria-required=\{required\}/);
});

test("node selector can associate a disabled state with its visible explanation", () => {
  assert.match(select, /export let disabledDescriptionId: string \| undefined = undefined/);
  assert.match(select, /aria-describedby=\{disabledDescriptionId\}/);
});

test("node selector options use listbox semantics and keyboard selection", () => {
  assert.match(select, /<div class="searchable-node-select" bind:this=\{rootElement\} on:focusout=\{handleBlur\}>/);
  assert.doesNotMatch(select, /on:blur=\{handleBlur\}/,
    "the popover should close when focus leaves any control in the selector, not only the input");
  assert.match(select, /function handleBlur\(event: FocusEvent\)[\s\S]*?rootElement\?\.contains\(nextTarget\)[\s\S]*?rootElement\?\.contains\(document\.activeElement\)/);
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
  assert.match(select, /\$: resultAnnouncement = open[\s\S]*?describeSearchableNodeResults\(query, countedMatchingOptions\.length, countedVisibleOptions\.length, \{/);
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

test("a no-match search offers a keyboard-reachable way to clear the query", () => {
  assert.match(select, /\{#if query\.trim\(\)\}\s*<button[\s\S]*?class="clear-search"[\s\S]*?type="button"[\s\S]*?on:click=\{clearSearchQuery\}[\s\S]*?Cancella ricerca<\/button>/);
  const clearSearch = select.slice(select.indexOf("function clearSearchQuery"), select.indexOf("function choose", select.indexOf("function clearSearchQuery")));
  assert.match(clearSearch, /query = ""/);
  assert.match(clearSearch, /open = true/);
  assert.match(clearSearch, /activeIndex = getNextEnabledNodeOptionIndex/);
  assert.match(clearSearch, /querySelector\("input"\)\?\.focus\(\)/);
  assert.match(clearSearch, /revealActiveOption\(\)/);
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
