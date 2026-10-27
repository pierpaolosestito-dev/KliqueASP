import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompactKCoreWitnessCsv,
  buildKPlexMaximumMembershipDiagnosisCsv,
  buildKPlexCompletionWhyNotCsv,
  buildKCoreCompletionWhyNotCsv,
  buildKCoreMembershipCompletionWhyNotCsv,
  buildDominatingSetWitnessCsv,
  buildDominatingSetInfeasibilityCsv,
  buildProvenanceScenarioDominatingSetInfeasibilityCsv,
  buildTypedPathCounterfactualCsv,
  buildTypedPathTemporalCounterfactualCsv,
  buildTypedPathTemporalNoRouteCsv,
  buildTypedPathCounterfactualWhyNotCsv,
  buildKCoreWitnessCsv,
  buildKPlexWitnessCsv,
  buildModularityCertificateCsv,
  buildSeparatorCertificateCsv
} from "../src/lib/kliqueasp/graph/structuralCsvExport.ts";

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
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      assert.equal(field, "", "la virgoletta CSV apre un campo solo all'inizio");
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
    } else {
      field += character;
    }
  }

  assert.equal(quoted, false, "il CSV termina fuori da un campo quotato aperto");
  if (row.length > 0 || field !== "") {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const edgeProvenanceSummary = (edgeIds) => edgeIds.map((id) => `${id}: fonte`).join(" | ");
const structuredEdgeEvidence = (edgeIds) => edgeIds.map((id) => ({ edge_id: id, provenance_references: [`ref:${id}`] }));

test("k-plex maximum-membership CSV preserves the target, optimum gap, witness, and missing pairs", () => {
  const rows = parseCsv(buildKPlexMaximumMembershipDiagnosisCsv({
    targetNodeId: "c",
    s: 2,
    globalMaximumSize: 3,
    maximumContainingSize: 2,
    sizeGap: 1,
    outcome: "excluded-from-maximum",
    witnessNodeIds: ["a", "c"],
    missingPairs: [["a", "c"]]
  }, {
    a: "=node-a",
    c: "node,c"
  }, "=Researchers"));
  assert.deepEqual(rows[0], [
    "target_node_id", "selected_group", "s", "outcome", "global_maximum_s_plex_size",
    "maximum_s_plex_size_containing_target", "size_gap", "witness_node_ids_json",
    "missing_pairs_json", "structured_witness_json"
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "node,c");
  assert.equal(rows[1][1], "'=Researchers");
  assert.deepEqual(JSON.parse(rows[1][7]), ["=node-a", "node,c"]);
  assert.deepEqual(JSON.parse(rows[1][8]), [["=node-a", "node,c"]]);
  const witness = JSON.parse(rows[1][9]);
  assert.equal(witness.global_maximum_s_plex_size, 3);
  assert.equal(witness.maximum_s_plex_size_containing_target, 2);
  assert.equal(witness.size_gap, 1);
  assert.deepEqual(witness.missing_pairs, [["=node-a", "node,c"]]);
});

test("k-plex membership CSV records brave/skeptical counts only when all optima were enumerated", () => {
  const rows = parseCsv(buildKPlexMaximumMembershipDiagnosisCsv({
    targetNodeId: "c",
    s: 2,
    globalMaximumSize: 3,
    maximumContainingSize: 3,
    sizeGap: 0,
    outcome: "included-in-maximum",
    witnessNodeIds: ["a", "b", "c"],
    missingPairs: [],
    optimalMembershipSummary: {
      totalOptimalKplexes: 2,
      targetOptimalKplexes: 1,
      status: "some"
    }
  }, {}, ""));
  assert.deepEqual(rows[0].slice(-3), [
    "optimal_k_plex_count", "target_membership_count", "membership_across_all_optima"
  ]);
  assert.deepEqual(rows[1].slice(-3), ["2", "1", "some"]);
  assert.deepEqual(JSON.parse(rows[1][9]).membership_across_all_optima, "some");
});

test("typed-path counterfactual CSV conserva passi osservati/ipotetici e neutralizza formule", () => {
  const rows = parseCsv(buildTypedPathCounterfactualCsv({
    proposals: [{
      totalCost: 2,
      path: { nodeIds: ["a", "b", "c"], edgeIdsByStep: [["observed-1"], ["candidate:candidate-1"]] },
      addedEdges: [{
        id: "candidate-1", sourceNodeId: "b", targetNodeId: "c", edgeType: "publication", cost: 2
      }]
    }],
    edgeTypeSequence: ["affiliation", "publication"],
    selectedGroup: "=Researchers",
    sourceIdByNodeId: { a: "=node-a", b: "node-b", c: "node-c" },
    sourceIdByEdgeId: { "observed-1": "observed,1" }
  }));

  assert.deepEqual(rows[0], [
    "proposal_index", "total_cost", "step", "source_node_id", "target_node_id", "edge_type",
    "edge_id", "candidate_cost", "hypothetical", "candidate_edge_ids", "typed_path_sequence", "group"
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], [
    "1", "2", "1", "'=node-a", "node-b", "affiliation", "observed,1", "0", "false",
    "candidate-1", "affiliation | publication", "'=Researchers"
  ]);
  assert.deepEqual(rows[2], [
    "1", "2", "2", "node-b", "node-c", "publication", "candidate-1", "2", "true",
    "candidate-1", "affiliation | publication", "'=Researchers"
  ]);
});

test("typed-path counterfactual CSV include il cammino osservato quando il costo minimo è zero", () => {
  const rows = parseCsv(buildTypedPathCounterfactualCsv({
    proposals: [{
      totalCost: 0,
      path: { nodeIds: ["a", "b"], edgeIdsByStep: [["observed-1"]] },
      addedEdges: []
    }],
    edgeTypeSequence: ["collaboration"],
    selectedGroup: "",
    sourceIdByNodeId: { a: "A", b: "B" },
    sourceIdByEdgeId: { "observed-1": "source-edge-1" }
  }));

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], [
    "1", "0", "1", "A", "B", "collaboration", "source-edge-1", "0", "false", "",
    "collaboration", ""
  ]);
});

