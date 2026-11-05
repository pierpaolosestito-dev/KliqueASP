import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { getGraphNodeHighlightScaleFactor, getGraphNodeHighlightState } from "../src/lib/kliqueasp/graph/nodeHighlightState.ts";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

const empty = new Set();
const baseOptions = {
  selectedNodeId: null,
  witnessNodeIds: empty,
  highlightedNeighborIds: empty,
  selectedNodeNeighborIds: empty
};

test("un nodo selezionato che appartiene al witness conserva il colore del risultato", () => {
  assert.equal(getGraphNodeHighlightState("a", {
    ...baseOptions,
    selectedNodeId: "a",
    witnessNodeIds: new Set(["a", "b"])
  }), "witness");
});

test("un nodo selezionato fuori dal witness resta evidenziato mentre il witness rimane leggibile", () => {
  const options = { ...baseOptions, selectedNodeId: "outside", witnessNodeIds: new Set(["a", "b"]) };
  assert.equal(getGraphNodeHighlightState("outside", options), "selected");
  assert.equal(getGraphNodeHighlightState("a", options), "witness");
  assert.equal(getGraphNodeHighlightState("other", options), "muted");
});

test("senza witness restano distinti nodo attivo, vicino, anteprima e sfondo", () => {
  const options = {
    ...baseOptions,
    selectedNodeId: "root",
    highlightedNeighborIds: new Set(["preview"]),
    selectedNodeNeighborIds: new Set(["neighbor"])
  };
  assert.equal(getGraphNodeHighlightState("root", options), "selected");
  assert.equal(getGraphNodeHighlightState("preview", options), "preview");
  assert.equal(getGraphNodeHighlightState("neighbor", options), "neighbor");
  assert.equal(getGraphNodeHighlightState("other", options), "muted");
  assert.equal(getGraphNodeHighlightState("other", baseOptions), "default");
  assert.equal(getGraphNodeHighlightState("preview", {
    ...baseOptions,
    highlightedNeighborIds: new Set(["preview"])
  }), "default");
});

test("GraphApp applica lo stesso stato semantico a colore, opacità e dimensione dell'anello", () => {
  assert.match(graphApp, /if \(highlightState === "selected"\) return H\.root/);
  assert.match(graphApp, /if \(highlightState === "witness"\) return H\.clique/);
  assert.match(graphApp, /if \(highlightState === "muted"\) return cliqueNodes\.size > 0 \? 0\.12 : 0\.22/);
  assert.match(graphApp, /getGraphNodeHighlightState\(nodeId, \{/);
  assert.match(graphApp, /const ringScale = baseRingScale \* getGraphNodeHighlightScaleFactor\(highlightState\)/);
  assert.match(graphApp, /kq\.ring\.scale\.set\(ringScale, ringScale, ringScale\)/);
});

test("3D ring size gives each emphasized node state a non-color cue", () => {
  assert.equal(getGraphNodeHighlightScaleFactor("selected"), 1.4);
  assert.equal(getGraphNodeHighlightScaleFactor("preview"), 1.3);
  assert.equal(getGraphNodeHighlightScaleFactor("witness"), 1.25);
  assert.equal(getGraphNodeHighlightScaleFactor("neighbor"), 1.15);
  assert.equal(getGraphNodeHighlightScaleFactor("muted"), 1);
  assert.equal(getGraphNodeHighlightScaleFactor("default"), 1);
});
