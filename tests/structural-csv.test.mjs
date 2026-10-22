import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompactKCoreWitnessCsv,
  buildDominatingSetWitnessCsv,
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
