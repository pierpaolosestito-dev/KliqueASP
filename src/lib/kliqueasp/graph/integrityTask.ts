import {
  decodeAspStringPayload,
  escapeAspString,
  serializeAspRepairValue,
  type AspTemporalEncoding,
  type GraphIntegrityConstraints,
  type GraphDirection
} from "./graphModel.ts";
import { parseGraphTemporalValue, parseGraphTimeValue } from "./temporalValue.ts";

export interface IntegrityViolation {
  kind: string;
  subjectId?: string;
  nodeIds: string[];
  edgeIds?: string[];
  edgeType?: string;
  attribute?: string;
  value?: string;
  expected?: number;
  expectedDescription?: string;
  actual?: number;
}

export interface NodeAttributeRepair {
  nodeId: string;
  attribute: string;
  value: string | number | boolean;
  cost: number;
}

export interface EdgeAttributeRepair {
  edgeId: string;
  attribute: string;
  value: string | number | boolean;
  cost: number;
}

export interface NodeAttributeReplacement {
  nodeId: string;
  attribute: string;
  expectedValue: string | number | boolean;
  value: string | number | boolean;
  cost: number;
}

export interface EdgeAttributeReplacement {
  edgeId: string;
  attribute: string;
  expectedValue: string | number | boolean;
  value: string | number | boolean;
  cost: number;
}

export interface NodeTypeReplacement {
  nodeId: string;
  expectedType: string;
  newType: string;
  cost: number;
}

export interface EdgeTypeReplacement {
  edgeId: string;
  expectedType: string;
  newType: string;
  cost: number;
}

export interface EdgeIntervalReplacement {
  edgeId: string;
  expectedFrom?: string | number | boolean | null;
  expectedTo?: string | number | boolean | null;
  from: string | number;
  to: string | number;
  cost: number;
}

export interface IntegrityRepairProposal {
  edgeIds: string[];
  edgeCosts?: Record<string, number>;
  nodeAttributes?: NodeAttributeRepair[];
  edgeAttributes?: EdgeAttributeRepair[];
  nodeAttributeReplacements?: NodeAttributeReplacement[];
  edgeAttributeReplacements?: EdgeAttributeReplacement[];
  nodeTypeReplacements?: NodeTypeReplacement[];
  edgeTypeReplacements?: EdgeTypeReplacement[];
  edgeIntervalReplacements?: EdgeIntervalReplacement[];
  cost: number;
}

function parseRepairIntervalEndpoint(value: unknown): { value: number; domain: "integer" | "date" } | null {
  return parseGraphTemporalValue(value);
}

/** @deprecated Kept as an alias for callers using the original edge-only repair result. */
export type EdgeRemovalRepair = IntegrityRepairProposal;

function requireName(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} deve essere una stringa non vuota`);
  }
  return value.trim();
}

function requireNames(values: unknown, path: string): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${path} deve essere un array non vuoto`);
  }
  return values.map((value, index) => requireName(value, `${path}[${index}]`));
}

function addUnique(lines: string[], seen: Set<string>, line: string): void {
  if (seen.has(line)) return;
  seen.add(line);
  lines.push(line);
}

/** Rejects configured integrity attributes that have no explicit source-field mapping. */
export function validateGraphIntegrityAttributeMappings(
  constraintsInput: GraphIntegrityConstraints | unknown,
  mappedNodeAttributes: ReadonlySet<string>,
  mappedEdgeAttributes: ReadonlySet<string>
): void {
  if (constraintsInput === null || typeof constraintsInput !== "object" || Array.isArray(constraintsInput)) {
    throw new TypeError("graphIntegrity deve essere un oggetto JSON");
  }
  const constraints = constraintsInput as GraphIntegrityConstraints;
  const validateRules = (
    rules: unknown,
    name: string,
    mappedAttributes: ReadonlySet<string>,
    getAttributes: (rule: any, path: string) => string[]
  ) => {
    if (rules === undefined) return;
    if (!Array.isArray(rules)) throw new TypeError(`${name} deve essere un array`);
    for (const [index, rule] of rules.entries()) {
      const path = `${name}[${index}]`;
      for (const attribute of getAttributes(rule, path)) {
        if (!mappedAttributes.has(attribute)) {
          throw new TypeError(`${path}.attribute '${attribute}' non è mappato nel rispettivo graphMapping.*.attributes`);
        }
      }
    }
  };
  const singleAttribute = (field: string) => (rule: any, path: string) => [requireName(rule?.[field], `${path}.${field}`)];
  validateRules(constraints.requiredNodeAttributes, "requiredNodeAttributes", mappedNodeAttributes, (rule, path) =>
    requireNames(rule?.attributes, `${path}.attributes`));
  validateRules(constraints.uniqueNodeAttributes, "uniqueNodeAttributes", mappedNodeAttributes, singleAttribute("attribute"));
  validateRules(constraints.nodeAttributeDomains, "nodeAttributeDomains", mappedNodeAttributes, singleAttribute("attribute"));
  validateRules(constraints.requiredEdgeAttributes, "requiredEdgeAttributes", mappedEdgeAttributes, (rule, path) =>
    requireNames(rule?.attributes, `${path}.attributes`));
  validateRules(constraints.uniqueEdgeAttributes, "uniqueEdgeAttributes", mappedEdgeAttributes, singleAttribute("attribute"));
  validateRules(constraints.edgeAttributeDomains, "edgeAttributeDomains", mappedEdgeAttributes, singleAttribute("attribute"));
}

