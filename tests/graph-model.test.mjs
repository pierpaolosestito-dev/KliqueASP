import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAspFactsFromGraph,
  buildCliqueProgram,
  checkNodeRemovalCostCapabilityForCandidates,
  checkGraphTaskRequirements,
  decodeAspStringPayload,
  escapeAspString,
  getGraphEndpointId,
  getGraphTaskRequirements,
  parseGraphTimeValue,
  graphPathValues,
  normalizeGraphData
} from "../src/lib/kliqueasp/graph/graphModel.ts";
import { createClingoWasmRunner } from "./helpers/clingoWasm.mjs";
import { filterLinksByProvenanceScenario } from "../src/lib/kliqueasp/graph/provenance.ts";

test("gli scenari di provenienza applicano policy any/all e gestiscono gli archi senza fonte", () => {
  const links = [
    { sourceId: "e-ab", analysis: { provenance: ["archive-a", "archive-b"] } },
    { sourceId: "e-bc", analysis: { provenance: "archive-b" } },
    { sourceId: "e-cd", analysis: {} },
    { sourceId: "e-de", analysis: { provenance: [] } }
  ];

  assert.deepEqual(
    filterLinksByProvenanceScenario(links, {
      sources: ["archive-a"],
      unattributedEdges: "include"
    }).map((link) => link.sourceId),
    ["e-ab", "e-cd", "e-de"]
  );
  assert.deepEqual(
    filterLinksByProvenanceScenario(links, {
      sources: ["archive-a"],
      unattributedEdges: "exclude"
    }).map((link) => link.sourceId),
    ["e-ab"]
  );
  assert.deepEqual(
    filterLinksByProvenanceScenario(links, {
      sources: ["archive-a"],
      unattributedEdges: "include",
      referenceMatching: "all"
    }).map((link) => link.sourceId),
    ["e-cd", "e-de"]
  );
  assert.deepEqual(
    filterLinksByProvenanceScenario(links, {
      sources: ["archive-a", "archive-b"],
      unattributedEdges: "exclude",
      referenceMatching: "all"
    }).map((link) => link.sourceId),
    ["e-ab", "e-bc"]
  );
  assert.deepEqual(
    filterLinksByProvenanceScenario(links, {
      sources: ["archive-b"],
      unattributedEdges: "exclude"
    }).map((link) => link.sourceId),
    ["e-ab", "e-bc"]
  );
  assert.equal(filterLinksByProvenanceScenario(links, undefined).length, links.length);
});

test("il parser temporale applica il contratto comune e rifiuta date invalide o ambigue", () => {
  assert.equal(parseGraphTimeValue("2024"), 2024);
  assert.equal(parseGraphTimeValue("2024-02-29"), Date.parse("2024-02-29"));
  assert.equal(parseGraphTimeValue("2024-02-29T12:00:00Z"), Date.parse("2024-02-29T12:00:00Z"));
  assert.equal(parseGraphTimeValue("2024-02-29T12:00:00+02:00"), Date.parse("2024-02-29T12:00:00+02:00"));
  assert.equal(parseGraphTimeValue("2024-02-31"), null);
  assert.equal(parseGraphTimeValue("2024-02-31T12:00:00Z"), null);
  assert.equal(parseGraphTimeValue("2024-02-31 12:00:00"), null);
  assert.equal(parseGraphTimeValue("2023-02-29"), null);
  assert.equal(parseGraphTimeValue("2024-02-29T12:00:00"), null);
  assert.equal(parseGraphTimeValue("2024-02-29T12:00:00.1234Z"), null);
  assert.equal(parseGraphTimeValue("2024-02-29T24:00:00Z"), null);
  assert.equal(parseGraphTimeValue("2024-02-29T12:00:00+14:01"), null);
  assert.equal(parseGraphTimeValue("Feb 29, 2024"), null);
});

test("intervalli d'arco con timestamp senza fuso non abilitano task ASP temporali", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "a", type: "person" }, { id: "b", type: "person" }],
    edges: [{ id: "e1", source: "a", target: "b", type: "knows", start: "2024-01-01T00:00:00", end: "2024-01-02T00:00:00" }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", typeField: "$.type" },
      edge: {
        idField: "$.id", sourceField: "$.source", targetField: "$.target", typeField: "$.type",
        direction: "undirected", identity: "multigraph",
        validity: { fromField: "$.start", toField: "$.end" }
      }
    }
  });

  assert.equal(graph.valid, true);
  assert.equal(graph.capabilities.edgeIntervals.available, false);
  const facts = buildAspFactsFromGraph(graph).facts;
  assert.doesNotMatch(facts, /edge_valid_from\(1,/);
  assert.doesNotMatch(facts, /edge_valid_to\(1,/);
});

test("i task temporali richiedono intervalli ordinati e un dominio omogeneo in tutto il grafo", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", typeField: "$.type" },
      edge: {
        idField: "$.id", sourceField: "$.source", targetField: "$.target", typeField: "$.type",
        direction: "undirected", identity: "multigraph",
        validity: { fromField: "$.start", toField: "$.end" }
      }
    }
  };
  const nodes = [{ id: "a", type: "person" }, { id: "b", type: "person" }, { id: "c", type: "person" }];
  const normalizeIntervals = (intervals) => normalizeGraphData({
    nodes,
    edges: intervals.map(([source, target, start, end], index) => ({
      id: `e${index + 1}`, source, target, type: "knows", start, end
    }))
  }, config);

  assert.equal(normalizeIntervals([["a", "b", 2020, 2024]]).capabilities.edgeIntervals.available, true);
  assert.equal(normalizeIntervals([["a", "b", "2024-01-01", "2024-12-31"]]).capabilities.edgeIntervals.available, true);
  assert.equal(normalizeIntervals([["a", "b", 2024, "2024-12-31"]]).capabilities.edgeIntervals.available, false);
  assert.equal(normalizeIntervals([
    ["a", "b", 2020, 2024],
    ["b", "c", "2024-01-01", "2024-12-31"]
  ]).capabilities.edgeIntervals.available, false);
  assert.equal(normalizeIntervals([["a", "b", 2025, 2024]]).capabilities.edgeIntervals.available, false);
});

test("il profilo legacy mantiene normalizzazione e deduplicazione correnti", () => {
  const result = normalizeGraphData({
    nodes: [
      { id: " Node A ", label: "  María   Rossi ", type: "person" },
      { id: "Place B", label: "Place B", type: "place" }
    ],
    edges: [
      { source: "Node A", target: "Place B", type: "person-place" },
      { source: "Place B", target: "Node A", type: "person-place" },
      { source: "Node A", target: "Place B", type: "other-type" }
    ]
  });

  assert.equal(result.valid, true);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.direction, "undirected");
  assert.deepEqual(result.nodes.map(({ id, label }) => ({ id, label })), [
    { id: "node_a", label: "María Rossi" },
    { id: "place_b", label: "Place B" }
  ]);
  assert.deepEqual(result.links, [
    { source: "node_a", target: "place_b", type: "person-place" }
  ]);
  assert.equal(result.capabilities.edgeTypes.available, false);
  assert.equal(result.capabilities.undirectedAdjacency.available, true);
});

