import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
const graphApp = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");

test("optional structural explanations and profiles are grouped under task-specific disclosures", () => {
  const disclosures = panel.match(/<details class="optional-task-options">[\s\S]*?<\/details>/g) ?? [];
  assert.equal(disclosures.length, 4);

  const expectedOptions = [
    ["explainPathMinimality", "Certificazione", "certificato attivo"],
    ["explainTypedPathNoRoute", "Diagnosi", "diagnosi attiva"],
    ["explainCommunityContributions", "explainCommunityInfeasibility", "2 attive", "1 attiva"],
    ["includeKCoreNumbers", "explainKCoreExclusions", "2 attive", "1 attiva"]
  ];
  for (const option of expectedOptions) {
    const disclosure = disclosures.find((source) => option.some((name) => source.includes(`bind:checked={${name}}`)));
    assert.ok(disclosure, `disclosure missing option: ${option[0]}`);
    assert.match(disclosure, /<summary>Altre opzioni/);
    assert.match(disclosure, /bind:checked=/);
  }

  for (const [index, task] of ["path", "typedPath", "communities", "kCore"].entries()) {
    const disclosureStart = panel.indexOf(disclosures[index]);
    const taskStart = panel.lastIndexOf(`{#if task === "${task}"}`, disclosureStart);
    assert.ok(taskStart >= 0, `${task} options should only appear for that task`);
  }
  assert.match(disclosures[2], /explainCommunityContributions && explainCommunityInfeasibility/);
  assert.match(disclosures[3], /includeKCoreNumbers && explainKCoreExclusions/);
});

test("advanced-option values remain in the saved and restored analysis state", () => {
  for (const field of [
    "includeKCoreNumbers",
    "explainKCoreExclusions",
    "explainCommunityContributions",
    "explainCommunityInfeasibility",
    "explainPathMinimality",
    "explainTypedPathNoRoute"
  ]) {
    const prop = `structural${field[0].toUpperCase()}${field.slice(1)}`;
    assert.match(graphApp, new RegExp(`${field}: ${prop}`), `${field} should be captured in the analysis snapshot`);
    assert.match(graphApp, new RegExp(`${prop} = structural\.${field} === true`), `${field} should be restored from the analysis snapshot`);
  }
});
