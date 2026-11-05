import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { displayNodeResultLabelWithSourceId } from "../src/lib/kliqueasp/graph/nodeResultLabel.ts";

const contextualPanel = await readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");
const motifPanel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const provenancePanel = await readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("la clique contestuale risolve le etichette con lookup di proprieta proprie", () => {
  const inheritedLabels = Object.create({ constructor: "etichetta ereditata" });
  assert.equal(displayNodeResultLabelWithSourceId("constructor", inheritedLabels, "psych-17"), "psych-17");
  assert.equal(displayNodeResultLabelWithSourceId("person-a", { "person-a": "Alice Rossi" }, "psych-17"), "Alice Rossi (psych-17)");
  assert.match(contextualPanel, /displayNodeResultLabelWithSourceId\(nodeId, nodeLabelById, sourceId\)/);
  assert.doesNotMatch(contextualPanel, /nodeLabelById\[nodeId\]/);
});

test("triadi firmate e loro confronti usano un'etichetta sicura con l'ID sorgente", () => {
  assert.match(motifPanel, /return displayNodeResultLabel\(nodeId, nodeLabelById, sourceIdByNodeId\)/);
  assert.match(motifPanel, /triad\.nodeIds\.map\(signedTriadNodeDisplay\)/);
  assert.match(motifPanel, /membership\.nodeIds\.map\(signedTriadNodeDisplay\)/);
  assert.match(motifPanel, /signedTriadNodeDisplay\(dyad\.sourceNodeId\)[\s\S]*?signedTriadNodeDisplay\(dyad\.targetNodeId\)/);
  assert.doesNotMatch(motifPanel, /return nodeLabelById\[nodeId\]/);
});

test("il confronto di provenienza mostra nome e ID sorgente tramite la mappa condivisa", () => {
  assert.match(provenancePanel, /displayNodeResultLabel\(membership\.nodeId, nodeLabels, sourceIdByNodeId\)/);
  assert.doesNotMatch(provenancePanel, /nodeLabels\[membership\.nodeId\]/);
  assert.match(graphApp, /<ProvenanceScenarioAnalysisPanel[\s\S]*?\{sourceIdByNodeId\}/);
});

test("i certificati dei completamenti strutturali mostrano nome e ID senza modificare gli archi proposti", async () => {
  const completionPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url), "utf8");
  const structuralPanel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
  assert.match(completionPanel, /function resultNodeLabel\(nodeId: string\): string\s*\{\s*return displayNodeResultLabel\(nodeId, nodeLabelById, sourceIdByNodeId\);/);
  assert.match(completionPanel, /resultNodeLabel\(edge\.sourceNodeId\)[\s\S]*?resultNodeLabel\(edge\.targetNodeId\)[\s\S]*?edge\.edgeType[\s\S]*?edge\.id/);
  assert.match(structuralPanel, /<StructuralCompletionCounterfactualPanel[\s\S]*?nodeLabelById=\{nodeLabelById\}/);
});

test("le mappe condivise di etichette e ID hanno prototipo nullo", () => {
  assert.match(graphApp, /\$:\s*sourceIdByNodeId\s*=\s*Object\.assign\(Object\.create\(null\),\s*Object\.fromEntries/);
  assert.match(graphApp, /\$:\s*nodeLabelById\s*=\s*Object\.assign\(Object\.create\(null\),\s*Object\.fromEntries/);
});
