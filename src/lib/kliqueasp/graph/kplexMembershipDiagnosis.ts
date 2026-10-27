export interface KPlexMaximumMembershipDiagnosis {
  targetNodeId: string;
  s: number;
  globalMaximumSize: number;
  maximumContainingSize: number;
  sizeGap: number;
  outcome: "excluded-from-maximum" | "included-in-maximum";
  witnessNodeIds: string[];
  missingPairs: Array<[string, string]>;
  optimalMembershipSummary?: KPlexMaximumMembershipOptimaSummary;
}

export interface KPlexMaximumMembershipOptimaSummary {
  totalOptimalKplexes: number;
  targetOptimalKplexes: number;
  status: "none" | "some" | "all";
}

/** Summarizes brave/skeptical target membership over a complete, proven optimum enumeration. */
export function summarizeMaximumKPlexMembershipAcrossOptima(
  targetNodeId: string,
  maximumKplexes: readonly (readonly string[])[],
  options: { candidateNodeIds: readonly string[]; globalMaximumSize: number }
): KPlexMaximumMembershipOptimaSummary {
  const candidates = new Set(options.candidateNodeIds);
  if (!targetNodeId || !candidates.has(targetNodeId)) {
    throw new Error("Il nodo da classificare non appartiene al dominio candidato.");
  }
  if (candidates.size !== options.candidateNodeIds.length ||
    !Number.isSafeInteger(options.globalMaximumSize) || options.globalMaximumSize < 1 ||
    !Array.isArray(maximumKplexes) || maximumKplexes.length === 0) {
    throw new Error("L'enumerazione dei k-plex massimi non è valida o completa.");
  }

  const seen = new Set<string>();
  let targetOptimalKplexes = 0;
  for (const nodeIds of maximumKplexes) {
    if (!Array.isArray(nodeIds) || nodeIds.length !== options.globalMaximumSize ||
      nodeIds.some((nodeId) => typeof nodeId !== "string" || !candidates.has(nodeId)) ||
      new Set(nodeIds).size !== nodeIds.length) {
      throw new Error("L'enumerazione contiene un k-plex massimo con taglia o dominio incoerenti.");
    }
    const signature = JSON.stringify([...nodeIds].sort((left, right) => left.localeCompare(right)));
    if (seen.has(signature)) throw new Error("L'enumerazione ripete un k-plex massimo.");
    seen.add(signature);
    if (nodeIds.includes(targetNodeId)) targetOptimalKplexes += 1;
  }

  return {
    totalOptimalKplexes: maximumKplexes.length,
    targetOptimalKplexes,
    status: targetOptimalKplexes === 0
      ? "none"
      : targetOptimalKplexes === maximumKplexes.length ? "all" : "some"
  };
}

