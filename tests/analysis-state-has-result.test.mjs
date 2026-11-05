import test from "node:test";
import assert from "node:assert/strict";
import { analysisStateHasResult } from "../src/lib/kliqueasp/graph/workbenchSession.ts";

test("an open analysis panel without a result is not treated as a saved analysis", () => {
  for (const panel of ["clique", "structural", "integrity", "motif", "provenance"]) {
    assert.equal(analysisStateHasResult({ panel }), false, `${panel} panel starts empty`);
  }
});

test("clique state is retained only when it has a witness, completed run, or error", () => {
  assert.equal(analysisStateHasResult({ panel: "clique", clique: { maximumCliques: [] } }), false);
  assert.equal(analysisStateHasResult({ panel: "clique", clique: { maximumCliques: [{ nodeIds: ["a"] }] } }), true);
  assert.equal(analysisStateHasResult({ panel: "clique", clique: { stats: { timeMs: 0 } } }), true);
  assert.equal(analysisStateHasResult({ panel: "clique", clique: { error: "timeout" } }), true);
});

test("structural state distinguishes an empty panel from results and outcomes", () => {
  assert.equal(analysisStateHasResult({ panel: "structural", structural: { results: [] } }), false);
  assert.equal(analysisStateHasResult({ panel: "structural", structural: { results: [{ nodeIds: ["a"] }] } }), true);
  assert.equal(analysisStateHasResult({ panel: "structural", structural: { stats: {} } }), true);
  assert.equal(analysisStateHasResult({ panel: "structural", structural: { error: "failed" } }), true);
});

test("integrity and motif tasks retain successful outcomes, proposals, and errors", () => {
  assert.equal(analysisStateHasResult({ panel: "integrity", integrity: { hasRun: true } }), true);
  assert.equal(analysisStateHasResult({ panel: "integrity", integrity: { repairProposal: { changes: [] } } }), true);
  assert.equal(analysisStateHasResult({ panel: "integrity", integrity: { error: "failed" } }), true);
  assert.equal(analysisStateHasResult({ panel: "integrity", integrity: { repairOutcomeMessage: "Nessuna riparazione ammissibile" } }), true);
  assert.equal(analysisStateHasResult({ panel: "motif", motif: { hasRun: true } }), true);
  assert.equal(analysisStateHasResult({ panel: "motif", motif: { signedTriadHasRun: true } }), true);
  assert.equal(analysisStateHasResult({ panel: "motif", motif: { contextualCliqueError: "failed" } }), true);
  assert.equal(analysisStateHasResult({ panel: "motif", motif: { hasRun: false, error: "" } }), false);
});

test("provenance state ignores empty placeholders but keeps comparisons and failures", () => {
  assert.equal(analysisStateHasResult({ panel: "provenance", provenance: { comparison: null, error: "", counterfactual: [] } }), false);
  assert.equal(analysisStateHasResult({ panel: "provenance", provenance: { cliqueComparison: { scenarios: [] } } }), true);
  assert.equal(analysisStateHasResult({ panel: "provenance", provenance: { whyNotError: "failed" } }), true);
});

test("only the active result family determines whether its state should be kept", () => {
  assert.equal(analysisStateHasResult({
    panel: "clique",
    clique: { maximumCliques: [] },
    structural: { results: [{ nodeIds: ["a"] }] }
  }), false);
  assert.equal(analysisStateHasResult({
    resultPanel: "structural",
    panel: "clique",
    structural: { results: [{ nodeIds: ["a"] }] }
  }), true);
});
