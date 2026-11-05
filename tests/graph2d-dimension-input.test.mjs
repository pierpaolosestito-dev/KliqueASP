import assert from "node:assert/strict";
import test from "node:test";
import { parseGraph2DDimension } from "../src/lib/kliqueasp/graph/graph2dExport.ts";

test("parses only whole pixel dimensions within the export bounds", () => {
  for (const value of [null, undefined, "", "   ", Number.NaN, Number.POSITIVE_INFINITY, 239, 8193, 240.5]) {
    assert.equal(parseGraph2DDimension(value), null, `expected ${String(value)} to be rejected`);
  }

  for (const [input, expected] of [[240, 240], [8192, 8192], [1280, 1280], ["820", 820], [" 240 ", 240]]) {
    assert.equal(parseGraph2DDimension(input), expected);
  }
});
