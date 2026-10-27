import assert from "node:assert/strict";
import test from "node:test";
import {
  GRAPH_CAPABILITY_IDS,
  GRAPH_CAPABILITY_LABELS,
  GRAPH_TASK_CONTRACTS,
  getGraphTaskContract,
  getGraphTaskRequirements,
  getTaskEnumerationDescription,
  resolveCliqueMode,
  resolveTaskEnumeration
} from "../src/lib/kliqueasp/graph/graphTaskContracts.ts";
import {
  buildAspFactsFromGraph,
  buildCliqueProgram,
  checkGraphTaskRequirements,
  createAspTemporalEncoding,
  getGraphTaskRequirements as getGraphTaskRequirementsFromModel,
  normalizeGraphData,
  parseWitnessCliqueResults
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildGraphIntegrityProgram,
  buildMinimumIntegrityRepairProgram,
  parseIntegrityRepairProposal,
  parseIntegrityViolations
} from "../src/lib/kliqueasp/graph/integrityTask.ts";
import {
  buildCommunityConstraintRelaxationProgram,
  parseCommunityConstraintDiagnosisResult
} from "../src/lib/kliqueasp/graph/communityConstraintDiagnosis.ts";
import {
  buildCliqueRequiredNodeConstraint,
  parseCliqueMaximumMembershipDiagnosis
} from "../src/lib/kliqueasp/graph/cliqueMembershipDiagnosis.ts";
import {
  buildKPlexRequiredNodeConstraint,
  parseKPlexMaximumMembershipDiagnosis
} from "../src/lib/kliqueasp/graph/kplexMembershipDiagnosis.ts";
import { classifyCommunityPairOptimumMembership } from "../src/lib/kliqueasp/graph/communityOptimumStability.ts";
import {
  buildMinimumCostCommunityEditSelectionProgram,
  parseCommunityEditSelectionWitnesses
} from "../src/lib/kliqueasp/graph/communityTopologyCounterfactual.ts";
import {
  buildSignedTriadProgram,
  parseSignedTriadResults,
  prepareSignedTriads
} from "../src/lib/kliqueasp/graph/signedTriadTask.ts";
import {
  buildMaximumKPlexProgram,
  buildKPlexCompletionCounterfactualProgram,
  buildKPlexCompletionWhyNotProgram,
  buildMaximalKPlexProgram,
  buildKCoreProgram,
  buildKCoreCompletionCounterfactualProgram,
  buildKCoreMembershipCompletionCounterfactualProgram,
  buildKCoreCompletionWhyNotProgram,
  buildKCoreMembershipCompletionWhyNotProgram,
  buildKCorePeelingRoundProgram,
  buildConnectedComponentsProgram,
  buildWeaklyConnectedComponentsProgram,
  buildStronglyConnectedComponentsProgram,
  buildMinimumHopPathProgram,
  buildBoundedPathNoRouteProgram,
  buildTypedPathProgram,
  buildTypedPathNoRouteProgram,
  buildTypedPathTemporalNoRouteProgram,
  buildTypedPathTemporalCompletionWhyNotProgram,
  buildTypedPathCompletionCounterfactualProgram,
  buildTypedPathCompletionWhyNotProgram,
  buildMinimumDominatingSetProgram,
  buildMinimumNodeSeparatorProgram,
  buildMinimumCostNodeSeparatorProgram,
  buildMinimumEdgeSeparatorProgram,
  buildMinimumCostEdgeSeparatorProgram,
  buildMaximumModularityProgram,
  buildCommunityPairMembershipPrograms,
  buildMinimumEdgeSeparatorFacts,
  buildPathEdgeFacts,
  buildModularityFacts,
  parseWitnessComponents,
  parseWitnessStrongComponents,
  parseWitnessWeakComponents,
  parseBoundedPathNoRouteCertificate,
  parseWitnessDominatingSetExplanations,
  parseWitnessKPlexExplanations,
  parseKPlexCompletionCounterfactuals,
  parseKPlexCompletionWhyNot,
  parseWitnessMaximalKPlexExplanations,
  parseWitnessKCoreExplanations,
  parseKCoreCompletionCounterfactuals,
  parseKCoreMembershipCompletionCounterfactuals,
  parseKCoreCompletionWhyNot,
  parseKCoreMembershipCompletionWhyNot,
  parseWitnessMinimumHopPathWitness,
  parseWitnessRemovedNodeSetExplanations,
  parseWitnessRemovedEdgeSetExplanations,
  parseWitnessModularityPartitions,
  parseWitnessTypedPath,
  parseWitnessTemporalTypedPath,
  parseTypedPathNoRouteCertificate,
  parseTypedPathTemporalNoRouteCertificate,
  parseTypedPathTemporalCompletionWhyNotCertificate,
  parseTypedPathCompletionCounterfactuals,
  parseTypedPathCompletionWhyNotCertificate
} from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import { buildMinimumCostKPlexMembershipSelectionProgram } from "../src/lib/kliqueasp/graph/kplexMembershipCounterfactual.ts";
import { buildContextualCliqueProgram } from "../src/lib/kliqueasp/graph/contextualCliqueTask.ts";
import {
  buildTypedMotifCompletionCounterfactualProgram,
  buildTypedMotifCountProgram,
  buildTypedMotifNearMatchProgram,
  buildTypedMotifProgram,
  buildTypedMotifTemporalNearMatchProgram,
  parseTypedMotifCount,
  parseTypedMotifCompletionCounterfactuals,
  parseTypedMotifMatches,
  parseTypedMotifNearMatches
} from "../src/lib/kliqueasp/graph/motifTask.ts";

function buildIntegrityContractFixture() {
  const graph = {
    schemaVersion: 2,
    direction: "directed",
    nodes: [
      { id: "a", sourceId: "node-A", analysis: { type: "person", attributes: { email: "ada" } } },
      { id: "b", sourceId: "node-B", analysis: { type: "person", attributes: { email: "bruno" } } },
      { id: "c", sourceId: "node-C", analysis: { type: "place", attributes: {} } }
    ],
    links: [
      { source: "a", target: "c", sourceId: "edge-valid", analysis: {
        type: "works_at", attributes: { registryCode: "R-1" }, validity: { from: 10, to: 20 }
      } },
      { source: "b", target: "c", sourceId: "edge-invalid-from", analysis: {
        type: "works_at", attributes: {}, validity: { from: "bad-from", to: 30 }
      } },
      { source: "a", target: "b", sourceId: "edge-missing-from", analysis: {
        type: "mentors", attributes: { registryCode: "R-3" }, validity: { to: "bad-to" }
      } }
    ]
  };
  const asp = buildAspFactsFromGraph(graph, undefined, {
    includeRawTemporalValues: true,
    additionalTemporalValues: [11, 21, 31, 40, 41, 50]
  });
  const constraints = {
    requireNodeTypes: true,
    requireEdgeTypes: true,
    allowedNodeTypes: ["person", "place"],
    allowedEdgeTypes: ["works_at", "mentors", "collaborates"],
    edgeTypeDomains: [
      { edgeType: "works_at", sourceNodeTypes: ["person"], targetNodeTypes: ["place"] },
      { edgeType: "mentors", sourceNodeTypes: ["person"], targetNodeTypes: ["person"] }
    ],
    requiredNodeAttributes: [{ nodeType: "person", attributes: ["email"] }],
    requiredEdgeAttributes: [{ edgeType: "works_at", attributes: ["registryCode"] }],
    nodeAttributeDomains: [{ nodeType: "person", attribute: "email", allowedValues: ["ada", "bruno"] }],
    edgeAttributeDomains: [{ edgeType: "works_at", attribute: "registryCode", allowedValues: ["R-1", "R-3"] }],
    requiredEdgeIntervals: ["works_at"],
    uniqueNodeAttributes: [{ nodeType: "person", attribute: "email" }],
    uniqueEdgeAttributes: [{ edgeType: "works_at", attribute: "registryCode" }],
    cardinalities: [{ nodeType: "person", edgeType: "works_at", incidence: "any", min: 0, max: 3 }],
    repairSuggestions: {
      removableEdges: [{ edgeId: "edge-valid", cost: 1 }],
      nodeAttributeValues: [{ nodeId: "c", attribute: "email", value: "repair", cost: 2 }],
      edgeAttributeValues: [{ edgeId: "edge-missing-from", attribute: "registryCode", value: "R-4", cost: 2 }],
      nodeAttributeReplacements: [{ nodeId: "a", attribute: "email", expectedValue: "ada", value: "ada-2", cost: 3 }],
      edgeAttributeReplacements: [{ edgeId: "edge-valid", attribute: "registryCode", expectedValue: "R-1", value: "R-2", cost: 3 }],
      nodeTypeReplacements: [{ nodeId: "a", expectedType: "person", newType: "place", cost: 3 }],
      edgeTypeReplacements: [{ edgeId: "edge-valid", expectedType: "works_at", newType: "collaborates", cost: 3 }],
      edgeIntervalReplacements: [
        { edgeId: "edge-valid", expectedFrom: 10, expectedTo: 20, from: 11, to: 21, cost: 2 },
        { edgeId: "edge-invalid-from", expectedFrom: "bad-from", expectedTo: 30, from: 31, to: 40, cost: 2 },
        { edgeId: "edge-missing-from", expectedFrom: null, expectedTo: "bad-to", from: 41, to: 50, cost: 2 }
      ]
    }
  };
  const diagnosis = buildGraphIntegrityProgram(constraints, graph.direction);
  const repair = buildMinimumIntegrityRepairProgram(
    constraints,
    graph.direction,
    asp.reverseEdgeIndex,
    asp.indexByNodeId,
    asp.reverseSourceIndex,
    new Set(["email"]),
    new Set(["registryCode"]),
    asp.temporalEncoding
  );
  return { asp, constraints, diagnosis, repair: repair.program };
}

function buildSignedTriadContractProgram() {
  const nodes = ["a", "b", "c"].map((id) => ({
    id,
    analysis: { groups: ["cohort"] }
  }));
  const links = [
    { source: "a", target: "b", sourceId: "ab", analysis: { attributes: { polarity: "positive" } } },
    { source: "a", target: "c", sourceId: "ac", analysis: { attributes: { polarity: "negative" } } },
    { source: "b", target: "c", sourceId: "bc", analysis: { attributes: { polarity: "positive" } } }
  ];
  const preparation = prepareSignedTriads({
    attribute: "polarity",
    positiveValues: ["positive"],
    negativeValues: ["negative"]
  }, 2, "undirected", nodes, links, new Set(["polarity"]), (node) => node.analysis.groups, "cohort");
  assert.equal(preparation.available, true, preparation.reasons.join(" "));
  return buildSignedTriadProgram(preparation);
}

function buildContextualCliqueContractProgram() {
  const config = {
    focusNodeTypes: ["person"],
    contextNodeTypes: ["place"],
    edgeTypes: ["works_at"],
    minimumSize: 2
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", type: "person", groups: ["cohort"] },
      { id: "b", type: "person", groups: ["cohort"] },
      { id: "p", type: "place" }
    ],
    edges: [
      { id: "a-p", source: "a", target: "p", type: "works_at" },
      { id: "b-p", source: "b", target: "p", type: "works_at" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", typeField: "$.type", groupFields: ["$.groups"] },
      edge: {
        idField: "$.id", sourceField: "$.source", targetField: "$.target", typeField: "$.type",
        direction: "undirected", identity: "multigraph"
      }
    }
  });
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  const facts = buildAspFactsFromGraph(graph);
  const program = buildContextualCliqueProgram(config, graph.direction, { selectedGroup: "cohort" });
  return `${facts.facts}\n${program}`;
}

