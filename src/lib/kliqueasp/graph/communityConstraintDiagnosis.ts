import { serializeCsv } from "../csvExport.ts";
import {
  parseWitnessModularityPartitions,
  type ModularityCommunityOptions,
  type ModularityPartition
} from "./structuralTasks.ts";

export type CommunityConstraintKind =
  | "minimumCommunityCount"
  | "maximumCommunityCount"
  | "mustLink"
  | "cannotLink"
  | "attributeBound";

export type CommunityConstraintDiagnosisCosts = Partial<Record<CommunityConstraintKind, number>>;

export type CommunityConstraintRelaxationSpec =
  | { id: number; kind: "minimumCommunityCount"; count: number; relaxationCost: number; nodeIds?: string[] }
  | { id: number; kind: "maximumCommunityCount"; count: number; relaxationCost: number; nodeIds?: string[] }
  | { id: number; kind: "mustLink" | "cannotLink"; pair: [number, number]; relaxationCost: number; nodeIds?: [string, string] }
  | {
      id: number;
      kind: "attributeBound";
      relaxationCost: number;
      boundIndex: number;
      nodeIndexes: number[];
      attributeName?: string;
      attributeValue?: string | number | boolean;
      minPerCommunity?: number;
      maxPerCommunity?: number;
      nodeIds?: string[];
    };

export interface BuiltCommunityConstraintRelaxationProgram {
  program: string;
  constraints: CommunityConstraintRelaxationSpec[];
}

export interface CommunityConstraintDiagnosis {
  relaxationCost: number;
  relaxedConstraintCount: number;
  relaxedConstraints: CommunityConstraintRelaxationSpec[];
  partition: ModularityPartition;
}

export interface CommunityConstraintDiagnosisCsvOptions {
  diagnoses: readonly CommunityConstraintDiagnosis[];
  sourceIdByNodeId: Record<string, string>;
  nodeLabels: Record<string, string>;
  selectedGroup: string;
}

type NewCommunityConstraintRelaxationSpec = CommunityConstraintRelaxationSpec extends infer Constraint
  ? Constraint extends CommunityConstraintRelaxationSpec
    ? Omit<Constraint, "id">
    : never
  : never;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedPairs(
  pairs: Array<[number, number]> | undefined,
  name: string
): Array<[number, number]> {
  const unique = new Map<string, [number, number]>();
  for (const [index, pair] of (pairs ?? []).entries()) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((node) => !Number.isSafeInteger(node) || node < 1)) {
      throw new RangeError(`${name} ${index + 1} deve contenere due indici ASP positivi`);
    }
    if (pair[0] === pair[1]) throw new RangeError(`${name} ${index + 1} deve riferirsi a due nodi distinti`);
    const normalized = pair[0] < pair[1] ? [pair[0], pair[1]] as [number, number] : [pair[1], pair[0]] as [number, number];
    unique.set(`${normalized[0]}:${normalized[1]}`, normalized);
  }
  return [...unique.values()].sort(([leftA, leftB], [rightA, rightB]) => leftA - rightA || leftB - rightB);
}

/**
 * Encodes a minimum-cardinality diagnosis over declared community constraints.
 * Graph facts stay fixed; each configured constraint is either active or
 * explicitly suspended in the returned answer set. No graph fact is edited.
 */
