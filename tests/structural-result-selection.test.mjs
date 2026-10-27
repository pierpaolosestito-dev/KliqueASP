import assert from "node:assert/strict";
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
