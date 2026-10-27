import { escapeAspString, getGraphEndpointId, normalizeGraphId, parseGraphTemporalValue, type AspTemporalEncoding } from "./graphModel.ts";
import { formatScaledDecimal, scaleNonNegativeDecimalWeights } from "./exactDecimal.ts";
import { formatProvenanceReferences, normalizeProvenanceReferences } from "./provenance.ts";
import { validateCommunityTopologyCounterfactualConfig } from "./communityTopologyCounterfactual.ts";
import { getOwnRecordValue } from "./recordUtils.ts";

export type StructuralTask = "kPlex" | "maximalKPlex" | "kCore" | "components" | "weakComponents" | "strongComponents" | "path" | "typedPath" | "dominatingSet" | "minimumNodeSeparator" | "minimumCostNodeSeparator" | "minimumEdgeSeparator" | "minimumCostEdgeSeparator" | "communities";
export type DirectedKCoreMode = "in" | "out" | "mutual";

/** True only when clingo completed the model stream instead of truncating it. */
export function hasCompleteModelEnumeration(result: unknown): boolean {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const candidate = result as {
    Result?: unknown;
    Models?: { More?: unknown } | null;
  };
  return (candidate.Result === "SATISFIABLE" || candidate.Result === "OPTIMUM FOUND") &&
    candidate.Models?.More === "no";
}

/** True only when an optimization run proved its optimum and exhausted all returned models. */
export function hasCompleteOptimalModelEnumeration(result: unknown): boolean {
  return hasCompleteModelEnumeration(result) &&
    typeof result === "object" && result !== null &&
    !Array.isArray(result) && (result as { Result?: unknown }).Result === "OPTIMUM FOUND";
}

/** Validates the unique k-core result, including the trivial empty candidate domain. */
export function hasCompleteKCoreScenarioResult(result: unknown, candidateNodeCount: number): boolean {
  if (!Number.isSafeInteger(candidateNodeCount) || candidateNodeCount < 0) return false;
  return candidateNodeCount === 0
    ? hasCompleteModelEnumeration(result)
    : hasCompleteOptimalModelEnumeration(result);
}

export function getStructuralSolverOptions(
  task: StructuralTask,
  enumerateAllOptima = false
): string[] {
  if (task === "components" || task === "weakComponents" || task === "strongComponents" || task === "path" || task === "maximalKPlex") return [];
  if (task === "typedPath") return [];
  const enumerateOptima = (task === "kPlex" || task === "dominatingSet" || task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" || task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator" || task === "communities") && enumerateAllOptima;
  return [
    `--opt-mode=${enumerateOptima ? "optN" : "opt"}`,
    ...(task === "dominatingSet" ? ["--opt-strategy=usc"] : [])
  ];
}

/** Optimization options shared by cost-minimizing structural counterfactuals. */
export function getStructuralCounterfactualSolverOptions(enumerateAllOptima = false): string[] {
  return [`--opt-mode=${enumerateAllOptima ? "optN" : "opt"}`];
}

function validateIntegerParameter(name: string, value: number, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${name} deve essere un intero maggiore o uguale a ${minimum}`);
  }
}

export function formatPathLengthBound(maximumLength: number): string {
  validateIntegerParameter("maximumLength", maximumLength, 0);
  return `${maximumLength} ${maximumLength === 1 ? "arco" : "archi"}`;
}

function candidateDomain(group: string): { declaration: string; predicate: string } {
  if (!group) return { declaration: "", predicate: "node" };
  return {
    declaration: `valid(V) :- node(V), group(V, ${escapeAspString(group)}).\n`,
    predicate: "valid"
  };
}

function maximumCardinalityObjective(): string[] {
  return [
    `#maximize { 1,V : in(V) }.`,
    "#show in/1."
  ];
}

/** Maximum s-plex: each selected vertex may miss at most s - 1 neighbors in the set. */
export function buildMaximumKPlexProgram(s: number, group = ""): string {
  validateIntegerParameter("s", s, 1);
  const domain = candidateDomain(group);
  return [
    domain.declaration.trimEnd(),
    `{ in(V) : ${domain.predicate}(V) }.`,
    `:- in(V), #count { U : in(U), U != V, not edge(V,U) } >= ${s}.`,
    "missing_tie(U,V) :- in(U), in(V), U < V, not edge(U,V).",
    "#maximize { 1,V : in(V) }.",
    "#show in/1.",
    "#show missing_tie/2."
  ].filter(Boolean).join("\n\n");
}

function maximalKPlexCertificateRules(s: number, domain: { declaration: string; predicate: string }): string[] {
  return [
    "missing_tie(U,V) :- in(U), in(V), U < V, not edge(U,V).",
    `missing_degree(V,D) :- in(V), D = #count { U : in(U), U != V, not edge(V,U) }.`,
    `maximal_candidate(X) :- ${domain.predicate}(X), not in(X).`,
    `candidate_missing_count(X,D) :- maximal_candidate(X), D = #count { V : in(V), not edge(X,V) }.`,
    `maximal_blocked_by_degree(X,D) :- candidate_missing_count(X,D), D >= ${s}.`,
    `candidate_blocker_member(X,V) :- maximal_candidate(X), in(V), not edge(X,V), missing_degree(V,D), D >= ${s - 1}.`,
    `maximal_blocked_by_member(X,V,D) :- maximal_candidate(X), candidate_missing_count(X,C), C < ${s}, V = #min { W : candidate_blocker_member(X,W) }, missing_degree(V,D).`,
    "blocked_candidate(X) :- maximal_blocked_by_degree(X,D).",
    "blocked_candidate(X) :- maximal_blocked_by_member(X,V,D).",
    `can_add(X) :- ${domain.predicate}(X), not in(X), #count { V : in(V), not edge(X,V) } < ${s}, not blocked_candidate(X).`,
    ":- can_add(X).",
    "#show in/1.",
    "#show missing_tie/2.",
    "#show maximal_candidate/1.",
    "#show maximal_blocked_by_degree/2.",
    "#show maximal_blocked_by_member/3."
  ];
}

/** Enumerates all inclusion-maximal s-plexes without ranking them by cardinality. */
export function buildMaximalKPlexProgram(s: number, group = ""): string {
  validateIntegerParameter("s", s, 1);
  const domain = candidateDomain(group);
  return [
    domain.declaration.trimEnd(),
    `{ in(V) : ${domain.predicate}(V) }.`,
    `:- in(V), #count { U : in(U), U != V, not edge(V,U) } >= ${s}.`,
    ...maximalKPlexCertificateRules(s, domain)
  ].filter(Boolean).join("\n\n");
}

/** ASP verifier and explanation program for a k-plex supplied as in/1 facts. */
export function buildMaximalKPlexCertificateProgram(s: number, group = ""): string {
  validateIntegerParameter("s", s, 1);
  const domain = candidateDomain(group);
  return [
    domain.declaration.trimEnd(),
    `:- in(V), #count { U : in(U), U != V, not edge(V,U) } >= ${s}.`,
    ...maximalKPlexCertificateRules(s, domain)
  ].filter(Boolean).join("\n\n");
}

/**
 * Constructs one inclusion-maximal s-plex with deterministic greedy orders.
 * ASP independently validates and explains the returned set before the UI exposes it.
 */
export function buildGreedyMaximalKPlexWitness(
  s: number,
  candidateNodeIds: readonly string[],
  links: readonly { source: unknown; target: unknown }[]
): string[] {
  validateIntegerParameter("s", s, 1);
  const nodeIds = [...new Set(candidateNodeIds.map(String))];
  if (nodeIds.length === 0) return [];

  const idByNormalizedId = new Map(nodeIds.map((id) => [normalizeGraphId(id), id]));
  const neighbors = new Map(nodeIds.map((id) => [id, new Set<string>()]));
  for (const link of links) {
    const source = idByNormalizedId.get(normalizeGraphId(getGraphEndpointId(link.source)));
    const target = idByNormalizedId.get(normalizeGraphId(getGraphEndpointId(link.target)));
    if (!source || !target || source === target) continue;
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }

  const inputIndex = new Map(nodeIds.map((id, index) => [id, index]));
  if (nodeIds.every((id) => nodeIds.length - 1 - (neighbors.get(id)?.size ?? 0) < s)) {
    return nodeIds;
  }
  const byDegreeDescending = [...nodeIds].sort((left, right) =>
    (neighbors.get(right)?.size ?? 0) - (neighbors.get(left)?.size ?? 0) ||
    (inputIndex.get(left) ?? 0) - (inputIndex.get(right) ?? 0)
  );
  const byDegreeAscending = [...byDegreeDescending].reverse();
  const isAdjacent = (left: string, right: string) => neighbors.get(left)?.has(right) ?? false;

  const greedy = (order: readonly string[]): string[] => {
    const selected: string[] = [];
    const missingDegree = new Map<string, number>();
    const missingToSelected = new Map(order.map((id) => [id, 0]));
    const saturatedBlockers = new Map(order.map((id) => [id, 0]));
    for (let index = 0; index < order.length; index += 1) {
      const candidate = order[index];
      if ((missingToSelected.get(candidate) ?? 0) >= s || (saturatedBlockers.get(candidate) ?? 0) > 0) {
        continue;
      }

      const candidateMissingDegree = missingToSelected.get(candidate) ?? 0;
      selected.push(candidate);
      missingDegree.set(candidate, candidateMissingDegree);

      for (let futureIndex = index + 1; futureIndex < order.length; futureIndex += 1) {
        const future = order[futureIndex];
        if (!isAdjacent(candidate, future)) {
          missingToSelected.set(future, (missingToSelected.get(future) ?? 0) + 1);
        }
        if (candidateMissingDegree >= s - 1 && !isAdjacent(candidate, future)) {
          saturatedBlockers.set(future, (saturatedBlockers.get(future) ?? 0) + 1);
        }
      }

      for (let selectedIndex = 0; selectedIndex < selected.length - 1; selectedIndex += 1) {
        const member = selected[selectedIndex];
        if (isAdjacent(candidate, member)) continue;
        const newMissingDegree = (missingDegree.get(member) ?? 0) + 1;
        missingDegree.set(member, newMissingDegree);
        if (newMissingDegree === s - 1) {
          for (let futureIndex = index + 1; futureIndex < order.length; futureIndex += 1) {
            const future = order[futureIndex];
            if (!isAdjacent(member, future)) {
              saturatedBlockers.set(future, (saturatedBlockers.get(future) ?? 0) + 1);
            }
          }
        }
      }
    }
    return selected;
  };

  let best = greedy(nodeIds);
  const consider = (order: readonly string[]) => {
    const witness = greedy(order);
    if (witness.length > best.length) best = witness;
  };
  consider(byDegreeDescending);
  consider(byDegreeAscending);
  const seedCount = Math.min(64, byDegreeDescending.length);
  const seeds = Array.from({ length: seedCount }, (_, index) =>
    byDegreeDescending[Math.floor((index * byDegreeDescending.length) / seedCount)]
  );
  for (const seed of seeds) {
    consider([seed, ...byDegreeDescending.filter((id) => id !== seed)]);
  }

  return [...best].sort((left, right) =>
    (inputIndex.get(left) ?? 0) - (inputIndex.get(right) ?? 0)
  );
}

/** Feasibility query for an s-plex of at least a requested size. */
export function buildKPlexAtLeastProgram(s: number, minimumSize: number, group = ""): string {
  return buildKPlexFeasibilityProgram(s, minimumSize, undefined, group);
}

/** Feasibility query for an s-plex of exactly the requested size. */
export function buildKPlexExactSizeProgram(s: number, exactSize: number, group = ""): string {
  validateIntegerParameter("exactSize", exactSize, 1);
  return buildKPlexFeasibilityProgram(s, exactSize, exactSize, group);
}

function buildKPlexFeasibilityProgram(
  s: number,
  minimumSize: number,
  maximumSize: number | undefined,
  group: string
): string {
  validateIntegerParameter("s", s, 1);
  validateIntegerParameter("minimumSize", minimumSize, 1);
  if (maximumSize !== undefined) validateIntegerParameter("maximumSize", maximumSize, minimumSize);
  const domain = candidateDomain(group);
  const minimumInternalDegree = Math.max(0, minimumSize - s);
  return [
    domain.declaration.trimEnd(),
    `degree(V,D) :- ${domain.predicate}(V), D = #count { U : edge(V,U) }.`,
    `candidate(V) :- ${domain.predicate}(V), degree(V,D), D >= ${minimumSize - s}.`,
    "{ in(V) : candidate(V) }.",
    `:- in(V), #count { U : in(U), U != V, not edge(V,U) } >= ${s}.`,
    // A set of at least minimumSize nodes needs this many selected neighbors per member.
    minimumInternalDegree > 0
      ? `:- in(V), #count { U : in(U), U != V, edge(V,U) } < ${minimumInternalDegree}.`
      : "",
    `:- #count { V : in(V) } < ${minimumSize}.`,
    maximumSize === undefined ? "" : `:- #count { V : in(V) } > ${maximumSize}.`,
    "missing_tie(U,V) :- in(U), in(V), U < V, not edge(U,V).",
    "#show in/1.",
    "#show missing_tie/2."
  ].filter(Boolean).join("\n\n");
}

/** Uses min(|C|, degeneracy(C) + s), a safe upper bound for any s-plex in C. */
export function getMaximumKPlexCardinalityUpperBound(
  s: number,
  candidateNodeIds: string[],
  edges: Array<{ source: unknown; target: unknown }>
): number {
  validateIntegerParameter("s", s, 1);
  const candidateIds = new Set(candidateNodeIds.map(String));
  if (candidateIds.size === 0) return 0;
  const neighbors = new Map([...candidateIds].map((nodeId) => [nodeId, new Set<string>()]));
  for (const edge of edges) {
    const source = String(getGraphEndpointId(edge.source) ?? "");
    const target = String(getGraphEndpointId(edge.target) ?? "");
    if (source === target || !candidateIds.has(source) || !candidateIds.has(target)) continue;
    neighbors.get(source)?.add(target);
    neighbors.get(target)?.add(source);
  }
  const degree = new Map<string, number>();
  const degreeBuckets = new Map<number, string[]>();
  let maximumDegree = 0;
  const addToBucket = (nodeId: string, nodeDegree: number) => {
    const bucket = degreeBuckets.get(nodeDegree) ?? [];
    bucket.push(nodeId);
    degreeBuckets.set(nodeDegree, bucket);
  };
  for (const [nodeId, adjacent] of neighbors) {
    degree.set(nodeId, adjacent.size);
    maximumDegree = Math.max(maximumDegree, adjacent.size);
    addToBucket(nodeId, adjacent.size);
  }

  const removed = new Set<string>();
  let removedCount = 0;
  let bucketIndex = 0;
  let degeneracy = 0;
  while (removedCount < candidateIds.size) {
    let nodeId: string | undefined;
    while (bucketIndex <= maximumDegree && !nodeId) {
      const bucket = degreeBuckets.get(bucketIndex);
      while (bucket?.length && !nodeId) {
        const candidate = bucket.pop()!;
        if (!removed.has(candidate) && degree.get(candidate) === bucketIndex) nodeId = candidate;
      }
      if (!nodeId) bucketIndex += 1;
    }
    if (!nodeId) break;

    removed.add(nodeId);
    removedCount += 1;
    degeneracy = Math.max(degeneracy, bucketIndex);
    for (const neighbor of neighbors.get(nodeId) ?? []) {
      const neighborDegree = degree.get(neighbor);
      if (removed.has(neighbor) || neighborDegree === undefined || neighborDegree <= bucketIndex) continue;
      degree.set(neighbor, neighborDegree - 1);
      addToBucket(neighbor, neighborDegree - 1);
    }
  }
  if (removedCount !== candidateIds.size) return Math.min(candidateIds.size, maximumDegree + s);
  return Math.min(candidateIds.size, degeneracy + s);
}

export interface MaximumKPlexAspSearchResult {
  complete: boolean;
  maximumSize: number;
  queryCount: number;
  result?: { Result?: string; Models?: { More?: unknown }; [key: string]: unknown };
  solverStatus?: string;
}

export interface KPlexCompletionCandidate {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceNode: number;
  targetNode: number;
  edgeType: string;
  cost: number;
  recordIndex: number;
}

export type StructuralEdgeCompletionCandidate = KPlexCompletionCandidate;

export interface KPlexCompletionProposal {
  totalCost: number;
  addedEdges: Array<Pick<KPlexCompletionCandidate,
    "id" | "sourceNodeId" | "targetNodeId" | "edgeType" | "cost">>;
}

export interface KPlexCompletionWhyNotBlocker {
  nodeId: string;
  unfillableMissingNeighborIds: string[];
}

export interface KPlexCompletionWhyNot {
  targetS: number;
  cohortNodeIds: string[];
  candidateEdgeIds: string[];
  unfillableMissingPairs: Array<[string, string]>;
  blockers: KPlexCompletionWhyNotBlocker[];
}

export interface KCoreCompletionWhyNotBlocker {
  nodeId: string;
  currentNeighborIds: string[];
  additionalCandidateNeighborIds: string[];
  maximumAchievableDegree: number;
}

export interface KCoreCompletionWhyNot {
  targetK: number;
  cohortNodeIds: string[];
  candidateEdgeIds: string[];
  blockers: KCoreCompletionWhyNotBlocker[];
}

export interface KCoreMembershipCompletionWhyNotStep {
  nodeId: string;
  round: number;
  survivingNeighborIds: string[];
}

export interface KCoreMembershipCompletionWhyNot {
  targetK: number;
  targetNodeId: string;
  candidateNodeIds: string[];
  candidateEdgeIds: string[];
  peelingScope: "full" | "target_prefix";
  peeling: KCoreMembershipCompletionWhyNotStep[];
}

export interface KCoreMembershipCompletionProposal extends KPlexCompletionProposal {
  /** A verifiable node subset in which every member has at least the target degree. */
  coreWitnessNodeIds: string[];
}

export interface StructuralEdgeCompletionProposal extends KPlexCompletionProposal {
  /** Optional certificate included by counterfactuals that select their own core witness. */
  coreWitnessNodeIds?: string[];
}

/** Validates configured hypothetical edges independently of projection/group filtering. */
export function validateKPlexCompletionCandidates(input: unknown): KPlexCompletionCandidate[] {
  if (!Array.isArray(input)) {
    throw new TypeError("graphAnalysis.counterfactuals.edgeAdditions deve essere un array");
  }
  const ids = new Set<string>();
  const records = new Set<number>();
  let maximumCost = 0;
  return input.map((raw, index) => {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new TypeError(`edgeAdditions[${index}] deve essere un oggetto`);
    }
    const candidate = raw as Record<string, unknown>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const sourceNodeId = typeof candidate.sourceNodeId === "string" || typeof candidate.sourceNodeId === "number"
      ? String(candidate.sourceNodeId).trim()
      : "";
    const targetNodeId = typeof candidate.targetNodeId === "string" || typeof candidate.targetNodeId === "number"
      ? String(candidate.targetNodeId).trim()
      : "";
    const edgeType = typeof candidate.edgeType === "string" ? candidate.edgeType.trim() : "";
    const { sourceNode, targetNode, cost, recordIndex } = candidate;
    if (!id) throw new TypeError(`edgeAdditions[${index}].id deve essere una stringa non vuota`);
    if (!sourceNodeId) throw new TypeError(`edgeAdditions[${index}].sourceNodeId deve essere un ID non vuoto`);
    if (!targetNodeId) throw new TypeError(`edgeAdditions[${index}].targetNodeId deve essere un ID non vuoto`);
    if (!edgeType) throw new TypeError(`edgeAdditions[${index}].edgeType deve essere una stringa non vuota`);
    if (typeof sourceNode !== "number" || !Number.isSafeInteger(sourceNode) || sourceNode < 1 ||
      typeof targetNode !== "number" || !Number.isSafeInteger(targetNode) || targetNode < 1) {
      throw new TypeError(`edgeAdditions[${index}] deve riferirsi a due nodi ASP validi`);
    }
    if (sourceNode === targetNode) throw new TypeError(`edgeAdditions[${index}] non può essere un cappio`);
    if (typeof cost !== "number" || !Number.isSafeInteger(cost) || cost < 1) {
      throw new TypeError(`edgeAdditions[${index}].cost deve essere un intero positivo sicuro`);
    }
    if (typeof recordIndex !== "number" || !Number.isSafeInteger(recordIndex) || recordIndex < 1 || records.has(recordIndex)) {
      throw new TypeError(`edgeAdditions[${index}].recordIndex deve essere un indice ASP positivo e univoco`);
    }
    if (ids.has(id)) throw new TypeError(`edgeAdditions contiene l'ID duplicato '${id}'`);
    ids.add(id);
    records.add(recordIndex);
    maximumCost += cost;
    if (!Number.isSafeInteger(maximumCost)) {
      throw new TypeError("La somma dei costi dei candidati supera l'intero sicuro JavaScript");
    }
    return { id, sourceNodeId, targetNodeId, sourceNode, targetNode, edgeType, cost, recordIndex };
  });
}

/** Finds minimum-cost declared edge additions that make a fixed cohort a target s-plex. */
export function buildKPlexCompletionCounterfactualProgram(
  s: number,
  cohortNodeIndices: number[],
  candidatesInput: unknown
): { candidates: KPlexCompletionCandidate[]; program: string } {
  validateIntegerParameter("s", s, 1);
  if (!Array.isArray(cohortNodeIndices) || cohortNodeIndices.length === 0 ||
    cohortNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(cohortNodeIndices).size !== cohortNodeIndices.length) {
    throw new TypeError("Il cohort deve contenere indici ASP positivi, univoci e non vuoti");
  }
  const cohort = new Set(cohortNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del cohort selezionato`);
    }
  }
  const cohortFacts = [...cohort].sort((left, right) => left - right).map((node) => `cf_plex_cohort(${node}).`);
  const candidateFacts = candidates.map((candidate) =>
    `cf_plex_candidate(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode},${escapeAspString(candidate.edgeType)},${candidate.cost}).`
  );
  const program = [
    ...cohortFacts,
    ...candidateFacts,
    "{ cf_add_edge(E) } :- cf_plex_candidate(E,_,_,_,_).",
    "cf_plex_adjacent(U,V) :- edge(U,V).",
    "cf_plex_adjacent(U,V) :- cf_add_edge(E), cf_plex_candidate(E,U,V,_,_).",
    "cf_plex_adjacent(V,U) :- cf_add_edge(E), cf_plex_candidate(E,U,V,_,_).",
    `:- cf_plex_cohort(V), #count { U : cf_plex_cohort(U), U != V, not cf_plex_adjacent(V,U) } >= ${s}.`,
    "#minimize { Cost,E : cf_add_edge(E), cf_plex_candidate(E,_,_,_,Cost) }.",
    "#show cf_add_edge/1."
  ].join("\n");
  return { candidates, program };
}

/** Produces an ASP certificate for why a fixed cohort cannot reach a target s-plex. */
export function buildKPlexCompletionWhyNotProgram(
  s: number,
  cohortNodeIndices: number[],
  candidatesInput: unknown
): { candidates: KPlexCompletionCandidate[]; program: string } {
  validateIntegerParameter("s", s, 1);
  if (!Array.isArray(cohortNodeIndices) || cohortNodeIndices.length === 0 ||
    cohortNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(cohortNodeIndices).size !== cohortNodeIndices.length) {
    throw new TypeError("Il cohort deve contenere indici ASP positivi, univoci e non vuoti");
  }
  const cohort = new Set(cohortNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del cohort selezionato`);
    }
  }
  const cohortFacts = [...cohort].sort((left, right) => left - right)
    .map((node) => `cf_plex_diag_cohort(${node}).`);
  const candidateFacts = candidates.map((candidate) =>
    `cf_plex_diag_candidate(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode}).`
  );
  const program = [
    ...cohortFacts,
    ...candidateFacts,
    "cf_plex_diag_candidate_pair(U,V) :- cf_plex_diag_candidate(_,U,V).",
    "cf_plex_diag_candidate_pair(V,U) :- cf_plex_diag_candidate(_,U,V).",
    "cf_plex_diag_adjacent(U,V) :- edge(U,V).",
    `cf_plex_diag_unfillable_pair(U,V) :- cf_plex_diag_cohort(U), cf_plex_diag_cohort(V), U < V, not cf_plex_diag_adjacent(U,V), not cf_plex_diag_candidate_pair(U,V).`,
    "cf_plex_diag_unfillable_neighbor(U,V) :- cf_plex_diag_unfillable_pair(U,V).",
    "cf_plex_diag_unfillable_neighbor(V,U) :- cf_plex_diag_unfillable_pair(U,V).",
    `cf_plex_diag_blocker(V) :- cf_plex_diag_cohort(V), #count { U : cf_plex_diag_unfillable_neighbor(V,U) } >= ${s}.`,
    "#show cf_plex_diag_unfillable_pair/2.",
    "#show cf_plex_diag_blocker/1."
  ].join("\n");
  return { candidates, program };
}

/** Parses ASP's why-not answer set and checks it against an independent graph calculation. */
export function parseKPlexCompletionWhyNot(
  witnesses: unknown,
  s: number,
  cohortNodeIndices: number[],
  observedEdges: Array<{ sourceNode: number; targetNode: number }>,
  candidatesInput: unknown,
  nodeIdByIndex: ReadonlyMap<number, string>
): KPlexCompletionWhyNot {
  validateIntegerParameter("s", s, 1);
  if (!Array.isArray(cohortNodeIndices) || cohortNodeIndices.length === 0 ||
    cohortNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(cohortNodeIndices).size !== cohortNodeIndices.length) {
    throw new TypeError("Il cohort deve contenere indici ASP positivi, univoci e non vuoti");
  }
  if (!Array.isArray(observedEdges)) throw new TypeError("Gli archi osservati devono essere un array");
  const cohort = new Set(cohortNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del cohort selezionato`);
    }
  }
  const pairKey = (left: number, right: number) => left < right ? `${left}:${right}` : `${right}:${left}`;
  const observed = new Set<string>();
  for (const edge of observedEdges) {
    if (!Number.isSafeInteger(edge.sourceNode) || edge.sourceNode < 1 ||
      !Number.isSafeInteger(edge.targetNode) || edge.targetNode < 1) {
      throw new TypeError("Gli archi osservati devono riferirsi a indici ASP positivi");
    }
    if (edge.sourceNode !== edge.targetNode && cohort.has(edge.sourceNode) && cohort.has(edge.targetNode)) {
      observed.add(pairKey(edge.sourceNode, edge.targetNode));
    }
  }
  const fillable = new Set(candidates.map((candidate) => pairKey(candidate.sourceNode, candidate.targetNode)));
  const expectedUnfillable = new Set<string>();
  const unfillableNeighbors = new Map([...cohort].map((node) => [node, new Set<number>()]));
  const sortedCohort = [...cohort].sort((left, right) => left - right);
  for (let leftIndex = 0; leftIndex < sortedCohort.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sortedCohort.length; rightIndex += 1) {
      const left = sortedCohort[leftIndex];
      const right = sortedCohort[rightIndex];
      const key = pairKey(left, right);
      if (observed.has(key) || fillable.has(key)) continue;
      expectedUnfillable.add(key);
      unfillableNeighbors.get(left)?.add(right);
      unfillableNeighbors.get(right)?.add(left);
    }
  }
  const expectedBlockers = new Set([...cohort].filter((node) =>
    (unfillableNeighbors.get(node)?.size ?? 0) >= s
  ));
  if (expectedBlockers.size === 0) {
    throw new Error("Il risultato UNSAT del completamento non concorda con il calcolo indipendente del k-plex");
  }

  if (!Array.isArray(witnesses) || witnesses.length !== 1 ||
    witnesses[0] === null || typeof witnesses[0] !== "object") {
    throw new Error("clingo non ha restituito un answer set why-not unico e verificabile");
  }
  const witness = witnesses[0] as Record<string, unknown>;
  if (!Array.isArray(witness.Value) || witness.Value.some((atom) => typeof atom !== "string")) {
    throw new Error("Il witness why-not di clingo non contiene atomi validi");
  }
  const actualUnfillable = new Set<string>();
  const actualBlockers = new Set<number>();
  for (const atom of witness.Value as string[]) {
    const pairMatch = /^cf_plex_diag_unfillable_pair\((\d+),(\d+)\)$/.exec(atom);
    if (pairMatch) {
      const left = Number(pairMatch[1]);
      const right = Number(pairMatch[2]);
      if (left >= right || !cohort.has(left) || !cohort.has(right)) {
        throw new Error("Il witness why-not contiene una coppia mancante non canonica o fuori cohort");
      }
      const key = pairKey(left, right);
      if (actualUnfillable.has(key)) throw new Error("Il witness why-not duplica una coppia non completabile");
      actualUnfillable.add(key);
      continue;
    }
    const blockerMatch = /^cf_plex_diag_blocker\((\d+)\)$/.exec(atom);
    if (blockerMatch) {
      const blocker = Number(blockerMatch[1]);
      if (!cohort.has(blocker) || actualBlockers.has(blocker)) {
        throw new Error("Il witness why-not contiene un nodo bloccante duplicato o fuori cohort");
      }
      actualBlockers.add(blocker);
      continue;
    }
    throw new Error(`Atomo inatteso nel witness why-not: ${atom}`);
  }
  if (actualUnfillable.size !== expectedUnfillable.size ||
    [...expectedUnfillable].some((key) => !actualUnfillable.has(key))) {
    throw new Error("Il witness why-not ASP non elenca esattamente tutte le coppie mancanti non completabili");
  }
  if (actualBlockers.size !== expectedBlockers.size ||
    [...expectedBlockers].some((node) => !actualBlockers.has(node))) {
    throw new Error("Il witness why-not ASP non elenca esattamente i nodi che violano la soglia s");
  }
  const mapNodeId = (index: number) => {
    const nodeId = nodeIdByIndex.get(index);
    if (typeof nodeId !== "string" || nodeId === "") {
      throw new Error(`Il mapping ASP del nodo ${index} non e verificabile`);
    }
    return nodeId;
  };
  const unfillableMissingPairs = [...expectedUnfillable].map((key) => {
    const [left, right] = key.split(":").map(Number);
    return [mapNodeId(left), mapNodeId(right)] as [string, string];
  });
  const blockers = [...expectedBlockers].sort((left, right) => left - right).map((node) => ({
    nodeId: mapNodeId(node),
    unfillableMissingNeighborIds: [...(unfillableNeighbors.get(node) ?? [])]
      .sort((left, right) => left - right)
      .map(mapNodeId)
  }));
  return {
    targetS: s,
    cohortNodeIds: sortedCohort.map(mapNodeId),
    candidateEdgeIds: candidates.map((candidate) => candidate.id),
    unfillableMissingPairs,
    blockers
  };
}

/** Produces an ASP certificate for why a fixed cohort cannot reach a target minimum degree. */
export function buildKCoreCompletionWhyNotProgram(
  k: number,
  cohortNodeIndices: number[],
  candidatesInput: unknown
): { candidates: StructuralEdgeCompletionCandidate[]; program: string } {
  validateIntegerParameter("k", k, 0);
  if (!Array.isArray(cohortNodeIndices) || cohortNodeIndices.length === 0 ||
    cohortNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(cohortNodeIndices).size !== cohortNodeIndices.length) {
    throw new TypeError("Il cohort deve contenere indici ASP positivi, univoci e non vuoti");
  }
  const cohort = new Set(cohortNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del cohort selezionato`);
    }
  }
  const cohortFacts = [...cohort].sort((left, right) => left - right)
    .map((node) => `cf_core_diag_cohort(${node}).`);
  const candidateFacts = candidates.map((candidate) =>
    `cf_core_diag_candidate(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode}).`
  );
  const program = [
    ...cohortFacts,
    ...candidateFacts,
    "cf_core_diag_candidate_pair(U,V) :- cf_core_diag_candidate(_,U,V).",
    "cf_core_diag_candidate_pair(V,U) :- cf_core_diag_candidate(_,U,V).",
    "cf_core_diag_adjacent(U,V) :- edge(U,V).",
    "cf_core_diag_potential_neighbor(V,U) :- cf_core_diag_adjacent(V,U).",
    "cf_core_diag_potential_neighbor(V,U) :- cf_core_diag_candidate_pair(V,U).",
    "cf_core_diag_current_degree(V,D) :- cf_core_diag_cohort(V), D = #count { U : cf_core_diag_cohort(U), U != V, cf_core_diag_adjacent(V,U) }.",
    "cf_core_diag_maximum_degree(V,D) :- cf_core_diag_cohort(V), D = #count { U : cf_core_diag_cohort(U), U != V, cf_core_diag_potential_neighbor(V,U) }.",
    `cf_core_diag_blocker(V) :- cf_core_diag_cohort(V), cf_core_diag_maximum_degree(V,D), D < ${k}.`,
    "#show cf_core_diag_current_degree/2.",
    "#show cf_core_diag_maximum_degree/2.",
    "#show cf_core_diag_blocker/1."
  ].join("\n");
  return { candidates, program };
}