export function buildCommunityConstraintRelaxationProgram(
  options: Pick<ModularityCommunityOptions, "minCount" | "maxCount" | "mustLinkPairs" | "cannotLinkPairs" | "attributeBounds"> & {
    diagnosisCosts?: CommunityConstraintDiagnosisCosts;
  } = {}
): BuiltCommunityConstraintRelaxationProgram {
  const { minCount, maxCount, attributeBounds = [] } = options;
  const diagnosisCosts = options.diagnosisCosts ?? {};
  for (const [kind, cost] of Object.entries(diagnosisCosts)) {
    if (!["minimumCommunityCount", "maximumCommunityCount", "mustLink", "cannotLink", "attributeBound"].includes(kind) ||
      !Number.isSafeInteger(cost) || Number(cost) <= 0) {
      throw new RangeError(`diagnosisCosts.${kind} deve essere un intero positivo sicuro per una categoria di vincolo supportata`);
    }
  }
  const costFor = (kind: CommunityConstraintKind) => diagnosisCosts[kind] ?? 1;
  for (const [name, value] of [["minCount", minCount], ["maxCount", maxCount]] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1)) {
      throw new RangeError(`${name} deve essere un intero positivo`);
    }
  }
  if (minCount !== undefined && maxCount !== undefined && minCount > maxCount) {
    throw new RangeError("minCount non può essere maggiore di maxCount");
  }
  if (!Array.isArray(attributeBounds)) throw new TypeError("attributeBounds deve essere un array");
  for (const [index, bound] of attributeBounds.entries()) {
    if (bound === null || typeof bound !== "object" || !Array.isArray(bound.nodeIndexes) ||
      bound.nodeIndexes.some((nodeIndex) => !Number.isSafeInteger(nodeIndex) || nodeIndex < 1)) {
      throw new RangeError(`attributeBounds ${index + 1} deve contenere indici ASP positivi`);
    }
    const minimum = bound.minPerCommunity ?? 0;
    const maximum = bound.maxPerCommunity ?? 0;
    if (!Number.isSafeInteger(minimum) || minimum < 0 || !Number.isSafeInteger(maximum) || maximum < 0 ||
      (minimum === 0 && maximum === 0) || (maximum > 0 && minimum > maximum)) {
      throw new RangeError(`attributeBounds ${index + 1} contiene limiti non validi`);
    }
  }

  const constraints: CommunityConstraintRelaxationSpec[] = [];
  const facts: string[] = [];
  let nextId = 1;
  const add = (constraint: NewCommunityConstraintRelaxationSpec): number => {
    const id = nextId++;
    constraints.push({ ...constraint, id } as CommunityConstraintRelaxationSpec);
    facts.push(`community_constraint(${id}).`);
    const relaxationCost = (constraint as { relaxationCost?: number }).relaxationCost ?? 1;
    facts.push(`community_constraint_relaxation_cost(${id},${relaxationCost}).`);
    return id;
  };

  if (minCount !== undefined) {
    const id = add({ kind: "minimumCommunityCount", count: minCount, relaxationCost: costFor("minimumCommunityCount") });
    facts.push(`community_constraint_min_count(${id},${minCount}).`);
  }
  if (maxCount !== undefined) {
    const id = add({ kind: "maximumCommunityCount", count: maxCount, relaxationCost: costFor("maximumCommunityCount") });
    facts.push(`community_constraint_max_count(${id},${maxCount}).`);
  }
  for (const pair of normalizedPairs(options.mustLinkPairs, "must_link")) {
    const id = add({ kind: "mustLink", pair, relaxationCost: costFor("mustLink") });
    facts.push(`community_constraint_must_link(${id},${pair[0]},${pair[1]}).`);
  }
  for (const pair of normalizedPairs(options.cannotLinkPairs, "cannot_link")) {
    const id = add({ kind: "cannotLink", pair, relaxationCost: costFor("cannotLink") });
    facts.push(`community_constraint_cannot_link(${id},${pair[0]},${pair[1]}).`);
  }
  for (const [index, bound] of attributeBounds.entries()) {
    const boundIndex = index + 1;
    const nodeIndexes = [...new Set(bound.nodeIndexes)].sort((left, right) => left - right);
    const id = add({
      kind: "attributeBound",
      relaxationCost: costFor("attributeBound"),
      boundIndex,
      nodeIndexes,
      ...(bound.attributeName !== undefined ? { attributeName: bound.attributeName } : {}),
      ...(bound.attributeValue !== undefined ? { attributeValue: bound.attributeValue } : {}),
      ...(bound.minPerCommunity !== undefined ? { minPerCommunity: bound.minPerCommunity } : {}),
      ...(bound.maxPerCommunity !== undefined ? { maxPerCommunity: bound.maxPerCommunity } : {})
    });
    const minimum = bound.minPerCommunity ?? 0;
    const maximum = bound.maxPerCommunity ?? 0;
    facts.push(`community_constraint_attribute_bound(${id},${boundIndex},${minimum},${maximum}).`);
    for (const nodeIndex of nodeIndexes) facts.push(`community_attribute_member(${boundIndex},${nodeIndex}).`);
    if (nodeIndexes.length === 0) facts.push(`community_attribute_member(${boundIndex},0).`);
  }

  const maximumRelaxationCost = constraints.reduce((sum, constraint) => sum + constraint.relaxationCost, 0);
  if (!Number.isSafeInteger(maximumRelaxationCost)) {
    throw new RangeError("La somma dei costi di diagnosi supera il dominio intero sicuro.");
  }

  const program = [
    ...facts,
    "community_constraint_min_count(0,0) :- community_constraint(0).",
    "community_constraint_max_count(0,0) :- community_constraint(0).",
    "community_constraint_attribute_bound(0,0,0,0) :- community_constraint(0).",
    "community_attribute_member(0,0) :- community_constraint(0).",
    "{ relax_constraint(ID) } :- community_constraint(ID).",
    "minimum_community_count(M) :- community_constraint_min_count(ID,M), not relax_constraint(ID).",
    "maximum_community_count(M) :- community_constraint_max_count(ID,M), not relax_constraint(ID).",
    "must_link(A,B) :- community_constraint_must_link(ID,A,B), not relax_constraint(ID).",
    "cannot_link(A,B) :- community_constraint_cannot_link(ID,A,B), not relax_constraint(ID).",
    "community_attribute_min(B,Min) :- community_constraint_attribute_bound(ID,B,Min,Max), Min > 0, not relax_constraint(ID).",
    "community_attribute_max(B,Max) :- community_constraint_attribute_bound(ID,B,Min,Max), Max > 0, not relax_constraint(ID).",
    "1 { community(V,C) : modularity_candidate(C), C <= V } 1 :- modularity_candidate(V).",
    "community_used(C) :- community(_,C).",
    ":- community_used(C), not community(C,C).",
    ":- must_link(A,B), community(A,C), not community(B,C).",
    ":- cannot_link(A,B), community(A,C), community(B,C).",
    ":- community_used(C), community_attribute_min(B,Min), #count { V : community(V,C), community_attribute_member(B,V) } < Min.",
    ":- community_used(C), community_attribute_max(B,Max), #count { V : community(V,C), community_attribute_member(B,V) } > Max.",
    ":- minimum_community_count(M), #count { C : community_used(C) } < M.",
    ":- maximum_community_count(M), #count { C : community_used(C) } > M.",
    "#minimize { Cost@1,ID : relax_constraint(ID), community_constraint_relaxation_cost(ID,Cost) }.",
    "relaxation_cost(Cost) :- Cost = #sum { Weight,ID : relax_constraint(ID), community_constraint_relaxation_cost(ID,Weight) }.",
    "partition_score(0).",
    "#show community/2.",
    "#show relax_constraint/1.",
    "#show relaxation_cost/1.",
    "#show partition_score/1."
  ].join("\n\n");

  return { program, constraints };
}