test("typed-path counterfactual CSV rifiuta witness di percorso incompleti", () => {
  assert.throws(() => buildTypedPathCounterfactualCsv({
    proposals: [{
      totalCost: 1,
      path: { nodeIds: ["a"], edgeIdsByStep: [] },
      addedEdges: []
    }],
    edgeTypeSequence: ["collaboration"],
    selectedGroup: "",
    sourceIdByNodeId: {},
    sourceIdByEdgeId: {}
  }), /witness completo/);
});

test("CSV del controfattuale temporale esporta la semantica e il tempo testimone per ogni passo", () => {
  const rows = parseCsv(buildTypedPathTemporalCounterfactualCsv({
    proposals: [{
      totalCost: 2,
      path: {
        nodeIds: ["a", "b", "c"],
        edgeIdsByStep: [["observed-1"], ["candidate:candidate-1"]],
        temporalSemantics: "orderedByStart",
        startTimeValuesByStep: [1990, 2000]
      },
      addedEdges: [{
        id: "candidate-1", sourceNodeId: "b", targetNodeId: "c", edgeType: "publication", cost: 2
      }]
    }],
    edgeTypeSequence: ["affiliation", "publication"],
    selectedGroup: "Researchers",
    sourceIdByNodeId: { a: "A", b: "B", c: "C" },
    sourceIdByEdgeId: { "observed-1": "source-edge-1" }
  }));
  assert.deepEqual(rows[0], [
    "proposal_index", "total_cost", "temporal_semantics", "common_time", "step_start_time", "step",
    "source_node_id", "target_node_id", "edge_type", "edge_id", "candidate_cost", "hypothetical",
    "candidate_edge_ids", "typed_path_sequence", "group"
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], [
    "1", "2", "orderedByStart", "", "1990", "1", "A", "B", "affiliation", "source-edge-1", "0", "false",
    "candidate-1", "affiliation | publication", "Researchers"
  ]);
  assert.deepEqual(rows[2], [
    "1", "2", "orderedByStart", "", "2000", "2", "B", "C", "publication", "candidate-1", "2", "true",
    "candidate-1", "affiliation | publication", "Researchers"
  ]);
  assert.throws(() => buildTypedPathTemporalCounterfactualCsv({
    proposals: [{ totalCost: 0, path: { nodeIds: ["a", "b"], edgeIdsByStep: [["edge"]] }, addedEdges: [] }],
    edgeTypeSequence: ["x"], selectedGroup: "", sourceIdByNodeId: {}, sourceIdByEdgeId: {}
  }), /cammino temporale/);
});