/** Parses ASP's k-core why-not answer set and checks every degree against the current graph. */
export function parseKCoreCompletionWhyNot(
  witnesses: unknown,
  k: number,
  cohortNodeIndices: number[],
  observedEdges: Array<{ sourceNode: number; targetNode: number }>,
  candidatesInput: unknown,
  nodeIdByIndex: ReadonlyMap<number, string>
): KCoreCompletionWhyNot {
  validateIntegerParameter("k", k, 0);
  if (!Array.isArray(cohortNodeIndices) || cohortNodeIndices.length === 0 ||
    cohortNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(cohortNodeIndices).size !== cohortNodeIndices.length) {
    throw new TypeError("Il cohort deve contenere indici ASP positivi, univoci e non vuoti");
  }
  if (!Array.isArray(observedEdges)) throw new TypeError("Gli archi osservati devono essere un array");
  const cohort = new Set(cohortNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del cohort selezionato`);
    }
  }
  const currentNeighbors = new Map([...cohort].map((node) => [node, new Set<number>()]));
  for (const edge of observedEdges) {
    if (!Number.isSafeInteger(edge.sourceNode) || edge.sourceNode < 1 ||
      !Number.isSafeInteger(edge.targetNode) || edge.targetNode < 1) {
      throw new TypeError("Gli archi osservati devono riferirsi a indici ASP positivi");
    }
    if (edge.sourceNode === edge.targetNode || !cohort.has(edge.sourceNode) || !cohort.has(edge.targetNode)) continue;
    currentNeighbors.get(edge.sourceNode)?.add(edge.targetNode);
    currentNeighbors.get(edge.targetNode)?.add(edge.sourceNode);
  }
  const maximumNeighbors = new Map([...currentNeighbors].map(([node, neighbors]) => [node, new Set(neighbors)]));
  for (const candidate of candidates) {
    maximumNeighbors.get(candidate.sourceNode)?.add(candidate.targetNode);
    maximumNeighbors.get(candidate.targetNode)?.add(candidate.sourceNode);
  }
  const expectedBlockers = new Set([...cohort].filter((node) =>
    (maximumNeighbors.get(node)?.size ?? 0) < k
  ));
  if (expectedBlockers.size === 0) {
    throw new Error("Il risultato UNSAT del completamento non concorda con il calcolo indipendente del k-core");
  }
  if (!Array.isArray(witnesses) || witnesses.length !== 1 ||
    witnesses[0] === null || typeof witnesses[0] !== "object") {
    throw new Error("clingo non ha restituito un answer set why-not unico e verificabile");
  }
  const witness = witnesses[0] as Record<string, unknown>;
  if (!Array.isArray(witness.Value) || witness.Value.some((atom) => typeof atom !== "string")) {
    throw new Error("Il witness why-not di clingo non contiene atomi validi");
  }
  const currentDegrees = new Map<number, number>();
  const maximumDegrees = new Map<number, number>();
  const actualBlockers = new Set<number>();
  for (const atom of witness.Value as string[]) {
    const currentMatch = /^cf_core_diag_current_degree\((\d+),(\d+)\)$/.exec(atom);
    if (currentMatch) {
      const node = Number(currentMatch[1]);
      const degree = Number(currentMatch[2]);
      if (!cohort.has(node) || currentDegrees.has(node)) throw new Error("Grado corrente duplicato o fuori cohort nel witness why-not");
      currentDegrees.set(node, degree);
      continue;
    }
    const maximumMatch = /^cf_core_diag_maximum_degree\((\d+),(\d+)\)$/.exec(atom);
    if (maximumMatch) {
      const node = Number(maximumMatch[1]);
      const degree = Number(maximumMatch[2]);
      if (!cohort.has(node) || maximumDegrees.has(node)) throw new Error("Grado massimo duplicato o fuori cohort nel witness why-not");
      maximumDegrees.set(node, degree);
      continue;
    }
    const blockerMatch = /^cf_core_diag_blocker\((\d+)\)$/.exec(atom);
    if (blockerMatch) {
      const node = Number(blockerMatch[1]);
      if (!cohort.has(node) || actualBlockers.has(node)) throw new Error("Nodo blocker duplicato o fuori cohort nel witness why-not");
      actualBlockers.add(node);
      continue;
    }
    throw new Error(`Atomo inatteso nel witness why-not: ${atom}`);
  }
  for (const node of cohort) {
    const actualCurrent = currentDegrees.get(node);
    const actualMaximum = maximumDegrees.get(node);
    if (actualCurrent !== currentNeighbors.get(node)?.size || actualMaximum !== maximumNeighbors.get(node)?.size) {
      throw new Error("Il witness why-not ASP riporta gradi non coerenti con il grafo e i candidati");
    }
  }
  if (currentDegrees.size !== cohort.size || maximumDegrees.size !== cohort.size ||
    actualBlockers.size !== expectedBlockers.size ||
    [...expectedBlockers].some((node) => !actualBlockers.has(node))) {
    throw new Error("Il witness why-not ASP non elenca esattamente i blocker del target k-core");
  }
  const mapNodeId = (index: number) => {
    const nodeId = nodeIdByIndex.get(index);
    if (typeof nodeId !== "string" || nodeId === "") throw new Error(`Il mapping ASP del nodo ${index} non e verificabile`);
    return nodeId;
  };
  const sortedCohort = [...cohort].sort((left, right) => left - right);
  const blockers = [...expectedBlockers].sort((left, right) => left - right).map((node) => {
    const current = currentNeighbors.get(node) ?? new Set<number>();
    const maximum = maximumNeighbors.get(node) ?? new Set<number>();
    return {
      nodeId: mapNodeId(node),
      currentNeighborIds: [...current].sort((left, right) => left - right).map(mapNodeId),
      additionalCandidateNeighborIds: [...maximum].filter((neighbor) => !current.has(neighbor))
        .sort((left, right) => left - right).map(mapNodeId),
      maximumAchievableDegree: maximum.size
    };
  });
  return {
    targetK: k,
    cohortNodeIds: sortedCohort.map(mapNodeId),
    candidateEdgeIds: candidates.map((candidate) => candidate.id),
    blockers
  };
}

/** Tests whether all declared additions still leave a target outside the fixed-domain k-core. */
export function buildKCoreMembershipCompletionWhyNotProgram(
  k: number,
  targetNodeIndex: number,
  candidateNodeIndices: number[],
  candidatesInput: unknown
): { candidates: StructuralEdgeCompletionCandidate[]; program: string } {
  validateIntegerParameter("k", k, 0);
  if (!Number.isSafeInteger(targetNodeIndex) || targetNodeIndex < 1) {
    throw new TypeError("Il nodo obiettivo deve avere un indice ASP positivo");
  }
  if (!Array.isArray(candidateNodeIndices) || candidateNodeIndices.length === 0 ||
    candidateNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(candidateNodeIndices).size !== candidateNodeIndices.length ||
    !candidateNodeIndices.includes(targetNodeIndex)) {
    throw new TypeError("Il dominio candidato deve essere non vuoto, univoco e contenere il nodo obiettivo");
  }
  const cohort = new Set(candidateNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del dominio candidato`);
    }
  }
  const cohortFacts = [...cohort].sort((left, right) => left - right)
    .map((node) => `cf_kcm_diag_node(${node}).`);
  const candidateFacts = candidates.map((candidate) =>
    `cf_kcm_diag_candidate(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode}).`
  );
  const program = [
    ...cohortFacts,
    ...candidateFacts,
    `cf_kcm_diag_target(${targetNodeIndex}).`,
    "cf_kcm_diag_candidate_pair(U,V) :- cf_kcm_diag_candidate(_,U,V).",
    "cf_kcm_diag_candidate_pair(V,U) :- cf_kcm_diag_candidate(_,U,V).",
    "cf_kcm_diag_neighbor(V,U) :- cf_kcm_diag_node(V), cf_kcm_diag_node(U), U != V, edge(V,U).",
    "cf_kcm_diag_neighbor(V,U) :- cf_kcm_diag_node(V), cf_kcm_diag_node(U), U != V, edge(U,V).",
    "cf_kcm_diag_neighbor(V,U) :- cf_kcm_diag_candidate_pair(V,U).",
    `cf_kcm_diag_step(0..${cohort.size}).`,
    `cf_kcm_diag_last(${cohort.size}).`,
    "cf_kcm_diag_alive(V,0) :- cf_kcm_diag_node(V).",
    `cf_kcm_diag_peeled_at(V,T+1) :- cf_kcm_diag_step(T), cf_kcm_diag_last(N), T < N, cf_kcm_diag_alive(V,T), #count { U : cf_kcm_diag_alive(U,T), U != V, cf_kcm_diag_neighbor(V,U) } < ${k}.`,
    "cf_kcm_diag_alive(V,T+1) :- cf_kcm_diag_step(T), cf_kcm_diag_last(N), T < N, cf_kcm_diag_alive(V,T), not cf_kcm_diag_peeled_at(V,T+1).",
    "cf_kcm_diag_peel_support(V,T+1,U) :- cf_kcm_diag_step(T), cf_kcm_diag_last(N), T < N, cf_kcm_diag_peeled_at(V,T+1), cf_kcm_diag_alive(U,T), U != V, cf_kcm_diag_neighbor(V,U).",
    "cf_kcm_diag_peeled(V) :- cf_kcm_diag_peeled_at(V,_).",
    ":- cf_kcm_diag_target(V), cf_kcm_diag_alive(V,N), cf_kcm_diag_last(N).",
    "#show cf_kcm_diag_peeled_at/2.",
    "#show cf_kcm_diag_peel_support/3."
  ].join("\n");
  return { candidates, program };
}

function computeKCoreMembershipExpectedPeeling(
  k: number,
  candidateNodeIndices: number[],
  edgeIndexPairs: ReadonlyArray<readonly [number, number]>
): { peeling: KCoreMembershipCompletionWhyNotStep[]; remaining: Set<number> } {
  const cohort = new Set(candidateNodeIndices);
  const neighbors = new Map([...cohort].map((node) => [node, new Set<number>()]));
  for (const [left, right] of edgeIndexPairs) {
    if (left === right || !cohort.has(left) || !cohort.has(right)) continue;
    neighbors.get(left)?.add(right);
    neighbors.get(right)?.add(left);
  }

  const active = new Set(cohort);
  const peeling: KCoreMembershipCompletionWhyNotStep[] = [];
  for (let round = 1; round <= cohort.size; round += 1) {
    const wave = [...active].filter((node) =>
      [...(neighbors.get(node) ?? [])].filter((neighbor) => active.has(neighbor)).length < k
    ).sort((left, right) => left - right);
    if (wave.length === 0) break;
    for (const node of wave) {
      const survivingNeighborIds = [...(neighbors.get(node) ?? [])]
        .filter((neighbor) => active.has(neighbor))
        .sort((left, right) => left - right)
        .map(String);
      peeling.push({ nodeId: String(node), round, survivingNeighborIds });
    }
    for (const node of wave) active.delete(node);
  }
  return { peeling, remaining: active };
}

/** Verifies either the full-candidate peeling or its exact prefix through target elimination. */
export function parseKCoreMembershipCompletionWhyNot(
  witnesses: unknown,
  k: number,
  targetNodeIndex: number,
  candidateNodeIndices: number[],
  observedEdges: Array<{ sourceNode: number; targetNode: number }>,
  candidatesInput: unknown,
  nodeIdByIndex: ReadonlyMap<number, string>,
  options: { stopAfterTargetRemoval?: boolean } = {}
): KCoreMembershipCompletionWhyNot {
  validateIntegerParameter("k", k, 0);
  if (!Number.isSafeInteger(targetNodeIndex) || targetNodeIndex < 1 ||
    !Array.isArray(candidateNodeIndices) || candidateNodeIndices.length === 0 ||
    candidateNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(candidateNodeIndices).size !== candidateNodeIndices.length ||
    !candidateNodeIndices.includes(targetNodeIndex)) {
    throw new TypeError("Il dominio candidato deve essere valido, univoco e contenere il nodo obiettivo");
  }
  if (!Array.isArray(observedEdges)) throw new TypeError("Gli archi osservati devono essere un array");
  const cohort = new Set(candidateNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del dominio candidato`);
    }
  }
  const edgeByKey = new Map<string, [number, number]>();
  const addPair = (left: number, right: number) => {
    if (left === right || !cohort.has(left) || !cohort.has(right)) return;
    edgeByKey.set(`${Math.min(left, right)}\u0000${Math.max(left, right)}`, [
      Math.min(left, right), Math.max(left, right)
    ]);
  };
  for (const edge of observedEdges) {
    if (!Number.isSafeInteger(edge.sourceNode) || edge.sourceNode < 1 ||
      !Number.isSafeInteger(edge.targetNode) || edge.targetNode < 1) {
      throw new TypeError("Gli archi osservati devono riferirsi a indici ASP positivi");
    }
    addPair(edge.sourceNode, edge.targetNode);
  }
  for (const candidate of candidates) addPair(candidate.sourceNode, candidate.targetNode);

  const expectedProfile = computeKCoreMembershipExpectedPeeling(k, [...cohort], [...edgeByKey.values()]);
  const expectedPeeling = expectedProfile.peeling;
  if (expectedProfile.remaining.has(targetNodeIndex)) {
    throw new Error("Il risultato UNSAT dell'appartenenza non concorda con il k-core del grafo che usa tutti i candidati");
  }
  const targetRemovalRound = expectedPeeling.find((step) => Number(step.nodeId) === targetNodeIndex)?.round;
  if (targetRemovalRound === undefined) {
    throw new Error("Il peeling indipendente non ha individuato il round di eliminazione del target");
  }
  const expectedCertificatePeeling = options.stopAfterTargetRemoval
    ? expectedPeeling.filter((step) => step.round <= targetRemovalRound)
    : expectedPeeling;

  if (!Array.isArray(witnesses) || witnesses.length !== 1 ||
    witnesses[0] === null || typeof witnesses[0] !== "object") {
    throw new Error("clingo non ha restituito un answer set why-not unico e verificabile");
  }
  const witness = witnesses[0] as Record<string, unknown>;
  if (!Array.isArray(witness.Value) || witness.Value.some((atom) => typeof atom !== "string")) {
    throw new Error("Il witness why-not di clingo non contiene atomi validi");
  }
  const actualPeeling = new Map<number, { round: number; neighbors: Set<number> }>();
  for (const atom of witness.Value as string[]) {
    const peeledMatch = /^cf_kcm_diag_peeled_at\((\d+),(\d+)\)$/.exec(atom);
    if (peeledMatch) {
      const node = Number(peeledMatch[1]);
      const round = Number(peeledMatch[2]);
      if (!cohort.has(node) || round < 1 || round > cohort.size || actualPeeling.has(node)) {
        throw new Error("Il witness why-not contiene un nodo o round di peeling duplicato o fuori dominio");
      }
      actualPeeling.set(node, { round, neighbors: new Set<number>() });
      continue;
    }
    const supportMatch = /^cf_kcm_diag_peel_support\((\d+),(\d+),(\d+)\)$/.exec(atom);
    if (supportMatch) {
      const node = Number(supportMatch[1]);
      const round = Number(supportMatch[2]);
      const neighbor = Number(supportMatch[3]);
      const peeled = actualPeeling.get(node);
      if (!peeled || peeled.round !== round || !cohort.has(neighbor) || neighbor === node || peeled.neighbors.has(neighbor)) {
        throw new Error("Il witness why-not contiene supporti di peeling duplicati o non coerenti col round");
      }
      peeled.neighbors.add(neighbor);
      continue;
    }
    throw new Error(`Atomo inatteso nel witness why-not k-core membership: ${atom}`);
  }
  const expectedByNode = new Map(expectedCertificatePeeling.map((step) => [Number(step.nodeId), step]));
  if (actualPeeling.size !== expectedByNode.size ||
    [...expectedByNode].some(([node, expected]) => {
      const actual = actualPeeling.get(node);
      return !actual || actual.round !== expected.round ||
        [...actual.neighbors].sort((left, right) => left - right).join(",") !==
        expected.survivingNeighborIds.map(Number).sort((left, right) => left - right).join(",");
    })) {
    throw new Error(options.stopAfterTargetRemoval
      ? "Il witness why-not ASP non corrisponde ai round indipendenti fino all'eliminazione del target"
      : "Il witness why-not ASP non corrisponde all'intera sequenza indipendente di peeling");
  }
  const mapNodeId = (index: number) => {
    const nodeId = nodeIdByIndex.get(index);
    if (typeof nodeId !== "string" || nodeId === "") throw new Error(`Il mapping ASP del nodo ${index} non e verificabile`);
    return nodeId;
  };
  const peeling = expectedCertificatePeeling.map((step) => ({
    nodeId: mapNodeId(Number(step.nodeId)),
    round: step.round,
    survivingNeighborIds: step.survivingNeighborIds.map((nodeIndex) => mapNodeId(Number(nodeIndex)))
  }));
  return {
    targetK: k,
    targetNodeId: mapNodeId(targetNodeIndex),
    candidateNodeIds: [...cohort].sort((left, right) => left - right).map(mapNodeId),
    candidateEdgeIds: candidates.map((candidate) => candidate.id),
    peelingScope: options.stopAfterTargetRemoval ? "target_prefix" : "full",
    peeling
  };
}

export interface KCoreMembershipWhyNotSolverResult {
  Result?: string;
  Error?: unknown;
  Models?: { More?: unknown };
  Call?: Array<{ Witnesses?: unknown }>;
  [key: string]: unknown;
}

const MAX_KCORE_WHY_NOT_ROUNDS_PER_QUERY = 32;

/** Builds a bounded synchronous peeling horizon so long target prefixes need fewer solver invocations. */
function buildKCoreMembershipPeelingBatchProgram(
  k: number,
  activeNodeIndices: number[],
  edgeIndexPairs: ReadonlyArray<readonly [number, number]>,
  roundLimit: number
): string {
  const active = [...new Set(activeNodeIndices)].sort((left, right) => left - right);
  const activeSet = new Set(active);
  const neighbors = new Set<string>();
  for (const [left, right] of edgeIndexPairs) {
    if (left === right || !activeSet.has(left) || !activeSet.has(right)) continue;
    neighbors.add(`cf_kcm_diag_neighbor(${left},${right}).`);
    neighbors.add(`cf_kcm_diag_neighbor(${right},${left}).`);
  }
  return [
    ...active.map((node) => `cf_kcm_diag_node(${node}).`),
    ...[...neighbors].sort(),
    `cf_kcm_diag_step(0..${roundLimit}).`,
    `cf_kcm_diag_last(${roundLimit}).`,
    "cf_kcm_diag_alive(V,0) :- cf_kcm_diag_node(V).",
    `cf_kcm_diag_peeled_at(V,T+1) :- cf_kcm_diag_step(T), cf_kcm_diag_last(N), T < N, cf_kcm_diag_alive(V,T), #count { U : cf_kcm_diag_alive(U,T), U != V, cf_kcm_diag_neighbor(V,U) } < ${k}.`,
    "cf_kcm_diag_alive(V,T+1) :- cf_kcm_diag_step(T), cf_kcm_diag_last(N), T < N, cf_kcm_diag_alive(V,T), not cf_kcm_diag_peeled_at(V,T+1).",
    "cf_kcm_diag_peel_support(V,T+1,U) :- cf_kcm_diag_step(T), cf_kcm_diag_last(N), T < N, cf_kcm_diag_peeled_at(V,T+1), cf_kcm_diag_alive(U,T), U != V, cf_kcm_diag_neighbor(V,U).",
    "#show cf_kcm_diag_peeled_at/2.",
    "#show cf_kcm_diag_peel_support/3."
  ].join("\n");
}

/** Builds and verifies a full-candidate k-core why-not certificate with bounded ASP peeling horizons. */
export async function solveKCoreMembershipCompletionWhyNotByRounds(
  k: number,
  targetNodeIndex: number,
  candidateNodeIndices: number[],
  observedEdges: Array<{ sourceNode: number; targetNode: number }>,
  candidatesInput: unknown,
  nodeIdByIndex: ReadonlyMap<number, string>,
  solveRound: (program: string) => Promise<KCoreMembershipWhyNotSolverResult>,
  options: {
    stopAfterTargetRemoval?: boolean;
    maxRoundsPerQuery?: number;
    adaptiveBatching?: boolean;
  } = {}
): Promise<KCoreMembershipCompletionWhyNot> {
  validateIntegerParameter("k", k, 0);
  if (!Number.isSafeInteger(targetNodeIndex) || targetNodeIndex < 1 ||
    !Array.isArray(candidateNodeIndices) || candidateNodeIndices.length === 0 ||
    candidateNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(candidateNodeIndices).size !== candidateNodeIndices.length ||
    !candidateNodeIndices.includes(targetNodeIndex)) {
    throw new TypeError("Il dominio candidato deve essere valido, univoco e contenere il nodo obiettivo");
  }
  if (!Array.isArray(observedEdges)) throw new TypeError("Gli archi osservati devono essere un array");
  if (typeof solveRound !== "function") throw new TypeError("solveRound deve essere una funzione");
  const maxRoundsPerQueryCap = options.maxRoundsPerQuery ?? 1;
  if (!Number.isSafeInteger(maxRoundsPerQueryCap) || maxRoundsPerQueryCap < 1 ||
    maxRoundsPerQueryCap > MAX_KCORE_WHY_NOT_ROUNDS_PER_QUERY) {
    throw new RangeError(`maxRoundsPerQuery deve essere un intero fra 1 e ${MAX_KCORE_WHY_NOT_ROUNDS_PER_QUERY}`);
  }
  if (options.adaptiveBatching !== undefined && typeof options.adaptiveBatching !== "boolean") {
    throw new TypeError("adaptiveBatching deve essere booleano");
  }

  const cohort = new Set(candidateNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del dominio candidato`);
    }
  }
  const edgeByKey = new Map<string, [number, number]>();
  const addPair = (sourceNode: number, targetNode: number) => {
    if (sourceNode === targetNode || !cohort.has(sourceNode) || !cohort.has(targetNode)) return;
    const left = Math.min(sourceNode, targetNode);
    const right = Math.max(sourceNode, targetNode);
    edgeByKey.set(`${left}\u0000${right}`, [left, right]);
  };
  for (const edge of observedEdges) {
    if (edge === null || typeof edge !== "object" ||
      !Number.isSafeInteger(edge.sourceNode) || edge.sourceNode < 1 ||
      !Number.isSafeInteger(edge.targetNode) || edge.targetNode < 1) {
      throw new TypeError("Gli archi osservati devono riferirsi a indici ASP positivi");
    }
    addPair(edge.sourceNode, edge.targetNode);
  }
  for (const candidate of candidates) addPair(candidate.sourceNode, candidate.targetNode);

  const edgeIndexPairs = [...edgeByKey.values()];
  let plannedTargetRemovalRound: number | undefined;
  let maxRoundsPerQuery = maxRoundsPerQueryCap;
  if (options.stopAfterTargetRemoval || options.adaptiveBatching) {
    const expectedProfile = computeKCoreMembershipExpectedPeeling(k, [...cohort], edgeIndexPairs);
    if (options.stopAfterTargetRemoval && expectedProfile.remaining.has(targetNodeIndex)) {
      throw new Error("Il risultato UNSAT dell'appartenenza non concorda con il k-core del grafo che usa tutti i candidati");
    }
    if (options.stopAfterTargetRemoval) {
      plannedTargetRemovalRound = expectedProfile.peeling
        .find((step) => Number(step.nodeId) === targetNodeIndex)?.round;
      if (plannedTargetRemovalRound === undefined) {
        throw new Error("Il peeling indipendente non ha individuato il round di eliminazione del target");
      }
    }
    if (options.adaptiveBatching) {
      const targetPrefixRound = plannedTargetRemovalRound ?? Number.POSITIVE_INFINITY;
      const peeledPerRound = new Map<number, number>();
      for (const step of expectedProfile.peeling) {
        if (step.round > targetPrefixRound) continue;
        peeledPerRound.set(step.round, (peeledPerRound.get(step.round) ?? 0) + 1);
      }
      if ([...peeledPerRound.values()].some((count) => count > 1)) {
        maxRoundsPerQuery = 1;
      }
    }
  }
  const active = new Set(cohort);
  const certificateAtoms: string[] = [];
  let round = 1;
  while (active.size > 0) {
    const activeIndices = [...active].sort((left, right) => left - right);
    const remainingRounds = options.stopAfterTargetRemoval && plannedTargetRemovalRound !== undefined
      ? plannedTargetRemovalRound - round + 1
      : cohort.size - round + 1;
    const roundLimit = Math.min(maxRoundsPerQuery, remainingRounds);
    if (roundLimit < 1) throw new Error("Il piano ASP ha superato il round indipendente di rimozione del target.");
    const program = roundLimit === 1
      ? [
          buildKCorePeelingRoundFacts(activeIndices, edgeIndexPairs, new Map(), "undirected"),
          buildKCorePeelingRoundProgram(k, activeIndices, "", "undirected")
        ].join("\n\n")
      : buildKCoreMembershipPeelingBatchProgram(k, activeIndices, edgeIndexPairs, roundLimit);
    const result = await solveRound(`${program}\n`);
    if (result?.Result !== "SATISFIABLE") {
      const detail = result?.Result === "ERROR" && typeof result.Error === "string"
        ? result.Error
        : result?.Result ?? "risposta vuota";
      throw new Error(`Il solver non ha completato il round ${round} di peeling (${detail}).`);
    }
    if (result.Models?.More !== "no") {
      throw new Error(`Il solver non ha provato la completezza del round ${round} di peeling.`);
    }
    const witnesses = result.Call?.[0]?.Witnesses;
    if (!Array.isArray(witnesses) || witnesses.length !== 1 ||
      witnesses[0] === null || typeof witnesses[0] !== "object") {
      throw new Error(`Il solver non ha restituito un witness unico per il round ${round} di peeling.`);
    }
    const value = (witnesses[0] as Record<string, unknown>).Value;
    if (!Array.isArray(value) || value.some((atom) => typeof atom !== "string")) {
      throw new Error(`Il witness del round ${round} di peeling non contiene atomi validi.`);
    }
    const atoms = roundLimit === 1
      ? (value as string[]).map((atom) => {
          const peeled = /^peeled\((\d+)\)$/.exec(atom);
          if (peeled) return `cf_kcm_diag_peeled_at(${peeled[1]},1)`;
          const support = /^peel_support\((\d+),(\d+)\)$/.exec(atom);
          return support ? `cf_kcm_diag_peel_support(${support[1]},1,${support[2]})` : atom;
        })
      : value as string[];

    const peeledByLocalRound = new Map<number, Set<number>>();
    const supportByLocalRound = new Map<number, Set<string>>();
    for (const atom of atoms) {
      const peeledMatch = /^cf_kcm_diag_peeled_at\((\d+),(\d+)\)$/.exec(atom);
      if (peeledMatch) {
        const node = Number(peeledMatch[1]);
        const localRound = Number(peeledMatch[2]);
        if (!active.has(node) || localRound < 1 || localRound > roundLimit) {
          throw new Error(`Il witness del batch ${round} contiene un nodo o round fuori dal dominio attivo.`);
        }
        const wave = peeledByLocalRound.get(localRound) ?? new Set<number>();
        if (wave.has(node)) throw new Error(`Il witness del batch ${round} duplica un nodo eliminato.`);
        wave.add(node);
        peeledByLocalRound.set(localRound, wave);
        continue;
      }
      const supportMatch = /^cf_kcm_diag_peel_support\((\d+),(\d+),(\d+)\)$/.exec(atom);
      if (supportMatch) {
        const node = Number(supportMatch[1]);
        const localRound = Number(supportMatch[2]);
        const neighbor = Number(supportMatch[3]);
        const key = `${node}\u0000${neighbor}`;
        if (!active.has(node) || !active.has(neighbor) || node === neighbor ||
          localRound < 1 || localRound > roundLimit) {
          throw new Error(`Il witness del batch ${round} contiene un supporto fuori dal dominio attivo.`);
        }
        const supports = supportByLocalRound.get(localRound) ?? new Set<string>();
        if (supports.has(key)) throw new Error(`Il witness del batch ${round} duplica un supporto.`);
        supports.add(key);
        supportByLocalRound.set(localRound, supports);
        continue;
      }
      throw new Error(`Atomo inatteso nel witness del batch di peeling ${round}: ${atom}`);
    }
    for (const [localRound, supports] of supportByLocalRound) {
      const peeled = peeledByLocalRound.get(localRound) ?? new Set<number>();
      if ([...supports].some((key) => !peeled.has(Number(key.split("\u0000")[0])))) {
        throw new Error(`Il witness del batch ${round} attribuisce supporti a nodi non eliminati.`);
      }
    }
    const firstEmptyLocalRound = Array.from({ length: roundLimit }, (_, index) => index + 1)
      .find((localRound) => (peeledByLocalRound.get(localRound)?.size ?? 0) === 0);
    if (firstEmptyLocalRound !== undefined &&
      [...peeledByLocalRound.keys()].some((localRound) => localRound > firstEmptyLocalRound)) {
      throw new Error(`Il witness del batch ${round} riprende il peeling dopo un round senza eliminazioni.`);
    }
    const targetLocalRound = [...peeledByLocalRound].find(([, peeled]) => peeled.has(targetNodeIndex))?.[0];
    const processedLocalRound = options.stopAfterTargetRemoval && targetLocalRound !== undefined
      ? targetLocalRound
      : Math.min(firstEmptyLocalRound ?? roundLimit + 1, roundLimit);
    for (const [localRound, peeled] of peeledByLocalRound) {
      if (localRound > processedLocalRound) continue;
      const globalRound = round + localRound - 1;
      for (const node of peeled) certificateAtoms.push(`cf_kcm_diag_peeled_at(${node},${globalRound})`);
      const supports = supportByLocalRound.get(localRound) ?? new Set<string>();
      for (const key of supports) {
        const [node, neighbor] = key.split("\u0000");
        certificateAtoms.push(`cf_kcm_diag_peel_support(${node},${globalRound},${neighbor})`);
      }
    }

    for (const localRound of Array.from({ length: processedLocalRound }, (_, index) => index + 1)) {
      for (const node of peeledByLocalRound.get(localRound) ?? []) active.delete(node);
    }
    if (options.stopAfterTargetRemoval && targetLocalRound !== undefined) break;
    if (firstEmptyLocalRound !== undefined || active.size === 0) break;
    if (round >= cohort.size && active.size > 0) {
      throw new Error("Il peeling ASP non ha raggiunto un punto fisso entro il numero di nodi candidati.");
    }
    round += processedLocalRound;
  }

  return parseKCoreMembershipCompletionWhyNot(
    [{ Value: certificateAtoms }],
    k,
    targetNodeIndex,
    candidateNodeIndices,
    observedEdges,
    candidates,
    nodeIdByIndex,
    options
  );
}

/** Finds minimum-cost additions that raise the minimum internal degree of a fixed cohort to k. */
export function buildKCoreCompletionCounterfactualProgram(
  k: number,
  cohortNodeIndices: number[],
  candidatesInput: unknown
): { candidates: StructuralEdgeCompletionCandidate[]; program: string } {
  validateIntegerParameter("k", k, 0);
  if (!Array.isArray(cohortNodeIndices) || cohortNodeIndices.length === 0 ||
    cohortNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(cohortNodeIndices).size !== cohortNodeIndices.length) {
    throw new TypeError("Il cohort deve contenere indici ASP positivi, univoci e non vuoti");
  }
  const cohort = new Set(cohortNodeIndices);
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!cohort.has(candidate.sourceNode) || !cohort.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare due nodi del cohort selezionato`);
    }
  }
  const cohortFacts = [...cohort].sort((left, right) => left - right).map((node) => `cf_core_cohort(${node}).`);
  const candidateFacts = candidates.map((candidate) =>
    `cf_core_candidate(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode},${escapeAspString(candidate.edgeType)},${candidate.cost}).`
  );
  const program = [
    ...cohortFacts,
    ...candidateFacts,
    "{ cf_core_add_edge(E) } :- cf_core_candidate(E,_,_,_,_).",
    "cf_core_adjacent(U,V) :- edge(U,V).",
    "cf_core_adjacent(U,V) :- cf_core_add_edge(E), cf_core_candidate(E,U,V,_,_).",
    "cf_core_adjacent(V,U) :- cf_core_add_edge(E), cf_core_candidate(E,U,V,_,_).",
    "cf_core_degree(V,D) :- cf_core_cohort(V), D = #count { U : cf_core_cohort(U), U != V, cf_core_adjacent(V,U) }.",
    `:- cf_core_cohort(V), cf_core_degree(V,D), D < ${k}.`,
    "#minimize { Cost,E : cf_core_add_edge(E), cf_core_candidate(E,_,_,_,Cost) }.",
    "#show cf_core_add_edge/1."
  ].join("\n");
  return { candidates, program };
}

/** Finds minimum-cost declared additions that make one target belong to a k-core. */
export function buildKCoreMembershipCompletionCounterfactualProgram(
  k: number,
  targetNodeIndex: number,
  candidateNodeIndices: number[],
  candidatesInput: unknown
): { candidates: StructuralEdgeCompletionCandidate[]; program: string } {
  validateIntegerParameter("k", k, 0);
  if (!Number.isSafeInteger(targetNodeIndex) || targetNodeIndex < 1) {
    throw new TypeError("Il nodo obiettivo deve avere un indice ASP positivo");
  }
  if (!Array.isArray(candidateNodeIndices) || candidateNodeIndices.length === 0 ||
    candidateNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1) ||
    new Set(candidateNodeIndices).size !== candidateNodeIndices.length) {
    throw new TypeError("Il dominio candidato deve contenere indici ASP positivi, univoci e non vuoti");
  }
  const candidateNodeSet = new Set(candidateNodeIndices);
  if (!candidateNodeSet.has(targetNodeIndex)) {
    throw new TypeError("Il nodo obiettivo deve appartenere al dominio candidato");
  }
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  for (const candidate of candidates) {
    if (!candidateNodeSet.has(candidate.sourceNode) || !candidateNodeSet.has(candidate.targetNode)) {
      throw new TypeError(`edgeAdditions.${candidate.id} deve collegare nodi del dominio candidato`);
    }
  }

  const nodeFacts = [...candidateNodeSet].sort((left, right) => left - right)
    .map((node) => `cf_core_pool(${node}).`);
  const candidateFacts = candidates.map((candidate) =>
    `cf_core_membership_candidate(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode},${candidate.cost}).`
  );
  const program = [
    ...nodeFacts,
    ...candidateFacts,
    "{ cf_core_member(V) } :- cf_core_pool(V).",
    `:- not cf_core_member(${targetNodeIndex}).`,
    "{ cf_core_membership_add_edge(E) } :- cf_core_membership_candidate(E,U,V,_), cf_core_member(U), cf_core_member(V).",
    "cf_core_membership_neighbor(V,U) :- cf_core_member(V), cf_core_member(U), V != U, edge(V,U).",
    "cf_core_membership_neighbor(U,V) :- cf_core_membership_add_edge(E), cf_core_membership_candidate(E,U,V,_), U != V.",
    "cf_core_membership_neighbor(V,U) :- cf_core_membership_add_edge(E), cf_core_membership_candidate(E,U,V,_), U != V.",
    `:- cf_core_member(V), #count { U : cf_core_membership_neighbor(V,U) } < ${k}.`,
    "#minimize { Cost,E : cf_core_membership_add_edge(E), cf_core_membership_candidate(E,_,_,Cost) }.",
    "#project cf_core_membership_add_edge/1.",
    "#show cf_core_membership_add_edge/1.",
    "#show cf_core_member/1."
  ].join("\n");
  return { candidates, program };
}

/** Uses projection to enumerate distinct minimum-cost addition sets, not duplicate core witnesses. */
export function getKCoreMembershipCounterfactualSolverOptions(enumerateAllOptima = false): string[] {
  return [
    `--opt-mode=${enumerateAllOptima ? "optN" : "opt"}`,
    ...(enumerateAllOptima ? ["--project=project"] : [])
  ];
}

/** Maps only complete optimal witnesses back to the configured candidate records. */
export function parseKPlexCompletionCounterfactuals(
  witnesses: unknown,
  candidates: KPlexCompletionCandidate[]
): KPlexCompletionProposal[] {
  return parseStructuralEdgeCompletionCounterfactuals(witnesses, candidates, "cf_add_edge");
}