test("il profilo legacy conserva gli ID numerici falsy e usa l'etichetta solo per un ID vuoto", () => {
  const result = normalizeGraphData({
    nodes: [
      { id: 0, label: "Origin" },
      { id: 1, label: "Target" },
      { id: false, label: "False fallback" },
      { id: "", label: "Fallback" }
    ],
    edges: [{ source: 0, target: 1 }]
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.nodes.map((node) => node.id), ["0", "1", "false_fallback", "fallback"]);
  assert.deepEqual(result.links.map((link) => [link.source, link.target]), [["0", "1"]]);
});

test("il risolutore dei percorsi copre mapping a oggetti e array", () => {
  const node = {
    data: {
      affiliations: [
        { group: "Università A" },
        { group: "Università B" }
      ]
    }
  };

  assert.deepEqual(
    graphPathValues(node, "$.data.affiliations[*].group"),
    ["Università A", "Università B"]
  );
  assert.deepEqual(
    graphPathValues(node, "data.affiliations[].group"),
    ["Università A", "Università B"]
  );
  assert.deepEqual(graphPathValues({ values: ["a", "b"] }, "$.values[*]"), ["a", "b"]);
  assert.equal(getGraphEndpointId({ id: "n1" }), "n1");
  assert.equal(getGraphEndpointId("n1"), "n1");
});

test("schema v2 mappa tipi e conserva la direzione dichiarata", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: {
        idField: "$.nodeId",
        labelField: "$.name",
        typeField: "$.kind",
        roleField: "$.role",
        groupFields: ["$.groups[*]"],
        attributes: { year: "$.year" }
      },
      edge: {
        idField: "$.edgeId",
        sourceField: "$.from",
        targetField: "$.to",
        typeField: "$.predicate",
        direction: "directed",
        identity: "multigraph",
        attributes: { eventYear: "$.year" }
      }
    }
  };
  const result = normalizeGraphData({
    nodes: [
      { nodeId: "A", name: " Ada ", kind: "person", role: "actor", groups: ["g1", "g2"], year: 1900 },
      { nodeId: "B", name: "Bruno", kind: "person", role: "actor", groups: ["g1"], year: 1901 }
    ],
    edges: [
      { edgeId: "e1", from: "A", to: "B", predicate: "mentor", year: 1900 },
      { edgeId: "e2", from: "A", to: "B", predicate: "mentor", year: 1901 },
      { edgeId: "e3", from: "B", to: "A", predicate: "student-of", year: 1902 }
    ]
  }, config);

  assert.equal(result.valid, true);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.direction, "directed");
  assert.equal(result.nodes[0].sourceId, "A");
  assert.deepEqual(result.nodes[0].analysis, {
    type: "person",
    roles: ["actor"],
    groups: ["g1", "g2"],
    attributes: { year: 1900 }
  });
  assert.equal(result.links.length, 3, "record distinti sullo stesso arco diretto e arco inverso restano separati");
  assert.deepEqual(result.links.map((link) => [link.source, link.target]), [
    ["a", "b"],
    ["a", "b"],
    ["b", "a"]
  ]);
  assert.deepEqual(result.links[0].analysis, {
    id: "e1",
    direction: "directed",
    type: "mentor",
    attributes: { eventYear: 1900 }
  });
  assert.equal(result.capabilities.nodeTypes.available, true);
  assert.equal(result.capabilities.nodeAttributes.available, true);
  assert.equal(result.capabilities.edgeTypes.available, true);
  assert.equal(result.capabilities.edgeAttributes.available, true);
  assert.equal(result.capabilities.directedEdges.available, true);
  assert.equal(result.capabilities.undirectedAdjacency.available, false);
  assert.deepEqual(getGraphTaskRequirements("kCore"), []);
  assert.deepEqual(getGraphTaskRequirements("kCore", "directed"), ["directedEdges"]);
  assert.deepEqual(getGraphTaskRequirements("kCore", "undirected"), ["undirectedAdjacency"]);
  assert.equal(checkGraphTaskRequirements(result.capabilities, ["directedEdges"]).available, true,
    "il k-core diretto usa la capacità degli archi orientati senza chiedere una proiezione non orientata");
  const asp = buildAspFactsFromGraph(result);
  assert.match(asp.facts, /node_type\(1,"person"\)\./);
  assert.match(asp.facts, /node_role\(1,"actor"\)\./);
  assert.match(asp.facts, /node_group\(1,"g1"\)\./);
  assert.match(asp.facts, /edge_record\(1\)\./);
  assert.match(asp.facts, /edge_id\(1,"e1"\)\./);
  assert.match(asp.facts, /edge_type\(1,"mentor"\)\./);
  assert.match(asp.facts, /edge_attribute\(1,"eventYear",1900\)\./);
  assert.equal((asp.facts.match(/^edge\(/gm) ?? []).length, 3, "ogni record diretto è serializzato senza generare la coppia inversa");
  assert.equal((asp.facts.match(/^edge_record\(/gm) ?? []).length, 3);
  assert.deepEqual(getGraphTaskRequirements("typedMotif"), ["nodeTypes", "edgeTypes"]);
  assert.deepEqual(
    checkGraphTaskRequirements(result.capabilities, ["nodeTypes", "edgeTypes"]),
    { available: true, missing: [], reasons: [] }
  );
  assert.deepEqual(
    checkGraphTaskRequirements(result.capabilities, ["edgeIntervals"]),
    {
      available: false,
      missing: ["edgeIntervals"],
      reasons: ["mappare intervalli validi e ordinati in un unico dominio temporale su tutti gli archi con graphMapping.edge.validity"]
    }
  );
});

test("il multigrafo conserva archi paralleli e attribuiti alla fonte", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", typeField: "$.kind" },
      edge: {
        idField: "$.id",
        sourceField: "$.from",
        targetField: "$.to",
        typeField: "$.relation",
        direction: "undirected",
        identity: "multigraph",
        validity: { fromField: "$.start", toField: "$.end" },
        weightField: "$.strength",
        removalCostField: "$.cut_cost",
        confidenceField: "$.certainty",
        provenanceField: "$.sourceRef"
      }
    }
  };
  const first = {
    id: "e1", from: "A", to: "B", relation: "mentor", start: "1900", end: "1910",
    strength: 0.5, cut_cost: "4", certainty: 0.8, sourceRef: "archive-a"
  };
  const second = {
    id: "e2", from: "B", to: "A", relation: "colleague", start: "1912", end: "1920",
    strength: 0.7, cut_cost: 2, certainty: 0.4, sourceRef: "archive-b"
  };
  const duplicateFirst = { ...first, from: "B", to: "A" };
  const result = normalizeGraphData({
    nodes: [{ id: "A", kind: "person" }, { id: "B", kind: "person" }],
    edges: [first, second, duplicateFirst]
  }, config);

  assert.equal(result.valid, true);
  assert.equal(result.links.length, 2, "record duplicato con lo stesso ID viene eliminato");
  assert.deepEqual(result.links.map((link) => link.analysis.id), ["e1", "e2"]);
  assert.equal(result.links[0].analysis.type, "mentor");
  assert.deepEqual(result.links[0].analysis.validity, { from: "1900", to: "1910" });
  assert.equal(result.links[1].analysis.provenance, "archive-b");
  assert.equal(result.capabilities.edgeTypes.available, true);
  assert.equal(result.capabilities.edgeIntervals.available, true);
  assert.equal(result.capabilities.edgeWeights.available, true);
  assert.equal(result.capabilities.modularityWeights.available, false, "la modularità pesata resta opt-in e qui non è stata richiesta");
  assert.equal(result.capabilities.edgeRemovalCosts.available, true);
  assert.equal(result.capabilities.edgeConfidence.available, true);
  assert.equal(result.capabilities.edgeProvenance.available, true);
  assert.equal(result.capabilities.edgeIdentity.available, true);
  const asp = buildAspFactsFromGraph(result);
  assert.match(asp.facts, /edge_valid_from\(1,1900\)\./);
  assert.match(asp.facts, /edge_valid_to\(1,1910\)\./);
  assert.match(asp.facts, /edge_removal_cost\(1,4\)\./);
  assert.match(asp.facts, /edge_removal_cost\(2,2\)\./);
  assert.match(asp.facts, /edge_weight\(1,decimal\(1,2\)\)\./);
  assert.match(asp.facts, /edge_confidence\(1,decimal\(4,5\)\)\./);
  assert.match(asp.facts, /edge_provenance\(1,"archive-a"\)\./);
  assert.deepEqual(result.diagnostics, []);
});

