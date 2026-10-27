import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import psychologyDataset from "../src/lib/kliqueasp/data/my-dataset.json" with { type: "json" };
import psychologyGraphConfig from "../src/lib/kliqueasp/config/graph.config.json" with { type: "json" };
import { buildAspFactsFromGraph, normalizeGraphData } from "../src/lib/kliqueasp/graph/graphModel.ts";
import {
  buildTypedMotifCountProgram,
  buildTypedMotifProgram,
  buildTypedMotifNearMatchProgram,
  buildTypedMotifTemporalNearMatchProgram,
  buildTypedMotifCompletionCounterfactualProgram,
  parseTypedMotifMatches,
  parseTypedMotifCount,
  parseTypedMotifNearMatches,
  parseTypedMotifCompletionCounterfactuals
} from "../src/lib/kliqueasp/graph/motifTask.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import { hasCompleteModelEnumeration } from "../src/lib/kliqueasp/graph/structuralTasks.ts";
import {
  createTypedMotifCountPartitionPlan,
  resolveTypedMotifCountPartitionDomain,
  resolveTypedMotifCountPartitionSettings,
  runTypedMotifCountPartitions
} from "../src/lib/kliqueasp/graph/motifCountTask.ts";

const config = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.label", typeField: "$.kind" },
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

const sharedPlaceMotif = {
  id: "shared-place",
  label: "Due persone associate allo stesso luogo",
  roles: {
    personA: { nodeTypes: ["person"] },
    personB: { nodeTypes: ["person"] },
    place: { nodeTypes: ["place"] }
  },
  edges: [
    { sourceRole: "personA", targetRole: "place", edgeType: "person-place" },
    { sourceRole: "personB", targetRole: "place", edgeType: "person-place" }
  ],
  symmetricRoles: [["personA", "personB"]]
};

function independentlyCountSharedPlaces(graph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const peopleByPlace = new Map();
  for (const edge of graph.links) {
    if ((edge.type ?? edge.analysis?.type) !== "person-place") continue;
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    const person = source?.type === "person" && target?.type === "place"
      ? source
      : target?.type === "person" && source?.type === "place"
        ? target
        : undefined;
    const place = person === source ? target : person === target ? source : undefined;
    if (!person || !place) throw new Error("Il tipo person-place non collega un nodo person a un nodo place.");
    const people = peopleByPlace.get(place.id) ?? new Set();
    people.add(person.id);
    peopleByPlace.set(place.id, people);
  }

  let total = 0n;
  for (const people of peopleByPlace.values()) {
    const degree = BigInt(people.size);
    total += degree * (degree - 1n) / 2n;
  }
  return total.toString();
}

test("il conteggio partizionato del motivo contestuale coincide con un riferimento indipendente sul grafo Psicologia", async () => {
  const graph = normalizeGraphData(psychologyDataset, psychologyGraphConfig);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.nodes.length, 335);
  assert.equal(graph.links.length, 989, "la proiezione legacy non orientata resta invariata");
  assert.equal(graph.capabilities.edgeTypes.available, true);

  const template = psychologyGraphConfig.graphAnalysis.motifs[0];
  assert.equal(template.id, "shared-place");
  const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
  const expected = independentlyCountSharedPlaces(graph);
  const runner = await createClingoWasmRunner();

  const enumeration = buildTypedMotifProgram(template, graph.direction);
  const enumerationResult = await runner.run(`${facts.facts}\n${enumeration.program}`);
  assert.equal(enumerationResult.Result, "SATISFIABLE", enumerationResult.Error ?? JSON.stringify(enumerationResult));
  assert.equal(hasCompleteModelEnumeration(enumerationResult), true, "le istanze mostrate devono essere complete");
  const matches = parseTypedMotifMatches(
    enumerationResult.Call?.[0]?.Witnesses,
    enumeration,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(matches.length, Number(expected));
  assert.ok(matches.every((match) => match.supportingEdges.length === 2));

  const singleProgram = buildTypedMotifCountProgram(template, graph.direction);
  const singleResult = await runner.run(`${facts.facts}\n${singleProgram.program}`, [], 1);
  assert.equal(singleResult.Result, "SATISFIABLE", singleResult.Error ?? JSON.stringify(singleResult));
  assert.equal(singleResult.Models?.More, "no");
  const singleCount = parseTypedMotifCount(singleResult.Call?.[0]?.Witnesses);
  assert.equal(singleCount, expected, "l'aggregato ASP deve coincidere con il conteggio indipendente");

  const settings = resolveTypedMotifCountPartitionSettings({ partitionSize: 8, maxDurationMs: 1800000 });
  assert.equal(settings.enabled, true);
  if (!settings.enabled) throw new Error(settings.error);
  const partitioned = await runTypedMotifCountPartitions({
    edgeCount: graph.links.length,
    roleNodeCount: graph.nodes.length,
    partitionDomain: resolveTypedMotifCountPartitionDomain(template),
    settings: settings.settings,
    perPartitionTimeoutMs: 20000,
    runPartition: async (partitionIndexes) => {
      const compiled = buildTypedMotifCountProgram(template, graph.direction, "", {
        firstRoleNodeIndexes: partitionIndexes
      });
      return runner.run(`${facts.facts}\n${compiled.program}`, [], 1);
    }
  });

  assert.equal(partitioned.status, "complete");
  if (partitioned.status !== "complete") throw new Error(JSON.stringify(partitioned));
  assert.equal(partitioned.partitionCount, Math.ceil(graph.nodes.length / settings.settings.partitionSize));
  assert.equal(partitioned.count, expected, "le partizioni ASP devono ricomporre lo stesso conteggio esatto");
});

test("motivi tipizzati filtrano attributi mappati in enumerazione, conteggio, why-not e controfattuali", async () => {
  const attributeConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", labelField: "$.label", typeField: "$.kind" },
      edge: {
        idField: "$.id",
        sourceField: "$.from",
        targetField: "$.to",
        typeField: "$.kind",
        direction: "undirected",
        identity: "multigraph",
        attributes: { state: "$.state", score: "$.score", verified: "$.verified" }
      }
    }
  };
  const attributeMotif = {
    id: "verified-shared-place",
    roles: {
      personA: { nodeTypes: ["person"] },
      personB: { nodeTypes: ["person"] },
      place: { nodeTypes: ["place"] }
    },
    edges: [
      { sourceRole: "personA", targetRole: "place", edgeType: "person-place", attributes: { state: "active", score: 2, verified: true } },
      { sourceRole: "personB", targetRole: "place", edgeType: "person-place", attributes: { state: "active", score: 2, verified: true } }
    ],
    symmetricRoles: [["personA", "personB"]]
  };
  const sourceGraph = {
    nodes: [
      { id: "p1", label: "Ada", kind: "person" },
      { id: "p2", label: "Bruno", kind: "person" },
      { id: "x", label: "Istituto X", kind: "place" }
    ],
    edges: [
      { id: "p1-x", from: "p1", to: "x", kind: "person-place", state: "active", score: 2, verified: true },
      { id: "p2-x", from: "p2", to: "x", kind: "person-place", state: "pending", score: 2, verified: true }
    ]
  };
  const configured = {
    ...attributeConfig,
    graphAnalysis: {
      motifs: [attributeMotif],
      counterfactuals: {
        edgeAdditions: [{
          id: "p2-x-confirmed",
          sourceNodeId: "p2",
          targetNodeId: "x",
          edgeType: "person-place",
          attributes: { state: "active", score: 2, verified: true },
          cost: 1
        }]
      }
    }
  };
  const graph = normalizeGraphData(sourceGraph, configured);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.deepEqual(graph.links.map((edge) => edge.analysis.attributes), [
    { state: "active", score: 2, verified: true },
    { state: "pending", score: 2, verified: true }
  ]);

  const facts = buildAspFactsFromGraph(graph);
  const runner = await createClingoWasmRunner();
  const compiled = buildTypedMotifProgram(attributeMotif, graph.direction);
  const result = await runner.run(`${facts.facts}\n${compiled.program}`);
  assert.equal(result.Result, "UNSATISFIABLE", result.Error ?? JSON.stringify(result));

  const nearMatch = buildTypedMotifNearMatchProgram(attributeMotif, graph.direction);
  const nearResult = await runner.run(`${facts.facts}\n${nearMatch.program}`, ["--opt-mode=opt"]);
  assert.equal(nearResult.Result, "OPTIMUM FOUND", nearResult.Error ?? JSON.stringify(nearResult));
  const [diagnosis] = parseTypedMotifNearMatches(
    nearResult.Call?.[0]?.Witnesses,
    nearMatch,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(diagnosis);
  assert.equal(diagnosis.missingPatterns.length, 1);
  assert.deepEqual(diagnosis.missingPatterns[0].attributes, { score: 2, state: "active", verified: true });
  assert.deepEqual(diagnosis.supportingEdges.find((edge) => edge.edgeIds.length > 0)?.attributes,
    { score: 2, state: "active", verified: true });

  const count = buildTypedMotifCountProgram(attributeMotif, graph.direction);
  const countResult = await runner.run(`${facts.facts}\n${count.program}`, [], 1);
  assert.equal(countResult.Result, "SATISFIABLE", countResult.Error ?? JSON.stringify(countResult));
  assert.equal(parseTypedMotifCount(countResult.Call?.[0]?.Witnesses), "0");

  const completeGraph = normalizeGraphData({
    ...sourceGraph,
    edges: sourceGraph.edges.map((edge) => ({ ...edge, state: "active" }))
  }, configured);
  const completeFacts = buildAspFactsFromGraph(completeGraph);
  const completeCount = buildTypedMotifCountProgram(attributeMotif, completeGraph.direction);
  const completeCountResult = await runner.run(`${completeFacts.facts}\n${completeCount.program}`, [], 1);
  assert.equal(parseTypedMotifCount(completeCountResult.Call?.[0]?.Witnesses), "1");
  const completeEnumeration = await runner.run(`${completeFacts.facts}\n${compiled.program}`);
  assert.equal(completeEnumeration.Result, "SATISFIABLE", completeEnumeration.Error ?? JSON.stringify(completeEnumeration));
  const [match] = parseTypedMotifMatches(
    completeEnumeration.Call?.[0]?.Witnesses,
    compiled,
    completeFacts.reverseIndex,
    completeFacts.reverseSourceIndex,
    completeFacts.reverseEdgeIndex
  );
  assert.deepEqual(match.supportingEdges[0].attributes, { score: 2, state: "active", verified: true });

  const aspIndexBySourceId = Object.fromEntries(Object.entries(facts.reverseSourceIndex).map(([index, sourceId]) => [sourceId, Number(index)]));
  const completion = buildTypedMotifCompletionCounterfactualProgram(attributeMotif, graph.direction, "", [{
    ...configured.graphAnalysis.counterfactuals.edgeAdditions[0],
    sourceNode: aspIndexBySourceId.p2,
    targetNode: aspIndexBySourceId.x,
    recordIndex: 20
  }]);
  const completionResult = await runner.run(`${facts.facts}\n${completion.program}`, ["--opt-mode=opt"]);
  assert.equal(completionResult.Result, "OPTIMUM FOUND", completionResult.Error ?? JSON.stringify(completionResult));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    completionResult.Call?.[0]?.Witnesses,
    completion.template,
    completion.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(proposal);
  assert.deepEqual(proposal.addedEdges[0].attributes, { score: 2, state: "active", verified: true });

  const invalidAlias = normalizeGraphData(sourceGraph, {
    ...attributeConfig,
    graphAnalysis: { motifs: [{ ...attributeMotif, edges: [{ ...attributeMotif.edges[0], attributes: { semantic: "active" } }] }] }
  });
  assert.equal(invalidAlias.valid, false);
  assert.ok(invalidAlias.diagnostics.some((diagnostic) => diagnostic.message.includes("graphMapping.edge.attributes")));
  const invalidValue = normalizeGraphData(sourceGraph, {
    ...attributeConfig,
    graphAnalysis: { motifs: [{ ...attributeMotif, edges: [{ ...attributeMotif.edges[0], attributes: { state: null } }] }] }
  });
  assert.equal(invalidValue.valid, false);
  assert.ok(invalidValue.diagnostics.some((diagnostic) => diagnostic.message.includes("numero finito o un booleano")));
});