export function parseKCoreCompletionCounterfactuals(
  witnesses: unknown,
  candidates: StructuralEdgeCompletionCandidate[]
): StructuralEdgeCompletionProposal[] {
  return parseStructuralEdgeCompletionCounterfactuals(witnesses, candidates, "cf_core_add_edge");
}

/** Parses optimal edge sets and one degree-valid core witness containing the target for each set. */
export function parseKCoreMembershipCompletionCounterfactuals(
  witnesses: unknown,
  candidates: StructuralEdgeCompletionCandidate[],
  nodeIdByIndex: ReadonlyMap<number, string>,
  targetNodeId: string
): KCoreMembershipCompletionProposal[] {
  const proposals: KCoreMembershipCompletionProposal[] = [];
  const seen = new Set<string>();
  const optimalAdditions = parseStructuralEdgeCompletionCounterfactuals(
    witnesses, candidates, "cf_core_membership_add_edge"
  );
  const optimalKeys = new Set(optimalAdditions.map((proposal) =>
    proposal.addedEdges.map((edge) => edge.id).sort().join("\u0000")
  ));
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    if (witness === null || typeof witness !== "object") continue;
    const record = witness as Record<string, unknown>;
    const atoms = Array.isArray(record.Value)
      ? record.Value.filter((atom): atom is string => typeof atom === "string")
      : [];
    const parsedAdditions = parseStructuralEdgeCompletionCounterfactuals(
      [record], candidates, "cf_core_membership_add_edge"
    )[0];
    if (!parsedAdditions) continue;
    const key = parsedAdditions.addedEdges.map((edge) => edge.id).sort().join("\u0000");
    if (!optimalKeys.has(key)) continue;
    const coreIndexes = atoms
      .map((atom) => /^cf_core_member\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => Number(match[1]));
    if (coreIndexes.length === 0 || new Set(coreIndexes).size !== coreIndexes.length) continue;
    const coreWitnessNodeIds = coreIndexes.map((index) => nodeIdByIndex.get(index));
    if (coreWitnessNodeIds.some((nodeId) => nodeId === undefined) ||
      !coreWitnessNodeIds.includes(targetNodeId)) continue;
    const uniqueCoreWitnessNodeIds = coreWitnessNodeIds as string[];
    uniqueCoreWitnessNodeIds.sort((left, right) => left.localeCompare(right));
    if (seen.has(key)) continue;
    seen.add(key);
    proposals.push({ ...parsedAdditions, coreWitnessNodeIds: uniqueCoreWitnessNodeIds });
  }
  return proposals.sort((left, right) => left.totalCost - right.totalCost ||
    left.addedEdges.map((edge) => edge.id).sort().join("\u0000").localeCompare(
      right.addedEdges.map((edge) => edge.id).sort().join("\u0000")
    ));
}

function parseStructuralEdgeCompletionCounterfactuals(
  witnesses: unknown,
  candidates: StructuralEdgeCompletionCandidate[],
  predicate: "cf_add_edge" | "cf_core_add_edge" | "cf_core_membership_add_edge"
): StructuralEdgeCompletionProposal[] {
  const byRecord = new Map(candidates.map((candidate) => [candidate.recordIndex, candidate]));
  const seen = new Set<string>();
  const results: KPlexCompletionProposal[] = [];
  let bestCost: number | undefined;
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    if (witness === null || typeof witness !== "object") continue;
    const record = witness as Record<string, unknown>;
    const atoms = Array.isArray(record.Value) ? record.Value : [];
    const indexes = atoms.flatMap((atom) => {
      if (typeof atom !== "string") return [];
      const match = new RegExp(`^${predicate}\\((\\d+)\\)$`).exec(atom);
      return match ? [Number(match[1])] : [];
    });
    const addedEdges = indexes.map((index) => byRecord.get(index));
    if (addedEdges.some((candidate) => !candidate) || new Set(indexes).size !== indexes.length) continue;
    const completeEdges = addedEdges as KPlexCompletionCandidate[];
    const totalCost = completeEdges.reduce((sum, candidate) => sum + candidate.cost, 0);
    if (!Number.isSafeInteger(totalCost)) continue;
    const costs = record.Costs;
    if (candidates.length > 0 && (!Array.isArray(costs) || costs.length === 0 || typeof costs[0] !== "number")) continue;
    if (Array.isArray(costs) && costs.length > 0 && costs[0] !== totalCost) continue;
    if (bestCost === undefined || totalCost < bestCost) bestCost = totalCost;
    if (totalCost > bestCost) continue;
    const key = [...indexes].sort((left, right) => left - right).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      totalCost,
      addedEdges: completeEdges.map(({ id, sourceNodeId, targetNodeId, edgeType, cost }) => ({
        id, sourceNodeId, targetNodeId, edgeType, cost
      }))
    });
  }
  return results.filter((proposal) => proposal.totalCost === bestCost).sort((left, right) =>
    left.addedEdges.map((edge) => edge.id).join("\u0000").localeCompare(right.addedEdges.map((edge) => edge.id).join("\u0000")));
}

export interface KPlexFeasibilityResult {
  Result?: string;
  Error?: unknown;
  [key: string]: unknown;
}

/** Distinguishes callClingo's timeout error payload from an actual solver failure. */
export function normalizeKPlexTimeoutResult(result: KPlexFeasibilityResult): KPlexFeasibilityResult {
  return result.Result === "ERROR" &&
    typeof result.Error === "string" &&
    result.Error.startsWith("Tempo massimo superato")
    ? { ...result, Result: "TIMEOUT" }
    : result;
}

/** Proves the maximum s-plex cardinality through monotone ASP feasibility queries. */
export async function searchMaximumKPlexWithAsp(
  s: number,
  candidateNodeIds: string[],
  edges: Array<{ source: unknown; target: unknown }>,
  group: string,
  enumerateAllOptima: boolean,
  solve: (program: string, modelLimit: number) => Promise<{ Result?: string; Models?: { More?: unknown }; [key: string]: unknown }>
): Promise<MaximumKPlexAspSearchResult> {
  validateIntegerParameter("s", s, 1);
  const upperBound = getMaximumKPlexCardinalityUpperBound(s, candidateNodeIds, edges);
  if (upperBound === 0) return { complete: true, maximumSize: 0, queryCount: 0 };

  let lowerBound = 0;
  let infeasibleBound = upperBound + 1;
  let queryCount = 0;
  let bestFeasibleResult: MaximumKPlexAspSearchResult["result"];
  while (infeasibleBound - lowerBound > 1) {
    const target = Math.floor((lowerBound + infeasibleBound) / 2);
    const result = await solve(buildKPlexAtLeastProgram(s, target, group), 1);
    queryCount += 1;
    if (result.Result === "SATISFIABLE") {
      lowerBound = target;
      bestFeasibleResult = result;
    } else if (result.Result === "UNSATISFIABLE") {
      infeasibleBound = target;
    } else {
      return { complete: false, maximumSize: lowerBound, queryCount, solverStatus: result.Result ?? "EMPTY" };
    }
  }

  if (lowerBound === 0) {
    return { complete: false, maximumSize: 0, queryCount, solverStatus: "UNSATISFIABLE" };
  }
  if (enumerateAllOptima) {
    const result = await solve(buildKPlexExactSizeProgram(s, lowerBound, group), 0);
    queryCount += 1;
    if (result.Result !== "SATISFIABLE" || result.Models?.More !== "no") {
      return {
        complete: false,
        maximumSize: lowerBound,
        queryCount,
        solverStatus: result.Result === "SATISFIABLE"
          ? "INCOMPLETE_ENUMERATION"
          : result.Result ?? "EMPTY"
      };
    }
    bestFeasibleResult = result;
  }
  return { complete: true, maximumSize: lowerBound, queryCount, result: bestFeasibleResult, solverStatus: "OPTIMUM FOUND" };
}

/** Maximum-cardinality induced k-core; directed graphs require an explicit degree semantics. */
export function buildKCoreProgram(
  k: number,
  group = "",
  explainExclusions = false,
  direction: "undirected" | "directed" = "undirected",
  directedMode?: DirectedKCoreMode,
  peelingRoundLimit?: number
): string {
  validateIntegerParameter("k", k, 0);
  if (direction !== "undirected" && direction !== "directed") {
    throw new TypeError("direction deve essere undirected oppure directed");
  }
  if (direction === "directed" && directedMode !== "in" && directedMode !== "out" && directedMode !== "mutual") {
    throw new TypeError("Un k-core diretto richiede una semantica esplicita: in, out oppure mutual");
  }
  if (direction === "undirected" && directedMode !== undefined) {
    throw new TypeError("La semantica direzionale del k-core si applica soltanto ai grafi diretti");
  }
  if (peelingRoundLimit !== undefined) {
    validateIntegerParameter("peelingRoundLimit", peelingRoundLimit, 0);
    if (!explainExclusions) {
      throw new TypeError("peelingRoundLimit si applica soltanto quando explainExclusions e attivo");
    }
  }
  const domain = candidateDomain(group);
  const neighborRules = direction === "undirected"
    ? ["core_neighbor(V,U) :- candidate_node(V), candidate_node(U), edge(V,U)."]
    : directedMode === "in"
      ? ["core_neighbor(V,U) :- candidate_node(V), candidate_node(U), edge(U,V)."]
      : directedMode === "out"
        ? ["core_neighbor(V,U) :- candidate_node(V), candidate_node(U), edge(V,U)."]
        : ["core_neighbor(V,U) :- candidate_node(V), candidate_node(U), edge(V,U), edge(U,V)."];
  const supportRules = direction === "undirected"
    ? ["core_support(U,V) :- in(U), in(V), U < V, core_neighbor(U,V)."]
    : ["core_support(V,U) :- in(V), in(U), V != U, core_neighbor(V,U)."];
  const peelingRules = explainExclusions
    ? [
      ...(peelingRoundLimit === undefined
        ? [
          "peel_step(0..N) :- N = #count { V : candidate_node(V) }.",
          "last_peel_step(N) :- N = #count { V : candidate_node(V) }."
        ]
        : [
          `peel_step(0..${peelingRoundLimit}).`,
          `last_peel_step(${peelingRoundLimit}).`
        ]),
      "alive(V,0) :- candidate_node(V).",
      `peeled_at(V,T+1) :- peel_step(T), last_peel_step(N), T < N, alive(V,T), #count { U : alive(U,T), U != V, core_neighbor(V,U) } < ${k}.`,
      "alive(V,T+1) :- peel_step(T), last_peel_step(N), T < N, alive(V,T), not peeled_at(V,T+1).",
      "peel_support(V,T+1,U) :- peel_step(T), last_peel_step(N), T < N, peeled_at(V,T+1), alive(U,T), U != V, core_neighbor(V,U).",
      ":- in(V), last_peel_step(N), not alive(V,N).",
      ":- alive(V,N), last_peel_step(N), not in(V).",
      "#show peeled_at/2.",
      "#show peel_support/3."
    ]
    : [];
  return [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    ...neighborRules,
    `{ in(V) : ${domain.predicate}(V) }.`,
    `:- in(V), #count { U : in(U), U != V, core_neighbor(V,U) } < ${k}.`,
    ...supportRules,
    ...peelingRules,
    "#maximize { 1,V : in(V) }.",
    "#show in/1.",
    "#show core_support/2."
  ].filter(Boolean).join("\n\n");
}

/** Builds the facts a single synchronous peeling round can observe. */
export function buildKCorePeelingRoundFacts(
  activeNodeIndices: number[],
  edgeIndexPairs: ReadonlyArray<readonly [number, number]>,
  groupsByNodeIndex: ReadonlyMap<number, readonly string[]> = new Map(),
  direction: "undirected" | "directed" = "undirected"
): string {
  if (direction !== "undirected" && direction !== "directed") {
    throw new TypeError("direction deve essere undirected oppure directed");
  }
  if (!Array.isArray(activeNodeIndices) || activeNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 0)) {
    throw new RangeError("activeNodeIndices deve contenere indici ASP interi non negativi");
  }
  const active = [...new Set(activeNodeIndices)].sort((left, right) => left - right);
  const activeSet = new Set(active);
  const nodeFacts = active.map((index) => `node(${index}).`);
  const groupFacts = active.flatMap((index) => [...new Set((groupsByNodeIndex.get(index) ?? [])
    .map((group) => String(group).trim())
    .filter(Boolean))]
    .sort()
    .map((group) => `group(${index},${escapeAspString(group)}).`));
  const edgeByKey = new Map<string, readonly [number, number]>();
  const addEdge = (source: number, target: number) => {
    edgeByKey.set(`${source}\u0000${target}`, [source, target]);
  };
  for (const pair of edgeIndexPairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((index) => !Number.isSafeInteger(index) || index < 0)) {
      throw new RangeError("edgeIndexPairs deve contenere coppie di indici ASP interi non negativi");
    }
    const [source, target] = pair;
    if (!activeSet.has(source) || !activeSet.has(target)) continue;
    addEdge(source, target);
    if (direction === "undirected") addEdge(target, source);
  }
  const edgeFacts = [...edgeByKey.values()]
    .sort(([sourceA, targetA], [sourceB, targetB]) => sourceA - sourceB || targetA - targetB)
    .map(([source, target]) => `edge(${source},${target}).`);
  return [...nodeFacts, ...groupFacts, ...edgeFacts].join("\n");
}

/** Builds one ASP-certified synchronous k-core removal round for the supplied active domain. */
export function buildKCorePeelingRoundProgram(
  k: number,
  activeNodeIndices: number[],
  group = "",
  direction: "undirected" | "directed" = "undirected",
  directedMode?: DirectedKCoreMode
): string {
  validateIntegerParameter("k", k, 0);
  if (direction !== "undirected" && direction !== "directed") {
    throw new TypeError("direction deve essere undirected oppure directed");
  }
  if (direction === "directed" && directedMode !== "in" && directedMode !== "out" && directedMode !== "mutual") {
    throw new TypeError("Un k-core diretto richiede una semantica esplicita: in, out oppure mutual");
  }
  if (direction === "undirected" && directedMode !== undefined) {
    throw new TypeError("La semantica direzionale del k-core si applica soltanto ai grafi diretti");
  }
  if (!Array.isArray(activeNodeIndices) || activeNodeIndices.some((index) => !Number.isSafeInteger(index) || index < 1)) {
    throw new RangeError("activeNodeIndices deve contenere indici ASP interi positivi");
  }
  const activeFacts = [...new Set(activeNodeIndices)].sort((left, right) => left - right)
    .map((index) => `peel_active(${index}).`);
  const domain = candidateDomain(group);
  const neighborRules = direction === "undirected"
    ? ["core_neighbor(V,U) :- candidate_node(V), candidate_node(U), edge(V,U)."]
    : directedMode === "in"
      ? ["core_neighbor(V,U) :- candidate_node(V), candidate_node(U), edge(U,V)."]
      : directedMode === "out"
        ? ["core_neighbor(V,U) :- candidate_node(V), candidate_node(U), edge(V,U)."]
        : ["core_neighbor(V,U) :- candidate_node(V), candidate_node(U), edge(V,U), edge(U,V)."];
  return [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    ...neighborRules,
    ...activeFacts,
    `peeled(V) :- peel_active(V), candidate_node(V), #count { U : peel_active(U), U != V, core_neighbor(V,U) } < ${k}.`,
    "peel_support(V,U) :- peeled(V), peel_active(U), U != V, core_neighbor(V,U).",
    "#show peeled/1.",
    "#show peel_support/2."
  ].filter(Boolean).join("\n\n");
}

function buildKCoreAdjacency(
  nodeIds: string[],
  links: StructuralEdgeLike[],
  direction: "undirected" | "directed",
  directedMode?: DirectedKCoreMode
): {
  candidates: string[];
  neighbors: Map<string, Set<string>>;
  affectedByRemoval: Map<string, Set<string>>;
} {
  if (direction !== "undirected" && direction !== "directed") {
    throw new TypeError("direction deve essere undirected oppure directed");
  }
  if (direction === "directed" && directedMode !== "in" && directedMode !== "out" && directedMode !== "mutual") {
    throw new TypeError("Una decomposizione diretta richiede una semantica esplicita: in, out oppure mutual");
  }
  if (direction === "undirected" && directedMode !== undefined) {
    throw new TypeError("La semantica direzionale del k-core si applica soltanto ai grafi diretti");
  }

  const candidates = [...new Set(nodeIds.map(normalizeGraphId).filter(Boolean))];
  const candidateSet = new Set(candidates);
  const outgoing = new Map(candidates.map((nodeId) => [nodeId, new Set<string>()]));
  const neighbors = new Map(candidates.map((nodeId) => [nodeId, new Set<string>()]));
  const affectedByRemoval = new Map(candidates.map((nodeId) => [nodeId, new Set<string>()]));

  for (const link of links) {
    const source = normalizeGraphId(getGraphEndpointId(link.source));
    const target = normalizeGraphId(getGraphEndpointId(link.target));
    if (source === target || !candidateSet.has(source) || !candidateSet.has(target)) continue;
    outgoing.get(source)!.add(target);
    if (direction === "undirected") {
      neighbors.get(source)!.add(target);
      neighbors.get(target)!.add(source);
      affectedByRemoval.get(source)!.add(target);
      affectedByRemoval.get(target)!.add(source);
    }
  }

  if (direction === "directed") {
    for (const [source, targets] of outgoing) {
      for (const target of targets) {
        if (directedMode === "out") {
          neighbors.get(source)!.add(target);
          affectedByRemoval.get(target)!.add(source);
        } else if (directedMode === "in") {
          neighbors.get(target)!.add(source);
          affectedByRemoval.get(source)!.add(target);
        } else if (outgoing.get(target)!.has(source)) {
          neighbors.get(source)!.add(target);
          neighbors.get(target)!.add(source);
          affectedByRemoval.get(source)!.add(target);
          affectedByRemoval.get(target)!.add(source);
        }
      }
    }
  }

  return { candidates, neighbors, affectedByRemoval };
}

/** Counts synchronous rounds with a linear-time peeling pass for a tighter ASP grounding bound. */
export function computeKCorePeelingRoundCount(
  nodeIds: string[],
  links: StructuralEdgeLike[],
  k: number,
  direction: "undirected" | "directed" = "undirected",
  directedMode?: DirectedKCoreMode
): number {
  validateIntegerParameter("k", k, 0);
  const { candidates, neighbors, affectedByRemoval } = buildKCoreAdjacency(nodeIds, links, direction, directedMode);
  const active = new Set(candidates);
  const degree = new Map(candidates.map((nodeId) => [nodeId, neighbors.get(nodeId)!.size]));
  let wave = candidates.filter((nodeId) => degree.get(nodeId)! < k);
  let rounds = 0;

  while (wave.length > 0) {
    rounds += 1;
    for (const nodeId of wave) active.delete(nodeId);
    const nextWave = new Set<string>();
    for (const nodeId of wave) {
      for (const affectedNodeId of affectedByRemoval.get(nodeId) ?? []) {
        if (!active.has(affectedNodeId)) continue;
        const nextDegree = degree.get(affectedNodeId)! - 1;
        degree.set(affectedNodeId, nextDegree);
        if (nextDegree < k) nextWave.add(affectedNodeId);
      }
    }
    wave = [...nextWave];
  }

  return rounds;
}

/** Computes each node's core number with an independent linear-time bucket peeling profile. */
export function computeKCoreNumbers(
  nodeIds: string[],
  links: StructuralEdgeLike[],
  direction: "undirected" | "directed" = "undirected",
  directedMode?: DirectedKCoreMode
): Map<string, number> {
  const { candidates, neighbors, affectedByRemoval } = buildKCoreAdjacency(nodeIds, links, direction, directedMode);

  const degree = new Map(candidates.map((nodeId) => [nodeId, neighbors.get(nodeId)!.size]));
  let maximumDegree = 0;
  for (const value of degree.values()) maximumDegree = Math.max(maximumDegree, value);
  const buckets = Array.from({ length: maximumDegree + 1 }, () => new Set<string>());
  for (const [nodeId, value] of degree) buckets[value].add(nodeId);

  const active = new Set(candidates);
  const coreNumberByNode = new Map<string, number>();
  let minimumDegree = 0;
  while (active.size > 0) {
    while (minimumDegree < buckets.length && buckets[minimumDegree].size === 0) minimumDegree += 1;
    const nodeId = buckets[minimumDegree].values().next().value as string | undefined;
    if (nodeId === undefined) break;
    buckets[minimumDegree].delete(nodeId);
    if (!active.delete(nodeId)) continue;
    coreNumberByNode.set(nodeId, minimumDegree);

    for (const affectedNodeId of affectedByRemoval.get(nodeId) ?? []) {
      if (!active.has(affectedNodeId)) continue;
      const currentDegree = degree.get(affectedNodeId)!;
      if (currentDegree <= minimumDegree) continue;
      buckets[currentDegree].delete(affectedNodeId);
      degree.set(affectedNodeId, currentDegree - 1);
      buckets[currentDegree - 1].add(affectedNodeId);
    }
  }

  return coreNumberByNode;
}

/** Partitions an undirected candidate graph into connected components. */
export function buildConnectedComponentsProgram(group = ""): string {
  const domain = candidateDomain(group);
  return [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    "reach(V,V) :- candidate_node(V).",
    "reach(U,V) :- candidate_node(U), candidate_node(V), edge(U,V).",
    "reach(U,W) :- reach(U,V), edge(V,W), candidate_node(W).",
    "component(V,Root) :- candidate_node(V), Root = #min { U : reach(U,V) }.",
    "#show component/2."
  ].filter(Boolean).join("\n\n");
}

/** Partitions a directed candidate graph into strongly connected components. */
export function buildStronglyConnectedComponentsProgram(group = ""): string {
  const domain = candidateDomain(group);
  return [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    "reach(V,V) :- candidate_node(V).",
    "reach(U,V) :- candidate_node(U), candidate_node(V), edge(U,V).",
    "reach(U,W) :- reach(U,V), edge(V,W), candidate_node(W).",
    "strong_component(V,Root) :- candidate_node(V), Root = #min { U : candidate_node(U), reach(U,V), reach(V,U) }.",
    "#show strong_component/2."
  ].filter(Boolean).join("\n\n");
}

/** Partitions a directed candidate graph by reachability when arc direction is ignored. */
export function buildWeaklyConnectedComponentsProgram(group = ""): string {
  const domain = candidateDomain(group);
  return [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    "weak_edge(U,V) :- candidate_node(U), candidate_node(V), edge(U,V).",
    "weak_edge(V,U) :- candidate_node(U), candidate_node(V), edge(U,V).",
    "reach(V,V) :- candidate_node(V).",
    "reach(U,V) :- candidate_node(U), candidate_node(V), weak_edge(U,V).",
    "reach(U,W) :- reach(U,V), weak_edge(V,W), candidate_node(W).",
    "weak_component(V,Root) :- candidate_node(V), Root = #min { U : candidate_node(U), reach(U,V) }.",
    "#show weak_component/2."
  ].filter(Boolean).join("\n\n");
}

/** Minimum dominating set; candidate group chooses members, target group chooses coverage domain. */
export function buildMinimumDominatingSetProgram(candidateGroup = "", targetGroup = ""): string {
  const candidateRule = candidateGroup
    ? `candidate_node(V) :- node(V), group(V, ${escapeAspString(candidateGroup)}).`
    : "candidate_node(V) :- node(V).";
  const targetRule = targetGroup
    ? `target_node(V) :- node(V), group(V, ${escapeAspString(targetGroup)}).`
    : "target_node(V) :- node(V).";
  return [
    candidateRule,
    targetRule,
    "{ in(V) : candidate_node(V) }.",
    "dominated_by(V,V) :- target_node(V), in(V).",
    "dominated_by(V,U) :- target_node(V), in(U), U != V, edge(U,V).",
    "dominated(V) :- dominated_by(V,_).",
    ":- target_node(V), not dominated(V).",
    "#minimize { 1,V : in(V) }.",
    "#show in/1.",
    "#show dominated_by/2."
  ].join("\n\n");
}

/** Explains infeasibility by identifying targets with no candidate that can cover them. */
export function buildDominatingSetFeasibilityProgram(candidateGroup = "", targetGroup = ""): string {
  const candidateRule = candidateGroup
    ? `candidate_node(V) :- node(V), group(V, ${escapeAspString(candidateGroup)}).`
    : "candidate_node(V) :- node(V).";
  const targetRule = targetGroup
    ? `target_node(V) :- node(V), group(V, ${escapeAspString(targetGroup)}).`
    : "target_node(V) :- node(V).";
  return [
    candidateRule,
    targetRule,
    "candidate_can_cover(V) :- target_node(V), candidate_node(V).",
    "candidate_can_cover(V) :- target_node(V), candidate_node(U), U != V, edge(U,V).",
    "uncoverable_target(V) :- target_node(V), not candidate_can_cover(V).",
    "#show target_node/1.",
    "#show uncoverable_target/1."
  ].join("\n\n");
}

/** Minimum set of eligible non-terminal nodes whose removal disconnects two terminals. */
export function buildMinimumNodeSeparatorProgram(
  startNode: number,
  goalNode: number,
  removalGroup = ""
): string {
  return buildNodeSeparatorProgram(startNode, goalNode, removalGroup, false);
}

/** Finds a minimum-cost set of eligible non-terminal nodes that separates two terminals. */
export function buildMinimumCostNodeSeparatorProgram(
  startNode: number,
  goalNode: number,
  removalGroup = ""
): string {
  return buildNodeSeparatorProgram(startNode, goalNode, removalGroup, true);
}

function buildNodeSeparatorProgram(
  startNode: number,
  goalNode: number,
  removalGroup: string,
  useRemovalCosts: boolean
): string {
  validateIntegerParameter("startNode", startNode, 1);
  validateIntegerParameter("goalNode", goalNode, 1);
  if (startNode === goalNode) throw new RangeError("I due terminali del separatore devono essere distinti");
  const removableRule = removalGroup
    ? `removable_node(V) :- node(V), group(V, ${escapeAspString(removalGroup)}).`
    : "removable_node(V) :- node(V).";
  return [
    removableRule,
    `start_node(${startNode}).`,
    `goal_node(${goalNode}).`,
    "{ removed(V) : removable_node(V) }.",
    ":- removed(V), start_node(V).",
    ":- removed(V), goal_node(V).",
    "reachable(S) :- start_node(S).",
    "reachable(V) :- reachable(U), edge(U,V), not removed(V).",
    ":- goal_node(G), reachable(G).",
    ...(useRemovalCosts ? [":- removable_node(V), not start_node(V), not goal_node(V), not node_removal_cost(V,_)."] : []),
    useRemovalCosts
      ? "#minimize { Cost,V : removed(V), node_removal_cost(V,Cost) }."
      : "#minimize { 1,V : removed(V) }.",
    "#show removed/1.",
    "#show reachable/1."
  ].join("\n\n");
}

/** Finds a minimum-cardinality set of edge records separating two terminals in the declared direction. */
export function buildMinimumEdgeSeparatorProgram(
  startNode: number,
  goalNode: number,
  direction: "undirected" | "directed" = "undirected"
): string {
  return buildEdgeSeparatorProgram(startNode, goalNode, false, direction);
}

/** Finds a minimum-cost edge-record cut in the declared direction using mapped removal costs. */
export function buildMinimumCostEdgeSeparatorProgram(
  startNode: number,
  goalNode: number,
  direction: "undirected" | "directed" = "undirected"
): string {
  return buildEdgeSeparatorProgram(startNode, goalNode, true, direction);
}

function buildEdgeSeparatorProgram(
  startNode: number,
  goalNode: number,
  useRemovalCosts: boolean,
  direction: "undirected" | "directed"
): string {
  validateIntegerParameter("startNode", startNode, 1);
  validateIntegerParameter("goalNode", goalNode, 1);
  if (startNode === goalNode) throw new RangeError("I due terminali del taglio d'arco devono essere distinti");
  if (direction !== "undirected" && direction !== "directed") {
    throw new TypeError("direction deve essere undirected oppure directed");
  }
  const reverseArcRule = direction === "undirected"
    ? ["reachable(U) :- reachable(V), cut_edge_record(E), cut_edge_source(E,U), cut_edge_target(E,V), not removed_edge(E)."]
    : [];
  return [
    `start_node(${startNode}).`,
    `goal_node(${goalNode}).`,
    "{ removed_edge(E) : cut_edge_record(E) }.",
    "reachable(S) :- start_node(S).",
    "reachable(V) :- reachable(U), cut_edge_record(E), cut_edge_source(E,U), cut_edge_target(E,V), not removed_edge(E).",
    ...reverseArcRule,
    ":- goal_node(G), reachable(G).",
    ...(useRemovalCosts ? [":- cut_edge_record(E), not cut_edge_removal_cost(E,_)."] : []),
    useRemovalCosts
      ? "#minimize { Cost,E : removed_edge(E), cut_edge_removal_cost(E,Cost) }."
      : "#minimize { 1,E : removed_edge(E) }.",
    "#show removed_edge/1.",
    "#show reachable/1."
  ].join("\n\n");
}

export interface MinimumEdgeSeparatorFacts {
  facts: string;
  reverseEdgeIndex: Record<number, string>;
  displayIdByEdgeId: Record<string, string>;
  removalCostByEdgeId: Record<string, number>;
}

type StructuralEdgeLike = {
  source: unknown;
  target: unknown;
  sourceId?: unknown;
  sourceIdGenerated?: boolean;
  analysis?: Record<string, unknown>;
};

export interface KCoreSupportingRecord {
  edgeIdentity: string;
  edgeId?: string;
  edgeIdGenerated: boolean;
}

export interface KCoreSupportingPair {
  /** Focal node being certified; for directed modes this is the node whose degree is counted. */
  sourceNodeId: string;
  /** Supporting neighbor; in-mode records point to the focal node, out-mode records leave it. */
  targetNodeId: string;
  supportingRecords: KCoreSupportingRecord[];
}

export interface DominatingSetCoverageWitness {
  targetNodeId: string;
  coveringNodeId: string;
  supportingRecords: KCoreSupportingRecord[];
}

/** Maps an ASP-certified adjacency pair back to every projected source record supporting it. */
export function mapKCoreSupportPairsToRecords(
  supportPairs: Array<[string, string]>,
  links: StructuralEdgeLike[],
  mode: "undirected" | DirectedKCoreMode = "undirected"
): KCoreSupportingPair[] {
  const linksByPair = new Map<string, StructuralEdgeLike[]>();
  for (const link of links) {
    const source = normalizeGraphId(getGraphEndpointId(link.source));
    const target = normalizeGraphId(getGraphEndpointId(link.target));
    const key = mode === "undirected"
      ? [source, target].sort().join("\u0000")
      : `${source}\u0000${target}`;
    const pairLinks = linksByPair.get(key) ?? [];
    pairLinks.push(link);
    linksByPair.set(key, pairLinks);
  }

  return supportPairs.map(([sourceNodeId, targetNodeId]) => {
    const keys = mode === "undirected"
      ? [[sourceNodeId, targetNodeId].sort().join("\u0000")]
      : mode === "in"
        ? [`${targetNodeId}\u0000${sourceNodeId}`]
        : mode === "out"
          ? [`${sourceNodeId}\u0000${targetNodeId}`]
          : [`${sourceNodeId}\u0000${targetNodeId}`, `${targetNodeId}\u0000${sourceNodeId}`];
    const supportingRecords = [...new Set(keys.flatMap((key) => linksByPair.get(key) ?? []))].map((link) => {
      const edgeId = link.sourceId ?? link.analysis?.id;
      return {
        edgeIdentity: getStructuralEdgeIdentity(link),
        ...(edgeId !== undefined && edgeId !== null && String(edgeId).trim() !== ""
          ? { edgeId: String(edgeId) }
          : {}),
        edgeIdGenerated: link.sourceIdGenerated === true
      };
    });
    return { sourceNodeId, targetNodeId, supportingRecords };
  });
}

/** Maps each ASP coverage relation to every edge record that witnesses adjacency. */
export function mapDominatingSetSupportPairsToRecords(
  supportPairs: Array<[string, string]>,
  links: StructuralEdgeLike[]
): DominatingSetCoverageWitness[] {
  const edgePairs = supportPairs.filter(([targetNodeId, coveringNodeId]) => targetNodeId !== coveringNodeId);
  const mappedEdges = mapKCoreSupportPairsToRecords(edgePairs, links);
  let edgeIndex = 0;
  return supportPairs.map(([targetNodeId, coveringNodeId]) => ({
    targetNodeId,
    coveringNodeId,
    supportingRecords: targetNodeId === coveringNodeId
      ? []
      : mappedEdges[edgeIndex++]?.supportingRecords ?? []
  }));
}

/** Stable identity for highlighting a retained edge record or a legacy simple pair. */
export function getStructuralEdgeIdentity(link: StructuralEdgeLike): string {
  const mappedId = link.sourceId ?? link.analysis?.id;
  if (mappedId !== undefined && mappedId !== null && String(mappedId).trim() !== "") {
    return `source:${String(mappedId)}`;
  }
  const source = normalizeGraphId(getGraphEndpointId(link.source));
  const target = normalizeGraphId(getGraphEndpointId(link.target));
  return `pair:${[source, target].sort().join("\u0000")}`;
}

export interface StructuralEdgeSourceIdentity {
  sourceId?: string;
  generatedRecordKey?: string;
  legacyEndpointPair?: [string, string];
}

/** Maps solver edge identities to source IDs, generated local keys, or legacy endpoint pairs. */
export function buildEdgeSourceIdentityByIdentity(
  links: StructuralEdgeLike[]
): Record<string, StructuralEdgeSourceIdentity> {
  const sourceIdentityByEdge: Record<string, StructuralEdgeSourceIdentity> = {};
  for (const link of links) {
    const sourceId = link.sourceId ?? link.analysis?.id;
    if (sourceId !== undefined && sourceId !== null && String(sourceId).trim() !== "") {
      sourceIdentityByEdge[getStructuralEdgeIdentity(link)] = link.sourceIdGenerated === true
        ? { generatedRecordKey: String(sourceId) }
        : { sourceId: String(sourceId) };
      continue;
    }

    const source = normalizeGraphId(getGraphEndpointId(link.source));
    const target = normalizeGraphId(getGraphEndpointId(link.target));
    sourceIdentityByEdge[getStructuralEdgeIdentity(link)] = { legacyEndpointPair: [source, target] };
  }
  return sourceIdentityByEdge;
}

/** Maps declared provenance references to the same stable identities used by edge witnesses. */
export function buildEdgeProvenanceByIdentity(links: StructuralEdgeLike[]): Record<string, string> {
  const provenanceByIdentity: Record<string, string> = {};
  for (const link of links) {
    const provenance = formatProvenanceReferences(link.analysis?.provenance);
    if (!provenance) continue;
    provenanceByIdentity[getStructuralEdgeIdentity(link)] = provenance;
  }
  return provenanceByIdentity;
}

