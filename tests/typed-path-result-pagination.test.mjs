import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url), "utf8");
const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");

test("typed-path witnesses and temporal steps use bounded progressive lists", () => {
  assert.match(panel, /import ProgressiveList from "\.\/ProgressiveList\.svelte"/);
  assert.match(panel, /items=\{whyNot\.walk\.nodeIds\}[^>]*label="nodi del prefisso"/);
  assert.match(panel, /items=\{proposal\.path\.nodeIds\}[^>]*label="nodi del cammino"/);
  assert.match(panel, /items=\{whyNot\.startTimeValuesByStep\}/);
  assert.match(panel, /items=\{proposal\.path\.startTimeValuesByStep\}/);
  assert.match(panel, /items=\{whyNot\.repeatedNodeIds\}[^>]*label="nodi rivisitati"/);
  assert.doesNotMatch(panel, /repeatedNodeIds\.slice\(0, 20\)/);
  assert.doesNotMatch(panel, /candidateEdgeIds\.slice\(0, 20\)/);
  assert.doesNotMatch(panel, /walk\.nodeIds\.map\(nodeLabel\)\.join/);
  assert.doesNotMatch(panel, /proposal\.path\.nodeIds\.map\(nodeLabel\)\.join/);
});

test("structural typed-path sequences, start times, and edge provenance stay paged", () => {
  assert.match(structuralPanel, /items=\{pathEdgeTypeSequence\}[^>]*label="tipi d'arco del cammino"/);
  assert.match(structuralPanel, /items=\{orderedStartTimes\}[^>]*label="inizi di validità nel testimone"/);
  assert.match(structuralPanel, /items=\{resultProvenanceEntries\}[^>]*label="fonti dichiarate degli archi"/);
  assert.match(structuralPanel, /items=\{stepProvenanceEntries\}[^>]*label="fonti dichiarate del passo"/);
  assert.match(structuralPanel, /items=\{supportingEdgeProvenance\}[^>]*label="riferimenti di provenienza"/);
  assert.doesNotMatch(structuralPanel, /pathEdgeTypeSequence\.join\(/);
  assert.doesNotMatch(structuralPanel, /startTimeValuesByStep[^\n]*\.join\(/);
  assert.doesNotMatch(structuralPanel, /Fonti dichiarate: \{edgeProvenanceSummary/);
});
