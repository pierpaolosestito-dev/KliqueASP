import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contextualPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/ContextualCliquePanel.svelte", import.meta.url),
  "utf8"
);
const structuralPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url),
  "utf8"
);
const typedPathPanel = await readFile(
  new URL("../src/lib/kliqueasp/components/TypedPathCounterfactualPanel.svelte", import.meta.url),
  "utf8"
);
const contextualSemantics = contextualPanel.match(/<p class="semantics">([\s\S]*?)<\/p>/)?.[1] ?? "";

test("contextual-group copy keeps the definition brief and moves interpretation details to disclosures", () => {
  assert.match(contextualSemantics, /Ogni coppia deve condividere un contesto; coppie diverse possono condividerne uno diverso\. La misura è strutturale\./);
  assert.doesNotMatch(contextualSemantics, /significato sociale/);
  assert.match(contextualPanel, /<details class="semantics-detail">\s*<summary>Come interpretare questa misura<\/summary>/);
  assert.match(contextualPanel, /Non richiede un unico contesto condiviso da tutto il gruppo e non attribuisce di per sé significato sociale ai legami\./);
  assert.match(contextualPanel, /<details class="contextual-config">\s*<summary>Tipi e relazioni inclusi<\/summary>/);
  assert.match(contextualPanel, /<dt>Nodi focali<\/dt><dd><code>\{JSON\.stringify\(config\.focusNodeTypes\)\}<\/code><\/dd>/);
  assert.match(contextualPanel, /<dt>Nodi di contesto<\/dt><dd><code>\{JSON\.stringify\(config\.contextNodeTypes\)\}<\/code><\/dd>/);
  assert.match(contextualPanel, /<dt>Relazioni<\/dt><dd><code>\{JSON\.stringify\(config\.edgeTypes\)\}<\/code><\/dd>/);
  assert.doesNotMatch(contextualPanel, /<details class="(?:semantics-detail|contextual-config)" open/);
  assert.doesNotMatch(contextualSemantics, /coesione è pairwise/);
});

test("community-topology copy separates edit cost from modularity score and preserves the source graph", () => {
  assert.match(structuralPanel, /Valuta le modifiche agli archi candidate nel progetto/);
  assert.match(structuralPanel, /Il loro costo è distinto dal punteggio di modularità; il grafo originale resta invariato\./);
});

test("separator evidence keeps a short summary and opens the exact cut semantics on request", () => {
  assert.match(structuralPanel, /<small>Il certificato verifica che le rimozioni separino i terminali e rispettino l'obiettivo minimo selezionato\.<\/small>/);
  assert.match(structuralPanel, /<details class="field-note separator-certificate-details">\s*<summary>Come viene verificata la separazione<\/summary>/);
  assert.match(structuralPanel, /Il lato raggiungibile è ricalcolato sul grafo dopo le rimozioni\./);
  assert.match(structuralPanel, /ogni record che attraversa i due lati deve essere rimosso/);
  assert.match(structuralPanel, /ogni arco attraversante deve toccare un nodo rimosso/);
  assert.match(structuralPanel, /L'obiettivo selezionato minimizza il numero o il costo delle rimozioni\./);
  assert.doesNotMatch(structuralPanel, /<details class="field-note separator-certificate-details" open/);
  assert.match(structuralPanel, /\.separator-certificate-details summary:focus-visible/);
});

test("weighted node-separator setup keeps the required mapping visible and numeric limits optional", () => {
  assert.match(structuralPanel, /Assegna in Dati → Mappatura avanzata un costo intero positivo a ogni nodo rimovibile; i terminali restano protetti\./);
  assert.match(structuralPanel, /<details class="field-note separator-configuration-details">\s*<summary>Dettagli sui costi<\/summary>/);
  assert.match(structuralPanel, /Il risultato minimizza la somma dei costi, entro il limite numerico sicuro\./);
  assert.match(structuralPanel, /Il costo non sostituisce gli attributi descrittivi\./);
  assert.match(structuralPanel, /I cammini seguono gli archi nel verso dichiarato\./);
  assert.match(structuralPanel, /I legami sono non orientati\./);
  assert.doesNotMatch(structuralPanel, /<details class="field-note separator-configuration-details" open/);
  assert.match(structuralPanel, /\.separator-configuration-details summary:focus-visible/);
});

test("typed-path diagnostics preserve scope, temporal semantics, and simple-path distinctions concisely", () => {
  assert.match(typedPathPanel, /Esamina \{whyNot\.candidateEdgeIds\.length\} archi candidati e quelli osservati\./);
  assert.match(typedPathPanel, /Grafo massimo: \{whyNot\.candidateEdgeIds\.length\} archi candidati più gli archi osservati\./);
  assert.match(typedPathPanel, /Semantica temporale: \{temporalSemanticsLabel\(whyNot\.temporalSemantics\)\}/);
  assert.match(typedPathPanel, /La meta è raggiungibile solo ripetendo nodi; non esiste un cammino semplice \(\{whyNot\.repeatedNodeIds\.length\} nodi rivisitati\)\./);
  assert.match(typedPathPanel, /Si arresta dopo \{whyNot\.maximumPrefixLength\} passi/);
  assert.match(typedPathPanel, /Nessun nodo è raggiungibile dopo il passo \{whyNot\.firstEmptyStep\}/);
  assert.match(typedPathPanel, /La sequenza completa non raggiunge la meta, ma alcuni prefissi intermedi sono possibili\./);
  assert.doesNotMatch(typedPathPanel, /La verifica include tutti gli archi osservati e tutti i/);
});