test("un arco può dichiarare più riferimenti di provenienza come insieme descrittivo", async () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        sourceField: "$.from",
        targetField: "$.to",
        provenanceField: "$.sources"
      }
    }
  };
  const result = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ from: "a", to: "b", sources: ["archive-z", 4, "archive-a", "archive-z"] }]
  }, config);

  assert.equal(result.valid, true);
  assert.equal(result.capabilities.edgeProvenance.available, true);
  assert.deepEqual(result.links[0].analysis.provenance, ["4", "archive-a", "archive-z"]);
  const asp = buildAspFactsFromGraph(result);
  assert.ok(asp.facts.includes('edge_provenance(1,"4").'));
  assert.ok(asp.facts.includes('edge_provenance(1,"archive-a").'));
  assert.ok(asp.facts.includes('edge_provenance(1,"archive-z").'));
  assert.equal(asp.facts.split("edge_provenance(1,").length - 1, 3);

  const solverResult = await (await createClingoWasmRunner()).run(
    `${asp.facts}\n#show edge_provenance/2.`
  );
  assert.equal(solverResult.Result, "SATISFIABLE", solverResult.Error ?? JSON.stringify(solverResult));
  const shownValues = solverResult.Call?.[0]?.Witnesses?.[0]?.Value ?? [];
  assert.deepEqual([...shownValues].sort(), [
    'edge_provenance(1,"4")',
    'edge_provenance(1,"archive-a")',
    'edge_provenance(1,"archive-z")'
  ]);
});

test("l'ordine dei riferimenti non cambia i metadati di un arco semplice", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        sourceField: "$.from",
        targetField: "$.to",
        provenanceField: "$.sources"
      }
    }
  };
  const result = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { from: "a", to: "b", sources: ["archive-a", "archive-b"] },
      { from: "b", to: "a", sources: ["archive-b", "archive-a"] }
    ]
  }, config);

  assert.equal(result.valid, true);
  assert.equal(result.links.length, 1);
  assert.deepEqual(result.links[0].analysis.provenance, ["archive-a", "archive-b"]);
});

test("nel multigrafo un ID ripetuto con le stesse fonti non dipende dal loro ordine", () => {
  const result = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "ab", from: "a", to: "b", sources: ["archive-b", "archive-a"] },
      { id: "ab", from: "b", to: "a", sources: ["archive-a", "archive-b"] }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.from",
        targetField: "$.to",
        identity: "multigraph",
        provenanceField: "$.sources"
      }
    }
  });

  assert.equal(result.valid, true);
  assert.equal(result.links.length, 1);
  assert.deepEqual(result.links[0].analysis.provenance, ["archive-a", "archive-b"]);
});

test("riferimenti di provenienza non scalari invalidano il record", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        sourceField: "$.from",
        targetField: "$.to",
        provenanceField: "$.sources"
      }
    }
  };
  const result = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ from: "a", to: "b", sources: ["archive-a", { title: "not a source ID" }] }]
  }, config);

  assert.equal(result.valid, false);
  assert.equal(result.capabilities.edgeProvenance.available, false);
  assert.ok(result.diagnostics.some(({ code, severity }) =>
    code === "invalid-edge-provenance" && severity === "error"
  ));
});

test("un riferimento scalare vuoto resta metadato assente senza invalidare il grafo", () => {
  const result = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ source: "a", target: "b", sourceRef: "  " }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: { sourceField: "$.source", targetField: "$.target", provenanceField: "$.sourceRef" }
    }
  });

  assert.equal(result.valid, true);
  assert.equal(result.capabilities.edgeProvenance.available, false);
  assert.doesNotMatch(buildAspFactsFromGraph(result).facts, /edge_provenance/);
});

test("i costi di rimozione incompleti non abilitano il taglio pesato e non alterano il taglio non pesato", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        removalCostField: "$.cut_cost"
      }
    }
  };
  const graph = normalizeGraphData({
    nodes: [{ id: "A" }, { id: "B" }],
    edges: [
      { id: "valid", source: "A", target: "B", cut_cost: 2 },
      { id: "invalid", source: "A", target: "B", cut_cost: 0 }
    ]
  }, config);

  assert.equal(graph.valid, true);
  assert.equal(graph.capabilities.edgeRemovalCosts.configured, true);
  assert.equal(graph.capabilities.edgeRemovalCosts.available, false);
  assert.match(graph.capabilities.edgeRemovalCosts.reason, /intero positivo/);
  assert.deepEqual(
    checkGraphTaskRequirements(graph.capabilities, getGraphTaskRequirements("minimumEdgeSeparator")),
    { available: true, missing: [], reasons: [] }
  );
  assert.equal(
    checkGraphTaskRequirements(graph.capabilities, getGraphTaskRequirements("minimumCostEdgeSeparator")).available,
    false
  );
  assert.match(buildAspFactsFromGraph(graph).facts, /edge_removal_cost\(1,2\)\./);
  assert.doesNotMatch(buildAspFactsFromGraph(graph).facts, /edge_removal_cost\(2,/);
});