test("i ruoli dei motivi filtrano attributi mappati dei nodi in ASP e nei completamenti", async () => {
  const roleAttributeConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: {
        idField: "$.id",
        labelField: "$.label",
        typeField: "$.kind",
        attributes: { status: "$.status", level: "$.level" }
      },
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
  const roleAttributeMotif = {
    id: "selected-person-contact",
    roles: {
      selected: { nodeTypes: ["person"], attributes: { status: "selected", level: 2 } },
      peer: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "selected", targetRole: "peer", edgeType: "knows" }]
  };
  const sourceGraph = {
    nodes: [
      { id: "a", label: "A", kind: "person", status: "selected", level: 2 },
      { id: "b", label: "B", kind: "person", status: "other", level: 2 },
      { id: "c", label: "C", kind: "person", status: "selected", level: 2 }
    ],
    edges: []
  };
  const configured = {
    ...roleAttributeConfig,
    graphAnalysis: { motifs: [roleAttributeMotif] }
  };
  const emptyGraph = normalizeGraphData(sourceGraph, configured);
  assert.equal(emptyGraph.valid, true, JSON.stringify(emptyGraph.diagnostics));
  const emptyFacts = buildAspFactsFromGraph(emptyGraph);
  const runner = await createClingoWasmRunner();

  const emptyCount = buildTypedMotifCountProgram(roleAttributeMotif, emptyGraph.direction);
  const emptyCountResult = await runner.run(`${emptyFacts.facts}\n${emptyCount.program}`, [], 1);
  assert.equal(parseTypedMotifCount(emptyCountResult.Call?.[0]?.Witnesses), "0");

  const nearProgram = buildTypedMotifNearMatchProgram(roleAttributeMotif, emptyGraph.direction);
  const nearResult = await runner.run(`${emptyFacts.facts}\n${nearProgram.program}`, ["--opt-mode=opt"]);
  assert.equal(nearResult.Result, "OPTIMUM FOUND", nearResult.Error ?? JSON.stringify(nearResult));
  const nearMatches = parseTypedMotifNearMatches(
    nearResult.Call?.[0]?.Witnesses,
    nearProgram,
    emptyFacts.reverseIndex,
    emptyFacts.reverseSourceIndex,
    emptyFacts.reverseEdgeIndex
  );
  assert.ok(nearMatches.length > 0);
  assert.ok(nearMatches.every((match) => match.roles.selected?.sourceId !== "b"),
    "il why-not non deve assegnare a un ruolo filtrato un nodo con attributi diversi");
  assert.deepEqual(nearMatches[0].roles.selected.requiredAttributes, { level: 2, status: "selected" });

  const aspIndexBySourceId = Object.fromEntries(Object.entries(emptyFacts.reverseSourceIndex)
    .map(([index, sourceId]) => [sourceId, Number(index)]));
  const completion = buildTypedMotifCompletionCounterfactualProgram(roleAttributeMotif, emptyGraph.direction, "", [{
    id: "hypothetical-a-b",
    sourceNodeId: "a",
    targetNodeId: "b",
    edgeType: "knows",
    cost: 1,
    sourceNode: aspIndexBySourceId.a,
    targetNode: aspIndexBySourceId.b,
    recordIndex: 50
  }]);
  const completionResult = await runner.run(`${emptyFacts.facts}\n${completion.program}`, ["--opt-mode=opt"]);
  assert.equal(completionResult.Result, "OPTIMUM FOUND", completionResult.Error ?? JSON.stringify(completionResult));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    completionResult.Call?.[0]?.Witnesses,
    completion.template,
    completion.candidates,
    emptyFacts.reverseIndex,
    emptyFacts.reverseSourceIndex,
    emptyFacts.reverseEdgeIndex
  );
  assert.ok(proposal);
  assert.equal(proposal.match.roles.selected.sourceId, "a");
  assert.deepEqual(proposal.match.roles.selected.requiredAttributes, { level: 2, status: "selected" });

  const observedGraph = normalizeGraphData({
    ...sourceGraph,
    edges: [{ id: "a-b", from: "a", to: "b", kind: "knows" }]
  }, configured);
  const observedFacts = buildAspFactsFromGraph(observedGraph);
  const compiled = buildTypedMotifProgram(roleAttributeMotif, observedGraph.direction);
  const enumeration = await runner.run(`${observedFacts.facts}\n${compiled.program}`);
  assert.equal(enumeration.Result, "SATISFIABLE", enumeration.Error ?? JSON.stringify(enumeration));
  const [match] = parseTypedMotifMatches(
    enumeration.Call?.[0]?.Witnesses,
    compiled,
    observedFacts.reverseIndex,
    observedFacts.reverseSourceIndex,
    observedFacts.reverseEdgeIndex
  );
  assert.equal(match.roles.selected.sourceId, "a");
  assert.deepEqual(match.roles.selected.requiredAttributes, { level: 2, status: "selected" });
  const observedCount = buildTypedMotifCountProgram(roleAttributeMotif, observedGraph.direction);
  const observedCountResult = await runner.run(`${observedFacts.facts}\n${observedCount.program}`, [], 1);
  assert.equal(parseTypedMotifCount(observedCountResult.Call?.[0]?.Witnesses), "1");

  const temporalConfig = {
    ...configured,
    graphMapping: {
      ...configured.graphMapping,
      edge: { ...configured.graphMapping.edge, validity: { fromField: "$.start", toField: "$.end" } }
    }
  };
  const temporalGraph = normalizeGraphData({
    ...sourceGraph,
    edges: [{ id: "a-b-temporal", from: "a", to: "b", kind: "knows", start: 10, end: 20 }]
  }, temporalConfig);
  const temporalFacts = buildAspFactsFromGraph(temporalGraph);
  for (const semantics of ["coValid", "orderedByStart"]) {
    const temporalMotif = { ...roleAttributeMotif, temporal: { semantics } };
    const temporalCompiled = buildTypedMotifProgram(temporalMotif, temporalGraph.direction);
    const temporalEnumeration = await runner.run(`${temporalFacts.facts}\n${temporalCompiled.program}`);
    assert.equal(temporalEnumeration.Result, "SATISFIABLE", temporalEnumeration.Error ?? JSON.stringify(temporalEnumeration));
    const temporalMatches = parseTypedMotifMatches(
      temporalEnumeration.Call?.[0]?.Witnesses,
      temporalCompiled,
      temporalFacts.reverseIndex,
      temporalFacts.reverseSourceIndex,
      temporalFacts.reverseEdgeIndex
    );
    assert.equal(temporalMatches.length, 1, `${semantics}: solo il nodo con gli attributi richiesti può occupare il ruolo`);
    assert.equal(temporalMatches[0].roles.selected.sourceId, "a");

    const temporalCount = buildTypedMotifCountProgram(temporalMotif, temporalGraph.direction);
    const temporalCountResult = await runner.run(`${temporalFacts.facts}\n${temporalCount.program}`, [], 1);
    assert.equal(parseTypedMotifCount(temporalCountResult.Call?.[0]?.Witnesses), "1", `${semantics}: conteggio e enumerazione devono coincidere`);
  }

  const invalidAlias = normalizeGraphData(sourceGraph, {
    ...roleAttributeConfig,
    graphAnalysis: { motifs: [{ ...roleAttributeMotif, roles: {
      ...roleAttributeMotif.roles,
      selected: { nodeTypes: ["person"], attributes: { credential: "selected" } }
    } }] }
  });
  assert.equal(invalidAlias.valid, false);
  assert.ok(invalidAlias.diagnostics.some((diagnostic) => diagnostic.message.includes("graphMapping.node.attributes")));
  const invalidValue = normalizeGraphData(sourceGraph, {
    ...roleAttributeConfig,
    graphAnalysis: { motifs: [{ ...roleAttributeMotif, roles: {
      ...roleAttributeMotif.roles,
      selected: { nodeTypes: ["person"], attributes: { status: null } }
    } }] }
  });
  assert.equal(invalidValue.valid, false);
  assert.ok(invalidValue.diagnostics.some((diagnostic) => diagnostic.message.includes("numero finito o un booleano")));
});

test("la simmetria dei ruoli confronta filtri d'arco e conserva i motivi temporali simmetrici validi", () => {
  const temporalSymmetricTemplate = {
    id: "symmetric-temporal-attributes",
    roles: {
      personA: { nodeTypes: ["person"] },
      personB: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "personA", targetRole: "personB", edgeType: "knows", attributes: { state: "active" } }],
    symmetricRoles: [["personA", "personB"]],
    temporal: { semantics: "orderedByStart" }
  };

  assert.doesNotThrow(() => buildTypedMotifProgram(temporalSymmetricTemplate, "undirected"));
  assert.throws(
    () => buildTypedMotifProgram({
      id: "asymmetric-role-edge-attributes",
      roles: {
        personA: { nodeTypes: ["person"] },
        personB: { nodeTypes: ["person"] },
        place: { nodeTypes: ["place"] }
      },
      edges: [
        { sourceRole: "personA", targetRole: "place", edgeType: "visit", attributes: { state: "active" } },
        { sourceRole: "personB", targetRole: "place", edgeType: "visit", attributes: { state: "pending" } }
      ],
      symmetricRoles: [["personA", "personB"]]
    }, "undirected"),
    /non sono simmetrici nella struttura/
  );
});

test("i motivi tipizzati ASP usano ruoli/config e restituiscono archi testimoni con ID sorgente", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place-1", label: "Istituto X", kind: "place" },
      { id: "place-2", label: "Istituto Y", kind: "place" }
    ],
    edges: [
      { id: "a-x", from: "p-1", to: "place-1", kind: "person-place" },
      { id: "a-x-parallel", from: "p-1", to: "place-1", kind: "person-place" },
      { id: "b-x", from: "p-2", to: "place-1", kind: "person-place" },
      { id: "a-y", from: "p-1", to: "place-2", kind: "person-place" },
      { id: "b-y", from: "p-2", to: "place-2", kind: "person-place" }
    ]
  }, config);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram(sharedPlaceMotif, graph.direction);
  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts.facts}\n${compiled.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.equal(hasCompleteModelEnumeration(result), true, "le istanze mostrate devono essere enumerate completamente");
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );

  assert.equal(matches.length, 2);
  const counted = buildTypedMotifCountProgram(sharedPlaceMotif, graph.direction);
  assert.throws(() => buildTypedMotifCountProgram(sharedPlaceMotif, graph.direction, "", {
    firstPatternEdgeIndexes: [1]
  }), /orderedByStart/);
  const countResult = await runner.run(`${facts.facts}\n${counted.program}`, [], 1);
  assert.equal(countResult.Result, "SATISFIABLE", countResult.Error ?? JSON.stringify(countResult));
  assert.equal(countResult.Models?.More, "no", "il conteggio aggregato restituisce un solo modello completo");
  assert.equal(parseTypedMotifCount(countResult.Call?.[0]?.Witnesses), "2",
    "il conteggio ASP conta assegnamenti di ruolo, non le permutazioni dei ruoli simmetrici");
  let partitionedCount = 0n;
  for (const nodeIndex of Object.keys(facts.reverseIndex).map(Number)) {
    const partition = buildTypedMotifCountProgram(sharedPlaceMotif, graph.direction, "", {
      firstRoleNodeIndexes: [nodeIndex]
    });
    const partitionResult = await runner.run(`${facts.facts}\n${partition.program}`, [], 1);
    assert.equal(partitionResult.Result, "SATISFIABLE", partitionResult.Error ?? JSON.stringify(partitionResult));
    assert.equal(partitionResult.Models?.More, "no", "ogni partizione del primo ruolo deve essere completa");
    const partitionCount = parseTypedMotifCount(partitionResult.Call?.[0]?.Witnesses);
    assert.ok(partitionCount !== undefined, "ogni partizione deve produrre un totale esatto");
    partitionedCount += BigInt(partitionCount);
  }
  assert.equal(partitionedCount, 2n, "le partizioni disgiunte del primo ruolo ricompongono il conteggio esatto");
  let batchedRolePartitionCount = 0n;
  const roleNodePlan = createTypedMotifCountPartitionPlan(Object.keys(facts.reverseIndex).length, 2);
  for (const firstRoleNodeIndexes of roleNodePlan) {
    const partition = buildTypedMotifCountProgram(sharedPlaceMotif, graph.direction, "", {
      firstRoleNodeIndexes
    });
    const partitionResult = await runner.run(`${facts.facts}\n${partition.program}`, [], 1);
    assert.equal(partitionResult.Result, "SATISFIABLE", partitionResult.Error ?? JSON.stringify(partitionResult));
    assert.equal(partitionResult.Models?.More, "no");
    const partitionCount = parseTypedMotifCount(partitionResult.Call?.[0]?.Witnesses);
    assert.ok(partitionCount !== undefined);
    batchedRolePartitionCount += BigInt(partitionCount);
  }
  assert.equal(batchedRolePartitionCount, 2n,
    "le partizioni statiche a blocchi del primo ruolo restano disgiunte anche con record paralleli");
  const selectedGroupFacts = buildAspFactsFromGraph(graph, (node) =>
    ["p-1", "p-2", "place-1"].includes(String(node.sourceId ?? node.id)) ? ["selected"] : []);
  const selectedGroupProgram = buildTypedMotifCountProgram(sharedPlaceMotif, graph.direction, "selected");
  const selectedGroupResult = await runner.run(`${selectedGroupFacts.facts}\n${selectedGroupProgram.program}`, [], 1);
  assert.equal(selectedGroupResult.Result, "SATISFIABLE", selectedGroupResult.Error ?? JSON.stringify(selectedGroupResult));
  assert.equal(parseTypedMotifCount(selectedGroupResult.Call?.[0]?.Witnesses), "1",
    "il conteggio applica al livello ASP il gruppo selezionato per ogni ruolo");
  assert.deepEqual(matches.map((match) => match.roles.place.sourceId).sort(), ["place-1", "place-2"]);
  for (const match of matches) {
    assert.deepEqual(
      [match.roles.personA.sourceId, match.roles.personB.sourceId].sort(),
      ["p-1", "p-2"]
    );
    assert.deepEqual(match.supportingEdges.flatMap((pattern) => pattern.edgeIds).sort(),
      match.roles.place.sourceId === "place-1" ? ["a-x", "a-x-parallel", "b-x"] : ["a-y", "b-y"]);
  }
});

