import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");

test("clique result buttons show a short member sample and keep the full witness selection", () => {
  const action = "on:click={() => highlightClique(c)}";
  const actionStart = panel.indexOf(action);
  const buttonStart = panel.lastIndexOf("<button", actionStart);
  const buttonEnd = panel.indexOf("</button>", actionStart);
  assert.notEqual(actionStart, -1);
  assert.notEqual(buttonStart, -1);
  assert.notEqual(buttonEnd, -1);
  const resultButton = panel.slice(buttonStart, buttonEnd);
  assert.match(resultButton, /<span class="clique-label">\{c\.length\} nodi · \{c\.slice\(0, 5\)\.join\(", "\)\}/);
  assert.match(resultButton, /aria-pressed=\{cliqueSignature\(c\) === selectedCliqueSignature\}/);
  assert.doesNotMatch(resultButton, /c\.join\(", "\)/);
});

test("the selected clique exposes all members progressively without changing its supporting-edge evidence", () => {
  assert.match(panel, /selectedCliqueNodes = filteredCliques\.find[\s\S]*?maximumCliques\.find/);
  assert.match(panel, /items=\{selectedCliqueNodes\} resetKey=\{selectedCliqueSignature\} label="nodi della clique"/);
  assert.match(panel, /selectedCliqueMembersOpen = false/);
  assert.match(panel, /\{#each visibleSelectedCliqueSupportingEdges as edge\}/);
});

test("the maximum-clique membership witness lists its nodes progressively", () => {
  assert.match(panel, /<ProgressiveList[\s\S]*?items=\{cliqueMembershipDiagnosis\.witnessNodeIds\}[\s\S]*?label="nodi del testimone"/);
  assert.match(panel, /sourceIdByNodeId\[item\] \?\? item/);
  assert.doesNotMatch(panel, /witnessNodeIds\.map\(\(nodeId\) => sourceIdByNodeId\[nodeId\][^\n]*\.join\(" \| "\)/);
});
