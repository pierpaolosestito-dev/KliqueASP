import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getStructuralResultPressedState } from "../src/lib/kliqueasp/graph/structuralResultSelection.ts";

const selection = {
  activeSeparatorSignature: "cut-1\u0000cut-2",
  selectedDominatingSignature: "a\u0000b",
  selectedKcoreSignature: "core-a\u0000core-b",
  selectedKplexSignature: "plex-a\u0000plex-b"
};

test("tracked structural witnesses expose their selected state to aria-pressed", () => {
  assert.equal(getStructuralResultPressedState("kPlex", "plex-a\u0000plex-b", selection), true);
  assert.equal(getStructuralResultPressedState("maximalKPlex", "other", selection), false);
  assert.equal(getStructuralResultPressedState("kCore", "core-a\u0000core-b", selection), true);
  assert.equal(getStructuralResultPressedState("dominatingSet", "a\u0000b", selection), true);
  assert.equal(getStructuralResultPressedState("dominatingSet", "a\u0000c", selection), false);
});

test("k-plex and k-core result rows follow the witness currently highlighted in the graph", () => {
  const highlightedCore = {
    ...selection,
    selectedKcoreSignature: "",
    selectedKplexSignature: "",
    selectedResultSignature: "core-a\u0000core-b"
  };
  assert.equal(getStructuralResultPressedState("kCore", "core-a\u0000core-b", highlightedCore), true);
  assert.equal(getStructuralResultPressedState("kPlex", "plex-a\u0000plex-b", highlightedCore), false);

  const restoredFullGraph = { ...selection, selectedResultSignature: "" };
  assert.equal(getStructuralResultPressedState("kCore", "core-a\u0000core-b", restoredFullGraph), false);
  assert.equal(getStructuralResultPressedState("kPlex", "plex-a\u0000plex-b", restoredFullGraph), false);
});

test("separator witnesses retain their active-state semantics", () => {
  assert.equal(getStructuralResultPressedState("minimumNodeSeparator", "cut-1\u0000cut-2", selection), true);
  assert.equal(getStructuralResultPressedState("minimumCostEdgeSeparator", "other-cut", selection), false);
});

test("result rows without a tracked selection are ordinary buttons", () => {
  assert.equal(getStructuralResultPressedState("components", "component-a", selection), undefined);
  assert.equal(getStructuralResultPressedState("path", "a\u0000b", selection), undefined);
  assert.equal(getStructuralResultPressedState("typedPath", "a\u0000b", selection), undefined);
  assert.equal(getStructuralResultPressedState("communities", "community-a", selection), undefined);
});

test("component and path result rows reflect the node witness highlighted in the graph", () => {
  const withVisibleWitness = { ...selection, selectedResultSignature: "a\u0000b" };
  assert.equal(getStructuralResultPressedState("components", "a\u0000b", withVisibleWitness), true);
  assert.equal(getStructuralResultPressedState("components", "c\u0000d", withVisibleWitness), false);
  assert.equal(getStructuralResultPressedState("weakComponents", "a\u0000b", withVisibleWitness), true);
  assert.equal(getStructuralResultPressedState("strongComponents", "a\u0000b", withVisibleWitness), true);
  assert.equal(getStructuralResultPressedState("path", "a\u0000b", withVisibleWitness), true);
  assert.equal(getStructuralResultPressedState("typedPath", "a\u0000b", withVisibleWitness), true);
  assert.equal(getStructuralResultPressedState("path", "a\u0000c", withVisibleWitness), false);
});

test("the structural panel receives the graph witness used by its pressed-state buttons", async () => {
  const [panel, graphApp] = await Promise.all([
    readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8")
  ]);
  assert.match(panel, /export let highlightedNodeIds: string\[\] = \[\]/);
  assert.match(panel, /selectedResultSignature: nodeSetSignature\(highlightedNodeIds\)/);
  assert.match(panel, /aria-pressed=\{resultPressed\}/);
  assert.match(graphApp, /<StructuralAnalysisPanel[\s\S]*?highlightedNodeIds=\{\[\.\.\.cliqueNodes\]\}/);
});