test("il registro dei task dichiara semantica, encoding, parser, output e witness", () => {
  const expectedTasks = [
    "clique", "contextualClique", "kPlex", "maximalKPlex", "kCore", "components", "connectedComponents",
    "weakComponents", "strongComponents", "path", "boundedPath", "typedPath", "typedMotif",
    "temporalMotif", "typedMotifNearMatch", "motifCompletionCounterfactual", "motifCount", "graphIntegrity", "minimumIntegrityRepair", "signedTriads", "dominatingSet", "minimumNodeSeparator", "minimumCostNodeSeparator",
    "minimumEdgeSeparator", "minimumCostEdgeSeparator", "communities"
  ];

  assert.deepEqual(Object.keys(GRAPH_TASK_CONTRACTS).sort(), expectedTasks.sort());
  for (const [task, contract] of Object.entries(GRAPH_TASK_CONTRACTS)) {
    assert.equal(contract.id, task);
    assert.ok(contract.querySemantics.length > 20, `${task}: semantica`);
    assert.ok(contract.aspEncoding.length > 0, `${task}: encoding`);
    assert.ok(Number.isSafeInteger(contract.encodingVersion) && contract.encodingVersion > 0, `${task}: versione`);
    assert.ok(contract.resultKind.length > 0, `${task}: output`);
    assert.ok(contract.parser.length > 0, `${task}: parser`);
    assert.ok(contract.inputPredicates.length > 0, `${task}: predicati di input`);
    assert.ok(contract.witnessPredicates.length > 0, `${task}: predicati del witness`);
    assert.ok(contract.resultFields.length > 0, `${task}: campi interpretati`);
    assert.ok(Array.isArray(contract.resultContextFields ?? []), `${task}: metadati contestuali`);
    for (const predicate of [...contract.inputPredicates, ...contract.witnessPredicates]) {
      assert.match(predicate, /^[a-z][a-z0-9_]*\/\d+$/, `${task}: ${predicate}`);
    }
    assert.ok(contract.supportedEnumeration.length > 0, `${task}: enumerazione`);
    assert.ok(contract.visualization.length > 0, `${task}: visualizzazione`);
    assert.ok(Array.isArray(contract.requiredCapabilities), `${task}: capability`);
  }
  const motifTasksWithContext = new Set([
    "typedMotif", "temporalMotif", "typedMotifNearMatch", "motifCompletionCounterfactual"
  ]);
  for (const [task, contract] of Object.entries(GRAPH_TASK_CONTRACTS)) {
    assert.deepEqual(
      contract.resultContextFields ?? [],
      motifTasksWithContext.has(task) ? ["templateId", "label"] : [],
      `${task}: campi contestuali dichiarati`
    );
  }
});

test("la diagnosi di comunità ha un contratto ASP ausiliario verificato sul builder e sul parser", () => {
  const task = GRAPH_TASK_CONTRACTS.communities;
  const [contract] = task.supportingQueries ?? [];
  assert.equal(contract?.id, "communityConstraintDiagnosis");
  assert.equal(contract?.resultKind, "constraintDiagnosis");
  assert.equal(contract?.parser, "parseCommunityConstraintDiagnosisResult");
  assert.deepEqual(contract?.supportedEnumeration, ["one-optimum", "all-optima"]);

  const built = buildCommunityConstraintRelaxationProgram({
    minCount: 1,
    maxCount: 2,
    mustLinkPairs: [[1, 2]],
    cannotLinkPairs: [[1, 2]],
    attributeBounds: [{ nodeIndexes: [1, 2], attributeName: "role", attributeValue: "person", minPerCommunity: 1, maxPerCommunity: 2 }]
  });
  const program = ["modularity_candidate(1).", "modularity_candidate(2).", built.program].join("\n");
  for (const predicate of contract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(program, new RegExp(`\\b${name}\\(`), `${predicate}: input del builder`);
  }
  for (const predicate of contract.witnessPredicates) {
    const [name, arity] = predicate.split("/");
    assert.ok(program.includes(`#show ${name}/${arity}.`), `${predicate}: witness mostrato`);
  }

  const parsed = parseCommunityConstraintDiagnosisResult({
    Result: "OPTIMUM FOUND",
    Models: { Costs: [1], More: "no" },
    Call: [{ Witnesses: [{
      Value: [
        "relax_constraint(4)", "relaxation_cost(1)", "partition_score(0)",
        "community(1,1)", "community(2,1)"
      ],
      Costs: [1]
    }] }]
  }, { 1: "A", 2: "B" }, built.constraints);
  assert.equal(parsed.length, 1);
  assert.deepEqual(Object.keys(parsed[0]).sort(), [...contract.resultFields].sort());
  assert.deepEqual(parsed[0].relaxedConstraints.map(({ kind }) => kind), ["cannotLink"]);
});

test("il probe di co-appartenenza comunitaria dichiara la coppia di ottimizzazioni e il classificatore esatti", () => {
  const contract = GRAPH_TASK_CONTRACTS.communities.supportingQueries?.find(
    (query) => query.id === "communityPairOptimalMembership"
  );
  assert.ok(contract);
  assert.equal(contract.resultKind, "optimumMembership");
  assert.deepEqual(contract.supportedEnumeration, ["one-optimum"]);

  const facts = buildModularityFacts([1, 2, 3], [
    { source: 1, target: 2, weight: 2 },
    { source: 2, target: 3, weight: 3 }
  ], { weighted: true, includePairwiseObjective: true });
  assert.ok(facts.pairwiseObjectiveFacts);
  const programs = buildCommunityPairMembershipPrograms({
    weighted: true,
    minCount: 1,
    maxCount: 3,
    mustLinkPairs: [[1, 2]],
    cannotLinkPairs: [[1, 3]],
    attributeBounds: [{ nodeIndexes: [1, 2], attributeName: "role", attributeValue: "person", minPerCommunity: 1, maxPerCommunity: 2 }],
    pairwiseObjectiveOffset: facts.pairwiseObjectiveOffset
  }, [1, 2]);
  const sharedFacts = [facts.facts, facts.pairwiseObjectiveFacts].join("\n");
  for (const program of [programs.together, programs.separate]) {
    const combined = `${sharedFacts}\n${program}`;
    for (const predicate of contract.inputPredicates) {
      const [name] = predicate.split("/");
      assert.match(combined, new RegExp(`\\b${name}\\(`), predicate);
    }
    for (const predicate of contract.witnessPredicates) {
      const [name, arity] = predicate.split("/");
      assert.ok(program.includes(`#show ${name}/${arity}.`), predicate);
    }
  }

  const result = classifyCommunityPairOptimumMembership(["A", "B"], 120, 120, 108);
  assert.equal(result.relation, "always");
  assert.deepEqual(Object.keys(result).sort(), [...contract.resultFields].sort());
});

test("il selettore dei controfattuali topologici dichiara il solo ASP sul costo e verifica il parser", () => {
  const contract = GRAPH_TASK_CONTRACTS.communities.supportingQueries?.find(
    (query) => query.id === "communityTopologyEditSelection"
  );
  assert.ok(contract);
  assert.equal(contract.resultKind, "counterfactual");
  assert.equal(contract.parser, "parseCommunityEditSelectionWitnesses");
  assert.deepEqual(contract.supportedEnumeration, ["one-minimum-cost"]);

  const edits = [{ cost: 2 }, { cost: 3 }, { cost: 4 }];
  const program = buildMinimumCostCommunityEditSelectionProgram(edits, [[0]]);
  for (const predicate of contract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(program, new RegExp(`\\b${name}\\(`), predicate);
  }
  for (const predicate of contract.witnessPredicates) {
    const [name, arity] = predicate.split("/");
    assert.ok(program.includes(`#show ${name}/${arity}.`), predicate);
  }

  const parsed = parseCommunityEditSelectionWitnesses([{
    Value: ["community_selected_edit(2)"],
    Costs: [3]
  }], edits.map(({ cost }) => cost));
  assert.deepEqual(Object.keys(parsed).sort(), [...contract.resultFields].sort());
  assert.deepEqual(parsed, { indexes: [1], totalCost: 3 });
});

test("le diagnosi di membership clique e k-plex hanno contratti distinti verificati sui builder e parser", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
    edges: [{ source: "A", target: "B" }, { source: "B", target: "C" }]
  });
  const asp = buildAspFactsFromGraph(graph, () => ["cohort"]);
  const cliqueContract = GRAPH_TASK_CONTRACTS.clique.supportingQueries?.find(
    (query) => query.id === "cliqueMaximumMembershipDiagnosis"
  );
  const kPlexContract = GRAPH_TASK_CONTRACTS.kPlex.supportingQueries?.find(
    (query) => query.id === "kPlexMaximumMembershipDiagnosis"
  );
  assert.ok(cliqueContract);
  assert.ok(kPlexContract);
  assert.equal(cliqueContract.resultKind, "membershipDiagnosis");
  assert.equal(kPlexContract.resultKind, "membershipDiagnosis");
  const [nodeA, nodeB, nodeC] = [1, 2, 3].map((index) => asp.reverseIndex[index]);
  assert.ok(nodeA && nodeB && nodeC);

  const cliqueProgram = [
    asp.facts,
    buildCliqueProgram("maximum", "cohort"),
    buildCliqueRequiredNodeConstraint(1)
  ].join("\n");
  const kPlexProgram = [
    asp.facts,
    buildMaximumKPlexProgram(2, "cohort"),
    buildKPlexRequiredNodeConstraint(1)
  ].join("\n");
  for (const [contract, program] of [[cliqueContract, cliqueProgram], [kPlexContract, kPlexProgram]]) {
    for (const predicate of contract.inputPredicates) {
      const [name] = predicate.split("/");
      assert.match(program, new RegExp(`\\b${name}\\(`), `${contract.id}: ${predicate}`);
    }
    for (const predicate of contract.witnessPredicates) {
      const [name, arity] = predicate.split("/");
      assert.ok(program.includes(`#show ${name}/${arity}.`), `${contract.id}: ${predicate}`);
    }
  }

  const cliqueDiagnosis = parseCliqueMaximumMembershipDiagnosis({
    Result: "OPTIMUM FOUND",
    Call: [{ Witnesses: [{ Value: ["in(1)", "in(2)"] }] }]
  }, {
    reverseIndex: asp.reverseIndex,
    candidateNodeIds: [nodeA, nodeB, nodeC],
    edgeRecords: [{ sourceNodeId: nodeA, targetNodeId: nodeB, edgeId: "AB" }],
    targetNodeId: nodeA,
    globalMaximumSize: 2
  });
  assert.deepEqual(Object.keys(cliqueDiagnosis).sort(), [...cliqueContract.resultFields].sort());

  const kPlexDiagnosis = parseKPlexMaximumMembershipDiagnosis({
    Result: "OPTIMUM FOUND",
    Call: [{ Witnesses: [{ Value: ["in(1)", "in(2)", "in(3)", "missing_tie(1,3)"] }] }]
  }, {
    reverseIndex: asp.reverseIndex,
    candidateNodeIds: [nodeA, nodeB, nodeC],
    edgeRecords: [{ sourceNodeId: nodeA, targetNodeId: nodeB }, { sourceNodeId: nodeB, targetNodeId: nodeC }],
    targetNodeId: nodeA,
    s: 2,
    globalMaximumSize: 3
  });
  assert.deepEqual(Object.keys(kPlexDiagnosis).sort(), [...kPlexContract.resultFields].sort());
});