/** Maps provenance only to declared source IDs for components whose witnesses expose those IDs. */
export function buildEdgeProvenanceBySourceId(links: StructuralEdgeLike[]): Record<string, string> {
  const provenanceEntries: Array<[string, string]> = [];
  for (const link of links) {
    const sourceId = link.sourceId ?? link.analysis?.id;
    if (sourceId === undefined || sourceId === null || String(sourceId).trim() === "") continue;
    const provenance = formatProvenanceReferences(link.analysis?.provenance);
    if (provenance) provenanceEntries.push([String(sourceId), provenance]);
  }
  return Object.fromEntries(provenanceEntries);
}

/** Maps declared provenance as reference arrays for lossless machine-readable exports. */
export function buildEdgeProvenanceReferencesBySourceId(links: StructuralEdgeLike[]): Record<string, string[]> {
  const provenanceEntries: Array<[string, string[]]> = [];
  for (const link of links) {
    const sourceId = link.sourceId ?? link.analysis?.id;
    if (sourceId === undefined || sourceId === null || String(sourceId).trim() === "") continue;
    const references = normalizeProvenanceReferences(link.analysis?.provenance);
    if (!references?.length) continue;
    provenanceEntries.push([String(sourceId), references]);
  }
  return Object.fromEntries(provenanceEntries);
}

/** Formats each distinct witness ID with its optional declared provenance reference. */
export function summarizeEdgeProvenance(
  edgeIds: string[],
  provenanceBySourceId: Record<string, string>
): string {
  return [...new Set(edgeIds)].flatMap((edgeId) => {
    const provenance = getOwnRecordValue<string>(provenanceBySourceId, edgeId);
    return provenance ? [`${edgeId}: ${provenance}`] : [];
  }).join(" | ");
}

/** Returns the source records in the threshold k-core's induced adjacency relation. */
export function getKCoreInducedEdgeIdentities(
  nodeIds: string[],
  links: StructuralEdgeLike[],
  direction: "undirected" | "directed" = "undirected",
  directedMode?: DirectedKCoreMode
): string[] {
  if (direction !== "undirected" && direction !== "directed") {
    throw new TypeError("direction deve essere undirected oppure directed");
  }
  if (direction === "directed" && directedMode !== "in" && directedMode !== "out" && directedMode !== "mutual") {
    throw new TypeError("Una proiezione diretta richiede una semantica esplicita: in, out oppure mutual");
  }
  if (direction === "undirected" && directedMode !== undefined) {
    throw new TypeError("La semantica direzionale del k-core si applica soltanto ai grafi diretti");
  }

  const candidates = new Set(nodeIds.map(normalizeGraphId));
  const internalLinks = links.flatMap((link) => {
    const source = normalizeGraphId(getGraphEndpointId(link.source));
    const target = normalizeGraphId(getGraphEndpointId(link.target));
    return source !== target && candidates.has(source) && candidates.has(target)
      ? [{ link, source, target }]
      : [];
  });
  const directedPairs = new Set(internalLinks.map(({ source, target }) => `${source}\u0000${target}`));
  const eligibleLinks = direction === "directed" && directedMode === "mutual"
    ? internalLinks.filter(({ source, target }) => directedPairs.has(`${target}\u0000${source}`))
    : internalLinks;

  return [...new Set(eligibleLinks.map(({ link }) => getStructuralEdgeIdentity(link)))];
}

/** Builds task-local edge-record facts, including for the legacy schema without edge IDs. */
export function buildMinimumEdgeSeparatorFacts(
  links: StructuralEdgeLike[],
  indexByNodeId: Map<string, number>,
  nodeLabelById: Map<string, string> = new Map()
): MinimumEdgeSeparatorFacts {
  const lines: string[] = [];
  const reverseEdgeIndex: Record<number, string> = {};
  const displayIdByEdgeId: Record<string, string> = {};
  const removalCostByEdgeId: Record<string, number> = {};
  let record = 0;

  for (const link of links) {
    const sourceId = normalizeGraphId(getGraphEndpointId(link.source));
    const targetId = normalizeGraphId(getGraphEndpointId(link.target));
    const source = indexByNodeId.get(sourceId);
    const target = indexByNodeId.get(targetId);
    if (!source || !target) continue;

    record += 1;
    const identity = getStructuralEdgeIdentity(link);
    const sourceName = nodeLabelById.get(sourceId) ?? sourceId;
    const targetName = nodeLabelById.get(targetId) ?? targetId;
    const mappedId = link.sourceId ?? link.analysis?.id;
    reverseEdgeIndex[record] = identity;
    displayIdByEdgeId[identity] = mappedId !== undefined && mappedId !== null && String(mappedId).trim() !== ""
      ? String(mappedId)
      : `${sourceName} — ${targetName}`;
    lines.push(`cut_edge_record(${record}).`);
    lines.push(`cut_edge_source(${record},${source}).`);
    lines.push(`cut_edge_target(${record},${target}).`);
    const removalCost = Number(link.analysis?.removalCost);
    if (Number.isSafeInteger(removalCost) && removalCost > 0) {
      lines.push(`cut_edge_removal_cost(${record},${removalCost}).`);
      removalCostByEdgeId[identity] = removalCost;
    }
  }

  return {
    facts: lines.length > 0 ? `${lines.join("\n")}\n` : "",
    reverseEdgeIndex,
    displayIdByEdgeId,
    removalCostByEdgeId
  };
}

export interface PathEdgeFacts {
  facts: string;
  reverseEdgeIndex: Record<number, string>;
  displayIdByEdgeId: Record<string, string>;
}

/** Emits one path-witness record per visible edge, also for legacy data without source IDs. */
export function buildPathEdgeFacts(
  links: StructuralEdgeLike[],
  indexByNodeId: Map<string, number>,
  nodeLabelById: Map<string, string> = new Map()
): PathEdgeFacts {
  const lines: string[] = [];
  const reverseEdgeIndex: Record<number, string> = {};
  const displayIdByEdgeId: Record<string, string> = {};
  let record = 0;

  for (const link of links) {
    const sourceId = normalizeGraphId(getGraphEndpointId(link.source));
    const targetId = normalizeGraphId(getGraphEndpointId(link.target));
    const source = indexByNodeId.get(sourceId);
    const target = indexByNodeId.get(targetId);
    if (!source || !target) continue;

    record += 1;
    const identity = getStructuralEdgeIdentity(link);
    const mappedId = link.sourceId ?? link.analysis?.id;
    reverseEdgeIndex[record] = identity;
    displayIdByEdgeId[identity] = mappedId !== undefined && mappedId !== null && String(mappedId).trim() !== ""
      ? link.sourceIdGenerated === true
        ? `chiave locale generata: ${String(mappedId)}`
        : `ID sorgente: ${String(mappedId)}`
      : `coppia legacy: ${nodeLabelById.get(sourceId) ?? sourceId} — ${nodeLabelById.get(targetId) ?? targetId}`;
    lines.push(`path_edge_record(${record}).`);
    lines.push(`path_edge_source(${record},${source}).`);
    lines.push(`path_edge_target(${record},${target}).`);
  }

  return {
    facts: lines.length > 0 ? `${lines.join("\n")}\n` : "",
    reverseEdgeIndex,
    displayIdByEdgeId
  };
}

export interface ModularityEdgeRecord {
  source: number;
  target: number;
  weight?: number | string;
}

export interface ModularityFacts {
  facts: string;
  candidateCount: number;
  edgeCount: number;
  /** Candidate ASP indexes used to create these facts. */
  candidateNodeIndexes: number[];
  /** Edge weights and original 1-based positions after the shared exact scaling. */
  normalizedEdges: Array<{ source: number; target: number; weight: number; globalEdgeIndex: number }>;
  /** Exact scaled degree for each candidate ASP index. */
  nodeDegrees: Array<{ nodeIndex: number; degree: number }>;
  /** ASP facts assigning each candidate to its undirected input component. */
  connectedComponentFacts: string;
  connectedComponentCount: number;
  /** Total weight in the shared exact integer unit sent to ASP. */
  totalWeight: number;
  weighted: boolean;
  /** Divide ASP weight sums by this factor to recover source-data units. */
  weightScaleFactor: number;
  /** Exact decimal rendering of the total source-data weight. */
  displayTotalWeight: string;
  /** Exact rational resolution parameter gamma = numerator / denominator. */
  resolutionNumerator: number;
  resolutionDenominator: number;
  displayResolution: string;
  /** Optional exact pairwise objective facts for small candidate domains. */
  pairwiseObjectiveFacts?: string;
  /** Constant diagonal contribution included by the pairwise ASP objective. */
  pairwiseObjectiveOffset?: number;
  /** Reason the optional pairwise objective could not be represented safely. */
  pairwiseObjectiveUnavailableReason?: string;
}

export interface ModularityComponentFacts {
  facts: ModularityFacts;
  /** Maps each local 1-based ASP edge index back to the full projected edge list. */
  globalEdgeIndexByLocalEdgeIndex: number[];
}

/** Pairwise objective grounding grows cubically with the candidate count. */
export const MAX_PAIRWISE_MODULARITY_CANDIDATES = 18;
/** Bounds the exact Cartesian expansion shown by the browser for all optima. */
export const MAX_FACTORED_MODULARITY_OPTIMA = 10_000;

/**
 * Rewrites 4*M*L_C - D_C^2 as a constant diagonal term plus pair terms for
 * nodes assigned to the same community. A_uv sums parallel edge weights;
 * self-loops stay in the constant because each node is always assigned once.
 */
function buildPairwiseModularityObjective(
  candidates: number[],
  edges: ModularityEdgeRecord[],
  edgeWeights: number[],
  degreeByNode: Map<number, number>,
  totalWeight: number,
  resolutionNumerator: number,
  resolutionDenominator: number
): { facts: string; offset: number } | { reason: string } {
  if (totalWeight <= 0) return { reason: "the total edge weight must be positive" };

  const adjacencyWeight = new Map<string, number>();
  const loopWeight = new Map(candidates.map((node) => [node, 0]));
  for (const [index, edge] of edges.entries()) {
    const weight = edgeWeights[index];
    if (edge.source === edge.target) {
      const next = (loopWeight.get(edge.source) ?? 0) + weight;
      if (!Number.isSafeInteger(next)) return { reason: "a loop weight exceeds the exact integer range" };
      loopWeight.set(edge.source, next);
      continue;
    }
    const left = Math.min(edge.source, edge.target);
    const right = Math.max(edge.source, edge.target);
    const key = `${left}:${right}`;
    const next = (adjacencyWeight.get(key) ?? 0) + weight;
    if (!Number.isSafeInteger(next)) return { reason: "a pair weight exceeds the exact integer range" };
    adjacencyWeight.set(key, next);
  }

  let offset = 0;
  let absoluteObjectiveWeight = 0;
  for (const node of candidates) {
    const degree = degreeByNode.get(node) ?? 0;
    const diagonal = 4 * totalWeight * resolutionDenominator * (loopWeight.get(node) ?? 0)
      - resolutionNumerator * degree * degree;
    if (!Number.isSafeInteger(diagonal) || Math.abs(diagonal) > Number.MAX_SAFE_INTEGER - absoluteObjectiveWeight) {
      return { reason: "the diagonal objective offset exceeds the exact integer range" };
    }
    offset += diagonal;
    absoluteObjectiveWeight += Math.abs(diagonal);
    if (!Number.isSafeInteger(offset)) return { reason: "the objective offset exceeds the exact integer range" };
  }

  const pairLines: string[] = [];
  const orderedCandidates = [...candidates].sort((left, right) => left - right);
  for (let leftIndex = 0; leftIndex < orderedCandidates.length; leftIndex += 1) {
    const left = orderedCandidates[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < orderedCandidates.length; rightIndex += 1) {
      const right = orderedCandidates[rightIndex];
      const edgeWeight = adjacencyWeight.get(`${Math.min(left, right)}:${Math.max(left, right)}`) ?? 0;
      const coefficient = 4 * totalWeight * resolutionDenominator * edgeWeight
        - 2 * resolutionNumerator * (degreeByNode.get(left) ?? 0) * (degreeByNode.get(right) ?? 0);
      if (!Number.isSafeInteger(coefficient) || Math.abs(coefficient) > Number.MAX_SAFE_INTEGER - absoluteObjectiveWeight) {
        return { reason: "a pair objective coefficient exceeds the exact integer range" };
      }
      absoluteObjectiveWeight += Math.abs(coefficient);
      if (coefficient !== 0) pairLines.push(`modularity_pair_score(${left},${right},${coefficient}).`);
    }
  }

  return {
    facts: [`modularity_pairwise_offset(${offset}).`, ...pairLines].join("\n") + "\n",
    offset
  };
}

/** Emits unweighted undirected sufficient statistics; loops contribute degree two. */
export function buildModularityFacts(
  candidateNodeIds: number[],
  edges: ModularityEdgeRecord[],
  options: { weighted?: boolean; includePairwiseObjective?: boolean; resolution?: number | string } = {}
): ModularityFacts {
  const candidates = [...new Set(candidateNodeIds)];
  if (candidates.length === 0 || candidates.some((node) => !Number.isInteger(node) || node < 1)) {
    throw new RangeError("La modularità richiede almeno un nodo candidato con indice ASP positivo");
  }
  const candidateSet = new Set(candidates);
  const degreeByNode = new Map(candidates.map((node) => [node, 0]));
  const weighted = options.weighted === true;
  const scaledResolution = scaleNonNegativeDecimalWeights([options.resolution ?? 1]);
  if (!scaledResolution.ok) {
    throw new RangeError(scaledResolution.reason === "unsafe"
      ? "La risoluzione della modularità eccede il dominio numerico esatto supportato"
      : "La risoluzione della modularità deve essere un numero decimale finito positivo");
  }
  if (scaledResolution.value.values[0] === 0) {
    throw new RangeError("La risoluzione della modularità deve essere positiva");
  }
  const resolutionNumerator = scaledResolution.value.values[0];
  const resolutionDenominator = scaledResolution.value.scaleFactor;
  const displayResolution = formatScaledDecimal(resolutionNumerator, resolutionDenominator);
  let scaledWeights: number[] | null = null;
  let totalWeight = 0;
  let weightScaleFactor = 1;
  let displayTotalWeight = String(edges.length);
  if (weighted && edges.length > 0) {
    const scaled = scaleNonNegativeDecimalWeights(edges.map((edge) => edge.weight));
    if (!scaled.ok) {
      if (scaled.reason === "negative") {
        throw new RangeError("Il peso della modularità deve essere non negativo");
      }
      if (scaled.reason === "invalid") {
        throw new RangeError("Ogni peso della modularità deve essere un numero decimale finito");
      }
      throw new RangeError("I pesi o il punteggio intero della modularità eccedono il dominio numerico esatto supportato");
    }
    scaledWeights = scaled.value.values;
    totalWeight = scaled.value.total;
    weightScaleFactor = scaled.value.scaleFactor;
    displayTotalWeight = scaled.value.displayTotal;
  }
  for (const [index, edge] of edges.entries()) {
    if (!Number.isInteger(edge.source) || !Number.isInteger(edge.target) ||
      !candidateSet.has(edge.source) || !candidateSet.has(edge.target)) {
      throw new RangeError(`L'arco ${index + 1} della modularità deve avere entrambi gli estremi nel dominio candidato`);
    }
    const weight = weighted ? scaledWeights?.[index] : 1;
    if (weight === undefined) throw new RangeError(`Il peso dell'arco ${index + 1} non è disponibile`);
    if (!weighted) totalWeight += weight;
    degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + weight);
    degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + weight);
    if (!Number.isSafeInteger(degreeByNode.get(edge.source)) || !Number.isSafeInteger(degreeByNode.get(edge.target))) {
      throw new RangeError("Il volume pesato dei nodi deve restare un intero sicuro");
    }
  }
  const componentNeighbors = new Map(candidates.map((node) => [node, new Set<number>()]));
  for (const edge of edges) {
    componentNeighbors.get(edge.source)!.add(edge.target);
    componentNeighbors.get(edge.target)!.add(edge.source);
  }
  const componentByNode = new Map<number, number>();
  let connectedComponentCount = 0;
  for (const start of [...candidates].sort((left, right) => left - right)) {
    if (componentByNode.has(start)) continue;
    connectedComponentCount += 1;
    const componentId = start;
    componentByNode.set(start, componentId);
    const pending = [start];
    while (pending.length > 0) {
      const node = pending.pop()!;
      for (const neighbor of componentNeighbors.get(node)!) {
        if (componentByNode.has(neighbor)) continue;
        componentByNode.set(neighbor, componentId);
        pending.push(neighbor);
      }
    }
  }
  const connectedComponentFacts = candidates
    .map((node) => `modularity_component(${node},${componentByNode.get(node)}).`)
    .join("\n") + "\n";
  if (weighted && totalWeight === 0) {
    throw new RangeError("La modularità pesata richiede un peso totale positivo");
  }
  if (totalWeight > 0 && !Number.isSafeInteger(4 * totalWeight * totalWeight)) {
    throw new RangeError("Il punteggio intero della modularità eccede il dominio numerico esatto supportato");
  }
  const maximumAbsoluteScore = 4n * BigInt(totalWeight) * BigInt(totalWeight) * BigInt(resolutionDenominator)
    + BigInt(resolutionNumerator) * BigInt(2 * totalWeight) * BigInt(2 * totalWeight);
  if (maximumAbsoluteScore > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("La risoluzione o il punteggio intero della modularità eccedono il dominio numerico esatto supportato");
  }

  const lines = [
    `modularity_m(${totalWeight}).`,
    `modularity_resolution(${resolutionNumerator},${resolutionDenominator}).`
  ];
  for (const node of candidates) lines.push(`modularity_candidate(${node}).`);
  for (const [node, degree] of degreeByNode) lines.push(`modularity_degree(${node},${degree}).`);
  edges.forEach((edge, index) => {
    lines.push(`modularity_edge(${index + 1},${edge.source},${edge.target}).`);
    if (weighted) lines.push(`modularity_edge_weight(${index + 1},${scaledWeights?.[index]}).`);
  });
  const pairwiseEdgeWeights = edges.map((_, index) => weighted ? scaledWeights?.[index] ?? 0 : 1);
  const pairwise = options.includePairwiseObjective === true
    ? buildPairwiseModularityObjective(
        candidates,
        edges,
        pairwiseEdgeWeights,
        degreeByNode,
        totalWeight,
        resolutionNumerator,
        resolutionDenominator
      )
    : undefined;
  return {
    facts: `${lines.join("\n")}\n`,
    candidateCount: candidates.length,
    edgeCount: edges.length,
    candidateNodeIndexes: [...candidates],
    normalizedEdges: edges.map((edge, index) => ({
      source: edge.source,
      target: edge.target,
      weight: pairwiseEdgeWeights[index],
      globalEdgeIndex: index + 1
    })),
    nodeDegrees: [...degreeByNode].map(([nodeIndex, degree]) => ({ nodeIndex, degree })),
    connectedComponentFacts,
    connectedComponentCount,
    totalWeight,
    weighted,
    weightScaleFactor,
    displayTotalWeight,
    resolutionNumerator,
    resolutionDenominator,
    displayResolution,
    ...(pairwise && "facts" in pairwise
      ? {
          pairwiseObjectiveFacts: pairwise.facts,
          pairwiseObjectiveOffset: pairwise.offset
        }
      : pairwise
        ? { pairwiseObjectiveUnavailableReason: pairwise.reason }
        : {})
  };
}

/**
 * Creates exact independent modularity subproblems for disconnected positive-
 * weight components. Every subproblem retains the global M and gamma in its
 * objective, so its optimum score is the component's additive contribution to
 * the original objective. When `groupZeroVolumeNodesForSingleOptimum` is true,
 * all zero-volume nodes form one neutral subproblem. This preserves one exact
 * optimum; callers must leave it false when they need every optimum because
 * zero-volume nodes can be assigned neutrally across positive components.
 */
export function factorModularityFactsByPositiveWeightComponents(
  facts: ModularityFacts,
  includePairwiseObjective = false,
  groupZeroVolumeNodesForSingleOptimum = false
): ModularityComponentFacts[] | null {
  if (facts.totalWeight <= 0 || facts.resolutionNumerator <= 0 ||
    facts.candidateNodeIndexes.length < 2 || facts.normalizedEdges.length === 0) return null;
  const candidateSet = new Set(facts.candidateNodeIndexes);
  const degreeByNode = new Map(facts.nodeDegrees.map(({ nodeIndex, degree }) => [nodeIndex, degree]));
  if (candidateSet.size !== facts.candidateNodeIndexes.length ||
    facts.candidateNodeIndexes.some((nodeIndex) => {
      const degree = degreeByNode.get(nodeIndex);
      return !Number.isSafeInteger(degree) || degree! < 0;
    }) || facts.normalizedEdges.some((edge) =>
      !candidateSet.has(edge.source) || !candidateSet.has(edge.target) ||
      !Number.isSafeInteger(edge.weight) || edge.weight < 0
    )) return null;
  const zeroVolumeNodes = facts.candidateNodeIndexes.filter((nodeIndex) => degreeByNode.get(nodeIndex) === 0);
  if (zeroVolumeNodes.length > 0 && !groupZeroVolumeNodesForSingleOptimum) return null;
  const positiveVolumeNodes = facts.candidateNodeIndexes.filter((nodeIndex) => (degreeByNode.get(nodeIndex) ?? 0) > 0);
  if (positiveVolumeNodes.length === 0) return null;

  const neighborsByNode = new Map(positiveVolumeNodes.map((nodeIndex) => [nodeIndex, new Set<number>()]));
  for (const edge of facts.normalizedEdges) {
    if (edge.weight <= 0) continue;
    if (edge.source === edge.target) continue;
    neighborsByNode.get(edge.source)!.add(edge.target);
    neighborsByNode.get(edge.target)!.add(edge.source);
  }

  const componentByNode = new Map<number, number>();
  const components: number[][] = [];
  for (const start of [...positiveVolumeNodes].sort((left, right) => left - right)) {
    if (componentByNode.has(start)) continue;
    const componentId = start;
    const component: number[] = [];
    componentByNode.set(start, componentId);
    const pending = [start];
    while (pending.length > 0) {
      const node = pending.pop()!;
      component.push(node);
      for (const neighbor of neighborsByNode.get(node)!) {
        if (componentByNode.has(neighbor)) continue;
        componentByNode.set(neighbor, componentId);
        pending.push(neighbor);
      }
    }
    components.push(component.sort((left, right) => left - right));
  }
  if (zeroVolumeNodes.length > 0) components.push([...zeroVolumeNodes].sort((left, right) => left - right));
  if (components.length < 2) return null;

  return components.map((componentNodes) => {
    const componentNodeSet = new Set(componentNodes);
    const componentEdges = facts.normalizedEdges.filter((edge) =>
      componentNodeSet.has(edge.source) && componentNodeSet.has(edge.target)
    );
    const componentWeights = componentEdges.map(({ weight }) => weight);
    const componentDegrees = new Map(componentNodes.map((nodeIndex) => [nodeIndex, degreeByNode.get(nodeIndex)!]));
    const localEdgeRecords: ModularityEdgeRecord[] = componentEdges.map(({ source, target }) => ({ source, target }));
    const localLines = [
      `modularity_m(${facts.totalWeight}).`,
      `modularity_resolution(${facts.resolutionNumerator},${facts.resolutionDenominator}).`,
      ...componentNodes.map((nodeIndex) => `modularity_candidate(${nodeIndex}).`),
      ...componentNodes.map((nodeIndex) => `modularity_degree(${nodeIndex},${componentDegrees.get(nodeIndex)}).`),
      ...componentEdges.flatMap((edge, localIndex) => [
        `modularity_edge(${localIndex + 1},${edge.source},${edge.target}).`,
        ...(facts.weighted ? [`modularity_edge_weight(${localIndex + 1},${edge.weight}).`] : [])
      ])
    ];
    const containsOnlyZeroVolumeNodes = componentNodes.every((nodeIndex) => degreeByNode.get(nodeIndex) === 0);
    const pairwise = includePairwiseObjective && !containsOnlyZeroVolumeNodes &&
      componentNodes.length <= MAX_PAIRWISE_MODULARITY_CANDIDATES
      ? buildPairwiseModularityObjective(
          componentNodes,
          localEdgeRecords,
          componentWeights,
          componentDegrees,
          facts.totalWeight,
          facts.resolutionNumerator,
          facts.resolutionDenominator
        )
      : undefined;
    const componentFacts: ModularityFacts = {
      facts: `${localLines.join("\n")}\n`,
      candidateCount: componentNodes.length,
      edgeCount: componentEdges.length,
      candidateNodeIndexes: [...componentNodes],
      normalizedEdges: componentEdges.map((edge) => ({ ...edge })),
      nodeDegrees: componentNodes.map((nodeIndex) => ({ nodeIndex, degree: componentDegrees.get(nodeIndex)! })),
      connectedComponentFacts: componentNodes
        .map((nodeIndex) => `modularity_component(${nodeIndex},${componentNodes[0]}).`)
        .join("\n") + "\n",
      connectedComponentCount: 1,
      totalWeight: facts.totalWeight,
      weighted: facts.weighted,
      weightScaleFactor: facts.weightScaleFactor,
      displayTotalWeight: facts.displayTotalWeight,
      resolutionNumerator: facts.resolutionNumerator,
      resolutionDenominator: facts.resolutionDenominator,
      displayResolution: facts.displayResolution,
      ...(pairwise && "facts" in pairwise
        ? { pairwiseObjectiveFacts: pairwise.facts, pairwiseObjectiveOffset: pairwise.offset }
        : pairwise
          ? { pairwiseObjectiveUnavailableReason: pairwise.reason }
          : {})
    };
    return {
      facts: componentFacts,
      globalEdgeIndexByLocalEdgeIndex: componentEdges.map(({ globalEdgeIndex }) => globalEdgeIndex)
    };
  });
}

export interface ModularityCommunityOptions {
  weighted?: boolean;
  /**
   * Excludes co-assignment of positive-volume nodes from distinct connected
   * components. Exact only when there are no community-level constraints.
   * The caller must include `ModularityFacts.connectedComponentFacts` in the
   * ASP input whenever this option is enabled.
   */
  separateDisconnectedComponents?: boolean;
  minCount?: number;
  maxCount?: number;
  mustLinkPairs?: Array<[number, number]>;
  cannotLinkPairs?: Array<[number, number]>;
  attributeBounds?: Array<{
    nodeIndexes: number[];
    attributeName?: string;
    attributeValue?: string | number | boolean;
    minPerCommunity?: number;
    maxPerCommunity?: number;
  }>;
  includeContributions?: boolean;
  pairwiseObjectiveOffset?: number;
  /**
   * Restricts positive-volume members of each community to one connected
   * component of positive-weight edges. Exact for unconstrained modularity:
   * splitting disconnected positive-volume pieces strictly improves Q.
   */
  enforceConnectedPositiveVolumeCommunities?: boolean;
}

/** Validates graphAnalysis.communities without blocking unrelated graph tasks. */
export function validateCommunityConfiguration(
  value: unknown,
  availableNodeAttributes?: ReadonlySet<string>
): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return "graphAnalysis.communities deve essere un oggetto JSON.";
  }

  const config = value as Record<string, unknown>;
  const topologyCounterfactualError = validateCommunityTopologyCounterfactualConfig(
    config.topologyCounterfactuals,
    config.useEdgeWeights === true
  );
  if (topologyCounterfactualError) return topologyCounterfactualError;
  for (const name of ["minCount", "maxCount"] as const) {
    const count = config[name];
    if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 0)) {
      return `graphAnalysis.communities.${name} deve essere un intero non negativo; 0 significa nessun limite.`;
    }
  }
  if (config.useEdgeWeights !== undefined && typeof config.useEdgeWeights !== "boolean") {
    return "graphAnalysis.communities.useEdgeWeights deve essere booleano.";
  }
  if (config.diagnosisCosts !== undefined) {
    if (config.diagnosisCosts === null || typeof config.diagnosisCosts !== "object" || Array.isArray(config.diagnosisCosts)) {
      return "graphAnalysis.communities.diagnosisCosts deve essere un oggetto di costi per categoria.";
    }
    const diagnosisCosts = config.diagnosisCosts as Record<string, unknown>;
    for (const name of ["minimumCommunityCount", "maximumCommunityCount", "mustLink", "cannotLink", "attributeBound"] as const) {
      const cost = diagnosisCosts[name];
      if (cost !== undefined && (!Number.isSafeInteger(cost) || Number(cost) <= 0)) {
        return `graphAnalysis.communities.diagnosisCosts.${name} deve essere un intero positivo sicuro.`;
      }
    }
  }
  if (config.resolution !== undefined &&
    (typeof config.resolution !== "number" || !Number.isFinite(config.resolution) || config.resolution <= 0)) {
    return "graphAnalysis.communities.resolution deve essere un numero finito positivo.";
  }
  if (config.resolution !== undefined && !scaleNonNegativeDecimalWeights([config.resolution]).ok) {
    return "graphAnalysis.communities.resolution non è rappresentabile nel dominio numerico esatto supportato.";
  }
  const minimum = Number(config.minCount ?? 0);
  const maximum = Number(config.maxCount ?? 0);
  if (minimum > 0 && maximum > 0 && minimum > maximum) {
    return "graphAnalysis.communities.minCount non deve superare maxCount.";
  }

  const attributeBounds = config.attributeBounds;
  if (attributeBounds !== undefined && !Array.isArray(attributeBounds)) {
    return "graphAnalysis.communities.attributeBounds deve essere un array di vincoli per comunità.";
  }
  const seenAttributeValues = new Set<string>();
  for (const [index, rawBound] of (Array.isArray(attributeBounds) ? attributeBounds : []).entries()) {
    if (rawBound === null || typeof rawBound !== "object" || Array.isArray(rawBound)) {
      return `graphAnalysis.communities.attributeBounds[${index}] deve essere un oggetto.`;
    }
    const bound = rawBound as Record<string, unknown>;
    if (typeof bound.attribute !== "string" || bound.attribute.trim() === "") {
      return `graphAnalysis.communities.attributeBounds[${index}].attribute deve nominare un attributo mappato non vuoto.`;
    }
    const hasValue = Object.prototype.hasOwnProperty.call(bound, "value");
    if (!hasValue || !(
      typeof bound.value === "string" ||
      typeof bound.value === "boolean" ||
      (typeof bound.value === "number" && Number.isFinite(bound.value))
    )) {
      return `graphAnalysis.communities.attributeBounds[${index}].value deve essere una stringa, un numero finito o un booleano esplicito.`;
    }
    for (const name of ["minPerCommunity", "maxPerCommunity"] as const) {
      const count = bound[name];
      if (count !== undefined && (typeof count !== "number" || !Number.isInteger(count) || count < 0)) {
        return `graphAnalysis.communities.attributeBounds[${index}].${name} deve essere un intero non negativo; 0 significa nessun limite.`;
      }
    }
    const minimumPerCommunity = Number(bound.minPerCommunity ?? 0);
    const maximumPerCommunity = Number(bound.maxPerCommunity ?? 0);
    if (minimumPerCommunity === 0 && maximumPerCommunity === 0) {
      return `graphAnalysis.communities.attributeBounds[${index}] deve dichiarare almeno un limite positivo.`;
    }
    if (maximumPerCommunity > 0 && minimumPerCommunity > maximumPerCommunity) {
      return `graphAnalysis.communities.attributeBounds[${index}].minPerCommunity non deve superare maxPerCommunity.`;
    }
    const attribute = bound.attribute.trim();
    if (availableNodeAttributes && !availableNodeAttributes.has(attribute)) {
      return `graphAnalysis.communities.attributeBounds[${index}].attribute '${attribute}' non è definito in graphMapping.node.attributes.`;
    }
    const valueKey = JSON.stringify([attribute, typeof bound.value, bound.value]);
    if (seenAttributeValues.has(valueKey)) {
      return `graphAnalysis.communities.attributeBounds non deve ripetere la coppia attribute/value (${attribute}).`;
    }
    seenAttributeValues.add(valueKey);
  }

  for (const name of ["mustLink", "cannotLink"] as const) {
    const pairs = config[name];
    if (pairs === undefined) continue;
    if (!Array.isArray(pairs)) {
      return `graphAnalysis.communities.${name} deve essere un array di coppie di ID nodo.`;
    }
    for (const [index, pair] of pairs.entries()) {
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some((id) =>
        !((typeof id === "string" && id.trim() !== "") || (typeof id === "number" && Number.isFinite(id)))
      )) {
        return `graphAnalysis.communities.${name}[${index}] deve contenere due ID nodo stringa o numerici.`;
      }
    }
  }
  return "";
}

export interface ResolvedCommunityAttributeBound {
  nodeIndexes: number[];
  attributeName?: string;
  attributeValue?: string | number | boolean;
  minPerCommunity?: number;
  maxPerCommunity?: number;
}