function indexToNodeMap(reverseIndex: Record<number, string>): Map<number, string> {
  const result = new Map<number, string>();
  const seenNodeIds = new Set<string>();
  for (const [rawIndex, nodeId] of Object.entries(reverseIndex)) {
    const index = Number(rawIndex);
    if (!Number.isSafeInteger(index) || index < 1 || typeof nodeId !== "string" || nodeId.length === 0 || seenNodeIds.has(nodeId)) {
      throw new TypeError("Il dominio inverso dei nodi ASP non è valido o contiene ID duplicati.");
    }
    result.set(index, nodeId);
    seenNodeIds.add(nodeId);
  }
  if (result.size === 0) throw new RangeError("La diagnosi richiede almeno un nodo candidato.");
  return result;
}

function parseDiagnosisWitness(
  witness: unknown,
  indexToNode: Map<number, string>,
  specsById: Map<number, CommunityConstraintRelaxationSpec>
): { cost: number; relaxedIds: number[]; partition: ModularityPartition; assignments: Map<number, number> } {
  if (witness === null || typeof witness !== "object") throw new TypeError("Witness di diagnosi non valido.");
  const record = witness as Record<string, unknown>;
  if (!Array.isArray(record.Value) || !Array.isArray(record.Costs) || record.Costs.length !== 1) {
    throw new TypeError("Il witness non contiene atomi e costo di rilassamento verificabili.");
  }
  const cost = Number(record.Costs[0]);
  if (!Number.isSafeInteger(cost) || cost < 0) throw new TypeError("Il costo di rilassamento ASP non è un intero valido.");
  const relaxedIds: number[] = [];
  const assignments = new Map<number, number>();
  let relaxationCostAtom: number | undefined;
  let hasPartitionScore = false;
  for (const atom of record.Value) {
    if (typeof atom !== "string") throw new TypeError("Il witness di diagnosi contiene un atomo non testuale.");
    if (atom.startsWith("relax_constraint(")) {
      const match = /^relax_constraint\((\d+)\)$/.exec(atom);
      if (!match) throw new TypeError("Il witness contiene un atomo relax_constraint malformato.");
      const id = Number(match[1]);
      if (!specsById.has(id) || relaxedIds.includes(id)) throw new TypeError("Il witness rilassa un vincolo sconosciuto o duplicato.");
      relaxedIds.push(id);
      continue;
    }
    if (atom.startsWith("relaxation_cost(")) {
      const match = /^relaxation_cost\((\d+)\)$/.exec(atom);
      if (!match || relaxationCostAtom !== undefined) throw new TypeError("Il witness non specifica un costo di rilassamento univoco.");
      relaxationCostAtom = Number(match[1]);
      continue;
    }
    if (atom === "partition_score(0)") {
      if (hasPartitionScore) throw new TypeError("Il witness ripete il punteggio nullo di partizione.");
      hasPartitionScore = true;
      continue;
    }
    if (atom.startsWith("community(")) {
      const match = /^community\((\d+),(\d+)\)$/.exec(atom);
      if (!match) throw new TypeError("Il witness contiene un atomo community malformato.");
      const nodeIndex = Number(match[1]);
      const communityIndex = Number(match[2]);
      if (!indexToNode.has(nodeIndex) || !Number.isSafeInteger(communityIndex) || communityIndex < 1 || assignments.has(nodeIndex)) {
        throw new TypeError("Il witness assegna un nodo ASP sconosciuto o più di una volta.");
      }
      assignments.set(nodeIndex, communityIndex);
    }
  }
  if (!hasPartitionScore || relaxationCostAtom === undefined || relaxationCostAtom !== cost) {
    throw new TypeError("Il costo dichiarato non coincide con i vincoli rilassati nel witness.");
  }
  const independentlySummedCost = relaxedIds.reduce((sum, id) => {
    const constraint = specsById.get(id);
    if (!constraint || !Number.isSafeInteger(constraint.relaxationCost) || constraint.relaxationCost <= 0) {
      throw new TypeError("Il costo configurato di un vincolo rilassabile non è valido.");
    }
    return sum + constraint.relaxationCost;
  }, 0);
  if (!Number.isSafeInteger(independentlySummedCost) || independentlySummedCost !== cost) {
    throw new TypeError("Il costo ASP non coincide con la somma indipendente dei pesi dei vincoli rilassati.");
  }
  if (assignments.size !== indexToNode.size || [...indexToNode.keys()].some((index) => !assignments.has(index))) {
    throw new TypeError("La partizione del witness non copre esattamente il dominio candidato.");
  }

  const membersByCommunity = new Map<number, string[]>();
  const memberIndexesByCommunity = new Map<number, number[]>();
  for (const [nodeIndex, communityIndex] of assignments) {
    const members = membersByCommunity.get(communityIndex) ?? [];
    members.push(indexToNode.get(nodeIndex)!);
    membersByCommunity.set(communityIndex, members);
    const memberIndexes = memberIndexesByCommunity.get(communityIndex) ?? [];
    memberIndexes.push(nodeIndex);
    memberIndexesByCommunity.set(communityIndex, memberIndexes);
  }
  for (const [communityIndex, memberIndexes] of memberIndexesByCommunity) {
    if (Math.min(...memberIndexes) !== communityIndex) {
      throw new TypeError("Il witness non usa il rappresentante canonico minimo per una comunità.");
    }
  }
  const communities = [...membersByCommunity.values()]
    .map((members) => members.sort(compareIds))
    .sort((left, right) => compareIds(left[0] ?? "", right[0] ?? ""));

  return {
    cost,
    relaxedIds: relaxedIds.sort((left, right) => left - right),
    partition: { communities, scaledScore: 0 },
    assignments
  };
}

