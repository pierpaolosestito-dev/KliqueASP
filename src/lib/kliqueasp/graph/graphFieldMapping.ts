type MappingScope = "node" | "edge";
type MappingConfig = Record<string, any>;

export const GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT = 40;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function propertyPath(parent: string, key: string): string | null {
  if (/^[A-Za-z_$][\w$]*$/.test(key)) return `${parent}.${key}`;
  if (key.includes("'") || key.includes("]")) return null;
  return `${parent}['${key}']`;
}

function sampleGraphRecords<T>(records: T[], limit: number): T[] {
  if (records.length <= limit) return records;
  if (limit <= 1) return records.length ? [records[0]] : [];
  return Array.from({ length: limit }, (_, index) =>
    records[Math.round(index * (records.length - 1) / (limit - 1))]
  );
}

/** Finds mappable JSON paths from a bounded, evenly distributed sample. */
export function collectGraphFieldPaths(
  dataset: unknown,
  collection: "nodes" | "edges" | "links"
): string[] {
  if (!isRecord(dataset) || !Array.isArray(dataset[collection])) return [];
  const paths = new Set<string>();
  const visit = (value: unknown, path: string, depth: number) => {
    if (depth > 4 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      if (value.every((entry) => entry === null || ["string", "number", "boolean"].includes(typeof entry))) {
        paths.add(path);
      } else {
        value.slice(0, 2).forEach((entry) => visit(entry, `${path}[*]`, depth + 1));
      }
      return;
    }
    if (typeof value !== "object") {
      paths.add(path);
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = propertyPath(path, key);
      if (childPath) visit(child, childPath, depth + 1);
    }
  };
  sampleGraphRecords(dataset[collection], GRAPH_FIELD_DISCOVERY_SAMPLE_LIMIT)
    .forEach((record: unknown) => visit(record, "$", 0));
  return [...paths].sort((left, right) => left.localeCompare(right));
}

function migrateLegacyMapping(config: MappingConfig, dataset: unknown): {
  node: MappingConfig;
  edge: MappingConfig;
} {
  const graphMapping = isRecord(config.graphMapping) ? config.graphMapping : {};
  const node: MappingConfig = isRecord(graphMapping.node) ? { ...graphMapping.node } : {};
  const edge: MappingConfig = isRecord(graphMapping.edge) ? { ...graphMapping.edge } : {};
  const nodeFields = collectGraphFieldPaths(dataset, "nodes");
  const edgeFields = collectGraphFieldPaths(dataset, "edges").length
    ? collectGraphFieldPaths(dataset, "edges")
    : collectGraphFieldPaths(dataset, "links");

  if (!node.idField && nodeFields.includes("$.id")) node.idField = "$.id";
  if (!node.labelField && nodeFields.includes("$.label")) node.labelField = "$.label";
  if (!node.typeField && nodeFields.includes("$.type")) node.typeField = "$.type";
  if ((!Array.isArray(node.groupFields) || node.groupFields.length === 0) && isRecord(config.nodeTypes)) {
    const legacyGroups = [...new Set(Object.values(config.nodeTypes).flatMap((typeConfig) =>
      isRecord(typeConfig) && typeof typeConfig.group === "string" ? [typeConfig.group] : []
    ))].filter((path) => nodeFields.includes(path));
    if (legacyGroups.length === 1) node.groupFields = legacyGroups;
  }
  if (!edge.idField && edgeFields.includes("$.id")) edge.idField = "$.id";
  if (!edge.sourceField && edgeFields.includes("$.source")) edge.sourceField = "$.source";
  if (!edge.targetField && edgeFields.includes("$.target")) edge.targetField = "$.target";
  if (!edge.typeField && edgeFields.includes("$.type")) edge.typeField = "$.type";
  if (!edge.direction) edge.direction = "undirected";
  if (!edge.identity) edge.identity = "simple";
  return { node, edge };
}

function prepareGraphMapping(configInput: unknown, dataset: unknown): {
  config: MappingConfig;
  node: MappingConfig;
  edge: MappingConfig;
} {
  if (!isRecord(configInput)) throw new TypeError("Correggi prima il JSON della configurazione.");
  const config = { ...configInput };
  const { node, edge } = config.schemaVersion === 2
    ? {
        node: isRecord((config.graphMapping as MappingConfig | undefined)?.node)
          ? { ...config.graphMapping.node }
          : {},
        edge: isRecord((config.graphMapping as MappingConfig | undefined)?.edge)
          ? { ...config.graphMapping.edge }
          : {}
      }
    : migrateLegacyMapping(config, dataset);
  config.schemaVersion = 2;
  return { config, node, edge };
}

/** Updates one common mapping field while retaining existing settings. */
export function updateGraphFieldMapping(
  configInput: unknown,
  dataset: unknown,
  scope: MappingScope,
  field: string,
  value: string
): MappingConfig {
  const { config, node, edge } = prepareGraphMapping(configInput, dataset);
  const mapping = scope === "node" ? node : edge;
  if (field === "groupFields") {
    if (value) mapping.groupFields = [value];
    else delete mapping.groupFields;
  } else if (field === "direction") {
    if (value === "directed" || value === "undirected") mapping.direction = value;
    else delete mapping.direction;
  } else if (field === "identity") {
    if (value === "simple" || value === "multigraph") mapping.identity = value;
    else delete mapping.identity;
  } else if (field.startsWith("validity.")) {
    const validity = isRecord(mapping.validity) ? { ...mapping.validity } : {};
    const validityField = field.slice("validity.".length);
    if (value) validity[validityField] = value;
    else delete validity[validityField];
    if (Object.keys(validity).length) mapping.validity = validity;
    else delete mapping.validity;
  } else if (value) {
    mapping[field] = value;
  } else {
    delete mapping[field];
  }
  config.graphMapping = {
    ...(isRecord(config.graphMapping) ? config.graphMapping : {}),
    node,
    edge
  };
  return config;
}

/** Adds, changes, or removes a named JSON attribute mapping. */
export function updateGraphAttributeMapping(
  configInput: unknown,
  dataset: unknown,
  scope: MappingScope,
  alias: string,
  path: string
): MappingConfig {
  const cleanAlias = alias.trim();
  if (!cleanAlias) throw new TypeError("Inserisci un nome per l'attributo.");
  const { config, node, edge } = prepareGraphMapping(configInput, dataset);
  const mapping = scope === "node" ? node : edge;
  const attributes = isRecord(mapping.attributes) ? { ...mapping.attributes } : {};
  if (path) attributes[cleanAlias] = path;
  else delete attributes[cleanAlias];
  if (Object.keys(attributes).length) mapping.attributes = attributes;
  else delete mapping.attributes;
  config.graphMapping = {
    ...(isRecord(config.graphMapping) ? config.graphMapping : {}),
    node,
    edge
  };
  return config;
}
