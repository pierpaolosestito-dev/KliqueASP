import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommunityCoassignmentCsv,
  buildCommunityPairMembershipCsv,
  getCommunityPairObjectiveLosses,
  summarizeCommunityCoassignment
} from "../src/lib/kliqueasp/graph/communityOptimumStability.ts";

const partitions = [
  { communities: [["a", "b", "c"], ["d", "e"]] },
  { communities: [["a", "b"], ["c", "d", "e"]] },
  { communities: [["a", "b", "d"], ["c", "e"]] }
];

test("co-appartenenza classifica i nodi su tutti gli ottimi esatti", () => {
  const summary = summarizeCommunityCoassignment(partitions, "a");

  assert.equal(summary.totalOptima, 3);
  assert.deepEqual(summary.entries, [
    { nodeId: "b", sameCommunityOptima: 3, totalOptima: 3, relation: "always" },
    { nodeId: "c", sameCommunityOptima: 1, totalOptima: 3, relation: "sometimes" },
    { nodeId: "d", sameCommunityOptima: 1, totalOptima: 3, relation: "sometimes" },
    { nodeId: "e", sameCommunityOptima: 0, totalOptima: 3, relation: "never" }
  ]);
});

test("co-appartenenza respinge partizioni vuote, duplicate o con domini diversi", () => {
  assert.throws(() => summarizeCommunityCoassignment([], "a"), /almeno una partizione/);
  assert.throws(() => summarizeCommunityCoassignment([{ communities: [["a"], ["b"]] }, { communities: [["a", "c"]] }], "a"), /dominio di nodi/);
  assert.throws(() => summarizeCommunityCoassignment([{ communities: [["a", "b"]] }, { communities: [["b", "a"]] }], "a"), /duplicata/);
  assert.throws(() => summarizeCommunityCoassignment([{ communities: [["a", "a"]] }], "a"), /assegnato pi[uù] volte/);
  assert.throws(() => summarizeCommunityCoassignment([{ communities: [["a"]] }], "missing"), /non compare/);
});

test("riepilogo CSV mantiene IDs, etichette e parametri, neutralizzando celle formula-like", () => {
  const summary = summarizeCommunityCoassignment([
    { communities: [["internal-a", "internal-b"], ["internal-c"]] },
    { communities: [["internal-a"], ["internal-b", "internal-c"]] }
  ], "internal-a");
  const csv = buildCommunityCoassignmentCsv({
    summary,
    sourceIdByNodeId: { "internal-a": "=psychologist-a", "internal-b": "psychologist,b", "internal-c": "psychologist-c" },
    nodeLabels: { "internal-a": "Alice", "internal-b": "Bob, PhD", "internal-c": "Carla" },
    selectedGroup: "Italy",
    resolution: "1.5",
    resolutionNumerator: 3,
    resolutionDenominator: 2,
    weighted: true
  });

  assert.match(csv, /selected_node_id/);
  assert.match(csv, /'=psychologist-a/);
  assert.match(csv, /"psychologist,b"/);
  assert.match(csv, /"Bob, PhD"/);
  assert.match(csv, /sometimes/);
  assert.match(csv, /"1\.5"/);
  assert.match(csv, /"3","2","true"/);
  assert.match(csv, /same_community_optima"":1/);
});

test("CSV della co-appartenenza di coppia conserva punteggi, semantica e ID sorgente", () => {
  const csv = buildCommunityPairMembershipCsv({
    result: {
      nodeIds: ["node-a", "node-b"],
      relation: "sometimes",
      globalScaledScore: 24,
      togetherScaledScore: 24,
      separateScaledScore: 24
    },
    sourceIdByNodeId: { "node-a": "=alice", "node-b": "bob,senior" },
    nodeLabels: { "node-a": "Alice, PhD", "node-b": "Bob" },
    selectedGroup: "Italian psychologists",
    resolution: "1.5",
    resolutionNumerator: 3,
    resolutionDenominator: 2,
    weighted: true
  });

  assert.match(csv, /node_a_id/);
  assert.match(csv, /'=alice/);
  assert.match(csv, /"bob,senior"/);
  assert.match(csv, /"Alice, PhD"/);
  assert.match(csv, /sometimes/);
  assert.match(csv, /"24","24","24"/);
  assert.match(csv, /together_objective_loss_scaled/);
  assert.match(csv, /separate_objective_loss_scaled/);
  assert.match(csv, /"24","24","24","0","0"/);
  assert.match(csv, /"1\.5","3","2","true"/);
  assert.match(csv, /together_objective_loss_scaled"":0/);
  assert.match(csv, /globally optimal partitions under the current graph and constraints/);
});

test("objective loss reports the exact score gap and preserves infeasibility", () => {
  const result = {
    nodeIds: ["a", "b"],
    relation: "never",
    globalScaledScore: 24,
    togetherScaledScore: 20,
    separateScaledScore: 24
  };
  assert.deepEqual(getCommunityPairObjectiveLosses(result), {
    togetherScaledLoss: 4,
    separateScaledLoss: 0
  });
  const csv = buildCommunityPairMembershipCsv({
    result,
    sourceIdByNodeId: {},
    nodeLabels: {},
    selectedGroup: "",
    resolution: 1,
    resolutionNumerator: 1,
    resolutionDenominator: 1,
    weighted: false
  });
  assert.match(csv, /"24","20","24","4","0"/);
  assert.throws(() => getCommunityPairObjectiveLosses({
    globalScaledScore: Number.MAX_SAFE_INTEGER,
    togetherScaledScore: -Number.MAX_SAFE_INTEGER,
    separateScaledScore: null
  }), /intero non negativo sicuro/);
  assert.throws(() => getCommunityPairObjectiveLosses({
    globalScaledScore: 24.5,
    togetherScaledScore: 20.5,
    separateScaledScore: null
  }), /score globale.*intero sicuro/);
});