/** Compiles explicitly declared graph-integrity rules into ASP. */
export function buildGraphIntegrityProgram(
  constraintsInput: GraphIntegrityConstraints | unknown,
  direction: GraphDirection = "undirected",
  options: {
    includeNodeAttributeCandidates?: boolean;
    includeEdgeAttributeCandidates?: boolean;
    includeNodeAttributeReplacements?: boolean;
    includeEdgeAttributeReplacements?: boolean;
    includeNodeTypeReplacements?: boolean;
    includeEdgeTypeReplacements?: boolean;
    includeEdgeIntervalReplacements?: boolean;
  } = {}
): string {
  if (constraintsInput === null || typeof constraintsInput !== "object" || Array.isArray(constraintsInput)) {
    throw new TypeError("graphIntegrity deve essere un oggetto JSON");
  }
  const constraints = constraintsInput as GraphIntegrityConstraints;
  const facts: string[] = [];
  const seenFacts = new Set<string>();
  const allowedNodeTypes = constraints.allowedNodeTypes === undefined
    ? []
    : requireNames(constraints.allowedNodeTypes, "allowedNodeTypes");
  const allowedEdgeTypes = constraints.allowedEdgeTypes === undefined
    ? []
    : requireNames(constraints.allowedEdgeTypes, "allowedEdgeTypes");
  const edgeTypeDomains = constraints.edgeTypeDomains ?? [];
  const requiredNodeAttributes = constraints.requiredNodeAttributes ?? [];
  const requiredEdgeAttributes = constraints.requiredEdgeAttributes ?? [];
  const nodeAttributeDomains = constraints.nodeAttributeDomains ?? [];
  const edgeAttributeDomains = constraints.edgeAttributeDomains ?? [];
  const requiredEdgeIntervals = constraints.requiredEdgeIntervals ?? [];
  const uniqueNodeAttributes = constraints.uniqueNodeAttributes ?? [];
  const uniqueEdgeAttributes = constraints.uniqueEdgeAttributes ?? [];
  const cardinalities = constraints.cardinalities ?? [];

  for (const [name, value] of [
    ["requireNodeTypes", constraints.requireNodeTypes],
    ["requireEdgeTypes", constraints.requireEdgeTypes]
  ] as Array<[string, unknown]>) {
    if (value !== undefined && typeof value !== "boolean") {
      throw new TypeError(`${name} deve essere booleano`);
    }
  }

  for (const [name, value] of [
    ["allowedNodeTypes", allowedNodeTypes],
    ["allowedEdgeTypes", allowedEdgeTypes],
    ["edgeTypeDomains", edgeTypeDomains],
    ["requiredNodeAttributes", requiredNodeAttributes],
    ["requiredEdgeAttributes", requiredEdgeAttributes],
    ["nodeAttributeDomains", nodeAttributeDomains],
    ["edgeAttributeDomains", edgeAttributeDomains],
    ["requiredEdgeIntervals", requiredEdgeIntervals],
    ["uniqueNodeAttributes", uniqueNodeAttributes],
    ["uniqueEdgeAttributes", uniqueEdgeAttributes],
    ["cardinalities", cardinalities]
  ] as Array<[string, unknown]>) {
    if (!Array.isArray(value)) throw new TypeError(`${name} deve essere un array`);
  }

  const needsNodeTypes = constraints.requireNodeTypes === true ||
    allowedNodeTypes.length > 0 || edgeTypeDomains.length > 0 || requiredNodeAttributes.length > 0 ||
    nodeAttributeDomains.length > 0 || uniqueNodeAttributes.length > 0 || cardinalities.length > 0;
  const needsEdgeTypes = constraints.requireEdgeTypes === true ||
    allowedEdgeTypes.length > 0 || edgeTypeDomains.length > 0 || requiredEdgeAttributes.length > 0 ||
    edgeAttributeDomains.length > 0 || requiredEdgeIntervals.length > 0 || uniqueEdgeAttributes.length > 0 || cardinalities.length > 0;
  if (
    !constraints.requireNodeTypes && !constraints.requireEdgeTypes &&
    allowedNodeTypes.length === 0 && allowedEdgeTypes.length === 0 &&
    edgeTypeDomains.length === 0 && requiredNodeAttributes.length === 0 &&
    requiredEdgeAttributes.length === 0 && nodeAttributeDomains.length === 0 && edgeAttributeDomains.length === 0 &&
    requiredEdgeIntervals.length === 0 &&
    uniqueNodeAttributes.length === 0 && uniqueEdgeAttributes.length === 0 && cardinalities.length === 0
  ) {
    throw new TypeError("graphIntegrity deve dichiarare almeno un vincolo");
  }
  if (needsNodeTypes) facts.push("require_node_types.");
  if (needsEdgeTypes) facts.push("require_edge_types.");
  if (allowedNodeTypes.length > 0) {
    const uniqueTypes = new Set<string>();
    for (const [index, type] of allowedNodeTypes.entries()) {
      if (uniqueTypes.has(type)) throw new TypeError(`allowedNodeTypes[${index}] duplica il tipo '${type}'`);
      uniqueTypes.add(type);
      addUnique(facts, seenFacts, `allowed_node_type(${escapeAspString(type)}).`);
    }
    facts.push("enforce_node_type_domain.");
  }
  if (allowedEdgeTypes.length > 0) {
    const uniqueTypes = new Set<string>();
    for (const [index, type] of allowedEdgeTypes.entries()) {
      if (uniqueTypes.has(type)) throw new TypeError(`allowedEdgeTypes[${index}] duplica il tipo '${type}'`);
      uniqueTypes.add(type);
      addUnique(facts, seenFacts, `allowed_edge_type(${escapeAspString(type)}).`);
    }
    facts.push("enforce_edge_type_domain.");
  }

  for (const [index, rule] of edgeTypeDomains.entries()) {
    const edgeType = requireName(rule?.edgeType, `edgeTypeDomains[${index}].edgeType`);
    const sourceTypes = requireNames(rule?.sourceNodeTypes, `edgeTypeDomains[${index}].sourceNodeTypes`);
    const targetTypes = requireNames(rule?.targetNodeTypes, `edgeTypeDomains[${index}].targetNodeTypes`);
    addUnique(facts, seenFacts, `integrity_edge_type(${escapeAspString(edgeType)}).`);
    for (const sourceType of sourceTypes) {
      for (const targetType of targetTypes) {
        addUnique(
          facts,
          seenFacts,
          `allowed_endpoint_type(${escapeAspString(edgeType)},${escapeAspString(sourceType)},${escapeAspString(targetType)}).`
        );
        if (direction === "undirected") {
          addUnique(
            facts,
            seenFacts,
            `allowed_endpoint_type(${escapeAspString(edgeType)},${escapeAspString(targetType)},${escapeAspString(sourceType)}).`
          );
        }
      }
    }
  }

  for (const [index, rule] of requiredNodeAttributes.entries()) {
    const nodeType = requireName(rule?.nodeType, `requiredNodeAttributes[${index}].nodeType`);
    for (const attribute of requireNames(rule?.attributes, `requiredNodeAttributes[${index}].attributes`)) {
      addUnique(
        facts,
        seenFacts,
        `required_node_attribute(${escapeAspString(nodeType)},${escapeAspString(attribute)}).`
      );
    }
  }

  for (const [index, rule] of requiredEdgeAttributes.entries()) {
    const edgeType = requireName(rule?.edgeType, `requiredEdgeAttributes[${index}].edgeType`);
    for (const attribute of requireNames(rule?.attributes, `requiredEdgeAttributes[${index}].attributes`)) {
      addUnique(facts, seenFacts, `required_edge_attribute(${escapeAspString(edgeType)},${escapeAspString(attribute)}).`);
    }
  }

  const seenNodeAttributeDomains = new Set<string>();
  for (const [index, rule] of nodeAttributeDomains.entries()) {
    const nodeType = requireName(rule?.nodeType, `nodeAttributeDomains[${index}].nodeType`);
    const attribute = requireName(rule?.attribute, `nodeAttributeDomains[${index}].attribute`);
    const key = JSON.stringify([nodeType, attribute]);
    if (seenNodeAttributeDomains.has(key)) {
      throw new TypeError(`nodeAttributeDomains[${index}] duplica il dominio per tipo/attributo; combina allowedValues in una sola regola`);
    }
    seenNodeAttributeDomains.add(key);
    if (!Array.isArray(rule?.allowedValues) || rule.allowedValues.length === 0) {
      throw new TypeError(`nodeAttributeDomains[${index}].allowedValues deve essere un array non vuoto`);
    }
    addUnique(facts, seenFacts, `node_attribute_domain(${escapeAspString(nodeType)},${escapeAspString(attribute)}).`);
    const seenValues = new Set<string>();
    for (const [valueIndex, value] of rule.allowedValues.entries()) {
      const valueTerm = serializeAspRepairValue(value);
      if (seenValues.has(valueTerm)) throw new TypeError(`nodeAttributeDomains[${index}].allowedValues contiene un valore duplicato`);
      seenValues.add(valueTerm);
      addUnique(facts, seenFacts, `allowed_node_attribute(${escapeAspString(nodeType)},${escapeAspString(attribute)},${valueTerm}).`);
    }
  }

  const seenEdgeAttributeDomains = new Set<string>();
  for (const [index, rule] of edgeAttributeDomains.entries()) {
    const edgeType = requireName(rule?.edgeType, `edgeAttributeDomains[${index}].edgeType`);
    const attribute = requireName(rule?.attribute, `edgeAttributeDomains[${index}].attribute`);
    const key = JSON.stringify([edgeType, attribute]);
    if (seenEdgeAttributeDomains.has(key)) {
      throw new TypeError(`edgeAttributeDomains[${index}] duplica il dominio per tipo/attributo; combina allowedValues in una sola regola`);
    }
    seenEdgeAttributeDomains.add(key);
    if (!Array.isArray(rule?.allowedValues) || rule.allowedValues.length === 0) {
      throw new TypeError(`edgeAttributeDomains[${index}].allowedValues deve essere un array non vuoto`);
    }
    addUnique(facts, seenFacts, `edge_attribute_domain(${escapeAspString(edgeType)},${escapeAspString(attribute)}).`);
    const seenValues = new Set<string>();
    for (const value of rule.allowedValues) {
      const valueTerm = serializeAspRepairValue(value);
      if (seenValues.has(valueTerm)) throw new TypeError(`edgeAttributeDomains[${index}].allowedValues contiene un valore duplicato`);
      seenValues.add(valueTerm);
      addUnique(facts, seenFacts, `allowed_edge_attribute(${escapeAspString(edgeType)},${escapeAspString(attribute)},${valueTerm}).`);
    }
  }

  for (const [index, edgeTypeValue] of requiredEdgeIntervals.entries()) {
    const edgeType = requireName(edgeTypeValue, `requiredEdgeIntervals[${index}]`);
    addUnique(facts, seenFacts, `required_edge_interval(${escapeAspString(edgeType)}).`);
  }

  for (const [index, rule] of uniqueNodeAttributes.entries()) {
    const nodeType = requireName(rule?.nodeType, `uniqueNodeAttributes[${index}].nodeType`);
    const attribute = requireName(rule?.attribute, `uniqueNodeAttributes[${index}].attribute`);
    addUnique(facts, seenFacts, `unique_node_attribute(${escapeAspString(nodeType)},${escapeAspString(attribute)}).`);
  }

  for (const [index, rule] of uniqueEdgeAttributes.entries()) {
    const edgeType = requireName(rule?.edgeType, `uniqueEdgeAttributes[${index}].edgeType`);
    const attribute = requireName(rule?.attribute, `uniqueEdgeAttributes[${index}].attribute`);
    addUnique(facts, seenFacts, `unique_edge_attribute(${escapeAspString(edgeType)},${escapeAspString(attribute)}).`);
  }

  const seenCardinalityKeys = new Set<string>();
  for (const [index, rule] of cardinalities.entries()) {
    const nodeType = requireName(rule?.nodeType, `cardinalities[${index}].nodeType`);
    const edgeType = requireName(rule?.edgeType, `cardinalities[${index}].edgeType`);
    const incidence = rule.incidence ?? "any";
    if (!["any", "source", "target"].includes(incidence)) {
      throw new TypeError(`cardinalities[${index}].incidence deve essere any, source o target`);
    }
    if (direction === "undirected" && incidence !== "any") {
      throw new TypeError(`cardinalities[${index}].incidence source/target richiede un grafo diretto`);
    }
    const cardinalityKey = JSON.stringify([nodeType, edgeType, incidence]);
    if (seenCardinalityKeys.has(cardinalityKey)) {
      throw new TypeError(`cardinalities[${index}] duplica nodeType/edgeType/incidence; combina min e max in una sola regola`);
    }
    seenCardinalityKeys.add(cardinalityKey);
    const hasMin = rule.min !== undefined;
    const hasMax = rule.max !== undefined;
    if (!hasMin && !hasMax) {
      throw new TypeError(`cardinalities[${index}] deve indicare min e/o max`);
    }
    for (const [boundName, bound] of [["min", rule.min], ["max", rule.max]] as Array<[string, number | undefined]>) {
      if (bound === undefined) continue;
      if (!Number.isInteger(bound) || bound < 0) {
        throw new TypeError(`cardinalities[${index}].${boundName} deve essere un intero non negativo`);
      }
    }
    if (hasMin && hasMax && rule.min! > rule.max!) {
      throw new TypeError(`cardinalities[${index}].min non può essere maggiore di max`);
    }
    if (hasMin) {
      addUnique(facts, seenFacts, `min_cardinality(${escapeAspString(nodeType)},${escapeAspString(edgeType)},${incidence},${rule.min}).`);
    }
    if (hasMax) {
      addUnique(facts, seenFacts, `max_cardinality(${escapeAspString(nodeType)},${escapeAspString(edgeType)},${incidence},${rule.max}).`);
    }
  }

  const rules = [
    "active_edge(E) :- edge_record(E), not remove_edge(E).",
    "typed_node(N) :- analysis_node_type(N,_).",
    "violation(node_type_out_of_domain,N,T,0,0) :- enforce_node_type_domain, analysis_node_type(N,T), not allowed_node_type(T).",
    "violation(edge_type_out_of_domain,E,T,0,0) :- enforce_edge_type_domain, active_edge(E), analysis_edge_type(E,T), not allowed_edge_type(T).",
    "violation(missing_node_type,N,0,0,0) :- require_node_types, node(N), not typed_node(N).",
    "violation(missing_edge_type,E,0,0,0) :- require_edge_types, active_edge(E), not analysis_edge_type(E,_).",
    "violation(missing_endpoint_node_type,E,U,0,R) :- active_edge(E), integrity_edge_type(R), analysis_edge_type(E,R), edge_source(E,U), edge_target(E,_), not typed_node(U).",
    "violation(missing_endpoint_node_type,E,0,V,R) :- active_edge(E), integrity_edge_type(R), analysis_edge_type(E,R), edge_source(E,_), edge_target(E,V), not typed_node(V).",
    "violation(edge_endpoint_type,E,U,V,R) :- active_edge(E), integrity_edge_type(R), analysis_edge_type(E,R), edge_source(E,U), edge_target(E,V), analysis_node_type(U,TU), analysis_node_type(V,TV), not allowed_endpoint_type(R,TU,TV).",
    options.includeNodeAttributeCandidates === true || options.includeNodeAttributeReplacements === true
      ? "violation(missing_node_attribute,N,0,A,0) :- required_node_attribute(T,A), analysis_node_type(N,T), not effective_node_attribute(N,A,_)."
      : "violation(missing_node_attribute,N,0,A,0) :- required_node_attribute(T,A), analysis_node_type(N,T), not node_attribute(N,A,_).",
    options.includeEdgeAttributeCandidates === true || options.includeEdgeAttributeReplacements === true
      ? "violation(missing_edge_attribute,E,0,A,0) :- active_edge(E), required_edge_attribute(T,A), analysis_edge_type(E,T), not effective_edge_attribute(E,A,_)."
      : "violation(missing_edge_attribute,E,0,A,0) :- active_edge(E), required_edge_attribute(T,A), analysis_edge_type(E,T), not edge_attribute(E,A,_).",
    options.includeNodeAttributeCandidates === true || options.includeNodeAttributeReplacements === true
      ? "violation(node_attribute_out_of_domain,N,A,V,T) :- analysis_node_type(N,T), node_attribute_domain(T,A), effective_node_attribute(N,A,V), not allowed_node_attribute(T,A,V)."
      : "violation(node_attribute_out_of_domain,N,A,V,T) :- analysis_node_type(N,T), node_attribute_domain(T,A), node_attribute(N,A,V), not allowed_node_attribute(T,A,V).",
    options.includeEdgeAttributeCandidates === true || options.includeEdgeAttributeReplacements === true
      ? "violation(edge_attribute_out_of_domain,E,A,V,T) :- active_edge(E), analysis_edge_type(E,T), edge_attribute_domain(T,A), effective_edge_attribute(E,A,V), not allowed_edge_attribute(T,A,V)."
      : "violation(edge_attribute_out_of_domain,E,A,V,T) :- active_edge(E), analysis_edge_type(E,T), edge_attribute_domain(T,A), edge_attribute(E,A,V), not allowed_edge_attribute(T,A,V).",
    "violation(missing_edge_interval,E,from,0,R) :- active_edge(E), required_edge_interval(R), analysis_edge_type(E,R), not effective_edge_valid_from(E,_), not edge_valid_from_invalid(E).",
    "violation(missing_edge_interval,E,to,0,R) :- active_edge(E), required_edge_interval(R), analysis_edge_type(E,R), not effective_edge_valid_to(E,_), not edge_valid_to_invalid(E).",
    options.includeEdgeIntervalReplacements === true
      ? "violation(invalid_edge_interval_value,E,from,V,R) :- active_edge(E), analysis_edge_type(E,R), edge_valid_from_invalid(E), not replaced_edge_interval(E), edge_valid_from_raw(E,V)."
      : "violation(invalid_edge_interval_value,E,from,V,R) :- active_edge(E), analysis_edge_type(E,R), edge_valid_from_invalid(E), edge_valid_from_raw(E,V).",
    options.includeEdgeIntervalReplacements === true
      ? "violation(invalid_edge_interval_value,E,to,V,R) :- active_edge(E), analysis_edge_type(E,R), edge_valid_to_invalid(E), not replaced_edge_interval(E), edge_valid_to_raw(E,V)."
      : "violation(invalid_edge_interval_value,E,to,V,R) :- active_edge(E), analysis_edge_type(E,R), edge_valid_to_invalid(E), edge_valid_to_raw(E,V).",
    "violation(invalid_edge_interval,E,From,To,R) :- active_edge(E), analysis_edge_type(E,R), effective_edge_valid_from(E,From), effective_edge_valid_to(E,To), From > To.",
    options.includeNodeAttributeCandidates === true || options.includeNodeAttributeReplacements === true
      ? "violation(duplicate_node_attribute,N1,N2,A,V) :- unique_node_attribute(T,A), analysis_node_type(N1,T), analysis_node_type(N2,T), N1 < N2, effective_node_attribute(N1,A,V), effective_node_attribute(N2,A,V)."
      : "violation(duplicate_node_attribute,N1,N2,A,V) :- unique_node_attribute(T,A), analysis_node_type(N1,T), analysis_node_type(N2,T), N1 < N2, node_attribute(N1,A,V), node_attribute(N2,A,V).",
    options.includeEdgeAttributeReplacements === true
      ? "violation(duplicate_edge_attribute,E1,E2,A,V) :- unique_edge_attribute(T,A), active_edge(E1), active_edge(E2), E1 < E2, analysis_edge_type(E1,T), analysis_edge_type(E2,T), effective_edge_attribute(E1,A,V), effective_edge_attribute(E2,A,V)."
      : "violation(duplicate_edge_attribute,E1,E2,A,V) :- unique_edge_attribute(T,A), active_edge(E1), active_edge(E2), E1 < E2, analysis_edge_type(E1,T), analysis_edge_type(E2,T), edge_attribute(E1,A,V), edge_attribute(E2,A,V).",
    "cardinality_edge(N,E,R,any) :- active_edge(E), analysis_edge_type(E,R), edge_source(E,N).",
    "cardinality_edge(N,E,R,any) :- active_edge(E), analysis_edge_type(E,R), edge_target(E,N).",
    "cardinality_edge(N,E,R,source) :- active_edge(E), analysis_edge_type(E,R), edge_source(E,N).",
    "cardinality_edge(N,E,R,target) :- active_edge(E), analysis_edge_type(E,R), edge_target(E,N).",
    "violation(cardinality_min,N,Min,Count,R) :- min_cardinality(T,R,Mode,Min), analysis_node_type(N,T), Count = #count { E : cardinality_edge(N,E,R,Mode) }, Count < Min.",
    "violation(cardinality_max,N,Max,Count,R) :- max_cardinality(T,R,Mode,Max), analysis_node_type(N,T), Count = #count { E : cardinality_edge(N,E,R,Mode) }, Count > Max.",
    "#show violation/5."
  ];

  const attributeCandidateRules = options.includeNodeAttributeCandidates === true
    ? [
        options.includeNodeAttributeReplacements === true
          ? "effective_node_attribute(N,A,V) :- node_attribute(N,A,V), not replaced_node_attribute(N,A)."
          : "effective_node_attribute(N,A,V) :- node_attribute(N,A,V).",
        "effective_node_attribute(N,A,V) :- fill_node_attribute(C), repair_node_attribute(C,N,A,V,_)."
      ]
    : [];
  if (options.includeNodeAttributeReplacements === true) {
    if (options.includeNodeAttributeCandidates !== true) {
      attributeCandidateRules.push("effective_node_attribute(N,A,V) :- node_attribute(N,A,V), not replaced_node_attribute(N,A).");
    }
    attributeCandidateRules.push(
      "replaced_node_attribute(N,A) :- replace_node_attribute(C), repair_node_attribute_replacement(C,N,A,_,_,_).",
      "effective_node_attribute(N,A,V) :- replace_node_attribute(C), repair_node_attribute_replacement(C,N,A,_,V,_)."
    );
  }
  const edgeAttributeCandidateRules = options.includeEdgeAttributeCandidates === true
    ? [
        options.includeEdgeAttributeReplacements === true
          ? "effective_edge_attribute(E,A,V) :- edge_attribute(E,A,V), not replaced_edge_attribute(E,A)."
          : "effective_edge_attribute(E,A,V) :- edge_attribute(E,A,V).",
        "effective_edge_attribute(E,A,V) :- fill_edge_attribute(C), repair_edge_attribute(C,E,A,V,_)."
      ]
    : [];
  if (options.includeEdgeAttributeReplacements === true) {
    if (options.includeEdgeAttributeCandidates !== true) {
      edgeAttributeCandidateRules.push("effective_edge_attribute(E,A,V) :- edge_attribute(E,A,V), not replaced_edge_attribute(E,A).");
    }
    edgeAttributeCandidateRules.push(
      "replaced_edge_attribute(E,A) :- replace_edge_attribute(C), repair_edge_attribute_replacement(C,E,A,_,_,_).",
      "effective_edge_attribute(E,A,V) :- replace_edge_attribute(C), repair_edge_attribute_replacement(C,E,A,_,V,_)."
    );
  }
  const typeReplacementRules: string[] = [];
  if (options.includeNodeTypeReplacements === true) {
    typeReplacementRules.push(
      "analysis_node_type(N,T) :- node_type(N,T), not replaced_node_type(N).",
      "replaced_node_type(N) :- replace_node_type(C), repair_node_type_replacement(C,N,_,_,_).",
      "analysis_node_type(N,T) :- replace_node_type(C), repair_node_type_replacement(C,N,_,T,_)."
    );
  } else {
    typeReplacementRules.push("analysis_node_type(N,T) :- node_type(N,T).");
  }
  if (options.includeEdgeTypeReplacements === true) {
    typeReplacementRules.push(
      "analysis_edge_type(E,T) :- edge_type(E,T), not replaced_edge_type(E).",
      "replaced_edge_type(E) :- replace_edge_type(C), repair_edge_type_replacement(C,E,_,_,_).",
      "analysis_edge_type(E,T) :- replace_edge_type(C), repair_edge_type_replacement(C,E,_,T,_)."
    );
  } else {
    typeReplacementRules.push("analysis_edge_type(E,T) :- edge_type(E,T).");
  }
  const edgeIntervalReplacementRules = options.includeEdgeIntervalReplacements === true
    ? [
        "replaced_edge_interval(E) :- replace_edge_interval(C), repair_edge_interval_replacement(C,E,_,_,_).",
        "effective_edge_valid_from(E,V) :- edge_valid_from(E,V), not replaced_edge_interval(E).",
        "effective_edge_valid_to(E,V) :- edge_valid_to(E,V), not replaced_edge_interval(E).",
        "effective_edge_valid_from(E,V) :- replace_edge_interval(C), repair_edge_interval_replacement(C,E,V,_,_).",
        "effective_edge_valid_to(E,V) :- replace_edge_interval(C), repair_edge_interval_replacement(C,E,_,V,_)."
      ]
    : [
        "effective_edge_valid_from(E,V) :- edge_valid_from(E,V).",
        "effective_edge_valid_to(E,V) :- edge_valid_to(E,V)."
      ];
  return [...facts, ...attributeCandidateRules, ...edgeAttributeCandidateRules, ...typeReplacementRules, ...edgeIntervalReplacementRules, ...rules].join("\n");
}

