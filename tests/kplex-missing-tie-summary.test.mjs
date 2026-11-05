import assert from "node:assert/strict";
import test from "node:test";

import { describeKPlexMissingTieAllowance } from "../src/lib/kliqueasp/graph/kplexMissingTieSummary.ts";

test("describes the clique boundary and singular/plural non-adjacency limits clearly", () => {
  assert.equal(
    describeKPlexMissingTieAllowance(1),
    "Ogni membro deve essere adiacente a tutti gli altri."
  );
  assert.equal(
    describeKPlexMissingTieAllowance(2),
    "Ogni membro può avere al massimo 1 altro membro non adiacente."
  );
  assert.equal(
    describeKPlexMissingTieAllowance(4),
    "Ogni membro può avere al massimo 3 altri membri non adiacenti."
  );
});

test("rejects an invalid s-plex parameter instead of displaying a misleading bound", () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => describeKPlexMissingTieAllowance(value), RangeError);
  }
});
