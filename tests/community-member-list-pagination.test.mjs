import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");

test("community rows show a short member sample and keep the full highlight action", () => {
  assert.match(panel, /community\.slice\(0, 5\)\.map\(\(nodeId\) => sourceIdByNodeId\[nodeId\] \?\? nodeId\)\.join/);
  assert.match(panel, /community\.length > 5 \? ` · \+\$\{community\.length - 5\} altri`/);
  assert.match(panel, /highlightCommunity\(community, partition, partitionIndex, communityIndex\)/);
  const action = "on:click={() => highlightCommunity(community, partition, partitionIndex, communityIndex)}";
  const actionStart = panel.indexOf(action);
  const buttonStart = panel.lastIndexOf("<button", actionStart);
  const buttonEnd = panel.indexOf("</button>", actionStart);
  assert.notEqual(actionStart, -1);
  assert.notEqual(buttonStart, -1);
  assert.notEqual(buttonEnd, -1);
  assert.doesNotMatch(panel.slice(buttonStart, buttonEnd), /community\.map\(\(nodeId\) => sourceIdByNodeId\[nodeId\] \?\? nodeId\)\.join/);
});

test("full community membership is lazy and progressively paginated", () => {
  assert.match(panel, /open=\{communityDetailsOpen\(partitionIndex, communityIndex\)\}/);
  assert.match(panel, /\{#if communityDetailsOpen\(partitionIndex, communityIndex\)\}[\s\S]*?items=\{community\} resetKey=\{community\}/);
  assert.match(panel, /if \(communityPartitions !== previousCommunityPartitions\)[\s\S]*?expandedCommunityKey = null/);
});
