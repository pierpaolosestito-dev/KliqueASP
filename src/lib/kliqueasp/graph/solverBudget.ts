export const DEFAULT_SOLVER_TASK_TIMEOUT_MS = 20_000;
export const MAX_SOLVER_TASK_TIMEOUT_MS = 300_000;

/** Resolves the app-wide solver budget while keeping invalid configs bounded. */
export function resolveSolverTaskTimeoutMs(rawTimeout: unknown): number {
  const timeoutMs = Number(rawTimeout);
  return Number.isInteger(timeoutMs) && timeoutMs >= 1_000
    ? Math.min(timeoutMs, MAX_SOLVER_TASK_TIMEOUT_MS)
    : DEFAULT_SOLVER_TASK_TIMEOUT_MS;
}

/** Returns the remaining part of a monotonic deadline, floored for setTimeout. */
export function getRemainingSolverBudgetMs(deadline: number, now: number): number {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) {
    throw new RangeError("deadline e now devono essere valori monotoni finiti");
  }
  return Math.max(0, Math.floor(deadline - now));
}

/** Runs one solver phase with only the unspent part of a task-wide deadline. */
export async function runWithRemainingSolverBudget<T>(
  deadline: number,
  now: number,
  timeoutResult: T,
  run: (timeoutMs: number) => Promise<T>
): Promise<T> {
  const remainingMs = getRemainingSolverBudgetMs(deadline, now);
  if (remainingMs <= 0) return timeoutResult;
  return run(remainingMs);
}
