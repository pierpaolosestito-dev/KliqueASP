import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [provenance, structural, counterfactual, readGraphApp] = await Promise.all([
  readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8")
]);

test("scenario membership rows expose and reset their selected witness", () => {
  assert.match(provenance, /export let highlightedNodeIds: string\[\] = \[\]/);
  assert.match(provenance, /function isMembershipRowSelected\(nodeId: string\): boolean[\s\S]*?selectedMembershipNodeId === nodeId[\s\S]*?highlightedNodeIds\.length === 1[\s\S]*?highlightedNodeIds\[0\] === nodeId/);
  assert.match(provenance, /aria-pressed=\{isMembershipRowSelected\(membership\.nodeId\)\}/);
  assert.match(provenance, /selectedMembershipNodeId = nodeId;\s+dispatch\("highlight", \[nodeId\]\)/);
  assert.match(provenance, /if \(comparison !== previousComparison\)[\s\S]*?selectedMembershipNodeId = ""/);
  assert.match(provenance, /\.membership-list button\[aria-pressed="true"\]/);
  assert.match(readGraphApp, /comparison=\{provenanceScenarioComparison\}[\s\S]*?highlightedNodeIds=\{\[\.\.\.cliqueNodes\]\}/);
});

test("community and k-core witness actions reflect the graph's current highlighted node set", () => {
  assert.match(structural, /function isCurrentHighlightedWitness\(nodeIds: string\[\]\)[\s\S]*?nodeSetSignature\(nodeIds\) === nodeSetSignature\(highlightedNodeIds\)/);
  assert.match(structural, /aria-pressed=\{isCurrentHighlightedWitness\(community\)\}/);
  assert.match(structural, /aria-pressed=\{isCurrentHighlightedWitness\(members\)\}/);
  assert.match(structural, /aria-pressed=\{isCurrentHighlightedWitness\(getKCoreNodeIdsAtThreshold\(level\.coreNumber\)\)\}/);
  assert.equal((structural.match(/aria-pressed=\{isCurrentHighlightedWitness\(\[step\.nodeId, \.\.\.step\.survivingNeighborIds\]\)\}/g) ?? []).length, 2);
  assert.match(structural, /\.result\[aria-pressed="true"\]/);
  assert.match(structural, /\.kcore-profile-level-heading button\[aria-pressed="true"\]/);
});

test("counterfactual proposal selection clears on changed criteria, rerun, and replacement results", () => {
  assert.match(counterfactual, /aria-pressed=\{selectedProposalIndex === proposalIndex\}/);
  assert.equal((counterfactual.match(/aria-pressed=\{selectedProposalIndex === proposalIndex\}/g) ?? []).length, 2);
  assert.match(counterfactual, /selectedProposalIndex = proposals\.indexOf\(proposal\)/);
  assert.match(counterfactual, /function criteriaChanged\(\)[\s\S]*?selectedProposalIndex = null;\s+dispatch\("criteriaChange"\)/);
  assert.match(counterfactual, /if \(proposals !== previousProposals\)[\s\S]*?selectedProposalIndex = null/);
  assert.match(counterfactual, /searchPending = true;\s+selectedProposalIndex = null/);
  assert.match(counterfactual, /\.counterfactual-proposal\.selected/);
});