test("costi di rimozione invalidi o non sommabili bloccano solo i task pesati", () => {
  const invalidCosts = [undefined, null, 0, -1, 1.5, "1.5", "", "9007199254740992"];
  const nodeCostConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", removalCostField: "$.cut_cost" },
      edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  };
  const edgeCostConfig = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph",
        removalCostField: "$.cut_cost"
      }
    }
  };

  for (const invalidCost of invalidCosts) {
    const nodeGraph = normalizeGraphData({
      nodes: [{ id: "a", cut_cost: 1 }, { id: "b", cut_cost: invalidCost }],
      edges: [{ id: "ab", source: "a", target: "b" }]
    }, nodeCostConfig);
    assert.equal(nodeGraph.valid, true, `il costo nodo ${String(invalidCost)} non invalida il grafo`);
    assert.equal(nodeGraph.capabilities.nodeRemovalCosts.configured, true);
    assert.equal(nodeGraph.capabilities.nodeRemovalCosts.available, false, `il costo nodo ${String(invalidCost)} non è ammesso`);
    assert.equal(checkGraphTaskRequirements(
      nodeGraph.capabilities,
      getGraphTaskRequirements("minimumNodeSeparator")
    ).available, true);
    assert.equal(checkGraphTaskRequirements(
      nodeGraph.capabilities,
      getGraphTaskRequirements("minimumCostNodeSeparator")
    ).available, false);

    const edgeGraph = normalizeGraphData({
      nodes: [{ id: "a" }, { id: "b" }],
      edges: [{ id: "ab", source: "a", target: "b", cut_cost: invalidCost }]
    }, edgeCostConfig);
    assert.equal(edgeGraph.valid, true, `il costo arco ${String(invalidCost)} non invalida il grafo`);
    assert.equal(edgeGraph.capabilities.edgeRemovalCosts.configured, true);
    assert.equal(edgeGraph.capabilities.edgeRemovalCosts.available, false, `il costo arco ${String(invalidCost)} non è ammesso`);
    assert.equal(checkGraphTaskRequirements(
      edgeGraph.capabilities,
      getGraphTaskRequirements("minimumEdgeSeparator")
    ).available, true);
    assert.equal(checkGraphTaskRequirements(
      edgeGraph.capabilities,
      getGraphTaskRequirements("minimumCostEdgeSeparator")
    ).available, false);
  }

  const unsafeNodeTotal = normalizeGraphData({
    nodes: [
      { id: "a", cut_cost: Number.MAX_SAFE_INTEGER - 1 },
      { id: "b", cut_cost: 2 }
    ],
    edges: [{ id: "ab", source: "a", target: "b" }]
  }, nodeCostConfig);
  const unsafeEdgeTotal = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "ab-1", source: "a", target: "b", cut_cost: Number.MAX_SAFE_INTEGER - 1 },
      { id: "ab-2", source: "a", target: "b", cut_cost: 2 }
    ]
  }, edgeCostConfig);

  assert.equal(unsafeNodeTotal.nodes.every((node) => Number.isSafeInteger(node.analysis.removalCost)), true);
  assert.equal(unsafeNodeTotal.capabilities.nodeRemovalCosts.available, false);
  assert.equal(checkGraphTaskRequirements(
    unsafeNodeTotal.capabilities,
    getGraphTaskRequirements("minimumNodeSeparator")
  ).available, true);
  assert.equal(unsafeEdgeTotal.links.every((link) => Number.isSafeInteger(link.analysis.removalCost)), true);
  assert.equal(unsafeEdgeTotal.capabilities.edgeRemovalCosts.available, false);
  assert.equal(checkGraphTaskRequirements(
    unsafeEdgeTotal.capabilities,
    getGraphTaskRequirements("minimumEdgeSeparator")
  ).available, true);
});

test("i costi di rimozione dei nodi sono opzionali e distinti dagli attributi descrittivi", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", removalCostField: "$.cut_cost", attributes: { importance: "$.importance" } },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "start", cut_cost: 100, importance: 0.9 },
      { id: "middle", cut_cost: "3", importance: 0.2 },
      { id: "goal", cut_cost: 100, importance: 0.8 }
    ],
    edges: [{ source: "start", target: "middle" }, { source: "middle", target: "goal" }]
  }, config);
  const asp = buildAspFactsFromGraph(graph);

  assert.equal(graph.valid, true);
  assert.equal(graph.nodes[1].analysis.removalCost, 3);
  assert.deepEqual(graph.nodes[1].analysis.attributes, { importance: 0.2 });
  assert.equal(graph.capabilities.nodeRemovalCosts.available, true);
  assert.match(asp.facts, /node_removal_cost\(2,3\)\./);
  assert.deepEqual(
    checkGraphTaskRequirements(graph.capabilities, getGraphTaskRequirements("minimumCostNodeSeparator")),
    { available: true, missing: [], reasons: [] }
  );

  const incomplete = normalizeGraphData({
    nodes: [{ id: "a", cut_cost: 1 }, { id: "b" }],
    edges: [{ source: "a", target: "b" }]
  }, config);
  assert.equal(incomplete.capabilities.nodeRemovalCosts.configured, true);
  assert.equal(incomplete.capabilities.nodeRemovalCosts.available, false);
  assert.equal(
    checkGraphTaskRequirements(incomplete.capabilities, getGraphTaskRequirements("minimumNodeSeparator")).available,
    true
  );
  assert.equal(
    checkGraphTaskRequirements(incomplete.capabilities, getGraphTaskRequirements("minimumCostNodeSeparator")).available,
    false
  );
});

test("il readiness dei separatori pesati considera solo candidati rimovibili non terminali", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: {
        idField: "$.id",
        groupFields: ["$.groups[*]"],
        removalCostField: "$.cut_cost"
      },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  };
  const graph = normalizeGraphData({
    nodes: [
      { id: "start", groups: ["blu"] },
      { id: "red", groups: ["rosso"], cut_cost: 5 },
      { id: "blue", groups: ["blu"], cut_cost: null },
      { id: "goal", groups: ["rosso"], cut_cost: "non valido" },
      { id: "outside", groups: ["altro"], cut_cost: 0 }
    ],
    edges: []
  }, config);
  const assess = (group, terminals) => checkNodeRemovalCostCapabilityForCandidates(
    graph.capabilities.nodeRemovalCosts,
    graph.nodes,
    group,
    terminals
  );

  assert.equal(graph.capabilities.nodeRemovalCosts.configured, true);
  assert.equal(graph.capabilities.nodeRemovalCosts.available, false);
  assert.equal(assess("rosso", ["start", "goal"]).available, true,
    "costo mancante sui terminali e fuori gruppo non deve bloccare il task");
  assert.equal(assess("blu", ["start", "goal"]).available, false,
    "un costo mancante nel gruppo candidato deve bloccare il task");
  assert.match(assess("blu", ["start", "goal"]).reason, /blue/);
  assert.equal(assess("", ["start", "goal"]).available, false,
    "senza filtro, ogni nodo non terminale appartiene al dominio candidato");
});

test("l'overflow dei costi è valutato solo nel dominio rimovibile candidato", () => {
  const graph = normalizeGraphData({
    nodes: [
      { id: "start", groups: ["terminale"], cut_cost: Number.MAX_SAFE_INTEGER },
      { id: "goal", groups: ["terminale"], cut_cost: Number.MAX_SAFE_INTEGER },
      { id: "a", groups: ["rosso"], cut_cost: Number.MAX_SAFE_INTEGER - 1 },
      { id: "b", groups: ["rosso"], cut_cost: 2 },
      { id: "c", groups: ["blu"], cut_cost: 1 }
    ],
    edges: []
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", groupFields: ["$.groups[*]"], removalCostField: "$.cut_cost" },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  });
  const red = checkNodeRemovalCostCapabilityForCandidates(
    graph.capabilities.nodeRemovalCosts, graph.nodes, "rosso", ["start", "goal"]
  );
  const blue = checkNodeRemovalCostCapabilityForCandidates(
    graph.capabilities.nodeRemovalCosts, graph.nodes, "blu", ["start", "goal"]
  );

  assert.equal(red.available, false);
  assert.match(red.reason, /somma dei costi/);
  assert.equal(blue.available, true,
    "costi grandi ma protetti o fuori gruppo non devono causare overflow del dominio selezionato");
});

test("la serializzazione legacy dei fatti ASP resta identica e sicura per le stringhe", () => {
  const normalized = normalizeGraphData({
    nodes: [{ id: "a", label: "Ada" }, { id: "b", label: "Bruno" }],
    edges: [{ source: "a", target: "b" }]
  });
  const asp = buildAspFactsFromGraph(normalized, (node) => node.id === "a" ? ["R&D"] : []);

  assert.equal(asp.facts, [
    "node(1).",
    "node(2).",
    'group(1,"R&D").',
    "edge(1,2).",
    "edge(2,1).",
    ""
  ].join("\n"));
  assert.equal(asp.reverseIndex[1], "a");
  assert.equal(asp.indexByNodeId.get("b"), 2);
  assert.equal(
    escapeAspString('A "quoted" \\ path\r\t\nnext'),
    '"A \\"quoted\\" \\\\ path~x000D~x0009~x000Anext"'
  );
});

test("le stringhe ASP codificano in modo sicuro e reversibile i controlli e i caratteri tilde", async () => {
  const original = "carriage\r tab\t line\n null\u0000 tilde ~x000D";
  const encoded = escapeAspString(original);
  assert.equal(decodeAspStringPayload(encoded.slice(1, -1)), original);
  assert.notEqual(escapeAspString("\r"), escapeAspString("~x000D"),
    "la codifica distingue un carattere di controllo dalla sequenza testuale simile");
  assert.doesNotMatch(encoded, /[\u0000-\u001f\u007f-\u009f]/);

  const result = await (await createClingoWasmRunner()).run(`encoded_value(${encoded}).\n#show encoded_value/1.`);
  assert.equal(result.Result, "SATISFIABLE", result.Error ?? JSON.stringify(result));
  assert.deepEqual(result.Call?.[0]?.Witnesses?.[0]?.Value, [`encoded_value(${encoded})`]);

  const graph = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [
      { id: "edge-ab\r\n~x000D", source: "a", target: "b", sources: ["archive\r\nA", "secondary\tB"] },
      { id: "edge-bc", source: "b", target: "c", sources: ["bc"] },
      { id: "edge-ca", source: "c", target: "a", sources: ["ca"] }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id", sourceField: "$.source", targetField: "$.target",
        identity: "multigraph", provenanceField: "$.sources"
      }
    }
  });
  assert.equal(graph.valid, true);
  const graphResult = await (await createClingoWasmRunner()).run(
    `${buildAspFactsFromGraph(graph).facts}\n${buildCliqueProgram("maximal", "")}`
  );
  assert.equal(graphResult.Result, "SATISFIABLE", graphResult.Error ?? JSON.stringify(graphResult));
  assert.deepEqual(graphResult.Call?.[0]?.Witnesses?.[0]?.Value, ["in(1)", "in(2)", "in(3)"]);
});