test("ogni testimone positivo dei motivi è sufficiente e completo su tutti i 64 grafi del fixture bipartito", async () => {
  const people = ["p-1", "p-2", "p-3"];
  const places = ["l-1", "l-2"];
  const nodes = [
    ...people.map((id) => ({ id, label: id, kind: "person" })),
    ...places.map((id) => ({ id, label: id, kind: "place" }))
  ];
  const possibleEdges = people.flatMap((person) => places.map((place) => ({ person, place })));
  const runner = await createClingoWasmRunner();

  for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
    const edges = possibleEdges.flatMap((edge, index) => (mask & (1 << index)) === 0 ? [] : [{
      id: `e-${edge.person}-${edge.place}`,
      from: edge.person,
      to: edge.place,
      kind: "person-place"
    }]);
    const graph = normalizeGraphData({ nodes, edges }, config);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(sharedPlaceMotif, graph.direction);
    assert.equal(compiled.nearMatch, false);
    assert.doesNotMatch(compiled.program, /motif_role_unassigned|motif_edge_missing|#minimize/);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    const matches = parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    );

    const expected = new Map();
    for (const place of places) {
      for (let first = 0; first < people.length; first += 1) {
        for (let second = first + 1; second < people.length; second += 1) {
          const pair = [people[first], people[second]];
          const witnessIds = pair.map((person) => `e-${person}-${place}`);
          if (witnessIds.every((id) => edges.some((edge) => edge.id === id))) {
            expected.set(`${place}|${pair.join("|")}`, { place, pair, witnessIds });
          }
        }
      }
    }

    assert.equal(matches.length, expected.size, `maschera archi ${mask}`);
    assert.equal(result.Result, expected.size ? "SATISFIABLE" : "UNSATISFIABLE", `maschera archi ${mask}`);
    for (const match of matches) {
      const place = match.roles.place.sourceId;
      const pair = [match.roles.personA.sourceId, match.roles.personB.sourceId].sort();
      assert.equal(new Set([...pair, place]).size, 3, `ruoli distinti, maschera ${mask}`);
      assert.ok(places.includes(place), `dominio del ruolo place, maschera ${mask}`);
      assert.ok(pair.every((person) => people.includes(person)), `dominio dei ruoli person, maschera ${mask}`);

      const key = `${place}|${pair.join("|")}`;
      const expectedMatch = expected.get(key);
      assert.ok(expectedMatch, `assegnamento supportato, maschera ${mask}: ${key}`);
      assert.deepEqual(
        match.supportingEdges.map((support) => support.edgeIds).flat().sort(),
        [...expectedMatch.witnessIds].sort(),
        `ogni relazione del template ha record testimoni esatti, maschera ${mask}`
      );
      expected.delete(key);
    }
    assert.equal(expected.size, 0, `nessun assegnamento valido omesso, maschera ${mask}`);

    if (matches.length === 0) {
      const nearMatchProgram = buildTypedMotifNearMatchProgram(sharedPlaceMotif, graph.direction);
      assert.equal(nearMatchProgram.nearMatch, true);
      const nearResult = await runner.run(`${facts.facts}\n${nearMatchProgram.program}`, ["--opt-mode=opt"]);
      assert.equal(nearResult.Result, "OPTIMUM FOUND", `diagnostica near-match, maschera ${mask}`);
      const nearMatches = parseTypedMotifNearMatches(
        nearResult.Call?.[0]?.Witnesses,
        nearMatchProgram,
        facts.reverseIndex,
        facts.reverseSourceIndex,
        facts.reverseEdgeIndex
      );
      assert.ok(nearMatches.length > 0, `testimone near-match, maschera ${mask}`);

      let bestAssignedRoleCount = -1;
      let bestMissingPatternCount = Number.POSITIVE_INFINITY;
      const assignmentChoices = [people, people, places].map((domain) => [undefined, ...domain]);
      for (const personA of assignmentChoices[0]) {
        for (const personB of assignmentChoices[1]) {
          for (const place of assignmentChoices[2]) {
            const assigned = [personA, personB, place].filter(Boolean);
            if (new Set(assigned).size !== assigned.length) continue;
            const assignedRoleCount = assigned.length;
            const roleByName = { personA, personB, place };
            const missingPatternCount = sharedPlaceMotif.edges.filter((pattern) => {
              const source = roleByName[pattern.sourceRole];
              const target = roleByName[pattern.targetRole];
              return source && target && !edges.some((edge) =>
                edge.kind === pattern.edgeType &&
                ((edge.from === source && edge.to === target) || (edge.from === target && edge.to === source))
              );
            }).length;
            if (assignedRoleCount > bestAssignedRoleCount ||
              (assignedRoleCount === bestAssignedRoleCount && missingPatternCount < bestMissingPatternCount)) {
              bestAssignedRoleCount = assignedRoleCount;
              bestMissingPatternCount = missingPatternCount;
            }
          }
        }
      }

      for (const nearMatch of nearMatches) {
        assert.equal(Object.keys(nearMatch.roles).length, bestAssignedRoleCount, `massimo riempimento ruoli, maschera ${mask}`);
        assert.equal(nearMatch.missingPatterns.length, bestMissingPatternCount, `minimo di relazioni mancanti, maschera ${mask}`);
        assert.equal(nearMatch.missingRoles.length, 3 - bestAssignedRoleCount, `ruoli mancanti, maschera ${mask}`);
        const expectedUnresolved = sharedPlaceMotif.edges.filter((pattern) =>
          !nearMatch.roles[pattern.sourceRole] || !nearMatch.roles[pattern.targetRole]
        ).length;
        assert.equal(nearMatch.unresolvedPatterns.length, expectedUnresolved, `relazioni non valutabili, maschera ${mask}`);
        for (const support of nearMatch.supportingEdges) {
          const source = nearMatch.roles[support.sourceRole]?.sourceId;
          const target = nearMatch.roles[support.targetRole]?.sourceId;
          const expectedEdgeIds = source && target
            ? edges.filter((edge) => edge.kind === support.edgeType &&
                ((edge.from === source && edge.to === target) || (edge.from === target && edge.to === source)))
              .map((edge) => edge.id)
              .sort()
            : [];
          assert.deepEqual(support.edgeIds, expectedEdgeIds, `record a supporto del near-match, maschera ${mask}`);
        }
      }
    }
  }
});

test("i motivi statici con assenze esplicite coincidono con l'enumeratore indotto su tutti i grafi semplici a tre nodi", async () => {
  const nodes = ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" }));
  const possibleEdges = [["a", "b"], ["a", "c"], ["b", "c"]];
  const pathWithoutShortcut = {
    id: "path-without-shortcut",
    roles: {
      left: { nodeTypes: ["person"] },
      center: { nodeTypes: ["person"] },
      right: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "left", targetRole: "center", edgeType: "knows" },
      { sourceRole: "center", targetRole: "right", edgeType: "knows" }
    ],
    absentEdges: [{ sourceRole: "left", targetRole: "right", edgeType: "knows" }],
    closedWorld: true,
    symmetricRoles: [["left", "right"]]
  };
  const runner = await createClingoWasmRunner();
  const order = new Map(nodes.map((node, index) => [node.id, index]));

  for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
    const edges = possibleEdges.flatMap(([from, to], index) => (mask & (1 << index)) === 0 ? [] : [{
      id: `e-${from}-${to}`,
      from,
      to,
      kind: "knows"
    }]);
    const graph = normalizeGraphData({ nodes, edges }, config);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(pathWithoutShortcut, graph.direction);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    const actual = parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    ).map((match) => [
      match.roles.left.sourceId,
      match.roles.center.sourceId,
      match.roles.right.sourceId
    ]).sort((left, right) => left.join("|").localeCompare(right.join("|")));

    const present = new Set(edges.map((edge) => [edge.from, edge.to].sort().join("|")));
    const expected = [];
    for (const left of ["a", "b", "c"]) {
      for (const center of ["a", "b", "c"]) {
        for (const right of ["a", "b", "c"]) {
          if (new Set([left, center, right]).size !== 3 || order.get(left) > order.get(right)) continue;
          if (!present.has([left, center].sort().join("|")) || !present.has([center, right].sort().join("|"))) continue;
          if (present.has([left, right].sort().join("|"))) continue;
          expected.push([left, center, right]);
        }
      }
    }
    expected.sort((left, right) => left.join("|").localeCompare(right.join("|")));
    assert.equal(result.Result === "SATISFIABLE", expected.length > 0, `mask ${mask}`);
    assert.deepEqual(actual, expected, `mask ${mask}`);
    const countProgram = buildTypedMotifCountProgram(pathWithoutShortcut, graph.direction);
    const countResult = await runner.run(`${facts.facts}\n${countProgram.program}`, [], 1);
    assert.equal(countResult.Result, "SATISFIABLE", countResult.Error ?? `conteggio mask ${mask}`);
    assert.equal(parseTypedMotifCount(countResult.Call?.[0]?.Witnesses), String(expected.length),
      `conteggio esatto sotto mondo chiuso e simmetria, mask ${mask}`);
    for (const witness of result.Call?.[0]?.Witnesses ?? []) {
      const parsed = parseTypedMotifMatches([witness], compiled, facts.reverseIndex, facts.reverseSourceIndex, facts.reverseEdgeIndex)[0];
      assert.deepEqual(parsed.absenceConditions, pathWithoutShortcut.absentEdges, `certificato assenza, maschera ${mask}`);
    }
  }
});

test("inducedEdgeTypes genera il complemento tipizzato e coincide con l'oracolo su tutti i grafi semplici a tre nodi", async () => {
  const nodes = ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" }));
  const possibleEdges = [["a", "b"], ["a", "c"], ["b", "c"]];
  const inducedPath = {
    id: "induced-path",
    roles: {
      left: { nodeTypes: ["person"] },
      center: { nodeTypes: ["person"] },
      right: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "left", targetRole: "center", edgeType: "knows" },
      { sourceRole: "center", targetRole: "right", edgeType: "knows" }
    ],
    inducedEdgeTypes: ["knows"],
    closedWorld: true,
    symmetricRoles: [["left", "right"]]
  };
  const runner = await createClingoWasmRunner();
  const order = new Map(nodes.map((node, index) => [node.id, index]));

  for (let mask = 0; mask < 2 ** possibleEdges.length; mask += 1) {
    const edges = possibleEdges.flatMap(([from, to], index) => (mask & (1 << index)) === 0 ? [] : [{
      id: `e-${from}-${to}`,
      from,
      to,
      kind: "knows"
    }]);
    const graph = normalizeGraphData({ nodes, edges }, config);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(inducedPath, graph.direction);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    const actual = parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    ).map((match) => [
      match.roles.left.sourceId,
      match.roles.center.sourceId,
      match.roles.right.sourceId
    ]).sort((left, right) => left.join("|").localeCompare(right.join("|")));

    const present = new Set(edges.map((edge) => [edge.from, edge.to].sort().join("|")));
    const expected = [];
    for (const left of ["a", "b", "c"]) {
      for (const center of ["a", "b", "c"]) {
        for (const right of ["a", "b", "c"]) {
          if (new Set([left, center, right]).size !== 3 || order.get(left) > order.get(right)) continue;
          if (!present.has([left, center].sort().join("|")) || !present.has([center, right].sort().join("|"))) continue;
          if (present.has([left, right].sort().join("|"))) continue;
          expected.push([left, center, right]);
        }
      }
    }
    expected.sort((left, right) => left.join("|").localeCompare(right.join("|")));
    assert.equal(result.Result === "SATISFIABLE", expected.length > 0, `mask ${mask}`);
    assert.deepEqual(actual, expected, `mask ${mask}`);
    const countProgram = buildTypedMotifCountProgram(inducedPath, graph.direction);
    const countResult = await runner.run(`${facts.facts}\n${countProgram.program}`, [], 1);
    assert.equal(countResult.Result, "SATISFIABLE", countResult.Error ?? `conteggio indotto mask ${mask}`);
    assert.equal(parseTypedMotifCount(countResult.Call?.[0]?.Witnesses), String(expected.length),
      `conteggio del motivo indotto, mask ${mask}`);
    for (const witness of result.Call?.[0]?.Witnesses ?? []) {
      const parsed = parseTypedMotifMatches([witness], compiled, facts.reverseIndex, facts.reverseSourceIndex, facts.reverseEdgeIndex)[0];
      assert.deepEqual(parsed.inducedEdgeTypes, ["knows"], `vocabolario indotto, maschera ${mask}`);
      assert.ok(parsed.absenceConditions?.some((condition) => condition.sourceRole === "left" && condition.targetRole === "right"));
    }
  }
});

