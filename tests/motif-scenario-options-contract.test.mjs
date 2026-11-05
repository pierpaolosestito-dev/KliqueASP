import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(
  new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url),
  "utf8"
);

function disclosureAfter(marker) {
  const start = component.indexOf(marker);
  assert.ok(start >= 0, `missing scenario disclosure: ${marker}`);
  const end = component.indexOf("</details>", start);
  assert.ok(end > start, `scenario disclosure is not closed: ${marker}`);
  return component.slice(start, end + "</details>".length);
}

test("typed-motif scenario comparison is secondary until requested", () => {
  const block = disclosureAfter(
    '<details class="scenario-comparison-options" open={scenarioComparison !== null || pendingScenarioComparison === "motif"}>'
  );
  assert.match(block, /<summary>[\s\S]*?Confronto tra scenari[\s\S]*?scenario-comparison-status/);
  assert.match(block, /provenanceScenarioCount === 0 \? "non configurato"/);
  assert.match(block, /Confronta istanze tra scenari/);
  assert.match(block, /Definisci almeno uno scenario per confrontare le istanze/);
  assert.match(block, /dispatch\("openData"\)/);
});

test("signed-triad scenario comparison keeps its own requirements inside the disclosure", () => {
  const block = disclosureAfter(
    '<details class="scenario-comparison-options" open={signedTriadScenarioComparison !== null || pendingScenarioComparison === "signedTriads"}>'
  );
  assert.match(block, /Confronto tra scenari/);
  assert.match(block, /Confronta le triadi tra scenari/);
  assert.match(block, /Definisci almeno due scenari per confrontare le triadi/);
  assert.match(block, /dispatch\("openData"\)/);
});

test("scenario disclosures retain a visible keyboard focus indicator", () => {
  assert.match(component, /\.scenario-comparison-options > summary:focus-visible\s*\{[^}]*outline: 2px solid #0284c7/);
});
