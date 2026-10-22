import { scaleNonNegativeDecimalWeights } from "./exactDecimal.ts";
import { normalizeProvenanceReferences } from "./provenance.ts";
import { parseGraphTemporalValue } from "./temporalValue.ts";

export { isValidGraphCalendarDate, parseGraphTemporalValue, parseGraphTimeValue } from "./temporalValue.ts";

export type GraphDirection = "undirected" | "directed";
export type EdgeIdentity = "simple" | "multigraph";

export interface GraphNumericRange {
  min: number;
  max: number;
}

export const DEFAULT_EDGE_CONFIDENCE_RANGE: GraphNumericRange = Object.freeze({ min: 0, max: 1 });

export interface GraphDiagnostic {
  code: string;
  severity: "error" | "warning";
  message: string;
  recordIndex?: number;
}

export interface CapabilityStatus {
  available: boolean;
  configured: boolean;
  reason?: string;
  range?: GraphNumericRange;
}

export type GraphCapabilities = Record<string, CapabilityStatus>;

export interface GraphFieldMapping {
  idField?: string;
  labelField?: string;
  typeField?: string;
  roleField?: string;
  groupFields?: string[];
  attributes?: Record<string, string>;
  sourceField?: string;
  targetField?: string;
  direction?: GraphDirection;
  identity?: EdgeIdentity;
  validity?: {
    fromField?: string;
    toField?: string;
  };
  weightField?: string;
  removalCostField?: string;
  confidenceField?: string;
  confidenceRange?: GraphNumericRange;
  provenanceField?: string;
}

export interface GraphMappingConfig {
  schemaVersion?: number;
  graphIntegrity?: GraphIntegrityConstraints;
  graphAnalysis?: GraphAnalysisConfig;
  graphMapping?: {
    node?: GraphFieldMapping;
    edge?: GraphFieldMapping;
  };
}

export interface GraphIntegrityConstraints {
  requireNodeTypes?: boolean;
  requireEdgeTypes?: boolean;
  allowedNodeTypes?: string[];
  allowedEdgeTypes?: string[];
  requiredEdgeIntervals?: string[];
  edgeTypeDomains?: Array<{
    edgeType: string;
    sourceNodeTypes: string[];
    targetNodeTypes: string[];
  }>;
  requiredNodeAttributes?: Array<{ nodeType: string; attributes: string[] }>;
  requiredEdgeAttributes?: Array<{ edgeType: string; attributes: string[] }>;
  nodeAttributeDomains?: Array<{
    nodeType: string;
    attribute: string;
    allowedValues: Array<string | number | boolean>;
  }>;
  edgeAttributeDomains?: Array<{
    edgeType: string;
    attribute: string;
    allowedValues: Array<string | number | boolean>;
  }>;
  uniqueNodeAttributes?: Array<{ nodeType: string; attribute: string }>;
  uniqueEdgeAttributes?: Array<{ edgeType: string; attribute: string }>;
  repairSuggestions?: {
    removableEdges?: Array<{ edgeId: string; cost?: number }>;
    nodeAttributeValues?: Array<{
      nodeId: string | number;
      attribute: string;
      value: string | number | boolean;
      cost?: number;
    }>;
    edgeAttributeValues?: Array<{
      edgeId: string;
      attribute: string;
      value: string | number | boolean;
      cost?: number;
    }>;
    nodeAttributeReplacements?: Array<{
      nodeId: string | number;
      attribute: string;
      expectedValue: string | number | boolean;
      value: string | number | boolean;
      cost?: number;
    }>;
    edgeAttributeReplacements?: Array<{
      edgeId: string;
      attribute: string;
      expectedValue: string | number | boolean;
      value: string | number | boolean;
      cost?: number;
    }>;
    nodeTypeReplacements?: Array<{
      nodeId: string | number;
      expectedType: string;
      newType: string;
      cost?: number;
    }>;
    edgeTypeReplacements?: Array<{
      edgeId: string;
      expectedType: string;
      newType: string;
      cost?: number;
    }>;
    edgeIntervalReplacements?: Array<{
      edgeId: string;
      expectedFrom?: string | number | boolean | null;
      expectedTo?: string | number | boolean | null;
      from: string | number;
      to: string | number;
      cost?: number;
    }>;
  };
  cardinalities?: Array<{
    nodeType: string;
    edgeType: string;
    incidence?: "any" | "source" | "target";
    min?: number;
    max?: number;
  }>;
}

export interface GraphMotifTemplate {
  id: string;
  label?: string;
  roles: Record<string, { nodeTypes: string[] }>;
  edges: Array<{ sourceRole: string; targetRole: string; edgeType: string }>;
  /** Typed relationships required to be absent under an explicit closed-world assumption. */
  absentEdges?: Array<{ sourceRole: string; targetRole: string; edgeType: string }>;
  /** Finite relation vocabulary over which the role assignment must be an induced subgraph. */
  inducedEdgeTypes?: string[];
  closedWorld?: boolean;
  symmetricRoles?: string[][];
  temporal?:
    | { semantics: "coValid" }
    | { semantics: "orderedByStart"; strict?: boolean };
}

export interface GraphCommunityConstraints {
  useEdgeWeights?: boolean;
  minCount?: number;
  maxCount?: number;
  mustLink?: Array<[string, string]>;
  cannotLink?: Array<[string, string]>;
  /** Per-community bounds over a value in the mapped node attributes. */
  attributeBounds?: Array<{
    attribute: string;
    value: string | number | boolean;
    minPerCommunity?: number;
    maxPerCommunity?: number;
  }>;
}

export interface GraphProvenanceScenario {
  id: string;
  label?: string;
  sources: Array<string | number | boolean>;
}

export interface GraphProvenanceScenarioConfig {
  scenarios: GraphProvenanceScenario[];
  unattributedEdges: "include" | "exclude";
  referenceMatching?: "any" | "all";
}

export interface GraphCounterfactualEdgeAddition {
  id: string;
  sourceNodeId: string | number;
  targetNodeId: string | number;
  edgeType: string;
  cost: number;
  validity?: { from: number | string; to: number | string };
}

export interface GraphCounterfactualConstraints {
  edgeAdditions?: GraphCounterfactualEdgeAddition[];
}

export interface GraphAnalysisConfig {
  motifs?: GraphMotifTemplate[];
  communities?: GraphCommunityConstraints;
  counterfactuals?: GraphCounterfactualConstraints;
  provenanceScenarios?: GraphProvenanceScenarioConfig;
}

export interface NormalizedGraphNode extends Record<string, unknown> {
  id: string;
  sourceId?: string;
  label: string;
  type?: string;
  analysis?: Record<string, unknown>;
}

export interface NormalizedGraphLink extends Record<string, unknown> {
  source: string;
  target: string;
  sourceId?: string;
  sourceIdGenerated?: boolean;
  type?: unknown;
  analysis?: Record<string, unknown>;
}

export interface NormalizedGraph {
  nodes: NormalizedGraphNode[];
  links: NormalizedGraphLink[];
  schemaVersion: number;
  direction: GraphDirection;
  identity: EdgeIdentity;
  capabilities: GraphCapabilities;
  diagnostics: GraphDiagnostic[];
  valid: boolean;
}

const SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);
const GRAPH_MAPPING_CAPABILITY_REQUIREMENTS: Record<string, string[]> = {
  clique: ["undirectedAdjacency"],
  kPlex: ["undirectedAdjacency"],
  kCore: [],
  connectedComponents: ["undirectedAdjacency"],
  weakComponents: ["directedEdges"],
  strongComponents: ["directedEdges"],
  dominatingSet: ["undirectedAdjacency"],
  minimumNodeSeparator: [],
  minimumCostNodeSeparator: ["nodeRemovalCosts"],
  minimumEdgeSeparator: [],
  minimumCostEdgeSeparator: ["edgeRemovalCosts"],
  communities: ["undirectedAdjacency"],
  boundedPath: [],
  typedPath: ["edgeTypes"],
  typedMotif: ["nodeTypes", "edgeTypes"],
  temporalMotif: ["nodeTypes", "edgeTypes", "edgeIntervals"]
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalJsonValue(value[key])])
  );
}

function edgeMetadataSignature(analysis: Record<string, unknown>): string {
  const metadata = { ...analysis };
  delete metadata.id;
  return JSON.stringify(canonicalJsonValue(metadata));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isGraphIdentifierScalar(value: unknown): boolean {
  return typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value));
}

export function normalizeGraphId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/&/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeGraphLabel(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function getGraphEndpointId(endpoint: unknown): unknown {
  return endpoint !== null && typeof endpoint === "object"
    ? (endpoint as Record<string, unknown>).id
    : endpoint;
}

function jsonPathTokens(pathExpression: string): string[] {
  const expression = pathExpression.trim();
  if (!expression || expression === "$") return [];

  const withoutRoot = expression.startsWith("$")
    ? expression.slice(1).replace(/^\./, "")
    : expression;
  const tokens = withoutRoot.match(/[^.[\]]+|\[[^\]]*\]/g) ?? [];

  return tokens.map((token) => {
    if (!token.startsWith("[")) return token;
    const value = token.slice(1, -1).trim();
    if (value === "" || value === "*") return "*";
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1);
    }
    return value;
  });
}

/** Resolves the JSONPath subset used by graph mappings. */
export function graphPathValues(root: unknown, pathExpression: string): unknown[] {
  const expression = pathExpression.trim();
  if (!expression) return [];
  if (expression === "$") return [root];

  let current: unknown[] = [root];

  for (const token of jsonPathTokens(expression)) {
    const next: unknown[] = [];

    for (const item of current) {
      if (token === "*") {
        if (Array.isArray(item)) next.push(...item);
        else if (item !== undefined && item !== null) next.push(item);
        continue;
      }

      if (/^\d+$/.test(token) && Array.isArray(item)) {
        const value = item[Number(token)];
        if (value !== undefined && value !== null) next.push(value);
        continue;
      }

      const candidates = Array.isArray(item) ? item : [item];
      for (const candidate of candidates) {
        if (candidate === null || typeof candidate !== "object") continue;
        const value = (candidate as Record<string, unknown>)[token];
        if (Array.isArray(value)) next.push(...value);
        else if (value !== undefined && value !== null) next.push(value);
      }
    }

    current = next;
  }

  return current.flat(Infinity).filter((value) => value !== undefined && value !== null);
}

function firstMappedValue(
  record: unknown,
  fieldPath: string | undefined,
  fallback: unknown
): unknown {
  if (!fieldPath) return fallback;
  return graphPathValues(record, fieldPath)[0];
}

