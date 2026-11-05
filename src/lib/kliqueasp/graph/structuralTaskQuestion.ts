import type { DirectedKCoreMode, StructuralTask, TypedPathTemporalSemantics } from "./structuralTasks.ts";

export interface StructuralTaskQuestionContext {
  task: StructuralTask;
  parameter: number;
  directedGraph: boolean;
  kCoreMode: DirectedKCoreMode | "";
  pathTemporalSemantics: "static" | TypedPathTemporalSemantics;
  strictTemporalOrder: boolean;
}

/** Returns a concise graph-theoretic question that matches the selected structural query. */
export function getStructuralTaskQuestion(context: StructuralTaskQuestionContext): string {
  const { task, parameter, directedGraph, kCoreMode } = context;
  switch (task) {
    case "kPlex":
      return `Qual è il k-plex più grande alla soglia s=${parameter}?`;
    case "maximalKPlex":
      return `Quali k-plex alla soglia s=${parameter} non possono essere estesi aggiungendo altri nodi?`;
    case "kCore": {
      const directedDegree = kCoreMode === "in"
        ? " contando i predecessori"
        : kCoreMode === "out"
          ? " contando i successori"
          : kCoreMode === "mutual"
            ? " contando i vicini reciproci"
            : " secondo la modalità del grado selezionata";
      return `Quali nodi restano nel k-core alla soglia k=${parameter}${directedGraph ? directedDegree : ""}?`;
    }
    case "components":
      return "Quali sono le componenti connesse massimali nella proiezione non orientata?";
    case "weakComponents":
      return "Quali nodi restano connessi ignorando la direzione degli archi?";
    case "strongComponents":
      return "Quali nodi sono reciprocamente raggiungibili seguendo la direzione degli archi?";
    case "path":
      return `Qual è il cammino di lunghezza minima tra i due terminali entro ${parameter} archi?`;
    case "typedPath": {
      const temporalCondition = context.pathTemporalSemantics === "coValid"
        ? " e con tutti gli archi validi allo stesso istante"
        : context.pathTemporalSemantics === "orderedByStart"
          ? ` e con gli inizi di validità ${context.strictTemporalOrder ? "strettamente crescenti" : "non decrescenti"}`
          : "";
      return `Esiste un cammino semplice tra i due terminali che segue la sequenza di tipi selezionata${temporalCondition}?`;
    }
    case "dominatingSet":
      return "Qual è il più piccolo insieme di candidati che copre tutti i nodi obiettivo?";
    case "minimumNodeSeparator":
      return "Qual è il minor numero di nodi rimovibili che separa i due terminali?";
    case "minimumCostNodeSeparator":
      return "Quale insieme di nodi rimovibili separa i terminali al costo totale più basso?";
    case "minimumEdgeSeparator":
      return "Qual è il taglio con il minor numero di archi che separa i terminali?";
    case "minimumCostEdgeSeparator":
      return "Quale taglio separa i terminali al costo totale più basso?";
    case "communities":
      return "Quale partizione massimizza la modularità rispettando i limiti e i vincoli configurati?";
  }
}
