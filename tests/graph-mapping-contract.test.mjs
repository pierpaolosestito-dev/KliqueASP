import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAspFactsFromGraph,
  checkGraphTaskRequirements,
  getGraphTaskRequirements,
  normalizeGraphData
} from "../src/lib/kliqueasp/graph/graphModel.ts";

const enrichedGraph = {
  nodes: [
    {
      id: "a",
      name: "Ada",
      kind: "person",
      role: "researcher",
      groups: ["north", "active"],
      profession: "psychologist",
      removalCost: 3
    },
    {
      id: "b",
      name: "Bruno",
      kind: "person",
      role: "researcher",
      groups: ["north"],
      profession: "psychologist",
      removalCost: 4
    }
  ],
  edges: [{
    id: "e-ab",
    source: "a",
    target: "b",
    relation: "colleague",
    validFrom: 2000,
    validTo: 2005,
    weight: 0.5,
    removalCost: 2,
    confidence: 0.75,
    sources: ["archive-a", "archive-b"],
    eventCode: "meeting-7"
  }]
};

const minimalConfig = {
  schemaVersion: 2,
  graphMapping: {
    node: { idField: "$.id", labelField: "$.name" },
    edge: {
      sourceField: "$.source",
      targetField: "$.target",
      direction: "undirected",
      identity: "simple"
    }
  }
};

const optionalMappings = [
  { capability: "nodeTypes", fact: "node_type(", patch: { node: { typeField: "$.kind" } } },
  { capability: "nodeRoles", fact: "node_role(", patch: { node: { roleField: "$.role" } } },
  { capability: "nodeGroups", fact: "node_group(", patch: { node: { groupFields: ["$.groups[*]"] } } },
  { capability: "nodeAttributes", fact: "node_attribute(", patch: { node: { attributes: { profession: "$.profession" } } } },
  { capability: "nodeRemovalCosts", fact: "node_removal_cost(", patch: { node: { removalCostField: "$.removalCost" } } },
  { capability: "edgeTypes", fact: "edge_type(", patch: { edge: { typeField: "$.relation" } } },
  { capability: "edgeAttributes", fact: "edge_attribute(", patch: { edge: { attributes: { eventCode: "$.eventCode" } } } },
  {
    capability: "edgeIntervals",
    fact: "edge_valid_from(",
    patch: { edge: { validity: { fromField: "$.validFrom", toField: "$.validTo" } } }
  },
  { capability: "edgeWeights", fact: "edge_weight(", patch: { edge: { weightField: "$.weight" } } },
  { capability: "edgeRemovalCosts", fact: "edge_removal_cost(", patch: { edge: { removalCostField: "$.removalCost" } } },
  {
    capability: "edgeConfidence",
    fact: "edge_confidence(",
    patch: { edge: { confidenceField: "$.confidence", confidenceRange: { min: 0, max: 1 } } }
  },
  { capability: "edgeProvenance", fact: "edge_provenance(", patch: { edge: { provenanceField: "$.sources[*]" } } },
  {
    capability: "edgeIdentity",
    fact: "edge_id(",
    patch: { edge: { idField: "$.id", identity: "multigraph" } }
  },
  {
    capability: "directedEdges",
    fact: "edge_direction(",
    patch: { edge: { direction: "directed" } }
  }
];

const optionalCapabilityKeys = [
  "nodeTypes",
  "nodeRoles",
  "nodeGroups",
  "nodeAttributes",
  "nodeRemovalCosts",
  "edgeTypes",
  "edgeAttributes",
  "directedEdges",
  "edgeIntervals",
  "edgeWeights",
  "modularityWeights",
  "edgeRemovalCosts",
  "edgeConfidence",
  "edgeProvenance",
  "edgeIdentity"
];

function mergeMapping(base, patch) {
  return {
    ...base,
    schemaVersion: base.schemaVersion,
    graphMapping: {
      ...base.graphMapping,
      node: { ...base.graphMapping.node, ...(patch.node ?? {}) },
      edge: { ...base.graphMapping.edge, ...(patch.edge ?? {}) }
    }
  };
}

