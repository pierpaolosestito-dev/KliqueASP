import {
  escapeAspString,
  parseGraphTimeValue,
  type AspTemporalEncoding,
  type GraphDirection,
  type GraphMotifTemplate
} from "./graphModel.ts";

export interface CompiledMotifTemplate {
  id: string;
  label: string;
  temporal: boolean;
  temporalSemantics?: "coValid" | "orderedByStart";
  strictTemporalOrder?: boolean;
  nearMatch: boolean;
  nearMatchTemporal?: boolean;
  roles: Array<{ name: string; nodeTypes: string[] }>;
  edges: Array<{ sourceRole: string; targetRole: string; edgeType: string }>;
  absentEdges: Array<{ sourceRole: string; targetRole: string; edgeType: string }>;
  inducedEdgeTypes: string[];
  closedWorld: boolean;
  program: string;
}

export interface TypedMotifMatch {
  templateId: string;
  label: string;
  timeValue?: number;
  roles: Record<string, { nodeId: string; sourceId: string }>;
  nodeIds: string[];
  supportingEdges: Array<{
    sourceRole: string;
    targetRole: string;
    edgeType: string;
    edgeIds: string[];
    startTimeValue?: number;
  }>;
  /** Absence conditions verified against the explicitly closed visible projection. */
  absenceConditions?: Array<{ sourceRole: string; targetRole: string; edgeType: string }>;
  inducedEdgeTypes?: string[];
}

export interface TypedMotifNearMatch {
  templateId: string;
  label: string;
  roles: Record<string, { nodeId: string; sourceId: string }>;
  missingRoles: string[];
  missingPatterns: Array<{ index: number; sourceRole: string; targetRole: string; edgeType: string }>;
  unresolvedPatterns: Array<{ index: number; sourceRole: string; targetRole: string; edgeType: string }>;
  violatedAbsencePatterns: Array<{ index: number; sourceRole: string; targetRole: string; edgeType: string; edgeIds: string[] }>;
  unresolvedAbsencePatterns: Array<{ index: number; sourceRole: string; targetRole: string; edgeType: string }>;
  supportingEdges: Array<{
    index: number;
    sourceRole: string;
    targetRole: string;
    edgeType: string;
    edgeIds: string[];
  }>;
  temporalEvidence?: {
    semantics: "coValid" | "orderedByStart";
    timeValue?: number;
    unavailablePatterns: Array<{ index: number; sourceRole: string; targetRole: string; edgeType: string }>;
    inactivePatterns: Array<{ index: number; sourceRole: string; targetRole: string; edgeType: string }>;
    orderViolations: Array<{ firstIndex: number; secondIndex: number }>;
    supportingEdges: Array<{
      index: number;
      sourceRole: string;
      targetRole: string;
      edgeType: string;
      edgeIds: string[];
      startTimeValue?: number;
    }>;
  };
}

export interface TypedMotifEdgeAdditionCandidate {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceNode: number;
  targetNode: number;
  edgeType: string;
  cost: number;
  recordIndex: number;
  validity?: { from: number; to: number };
}

export interface TypedMotifCounterfactual {
  templateId: string;
  label: string;
  totalCost: number;
  match: TypedMotifMatch;
  addedEdges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    edgeType: string;
    cost: number;
    patternIndexes: number[];
    validity?: { from: number; to: number };
  }>;
}

function parseCounterfactualTime(value: unknown, path: string): number {
  const normalized = parseGraphTimeValue(value);
  if (normalized !== null) return normalized;
  throw new TypeError(`${path} deve essere un intero sicuro oppure una data ISO valida`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireName(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${path} deve essere una stringa non vuota`);
  }
  return value.trim();
}

function requireNames(value: unknown, path: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${path} deve essere un array non vuoto`);
  }
  const names = value.map((name, index) => requireName(name, `${path}[${index}]`));
  if (new Set(names).size !== names.length) throw new TypeError(`${path} non deve contenere duplicati`);
  return names;
}

