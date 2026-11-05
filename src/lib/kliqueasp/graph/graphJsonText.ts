export type GraphJsonTextInput = "configurazione" | "dataset";

export class GraphJsonTextParseError extends Error {
  readonly input: GraphJsonTextInput;
  readonly technicalDetails: string;

  constructor(input: GraphJsonTextInput, error: unknown) {
    const label = input === "configurazione" ? "della configurazione" : "del dataset";
    super(`Il JSON ${label} non è valido. Correggi la sintassi e riprova.`);
    this.name = "GraphJsonTextParseError";
    this.input = input;
    this.technicalDetails = error instanceof Error ? error.message : String(error ?? "Errore non specificato.");
  }
}

/** Parse editor text separately so the UI can identify which JSON document needs correction. */
export function parseGraphJsonTexts(configText: string, datasetText: string): {
  graphConfig: unknown;
  graphData: unknown;
} {
  let graphConfig: unknown;
  let graphData: unknown;

  try {
    graphConfig = JSON.parse(configText);
  } catch (error) {
    throw new GraphJsonTextParseError("configurazione", error);
  }

  try {
    graphData = JSON.parse(datasetText);
  } catch (error) {
    throw new GraphJsonTextParseError("dataset", error);
  }

  return { graphConfig, graphData };
}