/** Resolves exact typed JSON attribute values into the ASP candidate-node domain. */
export function resolveCommunityAttributeBounds(
  configuredBounds: unknown,
  candidateNodes: Array<{ id: string; analysis?: Record<string, unknown> }>,
  indexByNodeId: ReadonlyMap<string, number>,
  allowUnsatisfiableMinimum = false,
  includeAttributeIdentity = false
): ResolvedCommunityAttributeBound[] {
  if (configuredBounds === undefined) return [];
  if (!Array.isArray(configuredBounds)) {
    throw new Error("graphAnalysis.communities.attributeBounds deve essere un array di vincoli per comunità.");
  }
  return configuredBounds.map((rawBound, boundIndex) => {
    if (rawBound === null || typeof rawBound !== "object" || Array.isArray(rawBound)) {
      throw new Error(`graphAnalysis.communities.attributeBounds[${boundIndex}] non è valido.`);
    }
    const bound = rawBound as Record<string, unknown>;
    if (typeof bound.attribute !== "string" || !Object.prototype.hasOwnProperty.call(bound, "value")) {
      throw new Error(`graphAnalysis.communities.attributeBounds[${boundIndex}] deve dichiarare attributo e valore.`);
    }
    const attributeName = bound.attribute.trim();
    const value = bound.value;
    if (!((typeof value === "string") || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean")) {
      throw new Error(`graphAnalysis.communities.attributeBounds[${boundIndex}].value deve essere una stringa, un numero finito o un booleano esplicito.`);
    }
    const matchingNodes = candidateNodes.filter((node) => {
      const attributes = node.analysis?.attributes;
      return attributes !== null && typeof attributes === "object" && !Array.isArray(attributes) &&
        Object.prototype.hasOwnProperty.call(attributes, attributeName) &&
        (attributes as Record<string, unknown>)[attributeName] === value;
    });
    const minimum = bound.minPerCommunity === undefined ? 0 : bound.minPerCommunity;
    const maximum = bound.maxPerCommunity === undefined ? 0 : bound.maxPerCommunity;
    if (typeof minimum !== "number" || !Number.isInteger(minimum) || minimum < 0 ||
      typeof maximum !== "number" || !Number.isInteger(maximum) || maximum < 0) {
      throw new Error(`graphAnalysis.communities.attributeBounds[${boundIndex}] contiene limiti non validi.`);
    }
    if (minimum > matchingNodes.length && !allowUnsatisfiableMinimum) {
      throw new Error(
        `graphAnalysis.communities.attributeBounds[${boundIndex}] richiede almeno ${minimum} nodi con ${attributeName}=${JSON.stringify(value)} per comunità, ma la proiezione candidata ne contiene ${matchingNodes.length}.`
      );
    }
    const nodeIndexes = matchingNodes.map((node) => indexByNodeId.get(node.id));
    if (nodeIndexes.some((index) => index === undefined || !Number.isInteger(index) || index < 1)) {
      throw new Error(`graphAnalysis.communities.attributeBounds[${boundIndex}] contiene nodi candidati non indicizzati per ASP.`);
    }
    return {
      nodeIndexes: nodeIndexes as number[],
      ...(includeAttributeIdentity ? { attributeName, attributeValue: value } : {}),
      ...(minimum > 0 ? { minPerCommunity: minimum } : {}),
      ...(maximum > 0 ? { maxPerCommunity: maximum } : {})
    };
  });
}

function communityAttributeBoundFacts(
  bounds: ModularityCommunityOptions["attributeBounds"] = []
): string[] {
  const lines: string[] = [];
  for (const [index, bound] of bounds.entries()) {
    const id = index + 1;
    if (!Array.isArray(bound.nodeIndexes) || bound.nodeIndexes.some((node) => !Number.isInteger(node) || node < 1)) {
      throw new RangeError(`attributeBounds ${id} deve avere indici nodo ASP positivi`);
    }
    const members = [...new Set(bound.nodeIndexes)].sort((left, right) => left - right);
    for (const [name, value] of [["minPerCommunity", bound.minPerCommunity], ["maxPerCommunity", bound.maxPerCommunity]] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new RangeError(`${name} deve essere un intero non negativo`);
      }
    }
    const minimum = bound.minPerCommunity ?? 0;
    const maximum = bound.maxPerCommunity ?? 0;
    if (minimum === 0 && maximum === 0) throw new RangeError(`attributeBounds ${id} deve avere almeno un limite positivo`);
    if (maximum > 0 && minimum > maximum) throw new RangeError(`attributeBounds ${id}: il minimo non può superare il massimo`);
    if (minimum > 0) lines.push(`community_attribute_min(${id},${minimum}).`);
    if (maximum > 0) lines.push(`community_attribute_max(${id},${maximum}).`);
    for (const member of members) lines.push(`community_attribute_member(${id},${member}).`);
    if (members.length === 0) lines.push(`community_attribute_member(${id},0).`);
  }
  return lines;
}

function validateCommunityCount(name: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1)) {
    throw new RangeError(`${name} deve essere un intero positivo`);
  }
}

function communityPairFacts(
  predicate: "must_link" | "cannot_link",
  pairs: Array<[number, number]> = []
): string[] {
  const uniquePairs = new Set<string>();
  const lines: string[] = [];
  for (const [index, pair] of pairs.entries()) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((node) => !Number.isInteger(node) || node < 1)) {
      throw new RangeError(`${predicate} ${index + 1} deve contenere due indici ASP positivi`);
    }
    const [left, right] = pair;
    if (left === right) throw new RangeError(`${predicate} ${index + 1} deve riferirsi a due nodi distinti`);
    const [source, target] = left < right ? [left, right] : [right, left];
    const key = `${source}:${target}`;
    if (uniquePairs.has(key)) continue;
    uniquePairs.add(key);
    lines.push(`${predicate}(${source},${target}).`);
  }
  return lines;
}

/** Maximizes exact Newman-Girvan modularity over canonical node partitions. */
export function buildMaximumModularityProgram(options: ModularityCommunityOptions = {}): string {
  if (options.weighted !== undefined && typeof options.weighted !== "boolean") {
    throw new TypeError("weighted deve essere booleano");
  }
  if (options.separateDisconnectedComponents !== undefined && typeof options.separateDisconnectedComponents !== "boolean") {
    throw new TypeError("separateDisconnectedComponents deve essere booleano");
  }
  if (options.enforceConnectedPositiveVolumeCommunities !== undefined &&
    typeof options.enforceConnectedPositiveVolumeCommunities !== "boolean") {
    throw new TypeError("enforceConnectedPositiveVolumeCommunities deve essere booleano");
  }
  validateCommunityCount("minCount", options.minCount);
  validateCommunityCount("maxCount", options.maxCount);
  if (options.pairwiseObjectiveOffset !== undefined && !Number.isSafeInteger(options.pairwiseObjectiveOffset)) {
    throw new RangeError("pairwiseObjectiveOffset deve essere un intero sicuro");
  }
  if (options.minCount !== undefined && options.maxCount !== undefined && options.minCount > options.maxCount) {
    throw new RangeError("minCount non può essere maggiore di maxCount");
  }

  if (options.separateDisconnectedComponents && (
    options.minCount !== undefined ||
    options.maxCount !== undefined ||
    (options.mustLinkPairs?.length ?? 0) > 0 ||
    (options.cannotLinkPairs?.length ?? 0) > 0 ||
    (options.attributeBounds?.length ?? 0) > 0
  )) {
    throw new RangeError("La separazione delle componenti richiede modularita senza vincoli globali sulle comunita");
  }

  const hasCommunityConstraints =
    (options.minCount ?? 0) > 0 ||
    (options.maxCount ?? 0) > 0 ||
    (options.mustLinkPairs?.length ?? 0) > 0 ||
    (options.cannotLinkPairs?.length ?? 0) > 0 ||
    (options.attributeBounds?.length ?? 0) > 0;
  if (options.enforceConnectedPositiveVolumeCommunities && hasCommunityConstraints) {
    throw new RangeError("La connettivita delle comunita richiede modularita senza vincoli globali");
  }

  const lines = [
    ...(options.minCount !== undefined ? [`minimum_community_count(${options.minCount}).`] : []),
    ...(options.maxCount !== undefined ? [`maximum_community_count(${options.maxCount}).`] : []),
    ...communityPairFacts("must_link", options.mustLinkPairs),
    ...communityPairFacts("cannot_link", options.cannotLinkPairs),
    ...communityAttributeBoundFacts(options.attributeBounds),
    ...(options.separateDisconnectedComponents
      ? [":- community(U,C), community(V,C), U < V, modularity_component(U,A), modularity_component(V,B), A != B, modularity_degree(U,DU), DU > 0, modularity_degree(V,DV), DV > 0."]
      : []),
    "1 { community(V,C) : modularity_candidate(C), C <= V } 1 :- modularity_candidate(V).",
    "community_used(C) :- community(_,C).",
    ":- community_used(C), not community(C,C).",
    ...(options.enforceConnectedPositiveVolumeCommunities
      ? [
          options.weighted
            ? "community_positive_link(U,V) :- modularity_edge(E,U,V), U != V, modularity_edge_weight(E,W), W > 0."
            : "community_positive_link(U,V) :- modularity_edge(E,U,V), U != V.",
          "community_positive_link(V,U) :- community_positive_link(U,V).",
          "community_has_smaller_positive_member(C,R) :- community(R,C), community(U,C), modularity_degree(U,D), D > 0, U < R.",
          "community_positive_root(C,R) :- community(R,C), modularity_degree(R,D), D > 0, not community_has_smaller_positive_member(C,R).",
          "community_reachable(C,R) :- community_positive_root(C,R).",
          "community_reachable(C,V) :- community_reachable(C,U), community_positive_link(U,V), community(V,C).",
          ":- community(V,C), modularity_degree(V,D), D > 0, community_positive_root(C,R), not community_reachable(C,V)."
        ]
      : []),
    ":- must_link(A,B), community(A,C), not community(B,C).",
    ":- cannot_link(A,B), community(A,C), community(B,C).",
    ":- community_used(C), community_attribute_min(B,Min), #count { V : community(V,C), community_attribute_member(B,V) } < Min.",
    ":- community_used(C), community_attribute_max(B,Max), #count { V : community(V,C), community_attribute_member(B,V) } > Max.",
    ":- minimum_community_count(M), #count { C : community_used(C) } < M.",
    ":- maximum_community_count(M), #count { C : community_used(C) } > M.",
    ...(options.pairwiseObjectiveOffset === undefined || options.includeContributions === true
      ? [
          "internal_edge(C,E) :- community(U,C), community(V,C), modularity_edge(E,U,V).",
          "community_edge_count(C,L) :- community_used(C), L = #count { E : internal_edge(C,E) }.",
          ...(options.weighted
            ? ["community_internal_weight(C,W) :- community_used(C), W = #sum { Weight,E : internal_edge(C,E), modularity_edge_weight(E,Weight) }."]
            : []),
          "community_volume(C,D) :- community_used(C), D = #sum { Degree,V : community(V,C), modularity_degree(V,Degree) }.",
          `community_score(C,Score) :- community_used(C), ${options.weighted ? "community_internal_weight" : "community_edge_count"}(C,L), community_volume(C,D), modularity_m(M), modularity_resolution(P,Q), Score = 4*M*Q*L - P*D*D.`
        ]
      : []),
    ...(options.pairwiseObjectiveOffset === undefined
      ? ["#maximize { Score@1,C : community_score(C,Score) }."]
      : [
          "#maximize { PairScore@1,U,V : community(U,C), community(V,C), U < V, modularity_pair_score(U,V,PairScore) }.",
          "#maximize { Offset@1,objective_offset : modularity_pairwise_offset(Offset) }."
        ]),
    "#show community/2.",
    ...(options.includeContributions
      ? [
        "#show internal_edge/2.",
        "#show community_edge_count/2.",
        ...(options.weighted ? ["#show community_internal_weight/2."] : []),
        "#show community_volume/2.",
        "#show community_score/2."
      ]
      : [])
  ];
  return lines.filter(Boolean).join("\n\n");
}

/**
 * Builds exact optimum probes for whether a node pair can be together or
 * separate in a globally optimal community partition. The disconnected-
 * component rule is an exact pruning for the unconstrained base query, but the
 * pair probes add community constraints; omit only that redundant pruning so
 * both queries retain exactly the same feasible optima as the base problem.
 */
export function buildCommunityPairMembershipPrograms(
  options: ModularityCommunityOptions,
  pair: [number, number]
): { together: string; separate: string } {
  if (!Array.isArray(pair) || pair.length !== 2 || pair.some((node) => !Number.isSafeInteger(node) || node < 1)) {
    throw new RangeError("La coppia deve contenere due indici ASP positivi e sicuri");
  }
  const [first, second] = pair;
  if (first === second) throw new RangeError("La coppia deve riferirsi a due nodi distinti");
  if (options.enforceConnectedPositiveVolumeCommunities) {
    throw new RangeError("Le query di co-appartenenza non supportano il vincolo di connettivitÃ  positiva configurato");
  }

  const normalizedPair: [number, number] = first < second ? [first, second] : [second, first];
  const {
    separateDisconnectedComponents: _separateDisconnectedComponents,
    ...semanticOptions
  } = options;
  return {
    together: buildMaximumModularityProgram({
      ...semanticOptions,
      includeContributions: false,
      mustLinkPairs: [...(semanticOptions.mustLinkPairs ?? []), normalizedPair]
    }),
    separate: buildMaximumModularityProgram({
      ...semanticOptions,
      includeContributions: false,
      cannotLinkPairs: [...(semanticOptions.cannotLinkPairs ?? []), normalizedPair]
    })
  };
}

/**
 * Experimental decision encoding for unconstrained modularity. It asks whether
 * any canonical partition reaches an exact scaled-score threshold; callers can
 * search thresholds and only claim optimality after the feasible/infeasible
 * interval closes. This is not the production optimization encoding.
 */
export function buildExperimentalModularityThresholdProgram(
  minimumScaledScore: number,
  options: { weighted?: boolean } = {}
): string {
  if (!Number.isSafeInteger(minimumScaledScore)) {
    throw new RangeError("minimumScaledScore deve essere un intero sicuro");
  }
  if (options.weighted !== undefined && typeof options.weighted !== "boolean") {
    throw new TypeError("weighted deve essere booleano");
  }
  const contributionPredicate = options.weighted ? "community_internal_weight" : "community_edge_count";
  return [
    `modularity_score_threshold(${minimumScaledScore}).`,
    "1 { community(V,C) : modularity_candidate(C), C <= V } 1 :- modularity_candidate(V).",
    "community_used(C) :- community(_,C).",
    ":- community_used(C), not community(C,C).",
    "internal_edge(C,E) :- community(U,C), community(V,C), modularity_edge(E,U,V).",
    ...(options.weighted
      ? ["community_internal_weight(C,W) :- community_used(C), W = #sum { Weight,E : internal_edge(C,E), modularity_edge_weight(E,Weight) }."]
      : ["community_edge_count(C,L) :- community_used(C), L = #count { E : internal_edge(C,E) }."]),
    "community_volume(C,D) :- community_used(C), D = #sum { Degree,V : community(V,C), modularity_degree(V,Degree) }.",
    `community_score(C,Score) :- community_used(C), ${contributionPredicate}(C,L), community_volume(C,D), modularity_m(M), modularity_resolution(P,Q), Score = 4*M*Q*L - P*D*D.`,
    "partition_score(Score) :- Score = #sum { CommunityScore,C : community_score(C,CommunityScore) }.",
    ":- modularity_score_threshold(Minimum), partition_score(Score), Score < Minimum.",
    "#show community/2.",
    "#show partition_score/1."
  ].join("\n\n");
}

/**
 * Experimental exact objective that decomposes each community score into
 * member-level increments in increasing node-index order. The degree-volume
 * square is accumulated by its exact discrete difference. This changes the
 * objective grounding, not its mathematical value, and may require more
 * aggregate instances than the community-level objective.
 */
export function buildExperimentalIncrementalModularityProgram(
  options: Omit<ModularityCommunityOptions, "pairwiseObjectiveOffset" | "separateDisconnectedComponents"> = {}
): string {
  if (options.weighted !== undefined && typeof options.weighted !== "boolean") {
    throw new TypeError("weighted deve essere booleano");
  }
  validateCommunityCount("minCount", options.minCount);
  validateCommunityCount("maxCount", options.maxCount);
  if (options.minCount !== undefined && options.maxCount !== undefined && options.minCount > options.maxCount) {
    throw new RangeError("minCount non puÃ² essere maggiore di maxCount");
  }
  const lines = [
    ...(options.minCount !== undefined ? [`minimum_community_count(${options.minCount}).`] : []),
    ...(options.maxCount !== undefined ? [`maximum_community_count(${options.maxCount}).`] : []),
    ...communityPairFacts("must_link", options.mustLinkPairs),
    ...communityPairFacts("cannot_link", options.cannotLinkPairs),
    ...communityAttributeBoundFacts(options.attributeBounds),
    "1 { community(V,C) : modularity_candidate(C), C <= V } 1 :- modularity_candidate(V).",
    "community_used(C) :- community(_,C).",
    ":- community_used(C), not community(C,C).",
    ":- must_link(A,B), community(A,C), not community(B,C).",
    ":- cannot_link(A,B), community(A,C), community(B,C).",
    ":- community_used(C), community_attribute_min(B,Min), #count { V : community(V,C), community_attribute_member(B,V) } < Min.",
    ":- community_used(C), community_attribute_max(B,Max), #count { V : community(V,C), community_attribute_member(B,V) } > Max.",
    ":- minimum_community_count(M), #count { C : community_used(C) } < M.",
    ":- maximum_community_count(M), #count { C : community_used(C) } > M.",
    "modularity_prior_edge(E,V,U) :- modularity_edge(E,V,U), U < V.",
    "modularity_prior_edge(E,V,U) :- modularity_edge(E,U,V), U < V.",
    "community_increment_edge(C,V,E) :- community(V,C), modularity_prior_edge(E,V,U), community(U,C).",
    "community_increment_edge(C,V,E) :- community(V,C), modularity_edge(E,V,V).",
    "community_prefix_volume(V,C,D) :- community(V,C), D = #sum { Degree,U : community(U,C), U < V, modularity_degree(U,Degree) }.",
    options.weighted
      ? "community_increment_internal(C,V,L) :- community(V,C), L = #sum { Weight,E : community_increment_edge(C,V,E), modularity_edge_weight(E,Weight) }."
      : "community_increment_internal(C,V,L) :- community(V,C), L = #count { E : community_increment_edge(C,V,E) }.",
    `community_increment(C,V,Score) :- community(V,C), community_prefix_volume(V,C,D), community_increment_internal(C,V,L), modularity_degree(V,Degree), modularity_m(M), modularity_resolution(P,Q), Score = 4*M*Q*L - P*(2*D*Degree + Degree*Degree).`,
    "#maximize { Score@1,C,V : community_increment(C,V,Score) }.",
    "#show community/2.",
    ...(options.includeContributions
      ? [
        "#show community_increment/3.",
        "#show community_prefix_volume/3.",
        "#show community_increment_internal/3."
      ]
      : [])
  ];
  return lines.join("\n\n");
}

/**
 * Experimental exact partition encoding without community labels. It chooses
 * pairwise co-membership, enforces an equivalence relation, then derives one
 * canonical representative per class for the shared result parser.
 */
export function buildExperimentalModularityEquivalenceProgram(
  options: Omit<ModularityCommunityOptions, "separateDisconnectedComponents"> = {}
): string {
  if (options.weighted !== undefined && typeof options.weighted !== "boolean") {
    throw new TypeError("weighted deve essere booleano");
  }
  validateCommunityCount("minCount", options.minCount);
  validateCommunityCount("maxCount", options.maxCount);
  if (options.pairwiseObjectiveOffset === undefined || !Number.isSafeInteger(options.pairwiseObjectiveOffset)) {
    throw new RangeError("pairwiseObjectiveOffset deve essere un intero sicuro per l'encoding di equivalenza");
  }
  if (options.minCount !== undefined && options.maxCount !== undefined && options.minCount > options.maxCount) {
    throw new RangeError("minCount non può essere maggiore di maxCount");
  }

  const lines = [
    ...(options.minCount !== undefined ? [`minimum_community_count(${options.minCount}).`] : []),
    ...(options.maxCount !== undefined ? [`maximum_community_count(${options.maxCount}).`] : []),
    ...communityPairFacts("must_link", options.mustLinkPairs),
    ...communityPairFacts("cannot_link", options.cannotLinkPairs),
    ...communityAttributeBoundFacts(options.attributeBounds),
    "same_community(V,V) :- modularity_candidate(V).",
    "{ same_community(U,V) } :- modularity_candidate(U), modularity_candidate(V), U < V.",
    "same_community(V,U) :- same_community(U,V).",
    ":- same_community(U,V), same_community(V,W), not same_community(U,W).",
    "smaller_same_community(V,C) :- modularity_candidate(C), modularity_candidate(D), D < C, same_community(V,D).",
    "community(V,C) :- modularity_candidate(V), modularity_candidate(C), C <= V, same_community(V,C), not smaller_same_community(V,C).",
    "community_used(C) :- community(_,C).",
    ":- community_used(C), not community(C,C).",
    ":- must_link(A,B), community(A,C), not community(B,C).",
    ":- cannot_link(A,B), community(A,C), community(B,C).",
    ":- community_used(C), community_attribute_min(B,Min), #count { V : community(V,C), community_attribute_member(B,V) } < Min.",
    ":- community_used(C), community_attribute_max(B,Max), #count { V : community(V,C), community_attribute_member(B,V) } > Max.",
    ":- minimum_community_count(M), #count { C : community_used(C) } < M.",
    ":- maximum_community_count(M), #count { C : community_used(C) } > M.",
    "#maximize { PairScore@1,U,V : same_community(U,V), U < V, modularity_pair_score(U,V,PairScore) }.",
    "#maximize { Offset@1,objective_offset : modularity_pairwise_offset(Offset) }.",
    "#show community/2."
  ];
  return lines.join("\n\n");
}

/** Finds one shortest simple path with an explicit maximum number of edges. */
export function buildMinimumHopPathProgram(
  startNode: number,
  goalNode: number,
  maximumLength: number,
  group = "",
  direction: "undirected" | "directed" = "undirected",
  explainMinimality = false
): string {
  validateIntegerParameter("startNode", startNode, 1);
  validateIntegerParameter("goalNode", goalNode, 1);
  validateIntegerParameter("maximumLength", maximumLength, 0);
  if (maximumLength > 100) throw new RangeError("maximumLength non può superare 100" );

  const domain = candidateDomain(group);
  const minimalityCertificate = explainMinimality && maximumLength > 0
    ? [
      `path_certificate_depth(0..${maximumLength - 1}).`,
      "path_certificate_arc(U,V) :- path_edge_record(E), path_edge_source(E,U), path_edge_target(E,V).",
      ...(direction === "undirected"
        ? ["path_certificate_arc(U,V) :- path_edge_record(E), path_edge_source(E,V), path_edge_target(E,U)."]
        : []),
      "path_minimality_certificate(L) :- path_length(L).",
      "path_shorter_reachable(S,0) :- start_node(S), path_length(L), L > 0.",
      "path_shorter_reachable(V,D+1) :- path_certificate_depth(D), path_length(L), D+1 < L, path_shorter_reachable(U,D), path_certificate_arc(U,V), candidate_node(V).",
      "path_shorter_reachable(V,D+1) :- path_certificate_depth(D), path_length(L), D+1 < L, path_shorter_reachable(V,D).",
      ":- path_shorter_reachable(G,D), goal_node(G), path_length(L), D < L.",
      "#show path_minimality_certificate/1.",
      "#show path_shorter_reachable/2."
    ]
    : explainMinimality
      ? ["path_minimality_certificate(L) :- path_length(L).", "#show path_minimality_certificate/1."]
      : [];
  const rules = [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    `start_node(${startNode}).`,
    `goal_node(${goalNode}).`,
    `path_depth(0..${maximumLength}).`,
    ":- start_node(S), not candidate_node(S).",
    ":- goal_node(G), not candidate_node(G).",
    "path_arc(U,V) :- path_edge_record(E), path_edge_source(E,U), path_edge_target(E,V).",
    ...(direction === "undirected"
      ? ["path_arc(U,V) :- path_edge_record(E), path_edge_source(E,V), path_edge_target(E,U)."]
      : []),
    "path_reachable(S,0) :- start_node(S).",
    `path_reachable(V,D+1) :- path_depth(D), D < ${maximumLength}, path_reachable(U,D), path_arc(U,V), candidate_node(V).`,
    `path_reachable(V,D+1) :- path_depth(D), D < ${maximumLength}, path_reachable(V,D).`,
    "path_shortest_distance(S,0) :- start_node(S).",
    `path_shortest_distance(V,D+1) :- path_depth(D), D < ${maximumLength}, path_reachable(V,D+1), not path_reachable(V,D).`,
    "path_length(L) :- goal_node(G), path_shortest_distance(G,L).",
    "shortest_path_arc(U,V) :- path_shortest_distance(U,D), path_shortest_distance(V,D+1), path_arc(U,V).",
    "at(0,S) :- start_node(S).",
    ...Array.from({ length: maximumLength }, (_, offset) => {
      const step = offset + 1;
      return `1 { at(${step},V) : shortest_path_arc(U,V), at(${step - 1},U) } 1 :- path_length(L), L >= ${step}.`;
    }),
    ":- goal_node(G), not path_shortest_distance(G,_).",
    ":- path_length(L), goal_node(G), not at(L,G).",
    "path_edge_support(P,E) :- path_length(L), L > P, at(P,U), at(P+1,V), path_edge_record(E), path_edge_source(E,U), path_edge_target(E,V).",
    ...(direction === "undirected"
      ? ["path_edge_support(P,E) :- path_length(L), L > P, at(P,U), at(P+1,V), path_edge_record(E), path_edge_source(E,V), path_edge_target(E,U)."]
      : []),
    "#show path_length/1.",
    "#show at/2.",
    "#show path_edge_support/2.",
    ...minimalityCertificate
  ];
  return rules.filter(Boolean).join("\n\n");
}

/** Builds a bounded reachability certificate explaining why no path fits the requested limit. */
export function buildBoundedPathNoRouteProgram(
  startNode: number,
  goalNode: number,
  maximumLength: number,
  group = "",
  direction: "undirected" | "directed" = "undirected"
): string {
  validateIntegerParameter("startNode", startNode, 1);
  validateIntegerParameter("goalNode", goalNode, 1);
  validateIntegerParameter("maximumLength", maximumLength, 0);
  if (maximumLength > 100) throw new RangeError("maximumLength non può superare 100");
  if (direction !== "undirected" && direction !== "directed") {
    throw new TypeError("direction deve essere undirected oppure directed");
  }

  const domain = candidateDomain(group);
  const rules = [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    `path_no_route_start(${startNode}).`,
    `path_no_route_goal(${goalNode}).`,
    `path_no_route_bound(${maximumLength}).`,
    `path_no_route_depth(0..${maximumLength}).`,
    "path_no_route_arc(U,V) :- path_edge_record(E), path_edge_source(E,U), path_edge_target(E,V).",
    ...(direction === "undirected"
      ? ["path_no_route_arc(U,V) :- path_edge_record(E), path_edge_source(E,V), path_edge_target(E,U)."]
      : []),
    ":- path_no_route_start(S), not candidate_node(S).",
    ":- path_no_route_goal(G), not candidate_node(G).",
    "path_no_route_reachable(S,0) :- path_no_route_start(S).",
    "path_no_route_reachable(V,D+1) :- path_no_route_depth(D), path_no_route_bound(L), D < L, path_no_route_reachable(U,D), path_no_route_arc(U,V), candidate_node(V).",
    "path_no_route_reachable(V,D+1) :- path_no_route_depth(D), path_no_route_bound(L), D < L, path_no_route_reachable(V,D).",
    ":- path_no_route_reachable(G,_), path_no_route_goal(G).",
    `path_no_route_certificate(${maximumLength}).`,
    "#show path_no_route_certificate/1.",
    "#show path_no_route_reachable/2."
  ];
  return rules.filter(Boolean).join("\n\n");
}

export type TypedPathTemporalSemantics = "coValid" | "orderedByStart";

export interface TypedPathOptions {
  startNode: number;
  goalNode: number;
  edgeTypeSequence: string[];
  direction: "undirected" | "directed";
  group?: string;
  temporalSemantics?: "static" | TypedPathTemporalSemantics;
  strictTemporalOrder?: boolean;
}

function assertStaticTypedPathOptions(options: TypedPathOptions): void {
  if ((options.temporalSemantics !== undefined && options.temporalSemantics !== "static") ||
    options.strictTemporalOrder === true) {
    throw new TypeError("Questo builder supporta soltanto cammini tipizzati statici");
  }
}

/** Merges observed and explicitly declared candidate types for typed-path queries. */
export function mergeTypedPathEdgeTypes(observedTypes: readonly unknown[], candidateTypes: readonly unknown[] = []): string[] {
  return [...new Set([...observedTypes, ...candidateTypes]
    .flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []))].sort();
}

/** Finds one simple path whose edge types match an exact ordered sequence. */
export function buildTypedPathProgram(options: TypedPathOptions): string {
  validateIntegerParameter("startNode", options.startNode, 1);
  validateIntegerParameter("goalNode", options.goalNode, 1);
  if (options.startNode === options.goalNode) {
    throw new RangeError("I nodi iniziale e finale devono essere distinti");
  }
  if (!Array.isArray(options.edgeTypeSequence) || options.edgeTypeSequence.length === 0 ||
    options.edgeTypeSequence.some((type) => typeof type !== "string" || type.trim() === "")) {
    throw new RangeError("edgeTypeSequence deve contenere almeno un tipo di arco non vuoto per ogni passo");
  }
  if (options.edgeTypeSequence.length > 100) {
    throw new RangeError("edgeTypeSequence non puo superare 100 passi");
  }
  if (options.direction !== "undirected" && options.direction !== "directed") {
    throw new RangeError("direction deve essere undirected oppure directed");
  }
  const temporalSemantics = options.temporalSemantics ?? "static";
  if (temporalSemantics !== "static" && temporalSemantics !== "coValid" && temporalSemantics !== "orderedByStart") {
    throw new RangeError("temporalSemantics deve essere static, coValid oppure orderedByStart");
  }
  if (options.strictTemporalOrder !== undefined && typeof options.strictTemporalOrder !== "boolean") {
    throw new TypeError("strictTemporalOrder deve essere booleano");
  }
  if (options.strictTemporalOrder === true && temporalSemantics !== "orderedByStart") {
    throw new RangeError("strictTemporalOrder si applica soltanto alla semantica orderedByStart");
  }

  const domain = candidateDomain(options.group ?? "");
  const lines = [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    `typed_path_start(${options.startNode}).`,
    `typed_path_goal(${options.goalNode}).`,
    `typed_path_position(0..${options.edgeTypeSequence.length}).`,
    ...options.edgeTypeSequence.map((type, index) => `typed_path_required_type(${index + 1},${escapeAspString(type.trim())}).`),
    ...options.edgeTypeSequence.map((_, index) => `typed_path_transition(${index + 1},${index},${index + 1}).`),
    "1 { typed_path_node(P,V) : candidate_node(V) } 1 :- typed_path_position(P).",
    ":- typed_path_node(0,V), typed_path_start(S), V != S.",
    `:- typed_path_node(${options.edgeTypeSequence.length},V), typed_path_goal(G), V != G.`,
    ":- typed_path_node(P,V), typed_path_node(Q,V), P < Q.",
    "typed_path_edge(Step,E) :- typed_path_transition(Step,From,To), typed_path_node(From,U), typed_path_node(To,V), edge_record(E), edge_type(E,T), typed_path_required_type(Step,T), edge_source(E,U), edge_target(E,V).",
    ...(options.direction === "undirected"
      ? ["typed_path_edge(Step,E) :- typed_path_transition(Step,From,To), typed_path_node(From,U), typed_path_node(To,V), edge_record(E), edge_type(E,T), typed_path_required_type(Step,T), edge_source(E,V), edge_target(E,U)."]
      : []),
    ":- typed_path_transition(Step,_,_), not typed_path_edge(Step,_).",
    "#show typed_path_node/2.",
    "#show typed_path_edge/2.",
    ...(temporalSemantics === "coValid" ? [
      "typed_path_candidate_time(T) :- typed_path_edge(_,E), edge_valid_from(E,T).",
      "typed_path_candidate_time(T) :- typed_path_edge(_,E), edge_valid_to(E,T).",
      "typed_path_active(Step,T) :- typed_path_edge(Step,E), edge_valid_from(E,From), edge_valid_to(E,To), typed_path_candidate_time(T), From <= T, T <= To.",
      "typed_path_missing_step(T) :- typed_path_transition(Step,_,_), typed_path_candidate_time(T), not typed_path_active(Step,T).",
      "typed_path_common_time(T) :- typed_path_candidate_time(T), not typed_path_missing_step(T).",
      "1 { typed_path_time(T) : typed_path_common_time(T) } 1.",
      ":- typed_path_time(T), typed_path_common_time(S), S < T.",
      "typed_path_edge_support(Step,E) :- typed_path_time(T), typed_path_active(Step,T), typed_path_edge(Step,E), edge_valid_from(E,From), edge_valid_to(E,To), From <= T, T <= To.",
      "#show typed_path_time/1.",
      "#show typed_path_edge_support/2."
    ] : temporalSemantics === "orderedByStart" ? [
      "typed_path_ordered_candidate(Step,E,From) :- typed_path_edge(Step,E), edge_valid_from(E,From), edge_valid_to(E,To), From <= To.",
      "1 { typed_path_ordered_support(Step,E,From) : typed_path_ordered_candidate(Step,E,From) } 1 :- typed_path_transition(Step,_,_).",
      ...options.edgeTypeSequence.slice(0, -1).map((_, index) =>
        `:- typed_path_ordered_support(${index + 1},_,T1), typed_path_ordered_support(${index + 2},_,T2), T1 ${options.strictTemporalOrder === true ? ">=" : ">"} T2.`
      ),
      "typed_path_edge_support(Step,E) :- typed_path_ordered_support(Step,E,_).",
      "#show typed_path_ordered_support/3.",
      "#show typed_path_edge_support/2."
    ] : [])
  ];
  return lines.filter(Boolean).join("\n\n");
}

/** Explains an absent simple typed path using exact-sequence walk reachability by prefix. */
export function buildTypedPathNoRouteProgram(options: TypedPathOptions): string {
  assertStaticTypedPathOptions(options);
  validateIntegerParameter("startNode", options.startNode, 1);
  validateIntegerParameter("goalNode", options.goalNode, 1);
  if (options.startNode === options.goalNode) {
    throw new RangeError("I nodi iniziale e finale devono essere distinti");
  }
  if (!Array.isArray(options.edgeTypeSequence) || options.edgeTypeSequence.length === 0 ||
    options.edgeTypeSequence.some((type) => typeof type !== "string" || type.trim() === "")) {
    throw new RangeError("edgeTypeSequence deve contenere almeno un tipo di arco non vuoto per ogni passo");
  }
  if (options.edgeTypeSequence.length > 100) {
    throw new RangeError("edgeTypeSequence non puo superare 100 passi");
  }
  if (options.direction !== "undirected" && options.direction !== "directed") {
    throw new RangeError("direction deve essere undirected oppure directed");
  }

  const finalStep = options.edgeTypeSequence.length;
  const domain = candidateDomain(options.group ?? "");
  const lines = [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    `typed_path_start(${options.startNode}).`,
    `typed_path_goal(${options.goalNode}).`,
    `typed_path_no_route_step(0..${finalStep}).`,
    ...options.edgeTypeSequence.map((type, index) => `typed_path_required_type(${index + 1},${escapeAspString(type.trim())}).`),
    ...options.edgeTypeSequence.map((_, index) => `typed_path_transition(${index + 1},${index},${index + 1}).`),
    "typed_path_no_route_node(0,S) :- typed_path_start(S), candidate_node(S).",
    "typed_path_no_route_transition(Step,U,V) :- typed_path_transition(Step,Previous,_), typed_path_no_route_node(Previous,U), typed_path_required_type(Step,T), edge_record(E), edge_type(E,T), edge_source(E,U), edge_target(E,V), candidate_node(V).",
    ...(options.direction === "undirected"
      ? ["typed_path_no_route_transition(Step,U,V) :- typed_path_transition(Step,Previous,_), typed_path_no_route_node(Previous,U), typed_path_required_type(Step,T), edge_record(E), edge_type(E,T), edge_source(E,V), edge_target(E,U), candidate_node(V)."]
      : []),
    "typed_path_no_route_node(Step,V) :- typed_path_no_route_transition(Step,_,V).",
    `typed_path_no_route_goal_reachable :- typed_path_goal(G), typed_path_no_route_node(${finalStep},G).`,
    "#show typed_path_no_route_step/1.",
    "#show typed_path_no_route_node/2.",
    "#show typed_path_no_route_goal_reachable/0."
  ];
  return lines.filter(Boolean).join("\n\n");
}

