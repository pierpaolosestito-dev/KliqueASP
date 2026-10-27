import { parseTypedMotifCount } from "./motifTask.ts";
import {
  DEFAULT_GRAPH_MOTIF_COUNT_DURATION_MS,
  MAX_GRAPH_MOTIF_COUNT_DURATION_MS,
  MAX_GRAPH_MOTIF_COUNT_PARTITION_SIZE,
  MIN_GRAPH_MOTIF_COUNT_DURATION_MS,
  MIN_GRAPH_MOTIF_COUNT_PARTITION_SIZE,
  type GraphMotifTemplate
} from "./graphModel.ts";

export const MAX_TYPED_MOTIF_COUNT_PARTITION_SIZE = MAX_GRAPH_MOTIF_COUNT_PARTITION_SIZE;
export const DEFAULT_TYPED_MOTIF_COUNT_MAX_DURATION_MS = DEFAULT_GRAPH_MOTIF_COUNT_DURATION_MS;
export const MAX_TYPED_MOTIF_COUNT_MAX_DURATION_MS = MAX_GRAPH_MOTIF_COUNT_DURATION_MS;

export interface TypedMotifCountPartitionSettings {
  partitionSize: number;
  maxDurationMs: number;
}

export type TypedMotifCountPartitionDomain = "firstPatternEdge" | "firstRoleNode";
type TypedMotifTemporalSemantics = NonNullable<GraphMotifTemplate["temporal"]>["semantics"];

/** Selects a partition key that remains disjoint for the count's semantics. */
export function resolveTypedMotifCountPartitionDomainForSemantics(
  semantics: TypedMotifTemporalSemantics | undefined
): TypedMotifCountPartitionDomain {
  return semantics === "orderedByStart" ? "firstPatternEdge" : "firstRoleNode";
}

export function resolveTypedMotifCountPartitionDomain(
  template: GraphMotifTemplate
): TypedMotifCountPartitionDomain {
  return resolveTypedMotifCountPartitionDomainForSemantics(template.temporal?.semantics);
}

export type TypedMotifCountPartitionSettingsResolution =
  | { enabled: false; error?: string }
  | { enabled: true; settings: TypedMotifCountPartitionSettings };

export interface TypedMotifCountPartitionProgress {
  completed: number;
  total: number;
  partitionDomain: TypedMotifCountPartitionDomain;
  indexRange: [number, number];
}

export interface TypedMotifCountPartitionRunOptions {
  edgeCount: number;
  roleNodeCount: number;
  partitionDomain: TypedMotifCountPartitionDomain;
  settings: TypedMotifCountPartitionSettings;
  perPartitionTimeoutMs: number;
  signal?: AbortSignal;
  now?: () => number;
  onProgress?: (progress: TypedMotifCountPartitionProgress) => void;
  runPartition: (
    partitionIndexes: readonly number[],
    timeoutMs: number,
    signal?: AbortSignal
  ) => Promise<unknown>;
}

export type TypedMotifCountPartitionRunResult =
  | { status: "complete"; count: string; partitionCount: number }
  | { status: "cancelled"; completedPartitions: number; partitionCount: number }
  | { status: "timeout"; completedPartitions: number; partitionCount: number }
  | { status: "error"; message: string; completedPartitions: number; partitionCount: number };

/**
 * Validates the opt-in graphAnalysis.motifCount settings. Omitting the object
 * keeps the historical single-query count path enabled.
 */
export function resolveTypedMotifCountPartitionSettings(
  raw: unknown
): TypedMotifCountPartitionSettingsResolution {
  if (raw === undefined) return { enabled: false };
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      enabled: false,
      error: "graphAnalysis.motifCount deve essere un oggetto con partitionSize intero fra 1 e 16."
    };
  }

  const settings = raw as Record<string, unknown>;
  const partitionSize = settings.partitionSize;
  if (!Number.isInteger(partitionSize) || Number(partitionSize) < MIN_GRAPH_MOTIF_COUNT_PARTITION_SIZE ||
    Number(partitionSize) > MAX_TYPED_MOTIF_COUNT_PARTITION_SIZE) {
    return {
      enabled: false,
      error: `graphAnalysis.motifCount.partitionSize deve essere un intero fra 1 e ${MAX_TYPED_MOTIF_COUNT_PARTITION_SIZE}.`
    };
  }

  const maxDurationMs = settings.maxDurationMs === undefined
    ? DEFAULT_TYPED_MOTIF_COUNT_MAX_DURATION_MS
    : settings.maxDurationMs;
  if (!Number.isInteger(maxDurationMs) || Number(maxDurationMs) < MIN_GRAPH_MOTIF_COUNT_DURATION_MS ||
    Number(maxDurationMs) > MAX_TYPED_MOTIF_COUNT_MAX_DURATION_MS) {
    return {
      enabled: false,
      error: `graphAnalysis.motifCount.maxDurationMs deve essere un intero fra 1000 e ${MAX_TYPED_MOTIF_COUNT_MAX_DURATION_MS}.`
    };
  }

  return {
    enabled: true,
    settings: { partitionSize: Number(partitionSize), maxDurationMs: Number(maxDurationMs) }
  };
}

