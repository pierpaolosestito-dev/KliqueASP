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
  assert.match(empty.message, /Controlla i filtri e il mapping/);
  assert.doesNotMatch(empty.message, /ASP/);

  const unavailable = presentAnalysisError("Il worker clingo non è disponibile.");
  assert.match(unavailable.message, /motore di calcolo non è disponibile/);
  assert.doesNotMatch(unavailable.message, /clingo|worker/i);
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
  const longError = "Errore inatteso: " + "x".repeat(250);
  const presentation = presentAnalysisError(longError);
  assert.match(presentation.message, /dettagli tecnici/);
  assert.equal(presentation.technicalDetails, longError);
  assert.deepEqual(presentAnalysisError(" "), { message: "" });
});
