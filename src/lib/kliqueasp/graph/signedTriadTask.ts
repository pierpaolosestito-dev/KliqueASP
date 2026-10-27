import {
  getGraphEndpointId,
  normalizeGraphId,
  type GraphDirection,
  type GraphJsonScalar,
  type GraphSignedTriadConfig,
  type NormalizedGraphLink,
  type NormalizedGraphNode
} from "./graphModel.ts";

export type SignedTriadPolarity = "positive" | "negative";

export interface SignedTriadEdgeRecord {
  id: string;
  generated: boolean;
}

export interface SignedTriadDyad {
  id: number;
  sourceIndex: number;
  targetIndex: number;
  sourceNodeId: string;
  targetNodeId: string;
  polarity: SignedTriadPolarity;
  edgeRecords: SignedTriadEdgeRecord[];
}

export interface SignedTriadPreparation {
  available: boolean;
  reasons: string[];
  candidateNodeIndices: number[];
  dyads: SignedTriadDyad[];
}

export interface SignedTriadResult {
  nodeIds: [string, string, string];
  balanced: boolean;
  negativeDyadCount: number;
  dyads: [SignedTriadDyad, SignedTriadDyad, SignedTriadDyad];
}

export interface SignedTriadSummary {
  completeTriadCount: number;
  balancedTriadCount: number;
  unbalancedTriadCount: number;
  balancedShare: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scalarSignature(value: GraphJsonScalar): string {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function isJsonScalar(value: unknown): value is GraphJsonScalar {
  return typeof value === "string" && value.trim() !== "" ||
    typeof value === "number" && Number.isFinite(value) ||
    typeof value === "boolean";
}

function polarityForValue(config: GraphSignedTriadConfig, value: unknown): SignedTriadPolarity | null {
  if (!isJsonScalar(value)) return null;
  if (config.positiveValues.some((candidate) => isJsonScalar(candidate) && scalarSignature(candidate) === scalarSignature(value))) {
    return "positive";
  }
  if (config.negativeValues.some((candidate) => isJsonScalar(candidate) && scalarSignature(candidate) === scalarSignature(value))) {
    return "negative";
  }
  return null;
}

function validateConfig(
  config: unknown,
  mappedEdgeAttributes: Set<string>,
  mappedEdgeTypeAvailable: boolean
): string[] {
  if (!isRecord(config)) return ["Configurare graphAnalysis.signedTriads come oggetto."];
  const attribute = typeof config.attribute === "string" ? config.attribute : "";
  const reasons: string[] = [];
  if (!attribute) reasons.push("graphAnalysis.signedTriads.attribute deve essere un alias non vuoto.");
  else if (!mappedEdgeAttributes.has(attribute)) reasons.push(`L'attributo '${attribute}' non è mappato in graphMapping.edge.attributes.`);
  for (const key of ["positiveValues", "negativeValues"] as const) {
    const values = config[key];
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => !isJsonScalar(value))) {
      reasons.push(`graphAnalysis.signedTriads.${key} deve contenere valori JSON scalari non vuoti.`);
      continue;
    }
    const signatures = values.map((value) => scalarSignature(value));
    if (new Set(signatures).size !== signatures.length) reasons.push(`graphAnalysis.signedTriads.${key} contiene duplicati.`);
  }
  if (Array.isArray(config.positiveValues) && Array.isArray(config.negativeValues) &&
    config.positiveValues.every(isJsonScalar) && config.negativeValues.every(isJsonScalar)) {
    const positive = new Set(config.positiveValues.map(scalarSignature));
    if (config.negativeValues.some((value) => positive.has(scalarSignature(value)))) {
      reasons.push("I valori positivi e negativi devono essere disgiunti.");
    }
  }
  if (config.edgeTypes !== undefined) {
    if (!Array.isArray(config.edgeTypes) || config.edgeTypes.length === 0 ||
      config.edgeTypes.some((value) => typeof value !== "string" || value.trim() === "")) {
      reasons.push("graphAnalysis.signedTriads.edgeTypes deve contenere stringhe non vuote.");
    } else if (new Set(config.edgeTypes.map((value) => value.trim())).size !== config.edgeTypes.length) {
      reasons.push("graphAnalysis.signedTriads.edgeTypes non deve contenere duplicati.");
    }
    if (!mappedEdgeTypeAvailable) {
      reasons.push("graphAnalysis.signedTriads.edgeTypes richiede graphMapping.edge.typeField.");
    }
  }
  return reasons;
}