function mappedStrings(record: unknown, paths: string[] | undefined): string[] {
  if (!Array.isArray(paths)) return [];

  return [...new Set(paths.flatMap((path) => graphPathValues(record, path))
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

function capability(
  configured: boolean,
  present: boolean,
  reasonWhenMissing: string
): CapabilityStatus {
  if (!configured) {
    return { available: false, configured: false, reason: reasonWhenMissing };
  }
  if (!present) {
    return { available: false, configured: true, reason: reasonWhenMissing };
  }
  return { available: true, configured: true };
}

function isFiniteScalar(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string" || value.trim() === "") return false;
  const numericValue = Number(value);
  return Number.isFinite(numericValue);
}

const MAX_ASP_INTEGER = 9_223_372_036_854_775_807n;

/** Encodes finite decimal values exactly because ASP numeric terms are integers. */
function aspNumericTerm(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim();
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) return null;

  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = match[3] ?? match[4] ?? "";
  const exponent = Number(match[5] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return null;

  let numerator = sign * BigInt(`${match[2] ?? "0"}${fraction}` || "0");
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent > 0) numerator *= 10n ** BigInt(exponent);
  if (exponent < 0) denominator *= 10n ** BigInt(-exponent);

  const absNumerator = numerator < 0n ? -numerator : numerator;
  let left = absNumerator;
  let right = denominator;
  while (right !== 0n) [left, right] = [right, left % right];
  const divisor = left || 1n;
  numerator /= divisor;
  denominator /= divisor;

  if (numerator > MAX_ASP_INTEGER || numerator < -MAX_ASP_INTEGER || denominator > MAX_ASP_INTEGER) {
    return null;
  }
  return denominator === 1n
    ? String(numerator)
    : `decimal(${numerator},${denominator})`;
}

function unorderedPairKey(source: string, target: string): string {
  return source < target
    ? `${source}\u0000${target}`
    : `${target}\u0000${source}`;
}

function orderedPairKey(source: string, target: string): string {
  return `${source}\u0000${target}`;
}

function positiveSafeInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^\+?\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Checks the costs actually needed by a node-separator query's removable domain. */
export function checkNodeRemovalCostCapabilityForCandidates(
  configuredCapability: CapabilityStatus | undefined,
  nodes: readonly NormalizedGraphNode[],
  group = "",
  protectedNodeIds: readonly (string | undefined)[] = [],
  getGroups: (node: NormalizedGraphNode) => readonly string[] = (node) =>
    Array.isArray(node.analysis?.groups) ? node.analysis.groups.map(String) : []
): CapabilityStatus {
  if (!configuredCapability?.configured) {
    return configuredCapability ?? {
      available: false,
      configured: false,
      reason: "mappare un costo di rimozione con graphMapping.node.removalCostField"
    };
  }

  const protectedIds = new Set(protectedNodeIds.filter(Boolean).map(String));
  const candidates = nodes.filter((node) =>
    !protectedIds.has(node.id) &&
    (!group || getGroups(node).some((candidateGroup) => String(candidateGroup).trim() === group))
  );
  const invalidCostIds: string[] = [];
  let totalCost = 0;
  let totalCostIsSafe = true;

  for (const node of candidates) {
    const cost = positiveSafeInteger(node.analysis?.removalCost);
    if (cost === null) {
      invalidCostIds.push(node.id);
      continue;
    }
    if (!Number.isSafeInteger(totalCost + cost)) {
      totalCostIsSafe = false;
      break;
    }
    totalCost += cost;
  }

  const reasons: string[] = [];
  if (invalidCostIds.length > 0) {
    reasons.push(`mappare un costo intero positivo per ogni nodo rimovibile candidato (${invalidCostIds.join(", ")})`);
  }
  if (!totalCostIsSafe) {
    reasons.push("la somma dei costi dei nodi rimovibili candidati deve rientrare nell'intervallo intero sicuro");
  }

  return {
    available: reasons.length === 0,
    configured: true,
    ...(reasons.length > 0 ? { reason: reasons.join("; ") } : {})
  };
}

function makeCapabilities(
  schemaVersion: number,
  nodeMapping: GraphFieldMapping,
  edgeMapping: GraphFieldMapping,
  nodes: NormalizedGraphNode[],
  rawEdges: unknown[],
  links: NormalizedGraphLink[],
  edgeDirection: GraphDirection,
  edgeIdentity: EdgeIdentity,
  weightedCommunitiesRequested: boolean
): GraphCapabilities {
  const nodeTypesComplete = nodes.length > 0 && nodes.every((node) => Boolean(node.analysis?.type));
  const nodeRolesComplete = nodes.length > 0 && nodes.every((node) => {
    const roles = node.analysis?.roles;
    return Array.isArray(roles) && roles.length > 0;
  });
  const nodeGroupsComplete = nodes.length > 0 && nodes.every((node) => {
    const groups = node.analysis?.groups;
    return Array.isArray(groups) && groups.length > 0;
  });
  let totalMappedNodeRemovalCost = 0;
  const nodeRemovalCostsComplete = Boolean(nodeMapping.removalCostField) && nodes.length > 0 && nodes.every((node) => {
    const cost = positiveSafeInteger(node.analysis?.removalCost);
    if (cost === null || !Number.isSafeInteger(totalMappedNodeRemovalCost + cost)) return false;
    totalMappedNodeRemovalCost += cost;
    return true;
  });

  const edgeTypes = rawEdges.map((edge) => firstMappedValue(edge, edgeMapping.typeField, undefined));
  const edgeTypesComplete = edgeTypes.length > 0 && edgeTypes.every((value) => String(value ?? "").trim() !== "");
  const fromField = edgeMapping.validity?.fromField;
  const toField = edgeMapping.validity?.toField;
  const intervalDomains = new Set<"integer" | "date">();
  const intervalsComplete = Boolean(fromField && toField) && rawEdges.length > 0 && rawEdges.every((edge) => {
    const from = parseGraphTemporalValue(firstMappedValue(edge, fromField, undefined));
    const to = parseGraphTemporalValue(firstMappedValue(edge, toField, undefined));
    if (from === null || to === null || from.domain !== to.domain || from.value > to.value) return false;
    intervalDomains.add(from.domain);
    return true;
  }) && intervalDomains.size === 1;
  const weightsComplete = Boolean(edgeMapping.weightField) && rawEdges.length > 0 && rawEdges.every((edge) =>
    aspNumericTerm(firstMappedValue(edge, edgeMapping.weightField, undefined)) !== null
  );
  let totalMappedRemovalCost = 0;
  const removalCostsComplete = Boolean(edgeMapping.removalCostField) && links.length > 0 && links.every((link) => {
    const cost = positiveSafeInteger(link.analysis?.removalCost);
    if (cost === null || !Number.isSafeInteger(totalMappedRemovalCost + cost)) return false;
    totalMappedRemovalCost += cost;
    return true;
  });
  const confidenceRange = edgeMapping.confidenceRange ?? DEFAULT_EDGE_CONFIDENCE_RANGE;
  const confidenceComplete = Boolean(edgeMapping.confidenceField) && rawEdges.length > 0 && rawEdges.every((edge) => {
    const rawValue = firstMappedValue(edge, edgeMapping.confidenceField, Number.NaN);
    const value = Number(rawValue);
    return aspNumericTerm(rawValue) !== null && Number.isFinite(value) &&
      value >= confidenceRange.min && value <= confidenceRange.max;
  });
  const provenanceComplete = Boolean(edgeMapping.provenanceField) && rawEdges.length > 0 && rawEdges.every((edge) =>
    (normalizeProvenanceReferences(graphPathValues(edge, edgeMapping.provenanceField ?? ""))?.length ?? 0) > 0
  );
  const edgeIds = links.map((link) => asRecord(link.analysis).id);
  const mappedEdgeIdsComplete = Boolean(edgeMapping.idField) && rawEdges.length > 0 && rawEdges.every((edge) => {
    const values = graphPathValues(edge, edgeMapping.idField!);
    return values.length === 1 && isGraphIdentifierScalar(values[0]) && String(values[0]).trim() !== "";
  });
  const mappedEdgeIdsUnique = new Set(edgeIds.map((value) => String(value ?? ""))).size === edgeIds.length;

  return {
    undirectedAdjacency: capability(
      edgeDirection === "undirected",
      edgeDirection === "undirected",
      "il task richiede una proiezione non orientata, ma il mapping corrente dichiara archi diretti"
    ),
    directedEdges: capability(
      schemaVersion === 2 && edgeMapping.direction === "directed",
      schemaVersion === 2 && edgeDirection === "directed",
      "la direzione degli archi non è stata dichiarata nel mapping"
    ),
    nodeTypes: capability(
      schemaVersion === 2 && Boolean(nodeMapping.typeField),
      nodeTypesComplete,
      "mappare un tipo per ogni nodo con graphMapping.node.typeField"
    ),
    nodeRoles: capability(
      schemaVersion === 2 && Boolean(nodeMapping.roleField),
      nodeRolesComplete,
      "mappare un ruolo per ogni nodo con graphMapping.node.roleField"
    ),
    nodeGroups: capability(
      schemaVersion === 2 && Boolean(nodeMapping.groupFields?.length),
      nodeGroupsComplete,
      "mappare i gruppi con graphMapping.node.groupFields"
    ),
    nodeAttributes: capability(
      schemaVersion === 2 && Boolean(Object.keys(nodeMapping.attributes ?? {}).length),
      schemaVersion === 2 && Boolean(Object.keys(nodeMapping.attributes ?? {}).length),
      "mappare gli attributi necessari con graphMapping.node.attributes"
    ),
    nodeRemovalCosts: capability(
      schemaVersion === 2 && Boolean(nodeMapping.removalCostField),
      nodeRemovalCostsComplete,
      "mappare un costo di rimozione intero positivo per ogni nodo della proiezione completa; il separatore pesato richiede costi soltanto per i candidati non terminali del gruppo selezionato"
    ),
    edgeTypes: capability(
      schemaVersion === 2 && Boolean(edgeMapping.typeField),
      edgeTypesComplete,
      "mappare un tipo per ogni arco con graphMapping.edge.typeField"
    ),
    edgeAttributes: capability(
      schemaVersion === 2 && Boolean(Object.keys(edgeMapping.attributes ?? {}).length),
      schemaVersion === 2 && Boolean(Object.keys(edgeMapping.attributes ?? {}).length),
      "mappare gli attributi necessari con graphMapping.edge.attributes"
    ),
    edgeIntervals: capability(
      schemaVersion === 2 && Boolean(fromField && toField),
      intervalsComplete,
      "mappare intervalli validi e ordinati in un unico dominio temporale su tutti gli archi con graphMapping.edge.validity"
    ),
    edgeWeights: capability(
      schemaVersion === 2 && Boolean(edgeMapping.weightField),
      weightsComplete,
      "mappare un peso numerico per ogni arco con graphMapping.edge.weightField"
    ),
    modularityWeights: capability(
      weightedCommunitiesRequested && schemaVersion === 2 && Boolean(edgeMapping.weightField),
      (() => {
        if (!edgeMapping.weightField || links.length === 0) return false;
        const scaled = scaleNonNegativeDecimalWeights(links.map((link) => link.analysis?.weight));
        return scaled.ok && scaled.value.total > 0;
      })(),
      "per la modularità pesata mappare pesi decimali finiti non negativi con totale positivo, normalizzabili esattamente entro i limiti interi sicuri"
    ),
    edgeRemovalCosts: capability(
      schemaVersion === 2 && Boolean(edgeMapping.removalCostField),
      removalCostsComplete,
      "mappare un costo di rimozione intero positivo per ogni arco con graphMapping.edge.removalCostField"
    ),
    edgeConfidence: {
      ...capability(
        schemaVersion === 2 && Boolean(edgeMapping.confidenceField),
        confidenceComplete,
        "mappare un punteggio numerico per ogni arco entro graphMapping.edge.confidenceRange (default: 0–1)"
      ),
      range: confidenceRange
    },
    edgeProvenance: capability(
      schemaVersion === 2 && Boolean(edgeMapping.provenanceField),
      provenanceComplete,
      "mappare almeno un riferimento di fonte scalare per ogni arco con graphMapping.edge.provenanceField"
    ),
    edgeIdentity: capability(
      schemaVersion === 2 && edgeIdentity === "multigraph" && Boolean(edgeMapping.idField),
      schemaVersion === 2 && edgeIdentity === "multigraph" && mappedEdgeIdsComplete && mappedEdgeIdsUnique,
      "per avere identità persistenti sugli archi, configurare identity: 'multigraph' e un idField univoco"
    )
  };
}

export function checkGraphTaskRequirements(
  capabilities: GraphCapabilities,
  requiredCapabilities: string[]
): { available: boolean; missing: string[]; reasons: string[] } {
  const missing = requiredCapabilities.filter((name) => !capabilities[name]?.available);
  const reasons = missing.map((name) => capabilities[name]?.reason ?? `capacità sconosciuta: ${name}`);
  return { available: missing.length === 0, missing, reasons };
}

export function getGraphTaskRequirements(task: string, direction?: GraphDirection): string[] | null {
  const requirements = GRAPH_MAPPING_CAPABILITY_REQUIREMENTS[task];
  if (!requirements) return null;
  if (task === "kCore" && direction) {
    return [...requirements, direction === "directed" ? "directedEdges" : "undirectedAdjacency"];
  }
  return requirements;
}

/** Decodes the reversible marker encoding used for control characters inside ASP strings. */
export function decodeAspStringPayload(value: string): string {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "~" || index + 1 >= value.length) {
      decoded += value[index];
      continue;
    }

    if (value[index + 1] === "~") {
      decoded += "~";
      index += 1;
      continue;
    }

    const encodedControl = /^x([0-9a-fA-F]{4})$/.exec(value.slice(index + 1, index + 6));
    if (encodedControl) {
      decoded += String.fromCharCode(Number.parseInt(encodedControl[1], 16));
      index += 5;
      continue;
    }

    decoded += value[index];
  }
  return decoded;
}

