import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("task readiness and its data action stay primary while field-level capability detail is collapsed", () => {
  const outerStart = graphApp.indexOf('<details class="graph-capabilities">');
  const taskListStart = graphApp.indexOf('<ul class="analysis-readiness-list"', outerStart);
  const dataActionStart = graphApp.indexOf('on:click={openDataPanel}>Apri Dati e mappatura', taskListStart);
  const detailStart = graphApp.indexOf('<details class="capability-details">', dataActionStart);
  const innerEnd = graphApp.indexOf("</details>", detailStart);

  assert.ok(outerStart >= 0 && taskListStart > outerStart, "il riepilogo delle analisi disponibili deve rimanere nel pannello");
  assert.ok(dataActionStart > taskListStart, "il collegamento alla mappatura deve seguire i prerequisiti per attività");
  assert.ok(detailStart > dataActionStart && innerEnd > detailStart, "i dettagli delle capacità devono seguire l'azione primaria");

  const disclosureTag = graphApp.slice(detailStart, graphApp.indexOf(">", detailStart) + 1);
  const detailContent = graphApp.slice(detailStart, innerEnd);
  assert.doesNotMatch(disclosureTag, /\bopen\b/);
  assert.match(detailContent, /<summary>Dettagli di campi e relazioni<\/summary>/);
  assert.match(detailContent, /class="capability-list"/);
  assert.match(detailContent, /class="future-task-readiness"/);
  assert.match(detailContent, /typedMotifDataReadiness/);
  assert.match(detailContent, /temporalMotifDataReadiness/);
});
