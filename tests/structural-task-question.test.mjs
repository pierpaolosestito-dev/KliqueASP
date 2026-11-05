import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getStructuralTaskQuestion } from "../src/lib/kliqueasp/graph/structuralTaskQuestion.ts";

const base = {
  parameter: 2,
  directedGraph: false,
  kCoreMode: "",
  pathTemporalSemantics: "static",
  strictTemporalOrder: false
};

test("structural task questions cover every primary task with its selected parameter", () => {
  const cases = [
    ["kPlex", "k-plex più grande", "s=2"],
    ["maximalKPlex", "non possono essere estesi", "s=2"],
    ["kCore", "k-core", "k=2"],
    ["components", "componenti connesse massimali", "non orientata"],
    ["weakComponents", "ignorando la direzione", ""],
    ["strongComponents", "reciprocamente raggiungibili", "direzione"],
    ["path", "lunghezza minima", "entro 2 archi"],
    ["typedPath", "cammino semplice", "sequenza di tipi selezionata"],
    ["dominatingSet", "più piccolo insieme di candidati", "nodi obiettivo"],
    ["minimumNodeSeparator", "minor numero di nodi", "terminali"],
    ["minimumCostNodeSeparator", "costo totale più basso", "nodi rimovibili"],
    ["minimumEdgeSeparator", "minor numero di archi", "taglio"],
    ["minimumCostEdgeSeparator", "costo totale più basso", "taglio"],
    ["communities", "massimizza la modularità", "vincoli configurati"]
  ];
  for (const [task, ...phrases] of cases) {
    const question = getStructuralTaskQuestion({ ...base, task });
    for (const phrase of phrases) assert.ok(question.includes(phrase), `${task}: ${question}`);
    assert.ok(question.endsWith("?"), `${task} must be presented as a question`);
  }
});

test("directed k-core and typed-path questions expose the selected degree and temporal semantics", () => {
  assert.match(getStructuralTaskQuestion({
    ...base,
    task: "kCore",
    directedGraph: true,
    kCoreMode: "in"
  }), /predecessori/);
  assert.match(getStructuralTaskQuestion({
    ...base,
    task: "kCore",
    directedGraph: true,
    kCoreMode: "out"
  }), /successori/);
  assert.match(getStructuralTaskQuestion({
    ...base,
    task: "kCore",
    directedGraph: true,
    kCoreMode: "mutual"
  }), /vicini reciproci/);
  assert.match(getStructuralTaskQuestion({ ...base, task: "typedPath", pathTemporalSemantics: "coValid" }), /validi allo stesso istante/);
  assert.match(getStructuralTaskQuestion({ ...base, task: "typedPath", pathTemporalSemantics: "orderedByStart" }), /non decrescenti/);
  assert.match(getStructuralTaskQuestion({
    ...base,
    task: "typedPath",
    pathTemporalSemantics: "orderedByStart",
    strictTemporalOrder: true
  }), /strettamente crescenti/);
});

test("the structural panel displays the question generated from its active task settings", async () => {
  const panel = await readFile(new URL("../src/lib/kliqueasp/components/StructuralAnalysisPanel.svelte", import.meta.url), "utf8");
  assert.match(panel, /taskQuestion = getStructuralTaskQuestion\(/);
  assert.match(panel, /<p class="panel-description">\{taskQuestion\}<\/p>/);
  assert.doesNotMatch(panel, /Trova un percorso semplice tra i due nodi rispettando il limite e i tipi configurati/);
});
