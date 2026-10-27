import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildContextualCliqueIncidenceIndex,
  buildContextualCliqueCsv,
  getContextualCliqueEvidenceCounts,
  buildContextualCliqueProgram,
  parseContextualCliqueResults,
  validateContextualCliqueConfig
} from "../src/lib/kliqueasp/graph/contextualCliqueTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import { hasCompleteOptimalModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { GRAPH_TASK_CONTRACTS } from "../src/lib/kliqueasp/graph/graphTaskContracts.ts";

const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label", typeField: "$.kind", groupFields: ["$.groups"] },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      typeField: "$.kind",
      direction: "undirected",
      identity: "multigraph"
    }
  }
};

const contextualCliqueConfig = {
  focusNodeTypes: ["person"],
  contextNodeTypes: ["place"],
  edgeTypes: ["person-place"],
  minimumSize: 3
};

function makeGraph() {
  return normalizeGraphData({
    nodes: [
      { id: "p1", label: "Person 1", kind: "person", groups: ["selected"] },
      { id: "p2", label: "Person 2", kind: "person", groups: ["selected"] },
      { id: "p3", label: "Person 3", kind: "person", groups: ["selected"] },
      { id: "p4", label: "Person 4", kind: "person", groups: ["other"] },
      { id: "a", label: "Context A", kind: "place" },
      { id: "b", label: "Context B", kind: "place" },
      { id: "c", label: "Context C", kind: "place" }
    ],
    edges: [
      { id: "p1-a", from: "p1", to: "a", kind: "person-place" },
      { id: "p2-a", from: "p2", to: "a", kind: "person-place" },
      { id: "p4-a", from: "p4", to: "a", kind: "person-place" },
      { id: "p2-b", from: "p2", to: "b", kind: "person-place" },
      { id: "p3-b", from: "p3", to: "b", kind: "person-place" },
      { id: "p1-c", from: "p1", to: "c", kind: "person-place" },
      { id: "p3-c", from: "p3", to: "c", kind: "person-place" },
      { id: "p3-a-wrong-type", from: "p3", to: "a", kind: "person-person" },
      { id: "p4-b-wrong-type", from: "p4", to: "b", kind: "person-person" }
    ]
  }, graphConfig);
}

function compileAndParse(graph, selectedGroup = "") {
  const facts = buildAspFactsFromGraph(graph);
  const program = buildContextualCliqueProgram(contextualCliqueConfig, graph.direction, { selectedGroup });
  const incidenceIndex = buildContextualCliqueIncidenceIndex(graph, contextualCliqueConfig, facts.indexByNodeId);
  return {
    facts,
    program,
    incidenceIndex,
    parse: (witnesses) => parseContextualCliqueResults(
      witnesses,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      incidenceIndex,
      contextualCliqueConfig.minimumSize
    )
  };
}

test("il gruppo contestuale massimizza la coesione pairwise anche quando ogni coppia usa un contesto diverso", async () => {
  const graph = makeGraph();
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.direction, "undirected");
  const { facts, program, incidenceIndex, parse } = compileAndParse(graph);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts.facts}\n${program}`, ["--opt-mode=optN"]);

  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteOptimalModelEnumeration(result), true, "tutti i gruppi massimi devono essere enumerati");
  const groups = parse(result.Call?.[0]?.Witnesses);
  assert.deepEqual(Object.keys(groups[0]).sort(), [...GRAPH_TASK_CONTRACTS.contextualClique.resultFields].sort());
  assert.deepEqual(groups.map(({ sourceNodeIds }) => sourceNodeIds.sort()), [
    ["p1", "p2", "p3"],
    ["p1", "p2", "p4"]
  ]);

  const p1p2p3 = groups.find(({ sourceNodeIds }) => sourceNodeIds.includes("p3"));
  assert.ok(p1p2p3);
  assert.equal(p1p2p3.pairWitnesses.length, 3);
  assert.deepEqual(new Set(p1p2p3.pairWitnesses.map(({ contextSourceId }) => contextSourceId)), new Set(["a", "b", "c"]));
  assert.ok(p1p2p3.pairWitnesses.every(({ supportingEdges }) => supportingEdges.length === 2));
  assert.ok(p1p2p3.pairWitnesses.every(({ supportingEdges }) =>
    supportingEdges.every(({ edgeId }) => !edgeId.includes("wrong-type"))));
  assert.ok(incidenceIndex.size > 0);
  const csv = buildContextualCliqueCsv(groups, contextualCliqueConfig, "");
  assert.match(csv, /"record_type","group_index","group_size"/);
  assert.equal((csv.match(/pair_witness/g) ?? []).length, 6, "ogni coppia dei due gruppi ottimi ha un witness esportato");
});

test("il gruppo selezionato limita solo i nodi focali e non elimina i contesti testimoni", async () => {
  const graph = makeGraph();
  const { facts, program, parse } = compileAndParse(graph, "selected");
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts.facts}\n${program}`);

  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteOptimalModelEnumeration(result), true);
  const groups = parse(result.Call?.[0]?.Witnesses);
  assert.deepEqual(groups.map(({ sourceNodeIds }) => sourceNodeIds.sort()), [["p1", "p2", "p3"]]);
  assert.ok(groups[0].pairWitnesses.every(({ contextSourceId }) => ["a", "b", "c"].includes(contextSourceId)));
});

