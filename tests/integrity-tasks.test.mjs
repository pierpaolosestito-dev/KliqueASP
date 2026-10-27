import assert from "node:assert/strict";
import test from "node:test";
import { buildAspFactsFromGraph, escapeAspString, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildMinimumEdgeRemovalProgram,
  buildMinimumIntegrityRepairProgram,
  buildGraphIntegrityProgram,
  validateGraphIntegrityAttributeMappings,
  parseMinimumEdgeRemovalRepair,
  parseIntegrityRepairProposal,
  parseIntegrityViolations
} from "../src/lib/kliqueasp/graph/integrityTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";
import { hasCompleteModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";

const graphConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: {
      idField: "$.id",
      labelField: "$.name",
      typeField: "$.kind",
      attributes: { email: "$.email" }
    },
    edge: {
      idField: "$.id",
      sourceField: "$.from",
      targetField: "$.to",
      typeField: "$.kind",
      direction: "undirected",
      identity: "multigraph",
      attributes: { since: "$.since", registryCode: "$.registry_code" },
      validity: { fromField: "$.valid_from", toField: "$.valid_to" }
    }
  }
};

test("il parser delle violazioni ripristina i controlli codificati nei termini ASP", () => {
  const originalType = "invalid\r\t\n~x000D";
  const atom = `violation(edge_type_out_of_domain,1,${escapeAspString(originalType)},0,0)`;
  const violations = parseIntegrityViolations([{ Value: [atom] }], {}, { 1: "edge-source-id" });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].value, originalType);
  assert.equal(violations[0].subjectId, "edge-source-id");
});

const sourceGraph = {
  nodes: [
    { id: "person-a", name: "Ada", kind: "person", email: 'same, "quoted"@example.org' },
    { id: "person-b", name: "Bruno", kind: "person", email: 'same, "quoted"@example.org' },
    { id: "place-x", name: "Istituto X", kind: "place" },
    { id: "person-c", name: "Carla", kind: "person" }
  ],
  edges: [
    { id: "edge-valid", from: "place-x", to: "person-a", kind: "works_at", since: 1901, valid_from: 1901, valid_to: 1900 },
    { id: "edge-wrong-domain", from: "person-a", to: "person-b", kind: "works_at" },
    { id: "edge-invalid-time", from: "person-b", to: "place-x", kind: "works_at", since: 1902, valid_from: "not-a-date", valid_to: "1910" }
  ]
};

const integrityConfig = {
  edgeTypeDomains: [
    { edgeType: "works_at", sourceNodeTypes: ["person"], targetNodeTypes: ["place"] }
  ],
  requiredNodeAttributes: [{ nodeType: "person", attributes: ["email"] }],
  requiredEdgeAttributes: [{ edgeType: "works_at", attributes: ["since"] }],
  requiredEdgeIntervals: ["works_at"],
  uniqueNodeAttributes: [{ nodeType: "person", attribute: "email" }],
  cardinalities: [
    { nodeType: "person", edgeType: "works_at", incidence: "any", min: 1, max: 1 }
  ]
};

test("ASP integrity diagnostics preserve source node and edge identifiers", async () => {
  const graph = normalizeGraphData(sourceGraph, graphConfig);
  assert.equal(graph.valid, true);
  const { facts, reverseSourceIndex, reverseEdgeIndex } = buildAspFactsFromGraph(graph);
  assert.equal(reverseEdgeIndex[1], "edge-valid");
  assert.equal(reverseEdgeIndex[2], "edge-wrong-domain");
  assert.equal(reverseEdgeIndex[3], "edge-invalid-time");

  const runner = await createClingoWasmRunner();
  const program = `${facts}\n${buildGraphIntegrityProgram(integrityConfig, graph.direction)}`;
  const result = await runner.run(program);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true, "la lista delle violazioni deve essere completa");

  const violations = parseIntegrityViolations(
    result.Call?.[0]?.Witnesses,
    reverseSourceIndex,
    reverseEdgeIndex
  );

  const kinds = new Set(violations.map((violation) => violation.kind));
  assert.ok(kinds.has("edge_endpoint_type"));
  assert.ok(kinds.has("missing_edge_attribute"));
  assert.ok(kinds.has("missing_edge_interval"));
  assert.ok(kinds.has("invalid_edge_interval_value"));
  assert.ok(kinds.has("invalid_edge_interval"));
  assert.ok(kinds.has("missing_node_attribute"));
  assert.ok(kinds.has("duplicate_node_attribute"));
  assert.ok(kinds.has("cardinality_min"));
  assert.ok(kinds.has("cardinality_max"));
  assert.deepEqual(
    violations.filter((violation) => violation.kind === "edge_endpoint_type").map((violation) => violation.subjectId),
    ["edge-wrong-domain"]
  );

  assert.ok(violations.some((violation) =>
    violation.kind === "edge_endpoint_type" &&
    violation.subjectId === "edge-wrong-domain" &&
    violation.nodeIds.includes("person-a") &&
    violation.nodeIds.includes("person-b")
  ));
  assert.ok(violations.some((violation) =>
    violation.kind === "missing_edge_attribute" && violation.subjectId === "edge-wrong-domain"
  ));
  assert.ok(violations.some((violation) =>
    violation.kind === "missing_edge_interval" &&
    violation.subjectId === "edge-wrong-domain" &&
    violation.attribute === "from"
  ));
  assert.ok(violations.some((violation) =>
    violation.kind === "invalid_edge_interval_value" &&
    violation.subjectId === "edge-invalid-time" &&
    violation.value === "not-a-date"
  ));
  assert.ok(violations.some((violation) =>
    violation.kind === "invalid_edge_interval" &&
    violation.subjectId === "edge-valid" &&
    violation.value === "1901..1900"
  ));
  assert.ok(violations.some((violation) =>
    violation.kind === "duplicate_node_attribute" &&
    violation.nodeIds.includes("person-a") &&
    violation.nodeIds.includes("person-b") &&
    violation.value === 'same, "quoted"@example.org'
  ));
  assert.ok(violations.some((violation) =>
    violation.kind === "cardinality_max" &&
    violation.subjectId === "person-a" &&
    violation.expected === 1 &&
    violation.actual === 2
  ));
});