test("completamento e why-not del k-plex dichiarano domini, witness e parser distinti", () => {
  const completionContract = GRAPH_TASK_CONTRACTS.kPlex.supportingQueries?.find(
    (query) => query.id === "kPlexCompletionCounterfactual"
  );
  const whyNotContract = GRAPH_TASK_CONTRACTS.kPlex.supportingQueries?.find(
    (query) => query.id === "kPlexCompletionWhyNot"
  );
  assert.ok(completionContract);
  assert.ok(whyNotContract);
  assert.equal(completionContract.parser, "parseKPlexCompletionCounterfactuals");
  assert.equal(whyNotContract.parser, "parseKPlexCompletionWhyNot");
  assert.deepEqual(whyNotContract.supportedEnumeration, ["one-complete-blocker-certificate"]);

  const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }];
  const graph = normalizeGraphData({ nodes, edges: [{ source: "A", target: "B" }] });
  const asp = buildAspFactsFromGraph(graph);
  const nodeIdByIndex = new Map(Object.entries(asp.reverseIndex).map(([index, id]) => [Number(index), id]));
  const candidate = {
    id: "candidate-AC",
    sourceNodeId: "A",
    targetNodeId: "C",
    sourceNode: 1,
    targetNode: 3,
    edgeType: "collaborates",
    cost: 4,
    recordIndex: 11
  };

  const completion = buildKPlexCompletionCounterfactualProgram(1, [1, 2, 3], [candidate]);
  const completionProgram = `${asp.facts}\n${completion.program}`;
  for (const predicate of completionContract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(completionProgram, new RegExp(`\\b${name}\\(`), predicate);
  }
  for (const predicate of completionContract.witnessPredicates) {
    const [name, arity] = predicate.split("/");
    assert.ok(completion.program.includes(`#show ${name}/${arity}.`), predicate);
  }
  const proposal = parseKPlexCompletionCounterfactuals([{
    Value: ["cf_add_edge(11)"],
    Costs: [4]
  }], completion.candidates)[0];
  assert.deepEqual(Object.keys(proposal).sort(), [...completionContract.resultFields].sort());

  const whyNot = buildKPlexCompletionWhyNotProgram(1, [1, 2, 3], [candidate]);
  const whyNotProgram = `${asp.facts}\n${whyNot.program}`;
  for (const predicate of whyNotContract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(whyNotProgram, new RegExp(`\\b${name}\\(`), predicate);
  }
  for (const predicate of whyNotContract.witnessPredicates) {
    const [name, arity] = predicate.split("/");
    assert.ok(whyNot.program.includes(`#show ${name}/${arity}.`), predicate);
  }
  const certificate = parseKPlexCompletionWhyNot([{
    Value: [
      "cf_plex_diag_unfillable_pair(2,3)",
      "cf_plex_diag_blocker(2)", "cf_plex_diag_blocker(3)"
    ]
  }], 1, [1, 2, 3], [{ sourceNode: 1, targetNode: 2 }], whyNot.candidates, nodeIdByIndex);
  assert.deepEqual(Object.keys(certificate).sort(), [...whyNotContract.resultFields].sort());
});

test("il controfattuale di membership k-plex registra selettore e due query di ottimo", () => {
  const contract = GRAPH_TASK_CONTRACTS.kPlex.supportingQueries?.find(
    (query) => query.id === "kPlexMaximumMembershipCounterfactual"
  );
  assert.ok(contract);
  assert.equal(contract.resultKind, "counterfactual");
  assert.match(contract.querySemantics, /ottimo s-plex globale.*ottimo con il target forzato/s);
  assert.deepEqual(contract.supportedEnumeration, ["one-proven-minimum-cost-proposal"]);

  const graph = normalizeGraphData({
    nodes: [{ id: "A", groups: ["cohort"] }, { id: "B", groups: ["cohort"] }, { id: "C", groups: ["cohort"] }],
    edges: [{ source: "A", target: "B" }]
  });
  const asp = buildAspFactsFromGraph(graph, (node) => node.groups ?? []);
  const selection = buildMinimumCostKPlexMembershipSelectionProgram([{
    id: "candidate-AC", sourceNodeId: "A", targetNodeId: "C", sourceNode: 1, targetNode: 3,
    edgeType: "contact", cost: 2, recordIndex: 11
  }]);
  const maximum = buildMaximumKPlexProgram(1, "cohort");
  const forcedMaximum = `${maximum}\n${buildKPlexRequiredNodeConstraint(1)}`;
  const combined = [asp.facts, selection.program, maximum, forcedMaximum].join("\n");
  for (const predicate of contract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(combined, new RegExp(`\\b${name}\\(`), predicate);
  }
  for (const predicate of ["cf_kpmc_candidate/1", "cf_kpmc_candidate_cost/2"]) {
    const [name, arity] = predicate.split("/");
    assert.ok(selection.program.includes(`#show ${name}/${arity}.`) || selection.program.includes(`${name}(`));
  }
  assert.ok(selection.program.includes("#show cf_kpmc_add_edge/1."));
  assert.ok(maximum.includes("#show in/1."));
  assert.ok(maximum.includes("#show missing_tie/2."));
  assert.deepEqual(contract.resultFields, [
    "targetNodeId", "s", "globalMaximumSize", "maximumContainingSize", "sizeGap", "outcome",
    "witnessNodeIds", "missingPairs", "selectedEdges", "candidateCount", "totalCost", "testedCandidateSets"
  ]);
});

test("i quattro protocolli k-core distinguono cohort fisso, membership e peeling", () => {
  const queries = new Map((GRAPH_TASK_CONTRACTS.kCore.supportingQueries ?? [])
    .map((query) => [query.id, query]));
  const fixedCompletionContract = queries.get("kCoreCompletionCounterfactual");
  const membershipCompletionContract = queries.get("kCoreMembershipCompletionCounterfactual");
  const fixedWhyNotContract = queries.get("kCoreCompletionWhyNot");
  const membershipWhyNotContract = queries.get("kCoreMembershipCompletionWhyNot");
  for (const contract of [fixedCompletionContract, membershipCompletionContract, fixedWhyNotContract, membershipWhyNotContract]) {
    assert.ok(contract);
  }

  const graph = normalizeGraphData({
    nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
    edges: [{ source: "A", target: "B" }]
  });
  const asp = buildAspFactsFromGraph(graph);
  const nodeIdByIndex = new Map(Object.entries(asp.reverseIndex).map(([index, id]) => [Number(index), id]));
  const candidateAC = {
    id: "candidate-AC", sourceNodeId: asp.reverseIndex[1], targetNodeId: asp.reverseIndex[3],
    sourceNode: 1, targetNode: 3, edgeType: "collaborates", cost: 3, recordIndex: 11
  };
  const candidateBC = {
    id: "candidate-BC", sourceNodeId: asp.reverseIndex[2], targetNodeId: asp.reverseIndex[3],
    sourceNode: 2, targetNode: 3, edgeType: "collaborates", cost: 4, recordIndex: 12
  };
  const candidates = [candidateAC, candidateBC];
  const edge = [{ sourceNode: 1, targetNode: 2 }];
  const assertContractMatches = (contract, program, result, parserFields) => {
    for (const predicate of contract.inputPredicates) {
      const [name] = predicate.split("/");
      assert.match(program, new RegExp(`\\b${name}\\(`), `${contract.id}: ${predicate}`);
    }
    for (const predicate of contract.witnessPredicates) {
      const [name, arity] = predicate.split("/");
      assert.ok(program.includes(`#show ${name}/${arity}.`), `${contract.id}: ${predicate}`);
    }
    assert.deepEqual(parserFields, [...contract.resultFields].sort(), `${contract.id}: campi parser`);
    assert.ok(result, `${contract.id}: risultato parser`);
  };

  const fixedCompletion = buildKCoreCompletionCounterfactualProgram(2, [1, 2, 3], candidates);
  const fixedCompletionProgram = `${asp.facts}\n${fixedCompletion.program}`;
  const fixedCompletionResult = parseKCoreCompletionCounterfactuals([{
    Value: ["cf_core_add_edge(11)", "cf_core_add_edge(12)"], Costs: [7]
  }], fixedCompletion.candidates)[0];
  assertContractMatches(fixedCompletionContract, fixedCompletionProgram, fixedCompletionResult,
    Object.keys(fixedCompletionResult).sort());

  const membershipCompletion = buildKCoreMembershipCompletionCounterfactualProgram(2, 3, [1, 2, 3], candidates);
  const membershipCompletionProgram = `${asp.facts}\n${membershipCompletion.program}`;
  const membershipCompletionResult = parseKCoreMembershipCompletionCounterfactuals([{
    Value: [
      "cf_core_membership_add_edge(11)", "cf_core_membership_add_edge(12)",
      "cf_core_member(1)", "cf_core_member(2)", "cf_core_member(3)"
    ],
    Costs: [7]
  }], membershipCompletion.candidates, nodeIdByIndex, asp.reverseIndex[3])[0];
  assertContractMatches(membershipCompletionContract, membershipCompletionProgram, membershipCompletionResult,
    Object.keys(membershipCompletionResult).sort());

  const fixedWhyNot = buildKCoreCompletionWhyNotProgram(2, [1, 2, 3], [candidateAC]);
  const fixedWhyNotProgram = `${asp.facts}\n${fixedWhyNot.program}`;
  const fixedWhyNotResult = parseKCoreCompletionWhyNot([
    { Value: [
      "cf_core_diag_current_degree(1,1)", "cf_core_diag_current_degree(2,1)", "cf_core_diag_current_degree(3,0)",
      "cf_core_diag_maximum_degree(1,2)", "cf_core_diag_maximum_degree(2,1)", "cf_core_diag_maximum_degree(3,1)",
      "cf_core_diag_blocker(2)", "cf_core_diag_blocker(3)"
    ] }
  ], 2, [1, 2, 3], edge, fixedWhyNot.candidates, nodeIdByIndex);
  assertContractMatches(fixedWhyNotContract, fixedWhyNotProgram, fixedWhyNotResult,
    Object.keys(fixedWhyNotResult).sort());

  const membershipWhyNot = buildKCoreMembershipCompletionWhyNotProgram(2, 3, [1, 2, 3], [candidateAC]);
  const membershipWhyNotProgram = `${asp.facts}\n${membershipWhyNot.program}`;
  const membershipWhyNotResult = parseKCoreMembershipCompletionWhyNot([{
    Value: [
      "cf_kcm_diag_peeled_at(2,1)", "cf_kcm_diag_peeled_at(3,1)",
      "cf_kcm_diag_peel_support(2,1,1)", "cf_kcm_diag_peel_support(3,1,1)"
    ]
  }], 2, 3, [1, 2, 3], edge, membershipWhyNot.candidates, nodeIdByIndex,
  { stopAfterTargetRemoval: true });
  assertContractMatches(membershipWhyNotContract, membershipWhyNotProgram, membershipWhyNotResult,
    Object.keys(membershipWhyNotResult).sort());
  assert.equal(membershipWhyNotResult.peelingScope, "target_prefix");
});