/** Serializes strings for clingo and encodes control characters without losing distinctions. */
export function escapeAspString(value: unknown): string {
  let escaped = "";
  for (const character of String(value ?? "")) {
    const code = character.charCodeAt(0);
    if (character === "~") escaped += "~~";
    else if (character === "\\") escaped += "\\\\";
    else if (character === '"') escaped += '\\"';
    else if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      escaped += `~x${code.toString(16).toUpperCase().padStart(4, "0")}`;
    } else escaped += character;
  }

  return `"${escaped}"`;
}

export type CliqueMode = "maximal" | "all" | "maximum";

export function buildCliqueProgram(
  mode: CliqueMode,
  group: string,
  explanation: { enabled?: boolean; includeEdgeRecords?: boolean } = {}
): string {
  const domain = group ? "valid" : "node";
  const lines: string[] = [];

  if (group) lines.push(`valid(V) :- node(V), group(V, ${escapeAspString(group)}).`, "");

  lines.push(
    `{ in(V) : ${domain}(V) }.`,
    "",
    ":- in(U), in(V), U < V, not edge(U,V)."
  );

  if (mode === "maximal") {
    lines.push(
      "",
      `out(W) :- ${domain}(W), in(V), V != W, not edge(W,V).`,
      `:- ${domain}(W), not in(W), not out(W).`
    );
  } else {
    lines.push("", "#maximize { 1,V : in(V) }.");
  }

  lines.push("");
  if (explanation.enabled) {
    if (explanation.includeEdgeRecords) {
      lines.push(
        "clique_edge_support(U,V,E) :- in(U), in(V), U < V, edge_record(E), edge_source(E,U), edge_target(E,V).",
        "clique_edge_support(U,V,E) :- in(U), in(V), U < V, edge_record(E), edge_source(E,V), edge_target(E,U).",
        "#show clique_edge_support/3."
      );
    } else {
      lines.push(
        "clique_edge_support(U,V) :- in(U), in(V), U < V, edge(U,V).",
        "#show clique_edge_support/2."
      );
    }
  }
  lines.push("#show in/1.");
  return lines.join("\n");
}

export function getCliqueModeOptions(mode: CliqueMode): string[] {
  if (mode === "all") return ["--opt-mode=enum"];
  if (mode === "maximum") return ["--opt-mode=optN"];
  return [];
}

export function parseWitnessCliques(
  witnesses: unknown,
  reverseIndex: Record<number, string>,
  minimumCliqueSize = 3
): string[][] {
  return parseWitnessCliqueResults(witnesses, reverseIndex, reverseIndex, {}, {}, minimumCliqueSize)
    .map((result) => result.nodeIds);
}

export interface CliqueSupportingEdge {
  sourceNodeId: string;
  targetNodeId: string;
  edgeId?: string;
  edgeIdGenerated?: boolean;
}

export interface CliqueWitnessResult {
  nodeIds: string[];
  supportingEdges: CliqueSupportingEdge[];
}