test("mapping incompleti o ambigui non vengono accettati in silenzio", () => {
  const unversioned = normalizeGraphData(
    { nodes: [{ id: "a" }], edges: [] },
    { graphMapping: { edge: { typeField: "$.type" } } }
  );
  assert.equal(unversioned.valid, false);
  assert.equal(unversioned.schemaVersion, 1);
  assert.equal(unversioned.diagnostics[0].code, "schema-version-required");

  const dangling = normalizeGraphData({
    nodes: [{ id: "present", label: "Present" }],
    edges: [{ source: "present", target: "missing" }]
  });
  assert.equal(dangling.valid, false);
  assert.ok(dangling.diagnostics.some((diagnostic) =>
    diagnostic.code === "unknown-edge-endpoint" && diagnostic.severity === "error"
  ));

  const unsupported = normalizeGraphData(
    { nodes: [], edges: [] },
    { schemaVersion: 9 }
  );
  assert.equal(unsupported.valid, false);
  assert.equal(unsupported.diagnostics[0].code, "unsupported-schema-version");

  const conflict = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { source: "a", target: "b", relation: "mentor" },
      { source: "b", target: "a", relation: "colleague" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: { typeField: "$.relation", direction: "undirected", identity: "simple" }
    }
  });

  assert.equal(conflict.valid, false);
  assert.ok(conflict.diagnostics.some((diagnostic) => diagnostic.code === "conflicting-simple-edge-types"));

  const partialEdgeType = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "e1", source: "a", target: "b", relation: "mentor" },
      { id: "e2", source: "a", target: "b" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        typeField: "$.relation",
        identity: "multigraph"
      }
    }
  });

  assert.equal(partialEdgeType.valid, true, "un campo semantico opzionale incompleto non deve invalidare la topologia");
  assert.equal(partialEdgeType.capabilities.edgeTypes.available, false);
  assert.ok(partialEdgeType.diagnostics.some((diagnostic) =>
    diagnostic.code === "incomplete-capability-edgeTypes" && diagnostic.severity === "warning"
  ));
  assert.deepEqual(
    checkGraphTaskRequirements(partialEdgeType.capabilities, ["edgeTypes"]),
    {
      available: false,
      missing: ["edgeTypes"],
      reasons: ["mappare un tipo per ogni arco con graphMapping.edge.typeField"]
    }
  );

  const collapsed = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "e1", source: "a", target: "b", relation: "mentor" },
      { id: "e2", source: "b", target: "a", relation: "mentor" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: { idField: "$.id", typeField: "$.relation", direction: "undirected" }
    }
  });
  assert.equal(collapsed.links.length, 1);
  assert.ok(collapsed.diagnostics.some((diagnostic) =>
    diagnostic.code === "collapsed-distinct-edge-identities" && diagnostic.severity === "warning"
  ));

  const conflictingId = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "e1", source: "a", target: "b", relation: "mentor", sourceRef: "archive-a" },
      { id: "e1", source: "b", target: "a", relation: "mentor", sourceRef: "archive-b" }
    ]
  }, {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        typeField: "$.relation",
        provenanceField: "$.sourceRef",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  });
  assert.equal(conflictingId.valid, false);
  assert.ok(conflictingId.diagnostics.some((diagnostic) => diagnostic.code === "conflicting-edge-id"));
});