test("le diagnosi d'integrità seguono lo scenario fonte e mantengono tutti i nodi importati", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", name: "A", kind: "person" },
      { id: "b", name: "B", kind: "person" }
    ],
    edges: [
      { id: "supported", from: "a", to: "b", kind: "knows", sourceRef: "archive-a", evidence: "record-1" },
      { id: "missing-evidence", from: "a", to: "b", kind: "knows", sourceRef: "archive-b" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", labelField: "$.name", typeField: "$.kind" },
      edge: {
        idField: "$.id",
        sourceField: "$.from",
        targetField: "$.to",
        typeField: "$.kind",
        direction: "undirected",
        identity: "multigraph",
        provenanceField: "$.sourceRef",
        attributes: { evidence: "$.evidence" }
      }
    }
  });
  const projectedGraph = {
    ...graph,
    links: filterLinksByProvenanceScenario(graph.links, {
      sources: ["archive-a"],
      unattributedEdges: "exclude"
    })
  };
  const constraints = {
    requiredEdgeAttributes: [{ edgeType: "knows", attributes: ["evidence"] }]
  };
  const runner = await createClingoWasmRunner();
  const fullFacts = buildAspFactsFromGraph(graph);
  const fullResult = await runner.run(`${fullFacts.facts}\n${buildGraphIntegrityProgram(constraints, graph.direction)}`);
  const fullViolations = parseIntegrityViolations(
    fullResult.Call?.[0]?.Witnesses,
    fullFacts.reverseSourceIndex,
    fullFacts.reverseEdgeIndex
  );
  assert.equal(fullResult.Result, "SATISFIABLE", fullResult.Error ?? JSON.stringify(fullResult));
  assert.deepEqual(
    fullViolations.filter((violation) => violation.kind === "missing_edge_attribute").map((violation) => violation.subjectId),
    ["missing-evidence"]
  );

  const scenarioFacts = buildAspFactsFromGraph(projectedGraph);
  assert.equal(Object.keys(scenarioFacts.reverseSourceIndex).length, 2,
    "la proiezione di fonte lascia nel dominio ASP tutti i nodi importati");
  assert.deepEqual(Object.values(scenarioFacts.reverseEdgeIndex), ["supported"]);
  const scenarioResult = await runner.run(`${scenarioFacts.facts}\n${buildGraphIntegrityProgram(constraints, graph.direction)}`);
  const scenarioViolations = parseIntegrityViolations(
    scenarioResult.Call?.[0]?.Witnesses,
    scenarioFacts.reverseSourceIndex,
    scenarioFacts.reverseEdgeIndex
  );
  assert.equal(scenarioResult.Result, "SATISFIABLE", scenarioResult.Error ?? JSON.stringify(scenarioResult));
  assert.equal(scenarioViolations.filter((violation) => violation.kind === "missing_edge_attribute").length, 0);
});

test("i domini degli archi non vengono invertiti implicitamente nei grafi diretti", async () => {
  const directedConfig = {
    ...graphConfig,
    graphMapping: {
      ...graphConfig.graphMapping,
      edge: { ...graphConfig.graphMapping.edge, direction: "directed" }
    }
  };
  const directedGraph = normalizeGraphData({
    nodes: [
      { id: "p-1", name: "Persona", kind: "person" },
      { id: "i-1", name: "Istituzione", kind: "institution" }
    ],
    edges: [{ id: "reverse", from: "i-1", to: "p-1", kind: "works_at" }]
  }, directedConfig);
  const { facts, reverseSourceIndex, reverseEdgeIndex } = buildAspFactsFromGraph(directedGraph);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts}\n${buildGraphIntegrityProgram({
    edgeTypeDomains: [
      { edgeType: "works_at", sourceNodeTypes: ["person"], targetNodeTypes: ["institution"] }
    ]
  }, "directed")}`);
  const violations = parseIntegrityViolations(
    result.Call?.[0]?.Witnesses,
    reverseSourceIndex,
    reverseEdgeIndex
  );
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.ok(violations.some((violation) =>
    violation.kind === "edge_endpoint_type" && violation.subjectId === "reverse"
  ));
});

test("le riparazioni ASP sono proposte di rimozione minime e limitate agli archi autorizzati", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "person", name: "Persona", kind: "person" },
      { id: "place-a", name: "Luogo A", kind: "place" },
      { id: "place-b", name: "Luogo B", kind: "place" }
    ],
    edges: [
      { id: "costly", from: "person", to: "place-a", kind: "works_at" },
      { id: "cheap", from: "person", to: "place-b", kind: "works_at" }
    ]
  }, graphConfig);
  const { facts, reverseEdgeIndex } = buildAspFactsFromGraph(graph);
  const repairConstraints = {
    cardinalities: [
      { nodeType: "person", edgeType: "works_at", incidence: "any", max: 1 }
    ],
    repairSuggestions: {
      removableEdges: [
        { edgeId: "costly", cost: 5 },
        { edgeId: "cheap", cost: 1 }
      ]
    }
  };
  const { program, costByEdgeId } = buildMinimumEdgeRemovalProgram(
    repairConstraints,
    graph.direction,
    reverseEdgeIndex
  );
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts}\n${program}`, ["--opt-mode=opt"]);
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const repair = parseMinimumEdgeRemovalRepair(
    result.Call?.[0]?.Witnesses,
    reverseEdgeIndex,
    costByEdgeId
  );
  assert.deepEqual(repair, { edgeIds: ["cheap"], edgeCosts: { cheap: 1 }, cost: 1 });

  const unrepairableConstraints = {
    ...repairConstraints,
    requiredNodeAttributes: [{ nodeType: "person", attributes: ["email"] }]
  };
  const unrepairable = buildMinimumEdgeRemovalProgram(
    unrepairableConstraints,
    graph.direction,
    reverseEdgeIndex
  );
  const impossibleResult = await runner.run(`${facts}\n${unrepairable.program}`, ["--opt-mode=opt"]);
  assert.equal(impossibleResult.Result, "UNSATISFIABLE");

  assert.throws(() => buildMinimumEdgeRemovalProgram({
    ...repairConstraints,
    repairSuggestions: { removableEdges: [{ edgeId: "not-in-graph" }] }
  }, graph.direction, reverseEdgeIndex), /deve corrispondere a un solo record/);
});

