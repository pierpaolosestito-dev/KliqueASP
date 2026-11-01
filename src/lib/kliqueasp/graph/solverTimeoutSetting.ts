import {
  DEFAULT_SOLVER_TASK_TIMEOUT_MS,
  MAX_SOLVER_TASK_TIMEOUT_MS,
  resolveSolverTaskTimeoutMs
} from "./solverBudget.ts";

const MIN_SOLVER_TASK_TIMEOUT_MS = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Reads the app-wide solver limit as seconds for the data/settings UI. */
export function getSolverTaskTimeoutSeconds(config: unknown): number {
  const solver = isRecord(config) && isRecord(config.solver) ? config.solver : null;
  const timeoutMs = resolveSolverTaskTimeoutMs(solver?.taskTimeoutMs);
  return timeoutMs / 1_000;
}

/** Updates the solver limit without replacing the rest of the project config. */
export function setSolverTaskTimeoutSeconds(configInput: unknown, seconds: number): Record<string, unknown> {
  if (!isRecord(configInput)) {
    throw new TypeError("La configurazione deve essere un oggetto JSON prima di cambiare il limite di calcolo.");
  }
  if (!Number.isFinite(seconds)) {
    throw new TypeError("Inserisci un limite di calcolo numerico.");
  }

  const timeoutMs = Math.round(seconds * 1_000);
  if (
    seconds < MIN_SOLVER_TASK_TIMEOUT_MS / 1_000 ||
    seconds > MAX_SOLVER_TASK_TIMEOUT_MS / 1_000 ||
    !Number.isSafeInteger(timeoutMs)
  ) {
    throw new RangeError("Il limite deve essere compreso tra 1 e 300 secondi.");
  }

  const solver = isRecord(configInput.solver) ? configInput.solver : {};
  return {
    ...configInput,
    solver: {
      ...solver,
      taskTimeoutMs: timeoutMs
    }
  };
}

export const DEFAULT_SOLVER_TASK_TIMEOUT_SECONDS = DEFAULT_SOLVER_TASK_TIMEOUT_MS / 1_000;