/** Parses each clique with the ASP edge records that witness its pairwise adjacency. */
export function parseWitnessCliqueResults(
  witnesses: unknown,
  reverseIndex: Record<number, string>,
  reverseSourceIndex: Record<number, string> = reverseIndex,
  reverseEdgeIndex: Record<number, string> = {},
  reverseGeneratedEdgeIndex: Record<number, boolean> = {},
  minimumCliqueSize = 3
): CliqueWitnessResult[] {
  const seen = new Set<string>();
  const cliques: CliqueWitnessResult[] = [];

  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = asRecord(witness).Value;
    const atoms = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string");
    const members = atoms
      .map((atom) => /^in\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseIndex[Number(match[1])])
      .filter((id): id is string => Boolean(id));

    if (!Number.isSafeInteger(minimumCliqueSize) || minimumCliqueSize < 0 || members.length < minimumCliqueSize) continue;
    const key = [...members].sort().join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);

    const supportingEdges: CliqueSupportingEdge[] = [];
    const seenEdges = new Set<string>();
    for (const atom of atoms) {
      const mappedRecord = /^clique_edge_support\((\d+),(\d+),(\d+)\)$/.exec(atom);
      const mappedPair = /^clique_edge_support\((\d+),(\d+)\)$/.exec(atom);
      const match = mappedRecord ?? mappedPair;
      if (!match) continue;
      const sourceIndex = Number(match[1]);
      const targetIndex = Number(match[2]);
      const sourceNodeId = reverseSourceIndex[sourceIndex] ?? reverseIndex[sourceIndex];
      const targetNodeId = reverseSourceIndex[targetIndex] ?? reverseIndex[targetIndex];
      if (!sourceNodeId || !targetNodeId) continue;
      const edgeId = mappedRecord ? reverseEdgeIndex[Number(mappedRecord[3])] : undefined;
      const edgeKey = `${sourceNodeId}\u0000${targetNodeId}\u0000${edgeId ?? ""}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);
      supportingEdges.push({
        sourceNodeId,
        targetNodeId,
        ...(edgeId ? {
          edgeId,
          ...(reverseGeneratedEdgeIndex[Number(mappedRecord?.[3])] === true ? { edgeIdGenerated: true } : {})
        } : {})
      });
    }
    supportingEdges.sort((left, right) =>
      left.sourceNodeId.localeCompare(right.sourceNodeId) ||
      left.targetNodeId.localeCompare(right.targetNodeId) ||
      (left.edgeId ?? "").localeCompare(right.edgeId ?? "")
    );
    cliques.push({ nodeIds: members, supportingEdges });
  }

  return cliques;
}

export function selectMaximumCliques(cliques: string[][]): string[][] {
  if (cliques.length === 0) return [];
  const maximumSize = Math.max(...cliques.map((clique) => clique.length));
  return cliques.filter((clique) => clique.length === maximumSize);
}

function aspValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  const numericTerm = aspNumericTerm(value);
  if (numericTerm !== null) return numericTerm;
  return escapeAspString(value);
}

/** Serializes a configured primitive repair value using the graph fact conventions. */
export function serializeAspRepairValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Il valore candidato deve essere un numero finito");
    const numericTerm = aspNumericTerm(value);
    if (numericTerm === null) throw new TypeError("Il valore numerico candidato non è rappresentabile in ASP");
    return numericTerm;
  }
  if (typeof value === "string") return aspValue(value);
  throw new TypeError("Il valore candidato deve essere una stringa, un numero finito o un booleano");
}

/**
 * ASP time values are order/equality tokens, not quantities. Compact ranks keep
 * ISO dates and large integer timelines inside clingo's signed 32-bit range.
 */
export interface AspTemporalEncoding {
  encode(value: unknown): number | null;
  decode(value: number): number | undefined;
}

function temporalEncodingKey(value: { value: number; domain: "integer" | "date" }): string {
  return `${value.domain}:${value.value}`;
}

export function createAspTemporalEncoding(values: readonly unknown[]): AspTemporalEncoding {
  const unique = new Map<string, { value: number; domain: "integer" | "date" }>();
  for (const value of values) {
    const parsed = parseGraphTemporalValue(value);
    if (parsed) unique.set(temporalEncodingKey(parsed), parsed);
  }

  const ordered = [...unique.values()].sort((left, right) =>
    left.domain === right.domain
      ? left.value - right.value
      : left.domain.localeCompare(right.domain)
  );
  if (ordered.length > 2_147_483_647) {
    throw new RangeError("Il grafo contiene troppi valori temporali distinti per la codifica ASP di clingo");
  }

  const encodedByKey = new Map<string, number>();
  const decodedByRank = new Map<number, number>();
  const identityIntegerEncoding = ordered.length > 0 && ordered.every((value) =>
    value.domain === "integer" && value.value >= -2_147_483_648 && value.value <= 2_147_483_647
  );
  ordered.forEach((parsed, index) => {
    const rank = index + 1;
    encodedByKey.set(temporalEncodingKey(parsed), rank);
    decodedByRank.set(rank, parsed.value);
  });

  return {
    encode(value: unknown): number | null {
      const parsed = parseGraphTemporalValue(value);
      if (!parsed) return null;
      if (identityIntegerEncoding) return parsed.domain === "integer" ? parsed.value : null;
      return encodedByKey.get(temporalEncodingKey(parsed)) ?? null;
    },
    decode(value: number): number | undefined {
      if (identityIntegerEncoding) return Number.isInteger(value) ? value : undefined;
      return decodedByRank.get(value);
    }
  };
}

export interface AspFactBundle {
  facts: string;
  reverseIndex: Record<number, string>;
  reverseSourceIndex: Record<number, string>;
  reverseEdgeIndex: Record<number, string>;
  reverseGeneratedEdgeIndex: Record<number, boolean>;
  indexByNodeId: Map<string, number>;
  temporalEncoding: AspTemporalEncoding;
}

export interface AspFactSerializationOptions {
  /** Provenance is descriptive in current tasks and can be omitted from runtime grounding. */
  includeEdgeProvenance?: boolean;
  /** Exact invalid temporal scalars are needed only by opt-in interval repair candidates. */
  includeRawTemporalValues?: boolean;
  /** Extra valid times that must share ranks with graph times, such as repair candidates. */
  additionalTemporalValues?: readonly unknown[];
  /** Reuse one encoding when graph facts and candidate facts are compiled together. */
  temporalEncoding?: AspTemporalEncoding;
}

/** Serializes normalized graph data to the legacy facts plus explicitly mapped v2 facts. */
export function buildAspFactsFromGraph(
  graphInput: unknown,
  groupExtractor: (node: NormalizedGraphNode) => string[] = (node) =>
    Array.isArray(node.analysis?.groups) ? node.analysis.groups as string[] : [],
  options: AspFactSerializationOptions = {}
): AspFactBundle {
  const graph = asRecord(graphInput);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes as NormalizedGraphNode[] : [];
  const links = Array.isArray(graph.links) ? graph.links as NormalizedGraphLink[] : [];
  const isVersion2 = graph.schemaVersion === 2;
  const graphDirection = graph.direction === "directed" ? "directed" : "undirected";
  const graphTemporalValues = links.flatMap((link) => {
    const validity = asRecord(asRecord(link.analysis).validity);
    return [validity.from, validity.to];
  });
  const temporalEncoding = options.temporalEncoding ?? createAspTemporalEncoding([
    ...graphTemporalValues,
    ...(options.additionalTemporalValues ?? [])
  ]);
  const indexByNodeId = new Map<string, number>();
  const reverseIndex: Record<number, string> = {};
  const reverseSourceIndex: Record<number, string> = {};
  const reverseEdgeIndex: Record<number, string> = {};
  const reverseGeneratedEdgeIndex: Record<number, boolean> = {};

  nodes.forEach((node, index) => {
    indexByNodeId.set(node.id, index + 1);
    reverseIndex[index + 1] = node.id;
    reverseSourceIndex[index + 1] = String(node.sourceId ?? node.id);
  });

  const lines: string[] = [];
  for (const index of indexByNodeId.values()) lines.push(`node(${index}).`);

  if (isVersion2) {
    for (const node of nodes) {
      const index = indexByNodeId.get(node.id);
      if (!index) continue;
      const analysis = asRecord(node.analysis);

      if (typeof analysis.type === "string" && analysis.type !== "") {
        lines.push(`node_type(${index},${escapeAspString(analysis.type)}).`);
      }
      if (Array.isArray(analysis.roles)) {
        for (const role of new Set(analysis.roles.map((value) => String(value).trim()).filter(Boolean))) {
          lines.push(`node_role(${index},${escapeAspString(role)}).`);
        }
      }
      const removalCost = positiveSafeInteger(analysis.removalCost);
      if (removalCost !== null) lines.push(`node_removal_cost(${index},${removalCost}).`);
      if (isRecord(analysis.attributes)) {
        for (const [name, value] of Object.entries(analysis.attributes)) {
          lines.push(`node_attribute(${index},${escapeAspString(name)},${aspValue(value)}).`);
        }
      }
    }
  }

  for (const node of nodes) {
    const index = indexByNodeId.get(node.id);
    if (!index) continue;
    const groups = [...new Set(groupExtractor(node).map((value) => String(value).trim()).filter(Boolean))];

    for (const group of groups) {
      lines.push(`group(${index},${escapeAspString(group)}).`);
      if (isVersion2) lines.push(`node_group(${index},${escapeAspString(group)}).`);
    }
  }

  let edgeRecordIndex = 0;
  for (const link of links) {
    const sourceId = normalizeGraphId(getGraphEndpointId(link.source));
    const targetId = normalizeGraphId(getGraphEndpointId(link.target));
    const source = indexByNodeId.get(sourceId);
    const target = indexByNodeId.get(targetId);
    if (!source || !target) continue;

    edgeRecordIndex += 1;
    if (graphDirection === "undirected") {
      lines.push(`edge(${source},${target}).`);
      lines.push(`edge(${target},${source}).`);
    } else {
      lines.push(`edge(${source},${target}).`);
    }

    if (!isVersion2) continue;

    const edge = asRecord(link.analysis);
    const record = edgeRecordIndex;
    reverseEdgeIndex[record] = String(link.sourceId ?? edge.id ?? `edge_${record}`);
    reverseGeneratedEdgeIndex[record] = link.sourceIdGenerated === true;
    lines.push(`edge_record(${record}).`);
    lines.push(`edge_source(${record},${source}).`);
    lines.push(`edge_target(${record},${target}).`);
    lines.push(`edge_direction(${record},${graphDirection}).`);

    if (edge.id !== undefined && String(edge.id).trim() !== "") {
      lines.push(`edge_id(${record},${escapeAspString(edge.id)}).`);
    }
    if (typeof edge.type === "string" && edge.type !== "") {
      lines.push(`edge_type(${record},${escapeAspString(edge.type)}).`);
    }

    const validity = asRecord(edge.validity);
    if (validity.from !== undefined) {
      const parsed = parseGraphTemporalValue(validity.from);
      const normalized = parsed ? temporalEncoding.encode(validity.from) : null;
      if (parsed && normalized === null) {
        throw new RangeError("La codifica temporale ASP non contiene un estremo di intervallo del grafo");
      }
      if (normalized === null) {
        lines.push(`edge_valid_from_invalid(${record}).`);
        lines.push(`edge_valid_from_raw(${record},${escapeAspString(validity.from)}).`);
        if (options.includeRawTemporalValues === true) {
          lines.push(`edge_valid_from_raw_exact(${record},${escapeAspString(JSON.stringify(validity.from))}).`);
        }
      } else {
        lines.push(`edge_valid_from(${record},${normalized}).`);
      }
    }
    if (validity.to !== undefined) {
      const parsed = parseGraphTemporalValue(validity.to);
      const normalized = parsed ? temporalEncoding.encode(validity.to) : null;
      if (parsed && normalized === null) {
        throw new RangeError("La codifica temporale ASP non contiene un estremo di intervallo del grafo");
      }
      if (normalized === null) {
        lines.push(`edge_valid_to_invalid(${record}).`);
        lines.push(`edge_valid_to_raw(${record},${escapeAspString(validity.to)}).`);
        if (options.includeRawTemporalValues === true) {
          lines.push(`edge_valid_to_raw_exact(${record},${escapeAspString(JSON.stringify(validity.to))}).`);
        }
      } else {
        lines.push(`edge_valid_to(${record},${normalized}).`);
      }
    }
    if (edge.weight !== undefined) lines.push(`edge_weight(${record},${aspValue(edge.weight)}).`);
    const removalCost = positiveSafeInteger(edge.removalCost);
    if (removalCost !== null) lines.push(`edge_removal_cost(${record},${removalCost}).`);
    if (edge.confidence !== undefined) lines.push(`edge_confidence(${record},${aspValue(edge.confidence)}).`);
    const provenanceValues = Array.isArray(edge.provenance)
      ? normalizeProvenanceReferences(edge.provenance) ?? []
      : edge.provenance !== undefined && String(edge.provenance).trim() !== ""
        ? [edge.provenance]
        : [];
    if (options.includeEdgeProvenance !== false) {
      for (const provenance of provenanceValues) {
        lines.push("edge_provenance(" + record + "," + escapeAspString(provenance) + ").");
      }
    }
    if (isRecord(edge.attributes)) {
      for (const [name, value] of Object.entries(edge.attributes)) {
        lines.push(`edge_attribute(${record},${escapeAspString(name)},${aspValue(value)}).`);
      }
    }
  }

  return {
    facts: lines.length > 0 ? `${lines.join("\n")}\n` : "",
    reverseIndex,
    reverseSourceIndex,
    reverseEdgeIndex,
    reverseGeneratedEdgeIndex,
    indexByNodeId,
    temporalEncoding
  };
}

/**
 * Normalizes the legacy nodes/edges input and, when schemaVersion 2 is explicit,
 * retains only those optional semantic fields declared in graphMapping.
 */
export function normalizeGraphData(
  graphInput: unknown,
  configInput: GraphMappingConfig | unknown = {}
): NormalizedGraph {
  const graph = asRecord(graphInput);
  const config = asRecord(configInput) as GraphMappingConfig & Record<string, unknown>;
  const diagnostics: GraphDiagnostic[] = [];
  const suppliedMapping = asRecord(config.graphMapping);
  const rawVersion = config.schemaVersion;
  const schemaVersion = rawVersion === undefined ? 1 : Number(rawVersion);
  let valid = true;
  const rejectUnknownGraphProperties = (
    record: Record<string, unknown>,
    allowed: string[],
    location: string,
    code = "unknown-graph-mapping-property"
  ) => {
    const allowedProperties = new Set(allowed);
    for (const property of Object.keys(record)) {
      if (allowedProperties.has(property)) continue;
      valid = false;
      diagnostics.push({
        code,
        severity: "error",
        message: `${location}.${property} non è supportata da schemaVersion 2; proprietà ammesse: ${allowed.join(", ")}`
      });
    }
  };
  const inspectConfigRecord = (value: unknown, allowed: string[], location: string) => {
    if (isRecord(value)) {
      rejectUnknownGraphProperties(value, allowed, location, "unknown-graph-config-property");
    }
  };
  const inspectConfigRecordArray = (value: unknown, allowed: string[], location: string) => {
    if (!Array.isArray(value)) return;
    value.forEach((item, index) => {
      inspectConfigRecord(item, allowed, `${location}[${index}]`);
    });
  };

  if (!Number.isInteger(schemaVersion) || !SUPPORTED_SCHEMA_VERSIONS.has(schemaVersion)) {
    valid = false;
    diagnostics.push({
      code: "unsupported-schema-version",
      severity: "error",
      message: `schemaVersion ${String(rawVersion)} non supportata; versioni disponibili: 1 e 2`
    });
  }

  if (rawVersion === undefined && Object.keys(suppliedMapping).length > 0) {
    valid = false;
    diagnostics.push({
      code: "schema-version-required",
      severity: "error",
      message: "graphMapping richiede schemaVersion: 2; il mapping non è stato applicato"
    });
  }

  if (schemaVersion !== 2 && asRecord(config.graphAnalysis).provenanceScenarios !== undefined) {
    valid = false;
    diagnostics.push({
      code: "invalid-graph-config-value",
      severity: "error",
      message: "graphAnalysis.provenanceScenarios richiede schemaVersion: 2"
    });
  }

  const mappingEnabled = schemaVersion === 2 && valid;
  if (mappingEnabled && config.graphMapping !== undefined && !isRecord(config.graphMapping)) {
    valid = false;
    diagnostics.push({
      code: "invalid-graph-mapping",
      severity: "error",
      message: "graphMapping deve essere un oggetto JSON"
    });
  }

  const graphMapping = mappingEnabled ? suppliedMapping : {};
  const rawNodeMapping = asRecord(graphMapping.node);
  const rawEdgeMapping = asRecord(graphMapping.edge);

  if (mappingEnabled) {
    rejectUnknownGraphProperties(graphMapping, ["node", "edge"], "graphMapping");
    rejectUnknownGraphProperties(
      rawNodeMapping,
      ["idField", "labelField", "typeField", "roleField", "groupFields", "attributes", "removalCostField"],
      "graphMapping.node"
    );
    rejectUnknownGraphProperties(
      rawEdgeMapping,
      ["idField", "typeField", "sourceField", "targetField", "direction", "identity", "validity", "weightField", "removalCostField", "confidenceField", "confidenceRange", "provenanceField", "attributes"],
      "graphMapping.edge"
    );

    if (rawEdgeMapping.confidenceRange !== undefined) {
      if (!isRecord(rawEdgeMapping.confidenceRange)) {
        valid = false;
        diagnostics.push({
          code: "invalid-edge-confidence-range",
          severity: "error",
          message: "graphMapping.edge.confidenceRange deve contenere min e max numerici"
        });
      } else {
        const rawConfidenceRange = rawEdgeMapping.confidenceRange;
        rejectUnknownGraphProperties(rawConfidenceRange, ["min", "max"], "graphMapping.edge.confidenceRange", "unknown-graph-config-property");
        const min = rawConfidenceRange.min;
        const max = rawConfidenceRange.max;
        if (typeof min !== "number" || !Number.isFinite(min) ||
          typeof max !== "number" || !Number.isFinite(max) ||
          !(max > min) || !Number.isFinite(max - min)) {
          valid = false;
          diagnostics.push({
            code: "invalid-edge-confidence-range",
            severity: "error",
            message: "graphMapping.edge.confidenceRange richiede min e max finiti con min < max"
          });
        }
        if (typeof rawEdgeMapping.confidenceField !== "string" || rawEdgeMapping.confidenceField.trim() === "") {
          valid = false;
          diagnostics.push({
            code: "invalid-edge-confidence-range",
            severity: "error",
            message: "graphMapping.edge.confidenceRange richiede confidenceField"
          });
        }
      }
    }

    if (config.graphIntegrity !== undefined && !isRecord(config.graphIntegrity)) {
      valid = false;
      diagnostics.push({
        code: "invalid-graph-integrity-config",
        severity: "error",
        message: "graphIntegrity deve essere un oggetto JSON"
      });
    }
    if (config.graphAnalysis !== undefined && !isRecord(config.graphAnalysis)) {
      valid = false;
      diagnostics.push({
        code: "invalid-graph-analysis-config",
        severity: "error",
        message: "graphAnalysis deve essere un oggetto JSON"
      });
    }

    const graphIntegrity = asRecord(config.graphIntegrity);
    inspectConfigRecord(graphIntegrity, [
      "requireNodeTypes", "requireEdgeTypes", "allowedNodeTypes", "allowedEdgeTypes", "requiredEdgeIntervals",
      "edgeTypeDomains", "requiredNodeAttributes", "requiredEdgeAttributes", "nodeAttributeDomains",
      "edgeAttributeDomains", "uniqueNodeAttributes", "uniqueEdgeAttributes", "repairSuggestions", "cardinalities"
    ], "graphIntegrity");
    inspectConfigRecordArray(graphIntegrity.edgeTypeDomains, ["edgeType", "sourceNodeTypes", "targetNodeTypes"], "graphIntegrity.edgeTypeDomains");
    inspectConfigRecordArray(graphIntegrity.requiredNodeAttributes, ["nodeType", "attributes"], "graphIntegrity.requiredNodeAttributes");
    inspectConfigRecordArray(graphIntegrity.requiredEdgeAttributes, ["edgeType", "attributes"], "graphIntegrity.requiredEdgeAttributes");
    inspectConfigRecordArray(graphIntegrity.nodeAttributeDomains, ["nodeType", "attribute", "allowedValues"], "graphIntegrity.nodeAttributeDomains");
    inspectConfigRecordArray(graphIntegrity.edgeAttributeDomains, ["edgeType", "attribute", "allowedValues"], "graphIntegrity.edgeAttributeDomains");
    inspectConfigRecordArray(graphIntegrity.uniqueNodeAttributes, ["nodeType", "attribute"], "graphIntegrity.uniqueNodeAttributes");
    inspectConfigRecordArray(graphIntegrity.uniqueEdgeAttributes, ["edgeType", "attribute"], "graphIntegrity.uniqueEdgeAttributes");
    inspectConfigRecordArray(graphIntegrity.cardinalities, ["nodeType", "edgeType", "incidence", "min", "max"], "graphIntegrity.cardinalities");

    const repairSuggestions = asRecord(graphIntegrity.repairSuggestions);
    inspectConfigRecord(repairSuggestions, [
      "removableEdges", "nodeAttributeValues", "edgeAttributeValues", "nodeAttributeReplacements",
      "edgeAttributeReplacements", "nodeTypeReplacements", "edgeTypeReplacements", "edgeIntervalReplacements"
    ], "graphIntegrity.repairSuggestions");
    inspectConfigRecordArray(repairSuggestions.removableEdges, ["edgeId", "cost"], "graphIntegrity.repairSuggestions.removableEdges");
    inspectConfigRecordArray(repairSuggestions.nodeAttributeValues, ["nodeId", "attribute", "value", "cost"], "graphIntegrity.repairSuggestions.nodeAttributeValues");
    inspectConfigRecordArray(repairSuggestions.edgeAttributeValues, ["edgeId", "attribute", "value", "cost"], "graphIntegrity.repairSuggestions.edgeAttributeValues");
    inspectConfigRecordArray(repairSuggestions.nodeAttributeReplacements, ["nodeId", "attribute", "expectedValue", "value", "cost"], "graphIntegrity.repairSuggestions.nodeAttributeReplacements");
    inspectConfigRecordArray(repairSuggestions.edgeAttributeReplacements, ["edgeId", "attribute", "expectedValue", "value", "cost"], "graphIntegrity.repairSuggestions.edgeAttributeReplacements");
    inspectConfigRecordArray(repairSuggestions.nodeTypeReplacements, ["nodeId", "expectedType", "newType", "cost"], "graphIntegrity.repairSuggestions.nodeTypeReplacements");
    inspectConfigRecordArray(repairSuggestions.edgeTypeReplacements, ["edgeId", "expectedType", "newType", "cost"], "graphIntegrity.repairSuggestions.edgeTypeReplacements");
    inspectConfigRecordArray(repairSuggestions.edgeIntervalReplacements, ["edgeId", "expectedFrom", "expectedTo", "from", "to", "cost"], "graphIntegrity.repairSuggestions.edgeIntervalReplacements");

    const graphAnalysis = asRecord(config.graphAnalysis);
    inspectConfigRecord(graphAnalysis, ["motifs", "communities", "counterfactuals", "provenanceScenarios"], "graphAnalysis");
    if (graphAnalysis.provenanceScenarios !== undefined) {
      const provenanceScenarios = asRecord(graphAnalysis.provenanceScenarios);
      if (!isRecord(graphAnalysis.provenanceScenarios)) {
        valid = false;
        diagnostics.push({
          code: "invalid-graph-config-value",
          severity: "error",
          message: "graphAnalysis.provenanceScenarios deve essere un oggetto"
        });
      }
      inspectConfigRecord(provenanceScenarios, ["scenarios", "unattributedEdges", "referenceMatching"], "graphAnalysis.provenanceScenarios");
      if (!Array.isArray(provenanceScenarios.scenarios) || provenanceScenarios.scenarios.length === 0) {
        valid = false;
        diagnostics.push({
          code: "invalid-graph-config-value",
          severity: "error",
          message: "graphAnalysis.provenanceScenarios.scenarios deve contenere almeno uno scenario"
        });
      }
      if (provenanceScenarios.unattributedEdges !== "include" && provenanceScenarios.unattributedEdges !== "exclude") {
        valid = false;
        diagnostics.push({
          code: "invalid-graph-config-value",
          severity: "error",
          message: "graphAnalysis.provenanceScenarios.unattributedEdges deve essere 'include' oppure 'exclude'"
        });
      }
      if (provenanceScenarios.referenceMatching !== undefined &&
        provenanceScenarios.referenceMatching !== "any" && provenanceScenarios.referenceMatching !== "all") {
        valid = false;
        diagnostics.push({
          code: "invalid-graph-config-value",
          severity: "error",
          message: "graphAnalysis.provenanceScenarios.referenceMatching deve essere 'any' oppure 'all'"
        });
      }
      if (typeof rawEdgeMapping.provenanceField !== "string" || rawEdgeMapping.provenanceField.trim() === "") {
        valid = false;
        diagnostics.push({
          code: "invalid-graph-config-value",
          severity: "error",
          message: "graphAnalysis.provenanceScenarios richiede graphMapping.edge.provenanceField"
        });
      }

      const scenarioIds = new Set<string>();
      if (Array.isArray(provenanceScenarios.scenarios)) {
        provenanceScenarios.scenarios.forEach((scenario, index) => {
          const path = `graphAnalysis.provenanceScenarios.scenarios[${index}]`;
          const scenarioRecord = asRecord(scenario);
          inspectConfigRecord(scenarioRecord, ["id", "label", "sources"], path);
          const id = typeof scenarioRecord.id === "string" ? scenarioRecord.id.trim() : "";
          if (!id || scenarioIds.has(id)) {
            valid = false;
            diagnostics.push({
              code: "invalid-graph-config-value",
              severity: "error",
              message: `${path}.id deve essere una stringa non vuota e univoca`
            });
          } else {
            scenarioIds.add(id);
          }
          if (scenarioRecord.label !== undefined &&
            (typeof scenarioRecord.label !== "string" || scenarioRecord.label.trim() === "")) {
            valid = false;
            diagnostics.push({
              code: "invalid-graph-config-value",
              severity: "error",
              message: `${path}.label deve essere una stringa non vuota`
            });
          }
          const references = normalizeProvenanceReferences(scenarioRecord.sources);
          if (!Array.isArray(scenarioRecord.sources) || !references?.length ||
            references.length !== scenarioRecord.sources.length) {
            valid = false;
            diagnostics.push({
              code: "invalid-graph-config-value",
              severity: "error",
              message: `${path}.sources deve contenere riferimenti scalari non vuoti e senza duplicati`
            });
          }
        });
      }
    }
    if (Array.isArray(graphAnalysis.motifs)) {
      graphAnalysis.motifs.forEach((motif, index) => {
        const path = `graphAnalysis.motifs[${index}]`;
        inspectConfigRecord(motif, ["id", "label", "roles", "edges", "absentEdges", "inducedEdgeTypes", "closedWorld", "symmetricRoles", "temporal"], path);
        const motifRecord = asRecord(motif);
        if (motifRecord.closedWorld !== undefined && typeof motifRecord.closedWorld !== "boolean") {
          valid = false;
          diagnostics.push({
            code: "invalid-graph-config-value",
            severity: "error",
            message: `${path}.closedWorld deve essere un booleano`
          });
        }
        if (motifRecord.absentEdges !== undefined && !Array.isArray(motifRecord.absentEdges)) {
          valid = false;
          diagnostics.push({
            code: "invalid-graph-config-value",
            severity: "error",
            message: `${path}.absentEdges deve essere un array`
          });
        }
        if (motifRecord.inducedEdgeTypes !== undefined && !Array.isArray(motifRecord.inducedEdgeTypes)) {
          valid = false;
          diagnostics.push({
            code: "invalid-graph-config-value",
            severity: "error",
            message: `${path}.inducedEdgeTypes deve essere un array di tipi d'arco`
          });
        }
        if (Array.isArray(motifRecord.absentEdges) && motifRecord.absentEdges.length === 0) {
          valid = false;
          diagnostics.push({
            code: "invalid-graph-config-value",
            severity: "error",
            message: `${path}.absentEdges deve contenere almeno una relazione`
          });
        }
        if (Array.isArray(motifRecord.inducedEdgeTypes) && motifRecord.inducedEdgeTypes.length === 0) {
          valid = false;
          diagnostics.push({
            code: "invalid-graph-config-value",
            severity: "error",
            message: `${path}.inducedEdgeTypes deve contenere almeno un tipo d'arco`
          });
        }
        const hasNegativeMotifSemantics =
          (Array.isArray(motifRecord.absentEdges) && motifRecord.absentEdges.length > 0) ||
          (Array.isArray(motifRecord.inducedEdgeTypes) && motifRecord.inducedEdgeTypes.length > 0);
        if (hasNegativeMotifSemantics && motifRecord.closedWorld !== true) {
          valid = false;
          diagnostics.push({
            code: "invalid-graph-config-value",
            severity: "error",
            message: `${path}.absentEdges/inducedEdgeTypes richiede closedWorld: true`
          });
        }
        if (hasNegativeMotifSemantics && motifRecord.temporal !== undefined) {
          valid = false;
          diagnostics.push({
            code: "invalid-graph-config-value",
            severity: "error",
            message: `${path}.absentEdges/inducedEdgeTypes non è attualmente ammesso con motif.temporal`
          });
        }
        if (motifRecord.closedWorld === true && !hasNegativeMotifSemantics) {
          valid = false;
          diagnostics.push({
            code: "invalid-graph-config-value",
            severity: "error",
            message: `${path}.closedWorld: true richiede motif.absentEdges oppure motif.inducedEdgeTypes`
          });
        }
        const roles = asRecord(motifRecord.roles);
        for (const [role, roleConfig] of Object.entries(roles)) {
          inspectConfigRecord(roleConfig, ["nodeTypes"], `${path}.roles.${role}`);
        }
        inspectConfigRecordArray(motifRecord.edges, ["sourceRole", "targetRole", "edgeType"], `${path}.edges`);
        inspectConfigRecordArray(motifRecord.absentEdges, ["sourceRole", "targetRole", "edgeType"], `${path}.absentEdges`);
        if (Array.isArray(motifRecord.inducedEdgeTypes)) {
          motifRecord.inducedEdgeTypes.forEach((edgeType, edgeTypeIndex) => {
            if (typeof edgeType !== "string" || edgeType.trim() === "") {
              valid = false;
              diagnostics.push({
                code: "invalid-graph-config-value",
                severity: "error",
                message: `${path}.inducedEdgeTypes[${edgeTypeIndex}] deve essere una stringa non vuota`
              });
            }
          });
          const normalizedInducedTypes = motifRecord.inducedEdgeTypes
            .filter((edgeType): edgeType is string => typeof edgeType === "string")
            .map((edgeType) => edgeType.trim());
          if (new Set(normalizedInducedTypes).size !== normalizedInducedTypes.length) {
            valid = false;
            diagnostics.push({
              code: "invalid-graph-config-value",
              severity: "error",
              message: `${path}.inducedEdgeTypes non deve contenere tipi duplicati`
            });
          }
        }
        inspectConfigRecord(motifRecord.temporal, ["semantics", "strict"], `${path}.temporal`);
      });
    }
    const communityConfig = asRecord(graphAnalysis.communities);
    inspectConfigRecord(communityConfig, ["useEdgeWeights", "minCount", "maxCount", "mustLink", "cannotLink", "attributeBounds"], "graphAnalysis.communities");
    const communityAttributeBounds = communityConfig.attributeBounds;
    if (Array.isArray(communityAttributeBounds)) {
      communityAttributeBounds.forEach((bound: unknown, index: number) => {
        inspectConfigRecord(
          bound,
          ["attribute", "value", "minPerCommunity", "maxPerCommunity"],
          `graphAnalysis.communities.attributeBounds[${index}]`
        );
      });
    }
    const counterfactuals = asRecord(graphAnalysis.counterfactuals);
    inspectConfigRecord(counterfactuals, ["edgeAdditions"], "graphAnalysis.counterfactuals");
    if (Array.isArray(counterfactuals.edgeAdditions)) {
      counterfactuals.edgeAdditions.forEach((candidate, index) => {
        const path = `graphAnalysis.counterfactuals.edgeAdditions[${index}]`;
        inspectConfigRecord(candidate, ["id", "sourceNodeId", "targetNodeId", "edgeType", "cost", "validity"], path);
        inspectConfigRecord(asRecord(candidate).validity, ["from", "to"], `${path}.validity`);
      });
    }
  }

  if (mappingEnabled && graphMapping.node !== undefined && !isRecord(graphMapping.node)) {
    valid = false;
    diagnostics.push({
      code: "invalid-node-mapping",
      severity: "error",
      message: "graphMapping.node deve essere un oggetto JSON"
    });
  }
  if (mappingEnabled && graphMapping.edge !== undefined && !isRecord(graphMapping.edge)) {
    valid = false;
    diagnostics.push({
      code: "invalid-edge-mapping",
      severity: "error",
      message: "graphMapping.edge deve essere un oggetto JSON"
    });
  }

  const readPath = (
    record: Record<string, unknown>,
    key: string,
    location: string
  ): string | undefined => {
    const value = record[key];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.trim() === "") {
      valid = false;
      diagnostics.push({
        code: "invalid-field-path",
        severity: "error",
        message: `${location} deve essere un percorso JSON non vuoto`
      });
      return undefined;
    }
    return value.trim();
  };

  const readPathList = (
    record: Record<string, unknown>,
    key: string,
    location: string
  ): string[] | undefined => {
    const value = record[key];
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      valid = false;
      diagnostics.push({
        code: "invalid-field-path-list",
        severity: "error",
        message: `${location} deve essere un array di percorsi JSON`
      });
      return undefined;
    }
    return value.flatMap((entry, index) => {
      if (typeof entry !== "string" || entry.trim() === "") {
        valid = false;
        diagnostics.push({
          code: "invalid-field-path",
          severity: "error",
          message: `${location}[${index}] deve essere un percorso JSON non vuoto`
        });
        return [];
      }
      return [entry.trim()];
    });
  };

  const nodeMapping: GraphFieldMapping = {
    idField: readPath(rawNodeMapping, "idField", "graphMapping.node.idField"),
    labelField: readPath(rawNodeMapping, "labelField", "graphMapping.node.labelField"),
    typeField: readPath(rawNodeMapping, "typeField", "graphMapping.node.typeField"),
    roleField: readPath(rawNodeMapping, "roleField", "graphMapping.node.roleField"),
    groupFields: readPathList(rawNodeMapping, "groupFields", "graphMapping.node.groupFields")
  };
  nodeMapping.removalCostField = readPath(rawNodeMapping, "removalCostField", "graphMapping.node.removalCostField");

  if (rawNodeMapping.attributes !== undefined) {
    if (!isRecord(rawNodeMapping.attributes)) {
      valid = false;
      diagnostics.push({
        code: "invalid-node-attributes-mapping",
        severity: "error",
        message: "graphMapping.node.attributes deve associare nomi a percorsi JSON"
      });
    } else {
      nodeMapping.attributes = {};
      for (const [name, value] of Object.entries(rawNodeMapping.attributes)) {
        if (typeof value !== "string" || value.trim() === "") {
          valid = false;
          diagnostics.push({
            code: "invalid-field-path",
            severity: "error",
            message: `graphMapping.node.attributes.${name} deve essere un percorso JSON non vuoto`
          });
          continue;
        }
        nodeMapping.attributes[name] = value.trim();
      }
    }
  }

  const edgeMapping: GraphFieldMapping = {
    idField: readPath(rawEdgeMapping, "idField", "graphMapping.edge.idField"),
    typeField: readPath(rawEdgeMapping, "typeField", "graphMapping.edge.typeField"),
    sourceField: readPath(rawEdgeMapping, "sourceField", "graphMapping.edge.sourceField"),
    targetField: readPath(rawEdgeMapping, "targetField", "graphMapping.edge.targetField"),
    weightField: readPath(rawEdgeMapping, "weightField", "graphMapping.edge.weightField"),
    removalCostField: readPath(rawEdgeMapping, "removalCostField", "graphMapping.edge.removalCostField"),
    confidenceField: readPath(rawEdgeMapping, "confidenceField", "graphMapping.edge.confidenceField"),
    confidenceRange: isRecord(rawEdgeMapping.confidenceRange) &&
      typeof rawEdgeMapping.confidenceRange.min === "number" &&
      typeof rawEdgeMapping.confidenceRange.max === "number"
      ? { min: rawEdgeMapping.confidenceRange.min, max: rawEdgeMapping.confidenceRange.max }
      : undefined,
    provenanceField: readPath(rawEdgeMapping, "provenanceField", "graphMapping.edge.provenanceField")
  };

  if (rawEdgeMapping.attributes !== undefined) {
    if (!isRecord(rawEdgeMapping.attributes)) {
      valid = false;
      diagnostics.push({
        code: "invalid-edge-attributes-mapping",
        severity: "error",
        message: "graphMapping.edge.attributes deve associare nomi a percorsi JSON"
      });
    } else {
      edgeMapping.attributes = {};
      for (const [name, value] of Object.entries(rawEdgeMapping.attributes)) {
        if (typeof value !== "string" || value.trim() === "") {
          valid = false;
          diagnostics.push({
            code: "invalid-field-path",
            severity: "error",
            message: `graphMapping.edge.attributes.${name} deve essere un percorso JSON non vuoto`
          });
          continue;
        }
        edgeMapping.attributes[name] = value.trim();
      }
    }
  }

  if (Boolean(edgeMapping.sourceField) !== Boolean(edgeMapping.targetField)) {
    valid = false;
    diagnostics.push({
      code: "incomplete-edge-endpoint-mapping",
      severity: "error",
      message: "sourceField e targetField devono essere configurati insieme"
    });
  }

  if (rawEdgeMapping.validity !== undefined) {
    if (!isRecord(rawEdgeMapping.validity)) {
      valid = false;
      diagnostics.push({
        code: "invalid-edge-validity-mapping",
        severity: "error",
        message: "graphMapping.edge.validity deve contenere fromField e toField"
      });
    } else {
      if (mappingEnabled) {
        rejectUnknownGraphProperties(
          asRecord(rawEdgeMapping.validity),
          ["fromField", "toField"],
          "graphMapping.edge.validity"
        );
      }
      edgeMapping.validity = {
        fromField: readPath(rawEdgeMapping.validity, "fromField", "graphMapping.edge.validity.fromField"),
        toField: readPath(rawEdgeMapping.validity, "toField", "graphMapping.edge.validity.toField")
      };
      if (!edgeMapping.validity.fromField || !edgeMapping.validity.toField) {
        valid = false;
        diagnostics.push({
          code: "incomplete-edge-validity-mapping",
          severity: "error",
          message: "graphMapping.edge.validity richiede sia fromField sia toField"
        });
      }
    }
  }

  if (rawEdgeMapping.direction !== undefined) edgeMapping.direction = rawEdgeMapping.direction as GraphDirection;
  if (rawEdgeMapping.identity !== undefined) edgeMapping.identity = rawEdgeMapping.identity as EdgeIdentity;
  const directionValue = mappingEnabled ? (edgeMapping.direction ?? "undirected") : "undirected";
  const identityValue = mappingEnabled ? (edgeMapping.identity ?? "simple") : "simple";

  let direction: GraphDirection = "undirected";
  if (directionValue === "directed" || directionValue === "undirected") direction = directionValue;
  else {
    valid = false;
    diagnostics.push({
      code: "invalid-edge-direction",
      severity: "error",
      message: "graphMapping.edge.direction deve essere 'directed' oppure 'undirected'"
    });
  }

  let identity: EdgeIdentity = "simple";
  if (identityValue === "simple" || identityValue === "multigraph") identity = identityValue;
  else {
    valid = false;
    diagnostics.push({
      code: "invalid-edge-identity",
      severity: "error",
      message: "graphMapping.edge.identity deve essere 'simple' oppure 'multigraph'"
    });
  }

  if (!Array.isArray(graph.nodes)) {
    valid = false;
    diagnostics.push({
      code: "invalid-node-collection",
      severity: "error",
      message: "il grafo deve contenere una collezione nodes di tipo array"
    });
  }
  if (graph.edges !== undefined && graph.edges !== null && !Array.isArray(graph.edges)) {
    valid = false;
    diagnostics.push({
      code: "invalid-edge-collection",
      severity: "error",
      message: "edges deve essere un array quando è presente"
    });
  }
  if (graph.links !== undefined && graph.links !== null && !Array.isArray(graph.links)) {
    valid = false;
    diagnostics.push({
      code: "invalid-link-collection",
      severity: "error",
      message: "links deve essere un array quando è presente"
    });
  }

  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const rawEdges = Array.isArray(graph.edges)
    ? graph.edges
    : Array.isArray(graph.links)
      ? graph.links
      : [];
  const mappedEdgeIds = new Set<string>();
  if (mappingEnabled && edgeMapping.idField) {
    for (const rawEdge of rawEdges) {
      const mappedIds = graphPathValues(asRecord(rawEdge), edgeMapping.idField);
      if (mappedIds.length === 1 && isGraphIdentifierScalar(mappedIds[0]) && String(mappedIds[0]).trim() !== "") {
        mappedEdgeIds.add(String(mappedIds[0]).trim());
      }
    }
  }
  const nodes: NormalizedGraphNode[] = [];
  const nodeIdCounts = new Map<string, number>();

  rawNodes.forEach((rawNode, index) => {
    const node = asRecord(rawNode);
    const labelValue = firstMappedValue(node, mappingEnabled ? nodeMapping.labelField : undefined, node.label);
    const label = normalizeGraphLabel(labelValue);
    const legacyIdValue = node.id === 0 ? 0 : node.id || label;
    const hasMappedNodeId = mappingEnabled && Boolean(nodeMapping.idField);
    const mappedNodeIds = hasMappedNodeId ? graphPathValues(node, nodeMapping.idField!) : [];
    const idValue = hasMappedNodeId ? mappedNodeIds[0] : legacyIdValue;
    let id = "";

    if (hasMappedNodeId && mappedNodeIds.length > 1) {
      valid = false;
      diagnostics.push({
        code: "ambiguous-node-id",
        severity: "error",
        message: `nodo ${index + 1}: graphMapping.node.idField deve risolvere un solo identificatore, ne ha trovati ${mappedNodeIds.length}`,
        recordIndex: index
      });
      id = `invalid_node_${index + 1}`;
    } else if (hasMappedNodeId && mappedNodeIds.length === 1 && !isGraphIdentifierScalar(idValue)) {
      valid = false;
      diagnostics.push({
        code: "invalid-node-id-value",
        severity: "error",
        message: `nodo ${index + 1}: graphMapping.node.idField deve risolvere un identificatore scalare stringa, numero finito o booleano`,
        recordIndex: index
      });
      id = `invalid_node_${index + 1}`;
    } else {
      id = normalizeGraphId(idValue);
    }

    if (!id) {
      id = `invalid_node_${index + 1}`;
      diagnostics.push({
        code: "missing-node-id",
        severity: "error",
        message: `nodo ${index + 1}: ID mancante o non valido dopo l'applicazione del mapping`,
        recordIndex: index
      });
    }

    nodeIdCounts.set(id, (nodeIdCounts.get(id) ?? 0) + 1);

    const mappedType = mappingEnabled
      ? firstMappedValue(node, nodeMapping.typeField, undefined)
      : node.type;
    const type = mappedType === undefined || mappedType === null || String(mappedType).trim() === ""
      ? undefined
      : String(mappedType).trim();
    const mappedRoles = mappingEnabled && nodeMapping.roleField
      ? graphPathValues(node, nodeMapping.roleField).map((value) => String(value).trim()).filter(Boolean)
      : [];
    const mappedGroups = mappingEnabled
      ? mappedStrings(node, nodeMapping.groupFields)
      : [];
    const mappedAttributes: Record<string, unknown> = {};

    const mappedRemovalCost = mappingEnabled
      ? firstMappedValue(node, nodeMapping.removalCostField, undefined)
      : undefined;

    if (mappingEnabled && nodeMapping.attributes) {
      for (const [name, fieldPath] of Object.entries(nodeMapping.attributes)) {
        const value = firstMappedValue(node, fieldPath, undefined);
        if (value !== undefined) mappedAttributes[name] = value;
      }
    }

    const analysis: Record<string, unknown> = {};
    if (mappingEnabled && nodeMapping.typeField) analysis.type = type;
    if (mappingEnabled && nodeMapping.roleField) analysis.roles = [...new Set(mappedRoles)];
    if (mappingEnabled && nodeMapping.groupFields?.length) analysis.groups = mappedGroups;
    if (mappedRemovalCost !== undefined) {
      analysis.removalCost = positiveSafeInteger(mappedRemovalCost) ?? mappedRemovalCost;
    }
    if (Object.keys(mappedAttributes).length > 0) analysis.attributes = mappedAttributes;

    nodes.push({
      ...node,
      label,
      id,
      ...(mappingEnabled ? {
        sourceId: hasMappedNodeId
          ? mappedNodeIds.length === 1 && isGraphIdentifierScalar(idValue) ? String(idValue) : id
          : idValue === undefined || idValue === null ? id : String(idValue)
      } : {}),
      ...(type ? { type } : mappingEnabled && nodeMapping.typeField ? { type: undefined } : {}),
      ...(Object.keys(analysis).length > 0
        ? { analysis: { ...asRecord(node.analysis), ...analysis } }
        : {})
    });
  });

  for (const [id, count] of nodeIdCounts) {
    if (count > 1) {
      valid = false;
      diagnostics.push({
        code: "duplicate-node-id",
        severity: "error",
        message: `ID nodo duplicato dopo la normalizzazione: '${id}' (${count} nodi)`
      });
    }
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const links: NormalizedGraphLink[] = [];
  const seenSimpleEdges = new Map<string, { link: NormalizedGraphLink; hasMappedIdentity: boolean }>();
  const seenSimpleIds = new Map<string, {
    source: string;
    target: string;
    metadataSignature: string;
  }>();
  const seenMultigraphIds = new Map<string, {
    source: string;
    target: string;
    analysis: Record<string, unknown>;
  }>();

  rawEdges.forEach((rawEdge, index) => {
    const edge = asRecord(rawEdge);
    const mappedSources = mappingEnabled && edgeMapping.sourceField
      ? graphPathValues(edge, edgeMapping.sourceField)
      : [];
    const mappedTargets = mappingEnabled && edgeMapping.targetField
      ? graphPathValues(edge, edgeMapping.targetField)
      : [];
    const sourceValue = mappingEnabled && edgeMapping.sourceField ? mappedSources[0] : edge.source;
    const targetValue = mappingEnabled && edgeMapping.targetField ? mappedTargets[0] : edge.target;
    const sourceEndpointId = getGraphEndpointId(sourceValue);
    const targetEndpointId = getGraphEndpointId(targetValue);
    const sourceEndpointAmbiguous = Boolean(mappingEnabled && edgeMapping.sourceField) && mappedSources.length > 1;
    const targetEndpointAmbiguous = Boolean(mappingEnabled && edgeMapping.targetField) && mappedTargets.length > 1;
    const sourceEndpointInvalid = sourceEndpointAmbiguous ||
      (sourceEndpointId !== undefined && sourceEndpointId !== null && !isGraphIdentifierScalar(sourceEndpointId));
    const targetEndpointInvalid = targetEndpointAmbiguous ||
      (targetEndpointId !== undefined && targetEndpointId !== null && !isGraphIdentifierScalar(targetEndpointId));
    const source = sourceEndpointInvalid ? "" : normalizeGraphId(sourceEndpointId);
    const target = targetEndpointInvalid ? "" : normalizeGraphId(targetEndpointId);

    if (sourceEndpointAmbiguous) {
      valid = false;
      diagnostics.push({
        code: "ambiguous-edge-endpoint",
        severity: "error",
        message: `arco ${index + 1}: graphMapping.edge.sourceField deve risolvere un solo estremo, ne ha trovati ${mappedSources.length}`,
        recordIndex: index
      });
    } else if (sourceEndpointId !== undefined && sourceEndpointId !== null && !isGraphIdentifierScalar(sourceEndpointId)) {
      valid = false;
      diagnostics.push({
        code: "invalid-edge-endpoint-id",
        severity: "error",
        message: `arco ${index + 1}: l'ID dell'estremo sorgente deve essere scalare`,
        recordIndex: index
      });
    }
    if (targetEndpointAmbiguous) {
      valid = false;
      diagnostics.push({
        code: "ambiguous-edge-endpoint",
        severity: "error",
        message: `arco ${index + 1}: graphMapping.edge.targetField deve risolvere un solo estremo, ne ha trovati ${mappedTargets.length}`,
        recordIndex: index
      });
    } else if (targetEndpointId !== undefined && targetEndpointId !== null && !isGraphIdentifierScalar(targetEndpointId)) {
      valid = false;
      diagnostics.push({
        code: "invalid-edge-endpoint-id",
        severity: "error",
        message: `arco ${index + 1}: l'ID dell'estremo destinazione deve essere scalare`,
        recordIndex: index
      });
    }

    if ((!sourceEndpointInvalid && !nodeIds.has(source)) || (!targetEndpointInvalid && !nodeIds.has(target))) {
      diagnostics.push({
        code: "unknown-edge-endpoint",
        severity: "error",
        message: `arco ${index + 1}: uno o entrambi gli estremi non corrispondono a un ID nodo normalizzato`,
        recordIndex: index
      });
    }

    const hasMappedEdgeId = Boolean(mappingEnabled && edgeMapping.idField);
    const mappedEdgeIdValues = hasMappedEdgeId ? graphPathValues(edge, edgeMapping.idField!) : [];
    const mappedId = mappedEdgeIdValues[0];
    const mappedIdAmbiguous = hasMappedEdgeId && mappedEdgeIdValues.length > 1;
    const mappedIdInvalid = hasMappedEdgeId && mappedEdgeIdValues.length === 1 && !isGraphIdentifierScalar(mappedId);
    if (mappedIdAmbiguous) {
      valid = false;
      diagnostics.push({
        code: "ambiguous-edge-id",
        severity: "error",
        message: `arco ${index + 1}: graphMapping.edge.idField deve risolvere un solo identificatore, ne ha trovati ${mappedEdgeIdValues.length}`,
        recordIndex: index
      });
    } else if (mappedIdInvalid) {
      valid = false;
      diagnostics.push({
        code: "invalid-edge-id-value",
        severity: "error",
        message: `arco ${index + 1}: graphMapping.edge.idField deve risolvere un identificatore scalare stringa, numero finito o booleano`,
        recordIndex: index
      });
    }
    const mappedIdPresent = mappedEdgeIdValues.length === 1 && isGraphIdentifierScalar(mappedId) && String(mappedId).trim() !== "";
    const rawType = edge.type;
    const mappedType = mappingEnabled
      ? firstMappedValue(edge, edgeMapping.typeField, undefined)
      : undefined;
    const semanticType = mappedType === undefined || mappedType === null || String(mappedType).trim() === ""
      ? undefined
      : String(mappedType).trim();
    let generatedId = `edge_${index + 1}`;
    if (!mappedIdPresent && mappingEnabled && mappedEdgeIds.has(generatedId)) {
      const baseId = generatedId;
      let suffix = 1;
      while (mappedEdgeIds.has(`${baseId}_generated_${suffix}`)) suffix += 1;
      generatedId = `${baseId}_generated_${suffix}`;
      diagnostics.push({
        code: "generated-edge-id-collision",
        severity: "warning",
        message: `arco ${index + 1}: l'ID locale '${baseId}' collide con un ID mappato; assegnato '${generatedId}'`,
        recordIndex: index
      });
    }
    const sourceEdgeId = mappedIdPresent ? String(mappedId) : generatedId;
    const sourceIdGenerated = !mappedIdPresent;
    const normalizedId = sourceEdgeId.trim() || generatedId;
    const analysis: Record<string, unknown> = {};

    if (mappingEnabled) {
      analysis.id = normalizedId;
      analysis.direction = direction;
      if (edgeMapping.typeField) analysis.type = semanticType;

      if (edgeMapping.validity?.fromField || edgeMapping.validity?.toField) {
        const from = firstMappedValue(edge, edgeMapping.validity.fromField, undefined);
        const to = firstMappedValue(edge, edgeMapping.validity.toField, undefined);
        analysis.validity = {
          ...(from !== undefined ? { from } : {}),
          ...(to !== undefined ? { to } : {})
        };
      }

      for (const [mappingField, outputField] of [
        [edgeMapping.weightField, "weight"],
        [edgeMapping.removalCostField, "removalCost"],
        [edgeMapping.confidenceField, "confidence"]
      ] as Array<[string | undefined, string]>) {
        const value = firstMappedValue(edge, mappingField, undefined);
        if (value !== undefined) {
          analysis[outputField] = outputField === "removalCost"
            ? positiveSafeInteger(value) ?? value
            : value;
        }
      }

      const provenanceValues = edgeMapping.provenanceField
        ? graphPathValues(edge, edgeMapping.provenanceField)
        : [];
      const isEmptyScalarProvenance = provenanceValues.length === 1 &&
        typeof provenanceValues[0] === "string" && provenanceValues[0].trim() === "";
      if (provenanceValues.length > 0 && !isEmptyScalarProvenance) {
        const provenanceReferences = normalizeProvenanceReferences(provenanceValues);
        if (!provenanceReferences?.length) {
          valid = false;
          diagnostics.push({
            code: "invalid-edge-provenance",
            severity: "error",
            message: "arco " + (index + 1) + ": la provenienza deve essere un riferimento scalare non vuoto oppure una lista di riferimenti stringa/numerici finiti",
            recordIndex: index
          });
        } else if (provenanceReferences.length === 1) {
          analysis.provenance = provenanceValues.length === 1
            ? provenanceValues[0]
            : provenanceReferences[0];
        } else {
          analysis.provenance = provenanceReferences;
        }
      }

      if (edgeMapping.attributes) {
        const mappedAttributes: Record<string, unknown> = {};
        for (const [name, fieldPath] of Object.entries(edgeMapping.attributes)) {
          const value = firstMappedValue(edge, fieldPath, undefined);
          if (value !== undefined) mappedAttributes[name] = value;
        }
        if (Object.keys(mappedAttributes).length > 0) analysis.attributes = mappedAttributes;
      }
    }

    const link: NormalizedGraphLink = {
      source,
      target,
      ...(mappingEnabled ? { sourceId: sourceEdgeId } : {}),
      ...(mappingEnabled ? { sourceIdGenerated } : {}),
      ...(rawType !== undefined ? { type: rawType } : {}),
      ...(mappingEnabled ? { analysis } : {})
    };

    if (identity === "multigraph") {
      const hasMappedIdentity = mappedIdPresent;
      if (hasMappedIdentity) {
        const existing = seenMultigraphIds.get(normalizedId);
        if (existing) {
          const sameEndpoints = direction === "undirected"
            ? unorderedPairKey(existing.source, existing.target) === unorderedPairKey(source, target)
            : existing.source === source && existing.target === target;
          const sameMetadata = edgeMetadataSignature(existing.analysis) === edgeMetadataSignature(analysis);
          if (!sameEndpoints || !sameMetadata) {
            valid = false;
            diagnostics.push({
              code: "conflicting-edge-id",
              severity: "error",
              message: `ID arco '${normalizedId}' è riutilizzato per record con estremi o metadati diversi`,
              recordIndex: index
            });
          }
          return;
        }
        seenMultigraphIds.set(normalizedId, { source, target, analysis });
      } else {
        if (!mappedIdAmbiguous && !mappedIdInvalid) {
          diagnostics.push({
            code: "generated-edge-id",
            severity: "warning",
            message: `arco ${index + 1}: nessun ID mappato; assegnato l'ID locale '${generatedId}'`,
            recordIndex: index
          });
        }
      }
      links.push(link);
      return;
    }

    const hasMappedIdentity = mappingEnabled && Boolean(edgeMapping.idField) && mappedIdPresent;
    const metadataSignature = edgeMetadataSignature(analysis);

    if (hasMappedIdentity) {
      const existingId = seenSimpleIds.get(normalizedId);
      if (existingId) {
        const sameEndpoints = direction === "undirected"
          ? unorderedPairKey(existingId.source, existingId.target) === unorderedPairKey(source, target)
          : existingId.source === source && existingId.target === target;
        if (!sameEndpoints || existingId.metadataSignature !== metadataSignature) {
          valid = false;
          diagnostics.push({
            code: "conflicting-edge-id",
            severity: "error",
            message: `ID arco '${normalizedId}' è riutilizzato per record con estremi o metadati diversi`,
            recordIndex: index
          });
        }
        return;
      }
      seenSimpleIds.set(normalizedId, { source, target, metadataSignature });
    }

    const key = direction === "directed"
      ? orderedPairKey(source, target)
      : unorderedPairKey(source, target);
    const existing = seenSimpleEdges.get(key);

    if (existing) {
      const existingType = asRecord(existing.link.analysis).type;
      if (mappingEnabled && edgeMapping.typeField && existingType !== semanticType) {
        valid = false;
        diagnostics.push({
          code: "conflicting-simple-edge-types",
          severity: "error",
          message: `più tipi d'arco (${String(existingType)} e ${String(semanticType)}) sulla stessa coppia; configurare identity: 'multigraph' per conservarli`,
          recordIndex: index
        });
      } else if (mappingEnabled && edgeMetadataSignature(asRecord(existing.link.analysis)) !== metadataSignature) {
        valid = false;
        diagnostics.push({
          code: "conflicting-simple-edge-metadata",
          severity: "error",
          message: `metadati diversi sugli archi con la stessa coppia di estremi; configurare identity: 'multigraph' per conservarli`,
          recordIndex: index
        });
      } else if (
        mappingEnabled &&
        edgeMapping.idField &&
        hasMappedIdentity &&
        existing.hasMappedIdentity &&
        asRecord(existing.link.analysis).id !== normalizedId
      ) {
        diagnostics.push({
          code: "collapsed-distinct-edge-identities",
          severity: "warning",
          message: `l'arco '${normalizedId}' condivide gli estremi con un altro ID; identity: 'simple' lo ha collassato, usare 'multigraph' se i record sono distinti`,
          recordIndex: index
        });
      }
      return;
    }

    seenSimpleEdges.set(key, { link, hasMappedIdentity });
    links.push(link);
  });

  const capabilities = makeCapabilities(
    mappingEnabled ? 2 : 1,
    nodeMapping,
    edgeMapping,
    nodes,
    rawEdges,
    links,
    direction,
    identity,
    asRecord(asRecord(config.graphAnalysis).communities).useEdgeWeights === true
  );

  for (const [name, status] of Object.entries(capabilities)) {
    if (!status.configured || status.available || !status.reason) continue;
    diagnostics.push({
      code: `incomplete-capability-${name}`,
      severity: "warning",
      message: status.reason
    });
  }

  return {
    nodes,
    links,
    schemaVersion: mappingEnabled ? 2 : 1,
    direction,
    identity,
    capabilities,
    diagnostics,
    valid: valid && !diagnostics.some((diagnostic) => diagnostic.severity === "error")
  };
}
