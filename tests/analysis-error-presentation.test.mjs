import test from "node:test";
import assert from "node:assert/strict";
import { presentAnalysisError } from "../src/lib/kliqueasp/graph/analysisErrorPresentation.ts";

test("solver failures have a concise user message and retain technical detail", () => {
  const presentation = presentAnalysisError("clingo non ha completato l'enumerazione (UNKNOWN)");
  assert.equal(presentation.message, "L’analisi non è stata completata. Riprova oppure apri i dettagli tecnici.");
  assert.equal(presentation.technicalDetails, "clingo non ha completato l'enumerazione (UNKNOWN)");
});

test("graph-analysis jargon in diagnostics stays behind technical details", () => {
  for (const detail of [
    "Il certificato why-not non è stato completato.",
    "The witness walk repeats a round.",
    "Errore di membership nel near-match."
  ]) {
    const presentation = presentAnalysisError(detail);
    assert.equal(presentation.message, "L’analisi non è stata completata. Riprova oppure apri i dettagli tecnici.");
    assert.equal(presentation.technicalDetails, detail);
  }
});

test("short mixed-language graph diagnostics keep their source text in technical details", () => {
  const sourceMessage = "Manca il mapping dell'attributo richiesto";
  const presentation = presentAnalysisError(sourceMessage);
  assert.equal(presentation.message, "L’analisi non è stata completata. Riprova oppure apri i dettagli tecnici.");
  assert.equal(presentation.technicalDetails, sourceMessage);
});

test("timeouts suggest a useful next step", () => {
  const presentation = presentAnalysisError("Tempo massimo superato (60 s): il calcolo è stato interrotto.");
  assert.match(presentation.message, /Riduci il grafo/);
  assert.match(presentation.message, /Dati → Opzioni di calcolo/);
  assert.equal(presentation.technicalDetails, "Tempo massimo superato (60 s): il calcolo è stato interrotto.");
});

test("cancelled calculations are described as incomplete", () => {
  assert.match(presentAnalysisError("Conteggio annullato; il totale parziale è stato scartato.").message, /Calcolo interrotto/);
});

test("empty projection and unavailable engine errors avoid internal terms", () => {
  const empty = presentAnalysisError("Non sono stati generati fatti ASP dalla proiezione visibile corrente.");
  assert.match(empty.message, /Controlla i filtri e la mappatura/);
  assert.doesNotMatch(empty.message, /ASP/);

  const unavailable = presentAnalysisError("Il worker clingo non è disponibile.");
  assert.match(unavailable.message, /motore di calcolo non è disponibile/);
  assert.doesNotMatch(unavailable.message, /clingo|worker/i);
});

test("configuration errors give a user-facing next step and preserve the JSON detail", () => {
  const temporal = "motif.temporal.maximumSpan non è applicabile: dichiarare graphMapping.edge.validity.numericUnit per i timestamp numerici";
  const temporalPresentation = presentAnalysisError(temporal);
  assert.match(temporalPresentation.message, /unità dei tempi numerici/);
  assert.match(temporalPresentation.message, /Dati → Campi opzionali e attributi/);
  assert.equal(temporalPresentation.technicalDetails, temporal);
  assert.doesNotMatch(temporalPresentation.message, /graphMapping|motif\.temporal/);

  const attributeDetail = "L'attributo 'polarity' non è mappato in graphMapping.edge.attributes.";
  const attribute = presentAnalysisError(attributeDetail);
  assert.match(attribute.message, /attributo del grafo \(arco\)/);
  assert.match(attribute.message, /Dati → Campi opzionali e attributi/);
  assert.equal(attribute.technicalDetails, attributeDetail);

  const invalidConfig = "graphAnalysis.signedTriads.edgeTypes deve contenere valori non vuoti.";
  const invalidAnalysis = presentAnalysisError(invalidConfig);
  assert.match(invalidAnalysis.message, /configurazione richiesta da questa analisi non è valida/);
  assert.match(invalidAnalysis.message, /Dati → Configurazione/);
  assert.doesNotMatch(invalidAnalysis.message, /graphAnalysis/);
  assert.equal(invalidAnalysis.technicalDetails, invalidConfig);
});

