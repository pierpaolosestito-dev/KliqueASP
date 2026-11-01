import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("selecting a multi-node witness fits the visible witness instead of zooming to its first node", () => {
  const helperStart = graphApp.indexOf("function selectWitnessRoot(nodeIds: string[])");
  const helperEnd = graphApp.indexOf("function selectSearchResult", helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, "witness selection helper should remain present");
  const helper = graphApp.slice(helperStart, helperEnd);

  assert.match(helper, /new Set\(nodeIds\.map\(String\)\)/);
  assert.match(helper, /\.filter\(\(id\) => getNodeById\(id\)\)/);
  assert.match(helper, /selectRoot\(rootId, "start", false\)/);
  assert.match(helper, /selectedNode = null;\s*selectedDetails = null;/);
  assert.match(helper, /selectedDetails = null;\s*persistCurrentAnalysisSession\(true\);/);
  assert.match(helper, /visibleNodeIds\.length > 1[\s\S]*?graph3D\?\.zoomToFit/);
  assert.match(helper, /witnessNodeIds\.has\(String\(node\.id\)\)/);
  assert.match(helper, /else \{\s*focusNode\(rootId\);/);
});

test("analysis-session restore preserves when a witness intentionally hides node details", () => {
  assert.match(graphApp, /showNodeDetails: selectedNode !== null/);
  assert.match(graphApp, /if \(focus\.showNodeDetails !== false\)[\s\S]*?buildUiDetails\(selectedNode\)[\s\S]*?selectedNode = null;\s*selectedDetails = null;/);
});

test("clique, structural, relation, scenario, and integrity witnesses share the witness-fit behavior", () => {
  for (const expression of [
    /selectWitnessRoot\(clique\)/,
    /selectWitnessRoot\(diagnosis\.witnessNodeIds\)/,
    /selectWitnessRoot\(triad\.nodeIds\)/,
    /selectWitnessRoot\(match\.nodeIds\)/,
    /selectWitnessRoot\(visualization\.nodeIds\)/,
    /selectWitnessRoot\(selectedNodes\)/,
    /selectWitnessRoot\(witness\.nodeIds\)/,
    /selectWitnessRoot\(path\.nodeIds\)/
  ]) {
    assert.match(graphApp, expression);
  }
});