test("inducedEdgeTypes rispetta orientamento, tipi fuori vocabolario e cappi", async () => {
  const directedConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: { ...config.graphMapping.edge, direction: "directed" }
    }
  };
  const motif = {
    id: "directed-induced-pair",
    roles: {
      source: { nodeTypes: ["person"] },
      target: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "source", targetRole: "target", edgeType: "knows" }],
    inducedEdgeTypes: ["knows"],
    closedWorld: true
  };
  const nodes = [
    { id: "a", label: "A", kind: "person" },
    { id: "b", label: "B", kind: "person" }
  ];
  const runGraph = async (edges) => {
    const graph = normalizeGraphData({ nodes, edges }, directedConfig);
    const facts = buildAspFactsFromGraph(graph);
    const compiled = buildTypedMotifProgram(motif, graph.direction);
    const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
    return { result, compiled, facts };
  };

  const scopedOutReverse = await runGraph([
    { id: "ab", from: "a", to: "b", kind: "knows" },
    { id: "ba-advises", from: "b", to: "a", kind: "advises" }
  ]);
  assert.equal(scopedOutReverse.result.Result, "SATISFIABLE");
  const scopedMatches = parseTypedMotifMatches(
    scopedOutReverse.result.Call?.[0]?.Witnesses,
    scopedOutReverse.compiled,
    scopedOutReverse.facts.reverseIndex,
    scopedOutReverse.facts.reverseSourceIndex,
    scopedOutReverse.facts.reverseEdgeIndex
  );
  assert.ok(scopedMatches.some((match) => match.roles.source.sourceId === "a" && match.roles.target.sourceId === "b"));

  const forbiddenReverse = await runGraph([
    { id: "ab", from: "a", to: "b", kind: "knows" },
    { id: "ba", from: "b", to: "a", kind: "knows" }
  ]);
  assert.equal(forbiddenReverse.result.Result, "UNSATISFIABLE");
  const nearProgram = buildTypedMotifNearMatchProgram(motif, "directed");
  const nearResult = await (await createClingoWasmRunner()).run(
    `${forbiddenReverse.facts.facts}\n${nearProgram.program}`,
    ["--opt-mode=opt"]
  );
  const nearMatches = parseTypedMotifNearMatches(
    nearResult.Call?.[0]?.Witnesses,
    nearProgram,
    forbiddenReverse.facts.reverseIndex,
    forbiddenReverse.facts.reverseSourceIndex,
    forbiddenReverse.facts.reverseEdgeIndex
  );
  const aToBWhyNot = nearMatches.find((match) =>
    match.roles.source?.sourceId === "a" && match.roles.target?.sourceId === "b"
  );
  assert.ok(aToBWhyNot);
  assert.deepEqual(aToBWhyNot.violatedAbsencePatterns.map((pattern) => pattern.edgeIds), [["ba"]]);

  const forbiddenLoop = await runGraph([
    { id: "ab", from: "a", to: "b", kind: "knows" },
    { id: "aa", from: "a", to: "a", kind: "knows" }
  ]);
  assert.equal(forbiddenLoop.result.Result, "UNSATISFIABLE");
});

test("inducedEdgeTypes richiede ambito chiuso statico e tipi univoci validi", () => {
  const roles = {
    left: { nodeTypes: ["person"] },
    right: { nodeTypes: ["person"] }
  };
  const edges = [{ sourceRole: "left", targetRole: "right", edgeType: "knows" }];
  assert.throws(() => buildTypedMotifProgram({ id: "implicit", roles, edges, inducedEdgeTypes: ["knows"] }, "undirected"), /closedWorld: true/);
  assert.throws(() => buildTypedMotifProgram({ id: "empty", roles, edges, inducedEdgeTypes: [], closedWorld: true }, "undirected"), /array non vuoto/);
  assert.throws(() => buildTypedMotifProgram({ id: "duplicate", roles, edges, inducedEdgeTypes: ["knows", " knows "], closedWorld: true }, "undirected"), /duplicati/);
  assert.throws(() => buildTypedMotifProgram({
    id: "temporal", roles, edges, inducedEdgeTypes: ["knows"], closedWorld: true,
    temporal: { semantics: "coValid" }
  }, "undirected"), /template temporali/);
});

test("le assenze dei motivi diretti rispettano il verso e il why-not mostra relazioni proibite", async () => {
  const directedConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: { ...config.graphMapping.edge, direction: "directed" }
    }
  };
  const nodes = ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" }));
  const motif = {
    id: "directed-open-triad",
    roles: {
      source: { nodeTypes: ["person"] },
      middle: { nodeTypes: ["person"] },
      target: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "source", targetRole: "middle", edgeType: "knows" },
      { sourceRole: "middle", targetRole: "target", edgeType: "knows" }
    ],
    absentEdges: [{ sourceRole: "source", targetRole: "target", edgeType: "knows" }],
    closedWorld: true
  };
  const graph = normalizeGraphData({
    nodes,
    edges: [
      { id: "ab", from: "a", to: "b", kind: "knows" },
      { id: "bc", from: "b", to: "c", kind: "knows" },
      { id: "ca", from: "c", to: "a", kind: "knows" }
    ]
  }, directedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram(motif, graph.direction);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(matches.some((match) =>
    match.roles.source.sourceId === "a" && match.roles.middle.sourceId === "b" && match.roles.target.sourceId === "c"
  ), "l'arco inverso c→a non deve violare l'assenza richiesta a→c");
  const directedCount = buildTypedMotifCountProgram(motif, graph.direction);
  const directedCountResult = await (await createClingoWasmRunner()).run(`${facts.facts}\n${directedCount.program}`, [], 1);
  assert.equal(directedCountResult.Result, "SATISFIABLE", directedCountResult.Error ?? JSON.stringify(directedCountResult));
  assert.equal(parseTypedMotifCount(directedCountResult.Call?.[0]?.Witnesses), String(matches.length),
    "il conteggio diretto conserva verso e vincoli di assenza");

  const nearTemplate = {
    ...pathWithoutShortcutForNearMatch(),
    id: "forbidden-triangle"
  };
  const triangle = normalizeGraphData({
    nodes,
    edges: [
      { id: "ab", from: "a", to: "b", kind: "knows" },
      { id: "ac", from: "a", to: "c", kind: "knows" },
      { id: "bc", from: "b", to: "c", kind: "knows" }
    ]
  }, config);
  const triangleFacts = buildAspFactsFromGraph(triangle);
  const nearProgram = buildTypedMotifNearMatchProgram(nearTemplate, triangle.direction);
  const nearResult = await (await createClingoWasmRunner()).run(
    `${triangleFacts.facts}\n${nearProgram.program}`,
    ["--opt-mode=opt"]
  );
  const nearMatches = parseTypedMotifNearMatches(
    nearResult.Call?.[0]?.Witnesses,
    nearProgram,
    triangleFacts.reverseIndex,
    triangleFacts.reverseSourceIndex,
    triangleFacts.reverseEdgeIndex
  );
  assert.equal(nearResult.Result, "OPTIMUM FOUND");
  assert.ok(nearMatches.length > 0);
  assert.ok(nearMatches.every((match) => match.missingPatterns.length === 0));
  assert.ok(nearMatches.every((match) => match.violatedAbsencePatterns.length === 1));
  assert.ok(nearMatches.every((match) => match.violatedAbsencePatterns[0].edgeIds.length === 1));
  for (const match of nearMatches) {
    const expectedForbiddenEdgeId = [match.roles.left.sourceId, match.roles.right.sourceId].sort().join("");
    assert.deepEqual(match.violatedAbsencePatterns[0].edgeIds, [expectedForbiddenEdgeId]);
  }
});

test("i template con assenze rifiutano ipotesi implicite, conflitti, simmetrie false e tempo non definito", () => {
  const roles = {
    left: { nodeTypes: ["person"] },
    center: { nodeTypes: ["person"] },
    right: { nodeTypes: ["person"] }
  };
  const edges = [
    { sourceRole: "left", targetRole: "center", edgeType: "knows" },
    { sourceRole: "center", targetRole: "right", edgeType: "knows" }
  ];
  const absentEdges = [{ sourceRole: "left", targetRole: "right", edgeType: "knows" }];
  assert.throws(() => buildTypedMotifProgram({ id: "implicit", roles, edges, absentEdges }, "undirected"), /closedWorld: true/);
  assert.throws(() => buildTypedMotifProgram({ id: "empty", roles, edges, closedWorld: true }, "undirected"), /richiede almeno una relazione/);
  assert.throws(() => buildTypedMotifProgram({
    id: "unknown-role", roles, edges, closedWorld: true,
    absentEdges: [{ sourceRole: "left", targetRole: "missing", edgeType: "knows" }]
  }, "undirected"), /ruolo non dichiarato/);
  assert.throws(() => buildTypedMotifProgram({
    id: "conflict", roles, edges, closedWorld: true,
    absentEdges: [{ sourceRole: "left", targetRole: "center", edgeType: "knows" }]
  }, "undirected"), /presente e assente/);
  assert.throws(() => buildTypedMotifProgram({
    id: "temporal", roles, edges, closedWorld: true, absentEdges,
    temporal: { semantics: "coValid" }
  }, "undirected"), /template temporali/);
  assert.throws(() => buildTypedMotifProgram({
    id: "false-symmetry",
    roles: { left: roles.left, right: roles.center, third: roles.right },
    edges: [{ sourceRole: "left", targetRole: "third", edgeType: "knows" }],
    absentEdges: [{ sourceRole: "right", targetRole: "third", edgeType: "knows" }],
    closedWorld: true,
    symmetricRoles: [["left", "right"]]
  }, "directed"), /non sono simmetrici/);
});

test("il controfattuale di completamento non seleziona archi che violano l'induzione tipizzata", async () => {
  const directedConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: { ...config.graphMapping.edge, direction: "directed" }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "s", label: "S", kind: "source" },
      { id: "m", label: "M", kind: "middle" },
      { id: "t", label: "T", kind: "target" }
    ],
    edges: [{ id: "observed-sm", from: "s", to: "m", kind: "knows" }]
  }, directedConfig);
  const motif = {
    id: "safe-completion",
    roles: {
      source: { nodeTypes: ["source"] },
      middle: { nodeTypes: ["middle"] },
      target: { nodeTypes: ["target"] }
    },
    edges: [
      { sourceRole: "source", targetRole: "middle", edgeType: "knows" },
      { sourceRole: "middle", targetRole: "target", edgeType: "knows" }
    ],
    inducedEdgeTypes: ["knows"],
    closedWorld: true
  };
  const facts = buildAspFactsFromGraph(graph);
  const aspIndexBySourceId = Object.fromEntries(Object.entries(facts.reverseSourceIndex).map(([index, sourceId]) => [sourceId, Number(index)]));
  const compiled = buildTypedMotifCompletionCounterfactualProgram(motif, graph.direction, "", [
    { id: "candidate-mt", sourceNodeId: "m", targetNodeId: "t", sourceNode: aspIndexBySourceId.m, targetNode: aspIndexBySourceId.t, edgeType: "knows", cost: 2, recordIndex: 2 },
    { id: "candidate-st", sourceNodeId: "s", targetNodeId: "t", sourceNode: aspIndexBySourceId.s, targetNode: aspIndexBySourceId.t, edgeType: "knows", cost: 1, recordIndex: 3 }
  ]);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  const proposals = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0].addedEdges.map((edge) => edge.id), ["candidate-mt"]);
  assert.deepEqual(proposals[0].match.inducedEdgeTypes, ["knows"]);
  assert.ok(proposals[0].match.absenceConditions.some((condition) =>
    condition.sourceRole === "source" && condition.targetRole === "target" && condition.edgeType === "knows"
  ));
});

function pathWithoutShortcutForNearMatch() {
  return {
    roles: {
      left: { nodeTypes: ["person"] },
      center: { nodeTypes: ["person"] },
      right: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "left", targetRole: "center", edgeType: "knows" },
      { sourceRole: "center", targetRole: "right", edgeType: "knows" }
    ],
    absentEdges: [{ sourceRole: "left", targetRole: "right", edgeType: "knows" }],
    closedWorld: true,
    symmetricRoles: [["left", "right"]]
  };
}

test("i motivi diretti rispettano verso degli archi e rifiutano template incoerenti", async () => {
  const directedConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: { ...config.graphMapping.edge, direction: "directed" }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "a", label: "A", kind: "person" },
      { id: "b", label: "B", kind: "person" }
    ],
    edges: [{ id: "a-to-b", from: "a", to: "b", kind: "follows" }]
  }, directedConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = {
    id: "follows",
    roles: {
      follower: { nodeTypes: ["person"] },
      followed: { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "follower", targetRole: "followed", edgeType: "follows" }]
  };
  const compiled = buildTypedMotifProgram(template, graph.direction);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(result.Result, "SATISFIABLE");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].roles.follower.sourceId, "a");
  assert.equal(matches[0].roles.followed.sourceId, "b");

  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    symmetricRoles: [["personA", "place"]]
  }, "undirected"), /stessi tipi di nodo/);

  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    edges: [{ sourceRole: "personA", targetRole: "place", edgeType: "person-place" }]
  }, "undirected"), /non sono simmetrici nella struttura/);

  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    symmetricRoles: [],
    edges: [
      { sourceRole: "personA", targetRole: "place", edgeType: "person-place" },
      { sourceRole: "place", targetRole: "personA", edgeType: "person-place" }
    ]
  }, "undirected"), /relazioni duplicate/);

  assert.throws(() => buildTypedMotifProgram({
    id: "duplicate-normalized-role",
    roles: {
      person: { nodeTypes: ["person"] },
      " person ": { nodeTypes: ["person"] }
    },
    edges: [{ sourceRole: "person", targetRole: " person ", edgeType: "knows" }]
  }, "directed"), /nomi duplicati dopo la normalizzazione/);
});

