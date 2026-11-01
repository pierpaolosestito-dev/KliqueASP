import assert from "node:assert/strict";
import test from "node:test";

import { describeKPlexMissingTieAllowance } from "../src/lib/kliqueasp/graph/kplexMissingTieSummary.ts";

test("describes the clique boundary and singular/plural missing-tie limits clearly", () => {
  assert.equal(
    describeKPlexMissingTieAllowance(1),
    "Ogni membro deve essere collegato a tutti gli altri membri."
  );
  assert.equal(
    describeKPlexMissingTieAllowance(2),
    "Ogni membro può avere al massimo 1 collegamento mancante con gli altri membri."
  );
  assert.equal(
    describeKPlexMissingTieAllowance(4),
    "Ogni membro può avere al massimo 3 collegamenti mancanti con gli altri membri."
  );
});

test("rejects an invalid s-plex parameter instead of displaying a misleading bound", () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => describeKPlexMissingTieAllowance(value), RangeError);
  }
});
