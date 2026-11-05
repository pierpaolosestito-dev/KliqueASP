import test from "node:test";
import assert from "node:assert/strict";
import {
  filterSearchableNodeOptions,
  describeSearchableNodeResults,
  getSearchableOptionsWithCurrentValue,
  getNextSearchableNodeOptionPage,
  getNextEnabledNodeOptionIndex,
  getActiveNodeOptionScrollAdjustment
} from "../src/lib/kliqueasp/graph/searchableNodeOptions.ts";

const options = [
  { value: "n-1", label: "Álvaro Rossi" },
  { value: "n-2", label: "Beatrice Verdi" },
  { value: "source-900", label: "Carlo Bianchi", disabled: true }
];

test("live search announcements describe singular and paged result counts", () => {
  assert.equal(describeSearchableNodeResults("a", 1, 1), "1 nodo trovato. 1 opzione mostrata.");
  assert.equal(describeSearchableNodeResults("a", 45, 30), "45 nodi trovati. 30 opzioni mostrate.");
  assert.equal(describeSearchableNodeResults("a", 45, 45), "45 nodi trovati. 45 opzioni mostrate.");
});

test("live search announcements distinguish no match from an empty graph", () => {
  assert.equal(describeSearchableNodeResults("", 0, 0), "Nessun nodo disponibile.");
  assert.equal(describeSearchableNodeResults("chi", 0, 0), "Nessun nodo corrisponde alla ricerca.");
  assert.equal(describeSearchableNodeResults("chi", 2, 30), "2 nodi trovati. 2 opzioni mostrate.");
});

test("live search announcements can describe JSON fields instead of graph nodes", () => {
  const copy = {
    emptyMessage: "Nessun campo JSON disponibile.",
    noResultsMessage: "Nessun campo JSON corrisponde alla ricerca.",
    singularResultLabel: "campo trovato",
    pluralResultLabel: "campi trovati"
  };
  assert.equal(describeSearchableNodeResults("", 0, 0, copy), "Nessun campo JSON disponibile.");
  assert.equal(describeSearchableNodeResults("inesistente", 0, 0, copy), "Nessun campo JSON corrisponde alla ricerca.");
  assert.equal(describeSearchableNodeResults("id", 1, 1, copy), "1 campo trovato. 1 opzione mostrata.");
  assert.equal(describeSearchableNodeResults("tipo", 24, 20, copy), "24 campi trovati. 20 opzioni mostrate.");
});

test("searchable field choices preserve a stale configured path and exclude the clear choice from counts", () => {
  const discovered = [{ value: "$.id", label: "$.id" }];
  const prepared = getSearchableOptionsWithCurrentValue(discovered, "$.legacy", "Automatico / radice");
  assert.deepEqual(prepared, [
    { value: "$.legacy", label: "$.legacy" },
    { value: "", label: "Automatico / radice", countable: false },
    { value: "$.id", label: "$.id" }
  ]);
  assert.deepEqual(getSearchableOptionsWithCurrentValue([
    { value: "$.label", label: "$.label" },
    { value: "$.id", label: "$.id" }
  ], "$.id", "Automatico / radice"), [
    { value: "$.id", label: "$.id" },
    { value: "", label: "Automatico / radice", countable: false },
    { value: "$.label", label: "$.label" }
  ]);
  assert.equal(getSearchableOptionsWithCurrentValue(discovered, "", "")[0], discovered[0]);
  assert.deepEqual(discovered, [{ value: "$.id", label: "$.id" }]);
});

test("a wide JSON schema stays searchable without truncating field paths", () => {
  const discovered = Array.from({ length: 5000 }, (_, index) => ({
    value: `$.field_${String(index).padStart(4, "0")}`,
    label: `$.field_${String(index).padStart(4, "0")}`
  }));
  const optionsWithClear = getSearchableOptionsWithCurrentValue(discovered, "$.field_4999", "Nessun mapping");
  const matches = filterSearchableNodeOptions(optionsWithClear, "field_4999");

  assert.equal(optionsWithClear.length, 5001);
  assert.equal(optionsWithClear[0].value, "$.field_4999");
  assert.equal(optionsWithClear[1].countable, false);
  assert.deepEqual(matches.map(({ value }) => value), ["$.field_4999"]);
});

