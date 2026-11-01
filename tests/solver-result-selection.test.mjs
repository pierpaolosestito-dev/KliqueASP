import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const solverPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url),
  "utf8"
);

test("the default highlighted maximum clique is also selected in the result list", () => {
  assert.match(solverPanel, /let selectedCliqueSignature = maximumCliques\[0\] \? cliqueSignature\(maximumCliques\[0\]\) : ""/);
  assert.match(solverPanel, /\$: if \(maximumCliques !== previousMaximumCliques\) \{\s*previousMaximumCliques = maximumCliques;\s*selectedCliqueSignature = maximumCliques\[0\] \? cliqueSignature\(maximumCliques\[0\]\) : "";/);
  assert.match(solverPanel, /class="clique-item" aria-pressed=\{cliqueSignature\(c\) === selectedCliqueSignature\}/);
});

test("supporting edge evidence is available in a collapsed disclosure", () => {
  const detailsStart = solverPanel.indexOf('<details class="selected-analysis clique-explanation">');
  const detailsEnd = solverPanel.indexOf('<div class="solver-cliques">', detailsStart);
  assert.ok(detailsStart >= 0 && detailsEnd > detailsStart, "evidenza clique non racchiusa in un disclosure");
  const evidence = solverPanel.slice(detailsStart, detailsEnd);
  assert.match(evidence, /<summary>\s*Evidenza della clique\s*· \{selectedCliqueNodes\.length\} nodi\s*\{#if selectedCliqueSupportingEdges\.length > 0\}\s*· \{formatItalianNumber\(selectedCliqueSupportingEdges\.length\)\} record di supporto\s*\{\/if\}\s*<\/summary>/);
  assert.doesNotMatch(evidence.slice(0, evidence.indexOf(">")), /\sopen(?:\s|=|>)/);
  assert.match(evidence, /items=\{selectedCliqueNodes\} resetKey=\{selectedCliqueSignature\}/);
  assert.match(evidence, /<ul>/);
});
