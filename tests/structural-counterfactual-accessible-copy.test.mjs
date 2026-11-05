import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
const counterfactualPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/StructuralCompletionCounterfactualPanel.svelte", import.meta.url),
  "utf8"
);

test("structural counterfactual validation names the selected graph concept and parameter", () => {
  assert.match(graphApp, /Il nodo selezionato non è riconosciuto nella proiezione corrente/);
  assert.match(graphApp, /Il parametro s del k-plex deve essere un intero positivo/);
  assert.match(graphApp, /La soglia k deve essere un intero maggiore o uguale a \$\{structuralParameter\}/);
  assert.doesNotMatch(graphApp, /Il nodo target non è mappabile|valore target [sk]|soglia target k/);
  assert.match(graphApp, /Per confrontare l'appartenenza dei nodi, attiva l'enumerazione di tutti i k-plex di cardinalità massima/);
  assert.match(graphApp, /L'analisi dell'appartenenza controfattuale richiede una proiezione non orientata/);
  assert.match(graphApp, /La ricerca sull'appartenenza al k-plex non è disponibile/);
  assert.doesNotMatch(graphApp, /confrontare la membership|controfattuale di membership|ricerca ASP del controfattuale di membership/);
});

test("optional k-plex and k-core explanations avoid solver jargon and announce updated status", () => {
  const assignments = [...graphApp.matchAll(/structural(?:KPlex|KCore)(?:Membership)?CounterfactualWhyNotMessage\s*=/g)];
  assert.ok(assignments.length >= 8, "le tre diagnosi opzionali devono mantenere lo stato esplicativo");
  for (const assignment of assignments) {
    const end = graphApp.indexOf(";", assignment.index);
    const expression = graphApp.slice(assignment.index, end + 1);
    const messages = [...expression.matchAll(/"([^"\\]*(?:\\.[^"\\]*)*)"/g)]
      .map(([, message]) => message)
      .filter((message) => message.length > 30);
    for (const message of messages) {
      assert.doesNotMatch(message, /solver|why-not|clingo|answer set|infeasibilit|target/i);
    }
  }

  assert.match(counterfactualPanel, /<small role="status" aria-live="polite">\{whyNotMessage\}<\/small>/);
  assert.match(counterfactualPanel, /<small role="status" aria-live="polite">\{kCoreWhyNotMessage\}<\/small>/);
  assert.match(counterfactualPanel, /<small role="status" aria-live="polite">\{kCoreMembershipWhyNotMessage\}<\/small>/);
});

test("the verified no-coverage diagnosis stays in graph terms", () => {
  assert.match(graphApp, /La copertura è impossibile, ma la verifica dei nodi non coperti/);
  assert.match(graphApp, /i nodi non coperti sono verificati sulla proiezione corrente/);
  assert.doesNotMatch(graphApp, /La copertura è impossibile, ma la diagnosi dei target|certificato ASP non coincide/);
});