test("le riparazioni ASP combinano rimozioni e valori candidati di nodo/arco senza sovrascrivere attributi", async () => {
  const source = {
    nodes: [
      { id: "person-a", name: "Ada", kind: "person" },
      { id: "person-b", name: "Bruno", kind: "person", email: "existing@example.org" },
      { id: "place-a", name: "Luogo A", kind: "place" },
      { id: "place-b", name: "Luogo B", kind: "place" }
    ],
    edges: [
      { id: "edge-keep", from: "person-a", to: "place-a", kind: "works_at" },
      { id: "edge-remove", from: "person-a", to: "place-b", kind: "works_at" }
    ]
  };
  const graph = normalizeGraphData(source, graphConfig);
  const { facts, reverseEdgeIndex, reverseSourceIndex, indexByNodeId } = buildAspFactsFromGraph(graph);
  const mappedNodeAttributes = new Set(Object.keys(graphConfig.graphMapping.node.attributes));
  const mappedEdgeAttributes = new Set(Object.keys(graphConfig.graphMapping.edge.attributes));
  const repairConstraints = {
    requiredNodeAttributes: [{ nodeType: "person", attributes: ["email"] }],
    requiredEdgeAttributes: [{ edgeType: "works_at", attributes: ["since"] }],
    uniqueNodeAttributes: [{ nodeType: "person", attribute: "email" }],
    cardinalities: [
      { nodeType: "person", edgeType: "works_at", incidence: "any", max: 1 }
    ],
    repairSuggestions: {
      removableEdges: [{ edgeId: "edge-remove", cost: 1 }],
      nodeAttributeValues: [{
        nodeId: "person-a",
        attribute: "email",
        value: 'ada, "candidate"@example.org',
        cost: 2
      }, {
        nodeId: "person-a",
        attribute: "email",
        value: "more-expensive@example.org",
        cost: 8
      }],
      edgeAttributeValues: [{
        edgeId: "edge-keep",
        attribute: "since",
        value: 1950,
        cost: 3
      }, {
        edgeId: "edge-keep",
        attribute: "since",
        value: 1951,
        cost: 7
      }]
    }
  };
  const { program, costByEdgeId, attributeCandidateById, edgeAttributeCandidateById } = buildMinimumIntegrityRepairProgram(
    repairConstraints,
    graph.direction,
    reverseEdgeIndex,
    indexByNodeId,
    reverseSourceIndex,
    mappedNodeAttributes,
    mappedEdgeAttributes
  );
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts}\n${program}`, ["--opt-mode=opt"]);
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const repair = parseIntegrityRepairProposal(
    result.Call?.[0]?.Witnesses,
    reverseEdgeIndex,
    costByEdgeId,
    attributeCandidateById,
    edgeAttributeCandidateById
  );
  assert.deepEqual(repair, {
    edgeIds: ["edge-remove"],
    edgeCosts: { "edge-remove": 1 },
    nodeAttributes: [{
      nodeId: "person-a",
      attribute: "email",
      value: 'ada, "candidate"@example.org',
      cost: 2
    }],
    edgeAttributes: [{
      edgeId: "edge-keep",
      attribute: "since",
      value: 1950,
      cost: 3
    }],
    cost: 6
  });
  assert.equal(source.nodes[0].email, undefined, "una proposta ASP non muta i dati sorgente");

  const attributeOnlyConstraints = {
    requiredNodeAttributes: [{ nodeType: "person", attributes: ["email"] }],
    uniqueNodeAttributes: [{ nodeType: "person", attribute: "email" }],
    repairSuggestions: {
      nodeAttributeValues: [{
        nodeId: "person-a",
        attribute: "email",
        value: "ada@example.org",
        cost: 4
      }]
    }
  };
  const attributeOnlyRepair = buildMinimumIntegrityRepairProgram(
    attributeOnlyConstraints,
    graph.direction,
    reverseEdgeIndex,
    indexByNodeId,
    reverseSourceIndex,
    mappedNodeAttributes
  );
  const attributeOnlyResult = await runner.run(`${facts}\n${attributeOnlyRepair.program}`, ["--opt-mode=opt"]);
  assert.equal(attributeOnlyResult.Result, "OPTIMUM FOUND", attributeOnlyResult.Error ?? JSON.stringify(attributeOnlyResult));
  assert.deepEqual(parseIntegrityRepairProposal(
    attributeOnlyResult.Call?.[0]?.Witnesses,
    reverseEdgeIndex,
    attributeOnlyRepair.costByEdgeId,
    attributeOnlyRepair.attributeCandidateById
  ), {
    edgeIds: [],
    nodeAttributes: [{ nodeId: "person-a", attribute: "email", value: "ada@example.org", cost: 4 }],
    cost: 4
  });

  const duplicateValueConstraints = {
    ...repairConstraints,
    requiredEdgeAttributes: [],
    cardinalities: [],
    repairSuggestions: {
      nodeAttributeValues: [{
        nodeId: "person-a",
        attribute: "email",
        value: "existing@example.org",
        cost: 1
      }]
    }
  };
  const duplicateValueRepair = buildMinimumIntegrityRepairProgram(
    duplicateValueConstraints,
    graph.direction,
    reverseEdgeIndex,
    indexByNodeId,
    reverseSourceIndex,
    mappedNodeAttributes
  );
  const duplicateValueResult = await runner.run(`${facts}\n${duplicateValueRepair.program}`, ["--opt-mode=opt"]);
  assert.equal(duplicateValueResult.Result, "UNSATISFIABLE", "un valore che violerebbe l'unicità non deve essere proposto");

  const attemptedOverwrite = buildMinimumIntegrityRepairProgram({
    requiredNodeAttributes: [{ nodeType: "person", attributes: ["email"] }],
    repairSuggestions: {
      nodeAttributeValues: [{ nodeId: "person-b", attribute: "email", value: "replacement@example.org", cost: 1 }]
    }
  }, graph.direction, reverseEdgeIndex, indexByNodeId, reverseSourceIndex, mappedNodeAttributes);
  const attemptedOverwriteResult = await runner.run(`${facts}\n${attemptedOverwrite.program}`, ["--opt-mode=opt"]);
  assert.equal(attemptedOverwriteResult.Result, "UNSATISFIABLE", "il valore candidato non deve sostituire l'email già presente su person-b");

  const existingEdgeGraph = normalizeGraphData({
    nodes: [
      { id: "person", name: "Persona", kind: "person" },
      { id: "place", name: "Luogo", kind: "place" }
    ],
    edges: [{ id: "existing-edge", from: "person", to: "place", kind: "works_at", since: 1950 }]
  }, graphConfig);
  const existingEdgeFacts = buildAspFactsFromGraph(existingEdgeGraph);
  const existingEdgeCandidate = buildMinimumIntegrityRepairProgram({
    requiredEdgeAttributes: [{ edgeType: "works_at", attributes: ["since"] }],
    repairSuggestions: {
      edgeAttributeValues: [{ edgeId: "existing-edge", attribute: "since", value: 1951, cost: 1 }]
    }
  }, existingEdgeGraph.direction, existingEdgeFacts.reverseEdgeIndex, new Map(), {}, new Set(), mappedEdgeAttributes);
  const existingEdgeResult = await runner.run(`${existingEdgeFacts.facts}\n${existingEdgeCandidate.program}`, ["--opt-mode=opt"]);
  assert.equal(existingEdgeResult.Result, "SATISFIABLE", existingEdgeResult.Error ?? JSON.stringify(existingEdgeResult));
  assert.deepEqual(parseIntegrityRepairProposal(
    existingEdgeResult.Call?.[0]?.Witnesses,
    existingEdgeFacts.reverseEdgeIndex,
    existingEdgeCandidate.costByEdgeId,
    existingEdgeCandidate.attributeCandidateById,
    existingEdgeCandidate.edgeAttributeCandidateById
  ), { edgeIds: [], cost: 0 }, "un valore già presente resta immutato e non genera un'azione di riempimento");

  assert.throws(() => buildMinimumIntegrityRepairProgram({
    ...repairConstraints,
    repairSuggestions: { nodeAttributeValues: [{ nodeId: "unknown", attribute: "email", value: "x" }] }
  }, graph.direction, reverseEdgeIndex, indexByNodeId, reverseSourceIndex, mappedNodeAttributes), /non identifica un nodo presente/);
  assert.throws(() => buildMinimumIntegrityRepairProgram({
    ...repairConstraints,
    repairSuggestions: { nodeAttributeValues: [{ nodeId: "person-a", attribute: "email", value: { invalid: true } }] }
  }, graph.direction, reverseEdgeIndex, indexByNodeId, reverseSourceIndex, mappedNodeAttributes), /deve essere una stringa, un numero finito o un booleano/);
  assert.throws(() => buildMinimumIntegrityRepairProgram({
    repairSuggestions: {
      removableEdges: [
        { edgeId: "edge-keep", cost: Number.MAX_SAFE_INTEGER },
        { edgeId: "edge-remove", cost: 1 }
      ]
    }
  }, graph.direction, reverseEdgeIndex), /somma massima dei costi.*intero sicuro/);
  assert.throws(() => buildMinimumIntegrityRepairProgram({
    requiredNodeAttributes: [{ nodeType: "person", attributes: ["email"] }],
    repairSuggestions: { nodeAttributeValues: [{ nodeId: "person-a", attribute: "unmapped", value: "x" }] }
  }, graph.direction, reverseEdgeIndex, indexByNodeId, reverseSourceIndex, mappedNodeAttributes), /non è mappato in graphMapping.node.attributes/);
  assert.throws(() => buildMinimumIntegrityRepairProgram({
    requiredEdgeAttributes: [{ edgeType: "works_at", attributes: ["since"] }],
    repairSuggestions: { edgeAttributeValues: [{ edgeId: "edge-keep", attribute: "unmapped", value: "x" }] }
  }, graph.direction, reverseEdgeIndex, indexByNodeId, reverseSourceIndex, mappedNodeAttributes, mappedEdgeAttributes), /non è mappato in graphMapping.edge.attributes/);
  assert.throws(() => buildMinimumIntegrityRepairProgram({
    requiredEdgeAttributes: [{ edgeType: "works_at", attributes: ["since"] }],
    repairSuggestions: { edgeAttributeValues: [{ edgeId: "unknown", attribute: "since", value: 1950 }] }
  }, graph.direction, reverseEdgeIndex, indexByNodeId, reverseSourceIndex, mappedNodeAttributes, mappedEdgeAttributes), /deve corrispondere a un solo record/);
});

test("le riparazioni sostituiscono solo valori attesi espliciti e risolvono unicità di nodi e archi", async () => {
  const source = {
    nodes: [
      { id: "person-a", name: "Ada", kind: "person", email: "duplicate@example.org" },
      { id: "person-b", name: "Bruno", kind: "person", email: "duplicate@example.org" },
      { id: "place-a", name: "Luogo A", kind: "place" },
      { id: "place-b", name: "Luogo B", kind: "place" }
    ],
    edges: [
      { id: "edge-a", from: "person-a", to: "place-a", kind: "works_at", since: 1950, registry_code: "R-1" },
      { id: "edge-b", from: "person-b", to: "place-b", kind: "works_at", since: 1950, registry_code: "R-1" }
    ]
  };
  const graph = normalizeGraphData(source, graphConfig);
  const asp = buildAspFactsFromGraph(graph);
  const repairConfig = {
    uniqueNodeAttributes: [{ nodeType: "person", attribute: "email" }],
    uniqueEdgeAttributes: [{ edgeType: "works_at", attribute: "registryCode" }],
    repairSuggestions: {
      nodeAttributeReplacements: [{
        nodeId: "person-b", attribute: "email", expectedValue: "duplicate@example.org", value: "bruno@example.org", cost: 2
      }, {
        nodeId: "person-b", attribute: "email", expectedValue: "duplicate@example.org", value: "bruno.alt@example.org", cost: 4
      }],
      edgeAttributeReplacements: [{
        edgeId: "edge-b", attribute: "registryCode", expectedValue: "R-1", value: "R-2", cost: 3
      }, {
        edgeId: "edge-b", attribute: "registryCode", expectedValue: "R-1", value: "R-3", cost: 6
      }]
    }
  };
  const runner = await createClingoWasmRunner();
  const diagnosis = await runner.run(`${asp.facts}\n${buildGraphIntegrityProgram(repairConfig, graph.direction)}`);
  assert.equal(diagnosis.Result, "SATISFIABLE", diagnosis.Error ?? JSON.stringify(diagnosis));
  const parsedViolations = parseIntegrityViolations(
    diagnosis.Call?.[0]?.Witnesses,
    asp.reverseIndex,
    asp.reverseEdgeIndex
  );
  assert.deepEqual(parsedViolations.find((violation) => violation.kind === "duplicate_edge_attribute")?.edgeIds, ["edge-a", "edge-b"]);

  const repair = buildMinimumIntegrityRepairProgram(
    repairConfig,
    graph.direction,
    asp.reverseEdgeIndex,
    asp.indexByNodeId,
    asp.reverseSourceIndex,
    new Set(Object.keys(graphConfig.graphMapping.node.attributes)),
    new Set(Object.keys(graphConfig.graphMapping.edge.attributes))
  );
  const result = await runner.run(`${asp.facts}\n${repair.program}`, ["--opt-mode=opt"]);
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.deepEqual(parseIntegrityRepairProposal(
    result.Call?.[0]?.Witnesses,
    asp.reverseEdgeIndex,
    repair.costByEdgeId,
    repair.attributeCandidateById,
    repair.edgeAttributeCandidateById,
    repair.nodeAttributeReplacementById,
    repair.edgeAttributeReplacementById
  ), {
    edgeIds: [],
    nodeAttributeReplacements: [{
      nodeId: "person-b", attribute: "email", expectedValue: "duplicate@example.org", value: "bruno@example.org", cost: 2
    }],
    edgeAttributeReplacements: [{
      edgeId: "edge-b", attribute: "registryCode", expectedValue: "R-1", value: "R-2", cost: 3
    }],
    cost: 5
  });
  assert.equal(source.nodes[1].email, "duplicate@example.org");
  assert.equal(source.edges[1].registry_code, "R-1");

  const staleExpectedValue = buildMinimumIntegrityRepairProgram({
    ...repairConfig,
    repairSuggestions: {
      ...repairConfig.repairSuggestions,
      nodeAttributeReplacements: [],
      edgeAttributeReplacements: [{
        edgeId: "edge-b", attribute: "registryCode", expectedValue: "stale-value", value: "R-2", cost: 3
      }]
    }
  }, graph.direction, asp.reverseEdgeIndex, asp.indexByNodeId, asp.reverseSourceIndex,
  new Set(Object.keys(graphConfig.graphMapping.node.attributes)),
  new Set(Object.keys(graphConfig.graphMapping.edge.attributes)));
  const staleResult = await runner.run(`${asp.facts}\n${staleExpectedValue.program}`, ["--opt-mode=opt"]);
  assert.equal(staleResult.Result, "UNSATISFIABLE", "una sostituzione si applica solo se il dato corrente coincide col valore atteso");

  assert.throws(() => buildMinimumIntegrityRepairProgram({
    repairSuggestions: {
      nodeAttributeReplacements: [{
        nodeId: "person-a", attribute: "email", expectedValue: "same", value: "same", cost: 1
      }]
    }
  }, graph.direction, asp.reverseEdgeIndex, asp.indexByNodeId, asp.reverseSourceIndex,
  new Set(Object.keys(graphConfig.graphMapping.node.attributes))), /deve differire da expectedValue/);
});

test("le sostituzioni di tipo ASP rispettano i domini degli estremi e richiedono il tipo atteso", async () => {
  const source = {
    nodes: [
      { id: "person-a", name: "Ada", kind: "person" },
      { id: "person-b", name: "Bruno", kind: "person" },
      { id: "institution", name: "Istituto", kind: "place" }
    ],
    edges: [
      { id: "work", from: "person-a", to: "institution", kind: "works_at" },
      { id: "peer", from: "person-a", to: "person-b", kind: "works_at" },
      { id: "mentor", from: "person-a", to: "person-b", kind: "mentors" }
    ]
  };
  const graph = normalizeGraphData(source, graphConfig);
  const asp = buildAspFactsFromGraph(graph);
  const constraints = {
    allowedNodeTypes: ["person", "institution"],
    allowedEdgeTypes: ["works_at", "collaborates"],
    edgeTypeDomains: [
      { edgeType: "works_at", sourceNodeTypes: ["person"], targetNodeTypes: ["institution"] },
      { edgeType: "collaborates", sourceNodeTypes: ["person"], targetNodeTypes: ["person"] }
    ],
    repairSuggestions: {
      nodeTypeReplacements: [{
        nodeId: "institution", expectedType: "place", newType: "institution", cost: 2
      }, {
        nodeId: "institution", expectedType: "place", newType: "person", cost: 1
      }],
      edgeTypeReplacements: [{
        edgeId: "peer", expectedType: "works_at", newType: "collaborates", cost: 3
      }, {
        edgeId: "mentor", expectedType: "mentors", newType: "collaborates", cost: 4
      }]
    }
  };
  const runner = await createClingoWasmRunner();
  const diagnosis = await runner.run(`${asp.facts}\n${buildGraphIntegrityProgram(constraints, graph.direction)}`);
  assert.equal(diagnosis.Result, "SATISFIABLE", diagnosis.Error ?? JSON.stringify(diagnosis));
  assert.equal(
    parseIntegrityViolations(diagnosis.Call?.[0]?.Witnesses, asp.reverseIndex, asp.reverseEdgeIndex)
      .filter((violation) => violation.kind === "edge_endpoint_type").length,
    2
  );
  assert.equal(
    parseIntegrityViolations(diagnosis.Call?.[0]?.Witnesses, asp.reverseIndex, asp.reverseEdgeIndex)
      .filter((violation) => violation.kind === "node_type_out_of_domain").length,
    1
  );
  const edgeTypeViolations = parseIntegrityViolations(
    diagnosis.Call?.[0]?.Witnesses,
    asp.reverseIndex,
    asp.reverseEdgeIndex
  ).filter((violation) => violation.kind === "edge_type_out_of_domain");
  assert.equal(edgeTypeViolations.length, 1);
  assert.equal(edgeTypeViolations[0].subjectId, "mentor");

  const repair = buildMinimumIntegrityRepairProgram(
    constraints,
    graph.direction,
    asp.reverseEdgeIndex,
    asp.indexByNodeId,
    asp.reverseSourceIndex
  );
  const result = await runner.run(`${asp.facts}\n${repair.program}`, ["--opt-mode=opt"]);
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.deepEqual(parseIntegrityRepairProposal(
    result.Call?.[0]?.Witnesses,
    asp.reverseEdgeIndex,
    repair.costByEdgeId,
    repair.attributeCandidateById,
    repair.edgeAttributeCandidateById,
    repair.nodeAttributeReplacementById,
    repair.edgeAttributeReplacementById,
    repair.nodeTypeReplacementById,
    repair.edgeTypeReplacementById
  ), {
    edgeIds: [],
    nodeTypeReplacements: [{
      nodeId: "institution", expectedType: "place", newType: "institution", cost: 2
    }],
    edgeTypeReplacements: [{
      edgeId: "mentor", expectedType: "mentors", newType: "collaborates", cost: 4
    }, {
      edgeId: "peer", expectedType: "works_at", newType: "collaborates", cost: 3
    }],
    cost: 9
  });
  assert.equal(source.nodes[2].kind, "place");
  assert.equal(source.edges[1].kind, "works_at");
  assert.equal(source.edges[2].kind, "mentors");

  const staleNodeType = buildMinimumIntegrityRepairProgram({
    ...constraints,
    repairSuggestions: {
      ...constraints.repairSuggestions,
      nodeTypeReplacements: [{ nodeId: "institution", expectedType: "not-place", newType: "institution", cost: 2 }]
    }
  }, graph.direction, asp.reverseEdgeIndex, asp.indexByNodeId, asp.reverseSourceIndex);
  const staleResult = await runner.run(`${asp.facts}\n${staleNodeType.program}`, ["--opt-mode=opt"]);
  assert.equal(staleResult.Result, "UNSATISFIABLE", "la sostituzione non si applica se il tipo corrente non coincide col valore atteso");

  assert.throws(() => buildMinimumIntegrityRepairProgram({
    ...constraints,
    repairSuggestions: {
      edgeTypeReplacements: [{ edgeId: "peer", expectedType: "works_at", newType: "unconfigured", cost: 1 }]
    }
  }, graph.direction, asp.reverseEdgeIndex, asp.indexByNodeId, asp.reverseSourceIndex), /deve appartenere a allowedEdgeTypes/);
  assert.throws(() => buildMinimumIntegrityRepairProgram({
    ...constraints,
    allowedNodeTypes: undefined,
    repairSuggestions: {
      nodeTypeReplacements: [{ nodeId: "institution", expectedType: "place", newType: "institution", cost: 2 }]
    }
  }, graph.direction, asp.reverseEdgeIndex, asp.indexByNodeId, asp.reverseSourceIndex), /allowedNodeTypes deve essere un array non vuoto/);
});

test("integrity constraints reject malformed rules and meaningless undirected incidence", () => {
  assert.throws(() => buildGraphIntegrityProgram({}), /almeno un vincolo/);
  assert.throws(() => buildGraphIntegrityProgram({ requiredNodeAttributes: "email" }), /deve essere un array/);
  assert.throws(() => buildGraphIntegrityProgram({
    nodeAttributeDomains: [{ nodeType: "person", attribute: "status", allowedValues: [] }]
  }), /allowedValues deve essere un array non vuoto/);
  assert.throws(() => validateGraphIntegrityAttributeMappings({
    nodeAttributeDomains: [{ nodeType: "person", attribute: "unmapped", allowedValues: ["valid"] }]
  }, new Set(), new Set()), /non è mappato/);
  assert.throws(() => buildGraphIntegrityProgram({
    cardinalities: [{ nodeType: "person", edgeType: "works_at", incidence: "source", max: 1 }]
  }, "undirected"), /grafo diretto/);
  assert.throws(() => buildGraphIntegrityProgram({
    cardinalities: [
      { nodeType: "person", edgeType: "works_at", max: 2 },
      { nodeType: "person", edgeType: "works_at", min: 1 }
    ]
  }), /combina min e max/);
});

test("i domini finiti degli attributi nodo/arco diagnosticano e riparano solo valori esplicitamente ammessi", async () => {
  const source = {
    nodes: [
      { id: "person", name: "Persona", kind: "person", email: "invalid@example.org" },
      { id: "place", name: "Luogo", kind: "place" }
    ],
    edges: [{ id: "edge", from: "person", to: "place", kind: "works_at", since: 1950, registry_code: "BAD" }]
  };
  const graph = normalizeGraphData(source, graphConfig);
  const asp = buildAspFactsFromGraph(graph);
  const constraints = {
    nodeAttributeDomains: [{
      nodeType: "person", attribute: "email", allowedValues: ["ada@example.org", "bruno@example.org"]
    }],
    edgeAttributeDomains: [{
      edgeType: "works_at", attribute: "registryCode", allowedValues: ["R-1", "R-2"]
    }]
  };
  const runner = await createClingoWasmRunner();
  const diagnosis = await runner.run(`${asp.facts}\n${buildGraphIntegrityProgram(constraints, graph.direction)}`);
  assert.equal(diagnosis.Result, "SATISFIABLE", diagnosis.Error ?? JSON.stringify(diagnosis));
  const violations = parseIntegrityViolations(diagnosis.Call?.[0]?.Witnesses, asp.reverseIndex, asp.reverseEdgeIndex);
  assert.equal(violations.find((item) => item.kind === "node_attribute_out_of_domain")?.value, "invalid@example.org");
  assert.deepEqual(violations.find((item) => item.kind === "edge_attribute_out_of_domain")?.edgeIds, ["edge"]);

  const repair = buildMinimumIntegrityRepairProgram({
    ...constraints,
    repairSuggestions: {
      nodeAttributeReplacements: [{
        nodeId: "person", attribute: "email", expectedValue: "invalid@example.org", value: "ada@example.org", cost: 2
      }],
      edgeAttributeReplacements: [{
        edgeId: "edge", attribute: "registryCode", expectedValue: "BAD", value: "R-2", cost: 3
      }]
    }
  }, graph.direction, asp.reverseEdgeIndex, asp.indexByNodeId, asp.reverseSourceIndex,
  new Set(Object.keys(graphConfig.graphMapping.node.attributes)),
  new Set(Object.keys(graphConfig.graphMapping.edge.attributes)));
  const result = await runner.run(`${asp.facts}\n${repair.program}`, ["--opt-mode=opt"]);
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  assert.deepEqual(parseIntegrityRepairProposal(
    result.Call?.[0]?.Witnesses,
    asp.reverseEdgeIndex,
    repair.costByEdgeId,
    repair.attributeCandidateById,
    repair.edgeAttributeCandidateById,
    repair.nodeAttributeReplacementById,
    repair.edgeAttributeReplacementById
  ), {
    edgeIds: [],
    nodeAttributeReplacements: [{
      nodeId: "person", attribute: "email", expectedValue: "invalid@example.org", value: "ada@example.org", cost: 2
    }],
    edgeAttributeReplacements: [{
      edgeId: "edge", attribute: "registryCode", expectedValue: "BAD", value: "R-2", cost: 3
    }],
    cost: 5
  });
  assert.equal(source.nodes[0].email, "invalid@example.org");
  assert.equal(source.edges[0].registry_code, "BAD");
});

test("i decimali sono serializzati come razionali ASP esatti e gli intervalli frazionari restano diagnostici", async () => {
  const config = {
    ...graphConfig,
    graphMapping: {
      ...graphConfig.graphMapping,
      edge: {
        ...graphConfig.graphMapping.edge,
        weightField: "$.weight",
        confidenceField: "$.confidence"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", name: "Ada", kind: "person" },
      { id: "b", name: "Luogo", kind: "place" }
    ],
    edges: [{
      id: "fractional",
      from: "a",
      to: "b",
      kind: "works_at",
      weight: 0.5,
      confidence: 0.8,
      valid_from: 1900.5,
      valid_to: 1910.5
    }]
  }, config);
  assert.equal(graph.capabilities.edgeWeights.available, true);
  assert.equal(graph.capabilities.edgeConfidence.available, true);
  assert.equal(graph.capabilities.edgeIntervals.available, false);
  const { facts } = buildAspFactsFromGraph(graph);
  assert.match(facts, /edge_weight\(1,decimal\(1,2\)\)\./);
  assert.match(facts, /edge_confidence\(1,decimal\(4,5\)\)\./);
  assert.match(facts, /edge_valid_from_invalid\(1\)\./);
  assert.match(facts, /edge_valid_from_raw\(1,"1900\.5"\)\./);

  const result = await (await createClingoWasmRunner()).run(facts);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
});

test("le riparazioni ASP sostituiscono intervalli temporali solo su estremi attesi, con semantica chiusa e costi espliciti", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", name: "A", kind: "person" },
      { id: "b", name: "B", kind: "person" },
      { id: "c", name: "C", kind: "person" },
      { id: "d", name: "D", kind: "person" },
      { id: "e", name: "E", kind: "person" },
      { id: "f", name: "F", kind: "person" },
      { id: "g", name: "G", kind: "person" },
      { id: "h", name: "H", kind: "person" }
    ],
    edges: [
      { id: "e-reversed", from: "a", to: "b", kind: "works_at", valid_from: 2024, valid_to: 2020 },
      { id: "e-invalid", from: "c", to: "d", kind: "works_at", valid_from: "2024-02-31", valid_to: "2030-01-01" },
      { id: "e-missing", from: "e", to: "f", kind: "works_at", valid_to: 2040 },
      { id: "e-null", from: "g", to: "h", kind: "works_at", valid_from: null, valid_to: 2050 }
    ]
  }, graphConfig);
  assert.equal(graph.valid, true);
  const defaultFacts = buildAspFactsFromGraph(graph).facts;
  assert.doesNotMatch(defaultFacts, /edge_valid_(?:from|to)_raw_exact/);
  const constraints = {
    requiredEdgeIntervals: ["works_at"],
    repairSuggestions: {
      edgeIntervalReplacements: [
        {
          edgeId: "e-reversed",
          expectedFrom: 2024,
          expectedTo: 2020,
          from: "2020",
          to: 2024,
          cost: 3
        },
        {
          edgeId: "e-invalid",
          expectedFrom: "2024-02-31",
          expectedTo: "2030-01-01",
          from: "2029-01-01",
          to: "2030-01-01",
          cost: 2
        },
        {
          edgeId: "e-missing",
          expectedTo: 2040,
          from: 2035,
          to: 2040,
          cost: 1
        },
        {
          edgeId: "e-null",
          expectedFrom: null,
          expectedTo: 2050,
          from: 2040,
          to: 2050,
          cost: 4
        }
      ]
    }
  };
  const intervalCandidates = constraints.repairSuggestions.edgeIntervalReplacements;
  const additionalTemporalValues = intervalCandidates.flatMap((candidate) => [
    candidate.expectedFrom,
    candidate.expectedTo,
    candidate.from,
    candidate.to
  ]);
  const {
    facts,
    reverseEdgeIndex,
    reverseSourceIndex,
    indexByNodeId,
    temporalEncoding
  } = buildAspFactsFromGraph(graph, undefined, {
    includeRawTemporalValues: true,
    additionalTemporalValues
  });
  assert.match(facts, /edge_valid_from_raw_exact\(2,"\\\"2024-02-31\\\""\)\./);
  assert.doesNotMatch(facts, /edge_valid_from(?:_invalid)?\(4(?:,|\))/);
  const repair = buildMinimumIntegrityRepairProgram(
    constraints,
    graph.direction,
    reverseEdgeIndex,
    indexByNodeId,
    reverseSourceIndex,
    undefined,
    undefined,
    temporalEncoding
  );
  const result = await (await createClingoWasmRunner()).run(
    `${facts}\n${repair.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const proposal = parseIntegrityRepairProposal(
    result.Call?.[0]?.Witnesses,
    reverseEdgeIndex,
    repair.costByEdgeId,
    repair.attributeCandidateById,
    repair.edgeAttributeCandidateById,
    repair.nodeAttributeReplacementById,
    repair.edgeAttributeReplacementById,
    repair.nodeTypeReplacementById,
    repair.edgeTypeReplacementById,
    repair.edgeIntervalReplacementById
  );
  assert.equal(proposal.cost, 10);
  assert.deepEqual(
    proposal.edgeIntervalReplacements?.map(({ edgeId, expectedFrom, expectedTo, from, to, cost }) => ({
      edgeId,
      ...(expectedFrom === undefined ? {} : { expectedFrom }),
      ...(expectedTo === undefined ? {} : { expectedTo }),
      from,
      to,
      cost
    })),
    [
      { edgeId: "e-invalid", expectedFrom: "2024-02-31", expectedTo: "2030-01-01", from: "2029-01-01", to: "2030-01-01", cost: 2 },
      { edgeId: "e-missing", expectedTo: 2040, from: 2035, to: 2040, cost: 1 },
      { edgeId: "e-null", expectedFrom: null, expectedTo: 2050, from: 2040, to: 2050, cost: 4 },
      { edgeId: "e-reversed", expectedFrom: 2024, expectedTo: 2020, from: "2020", to: 2024, cost: 3 }
    ]
  );
});

