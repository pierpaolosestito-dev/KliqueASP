import assert from "node:assert/strict";
import test from "node:test";
import { buildMaximumKPlexProgram } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { buildKPlexRequiredNodeConstraint } from "../src/lib/kliqueasp/graph/kplexMembershipDiagnosis.ts";
import {
  MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES,
  buildKPlexMaximumMembershipCounterfactualCsv,
  buildMinimumCostKPlexMembershipSelectionProgram,
  parseMinimumCostKPlexMembershipSelection,
  searchMinimumCostKPlexMaximumMembershipCounterfactual
} from "../src/lib/kliqueasp/graph/kplexMembershipCounterfactual.ts";
import { GRAPH_TASK_CONTRACTS } from "../src/lib/kliqueasp/graph/graphTaskContracts.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

const candidates = [
  { id: "d-a", sourceNodeId: "d", targetNodeId: "a", sourceNode: 4, targetNode: 1, edgeType: "contact", cost: 1, recordIndex: 20 },
  { id: "d-b", sourceNodeId: "d", targetNodeId: "b", sourceNode: 4, targetNode: 2, edgeType: "contact", cost: 1, recordIndex: 21 },
  { id: "d-c", sourceNodeId: "d", targetNodeId: "c", sourceNode: 4, targetNode: 3, edgeType: "contact", cost: 3, recordIndex: 22 }
];
const reverseIndex = { 1: "a", 2: "b", 3: "c", 4: "d" };
const candidateNodeIds = Object.values(reverseIndex);
const baseEdges = [[1, 2], [1, 3], [2, 3]];
const baseFacts = [
  ...candidateNodeIds.map((_, index) => `node(${index + 1}).`),
  ...baseEdges.flatMap(([left, right]) => [`edge(${left},${right}).`, `edge(${right},${left}).`])
].join("\n");

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') {
      assert.equal(field, "");
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\r" || character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
    } else field += character;
  }
  if (quoted) throw new Error("CSV fixture contains an unclosed quoted field");
  if (row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function edgeRecordsFor(selectedCandidates) {
  return [
    ...baseEdges.map(([left, right]) => ({ sourceNodeId: reverseIndex[left], targetNodeId: reverseIndex[right] })),
    ...selectedCandidates.map((candidate) => ({ sourceNodeId: candidate.sourceNodeId, targetNodeId: candidate.targetNodeId }))
  ];
}

test("the minimum-cost counterfactual requires proven global and target optima on the same modified graph", async () => {
  const runner = await createClingoWasmRunner();
  const evaluatedCosts = [];
  const outcome = await searchMinimumCostKPlexMaximumMembershipCounterfactual({
    s: 1,
    targetNodeId: "d",
    candidates,
    solveSelection: (program) => runner.run(program, ["--opt-mode=opt"]),
    evaluateGraph: async (selectedCandidates) => {
      evaluatedCosts.push(selectedCandidates.reduce((sum, candidate) => sum + candidate.cost, 0));
      const additions = selectedCandidates.flatMap(({ sourceNode, targetNode }) => [
        `edge(${sourceNode},${targetNode}).`, `edge(${targetNode},${sourceNode}).`
      ]).join("\n");
      const modifiedFacts = [baseFacts, additions].filter(Boolean).join("\n");
      const globalResult = await runner.run(
        `${modifiedFacts}\n\n${buildMaximumKPlexProgram(1)}`,
        ["--opt-mode=opt"]
      );
      const targetResult = await runner.run(
        `${modifiedFacts}\n\n${buildMaximumKPlexProgram(1)}\n${buildKPlexRequiredNodeConstraint(4)}`,
        ["--opt-mode=opt"]
      );
      return {
        globalResult,
        targetResult,
        reverseIndex,
        candidateNodeIds,
        edgeRecords: edgeRecordsFor(selectedCandidates)
      };
    }
  });

  assert.equal(outcome.status, "found");
  assert.equal(outcome.result.outcome, "included-in-maximum");
  assert.equal(outcome.result.globalMaximumSize, 3);
  assert.equal(outcome.result.maximumContainingSize, 3);
  assert.deepEqual(outcome.result.selectedEdges.map(({ id }) => id).sort(), ["d-a", "d-b"]);
  assert.equal(outcome.result.totalCost, 2);
  assert.equal(outcome.result.testedCandidateSets, 4);
  assert.deepEqual(evaluatedCosts, [0, 1, 1, 2]);
  assert.deepEqual(outcome.result.witnessNodeIds.sort(), ["a", "b", "d"]);
  const contract = GRAPH_TASK_CONTRACTS.kPlex.supportingQueries.find(
    ({ id }) => id === "kPlexMaximumMembershipCounterfactual"
  );
  assert.deepEqual(Object.keys(outcome.result).sort(), [...contract.resultFields].sort());

  const csv = buildKPlexMaximumMembershipCounterfactualCsv({
    result: outcome.result,
    sourceIdByNodeId: { a: "A", b: "B", c: "C", d: "D" },
    selectedGroup: "cohort"
  });
  assert.match(csv, /k_plex_maximum_membership_counterfactual/);
  assert.match(csv, /cohort/);
  const rows = parseCsv(csv);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.length === rows[0].length));
  assert.deepEqual(rows.slice(1).map((row) => row[0]), ["selected_candidate", "selected_candidate"]);
  const candidateColumn = rows[0].indexOf("candidate_edge_id");
  assert.deepEqual(rows.slice(1).map((row) => row[candidateColumn]).sort(), ["d-a", "d-b"]);
  const witnessColumn = rows[0].indexOf("witness_node_ids_json");
  assert.deepEqual(JSON.parse(rows[1][witnessColumn]), ["A", "B", "D"]);
});