test("chiavi sconosciute nelle configurazioni grafo v2 rifiutano i refusi senza vincolare il config applicativo", () => {
  const input = {
    nodes: [
      { id: "a", label: "Ada", type: "person", role: "researcher", groups: ["team"], rank: 1, cutCost: 1 },
      { id: "b", label: "Bruno", type: "person", role: "researcher", groups: ["team"], rank: 2, cutCost: 1 }
    ],
    edges: [{
      id: "e1", source: "a", target: "b", type: "knows", from: 1, to: 2,
      weight: 1, cutCost: 1, confidence: 0.9, provenance: "source", event: "meeting"
    }]
  };
  const misspellings = [
    [{ graphMapping: { edge: { identiy: "multigraph" } } }, "graphMapping.edge.identiy"],
    [{ graphMapping: { edge: { direction: "directed", directional: true } } }, "graphMapping.edge.directional"],
    [{ graphMapping: { edge: { validity: { fromField: "$.from", toField: "$.to", inclusive: false } } } }, "graphMapping.edge.validity.inclusive"],
    [{ graphMapping: { link: { identity: "multigraph" } } }, "graphMapping.link"],
    [{ graphIntegrity: { requiredEdgIntervals: ["knows"] } }, "graphIntegrity.requiredEdgIntervals"],
    [{ graphIntegrity: { edgeTypeDomains: [{ edgeType: "knows", sourceNodeTypes: ["person"], targetNodeType: ["place"] }] } }, "graphIntegrity.edgeTypeDomains[0].targetNodeType"],
    [{ graphIntegrity: { repairSuggestions: { nodeAttributeReplacments: [] } } }, "graphIntegrity.repairSuggestions.nodeAttributeReplacments"],
    [{ graphAnalysis: { motiff: [] } }, "graphAnalysis.motiff"],
    [{ graphAnalysis: { motifs: [{ id: "m", roles: { person: { nodeTypes: ["person"] } }, edges: [{ sourceRole: "person", targetRole: "person", edgeTyp: "knows" }] }] } }, "graphAnalysis.motifs[0].edges[0].edgeTyp"],
    [{ graphAnalysis: { motifs: [{ id: "m", roles: { person: { nodeTypes: ["person"] } }, edges: [{ sourceRole: "person", targetRole: "person", edgeType: "knows" }], absentEdges: [{ sourceRole: "person", targetRole: "person", edgeTyp: "knows" }], closedWorld: true }] } }, "graphAnalysis.motifs[0].absentEdges[0].edgeTyp"],
    [{ graphAnalysis: { motifs: [{ id: "m", roles: { person: { nodeTypes: ["person"], nodeTypess: ["place"] } }, edges: [{ sourceRole: "person", targetRole: "person", edgeType: "knows" }] }] } }, "graphAnalysis.motifs[0].roles.person.nodeTypess"],
    [{ graphAnalysis: { communities: { minCount: 2, cannotLin: [["a", "b"]] } } }, "graphAnalysis.communities.cannotLin"],
    [{ graphAnalysis: { communities: { attributeBounds: [{ attribute: "rank", value: 1, minPerCommunity: 1, maxPerComunity: 2 }] } } }, "graphAnalysis.communities.attributeBounds[0].maxPerComunity"],
    [{ graphAnalysis: { counterfactuals: { edgeAdditions: [{ id: "candidate", sourceNodeId: "a", targetNodeId: "b", edgeType: "knows", cost: 1, validty: { from: 1, to: 2 } }] } } }, "graphAnalysis.counterfactuals.edgeAdditions[0].validty"],
    [{ graphAnalysis: { provenanceScenarios: { scenarios: [{ id: "archive-a", sources: ["archive-a"], sourcces: ["archive-b"] }], unattributedEdges: "exclude" } } }, "graphAnalysis.provenanceScenarios.scenarios[0].sourcces"]
  ];

  for (const [config, path] of misspellings) {
    const result = normalizeGraphData(input, { schemaVersion: 2, ...config });
    assert.equal(result.valid, false, path);
    assert.ok(result.diagnostics.some((diagnostic) =>
      diagnostic.code.startsWith("unknown-graph-") && diagnostic.severity === "error" && diagnostic.message.includes(path)
    ), JSON.stringify(result.diagnostics));
  }

  const valid = normalizeGraphData(input, {
    schemaVersion: 2,
    forces: { charge: -42 },
    graphMapping: {
      node: {
        idField: "$.id",
        labelField: "$.label",
        typeField: "$.type",
        roleField: "$.role",
        groupFields: ["$.groups[]"],
        attributes: { rank: "$.rank" },
        removalCostField: "$.cutCost"
      },
      edge: {
        idField: "$.id",
        typeField: "$.type",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "directed",
        identity: "multigraph",
        validity: { fromField: "$.from", toField: "$.to" },
        weightField: "$.weight",
        removalCostField: "$.cutCost",
        confidenceField: "$.confidence",
        provenanceField: "$.provenance",
        attributes: { event: "$.event" }
      }
    },
    graphIntegrity: {
      requireNodeTypes: true,
      requireEdgeTypes: true,
      allowedNodeTypes: ["person", "place", "researcher"],
      allowedEdgeTypes: ["knows", "advises", "affiliated_with"],
      requiredEdgeIntervals: ["knows"],
      edgeTypeDomains: [{ edgeType: "knows", sourceNodeTypes: ["person"], targetNodeTypes: ["person"] }],
      requiredNodeAttributes: [{ nodeType: "person", attributes: ["rank"] }],
      requiredEdgeAttributes: [{ edgeType: "knows", attributes: ["event"] }],
      nodeAttributeDomains: [{ nodeType: "person", attribute: "rank", allowedValues: [1, 2] }],
      edgeAttributeDomains: [{ edgeType: "knows", attribute: "event", allowedValues: ["meeting", "conference"] }],
      uniqueNodeAttributes: [{ nodeType: "person", attribute: "rank" }],
      uniqueEdgeAttributes: [{ edgeType: "knows", attribute: "event" }],
      cardinalities: [{ nodeType: "person", edgeType: "knows", incidence: "source", min: 0, max: 2 }],
      repairSuggestions: {
        removableEdges: [{ edgeId: "e1", cost: 1 }],
        nodeAttributeValues: [{ nodeId: "a", attribute: "rank", value: 1, cost: 1 }],
        edgeAttributeValues: [{ edgeId: "e1", attribute: "event", value: "meeting", cost: 1 }],
        nodeAttributeReplacements: [{ nodeId: "a", attribute: "rank", expectedValue: 1, value: 2, cost: 1 }],
        edgeAttributeReplacements: [{ edgeId: "e1", attribute: "event", expectedValue: "meeting", value: "conference", cost: 1 }],
        nodeTypeReplacements: [{ nodeId: "a", expectedType: "person", newType: "researcher", cost: 1 }],
        edgeTypeReplacements: [{ edgeId: "e1", expectedType: "knows", newType: "advises", cost: 1 }]
      }
    },
    graphAnalysis: {
      provenanceScenarios: {
        scenarios: [{ id: "archive-a", label: "Archivio A", sources: ["source"] }],
        unattributedEdges: "exclude"
      },
      motifs: [
        {
          id: "shared-place",
          label: "Shared place",
          roles: {
            personA: { nodeTypes: ["person"] },
            personB: { nodeTypes: ["person"] },
            place: { nodeTypes: ["place"] }
          },
          edges: [
            { sourceRole: "personA", targetRole: "place", edgeType: "affiliated_with" },
            { sourceRole: "personB", targetRole: "place", edgeType: "affiliated_with" }
          ],
          absentEdges: [{ sourceRole: "personA", targetRole: "personB", edgeType: "knows" }],
          closedWorld: true,
          symmetricRoles: [["personA", "personB"]]
        },
        {
          id: "ordered-relation",
          roles: {
            source: { nodeTypes: ["person"] },
            target: { nodeTypes: ["person"] }
          },
          edges: [{ sourceRole: "source", targetRole: "target", edgeType: "knows" }],
          temporal: { semantics: "orderedByStart", strict: true }
        }
      ],
      communities: {
        minCount: 1,
        maxCount: 2,
        mustLink: [["a", "b"]],
        cannotLink: [],
        attributeBounds: [{ attribute: "rank", value: 1, minPerCommunity: 1, maxPerCommunity: 2 }]
      },
      counterfactuals: {
        edgeAdditions: [{ id: "candidate", sourceNodeId: "a", targetNodeId: "b", edgeType: "knows", cost: 1, validity: { from: 1, to: 2 } }]
      }
    }
  });
  assert.equal(valid.valid, true, JSON.stringify(valid.diagnostics));
  assert.deepEqual(valid.diagnostics, []);
});