test("il why-not dei motivi distingue il ruolo senza candidato dalle relazioni non valutabili", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p", label: "P", kind: "person" },
      { id: "place", label: "Place", kind: "place" }
    ],
    edges: [{ id: "p-place", from: "p", to: "place", kind: "person-place" }]
  }, config);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifNearMatchProgram(sharedPlaceMotif, graph.direction);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error);
  const [nearMatch] = parseTypedMotifNearMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(nearMatch);
  assert.equal(Object.keys(nearMatch.roles).length, 2);
  assert.deepEqual(nearMatch.missingRoles, ["personB"], "ruoli simmetrici parziali usano un prefisso canonico");
  assert.equal(nearMatch.missingPatterns.length, 0);
  assert.equal(nearMatch.unresolvedPatterns.length, 1);
  assert.equal(nearMatch.supportingEdges.filter((edge) => edge.edgeIds.length > 0).length, 1);
});

test("i motivi temporali richiedono intervalli co-validi e restituiscono il primo istante comune", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place-x", label: "Istituto X", kind: "place" },
      { id: "place-y", label: "Istituto Y", kind: "place" }
    ],
    edges: [
      { id: "a-x-1", from: "p-1", to: "place-x", kind: "person-place", fromYear: 2000, toYear: 2003 },
      { id: "a-x-2", from: "p-1", to: "place-x", kind: "person-place", fromYear: 2001, toYear: 2004 },
      { id: "b-x", from: "p-2", to: "place-x", kind: "person-place", fromYear: 2003, toYear: 2008 },
      { id: "a-y", from: "p-1", to: "place-y", kind: "person-place", fromYear: 2000, toYear: 2001 },
      { id: "b-y", from: "p-2", to: "place-y", kind: "person-place", fromYear: 2002, toYear: 2005 }
    ]
  }, temporalConfig);
  assert.equal(graph.capabilities.edgeIntervals.available, true);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram({
    ...sharedPlaceMotif,
    temporal: { semantics: "coValid" }
  }, graph.direction);
  assert.equal(compiled.temporal, true);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  const matches = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].roles.place.sourceId, "place-x");
  assert.equal(matches[0].timeValue, 2003);
  assert.deepEqual(matches[0].supportingEdges.map((edge) => edge.edgeIds).flat().sort(), ["a-x-1", "a-x-2", "b-x"]);
  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    temporal: { semantics: "eventOrder" }
  }, "undirected"), /semantics deve essere/);
});

test("i motivi orderedByStart ordinano gli inizi di validità e conservano ogni combinazione di archi testimoni", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "actor-1", label: "Ada", kind: "actor" },
      { id: "context-1", label: "Istituto X", kind: "context" },
      { id: "place-1", label: "Progetto Y", kind: "place" }
    ],
    edges: [
      { id: "actor-early", from: "actor-1", to: "place-1", kind: "actor-place", fromYear: 2000, toYear: 2010 },
      { id: "actor-equal", from: "actor-1", to: "place-1", kind: "actor-place", fromYear: 2002, toYear: 2010 },
      { id: "actor-late", from: "actor-1", to: "place-1", kind: "actor-place", fromYear: 2003, toYear: 2010 },
      { id: "context-mid", from: "context-1", to: "place-1", kind: "context-place", fromYear: 2002, toYear: 2010 }
    ]
  }, temporalConfig);
  assert.equal(graph.capabilities.edgeIntervals.available, true);
  const facts = buildAspFactsFromGraph(graph);
  const motif = {
    id: "ordered-context",
    roles: {
      actor: { nodeTypes: ["actor"] },
      context: { nodeTypes: ["context"] },
      place: { nodeTypes: ["place"] }
    },
    edges: [
      { sourceRole: "actor", targetRole: "place", edgeType: "actor-place" },
      { sourceRole: "context", targetRole: "place", edgeType: "context-place" }
    ],
    temporal: { semantics: "orderedByStart" }
  };
  const runner = await createClingoWasmRunner();
  const runAndParse = async (template) => {
    const compiled = buildTypedMotifProgram(template, graph.direction);
    const result = await runner.run(`${facts.facts}\n${compiled.program}`);
    assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
    return parseTypedMotifMatches(
      result.Call?.[0]?.Witnesses,
      compiled,
      facts.reverseIndex,
      facts.reverseSourceIndex,
      facts.reverseEdgeIndex
    );
  };

  const nonStrict = await runAndParse(motif);
  assert.equal(nonStrict.length, 2);
  assert.deepEqual(nonStrict.map((match) => {
    const first = match.supportingEdges[0];
    const second = match.supportingEdges[1];
    return [first.edgeIds[0], first.startTimeValue, second.edgeIds[0], second.startTimeValue];
  }).sort((left, right) => left[0].localeCompare(right[0])), [
    ["actor-early", 2000, "context-mid", 2002],
    ["actor-equal", 2002, "context-mid", 2002]
  ]);

  const strict = await runAndParse({
    ...motif,
    temporal: { semantics: "orderedByStart", strict: true }
  });
  assert.equal(strict.length, 1);
  assert.equal(strict[0].supportingEdges[0].edgeIds[0], "actor-early");
  assert.throws(() => buildTypedMotifProgram({
    ...motif,
    temporal: { semantics: "orderedByStart", strict: "yes" }
  }, "undirected"), /strict deve essere un booleano/);
  assert.throws(() => buildTypedMotifProgram({
    ...sharedPlaceMotif,
    temporal: { semantics: "orderedByStart" }
  }, "undirected"), /non sono simmetrici nella struttura/);
});

test("orderedByStart esclude sequenze invertite e il modo stretto esclude inizi uguali", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const makeGraph = (actorStart, contextStart) => normalizeGraphData({
    nodes: [
      { id: "actor-1", label: "Ada", kind: "actor" },
      { id: "context-1", label: "Istituto X", kind: "context" },
      { id: "place-1", label: "Progetto Y", kind: "place" }
    ],
    edges: [
      { id: "actor-event", from: "actor-1", to: "place-1", kind: "actor-place", fromYear: actorStart, toYear: 2010 },
      { id: "context-event", from: "context-1", to: "place-1", kind: "context-place", fromYear: contextStart, toYear: 2010 }
    ]
  }, temporalConfig);
  const motif = {
    id: "strict-order",
    roles: {
      actor: { nodeTypes: ["actor"] },
      context: { nodeTypes: ["context"] },
      place: { nodeTypes: ["place"] }
    },
    edges: [
      { sourceRole: "actor", targetRole: "place", edgeType: "actor-place" },
      { sourceRole: "context", targetRole: "place", edgeType: "context-place" }
    ],
    temporal: { semantics: "orderedByStart", strict: true }
  };
  const runner = await createClingoWasmRunner();
  const reversedGraph = makeGraph(2003, 2002);
  const reversedFacts = buildAspFactsFromGraph(reversedGraph);
  const nonStrictProgram = buildTypedMotifProgram({
    ...motif,
    temporal: { semantics: "orderedByStart" }
  }, reversedGraph.direction);
  const reversedResult = await runner.run(`${reversedFacts.facts}\n${nonStrictProgram.program}`);
  assert.equal(reversedResult.Result, "UNSATISFIABLE", reversedResult.Error ?? JSON.stringify(reversedResult));

  const equalGraph = makeGraph(2002, 2002);
  const equalFacts = buildAspFactsFromGraph(equalGraph);
  const strictProgram = buildTypedMotifProgram(motif, equalGraph.direction);
  const equalResult = await runner.run(`${equalFacts.facts}\n${strictProgram.program}`);
  assert.equal(equalResult.Result, "UNSATISFIABLE", equalResult.Error ?? JSON.stringify(equalResult));
});

