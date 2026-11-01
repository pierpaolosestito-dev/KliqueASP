import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const provenanceReferences = await readFile(new URL("../src/lib/kliqueasp/components/ProvenanceReferences.svelte", import.meta.url), "utf8");

function summaryButtonFor(dispatchName) {
  const match = panel.match(new RegExp(`<button type="button" class="match" on:click=\\{\\(\\) => dispatch\\("${dispatchName}", [^}]+\\)\\}>([\\s\\S]*?)<\\/button>`));
  assert.ok(match, `the ${dispatchName} result keeps a dedicated highlight button`);
  return match[1];
}

test("motif result rows keep highlighting concise and disclose evidence on demand", () => {
  for (const kind of ["counterfactual", "match", "nearMatch"]) {
    assert.match(panel, new RegExp(`open=\\{resultEvidenceIsOpen\\("${kind}", index\\)\\}`));
    assert.match(panel, new RegExp(`setResultEvidenceOpen\\("${kind}", index, event\\.currentTarget\\.open\\)`));
  }

  for (const dispatchName of ["highlightCounterfactual", "highlight", "highlightNearMatch"]) {
    assert.doesNotMatch(summaryButtonFor(dispatchName), /\{#each|\.join\(/,
      "the highlight control should summarize a result instead of rendering all of its evidence inline");
  }

  assert.match(panel, /\{#if resultEvidenceIsOpen\("counterfactual", index\)\}[\s\S]*?proposal\.addedEdges/);
  assert.match(panel, /\{#if resultEvidenceIsOpen\("match", index\)\}[\s\S]*?match\.supportingEdges/);
  assert.match(panel, /\{#if resultEvidenceIsOpen\("nearMatch", index\)\}[\s\S]*?nearMatch\.violatedAbsencePatterns/);
});

test("expanded evidence is reset when its result set is replaced", () => {
  assert.match(panel, /if \(matches !== previousMatches\)[\s\S]*?expandedResultEvidence\?\.kind === "match"/);
  assert.match(panel, /if \(counterfactuals !== previousCounterfactuals\)[\s\S]*?expandedResultEvidence\?\.kind === "counterfactual"/);
  assert.match(panel, /if \(nearMatches !== previousNearMatches\)[\s\S]*?expandedResultEvidence\?\.kind === "nearMatch"/);
});

test("nested motif evidence uses reusable progressive lists, including edge record identities", () => {
  assert.match(panel, /import ProgressiveList from "\.\/ProgressiveList\.svelte"/);
  assert.match(panel, /import ProvenanceReferences from "\.\/ProvenanceReferences\.svelte"/);
  assert.ok([...panel.matchAll(/<ProgressiveList items=\{item\.edgeIds\}/g)].length >= 5,
    "parallel edge IDs and their per-record provenance should be disclosed progressively");
  assert.ok([...panel.matchAll(/<ProvenanceReferences/g)].length >= 5,
    "multiple declared references should stay out of a concatenated inline string");
  assert.match(provenanceReferences, /<ProgressiveList items=\{references\}[^>]*label="riferimenti di provenienza"/);
  assert.doesNotMatch(panel, /fonte dichiarata: \{provenanceForEdge\(edgeId\)\}/);
  assert.match(panel, /<ProgressiveList items=\{proposal\.addedEdges\}/);
  assert.match(panel, /<ProgressiveList items=\{item\.patternIndexes\}[^>]*label="relazioni del motivo"/);
  assert.doesNotMatch(panel, /item\.patternIndexes\.join\(/);
  assert.match(panel, /<ProgressiveList items=\{nearMatch\.missingPatterns\}/);
  assert.match(panel, /<ProgressiveList items=\{nearMatch\.temporalEvidence\.orderViolations\}/);
});