test("il riepilogo distingue le coppie focali dai testimoni coppia-contesto", () => {
  const evidence = getContextualCliqueEvidenceCounts({
    pairWitnesses: [
      { focusNodeIds: ["a", "b"] },
      { focusNodeIds: ["b", "a"] },
      { focusNodeIds: ["a", "c"] },
      { focusNodeIds: ["b", "c"] }
    ]
  });
  assert.deepEqual(evidence, { distinctPairCount: 3, pairContextWitnessCount: 4 });
});

test("il parser elimina i witness subottimi e conserva solo i gruppi di cardinalità ottima", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p1", kind: "person" }, { id: "p2", kind: "person" },
      { id: "p3", kind: "person" }, { id: "p4", kind: "person" },
      { id: "shared", kind: "place" }
    ],
    edges: ["p1", "p2", "p3", "p4"].map((personId, index) => ({
      id: `edge-${index + 1}`, from: personId, to: "shared", kind: "person-place"
    }))
  }, graphConfig);
  const facts = buildAspFactsFromGraph(graph);
  const program = buildContextualCliqueProgram(contextualCliqueConfig, graph.direction);
  const incidenceIndex = buildContextualCliqueIncidenceIndex(graph, contextualCliqueConfig, facts.indexByNodeId);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts.facts}\n${program}`, ["--opt-mode=opt"]);

  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteOptimalModelEnumeration(result), true);
  const optimumWitness = result.Call?.[0]?.Witnesses?.find(({ Value }) =>
    Array.isArray(Value) && Value.filter((atom) => atom.startsWith("in(")).length === 4
  );
  assert.ok(optimumWitness, "clingo deve restituire il witness ottimo a quattro nodi");
  const optimumMemberIndexes = new Set(optimumWitness.Value
    .map((atom) => /^in\((\d+)\)$/.exec(atom))
    .filter(Boolean)
    .map((match) => Number(match[1])));
  const smallerMemberIndexes = new Set([...optimumMemberIndexes].slice(0, 3));
  const suboptimalWitness = {
    ...optimumWitness,
    Value: optimumWitness.Value.filter((atom) => {
      const member = /^in\((\d+)\)$/.exec(atom);
      if (member) return smallerMemberIndexes.has(Number(member[1]));
      const pairContext = /^contextual_pair_context\((\d+),(\d+),\d+\)$/.exec(atom);
      return !pairContext || (smallerMemberIndexes.has(Number(pairContext[1])) && smallerMemberIndexes.has(Number(pairContext[2])));
    })
  };
  const groups = parseContextualCliqueResults(
    [suboptimalWitness, optimumWitness], facts.reverseIndex, facts.reverseSourceIndex, incidenceIndex,
    contextualCliqueConfig.minimumSize
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].nodeIds.length, 4);
});

test("la configurazione Psychology trova il massimo contestuale sul dataset del caso studio", async () => {
  const graphData = JSON.parse(fs.readFileSync(new URL("../src/lib/kliqueasp/data/my-dataset.json", import.meta.url), "utf8"));
  const psychologyConfig = JSON.parse(fs.readFileSync(new URL("../src/lib/kliqueasp/config/graph.config.json", import.meta.url), "utf8"));
  const graph = normalizeGraphData(graphData, psychologyConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const taskConfig = psychologyConfig.graphAnalysis.contextualClique;
  const facts = buildAspFactsFromGraph(graph);
  const program = buildContextualCliqueProgram(taskConfig, graph.direction);
  const incidenceIndex = buildContextualCliqueIncidenceIndex(graph, taskConfig, facts.indexByNodeId);
  const runner = await createClingoWasmRunner();
  const fullProgram = `${facts.facts}\n${program}`;
  const result = await runner.run(fullProgram, ["--opt-mode=opt", "--time-limit=20"]);
  const allMaximaResult = await runner.run(fullProgram, ["--opt-mode=optN", "--time-limit=20"]);

  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteOptimalModelEnumeration(result), true);
  assert.equal(allMaximaResult.Result, "OPTIMUM FOUND", allMaximaResult.Error ?? JSON.stringify(allMaximaResult));
  assert.equal(hasCompleteOptimalModelEnumeration(allMaximaResult), true);
  const groups = parseContextualCliqueResults(
    result.Call?.[0]?.Witnesses,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    incidenceIndex,
    taskConfig.minimumSize
  );
  assert.equal(groups.length, 1, "opt restituisce un solo gruppo massimo dopo il filtro dei witness intermedi");
  assert.equal(groups[0].nodeIds.length, 30);
  const supportedPairs = new Set(groups[0].pairWitnesses.map(({ focusSourceIds }) => [...focusSourceIds].sort().join("\u0000")));
  assert.equal(supportedPairs.size, 30 * 29 / 2, "ogni coppia del gruppo deve avere almeno un contesto condiviso");
  assert.deepEqual(getContextualCliqueEvidenceCounts(groups[0]), {
    distinctPairCount: 435,
    pairContextWitnessCount: 452
  }, "il conteggio separa le coppie distinte dai contesti aggiuntivi condivisi");
  const allMaximumGroups = parseContextualCliqueResults(
    allMaximaResult.Call?.[0]?.Witnesses,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    incidenceIndex,
    taskConfig.minimumSize
  );
  assert.equal(allMaximumGroups.length, 1, "sul dataset del caso studio esiste un solo gruppo contestuale ottimo distinto");
  assert.deepEqual(allMaximumGroups[0].sourceNodeIds, groups[0].sourceNodeIds);
});

test("la configurazione richiede liste tipizzate e una semantica non orientata esplicita", () => {
  assert.deepEqual(validateContextualCliqueConfig(contextualCliqueConfig), contextualCliqueConfig);
  assert.throws(() => validateContextualCliqueConfig({ ...contextualCliqueConfig, minimumSize: 1 }), /minimumSize/);
  assert.throws(() => validateContextualCliqueConfig({ ...contextualCliqueConfig, edgeTypes: ["person-place", "person-place"] }), /duplicati/);
  assert.throws(() => buildContextualCliqueProgram(contextualCliqueConfig, "directed"), /non orientata/);

  const validConfig = { ...graphConfig, graphAnalysis: { contextualClique: contextualCliqueConfig } };
  const graph = normalizeGraphData({ nodes: [{ id: "p", kind: "person" }, { id: "c", kind: "place" }], edges: [] }, validConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  for (const invalidConfig of [
    { ...validConfig, graphMapping: { ...validConfig.graphMapping, edge: { ...validConfig.graphMapping.edge, direction: "directed" } } },
    { ...validConfig, graphMapping: { ...validConfig.graphMapping, node: { idField: "$.id" } } },
    { ...validConfig, graphAnalysis: { contextualClique: { ...contextualCliqueConfig, minimumSize: 1 } } },
    { ...validConfig, graphAnalysis: { contextualClique: { ...contextualCliqueConfig, edgeTypes: ["person-place", " person-place "] } } }
  ]) {
    const invalidGraph = normalizeGraphData({ nodes: [{ id: "p", kind: "person" }, { id: "c", kind: "place" }], edges: [] }, invalidConfig);
    assert.equal(invalidGraph.valid, false);
    assert.ok(invalidGraph.diagnostics.some(({ severity }) => severity === "error"));
  }
});