/** Creates an ASP optimization task over explicitly authorized deletions and attribute fills. */
export function buildMinimumIntegrityRepairProgram(
  constraintsInput: GraphIntegrityConstraints | unknown,
  direction: GraphDirection,
  reverseEdgeIndex: Record<number, string>,
  indexByNodeId: ReadonlyMap<string, number> = new Map(),
  reverseSourceIndex: Record<number, string> = {},
  mappedNodeAttributes?: ReadonlySet<string>,
  mappedEdgeAttributes?: ReadonlySet<string>,
  temporalEncoding?: AspTemporalEncoding
): {
  program: string;
  costByEdgeId: Record<string, number>;
  attributeCandidateById: Record<number, NodeAttributeRepair>;
  edgeAttributeCandidateById: Record<number, EdgeAttributeRepair>;
  nodeAttributeReplacementById: Record<number, NodeAttributeReplacement>;
  edgeAttributeReplacementById: Record<number, EdgeAttributeReplacement>;
  nodeTypeReplacementById: Record<number, NodeTypeReplacement>;
  edgeTypeReplacementById: Record<number, EdgeTypeReplacement>;
  edgeIntervalReplacementById: Record<number, EdgeIntervalReplacement>;
} {
  if (constraintsInput === null || typeof constraintsInput !== "object" || Array.isArray(constraintsInput)) {
    throw new TypeError("graphIntegrity deve essere un oggetto JSON");
  }
  const constraints = constraintsInput as GraphIntegrityConstraints;
  const repair = constraints.repairSuggestions;
  if (repair === null || typeof repair !== "object" || Array.isArray(repair)) {
    throw new TypeError("graphIntegrity.repairSuggestions deve essere un oggetto");
  }
  const removableEdges = repair.removableEdges ?? [];
  const nodeAttributeValues = repair.nodeAttributeValues ?? [];
  const edgeAttributeValues = repair.edgeAttributeValues ?? [];
  const nodeAttributeReplacements = repair.nodeAttributeReplacements ?? [];
  const edgeAttributeReplacements = repair.edgeAttributeReplacements ?? [];
  const nodeTypeReplacements = repair.nodeTypeReplacements ?? [];
  const edgeTypeReplacements = repair.edgeTypeReplacements ?? [];
  const edgeIntervalReplacements = repair.edgeIntervalReplacements ?? [];
  if (!Array.isArray(removableEdges)) {
    throw new TypeError("repairSuggestions.removableEdges deve essere un array");
  }
  if (!Array.isArray(nodeAttributeValues)) {
    throw new TypeError("repairSuggestions.nodeAttributeValues deve essere un array");
  }
  if (!Array.isArray(edgeAttributeValues)) {
    throw new TypeError("repairSuggestions.edgeAttributeValues deve essere un array");
  }
  if (!Array.isArray(nodeAttributeReplacements)) {
    throw new TypeError("repairSuggestions.nodeAttributeReplacements deve essere un array");
  }
  if (!Array.isArray(edgeAttributeReplacements)) {
    throw new TypeError("repairSuggestions.edgeAttributeReplacements deve essere un array");
  }
  if (!Array.isArray(nodeTypeReplacements)) {
    throw new TypeError("repairSuggestions.nodeTypeReplacements deve essere un array");
  }
  if (!Array.isArray(edgeTypeReplacements)) {
    throw new TypeError("repairSuggestions.edgeTypeReplacements deve essere un array");
  }
  if (!Array.isArray(edgeIntervalReplacements)) {
    throw new TypeError("repairSuggestions.edgeIntervalReplacements deve essere un array");
  }
  if (removableEdges.length === 0 && nodeAttributeValues.length === 0 && edgeAttributeValues.length === 0 &&
    nodeAttributeReplacements.length === 0 && edgeAttributeReplacements.length === 0 &&
    nodeTypeReplacements.length === 0 && edgeTypeReplacements.length === 0 && edgeIntervalReplacements.length === 0) {
    throw new TypeError("repairSuggestions deve elencare almeno un'azione candidata");
  }
  if ((nodeAttributeValues.length > 0 || nodeAttributeReplacements.length > 0) && !mappedNodeAttributes) {
    throw new TypeError("Le riparazioni di attributi richiedono i nomi mappati in graphMapping.node.attributes");
  }
  if ((edgeAttributeValues.length > 0 || edgeAttributeReplacements.length > 0) && !mappedEdgeAttributes) {
    throw new TypeError("Le riparazioni di attributi richiedono i nomi mappati in graphMapping.edge.attributes");
  }
  const allowedNodeTypeValues = nodeTypeReplacements.length > 0
    ? requireNames(constraints.allowedNodeTypes, "allowedNodeTypes")
    : [];
  const allowedEdgeTypeValues = edgeTypeReplacements.length > 0
    ? requireNames(constraints.allowedEdgeTypes, "allowedEdgeTypes")
    : [];
  const allowedNodeTypeSet = new Set(allowedNodeTypeValues);
  const allowedEdgeTypeSet = new Set(allowedEdgeTypeValues);

  const facts: string[] = [];
  const costByEdgeId: Record<string, number> = Object.create(null);
  const attributeCandidateById: Record<number, NodeAttributeRepair> = Object.create(null);
  const edgeAttributeCandidateById: Record<number, EdgeAttributeRepair> = Object.create(null);
  const nodeAttributeReplacementById: Record<number, NodeAttributeReplacement> = Object.create(null);
  const edgeAttributeReplacementById: Record<number, EdgeAttributeReplacement> = Object.create(null);
  const nodeTypeReplacementById: Record<number, NodeTypeReplacement> = Object.create(null);
  const edgeTypeReplacementById: Record<number, EdgeTypeReplacement> = Object.create(null);
  const edgeIntervalReplacementById: Record<number, EdgeIntervalReplacement> = Object.create(null);
  let removalCostUpperBound = 0n;
  const seenCandidates = new Set<string>();
  for (const [index, candidate] of removableEdges.entries()) {
    const edgeId = requireName(candidate?.edgeId, `repairSuggestions.removableEdges[${index}].edgeId`);
    if (seenCandidates.has(edgeId)) {
      throw new TypeError(`repairSuggestions.removableEdges contiene l'ID duplicato '${edgeId}'`);
    }
    seenCandidates.add(edgeId);
    const cost = candidate?.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost < 1) {
      throw new TypeError(`repairSuggestions.removableEdges[${index}].cost deve essere un intero positivo`);
    }
    removalCostUpperBound += BigInt(cost);
    const matches = Object.entries(reverseEdgeIndex)
      .filter(([, sourceId]) => sourceId === edgeId)
      .map(([record]) => Number(record));
    if (matches.length !== 1) {
      throw new TypeError(`L'ID arco autorizzato '${edgeId}' deve corrispondere a un solo record presente nel grafo`);
    }
    const record = matches[0];
    facts.push(`repair_candidate(${record},${cost}).`);
    costByEdgeId[edgeId] = cost;
  }

  const seenAttributeCandidates = new Set<string>();
  const maximumAttributeCostByTarget = new Map<string, bigint>();
  for (const [index, candidate] of nodeAttributeValues.entries()) {
    const path = `repairSuggestions.nodeAttributeValues[${index}]`;
    const rawNodeId = candidate?.nodeId;
    if ((typeof rawNodeId !== "string" && typeof rawNodeId !== "number") ||
      (typeof rawNodeId === "number" && !Number.isFinite(rawNodeId))) {
      throw new TypeError(`${path}.nodeId deve essere una stringa o un numero finito`);
    }
    const nodeId = String(rawNodeId);
    const sourceNodeMatch = Object.entries(reverseSourceIndex).find(([, sourceId]) => sourceId === nodeId);
    const nodeIndex = sourceNodeMatch ? Number(sourceNodeMatch[0]) : indexByNodeId.get(nodeId);
    if (!nodeIndex) throw new TypeError(`${path}.nodeId '${nodeId}' non identifica un nodo presente`);
    const attribute = requireName(candidate?.attribute, `${path}.attribute`);
    if (!mappedNodeAttributes?.has(attribute)) {
      throw new TypeError(`${path}.attribute '${attribute}' non è mappato in graphMapping.node.attributes`);
    }
    const value = candidate?.value;
    const valueTerm = serializeAspRepairValue(value);
    const cost = candidate?.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost < 1) {
      throw new TypeError(`${path}.cost deve essere un intero positivo`);
    }
    const targetKey = `${nodeIndex}\u0000${attribute}`;
    const candidateCost = BigInt(cost);
    if (candidateCost > (maximumAttributeCostByTarget.get(targetKey) ?? 0n)) {
      maximumAttributeCostByTarget.set(targetKey, candidateCost);
    }
    const candidateKey = JSON.stringify([nodeIndex, attribute, valueTerm]);
    if (seenAttributeCandidates.has(candidateKey)) {
      throw new TypeError(`${path} duplica un valore candidato già dichiarato per il nodo e attributo`);
    }
    seenAttributeCandidates.add(candidateKey);
    const candidateId = Object.keys(attributeCandidateById).length + 1;
    facts.push(`repair_node_attribute(${candidateId},${nodeIndex},${escapeAspString(attribute)},${valueTerm},${cost}).`);
    attributeCandidateById[candidateId] = {
      nodeId,
      attribute,
      value: value as string | number | boolean,
      cost
    };
  }
  const seenEdgeAttributeCandidates = new Set<string>();
  const maximumEdgeAttributeCostByTarget = new Map<string, bigint>();
  for (const [index, candidate] of edgeAttributeValues.entries()) {
    const path = `repairSuggestions.edgeAttributeValues[${index}]`;
    const edgeId = requireName(candidate?.edgeId, `${path}.edgeId`);
    const matchingRecords = Object.entries(reverseEdgeIndex)
      .filter(([, sourceId]) => sourceId === edgeId)
      .map(([record]) => Number(record));
    if (matchingRecords.length !== 1) {
      throw new TypeError(`${path}.edgeId '${edgeId}' deve corrispondere a un solo record presente nel grafo`);
    }
    const record = matchingRecords[0];
    const attribute = requireName(candidate?.attribute, `${path}.attribute`);
    if (!mappedEdgeAttributes?.has(attribute)) {
      throw new TypeError(`${path}.attribute '${attribute}' non è mappato in graphMapping.edge.attributes`);
    }
    const value = candidate?.value;
    const valueTerm = serializeAspRepairValue(value);
    const cost = candidate?.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost < 1) {
      throw new TypeError(`${path}.cost deve essere un intero positivo`);
    }
    const targetKey = `${record}\u0000${attribute}`;
    const candidateCost = BigInt(cost);
    if (candidateCost > (maximumEdgeAttributeCostByTarget.get(targetKey) ?? 0n)) {
      maximumEdgeAttributeCostByTarget.set(targetKey, candidateCost);
    }
    const candidateKey = JSON.stringify([record, attribute, valueTerm]);
    if (seenEdgeAttributeCandidates.has(candidateKey)) {
      throw new TypeError(`${path} duplica un valore candidato già dichiarato per l'arco e attributo`);
    }
    seenEdgeAttributeCandidates.add(candidateKey);
    const candidateId = Object.keys(edgeAttributeCandidateById).length + 1;
    facts.push(`repair_edge_attribute(${candidateId},${record},${escapeAspString(attribute)},${valueTerm},${cost}).`);
    edgeAttributeCandidateById[candidateId] = { edgeId, attribute, value: value as string | number | boolean, cost };
  }
  const seenNodeReplacements = new Set<string>();
  const maximumNodeTypeCostByTarget = new Map<string, bigint>();
  const seenNodeTypeReplacements = new Set<string>();
  for (const [index, candidate] of nodeTypeReplacements.entries()) {
    const path = `repairSuggestions.nodeTypeReplacements[${index}]`;
    const rawNodeId = candidate?.nodeId;
    if ((typeof rawNodeId !== "string" && typeof rawNodeId !== "number") ||
      (typeof rawNodeId === "number" && !Number.isFinite(rawNodeId))) {
      throw new TypeError(`${path}.nodeId deve essere una stringa o un numero finito`);
    }
    const nodeId = String(rawNodeId);
    const sourceNodeMatch = Object.entries(reverseSourceIndex).find(([, sourceId]) => sourceId === nodeId);
    const nodeIndex = sourceNodeMatch ? Number(sourceNodeMatch[0]) : indexByNodeId.get(nodeId);
    if (!nodeIndex) throw new TypeError(`${path}.nodeId '${nodeId}' non identifica un nodo presente`);
    const expectedType = requireName(candidate?.expectedType, `${path}.expectedType`);
    const newType = requireName(candidate?.newType, `${path}.newType`);
    if (expectedType === newType) throw new TypeError(`${path}.newType deve differire da expectedType`);
    if (!allowedNodeTypeSet.has(newType)) {
      throw new TypeError(`${path}.newType '${newType}' deve appartenere a allowedNodeTypes`);
    }
    const cost = candidate?.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost < 1) throw new TypeError(`${path}.cost deve essere un intero positivo`);
    const targetKey = String(nodeIndex);
    const candidateCost = BigInt(cost);
    if (candidateCost > (maximumNodeTypeCostByTarget.get(targetKey) ?? 0n)) {
      maximumNodeTypeCostByTarget.set(targetKey, candidateCost);
    }
    const candidateKey = JSON.stringify([nodeIndex, expectedType, newType]);
    if (seenNodeTypeReplacements.has(candidateKey)) throw new TypeError(`${path} duplica una sostituzione già dichiarata per il nodo`);
    seenNodeTypeReplacements.add(candidateKey);
    const candidateId = Object.keys(nodeTypeReplacementById).length + 1;
    facts.push(`repair_node_type_replacement(${candidateId},${nodeIndex},${escapeAspString(expectedType)},${escapeAspString(newType)},${cost}).`);
    nodeTypeReplacementById[candidateId] = { nodeId, expectedType, newType, cost };
  }
  for (const [index, candidate] of nodeAttributeReplacements.entries()) {
    const path = `repairSuggestions.nodeAttributeReplacements[${index}]`;
    const rawNodeId = candidate?.nodeId;
    if ((typeof rawNodeId !== "string" && typeof rawNodeId !== "number") ||
      (typeof rawNodeId === "number" && !Number.isFinite(rawNodeId))) {
      throw new TypeError(`${path}.nodeId deve essere una stringa o un numero finito`);
    }
    const nodeId = String(rawNodeId);
    const sourceNodeMatch = Object.entries(reverseSourceIndex).find(([, sourceId]) => sourceId === nodeId);
    const nodeIndex = sourceNodeMatch ? Number(sourceNodeMatch[0]) : indexByNodeId.get(nodeId);
    if (!nodeIndex) throw new TypeError(`${path}.nodeId '${nodeId}' non identifica un nodo presente`);
    const attribute = requireName(candidate?.attribute, `${path}.attribute`);
    if (!mappedNodeAttributes?.has(attribute)) {
      throw new TypeError(`${path}.attribute '${attribute}' non è mappato in graphMapping.node.attributes`);
    }
    const expectedValue = candidate?.expectedValue;
    const expectedTerm = serializeAspRepairValue(expectedValue);
    const value = candidate?.value;
    const valueTerm = serializeAspRepairValue(value);
    if (expectedTerm === valueTerm) throw new TypeError(`${path}.value deve differire da expectedValue`);
    const cost = candidate?.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost < 1) throw new TypeError(`${path}.cost deve essere un intero positivo`);
    const targetKey = `${nodeIndex}\u0000${attribute}`;
    const candidateCost = BigInt(cost);
    if (candidateCost > (maximumAttributeCostByTarget.get(targetKey) ?? 0n)) {
      maximumAttributeCostByTarget.set(targetKey, candidateCost);
    }
    const candidateKey = JSON.stringify([nodeIndex, attribute, expectedTerm, valueTerm]);
    if (seenNodeReplacements.has(candidateKey)) throw new TypeError(`${path} duplica una sostituzione già dichiarata per il nodo e attributo`);
    seenNodeReplacements.add(candidateKey);
    const candidateId = Object.keys(nodeAttributeReplacementById).length + 1;
    facts.push(`repair_node_attribute_replacement(${candidateId},${nodeIndex},${escapeAspString(attribute)},${expectedTerm},${valueTerm},${cost}).`);
    nodeAttributeReplacementById[candidateId] = {
      nodeId,
      attribute,
      expectedValue: expectedValue as string | number | boolean,
      value: value as string | number | boolean,
      cost
    };
  }
  const seenEdgeReplacements = new Set<string>();
  const maximumEdgeTypeCostByTarget = new Map<string, bigint>();
  const seenEdgeTypeReplacements = new Set<string>();
  for (const [index, candidate] of edgeTypeReplacements.entries()) {
    const path = `repairSuggestions.edgeTypeReplacements[${index}]`;
    const edgeId = requireName(candidate?.edgeId, `${path}.edgeId`);
    const matchingRecords = Object.entries(reverseEdgeIndex)
      .filter(([, sourceId]) => sourceId === edgeId)
      .map(([record]) => Number(record));
    if (matchingRecords.length !== 1) {
      throw new TypeError(`${path}.edgeId '${edgeId}' deve corrispondere a un solo record presente nel grafo`);
    }
    const record = matchingRecords[0];
    const expectedType = requireName(candidate?.expectedType, `${path}.expectedType`);
    const newType = requireName(candidate?.newType, `${path}.newType`);
    if (expectedType === newType) throw new TypeError(`${path}.newType deve differire da expectedType`);
    if (!allowedEdgeTypeSet.has(newType)) {
      throw new TypeError(`${path}.newType '${newType}' deve appartenere a allowedEdgeTypes`);
    }
    const cost = candidate?.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost < 1) throw new TypeError(`${path}.cost deve essere un intero positivo`);
    const targetKey = String(record);
    const candidateCost = BigInt(cost);
    if (candidateCost > (maximumEdgeTypeCostByTarget.get(targetKey) ?? 0n)) {
      maximumEdgeTypeCostByTarget.set(targetKey, candidateCost);
    }
    const candidateKey = JSON.stringify([record, expectedType, newType]);
    if (seenEdgeTypeReplacements.has(candidateKey)) throw new TypeError(`${path} duplica una sostituzione già dichiarata per l'arco`);
    seenEdgeTypeReplacements.add(candidateKey);
    const candidateId = Object.keys(edgeTypeReplacementById).length + 1;
    facts.push(`repair_edge_type_replacement(${candidateId},${record},${escapeAspString(expectedType)},${escapeAspString(newType)},${cost}).`);
    edgeTypeReplacementById[candidateId] = { edgeId, expectedType, newType, cost };
  }
  for (const [index, candidate] of edgeAttributeReplacements.entries()) {
    const path = `repairSuggestions.edgeAttributeReplacements[${index}]`;
    const edgeId = requireName(candidate?.edgeId, `${path}.edgeId`);
    const matchingRecords = Object.entries(reverseEdgeIndex)
      .filter(([, sourceId]) => sourceId === edgeId)
      .map(([record]) => Number(record));
    if (matchingRecords.length !== 1) {
      throw new TypeError(`${path}.edgeId '${edgeId}' deve corrispondere a un solo record presente nel grafo`);
    }
    const record = matchingRecords[0];
    const attribute = requireName(candidate?.attribute, `${path}.attribute`);
    if (!mappedEdgeAttributes?.has(attribute)) {
      throw new TypeError(`${path}.attribute '${attribute}' non è mappato in graphMapping.edge.attributes`);
    }
    const expectedValue = candidate?.expectedValue;
    const expectedTerm = serializeAspRepairValue(expectedValue);
    const value = candidate?.value;
    const valueTerm = serializeAspRepairValue(value);
    if (expectedTerm === valueTerm) throw new TypeError(`${path}.value deve differire da expectedValue`);
    const cost = candidate?.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost < 1) throw new TypeError(`${path}.cost deve essere un intero positivo`);
    const targetKey = `${record}\u0000${attribute}`;
    const candidateCost = BigInt(cost);
    if (candidateCost > (maximumEdgeAttributeCostByTarget.get(targetKey) ?? 0n)) {
      maximumEdgeAttributeCostByTarget.set(targetKey, candidateCost);
    }
    const candidateKey = JSON.stringify([record, attribute, expectedTerm, valueTerm]);
    if (seenEdgeReplacements.has(candidateKey)) throw new TypeError(`${path} duplica una sostituzione già dichiarata per l'arco e attributo`);
    seenEdgeReplacements.add(candidateKey);
    const candidateId = Object.keys(edgeAttributeReplacementById).length + 1;
    facts.push(`repair_edge_attribute_replacement(${candidateId},${record},${escapeAspString(attribute)},${expectedTerm},${valueTerm},${cost}).`);
    edgeAttributeReplacementById[candidateId] = {
      edgeId,
      attribute,
      expectedValue: expectedValue as string | number | boolean,
      value: value as string | number | boolean,
      cost
    };
  }
  const maximumEdgeIntervalCostByTarget = new Map<string, bigint>();
  const seenEdgeIntervalReplacements = new Set<string>();
  for (const [index, candidate] of edgeIntervalReplacements.entries()) {
    const path = `repairSuggestions.edgeIntervalReplacements[${index}]`;
    const edgeId = requireName(candidate?.edgeId, `${path}.edgeId`);
    const matchingRecords = Object.entries(reverseEdgeIndex)
      .filter(([, sourceId]) => sourceId === edgeId)
      .map(([record]) => Number(record));
    if (matchingRecords.length !== 1) {
      throw new TypeError(`${path}.edgeId '${edgeId}' deve corrispondere a un solo record presente nel grafo`);
    }
    const record = matchingRecords[0];
    const expectedFromIsPresent = Object.prototype.hasOwnProperty.call(candidate ?? {}, "expectedFrom");
    const expectedToIsPresent = Object.prototype.hasOwnProperty.call(candidate ?? {}, "expectedTo");
    const expectedFrom = candidate?.expectedFrom;
    const expectedTo = candidate?.expectedTo;
    const from = candidate?.from;
    const to = candidate?.to;
    const isExpectedScalar = (value: unknown): value is string | number | boolean =>
      typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
    if (expectedFromIsPresent && expectedFrom !== null && !isExpectedScalar(expectedFrom)) {
      throw new TypeError(`${path}.expectedFrom deve essere null o un valore scalare JSON`);
    }
    if (expectedToIsPresent && expectedTo !== null && !isExpectedScalar(expectedTo)) {
      throw new TypeError(`${path}.expectedTo deve essere null o un valore scalare JSON`);
    }
    if ((typeof from !== "string" && typeof from !== "number") ||
      (typeof to !== "string" && typeof to !== "number")) {
      throw new TypeError(`${path}.from e .to devono essere stringhe o numeri`);
    }
    const parsedFrom = parseRepairIntervalEndpoint(from);
    const parsedTo = parseRepairIntervalEndpoint(to);
    if (!parsedFrom || !parsedTo) {
      throw new TypeError(`${path}.from e .to devono essere interi sicuri o date ISO valide (data senza ora o timestamp con fuso)`);
    }
    const normalizedFrom = parsedFrom.value;
    const normalizedTo = parsedTo.value;
    if (normalizedFrom > normalizedTo) {
      throw new TypeError(`${path}.from non può essere successivo a .to nell'intervallo chiuso`);
    }
    if (parsedFrom.domain !== parsedTo.domain) {
      throw new TypeError(`${path}.from e .to non possono mescolare anni interi e date ISO`);
    }
    const aspFrom = temporalEncoding ? temporalEncoding.encode(from) : normalizedFrom;
    const aspTo = temporalEncoding ? temporalEncoding.encode(to) : normalizedTo;
    if (aspFrom === null || aspTo === null) {
      throw new RangeError(`${path}.from e .to non sono inclusi nella codifica temporale ASP del grafo`);
    }
    const expectedFromKey = !expectedFromIsPresent || expectedFrom === null
      ? ["missing"]
      : parseGraphTimeValue(expectedFrom) !== null
        ? ["valid", parseGraphTimeValue(expectedFrom)]
        : ["invalid", JSON.stringify(expectedFrom)];
    const expectedToKey = !expectedToIsPresent || expectedTo === null
      ? ["missing"]
      : parseGraphTimeValue(expectedTo) !== null
        ? ["valid", parseGraphTimeValue(expectedTo)]
        : ["invalid", JSON.stringify(expectedTo)];
    const candidateKey = JSON.stringify([record, expectedFromKey, expectedToKey, normalizedFrom, normalizedTo]);
    if (seenEdgeIntervalReplacements.has(candidateKey)) {
      throw new TypeError(`${path} duplica una sostituzione d'intervallo già dichiarata per l'arco`);
    }
    seenEdgeIntervalReplacements.add(candidateKey);
    const cost = candidate?.cost ?? 1;
    if (!Number.isSafeInteger(cost) || cost < 1) throw new TypeError(`${path}.cost deve essere un intero positivo`);
    const candidateId = Object.keys(edgeIntervalReplacementById).length + 1;
    facts.push(`repair_edge_interval_replacement(${candidateId},${record},${aspFrom},${aspTo},${cost}).`);
    const expectedEndpointFact = (
      side: "from" | "to",
      isPresent: boolean,
      value: string | number | boolean | null | undefined
    ) => {
      if (!isPresent || value === null) return `repair_edge_interval_expected_${side}_missing(${candidateId}).`;
      const parsed = parseGraphTemporalValue(value);
      if (parsed !== null) {
        const normalized = temporalEncoding ? temporalEncoding.encode(value) : parsed.value;
        if (normalized === null) {
          throw new RangeError(`${path}.expected${side === "from" ? "From" : "To"} non è incluso nella codifica temporale ASP del grafo`);
        }
        return `repair_edge_interval_expected_${side}_valid(${candidateId},${normalized}).`;
      }
      return `repair_edge_interval_expected_${side}_invalid(${candidateId},${escapeAspString(JSON.stringify(value))}).`;
    };
    facts.push(expectedEndpointFact("from", expectedFromIsPresent, expectedFrom));
    facts.push(expectedEndpointFact("to", expectedToIsPresent, expectedTo));
    const targetKey = String(record);
    const candidateCost = BigInt(cost);
    if (candidateCost > (maximumEdgeIntervalCostByTarget.get(targetKey) ?? 0n)) {
      maximumEdgeIntervalCostByTarget.set(targetKey, candidateCost);
    }
    edgeIntervalReplacementById[candidateId] = {
      edgeId,
      ...(expectedFromIsPresent ? { expectedFrom: expectedFrom as string | number | boolean | null } : {}),
      ...(expectedToIsPresent ? { expectedTo: expectedTo as string | number | boolean | null } : {}),
      from,
      to,
      cost
    };
  }
  const maximumAuthorizedCost = removalCostUpperBound +
    [...maximumAttributeCostByTarget.values()].reduce((total, cost) => total + cost, 0n) +
    [...maximumEdgeAttributeCostByTarget.values()].reduce((total, cost) => total + cost, 0n) +
    [...maximumNodeTypeCostByTarget.values()].reduce((total, cost) => total + cost, 0n) +
    [...maximumEdgeTypeCostByTarget.values()].reduce((total, cost) => total + cost, 0n) +
    [...maximumEdgeIntervalCostByTarget.values()].reduce((total, cost) => total + cost, 0n);
  if (maximumAuthorizedCost > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("La somma massima dei costi candidati deve restare un intero sicuro");
  }

  const program = [
    buildGraphIntegrityProgram(constraints, direction, {
      includeNodeAttributeCandidates: nodeAttributeValues.length > 0,
      includeEdgeAttributeCandidates: edgeAttributeValues.length > 0,
      includeNodeAttributeReplacements: nodeAttributeReplacements.length > 0,
      includeEdgeAttributeReplacements: edgeAttributeReplacements.length > 0,
      includeNodeTypeReplacements: nodeTypeReplacements.length > 0,
      includeEdgeTypeReplacements: edgeTypeReplacements.length > 0,
      includeEdgeIntervalReplacements: edgeIntervalReplacements.length > 0
    }),
    facts.join("\n"),
    "{ remove_edge(E) } :- repair_candidate(E,_).",
    "{ fill_node_attribute(C) } :- repair_node_attribute(C,N,A,_,_), not node_attribute(N,A,_).",
    ":- fill_node_attribute(C1), fill_node_attribute(C2), repair_node_attribute(C1,N,A,_,_), repair_node_attribute(C2,N,A,_,_), C1 < C2.",
    "{ fill_edge_attribute(C) } :- repair_edge_attribute(C,E,A,_,_), not edge_attribute(E,A,_).",
    ":- fill_edge_attribute(C1), fill_edge_attribute(C2), repair_edge_attribute(C1,E,A,_,_), repair_edge_attribute(C2,E,A,_,_), C1 < C2.",
    "{ replace_node_attribute(C) } :- repair_node_attribute_replacement(C,N,A,Old,_,_), node_attribute(N,A,Old).",
    ":- replace_node_attribute(C1), replace_node_attribute(C2), repair_node_attribute_replacement(C1,N,A,_,_,_), repair_node_attribute_replacement(C2,N,A,_,_,_), C1 < C2.",
    "{ replace_edge_attribute(C) } :- repair_edge_attribute_replacement(C,E,A,Old,_,_), edge_attribute(E,A,Old).",
    ":- replace_edge_attribute(C1), replace_edge_attribute(C2), repair_edge_attribute_replacement(C1,E,A,_,_,_), repair_edge_attribute_replacement(C2,E,A,_,_,_), C1 < C2.",
    "{ replace_node_type(C) } :- repair_node_type_replacement(C,N,Old,_,_), node_type(N,Old).",
    ":- replace_node_type(C1), replace_node_type(C2), repair_node_type_replacement(C1,N,_,_,_), repair_node_type_replacement(C2,N,_,_,_), C1 < C2.",
    "{ replace_edge_type(C) } :- repair_edge_type_replacement(C,E,Old,_,_), edge_type(E,Old).",
    ":- replace_edge_type(C1), replace_edge_type(C2), repair_edge_type_replacement(C1,E,_,_,_), repair_edge_type_replacement(C2,E,_,_,_), C1 < C2.",
    "edge_interval_from_matches(C,E) :- repair_edge_interval_expected_from_valid(C,V), edge_valid_from(E,V), repair_edge_interval_replacement(C,E,_,_,_).",
    "edge_interval_from_matches(C,E) :- repair_edge_interval_expected_from_missing(C), not edge_valid_from(E,_), not edge_valid_from_invalid(E), repair_edge_interval_replacement(C,E,_,_,_).",
    "edge_interval_from_matches(C,E) :- repair_edge_interval_expected_from_invalid(C,V), edge_valid_from_invalid(E), edge_valid_from_raw_exact(E,V), repair_edge_interval_replacement(C,E,_,_,_).",
    "edge_interval_to_matches(C,E) :- repair_edge_interval_expected_to_valid(C,V), edge_valid_to(E,V), repair_edge_interval_replacement(C,E,_,_,_).",
    "edge_interval_to_matches(C,E) :- repair_edge_interval_expected_to_missing(C), not edge_valid_to(E,_), not edge_valid_to_invalid(E), repair_edge_interval_replacement(C,E,_,_,_).",
    "edge_interval_to_matches(C,E) :- repair_edge_interval_expected_to_invalid(C,V), edge_valid_to_invalid(E), edge_valid_to_raw_exact(E,V), repair_edge_interval_replacement(C,E,_,_,_).",
    "eligible_edge_interval_replacement(C) :- repair_edge_interval_replacement(C,E,_,_,_), active_edge(E), edge_interval_from_matches(C,E), edge_interval_to_matches(C,E).",
    "{ replace_edge_interval(C) } :- eligible_edge_interval_replacement(C).",
    ":- replace_edge_interval(C1), replace_edge_interval(C2), repair_edge_interval_replacement(C1,E,_,_,_), repair_edge_interval_replacement(C2,E,_,_,_), C1 < C2.",
    ":- violation(_,_,_,_,_).",
    "#minimize { Cost,edge,E : remove_edge(E), repair_candidate(E,Cost); Cost,node_attribute,C : fill_node_attribute(C), repair_node_attribute(C,_,_,_,Cost); Cost,edge_attribute,C : fill_edge_attribute(C), repair_edge_attribute(C,_,_,_,Cost); Cost,node_attribute_replacement,C : replace_node_attribute(C), repair_node_attribute_replacement(C,_,_,_,_,Cost); Cost,edge_attribute_replacement,C : replace_edge_attribute(C), repair_edge_attribute_replacement(C,_,_,_,_,Cost); Cost,node_type_replacement,C : replace_node_type(C), repair_node_type_replacement(C,_,_,_,Cost); Cost,edge_type_replacement,C : replace_edge_type(C), repair_edge_type_replacement(C,_,_,_,Cost); Cost,edge_interval_replacement,C : replace_edge_interval(C), repair_edge_interval_replacement(C,_,_,_,Cost) }.",
    "#show remove_edge/1.",
    "#show fill_node_attribute/1.",
    "#show fill_edge_attribute/1.",
    "#show replace_node_attribute/1.",
    "#show replace_edge_attribute/1.",
    "#show replace_node_type/1.",
    "#show replace_edge_type/1.",
    "#show replace_edge_interval/1."
  ].join("\n");

  return {
    program,
    costByEdgeId,
    attributeCandidateById,
    edgeAttributeCandidateById,
    nodeAttributeReplacementById,
    edgeAttributeReplacementById,
    nodeTypeReplacementById,
    edgeTypeReplacementById,
    edgeIntervalReplacementById
  };
}

