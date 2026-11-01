import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");

test("motif scenario summaries and per-membership witnesses are progressively disclosed", () => {
  assert.match(panel, /scenarioComparison\?\.scenarios\.slice\(0, visibleMotifScenarioLimit\)/);
  assert.match(panel, /\{#each visibleMotifScenarioSummaries as scenario/);
  assert.match(panel, /total=\{scenarioComparison\.scenarios\.length\}[\s\S]*?visible=\{visibleMotifScenarioSummaries\.length\}/);
  assert.match(panel, /membership\.evidenceByScenario\.slice\(0, visibleMotifScenarioEvidenceLimits\[key\]/);
  assert.match(panel, /\{#each visibleEvidence as evidence/);
  assert.match(panel, /total=\{membership\.evidenceByScenario\.length\}[\s\S]*?visible=\{visibleEvidence\.length\}/);
  assert.doesNotMatch(panel, /membership\.scenarioIds\.join\(/,
    "scenario IDs should not be duplicated in an unbounded text string when paged witness controls expose them individually");
  assert.doesNotMatch(panel, /\{#each scenarioComparison\.scenarios as scenario/);
  assert.doesNotMatch(panel, /\{#each membership\.evidenceByScenario as evidence/);
});

test("signed-triad scenario summaries, worlds, and parallel-edge records are bounded", () => {
  assert.match(panel, /signedTriadScenarioComparison\?\.scenarios\.slice\(0, visibleSignedTriadScenarioSummaryLimit\)/);
  assert.match(panel, /\{#each visibleSignedTriadScenarioSummaries as scenario/);
  assert.match(panel, /membership\.worlds\.slice\(0, visibleSignedTriadWorldLimits\[key\]/);
  assert.match(panel, /\{#each visibleWorlds as world/);
  assert.match(panel, /records\.slice\(0, visibleSignedTriadEdgeRecordLimits\[key\]/);
  assert.equal([...panel.matchAll(/visibleEdgeRecords\.map\(\(record\) => record\.id\)\.join\(", "\)/g)].length, 2,
    "both the current triad witness and per-scenario triad evidence should use the bounded record slice");
  assert.doesNotMatch(panel, /\{#each signedTriadScenarioComparison\.scenarios as scenario/);
  assert.doesNotMatch(panel, /\{#each membership\.worlds as world/);
  assert.doesNotMatch(panel, /dyad\.edgeRecords\.map\(\(record\) => record\.id\)\.join\(/);
});
