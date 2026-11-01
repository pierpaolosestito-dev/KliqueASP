import type { Graph2DMode } from "./graph2dExport.ts";

export const GRAPH2D_OBJECT_URL_REVOKE_DELAY_MS = 1_000;

export function buildGraph2DDownloadFilename(
  mode: Graph2DMode,
  resultLabel: string,
  extension: "svg" | "png",
  date = new Date()
): string {
  const scopeLabel = mode === "witness" ? "testimone" : "proiezione";
  const normalizedContext = (resultLabel || "rete")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const context = (normalizedContext === scopeLabel
    ? ""
    : normalizedContext.startsWith(`${scopeLabel}-`)
      ? normalizedContext.slice(scopeLabel.length + 1)
      : normalizedContext)
    .slice(0, 48) || "rete";
  const datePart = Number.isNaN(date.getTime())
    ? "data-non-valida"
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `kliqueasp-${scopeLabel}-${context}-${datePart}.${extension}`;
}

export function scheduleGraph2DObjectUrlRevocation(
  url: string,
  revoke: (url: string) => void,
  schedule: typeof setTimeout = setTimeout
): void {
  schedule(() => revoke(url), GRAPH2D_OBJECT_URL_REVOKE_DELAY_MS);
}