test("i cammini tipizzati separano completion, why-not statico e diagnosi temporale", () => {
  const queries = new Map((GRAPH_TASK_CONTRACTS.typedPath.supportingQueries ?? [])
    .map((query) => [query.id, query]));
  const completionContract = queries.get("typedPathCompletionCounterfactual");
  const whyNotContract = queries.get("typedPathCompletionWhyNot");
  const temporalContract = queries.get("typedPathTemporalNoRoute");
  const temporalCompletionWhyNotContract = queries.get("typedPathTemporalCompletionWhyNot");
  for (const contract of [completionContract, whyNotContract, temporalContract, temporalCompletionWhyNotContract]) {
    assert.ok(contract);
  }

  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id", sourceField: "$.source", targetField: "$.target", typeField: "$.type",
        direction: "directed", identity: "multigraph",
        validity: { fromField: "$.from", toField: "$.to" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [{ id: "A" }, { id: "B" }, { id: "C" }],
    edges: [{ id: "edge-x", source: "A", target: "B", type: "x", from: 0, to: 10 }]
  }, config);
  const asp = buildAspFactsFromGraph(graph, () => ["typed-path-domain"], { additionalTemporalValues: [2, 8] });
  const edgeFacts = buildMinimumEdgeSeparatorFacts(graph.links, asp.indexByNodeId);
  const nodeIndex = (id) => asp.indexByNodeId.get(id);
  const options = {
    startNode: nodeIndex("a"), goalNode: nodeIndex("c"),
    edgeTypeSequence: ["x", "y"], direction: "directed"
  };
  const temporalOptions = { ...options, temporalSemantics: "coValid" };
  const observedEdges = [{
    recordIndex: 1, sourceNode: nodeIndex("a"), targetNode: nodeIndex("b"), edgeType: "x"
  }];
  const candidate = {
    id: "candidate-y", sourceNodeId: "b", targetNodeId: "c",
    sourceNode: nodeIndex("b"), targetNode: nodeIndex("c"), edgeType: "y", cost: 2, recordIndex: 2,
    validity: { from: 2, to: 8 }
  };
  const staticCandidate = { ...candidate };
  delete staticCandidate.validity;
  const reverseNodeIndex = asp.reverseIndex;
  const candidateNodeIds = Object.values(reverseNodeIndex);

  const staticCompletion = buildTypedPathCompletionCounterfactualProgram(options, [staticCandidate]);
  const temporalCompletion = buildTypedPathCompletionCounterfactualProgram(
    temporalOptions, [candidate], asp.temporalEncoding
  );
  const orderedCompletion = buildTypedPathCompletionCounterfactualProgram(
    { ...options, temporalSemantics: "orderedByStart" }, [candidate], asp.temporalEncoding
  );
  const completionProgram = [asp.facts, staticCompletion.program, temporalCompletion.program, orderedCompletion.program].join("\n");
  for (const predicate of completionContract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(completionProgram, new RegExp(`\\b${name}\\(`), predicate);
  }
  for (const predicate of completionContract.witnessPredicates) {
    const [name, arity] = predicate.split("/");
    assert.ok(completionProgram.includes(`#show ${name}/${arity}.`), predicate);
  }
  const temporalCandidate = temporalCompletion.candidates[0];
  const temporalEdgeRecords = [
    {
      ...observedEdges[0],
      validityFrom: asp.temporalEncoding.encode(0),
      validityTo: asp.temporalEncoding.encode(10)
    },
    {
      recordIndex: temporalCandidate.recordIndex,
      sourceNode: temporalCandidate.sourceNode,
      targetNode: temporalCandidate.targetNode,
      edgeType: temporalCandidate.edgeType,
      validityFrom: temporalCandidate.validityFrom,
      validityTo: temporalCandidate.validityTo
    }
  ];
  const temporalProposal = parseTypedPathCompletionCounterfactuals([{
    Value: [
      `typed_path_node(0,${options.startNode})`, `typed_path_node(1,${nodeIndex("b")})`,
      `typed_path_node(2,${options.goalNode})`, "typed_path_edge(1,1)", "typed_path_edge(2,2)",
      `typed_path_time(${temporalCandidate.validityFrom})`, "typed_path_edge_support(1,1)",
      "typed_path_edge_support(2,2)", "cf_typed_path_add_edge(2)"
    ],
    Costs: [2]
  }], temporalOptions, temporalCompletion.candidates, observedEdges,
  reverseNodeIndex, edgeFacts.reverseEdgeIndex, {
    edgeRecords: temporalEdgeRecords,
    decodeTemporalValue: asp.temporalEncoding.decode
  })[0];
  assert.ok(temporalProposal);
  assert.deepEqual(Object.keys(temporalProposal).sort(), [...completionContract.resultFields].sort());

  const staticWhyNotOptions = { ...options, edgeTypeSequence: ["x", "z"] };
  const staticWhyNot = buildTypedPathCompletionWhyNotProgram(staticWhyNotOptions, [staticCandidate]);
  for (const predicate of whyNotContract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(`${asp.facts}\n${staticWhyNot.program}`, new RegExp(`\\b${name}\\(`), predicate);
  }
  for (const predicate of whyNotContract.witnessPredicates) {
    const [name, arity] = predicate.split("/");
    assert.ok(staticWhyNot.program.includes(`#show ${name}/${arity}.`), predicate);
  }
  const staticWhyNotResult = parseTypedPathCompletionWhyNotCertificate([{
    Value: [
      "typed_path_no_route_step(0)", "typed_path_no_route_step(1)", "typed_path_no_route_step(2)",
      `typed_path_no_route_node(0,${options.startNode})`, `typed_path_no_route_node(1,${nodeIndex("b")})`,
      "cf_typed_path_why_not_candidate(2)"
    ]
  }], staticWhyNotOptions, staticWhyNot.candidates, observedEdges, candidateNodeIds, reverseNodeIndex);
  assert.ok(staticWhyNotResult);
  assert.deepEqual(Object.keys(staticWhyNotResult).sort(), [...whyNotContract.resultFields].sort());

  const temporalNoRouteProgram = buildTypedPathTemporalNoRouteProgram(temporalOptions);
  const orderedTemporalNoRouteProgram = buildTypedPathTemporalNoRouteProgram({
    ...options, temporalSemantics: "orderedByStart"
  });
  const allTemporalNoRoutePrograms = `${temporalNoRouteProgram}\n${orderedTemporalNoRouteProgram}`;
  for (const predicate of temporalContract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(`${asp.facts}\n${allTemporalNoRoutePrograms}`, new RegExp(`\\b${name}\\(`), predicate);
  }
  for (const predicate of temporalContract.witnessPredicates) {
    const [name, arity] = predicate.split("/");
    assert.ok(allTemporalNoRoutePrograms.includes(`#show ${name}/${arity}.`), predicate);
  }
  const temporalNoRouteResult = parseTypedPathTemporalNoRouteCertificate([{
    Value: [
      "temporal_typed_path_depth(1)",
      `temporal_typed_path_node(0,${options.startNode})`,
      `temporal_typed_path_node(1,${nodeIndex("b")})`,
      "temporal_typed_path_edge(1,1)",
      `temporal_typed_path_common_start(${asp.temporalEncoding.encode(0)})`
    ]
  }], temporalOptions, [{
    ...observedEdges[0],
    validityFrom: asp.temporalEncoding.encode(0),
    validityTo: asp.temporalEncoding.encode(10)
  }], candidateNodeIds, reverseNodeIndex, edgeFacts.reverseEdgeIndex, asp.temporalEncoding.decode);
  assert.ok(temporalNoRouteResult);
  assert.ok(Object.keys(temporalNoRouteResult).every((field) => temporalContract.resultFields.includes(field)));
  assert.deepEqual(Object.keys(temporalNoRouteResult).sort(), [
    "commonTimeValue", "edgeTypeSequence", "firstBlockedStep", "goalReachableAsWalk",
    "maximumPrefixLength", "repeatedNodeIds", "temporalSemantics", "walk"
  ]);

  const temporalCompletionWhyNotOptions = { ...temporalOptions, edgeTypeSequence: ["x", "z"] };
  const temporalCompletionWhyNot = buildTypedPathTemporalCompletionWhyNotProgram(
    temporalCompletionWhyNotOptions,
    [candidate],
    asp.temporalEncoding
  );
  const orderedTemporalCompletionWhyNot = buildTypedPathTemporalCompletionWhyNotProgram(
    { ...temporalCompletionWhyNotOptions, temporalSemantics: "orderedByStart" },
    [candidate],
    asp.temporalEncoding
  );
  const temporalCompletionWhyNotProgram =
    `${asp.facts}\n${temporalCompletionWhyNot.program}\n${orderedTemporalCompletionWhyNot.program}`;
  for (const predicate of temporalCompletionWhyNotContract.inputPredicates) {
    const [name] = predicate.split("/");
    assert.match(temporalCompletionWhyNotProgram, new RegExp(`\\b${name}\\(`), predicate);
  }
  for (const predicate of temporalCompletionWhyNotContract.witnessPredicates) {
    const [name, arity] = predicate.split("/");
    assert.ok(temporalCompletionWhyNotProgram.includes(`#show ${name}/${arity}.`), predicate);
  }
  const temporalCompletionWhyNotResult = parseTypedPathTemporalCompletionWhyNotCertificate([{
    Value: [
      "temporal_typed_path_depth(1)",
      `temporal_typed_path_node(0,${options.startNode})`,
      `temporal_typed_path_node(1,${nodeIndex("b")})`,
      "temporal_typed_path_edge(1,1)",
      `temporal_typed_path_common_start(${asp.temporalEncoding.encode(0)})`,
      `cf_typed_path_temporal_why_not_candidate(${candidate.recordIndex})`
    ]
  }], temporalCompletionWhyNotOptions, temporalCompletionWhyNot.candidates,
  [temporalEdgeRecords[0]], candidateNodeIds, reverseNodeIndex, edgeFacts.reverseEdgeIndex,
  asp.temporalEncoding.decode);
  assert.ok(temporalCompletionWhyNotResult);
  const orderedTemporalCompletionWhyNotResult = parseTypedPathTemporalCompletionWhyNotCertificate([{
    Value: [
      "temporal_typed_path_depth(1)",
      `temporal_typed_path_node(0,${options.startNode})`,
      `temporal_typed_path_node(1,${nodeIndex("b")})`,
      "temporal_typed_path_edge(1,1)",
      `temporal_typed_path_ordered_start(1,1,${asp.temporalEncoding.encode(0)})`,
      `cf_typed_path_temporal_why_not_candidate(${candidate.recordIndex})`
    ]
  }], { ...temporalCompletionWhyNotOptions, temporalSemantics: "orderedByStart" },
  orderedTemporalCompletionWhyNot.candidates, [temporalEdgeRecords[0]], candidateNodeIds,
  reverseNodeIndex, edgeFacts.reverseEdgeIndex, asp.temporalEncoding.decode);
  assert.ok(orderedTemporalCompletionWhyNotResult);
  const temporalCompletionWhyNotFields = [...new Set([
    ...Object.keys(temporalCompletionWhyNotResult),
    ...Object.keys(orderedTemporalCompletionWhyNotResult)
  ])].sort();
  assert.deepEqual(temporalCompletionWhyNotFields, [...temporalCompletionWhyNotContract.resultFields].sort());
});