export interface KPlexMembershipEdgeRecord {
  sourceNodeId: string;
  targetNodeId: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

/** Forces an eligible node into the exact maximum s-plex query. */
export function buildKPlexRequiredNodeConstraint(nodeIndex: number): string {
  if (!Number.isSafeInteger(nodeIndex) || nodeIndex < 1) {
    throw new Error("L'indice ASP del nodo richiesto deve essere un intero positivo.");
  }
  return `:- not in(${nodeIndex}).`;
}

/**
 * Checks a target-constrained optimum against the candidate projection and the
 * s-plex definition. OPTIMUM FOUND is mandatory: a feasible witness cannot
 * establish that the target's best s-plex has the reported size.
 */
export function parseKPlexMaximumMembershipDiagnosis(
  resultInput: unknown,
  options: {
    reverseIndex: Record<number, string>;
    candidateNodeIds: readonly string[];
    edgeRecords: readonly KPlexMembershipEdgeRecord[];
    targetNodeId: string;
    s: number;
    globalMaximumSize: number;
  }
): KPlexMaximumMembershipDiagnosis {
  const result = record(resultInput);
  if (result.Result !== "OPTIMUM FOUND") {
    throw new Error("Clingo non ha provato l'ottimo del k-plex contenente il nodo selezionato.");
  }
  if (!Number.isSafeInteger(options.s) || options.s < 1) {
    throw new Error("Il parametro s del k-plex non è valido.");
  }
  if (!Number.isSafeInteger(options.globalMaximumSize) || options.globalMaximumSize < 1) {
    throw new Error("La cardinalità massima globale del k-plex non è valida.");
  }

  const candidateNodeIds = new Set(options.candidateNodeIds);
  if (!options.targetNodeId || !candidateNodeIds.has(options.targetNodeId)) {
    throw new Error("Il nodo selezionato non appartiene al dominio candidato.");
  }

  const adjacentPairs = new Set(options.edgeRecords.flatMap((edge) =>
    edge.sourceNodeId === edge.targetNodeId
      ? []
      : [pairKey(edge.sourceNodeId, edge.targetNodeId)]
  ));
  const witnesses = (Array.isArray(result.Call) ? result.Call : []).flatMap((call) => {
    const rawWitnesses = record(call).Witnesses;
    return Array.isArray(rawWitnesses) ? rawWitnesses : [];
  });
  if (witnesses.length === 0) {
    throw new Error("Clingo non ha restituito un witness per il k-plex vincolato.");
  }

  const parsedWitnesses = witnesses.map((witness) => {
    const atoms = record(witness).Value;
    if (!Array.isArray(atoms) || atoms.some((atom) => typeof atom !== "string")) {
      throw new Error("Il witness ASP del k-plex ha un formato non valido.");
    }

    const selectedIndices: number[] = [];
    const reportedMissingPairs = new Set<string>();
    for (const atom of atoms as string[]) {
      const selectedMatch = /^in\((\d+)\)$/.exec(atom);
      if (selectedMatch) {
        const index = Number(selectedMatch[1]);
        if (!Number.isSafeInteger(index) || index < 1) {
          throw new Error("Il witness ASP contiene un indice di nodo non valido.");
        }
        selectedIndices.push(index);
        continue;
      }

      const missingMatch = /^missing_tie\((\d+),(\d+)\)$/.exec(atom);
      if (missingMatch) {
        const leftIndex = Number(missingMatch[1]);
        const rightIndex = Number(missingMatch[2]);
        const left = options.reverseIndex[leftIndex];
        const right = options.reverseIndex[rightIndex];
        if (!Number.isSafeInteger(leftIndex) || leftIndex < 1 ||
          !Number.isSafeInteger(rightIndex) || rightIndex < 1 ||
          typeof left !== "string" || typeof right !== "string" || left === right) {
          throw new Error("Il witness ASP contiene una coppia mancante fuori dal dominio.");
        }
        const key = pairKey(left, right);
        if (reportedMissingPairs.has(key)) {
          throw new Error("Il witness ASP ripete una coppia mancante.");
        }
        reportedMissingPairs.add(key);
        continue;
      }

      throw new Error("Il witness ASP contiene un atomo inatteso.");
    }

    if (selectedIndices.length === 0 || new Set(selectedIndices).size !== selectedIndices.length) {
      throw new Error("Il witness ASP non contiene un insieme di nodi valido.");
    }
    const nodeIds = selectedIndices.map((index) => options.reverseIndex[index]);
    if (nodeIds.some((nodeId) => typeof nodeId !== "string" || !candidateNodeIds.has(nodeId))) {
      throw new Error("Il witness ASP contiene nodi fuori dal dominio candidato.");
    }
    if (!nodeIds.includes(options.targetNodeId)) {
      throw new Error("Il witness ASP non include il nodo selezionato.");
    }

    const expectedMissingPairs: Array<[string, string]> = [];
    const expectedMissingKeys = new Set<string>();
    const missingDegree = new Map(nodeIds.map((nodeId) => [nodeId, 0]));
    for (let leftIndex = 0; leftIndex < nodeIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodeIds.length; rightIndex += 1) {
        const left = nodeIds[leftIndex];
        const right = nodeIds[rightIndex];
        const key = pairKey(left, right);
        if (adjacentPairs.has(key)) continue;
        expectedMissingKeys.add(key);
        expectedMissingPairs.push(left.localeCompare(right) <= 0 ? [left, right] : [right, left]);
        missingDegree.set(left, (missingDegree.get(left) ?? 0) + 1);
        missingDegree.set(right, (missingDegree.get(right) ?? 0) + 1);
      }
    }
    if ([...missingDegree.values()].some((degree) => degree > options.s - 1)) {
      throw new Error("Il witness ASP non soddisfa la definizione del k-plex.");
    }
    if (reportedMissingPairs.size !== expectedMissingKeys.size ||
      [...expectedMissingKeys].some((key) => !reportedMissingPairs.has(key))) {
      throw new Error("Le coppie mancanti del witness ASP non coincidono con il grafo sorgente.");
    }
    return {
      nodeIds: [...nodeIds].sort((left, right) => left.localeCompare(right)),
      missingPairs: expectedMissingPairs.sort((left, right) =>
        left[0].localeCompare(right[0]) || left[1].localeCompare(right[1])
      )
    };
  });

  const maximumContainingSize = Math.max(...parsedWitnesses.map((witness) => witness.nodeIds.length));
  if (maximumContainingSize > options.globalMaximumSize) {
    throw new Error("Il k-plex vincolato supera il massimo globale; i risultati non sono coerenti.");
  }
  const witness = parsedWitnesses.find((candidate) => candidate.nodeIds.length === maximumContainingSize)!;

  return {
    targetNodeId: options.targetNodeId,
    s: options.s,
    globalMaximumSize: options.globalMaximumSize,
    maximumContainingSize,
    sizeGap: options.globalMaximumSize - maximumContainingSize,
    outcome: maximumContainingSize === options.globalMaximumSize
      ? "included-in-maximum"
      : "excluded-from-maximum",
    witnessNodeIds: witness.nodeIds,
    missingPairs: witness.missingPairs
  };
}