function mergeMappingPatches(base, patches) {
  const combined = { node: {}, edge: {} };
  for (const { patch } of patches) {
    Object.assign(combined.node, patch.node ?? {});
    Object.assign(combined.edge, patch.edge ?? {});
  }
  return mergeMapping(base, combined);
}

function edgeEndpointPairs(graph) {
  return graph.links.map(({ source, target }) => [source, target]);
}

function normalizedSemanticProjection(graph) {
  return {
    schemaVersion: graph.schemaVersion,
    direction: graph.direction,
    nodes: graph.nodes.map(({ id, label, sourceId, analysis }) => ({ id, label, sourceId, analysis })),
    links: graph.links.map(({ source, target, sourceId, analysis }) => ({ source, target, sourceId, analysis }))
  };
}

function structuralFacts(graph) {
  return buildAspFactsFromGraph(graph).facts
    .split(/\r?\n/)
    .filter((fact) => /^(node|edge)\(/.test(fact));
}

test("i campi JSON aggiuntivi restano inerti finché il mapping non li abilita", () => {
  const minimal = normalizeGraphData(enrichedGraph, minimalConfig);
  const strippedInput = {
    nodes: enrichedGraph.nodes.map(({ id, name }) => ({ id, name })),
    edges: enrichedGraph.edges.map(({ source, target }) => ({ source, target }))
  };
  const stripped = normalizeGraphData(strippedInput, minimalConfig);

  assert.equal(minimal.valid, true);
  assert.equal(stripped.valid, true);
  assert.deepEqual(normalizedSemanticProjection(minimal), normalizedSemanticProjection(stripped));
  assert.deepEqual(minimal.capabilities, stripped.capabilities);
  assert.deepEqual(buildAspFactsFromGraph(minimal).facts, buildAspFactsFromGraph(stripped).facts);
  assert.equal(minimal.capabilities.nodeTypes.available, false);
  assert.equal(minimal.capabilities.edgeTypes.available, false);
  assert.equal(minimal.capabilities.edgeIntervals.available, false);
  assert.equal(minimal.capabilities.edgeWeights.available, false);
  assert.equal(minimal.capabilities.edgeProvenance.available, false);
});

test("ogni arricchimento mappato attiva solo la capability prevista e non cambia la topologia", () => {
  const baseline = normalizeGraphData(enrichedGraph, minimalConfig);
  const baselinePairs = edgeEndpointPairs(baseline);
  const baselineStructuralFacts = structuralFacts(baseline);

  for (const { capability, fact, patch } of optionalMappings) {
    const mapped = normalizeGraphData(enrichedGraph, mergeMapping(minimalConfig, patch));
    assert.equal(mapped.valid, true, `${capability}: ${mapped.diagnostics.map(({ message }) => message).join("; ")}`);
    assert.equal(mapped.capabilities[capability].available, true, `${capability} dovrebbe essere disponibile`);
    assert.deepEqual(
      optionalCapabilityKeys.filter((key) => mapped.capabilities[key].available).sort(),
      [capability],
      `${capability} deve essere l'unica capability opzionale attivata da questo mapping`
    );
    assert.deepEqual(edgeEndpointPairs(mapped), baselinePairs, `${capability} non deve cambiare gli estremi del grafo`);
    if (capability === "directedEdges") {
      assert.deepEqual(
        structuralFacts(mapped).filter((fact) => fact.startsWith("edge(")),
        ["edge(1,2)."],
        "la direzione mappata deve eliminare l'arco inverso sintetico"
      );
    } else {
      assert.deepEqual(structuralFacts(mapped), baselineStructuralFacts, `${capability} non deve cambiare i fatti topologici`);
    }
    assert.ok(buildAspFactsFromGraph(mapped).facts.includes(fact), `${capability} deve generare ${fact}`);
  }
});

test("un task relazionale si abilita solo quando entrambi i tipi richiesti sono mappati", () => {
  const required = getGraphTaskRequirements("typedMotif");
  const minimal = normalizeGraphData(enrichedGraph, minimalConfig);
  const mapped = normalizeGraphData(enrichedGraph, mergeMapping(minimalConfig, {
    node: { typeField: "$.kind" },
    edge: { typeField: "$.relation" }
  }));

  assert.deepEqual(required, ["nodeTypes", "edgeTypes"]);
  assert.deepEqual(checkGraphTaskRequirements(minimal.capabilities, required), {
    available: false,
    missing: ["nodeTypes", "edgeTypes"],
    reasons: [
      "mappare un tipo per ogni nodo con graphMapping.node.typeField",
      "mappare un tipo per ogni arco con graphMapping.edge.typeField"
    ]
  });
  assert.deepEqual(checkGraphTaskRequirements(mapped.capabilities, required), {
    available: true,
    missing: [],
    reasons: []
  });
});

test("ogni coppia di mapping opzionali coesiste senza effetti collaterali", () => {
  const baseline = normalizeGraphData(enrichedGraph, minimalConfig);
  const baselinePairs = edgeEndpointPairs(baseline);
  const baselineStructuralFacts = structuralFacts(baseline);
  let checkedPairs = 0;

  for (let firstIndex = 0; firstIndex < optionalMappings.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < optionalMappings.length; secondIndex += 1) {
      const pair = [optionalMappings[firstIndex], optionalMappings[secondIndex]];
      const expectedCapabilities = pair.map(({ capability }) => capability).sort();
      const hasDirection = expectedCapabilities.includes("directedEdges");
      const mapped = normalizeGraphData(enrichedGraph, mergeMappingPatches(minimalConfig, pair));
      const context = expectedCapabilities.join(" + ");

      assert.equal(mapped.valid, true, `${context}: ${mapped.diagnostics.map(({ message }) => message).join("; ")}`);
      assert.deepEqual(
        optionalCapabilityKeys.filter((key) => mapped.capabilities[key].available).sort(),
        expectedCapabilities,
        `${context}: nessuna capability opzionale estranea deve attivarsi`
      );
      assert.deepEqual(
        edgeEndpointPairs(mapped),
        hasDirection ? [["a", "b"]] : baselinePairs,
        `${context}: il mapping può cambiare solo la semantica di direzione prevista`
      );
      if (hasDirection) {
        assert.deepEqual(
          structuralFacts(mapped).filter((fact) => fact.startsWith("edge(")),
          ["edge(1,2)."],
          `${context}: la direzione deve eliminare solo l'arco inverso sintetico`
        );
      } else {
        assert.deepEqual(structuralFacts(mapped), baselineStructuralFacts, `${context}: i fatti topologici devono restare invariati`);
      }
      for (const { capability, fact } of pair) {
        assert.ok(buildAspFactsFromGraph(mapped).facts.includes(fact), `${context}: ${capability} deve generare ${fact}`);
      }
      checkedPairs += 1;
    }
  }

  assert.equal(checkedPairs, 91, "la matrice deve coprire tutte le coppie dei 14 mapping opzionali");
});