test("CSV why-not temporale esporta la walk ASP massima e i tempi testimone", () => {
  const rows = parseCsv(buildTypedPathTemporalNoRouteCsv({
    certificate: {
      edgeTypeSequence: ["x", "y", "z"],
      temporalSemantics: "coValid",
      walk: { nodeIds: ["s", "a", "s", "g"], edgeIdsByStep: [["e-x"], ["e-y"], ["e-z"]] },
      maximumPrefixLength: 3,
      goalReachableAsWalk: true,
      repeatedNodeIds: ["s"],
      commonTimeValue: 2000
    },
    startNodeId: "s",
    goalNodeId: "g",
    selectedGroup: "Researchers",
    sourceIdByNodeId: { s: "S", a: "A", g: "G" },
    sourceIdByEdgeId: { "e-x": "source-x", "e-y": "source-y", "e-z": "source-z" }
  }));
  assert.deepEqual(rows[0], [
    "temporal_semantics", "step", "required_edge_type", "source_node_id", "target_node_id", "edge_record_id",
    "common_time", "edge_start_time", "maximum_prefix_length", "first_blocked_step",
    "goal_reachable_as_walk", "repeated_node_ids_json", "start_node_id", "goal_node_id", "group",
    "structured_witness_json"
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[1].slice(0, 12), [
    "coValid", "1", "x", "S", "A", "source-x", "2000", "", "3", "", "true", '["S"]'
  ]);
  assert.throws(() => buildTypedPathTemporalNoRouteCsv({
    certificate: {
      edgeTypeSequence: ["x"], temporalSemantics: "orderedByStart",
      walk: { nodeIds: ["s"], edgeIdsByStep: [] }, maximumPrefixLength: 0,
      goalReachableAsWalk: false, repeatedNodeIds: [], startTimeValuesByStep: [2000]
    },
    startNodeId: "s", goalNodeId: "g", selectedGroup: "", sourceIdByNodeId: {}, sourceIdByEdgeId: {}
  }), /certificato completo/);
});

test("CSV why-not temporale opzionale registra tutti i candidati del supergrafo", () => {
  const rows = parseCsv(buildTypedPathTemporalNoRouteCsv({
    certificate: {
      edgeTypeSequence: ["x", "y"],
      temporalSemantics: "orderedByStart",
      walk: { nodeIds: ["s", "a"], edgeIdsByStep: [["observed-x"]] },
      maximumPrefixLength: 1,
      goalReachableAsWalk: false,
      firstBlockedStep: 2,
      repeatedNodeIds: [],
      startTimeValuesByStep: [10]
    },
    candidateEdgeIds: ["candidate-y", "candidate-z"],
    startNodeId: "s",
    goalNodeId: "g",
    selectedGroup: "Researchers",
    sourceIdByNodeId: { s: "S", a: "A", g: "G" },
    sourceIdByEdgeId: { "observed-x": "source-x" }
  }));

  assert.ok(rows[0].includes("candidate_edge_ids_json"));
  const candidateColumn = rows[0].indexOf("candidate_edge_ids_json");
  assert.deepEqual(JSON.parse(rows[1][candidateColumn]), ["candidate-y", "candidate-z"]);
  assert.deepEqual(JSON.parse(rows[1].at(-1)).candidate_edge_ids, ["candidate-y", "candidate-z"]);
});

test("typed-path why-not CSV esporta i prefissi certificati e neutralizza i campi formula-like", () => {
  const rows = parseCsv(buildTypedPathCounterfactualWhyNotCsv({
    certificate: {
      edgeTypeSequence: ["affiliation", "publication"],
      reachableByStep: [
        { step: 0, nodeIds: ["a"] },
        { step: 1, nodeIds: ["b", "c"] },
        { step: 2, nodeIds: [] }
      ],
      goalReachableAsWalk: false,
      firstEmptyStep: 2,
      candidateEdgeIds: ["=candidate-id"]
    },
    startNodeId: "a",
    goalNodeId: "goal",
    selectedGroup: "=group",
    sourceIdByNodeId: { a: "=start", b: "B", c: "C", goal: "Goal" }
  }));

  assert.deepEqual(rows[0], [
    "record_type", "prefix_step", "required_edge_type", "reachable_node_ids_json", "start_node_id", "goal_node_id",
    "candidate_edge_ids_json", "goal_reachable_as_walk", "first_empty_step", "group", "interpretation"
  ]);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[1].slice(0, 10), [
    "reachable_prefix", "0", "", '["=start"]', "'=start", "Goal", '["=candidate-id"]', "false", "2", "'=group"
  ]);
  assert.equal(rows[2][2], "affiliation");
  assert.equal(rows[2][3], '["B","C"]');
  assert.equal(rows[3][2], "publication");
  assert.equal(rows[3][3], "[]");
  assert.match(rows[3][10], /nessun nodo raggiungibile dopo il passo 2/);
});

test("k-plex massimo CSV conserva schema e righe per le coppie non adiacenti", () => {
  const rows = parseCsv(buildKPlexWitnessCsv({
    semantics: "maximum_cardinality",
    explanation: {
      nodeIds: ["a", "b", "c"],
      missingTiePairs: [["a", "c"], ["b", "c"]]
    },
    sourceIdByNodeId: { a: "A,1", b: "B", c: "C" }
  }));

  assert.deepEqual(rows[0], [
    "plex_semantics", "k_plex_nodes", "non_adjacent_node_a", "non_adjacent_node_b", "structured_witness_json"
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], "maximum_cardinality");
  assert.equal(rows[1][1], "A,1 | B | C");
  assert.deepEqual(JSON.parse(rows[1][4]), {
    plex_semantics: "maximum_cardinality",
    k_plex_node_ids: ["A,1", "B", "C"],
    non_adjacent_pair: ["A,1", "C"]
  });
});

