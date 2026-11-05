import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("projection scenario comparison uses the shared readiness blocker and explains disabled state", () => {
  const blocker = graphApp.indexOf('id="provenance-clique-comparison-blocker"');
  const buttonStart = graphApp.lastIndexOf('class="provenance-analysis-run"', blocker);
  assert.ok(blocker > 0 && buttonStart > 0);
  const buttonEnd = graphApp.indexOf(">", buttonStart);
  const button = graphApp.slice(buttonStart, buttonEnd);
  assert.match(button, /aria-describedby=\{\[[\s\S]*?solverRunning \? "analysis-in-progress-status" : "",[\s\S]*?provenanceCliqueComparisonBlocker \? "provenance-clique-comparison-blocker" : ""[\s\S]*?\]\.filter\(Boolean\)\.join\(" "\) \|\| undefined\}/);
  assert.match(button, /disabled=\{solverRunning \|\| provenanceCliqueComparisonBlocker !== ""\}/);
  assert.match(graphApp.slice(blocker, graphApp.indexOf("</small>", blocker)),
    /role="status" aria-live="polite">\s*\{provenanceCliqueComparisonBlocker\}/);
  assert.match(graphApp, /provenanceCliqueComparisonBlocker = provenanceScenarios\.length < 2/);
  assert.match(graphApp, /graphDirection === "directed"\s*\?\s*"Il confronto delle clique richiede un grafo non orientato/);
});
