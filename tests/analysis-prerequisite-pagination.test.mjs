import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = (name) => readFile(new URL(`../src/lib/kliqueasp/components/${name}`, import.meta.url), "utf8");
const [contextual, integrity, motif, structural, typedPathCounterfactual] = await Promise.all([
  component("ContextualCliquePanel.svelte"),
  component("IntegrityPanel.svelte"),
  component("MotifAnalysisPanel.svelte"),
  component("StructuralAnalysisPanel.svelte"),
  component("TypedPathCounterfactualPanel.svelte")
]);
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("task prerequisite diagnostics disclose long lists progressively across analysis panels", () => {
  assert.match(contextual, /items=\{requirementReasons\} label="prerequisiti mancanti"/);
  assert.match(integrity, /items=\{requirementReasons\} label="prerequisiti mancanti"/);
  assert.match(integrity, /items=\{repairRequirementReasons\} label="prerequisiti della riparazione"/);
  assert.match(motif, /items=\{selectedRequirementReasons\} label="prerequisiti mancanti"/);
  assert.match(motif, /items=\{signedTriadRequirementReasons\} label="prerequisiti delle triadi"/);
  assert.match(structural, /items=\{taskRequirementReasons\} label="requisiti mancanti per questa analisi"/);
  assert.match(typedPathCounterfactual, /items=\{requirementReasons\} label="prerequisiti del cammino"/);
  assert.match(graphApp, /describeMissingRepairAttributeMappings\(\{\s*nodeAttributes: missingNodeAttributes,\s*edgeAttributes: missingEdgeAttributes\s*\}\)/);
  assert.doesNotMatch(contextual + integrity + motif + structural + typedPathCounterfactual,
    /#each (?:requirementReasons|repairRequirementReasons|selectedRequirementReasons|signedTriadRequirementReasons|taskRequirementReasons) as reason|requirementReasons\.join\("; "\)/);
});
