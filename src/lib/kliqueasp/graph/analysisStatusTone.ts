export type AnalysisStatusTone = "success" | "caution" | "error" | "neutral";

/** Adds a visual cue to the existing text label; the label remains the source of meaning. */
export function getAnalysisStatusTone(label: string): AnalysisStatusTone {
  const text = label.trim().toLocaleLowerCase("it-IT");
  if (!text) return "neutral";

  if (/\b(errore|non disponibile|analisi non eseguita|risultato non disponibile|prova dell['’]ottimo non verificata)\b/.test(text)) {
    return "error";
  }

  if (/infeasibil|nessuna soluzione ammissibile|limite di calcolo raggiunto|calcolo interrotto|enumerazione incompleta|completezza dell['’]enumerazione non verificata|completezza del confronto non verificata|calcolo non completato|non verificat[oa]/.test(text)) {
    return "caution";
  }

  if (/ottimo provato|ottimo di costo provato|ottimo lessicografico provato|enumerazione completa|conteggio completo|partizione completa|cammino minimo provato|vincoli tipizzati soddisfatti|k-core calcolato|confronto completo|costo minimo provato|costo minimo verificato|relazione già verificata|k-plex massimale certificato|nessuna modifica necessaria/.test(text)) {
    return "success";
  }

  return "neutral";
}