/** Builds a disjoint, exhaustive partition of the 1-based ASP edge-record indexes. */
export function createTypedMotifCountPartitionPlan(
  itemCount: number,
  partitionSize: number
): number[][] {
  if (!Number.isSafeInteger(itemCount) || itemCount < 0) {
    throw new RangeError("itemCount deve essere un intero non negativo.");
  }
  if (!Number.isSafeInteger(partitionSize) || partitionSize < MIN_GRAPH_MOTIF_COUNT_PARTITION_SIZE ||
    partitionSize > MAX_TYPED_MOTIF_COUNT_PARTITION_SIZE) {
    throw new RangeError(`partitionSize deve essere un intero fra 1 e ${MAX_TYPED_MOTIF_COUNT_PARTITION_SIZE}.`);
  }

  return Array.from({ length: Math.ceil(itemCount / partitionSize) }, (_, partitionIndex) =>
    Array.from({
      length: Math.min(partitionSize, itemCount - partitionIndex * partitionSize)
    }, (_, offset) => partitionIndex * partitionSize + offset + 1)
  );
}

/**
 * Runs a partitioned exact count under one task-wide deadline. Partial totals
 * are deliberately never returned as successful results.
 */
export async function runTypedMotifCountPartitions(
  options: TypedMotifCountPartitionRunOptions
): Promise<TypedMotifCountPartitionRunResult> {
  const itemCount = options.partitionDomain === "firstPatternEdge" ? options.edgeCount : options.roleNodeCount;
  const partitions = createTypedMotifCountPartitionPlan(itemCount, options.settings.partitionSize);
  const total = partitions.length;
  const now = options.now ?? (() => performance.now());
  if (!Number.isSafeInteger(options.settings.maxDurationMs) ||
    options.settings.maxDurationMs < MIN_GRAPH_MOTIF_COUNT_DURATION_MS ||
    options.settings.maxDurationMs > MAX_TYPED_MOTIF_COUNT_MAX_DURATION_MS) {
    throw new RangeError("maxDurationMs non è valido.");
  }
  if (!Number.isSafeInteger(options.perPartitionTimeoutMs) ||
    options.perPartitionTimeoutMs < MIN_GRAPH_MOTIF_COUNT_DURATION_MS) {
    throw new RangeError("perPartitionTimeoutMs deve essere un intero di almeno 1000 ms.");
  }

  const deadline = now() + options.settings.maxDurationMs;
  if (options.edgeCount === 0 || total === 0) {
    return { status: "complete", count: "0", partitionCount: 0 };
  }
  let count = 0n;
  let completedPartitions = 0;
  for (const partition of partitions) {
    if (options.signal?.aborted) {
      return { status: "cancelled", completedPartitions, partitionCount: total };
    }
    const remainingMs = Math.floor(deadline - now());
    if (remainingMs < 1_000) {
      return { status: "timeout", completedPartitions, partitionCount: total };
    }
    options.onProgress?.({
      completed: completedPartitions,
      total,
      partitionDomain: options.partitionDomain,
      indexRange: [partition[0], partition.at(-1)!]
    });

    let result: unknown;
    try {
      result = await options.runPartition(
        partition,
        Math.min(options.perPartitionTimeoutMs, remainingMs),
        options.signal
      );
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        completedPartitions,
        partitionCount: total
      };
    }
    if (options.signal?.aborted || (result !== null && typeof result === "object" &&
      (result as Record<string, unknown>).Result === "CANCELLED")) {
      return { status: "cancelled", completedPartitions, partitionCount: total };
    }
    if (now() >= deadline) {
      return { status: "timeout", completedPartitions, partitionCount: total };
    }
    if (result === null || typeof result !== "object") {
      return {
        status: "error",
        message: "clingo non ha restituito una risposta valida per la partizione.",
        completedPartitions,
        partitionCount: total
      };
    }

    const solverResult = result as Record<string, any>;
    if (solverResult.Result === "ERROR") {
      return {
        status: "error",
        message: typeof solverResult.Error === "string" && solverResult.Error
          ? solverResult.Error
          : "Errore del worker clingo.",
        completedPartitions,
        partitionCount: total
      };
    }
    if (solverResult.Result !== "SATISFIABLE" || solverResult.Models?.More !== "no") {
      return {
        status: "error",
        message: `Il solver non ha provato un conteggio completo per la partizione ${completedPartitions + 1}/${total}.`,
        completedPartitions,
        partitionCount: total
      };
    }

    const partialCount = parseTypedMotifCount(solverResult.Call?.[0]?.Witnesses);
    if (partialCount === undefined) {
      return {
        status: "error",
        message: `Il solver non ha restituito un conteggio valido per la partizione ${completedPartitions + 1}/${total}.`,
        completedPartitions,
        partitionCount: total
      };
    }
    count += BigInt(partialCount);
    completedPartitions += 1;
  }

  const lastPartition = partitions.at(-1)!;
  options.onProgress?.({
    completed: total,
    total,
    partitionDomain: options.partitionDomain,
    indexRange: [lastPartition[0], lastPartition.at(-1)!]
  });
  return { status: "complete", count: count.toString(), partitionCount: total };
}