/** Validates and reduces configured signed edge records to unambiguous undirected dyads. */
export function prepareSignedTriads(
  configInput: GraphSignedTriadConfig | unknown,
  schemaVersion: number,
  direction: GraphDirection,
  nodes: NormalizedGraphNode[],
  links: NormalizedGraphLink[],
  mappedEdgeAttributes: Set<string>,
  groupExtractor: (node: NormalizedGraphNode) => string[] = (node) =>
    Array.isArray(node.analysis?.groups) ? node.analysis.groups as string[] : [],
  selectedGroup = "",
  mappedEdgeTypeAvailable = false
): SignedTriadPreparation {
  const reasons = validateConfig(configInput, mappedEdgeAttributes, mappedEdgeTypeAvailable);
  if (schemaVersion !== 2) reasons.push("Le triadi firmate richiedono schemaVersion: 2.");
  if (direction !== "undirected") reasons.push("Il bilanciamento sociale qui definito richiede un grafo non orientato.");
  if (reasons.length > 0) return { available: false, reasons, candidateNodeIndices: [], dyads: [] };
  const config = configInput as GraphSignedTriadConfig;
  const selectedEdgeTypes = config.edgeTypes ? new Set(config.edgeTypes.map((edgeType) => edgeType.trim())) : null;

  const indexByNodeId = new Map<string, number>();
  nodes.forEach((node, index) => indexByNodeId.set(node.id, index + 1));
  const candidateNodeIndices = nodes.flatMap((node) => {
    const groups = groupExtractor(node).map((group) => String(group).trim());
    const index = indexByNodeId.get(node.id);
    return index && (!selectedGroup || groups.includes(selectedGroup)) ? [index] : [];
  });
  const candidateSet = new Set(candidateNodeIndices);
  if (nodes.length === 0) reasons.push("La proiezione visibile corrente non contiene nodi da analizzare.");
  if (selectedGroup && candidateNodeIndices.length === 0) {
    reasons.push(`Il gruppo '${selectedGroup}' non contiene nodi nella proiezione visibile corrente.`);
  }

  const rawDyads = new Map<string, {
    sourceIndex: number;
    targetIndex: number;
    sourceNodeId: string;
    targetNodeId: string;
    polarity: SignedTriadPolarity;
    edgeRecords: SignedTriadEdgeRecord[];
    conflictingIds: string[];
  }>();
  let edgeRecordIndex = 0;
  let missingOrUnknown = 0;
  const missingExamples: string[] = [];

  links.forEach((link) => {
    const sourceNodeId = normalizeGraphId(getGraphEndpointId(link.source));
    const targetNodeId = normalizeGraphId(getGraphEndpointId(link.target));
    const sourceIndex = indexByNodeId.get(sourceNodeId);
    const targetIndex = indexByNodeId.get(targetNodeId);
    if (!sourceIndex || !targetIndex) return;
    edgeRecordIndex += 1;
    if (sourceIndex === targetIndex || !candidateSet.has(sourceIndex) || !candidateSet.has(targetIndex)) return;

    if (selectedEdgeTypes) {
      const mappedType = typeof link.analysis?.type === "string"
        ? link.analysis.type.trim()
        : typeof link.type === "string" ? link.type.trim() : "";
      if (!selectedEdgeTypes.has(mappedType)) return;
    }

    const attributes = isRecord(link.analysis?.attributes) ? link.analysis?.attributes : {};
    const value = attributes[config.attribute];
    const polarity = polarityForValue(config, value);
    const recordId = String(link.sourceId ?? link.analysis?.id ?? `edge_${edgeRecordIndex}`);
    if (!polarity) {
      missingOrUnknown += 1;
      if (missingExamples.length < 3) missingExamples.push(recordId);
      return;
    }

    const sourceIsLower = sourceIndex < targetIndex;
    const lowerIndex = sourceIsLower ? sourceIndex : targetIndex;
    const upperIndex = sourceIsLower ? targetIndex : sourceIndex;
    const key = `${lowerIndex}:${upperIndex}`;
    const existing = rawDyads.get(key);
    const edgeRecord: SignedTriadEdgeRecord = {
      id: recordId,
      generated: link.sourceIdGenerated === true
    };
    if (!existing) {
      rawDyads.set(key, {
        sourceIndex: lowerIndex,
        targetIndex: upperIndex,
        sourceNodeId: sourceIsLower ? sourceNodeId : targetNodeId,
        targetNodeId: sourceIsLower ? targetNodeId : sourceNodeId,
        polarity,
        edgeRecords: [edgeRecord],
        conflictingIds: []
      });
    } else {
      existing.edgeRecords.push(edgeRecord);
      if (existing.polarity !== polarity) existing.conflictingIds.push(recordId);
    }
  });

  if (missingOrUnknown > 0) {
    reasons.push(`${missingOrUnknown} arco/i senza una polarità positiva o negativa riconosciuta${missingExamples.length ? ` (esempi di ID: ${missingExamples.join(", ")})` : ""}.`);
  }
  const conflictingDyads = [...rawDyads.values()].filter((dyad) => dyad.conflictingIds.length > 0);
  if (conflictingDyads.length > 0) {
    const examples = conflictingDyads.slice(0, 3).map((dyad) =>
      `${dyad.sourceNodeId}—${dyad.targetNodeId} (${dyad.edgeRecords.map((record) => record.id).join(", ")})`
    );
    reasons.push(`${conflictingDyads.length} coppia/e ha/hanno archi paralleli con polarità discordanti; esempi: ${examples.join("; ")}.`);
  }

  const dyads = [...rawDyads.values()]
    .sort((left, right) => left.sourceIndex - right.sourceIndex || left.targetIndex - right.targetIndex)
    .map((dyad, index) => ({
      id: index + 1,
      sourceIndex: dyad.sourceIndex,
      targetIndex: dyad.targetIndex,
      sourceNodeId: dyad.sourceNodeId,
      targetNodeId: dyad.targetNodeId,
      polarity: dyad.polarity,
      edgeRecords: dyad.edgeRecords.sort((left, right) => left.id.localeCompare(right.id))
    }));

  return { available: reasons.length === 0, reasons, candidateNodeIndices, dyads };
}

