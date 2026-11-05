import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getCliqueTaskLabel, getCliqueTaskQuestion } from "../src/lib/kliqueasp/graph/cliqueTaskCopy.ts";

test("clique task questions distinguish maximal, all, and maximum searches", () => {
  assert.match(getCliqueTaskQuestion("maximal"), /non possono essere estese/);
  assert.match(getCliqueTaskQuestion("all"), /incluse le sottoclique/);
  assert.match(getCliqueTaskQuestion("maximum"), /taglia massima/);
  assert.equal(getCliqueTaskQuestion(undefined), getCliqueTaskQuestion("maximal"));
  for (const mode of ["maximal", "all", "maximum", undefined]) {
    assert.ok(getCliqueTaskQuestion(mode).endsWith("?"));
  }
});

test("clique task labels use the configured graph-theoretic distinction", () => {
  assert.equal(getCliqueTaskLabel("maximal"), "Clique massimali");
  assert.equal(getCliqueTaskLabel("all"), "Tutte le clique");
  assert.equal(getCliqueTaskLabel("maximum"), "Clique di taglia massima");
  assert.equal(getCliqueTaskLabel(undefined), "Clique massimali");
});

test("clique results display the question for the configured enumeration mode", async () => {
  const panel = await readFile(new URL("../src/lib/kliqueasp/components/SolverPanel.svelte", import.meta.url), "utf8");
  assert.match(panel, /taskQuestion = getCliqueTaskQuestion\(stats\?\.cliqueMode/);
  assert.match(panel, /<p class="task-question">\{taskQuestion\}<\/p>/);
  const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  assert.match(graphApp, /activeCliqueTaskLabel = getCliqueTaskLabel\(activeCliqueMode\)/);
  assert.match(graphApp, /analysis-clique-label">\{solverRunning \? "Calcolo in corso…" : clingoWorkerStatus === "error" \? "Riavvia analisi" : activeCliqueTaskLabel\}/);
  assert.match(graphApp, /getCliqueTaskLabel\(state\.clique\?\.stats\?\.cliqueMode\)/);
});
