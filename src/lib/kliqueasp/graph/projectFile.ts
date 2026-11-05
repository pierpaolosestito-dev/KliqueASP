export type KliqueAspProject = {
  format: "kliqueasp-project";
  version: 1;
  name?: string;
  graphConfig: Record<string, unknown>;
  graphData: Record<string, unknown> & {
    nodes: unknown[];
    edges?: unknown[];
    links?: unknown[];
  };
};

export const DEFAULT_KLIQUEASP_PROJECT_NAME = "Progetto senza nome";
export const MAX_KLIQUEASP_PROJECT_NAME_LENGTH = 100;

export function normalizeKliqueAspProjectName(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_KLIQUEASP_PROJECT_NAME;
  const normalized = Array.from(
    value.normalize("NFC").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/gu, " ").trim()
  ).slice(0, MAX_KLIQUEASP_PROJECT_NAME_LENGTH).join("").trim();
  return normalized || DEFAULT_KLIQUEASP_PROJECT_NAME;
}

export function createKliqueAspProjectFilename(name: unknown, date = new Date()): string {
  const slug = normalizeKliqueAspProjectName(name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "") || "progetto";
  const datePart = date.toISOString().slice(0, 10);
  return `kliqueasp-${slug}-${datePart}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateGraphDataset(value: unknown): asserts value is Record<string, unknown> & {
  nodes: unknown[];
  edges?: unknown[];
  links?: unknown[];
} {
  if (!isRecord(value)) throw new TypeError("Il dataset deve contenere un oggetto JSON.");
  if (!Array.isArray(value.nodes) || (!Array.isArray(value.edges) && !Array.isArray(value.links))) {
    throw new TypeError("Il dataset deve contenere un array 'nodes' e un array 'edges' o 'links'.");
  }
}

export function buildKliqueAspProject(graphConfig: unknown, graphData: unknown, name?: unknown): KliqueAspProject {
  if (!isRecord(graphConfig)) throw new TypeError("La configurazione deve contenere un oggetto JSON.");
  validateGraphDataset(graphData);
  return {
    format: "kliqueasp-project",
    version: 1,
    ...(name !== undefined ? { name: normalizeKliqueAspProjectName(name) } : {}),
    graphConfig,
    graphData
  };
}

export function parseKliqueAspProject(value: unknown): KliqueAspProject {
  if (!isRecord(value)) throw new TypeError("Il file progetto deve contenere un oggetto JSON.");
  if (value.format !== "kliqueasp-project" || value.version !== 1) {
    throw new TypeError("Formato progetto non riconosciuto. Usa un file esportato da KliqueASP.");
  }
  if (!isRecord(value.graphConfig)) throw new TypeError("Nel progetto manca 'graphConfig'.");
  validateGraphDataset(value.graphData);
  return {
    ...value,
    ...(value.name !== undefined ? { name: normalizeKliqueAspProjectName(value.name) } : {})
  } as KliqueAspProject;
}