/** Finds a maximum-length temporal typed walk after the simple-path query is infeasible. */
export function buildTypedPathTemporalNoRouteProgram(
  options: TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics }
): string {
  if (options.temporalSemantics !== "coValid" && options.temporalSemantics !== "orderedByStart") {
    throw new TypeError("Il why-not temporale richiede la semantica coValid oppure orderedByStart");
  }
  buildTypedPathProgram(options);
  const finalStep = options.edgeTypeSequence.length;
  const domain = candidateDomain(options.group ?? "");
  const rules = [
    domain.declaration.trimEnd(),
    `candidate_node(V) :- ${domain.predicate}(V).`,
    `temporal_typed_path_start(${options.startNode}).`,
    `temporal_typed_path_goal(${options.goalNode}).`,
    `temporal_typed_path_final_step(${finalStep}).`,
    `temporal_typed_path_position(0..${finalStep}).`,
    ...options.edgeTypeSequence.map((type, index) => `temporal_typed_path_required_type(${index + 1},${escapeAspString(type.trim())}).`),
    ...options.edgeTypeSequence.map((_, index) => `temporal_typed_path_transition(${index + 1},${index},${index + 1}).`),
    "1 { temporal_typed_path_depth(D) : temporal_typed_path_position(D) } 1.",
    "temporal_typed_path_node(0,S) :- temporal_typed_path_start(S).",
    "1 { temporal_typed_path_node(P,V) : candidate_node(V) } 1 :- temporal_typed_path_depth(D), temporal_typed_path_position(P), P > 0, P <= D.",
    "temporal_typed_path_valid_edge(E) :- edge_record(E), edge_valid_from(E,From), edge_valid_to(E,To), From <= To.",
    "temporal_typed_path_edge_candidate(Step,E) :- temporal_typed_path_transition(Step,Previous,Next), temporal_typed_path_depth(D), Step <= D, temporal_typed_path_node(Previous,U), temporal_typed_path_node(Next,V), candidate_node(U), candidate_node(V), temporal_typed_path_required_type(Step,T), edge_type(E,T), edge_source(E,U), edge_target(E,V), temporal_typed_path_valid_edge(E).",
    ...(options.direction === "undirected"
      ? ["temporal_typed_path_edge_candidate(Step,E) :- temporal_typed_path_transition(Step,Previous,Next), temporal_typed_path_depth(D), Step <= D, temporal_typed_path_node(Previous,U), temporal_typed_path_node(Next,V), candidate_node(U), candidate_node(V), temporal_typed_path_required_type(Step,T), edge_type(E,T), edge_source(E,V), edge_target(E,U), temporal_typed_path_valid_edge(E)."]
      : []),
    "1 { temporal_typed_path_edge(Step,E) : temporal_typed_path_edge_candidate(Step,E) } 1 :- temporal_typed_path_transition(Step,_,_), temporal_typed_path_depth(D), Step <= D.",
    "temporal_typed_path_goal_reachable :- temporal_typed_path_depth(D), temporal_typed_path_final_step(D), temporal_typed_path_node(D,G), temporal_typed_path_goal(G).",
    "#maximize { D@3 : temporal_typed_path_depth(D) }.",
    "#maximize { 1@2 : temporal_typed_path_goal_reachable }.",
    ...(options.temporalSemantics === "coValid" ? [
      "temporal_typed_path_common_start(T) :- temporal_typed_path_depth(D), D > 0, T = #max { Start : temporal_typed_path_edge(Step,E), Step <= D, edge_valid_from(E,Start) }.",
      "temporal_typed_path_common_end(T) :- temporal_typed_path_depth(D), D > 0, T = #min { End : temporal_typed_path_edge(Step,E), Step <= D, edge_valid_to(E,End) }.",
      ":- temporal_typed_path_common_start(From), temporal_typed_path_common_end(To), From > To.",
      "#minimize { T@1,T : temporal_typed_path_common_start(T); 0@1,no_common_time : temporal_typed_path_position(0) }.",
      "#show temporal_typed_path_common_start/1."
    ] : [
      ...options.edgeTypeSequence.slice(0, -1).map((_, index) =>
        `:- temporal_typed_path_edge(${index + 1},E1), temporal_typed_path_edge(${index + 2},E2), edge_valid_from(E1,T1), edge_valid_from(E2,T2), T1 ${options.strictTemporalOrder === true ? ">=" : ">"} T2.`
      ),
      "temporal_typed_path_ordered_start(Step,E,Start) :- temporal_typed_path_edge(Step,E), edge_valid_from(E,Start), edge_valid_to(E,End), Start <= End.",
      "#show temporal_typed_path_ordered_start/3."
    ]),
    "#show temporal_typed_path_depth/1.",
    "#show temporal_typed_path_node/2.",
    "#show temporal_typed_path_edge/2.",
    "#show temporal_typed_path_goal_reachable/0."
  ];
  return rules.filter(Boolean).join("\n\n");
}

export interface TypedPathCounterfactualEdgeRecord {
  recordIndex: number;
  sourceNode: number;
  targetNode: number;
  edgeType: string;
}

export interface TypedPathCounterfactualProposal {
  totalCost: number;
  path: TypedPathResult | TypedPathTemporalResult;
  addedEdges: Array<Pick<KPlexCompletionCandidate,
    "id" | "sourceNodeId" | "targetNodeId" | "edgeType" | "cost">>;
}

export interface TypedPathCompletionCandidate extends KPlexCompletionCandidate {
  /** Encoded interval endpoints, present only for a temporal path query. */
  validityFrom?: number;
  validityTo?: number;
}

/** Finds a minimum-cost subset of declared edges that enables a fixed typed path. */
export function buildTypedPathCompletionCounterfactualProgram(
  options: TypedPathOptions,
  candidatesInput: unknown,
  temporalEncoding?: AspTemporalEncoding
): { candidates: TypedPathCompletionCandidate[]; program: string } {
  const temporalSemantics = options.temporalSemantics ?? "static";
  if (temporalSemantics === "static") assertStaticTypedPathOptions(options);
  const pathProgram = buildTypedPathProgram(options);
  if (!Array.isArray(candidatesInput)) {
    throw new TypeError("graphAnalysis.counterfactuals.edgeAdditions deve essere un array");
  }
  if (temporalSemantics === "static" && candidatesInput.some((candidate) => candidate !== null && typeof candidate === "object" &&
    !Array.isArray(candidate) && (candidate as Record<string, unknown>).validity !== undefined)) {
    throw new TypeError("Il controfattuale di cammino tipizzato non usa intervalli temporali; rimuovi validity dai candidati");
  }
  const validatedCandidates = validateKPlexCompletionCandidates(candidatesInput);
  const candidates: TypedPathCompletionCandidate[] = validatedCandidates.map((candidate, index) => {
    if (temporalSemantics === "static") return candidate;
    const raw = candidatesInput[index] as Record<string, unknown>;
    const validity = raw.validity;
    if (validity === null || typeof validity !== "object" || Array.isArray(validity)) {
      throw new TypeError(`edgeAdditions[${index}].validity deve dichiarare from e to per un cammino temporale`);
    }
    const interval = validity as Record<string, unknown>;
    const from = parseGraphTemporalValue(interval.from);
    const to = parseGraphTemporalValue(interval.to);
    if (!from || !to || from.domain !== to.domain || from.value > to.value) {
      throw new TypeError(`edgeAdditions[${index}].validity deve contenere estremi validi, ordinati e dello stesso dominio temporale`);
    }
    if (!temporalEncoding) {
      throw new TypeError("La codifica temporale del grafo è obbligatoria per i candidati del cammino temporale");
    }
    if (temporalEncoding.domain !== from.domain) {
      throw new TypeError(`edgeAdditions[${index}].validity deve usare lo stesso dominio temporale degli archi osservati`);
    }
    const validityFrom = temporalEncoding.encode(interval.from);
    const validityTo = temporalEncoding.encode(interval.to);
    if (validityFrom === null || validityTo === null || validityFrom > validityTo) {
      throw new RangeError(`edgeAdditions[${index}].validity non è inclusa nella codifica temporale ASP del grafo`);
    }
    return { ...candidate, validityFrom, validityTo };
  });
  const candidateFacts = candidates.map((candidate) => temporalSemantics === "static"
    ? `cf_typed_path_candidate(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode},${escapeAspString(candidate.edgeType)},${candidate.cost}).`
    : `cf_typed_path_candidate(${candidate.recordIndex},${candidate.sourceNode},${candidate.targetNode},${escapeAspString(candidate.edgeType)},${candidate.cost},${candidate.validityFrom},${candidate.validityTo}).`
  );
  const candidateRules = [
    temporalSemantics === "static"
      ? "{ cf_typed_path_add_edge(E) } :- cf_typed_path_candidate(E,_,_,_,_)."
      : "{ cf_typed_path_add_edge(E) } :- cf_typed_path_candidate(E,_,_,_,_,_,_).",
    "edge_record(E) :- cf_typed_path_add_edge(E).",
    temporalSemantics === "static"
      ? "edge_source(E,U) :- cf_typed_path_add_edge(E), cf_typed_path_candidate(E,U,_,_,_)."
      : "edge_source(E,U) :- cf_typed_path_add_edge(E), cf_typed_path_candidate(E,U,_,_,_,_,_).",
    temporalSemantics === "static"
      ? "edge_target(E,V) :- cf_typed_path_add_edge(E), cf_typed_path_candidate(E,_,V,_,_)."
      : "edge_target(E,V) :- cf_typed_path_add_edge(E), cf_typed_path_candidate(E,_,V,_,_,_,_).",
    temporalSemantics === "static"
      ? "edge_type(E,T) :- cf_typed_path_add_edge(E), cf_typed_path_candidate(E,_,_,T,_)."
      : "edge_type(E,T) :- cf_typed_path_add_edge(E), cf_typed_path_candidate(E,_,_,T,_,_,_).",
    ...(temporalSemantics === "static" ? [] : [
      "edge_valid_from(E,From) :- cf_typed_path_add_edge(E), cf_typed_path_candidate(E,_,_,_,_,From,_).",
      "edge_valid_to(E,To) :- cf_typed_path_add_edge(E), cf_typed_path_candidate(E,_,_,_,_,_,To)."
    ]),
    temporalSemantics === "static"
      ? "#minimize { Cost,E : cf_typed_path_add_edge(E), cf_typed_path_candidate(E,_,_,_,Cost) }."
      : "#minimize { Cost,E : cf_typed_path_add_edge(E), cf_typed_path_candidate(E,_,_,_,Cost,_,_) }.",
    "#show cf_typed_path_add_edge/1."
  ];
  return { candidates, program: [pathProgram, ...candidateFacts, ...candidateRules].join("\n\n") };
}

/** Diagnoses a temporal typed-path completion over the supergraph containing every declared candidate. */
export function buildTypedPathTemporalCompletionWhyNotProgram(
  options: TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics },
  candidatesInput: unknown,
  temporalEncoding: AspTemporalEncoding
): { candidates: TypedPathCompletionCandidate[]; program: string } {
  if (options.temporalSemantics !== "coValid" && options.temporalSemantics !== "orderedByStart") {
    throw new TypeError("Il why-not temporale di completion richiede coValid oppure orderedByStart");
  }
  const compiled = buildTypedPathCompletionCounterfactualProgram(options, candidatesInput, temporalEncoding);
  const candidateFacts = compiled.candidates.flatMap((candidate) => {
    if (!Number.isSafeInteger(candidate.validityFrom) || !Number.isSafeInteger(candidate.validityTo) ||
      candidate.validityFrom! > candidate.validityTo!) {
      throw new TypeError(`L'arco candidato '${candidate.id}' non ha un intervallo temporale ASP valido`);
    }
    return [
      `cf_typed_path_temporal_why_not_candidate(${candidate.recordIndex}).`,
      `edge_record(${candidate.recordIndex}).`,
      `edge_source(${candidate.recordIndex},${candidate.sourceNode}).`,
      `edge_target(${candidate.recordIndex},${candidate.targetNode}).`,
      `edge_type(${candidate.recordIndex},${escapeAspString(candidate.edgeType)}).`,
      `edge_valid_from(${candidate.recordIndex},${candidate.validityFrom}).`,
      `edge_valid_to(${candidate.recordIndex},${candidate.validityTo}).`
    ];
  });
  const program = [
    buildTypedPathTemporalNoRouteProgram(options),
    ...candidateFacts,
    "#show cf_typed_path_temporal_why_not_candidate/1."
  ].filter(Boolean).join("\n\n");
  return { candidates: compiled.candidates, program };
}

/** Independently verifies optimal typed-path witnesses and maps selected candidates. */
export function parseTypedPathCompletionCounterfactuals(
  witnesses: unknown,
  options: TypedPathOptions,
  candidates: TypedPathCompletionCandidate[],
  observedEdges: TypedPathCounterfactualEdgeRecord[],
  reverseNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  temporalContext?: {
    edgeRecords: TypedPathTemporalEdgeRecord[];
    decodeTemporalValue: (value: number) => number | undefined;
  }
): TypedPathCounterfactualProposal[] {
  const temporalSemantics = options.temporalSemantics ?? "static";
  if (temporalSemantics === "static") {
    try {
      assertStaticTypedPathOptions(options);
    } catch {
      return [];
    }
  } else if (!temporalContext || (temporalSemantics !== "coValid" && temporalSemantics !== "orderedByStart")) return [];
  buildTypedPathProgram(options);
  const byRecord = new Map(candidates.map((candidate) => [candidate.recordIndex, candidate]));
  if (byRecord.size !== candidates.length) return [];
  const edgeByRecord = new Map<number, TypedPathCounterfactualEdgeRecord>(
    observedEdges.map((edge) => [edge.recordIndex, edge])
  );
  if (edgeByRecord.size !== observedEdges.length || observedEdges.some((edge) =>
    !Number.isSafeInteger(edge.recordIndex) || edge.recordIndex < 1 ||
    !Number.isSafeInteger(edge.sourceNode) || edge.sourceNode < 1 ||
    !Number.isSafeInteger(edge.targetNode) || edge.targetNode < 1 ||
    typeof edge.edgeType !== "string" || edge.edgeType.trim() === "")) return [];
  for (const candidate of candidates) {
    if (edgeByRecord.has(candidate.recordIndex)) return [];
    edgeByRecord.set(candidate.recordIndex, {
      recordIndex: candidate.recordIndex,
      sourceNode: candidate.sourceNode,
      targetNode: candidate.targetNode,
      edgeType: candidate.edgeType
    });
  }
  const edgeIdentityByRecord: Record<number, string> = { ...reverseEdgeIndex };
  for (const candidate of candidates) edgeIdentityByRecord[candidate.recordIndex] = `candidate:${candidate.id}`;
  const results: TypedPathCounterfactualProposal[] = [];
  const seen = new Set<string>();
  let bestCost: number | undefined;

  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    if (witness === null || typeof witness !== "object") continue;
    const record = witness as Record<string, unknown>;
    const atoms = Array.isArray(record.Value) ? record.Value : [];
    const selectedIndexes = atoms.flatMap((atom) => {
      if (typeof atom !== "string") return [];
      const match = /^cf_typed_path_add_edge\((\d+)\)$/.exec(atom);
      return match ? [Number(match[1])] : [];
    });
    if (new Set(selectedIndexes).size !== selectedIndexes.length || selectedIndexes.some((index) => !byRecord.has(index))) continue;
    const added = selectedIndexes.map((index) => byRecord.get(index)!);
    const totalCost = added.reduce((sum, candidate) => sum + candidate.cost, 0);
    if (!Number.isSafeInteger(totalCost)) continue;
    const costs = record.Costs;
    if (candidates.length > 0 && (!Array.isArray(costs) || costs.length === 0 || typeof costs[0] !== "number")) continue;
    if (Array.isArray(costs) && costs.length > 0 && costs[0] !== totalCost) continue;

    let validPath = true;
    let path: TypedPathResult | TypedPathTemporalResult | null;
    if (temporalSemantics === "static") {
      path = parseWitnessTypedPath([record], reverseNodeIndex, edgeIdentityByRecord, options.edgeTypeSequence.length);
    } else {
      const selectedCandidates = added.map((candidate) => candidate.recordIndex);
      if (new Set(selectedCandidates).size !== selectedCandidates.length) continue;
      const temporalRecords = temporalContext!.edgeRecords.filter((edge) => !byRecord.has(edge.recordIndex));
      for (const candidate of added) {
        if (!Number.isSafeInteger(candidate.validityFrom) || !Number.isSafeInteger(candidate.validityTo) ||
          candidate.validityFrom! > candidate.validityTo!) {
          validPath = false;
          break;
        }
        temporalRecords.push({
          recordIndex: candidate.recordIndex,
          sourceNode: candidate.sourceNode,
          targetNode: candidate.targetNode,
          edgeType: candidate.edgeType,
          validityFrom: candidate.validityFrom!,
          validityTo: candidate.validityTo!
        });
        edgeIdentityByRecord[candidate.recordIndex] = `candidate:${candidate.id}`;
      }
      if (!validPath) continue;
      path = parseWitnessTemporalTypedPath(
        [record], reverseNodeIndex, edgeIdentityByRecord, temporalRecords,
        options as TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics },
        temporalContext!.decodeTemporalValue
      );
    }
    if (!path || path.nodeIds[0] !== reverseNodeIndex[options.startNode] ||
      path.nodeIds[path.nodeIds.length - 1] !== reverseNodeIndex[options.goalNode] ||
      new Set(path.nodeIds).size !== path.nodeIds.length) continue;
    const usedCandidates = new Set<number>();
    const nodeIndexById = new Map(Object.entries(reverseNodeIndex).map(([index, id]) => [id, Number(index)]));
    for (let step = 0; step < options.edgeTypeSequence.length; step += 1) {
      const sourceNode = nodeIndexById.get(path.nodeIds[step]);
      const targetNode = nodeIndexById.get(path.nodeIds[step + 1]);
      if (sourceNode === undefined || targetNode === undefined) { validPath = false; break; }
      const expectedType = options.edgeTypeSequence[step].trim();
      const usedIdentities = new Set(path.edgeIdsByStep[step]);
      const matchingRecords = [...edgeByRecord.values()].filter((edge) => {
        const forward = edge.sourceNode === Number(sourceNode) && edge.targetNode === Number(targetNode);
        const reverse = options.direction === "undirected" &&
          edge.sourceNode === Number(targetNode) && edge.targetNode === Number(sourceNode);
        const identity = edgeIdentityByRecord[edge.recordIndex];
        if ((forward || reverse) && edge.edgeType === expectedType && identity && usedIdentities.has(identity)) {
          if (byRecord.has(edge.recordIndex)) usedCandidates.add(edge.recordIndex);
          return true;
        }
        return false;
      });
      if (matchingRecords.length === 0 || [...usedIdentities].some((identity) =>
        !matchingRecords.some((edge) => edgeIdentityByRecord[edge.recordIndex] === identity))) {
        validPath = false;
        break;
      }
    }
    if (!validPath || usedCandidates.size !== added.length || added.some((candidate) => !usedCandidates.has(candidate.recordIndex))) continue;
    const key = [...selectedIndexes].sort((left, right) => left - right).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    if (bestCost === undefined || totalCost < bestCost) bestCost = totalCost;
    if (totalCost > bestCost) continue;
    results.push({
      totalCost,
      path,
      addedEdges: added.map(({ id, sourceNodeId, targetNodeId, edgeType, cost }) => ({
        id, sourceNodeId, targetNodeId, edgeType, cost
      }))
    });
  }
  return results.filter((proposal) => proposal.totalCost === bestCost).sort((left, right) =>
    left.addedEdges.map((edge) => edge.id).join("\u0000").localeCompare(right.addedEdges.map((edge) => edge.id).join("\u0000")));
}

export interface TypedPathResult {
  nodeIds: string[];
  edgeIdsByStep: string[][];
}

export interface TypedPathTemporalEdgeRecord {
  recordIndex: number;
  sourceNode: number;
  targetNode: number;
  edgeType: string;
  validityFrom: number;
  validityTo: number;
}

export interface TypedPathTemporalResult extends TypedPathResult {
  temporalSemantics: TypedPathTemporalSemantics;
  commonTimeValue?: number;
  startTimeValuesByStep?: number[];
}

export interface TypedPathNoRouteCertificate {
  edgeTypeSequence: string[];
  reachableByStep: Array<{ step: number; nodeIds: string[] }>;
  goalReachableAsWalk: boolean;
  firstEmptyStep?: number;
}

export interface TypedPathTemporalNoRouteCertificate {
  edgeTypeSequence: string[];
  temporalSemantics: TypedPathTemporalSemantics;
  walk: TypedPathResult;
  maximumPrefixLength: number;
  goalReachableAsWalk: boolean;
  firstBlockedStep?: number;
  repeatedNodeIds: string[];
  commonTimeValue?: number;
  startTimeValuesByStep?: number[];
}

export interface TypedPathStaticCounterfactualWhyNot extends TypedPathNoRouteCertificate {
  /** Explicit candidates included in the maximal hypothetical supergraph. */
  candidateEdgeIds: string[];
}

export interface TypedPathTemporalCounterfactualWhyNot extends TypedPathTemporalNoRouteCertificate {
  /** Explicit temporal candidates included in the maximal hypothetical supergraph. */
  candidateEdgeIds: string[];
}

export type TypedPathCounterfactualWhyNot =
  | TypedPathStaticCounterfactualWhyNot
  | TypedPathTemporalCounterfactualWhyNot;

/** Reads one typed-path witness and maps nodes and supporting edge records to stable IDs. */
export function parseWitnessTypedPath(
  witnesses: unknown,
  reverseNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  expectedEdgeCount: number
): TypedPathResult | null {
  const witness = Array.isArray(witnesses) ? witnesses[0] : undefined;
  const value = witness !== null && typeof witness === "object"
    ? (witness as Record<string, unknown>).Value
    : undefined;
  const nodesByPosition = new Map<number, string>();
  const edgesByStep = new Map<number, string[]>();
  for (const atom of Array.isArray(value) ? value : []) {
    if (typeof atom !== "string") continue;
    const nodeMatch = /^typed_path_node\((\d+),(\d+)\)$/.exec(atom);
    if (nodeMatch) {
      const nodeId = reverseNodeIndex[Number(nodeMatch[2])];
      if (nodeId) nodesByPosition.set(Number(nodeMatch[1]), nodeId);
      continue;
    }
    const edgeMatch = /^typed_path_edge\((\d+),(\d+)\)$/.exec(atom);
    if (edgeMatch) {
      const edgeId = reverseEdgeIndex[Number(edgeMatch[2])];
      if (edgeId) {
        const step = Number(edgeMatch[1]);
        const edgeIds = edgesByStep.get(step) ?? [];
        edgeIds.push(edgeId);
        edgesByStep.set(step, edgeIds);
      }
    }
  }

  const nodeIds = Array.from({ length: expectedEdgeCount + 1 }, (_, position) => nodesByPosition.get(position));
  if (nodeIds.some((nodeId) => nodeId === undefined)) return null;
  const edgeIdsByStep = Array.from({ length: expectedEdgeCount }, (_, index) =>
    [...new Set(edgesByStep.get(index + 1) ?? [])]
  );
  if (edgeIdsByStep.some((edgeIds) => edgeIds.length === 0)) return null;
  return { nodeIds: nodeIds as string[], edgeIdsByStep };
}

/** Independently validates a temporal typed-path witness against every mapped edge record. */
export function parseWitnessTemporalTypedPath(
  witnesses: unknown,
  reverseNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  edgeRecords: TypedPathTemporalEdgeRecord[],
  options: TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics },
  decodeTemporalValue: (value: number) => number | undefined
): TypedPathTemporalResult | null {
  try {
    buildTypedPathProgram(options);
  } catch {
    return null;
  }
  const witness = Array.isArray(witnesses) ? witnesses[0] : undefined;
  const value = witness !== null && typeof witness === "object"
    ? (witness as Record<string, unknown>).Value
    : undefined;
  if (!Array.isArray(value) || !value.every((atom) => typeof atom === "string")) return null;
  const atoms = value as string[];
  const basePath = parseWitnessTypedPath([witness], reverseNodeIndex, reverseEdgeIndex, options.edgeTypeSequence.length);
  if (!basePath || new Set(basePath.nodeIds).size !== basePath.nodeIds.length) return null;
  if (basePath.nodeIds[0] !== reverseNodeIndex[options.startNode] ||
    basePath.nodeIds.at(-1) !== reverseNodeIndex[options.goalNode]) return null;
  const nodeAtoms: Array<[number, number]> = [];
  for (const atom of atoms) {
    if (!atom.startsWith("typed_path_node(")) continue;
    const match = /^typed_path_node\((\d+),(\d+)\)$/.exec(atom);
    if (!match) return null;
    nodeAtoms.push([Number(match[1]), Number(match[2])]);
  }
  if (nodeAtoms.length !== options.edgeTypeSequence.length + 1 ||
    new Set(nodeAtoms.map(([position]) => position)).size !== nodeAtoms.length ||
    nodeAtoms.some(([position, node]) => position < 0 || position > options.edgeTypeSequence.length ||
      reverseNodeIndex[node] !== basePath.nodeIds[position])) return null;

  const nodeIndexById = new Map(Object.entries(reverseNodeIndex).map(([index, id]) => [id, Number(index)]));
  const nodeIndexes = basePath.nodeIds.map((id) => nodeIndexById.get(id));
  if (nodeIndexes.some((index) => index === undefined)) return null;

  const recordByIndex = new Map<number, TypedPathTemporalEdgeRecord>();
  const identityByRecord = new Map<number, string>();
  for (const edge of edgeRecords) {
    const identity = reverseEdgeIndex[edge.recordIndex];
    if (!Number.isSafeInteger(edge.recordIndex) || edge.recordIndex < 1 || recordByIndex.has(edge.recordIndex) ||
      !Number.isSafeInteger(edge.sourceNode) || edge.sourceNode < 1 || !reverseNodeIndex[edge.sourceNode] ||
      !Number.isSafeInteger(edge.targetNode) || edge.targetNode < 1 || !reverseNodeIndex[edge.targetNode] ||
      typeof edge.edgeType !== "string" || !edge.edgeType.trim() ||
      !Number.isSafeInteger(edge.validityFrom) || !Number.isSafeInteger(edge.validityTo) ||
      edge.validityFrom > edge.validityTo || typeof identity !== "string" || identity.length === 0) return null;
    recordByIndex.set(edge.recordIndex, edge);
    identityByRecord.set(edge.recordIndex, identity);
  }
  if (new Set(identityByRecord.values()).size !== identityByRecord.size) return null;

  const routeRecordsByStep: number[][] = [];
  for (let step = 0; step < options.edgeTypeSequence.length; step += 1) {
    const source = nodeIndexes[step]!;
    const target = nodeIndexes[step + 1]!;
    const expectedType = options.edgeTypeSequence[step].trim();
    routeRecordsByStep.push([...recordByIndex.values()].filter((edge) => {
      const endpointsMatch = edge.sourceNode === source && edge.targetNode === target ||
        options.direction === "undirected" && edge.sourceNode === target && edge.targetNode === source;
      return endpointsMatch && edge.edgeType === expectedType;
    }).map((edge) => edge.recordIndex).sort((left, right) => left - right));
    if (routeRecordsByStep[step].length === 0) return null;
  }

  const parsePairAtoms = (prefix: string, expression: RegExp): Array<[number, number]> | null => {
    const found: Array<[number, number]> = [];
    for (const atom of atoms) {
      if (!atom.startsWith(prefix)) continue;
      const match = expression.exec(atom);
      if (!match) return null;
      found.push([Number(match[1]), Number(match[2])]);
    }
    return found.length === new Set(found.map(([step, record]) => `${step}:${record}`)).size ? found : null;
  };
  const routeAtoms = parsePairAtoms("typed_path_edge(", /^typed_path_edge\((\d+),(\d+)\)$/);
  if (!routeAtoms) return null;
  const expectedRouteAtoms = routeRecordsByStep.flatMap((records, step) => records.map((record) => [step + 1, record] as [number, number]));
  if (routeAtoms.length !== expectedRouteAtoms.length || routeAtoms.some(([step, record]) =>
    !expectedRouteAtoms.some(([expectedStep, expectedRecord]) => step === expectedStep && record === expectedRecord))) return null;

  const supportAtoms = parsePairAtoms("typed_path_edge_support(", /^typed_path_edge_support\((\d+),(\d+)\)$/);
  if (!supportAtoms || supportAtoms.some(([step, record]) =>
    !Number.isSafeInteger(step) || step < 1 || step > options.edgeTypeSequence.length ||
    !routeRecordsByStep[step - 1].includes(record))) return null;

  if (options.temporalSemantics === "coValid") {
    if (atoms.some((atom) => atom.startsWith("typed_path_ordered_support("))) return null;
    const timeAtoms = atoms.flatMap((atom) => {
      if (!atom.startsWith("typed_path_time(")) return [];
      const match = /^typed_path_time\((-?\d+)\)$/.exec(atom);
      return match ? [Number(match[1])] : [Number.NaN];
    });
    if (timeAtoms.length !== 1 || !Number.isSafeInteger(timeAtoms[0])) return null;
    const candidateTimes = [...new Set(routeRecordsByStep.flatMap((records) => records.flatMap((record) => {
      const edge = recordByIndex.get(record)!;
      return [edge.validityFrom, edge.validityTo];
    })))].sort((left, right) => left - right);
    const earliestCommonTime = candidateTimes.find((time) => routeRecordsByStep.every((records) =>
      records.some((record) => {
        const edge = recordByIndex.get(record)!;
        return edge.validityFrom <= time && time <= edge.validityTo;
      })
    ));
    if (earliestCommonTime === undefined || timeAtoms[0] !== earliestCommonTime) return null;
    const expectedSupports = routeRecordsByStep.flatMap((records, step) => records
      .filter((record) => {
        const edge = recordByIndex.get(record)!;
        return edge.validityFrom <= earliestCommonTime && earliestCommonTime <= edge.validityTo;
      })
      .map((record) => [step + 1, record] as [number, number]));
    if (supportAtoms.length !== expectedSupports.length || supportAtoms.some(([step, record]) =>
      !expectedSupports.some(([expectedStep, expectedRecord]) => step === expectedStep && record === expectedRecord))) return null;
    const commonTimeValue = decodeTemporalValue(earliestCommonTime);
    if (!Number.isSafeInteger(commonTimeValue)) return null;
    return {
      nodeIds: basePath.nodeIds,
      edgeIdsByStep: expectedSupports.reduce<string[][]>((steps, [step, record]) => {
        (steps[step - 1] ??= []).push(identityByRecord.get(record)!);
        return steps;
      }, Array.from({ length: options.edgeTypeSequence.length }, () => [])),
      temporalSemantics: "coValid",
      commonTimeValue
    };
  }

  if (atoms.some((atom) => atom.startsWith("typed_path_time("))) return null;
  const orderedSupports: Array<{ step: number; record: number; start: number }> = [];
  for (const atom of atoms) {
    if (!atom.startsWith("typed_path_ordered_support(")) continue;
    const match = /^typed_path_ordered_support\((\d+),(\d+),(-?\d+)\)$/.exec(atom);
    if (!match) return null;
    orderedSupports.push({ step: Number(match[1]), record: Number(match[2]), start: Number(match[3]) });
  }
  if (orderedSupports.length !== options.edgeTypeSequence.length ||
    new Set(orderedSupports.map((item) => item.step)).size !== options.edgeTypeSequence.length) return null;
  orderedSupports.sort((left, right) => left.step - right.step);
  for (let step = 0; step < orderedSupports.length; step += 1) {
    const selected = orderedSupports[step];
    const edge = recordByIndex.get(selected.record);
    if (selected.step !== step + 1 || !edge || !routeRecordsByStep[step].includes(selected.record) ||
      selected.start !== edge.validityFrom || edge.validityFrom > edge.validityTo ||
      (step > 0 && (options.strictTemporalOrder === true
        ? orderedSupports[step - 1].start >= selected.start
        : orderedSupports[step - 1].start > selected.start))) return null;
  }
  if (supportAtoms.length !== orderedSupports.length || supportAtoms.some(([step, record]) =>
    !orderedSupports.some((item) => item.step === step && item.record === record))) return null;
  const startTimeValuesByStep = orderedSupports.map((item) => decodeTemporalValue(item.start));
  if (startTimeValuesByStep.some((time) => !Number.isSafeInteger(time))) return null;
  return {
    nodeIds: basePath.nodeIds,
    edgeIdsByStep: orderedSupports.map((item) => [identityByRecord.get(item.record)!]),
    temporalSemantics: "orderedByStart",
    startTimeValuesByStep: startTimeValuesByStep as number[]
  };
}

/** Parses each exact-prefix reachability layer, including empty layers, back to node IDs. */
export function parseTypedPathNoRouteCertificate(
  witnesses: unknown,
  reverseNodeIndex: Record<number, string>,
  edgeTypeSequence: string[]
): TypedPathNoRouteCertificate | null {
  const witness = Array.isArray(witnesses) ? witnesses[0] : undefined;
  const value = witness !== null && typeof witness === "object"
    ? (witness as Record<string, unknown>).Value
    : undefined;
  const steps = new Set<number>();
  const nodesByStep = new Map<number, Set<string>>();
  let goalReachableAsWalk = false;
  for (const atom of Array.isArray(value) ? value : []) {
    if (typeof atom !== "string") continue;
    const stepMatch = /^typed_path_no_route_step\((\d+)\)$/.exec(atom);
    if (stepMatch) {
      steps.add(Number(stepMatch[1]));
      continue;
    }
    const nodeMatch = /^typed_path_no_route_node\((\d+),(\d+)\)$/.exec(atom);
    if (nodeMatch) {
      const sourceId = reverseNodeIndex[Number(nodeMatch[2])];
      if (!sourceId) return null;
      const step = Number(nodeMatch[1]);
      const nodeIds = nodesByStep.get(step) ?? new Set<string>();
      nodeIds.add(sourceId);
      nodesByStep.set(step, nodeIds);
      continue;
    }
    if (atom === "typed_path_no_route_goal_reachable") goalReachableAsWalk = true;
  }

  if (steps.size !== edgeTypeSequence.length + 1 ||
    Array.from({ length: edgeTypeSequence.length + 1 }, (_, step) => step).some((step) => !steps.has(step))) {
    return null;
  }
  const reachableByStep = Array.from({ length: edgeTypeSequence.length + 1 }, (_, step) => ({
    step,
    nodeIds: [...(nodesByStep.get(step) ?? [])].sort()
  }));
  const firstEmptyStep = reachableByStep.find((layer) => layer.step > 0 && layer.nodeIds.length === 0)?.step;
  return {
    edgeTypeSequence: [...edgeTypeSequence],
    reachableByStep,
    goalReachableAsWalk,
    ...(firstEmptyStep === undefined ? {} : { firstEmptyStep })
  };
}

