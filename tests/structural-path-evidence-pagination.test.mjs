import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
const counterfactualPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8");

test("path certificates let users inspect every reachable node and supporting edge record", () => {
  assert.match(panel, /items=\{layer\.nodeIds\} resetKey=\{layer\} label=\{`nodi raggiungibili entro/);
  assert.match(panel, /items=\{layer\.nodeIds\} resetKey=\{typedPathNoRouteCertificate\} label=\{`nodi raggiungibili dopo il passo/);
  assert.match(panel, /items=\{edgeIds\} resetKey=\{typedPathNoRouteCertificate\} label=\{`record d'arco del passo/);
  assert.match(panel, /items=\{pathEdgeIdsByStep\[step\] \?\? \[\]\}/);
  assert.match(panel, /items=\{edgeIds\} resetKey=\{resultSignature\} label="record d'arco del passo"/);
  assert.match(panel, /items=\{nodeSet\} resetKey=\{resultSignature\} label="nodi del cammino"/);
  assert.match(panel, /items=\{nodeSet\} resetKey=\{resultSignature\} label=\{task === "minimumEdgeSeparator"/);
  assert.doesNotMatch(panel, /layer\.nodeIds\.slice\(0, 20\)/);
  assert.doesNotMatch(panel, /edgeIds\.slice\(0, 15\)/);
});

test("structural completion witnesses expose all blocker neighbors and core members", () => {
  assert.match(counterfactualPanel, /items=\{blocker\.unfillableMissingNeighborIds\}[^>]*label="nodi senza arco candidato"/);
  assert.match(counterfactualPanel, /items=\{blocker\.additionalCandidateNeighborIds\}[^>]*label="vicini aggiungibili"/);
  assert.match(counterfactualPanel, /items=\{step\.survivingNeighborIds\}[^>]*label="vicini ancora attivi"/);
  assert.match(counterfactualPanel, /items=\{proposal\.coreWitnessNodeIds\}[^>]*label="nodi del testimone k-core"/);
  assert.doesNotMatch(counterfactualPanel, /(?:unfillableMissingNeighborIds|additionalCandidateNeighborIds|survivingNeighborIds|coreWitnessNodeIds)\.slice\(0, 20\)/);
});