test("live search announcements clamp invalid or excessive displayed counts", () => {
  assert.equal(describeSearchableNodeResults("x", Number.NaN, 4), "Nessun nodo corrisponde alla ricerca.");
  assert.equal(describeSearchableNodeResults("x", 2.8, 10), "2 nodi trovati. 2 opzioni mostrate.");
  assert.equal(describeSearchableNodeResults("x", 2, -1), "2 nodi trovati. 0 opzioni mostrate.");
});

test("node search returns the original choices for an empty query", () => {
  assert.equal(filterSearchableNodeOptions(options, "   "), options);
});

test("node search ignores case and diacritics in visible labels", () => {
  assert.deepEqual(filterSearchableNodeOptions(options, "alvaro"), [options[0]]);
});

test("node search matches stable IDs as well as labels", () => {
  assert.deepEqual(filterSearchableNodeOptions(options, "900"), [options[2]]);
});

test("node search preserves choice order, disabled state, and its input options", () => {
  const before = structuredClone(options);
  assert.deepEqual(filterSearchableNodeOptions(options, "i"), [options[0], options[1], options[2]]);
  assert.deepEqual(options, before);
});

test("node search returns an empty collection when nothing matches", () => {
  assert.deepEqual(filterSearchableNodeOptions(options, "inesistente"), []);
});

test("keyboard navigation starts at the first or last enabled suggestion", () => {
  assert.equal(getNextEnabledNodeOptionIndex(options, -1, 1), 0);
  assert.equal(getNextEnabledNodeOptionIndex(options, -1, -1), 1);
});

test("keyboard navigation skips disabled suggestions and wraps around", () => {
  assert.equal(getNextEnabledNodeOptionIndex(options, 1, 1), 0);
  assert.equal(getNextEnabledNodeOptionIndex(options, 0, -1), 1);
});

test("keyboard navigation reports no option when the list is empty or disabled", () => {
  assert.equal(getNextEnabledNodeOptionIndex([], -1, 1), -1);
  assert.equal(getNextEnabledNodeOptionIndex(options.map((option) => ({ ...option, disabled: true })), -1, 1), -1);
});

test("keyboard navigation extends a large node list and skips disabled options on the next page", () => {
  const manyOptions = Array.from({ length: 35 }, (_, index) => ({
    value: `node-${index}`,
    label: `Node ${index}`,
    disabled: index === 30
  }));
  assert.deepEqual(getNextSearchableNodeOptionPage(manyOptions, 29, 30, 30), {
    visibleLimit: 35,
    activeIndex: 31
  });
  assert.deepEqual(getNextSearchableNodeOptionPage(manyOptions, -1, 30, 30), {
    visibleLimit: 35,
    activeIndex: 0
  });
});

test("keyboard navigation keeps the current page size bounded", () => {
  const manyOptions = Array.from({ length: 35 }, (_, index) => ({ value: `node-${index}`, label: `Node ${index}` }));
  assert.deepEqual(getNextSearchableNodeOptionPage(manyOptions, 2, 30, 30), {
    visibleLimit: 30,
    activeIndex: 3
  });
  assert.deepEqual(getNextSearchableNodeOptionPage(manyOptions, 29, 30, 0), {
    visibleLimit: 35,
    activeIndex: 30
  });
});

test("active node suggestions scroll only when they leave the visible listbox", () => {
  assert.equal(getActiveNodeOptionScrollAdjustment(20, 50, 10, 100), 0);
  assert.equal(getActiveNodeOptionScrollAdjustment(95, 125, 10, 100), 25);
  assert.equal(getActiveNodeOptionScrollAdjustment(-15, 15, 10, 100), -25);
  assert.equal(getActiveNodeOptionScrollAdjustment(50, 100.25, 10, 100), 1);
  assert.equal(getActiveNodeOptionScrollAdjustment(9.75, 50, 10, 100), -1);
});