test("gli scenari di provenienza richiedono schema, mapping e riferimenti validi", () => {
  const graph = {
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "e1", source: "a", target: "b", sourceRef: ["archive-a", "archive-b"] },
      { id: "e2", source: "a", target: "b", sourceRef: "archive-b" }
    ]
  };
  const validConfig = {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        identity: "multigraph",
        provenanceField: "$.sourceRef"
      }
    },
    graphAnalysis: {
      provenanceScenarios: {
        scenarios: [{ id: "archive-a", sources: ["archive-a"] }],
        unattributedEdges: "exclude",
        referenceMatching: "any"
      }
    }
  };
  const valid = normalizeGraphData(graph, validConfig);
  assert.equal(valid.valid, true, JSON.stringify(valid.diagnostics));
  assert.deepEqual(valid.links[0].analysis.provenance, ["archive-a", "archive-b"]);
  const projectedLinks = filterLinksByProvenanceScenario(valid.links, {
    sources: validConfig.graphAnalysis.provenanceScenarios.scenarios[0].sources,
    unattributedEdges: validConfig.graphAnalysis.provenanceScenarios.unattributedEdges,
    referenceMatching: validConfig.graphAnalysis.provenanceScenarios.referenceMatching
  });
  assert.deepEqual(projectedLinks.map((link) => link.analysis.id), ["e1"]);
  const projectedAsp = buildAspFactsFromGraph({ ...valid, links: projectedLinks }, undefined, {
    includeEdgeProvenance: false
  });
  assert.match(projectedAsp.facts, /edge_id\(1,"e1"\)\./);
  assert.doesNotMatch(projectedAsp.facts, /"e2"/);
  assert.equal((projectedAsp.facts.match(/^edge_record\(/gm) ?? []).length, 1);

  const allMatchingConfig = {
    ...validConfig,
    graphAnalysis: {
      provenanceScenarios: {
        ...validConfig.graphAnalysis.provenanceScenarios,
        referenceMatching: "all"
      }
    }
  };
  const allMatchingGraph = normalizeGraphData(graph, allMatchingConfig);
  assert.equal(allMatchingGraph.valid, true, JSON.stringify(allMatchingGraph.diagnostics));
  const allMatchingLinks = filterLinksByProvenanceScenario(allMatchingGraph.links, {
    sources: allMatchingConfig.graphAnalysis.provenanceScenarios.scenarios[0].sources,
    unattributedEdges: allMatchingConfig.graphAnalysis.provenanceScenarios.unattributedEdges,
    referenceMatching: allMatchingConfig.graphAnalysis.provenanceScenarios.referenceMatching
  });
  assert.deepEqual(allMatchingLinks.map((link) => link.analysis.id), []);
  const allMatchingAsp = buildAspFactsFromGraph({ ...allMatchingGraph, links: allMatchingLinks }, undefined, {
    includeEdgeProvenance: false
  });
  assert.equal((allMatchingAsp.facts.match(/^edge_record\(/gm) ?? []).length, 0);

  const invalidConfigs = [
    [{ ...validConfig, schemaVersion: 1 }, "schemaVersion: 2"],
    [{
      ...validConfig,
      graphMapping: { edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target" } }
    }, "richiede graphMapping.edge.provenanceField"],
    [{
      ...validConfig,
      graphAnalysis: { provenanceScenarios: { scenarios: [{ id: "a", sources: ["archive-a"] }], unattributedEdges: "maybe" } }
    }, "unattributedEdges"],
    [{
      ...validConfig,
      graphAnalysis: { provenanceScenarios: {
        scenarios: [{ id: "a", sources: ["archive-a"] }],
        unattributedEdges: "exclude",
        referenceMatching: "sometimes"
      } }
    }, "referenceMatching deve essere 'any' oppure 'all'"],
    [{
      ...validConfig,
      graphAnalysis: { provenanceScenarios: { scenarios: [{ id: "a", sources: [] }], unattributedEdges: "exclude" } }
    }, "sources deve contenere"],
    [{
      ...validConfig,
      graphAnalysis: { provenanceScenarios: { scenarios: [
        { id: "a", sources: ["archive-a"] }, { id: "a", sources: ["archive-b"] }
      ], unattributedEdges: "exclude" } }
    }, "id deve essere una stringa non vuota e univoca"],
    [{
      ...validConfig,
      graphAnalysis: { provenanceScenarios: { scenarios: [{ id: "a", sources: ["archive-a", "archive-a"] }], unattributedEdges: "exclude" } }
    }, "sources deve contenere"]
  ];

  for (const [config, expectedMessage] of invalidConfigs) {
    const result = normalizeGraphData(graph, config);
    assert.equal(result.valid, false, JSON.stringify(result.diagnostics));
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.message.includes(expectedMessage)),
      JSON.stringify(result.diagnostics));
  }
});

test("la configurazione dei motivi rifiuta assenze senza mondo chiuso e combinazioni temporali", () => {
  const graph = {
    nodes: [
      { id: "a", label: "A", kind: "person" },
      { id: "b", label: "B", kind: "person" }
    ],
    edges: [{ id: "ab", source: "a", target: "b", kind: "knows" }]
  };
  const configFor = (motif) => ({
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id", labelField: "$.label", typeField: "$.kind" },
      edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target", typeField: "$.kind" }
    },
    graphAnalysis: { motifs: [motif] }
  });
  const base = {
    id: "motif",
    roles: { source: { nodeTypes: ["person"] }, target: { nodeTypes: ["person"] } },
    edges: [{ sourceRole: "source", targetRole: "target", edgeType: "knows" }]
  };
  const absent = [{ sourceRole: "source", targetRole: "target", edgeType: "blocked" }];

  for (const [motif, expectedMessage] of [
    [{ ...base, absentEdges: absent }, "absentEdges/inducedEdgeTypes richiede closedWorld: true"],
    [{ ...base, absentEdges: absent, closedWorld: "true" }, "closedWorld deve essere un booleano"],
    [{ ...base, closedWorld: true }, "closedWorld: true richiede motif.absentEdges oppure motif.inducedEdgeTypes"],
    [{ ...base, inducedEdgeTypes: ["blocked"] }, "absentEdges/inducedEdgeTypes richiede closedWorld: true"],
    [{ ...base, inducedEdgeTypes: [], closedWorld: true }, "inducedEdgeTypes deve contenere almeno un tipo d'arco"],
    [{ ...base, inducedEdgeTypes: [""], closedWorld: true }, "inducedEdgeTypes[0] deve essere una stringa non vuota"],
    [{ ...base, inducedEdgeTypes: ["knows", " knows "], closedWorld: true }, "inducedEdgeTypes non deve contenere tipi duplicati"],
    [{ ...base, inducedEdgeTypes: ["blocked"], closedWorld: true, temporal: { semantics: "coValid" } }, "non è attualmente ammesso con motif.temporal"]
  ]) {
    const result = normalizeGraphData(graph, configFor(motif));
    assert.equal(result.valid, false, expectedMessage);
    assert.ok(result.diagnostics.some((diagnostic) =>
      diagnostic.code === "invalid-graph-config-value" && diagnostic.severity === "error" && diagnostic.message.includes(expectedMessage)
    ));
  }
});

test("l'identità simple rifiuta metadati in conflitto senza alterare il profilo legacy", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      edge: {
        idField: "$.id",
        typeField: "$.relation",
        provenanceField: "$.sourceRef",
        direction: "undirected",
        identity: "simple"
      }
    }
  };
  const distinctRecords = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "e1", source: "a", target: "b", relation: "mentor", sourceRef: "archive-a" },
      { id: "e2", source: "b", target: "a", relation: "mentor", sourceRef: "archive-b" }
    ]
  }, config);

  assert.equal(distinctRecords.valid, false);
  assert.equal(distinctRecords.links.length, 1);
  assert.ok(distinctRecords.diagnostics.some((diagnostic) =>
    diagnostic.code === "conflicting-simple-edge-metadata" && diagnostic.severity === "error"
  ));

  const reusedId = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [
      { id: "e1", source: "a", target: "b", relation: "mentor", sourceRef: "archive-a" },
      { id: "e1", source: "a", target: "c", relation: "mentor", sourceRef: "archive-a" }
    ]
  }, config);

  assert.equal(reusedId.valid, false);
  assert.ok(reusedId.diagnostics.some((diagnostic) =>
    diagnostic.code === "conflicting-edge-id" && diagnostic.severity === "error"
  ));

  const exactDuplicate = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [
      { id: "e1", source: "a", target: "b", relation: "mentor", sourceRef: "archive-a" },
      { id: "e1", source: "b", target: "a", relation: "mentor", sourceRef: "archive-a" }
    ]
  }, config);

  assert.equal(exactDuplicate.valid, true);
  assert.equal(exactDuplicate.links.length, 1);
  assert.equal(exactDuplicate.diagnostics.some((diagnostic) =>
    diagnostic.code === "conflicting-edge-id" || diagnostic.code === "conflicting-simple-edge-metadata"
  ), false);
});

