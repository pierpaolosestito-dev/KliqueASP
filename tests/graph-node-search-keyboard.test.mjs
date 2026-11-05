import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getGraphNodeSearchMatchScore,
  getGraphSearchSuggestionLabel,
  getGraphSearchSuggestionId,
  getNextGraphSearchSuggestionIndex,
  normalizeGraphNodeSearchQuery
} from "../src/lib/kliqueasp/graph/graphNodeSearch.ts";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("la navigazione delle proposte scorre e avvolge l'elenco", () => {
  assert.equal(getNextGraphSearchSuggestionIndex(-1, 3, 1), 0);
  assert.equal(getNextGraphSearchSuggestionIndex(-1, 3, -1), 2);
  assert.equal(getNextGraphSearchSuggestionIndex(2, 3, 1), 0);
  assert.equal(getNextGraphSearchSuggestionIndex(0, 3, -1), 2);
  assert.equal(getNextGraphSearchSuggestionIndex(0, 0, 1), -1);
});

test("gli indici attivi invalidi ripartono da una proposta valida", () => {
  assert.equal(getNextGraphSearchSuggestionIndex(7, 3, 1), 0);
  assert.equal(getNextGraphSearchSuggestionIndex(-4, 3, -1), 2);
  assert.equal(getNextGraphSearchSuggestionIndex(Number.NaN, 3, 1), 0);
});

test("l'ID della proposta attiva è stabile e non crea riferimenti negativi", () => {
  assert.equal(getGraphSearchSuggestionId(0), "graph-node-search-option-0");
  assert.equal(getGraphSearchSuggestionId(6), "graph-node-search-option-6");
  assert.equal(getGraphSearchSuggestionId(-1), undefined);
});

test("la ricerca rapida trova per nome e ID, privilegiando le corrispondenze esatte", () => {
  const candidate = {
    id: "node-17",
    label: "Alice Rossi",
    normalizedId: "node-17",
    normalizedLabel: "alice rossi"
  };
  const score = (query) => getGraphNodeSearchMatchScore(candidate, normalizeGraphNodeSearchQuery(query));
  assert.equal(normalizeGraphNodeSearchQuery(" NODE-17 "), "node-17");
  assert.equal(score("NODE-17"), 8);
  assert.equal(score("Alice Rossi"), 7);
  assert.equal(score("alice"), 6);
  assert.equal(score("node-"), 5);
  assert.equal(score("rossi"), 4);
  assert.equal(score("ice"), 3);
  assert.equal(score("17"), 2);
  assert.equal(score("missing"), 0);
});

test("i suggerimenti mostrano l'ID sorgente quando serve a distinguere i nodi", () => {
  assert.equal(getGraphSearchSuggestionLabel({ id: "node-17", label: "Alice Rossi" }), "Alice Rossi · node-17");
  assert.equal(getGraphSearchSuggestionLabel({ id: "Alice Rossi", label: "Alice Rossi" }), "Alice Rossi");
  assert.equal(getGraphSearchSuggestionLabel({ id: "node-17", label: "" }), "node-17");
  assert.match(graphApp, /aria-label="Cerca un nodo per nome o ID"/);
  assert.match(graphApp, /placeholder="Nome o ID del nodo…"/);
});

test("la ricerca del grafo espone il modello accessibile combobox e listbox", () => {
  assert.match(graphApp, /aria-label="Cerca un nodo per nome o ID"[\s\S]*?role="combobox"/);
  assert.match(graphApp, /aria-autocomplete="list"/);
  assert.match(graphApp, /aria-expanded=\{showSuggestions\}/);
  assert.match(graphApp, /aria-controls="graph-node-search-options"/);
  assert.match(graphApp, /id="graph-node-search-options" class="autocomplete" role="listbox"/);
  assert.match(graphApp, /role="option"[\s\S]*?aria-selected=\{activeSearchSuggestionIndex === index\}[\s\S]*?tabindex="-1"/);
  assert.match(graphApp, /aria-describedby="graph-node-search-keyboard-hint"/);
});

test("frecce, Invio ed Escape gestiscono le proposte mantenendo il focus nella casella", () => {
  const handler = graphApp.match(/function handleGraphNodeSearchKeydown\(event: KeyboardEvent\) \{[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(handler, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(handler, /event\.preventDefault\(\)/);
  assert.match(handler, /getNextGraphSearchSuggestionIndex\(/);
  assert.match(handler, /chooseSuggestion\(activeSuggestion\)/);
  assert.match(handler, /event\.key === "Escape" && showSuggestions/);
  assert.match(graphApp, /class:active=\{activeSearchSuggestionIndex === index\}/);
  assert.match(graphApp, /\.autocomplete-item\.active/);
});
