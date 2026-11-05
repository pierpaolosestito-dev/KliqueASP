import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the integrity readiness copy gives user actions and keeps JSON keys out of primary blockers", async () => {
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  const start = graphApp.indexOf("$: integrityDataReadiness = (() => {");
  const end = graphApp.indexOf("\n  $: typedPathStaticRequirements", start);
  assert.ok(start >= 0 && end > start, "integrity readiness block must remain discoverable");
  const readiness = graphApp.slice(start, end);
  const userMessages = [...readiness.matchAll(/reasons\.push\("([^"\\]*(?:\\.[^"\\]*)*)"\)/g)]
    .map(([, message]) => message);

  assert.ok(userMessages.some((message) => message.includes("schema 2") && message.includes("mappatura dei campi")));
  assert.ok(userMessages.some((message) => message.includes("regola di qualità dei dati nell'editor JSON avanzato")));
  assert.ok(userMessages.some((message) => message.includes("oggetto JSON valido")));
  assert.ok(userMessages.some((message) => message.includes("almeno una regola di qualità dei dati")));
  assert.ok(userMessages.every((message) => !/graphIntegrity|schemaVersion|graphMapping\./.test(message)),
    "primary blockers must not expose internal configuration keys");
  assert.match(graphApp, /class="menu-data-action" aria-label="Apri Dati e configurazione" on:click=\{openDataPanel\}>Apri Dati e configurazione<\/button>/);

  const repairStart = graphApp.indexOf("$: integrityRepairDataReadiness = (() => {");
  const repairEnd = graphApp.indexOf("\n  let query =", repairStart);
  const repairReadiness = graphApp.slice(repairStart, repairEnd);
  assert.match(repairReadiness, /Aggiungi almeno un'azione candidata per la riparazione nell'editor JSON avanzato/);
  assert.doesNotMatch(repairReadiness, /reasons\.push\("[^"]*graphIntegrity\.repairSuggestions/);
  assert.match(graphApp, /<p class="menu-requirement">\{integrityDataReadiness\.reasons\[0\]\}<\/p>/);
});

test("the repair panel keeps the exact JSON path available only in an optional disclosure", async () => {
  const panel = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");
  const unconfigured = panel.indexOf('<strong>Proposta minima non configurata</strong>');
  const details = panel.indexOf("<details>", unconfigured);
  const detailsEnd = panel.indexOf("</details>", details);
  assert.ok(unconfigured >= 0 && details > unconfigured && detailsEnd > details);

  const primaryState = panel.slice(unconfigured, details);
  assert.match(primaryState, /aggiungi le azioni candidate nell'editor JSON avanzato/);
  assert.doesNotMatch(primaryState, /graphIntegrity\.repairSuggestions/);
  assert.match(panel.slice(details, detailsEnd), /<code>graphIntegrity\.repairSuggestions<\/code>/);
  assert.match(panel, /on:click=\{onOpenData\}>Apri Dati e configurazione/);
});

test("integrity readiness actions direct both checks to data and configuration", async () => {
  const panel = await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8");
  const checkAction = panel.match(/id="integrity-check-readiness"[\s\S]*?<button[^>]*on:click=\{onOpenData\}>(.*?)<\/button>/)?.[1];
  const repairAction = panel.match(/id="integrity-repair-readiness"[\s\S]*?<button[^>]*on:click=\{onOpenData\}>(.*?)<\/button>/)?.[1];

  assert.equal(checkAction, "Apri Dati e configurazione");
  assert.equal(repairAction, "Apri Dati e configurazione");
});
