import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_COMMUNITY_TOPOLOGY_EDGE_EDITS,
  buildCommunityTopologyCounterfactualCsv,
  buildMinimumCostCommunityEditSelectionProgram,
  classifyCommunityTopologyCounterfactual,
  communityTopologyCounterfactualMeetsTarget,
  parseCommunityEditSelectionWitnesses,
  searchMinimumCostCommunityTopologyCounterfactual,
  validateCommunityTopologyCounterfactualConfig
} from "../src/lib/kliqueasp/graph/communityTopologyCounterfactual.ts";
import {
  buildCommunityPairMembershipPrograms,
  buildModularityFacts,
  getStructuralSolverOptions,
  parseWitnessModularityPartitions,
  selectMaximumModularityPartitions
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";

test("la configurazione degli edit topologici è finita, tipizzata e autonoma", () => {
  const valid = {
    edgeEdits: [
      { id: "join-a-b", action: "add", sourceNodeId: "a", targetNodeId: "b", cost: 2 },
      { id: "remove-e3", action: "remove", edgeId: "e3", cost: 1 }
    ]
  };
  assert.equal(validateCommunityTopologyCounterfactualConfig(valid, false), "");
  assert.equal(validateCommunityTopologyCounterfactualConfig({
    edgeEdits: [{ ...valid.edgeEdits[0], weight: 0.5 }]
  }, true), "");
  assert.match(validateCommunityTopologyCounterfactualConfig({
    edgeEdits: [{ ...valid.edgeEdits[0], weight: 0.5 }]
  }, false), /weight è ammesso solo/);
  assert.match(validateCommunityTopologyCounterfactualConfig({
    edgeEdits: [{ ...valid.edgeEdits[0], weight: 0 }]
  }, true), /weight deve essere un numero positivo/);
  assert.match(validateCommunityTopologyCounterfactualConfig({
    edgeEdits: [
      valid.edgeEdits[1],
      { ...valid.edgeEdits[1], id: "remove-e3-again" }
    ]
  }, false), /ripete la rimozione/);
  assert.match(validateCommunityTopologyCounterfactualConfig({
    edgeEdits: Array.from({ length: MAX_COMMUNITY_TOPOLOGY_EDGE_EDITS + 1 }, (_, index) => ({
      id: `e${index}`, action: "remove", edgeId: `edge-${index}`, cost: 1
    }))
  }, false), /al massimo 8 candidati/);
  assert.match(validateCommunityTopologyCounterfactualConfig({
    edgeEdits: [{ ...valid.edgeEdits[0], cost: 0 }]
  }, false), /cost deve essere un intero positivo/);
  assert.match(validateCommunityTopologyCounterfactualConfig({
    edgeEdits: [
      { id: "expensive-a", action: "remove", edgeId: "a", cost: Number.MAX_SAFE_INTEGER },
      { id: "expensive-b", action: "remove", edgeId: "b", cost: 1 }
    ]
  }, false), /somma massima dei costi/);
});

test("clingo enumera ogni insieme di edit in ordine di costo minimo e accetta l'insieme vuoto", async () => {
  const edits = [{ cost: 3 }, { cost: 1 }, { cost: 2 }];
  const runner = await createClingoWasmRunner();
  const excluded = [];
  const selectedSets = [];
  const costs = [];

  for (let attempt = 0; attempt <= 2 ** edits.length; attempt += 1) {
    const result = await runner.run(
      buildMinimumCostCommunityEditSelectionProgram(edits, excluded),
      ["--opt-mode=opt"]
    );
    if (result.Result === "UNSATISFIABLE") break;
    assert.equal(result.Result, "OPTIMUM FOUND");
    const selection = parseCommunityEditSelectionWitnesses(result.Call?.[0]?.Witnesses, edits.map((edit) => edit.cost));
    selectedSets.push(selection.indexes);
    costs.push(selection.totalCost);
    excluded.push(selection.indexes);
  }

  assert.equal(selectedSets.length, 2 ** edits.length);
  assert.deepEqual(costs, [...costs].sort((left, right) => left - right));
  const signatures = selectedSets.map((indexes) => indexes.join(",")).sort();
  const expected = Array.from({ length: 2 ** edits.length }, (_, mask) =>
    edits.flatMap((_, index) => mask & (1 << index) ? [index] : []).join(",")
  ).sort();
  assert.deepEqual(signatures, expected);
  assert.equal(selectedSets[0].length, 0);
  assert.throws(() => parseCommunityEditSelectionWitnesses([
    { Value: ["community_selected_edit(1)"], Costs: [0] }
  ], [2]), /non coincide/);
  assert.throws(() => parseCommunityEditSelectionWitnesses([
    { Value: ["community_selected_edit(2)"], Costs: [2] }
  ], [2]), /fuori dominio/);
});

test("la classificazione controfattuale richiede score esatti coerenti con la relazione richiesta", () => {
  const always = classifyCommunityTopologyCounterfactual(["a", "b"], "always", 12, 8);
  assert.equal(always.relation, "always");
  assert.equal(communityTopologyCounterfactualMeetsTarget(always, "always"), true);
  assert.equal(communityTopologyCounterfactualMeetsTarget(always, "sometimes"), false);
  assert.equal(classifyCommunityTopologyCounterfactual(["a", "b"], "sometimes", 12, 12).relation, "sometimes");
  assert.equal(classifyCommunityTopologyCounterfactual(["a", "b"], "never", 8, 12).relation, "never");
  assert.equal(classifyCommunityTopologyCounterfactual(["a", "b"], "always", 8, 7).relation, "always");
  assert.equal(communityTopologyCounterfactualMeetsTarget(
    classifyCommunityTopologyCounterfactual(["a", "b"], "always", 8, 7),
    "sometimes"
  ), false);
  assert.throws(() => classifyCommunityTopologyCounterfactual(["a", "b"], "always", null, null), /non ha una partizione/);
});

test("la ricerca restituisce il primo costo minimo ASP che cambia la relazione negli ottimi", async () => {
  const runner = await createClingoWasmRunner();
  const nodeIds = ["a", "b", "c"];
  const reverseIndex = { 1: "a", 2: "b", 3: "c" };
  const indexByNodeId = new Map(nodeIds.map((nodeId, index) => [nodeId, index + 1]));
  const edits = [
    { id: "add-ac", action: "add", sourceNodeId: "a", targetNodeId: "c", cost: 4 },
    { id: "add-bc", action: "add", sourceNodeId: "b", targetNodeId: "c", cost: 1 }
  ];
  const baseEdges = [{ source: 1, target: 2 }];
  const outcome = await searchMinimumCostCommunityTopologyCounterfactual({
    edits,
    nodeIds: ["a", "c"],
    requestedRelation: "always",
    solveSelection: (program) => runner.run(program, ["--opt-mode=opt"]),
    evaluateGraph: async (editIndexes) => {
      const edgeRecords = [...baseEdges];
      for (const editIndex of editIndexes) {
        const edit = edits[editIndex];
        if (edit.action === "add") {
          edgeRecords.push({ source: indexByNodeId.get(edit.sourceNodeId), target: indexByNodeId.get(edit.targetNodeId) });
        }
      }
      const facts = buildModularityFacts([1, 2, 3], edgeRecords, { includePairwiseObjective: true });
      const pairwiseOptions = facts.pairwiseObjectiveOffset === undefined
        ? {}
        : { pairwiseObjectiveOffset: facts.pairwiseObjectiveOffset };
      const programs = buildCommunityPairMembershipPrograms(pairwiseOptions, [1, 3]);
      const input = [facts.facts, facts.pairwiseObjectiveFacts].filter(Boolean).join("\n");
      const solve = async (program) => {
        const result = await runner.run(`${input}\n${program}\n`, getStructuralSolverOptions("communities"));
        if (result.Result === "UNSATISFIABLE") return null;
        assert.equal(result.Result, "OPTIMUM FOUND");
        const partitions = selectMaximumModularityPartitions(
          parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, reverseIndex)
        );
        assert.ok(partitions.length > 0);
        return partitions[0].scaledScore;
      };
      const togetherScaledScore = await solve(programs.together);
      const separateScaledScore = await solve(programs.separate);
      const denominator = 4n * BigInt(facts.totalWeight) ** 2n * BigInt(facts.resolutionDenominator);
      const globalScore = Math.max(...[togetherScaledScore, separateScaledScore].filter((score) => score !== null));
      return {
        togetherScaledScore,
        separateScaledScore,
        modularityDenominator: String(denominator),
        modularity: globalScore / Number(denominator)
      };
    }
  });

  assert.equal(outcome.status, "found");
  assert.equal(outcome.result.relation, "always");
  assert.deepEqual(outcome.result.selectedEdits.map(({ id }) => id), ["add-bc"]);
  assert.equal(outcome.result.totalEditCost, 1);
  assert.equal(outcome.result.testedEditSets, 2);
  assert.equal(outcome.result.candidateCount, 2);
  assert.equal(outcome.result.modularityDenominator, "16");
  const csv = buildCommunityTopologyCounterfactualCsv({
    result: outcome.result,
    sourceIdByNodeId: { a: "source-a", c: "source-c" },
    nodeLabels: { a: "Ada", c: "Carlo" },
    selectedGroup: "clinic",
    resolution: 1,
    weighted: false
  });
  assert.match(csv, /^"record_type","edit_id","edit_action"/);
  assert.match(csv, /add-bc/);
  assert.match(csv, /minimum configured edge-edit cost/);
});

