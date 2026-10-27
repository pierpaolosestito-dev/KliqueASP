export interface CliqueMembershipSupportEdge {
  sourceNodeId: string;
  targetNodeId: string;
  edgeId?: string;
  edgeIdGenerated?: boolean;
}

export interface CliqueMaximumMembershipDiagnosis {
  targetNodeId: string;
  globalMaximumSize: number;
  maximumContainingSize: number;
  sizeGap: number;
  outcome: "excluded-from-maximum" | "included-in-maximum";
  witnessNodeIds: string[];
  supportingEdges: CliqueMembershipSupportEdge[];
}

export interface CliqueMembershipEdgeRecord extends CliqueMembershipSupportEdge {}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function unorderedPairKey(source: string, target: string): string {
  return source < target
    ? `${source}\u0000${target}`
    : `${target}\u0000${source}`;
}

/** Forces one ASP node into the maximum-clique query used for a membership diagnosis. */
export function buildCliqueRequiredNodeConstraint(nodeIndex: number): string {
  if (!Number.isSafeInteger(nodeIndex) || nodeIndex < 1) {
    throw new Error("L'indice ASP del nodo richiesto deve essere un intero positivo.");
  }
  return `:- not in(${nodeIndex}).`;
}

/**
 * Validates the optimum returned by the target-constrained ASP query against the
 * candidate domain and the source graph. OPTIMUM FOUND is required: a feasible
 * clique alone cannot justify a why-not conclusion.
 */
export function parseCliqueMaximumMembershipDiagnosis(
  resultInput: unknown,
  options: {
    reverseIndex: Record<number, string>;
    candidateNodeIds: readonly string[];
    edgeRecords: readonly CliqueMembershipEdgeRecord[];
    targetNodeId: string;
    globalMaximumSize: number;
  }
): CliqueMaximumMembershipDiagnosis {
  const result = record(resultInput);
  if (result.Result !== "OPTIMUM FOUND") {
    throw new Error("Clingo non ha provato l'ottimo della clique contenente il nodo selezionato.");
  }
  if (!Number.isSafeInteger(options.globalMaximumSize) || options.globalMaximumSize < 1) {
    throw new Error("La cardinalità massima globale non è valida.");
  }

  const candidateNodeIds = new Set(options.candidateNodeIds);
  if (!options.targetNodeId || !candidateNodeIds.has(options.targetNodeId)) {
    throw new Error("Il nodo selezionato non appartiene al dominio della query.");
  }

  const calls = Array.isArray(result.Call) ? result.Call : [];
  const witnesses = calls.flatMap((call) => {
    const values = record(call).Witnesses;
    return Array.isArray(values) ? values : [];
  });
  if (witnesses.length === 0) {
    throw new Error("Clingo non ha restituito un witness per la clique vincolata.");
  }

  const parsedCliques = witnesses.map((witness) => {
    const values = record(witness).Value;
    if (!Array.isArray(values) || values.some((atom) => typeof atom !== "string")) {
      throw new Error("Il witness ASP della clique ha un formato non valido.");
    }

    const nodeIndices: number[] = [];
    for (const atom of values as string[]) {
      const match = /^in\((\d+)\)$/.exec(atom);
      if (!match) throw new Error("Il witness ASP contiene un atomo inatteso.");
      nodeIndices.push(Number(match[1]));
    }
    if (nodeIndices.length === 0 || new Set(nodeIndices).size !== nodeIndices.length) {
      throw new Error("Il witness ASP non contiene una clique valida.");
    }

    const nodeIds = nodeIndices.map((index) => options.reverseIndex[index]);
    if (nodeIds.some((nodeId) => typeof nodeId !== "string" || !candidateNodeIds.has(nodeId))) {
      throw new Error("Il witness ASP contiene nodi fuori dal dominio candidato.");
    }
    if (new Set(nodeIds).size !== nodeIds.length || !nodeIds.includes(options.targetNodeId)) {
      throw new Error("Il witness ASP non include esattamente il nodo selezionato.");
    }
    return [...nodeIds].sort((left, right) => left.localeCompare(right));
  });

  const maximumContainingSize = Math.max(...parsedCliques.map((clique) => clique.length));
  const witnessNodeIds = parsedCliques.find((clique) => clique.length === maximumContainingSize)!;
  const adjacentPairs = new Set(options.edgeRecords.map((edge) =>
    unorderedPairKey(edge.sourceNodeId, edge.targetNodeId)
  ));
  const supportingEdges: CliqueMembershipSupportEdge[] = [];

  for (let left = 0; left < witnessNodeIds.length; left += 1) {
    for (let right = left + 1; right < witnessNodeIds.length; right += 1) {
      const sourceNodeId = witnessNodeIds[left];
      const targetNodeId = witnessNodeIds[right];
      const pairKey = unorderedPairKey(sourceNodeId, targetNodeId);
      if (!adjacentPairs.has(pairKey)) {
        throw new Error("Il witness ASP contiene una coppia non adiacente nel grafo corrente.");
      }
      const pairEdges = options.edgeRecords
        .filter((edge) => unorderedPairKey(edge.sourceNodeId, edge.targetNodeId) === pairKey)
        .sort((leftEdge, rightEdge) => (leftEdge.edgeId ?? "").localeCompare(rightEdge.edgeId ?? ""));
      const support = pairEdges[0];
      if (!support) throw new Error("Manca il record che supporta una coppia della clique.");
      supportingEdges.push({
        sourceNodeId,
        targetNodeId,
        ...(support.edgeId ? { edgeId: support.edgeId } : {}),
        ...(support.edgeIdGenerated === true ? { edgeIdGenerated: true } : {})
      });
    }
  }

  if (maximumContainingSize > options.globalMaximumSize) {
    throw new Error("La query vincolata supera la cardinalità massima globale; i risultati di riferimento non sono coerenti.");
  }

  return {
    targetNodeId: options.targetNodeId,
    globalMaximumSize: options.globalMaximumSize,
    maximumContainingSize,
    sizeGap: options.globalMaximumSize - maximumContainingSize,
    outcome: maximumContainingSize === options.globalMaximumSize
      ? "included-in-maximum"
      : "excluded-from-maximum",
    witnessNodeIds,
    supportingEdges
  };
}
