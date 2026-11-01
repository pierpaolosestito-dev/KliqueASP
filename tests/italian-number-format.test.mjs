import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatItalianNumber } from "../src/lib/kliqueasp/graph/formatItalianNumber.ts";

test("formats decimals and grouped values for the Italian interface", () => {
  assert.equal(formatItalianNumber(86.8, 1), "86,8");
  assert.equal(formatItalianNumber(12345.5, 1), "12.345,5");
  assert.equal(formatItalianNumber(12345.5, 2), "12.345,50");
  assert.equal(formatItalianNumber(0.868 * 100, 1), "86,8");
});

test("clamps requested precision and formats non-finite values safely", () => {
  assert.equal(formatItalianNumber(1.234, -2), "1");
  assert.equal(formatItalianNumber(1.25, 24), "1,25000000000000000000");
  assert.equal(formatItalianNumber(Number.NaN), "n/d");
  assert.equal(formatItalianNumber(Number.POSITIVE_INFINITY), "n/d");
  assert.equal(formatItalianNumber(null), "n/d");
  assert.equal(formatItalianNumber(undefined), "n/d");
});

test("UI result panels use localized display formatting while CSV precision stays machine-readable", async () => {
  const panels = [
    "ContextualCliquePanel.svelte",
    "IntegrityPanel.svelte",
    "ProvenanceScenarioAnalysisPanel.svelte",
    "MotifAnalysisPanel.svelte",
    "SolverPanel.svelte",
    "StructuralCompletionCounterfactualPanel.svelte",
    "StructuralAnalysisPanel.svelte",
    "TypedPathCounterfactualPanel.svelte",
    "WorkerMemoryReadout.svelte"
  ];

  for (const name of panels) {
    const source = await readFile(new URL(`../src/lib/kliqueasp/components/${name}`, import.meta.url), "utf8");
    const template = source.slice(source.indexOf("</script>") + "</script>".length);
    assert.doesNotMatch(template, /\.toFixed\(/, `${name} should localize visible decimals`);
  }

  const structural = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
  const script = structural.slice(0, structural.indexOf("</script>"));
  assert.match(script, /modularity\?\.toFixed\(6\)/, "CSV precision should retain its machine-readable decimal point");
});