/** Verifies the longest temporal walk and its blocker against independent interval reachability. */
export function parseTypedPathTemporalNoRouteCertificate(
  witnesses: unknown,
  options: TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics },
  edgeRecords: TypedPathTemporalEdgeRecord[],
  candidateNodeIdsInput: readonly string[],
  reverseNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  decodeTemporalValue: (value: number) => number | undefined
): TypedPathTemporalNoRouteCertificate | null {
  try {
    buildTypedPathTemporalNoRouteProgram(options);
  } catch {
    return null;
  }
  if (!Array.isArray(edgeRecords) || !Array.isArray(candidateNodeIdsInput)) return null;
  const witness = Array.isArray(witnesses) ? witnesses.at(-1) : undefined;
  const value = witness !== null && typeof witness === "object"
    ? (witness as Record<string, unknown>).Value
    : undefined;
  if (!Array.isArray(value) || !value.every((atom) => typeof atom === "string")) return null;
  const atoms = value as string[];
  const parseAtoms = (prefix: string, expression: RegExp): number[][] | null => {
    const parsed: number[][] = [];
    for (const atom of atoms) {
      if (!atom.startsWith(prefix)) continue;
      const match = expression.exec(atom);
      if (!match) return null;
      parsed.push(match.slice(1).map(Number));
    }
    return parsed;
  };
  const depthAtoms = parseAtoms("temporal_typed_path_depth(", /^temporal_typed_path_depth\((\d+)\)$/);
  const nodeAtoms = parseAtoms("temporal_typed_path_node(", /^temporal_typed_path_node\((\d+),(\d+)\)$/);
  const edgeAtoms = parseAtoms("temporal_typed_path_edge(", /^temporal_typed_path_edge\((\d+),(\d+)\)$/);
  const commonStartAtoms = parseAtoms("temporal_typed_path_common_start(", /^temporal_typed_path_common_start\((-?\d+)\)$/);
  const orderedStartAtoms = parseAtoms("temporal_typed_path_ordered_start(", /^temporal_typed_path_ordered_start\((\d+),(\d+),(-?\d+)\)$/);
  if (!depthAtoms || !nodeAtoms || !edgeAtoms || !commonStartAtoms || !orderedStartAtoms ||
    depthAtoms.length !== 1 || !Number.isSafeInteger(depthAtoms[0][0])) return null;
  const maximumPrefixLength = depthAtoms[0][0];
  const sequence = options.edgeTypeSequence.map((type) => type.trim());
  if (maximumPrefixLength < 0 || maximumPrefixLength > sequence.length) return null;

  const nodeByStep = new Map<number, number>();
  for (const [step, node] of nodeAtoms) {
    if (!Number.isSafeInteger(step) || step < 0 || step > maximumPrefixLength ||
      !Number.isSafeInteger(node) || node < 1 || nodeByStep.has(step) || !reverseNodeIndex[node]) return null;
    nodeByStep.set(step, node);
  }
  if (nodeByStep.size !== maximumPrefixLength + 1 ||
    Array.from({ length: maximumPrefixLength + 1 }, (_, step) => step).some((step) => !nodeByStep.has(step)) ||
    nodeByStep.get(0) !== options.startNode) return null;

  const candidateNodeIds = new Set(candidateNodeIdsInput);
  const knownNodeIds = new Set(Object.values(reverseNodeIndex));
  if (candidateNodeIds.size !== candidateNodeIdsInput.length ||
    candidateNodeIdsInput.some((nodeId) => typeof nodeId !== "string" || !knownNodeIds.has(nodeId)) ||
    !candidateNodeIds.has(reverseNodeIndex[options.startNode])) return null;
  const nodeIndexById = new Map(Object.entries(reverseNodeIndex).map(([index, nodeId]) => [nodeId, Number(index)]));
  const edgeByRecord = new Map<number, TypedPathTemporalEdgeRecord>();
  const identityByRecord = new Map<number, string>();
  for (const edge of edgeRecords) {
    const identity = reverseEdgeIndex[edge.recordIndex];
    if (!Number.isSafeInteger(edge.recordIndex) || edge.recordIndex < 1 || edgeByRecord.has(edge.recordIndex) ||
      !Number.isSafeInteger(edge.sourceNode) || edge.sourceNode < 1 || !reverseNodeIndex[edge.sourceNode] ||
      !Number.isSafeInteger(edge.targetNode) || edge.targetNode < 1 || !reverseNodeIndex[edge.targetNode] ||
      typeof edge.edgeType !== "string" || !edge.edgeType.trim() ||
      !Number.isSafeInteger(edge.validityFrom) || !Number.isSafeInteger(edge.validityTo) ||
      edge.validityFrom > edge.validityTo || typeof identity !== "string" || identity.length === 0) return null;
    edgeByRecord.set(edge.recordIndex, edge);
    identityByRecord.set(edge.recordIndex, identity);
  }
  if (new Set(identityByRecord.values()).size !== identityByRecord.size) return null;

  const selectedEdgesByStep = new Map<number, number>();
  for (const [step, edge] of edgeAtoms) {
    if (!Number.isSafeInteger(step) || step < 1 || step > maximumPrefixLength ||
      !Number.isSafeInteger(edge) || !edgeByRecord.has(edge) || selectedEdgesByStep.has(step)) return null;
    selectedEdgesByStep.set(step, edge);
  }
  if (selectedEdgesByStep.size !== maximumPrefixLength ||
    Array.from({ length: maximumPrefixLength }, (_, index) => index + 1).some((step) => !selectedEdgesByStep.has(step))) return null;

  const recordForStep = new Map<number, TypedPathTemporalEdgeRecord>();
  const nodeIds = Array.from({ length: maximumPrefixLength + 1 }, (_, step) => reverseNodeIndex[nodeByStep.get(step)!]);
  const edgeIdsByStep: string[][] = [];
  const routeStarts: number[] = [];
  for (let step = 1; step <= maximumPrefixLength; step += 1) {
    const edge = edgeByRecord.get(selectedEdgesByStep.get(step)!)!;
    const sourceNode = nodeByStep.get(step - 1)!;
    const targetNode = nodeByStep.get(step)!;
    const endpointsMatch = edge.sourceNode === sourceNode && edge.targetNode === targetNode ||
      options.direction === "undirected" && edge.sourceNode === targetNode && edge.targetNode === sourceNode;
    if (!endpointsMatch || edge.edgeType.trim() !== sequence[step - 1] ||
      !candidateNodeIds.has(reverseNodeIndex[targetNode])) return null;
    recordForStep.set(step, edge);
    edgeIdsByStep.push([identityByRecord.get(edge.recordIndex)!]);
    routeStarts.push(edge.validityFrom);
  }

  const goalAtoms = atoms.filter((atom) => atom === "temporal_typed_path_goal_reachable").length;
  if (goalAtoms > 1) return null;
  const goalReachableAsWalkFromASP = goalAtoms === 1;
  let maximumReachablePrefix = 0;
  let goalReachableAsWalk = false;
  let expectedCommonStart: number | undefined;
  let expectedOrderedLayers: Array<Map<number, number>> = [];

  const adjacencyByTypeAndSource = new Map<string, Map<number, TypedPathTemporalEdgeRecord[]>>();
  const addArc = (type: string, source: number, edge: TypedPathTemporalEdgeRecord) => {
    const bySource = adjacencyByTypeAndSource.get(type) ?? new Map<number, TypedPathTemporalEdgeRecord[]>();
    const outgoing = bySource.get(source) ?? [];
    outgoing.push(edge);
    bySource.set(source, outgoing);
    adjacencyByTypeAndSource.set(type, bySource);
  };
  for (const edge of edgeByRecord.values()) {
    if (!candidateNodeIds.has(reverseNodeIndex[edge.targetNode])) continue;
    if (candidateNodeIds.has(reverseNodeIndex[edge.sourceNode])) addArc(edge.edgeType.trim(), edge.sourceNode, edge);
    if (options.direction === "undirected" && edge.sourceNode !== edge.targetNode &&
      candidateNodeIds.has(reverseNodeIndex[edge.targetNode]) && candidateNodeIds.has(reverseNodeIndex[edge.sourceNode])) {
      addArc(edge.edgeType.trim(), edge.targetNode, edge);
    }
  }

  if (options.temporalSemantics === "coValid") {
    if (commonStartAtoms.length !== (maximumPrefixLength > 0 ? 1 : 0) || orderedStartAtoms.length !== 0) return null;
    let expansions = 0;
    const maximumExpansions = 1_000_000;
    const addNondominatedInterval = (frontier: Array<{ from: number; to: number }>, candidate: { from: number; to: number }) => {
      if (frontier.some((item) => item.from <= candidate.from && item.to >= candidate.to)) return;
      for (let index = frontier.length - 1; index >= 0; index -= 1) {
        const item = frontier[index];
        if (candidate.from <= item.from && candidate.to >= item.to) frontier.splice(index, 1);
      }
      frontier.push(candidate);
    };
    let current = new Map<number, Array<{ from: number; to: number }>>([
      [options.startNode, [{ from: Number.NEGATIVE_INFINITY, to: Number.POSITIVE_INFINITY }]]
    ]);
    const layers: Array<Map<number, Array<{ from: number; to: number }>>> = [current];
    for (let step = 1; step <= sequence.length; step += 1) {
      const next = new Map<number, Array<{ from: number; to: number }>>();
      const bySource = adjacencyByTypeAndSource.get(sequence[step - 1]);
      for (const [source, intervals] of current) {
        for (const edge of bySource?.get(source) ?? []) {
          for (const interval of intervals) {
            expansions += 1;
            if (expansions > maximumExpansions) return null;
            const from = Math.max(interval.from, edge.validityFrom);
            const to = Math.min(interval.to, edge.validityTo);
            if (from > to) continue;
            const frontier = next.get(edge.targetNode) ?? [];
            addNondominatedInterval(frontier, { from, to });
            next.set(edge.targetNode, frontier);
          }
        }
      }
      if (next.size === 0) break;
      current = next;
      layers.push(current);
    }
    maximumReachablePrefix = layers.length - 1;
    goalReachableAsWalk = maximumReachablePrefix === sequence.length && layers.at(-1)!.has(options.goalNode);
    const optimalLayer = goalReachableAsWalk ? layers.at(-1)! : layers[maximumReachablePrefix];
    const optimalNodes = goalReachableAsWalk ? [options.goalNode] : [...optimalLayer.keys()];
    expectedCommonStart = Math.min(...optimalNodes.flatMap((node) =>
      (optimalLayer.get(node) ?? []).map((interval) => interval.from).filter(Number.isFinite)
    ));
    if (!Number.isSafeInteger(expectedCommonStart)) expectedCommonStart = undefined;
    if (maximumPrefixLength > 0) {
      const commonStart = commonStartAtoms[0]?.[0];
      const commonEnd = Math.min(...[...recordForStep.values()].map((edge) => edge.validityTo));
      if (!Number.isSafeInteger(commonStart) || !Number.isSafeInteger(commonEnd) || commonStart > commonEnd ||
        commonStart !== Math.max(...routeStarts) || commonStart !== expectedCommonStart) return null;
    }
  } else {
    if (commonStartAtoms.length !== 0 || orderedStartAtoms.length !== maximumPrefixLength) return null;
    let current = new Map<number, number>([[options.startNode, Number.NEGATIVE_INFINITY]]);
    expectedOrderedLayers = [current];
    for (let step = 1; step <= sequence.length; step += 1) {
      const next = new Map<number, number>();
      const bySource = adjacencyByTypeAndSource.get(sequence[step - 1]);
      for (const [source, earliestPreviousStart] of current) {
        for (const edge of bySource?.get(source) ?? []) {
          const start = edge.validityFrom;
          if (step > 1 && (options.strictTemporalOrder === true
            ? earliestPreviousStart >= start
            : earliestPreviousStart > start)) continue;
          const previous = next.get(edge.targetNode);
          if (previous === undefined || start < previous) next.set(edge.targetNode, start);
        }
      }
      if (next.size === 0) break;
      current = next;
      expectedOrderedLayers.push(current);
    }
    maximumReachablePrefix = expectedOrderedLayers.length - 1;
    goalReachableAsWalk = maximumReachablePrefix === sequence.length && expectedOrderedLayers.at(-1)!.has(options.goalNode);
    if (maximumPrefixLength > 0) {
      const starts = new Map(orderedStartAtoms.map(([step, edge, start]) => [`${step}:${edge}`, start]));
      if (starts.size !== maximumPrefixLength) return null;
      for (let step = 1; step <= maximumPrefixLength; step += 1) {
        const edgeIndex = selectedEdgesByStep.get(step)!;
        const edge = edgeByRecord.get(edgeIndex)!;
        if (starts.get(`${step}:${edgeIndex}`) !== edge.validityFrom ||
          !expectedOrderedLayers[step].has(edge.targetNode)) return null;
        if (step > 1 && (options.strictTemporalOrder === true
          ? routeStarts[step - 2] >= edge.validityFrom
          : routeStarts[step - 2] > edge.validityFrom)) return null;
      }
    }
  }

  if (maximumPrefixLength !== maximumReachablePrefix || goalReachableAsWalkFromASP !== goalReachableAsWalk ||
    goalReachableAsWalk && (nodeIds.at(-1) !== reverseNodeIndex[options.goalNode] ||
      new Set(nodeIds).size === nodeIds.length)) return null;
  if (options.temporalSemantics === "coValid" && maximumPrefixLength === 0 && commonStartAtoms.length !== 0) return null;
  const repeatedNodeIds = [...new Set(nodeIds.filter((nodeId, index) => nodeIds.indexOf(nodeId) !== index))].sort();
  if (nodeIds.some((nodeId, step) => {
    if (step === 0) return false;
    if (options.temporalSemantics === "coValid") {
      const commonStart = commonStartAtoms[0]?.[0];
      const commonEnd = Math.min(...[...recordForStep.values()].map((edge) => edge.validityTo));
      const edge = recordForStep.get(step)!;
      return !Number.isSafeInteger(commonStart) || commonStart < edge.validityFrom || commonStart > edge.validityTo ||
        commonStart > commonEnd;
    }
    return false;
  })) return null;

  const startTimeValuesByStep = options.temporalSemantics === "orderedByStart"
    ? routeStarts.map((start) => decodeTemporalValue(start))
    : undefined;
  const commonTimeValue = options.temporalSemantics === "coValid" && maximumPrefixLength > 0
    ? decodeTemporalValue(commonStartAtoms[0][0])
    : undefined;
  if (startTimeValuesByStep?.some((time) => !Number.isSafeInteger(time)) ||
    commonTimeValue !== undefined && !Number.isSafeInteger(commonTimeValue)) return null;
  const firstBlockedStep = maximumPrefixLength < sequence.length ? maximumPrefixLength + 1 : undefined;
  return {
    edgeTypeSequence: [...sequence],
    temporalSemantics: options.temporalSemantics,
    walk: { nodeIds, edgeIdsByStep },
    maximumPrefixLength,
    goalReachableAsWalk,
    ...(firstBlockedStep === undefined ? {} : { firstBlockedStep }),
    repeatedNodeIds,
    ...(commonTimeValue === undefined ? {} : { commonTimeValue }),
    ...(startTimeValuesByStep === undefined ? {} : { startTimeValuesByStep: startTimeValuesByStep as number[] })
  };
}

/** Parses and independently checks the temporal maximum-prefix witness over observed and candidate edges. */
export function parseTypedPathTemporalCompletionWhyNotCertificate(
  witnesses: unknown,
  options: TypedPathOptions & { temporalSemantics: TypedPathTemporalSemantics },
  candidatesInput: unknown,
  observedEdges: TypedPathTemporalEdgeRecord[],
  candidateNodeIdsInput: readonly string[],
  reverseNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string>,
  decodeTemporalValue: (value: number) => number | undefined
): TypedPathTemporalCounterfactualWhyNot | null {
  if (options.temporalSemantics !== "coValid" && options.temporalSemantics !== "orderedByStart") return null;
  try {
    buildTypedPathTemporalNoRouteProgram(options);
  } catch {
    return null;
  }
  if (!Array.isArray(candidatesInput) || !Array.isArray(observedEdges) || !Array.isArray(candidateNodeIdsInput)) return null;

  let validated: KPlexCompletionCandidate[];
  try {
    validated = validateKPlexCompletionCandidates(candidatesInput);
  } catch {
    return null;
  }
  const candidates: TypedPathCompletionCandidate[] = validated.map((candidate, index) => {
    const raw = candidatesInput[index] as Record<string, unknown>;
    if (!Number.isSafeInteger(raw.validityFrom) || !Number.isSafeInteger(raw.validityTo) ||
      Number(raw.validityFrom) > Number(raw.validityTo)) return { ...candidate, validityFrom: undefined, validityTo: undefined };
    return { ...candidate, validityFrom: Number(raw.validityFrom), validityTo: Number(raw.validityTo) };
  });
  if (candidates.some((candidate) => candidate.validityFrom === undefined || candidate.validityTo === undefined)) return null;

  const witness = Array.isArray(witnesses) ? witnesses.at(-1) : undefined;
  if (witness === null || typeof witness !== "object") return null;
  const values = (witness as Record<string, unknown>).Value;
  if (!Array.isArray(values) || !values.every((atom) => typeof atom === "string")) return null;
  const candidateByRecord = new Map(candidates.map((candidate) => [candidate.recordIndex, candidate]));
  const shownCandidateRecords = new Set<number>();
  for (const atom of values as string[]) {
    if (!atom.startsWith("cf_typed_path_temporal_why_not_candidate(")) continue;
    const match = /^cf_typed_path_temporal_why_not_candidate\((\d+)\)$/.exec(atom);
    if (!match) return null;
    const recordIndex = Number(match[1]);
    if (!candidateByRecord.has(recordIndex) || shownCandidateRecords.has(recordIndex)) return null;
    shownCandidateRecords.add(recordIndex);
  }
  if (shownCandidateRecords.size !== candidates.length || candidates.some((candidate) =>
    !shownCandidateRecords.has(candidate.recordIndex))) return null;

  const nodeIdSet = new Set(candidateNodeIdsInput);
  const knownNodeIds = new Set(Object.values(reverseNodeIndex));
  if (nodeIdSet.size !== candidateNodeIdsInput.length || candidateNodeIdsInput.some((nodeId) =>
    typeof nodeId !== "string" || !knownNodeIds.has(nodeId))) return null;
  const edgeRecordsByIndex = new Map<number, TypedPathTemporalEdgeRecord>();
  for (const edge of observedEdges) {
    if (edgeRecordsByIndex.has(edge.recordIndex) || candidateByRecord.has(edge.recordIndex)) return null;
    edgeRecordsByIndex.set(edge.recordIndex, edge);
  }
  const candidateEdges: TypedPathTemporalEdgeRecord[] = [];
  for (const candidate of candidates) {
    const sourceId = reverseNodeIndex[candidate.sourceNode];
    const targetId = reverseNodeIndex[candidate.targetNode];
    if (!sourceId || !targetId || !nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId) ||
      edgeRecordsByIndex.has(candidate.recordIndex) ||
      Object.prototype.hasOwnProperty.call(reverseEdgeIndex, candidate.recordIndex)) return null;
    candidateEdges.push({
      recordIndex: candidate.recordIndex,
      sourceNode: candidate.sourceNode,
      targetNode: candidate.targetNode,
      edgeType: candidate.edgeType,
      validityFrom: candidate.validityFrom!,
      validityTo: candidate.validityTo!
    });
  }
  const edgeIdentityByRecord: Record<number, string> = { ...reverseEdgeIndex };
  for (const candidate of candidates) edgeIdentityByRecord[candidate.recordIndex] = `candidate:${candidate.id}`;
  const certificate = parseTypedPathTemporalNoRouteCertificate(
    witnesses,
    options,
    [...observedEdges, ...candidateEdges],
    candidateNodeIdsInput,
    reverseNodeIndex,
    edgeIdentityByRecord,
    decodeTemporalValue
  );
  if (!certificate) return null;
  return {
    ...certificate,
    candidateEdgeIds: candidates.map(({ id }) => id).sort((left, right) => left.localeCompare(right))
  };
}

/** Diagnoses an infeasible completion against all eligible declared candidates at once. */
export function buildTypedPathCompletionWhyNotProgram(
  options: TypedPathOptions,
  candidatesInput: unknown
): { candidates: KPlexCompletionCandidate[]; program: string } {
  const candidates = validateKPlexCompletionCandidates(candidatesInput);
  const candidateFacts = candidates.flatMap((candidate) => [
    `cf_typed_path_why_not_candidate(${candidate.recordIndex}).`,
    `edge_record(${candidate.recordIndex}).`,
    `edge_source(${candidate.recordIndex},${candidate.sourceNode}).`,
    `edge_target(${candidate.recordIndex},${candidate.targetNode}).`,
    `edge_type(${candidate.recordIndex},${escapeAspString(candidate.edgeType)}).`
  ]);
  const program = [
    buildTypedPathNoRouteProgram(options),
    ...candidateFacts,
    "#show cf_typed_path_why_not_candidate/1."
  ].filter(Boolean).join("\n\n");
  return { candidates, program };
}

/** Parses the prefix witness and checks it against independent typed reachability. */
export function parseTypedPathCompletionWhyNotCertificate(
  witnesses: unknown,
  options: TypedPathOptions,
  candidatesInput: unknown,
  observedEdges: TypedPathCounterfactualEdgeRecord[],
  candidateNodeIdsInput: readonly string[],
  reverseNodeIndex: Record<number, string>
): TypedPathStaticCounterfactualWhyNot | null {
  let candidates: KPlexCompletionCandidate[];
  try {
    buildTypedPathNoRouteProgram(options);
    candidates = validateKPlexCompletionCandidates(candidatesInput);
  } catch {
    return null;
  }
  const certificate = parseTypedPathNoRouteCertificate(witnesses, reverseNodeIndex, options.edgeTypeSequence);
  const witness = Array.isArray(witnesses) ? witnesses[0] : undefined;
  if (!certificate || witness === null || typeof witness !== "object" || !Array.isArray(observedEdges) ||
    !Array.isArray(candidateNodeIdsInput)) return null;

  const candidateByRecord = new Map(candidates.map((candidate) => [candidate.recordIndex, candidate]));
  if (candidateByRecord.size !== candidates.length) return null;
  const shownCandidateRecords = new Set<number>();
  for (const atom of Array.isArray((witness as Record<string, unknown>).Value)
    ? (witness as Record<string, unknown>).Value as unknown[]
    : []) {
    if (typeof atom !== "string") continue;
    const match = /^cf_typed_path_why_not_candidate\((\d+)\)$/.exec(atom);
    if (!match) continue;
    const recordIndex = Number(match[1]);
    if (!candidateByRecord.has(recordIndex) || shownCandidateRecords.has(recordIndex)) return null;
    shownCandidateRecords.add(recordIndex);
  }
  if (shownCandidateRecords.size !== candidates.length || candidates.some((candidate) =>
    !shownCandidateRecords.has(candidate.recordIndex))) return null;

  const edgeByRecord = new Map<number, TypedPathCounterfactualEdgeRecord>();
  for (const edge of observedEdges) {
    if (!Number.isSafeInteger(edge.recordIndex) || edge.recordIndex < 1 || edgeByRecord.has(edge.recordIndex) ||
      !Number.isSafeInteger(edge.sourceNode) || edge.sourceNode < 1 ||
      !Number.isSafeInteger(edge.targetNode) || edge.targetNode < 1 ||
      !reverseNodeIndex[edge.sourceNode] || !reverseNodeIndex[edge.targetNode] ||
      typeof edge.edgeType !== "string" || !edge.edgeType.trim() || candidateByRecord.has(edge.recordIndex)) return null;
    edgeByRecord.set(edge.recordIndex, { ...edge, edgeType: edge.edgeType.trim() });
  }
  for (const candidate of candidates) {
    if (edgeByRecord.has(candidate.recordIndex)) return null;
    edgeByRecord.set(candidate.recordIndex, {
      recordIndex: candidate.recordIndex,
      sourceNode: candidate.sourceNode,
      targetNode: candidate.targetNode,
      edgeType: candidate.edgeType
    });
  }

  const candidateNodeIds = new Set(candidateNodeIdsInput.filter((nodeId) => typeof nodeId === "string" && nodeId.length > 0));
  const knownNodeIds = new Set(Object.values(reverseNodeIndex));
  if (candidateNodeIds.size !== candidateNodeIdsInput.length ||
    candidateNodeIdsInput.some((nodeId) => !knownNodeIds.has(nodeId))) return null;
  const nodeIndexById = new Map(Object.entries(reverseNodeIndex).map(([index, nodeId]) => [nodeId, Number(index)]));
  const startNodeId = reverseNodeIndex[options.startNode];
  const goalNodeId = reverseNodeIndex[options.goalNode];
  if (!startNodeId || !goalNodeId) return null;
  if (candidates.some((candidate) => {
    const sourceId = reverseNodeIndex[candidate.sourceNode];
    const targetId = reverseNodeIndex[candidate.targetNode];
    return !sourceId || !targetId || !candidateNodeIds.has(sourceId) || !candidateNodeIds.has(targetId);
  })) return null;

  const targetsByTypeAndSource = new Map<string, Map<number, Set<number>>>();
  const addArc = (edgeType: string, sourceNode: number, targetNode: number) => {
    const targetsBySource = targetsByTypeAndSource.get(edgeType) ?? new Map<number, Set<number>>();
    const targets = targetsBySource.get(sourceNode) ?? new Set<number>();
    targets.add(targetNode);
    targetsBySource.set(sourceNode, targets);
    targetsByTypeAndSource.set(edgeType, targetsBySource);
  };
  for (const edge of edgeByRecord.values()) {
    addArc(edge.edgeType, edge.sourceNode, edge.targetNode);
    if (options.direction === "undirected") addArc(edge.edgeType, edge.targetNode, edge.sourceNode);
  }

  const expectedLayers: string[][] = [candidateNodeIds.has(startNodeId) ? [startNodeId] : []];
  for (let stepIndex = 0; stepIndex < options.edgeTypeSequence.length; stepIndex += 1) {
    const next = new Set<string>();
    const expectedType = options.edgeTypeSequence[stepIndex].trim();
    const targetsBySource = targetsByTypeAndSource.get(expectedType);
    for (const sourceId of expectedLayers[stepIndex]) {
      const sourceIndex = nodeIndexById.get(sourceId);
      if (sourceIndex === undefined) return null;
      for (const targetIndex of targetsBySource?.get(sourceIndex) ?? []) {
        const targetId = reverseNodeIndex[targetIndex];
        if (targetId && candidateNodeIds.has(targetId)) next.add(targetId);
      }
    }
    expectedLayers.push([...next].sort());
  }

  if (certificate.reachableByStep.length !== expectedLayers.length ||
    certificate.reachableByStep.some((layer, index) =>
      layer.step !== index || layer.nodeIds.join("\u0000") !== expectedLayers[index].join("\u0000"))) return null;
  const goalReachableAsWalk = expectedLayers[expectedLayers.length - 1].includes(goalNodeId);
  if (certificate.goalReachableAsWalk !== goalReachableAsWalk) return null;
  const firstEmptyStep = expectedLayers.findIndex((layer, index) => index > 0 && layer.length === 0);
  if (certificate.firstEmptyStep !== (firstEmptyStep === -1 ? undefined : firstEmptyStep)) return null;

  return {
    ...certificate,
    candidateEdgeIds: candidates.map((candidate) => candidate.id).sort((left, right) => left.localeCompare(right))
  };
}

export function parseWitnessNodeSets(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): string[][] {
  return parseWitnessAtomSets(witnesses, reverseIndex, "in");
}

export interface KPlexWitnessExplanation {
  nodeIds: string[];
  missingTiePairs: Array<[string, string]>;
}

export type KPlexMaximalityBlocker =
  | { candidateNodeId: string; reason: "candidate_degree"; candidateMissingDegree: number }
  | { candidateNodeId: string; reason: "saturated_member"; blockingNodeId: string; blockingNodeMissingDegree: number };

export interface MaximalKPlexWitnessExplanation extends KPlexWitnessExplanation {
  candidateNodeIds: string[];
  blockers: KPlexMaximalityBlocker[];
}

/** Parses the selected vertices together with every absent pair witnessing the s-plex bound. */
export function parseWitnessKPlexExplanations(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): KPlexWitnessExplanation[] {
  const seen = new Set<string>();
  const results: KPlexWitnessExplanation[] = [];
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const witnessRecord = witness !== null && typeof witness === "object"
      ? witness as Record<string, unknown>
      : {};
    const value = witnessRecord.Value;
    const atoms = Array.isArray(value) ? value : [];
    const nodeIds = atoms
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^in\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseIndex[Number(match[1])])
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const key = [...nodeIds].sort().join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);

    const missingTiePairs = atoms
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => /^missing_tie\((\d+),(\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .flatMap((match): Array<[string, string]> => {
        const source = reverseIndex[Number(match[1])];
        const target = reverseIndex[Number(match[2])];
        return source && target ? [[source, target]] : [];
      })
      .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
    results.push({ nodeIds, missingTiePairs });
  }
  return results;
}

/** Parses the ASP certificate showing why every excluded eligible vertex cannot extend a maximal s-plex. */
export function parseWitnessMaximalKPlexExplanations(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): MaximalKPlexWitnessExplanation[] {
  const baseExplanations = parseWitnessKPlexExplanations(witnesses, reverseIndex);
  const bySetKey = new Map(baseExplanations.map((explanation) => [
    [...explanation.nodeIds].sort().join("\u0000"),
    { ...explanation, candidateNodeIds: [] as string[], blockers: [] as KPlexMaximalityBlocker[] }
  ]));

  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const witnessRecord = witness !== null && typeof witness === "object"
      ? witness as Record<string, unknown>
      : {};
    const atoms = Array.isArray(witnessRecord.Value)
      ? witnessRecord.Value.filter((atom): atom is string => typeof atom === "string")
      : [];
    const nodeIds = atoms
      .map((atom) => /^in\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseIndex[Number(match[1])])
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const explanation = bySetKey.get([...nodeIds].sort().join("\u0000"));
    if (!explanation) continue;

    for (const atom of atoms) {
      const candidateMatch = /^maximal_candidate\((\d+)\)$/.exec(atom);
      if (candidateMatch) {
        const candidateNodeId = reverseIndex[Number(candidateMatch[1])];
        if (candidateNodeId) explanation.candidateNodeIds.push(candidateNodeId);
        continue;
      }

      const degreeBlockerMatch = /^maximal_blocked_by_degree\((\d+),(\d+)\)$/.exec(atom);
      if (degreeBlockerMatch) {
        const candidateNodeId = reverseIndex[Number(degreeBlockerMatch[1])];
        if (candidateNodeId) explanation.blockers.push({
          candidateNodeId,
          reason: "candidate_degree",
          candidateMissingDegree: Number(degreeBlockerMatch[2])
        });
        continue;
      }

      const memberBlockerMatch = /^maximal_blocked_by_member\((\d+),(\d+),(\d+)\)$/.exec(atom);
      if (memberBlockerMatch) {
        const candidateNodeId = reverseIndex[Number(memberBlockerMatch[1])];
        const blockingNodeId = reverseIndex[Number(memberBlockerMatch[2])];
        if (candidateNodeId && blockingNodeId) explanation.blockers.push({
          candidateNodeId,
          reason: "saturated_member",
          blockingNodeId,
          blockingNodeMissingDegree: Number(memberBlockerMatch[3])
        });
      }
    }
  }

  return [...bySetKey.values()].map((explanation) => ({
    ...explanation,
    candidateNodeIds: [...new Set(explanation.candidateNodeIds)].sort((left, right) => left.localeCompare(right)),
    blockers: [...new Map(explanation.blockers.map((blocker) => [
      blocker.reason === "candidate_degree"
        ? `${blocker.candidateNodeId}\u0000${blocker.reason}\u0000${blocker.candidateMissingDegree}`
        : `${blocker.candidateNodeId}\u0000${blocker.reason}\u0000${blocker.blockingNodeId}\u0000${blocker.blockingNodeMissingDegree}`,
      blocker
    ])).values()].sort((left, right) =>
      left.candidateNodeId.localeCompare(right.candidateNodeId) ||
      left.reason.localeCompare(right.reason) ||
      (left.reason === "saturated_member" && right.reason === "saturated_member"
        ? left.blockingNodeId.localeCompare(right.blockingNodeId)
        : 0)
    )
  }));
}

export interface KCoreWitnessExplanation {
  nodeIds: string[];
  supportPairs: Array<[string, string]>;
  peeling: KCorePeelingStep[];
}

export interface KCorePeelingStep {
  nodeId: string;
  round: number;
  survivingNeighborIds: string[];
}

/** Parses the deterministic ASP result for one synchronous peeling round. */
export function parseWitnessKCorePeelingRound(
  witnesses: unknown,
  reverseIndex: Record<number, string>,
  round: number
): KCorePeelingStep[] | null {
  validateIntegerParameter("round", round, 1);
  const witness = Array.isArray(witnesses)
    ? witnesses.find((item) => item !== null && typeof item === "object" && Array.isArray((item as Record<string, unknown>).Value))
    : undefined;
  if (!witness || typeof witness !== "object") return null;
  const atoms = (witness as Record<string, unknown>).Value as unknown[];
  const peeledNodeIds = new Set<string>();
  const neighborsByNode = new Map<string, Set<string>>();
  for (const atom of atoms) {
    if (typeof atom !== "string") continue;
    const peeledMatch = /^peeled\((\d+)\)$/.exec(atom);
    if (peeledMatch) {
      const nodeId = reverseIndex[Number(peeledMatch[1])];
      if (!nodeId) return null;
      peeledNodeIds.add(nodeId);
      continue;
    }
    const supportMatch = /^peel_support\((\d+),(\d+)\)$/.exec(atom);
    if (!supportMatch) continue;
    const nodeId = reverseIndex[Number(supportMatch[1])];
    const neighborId = reverseIndex[Number(supportMatch[2])];
    if (!nodeId || !neighborId) return null;
    const neighbors = neighborsByNode.get(nodeId) ?? new Set<string>();
    neighbors.add(neighborId);
    neighborsByNode.set(nodeId, neighbors);
  }
  if ([...neighborsByNode.keys()].some((nodeId) => !peeledNodeIds.has(nodeId))) return null;
  return [...peeledNodeIds].sort((left, right) => left.localeCompare(right)).map((nodeId) => ({
    nodeId,
    round,
    survivingNeighborIds: [...(neighborsByNode.get(nodeId) ?? [])].sort((left, right) => left.localeCompare(right))
  }));
}

