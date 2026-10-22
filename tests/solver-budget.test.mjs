import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SOLVER_TASK_TIMEOUT_MS,
  MAX_SOLVER_TASK_TIMEOUT_MS,
  getRemainingSolverBudgetMs,
  runWithRemainingSolverBudget,
  resolveSolverTaskTimeoutMs
} from "../src/lib/kliqueasp/graph/solverBudget.ts";

test("il budget solver usa default e limiti configurati validi", () => {
  assert.equal(resolveSolverTaskTimeoutMs(undefined), DEFAULT_SOLVER_TASK_TIMEOUT_MS);
  assert.equal(resolveSolverTaskTimeoutMs("invalid"), DEFAULT_SOLVER_TASK_TIMEOUT_MS);
  assert.equal(resolveSolverTaskTimeoutMs(999), DEFAULT_SOLVER_TASK_TIMEOUT_MS);
  assert.equal(resolveSolverTaskTimeoutMs("25000"), 25_000);
  assert.equal(resolveSolverTaskTimeoutMs(MAX_SOLVER_TASK_TIMEOUT_MS + 1), MAX_SOLVER_TASK_TIMEOUT_MS);
  assert.equal(resolveSolverTaskTimeoutMs(Number.MAX_SAFE_INTEGER + 1), MAX_SOLVER_TASK_TIMEOUT_MS);
});

test("il budget residuo non rinnova il termine tra le query e non diventa negativo", () => {
  assert.equal(getRemainingSolverBudgetMs(10_000, 2_500), 7_500);
  assert.equal(getRemainingSolverBudgetMs(10_000, 9_999.9), 0);
  assert.equal(getRemainingSolverBudgetMs(10_000, 10_001), 0);
  assert.throws(() => getRemainingSolverBudgetMs(Number.POSITIVE_INFINITY, 0), RangeError);
});

test("una fase solver riceve solo il budget residuo della scadenza condivisa", async () => {
  let receivedTimeoutMs = 0;
  const result = await runWithRemainingSolverBudget(
    10_000,
    2_500,
    { Result: "ERROR" },
    async (timeoutMs) => {
      receivedTimeoutMs = timeoutMs;
      return { Result: "SATISFIABLE" };
    }
  );

  assert.equal(receivedTimeoutMs, 7_500);
  assert.deepEqual(result, { Result: "SATISFIABLE" });
});

test("una fase solver gia' scaduta restituisce timeout senza invocare clingo", async () => {
  let invoked = false;
  const timeoutResult = { Result: "ERROR", Error: "task budget scaduto" };
  const result = await runWithRemainingSolverBudget(
    10_000,
    10_000,
    timeoutResult,
    async () => {
      invoked = true;
      return { Result: "SATISFIABLE" };
    }
  );

  assert.equal(invoked, false);
  assert.equal(result, timeoutResult);
});
