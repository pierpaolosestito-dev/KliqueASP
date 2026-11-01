import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const components = {
  solver: await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8"),
  structural: await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8"),
  integrity: await readFile(new URL("../src/lib/kliqueasp/components/IntegrityPanel.svelte", import.meta.url), "utf8"),
  provenance: await readFile(new URL("../src/lib/kliqueasp/components/ProvenanceScenarioAnalysisPanel.svelte", import.meta.url), "utf8"),
  contextual: await readFile(new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url), "utf8")
};

test("il pannello clique è una regione nominata dal titolo visibile", () => {
  assert.match(components.solver, /<section class="solver-panel" aria-labelledby="solver-panel-title">/);
  assert.match(components.solver, /<h3 id="solver-panel-title">Risultati clique<\/h3>/);
});

test("analisi strutturale e integrità collegano il nome della regione al titolo", () => {
  assert.match(components.structural, /<section class="structural-panel" aria-labelledby="structural-panel-title">/);
  assert.match(components.structural, /<h3 id="structural-panel-title">Analisi strutturale<\/h3>/);
  assert.match(components.integrity, /<section class="integrity-panel" aria-labelledby="integrity-panel-title">/);
  assert.match(components.integrity, /<h3 id="integrity-panel-title">Integrità del grafo<\/h3>/);
});

test("il confronto di scenario espone come nome la variante di titolo realmente visualizzata", () => {
  assert.match(components.provenance, /aria-labelledby="scenario-comparison-title"/);
  assert.equal((components.provenance.match(/id="scenario-comparison-title"/g) ?? []).length, 2);
  assert.match(components.provenance, /<h3 id="scenario-comparison-title">Presenza dei nodi nelle clique massime<\/h3>/);
  assert.match(components.provenance, /<h3 id="scenario-comparison-title">Stabilità delle clique massime tra scenari<\/h3>/);
});

test("il gruppo contestuale collega la regione al suo titolo interno", () => {
  assert.match(components.contextual, /<section class="contextual-clique" aria-labelledby="contextual-clique-title">/);
  assert.match(components.contextual, /<h4 id="contextual-clique-title">Gruppo coeso contestuale<\/h4>/);
});
