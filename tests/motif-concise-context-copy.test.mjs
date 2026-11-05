import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(
  new URL("../src/lib/kliqueasp/components/MotifAnalysisPanel.svelte", import.meta.url),
  "utf8"
);

test("motif heading summarizes the active semantics without repeating scope guidance", () => {
  const headerStart = panel.indexOf("<header>");
  const headerEnd = panel.indexOf("</header>", headerStart);
  const header = headerStart >= 0 && headerEnd >= 0
    ? panel.slice(headerStart, headerEnd)
    : "";

  assert.ok(header, "motif heading should be present");
  assert.match(header, /Relazioni richieste e controlli indotti su/);
  assert.match(header, /Relazioni richieste e assenze sono valutate nella proiezione filtrata/);
  assert.match(header, /Assegnazioni dei ruoli e relazioni del motivo nella proiezione filtrata/);
  assert.doesNotMatch(header, /Il focus grafico non restringe/);
});

test("motif absence assumptions are summarized briefly and detailed on request", () => {
  const absenceStart = panel.indexOf('<div class="readiness absence-semantics"');
  const absenceEnd = panel.indexOf("\n      </div>\n    {/if}", absenceStart);
  const absenceSection = absenceStart >= 0 && absenceEnd >= 0
    ? panel.slice(absenceStart, absenceEnd)
    : "";

  assert.ok(absenceSection, "absence semantics section should be present");
  assert.match(absenceSection, /<span>I filtri correnti definiscono il perimetro;/);
  assert.match(absenceSection, /<details>\s*<summary>Semantica dei vincoli di assenza<\/summary>/);
  assert.match(absenceSection, /si presume che i dati siano completi per questi tipi/);
  assert.match(absenceSection, /Per i tipi indotti si controllano tutte le coppie di ruoli/);
});

