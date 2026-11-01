import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");

test("scenario why-not target certificates use progressive disclosure", () => {
  assert.match(panel, /uncoverableTargetNodeIds\s*\.slice\(0, visibleScenarioUncoverableTargetLimit\)/,
    "the panel should not render every target from an arbitrarily large user graph at once");
  assert.match(panel, /\{#each visibleScenarioUncoverableTargetIds as nodeId/);
  assert.match(panel, /total=\{provenanceDominatingSetScenarioWhyNot\.uncoverableTargetNodeIds\.length\}/);
  assert.match(panel, /visible=\{visibleScenarioUncoverableTargetIds\.length\}/);
  assert.match(panel, /showMore=\{\(\) => visibleScenarioUncoverableTargetLimit \+= certificatePageSize\}/);
});

test("k-core profiles progressively disclose levels as well as nodes within a level", () => {
  assert.match(panel, /kCoreProfileLevels\.slice\(0, visibleKCoreProfileLevelLimit\)/);
  assert.match(panel, /\{#each visibleKCoreProfileLevels as level\}/);
  assert.match(panel, /total=\{kCoreProfileLevels\.length\}/);
  assert.match(panel, /visible=\{visibleKCoreProfileLevels\.length\}/);
  assert.match(panel, /label="livelli di core"/);
  assert.match(panel, /level\.nodeIds\.slice\(0, visibleKCoreProfileLimits\[String\(level\.coreNumber\)\]/);
});

test("community partitions and their optional certificates page nested lists", () => {
  assert.match(panel, /partition\.communities\.slice\([\s\S]*?visiblePartitionCommunityLimits\[partitionIndex\]/);
  assert.match(panel, /\{#each visibleCommunities as community, communityIndex\}/);
  assert.match(panel, /label="comunità nella partizione"/);
  assert.match(panel, /partition\.communityContributions\.slice\([\s\S]*?visiblePartitionContributionLimits\[partitionIndex\]/);
  assert.match(panel, /\{#each visibleContributions as contribution\}/);
  assert.match(panel, /supportingEdgeIds\.slice\([\s\S]*?visibleCommunityContributionEdgeLimits\[contributionKey\]/);
  assert.match(panel, /\{#each visibleSupportingEdgeIds as edgeId\}/);
  assert.match(panel, /label="contributi di comunità"/);
  assert.match(panel, /label="record d'arco"/);
});

test("dominating-set target certificates page coverage relations and supporting edge records", () => {
  assert.match(panel, /selectedDominatingTargetCoverage\.slice\(0, visibleDominatingTargetCoverageLimit\)/,
    "large dominating sets should not render every coverage relation in the target detail at once");
  assert.match(panel, /\{#each visibleSelectedDominatingTargetCoverage as item/);
  assert.match(panel, /total=\{selectedDominatingTargetCoverage\.length\}/);
  assert.match(panel, /visible=\{visibleSelectedDominatingTargetCoverage\.length\}/);
  assert.match(panel, /showMore=\{showMoreDominatingTargetCoverage\}/);
  assert.match(panel, /item\.supportingRecords\.slice\(0, visibleDominatingSupportRecordLimits\[item\.coveringNodeId\]/,
    "multigraph evidence should be paginated independently for each covering node");
  assert.match(panel, /total=\{item\.supportingRecords\.length\}/);
  assert.match(panel, /visible=\{visibleSupportingRecords\.length\}/);
  assert.match(panel, /showMore=\{\(\) => showMoreDominatingSupportRecords\(item\.coveringNodeId\)\}/);
  assert.match(panel, /function exportDominatingSetExplanation\(\)[\s\S]*?coverage,\s*sourceIdByNodeId/,
    "the CSV certificate should continue exporting the full evidence set");
});

test("k-core certificates page parallel-edge evidence inside every neighbor record", () => {
  assert.match(panel, /function visibleKcoreSupportRecords\(pair: KCoreSupportingPair\)[\s\S]*?pair\.supportingRecords\.slice\(0, visibleKcoreSupportRecordLimits/);
  assert.equal([...panel.matchAll(/\{#each visibleKcoreRecords as record, recordIndex\}/g)].length, 3,
    "the empty-core peeling, selected-node certificate, and exclusion peeling should all use the bounded edge-record view");
  assert.equal([...panel.matchAll(/total=\{pair\.supportingRecords\.length\}[\s\S]*?visible=\{visibleKcoreRecords\.length\}[\s\S]*?showMore=\{\(\) => showMoreKcoreSupportRecords\(pair\)\}/g)].length, 3,
    "each evidence list should report its complete count and expose a way to inspect the remaining records");
});

test("structural provenance comparisons page unbounded scenario summaries", () => {
  assert.match(panel, /const scenarioSummaryPageSize = 20/);
  for (const family of ["KCore", "KPlex", "Component", "Dominating"]) {
    assert.match(panel, new RegExp(`visibleProvenance${family}Scenarios = provenance${family === "Dominating" ? "DominatingSet" : family}Comparison\\?\\.scenarios\\.slice\\(0, visible${family}ScenarioLimit\\)`));
    assert.match(panel, new RegExp(`\\{#each visibleProvenance${family}Scenarios as scenario`));
    assert.match(panel, new RegExp(`visible=\\{visibleProvenance${family}Scenarios\\.length\\}`));
    assert.match(panel, new RegExp(`showMore=\\{\\(\\) => visible${family}ScenarioLimit \\+= scenarioSummaryPageSize\\}`));
  }
  assert.doesNotMatch(panel, /provenanceDominatingSetComparison\.scenarios\.map\(\(scenario\) => scenario\.minimumSetSize\)\.join\("/,
    "the summary should avoid concatenating an arbitrarily long per-scenario list into one line");
});

test("per-node scenario evidence is disclosed and paged instead of concatenated", () => {
  assert.match(panel, /items=\{membership\.separateComponentScenarioIds\} resetKey=\{membership\} label="scenari con componenti diverse"/);
  assert.match(panel, /items=\{membership\.optimalScenarioIds\} resetKey=\{membership\} label="scenari con copertura minima"/);
  assert.doesNotMatch(panel, /membership\.(?:separateComponentScenarioIds|optimalScenarioIds)\.join\("/);
});

test("community repair and k-plex diagnosis expose full witness membership on demand", () => {
  assert.match(panel, /items=\{community\} resetKey=\{diagnosis\} label="nodi della partizione proposta"/);
  assert.match(panel, /items=\{kPlexMembershipDiagnosis\.witnessNodeIds\} resetKey=\{kPlexMembershipDiagnosis\} label="nodi del testimone k-plex"/);
  assert.doesNotMatch(panel, /witnessNodeIds\.slice\(0, 20\)/);
});