function validateActiveConstraints(
  partition: ModularityPartition,
  assignments: Map<number, number>,
  constraints: CommunityConstraintRelaxationSpec[],
  relaxedIds: Set<number>
): void {
  const communityCount = partition.communities.length;
  for (const constraint of constraints) {
    if (relaxedIds.has(constraint.id)) continue;
    if (constraint.kind === "minimumCommunityCount" && communityCount < constraint.count) {
      throw new TypeError("Il witness viola un vincolo minCount dichiarato attivo.");
    }
    if (constraint.kind === "maximumCommunityCount" && communityCount > constraint.count) {
      throw new TypeError("Il witness viola un vincolo maxCount dichiarato attivo.");
    }
    if (constraint.kind === "mustLink" || constraint.kind === "cannotLink") {
      const [left, right] = constraint.pair;
      const together = assignments.get(left) === assignments.get(right);
      if ((constraint.kind === "mustLink" && !together) || (constraint.kind === "cannotLink" && together)) {
        throw new TypeError("Il witness viola una coppia di vincoli dichiarata attiva.");
      }
    }
    if (constraint.kind === "attributeBound") {
      const members = new Set(constraint.nodeIndexes);
      for (const communityIndex of new Set(assignments.values())) {
        const count = [...assignments].filter(([nodeIndex, assignedCommunity]) =>
          assignedCommunity === communityIndex && members.has(nodeIndex)
        ).length;
        if (constraint.minPerCommunity !== undefined && count < constraint.minPerCommunity) {
          throw new TypeError("Il witness viola un limite minimo di composizione dichiarato attivo.");
        }
        if (constraint.maxPerCommunity !== undefined && count > constraint.maxPerCommunity) {
          throw new TypeError("Il witness viola un limite massimo di composizione dichiarato attivo.");
        }
      }
    }
  }
}

