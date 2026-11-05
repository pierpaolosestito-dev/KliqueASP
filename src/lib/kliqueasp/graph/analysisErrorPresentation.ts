export type AnalysisErrorPresentation = {
  message: string;
  technicalDetails?: string;
};

/** Keeps solver internals available on demand while making common failures actionable. */
export function presentAnalysisError(value: unknown): AnalysisErrorPresentation {
  if (typeof value !== "string" || !value.trim()) return { message: "" };

  const technicalDetails = value.trim();
  const normalized = technicalDetails.toLocaleLowerCase("it");

  if (/annullat[oa]|cancelled|canceled/.test(normalized)) {
    return {
      message: "Calcolo interrotto. Avvialo di nuovo per ottenere un risultato completo.",
      technicalDetails
    };
  }

  if (/timeout|tempo massimo|limite complessivo|budget complessivo|budget.{0,20}esaurit/.test(normalized)) {
    return {
      message: "Il limite di calcolo è stato raggiunto. Riduci il grafo oppure aumentalo in Dati → Opzioni di calcolo.",
      technicalDetails
    };
  }

  if (/programma asp occupa .*supera il limite prudenziale .*solver wasm/.test(normalized)) {
    return {
      message: "La rete selezionata supera il limite d'ingresso del motore di calcolo. Riduci la finestra temporale o applica filtri, poi riprova.",
      technicalDetails
    };
  }

  if (/memory access out of bounds|out of memory|wasm.{0,30}memory|memory.{0,30}wasm/.test(normalized)) {
    return {
      message: "Il motore ha esaurito memoria durante il calcolo. Riduci la finestra temporale o applica filtri; nessun risultato parziale è stato pubblicato.",
      technicalDetails
    };
  }

  if (/non sono stati generati fatti asp|proiezione.{0,60}fatti asp/.test(normalized)) {
    return {
      message: "La proiezione corrente non fornisce dati utilizzabili per questa analisi. Controlla i filtri e la mappatura.",
      technicalDetails
    };
  }

  if (/worker.{0,30}clingo.{0,30}non è disponibile|clingo.{0,30}worker.{0,30}non è disponibile/.test(normalized)) {
    return {
      message: "Il motore di calcolo non è disponibile. Ricarica la pagina e riprova.",
      technicalDetails
    };
  }

  if (/la copertura è impossibile, ma (?:la diagnosi dei target non è stata verificata|la verifica dei nodi non coperti)/.test(normalized)) {
    return {
      message: "La copertura è impossibile; l’elenco dei nodi non coperti non è stato verificato. Apri i dettagli tecnici.",
      technicalDetails
    };
  }

  if (/il cammino è impossibile, ma la diagnosi non è stata verificata/.test(normalized)) {
    return {
      message: "Il cammino non esiste con i vincoli impostati; la spiegazione dettagliata non è stata verificata. Apri i dettagli tecnici.",
      technicalDetails
    };
  }

  if (/graphMapping\.edge\.validity\.numericUnit/.test(technicalDetails)) {
    return {
      message: "L'unità dei tempi numerici non è impostata. Indicala in Dati → Campi opzionali e attributi.",
      technicalDetails
    };
  }

  if (/graphMapping\.(node|edge)\.attributes/.test(technicalDetails)) {
    const element = /graphMapping\.node\.attributes/.test(technicalDetails) ? "nodo" : "arco";
    return {
      message: `Un attributo del grafo (${element}) richiesto dall'analisi non è associato ai dati. Controlla la mappatura in Dati → Campi opzionali e attributi.`,
      technicalDetails
    };
  }

  if (/graphMapping\.edge\.direction/.test(technicalDetails)) {
    return {
      message: "La direzione degli archi non corrisponde a quella richiesta dall'analisi. Controllala in Dati → Mappatura rapida.",
      technicalDetails
    };
  }

  if (/graphMapping\.|graphAnalysis\.|(?:motif|schemaVersion)\.[A-Za-z]|schemaVersion\s*:/.test(technicalDetails)) {
    return {
      message: "La configurazione richiesta da questa analisi non è valida. Apri Dati → Configurazione e consulta i dettagli tecnici.",
      technicalDetails
    };
  }

  if (/^\s*(?:Error|TypeError|SyntaxError|RangeError|ReferenceError|NetworkError|AbortError|DOMException|WasmError)\b|failed to|could not|unable to|cannot|uncaught|script error|out of memory/i.test(technicalDetails)) {
    return {
      message: "L'analisi non è stata completata. Riprova oppure apri i dettagli tecnici.",
      technicalDetails
    };
  }

  if (/\bclingo\b|\bsolver\b|\basp\b|answer set|satisfiable|unsatisfiable|\bunknown\b|why-not|\bwitness\b|\bwalk\b|\bround\b|\bmembership\b|near-match|\bmapping\b|\bpattern\b|core number|\bsource\b|\btarget\b|\binput\b|\boutput\b|\bfeasible\b|\binfeasible\b/.test(normalized)) {
    return {
      message: "L’analisi non è stata completata. Riprova oppure apri i dettagli tecnici.",
      technicalDetails
    };
  }

  if (technicalDetails.length > 240 || /[\r\n]/.test(technicalDetails)) {
    return {
      message: "L’analisi non è stata completata. Apri i dettagli tecnici per il messaggio completo.",
      technicalDetails
    };
  }

  return { message: technicalDetails };
}