/** ASP derives every triangle and classifies it by the parity of its negative dyads. */
export function buildSignedTriadProgram(preparation: SignedTriadPreparation): string {
  if (!preparation.available) throw new TypeError("I prerequisiti delle triadi firmate non sono soddisfatti.");
  const facts = [
    ...preparation.candidateNodeIndices.map((node) => `signed_candidate(${node}).`),
    ...preparation.dyads.map((dyad) =>
      `signed_pair(${dyad.id},${dyad.sourceIndex},${dyad.targetIndex},${dyad.polarity}).`
    )
  ];
  const signPatterns = [
    ["positive", "positive", "positive"],
    ["negative", "negative", "positive"],
    ["negative", "positive", "negative"],
    ["positive", "negative", "negative"],
    ["negative", "positive", "positive"],
    ["positive", "negative", "positive"],
    ["positive", "positive", "negative"],
    ["negative", "negative", "negative"]
  ];
  const rules = signPatterns.map((pattern, index) => {
    const balanced = index < 4;
    return `signed_triad(U,V,W,Puv,Puw,Pvw,${balanced ? "balanced" : "unbalanced"}) :- ` +
      `signed_candidate(U), signed_candidate(V), signed_candidate(W), U < V, V < W, ` +
      `signed_pair(Puv,U,V,${pattern[0]}), signed_pair(Puw,U,W,${pattern[1]}), signed_pair(Pvw,V,W,${pattern[2]}).`;
  });
  return [...facts, ...rules, "#show signed_triad/7."].join("\n");
}