test("k-plex massimale CSV esporta il certificato completo in una sola riga", () => {
  const rows = parseCsv(buildKPlexWitnessCsv({
    semantics: "inclusion_maximal",
    explanation: {
      nodeIds: ["a", "b", "c"],
      missingTiePairs: [["a", "b"]]
    },
    maximality: {
      nodeIds: ["a", "b", "c"],
      missingTiePairs: [["a", "b"]],
      candidateNodeIds: ["d", "e"],
      blockers: [
        { candidateNodeId: "d", reason: "saturated_member", blockingNodeId: "a", blockingNodeMissingDegree: 1 },
        { candidateNodeId: "e", reason: "candidate_degree", candidateMissingDegree: 3 }
      ]
    },
    sourceIdByNodeId: { a: "A", b: "B", c: "C", d: "D,1", e: "E" }
  }));

  assert.deepEqual(rows[0], [
    "plex_semantics", "k_plex_nodes", "non_adjacent_pairs_json", "candidate_node_ids_json",
    "maximality_blockers_json", "structured_witness_json"
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "inclusion_maximal");
  assert.deepEqual(JSON.parse(rows[1][2]), [["A", "B"]]);
  assert.deepEqual(JSON.parse(rows[1][3]), ["D,1", "E"]);
  assert.deepEqual(JSON.parse(rows[1][4]), [
    { candidate_node_id: "D,1", reason: "saturated_member", blocking_node_id: "A", blocking_node_missing_degree: 1 },
    { candidate_node_id: "E", reason: "candidate_degree", candidate_missing_degree: 3 }
  ]);
  assert.deepEqual(JSON.parse(rows[1][5]), {
    plex_semantics: "inclusion_maximal",
    k_plex_node_ids: ["A", "B", "C"],
    missing_tie_pairs: [["A", "B"]],
    candidate_node_ids: ["D,1", "E"],
    maximality_blockers: [
      { candidate_node_id: "D,1", reason: "saturated_member", blocking_node_id: "A", blocking_node_missing_degree: 1 },
      { candidate_node_id: "E", reason: "candidate_degree", candidate_missing_degree: 3 }
    ]
  });
});

test("k-plex massimale CSV rifiuta witness privi del certificato di maximalita", () => {
  assert.throws(() => buildKPlexWitnessCsv({
    semantics: "inclusion_maximal",
    explanation: { nodeIds: ["a"], missingTiePairs: [] },
    sourceIdByNodeId: {}
  }), /richiede il certificato ASP/);
});

test("k-core CSV preserves source IDs, parallel record evidence, legacy pairs, and neighborhood counts", () => {
  const csv = buildKCoreWitnessCsv({
    nodeIds: ["a", "b", "c"],
    supportPairs: [
      {
        sourceNodeId: "a",
        targetNodeId: "b",
        supportingRecords: [
          { edgeIdentity: "edge:a-b", edgeId: "edge,1", edgeIdGenerated: false },
          { edgeIdentity: "generated:a-b", edgeId: "local-key", edgeIdGenerated: true },
          { edgeIdentity: "legacy:a-b", edgeIdGenerated: false }
        ]
      },
      {
        sourceNodeId: "b",
        targetNodeId: "c",
        supportingRecords: [{ edgeIdentity: "edge:b-c", edgeId: "edge-2", edgeIdGenerated: false }]
      },
      {
        sourceNodeId: "c",
        targetNodeId: "a",
        supportingRecords: [{ edgeIdentity: "edge:c-a", edgeId: "edge-3", edgeIdGenerated: false }]
      }
    ],
    directedGraph: false,
    kCoreMode: "",
    requiredK: 2,
    sourceIdByNodeId: { a: "A,1", b: "B\n2", c: "C | 3" },
    edgeProvenanceSummary,
    structuredEdgeEvidence
  });
  const rows = parseCsv(csv);

  assert.deepEqual(rows[0], [
    "k_core_nodes", "node", "k_core_mode", "required_k", "degree_in_core", "supporting_neighbors",
    "source_edge_ids", "source_edge_provenance", "generated_record_keys", "legacy_endpoint_pairs", "structured_witness_json"
  ]);
  assert.equal(rows.length, 4);
  const first = rows[1];
  assert.equal(first.length, 11);
  assert.equal(first[0], "A,1 | B\n2 | C | 3");
  assert.equal(first[1], "A,1");
  assert.equal(first[2], "undirected");
  assert.equal(first[3], "2");
  assert.equal(first[4], "2");
  assert.equal(first[5], "B\n2 | C | 3");
  assert.equal(first[6], "edge,1 | edge-3");
  assert.equal(first[8], "local-key");
  assert.equal(first[9], "A,1 — B\n2");
  assert.deepEqual(JSON.parse(first[10]), {
    k_core_node_ids: ["A,1", "B\n2", "C | 3"],
    node_id: "A,1",
    supporting_neighbor_ids: ["B\n2", "C | 3"],
    source_edge_ids: ["edge,1", "edge-3"],
    generated_record_keys: ["local-key"],
    legacy_endpoint_pairs: [["A,1", "B\n2"]],
    supporting_edge_evidence: [
      { edge_id: "edge:a-b", provenance_references: ["ref:edge:a-b"] },
      { edge_id: "generated:a-b", provenance_references: ["ref:generated:a-b"] },
      { edge_id: "legacy:a-b", provenance_references: ["ref:legacy:a-b"] },
      { edge_id: "edge:c-a", provenance_references: ["ref:edge:c-a"] }
    ]
  });
});

test("compact k-core CSV v2 stores membership once and keeps row witnesses compact", () => {
  const nodeIds = Array.from({ length: 500 }, (_, index) => `node-${index}`);
  const options = {
    nodeIds,
    supportPairs: nodeIds.map((sourceNodeId, index) => {
      const targetNodeId = nodeIds[(index + 1) % nodeIds.length];
      const edgeIdentity = `edge-${index}`;
      return {
        sourceNodeId,
        targetNodeId,
        supportingRecords: [{ edgeIdentity, edgeId: edgeIdentity, edgeIdGenerated: false }]
      };
    }),
    directedGraph: false,
    kCoreMode: "",
    requiredK: 2,
    sourceIdByNodeId: {},
    edgeProvenanceSummary,
    structuredEdgeEvidence
  };
  const legacyCsv = buildKCoreWitnessCsv(options);
  const compactCsv = buildCompactKCoreWitnessCsv(options);
  const rows = parseCsv(compactCsv);

  assert.deepEqual(rows[0], [
    "record_type", "schema_version", "k_core_node_ids_json", "node", "k_core_mode", "required_k", "degree_in_core",
    "supporting_neighbors", "source_edge_ids", "source_edge_provenance", "generated_record_keys", "legacy_endpoint_pairs", "structured_witness_json"
  ]);
  assert.equal(rows.length, nodeIds.length + 2);
  assert.equal(rows[1][0], "core_metadata");
  assert.equal(rows[1][1], "2");
  assert.deepEqual(JSON.parse(rows[1][2]), nodeIds);
  assert.equal(JSON.parse(rows[1][12]).node_count, nodeIds.length);

  const witnesses = rows.slice(2);
  assert.ok(witnesses.every((row) => row[0] === "node_witness" && row[1] === "2" && row[2] === ""));
  assert.equal(witnesses[0][3], "node-0");
  assert.equal(witnesses[0][6], "2");
  assert.equal("k_core_node_ids" in JSON.parse(witnesses[0][12]), false);
  assert.ok(Buffer.byteLength(compactCsv) < Buffer.byteLength(legacyCsv) / 5);
});

test("directed k-core CSV counts only pairs whose focal node is the certified node", () => {
  const csv = buildKCoreWitnessCsv({
    nodeIds: ["a", "b"],
    supportPairs: [
      { sourceNodeId: "a", targetNodeId: "b", supportingRecords: [{ edgeIdentity: "ab", edgeId: "ab", edgeIdGenerated: false }] },
      { sourceNodeId: "b", targetNodeId: "a", supportingRecords: [{ edgeIdentity: "ba", edgeId: "ba", edgeIdGenerated: false }] }
    ],
    directedGraph: true,
    kCoreMode: "in",
    requiredK: 1,
    sourceIdByNodeId: {},
    edgeProvenanceSummary,
    structuredEdgeEvidence
  });
  const rows = parseCsv(csv);

  assert.equal(rows[1][2], "in");
  assert.equal(rows[1][4], "1");
  assert.equal(rows[1][5], "b");
  assert.equal(rows[2][5], "a");
});

test("dominating-set CSV distinguishes self and adjacent coverage and keeps record evidence", () => {
  const rows = parseCsv(buildDominatingSetWitnessCsv({
    coverage: [
      { targetNodeId: "center", coveringNodeId: "center", supportingRecords: [] },
      {
        targetNodeId: "leaf",
        coveringNodeId: "center",
        supportingRecords: [
          { edgeIdentity: "leaf-center", edgeId: "edge-leaf", edgeIdGenerated: false },
          { edgeIdentity: "generated", edgeId: "record-key", edgeIdGenerated: true }
        ]
      }
    ],
    sourceIdByNodeId: { center: "hub", leaf: "leaf" },
    edgeProvenanceSummary,
    structuredEdgeEvidence
  }));

  assert.deepEqual(rows[0], [
    "target_node", "covering_selected_node", "coverage_kind", "source_edge_ids",
    "source_edge_provenance", "generated_record_keys", "legacy_endpoint_pairs", "structured_witness_json"
  ]);
  assert.equal(rows[1][2], "self");
  assert.deepEqual(JSON.parse(rows[1][7]), {
    source_edge_ids: [], generated_record_keys: [], legacy_endpoint_pairs: [], supporting_edge_evidence: []
  });
  assert.equal(rows[2][2], "adjacent selected node");
  assert.equal(rows[2][3], "edge-leaf");
  assert.equal(rows[2][5], "record-key");
  assert.deepEqual(JSON.parse(rows[2][7]).supporting_edge_evidence, [
    { edge_id: "leaf-center", provenance_references: ["ref:leaf-center"] },
    { edge_id: "generated", provenance_references: ["ref:generated"] }
  ]);
});

test("dominating-set why-not CSV records uncovered targets and neutralizes formula-like IDs", () => {
  const rows = parseCsv(buildDominatingSetInfeasibilityCsv({
    uncoverableTargetNodeIds: ["t2", "t1", "t2"],
    sourceIdByNodeId: { t1: "=FORMULA()", t2: "target,2" },
    nodeLabels: { t1: "Target uno", t2: "@Target due" },
    candidateGroup: "candidates",
    targetGroup: "targets"
  }));
  assert.deepEqual(rows[0], [
    "record_type", "target_node_id", "target_node_label", "candidate_group", "target_group", "why_not"
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][1], "'=FORMULA()");
  assert.equal(rows[1][2], "Target uno");
  assert.equal(rows[2][1], "target,2");
  assert.equal(rows[2][2], "'@Target due");
  assert.equal(rows[1][5], rows[2][5]);
});

test("k-plex completion why-not CSV preserves its target, cohort, candidate domain, and blockers", () => {
  const rows = parseCsv(buildKPlexCompletionWhyNotCsv({
    targetS: 1,
    cohortNodeIds: ["a", "b", "c"],
    candidateEdgeIds: ["candidate-ab", "=candidate-ac"],
    unfillableMissingPairs: [["a", "c"]],
    blockers: [
      { nodeId: "a", unfillableMissingNeighborIds: ["c"] },
      { nodeId: "c", unfillableMissingNeighborIds: ["a"] }
    ]
  }, {
    a: "=node-a",
    b: "node-b",
    c: "node,c"
  }));
  assert.deepEqual(rows[0], [
    "record_type", "target_s", "cohort_node_ids", "authorized_candidate_edge_ids",
    "unfillable_missing_pair_count", "unfillable_missing_pairs_json", "blockers_json", "structured_witness_json"
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], "1");
  assert.equal(rows[1][2], "'=node-a | node-b | node,c");
  assert.equal(rows[1][3], "candidate-ab | =candidate-ac");
  assert.equal(rows[1][4], "1");
  assert.deepEqual(JSON.parse(rows[1][5]), [["=node-a", "node,c"]]);
  assert.deepEqual(JSON.parse(rows[1][6]), [
    { blocking_node_id: "=node-a", unfillable_missing_neighbor_ids: ["node,c"] },
    { blocking_node_id: "node,c", unfillable_missing_neighbor_ids: ["=node-a"] }
  ]);
  const witness = JSON.parse(rows[1][7]);
  assert.deepEqual(witness.cohort_node_ids, ["=node-a", "node-b", "node,c"]);
  assert.deepEqual(witness.authorized_candidate_edge_ids, ["candidate-ab", "=candidate-ac"]);
  assert.deepEqual(witness.blockers, [
    { blocking_node_id: "=node-a", unfillable_missing_neighbor_ids: ["node,c"] },
    { blocking_node_id: "node,c", unfillable_missing_neighbor_ids: ["=node-a"] }
  ]);
});

test("k-core completion why-not CSV preserves degree bounds and maps source IDs safely", () => {
  const rows = parseCsv(buildKCoreCompletionWhyNotCsv({
    targetK: 3,
    cohortNodeIds: ["a", "b", "c"],
    candidateEdgeIds: ["candidate,1", "=candidate-2"],
    blockers: [{
      nodeId: "a",
      currentNeighborIds: ["b"],
      additionalCandidateNeighborIds: ["c"],
      maximumAchievableDegree: 2
    }]
  }, {
    a: "=formula-node",
    b: "B,1",
    c: "C\n3"
  }));

  assert.deepEqual(rows[0], [
    "record_type", "target_k", "cohort_node_ids", "authorized_candidate_edge_ids",
    "blocker_count", "blockers_json", "structured_witness_json"
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "k_core_completion_why_not");
  assert.equal(rows[1][2], "'=formula-node | B,1 | C\n3");
  assert.equal(rows[1][3], "candidate,1 | =candidate-2");
  assert.deepEqual(JSON.parse(rows[1][5]), [{
    blocking_node_id: "=formula-node",
    current_neighbor_ids: ["B,1"],
    additional_candidate_neighbor_ids: ["C\n3"],
    current_degree: 1,
    maximum_achievable_degree: 2,
    target_k: 3
  }]);
  assert.deepEqual(JSON.parse(rows[1][6]), {
    kind: "k_core_completion_why_not",
    target_k: 3,
    cohort_node_ids: ["=formula-node", "B,1", "C\n3"],
    authorized_candidate_edge_ids: ["candidate,1", "=candidate-2"],
    blockers: JSON.parse(rows[1][5])
  });
});

test("k-core membership why-not CSV records the target round, scope, and certified peeling", () => {
  const rows = parseCsv(buildKCoreMembershipCompletionWhyNotCsv({
    targetK: 2,
    targetNodeId: "a",
    candidateNodeIds: ["a", "b", "c"],
    candidateEdgeIds: ["hyp-a-b", "=hyp-b-c"],
    peelingScope: "target_prefix",
    peeling: [
      { nodeId: "b", round: 1, survivingNeighborIds: ["a", "c"] },
      { nodeId: "c", round: 1, survivingNeighborIds: ["b"] },
      { nodeId: "a", round: 2, survivingNeighborIds: [] }
    ]
  }, { a: "=Target", b: "B,1", c: "C\n3" }));

  assert.deepEqual(rows[0], [
    "record_type", "target_k", "target_node_id", "target_elimination_round",
    "candidate_node_ids", "authorized_candidate_edge_ids", "peeling_scope", "peeling_json", "structured_witness_json"
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], "k_core_membership_completion_why_not");
  assert.equal(rows[1][2], "'=Target");
  assert.equal(rows[1][3], "2");
  assert.equal(rows[1][4], "'=Target | B,1 | C\n3");
  assert.equal(rows[1][6], "target_prefix");
  const peeling = JSON.parse(rows[1][7]);
  assert.deepEqual(peeling, [
    { node_id: "B,1", round: 1, surviving_neighbor_ids: ["=Target", "C\n3"] },
    { node_id: "C\n3", round: 1, surviving_neighbor_ids: ["B,1"] },
    { node_id: "=Target", round: 2, surviving_neighbor_ids: [] }
  ]);
  assert.deepEqual(JSON.parse(rows[1][8]), {
    kind: "k_core_membership_completion_why_not",
    target_k: 2,
    target_node_id: "=Target",
    candidate_node_ids: ["=Target", "B,1", "C\n3"],
    authorized_candidate_edge_ids: ["hyp-a-b", "=hyp-b-c"],
    peeling_scope: "target_prefix",
    peeling
  });
});

test("scenario dominating-set why-not CSV preserves scenario and projection context", () => {
  const rows = parseCsv(buildProvenanceScenarioDominatingSetInfeasibilityCsv({
    scenarioId: "only-a",
    scenarioLabel: "Solo fonte A",
    scenarioSources: ["source:a", "source:b"],
    uncoverableTargetNodeIds: ["target"],
    sourceIdByNodeId: { target: "=NODE()" },
    nodeLabels: { target: "@Target" },
    candidateGroup: "clinicians",
    targetGroup: "patients",
    confidenceThreshold: 0.6,
    timelineWindow: "2020–2024",
    viewFilters: { types: ["person", "place"], groups: ["north"] }
  }));
  assert.deepEqual(rows[0], [
    "record_type", "scenario_id", "scenario_label", "scenario_sources", "target_node_id", "target_node_label",
    "candidate_group", "target_group", "confidence_threshold", "timeline_window", "type_filters", "group_filters", "why_not"
  ]);
  assert.equal(rows[1][1], "only-a");
  assert.equal(rows[1][3], '["source:a","source:b"]');
  assert.equal(rows[1][4], "'=NODE()");
  assert.equal(rows[1][5], "'@Target");
  assert.equal(rows[1][6], "clinicians");
  assert.equal(rows[1][7], "patients");
  assert.equal(rows[1][8], "0.6");
  assert.equal(rows[1][9], "2020–2024");
  assert.equal(rows[1][10], '["person","place"]');
  assert.equal(rows[1][11], '["north"]');
  assert.equal(rows[1][12], "nessun candidato eleggibile coincide con il target o gli è adiacente nella proiezione dello scenario");
});

test("separator certificate CSV varies its evidence columns by removed element type", () => {
  const shared = {
    task: "minimumNodeSeparator",
    startTerminalId: "start",
    goalTerminalId: "goal",
    witnesses: [{ removedIds: ["cut"], reachableNodeIds: ["start", "left"] }],
    sourceIdByNodeId: { start: "S,1", goal: "G", cut: "C", left: "L" },
    sourceIdByEdgeId: { edge: "source-edge" },
    edgeProvenanceSummary,
    structuredEdgeEvidence
  };
  const nodeRows = parseCsv(buildSeparatorCertificateCsv({ ...shared, edgeTask: false }));
  assert.deepEqual(nodeRows[0], [
    "task", "start_terminal", "goal_terminal", "removed_element_kind", "removed_elements", "reachable_source_side", "structured_witness_json"
  ]);
  assert.equal(nodeRows[1][1], "S,1");
  assert.equal(nodeRows[1][3], "node");
  assert.deepEqual(JSON.parse(nodeRows[1][6]), {
    removed_elements: ["C"], reachable_source_side: ["S,1", "L"]
  });

  const edgeRows = parseCsv(buildSeparatorCertificateCsv({
    ...shared,
    task: "minimumEdgeSeparator",
    witnesses: [{ removedIds: ["edge"], reachableNodeIds: ["start"] }],
    edgeTask: true
  }));
  assert.deepEqual(edgeRows[0], [
    "task", "start_terminal", "goal_terminal", "removed_element_kind", "removed_elements", "reachable_source_side",
    "removed_edge_provenance", "structured_witness_json"
  ]);
  assert.equal(edgeRows[1][3], "edge_record");
  assert.equal(edgeRows[1][4], "source-edge");
  assert.equal(edgeRows[1][6], "edge: fonte");
  assert.deepEqual(JSON.parse(edgeRows[1][7]).removed_edge_evidence, [
    { edge_id: "edge", provenance_references: ["ref:edge"] }
  ]);
});

test("modularity certificate keeps the legacy schema at gamma 1 and appends exact resolution metadata otherwise", () => {
  const common = {
    resolution: 1,
    resolutionNumerator: 1,
    resolutionDenominator: 1,
    totalEdgeCount: 2,
    totalScaledWeight: 10,
    weightScaleFactor: 1,
    sourceIdByNodeId: { a: "source-a", b: "source,b" },
    sourceIdByEdgeId: { ab: "edge-ab" },
    edgeProvenanceSummary,
    structuredEdgeEvidence,
    partition: {
      communities: [["a", "b"]],
      scaledScore: 7,
      communityContributions: [{
        communityId: "a",
        internalEdgeCount: 1,
        internalEdgeWeight: 2,
        volume: 3,
        scaledContribution: 7,
        edgeIndexes: [1],
        supportingEdgeIds: ["ab"]
      }],
      attributeBoundCounts: [{
        communityId: "a",
        attribute: "role",
        value: "clinician",
        count: 1,
        minimum: 1
      }]
    }
  };

  const unweighted = parseCsv(buildModularityCertificateCsv({
    ...common,
    usesEdgeWeights: false,
    totalScaledWeight: 0
  }));
  assert.deepEqual(unweighted[0], [
    "community_representative", "members", "total_edges_m", "internal_edges_l", "volume_d",
    "scaled_contribution_4ml_minus_d2", "modularity_contribution_Q", "supporting_edge_records",
    "supporting_edge_provenance", "partition_scaled_score", "partition_modularity_Q", "structured_witness_json"
  ]);
  assert.equal(unweighted[0].length, unweighted[1].length);
  assert.equal(unweighted[1][1], "source-a | source,b");
  assert.equal(unweighted[1][5], "7");
  assert.equal(unweighted[1][6], "0.4375");
  assert.equal(unweighted[1][10], "0.4375");
  assert.equal(unweighted[1][11].includes("modularity_resolution"), false);
  assert.deepEqual(JSON.parse(unweighted[1][11]).member_node_ids, ["source-a", "source,b"]);

  const weighted = parseCsv(buildModularityCertificateCsv({
    ...common,
    usesEdgeWeights: true
  }));
  assert.deepEqual(weighted[0], [
    "community_representative", "members", "total_edge_weight_M", "internal_weight_L",
    "internal_edge_records", "weighted_volume_D", "scaled_contribution_4ML_minus_D2",
    "modularity_contribution_Q", "supporting_edge_records", "supporting_edge_provenance",
    "partition_scaled_score", "partition_modularity_Q", "weight_scale_factor",
    "asp_scaled_total_edge_weight_M", "asp_scaled_internal_weight_L", "asp_scaled_weighted_volume_D",
    "structured_witness_json"
  ]);
  assert.equal(weighted[0].length, weighted[1].length);
  assert.equal(weighted[1][2], "10");
  assert.equal(weighted[1][3], "2");
  assert.equal(weighted[1][5], "3");

  const gammaWeighted = parseCsv(buildModularityCertificateCsv({
    ...common,
    resolution: 1.5,
    resolutionNumerator: 3,
    resolutionDenominator: 2,
    usesEdgeWeights: true,
    displayTotalWeight: "10.0",
    partition: {
      ...common.partition,
      scaledScore: 37,
      communityContributions: [{
        ...common.partition.communityContributions[0],
        internalEdgeWeight: 5,
        volume: 11,
        scaledContribution: 37
      }]
    }
  }));
  assert.deepEqual(gammaWeighted[0].slice(-4), [
    "structured_witness_json", "resolution_gamma", "resolution_numerator_p", "resolution_denominator_q"
  ]);
  assert.equal(gammaWeighted[0][6], "scaled_contribution_4MqL_minus_pD2");
  assert.equal(gammaWeighted[1].length, gammaWeighted[0].length);
  assert.equal(gammaWeighted[1][6], "37");
  assert.equal(gammaWeighted[1][7], "0.04625");
  assert.equal(gammaWeighted[1][17], "1.5");
  assert.equal(gammaWeighted[1][18], "3");
  assert.equal(gammaWeighted[1][19], "2");
  assert.deepEqual(JSON.parse(gammaWeighted[1][16]).modularity_resolution, {
    gamma: 1.5, numerator: 3, denominator: 2
  });
});
