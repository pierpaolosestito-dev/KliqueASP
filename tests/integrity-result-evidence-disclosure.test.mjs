import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");

test("integrity results keep highlighting concise and expose complete evidence on demand", () => {
  assert.match(panel, /on:click=\{\(\) => dispatch\("highlight", violation\)\}/);
  assert.match(panel, /\{violation\.nodeIds\.length\} nodi · \{violationEdgeIds\(violation\)\.length\} archi coinvolti/);
  assert.match(panel, /open=\{violationDetailsOpen\(index\)\}/);
  assert.match(panel, /\{#if violationDetailsOpen\(index\)\}[\s\S]*?items=\{violation\.nodeIds\}/);
  assert.match(panel, /items=\{violationEdgeIds\(violation\)\} resetKey=\{violation\} label="archi della violazione"/);
  assert.match(panel, /if \(violations !== previousViolations\)[\s\S]*?expandedViolationIndex = null/);
});

test("integrity CSV continues to export every node, edge, and provenance value", () => {
  const exportStart = panel.indexOf("function exportResults()");
  const exportEnd = panel.indexOf("function exportRepairProposal()", exportStart);
  const exporter = panel.slice(exportStart, exportEnd);
  assert.match(exporter, /for \(const violation of violations\)/);
  assert.match(exporter, /violation\.nodeIds\.join\(" \| "\)/);
  assert.match(exporter, /violationEdgeIds\(violation\)\.join\(" \| "\)/);
  assert.match(exporter, /violationEdgeIds\(violation\)/);
  assert.match(exporter, /provenanceForEdges\(violationEdgeIds\(violation\)\)/);
});