/** Accepts only a proven minimum relaxation and independently checks each witness. */
export function parseCommunityConstraintDiagnosisResult(
  result: unknown,
  reverseIndex: Record<number, string>,
  constraints: CommunityConstraintRelaxationSpec[],
  options: { requireAllOptima?: boolean } = {}
): CommunityConstraintDiagnosis[] {
  if (result === null || typeof result !== "object" || (result as Record<string, unknown>).Result !== "OPTIMUM FOUND") {
    throw new RangeError("La diagnosi dei vincoli non ha provato il minimo rilassamento.");
  }
  const call = (result as Record<string, unknown>).Call;
  const modelSummary = (result as Record<string, unknown>).Models;
  const modelCosts = modelSummary !== null && typeof modelSummary === "object"
    ? (modelSummary as Record<string, unknown>).Costs
    : undefined;
  if (!Array.isArray(modelCosts) || modelCosts.length !== 1) {
    throw new TypeError("La risposta del solver non riporta il costo ottimo verificabile.");
  }
  const provenMinimumCost = Number(modelCosts[0]);
  if (!Number.isSafeInteger(provenMinimumCost) || provenMinimumCost < 0) {
    throw new TypeError("Il costo minimo provato dal solver non è un intero valido.");
  }
  if (options.requireAllOptima === true && (modelSummary as Record<string, unknown>).More !== "no") {
    throw new RangeError("L'enumerazione delle diagnosi minime non è completa.");
  }
  const witnesses = Array.isArray(call) && call[0] !== null && typeof call[0] === "object"
    ? (call[0] as Record<string, unknown>).Witnesses
    : undefined;
  if (!Array.isArray(witnesses) || witnesses.length === 0) return [];

  const specsById = new Map<number, CommunityConstraintRelaxationSpec>();
  for (const constraint of constraints) {
    if (!Number.isSafeInteger(constraint.id) || constraint.id < 1 || specsById.has(constraint.id)) {
      throw new TypeError("L'elenco dei vincoli rilassabili contiene ID non validi o duplicati.");
    }
    if (!Number.isSafeInteger(constraint.relaxationCost) || constraint.relaxationCost <= 0) {
      throw new TypeError("L'elenco dei vincoli rilassabili contiene costi non positivi o non sicuri.");
    }
    if ((constraint.kind === "mustLink" || constraint.kind === "cannotLink") &&
      constraint.pair.some((nodeIndex) => !Number.isSafeInteger(nodeIndex) || nodeIndex < 1)) {
      throw new TypeError("Una coppia di vincoli usa indici ASP non validi.");
    }
    specsById.set(constraint.id, constraint);
  }
  const indexToNode = indexToNodeMap(reverseIndex);
  for (const constraint of constraints) {
    const requiredIndexes = constraint.kind === "mustLink" || constraint.kind === "cannotLink"
      ? constraint.pair
      : constraint.kind === "attributeBound"
        ? constraint.nodeIndexes
        : [];
    if (requiredIndexes.some((nodeIndex) => !indexToNode.has(nodeIndex))) {
      throw new TypeError("Un vincolo di comunità si riferisce a un nodo fuori dal dominio candidato.");
    }
  }
  const parsed = witnesses.map((witness) => parseDiagnosisWitness(witness, indexToNode, specsById));
  const minimumCost = Math.min(...parsed.map((item) => item.cost));
  if (minimumCost !== provenMinimumCost) throw new TypeError("Il witness non coincide con il costo minimo provato dal solver.");
  const output: CommunityConstraintDiagnosis[] = [];
  const seenDiagnoses = new Set<string>();
  for (const item of parsed) {
    if (item.cost !== minimumCost) continue;
    const relaxedSet = new Set(item.relaxedIds);
    validateActiveConstraints(item.partition, item.assignments, constraints, relaxedSet);
    const key = JSON.stringify(item.relaxedIds);
    if (seenDiagnoses.has(key)) continue;
    seenDiagnoses.add(key);
    output.push({
      relaxationCost: item.cost,
      relaxedConstraintCount: item.relaxedIds.length,
      relaxedConstraints: item.relaxedIds.map((id) => {
        const spec = specsById.get(id)!;
        if (spec.kind === "mustLink" || spec.kind === "cannotLink") {
          return { ...spec, nodeIds: spec.pair.map((index) => indexToNode.get(index)!) as [string, string] };
        }
        if (spec.kind === "attributeBound") {
          return { ...spec, nodeIds: spec.nodeIndexes.map((index) => indexToNode.get(index)!).filter(Boolean) };
        }
        return spec;
      }),
      partition: item.partition
    });
  }
  return output;
}