export interface KCorePeelingCertificate extends KCorePeelingStep {
  supportingPairs: KCoreSupportingPair[];
}

/** Maps peeling neighbor pairs back to all visible edge records that witness them. */
export function mapKCorePeelingStepsToRecords(
  peeling: KCorePeelingStep[],
  links: StructuralEdgeLike[],
  mode: "undirected" | DirectedKCoreMode = "undirected"
): KCorePeelingCertificate[] {
  const mappedPairs = mapKCoreSupportPairsToRecords(
    peeling.flatMap((step) => step.survivingNeighborIds.map((neighborId): [string, string] => [step.nodeId, neighborId])),
    links,
    mode
  );
  let pairOffset = 0;
  return peeling.map((step) => {
    const supportingPairs = mappedPairs.slice(pairOffset, pairOffset + step.survivingNeighborIds.length);
    pairOffset += step.survivingNeighborIds.length;
    return { ...step, supportingPairs };
  });
}

/** Parses an ASP k-core and its distinct internal-neighbor pairs. */
export function parseWitnessKCoreExplanations(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): KCoreWitnessExplanation[] {
  const seen = new Set<string>();
  const results: KCoreWitnessExplanation[] = [];
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    if (!Array.isArray(value)) continue;
    const stringAtoms = value
      .filter((atom): atom is string => typeof atom === "string");
    const nodeIds = stringAtoms
      .map((atom) => /^in\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseIndex[Number(match[1])])
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const key = [...nodeIds].sort().join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);

    const supportPairs = stringAtoms
      .map((atom) => /^core_support\((\d+),(\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .flatMap((match): Array<[string, string]> => {
        const source = reverseIndex[Number(match[1])];
        const target = reverseIndex[Number(match[2])];
        return source && target ? [[source, target]] : [];
      })
      .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
    const roundByNode = new Map<string, number>();
    for (const atom of stringAtoms) {
      const match = /^peeled_at\((\d+),(\d+)\)$/.exec(atom);
      if (!match) continue;
      const nodeId = reverseIndex[Number(match[1])];
      if (nodeId) roundByNode.set(nodeId, Number(match[2]));
    }
    const neighborsByNode = new Map<string, Set<string>>();
    for (const atom of stringAtoms) {
      const match = /^peel_support\((\d+),(\d+),(\d+)\)$/.exec(atom);
      if (!match) continue;
      const nodeId = reverseIndex[Number(match[1])];
      const neighborId = reverseIndex[Number(match[3])];
      if (!nodeId || !neighborId) continue;
      const neighbors = neighborsByNode.get(nodeId) ?? new Set<string>();
      neighbors.add(neighborId);
      neighborsByNode.set(nodeId, neighbors);
    }
    const peeling = [...roundByNode.entries()]
      .map(([nodeId, round]) => ({
        nodeId,
        round,
        survivingNeighborIds: [...(neighborsByNode.get(nodeId) ?? [])].sort((left, right) => left.localeCompare(right))
      }))
      .sort((left, right) => left.round - right.round || left.nodeId.localeCompare(right.nodeId));
    results.push({ nodeIds, supportPairs, peeling });
  }
  return results;
}

export interface DominatingSetWitnessExplanation {
  nodeIds: string[];
  coveragePairs: Array<[string, string]>;
}

export interface DominatingSetFeasibilityCertificate {
  targetNodeIds: string[];
  uncoverableTargetNodeIds: string[];
}

/** Independently checks that a why-not witness is exact for its candidate/target domains and edge projection. */
export function verifyDominatingSetFeasibilityCertificate(
  certificate: DominatingSetFeasibilityCertificate,
  candidateNodeIds: readonly string[],
  targetNodeIds: readonly string[],
  edges: readonly (readonly [string, string])[]
): string[] | null {
  const normalizeUniqueIds = (nodeIds: readonly string[]) =>
    [...new Set(nodeIds.map((nodeId) => normalizeGraphId(nodeId)))];
  const candidates = new Set(normalizeUniqueIds(candidateNodeIds));
  const targets = normalizeUniqueIds(targetNodeIds);
  const certificateTargets = new Set(normalizeUniqueIds(certificate.targetNodeIds));
  const candidateCanCover = new Set(candidates);
  for (const [left, right] of edges) {
    const normalizedLeft = normalizeGraphId(left);
    const normalizedRight = normalizeGraphId(right);
    if (candidates.has(normalizedLeft)) candidateCanCover.add(normalizedRight);
    if (candidates.has(normalizedRight)) candidateCanCover.add(normalizedLeft);
  }
  const expectedUncoverable = targets.filter((targetId) => !candidateCanCover.has(targetId));
  const certificateUncoverable = new Set(normalizeUniqueIds(certificate.uncoverableTargetNodeIds));
  if (targets.length === 0 || expectedUncoverable.length === 0 ||
    certificateTargets.size !== targets.length ||
    targets.some((nodeId) => !certificateTargets.has(nodeId)) ||
    certificateUncoverable.size !== expectedUncoverable.length ||
    expectedUncoverable.some((nodeId) => !certificateUncoverable.has(nodeId))) {
    return null;
  }
  return expectedUncoverable;
}

/** Parses the ASP why-not witness for targets unreachable from the candidate domain. */
export function parseDominatingSetFeasibilityCertificate(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): DominatingSetFeasibilityCertificate | null {
  const witness = (Array.isArray(witnesses) ? witnesses : []).find((item) =>
    item !== null && typeof item === "object" && Array.isArray((item as Record<string, unknown>).Value)
  ) as Record<string, unknown> | undefined;
  if (!witness || !Array.isArray(witness.Value)) return null;

  const targetNodeIds: string[] = [];
  const uncoverableTargetNodeIds: string[] = [];
  for (const atom of witness.Value) {
    if (typeof atom !== "string") continue;
    const targetMatch = /^target_node\((\d+)\)$/.exec(atom);
    const uncoverableMatch = /^uncoverable_target\((\d+)\)$/.exec(atom);
    const match = targetMatch ?? uncoverableMatch;
    if (!match) continue;
    const nodeId = reverseIndex[Number(match[1])];
    if (typeof nodeId !== "string" || nodeId === "") return null;
    (targetMatch ? targetNodeIds : uncoverableTargetNodeIds).push(nodeId);
  }

  const uniqueSorted = (nodeIds: string[]) => [...new Set(nodeIds)].sort((left, right) => left.localeCompare(right));
  const normalizedTargets = uniqueSorted(targetNodeIds);
  const normalizedUncoverable = uniqueSorted(uncoverableTargetNodeIds);
  const targetSet = new Set(normalizedTargets);
  if (normalizedUncoverable.some((nodeId) => !targetSet.has(nodeId))) return null;
  return {
    targetNodeIds: normalizedTargets,
    uncoverableTargetNodeIds: normalizedUncoverable
  };
}

/** Parses a minimum dominating-set witness and the selected node covering each target. */
export function parseWitnessDominatingSetExplanations(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): DominatingSetWitnessExplanation[] {
  const seen = new Set<string>();
  const results: DominatingSetWitnessExplanation[] = [];
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    if (!Array.isArray(value)) continue;
    const stringAtoms = value
      .filter((atom): atom is string => typeof atom === "string");
    const nodeIds = stringAtoms
      .map((atom) => /^in\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseIndex[Number(match[1])])
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const key = [...nodeIds].sort().join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);

    const coveragePairs = stringAtoms
      .map((atom) => /^dominated_by\((\d+),(\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .flatMap((match): Array<[string, string]> => {
        const target = reverseIndex[Number(match[1])];
        const covering = reverseIndex[Number(match[2])];
        return target && covering ? [[target, covering]] : [];
      })
      .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]));
    results.push({ nodeIds, coveragePairs });
  }
  return results;
}

export function parseWitnessRemovedNodeSets(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): string[][] {
  return parseWitnessAtomSets(witnesses, reverseIndex, "removed");
}

export function parseWitnessRemovedEdgeSets(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): string[][] {
  return parseWitnessAtomSets(witnesses, reverseIndex, "removed_edge");
}

export interface SeparatorWitnessExplanation {
  removedIds: string[];
  reachableNodeIds: string[];
}

/** Parses a node-separator witness together with the source-side reachability certificate. */
export function parseWitnessRemovedNodeSetExplanations(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): SeparatorWitnessExplanation[] {
  return parseWitnessSeparatorExplanations(witnesses, reverseIndex, reverseIndex, "removed");
}

/** Parses an edge-separator witness, mapping removed edge records and reachable nodes separately. */
export function parseWitnessRemovedEdgeSetExplanations(
  witnesses: unknown,
  reverseEdgeIndex: Record<number, string>,
  reverseNodeIndex: Record<number, string>
): SeparatorWitnessExplanation[] {
  return parseWitnessSeparatorExplanations(witnesses, reverseEdgeIndex, reverseNodeIndex, "removed_edge");
}

function parseWitnessSeparatorExplanations(
  witnesses: unknown,
  reverseRemovedIndex: Record<number, string>,
  reverseNodeIndex: Record<number, string>,
  predicate: "removed" | "removed_edge"
): SeparatorWitnessExplanation[] {
  const seen = new Set<string>();
  const results: SeparatorWitnessExplanation[] = [];
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    const atoms = (Array.isArray(value) ? value : [])
      .filter((atom): atom is string => typeof atom === "string");
    const removedIds = atoms
      .map((atom) => new RegExp(`^${predicate}\\((\\d+)\\)$`).exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseRemovedIndex[Number(match[1])])
      .filter((id): id is string => Boolean(id));
    const key = [...removedIds].sort().join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    const reachableNodeIds = atoms
      .map((atom) => /^reachable\((\d+)\)$/.exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseNodeIndex[Number(match[1])])
      .filter((id): id is string => Boolean(id))
      .sort((left, right) => left.localeCompare(right));
    results.push({ removedIds, reachableNodeIds });
  }
  return results;
}

function parseWitnessAtomSets(
  witnesses: unknown,
  reverseIndex: Record<number, string>,
  predicate: "in" | "removed" | "removed_edge"
): string[][] {
  const seen = new Set<string>();
  const nodeSets: string[][] = [];

  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    if (!Array.isArray(value)) continue;
    const members = value
      .filter((atom): atom is string => typeof atom === "string")
      .map((atom) => new RegExp(`^${predicate}\\((\\d+)\\)$`).exec(atom))
      .filter((match): match is RegExpExecArray => Boolean(match))
      .map((match) => reverseIndex[Number(match[1])])
      .filter((id): id is string => Boolean(id));
    const key = [...members].sort().join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    nodeSets.push(members);
  }

  return nodeSets;
}

/** Parses the canonical root/node atoms into a stable partition of node IDs. */
export function parseWitnessComponents(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): string[][] {
  return parseWitnessNodePartitions(witnesses, reverseIndex, "component");
}

/** Parses the SCC root/node atoms into a stable partition of source node IDs. */
export function parseWitnessStrongComponents(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): string[][] {
  return parseWitnessNodePartitions(witnesses, reverseIndex, "strong_component");
}

/** Parses the WCC root/node atoms into a stable partition of source node IDs. */
export function parseWitnessWeakComponents(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): string[][] {
  return parseWitnessNodePartitions(witnesses, reverseIndex, "weak_component");
}

function parseWitnessNodePartitions(
  witnesses: unknown,
  reverseIndex: Record<number, string>,
  predicate: "component" | "weak_component" | "strong_component"
): string[][] {
  const partitions = new Map<string, Set<string>>();
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    for (const atom of Array.isArray(value) ? value : []) {
      if (typeof atom !== "string") continue;
      const match = new RegExp(`^${predicate}\\((\\d+),(\\d+)\\)$`).exec(atom);
      if (!match) continue;
      const nodeId = reverseIndex[Number(match[1])];
      const rootId = reverseIndex[Number(match[2])];
      if (!nodeId || !rootId) continue;
      const component = partitions.get(rootId) ?? new Set<string>();
      component.add(nodeId);
      partitions.set(rootId, component);
    }
  }
  return [...partitions.values()]
    .map((component) => [...component].sort())
    .sort((left, right) => left[0]?.localeCompare(right[0] ?? "") ?? 0);
}

/** Result fields reconstructed from the ASP witness by parseWitnessModularityPartitions. */
export interface ParsedModularityPartition {
  communities: string[][];
  scaledScore: number;
  communityContributions?: ModularityCommunityContribution[];
}

/** Full application view after host-side attribute counts are attached. */
export interface ModularityPartition extends ParsedModularityPartition {
  attributeBoundCounts?: ModularityAttributeBoundCount[];
}

export interface ModularityAttributeBoundCount {
  communityId: string;
  attribute: string;
  value: string | number | boolean;
  count: number;
  minimum?: number;
  maximum?: number;
}

export interface ModularityCommunityContribution {
  communityId: string;
  internalEdgeCount: number;
  internalEdgeWeight: number;
  volume: number;
  scaledContribution: number;
  edgeIndexes: number[];
  supportingEdgeIds?: string[];
}

/** Maps 1-based ASP edge indexes to records in the same order used to build modularity facts. */
export function mapModularityContributionsToRecords(
  contributions: ModularityCommunityContribution[],
  links: StructuralEdgeLike[]
): ModularityCommunityContribution[] {
  return contributions.map((contribution) => ({
    ...contribution,
    supportingEdgeIds: contribution.edgeIndexes.flatMap((edgeIndex) => {
      const link = links[edgeIndex - 1];
      return link ? [getStructuralEdgeIdentity(link)] : [];
    })
  }));
}

/** Parses community assignments and the exact integer objective from clingo witnesses. */
export function parseWitnessModularityPartitions(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): ParsedModularityPartition[] {
  const seen = new Set<string>();
  const partitions: ParsedModularityPartition[] = [];

  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const witnessRecord = witness !== null && typeof witness === "object"
      ? witness as Record<string, unknown>
      : {};
    const value = witnessRecord.Value;
    const membersByCommunity = new Map<number, string[]>();
    const internalEdgesByCommunity = new Map<number, number[]>();
    const internalEdgeCountByCommunity = new Map<number, number>();
    const internalEdgeWeightByCommunity = new Map<number, number>();
    const volumeByCommunity = new Map<number, number>();
    const scoreByCommunity = new Map<number, number>();
    let scaledScore: number | undefined;
    for (const atom of Array.isArray(value) ? value : []) {
      if (typeof atom !== "string") continue;
      const communityMatch = /^community\((\d+),(\d+)\)$/.exec(atom);
      if (communityMatch) {
        const nodeId = reverseIndex[Number(communityMatch[1])];
        if (!nodeId) continue;
        const community = membersByCommunity.get(Number(communityMatch[2])) ?? [];
        community.push(nodeId);
        membersByCommunity.set(Number(communityMatch[2]), community);
        continue;
      }
      const scoreMatch = /^partition_score\((-?\d+)\)$/.exec(atom);
      if (scoreMatch) scaledScore = Number(scoreMatch[1]);
      const internalEdgeMatch = /^internal_edge\((\d+),(\d+)\)$/.exec(atom);
      if (internalEdgeMatch) {
        const communityIndex = Number(internalEdgeMatch[1]);
        const edgeIndexes = internalEdgesByCommunity.get(communityIndex) ?? [];
        edgeIndexes.push(Number(internalEdgeMatch[2]));
        internalEdgesByCommunity.set(communityIndex, edgeIndexes);
        continue;
      }
      const edgeCountMatch = /^community_edge_count\((\d+),(\d+)\)$/.exec(atom);
      if (edgeCountMatch) {
        internalEdgeCountByCommunity.set(Number(edgeCountMatch[1]), Number(edgeCountMatch[2]));
        continue;
      }
      const internalWeightMatch = /^community_internal_weight\((\d+),(\d+)\)$/.exec(atom);
      if (internalWeightMatch) {
        internalEdgeWeightByCommunity.set(Number(internalWeightMatch[1]), Number(internalWeightMatch[2]));
        continue;
      }
      const volumeMatch = /^community_volume\((\d+),(\d+)\)$/.exec(atom);
      if (volumeMatch) {
        volumeByCommunity.set(Number(volumeMatch[1]), Number(volumeMatch[2]));
        continue;
      }
      const communityScoreMatch = /^community_score\((\d+),(-?\d+)\)$/.exec(atom);
      if (communityScoreMatch) {
        scoreByCommunity.set(Number(communityScoreMatch[1]), Number(communityScoreMatch[2]));
      }
    }
    if (scaledScore === undefined && Array.isArray(witnessRecord.Costs)) {
      const objectiveCost = Number(witnessRecord.Costs[0]);
      if (Number.isSafeInteger(objectiveCost)) scaledScore = objectiveCost === 0 ? 0 : -objectiveCost;
    }
    if (scaledScore === undefined || membersByCommunity.size === 0) continue;
    const communities = [...membersByCommunity.values()]
      .map((community) => [...new Set(community)].sort())
      .sort((left, right) => left[0]?.localeCompare(right[0] ?? "") ?? 0);
    const key = communities.map((community) => community.join("\u0000")).join("\u0001");
    if (seen.has(key)) continue;
    seen.add(key);
    const communityContributions = [...membersByCommunity.keys()]
      .sort((left, right) => left - right)
      .flatMap((communityIndex): ModularityCommunityContribution[] => {
        const communityId = reverseIndex[communityIndex];
        if (!communityId) return [];
        return [{
          communityId,
          internalEdgeCount: internalEdgeCountByCommunity.get(communityIndex) ?? 0,
          internalEdgeWeight: internalEdgeWeightByCommunity.get(communityIndex) ??
            internalEdgeCountByCommunity.get(communityIndex) ?? 0,
          volume: volumeByCommunity.get(communityIndex) ?? 0,
          scaledContribution: scoreByCommunity.get(communityIndex) ?? 0,
          edgeIndexes: [...(internalEdgesByCommunity.get(communityIndex) ?? [])].sort((left, right) => left - right)
        }];
      });
    partitions.push({
      communities,
      scaledScore,
      ...(communityContributions.length > 0 ? { communityContributions } : {})
    });
  }
  return partitions;
}

export function selectMaximumModularityPartitions(partitions: ParsedModularityPartition[]): ParsedModularityPartition[] {
  if (partitions.length === 0) return [];
  const maximumScore = Math.max(...partitions.map((partition) => partition.scaledScore));
  return partitions.filter((partition) => partition.scaledScore === maximumScore);
}

/** Combines local optimum sets into the exact Cartesian product of global optima. */
export function combineModularityComponentPartitions(
  components: readonly ModularityComponentFacts[],
  partitionsByComponent: readonly (readonly ParsedModularityPartition[])[]
): ParsedModularityPartition[] {
  if (components.length === 0 || components.length !== partitionsByComponent.length ||
    partitionsByComponent.some((partitions) => partitions.length === 0)) {
    throw new TypeError("Ogni componente ASP deve avere almeno un insieme di ottimi completi");
  }

  let combined: ParsedModularityPartition[] = [{ communities: [], scaledScore: 0 }];
  for (let componentIndex = 0; componentIndex < components.length; componentIndex += 1) {
    const component = components[componentIndex];
    const localPartitions = partitionsByComponent[componentIndex];
    const next = new Map<string, ParsedModularityPartition>();
    for (const prefix of combined) {
      for (const local of localPartitions) {
        const scaledScore = prefix.scaledScore + local.scaledScore;
        if (!Number.isSafeInteger(scaledScore)) {
          throw new RangeError("La somma dei contributi di modularità non è un intero sicuro");
        }
        const communities = [
          ...prefix.communities.map((community) => [...community]),
          ...local.communities.map((community) => [...community])
        ].sort((left, right) => (left[0] ?? "").localeCompare(right[0] ?? ""));
        const partitionKey = communities.map((community) => community.join("\u0000")).join("\u0001");
        let communityContributions: ModularityCommunityContribution[] | undefined;
        if (componentIndex === 0) {
          communityContributions = local.communityContributions?.map((contribution) => ({
            ...contribution,
            edgeIndexes: contribution.edgeIndexes.map((localEdgeIndex) => {
              const globalEdgeIndex = component.globalEdgeIndexByLocalEdgeIndex[localEdgeIndex - 1];
              if (!Number.isSafeInteger(globalEdgeIndex) || globalEdgeIndex < 1) {
                throw new TypeError("Un contributo ASP non si mappa a un arco della proiezione globale");
              }
              return globalEdgeIndex;
            })
          }));
        } else if (prefix.communityContributions !== undefined || local.communityContributions !== undefined) {
          if (!prefix.communityContributions || !local.communityContributions) {
            throw new TypeError("I componenti devono esporre tutti o nessuno i contributi di modularità");
          }
          const remappedContributions = local.communityContributions.map((contribution) => ({
            ...contribution,
            edgeIndexes: contribution.edgeIndexes.map((localEdgeIndex) => {
              const globalEdgeIndex = component.globalEdgeIndexByLocalEdgeIndex[localEdgeIndex - 1];
              if (!Number.isSafeInteger(globalEdgeIndex) || globalEdgeIndex < 1) {
                throw new TypeError("Un contributo ASP non si mappa a un arco della proiezione globale");
              }
              return globalEdgeIndex;
            })
          }));
          communityContributions = [...prefix.communityContributions, ...remappedContributions];
        }
        next.set(partitionKey, {
          communities,
          scaledScore,
          ...(communityContributions ? { communityContributions } : {})
        });
      }
    }
    combined = [...next.values()];
  }
  return combined;
}

/**
 * Solves eligible disconnected positive-weight components independently.
 * Single-optimum requests may place zero-volume nodes in one neutral subproblem;
 * complete-enumeration requests fall back to the aggregate encoding because
 * those nodes can join positive communities without changing modularity.
 */
export async function solveModularityByPositiveWeightComponents(
  facts: ModularityFacts,
  reverseIndex: Record<number, string>,
  options: {
    enumerateAllOptima?: boolean;
    includeContributions?: boolean;
    solve: (program: string, solverOptions: string[]) => Promise<unknown>;
  }
): Promise<{
  partitions: ParsedModularityPartition[];
  result: { Result: "OPTIMUM FOUND"; Models: { More: "no" | "yes" }; Call: Array<{ Witnesses: unknown[] }> };
} | null> {
  const components = factorModularityFactsByPositiveWeightComponents(
    facts,
    true,
    options.enumerateAllOptima !== true
  );
  if (!components) return null;

  const partitionsByComponent: ParsedModularityPartition[][] = [];
  let combinedOptimumCount = 1n;
  const solverOptions = getStructuralSolverOptions("communities", options.enumerateAllOptima === true);
  for (const [componentIndex, component] of components.entries()) {
    const localProgram = buildMaximumModularityProgram({
      weighted: facts.weighted,
      includeContributions: options.includeContributions === true,
      ...(component.facts.pairwiseObjectiveOffset === undefined
        ? {}
        : { pairwiseObjectiveOffset: component.facts.pairwiseObjectiveOffset })
    });
    const result = await options.solve(
      [component.facts.facts.trim(), component.facts.pairwiseObjectiveFacts?.trim(), localProgram]
        .filter(Boolean)
        .join("\n\n") + "\n",
      solverOptions
    );
    const resultRecord = result !== null && typeof result === "object" && !Array.isArray(result)
      ? result as Record<string, unknown>
      : {};
    if (resultRecord.Result === "ERROR") {
      throw new Error(typeof resultRecord.Error === "string"
        ? resultRecord.Error
        : `Errore ASP nella componente ${componentIndex + 1}.`);
    }
    if (resultRecord.Result !== "OPTIMUM FOUND") {
      throw new Error(`L'ottimo ASP della componente ${componentIndex + 1} non è stato provato (${String(resultRecord.Result ?? "risposta vuota")}).`);
    }
    if (options.enumerateAllOptima === true && !hasCompleteOptimalModelEnumeration(result)) {
      throw new Error(`L'enumerazione degli ottimi della componente ${componentIndex + 1} è incompleta.`);
    }
    const localOptima = selectMaximumModularityPartitions(
      parseWitnessModularityPartitions(
        (resultRecord.Call as Array<{ Witnesses?: unknown }> | undefined)?.[0]?.Witnesses,
        reverseIndex
      )
    );
    if (localOptima.length === 0) {
      throw new Error(`La componente ${componentIndex + 1} non ha restituito un witness di modularità leggibile.`);
    }
    partitionsByComponent.push(localOptima);
    if (options.enumerateAllOptima === true) {
      combinedOptimumCount *= BigInt(localOptima.length);
      if (combinedOptimumCount > BigInt(MAX_FACTORED_MODULARITY_OPTIMA)) {
        throw new Error(
          `L'enumerazione esatta produrrebbe ${combinedOptimumCount.toString()} partizioni globali ` +
          `(limite di visualizzazione ${MAX_FACTORED_MODULARITY_OPTIMA}); disattiva l'enumerazione ` +
          `completa per calcolare e mostrare un solo ottimo per componente.`
        );
      }
    }
  }

  const partitions = combineModularityComponentPartitions(components, partitionsByComponent);
  if (partitions.length === 0) throw new Error("La ricomposizione non ha prodotto partizioni globali.");
  return {
    partitions,
    result: {
      Result: "OPTIMUM FOUND",
      Models: { More: options.enumerateAllOptima === true ? "no" : "yes" },
      Call: [{ Witnesses: [] }]
    }
  };
}

export interface MinimumHopPathWitness {
  nodeIds: string[];
  edgeIdsByStep: string[][];
  minimalityCertificate?: MinimumHopPathMinimalityCertificate;
}

export interface MinimumHopPathMinimalityCertificate {
  pathLength: number;
  reachableByDepth: Array<{ depth: number; nodeIds: string[] }>;
}

export interface BoundedPathNoRouteCertificate {
  maximumLength: number;
  reachableByDepth: Array<{ depth: number; nodeIds: string[] }>;
}

/** Maps the ASP closure proving that a target is unreachable within a hop bound. */
export function parseBoundedPathNoRouteCertificate(
  witnesses: unknown,
  reverseNodeIndex: Record<number, string>,
  maximumLength: number,
  goalNodeId: string
): BoundedPathNoRouteCertificate | null {
  let certifiedBound: number | undefined;
  const reachableByDepth = new Map<number, Set<string>>();
  const witness = Array.isArray(witnesses) ? witnesses[0] : undefined;
  const value = witness !== null && typeof witness === "object"
    ? (witness as Record<string, unknown>).Value
    : undefined;
  for (const atom of Array.isArray(value) ? value : []) {
    if (typeof atom !== "string") continue;
    const certificateMatch = /^path_no_route_certificate\((\d+)\)$/.exec(atom);
    if (certificateMatch) {
      certifiedBound = Number(certificateMatch[1]);
      continue;
    }
    const reachableMatch = /^path_no_route_reachable\((\d+),(\d+)\)$/.exec(atom);
    if (!reachableMatch) continue;
    const nodeId = reverseNodeIndex[Number(reachableMatch[1])];
    if (!nodeId) continue;
    const depth = Number(reachableMatch[2]);
    const nodeIds = reachableByDepth.get(depth) ?? new Set<string>();
    nodeIds.add(nodeId);
    reachableByDepth.set(depth, nodeIds);
  }
  if (certifiedBound !== maximumLength) return null;
  const reachableLayers = Array.from({ length: maximumLength + 1 }, (_, depth) => {
    const nodeIds = reachableByDepth.get(depth);
    return nodeIds && nodeIds.size > 0
      ? { depth, nodeIds: [...nodeIds].sort() }
      : undefined;
  });
  if (reachableLayers.some((layer) => layer === undefined) ||
    reachableLayers.some((layer) => layer?.nodeIds.includes(goalNodeId))) return null;
  return { maximumLength, reachableByDepth: reachableLayers as Array<{ depth: number; nodeIds: string[] }> };
}

/** Parses the route plus each visible edge record that certifies an adjacency step. */
export function parseWitnessMinimumHopPathWitness(
  witnesses: unknown,
  reverseNodeIndex: Record<number, string>,
  reverseEdgeIndex: Record<number, string> = {},
  requireEdgeWitness = false
): MinimumHopPathWitness | null {
  let best: MinimumHopPathWitness | null = null;
  let bestLength = Number.POSITIVE_INFINITY;
  for (const witness of Array.isArray(witnesses) ? witnesses : []) {
    const value = witness !== null && typeof witness === "object"
      ? (witness as Record<string, unknown>).Value
      : undefined;
    let pathLength: number | undefined;
    const pathNodes = new Map<number, string>();
    const edgeIdsByStep = new Map<number, string[]>();
    const reachableByDepth = new Map<number, Set<string>>();
    let certifiedPathLength: number | undefined;
    for (const atom of Array.isArray(value) ? value : []) {
      if (typeof atom !== "string") continue;
      const lengthMatch = /^path_length\((\d+)\)$/.exec(atom);
      if (lengthMatch) pathLength = Number(lengthMatch[1]);
      const nodeMatch = /^at\((\d+),(\d+)\)$/.exec(atom);
      if (nodeMatch) {
        const nodeId = reverseNodeIndex[Number(nodeMatch[2])];
        if (nodeId) pathNodes.set(Number(nodeMatch[1]), nodeId);
        continue;
      }
      const edgeMatch = /^path_edge_support\((\d+),(\d+)\)$/.exec(atom);
      if (edgeMatch) {
        const edgeId = reverseEdgeIndex[Number(edgeMatch[2])];
        if (!edgeId) continue;
        const step = Number(edgeMatch[1]);
        const edgeIds = edgeIdsByStep.get(step) ?? [];
        edgeIds.push(edgeId);
        edgeIdsByStep.set(step, edgeIds);
        continue;
      }
      const certificateMatch = /^path_minimality_certificate\((\d+)\)$/.exec(atom);
      if (certificateMatch) {
        certifiedPathLength = Number(certificateMatch[1]);
        continue;
      }
      const reachableMatch = /^path_shorter_reachable\((\d+),(\d+)\)$/.exec(atom);
      if (reachableMatch) {
        const nodeId = reverseNodeIndex[Number(reachableMatch[1])];
        if (!nodeId) continue;
        const depth = Number(reachableMatch[2]);
        const nodeIds = reachableByDepth.get(depth) ?? new Set<string>();
        nodeIds.add(nodeId);
        reachableByDepth.set(depth, nodeIds);
      }
    }
    if (pathLength === undefined || pathLength >= bestLength) continue;
    const nodeIds = Array.from({ length: pathLength + 1 }, (_, position) => pathNodes.get(position));
    if (nodeIds.some((nodeId) => nodeId === undefined)) continue;
    const supportingEdges = Array.from({ length: pathLength }, (_, step) =>
      [...new Set(edgeIdsByStep.get(step) ?? [])]
    );
    if (requireEdgeWitness && supportingEdges.some((edgeIds) => edgeIds.length === 0)) continue;
    bestLength = pathLength;
    const completeCertificate = certifiedPathLength === pathLength &&
      Array.from({ length: pathLength }, (_, depth) => {
        const reachable = reachableByDepth.get(depth);
        return reachable !== undefined && reachable.size > 0;
      }).every(Boolean);
    const minimalityCertificate = completeCertificate
      ? {
        pathLength,
        reachableByDepth: Array.from({ length: pathLength }, (_, depth) => ({
          depth,
          nodeIds: [...(reachableByDepth.get(depth) ?? [])].sort()
        }))
      }
      : undefined;
    best = {
      nodeIds: nodeIds as string[],
      edgeIdsByStep: supportingEdges,
      ...(minimalityCertificate ? { minimalityCertificate } : {})
    };
  }
  return best;
}

/** Backward-compatible node-only view of the shortest path witness. */
export function parseWitnessMinimumHopPath(
  witnesses: unknown,
  reverseIndex: Record<number, string>
): string[] | null {
  return parseWitnessMinimumHopPathWitness(witnesses, reverseIndex)?.nodeIds ?? null;
}

/** Drops intermediate optN witnesses and returns every distinct largest set. */
export function selectMaximumNodeSets(nodeSets: string[][]): string[][] {
  if (nodeSets.length === 0) return [];
  const maximumSize = Math.max(...nodeSets.map((nodeSet) => nodeSet.length));
  const seen = new Set<string>();
  return nodeSets.filter((nodeSet) => {
    if (nodeSet.length !== maximumSize) return false;
    const key = [...nodeSet].sort().join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Drops intermediate optN witnesses and returns every distinct smallest set. */
export function selectMinimumNodeSets(nodeSets: string[][]): string[][] {
  if (nodeSets.length === 0) return [];
  const minimumSize = Math.min(...nodeSets.map((nodeSet) => nodeSet.length));
  const seen = new Set<string>();
  return nodeSets.filter((nodeSet) => {
    if (nodeSet.length !== minimumSize) return false;
    const key = [...nodeSet].sort().join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function selectMinimumEdgeSets(edgeSets: string[][]): string[][] {
  return selectMinimumNodeSets(edgeSets);
}

/** Filters solver witnesses by the sum of their explicitly mapped edge-removal costs. */
export function selectMinimumCostEdgeSets(
  edgeSets: string[][],
  removalCostByEdgeId: Record<string, number>
): string[][] {
  return selectMinimumCostSets(edgeSets, removalCostByEdgeId);
}

/** Filters node-separator witnesses by explicitly mapped node-removal costs. */
export function selectMinimumCostNodeSets(
  nodeSets: string[][],
  removalCostByNodeId: Record<string, number>
): string[][] {
  return selectMinimumCostSets(nodeSets, removalCostByNodeId);
}

function selectMinimumCostSets(
  sets: string[][],
  removalCosts: Record<string, number>
): string[][] {
  let minimumCost = Number.POSITIVE_INFINITY;
  const bestByKey = new Map<string, string[]>();
  for (const set of sets) {
    const uniqueMembers = [...new Set(set)];
    const costs = uniqueMembers.map((member) => removalCosts[member]);
    if (costs.some((cost) => !Number.isSafeInteger(cost) || cost <= 0)) continue;
    const cost = costs.reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(cost)) continue;
    const key = [...uniqueMembers].sort().join("\u0000");
    if (cost < minimumCost) {
      minimumCost = cost;
      bestByKey.clear();
    }
    if (cost === minimumCost) bestByKey.set(key, uniqueMembers);
  }
  return [...bestByKey.values()];
}
