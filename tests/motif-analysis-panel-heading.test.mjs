import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getMotifPanelHeading } from "../src/lib/kliqueasp/components/motifPanelHeading.ts";

const motifPanel = await readFile(new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

const base = {
  activeAnalysisKind: "",
  hasMotifTemplates: false,
  signedTriadsEnabled: false,
  contextualCliqueConfigured: false
};

test("il titolo identifica la clique contestuale attiva anche se sono configurate altre analisi", () => {
  assert.equal(getMotifPanelHeading({
    ...base,
    activeAnalysisKind: "contextualClique",
    signedTriadsEnabled: true,
    hasMotifTemplates: true
  }), "Clique contestuale");
});

test("il titolo identifica analisi di triadi firmate e confronto di scenari", () => {
  assert.equal(getMotifPanelHeading({ ...base, activeAnalysisKind: "signedTriads" }), "Triadi firmate");
  assert.equal(getMotifPanelHeading({ ...base, activeAnalysisKind: "signedTriadScenarioComparison" }), "Triadi firmate");
});

test("le analisi attive di motivi mantengono un titolo specifico", () => {
  for (const activeAnalysisKind of ["typedMotif", "motifScenarioComparison", "motifCount", "motifNearMatch", "motifCounterfactual"]) {
    assert.equal(getMotifPanelHeading({ ...base, activeAnalysisKind }), "Motivi relazionali");
  }
});

test("senza un risultato attivo il titolo riassume le analisi configurate", () => {
  assert.equal(getMotifPanelHeading({ ...base, hasMotifTemplates: true }), "Motivi relazionali");
  assert.equal(getMotifPanelHeading({ ...base, hasMotifTemplates: true, signedTriadsEnabled: true }), "Motivi e triadi");
  assert.equal(getMotifPanelHeading({ ...base, signedTriadsEnabled: true }), "Triadi firmate");
  assert.equal(getMotifPanelHeading({ ...base, contextualCliqueConfigured: true }), "Clique contestuale");
  assert.equal(getMotifPanelHeading({ ...base, signedTriadsEnabled: true, contextualCliqueConfigured: true }), "Analisi relazionali");
});

test("il titolo visibile fornisce anche il nome accessibile aggiornato del pannello", () => {
  assert.match(motifPanel, /aria-labelledby="motif-analysis-heading"/);
  assert.match(motifPanel, /<h3 id="motif-analysis-heading">\{panelHeading\}<\/h3>/);
  assert.doesNotMatch(motifPanel, /aria-label="Analisi di motivi e triadi"/);
});

test("GraphApp inoltra al pannello il tipo di analisi più recente", () => {
  const motifPanelStart = graphApp.indexOf("<MotifAnalysisPanel");
  const motifPanelEnd = graphApp.indexOf("/>\n{/if}", motifPanelStart);
  assert.ok(motifPanelStart >= 0 && motifPanelEnd > motifPanelStart);
  assert.match(graphApp.slice(motifPanelStart, motifPanelEnd), /activeAnalysisKind=\{lastGraph2DAnalysisKind\}/);
});