test("il vocabolario dei contratti coincide con i fatti e gli atomi ASP realmente usati", () => {
  assert.deepEqual(GRAPH_TASK_CONTRACTS.minimumNodeSeparator.inputPredicates, [
    "node/1", "group/2", "edge/2"
  ]);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.minimumCostNodeSeparator.inputPredicates, [
    "node/1", "group/2", "edge/2", "node_removal_cost/2"
  ]);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.minimumEdgeSeparator.inputPredicates, [
    "cut_edge_record/1", "cut_edge_source/2", "cut_edge_target/2"
  ]);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.communities.inputPredicates.slice(0, 9), [
    "modularity_candidate/1", "modularity_edge/3", "modularity_degree/2", "modularity_m/1",
    "modularity_resolution/2", "modularity_edge_weight/2", "must_link/2", "cannot_link/2",
    "minimum_community_count/1"
  ]);
  assert.ok(!GRAPH_TASK_CONTRACTS.communities.inputPredicates.includes("community_must_link/2"));
  assert.ok(!GRAPH_TASK_CONTRACTS.minimumNodeSeparator.inputPredicates.includes("cut_candidate/1"));
  assert.deepEqual(GRAPH_TASK_CONTRACTS.boundedPath.witnessPredicates, [
    "path_no_route_certificate/1", "path_no_route_reachable/2"
  ]);
  assert.equal(GRAPH_TASK_CONTRACTS.boundedPath.resultKind, "certificate");
  assert.equal(GRAPH_TASK_CONTRACTS.path.resultKind, "nodeSequence");
  assert.equal(GRAPH_TASK_CONTRACTS.typedPath.resultKind, "nodeSequence");
  assert.equal(GRAPH_TASK_CONTRACTS.typedPath.parser, "parseWitnessTypedPath / parseWitnessTemporalTypedPath");
  assert.deepEqual(GRAPH_TASK_CONTRACTS.typedPath.resultFields, [
    "nodeIds", "edgeIdsByStep", "temporalSemantics", "commonTimeValue", "startTimeValuesByStep"
  ]);
  assert.ok(!GRAPH_TASK_CONTRACTS.typedPath.visualization.includes("ruoli"));
  assert.deepEqual(GRAPH_TASK_CONTRACTS.kCore.resultFields, ["nodeIds", "supportPairs", "peeling"]);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.kCore.applicationDerivedFields, ["coreNumbers"]);
  assert.match(GRAPH_TASK_CONTRACTS.kCore.querySemantics, /non è un output ASP/);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.kCore.supportedEnumeration, ["unique-core"]);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.kPlex.witnessPredicates, ["in/1", "missing_tie/2"]);
});

test("ogni capability richiesta dal registro esiste nel grafo normalizzato", () => {
  assert.deepEqual(Object.keys(GRAPH_CAPABILITY_LABELS).sort(), [...GRAPH_CAPABILITY_IDS].sort());
  assert.equal(GRAPH_CAPABILITY_LABELS.modularityWeights, "Pesi validi per la modularità");
  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ source: "a", target: "b" }]
  });
  const contexts = [
    {},
    { direction: "directed", temporalSemantics: "coValid", useEdgeWeights: true }
  ];

  for (const task of Object.keys(GRAPH_TASK_CONTRACTS)) {
    for (const context of contexts) {
      const contract = getGraphTaskContract(task, context);
      assert.ok(contract, `${task}: contratto presente`);
      for (const capability of contract.requiredCapabilities) {
        assert.ok(Object.hasOwn(graph.capabilities, capability), `${task}: capability '${capability}' riconosciuta`);
      }
    }
  }
});

test("i campi del contratto typedPath coincidono con i risultati dei parser statici e temporali", () => {
  const reverseNodeIndex = { 1: "A", 2: "B" };
  const reverseEdgeIndex = { 3: "edge-A-B" };
  const staticWitness = { Value: [
    "typed_path_node(0,1)", "typed_path_node(1,2)", "typed_path_edge(1,3)"
  ] };
  const staticResult = parseWitnessTypedPath([staticWitness], reverseNodeIndex, reverseEdgeIndex, 1);
  assert.ok(staticResult);

  const temporalOptions = {
    startNode: 1,
    goalNode: 2,
    edgeTypeSequence: ["collaborates"],
    direction: "directed",
    temporalSemantics: "coValid"
  };
  const edgeRecords = [{
    recordIndex: 3,
    sourceNode: 1,
    targetNode: 2,
    edgeType: "collaborates",
    validityFrom: 10,
    validityTo: 20
  }];
  const coValidResult = parseWitnessTemporalTypedPath([{
    Value: [
      ...staticWitness.Value,
      "typed_path_time(10)",
      "typed_path_edge_support(1,3)"
    ]
  }], reverseNodeIndex, reverseEdgeIndex, edgeRecords, temporalOptions, (value) => value);
  assert.ok(coValidResult);

  const orderedResult = parseWitnessTemporalTypedPath([{
    Value: [
      ...staticWitness.Value,
      "typed_path_ordered_support(1,3,10)",
      "typed_path_edge_support(1,3)"
    ]
  }], reverseNodeIndex, reverseEdgeIndex, edgeRecords, {
    ...temporalOptions,
    temporalSemantics: "orderedByStart"
  }, (value) => value);
  assert.ok(orderedResult);

  const parserFields = [...new Set([
    ...Object.keys(staticResult),
    ...Object.keys(coValidResult),
    ...Object.keys(orderedResult)
  ])].sort();
  assert.deepEqual(parserFields, [...GRAPH_TASK_CONTRACTS.typedPath.resultFields].sort());
});

test("components, weakComponents e strongComponents tipizzano il risultato-array come campo semantico", () => {
  const reverseNodeIndex = { 1: "A", 2: "B", 3: "C" };
  const expected = [["A", "B"], ["C"]];
  const cases = [
    { task: "components", parser: parseWitnessComponents, predicate: "component" },
    { task: "weakComponents", parser: parseWitnessWeakComponents, predicate: "weak_component" },
    { task: "strongComponents", parser: parseWitnessStrongComponents, predicate: "strong_component" }
  ];

  for (const { task, parser, predicate } of cases) {
    const result = parser([{
      Value: [`${predicate}(1,1)`, `${predicate}(2,1)`, `${predicate}(3,3)`]
    }], reverseNodeIndex);
    assert.deepEqual(result, expected, `${task}: output del parser`);
    assert.deepEqual(GRAPH_TASK_CONTRACTS[task].resultFields, ["components"], `${task}: campo semantico`);
  }
});

test("il contratto kCore distingue le chiavi del witness ASP dal profilo derivato", () => {
  const parsedCore = parseWitnessKCoreExplanations([{
    Value: ["in(1)", "in(2)", "core_support(1,2)", "peeled_at(3,1)"]
  }], { 1: "A", 2: "B", 3: "C" })[0];
  assert.deepEqual(Object.keys(parsedCore).sort(), [...GRAPH_TASK_CONTRACTS.kCore.resultFields].sort());
  assert.ok(!Object.hasOwn(parsedCore, "coreNumbers"));
  assert.deepEqual(GRAPH_TASK_CONTRACTS.kCore.applicationDerivedFields, ["coreNumbers"]);
  assert.equal(resolveTaskEnumeration("kCore", { includeKCoreNumbers: true }), "unique-core");
  assert.equal(getTaskEnumerationDescription("kCore", { includeKCoreNumbers: true }), "unico k-core alla soglia scelta");
});

test("motifCount separa il conteggio ASP dal numero di partizioni orchestrate dall'app", () => {
  const parsedCount = parseTypedMotifCount([{ Value: ["motif_count(17)"] }]);
  assert.equal(parsedCount, "17");
  assert.deepEqual(GRAPH_TASK_CONTRACTS.motifCount.resultFields, ["count"]);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.motifCount.applicationDerivedFields, ["partitionCount"]);
});

test("i contratti dei motivi coprono i campi semantici delle varianti statiche e temporali", () => {
  const reverseNodeIndex = { 1: "node-A", 2: "node-B" };
  const reverseSourceNodeIndex = { 1: "A", 2: "B" };
  const reverseEdgeIndex = { 3: "edge-A-B" };
  const roles = {
    source: { nodeTypes: ["person"] },
    target: { nodeTypes: ["person"] }
  };
  const edges = [{ sourceRole: "source", targetRole: "target", edgeType: "collaborates" }];
  const staticTemplate = buildTypedMotifProgram({
    id: "contract-static",
    label: "Static contract",
    roles,
    edges,
    absentEdges: [{ sourceRole: "target", targetRole: "source", edgeType: "mentors" }],
    inducedEdgeTypes: ["collaborates"],
    closedWorld: true
  }, "directed");
  const staticMatch = parseTypedMotifMatches([{
    Value: ["motif_match(1,1)", "motif_match(2,2)", "motif_edge_support(1,3)"]
  }], staticTemplate, reverseNodeIndex, reverseSourceNodeIndex, reverseEdgeIndex)[0];
  assert.ok(staticMatch);
  assert.equal(Object.hasOwn(staticMatch, "timeValue"), true);
  assert.equal(staticMatch.timeValue, undefined, "il parser conserva la chiave anche nel caso statico");
  assert.deepEqual(
    Object.keys(staticMatch).sort(),
    [
      ...GRAPH_TASK_CONTRACTS.typedMotif.resultFields,
      ...(GRAPH_TASK_CONTRACTS.typedMotif.resultContextFields ?? [])
    ].sort()
  );

  const temporalEncoding = createAspTemporalEncoding([5], "seconds");
  const temporalTemplate = buildTypedMotifProgram({
    id: "contract-temporal",
    label: "Temporal contract",
    roles,
    edges,
    temporal: { semantics: "orderedByStart", maximumSpan: { value: 5, unit: "seconds" } }
  }, "directed", "", false, false, temporalEncoding);
  const temporalMatch = parseTypedMotifMatches([{
    Value: ["motif_match(1,1)", "motif_match(2,2)", "motif_ordered_support(1,3,5)", "motif_time(5)"]
  }], temporalTemplate, reverseNodeIndex, reverseSourceNodeIndex, reverseEdgeIndex, new Set(), (value) => value)[0];
  assert.ok(temporalMatch);
  assert.deepEqual(
    Object.keys(temporalMatch).sort(),
    [
      ...GRAPH_TASK_CONTRACTS.temporalMotif.resultFields,
      ...(GRAPH_TASK_CONTRACTS.temporalMotif.resultContextFields ?? [])
    ].sort()
  );
  assert.ok(!GRAPH_TASK_CONTRACTS.temporalMotif.resultFields.includes("absenceConditions"));
  assert.ok(!GRAPH_TASK_CONTRACTS.temporalMotif.resultFields.includes("inducedEdgeTypes"));
});