/** Exports a diagnosis as a non-applied configuration proposal with a witness partition. */
export function buildCommunityConstraintDiagnosisCsv({
  diagnoses,
  sourceIdByNodeId,
  nodeLabels,
  selectedGroup
}: CommunityConstraintDiagnosisCsvOptions): string {
  const rows: unknown[][] = [[
    "diagnosis",
    "minimum_constraints_to_suspend",
    "suspended_constraints_json",
    "feasible_partition_json",
    "selected_group",
    "structured_witness_json",
    "minimum_relaxation_cost"
  ]];
  diagnoses.forEach((diagnosis, index) => {
    const suspendedConstraints = diagnosis.relaxedConstraints.map((constraint) => ({
      id: constraint.id,
      kind: constraint.kind,
      relaxation_cost: constraint.relaxationCost,
      ...(constraint.kind === "minimumCommunityCount" || constraint.kind === "maximumCommunityCount"
        ? { count: constraint.count }
        : {}),
      ...(constraint.kind === "mustLink" || constraint.kind === "cannotLink"
        ? { node_ids: (constraint.nodeIds ?? []).map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId) }
        : {}),
      ...(constraint.kind === "attributeBound" ? {
        attribute: constraint.attributeName,
        value: constraint.attributeValue,
        min_per_community: constraint.minPerCommunity,
        max_per_community: constraint.maxPerCommunity,
        matching_node_ids: (constraint.nodeIds ?? []).map((nodeId) => sourceIdByNodeId[nodeId] ?? nodeId)
      } : {})
    }));
    const feasiblePartition = diagnosis.partition.communities.map((community) => community.map((nodeId) => ({
      id: sourceIdByNodeId[nodeId] ?? nodeId,
      label: nodeLabels[nodeId] ?? nodeId
    })));
    rows.push([
      index + 1,
      diagnosis.relaxedConstraintCount,
      JSON.stringify(suspendedConstraints),
      JSON.stringify(feasiblePartition),
      selectedGroup,
      JSON.stringify({
        relaxation_cost: diagnosis.relaxationCost,
        relaxed_constraint_count: diagnosis.relaxedConstraintCount,
        relaxed_constraint_ids: diagnosis.relaxedConstraints.map((constraint) => constraint.id),
        suspended_constraints: suspendedConstraints,
        feasible_partition: feasiblePartition
      }),
      diagnosis.relaxationCost
    ]);
  });
  return serializeCsv(rows);
}
