import {
  escapeAspString,
  getGraphEndpointId,
  normalizeGraphId,
  type NormalizedGraph,
  type NormalizedGraphLink
} from "./graphModel.ts";
import { serializeCsv } from "../csvExport.ts";

export interface ContextualCliqueConfig {
  /** Mapped node types eligible for membership in the resulting group. */
  focusNodeTypes: readonly string[];
  /** Mapped node types that may witness a relation between two focus nodes. */
  contextNodeTypes: readonly string[];
  /** Exact mapped relation types accepted for focus-context incidences. */
  edgeTypes: readonly string[];
  /** Minimum number of focus nodes in a result; defaults to 3. */
  minimumSize?: number;
}

export interface ContextualCliqueProgramOptions {
  selectedGroup?: string;
}

export interface ContextualCliqueEdgeSupport {
  focusNodeId: string;
  focusSourceId: string;
  contextNodeId: string;
  contextSourceId: string;
  edgeId: string;
  edgeIdGenerated: boolean;
}

export interface ContextualCliquePairWitness {
  focusNodeIds: [string, string];
  focusSourceIds: [string, string];
  contextNodeId: string;
  contextSourceId: string;
  supportingEdges: ContextualCliqueEdgeSupport[];
}

export interface ContextualCliqueResult {
  nodeIds: string[];
  sourceNodeIds: string[];
  pairWitnesses: ContextualCliquePairWitness[];
}

export interface ContextualCliqueEvidenceCounts {
  /** Distinct focal-node pairs, independent of how many contexts witness each pair. */
  distinctPairCount: number;
  /** Pair-context witnesses; may exceed distinctPairCount when a pair shares several contexts. */
  pairContextWitnessCount: number;
}

export function getContextualCliqueEvidenceCounts(
  result: Pick<ContextualCliqueResult, "pairWitnesses">
): ContextualCliqueEvidenceCounts {
  return {
    distinctPairCount: new Set(result.pairWitnesses.map(({ focusNodeIds }) =>
      [...focusNodeIds].sort().join("\u0000")
    )).size,
    pairContextWitnessCount: result.pairWitnesses.length
  };
}

export interface ContextualCliqueIncidenceRecord {
  focusNodeIndex: number;
  contextNodeIndex: number;
  focusNodeId: string;
  focusSourceId: string;
  contextNodeId: string;
  contextSourceId: string;
  edgeId: string;
  edgeIdGenerated: boolean;
}

export type ContextualCliqueIncidenceIndex = ReadonlyMap<string, readonly ContextualCliqueIncidenceRecord[]>;

const DEFAULT_MINIMUM_SIZE = 3;