/** Compiles a typed role-based motif with positive edges and optional closed-world absences. */
export function buildTypedMotifProgram(
  templateInput: GraphMotifTemplate | unknown,
  direction: GraphDirection,
  group = "",
  nearMatch = false,
  nearMatchTemporal = false
): CompiledMotifTemplate {
  if (nearMatchTemporal && !nearMatch) {
    throw new TypeError("Il why-not temporale richiede la modalità near-match");
  }
  if (direction !== "directed" && direction !== "undirected") {
    throw new TypeError("La direzione del grafo deve essere 'directed' oppure 'undirected'");
  }
  if (!isRecord(templateInput)) throw new TypeError("Il template del motivo deve essere un oggetto JSON");
  const id = requireName(templateInput.id, "motif.id");
  const label = templateInput.label === undefined
    ? id
    : requireName(templateInput.label, "motif.label");
  const temporalInput = templateInput.temporal;
  let temporal = false;
  let temporalSemantics: CompiledMotifTemplate["temporalSemantics"];
  let strictTemporalOrder = false;
  if (temporalInput !== undefined) {
    if (!isRecord(temporalInput)) {
      throw new TypeError("motif.temporal deve essere un oggetto JSON");
    }
    if (temporalInput.semantics === "coValid") {
      if (Object.hasOwn(temporalInput, "strict")) {
        throw new TypeError("motif.temporal.strict è ammesso solo con semantics: 'orderedByStart'");
      }
      temporalSemantics = "coValid";
    } else if (temporalInput.semantics === "orderedByStart") {
      if (temporalInput.strict !== undefined && typeof temporalInput.strict !== "boolean") {
        throw new TypeError("motif.temporal.strict deve essere un booleano");
      }
      temporalSemantics = "orderedByStart";
      strictTemporalOrder = temporalInput.strict === true;
    } else {
      throw new TypeError("motif.temporal.semantics deve essere 'coValid' oppure 'orderedByStart'");
    }
    temporal = true;
  }
  if (nearMatchTemporal && !temporal) {
    throw new TypeError("Il why-not temporale richiede un template con semantica temporale");
  }
  if (!isRecord(templateInput.roles) || Object.keys(templateInput.roles).length < 2) {
    throw new TypeError("motif.roles deve dichiarare almeno due ruoli");
  }

  const roles = Object.entries(templateInput.roles).map(([name, roleInput]) => {
    const roleName = requireName(name, "motif.roles.<role>");
    if (!isRecord(roleInput)) throw new TypeError(`motif.roles.${roleName} deve essere un oggetto`);
    return {
      name: roleName,
      nodeTypes: requireNames(roleInput.nodeTypes, `motif.roles.${roleName}.nodeTypes`)
    };
  });
  if (new Set(roles.map((role) => role.name)).size !== roles.length) {
    throw new TypeError("motif.roles non deve contenere nomi duplicati dopo la normalizzazione");
  }
  const roleIndex = new Map(roles.map((role, index) => [role.name, index + 1]));

  if (!Array.isArray(templateInput.edges) || templateInput.edges.length === 0) {
    throw new TypeError("motif.edges deve contenere almeno una relazione");
  }
  const edges = templateInput.edges.map((edgeInput, index) => {
    if (!isRecord(edgeInput)) throw new TypeError(`motif.edges[${index}] deve essere un oggetto`);
    const sourceRole = requireName(edgeInput.sourceRole, `motif.edges[${index}].sourceRole`);
    const targetRole = requireName(edgeInput.targetRole, `motif.edges[${index}].targetRole`);
    const edgeType = requireName(edgeInput.edgeType, `motif.edges[${index}].edgeType`);
    if (!roleIndex.has(sourceRole) || !roleIndex.has(targetRole)) {
      throw new TypeError(`motif.edges[${index}] riferisce un ruolo non dichiarato`);
    }
    return { sourceRole, targetRole, edgeType };
  });
  if (templateInput.closedWorld !== undefined && typeof templateInput.closedWorld !== "boolean") {
    throw new TypeError("motif.closedWorld deve essere un booleano");
  }
  const absentEdgesInput = templateInput.absentEdges;
  let absentEdges: Array<{ sourceRole: string; targetRole: string; edgeType: string }> = [];
  if (absentEdgesInput !== undefined) {
    if (!Array.isArray(absentEdgesInput) || absentEdgesInput.length === 0) {
      throw new TypeError("motif.absentEdges deve contenere almeno una relazione da verificare come assente");
    }
    if (templateInput.closedWorld !== true) {
      throw new TypeError("motif.absentEdges richiede closedWorld: true per dichiarare che i dati visibili sono completi");
    }
    if (temporal) {
      throw new TypeError("motif.absentEdges non è ammesso nei template temporali: l'assenza richiede una semantica temporale esplicita");
    }
    absentEdges = absentEdgesInput.map((edgeInput, index) => {
      if (!isRecord(edgeInput)) throw new TypeError(`motif.absentEdges[${index}] deve essere un oggetto`);
      const sourceRole = requireName(edgeInput.sourceRole, `motif.absentEdges[${index}].sourceRole`);
      const targetRole = requireName(edgeInput.targetRole, `motif.absentEdges[${index}].targetRole`);
      const edgeType = requireName(edgeInput.edgeType, `motif.absentEdges[${index}].edgeType`);
      if (!roleIndex.has(sourceRole) || !roleIndex.has(targetRole)) {
        throw new TypeError(`motif.absentEdges[${index}] riferisce un ruolo non dichiarato`);
      }
      return { sourceRole, targetRole, edgeType };
    });
  }

  const inducedEdgeTypes = templateInput.inducedEdgeTypes === undefined
    ? []
    : requireNames(templateInput.inducedEdgeTypes, "motif.inducedEdgeTypes");
  const hasNegativeSemantics = absentEdges.length > 0 || inducedEdgeTypes.length > 0;
  if (hasNegativeSemantics && templateInput.closedWorld !== true) {
    throw new TypeError("motif.absentEdges e motif.inducedEdgeTypes richiedono closedWorld: true per dichiarare che i dati visibili sono completi");
  }
  if (hasNegativeSemantics && temporal) {
    throw new TypeError("motif.absentEdges e motif.inducedEdgeTypes non sono ammessi nei template temporali: l'assenza richiede una semantica temporale esplicita");
  }
  if (templateInput.closedWorld === true && !hasNegativeSemantics) {
    throw new TypeError("motif.closedWorld: true richiede almeno una relazione in motif.absentEdges oppure un tipo in motif.inducedEdgeTypes");
  }

  const edgeSignature = (sourceRole: string, targetRole: string, edgeType: string) => {
    const endpoints = direction === "undirected"
      ? [sourceRole, targetRole].sort()
      : [sourceRole, targetRole];
    return JSON.stringify([...endpoints, edgeType]);
  };
  const edgeSignatures = edges.map((edge) => edgeSignature(edge.sourceRole, edge.targetRole, edge.edgeType));
  if (new Set(edgeSignatures).size !== edgeSignatures.length) {
    throw new TypeError("motif.edges contiene relazioni duplicate; dichiarare esplicitamente una semantica di molteplicità");
  }
  const absentEdgeSignatures = absentEdges.map((edge) => edgeSignature(edge.sourceRole, edge.targetRole, edge.edgeType));
  if (new Set(absentEdgeSignatures).size !== absentEdgeSignatures.length) {
    throw new TypeError("motif.absentEdges contiene relazioni duplicate");
  }
  if (absentEdgeSignatures.some((signature) => edgeSignatures.includes(signature))) {
    throw new TypeError("La stessa relazione tipizzata non può essere richiesta presente e assente nello stesso template");
  }

  if (inducedEdgeTypes.length > 0) {
    const knownAbsenceSignatures = new Set(absentEdgeSignatures);
    for (let sourceIndex = 0; sourceIndex < roles.length; sourceIndex += 1) {
      const firstTargetIndex = direction === "directed" ? 0 : sourceIndex;
      for (let targetIndex = firstTargetIndex; targetIndex < roles.length; targetIndex += 1) {
        const sourceRole = roles[sourceIndex].name;
        const targetRole = roles[targetIndex].name;
        for (const edgeType of inducedEdgeTypes) {
          const signature = edgeSignature(sourceRole, targetRole, edgeType);
          if (edgeSignatures.includes(signature) || knownAbsenceSignatures.has(signature)) continue;
          absentEdges.push({ sourceRole, targetRole, edgeType });
          absentEdgeSignatures.push(signature);
          knownAbsenceSignatures.add(signature);
        }
      }
    }
  }

  const symmetricRolesInput = templateInput.symmetricRoles ?? [];
  if (!Array.isArray(symmetricRolesInput)) throw new TypeError("motif.symmetricRoles deve essere un array");
  const usedSymmetryRoles = new Set<string>();
  const symmetricRolePairs: Array<[string, string]> = [];
  for (const [groupIndex, roleGroupInput] of symmetricRolesInput.entries()) {
    const roleGroup = requireNames(roleGroupInput, `motif.symmetricRoles[${groupIndex}]`);
    if (roleGroup.length < 2) throw new TypeError(`motif.symmetricRoles[${groupIndex}] richiede almeno due ruoli`);
    const firstRole = roles.find((role) => role.name === roleGroup[0]);
    if (!firstRole) throw new TypeError(`Ruolo simmetrico non dichiarato: ${roleGroup[0]}`);
    const firstTypes = [...firstRole.nodeTypes].sort().join("\u0000");
    for (const roleName of roleGroup) {
      const role = roles.find((candidate) => candidate.name === roleName);
      if (!role) throw new TypeError(`Ruolo simmetrico non dichiarato: ${roleName}`);
      if ([...role.nodeTypes].sort().join("\u0000") !== firstTypes) {
        throw new TypeError(`I ruoli simmetrici devono consentire gli stessi tipi di nodo (${roleName})`);
      }
      if (usedSymmetryRoles.has(roleName)) {
        throw new TypeError(`Il ruolo '${roleName}' compare in più gruppi di simmetria`);
      }
      usedSymmetryRoles.add(roleName);
    }
    for (let index = 0; index < roleGroup.length - 1; index += 1) {
      const [firstRole, secondRole] = [roleGroup[index], roleGroup[index + 1]];
      const swapRole = (roleName: string) => roleName === firstRole
        ? secondRole
        : roleName === secondRole
          ? firstRole
          : roleName;
      const swappedSignaturesInOrder = edges.map((edge) => {
        return edgeSignature(swapRole(edge.sourceRole), swapRole(edge.targetRole), edge.edgeType);
      });
      const swappedAbsentSignatures = absentEdges.map((edge) =>
        edgeSignature(swapRole(edge.sourceRole), swapRole(edge.targetRole), edge.edgeType)
      );
      const swappedSignatures = temporalSemantics === "orderedByStart"
        ? swappedSignaturesInOrder
        : [
            ...swappedSignaturesInOrder.map((signature) => `present:${signature}`),
            ...swappedAbsentSignatures.map((signature) => `absent:${signature}`)
          ].sort();
      const actualSignatures = temporalSemantics === "orderedByStart"
        ? edgeSignatures
        : [
            ...edgeSignatures.map((signature) => `present:${signature}`),
            ...absentEdgeSignatures.map((signature) => `absent:${signature}`)
          ].sort();
      if (JSON.stringify(actualSignatures) !== JSON.stringify(swappedSignatures)) {
        throw new TypeError(`I ruoli '${firstRole}' e '${secondRole}' non sono simmetrici nella struttura del template`);
      }
      symmetricRolePairs.push([firstRole, secondRole]);
    }
  }

  const facts: string[] = [];
  roles.forEach((role, index) => {
    const roleId = index + 1;
    facts.push(`motif_role(${roleId}).`);
    for (const nodeType of role.nodeTypes) {
      facts.push(`motif_role_type(${roleId},${escapeAspString(nodeType)}).`);
    }
  });
  edges.forEach((edge, index) => {
    facts.push(
      `motif_edge(${index + 1},${roleIndex.get(edge.sourceRole)},${roleIndex.get(edge.targetRole)},${escapeAspString(edge.edgeType)}).`
    );
  });
  absentEdges.forEach((edge, index) => {
    facts.push(
      `motif_absent_edge(${index + 1},${roleIndex.get(edge.sourceRole)},${roleIndex.get(edge.targetRole)},${escapeAspString(edge.edgeType)}).`
    );
  });

  const domainRules = group
    ? [`candidate_node(N) :- node(N), group(N, ${escapeAspString(group)}).`]
    : ["candidate_node(N) :- node(N)."];
  const symmetryRules = symmetricRolePairs.map(([firstRole, secondRole]) =>
    `:- motif_match(${roleIndex.get(firstRole)},N1), motif_match(${roleIndex.get(secondRole)},N2), N1 > N2.`
  );
  const nearMatchSymmetryRules = nearMatch
    ? symmetricRolePairs.map(([firstRole, secondRole]) =>
      `:- motif_match(${roleIndex.get(secondRole)},_), not motif_match(${roleIndex.get(firstRole)},_).`
    )
    : [];
  const directionRules = direction === "undirected"
    ? ["motif_edge_relation(E,U,V,T) :- edge_type(E,T), edge_source(E,U), edge_target(E,V).", "motif_edge_relation(E,U,V,T) :- edge_type(E,T), edge_source(E,V), edge_target(E,U)."]
    : ["motif_edge_relation(E,U,V,T) :- edge_type(E,T), edge_source(E,U), edge_target(E,V)."];
  const motifRules = nearMatch
    ? [
      "0 { motif_match(R,N) : motif_candidate(R,N) } 1 :- motif_role(R).",
      "motif_role_unassigned(R) :- motif_role(R), not motif_match(R,_).",
      "motif_edge_missing(I) :- motif_edge(I,R1,R2,_), motif_match(R1,_), motif_match(R2,_), not motif_edge_satisfied(I).",
      "motif_edge_unresolved(I) :- motif_edge(I,R1,R2,_), not motif_match(R1,_).",
      "motif_edge_unresolved(I) :- motif_edge(I,R1,R2,_), not motif_match(R2,_).",
      "motif_absent_edge_unresolved(I) :- motif_absent_edge(I,R1,R2,_), not motif_match(R1,_).",
      "motif_absent_edge_unresolved(I) :- motif_absent_edge(I,R1,R2,_), not motif_match(R2,_)."
    ]
    : [
      "1 { motif_match(R,N) : motif_candidate(R,N) } 1 :- motif_role(R)."
    ];
  const temporalRules = !nearMatch && temporalSemantics === "coValid"
    ? [
      "motif_candidate_time(T) :- edge_valid_from(_,T).",
      "motif_edge_active(I,E,T) :- motif_edge_witness(I,E), edge_valid_from(E,From), edge_valid_to(E,To), motif_candidate_time(T), From <= T, T <= To.",
      "motif_pattern_active(I,T) :- motif_edge_active(I,_,T).",
      "motif_pattern_missing(T) :- motif_candidate_time(T), motif_edge(I,_,_,_), not motif_pattern_active(I,T).",
      "motif_time_valid(T) :- motif_candidate_time(T), not motif_pattern_missing(T).",
      "1 { motif_time(T) : motif_time_valid(T) } 1.",
      ":- motif_time(T), motif_time_valid(S), S < T.",
      "motif_edge_support(I,E) :- motif_edge_active(I,E,T), motif_time(T).",
      "#show motif_time/1.",
      "#show motif_edge_support/2."
    ]
    : !nearMatch && temporalSemantics === "orderedByStart"
      ? [
        "1 { motif_ordered_support(I,E,T) : motif_edge_witness(I,E), edge_valid_from(E,T), edge_valid_to(E,To), T <= To } 1 :- motif_edge(I,_,_,_).",
        `:- motif_ordered_support(I,_,T), motif_ordered_support(J,_,S), I < J, T ${strictTemporalOrder ? ">=" : ">"} S.`,
        "#show motif_ordered_support/3."
      ]
      : nearMatch
        ? []
        : ["motif_edge_support(I,E) :- motif_edge_witness(I,E).", "#show motif_edge_support/2."];
  const temporalNearMatchRules = nearMatchTemporal && temporalSemantics === "coValid"
    ? [
      "motif_temporal_interval(I,E,From,To) :- motif_edge_witness(I,E), edge_valid_from(E,From), edge_valid_to(E,To), From <= To.",
      "motif_temporal_valid(I) :- motif_temporal_interval(I,_,_,_).",
      "motif_temporal_unavailable(I) :- motif_edge_satisfied(I), not motif_temporal_valid(I).",
      "motif_candidate_time(From) :- motif_temporal_interval(_,_,From,_).",
      "motif_candidate_time(To) :- motif_temporal_interval(_,_,_,To).",
      "motif_pattern_active(I,T) :- motif_temporal_interval(I,_,From,To), motif_candidate_time(T), From <= T, T <= To.",
      "1 { motif_diagnostic_time(T) : motif_candidate_time(T) } 1 :- motif_candidate_time(_).",
      "motif_temporal_inactive(I) :- motif_temporal_valid(I), motif_diagnostic_time(T), not motif_pattern_active(I,T).",
      "motif_diagnostic_active(I,E) :- motif_temporal_interval(I,E,From,To), motif_diagnostic_time(T), From <= T, T <= To.",
      "#minimize { 1@1,I : motif_temporal_unavailable(I); 1@1,I : motif_temporal_inactive(I) }.",
      "#show motif_diagnostic_time/1.",
      "#show motif_diagnostic_active/2.",
      "#show motif_temporal_unavailable/1.",
      "#show motif_temporal_inactive/1."
    ]
    : nearMatchTemporal && temporalSemantics === "orderedByStart"
      ? [
        "motif_temporal_interval(I,E,T) :- motif_edge_witness(I,E), edge_valid_from(E,T), edge_valid_to(E,To), T <= To.",
        "motif_temporal_valid(I) :- motif_temporal_interval(I,_,_).",
        "motif_temporal_unavailable(I) :- motif_edge_satisfied(I), not motif_temporal_valid(I).",
        "1 { motif_diagnostic_support(I,E,T) : motif_temporal_interval(I,E,T) } 1 :- motif_temporal_valid(I).",
        ...edges.slice(0, -1).map((_, index) => `motif_adjacent(${index + 1},${index + 2}).`),
        `motif_order_violation(I,J) :- motif_adjacent(I,J), motif_diagnostic_support(I,_,T), motif_diagnostic_support(J,_,S), T ${strictTemporalOrder ? ">=" : ">"} S.`,
        "#minimize { 1@1,I,J : motif_order_violation(I,J); 1@1,I : motif_temporal_unavailable(I) }.",
        "#show motif_diagnostic_support/3.",
        "#show motif_temporal_unavailable/1.",
        "#show motif_order_violation/2."
      ]
      : [];
  const rules = [
    ...domainRules,
    "motif_candidate(R,N) :- motif_role_type(R,T), node_type(N,T), candidate_node(N).",
    ...motifRules,
    ":- motif_match(R1,N), motif_match(R2,N), R1 < R2.",
    ...symmetryRules,
    ...nearMatchSymmetryRules,
    ...directionRules,
    "motif_edge_witness(I,E) :- motif_edge(I,R1,R2,T), motif_match(R1,U), motif_match(R2,V), motif_edge_relation(E,U,V,T).",
    "motif_edge_satisfied(I) :- motif_edge_witness(I,_).",
    "motif_absent_edge_violation_witness(I,E) :- motif_absent_edge(I,R1,R2,T), motif_match(R1,U), motif_match(R2,V), motif_edge_relation(E,U,V,T).",
    "motif_absent_edge_violated(I) :- motif_absent_edge_violation_witness(I,_).",
    ...(nearMatch
      ? [
        `#minimize { 1@${nearMatchTemporal ? 3 : 2},R : motif_role_unassigned(R) }.`,
        `#minimize { 1@${nearMatchTemporal ? 2 : 1},missing,I : motif_edge_missing(I); 1@${nearMatchTemporal ? 2 : 1},forbidden,I : motif_absent_edge_violated(I) }.`,
        "#show motif_role_unassigned/1.",
        "#show motif_edge_missing/1.",
        "#show motif_edge_unresolved/1.",
        "#show motif_absent_edge_violated/1.",
        "#show motif_absent_edge_unresolved/1.",
        "#show motif_absent_edge_violation_witness/2.",
        "#show motif_edge_witness/2."
      ]
      : [
        ":- motif_edge(I,_,_,_), not motif_edge_satisfied(I).",
        ":- motif_absent_edge_violated(I)."
      ]),
    "#show motif_match/2.",
    ...temporalRules,
    ...temporalNearMatchRules
  ];

  return {
    id,
    label,
    temporal,
    temporalSemantics,
    strictTemporalOrder,
    nearMatch,
    nearMatchTemporal,
    roles,
    edges,
    absentEdges,
    inducedEdgeTypes,
    closedWorld: absentEdges.length > 0,
    program: [...facts, ...rules].join("\n")
  };
}

