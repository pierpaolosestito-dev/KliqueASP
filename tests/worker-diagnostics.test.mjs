import assert from "node:assert/strict";
import test from "node:test";
import {
  getClingoInvocationOptions,
  parseClingoInvocationStats,
  parseClingoInvocationTiming
} from "../src/lib/kliqueasp/workerDiagnostics.ts";

test("clingo invocation timing converts total and solve seconds to milliseconds", () => {
  assert.deepEqual(parseClingoInvocationTiming({
    Time: { Total: 1.25, Solve: 0.4 }
  }), {
    totalMs: 1250,
    solveMs: 400,
    preSolveMs: 850
  });
});

test("pre-solving remains unavailable when clingo timings are incomplete or inconsistent", () => {
  assert.deepEqual(parseClingoInvocationTiming({
    Time: { Total: 0.5, Solve: "0.1" }
  }), {
    totalMs: 500,
    solveMs: null,
    preSolveMs: null
  });

  assert.deepEqual(parseClingoInvocationTiming({
    Time: { Total: 0.1, Solve: 0.2 }
  }), {
    totalMs: 100,
    solveMs: 200,
    preSolveMs: null
  });
});

test("missing, negative, non-finite, and overflowing clingo timings are rejected", () => {
  assert.equal(parseClingoInvocationTiming(null), null);
  assert.equal(parseClingoInvocationTiming({ Time: { Total: -1, Solve: Number.NaN } }), null);
  assert.deepEqual(parseClingoInvocationTiming({ Time: { Total: Number.MAX_VALUE, Solve: 0 } }), {
    totalMs: null,
    solveMs: 0,
    preSolveMs: null
  });
});

test("clingo statistics parse LP size and solver counters without filling unavailable fields", () => {
  assert.deepEqual(parseClingoInvocationStats({
    Stats: {
      LP: { Atoms: 12, Rules: { Original: 20, Final: 15 } },
      Problem: { Variables: 8 },
      Core: { Choices: 5, Conflicts: 2 }
    }
  }), {
    groundAtoms: 12,
    groundRulesOriginal: 20,
    groundRulesFinal: 15,
    solverVariables: 8,
    choices: 5,
    conflicts: 2
  });

  assert.deepEqual(parseClingoInvocationStats({ Stats: { LP: { Atoms: 0 } } }), {
    groundAtoms: 0,
    groundRulesOriginal: null,
    groundRulesFinal: null,
    solverVariables: null,
    choices: null,
    conflicts: null
  });
  assert.equal(parseClingoInvocationStats({ Stats: { LP: { Atoms: -1 } } }), null);
  assert.equal(parseClingoInvocationStats({ Stats: { LP: { Atoms: 1.5 } } }), null);
  assert.equal(parseClingoInvocationStats({ Stats: { LP: { Atoms: Number.MAX_SAFE_INTEGER + 1 } } }), null);
  assert.equal(parseClingoInvocationStats({ Stats: null }), null);
});

test("detailed clingo statistics options are isolated behind explicit opt-in", () => {
  const options = ["--opt-mode=opt", "--stats=1"];
  assert.equal(getClingoInvocationOptions(options, false), options);
  assert.deepEqual(getClingoInvocationOptions(options, true), ["--opt-mode=opt", "--stats=2"]);
  assert.deepEqual(getClingoInvocationOptions(["--stats", "--stats=2"], true), ["--stats=2"]);
});