function requireStringList(values: readonly string[], path: string): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new TypeError(`${path} deve contenere stringhe non vuote`);
  }
  const normalized = values.map((value) => value.trim());
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${path} non deve contenere duplicati`);
  return normalized;
}

export function validateContextualCliqueConfig(input: unknown): ContextualCliqueConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("graphAnalysis.contextualClique deve essere un oggetto");
  }
  const config = input as Record<string, unknown>;
  const focusNodeTypes = requireStringList(config.focusNodeTypes as string[], "focusNodeTypes");
  const contextNodeTypes = requireStringList(config.contextNodeTypes as string[], "contextNodeTypes");
  const edgeTypes = requireStringList(config.edgeTypes as string[], "edgeTypes");
  const minimumSize = config.minimumSize === undefined ? DEFAULT_MINIMUM_SIZE : config.minimumSize;
  if (!Number.isSafeInteger(minimumSize) || (minimumSize as number) < 2) {
    throw new RangeError("minimumSize deve essere un intero sicuro maggiore o uguale a 2");
  }
  return { focusNodeTypes, contextNodeTypes, edgeTypes, minimumSize: minimumSize as number };
}

export function buildContextualCliqueProgram(
  configInput: ContextualCliqueConfig,
  graphDirection: "directed" | "undirected",
  options: ContextualCliqueProgramOptions = {}
): string {
  if (graphDirection !== "undirected") {
    throw new Error("Il gruppo contestuale pairwise richiede una proiezione non orientata esplicita.");
  }
  const config = validateContextualCliqueConfig(configInput);
  if (options.selectedGroup !== undefined && typeof options.selectedGroup !== "string") {
    throw new TypeError("selectedGroup deve essere una stringa");
  }
  const lines = [
    ...config.focusNodeTypes.map((type) => `contextual_focus_type(${escapeAspString(type)}).`),
    ...config.contextNodeTypes.map((type) => `contextual_context_type(${escapeAspString(type)}).`),
    ...config.edgeTypes.map((type) => `contextual_edge_type(${escapeAspString(type)}).`),
    ...(options.selectedGroup ? [`contextual_selected_group(${escapeAspString(options.selectedGroup)}).`] : []),
    "contextual_focus_candidate(N) :- node_type(N,T), contextual_focus_type(T).",
    "contextual_context_candidate(N) :- node_type(N,T), contextual_context_type(T).",
    "contextual_eligible_focus(N) :- contextual_focus_candidate(N), not contextual_selected_group(_).",
    "contextual_eligible_focus(N) :- contextual_focus_candidate(N), group(N,G), contextual_selected_group(G).",
    "contextual_incidence(F,C,E) :- contextual_eligible_focus(F), contextual_context_candidate(C), F != C, edge_record(E), edge_source(E,F), edge_target(E,C), edge_type(E,T), contextual_edge_type(T).",
    "contextual_incidence(F,C,E) :- contextual_eligible_focus(F), contextual_context_candidate(C), F != C, edge_record(E), edge_source(E,C), edge_target(E,F), edge_type(E,T), contextual_edge_type(T).",
    "contextual_shared_context(F1,F2,C) :- contextual_incidence(F1,C,_), contextual_incidence(F2,C,_), F1 < F2.",
    "contextual_shared_pair(F1,F2) :- contextual_shared_context(F1,F2,_).",
    "{ in(F) : contextual_eligible_focus(F) }.",
    ":- in(F1), in(F2), F1 < F2, not contextual_shared_pair(F1,F2).",
    `:- #count { F : in(F) } < ${config.minimumSize}.`,
    "#maximize { 1,F : in(F) }.",
    "contextual_pair_context(F1,F2,C) :- in(F1), in(F2), F1 < F2, contextual_shared_context(F1,F2,C).",
    "#show in/1.",
    "#show contextual_pair_context/3."
  ];
  return lines.join("\n");
}

function incidenceKey(focusNodeIndex: number, contextNodeIndex: number): string {
  return `${focusNodeIndex}\u0000${contextNodeIndex}`;
}

/**
 * Builds only the reverse map used to attach source edge IDs to ASP-selected
 * focus-context incidences. ASP itself derives shared contexts and groups.
 */
