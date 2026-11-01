import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SOLVER_TASK_TIMEOUT_SECONDS,
  getSolverTaskTimeoutSeconds,
  setSolverTaskTimeoutSeconds
} from "../src/lib/kliqueasp/graph/solverTimeoutSetting.ts";

test("solver settings show the default timeout when none is configured", () => {
  assert.equal(getSolverTaskTimeoutSeconds({}), DEFAULT_SOLVER_TASK_TIMEOUT_SECONDS);
  assert.equal(getSolverTaskTimeoutSeconds({ solver: {} }), DEFAULT_SOLVER_TASK_TIMEOUT_SECONDS);
  assert.equal(getSolverTaskTimeoutSeconds(null), DEFAULT_SOLVER_TASK_TIMEOUT_SECONDS);
});

test("solver settings read configured milliseconds as seconds", () => {
  assert.equal(getSolverTaskTimeoutSeconds({ solver: { taskTimeoutMs: 45_000 } }), 45);
  assert.equal(getSolverTaskTimeoutSeconds({ solver: { taskTimeoutMs: 12_500 } }), 12.5);
});

test("updating the timeout preserves other graph and solver options", () => {
  const source = {
    features: { timeline: true },
    graphMapping: { edge: { identity: "multigraph" } },
    solver: { enabled: false, cliqueMode: "maximum", diagnostics: { aspStats: true }, taskTimeoutMs: 20_000 }
  };

  const updated = setSolverTaskTimeoutSeconds(source, 45.5);

  assert.equal(updated.solver.taskTimeoutMs, 45_500);
  assert.deepEqual(updated.solver.diagnostics, { aspStats: true });
  assert.equal(updated.solver.enabled, false);
  assert.deepEqual(updated.graphMapping, source.graphMapping);
  assert.deepEqual(updated.features, source.features);
  assert.equal(source.solver.taskTimeoutMs, 20_000);
});

test("solver timeout accepts its inclusive one-to-300-second range", () => {
  assert.equal(setSolverTaskTimeoutSeconds({}, 1).solver.taskTimeoutMs, 1_000);
  assert.equal(setSolverTaskTimeoutSeconds({}, 300).solver.taskTimeoutMs, 300_000);
});

test("solver timeout rejects invalid configuration and values outside the range", () => {
  for (const seconds of [0, -1, 300.001, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => setSolverTaskTimeoutSeconds({ solver: { enabled: true } }, seconds));
  }
  assert.throws(() => setSolverTaskTimeoutSeconds([], 30), /oggetto JSON/);
});
