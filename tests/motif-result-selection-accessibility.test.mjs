import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");

test("motif matches and diagnostics expose the selected witness row", () => {
  assert.match(panel, /aria-pressed=\{selectedMatchIndex === index\}/);
  assert.match(panel, /on:click=\{\(\) => highlightMatch\(match, index\)\}/);
  assert.match(panel, /aria-pressed=\{selectedNearMatchIndex === index\}/);
  assert.match(panel, /on:click=\{\(\) => highlightNearMatch\(nearMatch, index\)\}/);
  assert.match(panel, /aria-pressed=\{selectedCounterfactualIndex === index\}/);
  assert.match(panel, /on:click=\{\(\) => highlightCounterfactual\(proposal, index\)\}/);
  assert.match(panel, /\.match\[aria-pressed="true"\]/);
});

test("signed-triad match selection distinguishes witnesses by dyad polarity and source records", () => {
  assert.match(panel, /function signedTriadResultKey\(triad: SignedTriadResult\)[\s\S]*?triad\.nodeIds[\s\S]*?dyad\.polarity[\s\S]*?dyad\.edgeRecords\.map\(\(record\) => record\.id\)/);
  assert.match(panel, /aria-pressed=\{selectedSignedTriadKey === signedTriadResultKey\(triad\)\}/);
  assert.match(panel, /function focusSignedTriad\(triad: SignedTriadResult\)[\s\S]*?selectedSignedTriadKey = signedTriadResultKey\(triad\)/);
  assert.match(panel, /function clearSignedTriadFocus\(\)[\s\S]*?selectedSignedTriadKey = ""/);
});

test("motif witness selection clears when result arrays change or a new run starts", () => {
  assert.match(panel, /if \(matches !== previousMatches\)[\s\S]*?selectedMatchIndex = null/);
  assert.match(panel, /if \(nearMatches !== previousNearMatches\)[\s\S]*?selectedNearMatchIndex = null/);
  assert.match(panel, /if \(counterfactuals !== previousCounterfactuals\)[\s\S]*?selectedCounterfactualIndex = null/);
  assert.match(panel, /if \(signedTriadResults !== previousSignedTriadResults\)[\s\S]*?selectedSignedTriadKey = ""/);
  assert.match(panel, /function clearResults\(\)[\s\S]*?selectedMatchIndex = null;\s+selectedNearMatchIndex = null;\s+selectedCounterfactualIndex = null/);
  assert.match(panel, /function clearSignedTriadResults\(\)[\s\S]*?selectedSignedTriadKey = ""/);
});