export function buildContextualCliqueIncidenceIndex(
  graph: NormalizedGraph,
  configInput: ContextualCliqueConfig,
  indexByNodeId: ReadonlyMap<string, number>
): ContextualCliqueIncidenceIndex {
  const config = validateContextualCliqueConfig(configInput);
  const focusTypes = new Set(config.focusNodeTypes);
  const contextTypes = new Set(config.contextNodeTypes);
  const edgeTypes = new Set(config.edgeTypes);
  const typeByNodeId = new Map(graph.nodes.map((node) => [node.id, node.analysis?.type]));
  const sourceIdByNodeId = new Map(graph.nodes.map((node) => [node.id, String(node.sourceId ?? node.id)]));
  const byPair = new Map<string, ContextualCliqueIncidenceRecord[]>();

  const add = (focusNodeId: string, contextNodeId: string, link: NormalizedGraphLink) => {
    if (focusNodeId === contextNodeId) return;
    const focusNodeIndex = indexByNodeId.get(focusNodeId);
    const contextNodeIndex = indexByNodeId.get(contextNodeId);
    if (focusNodeIndex === undefined || contextNodeIndex === undefined) return;
    const linkMetadata = link.analysis ?? {};
    const edgeId = String(link.sourceId ?? linkMetadata.id ?? "");
    if (!edgeId) return;
    const key = incidenceKey(focusNodeIndex, contextNodeIndex);
    const incidences = byPair.get(key) ?? [];
    incidences.push({
      focusNodeIndex,
      contextNodeIndex,
      focusNodeId,
      focusSourceId: sourceIdByNodeId.get(focusNodeId) ?? focusNodeId,
      contextNodeId,
      contextSourceId: sourceIdByNodeId.get(contextNodeId) ?? contextNodeId,
      edgeId,
      edgeIdGenerated: link.sourceIdGenerated === true
    });
    byPair.set(key, incidences);
  };

  for (const link of graph.links) {
    const type = link.analysis?.type;
    if (typeof type !== "string" || !edgeTypes.has(type)) continue;
    const sourceNodeId = normalizeGraphId(getGraphEndpointId(link.source));
    const targetNodeId = normalizeGraphId(getGraphEndpointId(link.target));
    const sourceType = typeByNodeId.get(sourceNodeId);
    const targetType = typeByNodeId.get(targetNodeId);
    if (typeof sourceType !== "string" || typeof targetType !== "string") continue;
    if (focusTypes.has(sourceType) && contextTypes.has(targetType)) add(sourceNodeId, targetNodeId, link);
    if (focusTypes.has(targetType) && contextTypes.has(sourceType)) add(targetNodeId, sourceNodeId, link);
  }
  for (const incidences of byPair.values()) incidences.sort((left, right) => left.edgeId.localeCompare(right.edgeId));
  return byPair;
}

export function parseContextualCliqueResults(
  witnesses: unknown,
  reverseIndex: Readonly<Record<number, string>>,
  reverseSourceIndex: Readonly<Record<number, string>>,
  incidenceIndex: ContextualCliqueIncidenceIndex,
  minimumSize = DEFAULT_MINIMUM_SIZE
): ContextualCliqueResult[] {
  const results: ContextualCliqueResult[] = [];
  const seenGroups = new Set<string>();
  const expectedMinimumSize = Number.isSafeInteger(minimumSize) && minimumSize >= 2 ? minimumSize : DEFAULT_MINIMUM_SIZE;

  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const atoms = (Array.isArray((witness as { Value?: unknown })?.Value) ? (witness as { Value: unknown[] }).Value : [])
      .filter((atom): atom is string => typeof atom === "string");
    const memberIndexes = atoms
      .map((atom) => /^in\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => Number(match[1]));
    if (memberIndexes.length < expectedMinimumSize || new Set(memberIndexes).size !== memberIndexes.length) continue;
    const nodeIds = memberIndexes.map((index) => reverseIndex[index]);
    const sourceNodeIds = memberIndexes.map((index) => reverseSourceIndex[index] ?? reverseIndex[index]);
    if (nodeIds.some((id) => typeof id !== "string" || id === "") ||
      sourceNodeIds.some((id) => typeof id !== "string" || id === "")) continue;
    const groupKey = [...sourceNodeIds].sort().join("\u0000");
    if (seenGroups.has(groupKey)) continue;

    const memberIndexSet = new Set(memberIndexes);
    const pairWitnesses: ContextualCliquePairWitness[] = [];
    const seenPairContexts = new Set<string>();
    let malformed = false;
    for (const atom of atoms) {
      const match = /^contextual_pair_context\((\d+),(\d+),(\d+)\)$/.exec(atom);
      if (!match) continue;
      const leftIndex = Number(match[1]);
      const rightIndex = Number(match[2]);
      const contextIndex = Number(match[3]);
      if (!memberIndexSet.has(leftIndex) || !memberIndexSet.has(rightIndex) || leftIndex >= rightIndex) {
        malformed = true;
        break;
      }
      const focusNodeIds = [reverseIndex[leftIndex], reverseIndex[rightIndex]] as [string, string];
      const focusSourceIds = [
        reverseSourceIndex[leftIndex] ?? reverseIndex[leftIndex],
        reverseSourceIndex[rightIndex] ?? reverseIndex[rightIndex]
      ] as [string, string];
      const contextNodeId = reverseIndex[contextIndex];
      const contextSourceId = reverseSourceIndex[contextIndex] ?? contextNodeId;
      if (!focusNodeIds[0] || !focusNodeIds[1] || !contextNodeId || contextNodeId === focusNodeIds[0] || contextNodeId === focusNodeIds[1]) {
        malformed = true;
        break;
      }
      const pairKey = `${leftIndex}\u0000${rightIndex}\u0000${contextIndex}`;
      if (seenPairContexts.has(pairKey)) continue;
      seenPairContexts.add(pairKey);
      const leftIncidences = incidenceIndex.get(incidenceKey(leftIndex, contextIndex)) ?? [];
      const rightIncidences = incidenceIndex.get(incidenceKey(rightIndex, contextIndex)) ?? [];
      if (leftIncidences.length === 0 || rightIncidences.length === 0) {
        malformed = true;
        break;
      }
      const supportingEdges = [...leftIncidences, ...rightIncidences].map((incidence) => ({
        focusNodeId: incidence.focusNodeId,
        focusSourceId: incidence.focusSourceId,
        contextNodeId: incidence.contextNodeId,
        contextSourceId: incidence.contextSourceId,
        edgeId: incidence.edgeId,
        edgeIdGenerated: incidence.edgeIdGenerated
      }));
      pairWitnesses.push({ focusNodeIds, focusSourceIds, contextNodeId, contextSourceId, supportingEdges });
    }
    if (malformed) continue;

    const pairKeys = new Set(pairWitnesses.map(({ focusNodeIds }) =>
      [...focusNodeIds].sort().join("\u0000")
    ));
    const expectedPairCount = memberIndexes.length * (memberIndexes.length - 1) / 2;
    if (pairKeys.size !== expectedPairCount) continue;
    pairWitnesses.sort((left, right) =>
      left.focusSourceIds[0].localeCompare(right.focusSourceIds[0]) ||
      left.focusSourceIds[1].localeCompare(right.focusSourceIds[1]) ||
      left.contextSourceId.localeCompare(right.contextSourceId)
    );
    seenGroups.add(groupKey);
    results.push({ nodeIds, sourceNodeIds, pairWitnesses });
  }
  // clingo's `opt` mode emits intermediate improving witnesses before the
  // final optimum. The objective for this task is exactly group cardinality,
  // so keep only maximum-size groups from the complete witness stream.
  const optimumSize = Math.max(0, ...results.map((result) => result.nodeIds.length));
  return results
    .filter((result) => result.nodeIds.length === optimumSize)
    .sort((left, right) => left.sourceNodeIds.join("\u0000").localeCompare(right.sourceNodeIds.join("\u0000")));
}