test("near-match e controfattuali dichiarano l'output semantico effettivo dei parser", () => {
  const reverseNodeIndex = { 1: "node-A", 2: "node-B" };
  const reverseSourceNodeIndex = { 1: "A", 2: "B" };
  const reverseEdgeIndex = { 3: "edge-A-B" };
  const template = {
    id: "contract-near-match",
    label: "Near match contract",
    roles: {
      source: { nodeTypes: ["person"] },
      target: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "source", targetRole: "target", edgeType: "collaborates" }]
  };
  const staticNearMatch = buildTypedMotifNearMatchProgram(template, "directed");
  const [staticDiagnostic] = parseTypedMotifNearMatches([{
    Value: ["motif_match(1,1)", "motif_match(2,2)", "motif_edge_witness(1,3)"],
    Costs: [0, 0, 0]
  }], staticNearMatch, reverseNodeIndex, reverseSourceNodeIndex, reverseEdgeIndex);
  assert.ok(staticDiagnostic);
  assert.ok(!Object.hasOwn(staticDiagnostic, "temporalEvidence"));

  const temporalNearMatch = buildTypedMotifTemporalNearMatchProgram({
    ...template,
    temporal: { semantics: "orderedByStart" }
  }, "directed");
  const [temporalDiagnostic] = parseTypedMotifNearMatches([{
    Value: ["motif_match(1,1)", "motif_match(2,2)", "motif_temporal_unavailable(1)"],
    Costs: [0, 0, 0, 0]
  }], temporalNearMatch, reverseNodeIndex, reverseSourceNodeIndex, reverseEdgeIndex);
  assert.ok(temporalDiagnostic);
  const nearMatchParserFields = [...new Set([
    ...Object.keys(staticDiagnostic),
    ...Object.keys(temporalDiagnostic)
  ])].sort();
  assert.deepEqual(nearMatchParserFields, [
    ...GRAPH_TASK_CONTRACTS.typedMotifNearMatch.resultFields,
    ...(GRAPH_TASK_CONTRACTS.typedMotifNearMatch.resultContextFields ?? [])
  ].sort());

  const compiledTemplate = buildTypedMotifProgram(template, "directed");
  const candidate = {
    id: "hypothetical-A-B",
    sourceNodeId: "A",
    targetNodeId: "B",
    sourceNode: 1,
    targetNode: 2,
    edgeType: "collaborates",
    cost: 2,
    recordIndex: 4
  };
  const [proposal] = parseTypedMotifCompletionCounterfactuals([{
    Value: ["cf_add_edge(4)", "motif_match(1,1)", "motif_match(2,2)", "motif_edge_support(1,4)"],
    Costs: [2]
  }], compiledTemplate, [candidate], reverseNodeIndex, reverseSourceNodeIndex, {});
  assert.ok(proposal);
  assert.deepEqual(
    Object.keys(proposal).sort(),
    [
      ...GRAPH_TASK_CONTRACTS.motifCompletionCounterfactual.resultFields,
      ...(GRAPH_TASK_CONTRACTS.motifCompletionCounterfactual.resultContextFields ?? [])
    ].sort()
  );
});

test("i parser strutturali e di dominio espongono i campi dichiarati dai contratti", () => {
  const reverseNodeIndex = { 1: "A", 2: "B", 3: "C" };
  const reverseSourceNodeIndex = { 1: "source-A", 2: "source-B", 3: "source-C" };
  const reverseEdgeIndex = { 2: "edge-2", 4: "edge-4", 6: "edge-6", 7: "edge-7" };
  const assertFields = (task, result) => {
    assert.ok(result, `${task}: il parser deve produrre un risultato`);
    assert.deepEqual(
      Object.keys(result).sort(),
      [...GRAPH_TASK_CONTRACTS[task].resultFields].sort(),
      task
    );
  };

  assertFields("clique", parseWitnessCliqueResults([{
    Value: ["in(1)", "in(2)", "clique_edge_support(1,2,7)"]
  }], reverseNodeIndex, reverseSourceNodeIndex, reverseEdgeIndex, {}, 2)[0]);
  assertFields("kPlex", parseWitnessKPlexExplanations([{
    Value: ["in(1)", "in(2)", "missing_tie(1,2)"]
  }], reverseNodeIndex)[0]);
  assertFields("maximalKPlex", parseWitnessMaximalKPlexExplanations([{
    Value: [
      "in(1)", "in(2)", "missing_tie(1,2)", "maximal_candidate(3)",
      "maximal_blocked_by_degree(3,1)"
    ]
  }], reverseNodeIndex)[0]);
  assertFields("path", parseWitnessMinimumHopPathWitness([{
    Value: [
      "path_length(1)", "at(0,1)", "at(1,2)", "path_edge_support(0,7)",
      "path_minimality_certificate(1)", "path_shorter_reachable(1,0)"
    ]
  }], reverseNodeIndex, reverseEdgeIndex));
  assertFields("boundedPath", parseBoundedPathNoRouteCertificate([{
    Value: ["path_no_route_certificate(1)", "path_no_route_reachable(1,0)", "path_no_route_reachable(2,1)"]
  }], reverseNodeIndex, 1, "C"));
  assertFields("dominatingSet", parseWitnessDominatingSetExplanations([{
    Value: ["in(1)", "dominated_by(1,1)", "dominated_by(2,1)"]
  }], reverseNodeIndex)[0]);

  const violations = parseIntegrityViolations([{
    Value: [
      'violation(edge_endpoint_type,7,1,2,"works_at")',
      'violation(node_type_out_of_domain,1,"unknown",0,0)',
      'violation(edge_type_out_of_domain,7,"unknown",0,0)',
      'violation(missing_node_attribute,1,0,"email",0)',
      'violation(edge_attribute_out_of_domain,7,"status","closed","works_at")',
      'violation(cardinality_min,1,2,1,"works_at")'
    ]
  }], reverseNodeIndex, reverseEdgeIndex);
  const violationFields = [...new Set(violations.flatMap((violation) => Object.keys(violation)))].sort();
  assert.deepEqual(violationFields, [...GRAPH_TASK_CONTRACTS.graphIntegrity.resultFields].sort());

  const repairWitness = [{
    Value: [
      "remove_edge(7)", "fill_node_attribute(1)", "fill_edge_attribute(2)",
      "replace_node_attribute(3)", "replace_edge_attribute(4)", "replace_node_type(5)",
      "replace_edge_type(6)", "replace_edge_interval(7)"
    ]
  }];
  const repair = parseIntegrityRepairProposal(
    repairWitness,
    { ...reverseEdgeIndex, 7: "edge-7" },
    { "edge-7": 1 },
    { 1: { nodeId: "A", attribute: "email", value: "a", cost: 2 } },
    { 2: { edgeId: "edge-2", attribute: "status", value: "active", cost: 3 } },
    { 3: { nodeId: "A", attribute: "email", expectedValue: "a", value: "b", cost: 4 } },
    { 4: { edgeId: "edge-4", attribute: "status", expectedValue: "old", value: "new", cost: 5 } },
    { 5: { nodeId: "A", expectedType: "person", newType: "other", cost: 6 } },
    { 6: { edgeId: "edge-6", expectedType: "old", newType: "new", cost: 7 } },
    { 7: { edgeId: "edge-7", expectedFrom: 1, expectedTo: 2, from: 3, to: 4, cost: 8 } }
  );
  assertFields("minimumIntegrityRepair", repair);

  const signedDyads = [
    { id: 1, sourceIndex: 1, targetIndex: 2, sourceNodeId: "A", targetNodeId: "B", polarity: "positive", edgeRecords: [] },
    { id: 2, sourceIndex: 1, targetIndex: 3, sourceNodeId: "A", targetNodeId: "C", polarity: "negative", edgeRecords: [] },
    { id: 3, sourceIndex: 2, targetIndex: 3, sourceNodeId: "B", targetNodeId: "C", polarity: "positive", edgeRecords: [] }
  ];
  assertFields("signedTriads", parseSignedTriadResults([{
    Value: ["signed_triad(1,2,3,1,2,3,unbalanced)"]
  }], reverseNodeIndex, signedDyads)[0]);
});

test("i separatori dichiarano i soli campi del witness e i costi riepilogati dall'app", () => {
  const reverseNodeIndex = { 1: "A", 2: "B", 3: "C" };
  const nodeResult = parseWitnessRemovedNodeSetExplanations([{
    Value: ["removed(2)", "reachable(1)"]
  }], reverseNodeIndex)[0];
  const edgeResult = parseWitnessRemovedEdgeSetExplanations([{
    Value: ["removed_edge(7)", "reachable(1)"]
  }], { 7: "edge-AB" }, reverseNodeIndex)[0];
  assert.deepEqual(Object.keys(nodeResult).sort(), [...GRAPH_TASK_CONTRACTS.minimumCostNodeSeparator.resultFields].sort());
  assert.deepEqual(Object.keys(edgeResult).sort(), [...GRAPH_TASK_CONTRACTS.minimumCostEdgeSeparator.resultFields].sort());
  assert.deepEqual(GRAPH_TASK_CONTRACTS.minimumCostNodeSeparator.applicationDerivedFields, ["minimumNodeRemovalCost"]);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.minimumCostEdgeSeparator.applicationDerivedFields, ["minimumCutCost"]);
});

test("il parser delle comunità separa i contributi ASP dai conteggi derivati dagli attributi", () => {
  const parsed = parseWitnessModularityPartitions([{
    Value: [
      "community(1,1)", "community(2,1)", "partition_score(7)",
      "internal_edge(1,3)", "community_edge_count(1,1)",
      "community_internal_weight(1,3)", "community_volume(1,4)", "community_score(1,7)"
    ]
  }], { 1: "A", 2: "B" })[0];

  assert.deepEqual(Object.keys(parsed).sort(), [...GRAPH_TASK_CONTRACTS.communities.resultFields].sort());
  assert.ok(!Object.hasOwn(parsed, "attributeBoundCounts"));
  assert.deepEqual(GRAPH_TASK_CONTRACTS.communities.applicationDerivedFields, ["attributeBoundCounts"]);
});

