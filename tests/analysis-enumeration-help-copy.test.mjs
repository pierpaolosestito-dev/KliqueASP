import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contextualCliquePanel = await readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8");
const typedPathCounterfactualPanel = await readFile(new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url), "utf8");

test("contextual-clique enumeration distinguishes one optimum from all maximum groups", () => {
  assert.match(contextualCliquePanel, /Mostra tutti i gruppi massimi/);
  assert.match(contextualCliquePanel, /id="contextual-clique-enumeration-help" class="all-optima-help">Attiva per elencare tutti i gruppi con la stessa cardinalità massima\./);
  assert.match(contextualCliquePanel, /aria-describedby=\{running \? "contextual-clique-enumeration-help analysis-in-progress-status" : "contextual-clique-enumeration-help"\} disabled=\{running\}/);
});

test("typed-path counterfactual explains when all minimum-cost ties are enumerated", () => {
  assert.match(typedPathCounterfactualPanel, /Tutte le proposte minime/);
  assert.match(typedPathCounterfactualPanel, /id="typed-path-counterfactual-enumeration-help">Per impostazione predefinita è mostrata una proposta minima; attiva l'opzione per elencare tutti i pareggi di costo minimo\./);
  assert.match(typedPathCounterfactualPanel, /aria-describedby=\{running \? "typed-path-counterfactual-enumeration-help analysis-in-progress-status" : "typed-path-counterfactual-enumeration-help"\} disabled=\{running\}/);
});