test("an impossible dominating set is distinct from an unverified target diagnosis", () => {
  const presentation = presentAnalysisError(
    "La copertura è impossibile, ma la diagnosi dei target non è stata verificata: il certificato why-not non è stato completato (UNKNOWN)."
  );
  assert.equal(
    presentation.message,
    "La copertura è impossibile; l’elenco dei nodi non coperti non è stato verificato. Apri i dettagli tecnici."
  );
  assert.match(presentation.technicalDetails ?? "", /why-not/);
});

test("localized covering-diagnosis failures keep their technical detail behind a clear summary", () => {
  const detail = "La copertura è impossibile, ma la verifica dei nodi non coperti non ha superato il controllo indipendente sul grafo attuale.";
  const presentation = presentAnalysisError(detail);
  assert.equal(
    presentation.message,
    "La copertura è impossibile; l’elenco dei nodi non coperti non è stato verificato. Apri i dettagli tecnici."
  );
  assert.equal(presentation.technicalDetails, detail);
});

test("an impossible path is distinct from an unverified optional explanation", () => {
  const presentation = presentAnalysisError(
    "Il cammino è impossibile, ma la diagnosi non è stata verificata: il certificato di raggiungibilità limitata non è stato completato (UNKNOWN)."
  );
  assert.equal(
    presentation.message,
    "Il cammino non esiste con i vincoli impostati; la spiegazione dettagliata non è stata verificata. Apri i dettagli tecnici."
  );
  assert.match(presentation.technicalDetails ?? "", /UNKNOWN/);
});

test("plain prerequisite messages stay intact and long errors remain inspectable", () => {
  assert.deepEqual(presentAnalysisError("Seleziona almeno un gruppo."), { message: "Seleziona almeno un gruppo." });
  for (const detail of [
    "TypeError: Cannot read properties of undefined (reading 'id')",
    "Failed to fetch",
    "Script error."
  ]) {
    const presentation = presentAnalysisError(detail);
    assert.equal(presentation.message, "L'analisi non è stata completata. Riprova oppure apri i dettagli tecnici.");
    assert.equal(presentation.technicalDetails, detail);
  }

  const longError = "Errore inatteso: " + "x".repeat(250);
  const presentation = presentAnalysisError(longError);
  assert.match(presentation.message, /dettagli tecnici/);
  assert.equal(presentation.technicalDetails, longError);
  assert.deepEqual(presentAnalysisError(" "), { message: "" });
});

test("structural counterfactual fallback messages stay concise in the visible error state", () => {
  for (const message of [
    "Il risultato non è interpretabile e non è stato mostrato.",
    "Non è stato possibile verificare tutte le modifiche a costo minimo per includere il nodo selezionato nel k-core; i risultati parziali non vengono mostrati.",
    "La proposta non è stata verificata e non è stata mostrata."
  ]) {
    assert.deepEqual(presentAnalysisError(message), { message });
  }
});

test("oversized solver input suggests reducing the selected graph projection", () => {
  const detail = "Il programma ASP occupa 7.143.927 byte e supera il limite prudenziale di 1.000.000 byte del solver WASM. Riduci il grafo o applica filtri prima dell'analisi.";
  const presentation = presentAnalysisError(detail);

  assert.match(presentation.message, /Riduci la finestra temporale o applica filtri/);
  assert.doesNotMatch(presentation.message, /ASP|WASM|solver/);
  assert.equal(presentation.technicalDetails, detail);
});

test("WASM memory exhaustion gives a next step and never implies a partial result", () => {
  const detail = "RuntimeError: memory access out of bounds\n    at clingo-web-worker.js:1:44677";
  const presentation = presentAnalysisError(detail);

  assert.match(presentation.message, /Il motore ha esaurito memoria/);
  assert.match(presentation.message, /Riduci la finestra temporale o applica filtri/);
  assert.match(presentation.message, /nessun risultato parziale/);
  assert.doesNotMatch(presentation.message, /WASM|out of bounds|clingo/);
  assert.equal(presentation.technicalDetails, detail);
});