test("ogni predicato witness dichiarato è mostrato da un builder ASP del task", () => {
  const integrityFixture = buildIntegrityContractFixture();
  const signedTriadProgram = buildSignedTriadContractProgram();
  const directedPathOptions = {
    startNode: 1,
    goalNode: 2,
    edgeTypeSequence: ["collaborates"],
    direction: "directed"
  };
  const motifTemplate = {
    id: "contract-fixture",
    roles: {
      source: { nodeTypes: ["person"] },
      target: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "source", targetRole: "target", edgeType: "collaborates" }]
  };
  const coValidMotif = buildTypedMotifProgram({
    ...motifTemplate,
    temporal: { semantics: "coValid" }
  }, "directed").program;
  const orderedMotif = buildTypedMotifProgram({
    ...motifTemplate,
    temporal: { semantics: "orderedByStart" }
  }, "directed").program;
  const orderedSpanMotif = {
    ...motifTemplate,
    temporal: { semantics: "orderedByStart", maximumSpan: { value: 30, unit: "seconds" } }
  };
  const motifMetricEncoding = createAspTemporalEncoding([0, 30_000], "seconds");
  const motifNearMatchPrograms = [
    buildTypedMotifNearMatchProgram(motifTemplate, "directed").program,
    buildTypedMotifTemporalNearMatchProgram({ ...motifTemplate, temporal: { semantics: "coValid" } }, "directed").program,
    buildTypedMotifTemporalNearMatchProgram({ ...motifTemplate, temporal: { semantics: "orderedByStart" } }, "directed").program,
    buildTypedMotifTemporalNearMatchProgram(orderedSpanMotif, "directed", "", motifMetricEncoding).program
  ];
  const hypotheticalMotifEdge = {
    id: "hypothetical-edge",
    sourceNodeId: "source-a",
    targetNodeId: "source-b",
    sourceNode: 1,
    targetNode: 2,
    edgeType: "collaborates",
    attributes: { status: "active" },
    cost: 2,
    recordIndex: 4,
    validity: { from: 10, to: 20 }
  };
  const motifCounterfactualPrograms = [
    buildTypedMotifCompletionCounterfactualProgram(motifTemplate, "directed", "", [hypotheticalMotifEdge]).program,
    buildTypedMotifCompletionCounterfactualProgram({ ...motifTemplate, temporal: { semantics: "coValid" } }, "directed", "", [hypotheticalMotifEdge]).program,
    buildTypedMotifCompletionCounterfactualProgram({ ...motifTemplate, temporal: { semantics: "orderedByStart" } }, "directed", "", [hypotheticalMotifEdge]).program,
    buildTypedMotifCompletionCounterfactualProgram(orderedSpanMotif, "directed", "", [hypotheticalMotifEdge], motifMetricEncoding).program
  ];
  const contextualCliqueContractProgram = buildContextualCliqueContractProgram();
  const coValidTypedPath = buildTypedPathProgram({ ...directedPathOptions, temporalSemantics: "coValid" });
  const orderedTypedPath = buildTypedPathProgram({ ...directedPathOptions, temporalSemantics: "orderedByStart" });

  const programsByTask = {
    contextualClique: [contextualCliqueContractProgram],
    clique: [
      buildCliqueProgram("maximum", "", { enabled: true, includeEdgeRecords: false }),
      buildCliqueProgram("maximum", "", { enabled: true, includeEdgeRecords: true })
    ],
    kPlex: [buildMaximumKPlexProgram(2)],
    maximalKPlex: [buildMaximalKPlexProgram(2)],
    kCore: [buildKCoreProgram(1, "", true), buildKCorePeelingRoundProgram(1, [1])],
    components: [buildConnectedComponentsProgram()],
    connectedComponents: [buildConnectedComponentsProgram()],
    weakComponents: [buildWeaklyConnectedComponentsProgram()],
    strongComponents: [buildStronglyConnectedComponentsProgram()],
    path: [buildMinimumHopPathProgram(1, 2, 2, "", "directed", true)],
    boundedPath: [buildBoundedPathNoRouteProgram(1, 2, 2, "", "directed")],
    typedPath: [
      buildTypedPathProgram(directedPathOptions),
      coValidTypedPath,
      orderedTypedPath
    ],
    typedMotif: [
      buildTypedMotifProgram(motifTemplate, "directed").program,
      coValidMotif,
      orderedMotif
    ],
    temporalMotif: [coValidMotif, orderedMotif],
    typedMotifNearMatch: motifNearMatchPrograms,
    motifCompletionCounterfactual: motifCounterfactualPrograms,
    motifCount: [buildTypedMotifCountProgram(motifTemplate, "directed").program],
    graphIntegrity: [integrityFixture.diagnosis],
    minimumIntegrityRepair: [integrityFixture.repair],
    signedTriads: [signedTriadProgram],
    dominatingSet: [buildMinimumDominatingSetProgram()],
    minimumNodeSeparator: [buildMinimumNodeSeparatorProgram(1, 2)],
    minimumCostNodeSeparator: [buildMinimumCostNodeSeparatorProgram(1, 2)],
    minimumEdgeSeparator: [buildMinimumEdgeSeparatorProgram(1, 2, "directed")],
    minimumCostEdgeSeparator: [buildMinimumCostEdgeSeparatorProgram(1, 2, "directed")],
    communities: [buildMaximumModularityProgram({
      weighted: true,
      includeContributions: true,
      minCount: 1,
      maxCount: 2,
      mustLinkPairs: [[1, 2]],
      cannotLinkPairs: [[2, 3]]
    })]
  };

  const shownPredicates = (programs) => new Set(programs.flatMap((program) =>
    [...program.matchAll(/#show\s+([a-z][a-z0-9_]*)\/(\d+)\./g)]
      .map((match) => `${match[1]}/${match[2]}`)
  ));

  for (const [task, contract] of Object.entries(GRAPH_TASK_CONTRACTS)) {
    const shown = shownPredicates(programsByTask[task]);
    for (const predicate of contract.witnessPredicates) {
      assert.ok(shown.has(predicate), `${task}: il builder non espone #show ${predicate}`);
    }
  }
});

test("ogni predicato di input dichiarato è consumato o prodotto dal protocollo ASP del task", () => {
  const integrityFixture = buildIntegrityContractFixture();
  const signedTriadProgram = buildSignedTriadContractProgram();
  const indexByNodeId = new Map([["A", 1], ["B", 2], ["C", 3]]);
  const links = [{
    source: "A",
    target: "B",
    sourceId: "edge-A-B",
    analysis: { removalCost: 3, type: "collaborates", weight: 2, validity: { from: 10, to: 20 } }
  }];
  const pathFacts = buildPathEdgeFacts(links, indexByNodeId).facts;
  const edgeCutFacts = buildMinimumEdgeSeparatorFacts(links, indexByNodeId).facts;
  const modularityFacts = buildModularityFacts([
    1, 2, 3
  ], [
    { source: 1, target: 2, weight: 1 },
    { source: 2, target: 3, weight: 2 }
  ], { weighted: true, includePairwiseObjective: true });
  const attributedMotif = {
    id: "contract-input-fixture",
    roles: {
      source: { nodeTypes: ["person"], attributes: { discipline: "clinical" } },
      target: { nodeTypes: ["person"], attributes: { discipline: "clinical" } }
    },
    edges: [{
      sourceRole: "source",
      targetRole: "target",
      edgeType: "collaborates",
      attributes: { status: "active" }
    }]
  };
  const boundedModularity = buildMaximumModularityProgram({
    weighted: true,
    includeContributions: true,
    minCount: 1,
    maxCount: 2,
    mustLinkPairs: [[1, 2]],
    cannotLinkPairs: [[2, 3]],
    attributeBounds: [{ nodeIndexes: [1, 2], minPerCommunity: 1, maxPerCommunity: 2 }],
    pairwiseObjectiveOffset: modularityFacts.pairwiseObjectiveOffset
  });
  const separatedModularity = buildMaximumModularityProgram({ separateDisconnectedComponents: true });
  const spanBoundedMotif = {
    ...attributedMotif,
    temporal: {
      semantics: "orderedByStart",
      maximumSpan: { value: 30, unit: "seconds" }
    }
  };
  const motifNearMatchPrograms = [
    buildTypedMotifNearMatchProgram(attributedMotif, "directed", "cohort").program,
    buildTypedMotifTemporalNearMatchProgram({ ...attributedMotif, temporal: { semantics: "coValid" } }, "directed", "cohort").program,
    buildTypedMotifTemporalNearMatchProgram({ ...attributedMotif, temporal: { semantics: "orderedByStart" } }, "directed", "cohort").program,
    buildTypedMotifTemporalNearMatchProgram(spanBoundedMotif, "directed", "cohort", createAspTemporalEncoding([0, 30_000], "seconds")).program
  ];
  const hypotheticalMotifEdge = {
    id: "counterfactual-contract-edge",
    sourceNodeId: "source-A",
    targetNodeId: "source-B",
    sourceNode: 1,
    targetNode: 2,
    edgeType: "collaborates",
    attributes: { status: "active" },
    cost: 4,
    recordIndex: 17,
    validity: { from: 10, to: 20 }
  };
  const motifCounterfactualPrograms = [
    buildTypedMotifCompletionCounterfactualProgram(attributedMotif, "directed", "cohort", [hypotheticalMotifEdge]).program,
    buildTypedMotifCompletionCounterfactualProgram({ ...attributedMotif, temporal: { semantics: "coValid" } }, "directed", "cohort", [hypotheticalMotifEdge]).program,
    buildTypedMotifCompletionCounterfactualProgram({ ...attributedMotif, temporal: { semantics: "orderedByStart" } }, "directed", "cohort", [hypotheticalMotifEdge]).program,
    buildTypedMotifCompletionCounterfactualProgram(spanBoundedMotif, "directed", "cohort", [hypotheticalMotifEdge], createAspTemporalEncoding([0, 30_000], "seconds")).program
  ];
  const contextualCliqueContractProgram = buildContextualCliqueContractProgram();

  const programsByTask = {
    contextualClique: [contextualCliqueContractProgram],
    clique: [buildCliqueProgram("maximum", "cohort", { enabled: true, includeEdgeRecords: true })],
    kPlex: [buildMaximumKPlexProgram(2, "cohort")],
    maximalKPlex: [buildMaximalKPlexProgram(2, "cohort")],
    kCore: [buildKCoreProgram(1, "cohort", true), buildKCorePeelingRoundProgram(1, [1], "cohort")],
    components: [buildConnectedComponentsProgram("cohort")],
    connectedComponents: [buildConnectedComponentsProgram("cohort")],
    weakComponents: [buildWeaklyConnectedComponentsProgram("cohort")],
    strongComponents: [buildStronglyConnectedComponentsProgram("cohort")],
    path: [buildMinimumHopPathProgram(1, 2, 2, "cohort", "directed", true), pathFacts],
    boundedPath: [buildBoundedPathNoRouteProgram(1, 2, 2, "cohort", "directed"), pathFacts],
    typedPath: [
      buildTypedPathProgram({
        startNode: 1, goalNode: 2, edgeTypeSequence: ["collaborates"], group: "cohort", direction: "directed",
        temporalSemantics: "coValid"
      }),
      buildTypedPathProgram({
        startNode: 1, goalNode: 2, edgeTypeSequence: ["collaborates"], group: "cohort", direction: "directed",
        temporalSemantics: "orderedByStart"
      })
    ],
    typedMotif: [
      buildTypedMotifProgram(attributedMotif, "directed", "cohort").program,
      buildTypedMotifProgram({ ...attributedMotif, temporal: { semantics: "coValid" } }, "directed", "cohort").program,
      buildTypedMotifProgram({ ...attributedMotif, temporal: { semantics: "orderedByStart" } }, "directed", "cohort").program
    ],
    temporalMotif: [
      buildTypedMotifProgram({ ...attributedMotif, temporal: { semantics: "coValid" } }, "directed", "cohort").program,
      buildTypedMotifProgram({ ...attributedMotif, temporal: { semantics: "orderedByStart" } }, "directed", "cohort").program
    ],
    typedMotifNearMatch: motifNearMatchPrograms,
    motifCompletionCounterfactual: motifCounterfactualPrograms,
    motifCount: [
      buildTypedMotifCountProgram(attributedMotif, "directed", "cohort").program,
      buildTypedMotifCountProgram({ ...attributedMotif, temporal: { semantics: "coValid" } }, "directed", "cohort").program,
      buildTypedMotifCountProgram({ ...attributedMotif, temporal: { semantics: "orderedByStart" } }, "directed", "cohort").program,
      buildTypedMotifCountProgram(spanBoundedMotif, "directed", "cohort", {
        temporalEncoding: createAspTemporalEncoding([0, 30_000], "seconds")
      }).program
    ],
    graphIntegrity: [integrityFixture.asp.facts, integrityFixture.diagnosis],
    minimumIntegrityRepair: [integrityFixture.asp.facts, integrityFixture.repair],
    signedTriads: [signedTriadProgram],
    dominatingSet: [buildMinimumDominatingSetProgram("candidate-cohort", "target-cohort")],
    minimumNodeSeparator: [buildMinimumNodeSeparatorProgram(1, 2, "cohort")],
    minimumCostNodeSeparator: [buildMinimumCostNodeSeparatorProgram(1, 2, "cohort")],
    minimumEdgeSeparator: [buildMinimumEdgeSeparatorProgram(1, 2, "directed"), edgeCutFacts],
    minimumCostEdgeSeparator: [buildMinimumCostEdgeSeparatorProgram(1, 2, "directed"), edgeCutFacts],
    communities: [
      modularityFacts.facts,
      modularityFacts.connectedComponentFacts,
      modularityFacts.pairwiseObjectiveFacts ?? "",
      boundedModularity,
      separatedModularity
    ]
  };

  const hasPredicateCall = (source, signature) => {
    const [predicate, rawArity] = signature.split("/");
    const expectedArity = Number(rawArity);
    if (expectedArity === 0) return new RegExp(`\\b${predicate}\\s*\\.`).test(source);
    const matcher = new RegExp(`\\b${predicate}\\(`, "g");
    for (const match of source.matchAll(matcher)) {
      let depth = 1;
      let commas = 0;
      let hasArgument = false;
      let quoted = false;
      let escaped = false;
      for (let index = match.index + match[0].length; index < source.length; index += 1) {
        const character = source[index];
        if (quoted) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === '"') quoted = false;
          continue;
        }
        if (character === '"') { quoted = true; hasArgument = true; }
        else if (character === "(") { depth += 1; hasArgument = true; }
        else if (character === ")") {
          depth -= 1;
          if (depth === 0) break;
        } else if (character === "," && depth === 1) commas += 1;
        else if (depth === 1 && !/\s/.test(character)) hasArgument = true;
      }
      const actualArity = hasArgument ? commas + 1 : 0;
      if (actualArity === expectedArity) return true;
    }
    return false;
  };

  for (const [task, contract] of Object.entries(GRAPH_TASK_CONTRACTS)) {
    const source = programsByTask[task].join("\n");
    for (const predicate of contract.inputPredicates) {
      assert.ok(hasPredicateCall(source, predicate), `${task}: il protocollo non usa/prodduce ${predicate}`);
    }
  }
});