test("una sostituzione temporale con estremi attesi obsoleti non ripara il record", async () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a", kind: "person" }, { id: "b", kind: "person" }],
    edges: [{ id: "e-stale", from: "a", to: "b", kind: "works_at", valid_from: 2024, valid_to: 2020 }]
  }, graphConfig);
  const { facts, reverseEdgeIndex, reverseSourceIndex, indexByNodeId } = buildAspFactsFromGraph(graph);
  const repair = buildMinimumIntegrityRepairProgram({
    requiredEdgeIntervals: ["works_at"],
    repairSuggestions: {
      edgeIntervalReplacements: [{
        edgeId: "e-stale",
        expectedFrom: 2023,
        expectedTo: 2020,
        from: 2020,
        to: 2024
      }]
    }
  }, graph.direction, reverseEdgeIndex, indexByNodeId, reverseSourceIndex);
  const result = await (await createClingoWasmRunner()).run(`${facts}\n${repair.program}`, ["--opt-mode=opt"]);
  assert.equal(result.Result, "UNSATISFIABLE", result.Error ?? JSON.stringify(result));
});

test("le sostituzioni temporali rifiutano intervalli invertiti, formati misti e costi non positivi", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a", kind: "person" }, { id: "b", kind: "person" }],
    edges: [{ id: "e", from: "a", to: "b", kind: "works_at", valid_from: 2024, valid_to: 2020 }]
  }, graphConfig);
  const { reverseEdgeIndex, reverseSourceIndex, indexByNodeId } = buildAspFactsFromGraph(graph);
  const build = (candidate) => buildMinimumIntegrityRepairProgram({
    requiredEdgeIntervals: ["works_at"],
    repairSuggestions: { edgeIntervalReplacements: [{ edgeId: "e", expectedFrom: 2024, expectedTo: 2020, ...candidate }] }
  }, graph.direction, reverseEdgeIndex, indexByNodeId, reverseSourceIndex);
  assert.throws(() => build({ from: 2024, to: 2020 }), /from non può essere successivo/);
  assert.doesNotThrow(() => build({ from: "2020", to: 2024 }));
  assert.throws(() => build({ from: "2020", to: "2024-01-01" }), /non possono mescolare/);
  assert.throws(() => build({ from: "2024-02-31", to: "2024-03-01" }), /date ISO valide/);
  assert.throws(() => build({ from: "2024-01-01T12:00:00", to: "2024-01-02T12:00:00" }), /date ISO valide/);
  assert.doesNotThrow(() => build({ from: "2024-01-01T12:00:00+01:00", to: "2024-01-02T12:00:00+01:00" }));
  assert.throws(() => build({ from: 2020, to: 2024, cost: 0 }), /cost deve essere un intero positivo/);
});

