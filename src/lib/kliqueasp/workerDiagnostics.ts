export interface WorkerWasmMemoryStats {
  currentBytes: number;
  peakBytes: number;
  peakReliable: boolean;
}

/** Timing reported by clingo for its most recent single CLI invocation. */
export interface ClingoInvocationTiming {
  totalMs: number | null;
  solveMs: number | null;
  preSolveMs: number | null;
}

/** Program-grounding and solver counters for the most recent CLI invocation. */
export interface ClingoInvocationStats {
  groundAtoms: number | null;
  groundRulesOriginal: number | null;
  groundRulesFinal: number | null;
  solverVariables: number | null;
  choices: number | null;
  conflicts: number | null;
}

/** Adds clingo's detailed statistics flag only when the graph config opts in. */
export function getClingoInvocationOptions(options: string[], includeStats: boolean): string[] {
  if (!includeStats) return options;
  return [...options.filter((option) => !/^--stats(?:=|$)/.test(option)), "--stats=2"];
}

/**
 * Reads the basic JSON timing fields returned by the bundled clingo CLI.
 * `Total - Solve` includes input parsing, grounding, and setup; it is not a
 * measurement of grounding alone. The caller must also preserve the fact that
 * these fields describe one clingo invocation, not a multi-query app task.
 */
export function parseClingoInvocationTiming(result: unknown): ClingoInvocationTiming | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;

  const time = (result as { Time?: unknown }).Time;
  if (!time || typeof time !== "object" || Array.isArray(time)) return null;

  const readMilliseconds = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    const milliseconds = value * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  };

  const seconds = time as { Total?: unknown; Solve?: unknown };
  const totalMs = readMilliseconds(seconds.Total);
  const solveMs = readMilliseconds(seconds.Solve);

  if (totalMs === null && solveMs === null) return null;

  return {
    totalMs,
    solveMs,
    preSolveMs: totalMs !== null && solveMs !== null && totalMs >= solveMs
      ? totalMs - solveMs
      : null
  };
}

/** Parses grounded-LP and solver counters without inventing unavailable values. */
export function parseClingoInvocationStats(result: unknown): ClingoInvocationStats | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const stats = (result as { Stats?: unknown }).Stats;
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;

  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  const readCounter = (value: unknown): number | null =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value
      : null;

  const statsRecord = record(stats);
  const lp = record(statsRecord.LP);
  const rules = record(lp.Rules);
  const problem = record(statsRecord.Problem);
  const core = record(statsRecord.Core);
  const parsed = {
    groundAtoms: readCounter(lp.Atoms),
    groundRulesOriginal: readCounter(rules.Original),
    groundRulesFinal: readCounter(rules.Final),
    solverVariables: readCounter(problem.Variables),
    choices: readCounter(core.Choices),
    conflicts: readCounter(core.Conflicts)
  };

  return Object.values(parsed).some((value) => value !== null) ? parsed : null;
}