/** Finds one lexicographically best partial role assignment and its missing structural patterns. */
export function buildTypedMotifNearMatchProgram(
  templateInput: GraphMotifTemplate | unknown,
  direction: GraphDirection,
  group = ""
): CompiledMotifTemplate {
  return buildTypedMotifProgram(templateInput, direction, group, true);
}

/** Finds the best partial temporal motif match and reports the chosen temporal witnesses or blockers. */
export function buildTypedMotifTemporalNearMatchProgram(
  templateInput: GraphMotifTemplate | unknown,
  direction: GraphDirection,
  group = ""
): CompiledMotifTemplate {
  return buildTypedMotifProgram(templateInput, direction, group, true, true);
}

/** Finds a minimum-cost set of explicitly authorized hypothetical edge additions that satisfies a motif. */
export function buildTypedMotifCompletionCounterfactualProgram(
  templateInput: GraphMotifTemplate | unknown,
  direction: GraphDirection,
  group: string,
  candidatesInput: unknown,
  temporalEncoding?: AspTemporalEncoding
): { template: CompiledMotifTemplate; candidates: TypedMotifEdgeAdditionCandidate[]; program: string } {
  const template = buildTypedMotifProgram(templateInput, direction, group);
  if (!Array.isArray(candidatesInput) || candidatesInput.length === 0) {
    throw new TypeError("graphAnalysis.counterfactuals.edgeAdditions deve elencare almeno un arco candidato");
  }
  const seenIds = new Set<string>();
  const seenRecordIndexes = new Set<number>();
  const aspValidityByRecord = new Map<number, { from: number; to: number }>();
  let maximumPossibleCost = 0;
  const candidates = candidatesInput.map((input, index): TypedMotifEdgeAdditionCandidate => {
    if (!isRecord(input)) {
      throw new TypeError(`edgeAdditions[${index}] deve essere un oggetto`);
    }
    const id = requireName(input.id, `edgeAdditions[${index}].id`);
    const sourceNodeId = requireName(input.sourceNodeId, `edgeAdditions[${index}].sourceNodeId`);
    const targetNodeId = requireName(input.targetNodeId, `edgeAdditions[${index}].targetNodeId`);
    const edgeType = requireName(input.edgeType, `edgeAdditions[${index}].edgeType`);
    const sourceNode = input.sourceNode;
    const targetNode = input.targetNode;
    const cost = input.cost;
    const recordIndex = input.recordIndex;
    if (typeof sourceNode !== "number" || !Number.isSafeInteger(sourceNode) || sourceNode < 1 ||
      typeof targetNode !== "number" || !Number.isSafeInteger(targetNode) || targetNode < 1) {
      throw new TypeError(`edgeAdditions[${index}] deve riferirsi a due nodi ASP validi`);
    }
    if (sourceNode === targetNode) throw new TypeError(`edgeAdditions[${index}] non può essere un cappio`);
    if (typeof cost !== "number" || !Number.isSafeInteger(cost) || cost < 1) {
      throw new TypeError(`edgeAdditions[${index}].cost deve essere un intero positivo sicuro`);
    }
    if (typeof recordIndex !== "number" || !Number.isSafeInteger(recordIndex) || recordIndex < 1 || seenRecordIndexes.has(recordIndex)) {
      throw new TypeError(`edgeAdditions[${index}].recordIndex deve essere un indice ASP positivo e univoco`);
    }
    if (seenIds.has(id)) throw new TypeError(`edgeAdditions contiene l'ID duplicato '${id}'`);
    seenIds.add(id);
    seenRecordIndexes.add(recordIndex);
    maximumPossibleCost += cost;
    if (!Number.isSafeInteger(maximumPossibleCost)) {
      throw new TypeError("La somma dei costi dei candidati supera l'intero sicuro JavaScript");
    }

    let validity: TypedMotifEdgeAdditionCandidate["validity"];
    if (template.temporal) {
      if (!isRecord(input.validity) || input.validity.from === undefined || input.validity.to === undefined) {
        throw new TypeError(`edgeAdditions[${index}].validity deve dichiarare from e to per un motivo temporale`);
      }
      validity = {
        from: parseCounterfactualTime(input.validity.from, `edgeAdditions[${index}].validity.from`),
        to: parseCounterfactualTime(input.validity.to, `edgeAdditions[${index}].validity.to`)
      };
      if (validity.from > validity.to) {
        throw new TypeError(`edgeAdditions[${index}].validity.from deve essere minore o uguale a to`);
      }
      const aspFrom = temporalEncoding ? temporalEncoding.encode(input.validity.from) : validity.from;
      const aspTo = temporalEncoding ? temporalEncoding.encode(input.validity.to) : validity.to;
      if (aspFrom === null || aspTo === null) {
        throw new RangeError(`edgeAdditions[${index}].validity non è inclusa nella codifica temporale ASP del grafo`);
      }
      aspValidityByRecord.set(recordIndex, { from: aspFrom, to: aspTo });
    }

    return {
      id,
      sourceNodeId,
      targetNodeId,
      sourceNode,
      targetNode,
      edgeType,
      cost,
      recordIndex,
      ...(validity ? { validity } : {})
    };
  });

  const candidateFacts = candidates.flatMap((candidate) => [
    `cf_candidate_edge(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode},${escapeAspString(candidate.edgeType)},${candidate.cost}).`,
    ...(candidate.validity
      ? (() => {
        const encoded = aspValidityByRecord.get(candidate.recordIndex);
        if (!encoded) throw new RangeError(`edgeAdditions.${candidate.id}.validity non è stata codificata per ASP`);
        return [`cf_candidate_interval(${candidate.recordIndex},${encoded.from},${encoded.to}).`];
      })()
      : [])
  ]);
  const candidateRules = [
    "{ cf_add_edge(E) } :- cf_candidate_edge(E,_,_,_,_).",
    "edge_record(E) :- cf_add_edge(E).",
    "edge_source(E,U) :- cf_add_edge(E), cf_candidate_edge(E,U,_,_,_).",
    "edge_target(E,V) :- cf_add_edge(E), cf_candidate_edge(E,_,V,_,_).",
    "edge_type(E,T) :- cf_add_edge(E), cf_candidate_edge(E,_,_,T,_).",
    "edge_valid_from(E,From) :- cf_add_edge(E), cf_candidate_interval(E,From,_).",
    "edge_valid_to(E,To) :- cf_add_edge(E), cf_candidate_interval(E,_,To).",
    "#minimize { Cost,E : cf_add_edge(E), cf_candidate_edge(E,_,_,_,Cost) }.",
    "#show cf_add_edge/1."
  ];
  return {
    template,
    candidates,
    program: [template.program, ...candidateFacts, ...candidateRules].join("\n")
  };
}