test("ogni sottoinsieme dei mapping opzionali mantiene capability e semantica sui profili di dato", () => {
  const weightedBase = {
    ...minimalConfig,
    graphAnalysis: { communities: { useEdgeWeights: true } }
  };
  const baseline = normalizeGraphData(enrichedGraph, weightedBase);
  const baselineStructuralFacts = structuralFacts(baseline);
  const partialGraph = {
    nodes: enrichedGraph.nodes.map((node, index) => {
      if (index !== 1) return node;
      const { kind, ...withoutKind } = node;
      return withoutKind;
    }),
    edges: enrichedGraph.edges.map(({ validTo, ...edge }) => edge)
  };
  const invalidDomainGraph = {
    nodes: enrichedGraph.nodes,
    edges: enrichedGraph.edges.map((edge) => ({
      ...edge,
      validFrom: 2005,
      validTo: 2000,
      weight: -0.5,
      removalCost: 0,
      confidence: 1.5
    }))
  };
  const conflictingGraph = {
    nodes: enrichedGraph.nodes,
    edges: [
      ...enrichedGraph.edges,
      {
        ...enrichedGraph.edges[0],
        id: "e-ba",
        source: "b",
        target: "a",
        relation: "collaborator"
      }
    ]
  };
  const combinedDefectsGraph = {
    nodes: partialGraph.nodes,
    edges: conflictingGraph.edges.map((edge) => ({
      ...edge,
      validFrom: 2005,
      validTo: 2000,
      weight: -0.5,
      removalCost: 0,
      confidence: 1.5
    }))
  };
  const dataProfiles = [
    { name: "completo", graph: enrichedGraph, unavailableCapabilities: [], modularityAvailable: true },
    { name: "incompleto", graph: partialGraph, unavailableCapabilities: ["nodeTypes", "edgeIntervals"], modularityAvailable: true },
    {
      name: "fuori-dominio",
      graph: invalidDomainGraph,
      unavailableCapabilities: ["edgeIntervals", "edgeRemovalCosts", "edgeConfidence"],
      modularityAvailable: false
    },
    {
      name: "relazioni-in-conflitto",
      graph: conflictingGraph,
      unavailableCapabilities: [],
      modularityAvailable: true,
      hasConflictingRelationTypes: true
    },
    {
      name: "difetti-combinati",
      graph: combinedDefectsGraph,
      unavailableCapabilities: ["nodeTypes", "edgeIntervals", "edgeRemovalCosts", "edgeConfidence"],
      modularityAvailable: false,
      hasConflictingRelationTypes: true
    }
  ];
  const totalConfigurations = 2 ** optionalMappings.length;
  let checkedCombinations = 0;

  for (let mask = 0; mask < totalConfigurations; mask += 1) {
    const selected = optionalMappings.filter((_, index) => (mask & (1 << index)) !== 0);
    const selectedCapabilities = selected.map(({ capability }) => capability);
    const hasDirection = selectedCapabilities.includes("directedEdges");

    for (const profile of dataProfiles) {
      const expectedCapabilities = new Set(
        selectedCapabilities.filter((capability) => !profile.unavailableCapabilities.includes(capability))
      );
      if (selectedCapabilities.includes("edgeWeights") && profile.modularityAvailable) {
        expectedCapabilities.add("modularityWeights");
      }
      const mapped = normalizeGraphData(profile.graph, mergeMappingPatches(weightedBase, selected));
      const conflictInvalid = profile.hasConflictingRelationTypes &&
        selectedCapabilities.includes("edgeTypes") && !selectedCapabilities.includes("edgeIdentity") && !hasDirection;
      const expectedValid = !conflictInvalid;
      const context = `${profile.name}, subset ${mask}/${totalConfigurations - 1}`;

      assert.equal(mapped.valid, expectedValid,
        `${context}: ${mapped.diagnostics.map(({ message }) => message).join("; ")}`);
      assert.deepEqual(
        optionalCapabilityKeys.filter((key) => mapped.capabilities[key].available).sort(),
        [...expectedCapabilities].sort(),
        `${context}: le capability devono rispettare mapping e completezza dei dati`
      );
      if (profile.name === "completo") {
        if (hasDirection) {
          assert.deepEqual(
            structuralFacts(mapped).filter((fact) => fact.startsWith("edge(")),
            ["edge(1,2)."],
            `${context}: la direzione esplicita deve produrre soltanto l'arco orientato dichiarato`
          );
        } else {
          assert.deepEqual(structuralFacts(mapped), baselineStructuralFacts,
            `${context}: i mapping semantici non devono cambiare i fatti topologici`);
        }
      }
      if (profile.hasConflictingRelationTypes) {
        if (conflictInvalid) {
          assert.equal(mapped.links.length, 1, `${context}: il grafo semplice deve interrompersi sul conflitto`);
          assert.ok(mapped.diagnostics.some(({ code, severity }) =>
            code === "conflicting-simple-edge-types" && severity === "error"), context);
        } else {
          assert.equal(mapped.links.length,
            selectedCapabilities.includes("edgeIdentity") || hasDirection ? 2 : 1,
            `${context}: solo multigrafo o direzione esplicita distinguono i due record`);
        }
      }
      checkedCombinations += 1;
    }
  }

  assert.equal(checkedCombinations, 81_920,
    "tutti i 16.384 sottoinsiemi devono essere verificati sui cinque profili di dato");
});