test("la ricerca esaurisce tutti i sottoinsiemi quando nessuno raggiunge la relazione obiettivo", async () => {
  const runner = await createClingoWasmRunner();
  const edits = [
    { id: "edit-a", action: "remove", edgeId: "a", cost: 2 },
    { id: "edit-b", action: "remove", edgeId: "b", cost: 3 }
  ];
  const outcome = await searchMinimumCostCommunityTopologyCounterfactual({
    edits,
    nodeIds: ["a", "b"],
    requestedRelation: "never",
    solveSelection: (program) => runner.run(program, ["--opt-mode=opt"]),
    evaluateGraph: async () => ({
      togetherScaledScore: 10,
      separateScaledScore: 8,
      modularityDenominator: "16"
    })
  });
  assert.deepEqual(outcome, { status: "not-found", testedEditSets: 4, candidateCount: 2 });

  await assert.rejects(() => searchMinimumCostCommunityTopologyCounterfactual({
    edits,
    nodeIds: ["a", "b"],
    requestedRelation: "never",
    solveSelection: async () => ({ Result: "UNKNOWN" }),
    evaluateGraph: async () => ({ togetherScaledScore: 10, separateScaledScore: 8, modularityDenominator: "16" })
  }), /non ha provato il costo minimo/);
});

test("le aggiunte pesate restano nella stessa modularità esatta del grafo controfattuale", async () => {
  const runner = await createClingoWasmRunner();
  const edits = [{ id: "weighted-bc", action: "add", sourceNodeId: "b", targetNodeId: "c", cost: 1, weight: 1 }];
  const reverseIndex = { 1: "a", 2: "b", 3: "c" };
  const outcome = await searchMinimumCostCommunityTopologyCounterfactual({
    edits,
    nodeIds: ["a", "c"],
    requestedRelation: "always",
    solveSelection: (program) => runner.run(program, ["--opt-mode=opt"]),
    evaluateGraph: async (editIndexes) => {
      const edges = [{ source: 1, target: 2, weight: 2 }];
      if (editIndexes.includes(0)) edges.push({ source: 2, target: 3, weight: edits[0].weight });
      const facts = buildModularityFacts([1, 2, 3], edges, { weighted: true, includePairwiseObjective: true });
      const options = facts.pairwiseObjectiveOffset === undefined
        ? { weighted: true }
        : { weighted: true, pairwiseObjectiveOffset: facts.pairwiseObjectiveOffset };
      const programs = buildCommunityPairMembershipPrograms(options, [1, 3]);
      const input = [facts.facts, facts.pairwiseObjectiveFacts].filter(Boolean).join("\n");
      const solve = async (program) => {
        const result = await runner.run(`${input}\n${program}\n`, getStructuralSolverOptions("communities"));
        if (result.Result === "UNSATISFIABLE") return null;
        assert.equal(result.Result, "OPTIMUM FOUND");
        const partitions = selectMaximumModularityPartitions(
          parseWitnessModularityPartitions(result.Call?.[0]?.Witnesses, reverseIndex)
        );
        assert.ok(partitions.length > 0);
        return partitions[0].scaledScore;
      };
      const togetherScaledScore = await solve(programs.together);
      const separateScaledScore = await solve(programs.separate);
      return {
        togetherScaledScore,
        separateScaledScore,
        modularityDenominator: String(4n * BigInt(facts.totalWeight) ** 2n * BigInt(facts.resolutionDenominator))
      };
    }
  });
  assert.equal(outcome.status, "found");
  assert.deepEqual(outcome.result.selectedEdits.map(({ id }) => id), ["weighted-bc"]);
  assert.equal(outcome.result.relation, "always");
  assert.equal(outcome.result.modularityDenominator, "36");
});
