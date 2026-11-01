import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");

test("contextual-clique evidence is mounted only for the expanded result", () => {
  assert.match(panel, /open=\{evidenceIsOpen\(result\)\}/);
  assert.match(panel, /setEvidenceOpen\(result, event\.currentTarget\.open\)/);
  assert.match(panel, /\{#if evidenceIsOpen\(result\)\}[\s\S]*?visiblePairWitnesses\(result\)/);
  assert.match(panel, /if \(results !== previousResults\)[\s\S]*?expandedResultKey = null/);
});

test("every contextual pair witness exposes all supporting edge IDs progressively", () => {
  assert.match(panel, /import ProgressiveList from "\.\/ProgressiveList\.svelte"/);
  assert.match(panel, /<ProgressiveList items=\{pair\.supportingEdges\} resetKey=\{pair\}/);
  assert.doesNotMatch(panel, /supportingEdges\.slice\(0, 15\)/,
    "edge records should be available page by page instead of leaving the remainder as an inaccessible count");
});

test("large contextual groups expose their full focal-node membership progressively", () => {
  assert.match(panel, /Elenco completo dei nodi focali · \{result\.sourceNodeIds\.length\}/);
  assert.match(panel, /<ProgressiveList items=\{result\.sourceNodeIds\} resetKey=\{result\} label="nodi focali"/);
});