test("ID sorgente distinti che collidono dopo la normalizzazione invalidano il grafo", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: "Caf\u00e9" }, { id: "Cafe" }],
    edges: []
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: { sourceField: "$.source", targetField: "$.target", direction: "undirected" }
    }
  });

  assert.deepEqual(graph.nodes.map((node) => node.id), ["cafe", "cafe"]);
  assert.equal(graph.valid, false);
  assert.ok(graph.diagnostics.some((diagnostic) =>
    diagnostic.code === "duplicate-node-id" && diagnostic.severity === "error" && diagnostic.message.includes("cafe")
  ));
});

test("gli ID schema v2 accettano identificatori numerici e endpoint-oggetto con ID scalare", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: 1 }, { id: 2 }],
    edges: [{ id: 3, source: { id: 1 }, target: { id: 2 } }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  });

  assert.equal(graph.valid, true);
  assert.deepEqual(graph.nodes.map((node) => node.id), ["1", "2"]);
  assert.deepEqual(graph.links.map((link) => [link.source, link.target, link.sourceId]), [["1", "2", "3"]]);
  assert.equal(graph.capabilities.edgeIdentity.available, true);
});

test("gli ID booleani schema v2 restano scalari distinti per nodi, archi ed estremi", () => {
  const graph = normalizeGraphData({
    nodes: [{ id: false }, { id: true }],
    edges: [{ id: false, source: false, target: true }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: {
        idField: "$.id",
        sourceField: "$.source",
        targetField: "$.target",
        direction: "undirected",
        identity: "multigraph"
      }
    }
  });

  assert.equal(graph.valid, true);
  assert.deepEqual(graph.nodes.map((node) => [node.id, node.sourceId]), [["false", "false"], ["true", "true"]]);
  assert.deepEqual(graph.links.map((link) => [link.source, link.target, link.sourceId]), [["false", "true", "false"]]);
});

test("i mapping ID schema v2 rifiutano oggetti e percorsi multi-valore", () => {
  const nodeObjectId = normalizeGraphData({
    nodes: [{ id: { source: "a" } }], edges: []
  }, {
    schemaVersion: 2,
    graphMapping: { node: { idField: "$.id" }, edge: { sourceField: "$.source", targetField: "$.target" } }
  });
  assert.equal(nodeObjectId.valid, false);
  assert.ok(nodeObjectId.diagnostics.some((diagnostic) => diagnostic.code === "invalid-node-id-value"));

  const nodeMultiId = normalizeGraphData({
    nodes: [{ ids: ["a", "b"] }], edges: []
  }, {
    schemaVersion: 2,
    graphMapping: { node: { idField: "$.ids[*]" }, edge: { sourceField: "$.source", targetField: "$.target" } }
  });
  assert.equal(nodeMultiId.valid, false);
  assert.ok(nodeMultiId.diagnostics.some((diagnostic) => diagnostic.code === "ambiguous-node-id"));

  const edgeObjectId = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ id: { source: "e" }, source: "a", target: "b" }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: { idField: "$.id", sourceField: "$.source", targetField: "$.target", identity: "multigraph" }
    }
  });
  assert.equal(edgeObjectId.valid, false);
  assert.ok(edgeObjectId.diagnostics.some((diagnostic) => diagnostic.code === "invalid-edge-id-value"));
  assert.equal(edgeObjectId.diagnostics.some((diagnostic) => diagnostic.code === "generated-edge-id"), false,
    "un ID esplicito malformato non deve essere descritto come ID sorgente semplicemente assente");

  const edgeMultiId = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }],
    edges: [{ ids: ["e1", "e2"], source: "a", target: "b" }]
  }, {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: { idField: "$.ids[*]", sourceField: "$.source", targetField: "$.target", identity: "multigraph" }
    }
  });
  assert.equal(edgeMultiId.valid, false);
  assert.ok(edgeMultiId.diagnostics.some((diagnostic) => diagnostic.code === "ambiguous-edge-id"));
});

test("i mapping degli estremi rifiutano endpoint ambigui o con ID complesso", () => {
  const config = {
    schemaVersion: 2,
    graphMapping: {
      node: { idField: "$.id" },
      edge: { sourceField: "$.from[*]", targetField: "$.to", direction: "undirected" }
    }
  };
  const ambiguous = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "b" }, { id: "c" }],
    edges: [{ from: ["a", "b"], to: "c" }]
  }, config);
  assert.equal(ambiguous.valid, false);
  assert.ok(ambiguous.diagnostics.some((diagnostic) => diagnostic.code === "ambiguous-edge-endpoint"));
  assert.equal(ambiguous.diagnostics.some((diagnostic) => diagnostic.code === "unknown-edge-endpoint"), false);

  const invalid = normalizeGraphData({
    nodes: [{ id: "a" }, { id: "c" }],
    edges: [{ from: [{ id: { nested: "a" } }], to: "c" }]
  }, { ...config, graphMapping: { ...config.graphMapping, edge: { ...config.graphMapping.edge, sourceField: "$.from" } } });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.diagnostics.some((diagnostic) => diagnostic.code === "invalid-edge-endpoint-id"));
  assert.equal(invalid.diagnostics.some((diagnostic) => diagnostic.code === "unknown-edge-endpoint"), false);
});

test("gli ID locali degli archi non collidono con ID mappati espliciti", () => {
  for (const identity of ["simple", "multigraph"]) {
    const graph = normalizeGraphData({
      nodes: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
      edges: [
        { source: "a", target: "b" },
        { id: "edge_1", source: "b", target: "c" },
        { id: "edge_1_generated_1", source: "c", target: "d" }
      ]
    }, {
      schemaVersion: 2,
      graphMapping: {
        node: { idField: "$.id" },
        edge: {
          idField: "$.id",
          sourceField: "$.source",
          targetField: "$.target",
          direction: "undirected",
          identity
        }
      }
    });
    const ids = graph.links.map((link) => link.sourceId);
    const asp = buildAspFactsFromGraph(graph);

    assert.equal(graph.valid, true, `${identity}: collisione risolta senza invalidare il grafo`);
    assert.equal(graph.links.length, 3, `${identity}: tutti i record restano distinti`);
    assert.deepEqual(ids, ["edge_1_generated_2", "edge_1", "edge_1_generated_1"]);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(graph.links[0].sourceIdGenerated, true);
    assert.equal(graph.links[1].sourceIdGenerated, false);
    assert.ok(graph.diagnostics.some((diagnostic) =>
      diagnostic.code === "generated-edge-id-collision" && diagnostic.severity === "warning"
    ));
    assert.match(graph.diagnostics.find((diagnostic) =>
      diagnostic.code === "generated-edge-id-collision"
    ).message, /edge_1_generated_2/);
    assert.deepEqual(Object.values(asp.reverseEdgeIndex), ids);
  }
});