test("pre-run enumeration explanations stay in a collapsed disclosure", () => {
  const disclosure = panel.match(
    /\{#if !hasRun && !error\}\s*(<details class="motif-enumeration-details">[\s\S]*?<\/details>)\s*\{\/if\}/,
  )?.[1];

  assert.ok(disclosure, "pre-run enumeration details should be available");
  assert.doesNotMatch(disclosure, /<details[^>]*\sopen(?:\s|=|>)/);
  assert.match(disclosure, /<summary>Dettagli su conteggio ed enumerazione<\/summary>/);
  assert.match(disclosure, /archi paralleli possono produrre più sequenze/);
  assert.match(disclosure, /Il conteggio restituisce il totale esatto senza elencare le istanze/);
});

test("motif scenario identity and assumptions stay available in a collapsed disclosure", () => {
  const summary = "<summary>Come leggere presenza e identità</summary>";
  const summaryStart = panel.indexOf(summary);
  const disclosureStart = panel.lastIndexOf('<details class="scenario-interpretation">', summaryStart);
  const disclosureEnd = panel.indexOf("</details>", summaryStart);
  assert.ok(disclosureStart >= 0 && disclosureEnd > summaryStart, "motif scenario interpretation should be disclosed");
  const disclosure = panel.slice(disclosureStart, disclosureEnd + "</details>".length);
  assert.doesNotMatch(disclosure.slice(0, disclosure.indexOf(">") + 1), /\sopen(?:\s|=|>)/,
    "the long scenario explanation must be collapsed by default");
  assert.match(panel, /<small>La presenza segue l’assegnazione dei ruoli; gli archi di supporto possono variare tra scenari\.<\/small>/);
  assert.match(disclosure, /assegnazione ordinata di tutti i ruoli/);
  assert.match(disclosure, /la lista sia esaustiva/);
  assert.match(disclosure, /non assegna probabilità agli scenari/);
  assert.match(disclosure, /finestra correnti/);
});

test("motif evidence keeps the result rule visible and the temporal interpretation optional", () => {
  const visible = panel.match(/<small>\s*Ogni istanza assegna[\s\S]*?<\/small>/)?.[0] ?? "";
  assert.ok(visible, "the concise motif evidence rule should remain visible");
  assert.match(visible, /nodi distinti ai ruoli/);
  assert.match(visible, /almeno un record d’arco per ogni relazione richiesta/);
  assert.match(visible, /richiedono dati completi per i tipi indicati/);
  assert.doesNotMatch(visible, /co-validità|ordine temporale|causalità|verità storica/);

  const summary = "<summary>Dettagli sulla verifica</summary>";
  const summaryStart = panel.indexOf(summary);
  const disclosureStart = panel.lastIndexOf('<details class="instance-interpretation">', summaryStart);
  const disclosureEnd = panel.indexOf("</details>", summaryStart);
  assert.ok(disclosureStart >= 0 && disclosureEnd > summaryStart, "motif verification details should be disclosed");
  const disclosure = panel.slice(disclosureStart, disclosureEnd + "</details>".length);
  assert.doesNotMatch(disclosure.slice(0, disclosure.indexOf(">") + 1), /\sopen(?:\s|=|>)/);
  assert.match(disclosure, /mostra anche l’istante comune/);
  assert.match(disclosure, /l’inizio di validità usati per ogni passo/);
  assert.match(disclosure, /Tipi e intervalli seguono la mappatura e lo schema del motivo/);
  assert.match(disclosure, /non causalità o verità storica/);
  assert.match(panel, /\.instance-interpretation > summary:focus-visible/);
});

test("motif counterfactual evidence distinguishes observed support from hypothetical edges", () => {
  assert.match(panel, /<small>Le evidenziazioni mostrano solo il supporto osservato; gli archi ipotetici restano separati\.<\/small>/);
  assert.match(panel, /<details class="counterfactual-evidence-details">\s*<summary>Dettagli sull'evidenza<\/summary>/);
  assert.match(panel, /Gli archi ipotetici non entrano nella vista del grafo\./);
  assert.match(panel, /L'ottimalità dipende dagli archi candidati, dai costi, dal motivo e dalla proiezione corrente\./);
  assert.doesNotMatch(panel, /<details class="counterfactual-evidence-details" open/);
  assert.match(panel, /\.counterfactual-evidence-details > summary:focus-visible/);
});

test("signed triad comparison keeps the essential status visible and metric definitions on request", () => {
  assert.match(panel, /<small>“Non classificata” non significa “non bilanciata”\.<\/small>/);
  assert.match(panel, /<small>I record paralleli concordi contano come una diade; record discordanti o segni mancanti impediscono il calcolo\.<\/small>/);
  assert.match(panel, /<details class="triad-record-details">\s*<summary>Dettagli su record e proiezione<\/summary>/);
  assert.match(panel, /I record concordi conservano tutti gli ID sorgente\. I cappi sono esclusi dai triangoli e i filtri correnti definiscono il grafo esaminato\./);
  assert.doesNotMatch(panel, /<details class="triad-record-details" open/);
  assert.match(panel, /\.triad-record-details > summary:focus-visible/);
  const summary = "<summary>Come leggere quote e classificazioni</summary>";
  const summaryStart = panel.indexOf(summary);
  const disclosureStart = panel.lastIndexOf('<details class="scenario-interpretation">', summaryStart);
  const disclosureEnd = panel.indexOf("</details>", summaryStart);
  assert.ok(disclosureStart >= 0 && disclosureEnd > summaryStart, "signed triad interpretation should be disclosed");
  const disclosure = panel.slice(disclosureStart, disclosureEnd + "</details>".length);
  assert.doesNotMatch(disclosure.slice(0, disclosure.indexOf(">") + 1), /\sopen(?:\s|=|>)/,
    "metric explanations must be collapsed by default");
  assert.match(disclosure, /La prima quota usa i triangoli completi classificati/);
  assert.match(disclosure, /nucleo comune usa soltanto gli stessi ID di triade/);
  assert.match(disclosure, /indipendentemente dall'ordine/);
  assert.match(disclosure, /includano tutti i casi da considerare/);
});
