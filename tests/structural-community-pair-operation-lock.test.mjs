import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");

function functionBody(name, nextName) {
  const start = panel.indexOf(`function ${name}()`);
  const end = panel.indexOf(`function ${nextName}()`, start + 1);
  assert.ok(start >= 0 && end > start, `${name} should remain a named handler`);
  return panel.slice(start, end);
}

test("community pair analyses share one busy state and cannot overlap", () => {
  assert.match(panel, /\$: communityPairAnalysisRunning = communityPairMembershipRunning \|\| communityTopologyCounterfactualRunning;/);
  assert.match(functionBody("requestCommunityPairMembership", "clearCommunityPairMembershipResult"),
    /if \(running \|\| communityPairAnalysisRunning \|\| !communityPairMembershipEnabled\) return;/);
  assert.match(functionBody("requestCommunityTopologyCounterfactual", "exportCommunityTopologyCounterfactual"),
    /if \(running \|\| communityPairAnalysisRunning \|\| !communityTopologyCounterfactualEnabled\) return;/);
});

test("community pair inputs and both action buttons lock during either calculation", () => {
  const pairSectionStart = panel.indexOf('aria-labelledby="community-pair-membership-title"');
  const pairSectionEnd = panel.indexOf("</section>", pairSectionStart);
  const pairSection = panel.slice(pairSectionStart, pairSectionEnd);
  assert.ok(pairSectionStart >= 0 && pairSectionEnd > pairSectionStart, "pair membership section should remain present");
  assert.equal((pairSection.match(/disabled=\{running \|\| communityPairAnalysisRunning\}/g) ?? []).length, 2,
    "both node selectors should lock while the main or either pair analysis runs");
  assert.match(pairSection, /disabled=\{running \|\| communityPairAnalysisRunning \|\| !communityPairMembershipEnabled/);

  const topologyStart = panel.indexOf('aria-labelledby="community-topology-counterfactual-title"');
  const topologyEnd = panel.indexOf("</section>", topologyStart);
  const topologySection = panel.slice(topologyStart, topologyEnd);
  assert.ok(topologyStart >= 0 && topologyEnd > topologyStart, "topology counterfactual section should remain present");
  assert.match(topologySection, /disabled=\{running \|\| communityPairAnalysisRunning\}/,
    "the target relation should lock while either pair analysis runs");
  assert.match(topologySection, /disabled=\{running \|\| communityPairAnalysisRunning \|\| !communityTopologyCounterfactualEnabled/);
});

test("k-plex membership keeps its selected node stable during diagnosis and counterfactual search", () => {
  assert.match(panel, /\$: kPlexMembershipAnalysisRunning = kPlexMembershipDiagnosisRunning \|\| kPlexMembershipCounterfactualRunning;/);
  assert.match(panel, /id="kplex-membership-node"[\s\S]*?disabled=\{running \|\| kPlexMembershipAnalysisRunning\}/);
  assert.match(panel, /on:click=\{\(\) => dispatch\("diagnoseKPlexMaximumMembership", kPlexMembershipTargetNodeId\)\}[\s\S]*?disabled=\{running \|\| kPlexMembershipAnalysisRunning \|\| resultSets\.length === 0/);
  assert.match(panel, /on:click=\{\(\) => dispatch\("searchKPlexMaximumMembershipCounterfactual", kPlexMembershipTargetNodeId\)\}[\s\S]*?disabled=\{running \|\| kPlexMembershipAnalysisRunning \|\| resultSets\.length === 0/);
});
