import { formatItalianNumber } from "./formatItalianNumber.ts";

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Summarizes the visible node and edge parts of the currently highlighted witness. */
export function buildGraphWitnessStatus(nodeCount: number, edgeCount: number): string {
  const nodes = safeCount(nodeCount);
  const edges = safeCount(edgeCount);
  const parts: string[] = [];

  if (nodes > 0) parts.push(`${formatItalianNumber(nodes, 0)} ${nodes === 1 ? "nodo" : "nodi"}`);
  if (edges > 0) parts.push(`${formatItalianNumber(edges, 0)} ${edges === 1 ? "arco" : "archi"}`);
  if (parts.length === 0) return "Nessun risultato evidenziato";

  return `Risultato evidenziato · ${parts.join(" · ")}`;
}
