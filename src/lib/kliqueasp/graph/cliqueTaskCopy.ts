import { resolveCliqueMode } from "./graphTaskContracts.ts";

/** User-facing Italian label for the configured clique enumeration task. */
export function getCliqueTaskLabel(mode: unknown): string {
  switch (resolveCliqueMode(mode)) {
    case "all":
      return "Tutte le clique";
    case "maximum":
      return "Clique di taglia massima";
    case "maximal":
    default:
      return "Clique massimali";
  }
}

/** Concise graph-theoretic question answered by the configured clique task. */
export function getCliqueTaskQuestion(mode: unknown): string {
  switch (resolveCliqueMode(mode)) {
    case "all":
      return "Quali sottoinsiemi di nodi formano una clique, incluse le sottoclique?";
    case "maximum":
      return "Qual è la taglia massima e quali clique la raggiungono?";
    case "maximal":
    default:
      return "Quali clique non possono essere estese aggiungendo altri nodi?";
  }
}
