import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const editor = await readFile(new URL("../src/lib/kliqueasp/components/JsonEditor.svelte", import.meta.url), "utf8");
const fieldSelect = await readFile(new URL("../src/lib/kliqueasp/components/SearchableFieldSelect.svelte", import.meta.url), "utf8");
const searchableSelect = await readFile(new URL("../src/lib/kliqueasp/components/SearchableNodeSelect.svelte", import.meta.url), "utf8");

test("all JSON field mappings use the searchable paged picker", () => {
  assert.equal((editor.match(/options=\{nodeFieldSearchOptions\}/g) ?? []).length, 8);
  assert.equal((editor.match(/options=\{edgeFieldSearchOptions\}/g) ?? []).length, 12);
  assert.doesNotMatch(editor, /fieldOptions\(|#each nodeFieldPaths as field|#each edgeFieldPaths as field/);
  assert.match(editor, /nodeFieldSearchOptions = nodeFieldPaths\.map\(\(path\) => \(\{ value: path, label: path \}\)\)/);
  assert.match(editor, /edgeFieldSearchOptions = edgeFieldPaths\.map\(\(path\) => \(\{ value: path, label: path \}\)\)/);
});

test("dataset field discovery updates automatically without a redundant scan action", () => {
  assert.match(editor, /\$: if \(open && datasetText !== inspectedDatasetText\) scheduleFieldInspection\(datasetText\);/);
  assert.match(editor, /Trovati \{nodeFieldPaths\.length\} campi nodo e \{edgeFieldPaths\.length\} campi arco\./);
  assert.doesNotMatch(editor, /Rileva campi|mapping-heading/);
});

test("field picker keeps clear and no-result states in Italian and forwards the chosen path", () => {
  assert.match(fieldSelect, /includeEmptyOption/);
  assert.match(fieldSelect, /emptyOptionLabel/);
  assert.match(fieldSelect, /Nessun campo JSON disponibile/);
  assert.match(fieldSelect, /Nessun campo JSON corrisponde alla ricerca/);
  assert.match(fieldSelect, /on:change=\{\(event\) => dispatch\("change", event\.detail\)\}/);
  assert.match(searchableSelect, /id=\{id\}/);
  assert.match(searchableSelect, /visibleOptions = matchingOptions\.slice\(0, visibleLimit\)/);
});

test("data diagnostic links can still focus the searchable mapping controls", () => {
  for (const id of ["mapping-node-id", "mapping-node-type", "mapping-edge-source", "mapping-edge-target", "mapping-edge-id", "mapping-edge-type"]) {
    assert.match(editor, new RegExp(`<SearchableFieldSelect id="${id}"`));
  }
  assert.match(searchableSelect, /<input\s+id=\{id\}/);
});

test("optional node and edge attribute mappings are revealed in bounded pages", () => {
  assert.match(editor, /const ATTRIBUTE_MAPPING_PAGE_SIZE = 20;/);
  assert.match(editor, /nodeAttributeEntries = Object\.entries\(nodeMapping\.attributes \?\? \{\}\)\.reverse\(\)/);
  assert.match(editor, /edgeAttributeEntries = Object\.entries\(edgeMapping\.attributes \?\? \{\}\)\.reverse\(\)/);
  assert.match(editor, /visibleNodeAttributeEntries = nodeAttributeEntries\.slice\(0, visibleNodeAttributeLimit\)/);
  assert.match(editor, /visibleEdgeAttributeEntries = edgeAttributeEntries\.slice\(0, visibleEdgeAttributeLimit\)/);
  assert.match(editor, /#each visibleNodeAttributeEntries as \[alias, path\], attributeIndex \(alias\)/);
  assert.match(editor, /#each visibleEdgeAttributeEntries as \[alias, path\], attributeIndex \(alias\)/);
  assert.match(editor, /total=\{nodeAttributeEntries\.length\}[\s\S]*?visible=\{visibleNodeAttributeEntries\.length\}[\s\S]*?label="attributi nodo"/);
  assert.match(editor, /total=\{edgeAttributeEntries\.length\}[\s\S]*?visible=\{visibleEdgeAttributeEntries\.length\}[\s\S]*?label="attributi arco"/);
  assert.doesNotMatch(editor, /#each Object\.entries\((?:node|edge)Mapping\.attributes/);
});