test("la configurazione completa abilita le capability mappate e i task che le richiedono", () => {
  const allMappings = mergeMappingPatches(minimalConfig, optionalMappings);
  const fullConfig = {
    ...allMappings,
    graphAnalysis: { communities: { useEdgeWeights: true } }
  };
  const mapped = normalizeGraphData(enrichedGraph, fullConfig);
  const expectedCapabilities = [...optionalMappings.map(({ capability }) => capability), "modularityWeights"].sort();

  assert.equal(mapped.valid, true, mapped.diagnostics.map(({ message }) => message).join("; "));
  assert.deepEqual(
    optionalCapabilityKeys.filter((key) => mapped.capabilities[key].available).sort(),
    expectedCapabilities,
    "la configurazione completa deve attivare tutte e sole le capability opzionali configurate"
  );
  assert.deepEqual(edgeEndpointPairs(mapped), [["a", "b"]], "il grafo orientato deve conservare l'arco sorgente una sola volta");
  assert.deepEqual(
    structuralFacts(mapped).filter((fact) => fact.startsWith("edge(")),
    ["edge(1,2)."],
    "la configurazione completa non deve duplicare l'arco orientato nei fatti ASP"
  );

  for (const task of ["typedMotif", "temporalMotif"]) {
    const requirements = getGraphTaskRequirements(task);
    assert.deepEqual(checkGraphTaskRequirements(mapped.capabilities, requirements), {
      available: true,
      missing: [],
      reasons: []
    }, `${task} deve risultare disponibile con tutte le capability richieste`);
  }
});