/** @deprecated Use buildMinimumIntegrityRepairProgram. */
export const buildMinimumEdgeRemovalProgram = buildMinimumIntegrityRepairProgram;

/** Returns one minimum-cost integrity-repair proposal mapped to source identifiers. */
export function parseIntegrityRepairProposal(
  witnesses: unknown,
  reverseEdgeIndex: Record<number, string>,
  costByEdgeId: Record<string, number>,
  attributeCandidateById: Record<number, NodeAttributeRepair> = {},
  edgeAttributeCandidateById: Record<number, EdgeAttributeRepair> = {},
  nodeAttributeReplacementById: Record<number, NodeAttributeReplacement> = {},
  edgeAttributeReplacementById: Record<number, EdgeAttributeReplacement> = {},
  nodeTypeReplacementById: Record<number, NodeTypeReplacement> = {},
  edgeTypeReplacementById: Record<number, EdgeTypeReplacement> = {},
  edgeIntervalReplacementById: Record<number, EdgeIntervalReplacement> = {}
): IntegrityRepairProposal | null {
  let best: IntegrityRepairProposal | null = null;
  const seen = new Set<string>();
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    const edgeIds = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^remove_edge\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseEdgeIndex[Number(match[1])])
      .filter((edgeId): edgeId is string => Boolean(edgeId))
      .sort();
    const nodeAttributes = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^fill_node_attribute\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => attributeCandidateById[Number(match[1])])
      .filter((candidate): candidate is NodeAttributeRepair => Boolean(candidate))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId) || left.attribute.localeCompare(right.attribute));
    const edgeAttributes = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^fill_edge_attribute\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => edgeAttributeCandidateById[Number(match[1])])
      .filter((candidate): candidate is EdgeAttributeRepair => Boolean(candidate))
      .sort((left, right) => left.edgeId.localeCompare(right.edgeId) || left.attribute.localeCompare(right.attribute));
    const nodeAttributeReplacements = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^replace_node_attribute\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => nodeAttributeReplacementById[Number(match[1])])
      .filter((candidate): candidate is NodeAttributeReplacement => Boolean(candidate))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId) || left.attribute.localeCompare(right.attribute));
    const edgeAttributeReplacements = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^replace_edge_attribute\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => edgeAttributeReplacementById[Number(match[1])])
      .filter((candidate): candidate is EdgeAttributeReplacement => Boolean(candidate))
      .sort((left, right) => left.edgeId.localeCompare(right.edgeId) || left.attribute.localeCompare(right.attribute));
    const nodeTypeReplacements = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^replace_node_type\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => nodeTypeReplacementById[Number(match[1])])
      .filter((candidate): candidate is NodeTypeReplacement => Boolean(candidate))
      .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
    const edgeTypeReplacements = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^replace_edge_type\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => edgeTypeReplacementById[Number(match[1])])
      .filter((candidate): candidate is EdgeTypeReplacement => Boolean(candidate))
      .sort((left, right) => left.edgeId.localeCompare(right.edgeId));
    const edgeIntervalReplacements = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^replace_edge_interval\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => edgeIntervalReplacementById[Number(match[1])])
      .filter((candidate): candidate is EdgeIntervalReplacement => Boolean(candidate))
      .sort((left, right) => left.edgeId.localeCompare(right.edgeId));
    const key = JSON.stringify([
      edgeIds,
      nodeAttributes,
      edgeAttributes,
      nodeAttributeReplacements,
      edgeAttributeReplacements,
      nodeTypeReplacements,
      edgeTypeReplacements,
      edgeIntervalReplacements
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    const repair = {
      edgeIds,
      ...(edgeIds.length > 0
        ? { edgeCosts: Object.fromEntries(edgeIds.map((edgeId) => [edgeId, costByEdgeId[edgeId] ?? Number.POSITIVE_INFINITY])) }
        : {}),
      ...(nodeAttributes.length > 0 ? { nodeAttributes } : {}),
      ...(edgeAttributes.length > 0 ? { edgeAttributes } : {}),
      ...(nodeAttributeReplacements.length > 0 ? { nodeAttributeReplacements } : {}),
      ...(edgeAttributeReplacements.length > 0 ? { edgeAttributeReplacements } : {}),
      ...(nodeTypeReplacements.length > 0 ? { nodeTypeReplacements } : {}),
      ...(edgeTypeReplacements.length > 0 ? { edgeTypeReplacements } : {}),
      ...(edgeIntervalReplacements.length > 0 ? { edgeIntervalReplacements } : {}),
      cost: edgeIds.reduce((total, edgeId) => total + (costByEdgeId[edgeId] ?? Number.POSITIVE_INFINITY), 0) +
        nodeAttributes.reduce((total, candidate) => total + candidate.cost, 0) +
        edgeAttributes.reduce((total, candidate) => total + candidate.cost, 0) +
        nodeAttributeReplacements.reduce((total, candidate) => total + candidate.cost, 0) +
        edgeAttributeReplacements.reduce((total, candidate) => total + candidate.cost, 0) +
        nodeTypeReplacements.reduce((total, candidate) => total + candidate.cost, 0) +
        edgeTypeReplacements.reduce((total, candidate) => total + candidate.cost, 0) +
        edgeIntervalReplacements.reduce((total, candidate) => total + candidate.cost, 0)
    };
    if (!best || repair.cost < best.cost) best = repair;
  }
  return best;
}