/** Maps role assignments and supporting edge records back to source IDs. */
export function parseTypedMotifMatches(
  witnesses: unknown,
  template: CompiledMotifTemplate,
  reverseNodeIndex: Record<number, string>,
  reverseSourceNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  syntheticSupportIndices: ReadonlySet<number> = new Set(),
  decodeTemporalValue?: (value: number) => number | undefined
): TypedMotifMatch[] {
  const seen = new Set<string>();
  const matches: TypedMotifMatch[] = [];
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    const roleNodeIndices = new Map<number, number>();
    const supportIndices = new Map<number, number[]>();
    const orderedSupportIndices = new Map<number, Array<{ edgeIndex: number; startTimeValue?: number }>>();
    let timeValue: number | undefined;
    for (const atom of Array.isArray(value) ? value : []) {
      if (typeof atom !== "string") continue;
      const roleMatch = /^motif_match\((\d+),(\d+)\)$/.exec(atom);
      if (roleMatch) {
        roleNodeIndices.set(Number(roleMatch[1]), Number(roleMatch[2]));
        continue;
      }
      const supportMatch = /^motif_edge_support\((\d+),(\d+)\)$/.exec(atom);
      if (supportMatch) {
        const patternIndex = Number(supportMatch[1]);
        const edgeIndices = supportIndices.get(patternIndex) ?? [];
        edgeIndices.push(Number(supportMatch[2]));
        supportIndices.set(patternIndex, edgeIndices);
        continue;
      }
      const orderedSupportMatch = /^motif_ordered_support\((\d+),(\d+),(-?\d+)\)$/.exec(atom);
      if (orderedSupportMatch) {
        const patternIndex = Number(orderedSupportMatch[1]);
        const supportRecords = orderedSupportIndices.get(patternIndex) ?? [];
        const rawTime = Number(orderedSupportMatch[3]);
        const startTimeValue = decodeTemporalValue ? decodeTemporalValue(rawTime) : rawTime;
        supportRecords.push({
          edgeIndex: Number(orderedSupportMatch[2]),
          ...(startTimeValue === undefined ? {} : { startTimeValue })
        });
        orderedSupportIndices.set(patternIndex, supportRecords);
        continue;
      }
      const timeMatch = /^motif_time\((-?\d+)\)$/.exec(atom);
      if (timeMatch) {
        const rawTime = Number(timeMatch[1]);
        timeValue = decodeTemporalValue ? decodeTemporalValue(rawTime) : rawTime;
      }
    }

    if (roleNodeIndices.size !== template.roles.length) continue;
    const roles: TypedMotifMatch["roles"] = {};
    const nodeIds: string[] = [];
    let valid = true;
    template.roles.forEach((role, index) => {
      const nodeIndex = roleNodeIndices.get(index + 1);
      const nodeId = nodeIndex === undefined ? undefined : reverseNodeIndex[nodeIndex];
      const sourceId = nodeIndex === undefined ? undefined : reverseSourceNodeIndex[nodeIndex];
      if (!nodeId || !sourceId) {
        valid = false;
        return;
      }
      roles[role.name] = { nodeId, sourceId };
      nodeIds.push(nodeId);
    });
    if (!valid) continue;

    if (template.temporalSemantics === "orderedByStart") {
      const hasOneMappedWitnessPerPattern = template.edges.every((_, index) => {
        const support = orderedSupportIndices.get(index + 1) ?? [];
        return support.length === 1 &&
          (Boolean(reverseEdgeIndex[support[0].edgeIndex]) || syntheticSupportIndices.has(support[0].edgeIndex));
      });
      if (!hasOneMappedWitnessPerPattern) continue;
    }

    const roleKey = template.roles.map((role) => roles[role.name].nodeId).join("\u0000");
    const orderedSupportKey = template.temporalSemantics === "orderedByStart"
      ? template.edges.map((_, index) => (orderedSupportIndices.get(index + 1) ?? [])
          .map((support) => `${support.edgeIndex}@${support.startTimeValue}`)
          .sort()
          .join(",")).join("\u0000")
      : "";
    const key = `${roleKey}\u0001${orderedSupportKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const supportingEdges = template.edges.map((edge, index) => ({
      ...edge,
      edgeIds: template.temporalSemantics === "orderedByStart"
        ? [...new Set((orderedSupportIndices.get(index + 1) ?? [])
            .map((support) => reverseEdgeIndex[support.edgeIndex])
            .filter((edgeId): edgeId is string => Boolean(edgeId)))].sort()
        : [...new Set((supportIndices.get(index + 1) ?? [])
            .map((edgeIndex) => reverseEdgeIndex[edgeIndex])
            .filter((edgeId): edgeId is string => Boolean(edgeId)))].sort(),
      ...(template.temporalSemantics === "orderedByStart"
        ? { startTimeValue: orderedSupportIndices.get(index + 1)?.[0]?.startTimeValue }
        : {})
    }));
    matches.push({
      templateId: template.id,
      label: template.label,
      timeValue,
      roles,
      nodeIds,
      supportingEdges,
      ...(template.inducedEdgeTypes.length > 0
        ? { inducedEdgeTypes: [...template.inducedEdgeTypes] }
        : {}),
      ...(template.closedWorld
        ? { absenceConditions: template.absentEdges.map((edge) => ({ ...edge })) }
        : {})
    });
  }
  return matches;
}

/** Maps one minimum-cost completion model to observed and hypothetical edge records. */
export function parseTypedMotifCompletionCounterfactuals(
  witnesses: unknown,
  template: CompiledMotifTemplate,
  candidates: TypedMotifEdgeAdditionCandidate[],
  reverseNodeIndex: Record<number, string>,
  reverseSourceNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  decodeTemporalValue?: (value: number) => number | undefined
): TypedMotifCounterfactual[] {
  const candidateByRecord = new Map(candidates.map((candidate) => [candidate.recordIndex, candidate]));
  const syntheticSupportIndices = new Set(candidateByRecord.keys());
  const allWitnesses = Array.isArray(witnesses)
    ? witnesses.filter((witness) => witness !== null && typeof witness === "object")
    : [];
  const costsOf = (witness: unknown): number[] => {
    const costs = (witness as Record<string, unknown>).Costs;
    return Array.isArray(costs) && costs.every((cost) => typeof cost === "number")
      ? costs as number[]
      : [];
  };
  const compareCosts = (left: number[], right: number[]): number => {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const difference = (left[index] ?? 0) - (right[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  };
  let bestCosts: number[] | undefined;
  for (const witness of allWitnesses) {
    const costs = costsOf(witness);
    if (costs.length > 0 && (!bestCosts || compareCosts(costs, bestCosts) < 0)) bestCosts = costs;
  }
  if (!bestCosts) return [];

  const results: TypedMotifCounterfactual[] = [];
  const seen = new Set<string>();
  const optimalWitnesses = allWitnesses.filter((witness) => compareCosts(costsOf(witness), bestCosts!) === 0);
  for (const witness of optimalWitnesses) {
    const value = (witness as Record<string, unknown>).Value;
    const atoms = (Array.isArray(value) ? value : []).filter((atom): atom is string => typeof atom === "string");
    const addedRecordIndexes = atoms
      .map((atom) => /^cf_add_edge\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => Number(match[1]));
    const selectedCandidates = addedRecordIndexes
      .map((recordIndex) => candidateByRecord.get(recordIndex))
      .filter((candidate): candidate is TypedMotifEdgeAdditionCandidate => Boolean(candidate));
    if (selectedCandidates.length !== addedRecordIndexes.length) continue;
    const supportsByCandidate = new Map<number, Set<number>>();
    for (const atom of atoms) {
      const support = /^motif_edge_support\((\d+),(\d+)\)$/.exec(atom) ??
        /^motif_ordered_support\((\d+),(\d+),-?\d+\)$/.exec(atom);
      if (!support) continue;
      const patternIndex = Number(support[1]);
      const recordIndex = Number(support[2]);
      if (!candidateByRecord.has(recordIndex)) continue;
      const indexes = supportsByCandidate.get(recordIndex) ?? new Set<number>();
      indexes.add(patternIndex);
      supportsByCandidate.set(recordIndex, indexes);
    }
    if (selectedCandidates.some((candidate) => !supportsByCandidate.get(candidate.recordIndex)?.size)) continue;
    const matches = parseTypedMotifMatches(
      [witness],
      template,
      reverseNodeIndex,
      reverseSourceNodeIndex,
      reverseEdgeIndex,
      syntheticSupportIndices,
      decodeTemporalValue
    );
    const match = matches[0];
    if (!match) continue;
    const addedEdges = selectedCandidates.map((candidate) => ({
      id: candidate.id,
      sourceNodeId: candidate.sourceNodeId,
      targetNodeId: candidate.targetNodeId,
      edgeType: candidate.edgeType,
      cost: candidate.cost,
      patternIndexes: [...(supportsByCandidate.get(candidate.recordIndex) ?? [])].sort((left, right) => left - right),
      ...(candidate.validity ? { validity: candidate.validity } : {})
    }));
    const totalCost = addedEdges.reduce((sum, edge) => sum + edge.cost, 0);
    if (!Number.isSafeInteger(totalCost) || compareCosts([totalCost], bestCosts) !== 0) continue;
    const key = `${template.roles.map((role) => match.roles[role.name]?.nodeId ?? "").join("\u0000")}\u0001${addedEdges.map((edge) => edge.id).sort().join("\u0000")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ templateId: template.id, label: template.label, totalCost, match, addedEdges });
  }
  return results;
}

