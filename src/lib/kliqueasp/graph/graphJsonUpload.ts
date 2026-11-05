import { parseKliqueAspProject, validateGraphDataset } from "./projectFile.ts";

export type GraphJsonUploadKind = "dataset" | "config" | "project";

export class GraphJsonUploadReadError extends Error {
  readonly technicalDetails: string;

  constructor(message: string, technicalDetails: string) {
    super(message);
    this.name = "GraphJsonUploadReadError";
    this.technicalDetails = technicalDetails;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Reads and validates a JSON upload before the editor applies it to the workspace. */
export async function readGraphJsonUpload(
  file: Pick<File, "text">,
  kind: GraphJsonUploadKind
): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    const technicalDetails = error instanceof Error ? error.message : String(error ?? "Errore non specificato.");
    throw new GraphJsonUploadReadError(
      "Non è stato possibile leggere il file JSON. Selezionalo di nuovo o verifica che sia accessibile.",
      technicalDetails
    );
  }

  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new TypeError("Il file JSON deve contenere un oggetto.");

  if (kind === "dataset") validateGraphDataset(parsed);
  if (kind === "project") return parseKliqueAspProject(parsed);
  return parsed;
}