test("il contratto risolve capability condizionali per direzione, tempo e modularità pesata", () => {
  assert.deepEqual(getGraphTaskRequirements("kCore", { direction: "directed" }), ["directedEdges"]);
  assert.deepEqual(getGraphTaskContract("typedPath", { direction: "directed", temporalSemantics: "static" })?.requiredCapabilities, [
    "edgeTypes", "directedEdges"
  ]);
  assert.deepEqual(getGraphTaskContract("typedPath", { direction: "directed", temporalSemantics: "coValid" })?.requiredCapabilities, [
    "edgeTypes", "directedEdges", "edgeIntervals"
  ]);
  assert.deepEqual(getGraphTaskRequirements("typedPath", { direction: "directed", temporalSemantics: "coValid" }), [
    "edgeTypes", "directedEdges", "edgeIntervals"
  ]);
  assert.deepEqual(getGraphTaskRequirements("communities", { useEdgeWeights: true }), [
    "undirectedAdjacency", "modularityWeights"
  ]);
  assert.deepEqual(getGraphTaskRequirements("typedMotif", { direction: "directed" }), [
    "nodeTypes", "edgeTypes", "directedEdges"
  ]);
  assert.deepEqual(getGraphTaskRequirements("motifCount", { direction: "directed", temporalSemantics: "static" }), [
    "nodeTypes", "edgeTypes", "directedEdges"
  ]);
  assert.deepEqual(getGraphTaskRequirements("motifCount", { direction: "directed", temporalSemantics: "coValid" }), [
    "nodeTypes", "edgeTypes", "directedEdges", "edgeIntervals"
  ]);
  assert.deepEqual(getGraphTaskRequirements("typedMotifNearMatch", { direction: "directed", temporalSemantics: "static" }), [
    "nodeTypes", "edgeTypes", "directedEdges"
  ]);
  assert.deepEqual(getGraphTaskRequirements("typedMotifNearMatch", { direction: "directed", temporalSemantics: "orderedByStart" }), [
    "nodeTypes", "edgeTypes", "directedEdges"
  ]);
  assert.deepEqual(getGraphTaskRequirements("motifCompletionCounterfactual", { direction: "directed", temporalSemantics: "static" }), [
    "nodeTypes", "edgeTypes", "directedEdges"
  ]);
  assert.deepEqual(getGraphTaskRequirements("motifCompletionCounterfactual", { direction: "directed", temporalSemantics: "coValid" }), [
    "nodeTypes", "edgeTypes", "directedEdges", "edgeIntervals"
  ]);
});

test("il gate del near-match ammette i dati temporali incompleti che deve diagnosticare", () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", type: "person" },
      { id: "b", type: "person" }
    ],
    edges: [{ id: "ab", source: "a", target: "b", type: "collaborates" }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", typeField: "$.type" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        typeField: "$.type",
        direction: "directed",
        identity: "multigraph",
        validity: { fromField: "$.start", toField: "$.end" }
      }
    }
  });

  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.capabilities.edgeIntervals.available, false);
  assert.ok(graph.diagnostics.some((diagnostic) =>
    diagnostic.code === "incomplete-capability-edgeIntervals" && diagnostic.severity === "warning"
  ));

  const nearMatchRequirements = getGraphTaskRequirements("typedMotifNearMatch", {
    direction: graph.direction,
    temporalSemantics: "coValid"
  });
  assert.ok(nearMatchRequirements);
  assert.equal(checkGraphTaskRequirements(graph.capabilities, nearMatchRequirements).available, true);

  const positiveTemporalRequirements = getGraphTaskRequirementsFromModel("temporalMotif", graph.direction);
  assert.ok(positiveTemporalRequirements);
  assert.equal(checkGraphTaskRequirements(graph.capabilities, positiveTemporalRequirements).available, false);
});

test("i task ignoti non leggono il prototipo del registro e le modalità mostrano l'enumerazione reale", () => {
  for (const task of ["unknown", "__proto__", "constructor", "toString"]) {
    assert.equal(getGraphTaskContract(task), null);
  }

  assert.match(getTaskEnumerationDescription("kPlex", { enumerateAllOptima: false }), /un solo ottimo/);
  assert.match(getTaskEnumerationDescription("kPlex", { enumerateAllOptima: true }), /tutti gli ottimi/);
  assert.match(getTaskEnumerationDescription("maximalKPlex", { enumerateAllMaximalKPlex: false }), /un k-plex massimale certificato/);
  assert.match(getTaskEnumerationDescription("maximalKPlex", { enumerateAllMaximalKPlex: true }), /tutti i k-plex massimali/);
  assert.match(getTaskEnumerationDescription("boundedPath"), /mancato raggiungimento/);
  assert.match(getTaskEnumerationDescription("typedMotif"), /enumerazione completa/);
  assert.match(getTaskEnumerationDescription("motifCount", { partitionedCount: true }), /tutte le partizioni disgiunte/);
  assert.match(getTaskEnumerationDescription("graphIntegrity"), /tutte le violazioni dichiarate/);
  assert.match(getTaskEnumerationDescription("minimumIntegrityRepair"), /ottimalità provata/);
  assert.match(getTaskEnumerationDescription("signedTriads"), /triangoli con tre dyadi firmate coerenti/);
  assert.match(getTaskEnumerationDescription("typedMotifNearMatch"), /ottimo secondo le priorità lessicografiche/);
  assert.match(GRAPH_TASK_CONTRACTS.typedMotifNearMatch.querySemantics, /intervalli assenti o invalidi sono diagnostica del task, non una condizione che lo disabilita/i);
  assert.match(getTaskEnumerationDescription("motifCompletionCounterfactual"), /costo minimo provata sui candidati configurati/);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.typedMotif.supportedEnumeration, ["all-distinct-role-assignments"]);
  assert.deepEqual(GRAPH_TASK_CONTRACTS.temporalMotif.supportedEnumeration, ["all-distinct-role-assignments"]);
  assert.match(GRAPH_TASK_CONTRACTS.motifCount.querySemantics, /assegnamenti distinti dei ruoli nei template statici\/co-validi/);
  assert.match(GRAPH_TASK_CONTRACTS.motifCount.querySemantics, /sequenze temporali distinte, includendo record di arco e istanti di inizio/);
  assert.equal(getTaskEnumerationDescription("components"), "partizione completa deterministica");
});

test("le modalit\u00e0 clique sono dichiarate dal contratto e il runtime usa il fallback registrato", () => {
  const supportedModes = ["maximal", "all", "maximum"];
  assert.deepEqual(GRAPH_TASK_CONTRACTS.clique.supportedEnumeration, supportedModes);
  for (const mode of supportedModes) {
    assert.equal(resolveCliqueMode(mode), mode);
  }
  assert.equal(resolveCliqueMode("unknown-mode"), "maximal");
  assert.equal(resolveCliqueMode(undefined), "maximal");

  assert.match(getTaskEnumerationDescription("clique", {
    cliqueMode: "maximal",
    minimumCliqueSize: 3
  }), /massimali per inclusione.*almeno 3/);
  assert.match(getTaskEnumerationDescription("clique", {
    cliqueMode: "all",
    minimumCliqueSize: 3
  }), /tutte le clique.*almeno 3.*incluse le sotto-clique/);
  assert.match(getTaskEnumerationDescription("clique", {
    cliqueMode: "maximum",
    minimumCliqueSize: 3
  }), /cardinalit\u00e0 massima.*almeno 3/);
});

test("ogni protocollo di enumerazione dichiarato si risolve e produce una descrizione del contratto", () => {
  const allOptimaTasks = new Set([
    "dominatingSet", "minimumNodeSeparator", "minimumCostNodeSeparator",
    "minimumEdgeSeparator", "minimumCostEdgeSeparator", "communities"
  ]);

  for (const [task, contract] of Object.entries(GRAPH_TASK_CONTRACTS)) {
    for (const enumeration of contract.supportedEnumeration) {
      const context = task === "clique"
        ? { cliqueMode: enumeration }
        : task === "kPlex" || task === "contextualClique"
          ? { enumerateAllOptima: enumeration === "all-maximum" }
          : task === "maximalKPlex"
            ? { enumerateAllMaximalKPlex: enumeration === "all-maximal" }
            : task === "motifCount"
                ? { partitionedCount: enumeration === "complete-disjoint-partition-sum" }
                : allOptimaTasks.has(task)
                  ? { enumerateAllOptima: enumeration.startsWith("all-") || enumeration === "all-optima" }
                  : {};
      assert.equal(resolveTaskEnumeration(task, context), enumeration, `${task}: ${enumeration}`);
      assert.doesNotMatch(getTaskEnumerationDescription(task, context), /non dichiarata dal contratto/);
    }
  }

  assert.equal(resolveTaskEnumeration("unknown"), null);
  assert.equal(getTaskEnumerationDescription("unknown"), "modalita di enumerazione non dichiarata dal contratto");
});