test("i metadati relazionali in conflitto richiedono identità multigrafo per conservarli", () => {
  const parallelRecord = {
    ...enrichedGraph.edges[0],
    id: "e-ba",
    source: "b",
    target: "a",
    relation: "collaborator",
    validFrom: 2001,
    validTo: 2006,
    weight: 0.75,
    removalCost: 5,
    confidence: 0.8,
    sources: ["archive-c"],
    eventCode: "meeting-8"
  };
  const graphWithParallelRecords = {
    nodes: enrichedGraph.nodes,
    edges: [...enrichedGraph.edges, parallelRecord]
  };
  const mappedConfig = mergeMappingPatches(minimalConfig, optionalMappings);
  const undirectedMapping = {
    ...mappedConfig,
    graphMapping: {
      ...mappedConfig.graphMapping,
      edge: { ...mappedConfig.graphMapping.edge, direction: "undirected" }
    },
    graphAnalysis: { communities: { useEdgeWeights: true } }
  };
  const simple = normalizeGraphData(graphWithParallelRecords, {
    ...undirectedMapping,
    graphMapping: {
      ...undirectedMapping.graphMapping,
      edge: { ...undirectedMapping.graphMapping.edge, identity: "simple" }
    }
  });
  const multigraph = normalizeGraphData(graphWithParallelRecords, {
    ...undirectedMapping,
    graphMapping: {
      ...undirectedMapping.graphMapping,
      edge: { ...undirectedMapping.graphMapping.edge, identity: "multigraph" }
    }
  });

  assert.equal(simple.valid, false, "un grafo semplice non può collassare tipi relazionali in conflitto");
  assert.equal(simple.links.length, 1, "il record conflittuale non deve diventare un risultato ambiguo utilizzabile");
  assert.ok(simple.diagnostics.some(({ code, severity }) =>
    code === "conflicting-simple-edge-types" && severity === "error"
  ));

  assert.equal(multigraph.valid, true, multigraph.diagnostics.map(({ message }) => message).join("; "));
  assert.equal(multigraph.links.length, 2, "l'identità multigrafo deve conservare entrambi i record sorgente");
  assert.equal(multigraph.capabilities.edgeIdentity.available, true);
  assert.equal(multigraph.capabilities.edgeTypes.available, true);
  assert.deepEqual(multigraph.links.map(({ analysis }) => analysis.type), ["colleague", "collaborator"]);
  const facts = buildAspFactsFromGraph(multigraph).facts;
  assert.match(facts, /edge_id\(1,"e-ab"\)\./);
  assert.match(facts, /edge_id\(2,"e-ba"\)\./);
  assert.match(facts, /edge_type\(1,"colleague"\)\./);
  assert.match(facts, /edge_type\(2,"collaborator"\)\./);
  assert.match(facts, /edge_provenance\(1,"archive-a"\)\./);
  assert.match(facts, /edge_provenance\(2,"archive-c"\)\./);
});