/** @deprecated Use parseIntegrityRepairProposal. */
export const parseMinimumEdgeRemovalRepair = parseIntegrityRepairProposal;

function splitAspArguments(source: string): string[] {
  const args: string[] = [];
  let quoted = false;
  let escaped = false;
  let current = "";
  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (character === "," && !quoted) {
      args.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim() !== "") args.push(current.trim());
  return args;
}

function parseAspTerm(term: string): string | number {
  if (/^-?\d+$/.test(term)) return Number(term);
  if (term.startsWith('"') && term.endsWith('"')) {
    const source = term.slice(1, -1);
    let value = "";
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character !== "\\" || index + 1 >= source.length) {
        value += character;
        continue;
      }
      index += 1;
      const escaped = source[index];
      value += escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped === "t" ? "\t" : escaped;
    }
    return decodeAspStringPayload(value);
  }
  return term;
}

/** Parses shown violation/5 atoms and maps internal indices back to source IDs. */
export function parseIntegrityViolations(
  witnesses: unknown,
  reverseNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  decodeTemporalValue?: (value: number) => number | undefined
): IntegrityViolation[] {
  const temporalLabel = (value: string | number): string => {
    const numeric = typeof value === "number" ? value : Number(value);
    const decoded = Number.isInteger(numeric) ? decodeTemporalValue?.(numeric) : undefined;
    if (decoded === undefined) return String(value);
    const date = new Date(decoded);
    return Math.abs(decoded) >= 100_000_000_000 && Number.isFinite(date.getTime())
      ? date.toISOString()
      : String(decoded);
  };
  const result = new Map<string, IntegrityViolation>();
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    for (const atom of Array.isArray(value) ? value : []) {
      if (typeof atom !== "string" || !atom.startsWith("violation(") || !atom.endsWith(")")) continue;
      const terms = splitAspArguments(atom.slice("violation(".length, -1)).map(parseAspTerm);
      if (terms.length !== 5) continue;
      const [kindTerm, a, b, c, d] = terms;
      const kind = String(kindTerm);
      const nodeId = (value: string | number) => typeof value === "number" && value !== 0
        ? reverseNodeIndex[value]
        : undefined;
      const edgeId = (value: string | number) => typeof value === "number" && value !== 0
        ? reverseEdgeIndex[value]
        : undefined;
      let violation: IntegrityViolation;

      if (kind === "edge_endpoint_type") {
        violation = {
          kind,
          subjectId: edgeId(a),
          nodeIds: [nodeId(b), nodeId(c)].filter((id): id is string => Boolean(id)),
          edgeType: String(d)
        };
      } else if (kind === "missing_endpoint_node_type") {
        violation = {
          kind,
          subjectId: edgeId(a),
          nodeIds: [nodeId(b), nodeId(c)].filter((id): id is string => Boolean(id)),
          edgeType: String(d)
        };
      } else if (kind === "node_type_out_of_domain") {
        violation = {
          kind,
          subjectId: nodeId(a),
          nodeIds: [nodeId(a)].filter((id): id is string => Boolean(id)),
          value: String(b),
          expectedDescription: "tipo presente nel vocabolario allowedNodeTypes"
        };
      } else if (kind === "edge_type_out_of_domain") {
        violation = {
          kind,
          subjectId: edgeId(a),
          nodeIds: [],
          edgeIds: [edgeId(a)].filter((id): id is string => Boolean(id)),
          value: String(b),
          expectedDescription: "tipo presente nel vocabolario allowedEdgeTypes"
        };
      } else if (kind === "missing_node_type") {
        violation = { kind, subjectId: nodeId(a), nodeIds: [nodeId(a)].filter((id): id is string => Boolean(id)) };
      } else if (kind === "missing_edge_type") {
        violation = { kind, subjectId: edgeId(a), nodeIds: [] };
      } else if (kind === "missing_node_attribute") {
        violation = { kind, subjectId: nodeId(a), nodeIds: [nodeId(a)].filter((id): id is string => Boolean(id)), attribute: String(c) };
      } else if (kind === "missing_edge_attribute") {
        violation = { kind, subjectId: edgeId(a), nodeIds: [], attribute: String(c) };
      } else if (kind === "node_attribute_out_of_domain") {
        violation = {
          kind,
          subjectId: nodeId(a),
          nodeIds: [nodeId(a)].filter((id): id is string => Boolean(id)),
          attribute: String(b),
          value: String(c),
          expectedDescription: `valore nel dominio configurato per il tipo ${String(d)}`
        };
      } else if (kind === "edge_attribute_out_of_domain") {
        violation = {
          kind,
          subjectId: edgeId(a),
          nodeIds: [],
          edgeIds: [edgeId(a)].filter((id): id is string => Boolean(id)),
          attribute: String(b),
          value: String(c),
          edgeType: String(d),
          expectedDescription: `valore nel dominio configurato per il tipo ${String(d)}`
        };
      } else if (kind === "missing_edge_interval") {
        violation = { kind, subjectId: edgeId(a), nodeIds: [], attribute: String(b), edgeType: String(d) };
      } else if (kind === "invalid_edge_interval_value") {
        violation = { kind, subjectId: edgeId(a), nodeIds: [], attribute: String(b), value: String(c), edgeType: String(d) };
      } else if (kind === "invalid_edge_interval") {
        violation = {
          kind,
          subjectId: edgeId(a),
          nodeIds: [],
          value: `${temporalLabel(b)}..${temporalLabel(c)}`,
          edgeType: String(d)
        };
      } else if (kind === "duplicate_node_attribute") {
        violation = {
          kind,
          subjectId: nodeId(a),
          nodeIds: [nodeId(a), nodeId(b)].filter((id): id is string => Boolean(id)),
          attribute: String(c),
          value: String(d)
        };
      } else if (kind === "duplicate_edge_attribute") {
        violation = {
          kind,
          subjectId: edgeId(a),
          nodeIds: [],
          edgeIds: [edgeId(a), edgeId(b)].filter((id): id is string => Boolean(id)),
          attribute: String(c),
          value: String(d)
        };
      } else if (kind === "cardinality_min" || kind === "cardinality_max") {
        violation = {
          kind,
          subjectId: nodeId(a),
          nodeIds: [nodeId(a)].filter((id): id is string => Boolean(id)),
          expected: Number(b),
          actual: Number(c),
          edgeType: String(d)
        };
      } else {
        continue;
      }

      result.set(JSON.stringify(violation), violation);
    }
  }
  return [...result.values()];
}