test("the counterfactual returns zero-edit membership and rejects unsupported or unproved cases", async () => {
  let evaluations = 0;
  const noEdit = await searchMinimumCostKPlexMaximumMembershipCounterfactual({
    s: 1,
    targetNodeId: "a",
    candidates: [],
    solveSelection: async () => { throw new Error("no selector call expected"); },
    evaluateGraph: async () => {
      evaluations += 1;
      return {
        globalResult: { Result: "OPTIMUM FOUND", Call: [{ Witnesses: [{ Value: ["in(1)", "in(2)"] }] }] },
        targetResult: { Result: "OPTIMUM FOUND", Call: [{ Witnesses: [{ Value: ["in(1)", "in(2)"] }] }] },
        reverseIndex: { 1: "a", 2: "b" },
        candidateNodeIds: ["a", "b"],
        edgeRecords: [{ sourceNodeId: "a", targetNodeId: "b" }]
      };
    }
  });
  assert.equal(evaluations, 1);
  assert.equal(noEdit.status, "found");
  assert.equal(noEdit.result.totalCost, 0);
  assert.deepEqual(noEdit.result.selectedEdges, []);
  const noEditRows = parseCsv(buildKPlexMaximumMembershipCounterfactualCsv({
    result: noEdit.result,
    sourceIdByNodeId: {},
    selectedGroup: "cohort"
  }));
  assert.equal(noEditRows[1][0], "no_edit_needed");
  assert.equal(noEditRows[1][noEditRows[0].indexOf("analysis_group")], "cohort");

  const runner = await createClingoWasmRunner();
  const noCandidateBaseEdges = [[1, 2], [1, 3]];
  const noCandidateBaseFacts = [
    ...candidateNodeIds.map((_, index) => `node(${index + 1}).`),
    ...noCandidateBaseEdges.flatMap(([left, right]) => [`edge(${left},${right}).`, `edge(${right},${left}).`])
  ].join("\n");
  const noCandidateWorks = await searchMinimumCostKPlexMaximumMembershipCounterfactual({
    s: 1,
    targetNodeId: "d",
    candidates: [{
      id: "b-c", sourceNodeId: "b", targetNodeId: "c", sourceNode: 2, targetNode: 3,
      edgeType: "contact", cost: 1, recordIndex: 23
    }],
    solveSelection: (program) => runner.run(program, ["--opt-mode=opt"]),
    evaluateGraph: async (selectedCandidates) => {
      const additions = selectedCandidates.flatMap(({ sourceNode, targetNode }) => [
        `edge(${sourceNode},${targetNode}).`, `edge(${targetNode},${sourceNode}).`
      ]).join("\n");
      const facts = [noCandidateBaseFacts, additions].filter(Boolean).join("\n");
      const maximumProgram = buildMaximumKPlexProgram(1);
      return {
        globalResult: await runner.run(`${facts}\n\n${maximumProgram}`, ["--opt-mode=opt"]),
        targetResult: await runner.run(
          `${facts}\n\n${maximumProgram}\n${buildKPlexRequiredNodeConstraint(4)}`,
          ["--opt-mode=opt"]
        ),
        reverseIndex,
        candidateNodeIds,
        edgeRecords: [
          ...noCandidateBaseEdges.map(([left, right]) => ({ sourceNodeId: reverseIndex[left], targetNodeId: reverseIndex[right] })),
          ...selectedCandidates.map(({ sourceNodeId, targetNodeId }) => ({ sourceNodeId, targetNodeId }))
        ]
      };
    }
  });
  assert.equal(noCandidateWorks.status, "not-found");
  assert.equal(noCandidateWorks.testedCandidateSets, 2);

  const exhaustiveReverseIndex = { 1: "a", 2: "b", 3: "c", 4: "d" };
  const exhaustiveNodeIds = Object.values(exhaustiveReverseIndex);
  const possibleBasePairs = [[1, 2], [1, 3], [2, 3]];
  const exhaustiveCandidates = [
    { id: "d-a", sourceNodeId: "d", targetNodeId: "a", sourceNode: 4, targetNode: 1, edgeType: "contact", cost: 1, recordIndex: 30 },
    { id: "d-b", sourceNodeId: "d", targetNodeId: "b", sourceNode: 4, targetNode: 2, edgeType: "contact", cost: 2, recordIndex: 31 },
    { id: "d-c", sourceNodeId: "d", targetNodeId: "c", sourceNode: 4, targetNode: 3, edgeType: "contact", cost: 2, recordIndex: 32 }
  ];
  const graphHasSPlex = (mask, edges, s) => {
    const vertices = [1, 2, 3, 4].filter((vertex) => (mask & (1 << (vertex - 1))) !== 0);
    return vertices.every((left) => vertices.filter((right) => right !== left &&
      !edges.has(left < right ? `${left},${right}` : `${right},${left}`)).length < s);
  };
  let sawTwoPlexTargetExcludedWithoutEdits = false;
  for (const s of [1, 2]) {
    for (let baseMask = 0; baseMask < 1 << possibleBasePairs.length; baseMask += 1) {
      const baseEdgesForGraph = possibleBasePairs.filter((_, index) => (baseMask & (1 << index)) !== 0);
      const edgeRecords = baseEdgesForGraph.map(([left, right]) => ({
        sourceNodeId: exhaustiveReverseIndex[left], targetNodeId: exhaustiveReverseIndex[right]
      }));
      const expectedCosts = [];
      let baselineGlobalMaximum = 0;
      let baselineTargetMaximum = 0;
      for (let additionMask = 0; additionMask < 1 << exhaustiveCandidates.length; additionMask += 1) {
        const selectedCandidates = exhaustiveCandidates.filter((_, index) => (additionMask & (1 << index)) !== 0);
        const edges = new Set([...baseEdgesForGraph, ...selectedCandidates.map(({ sourceNode, targetNode }) => [sourceNode, targetNode])]
          .map(([left, right]) => left < right ? `${left},${right}` : `${right},${left}`));
        const globalMaximum = Math.max(...Array.from({ length: 15 }, (_, index) => index + 1)
          .filter((mask) => graphHasSPlex(mask, edges, s))
          .map((mask) => mask.toString(2).replace(/0/g, "").length));
        const targetMaximum = Math.max(...Array.from({ length: 15 }, (_, index) => index + 1)
          .filter((mask) => (mask & (1 << 3)) !== 0 && graphHasSPlex(mask, edges, s))
          .map((mask) => mask.toString(2).replace(/0/g, "").length));
        if (additionMask === 0) {
          baselineGlobalMaximum = globalMaximum;
          baselineTargetMaximum = targetMaximum;
        }
        if (globalMaximum === targetMaximum) {
          expectedCosts.push(selectedCandidates.reduce((sum, candidate) => sum + candidate.cost, 0));
        }
      }
      if (s === 2 && baselineTargetMaximum < baselineGlobalMaximum) {
        sawTwoPlexTargetExcludedWithoutEdits = true;
      }
      const expectedMinimumCost = Math.min(...expectedCosts);
      const baseFactsForGraph = [
        ...exhaustiveNodeIds.map((_, index) => `node(${index + 1}).`),
        ...baseEdgesForGraph.flatMap(([left, right]) => [`edge(${left},${right}).`, `edge(${right},${left}).`])
      ].join("\n");
      const outcome = await searchMinimumCostKPlexMaximumMembershipCounterfactual({
        s,
        targetNodeId: "d",
        candidates: exhaustiveCandidates,
        solveSelection: (program) => runner.run(program, ["--opt-mode=opt"]),
        evaluateGraph: async (selectedCandidates) => {
          const additions = selectedCandidates.flatMap(({ sourceNode, targetNode }) => [
            `edge(${sourceNode},${targetNode}).`, `edge(${targetNode},${sourceNode}).`
          ]).join("\n");
          const facts = [baseFactsForGraph, additions].filter(Boolean).join("\n");
          const maximumProgram = buildMaximumKPlexProgram(s);
          const globalResult = await runner.run(`${facts}\n\n${maximumProgram}`, ["--opt-mode=opt"]);
          const targetResult = await runner.run(
            `${facts}\n\n${maximumProgram}\n${buildKPlexRequiredNodeConstraint(4)}`,
            ["--opt-mode=opt"]
          );
          return {
            globalResult,
            targetResult,
            reverseIndex: exhaustiveReverseIndex,
            candidateNodeIds: exhaustiveNodeIds,
            edgeRecords: [
              ...edgeRecords,
              ...selectedCandidates.map((candidate) => ({
                sourceNodeId: candidate.sourceNodeId, targetNodeId: candidate.targetNodeId
              }))
            ]
          };
        }
      });
      assert.equal(outcome.status, "found", `base graph ${baseMask}`);
      assert.equal(outcome.result.totalCost, expectedMinimumCost, `s=${s}, base graph ${baseMask}`);
      assert.equal(outcome.result.maximumContainingSize, outcome.result.globalMaximumSize,
        `proven target membership s=${s}, base graph ${baseMask}`);
    }
  }
  assert.equal(sawTwoPlexTargetExcludedWithoutEdits, true,
    "the oracle must exercise a genuine s=2 target exclusion on an unmodified graph");

  assert.throws(() => buildMinimumCostKPlexMembershipSelectionProgram(
    Array.from({ length: MAX_KPLEX_MEMBERSHIP_COUNTERFACTUAL_CANDIDATES + 1 }, (_, index) => ({
      ...candidates[0], id: `candidate-${index}`, recordIndex: 100 + index
    }))
  ), /al massimo/);
  assert.throws(() => parseMinimumCostKPlexMembershipSelection([
    { Value: ["cf_kpmc_add_edge(1)"], Costs: [2] }
  ], candidates), /costo ASP/);
  await assert.rejects(() => searchMinimumCostKPlexMaximumMembershipCounterfactual({
    s: 1,
    targetNodeId: "d",
    candidates: [],
    solveSelection: async () => ({}),
    evaluateGraph: async () => ({
      globalResult: { Result: "SATISFIABLE", Call: [{ Witnesses: [{ Value: ["in(1)"] }] }] },
      targetResult: {},
      reverseIndex,
      candidateNodeIds,
      edgeRecords: []
    })
  }), /non ha provato l'ottimo/);
});