test("mapping combinati incompleti disabilitano solo i task dipendenti dai campi mancanti", () => {
  const allMappings = mergeMappingPatches(minimalConfig, optionalMappings);
  const fullConfig = {
    ...allMappings,
    graphAnalysis: { communities: { useEdgeWeights: true } }
  };
  const partialGraph = {
    nodes: enrichedGraph.nodes.map((node, index) => {
      if (index !== 1) return node;
      const { kind, ...withoutKind } = node;
      return withoutKind;
    }),
    edges: enrichedGraph.edges.map(({ validTo, ...edge }) => edge)
  };
  const mapped = normalizeGraphData(partialGraph, fullConfig);
  const expectedAvailable = [...optionalMappings
    .map(({ capability }) => capability)
    .filter((capability) => !["nodeTypes", "edgeIntervals"].includes(capability)), "modularityWeights"].sort();

  assert.equal(mapped.valid, true, "dati opzionali incompleti devono lasciare utilizzabile la topologia valida");
  assert.deepEqual(
    optionalCapabilityKeys.filter((key) => mapped.capabilities[key].available).sort(),
    expectedAvailable,
    "solo i mapping incompleti devono perdere disponibilità; quelli indipendenti restano attivi"
  );
  assert.deepEqual(checkGraphTaskRequirements(mapped.capabilities, getGraphTaskRequirements("typedMotif")), {
    available: false,
    missing: ["nodeTypes"],
    reasons: ["mappare un tipo per ogni nodo con graphMapping.node.typeField"]
  });
  assert.deepEqual(checkGraphTaskRequirements(mapped.capabilities, getGraphTaskRequirements("temporalMotif")), {
    available: false,
    missing: ["nodeTypes", "edgeIntervals"],
    reasons: [
      "mappare un tipo per ogni nodo con graphMapping.node.typeField",
      "mappare intervalli validi e ordinati in un unico dominio temporale su tutti gli archi con graphMapping.edge.validity"
    ]
  });
  assert.equal(checkGraphTaskRequirements(mapped.capabilities, ["edgeWeights", "edgeConfidence", "edgeProvenance"]).available, true,
    "le query basate su pesi, confidenza e provenienza non dipendono dai due campi incompleti");
});

test("domini di valore non validi degradano solo le capability che li interpretano", () => {
  const allMappings = mergeMappingPatches(minimalConfig, optionalMappings);
  const fullConfig = {
    ...allMappings,
    graphAnalysis: { communities: { useEdgeWeights: true } }
  };
  const invalidDomainGraph = {
    nodes: enrichedGraph.nodes,
    edges: enrichedGraph.edges.map((edge) => ({
      ...edge,
      validFrom: 2005,
      validTo: 2000,
      weight: -0.5,
      removalCost: 0,
      confidence: 1.5
    }))
  };
  const mapped = normalizeGraphData(invalidDomainGraph, fullConfig);
  const expectedAvailable = [...optionalMappings
    .map(({ capability }) => capability)
    .filter((capability) => !["edgeIntervals", "edgeRemovalCosts", "edgeConfidence"].includes(capability))]
    .sort();

  assert.equal(mapped.valid, true, "un intervallo o un metadato fuori dominio non deve invalidare la topologia");
  assert.deepEqual(
    optionalCapabilityKeys.filter((key) => mapped.capabilities[key].available).sort(),
    expectedAvailable,
    "intervallo, costo e confidenza non validi non devono disabilitare capability indipendenti"
  );
  assert.equal(mapped.capabilities.edgeWeights.available, true,
    "un peso numerico signed resta un peso mappato per task che lo ammettono");
  assert.equal(mapped.capabilities.modularityWeights.available, false,
    "la modularità pesata richiede pesi non negativi anche quando edgeWeights è disponibile");
  assert.deepEqual(checkGraphTaskRequirements(mapped.capabilities, getGraphTaskRequirements("typedMotif")), {
    available: true,
    missing: [],
    reasons: []
  });
  assert.deepEqual(checkGraphTaskRequirements(mapped.capabilities, getGraphTaskRequirements("temporalMotif")), {
    available: false,
    missing: ["edgeIntervals"],
    reasons: ["mappare intervalli validi e ordinati in un unico dominio temporale su tutti gli archi con graphMapping.edge.validity"]
  });
});