export function buildContextualCliqueCsv(
  results: readonly ContextualCliqueResult[],
  configInput: ContextualCliqueConfig,
  selectedGroup: string
): string {
  const config = validateContextualCliqueConfig(configInput);
  const queryConfig = JSON.stringify({
    focus_node_types: config.focusNodeTypes,
    context_node_types: config.contextNodeTypes,
    edge_types: config.edgeTypes,
    minimum_size: config.minimumSize,
    selected_group: selectedGroup
  });
  const headers = [
    "record_type", "group_index", "group_size", "focus_source_ids_json",
    "pair_focus_source_ids_json", "context_source_id", "supporting_edges_json", "query_config_json"
  ];
  const rows = results.flatMap((result, groupIndex) => result.pairWitnesses.map((pair) => [
    "pair_witness",
    groupIndex + 1,
    result.sourceNodeIds.length,
    JSON.stringify(result.sourceNodeIds),
    JSON.stringify(pair.focusSourceIds),
    pair.contextSourceId,
    JSON.stringify(pair.supportingEdges.map(({ edgeId, edgeIdGenerated, focusSourceId, contextSourceId }) => ({
      edge_id: edgeId,
      edge_id_generated: edgeIdGenerated,
      focus_source_id: focusSourceId,
      context_source_id: contextSourceId
    }))),
    queryConfig
  ]));
  if (rows.length === 0) rows.push(["summary", "", 0, "[]", "[]", "", "[]", queryConfig]);
  return serializeCsv([headers, ...rows]);
}