/** Parses ASP triangle classifications and restores their source node and edge identities. */
export function parseSignedTriadResults(
  witnesses: unknown,
  reverseNodeIndex: Record<number, string>,
  dyads: SignedTriadDyad[]
): SignedTriadResult[] {
  const dyadById = new Map(dyads.map((dyad) => [dyad.id, dyad]));
  const seen = new Set<string>();
  const results: SignedTriadResult[] = [];
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = isRecord(witness) ? witness.Value : undefined;
    for (const atom of Array.isArray(value) ? value : []) {
      if (typeof atom !== "string" || !atom.startsWith("signed_triad(")) continue;
      const match = /^signed_triad\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(balanced|unbalanced)\)$/.exec(atom);
      if (!match) throw new TypeError(`Atomo di triade firmata malformato: ${atom}`);
      const [u, v, w, uv, uw, vw] = match.slice(1, 7).map(Number);
      const nodeIds = [reverseNodeIndex[u], reverseNodeIndex[v], reverseNodeIndex[w]] as const;
      const pairIds = [uv, uw, vw];
      const expectedPairs: Array<[number, number]> = [[u, v], [u, w], [v, w]];
      const supportingDyads = pairIds.map((id, index) => {
        const dyad = dyadById.get(id);
        const [expectedSource, expectedTarget] = expectedPairs[index];
        if (!dyad || dyad.sourceIndex !== expectedSource || dyad.targetIndex !== expectedTarget) {
          throw new TypeError(`Atomo di triade firmata con dyade di supporto incoerente: ${atom}`);
        }
        return dyad;
      });
      if (nodeIds.some((id) => typeof id !== "string")) {
        throw new TypeError(`Atomo di triade firmata con nodo sconosciuto: ${atom}`);
      }
      const key = `${u}:${v}:${w}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const typedDyads = supportingDyads as [SignedTriadDyad, SignedTriadDyad, SignedTriadDyad];
      const negativeDyadCount = typedDyads.filter((dyad) => dyad.polarity === "negative").length;
      const balanced = match[7] === "balanced";
      if (balanced !== (negativeDyadCount % 2 === 0)) {
        throw new TypeError(`Classificazione ASP non coerente con le polarità della triade: ${atom}`);
      }
      results.push({
        nodeIds: nodeIds as [string, string, string],
        balanced,
        negativeDyadCount,
        dyads: typedDyads
      });
    }
  }
  return results.sort((left, right) =>
    left.nodeIds[0].localeCompare(right.nodeIds[0]) ||
    left.nodeIds[1].localeCompare(right.nodeIds[1]) ||
    left.nodeIds[2].localeCompare(right.nodeIds[2])
  );
}

/** Summarizes the classified complete triangles; no triangles means no defined ratio. */
export function summarizeSignedTriads(
  results: readonly Pick<SignedTriadResult, "balanced">[]
): SignedTriadSummary {
  const balancedTriadCount = results.filter((triad) => triad.balanced).length;
  const completeTriadCount = results.length;
  return {
    completeTriadCount,
    balancedTriadCount,
    unbalancedTriadCount: completeTriadCount - balancedTriadCount,
    balancedShare: completeTriadCount === 0 ? null : balancedTriadCount / completeTriadCount
  };
}
