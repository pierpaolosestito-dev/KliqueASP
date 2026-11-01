import { parseKliqueAspProject, validateGraphDataset } from "./projectFile.ts";

export type GraphJsonUploadKind = "dataset" | "config" | "project";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Reads and validates a JSON upload before the editor applies it to the workspace. */
export async function readGraphJsonUpload(
  file: Pick<File, "text">,
  kind: GraphJsonUploadKind
): Promise<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(await file.text());
  if (!isRecord(parsed)) throw new TypeError("Il file JSON deve contenere un oggetto.");

  if (kind === "dataset") validateGraphDataset(parsed);
  if (kind === "project") return parseKliqueAspProject(parsed);
  return parsed;
}
