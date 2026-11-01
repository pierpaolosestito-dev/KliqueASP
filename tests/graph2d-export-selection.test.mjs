import test from "node:test";
import assert from "node:assert/strict";
import { clampGraph2DPartitionIndex, parseGraph2DPartitionNumber, resolveGraph2DModeOnOpen } from "../src/lib/kliqueasp/graph/graph2DExportSelection.ts";

test("partition number maps from the visible one-based number to its zero-based index", () => {
  assert.equal(parseGraph2DPartitionNumber("1", 4), 0);
  assert.equal(parseGraph2DPartitionNumber("4", 4), 3);
});

test("partition number rejects empty, fractional, out-of-range, and unsafe values", () => {
  for (const value of ["", "  ", "1.5", "0", "5", "9007199254740992", null, undefined]) {
    assert.equal(parseGraph2DPartitionNumber(value, 4), null, `expected ${String(value)} to be rejected`);
  }
});

test("partition number is unavailable when no partitions can be selected", () => {
  assert.equal(parseGraph2DPartitionNumber("1", 0), null);
  assert.equal(parseGraph2DPartitionNumber("1", -2), null);
});

test("partition index is clamped after the available partition list changes", () => {
  assert.equal(clampGraph2DPartitionIndex(2, 4), 2);
  assert.equal(clampGraph2DPartitionIndex(8, 4), 3);
  assert.equal(clampGraph2DPartitionIndex(-3, 4), 0);
  assert.equal(clampGraph2DPartitionIndex(2, 0), 0);
  assert.equal(clampGraph2DPartitionIndex(Number.NaN, 4), 0);
});

test("witness-only export resets to the full projection when the next analysis has no selected witness", () => {
  assert.equal(resolveGraph2DModeOnOpen("witness", false), "projection");
  assert.equal(resolveGraph2DModeOnOpen("witness", true), "witness");
  assert.equal(resolveGraph2DModeOnOpen("projection", false), "projection");
});