test("il why-not coValid sceglie il tempo che attiva più pattern e distingue quelli senza intervalli", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto", kind: "place" }
    ],
    edges: [
      { id: "a-place", from: "p-1", to: "place", kind: "person-place", fromYear: 1, toYear: 2 },
      { id: "b-place", from: "p-2", to: "place", kind: "person-place" }
    ]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = { ...sharedPlaceMotif, temporal: { semantics: "coValid" } };
  const compiled = buildTypedMotifTemporalNearMatchProgram(template, graph.direction);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [nearMatch] = parseTypedMotifNearMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(nearMatch);
  assert.equal(nearMatch.missingPatterns.length, 0);
  assert.ok([1, 2].includes(nearMatch.temporalEvidence.timeValue));
  assert.deepEqual(nearMatch.temporalEvidence.unavailablePatterns.map((pattern) => pattern.index), [2]);
  assert.deepEqual(nearMatch.temporalEvidence.inactivePatterns, []);
  assert.deepEqual(nearMatch.temporalEvidence.supportingEdges[0].edgeIds, ["a-place"]);

  const disjointGraph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto", kind: "place" }
    ],
    edges: [
      { id: "a-place", from: "p-1", to: "place", kind: "person-place", fromYear: 1, toYear: 2 },
      { id: "b-place", from: "p-2", to: "place", kind: "person-place", fromYear: 4, toYear: 5 }
    ]
  }, temporalConfig);
  const disjointFacts = buildAspFactsFromGraph(disjointGraph);
  const disjointResult = await (await createClingoWasmRunner()).run(
    `${disjointFacts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(disjointResult.Result, "OPTIMUM FOUND", disjointResult.Error ?? JSON.stringify(disjointResult));
  const [disjointNearMatch] = parseTypedMotifNearMatches(
    disjointResult.Call?.[0]?.Witnesses,
    compiled,
    disjointFacts.reverseIndex,
    disjointFacts.reverseSourceIndex,
    disjointFacts.reverseEdgeIndex
  );
  assert.ok(disjointNearMatch);
  assert.deepEqual(disjointNearMatch.temporalEvidence.unavailablePatterns, []);
  assert.equal(disjointNearMatch.temporalEvidence.inactivePatterns.length, 1);
  assert.ok([1, 2, 4, 5].includes(disjointNearMatch.temporalEvidence.timeValue));
  assert.equal(disjointNearMatch.temporalEvidence.supportingEdges.filter((edge) => edge.edgeIds.length > 0).length, 1);
});

test("il why-not orderedByStart restituisce record selezionati e inversioni consecutive", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        direction: "directed",
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id, kind: "person" })),
    edges: [
      { id: "ab", from: "a", to: "b", kind: "r1", fromYear: 5, toYear: 8 },
      { id: "bc", from: "b", to: "c", kind: "r2", fromYear: 3, toYear: 8 },
      { id: "cd", from: "c", to: "d", kind: "r3", fromYear: 3, toYear: 8 }
    ]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = {
    id: "ordered-chain",
    temporal: { semantics: "orderedByStart" },
    roles: Object.fromEntries(["a", "b", "c", "d"].map((role) => [role, { nodeTypes: ["person"] }])),
    edges: [
      { sourceRole: "a", targetRole: "b", edgeType: "r1" },
      { sourceRole: "b", targetRole: "c", edgeType: "r2" },
      { sourceRole: "c", targetRole: "d", edgeType: "r3" }
    ]
  };
  const compiled = buildTypedMotifTemporalNearMatchProgram(template, graph.direction);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND");
  const [nearMatch] = parseTypedMotifNearMatches(
    result.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(nearMatch);
  assert.equal(nearMatch.missingPatterns.length, 0);
  assert.deepEqual(nearMatch.temporalEvidence.unavailablePatterns, []);
  assert.deepEqual(nearMatch.temporalEvidence.orderViolations, [{ firstIndex: 1, secondIndex: 2 }]);
  assert.deepEqual(nearMatch.temporalEvidence.supportingEdges.map((edge) => edge.edgeIds), [["ab"], ["bc"], ["cd"]]);
  assert.deepEqual(nearMatch.temporalEvidence.supportingEdges.map((edge) => edge.startTimeValue), [5, 3, 3]);
  const selectedWitnesses = result.Call?.[0]?.Witnesses ?? [];
  const duplicateNearMatches = parseTypedMotifNearMatches(
    [...selectedWitnesses, ...selectedWitnesses],
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.equal(duplicateNearMatches.length, 1, "un witness ASP ripetuto non duplica la diagnosi mostrata");

  const parallelGraph = normalizeGraphData({
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, label: id, kind: "person" })),
    edges: [
      { id: "ab", from: "a", to: "b", kind: "r1", fromYear: 5, toYear: 8 },
      { id: "ab-alt", from: "a", to: "b", kind: "r1", fromYear: 5, toYear: 8 },
      { id: "bc", from: "b", to: "c", kind: "r2", fromYear: 3, toYear: 8 },
      { id: "cd", from: "c", to: "d", kind: "r3", fromYear: 3, toYear: 8 }
    ]
  }, temporalConfig);
  const parallelFacts = buildAspFactsFromGraph(parallelGraph);
  const parallelCompiled = buildTypedMotifTemporalNearMatchProgram(template, parallelGraph.direction);
  const parallelResult = await (await createClingoWasmRunner()).run(
    `${parallelFacts.facts}\n${parallelCompiled.program}`,
    ["--opt-mode=optN"]
  );
  assert.equal(parallelResult.Result, "OPTIMUM FOUND");
  assert.equal(parallelResult.Models?.More, "no");
  const parallelNearMatches = parseTypedMotifNearMatches(
    parallelResult.Call?.[0]?.Witnesses,
    parallelCompiled,
    parallelFacts.reverseIndex,
    parallelFacts.reverseSourceIndex,
    parallelFacts.reverseEdgeIndex
  );
  assert.equal(parallelNearMatches.length, 2, "due support paralleli distinti restano due near-match");
  assert.deepEqual(
    parallelNearMatches.map((match) => match.temporalEvidence.supportingEdges[0].edgeIds).sort((left, right) => left[0].localeCompare(right[0])),
    [["ab"], ["ab-alt"]]
  );

  const strictTemplate = { ...template, temporal: { semantics: "orderedByStart", strict: true } };
  const strictCompiled = buildTypedMotifTemporalNearMatchProgram(strictTemplate, graph.direction);
  const strictResult = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${strictCompiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(strictResult.Result, "OPTIMUM FOUND", strictResult.Error ?? JSON.stringify(strictResult));
  const [strictNearMatch] = parseTypedMotifNearMatches(
    strictResult.Call?.[0]?.Witnesses,
    strictCompiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(strictNearMatch);
  assert.deepEqual(strictNearMatch.temporalEvidence.orderViolations, [
    { firstIndex: 1, secondIndex: 2 },
    { firstIndex: 2, secondIndex: 3 }
  ]);
});

test("orderedByStart e coValid rispettano le finestre osservate del dataset SocioPatterns InVS", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/sociopatterns-invs13-temporal-chain.json", import.meta.url),
    "utf8"
  ));
  const graph = normalizeGraphData(fixture.data, fixture.config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(graph.direction, "undirected");
  assert.equal(graph.capabilities.edgeIntervals.available, true);

  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifProgram(fixture.template, graph.direction);
  const runner = await createClingoWasmRunner();
  const orderedResult = await runner.run(`${facts.facts}\n${compiled.program}`);
  assert.equal(orderedResult.Result, "SATISFIABLE", orderedResult.Error ?? JSON.stringify(orderedResult));
  assert.equal(orderedResult.Models?.More, "no", "tutte le istanze temporali del fixture sono state enumerate");
  const matches = parseTypedMotifMatches(
    orderedResult.Call?.[0]?.Witnesses,
    compiled,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    new Set(),
    facts.temporalEncoding.decode
  );
  assert.equal(matches.length, 1);
  assert.deepEqual(Object.fromEntries(Object.entries(matches[0].roles)
    .map(([role, node]) => [role, node.sourceId])), fixture.expected.roles);
  assert.deepEqual(matches[0].supportingEdges.map((edge) => edge.edgeIds[0]), fixture.expected.edgeIds);
  assert.deepEqual(matches[0].supportingEdges.map((edge) => edge.startTimeValue), fixture.expected.startTimes);
  const orderedCount = buildTypedMotifCountProgram(fixture.template, graph.direction);
  const orderedCountResult = await runner.run(`${facts.facts}\n${orderedCount.program}`, [], 1);
  assert.equal(orderedCountResult.Result, "SATISFIABLE", orderedCountResult.Error ?? JSON.stringify(orderedCountResult));
  assert.equal(parseTypedMotifCount(orderedCountResult.Call?.[0]?.Witnesses), "1",
    "il conteggio ordinato conta esattamente le combinazioni dei record scelti");
  let partitionedByFirstEdgeCount = 0n;
  for (const edgeIndex of Object.keys(facts.reverseEdgeIndex).map(Number)) {
    const edgePartition = buildTypedMotifCountProgram(fixture.template, graph.direction, "", {
      firstPatternEdgeIndexes: [edgeIndex]
    });
    const edgePartitionResult = await runner.run(`${facts.facts}\n${edgePartition.program}`, [], 1);
    assert.equal(edgePartitionResult.Result, "SATISFIABLE", edgePartitionResult.Error ?? JSON.stringify(edgePartitionResult));
    assert.equal(edgePartitionResult.Models?.More, "no");
    const edgePartitionCount = parseTypedMotifCount(edgePartitionResult.Call?.[0]?.Witnesses);
    assert.ok(edgePartitionCount !== undefined);
    partitionedByFirstEdgeCount += BigInt(edgePartitionCount);
  }
  assert.equal(partitionedByFirstEdgeCount, 1n,
    "le partizioni singleton per record del primo pattern sono disgiunte e ricompongono il totale");

  let partitionedByBatchCount = 0n;
  const firstEdgePlan = createTypedMotifCountPartitionPlan(Object.keys(facts.reverseEdgeIndex).length, 2);
  assert.equal(firstEdgePlan.length, 2);
  for (const firstPatternEdgeIndexes of firstEdgePlan) {
    const batch = buildTypedMotifCountProgram(fixture.template, graph.direction, "", {
      firstPatternEdgeIndexes
    });
    const batchResult = await runner.run(`${facts.facts}\n${batch.program}`, [], 1);
    assert.equal(batchResult.Result, "SATISFIABLE", batchResult.Error ?? JSON.stringify(batchResult));
    assert.equal(batchResult.Models?.More, "no");
    const batchCount = parseTypedMotifCount(batchResult.Call?.[0]?.Witnesses);
    assert.ok(batchCount !== undefined);
    partitionedByBatchCount += BigInt(batchCount);
  }
  assert.equal(partitionedByBatchCount, BigInt(parseTypedMotifCount(orderedCountResult.Call?.[0]?.Witnesses)),
    "le partizioni a blocchi di archi ricompongono il conteggio aggregato ASP senza sovrapporsi");

  const tiedStartFixture = {
    ...fixture.data,
    edges: [...fixture.data.edges, { ...fixture.data.edges[0], id: "invs13-row-6-same-start" }]
  };
  const tiedStartGraph = normalizeGraphData(tiedStartFixture, fixture.config);
  const tiedStartFacts = buildAspFactsFromGraph(tiedStartGraph);
  const tiedStartCount = buildTypedMotifCountProgram(fixture.template, tiedStartGraph.direction);
  const tiedStartResult = await runner.run(`${tiedStartFacts.facts}\n${tiedStartCount.program}`, [], 1);
  assert.equal(tiedStartResult.Result, "SATISFIABLE", tiedStartResult.Error ?? JSON.stringify(tiedStartResult));
  const tiedStartExpectedCount = parseTypedMotifCount(tiedStartResult.Call?.[0]?.Witnesses);
  assert.equal(tiedStartExpectedCount, "2", "due record iniziali simultanei contano due sequenze temporali distinte");
  const startValues = [...new Set(tiedStartFixture.edges
    .map((edge) => tiedStartFacts.temporalEncoding.encode(edge.validFrom))
    .filter((value) => value !== null))].sort((left, right) => left - right);
  assert.deepEqual(startValues, [30_000, 30_040, 30_500]);
  let partitionedByStartValueCount = 0n;
  for (const firstPatternStartValues of startValues.map((value) => [value])) {
    const partition = buildTypedMotifCountProgram(fixture.template, tiedStartGraph.direction, "", {
      temporalEncoding: tiedStartFacts.temporalEncoding,
      firstPatternStartValues
    });
    const partitionResult = await runner.run(`${tiedStartFacts.facts}\n${partition.program}`, [], 1);
    assert.equal(partitionResult.Result, "SATISFIABLE", partitionResult.Error ?? JSON.stringify(partitionResult));
    assert.equal(partitionResult.Models?.More, "no");
    const partitionCount = parseTypedMotifCount(partitionResult.Call?.[0]?.Witnesses);
    assert.ok(partitionCount !== undefined);
    partitionedByStartValueCount += BigInt(partitionCount);
  }
  assert.equal(partitionedByStartValueCount, BigInt(tiedStartExpectedCount),
    "la partizione per tempo iniziale conserva insieme tutti i record a pari tempo e ricompone il totale ASP");

  const coValidTemplate = { ...fixture.template, temporal: { semantics: "coValid" } };
  const coValidCompiled = buildTypedMotifProgram(coValidTemplate, graph.direction);
  const coValidResult = await runner.run(`${facts.facts}\n${coValidCompiled.program}`);
  assert.equal(coValidResult.Result, "UNSATISFIABLE",
    "gli tre intervalli osservati non hanno un istante comune, pur essendo ordinabili per inizio");
  const coValidCount = buildTypedMotifCountProgram(coValidTemplate, graph.direction);
  const coValidCountResult = await runner.run(`${facts.facts}\n${coValidCount.program}`, [], 1);
  assert.equal(coValidCountResult.Result, "SATISFIABLE", coValidCountResult.Error ?? JSON.stringify(coValidCountResult));
  assert.equal(parseTypedMotifCount(coValidCountResult.Call?.[0]?.Witnesses), "0",
    "il conteggio co-valid richiede un istante comune effettivo");
});

test("maximumSpan è esatto in enumerazione, aggregato, why-not e controfattuali temporali", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/sociopatterns-invs13-temporal-chain.json", import.meta.url),
    "utf8"
  ));
  const runner = await createClingoWasmRunner();
  const template = {
    ...fixture.template,
    temporal: { semantics: "orderedByStart", strict: true, maximumSpan: { value: 500, unit: "seconds" } }
  };
  const overLimitTemplate = {
    ...template,
    temporal: { ...template.temporal, maximumSpan: { value: 499, unit: "seconds" } }
  };
  const exactGraph = normalizeGraphData(fixture.data, fixture.config);
  assert.equal(exactGraph.temporalNumericUnit, "seconds");
  const exactFacts = buildAspFactsFromGraph(exactGraph, undefined, { temporalMetricUnits: ["seconds"] });
  const ambiguousFacts = buildAspFactsFromGraph({ ...exactGraph, temporalNumericUnit: undefined });
  assert.throws(() => buildTypedMotifProgram(
    template, exactGraph.direction, "", false, false, ambiguousFacts.temporalEncoding
  ), /validity.numericUnit/);
  const exactProgram = buildTypedMotifProgram(template, exactGraph.direction, "", false, false, exactFacts.temporalEncoding);
  const exactResult = await runner.run(`${exactFacts.facts}\n${exactProgram.program}`);
  assert.equal(exactResult.Result, "SATISFIABLE", exactResult.Error ?? JSON.stringify(exactResult));
  const exactMatches = parseTypedMotifMatches(
    exactResult.Call?.[0]?.Witnesses,
    exactProgram,
    exactFacts.reverseIndex,
    exactFacts.reverseSourceIndex,
    exactFacts.reverseEdgeIndex,
    new Set(),
    exactFacts.temporalEncoding.decode
  );
  assert.equal(exactMatches.length, 1, "il confine massimo è inclusivo");
  assert.deepEqual(exactMatches[0].maximumSpan, { value: 500, unit: "seconds" });

  const exactCountProgram = buildTypedMotifCountProgram(template, exactGraph.direction, "", {
    temporalEncoding: exactFacts.temporalEncoding
  });
  const exactCountResult = await runner.run(`${exactFacts.facts}\n${exactCountProgram.program}`, [], 1);
  assert.equal(parseTypedMotifCount(exactCountResult.Call?.[0]?.Witnesses), "1");

  const isoData = structuredClone(fixture.data);
  for (const edge of isoData.edges) {
    edge.validFrom = new Date(edge.validFrom * 1_000).toISOString();
    edge.validTo = new Date(edge.validTo * 1_000).toISOString();
  }
  const isoGraph = normalizeGraphData(isoData, fixture.config);
  const isoFacts = buildAspFactsFromGraph(isoGraph, undefined, { temporalMetricUnits: ["seconds"] });
  const isoProgram = buildTypedMotifProgram(template, isoGraph.direction, "", false, false, isoFacts.temporalEncoding);
  const isoResult = await runner.run(`${isoFacts.facts}\n${isoProgram.program}`);
  assert.equal(isoResult.Result, "SATISFIABLE", isoResult.Error ?? JSON.stringify(isoResult));
  const isoCountProgram = buildTypedMotifCountProgram(template, isoGraph.direction, "", {
    temporalEncoding: isoFacts.temporalEncoding
  });
  const isoCountResult = await runner.run(`${isoFacts.facts}\n${isoCountProgram.program}`, [], 1);
  assert.equal(parseTypedMotifCount(isoCountResult.Call?.[0]?.Witnesses), "1");

  const fractionalIsoData = structuredClone(isoData);
  fractionalIsoData.edges[2].validFrom = new Date(Date.parse(fractionalIsoData.edges[2].validFrom) + 500).toISOString();
  fractionalIsoData.edges[2].validTo = new Date(Date.parse(fractionalIsoData.edges[2].validTo) + 500).toISOString();
  const fractionalIsoGraph = normalizeGraphData(fractionalIsoData, fixture.config);
  const fractionalIsoFacts = buildAspFactsFromGraph(fractionalIsoGraph);
  assert.equal(fractionalIsoFacts.temporalEncoding.metricAvailable("seconds"), false,
    "mezzi secondi non vengono arrotondati quando il template richiede secondi interi");
  assert.throws(() => buildTypedMotifProgram(
    template, fractionalIsoGraph.direction, "", false, false, fractionalIsoFacts.temporalEncoding
  ), /non sono rappresentabili esattamente/);

  const overLimitResult = await runner.run(`${exactFacts.facts}\n${buildTypedMotifProgram(
    overLimitTemplate, exactGraph.direction, "", false, false, exactFacts.temporalEncoding
  ).program}`);
  assert.equal(overLimitResult.Result, "UNSATISFIABLE", "499 secondi esclude una catena lunga esattamente 500");
  const overLimitCount = buildTypedMotifCountProgram(overLimitTemplate, exactGraph.direction, "", {
    temporalEncoding: exactFacts.temporalEncoding
  });
  const overLimitCountResult = await runner.run(`${exactFacts.facts}\n${overLimitCount.program}`, [], 1);
  assert.equal(parseTypedMotifCount(overLimitCountResult.Call?.[0]?.Witnesses), "0");

  const incompleteGraph = normalizeGraphData({
    ...fixture.data,
    edges: fixture.data.edges.slice(0, 2)
  }, fixture.config);
  const candidateStart = 30_500;
  const candidateEnd = 30_520;
  const candidateValues = [candidateStart, candidateEnd];
  const incompleteFacts = buildAspFactsFromGraph(incompleteGraph, undefined, {
    additionalTemporalValues: candidateValues,
    temporalMetricUnits: ["seconds"]
  });
  const candidate = {
    id: "hypothetical-last-contact",
    sourceNodeId: "153",
    targetNodeId: "205",
    sourceNode: incompleteFacts.indexByNodeId.get("153"),
    targetNode: incompleteFacts.indexByNodeId.get("205"),
    edgeType: "face-to-face-contact",
    cost: 1,
    recordIndex: 3,
    validity: { from: candidateStart, to: candidateEnd }
  };
  const completion = buildTypedMotifCompletionCounterfactualProgram(
    template,
    incompleteGraph.direction,
    "",
    [candidate],
    incompleteFacts.temporalEncoding
  );
  const completionResult = await runner.run(`${incompleteFacts.facts}\n${completion.program}`, ["--opt-mode=opt"]);
  assert.equal(completionResult.Result, "OPTIMUM FOUND", completionResult.Error ?? JSON.stringify(completionResult));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    completionResult.Call?.[0]?.Witnesses,
    completion.template,
    completion.candidates,
    incompleteFacts.reverseIndex,
    incompleteFacts.reverseSourceIndex,
    incompleteFacts.reverseEdgeIndex,
    incompleteFacts.temporalEncoding.decode
  );
  assert.ok(proposal, "il controfattuale usa la stessa codifica metrica dei record osservati");
  assert.deepEqual(proposal.addedEdges.map((edge) => edge.id), ["hypothetical-last-contact"]);

  const overLimitNearMatch = buildTypedMotifTemporalNearMatchProgram(
    overLimitTemplate, exactGraph.direction, "", exactFacts.temporalEncoding
  );
  const nearMatchResult = await runner.run(`${exactFacts.facts}\n${overLimitNearMatch.program}`, ["--opt-mode=opt"]);
  assert.equal(nearMatchResult.Result, "OPTIMUM FOUND", nearMatchResult.Error ?? JSON.stringify(nearMatchResult));
  const [nearMatch] = parseTypedMotifNearMatches(
    nearMatchResult.Call?.[0]?.Witnesses,
    overLimitNearMatch,
    exactFacts.reverseIndex,
    exactFacts.reverseSourceIndex,
    exactFacts.reverseEdgeIndex,
    exactFacts.temporalEncoding.decode
  );
  assert.ok(nearMatch);
  assert.deepEqual(nearMatch.temporalEvidence.maximumSpan, { value: 499, unit: "seconds" });
  assert.equal(nearMatch.temporalEvidence.spanViolation, true);
});

test("il grafo completo SocioPatterns mantiene gli archi temporali nell'input ASP compatto", async () => {
  const fixture = JSON.parse(await readFile(
    new URL("./fixtures/sociopatterns-invs13-temporal-chain.json", import.meta.url),
    "utf8"
  ));
  const source = await readFile(new URL("./fixtures/sociopatterns-invs13-tij.dat", import.meta.url), "utf8");
  const edges = source.trim().split(/\r?\n/).map((line, index) => {
    const [time, sourceId, targetId] = line.trim().split(/\s+/).map(Number);
    return {
      id: `invs13-row-${index + 1}`,
      source: String(sourceId),
      target: String(targetId),
      kind: "face-to-face-contact",
      validFrom: time - 20,
      validTo: time
    };
  });
  const nodeIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const nodes = [...nodeIds].map((id) => ({ id, kind: "person" }));
  const graph = normalizeGraphData({ nodes, edges }, fixture.config);
  assert.equal(graph.valid, true, JSON.stringify(graph.diagnostics));
  assert.equal(nodes.length, 92);
  assert.equal(graph.links.length, 9_827);
  assert.equal(graph.capabilities.edgeIntervals.available, true);

  const facts = buildAspFactsFromGraph(graph, undefined, { compact: true });
  const pairKeys = new Set();
  for (const edge of edges) {
    pairKeys.add(`${edge.source}:${edge.target}`);
    pairKeys.add(`${edge.target}:${edge.source}`);
  }
  const summaryProgram = [
    "edge_count(N) :- N = #count { E : edge_record(E) }.",
    "edge_id_count(N) :- N = #count { E : edge_id(E,_) }.",
    "edge_type_count(N) :- N = #count { E : edge_type(E,_) }.",
    "interval_count(N) :- N = #count { E : edge_valid_from(E,_), edge_valid_to(E,_) }.",
    "adjacency_count(N) :- N = #count { U,V : edge(U,V) }.",
    "#show edge_count/1.",
    "#show edge_id_count/1.",
    "#show edge_type_count/1.",
    "#show interval_count/1.",
    "#show adjacency_count/1."
  ].join("\n");
  const program = `${facts.facts}\n${summaryProgram}\n`;
  assert.ok(Buffer.byteLength(program) < 1_000_000,
    "l'input resta sotto il limite prudenziale del runner clingo-WASM");

  const runner = await createClingoWasmRunner();
  const result = await runner.run(program, [], 1);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.deepEqual(result.Call?.[0]?.Witnesses?.[0]?.Value?.slice().sort(), [
    `adjacency_count(${pairKeys.size})`,
    "edge_count(9827)",
    "edge_id_count(9827)",
    "edge_type_count(9827)",
    "interval_count(9827)"
  ].sort());

  const window = { from: 28_800, to: 34_800 };
  const windowEdges = edges.filter((edge) => edge.validFrom <= window.to && edge.validTo >= window.from);
  const windowNodeIds = new Set(windowEdges.flatMap((edge) => [edge.source, edge.target]));
  const windowNodes = [...windowNodeIds].map((id) => ({ id, kind: "person" }));
  const windowGraph = normalizeGraphData({ nodes: windowNodes, edges: windowEdges }, fixture.config);
  assert.equal(windowEdges.length, 134);
  assert.equal(windowNodes.length, 45);

  const windowFacts = buildAspFactsFromGraph(windowGraph, undefined, { compact: true });
  const compiled = buildTypedMotifProgram(fixture.template, windowGraph.direction);
  const outgoing = new Map();
  for (const edge of windowEdges) {
    for (const [sourceId, targetId] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const arcs = outgoing.get(sourceId) ?? [];
      arcs.push({ edge, targetId });
      outgoing.set(sourceId, arcs);
    }
  }
  const expected = new Set();
  for (const first of windowEdges) {
    for (const [firstRole, secondRole] of [[first.source, first.target], [first.target, first.source]]) {
      for (const second of outgoing.get(secondRole) ?? []) {
        const thirdRole = second.targetId;
        if (thirdRole === firstRole || first.validFrom >= second.edge.validFrom) continue;
        for (const third of outgoing.get(thirdRole) ?? []) {
          const fourthRole = third.targetId;
          if (fourthRole === firstRole || fourthRole === secondRole ||
            second.edge.validFrom >= third.edge.validFrom) continue;
          expected.add(JSON.stringify([
            [firstRole, secondRole, thirdRole, fourthRole],
            [first.id, second.edge.id, third.edge.id],
            [first.validFrom, second.edge.validFrom, third.edge.validFrom]
          ]));
        }
      }
    }
  }
  assert.equal(expected.size, 2_101, "l'enumerazione indipendente del fixture finestrato è stabile");

  const motifResult = await runner.run(`${windowFacts.facts}\n${compiled.program}`);
  assert.equal(motifResult.Result, "SATISFIABLE", motifResult.Error ?? JSON.stringify(motifResult));
  assert.equal(hasCompleteModelEnumeration(motifResult), true);
  assert.equal(motifResult.Models?.Number, expected.size);
  const matches = parseTypedMotifMatches(
    motifResult.Call?.[0]?.Witnesses,
    compiled,
    windowFacts.reverseIndex,
    windowFacts.reverseSourceIndex,
    windowFacts.reverseEdgeIndex,
    new Set(),
    windowFacts.temporalEncoding.decode
  );
  const actual = new Set(matches.map((match) => JSON.stringify([
    compiled.roles.map((role) => match.roles[role.name]?.sourceId),
    match.supportingEdges.map((edge) => edge.edgeIds[0]),
    match.supportingEdges.map((edge) => edge.startTimeValue)
  ])));
  assert.equal(matches.length, expected.size);
  assert.deepEqual(actual, expected,
    "clingo e enumerazione indipendente concordano su ruoli, record e tempi di ogni catena stretta");

  const countWindow = { from: 28_800, to: 57_600 };
  const countEdges = edges.filter((edge) => edge.validFrom <= countWindow.to && edge.validTo >= countWindow.from);
  const countNodeIds = new Set(countEdges.flatMap((edge) => [edge.source, edge.target]));
  const countGraph = normalizeGraphData({
    nodes: [...countNodeIds].map((id) => ({ id, kind: "person" })),
    edges: countEdges
  }, fixture.config);
  const countFacts = buildAspFactsFromGraph(countGraph, undefined, { compact: true });
  const countProgram = buildTypedMotifCountProgram(fixture.template, countGraph.direction);
  const temporalAdjacency = new Map();
  for (const edge of countEdges) {
    for (const [sourceId, targetId] of [[edge.source, edge.target], [edge.target, edge.source]]) {
      const outgoing = temporalAdjacency.get(sourceId) ?? [];
      outgoing.push({ edge, targetId });
      temporalAdjacency.set(sourceId, outgoing);
    }
  }
  let expectedCount = 0;
  for (const first of countEdges) {
    for (const [firstRole, secondRole] of [[first.source, first.target], [first.target, first.source]]) {
      if (firstRole === secondRole) continue;
      for (const second of temporalAdjacency.get(secondRole) ?? []) {
        if (second.targetId === firstRole || second.targetId === secondRole ||
          first.validFrom >= second.edge.validFrom) continue;
        for (const third of temporalAdjacency.get(second.targetId) ?? []) {
          if (third.targetId === firstRole || third.targetId === secondRole || third.targetId === second.targetId ||
            second.edge.validFrom >= third.edge.validFrom) continue;
          expectedCount += 1;
        }
      }
    }
  }
  assert.equal(countEdges.length, 996);
  assert.equal(countNodeIds.size, 72);
  assert.equal(expectedCount, 342_080, "l'oracolo indipendente conta le catene della proiezione di otto ore");
  const countResult = await runner.run(`${countFacts.facts}\n${countProgram.program}`, ["--stats=2"], 1);
  assert.equal(countResult.Result, "SATISFIABLE", countResult.Error ?? JSON.stringify(countResult));
  assert.equal(countResult.Models?.More, "no");
  assert.equal(countResult.Call?.[0]?.Witnesses?.length, 1,
    "il solver restituisce il solo modello aggregato invece delle centinaia di migliaia di sequenze");
  assert.equal(parseTypedMotifCount(countResult.Call?.[0]?.Witnesses), String(expectedCount));

  const attributedConfig = {
    ...fixture.config,
    graphMapping: {
      ...fixture.config.graphMapping,
      node: { ...fixture.config.graphMapping.node, attributes: { participant: "$.id" } }
    }
  };
  const attributedGraph = normalizeGraphData({
    nodes: [...nodeIds].map((id) => ({ id, kind: "person" })),
    edges
  }, attributedConfig);
  assert.equal(attributedGraph.valid, true, JSON.stringify(attributedGraph.diagnostics));
  const attributedFacts = buildAspFactsFromGraph(attributedGraph, undefined, { compact: true });
  const selectedParticipants = { first: "123", second: "39", third: "194", fourth: "15" };
  const participantNearMatch = {
    id: "invs13-selected-participant-chain",
    temporal: { semantics: "orderedByStart", strict: true },
    roles: Object.fromEntries(Object.entries(selectedParticipants).map(([role, participant]) => [
      role,
      { nodeTypes: ["person"], attributes: { participant } }
    ])),
    edges: [
      { sourceRole: "first", targetRole: "second", edgeType: "face-to-face-contact" },
      { sourceRole: "second", targetRole: "third", edgeType: "face-to-face-contact" },
      { sourceRole: "third", targetRole: "fourth", edgeType: "face-to-face-contact" }
    ]
  };
  const attributedProgram = buildTypedMotifTemporalNearMatchProgram(
    participantNearMatch,
    attributedGraph.direction,
    "",
    attributedFacts.temporalEncoding
  );
  const nearResult = await runner.run(
    `${attributedFacts.facts}\n${attributedProgram.program}`,
    ["--opt-mode=optN", "--stats=2"]
  );
  assert.equal(nearResult.Result, "OPTIMUM FOUND", nearResult.Error ?? JSON.stringify(nearResult));
  assert.equal(nearResult.Models?.More, "no", "optN deve provare la completezza dei pareggi di dominio");
  const nearMatches = parseTypedMotifNearMatches(
    nearResult.Call?.[0]?.Witnesses,
    attributedProgram,
    attributedFacts.reverseIndex,
    attributedFacts.reverseSourceIndex,
    attributedFacts.reverseEdgeIndex,
    attributedFacts.temporalEncoding.decode
  );
  const pairRecords = new Map();
  for (const edge of edges) {
    const key = [edge.source, edge.target].sort().join(":");
    const records = pairRecords.get(key) ?? [];
    records.push(edge);
    pairRecords.set(key, records);
  }
  const expectedOrderedSupports = new Set();
  for (const first of pairRecords.get("123:39") ?? []) {
    for (const second of pairRecords.get("194:39") ?? []) {
      if (first.validFrom < second.validFrom) {
        expectedOrderedSupports.add(JSON.stringify([first.id, second.id]));
      }
    }
  }
  const actualOrderedSupports = new Set();
  for (const match of nearMatches) {
    assert.deepEqual(Object.fromEntries(Object.entries(match.roles).map(([role, value]) => [role, value.sourceId])),
      selectedParticipants);
    assert.deepEqual(match.missingRoles, []);
    assert.deepEqual(match.missingPatterns.map((pattern) => pattern.index), [3]);
    assert.deepEqual(match.temporalEvidence.orderViolations, []);
    const [first, second, third] = match.temporalEvidence.supportingEdges;
    assert.equal(first.edgeIds.length, 1);
    assert.equal(second.edgeIds.length, 1);
    assert.deepEqual(third.edgeIds, []);
    actualOrderedSupports.add(JSON.stringify([first.edgeIds[0], second.edgeIds[0]]));
  }
  assert.equal(expectedOrderedSupports.size, 100, "l'oracolo indipendente conta 100 coppie di supporti ordinate");
  assert.equal(nearMatches.length, expectedOrderedSupports.size,
    "la diagnosi ASP enumera ogni near-match ottimo distinto del caso selezionato");
  assert.deepEqual(actualOrderedSupports, expectedOrderedSupports,
    "i record di contatto temporali selezionati coincidono con l'enumerazione indipendente");
});

test("il controfattuale statico sceglie la combinazione di archi ipotetici di costo minimo senza mutare i dati", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto X", kind: "place" }
    ],
    edges: [{ id: "observed-a", from: "p-1", to: "place", kind: "person-place" }]
  }, config);
  const originalLinks = structuredClone(graph.links);
  const facts = buildAspFactsFromGraph(graph);
  const candidates = [
    {
      id: "hypothetical-expensive",
      sourceNodeId: "p-2",
      targetNodeId: "place",
      sourceNode: 2,
      targetNode: 3,
      edgeType: "person-place",
      cost: 5,
      recordIndex: 2
    },
    {
      id: "hypothetical-cheap",
      sourceNodeId: "p-2",
      targetNodeId: "place",
      sourceNode: 2,
      targetNode: 3,
      edgeType: "person-place",
      cost: 2,
      recordIndex: 3
    }
  ];
  const compiled = buildTypedMotifCompletionCounterfactualProgram(
    sharedPlaceMotif,
    graph.direction,
    "",
    candidates
  );
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const proposals = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );

  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].totalCost, 2);
  assert.deepEqual(proposals[0].addedEdges.map((edge) => edge.id), ["hypothetical-cheap"]);
  assert.deepEqual(proposals[0].addedEdges[0].patternIndexes.length, 1);
  assert.deepEqual(proposals[0].match.supportingEdges.flatMap((edge) => edge.edgeIds), ["observed-a"]);
  assert.deepEqual(graph.links, originalLinks);
  assert.equal(graph.links.length, 1);
});

test("il controfattuale temporale coValid richiede intervalli e trova un istante comune", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto X", kind: "place" }
    ],
    edges: [{ id: "observed-a", from: "p-1", to: "place", kind: "person-place", fromYear: 1, toYear: 5 }]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = { ...sharedPlaceMotif, temporal: { semantics: "coValid" } };
  const candidate = {
    id: "hypothetical-b",
    sourceNodeId: "p-2",
    targetNodeId: "place",
    sourceNode: 2,
    targetNode: 3,
    edgeType: "person-place",
    cost: 3,
    recordIndex: 2,
    validity: { from: 4, to: 8 }
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(template, graph.direction, "", [candidate]);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(proposal);
  assert.equal(proposal.match.timeValue, 4);
  assert.deepEqual(proposal.addedEdges[0].id, "hypothetical-b");
  assert.deepEqual(proposal.addedEdges[0].validity, { from: 4, to: 8 });
  assert.throws(() => buildTypedMotifCompletionCounterfactualProgram(
    template,
    graph.direction,
    "",
    [{ ...candidate, validity: undefined }]
  ), /validity deve dichiarare from e to/);
});

test("gli intervalli ipotetici usano lo stesso parser temporale degli archi osservati", () => {
  const template = { ...sharedPlaceMotif, temporal: { semantics: "coValid" } };
  const candidate = {
    id: "hypothetical-year",
    sourceNodeId: "p-2",
    targetNodeId: "place",
    sourceNode: 2,
    targetNode: 3,
    edgeType: "person-place",
    cost: 1,
    recordIndex: 2,
    validity: { from: "2024", to: 2025 }
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(template, "undirected", "", [candidate]);
  assert.deepEqual(compiled.candidates[0].validity, { from: 2024, to: 2025 });

  assert.throws(() => buildTypedMotifCompletionCounterfactualProgram(template, "undirected", "", [
    { ...candidate, validity: { from: "2024-02-31", to: "2024-03-01" } }
  ]), /data ISO valida/);
  assert.throws(() => buildTypedMotifCompletionCounterfactualProgram(template, "undirected", "", [
    { ...candidate, validity: { from: "2024-02-29T12:00:00", to: "2024-03-01T12:00:00" } }
  ]), /data ISO valida/);
  assert.throws(() => buildTypedMotifCompletionCounterfactualProgram(template, "undirected", "", [
    { ...candidate, validity: { from: "2023-02-29T12:00:00Z", to: "2024-03-01T12:00:00Z" } }
  ]), /data ISO valida/);
});

test("il controfattuale orderedByStart accetta supporti ipotetici sintetici e rispetta la sequenza", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.fromYear", toField: "$.toYear" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "actor", label: "A", kind: "actor" },
      { id: "context", label: "C", kind: "context" },
      { id: "place", label: "P", kind: "place" }
    ],
    edges: [{ id: "observed-first", from: "actor", to: "place", kind: "actor-place", fromYear: 2, toYear: 9 }]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = {
    id: "ordered-counterfactual",
    roles: {
      actor: { nodeTypes: ["actor"] },
      context: { nodeTypes: ["context"] },
      place: { nodeTypes: ["place"] }
    },
    edges: [
      { sourceRole: "actor", targetRole: "place", edgeType: "actor-place" },
      { sourceRole: "context", targetRole: "place", edgeType: "context-place" }
    ],
    temporal: { semantics: "orderedByStart" }
  };
  const candidate = {
    id: "hypothetical-second",
    sourceNodeId: "context",
    targetNodeId: "place",
    sourceNode: 2,
    targetNode: 3,
    edgeType: "context-place",
    cost: 1,
    recordIndex: 2,
    validity: { from: 4, to: 8 }
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(template, graph.direction, "", [candidate]);
  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  );
  assert.ok(proposal);
  assert.deepEqual(proposal.addedEdges[0].patternIndexes, [2]);
  assert.deepEqual(proposal.addedEdges[0].validity, { from: 4, to: 8 });
  assert.deepEqual(proposal.match.supportingEdges.map((edge) => edge.edgeIds), [["observed-first"], []]);
  assert.deepEqual(proposal.match.supportingEdges.map((edge) => edge.startTimeValue), [2, 4]);
});

test("il controfattuale restituisce UNSAT quando nessun candidato autorizzato completa il motivo", async () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "p-1", label: "Ada", kind: "person" },
      { id: "p-2", label: "Bruno", kind: "person" },
      { id: "place", label: "Istituto X", kind: "place" }
    ],
    edges: [{ id: "observed-a", from: "p-1", to: "place", kind: "person-place" }]
  }, config);
  const facts = buildAspFactsFromGraph(graph);
  const compiled = buildTypedMotifCompletionCounterfactualProgram(sharedPlaceMotif, graph.direction, "", [{
    id: "wrong-type",
    sourceNodeId: "p-2",
    targetNodeId: "place",
    sourceNode: 2,
    targetNode: 3,
    edgeType: "unrelated",
    cost: 1,
    recordIndex: 2
  }]);
  const result = await (await createClingoWasmRunner()).run(`${facts.facts}\n${compiled.program}`);
  assert.equal(result.Result, "UNSATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.deepEqual(parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex
  ), []);
});

test("i timestamp ISO sono codificati nel range clingo e decodificati nel witness", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.valid_from", toField: "$.valid_to" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" })),
    edges: [
      { id: "e1", from: "a", to: "b", kind: "collaboration", valid_from: "2024-01-01", valid_to: "2024-04-01" },
      { id: "e2", from: "b", to: "c", kind: "collaboration", valid_from: "2024-02-01", valid_to: "2024-05-01" },
      { id: "e3", from: "c", to: "a", kind: "collaboration", valid_from: "2024-03-01", valid_to: "2024-06-01" }
    ]
  }, temporalConfig);
  const facts = buildAspFactsFromGraph(graph);
  const template = buildTypedMotifProgram({
    id: "temporal-triangle",
    label: "Triade temporale",
    roles: {
      a: { nodeTypes: ["person"] },
      b: { nodeTypes: ["person"] },
      c: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "a", targetRole: "b", edgeType: "collaboration" },
      { sourceRole: "b", targetRole: "c", edgeType: "collaboration" },
      { sourceRole: "c", targetRole: "a", edgeType: "collaboration" }
    ],
    symmetricRoles: [["a", "b", "c"]],
    temporal: { semantics: "coValid" }
  }, graph.direction);

  assert.match(facts.facts, /edge_valid_from\(1,1\)\./);
  assert.match(facts.facts, /edge_valid_from\(2,2\)\./);
  assert.match(facts.facts, /edge_valid_from\(3,3\)\./);
  assert.doesNotMatch(facts.facts, /170\d{9,}/, "i millisecondi Unix non devono arrivare come interi ASP");

  const runner = await createClingoWasmRunner();
  const result = await runner.run(`${facts.facts}\n${template.program}`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  const [match] = parseTypedMotifMatches(
    result.Call?.[0]?.Witnesses,
    template,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    new Set(),
    facts.temporalEncoding.decode
  );
  assert.equal(match.timeValue, Date.parse("2024-03-01"));
});

test("i controfattuali temporali condividono la codifica con gli intervalli ISO ipotetici", async () => {
  const temporalConfig = {
    ...config,
    graphMapping: {
      ...config.graphMapping,
      edge: {
        ...config.graphMapping.edge,
        validity: { fromField: "$.valid_from", toField: "$.valid_to" }
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: ["a", "b", "c"].map((id) => ({ id, label: id, kind: "person" })),
    edges: [
      { id: "e1", from: "a", to: "b", kind: "collaboration", valid_from: "2024-01-01", valid_to: "2024-12-31" },
      { id: "e2", from: "b", to: "c", kind: "collaboration", valid_from: "2024-01-01", valid_to: "2024-12-31" }
    ]
  }, temporalConfig);
  const candidateValidity = { from: "2024-03-01", to: "2024-06-30" };
  const facts = buildAspFactsFromGraph(graph, undefined, {
    additionalTemporalValues: [candidateValidity.from, candidateValidity.to]
  });
  const motif = {
    id: "temporal-triangle",
    label: "Triade temporale",
    roles: {
      a: { nodeTypes: ["person"] },
      b: { nodeTypes: ["person"] },
      c: { nodeTypes: ["person"] }
    },
    edges: [
      { sourceRole: "a", targetRole: "b", edgeType: "collaboration" },
      { sourceRole: "b", targetRole: "c", edgeType: "collaboration" },
      { sourceRole: "c", targetRole: "a", edgeType: "collaboration" }
    ],
    symmetricRoles: [["a", "b", "c"]],
    temporal: { semantics: "coValid" }
  };
  const candidate = {
    id: "e3",
    sourceNodeId: "c",
    targetNodeId: "a",
    edgeType: "collaboration",
    sourceNode: 3,
    targetNode: 1,
    cost: 1,
    recordIndex: 3,
    validity: candidateValidity
  };
  const compiled = buildTypedMotifCompletionCounterfactualProgram(
    motif,
    graph.direction,
    "",
    [candidate],
    facts.temporalEncoding
  );
  const candidateFrom = facts.temporalEncoding.encode(candidateValidity.from);
  const candidateTo = facts.temporalEncoding.encode(candidateValidity.to);
  assert.match(compiled.program, new RegExp(`cf_candidate_interval\\(3,${candidateFrom},${candidateTo}\\)\\.`));
  assert.doesNotMatch(compiled.program, /170\\d{9,}/);

  const result = await (await createClingoWasmRunner()).run(
    `${facts.facts}\n${compiled.program}`,
    ["--opt-mode=opt"]
  );
  assert.equal(result.Result, "OPTIMUM FOUND", result.Error ?? JSON.stringify(result));
  const [proposal] = parseTypedMotifCompletionCounterfactuals(
    result.Call?.[0]?.Witnesses,
    compiled.template,
    compiled.candidates,
    facts.reverseIndex,
    facts.reverseSourceIndex,
    facts.reverseEdgeIndex,
    facts.temporalEncoding.decode
  );
  assert.equal(proposal.addedEdges[0].validity.from, Date.parse("2024-03-01"));
  assert.equal(proposal.addedEdges[0].validity.to, Date.parse("2024-06-30"));
});

