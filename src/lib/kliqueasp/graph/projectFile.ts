export type KliqueAspProject = {
  format: "kliqueasp-project";
  version: 1;
  graphConfig: Record<string, unknown>;
  graphData: Record<string, unknown> & {
    nodes: unknown[];
    edges?: unknown[];
    links?: unknown[];
  };
};

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

export function buildKliqueAspProject(graphConfig: unknown, graphData: unknown): KliqueAspProject {
  if (!isRecord(graphConfig)) throw new TypeError("La configurazione deve contenere un oggetto JSON.");
  validateGraphDataset(graphData);
  return {
    format: "kliqueasp-project",
    version: 1,
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
  return value as KliqueAspProject;
}