/** Parses the best structural near-match and reports violated or unresolved absence conditions. */
export function parseTypedMotifNearMatches(
  witnesses: unknown,
  template: CompiledMotifTemplate,
  reverseNodeIndex: Record<number, string>,
  reverseSourceNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  decodeTemporalValue?: (value: number) => number | undefined
): TypedMotifNearMatch[] {
  const results: TypedMotifNearMatch[] = [];
  const candidates = Array.isArray(witnesses)
    ? witnesses.filter((witness) => witness !== null && typeof witness === "object")
    : [];
  const costsOf = (witness: unknown): number[] => {
    const costs = (witness as Record<string, unknown>).Costs;
    return Array.isArray(costs) && costs.every((cost) => typeof cost === "number")
      ? costs as number[]
      : [];
  };
  const compareCosts = (left: number[], right: number[]): number => {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const difference = (left[index] ?? 0) - (right[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  };
  let bestCosts: number[] | undefined;
  for (const witness of candidates) {
    const costs = costsOf(witness);
    if (costs.length > 0 && (!bestCosts || compareCosts(costs, bestCosts) < 0)) bestCosts = costs;
  }
  const selectedWitnesses = bestCosts
    ? candidates.filter((witness) => compareCosts(costsOf(witness), bestCosts!) === 0)
    : [];
  for (const witness of selectedWitnesses) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    const roleNodeIndices = new Map<number, number>();
    const missingRoleIndices = new Set<number>();
    const missingPatternIndices = new Set<number>();
    const unresolvedPatternIndices = new Set<number>();
    const violatedAbsenceIndices = new Set<number>();
    const unresolvedAbsenceIndices = new Set<number>();
    const absenceViolationWitnessIndices = new Map<number, number[]>();
    const edgeWitnessIndices = new Map<number, number[]>();
    const temporalUnavailableIndices = new Set<number>();
    const temporalInactiveIndices = new Set<number>();
    const temporalSupportIndices = new Map<number, Array<{ edgeIndex: number; startTimeValue?: number }>>();
    const orderViolationPairs = new Set<string>();
    let temporalTimeValue: number | undefined;
    for (const atom of Array.isArray(value) ? value : []) {
      if (typeof atom !== "string") continue;
      const roleMatch = /^motif_match\((\d+),(\d+)\)$/.exec(atom);
      if (roleMatch) {
        roleNodeIndices.set(Number(roleMatch[1]), Number(roleMatch[2]));
        continue;
      }
      const missingRoleMatch = /^motif_role_unassigned\((\d+)\)$/.exec(atom);
      if (missingRoleMatch) {
        missingRoleIndices.add(Number(missingRoleMatch[1]));
        continue;
      }
      const missingPatternMatch = /^motif_edge_missing\((\d+)\)$/.exec(atom);
      if (missingPatternMatch) {
        missingPatternIndices.add(Number(missingPatternMatch[1]));
        continue;
      }
      const unresolvedPatternMatch = /^motif_edge_unresolved\((\d+)\)$/.exec(atom);
      if (unresolvedPatternMatch) {
        unresolvedPatternIndices.add(Number(unresolvedPatternMatch[1]));
        continue;
      }
      const violatedAbsenceMatch = /^motif_absent_edge_violated\((\d+)\)$/.exec(atom);
      if (violatedAbsenceMatch) {
        violatedAbsenceIndices.add(Number(violatedAbsenceMatch[1]));
        continue;
      }
      const unresolvedAbsenceMatch = /^motif_absent_edge_unresolved\((\d+)\)$/.exec(atom);
      if (unresolvedAbsenceMatch) {
        unresolvedAbsenceIndices.add(Number(unresolvedAbsenceMatch[1]));
        continue;
      }
      const absenceViolationWitnessMatch = /^motif_absent_edge_violation_witness\((\d+),(\d+)\)$/.exec(atom);
      if (absenceViolationWitnessMatch) {
        const index = Number(absenceViolationWitnessMatch[1]);
        const edgeIndices = absenceViolationWitnessIndices.get(index) ?? [];
        edgeIndices.push(Number(absenceViolationWitnessMatch[2]));
        absenceViolationWitnessIndices.set(index, edgeIndices);
        continue;
      }
      const edgeMatch = /^motif_edge_witness\((\d+),(\d+)\)$/.exec(atom);
      if (edgeMatch) {
        const index = Number(edgeMatch[1]);
        const edgeIndices = edgeWitnessIndices.get(index) ?? [];
        edgeIndices.push(Number(edgeMatch[2]));
        edgeWitnessIndices.set(index, edgeIndices);
        continue;
      }
      const temporalTimeMatch = /^motif_diagnostic_time\((-?\d+)\)$/.exec(atom);
      if (temporalTimeMatch) {
        const rawTime = Number(temporalTimeMatch[1]);
        temporalTimeValue = decodeTemporalValue ? decodeTemporalValue(rawTime) : rawTime;
        continue;
      }
      const temporalSupportMatch = /^motif_diagnostic_(?:active|support)\((\d+),(\d+)(?:,(-?\d+))?\)$/.exec(atom);
      if (temporalSupportMatch) {
        const index = Number(temporalSupportMatch[1]);
        const records = temporalSupportIndices.get(index) ?? [];
        const rawTime = temporalSupportMatch[3] === undefined ? undefined : Number(temporalSupportMatch[3]);
        const startTimeValue = rawTime === undefined
          ? undefined
          : decodeTemporalValue ? decodeTemporalValue(rawTime) : rawTime;
        records.push({
          edgeIndex: Number(temporalSupportMatch[2]),
          ...(startTimeValue === undefined ? {} : { startTimeValue })
        });
        temporalSupportIndices.set(index, records);
        continue;
      }
      const temporalUnavailableMatch = /^motif_temporal_unavailable\((\d+)\)$/.exec(atom);
      if (temporalUnavailableMatch) {
        temporalUnavailableIndices.add(Number(temporalUnavailableMatch[1]));
        continue;
      }
      const temporalInactiveMatch = /^motif_temporal_inactive\((\d+)\)$/.exec(atom);
      if (temporalInactiveMatch) {
        temporalInactiveIndices.add(Number(temporalInactiveMatch[1]));
        continue;
      }
      const orderViolationMatch = /^motif_order_violation\((\d+),(\d+)\)$/.exec(atom);
      if (orderViolationMatch) {
        orderViolationPairs.add(`${Number(orderViolationMatch[1])}:${Number(orderViolationMatch[2])}`);
      }
    }

    const roles: TypedMotifNearMatch["roles"] = {};
    let valid = true;
    template.roles.forEach((role, index) => {
      const nodeIndex = roleNodeIndices.get(index + 1);
      if (nodeIndex === undefined) return;
      const nodeId = reverseNodeIndex[nodeIndex];
      const sourceId = reverseSourceNodeIndex[nodeIndex];
      if (!nodeId || !sourceId) {
        valid = false;
        return;
      }
      roles[role.name] = { nodeId, sourceId };
    });
    if (!valid || template.roles.some((_, index) => {
      const isMapped = roleNodeIndices.has(index + 1);
      return isMapped === missingRoleIndices.has(index + 1);
    })) continue;

    const patterns = template.edges.map((edge, index) => ({ index: index + 1, ...edge }));
    const absencePatterns = template.absentEdges.map((edge, index) => ({ index: index + 1, ...edge }));
    const temporalPatterns = patterns;
    const temporalEvidence = template.nearMatchTemporal && template.temporalSemantics
      ? {
        semantics: template.temporalSemantics,
        ...(temporalTimeValue === undefined ? {} : { timeValue: temporalTimeValue }),
        unavailablePatterns: temporalPatterns.filter((pattern) => temporalUnavailableIndices.has(pattern.index)),
        inactivePatterns: temporalPatterns.filter((pattern) => temporalInactiveIndices.has(pattern.index)),
        orderViolations: [...orderViolationPairs].map((pair) => {
          const [firstIndex, secondIndex] = pair.split(":").map(Number);
          return { firstIndex, secondIndex };
        }).sort((left, right) => left.firstIndex - right.firstIndex || left.secondIndex - right.secondIndex),
        supportingEdges: temporalPatterns.map((pattern) => ({
          ...pattern,
          edgeIds: [...new Set((temporalSupportIndices.get(pattern.index) ?? [])
            .map((support) => reverseEdgeIndex[support.edgeIndex])
            .filter((edgeId): edgeId is string => Boolean(edgeId)))].sort(),
          ...((temporalSupportIndices.get(pattern.index) ?? []).length === 1 &&
            temporalSupportIndices.get(pattern.index)?.[0]?.startTimeValue !== undefined
            ? { startTimeValue: temporalSupportIndices.get(pattern.index)?.[0]?.startTimeValue }
            : {})
        }))
      }
      : undefined;
    results.push({
      templateId: template.id,
      label: template.label,
      roles,
      missingRoles: template.roles.flatMap((role, index) => missingRoleIndices.has(index + 1) ? [role.name] : []),
      missingPatterns: patterns.filter((pattern) => missingPatternIndices.has(pattern.index)),
      unresolvedPatterns: patterns.filter((pattern) => unresolvedPatternIndices.has(pattern.index)),
      violatedAbsencePatterns: absencePatterns
        .filter((pattern) => violatedAbsenceIndices.has(pattern.index))
        .map((pattern) => ({
          ...pattern,
          edgeIds: [...new Set((absenceViolationWitnessIndices.get(pattern.index) ?? [])
            .map((edgeIndex) => reverseEdgeIndex[edgeIndex])
            .filter((edgeId): edgeId is string => Boolean(edgeId)))].sort()
        })),
      unresolvedAbsencePatterns: absencePatterns.filter((pattern) => unresolvedAbsenceIndices.has(pattern.index)),
      supportingEdges: patterns.map((pattern) => ({
        ...pattern,
        edgeIds: [...new Set((edgeWitnessIndices.get(pattern.index) ?? [])
          .map((edgeIndex) => reverseEdgeIndex[edgeIndex])
          .filter((edgeId): edgeId is string => Boolean(edgeId)))].sort()
      })),
      ...(temporalEvidence ? { temporalEvidence } : {})
    });
  }
  return results;
}

